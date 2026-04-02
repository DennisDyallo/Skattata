#!/usr/bin/env bun
import { Command } from 'commander';
import { readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import {
  type SieDocument,
  SieTagParser,
  SieXmlParser,
  writeSie4,
  compareSieDocuments,
} from '@skattata/sie-core';
import { BalanceSheetCalculator } from './statements/BalanceSheetCalculator.js';
import { IncomeStatementCalculator } from './statements/IncomeStatementCalculator.js';
import { MomsCalculator } from './statements/MomsCalculator.js';
import { SruReportCalculator, type SruReportResult } from './statements/SruReportCalculator.js';
import { writeSruFile, type SruFileOptions } from './statements/SruFileWriter.js';
import { formatRows, formatKeyValue, type OutputFormat } from './formatters/index.js';

/**
 * Parse a SIE file, auto-detecting SIE 4 vs SIE 5 format.
 */
async function parseFile(filePath: string): Promise<SieDocument> {
  const absolutePath = resolve(filePath);
  const buf = Buffer.from(await Bun.file(absolutePath).arrayBuffer());

  // Check first bytes for XML declaration
  const header = buf.subarray(0, 10).toString('utf-8');
  if (header.includes('<?xml') || header.replace(/^\uFEFF/, '').includes('<?xml')) {
    const text = buf.toString('utf-8');
    return new SieXmlParser().parse(text);
  }

  return new SieTagParser().parse(buf);
}

const program = new Command();

program
  .name('skattata')
  .description(
    'Parse, validate, and report on Swedish SIE accounting files.\n' +
    'Supports SIE 1–4 (tag-based, IBM Codepage 437) and SIE 5 (XML).\n' +
    'Data follows the Swedish BAS chart of accounts and Skatteverket standards.'
  )
  .version('0.1.0')
  .addHelpText('after', `
Commands at a glance:
  parse            Show what's in a SIE file (company, accounts, vouchers)
  validate         Confirm the parser and writer are lossless for a file
  balance-sheet    Assets / equity / liabilities from closing balances
  income-statement Revenue and costs from period result values
  moms             VAT return fields (SKV 4700) from VAT accounts
  sru-report       Tax declaration lines (INK2R/NE) from #SRU account codes
  test-all         Batch parse every SIE file in a directory

File formats accepted:  .se (SIE 1–4)  .si (SIE 4i import)  .sie (SIE 5 XML)

Example:
  $ skattata parse ./sie_test_files/sie4-demo-company.se
  $ skattata sru-report annual.se --output ink2r.sru
`);

// ── parse ──
program
  .command('parse <file>')
  .description('Display a SIE file summary: company, org number, accounts, vouchers, errors')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--accounts', 'List all accounts with type (T/S/I/K) and closing balance')
  .option('--vouchers', 'List all transaction vouchers with date, text, and row count')
  .addHelpText('after', `
Auto-detects SIE 1–5 format. SIE 4 files are decoded from IBM Codepage 437.
Account types: T=tillgång (asset) S=skuld (liability) I=intäkt (income) K=kostnad (cost)

Examples:
  $ skattata parse annual.se
  $ skattata parse annual.se --accounts
  $ skattata parse annual.se --vouchers --format json
  $ skattata parse annual.se --accounts --format csv > accounts.csv
`)
  .action(async (file: string, options: { format: OutputFormat; accounts?: boolean; vouchers?: boolean }) => {
    try {
      const doc = await parseFile(file);

      const summary: [string, string][] = [
        ['Company', doc.companyName || '(none)'],
        ['OrgNo', doc.organizationNumber || '(none)'],
        ['Format', doc.format],
        ['Booking years', String(doc.bookingYears.length)],
        ['Accounts', String(doc.accounts.size)],
        ['Vouchers', String(doc.vouchers.length)],
        ['Errors', String(doc.errors.length)],
      ];

      console.log(formatKeyValue(summary, options.format));

      if (options.accounts) {
        const headers = ['ID', 'Name', 'Type', 'Closing Balance'];
        const rows: string[][] = [];
        for (const [id, acc] of doc.accounts) {
          rows.push([id, acc.name, acc.type || '', acc.closingBalance.toFixed(2)]);
        }
        console.log('\nAccounts:');
        console.log(formatRows(headers, rows, options.format));
      }

      if (options.vouchers) {
        const headers = ['Series', 'Number', 'Date', 'Text', 'Rows'];
        const rows: string[][] = [];
        for (const v of doc.vouchers) {
          rows.push([
            v.series,
            v.number,
            v.date.toISOString().slice(0, 10),
            v.text,
            String(v.rows.length),
          ]);
        }
        console.log('\nVouchers:');
        console.log(formatRows(headers, rows, options.format));
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── validate ──
program
  .command('validate <file>')
  .description('Round-trip test: parse → write SIE 4 → re-parse → compare. Exits 0 on PASS.')
  .option('--verbose', 'Print each field that differs between the two parsed documents')
  .addHelpText('after', `
Confirms the parser and writer are lossless for a given file.
SIE 5 XML files are skipped (writer only outputs SIE 4 format).
Exit code: 0 = PASS, 1 = FAIL or error.

Examples:
  $ skattata validate annual.se
  $ skattata validate annual.se --verbose
  $ skattata validate annual.se && echo "Safe to round-trip"
`)
  .action(async (file: string, options: { verbose?: boolean }) => {
    try {
      const doc = await parseFile(file);

      // Skip validation for SIE 5 XML files (writer only supports SIE 4)
      if (doc.format === 'SIE5') {
        console.log('SKIP: SIE 5 XML files cannot be round-trip validated with SIE 4 writer');
        process.exit(0);
      }

      const buf = writeSie4(doc);
      const reparsed = new SieTagParser().parse(buf);
      const diffs = compareSieDocuments(doc, reparsed);

      if (diffs.length === 0) {
        console.log('PASS');
        process.exit(0);
      } else {
        console.log(`FAIL: ${diffs.length} difference(s)`);
        if (options.verbose) {
          for (const d of diffs) {
            console.log(`  - ${d}`);
          }
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── balance-sheet ──
program
  .command('balance-sheet <file>')
  .description('Balance sheet (balansräkning) using closing balances from BAS accounts 1000–2999')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--year <n>', 'Booking year: 0=current (default), -1=prior year, -2=two years back')
  .addHelpText('after', `
Groups accounts by BAS chart of accounts categories using closing balances (#UB):
  1000–1999  Assets (Tillgångar)
  2000–2099  Equity (Eget kapital)
  2100–2999  Liabilities (Skulder)

Examples:
  $ skattata balance-sheet annual.se
  $ skattata balance-sheet annual.se --year -1
  $ skattata balance-sheet annual.se --format json
  $ skattata balance-sheet annual.se --format csv > balance.csv
`)
  .action(async (file: string, options: { format: OutputFormat; year?: string }) => {
    try {
      const doc = await parseFile(file);
      const calc = new BalanceSheetCalculator();
      const result = calc.calculate(doc);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      for (const section of result.sections) {
        console.log(`\n${section.title}`);
        const headers = ['Account', 'Name', 'Balance'];
        const rows = section.accounts.map(a => [a.id, a.name, a.balance.toFixed(2)]);
        rows.push(['', 'TOTAL', section.total.toFixed(2)]);
        console.log(formatRows(headers, rows, options.format));
      }

      console.log(`\nTotal Assets: ${result.totalAssets.toFixed(2)}`);
      console.log(`Total Equity & Liabilities: ${result.totalEquityAndLiabilities.toFixed(2)}`);

      // Show Årets resultat and balance check
      if (result.netIncome !== 0) {
        console.log(`\nÅrets resultat (from P&L): ${result.netIncome.toFixed(2)}`);
      }
      const isBalanced = Math.abs(result.balanceDiff) < 0.01;
      if (isBalanced) {
        console.log('BALANCE CHECK: ✓ BALANCED');
      } else {
        console.log(`BALANCE CHECK: ⚠ Difference: ${result.balanceDiff.toFixed(2)} SEK (may be unclosed P&L result)`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── income-statement ──
program
  .command('income-statement <file>')
  .description('Income statement / P&L (resultaträkning) using period results from BAS accounts 3000–8999')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--year <n>', 'Booking year: 0=current (default), -1=prior year, -2=two years back')
  .addHelpText('after', `
Groups accounts by BAS chart of accounts categories using result values (#RES):
  3000–3999  Revenue (Intäkter)
  4000–4999  Cost of goods sold (Kostnad sålda varor)
  5000–6999  Operating expenses (Rörelsekostnader)
  7000–7999  Depreciation and other (Avskrivningar m.m.)
  8000–8999  Financial items (Finansiella poster)

Examples:
  $ skattata income-statement annual.se
  $ skattata income-statement annual.se --year -1
  $ skattata income-statement annual.se --format csv > pl.csv
`)
  .action(async (file: string, options: { format: OutputFormat; year?: string }) => {
    try {
      const doc = await parseFile(file);
      const calc = new IncomeStatementCalculator();
      const result = calc.calculate(doc);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      for (const section of result.sections) {
        console.log(`\n${section.title}`);
        const headers = ['Account', 'Name', 'Balance'];
        const rows = section.accounts.map(a => [a.id, a.name, a.balance.toFixed(2)]);
        rows.push(['', 'TOTAL', section.total.toFixed(2)]);
        console.log(formatRows(headers, rows, options.format));
      }

      console.log(`\nGross Profit: ${result.grossProfit.toFixed(2)}`);
      console.log(`Net Income: ${result.netIncome.toFixed(2)}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── moms ──
program
  .command('moms <file>')
  .description('VAT return (momsdeklaration) with SKV 4700 field codes from BAS VAT accounts')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--period <YYYYMM>', 'Filter to a single period using #PSALDO data (e.g. 202403 = March 2024)')
  .addHelpText('after', `
Maps Swedish BAS VAT accounts to SKV 4700 declaration fields:
  Field 05  Taxable sales base       (account 3010)
  Field 10  Output VAT 25%           (account 2610)
  Field 11  Output VAT 12%           (account 2620)
  Field 12  Output VAT 6%            (account 2630)
  Field 48  Deductible input VAT     (account 2640)
  Field 49  Net VAT payable/refund   (2610+2620+2630 − 2640)

Without --period: uses closing balances (#UB) for the full year.
With --period YYYYMM: uses period balance records (#PSALDO) for that month.

Examples:
  $ skattata moms annual.se
  $ skattata moms annual.se --period 202403
  $ skattata moms annual.se --format json
`)
  .action(async (file: string, options: { format: OutputFormat; period?: string }) => {
    try {
      const doc = await parseFile(file);
      const calc = new MomsCalculator();
      const result = calc.calculate(doc, options.period);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.period) {
        console.log(`Period: ${result.period}`);
      }

      const headers = ['Code', 'Label', 'Amount'];
      const rows = result.fields.map(f => [f.code, f.label, f.amount.toFixed(2)]);
      console.log(formatRows(headers, rows, options.format));
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── sru-report ──
program
  .command('sru-report <file>')
  .description('Tax declaration report (INK2R/NE) aggregating account balances by SRU code')
  .option('-f, --format <format>', 'Output format: table|json|csv|sru', 'table')
  .option('--year <n>', 'Booking year: 0=current (default), -1=prior year', '0')
  .option('--form <form>', 'Declaration form: ink2r=aktiebolag, ne=enskild firma (default: ink2r)', 'ink2r')
  .option('--output <file>', 'Write Skatteverket .sru flat-file to this path (implies --format sru)')
  .option('--org-number <value>', 'Override organisation number used in #IDENTITET line of .sru file')
  .addHelpText('after', `
SRU (Standardiserade Räkenskapsutdrag) codes are assigned by your accounting
software when it exports the SIE file (e.g. Fortnox, Visma). Each #SRU tag
maps an account to a line on the Swedish income tax declaration.

This command groups accounts by their SRU code and sums the relevant balance:
  T/S accounts (or 1000–2999)  → closing balance (#UB)
  I/K accounts (or 3000+)      → period result  (#RES)

Declaration forms (--form):
  ink2r   INK2R Räkenskapsschema — balance sheet + P&L for aktiebolag
  ink2s   INK2S Skattemässiga justeringar — tax adjustments for aktiebolag
  ne      NE-bilaga Räkenskapsschema — for enskild firma (sole trader)

The --format sru output follows Skatteverket's SKV 269 flat-file format:
  #BLANKETT INK2R
  #IDENTITET 5566547898 20240401 143022
  #NAMN Demoföretaget AB
  #SYSTEMINFO skattata 0.1.0
  #UPPGIFT 7201 1500000
  #BLANKETTSLUT
  #FIL_SLUT

Note: a full Skatteverket submission also requires an info.sru companion
file (not generated here). The .sru output is the blanketter.sru component.

Examples:
  $ skattata sru-report annual.se
  $ skattata sru-report annual.se --format json
  $ skattata sru-report annual.se --format sru
  $ skattata sru-report annual.se --output ink2r.sru
  $ skattata sru-report annual.se --form ne --output ne.sru
  $ skattata sru-report annual.se --org-number 5566547898 --output ink2r.sru
`)
  .action(async (file: string, options: { format: string; year: string; form: string; output?: string; orgNumber?: string }) => {
    try {
      const doc = await parseFile(file);
      const yearId = parseInt(options.year ?? '0', 10);
      const result = new SruReportCalculator().calculate(doc, yearId);

      if (options.output || options.format === 'sru') {
        const sruText = writeSruFile(result, {
          form: (options.form ?? 'ink2r').toUpperCase() as 'INK2R' | 'INK2S' | 'NE',
          orgNumber: options.orgNumber,
        });
        if (options.output) {
          // No directory restriction enforced — intentional for a tax filing tool
          const absOutput = resolve(options.output);
          await Bun.write(absOutput, sruText);
          console.log(`Written to ${absOutput}`);
        } else {
          console.log(sruText);
        }
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // table/csv output
      const headers = ['SRU Code', 'Total (SEK)', 'Accounts'];
      const rows = result.entries.map(e => [
        e.sruCode,
        e.totalAmount.toFixed(2),
        e.accounts.map(a => a.id).join(', '),
      ]);
      console.log(formatRows(headers, rows, (options.format ?? 'table') as OutputFormat));

      if (result.missingCode.length > 0) {
        console.log(`\n${result.missingCode.length} account(s) have no SRU code.`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── test-all ──
program
  .command('test-all <dir>')
  .description('Batch-parse every .se/.si/.sie file in a directory and report PASS/FAIL')
  .option('--stop-on-error', 'Stop immediately on the first file that fails to parse')
  .option('--report <file>', 'Write a JSON report to file: { total, passed, failed, results[] }')
  .addHelpText('after', `
Discovers all files with extensions .se .si .sie (case-insensitive) in the
given directory (non-recursive). For each file: parses it and checks that
doc.errors is empty. A file FAILS if it crashes the parser or produces errors.

Exit code: 0 if all files pass, 1 if any fail.

Examples:
  $ skattata test-all ./sie_test_files
  $ skattata test-all ./sie_test_files --report results.json
  $ skattata test-all ./sie_test_files --stop-on-error
  $ skattata test-all . --report out.json && echo "All clean"
`)
  .action(async (dir: string, options: { stopOnError?: boolean; report?: string }) => {
    try {
      const absDir = resolve(dir);
      const entries = await readdir(absDir);
      const sieExts = new Set(['.se', '.si', '.sie']);
      const sieFiles = entries.filter(f => sieExts.has(extname(f).toLowerCase()));

      if (sieFiles.length === 0) {
        console.log('No SIE files found in directory.');
        process.exit(0);
      }

      let passed = 0;
      let failed = 0;
      const results: { file: string; status: 'pass' | 'fail'; error?: string }[] = [];

      for (const fileName of sieFiles) {
        const filePath = resolve(absDir, fileName);
        try {
          const doc = await parseFile(filePath);
          if (doc.errors.length > 0) {
            throw new Error(`Parse errors: ${doc.errors.join('; ')}`);
          }
          passed++;
          results.push({ file: fileName, status: 'pass' });
        } catch (err) {
          failed++;
          const msg = (err as Error).message;
          results.push({ file: fileName, status: 'fail', error: msg });
          if (options.stopOnError) {
            console.error(`FAIL: ${fileName} — ${msg}`);
            break;
          }
        }
      }

      // Summary
      const headers = ['File', 'Status'];
      const rows = results.map(r => [r.file, r.status === 'pass' ? 'PASS' : `FAIL: ${r.error ?? ''}`]);
      console.log(formatRows(headers, rows, 'table'));
      console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

      if (options.report) {
        const reportPath = resolve(options.report);
        await writeFile(reportPath, JSON.stringify({ total: results.length, passed, failed, results }, null, 2));
        console.log(`Report written to ${reportPath}`);
      }

      process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
