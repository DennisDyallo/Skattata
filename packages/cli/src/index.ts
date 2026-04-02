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
  .description('CLI for parsing and validating Swedish SIE accounting files')
  .version('0.1.0');

// ── parse ──
program
  .command('parse <file>')
  .description('Parse a SIE file and display document summary')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--accounts', 'Include accounts in output')
  .option('--vouchers', 'Include vouchers in output')
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
  .description('Round-trip validate: parse -> write -> parse -> compare')
  .option('--verbose', 'Show detailed diff output')
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
  .description('Generate balance sheet from SIE file')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--year <n>', 'Booking year index (default: 0)')
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
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── income-statement ──
program
  .command('income-statement <file>')
  .description('Generate income statement (P&L) from SIE file')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--year <n>', 'Booking year index (default: 0)')
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
  .description('Generate momsdeklaration (SKV 4700) from SIE file')
  .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
  .option('--period <YYYYMM>', 'Filter by period (uses #PSALDO data)')
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

// ── test-all ──
program
  .command('test-all <dir>')
  .description('E2E test all SIE files in a directory')
  .option('--stop-on-error', 'Stop on first failure')
  .option('--report <file>', 'Write JSON report to file')
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
