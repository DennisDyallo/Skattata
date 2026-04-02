import type { Command } from 'commander';
import { resolve, dirname, join } from 'node:path';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { SruReportCalculator } from './SruReportCalculator.js';
import { writeSruFile, type SruFileOptions } from './SruFileWriter.js';
import { writeInfoSru } from './InfoSruWriter.js';
import { IncomeStatementCalculator } from '../income-statement/IncomeStatementCalculator.js';

export function register(program: Command): void {
  program
    .command('sru-report <file>')
    .description('Tax declaration report (INK2R/NE) aggregating account balances by SRU code')
    .option('-f, --format <format>', 'Output format: table|json|csv|sru', 'table')
    .option('--year <n>', 'Booking year: 0=current (default), -1=prior year', '0')
    .option('--form <form>', 'Declaration form: ink2r=aktiebolag, ne=enskild firma (default: ink2r)', 'ink2r')
    .option('--output <file>', 'Write Skatteverket .sru flat-file to this path (implies --format sru)')
    .option('--org-number <value>', 'Override organisation number used in #IDENTITET line of .sru file')
    .option('--tax-year <YYYY>', 'Tax year for #TAXAR declaration (default: current year - 1)')
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

When --output is used, an info.sru companion file is also written to the
same directory (required for a complete Skatteverket SRU submission).
The --output file is the blanketter.sru component; info.sru is the sender metadata.

Examples:
  $ skattata sru-report annual.se
  $ skattata sru-report annual.se --format json
  $ skattata sru-report annual.se --format sru
  $ skattata sru-report annual.se --output ink2r.sru
  $ skattata sru-report annual.se --form ne --output ne.sru
  $ skattata sru-report annual.se --org-number 5566547898 --output ink2r.sru
`)
    .action(async (file: string, options: { format: string; year: string; form: string; output?: string; orgNumber?: string; taxYear?: string }) => {
      try {
        const doc = await parseFile(file);
        const yearId = parseInt(options.year ?? '0', 10);
        const result = new SruReportCalculator().calculate(doc, yearId);

        // NE-bilaga validation: warn if no SRU codes found
        if (options.form?.toLowerCase() === 'ne') {
          if (result.entries.length === 0) {
            console.warn(`Warning: No NE SRU codes found in this SIE file. The accounting software did not export #SRU tags. NE-bilaga output will be empty.`);
            if (result.missingCode.length > 0) {
              const sample = result.missingCode.slice(0, 5).map(a => `${a.id} (${a.name || 'unnamed'})`).join(', ');
              console.warn(`  Accounts without SRU codes: ${sample}${result.missingCode.length > 5 ? ` and ${result.missingCode.length - 5} more` : ''}`);
            }
            process.exit(1);
          }

          // Check for revenue section
          const hasRevenue = result.entries.some(e => {
            return e.accounts.some(a => {
              const num = parseInt(a.id, 10);
              return num >= 3000 && num <= 3999;
            });
          });
          if (!hasRevenue && result.entries.length > 0) {
            console.warn('Warning: NE-bilaga has cost entries but no revenue section. Accounts in 3000-3999 may be missing #SRU tags.');
          }
        }

        // INK2R validation: warn if no SRU codes found or sections missing
        if (options.form?.toLowerCase() === 'ink2r') {
          if (result.entries.length === 0) {
            console.warn('Warning: No INK2R SRU codes found in this SIE file. The accounting software did not export #SRU tags.');
            if (result.missingCode.length > 0) {
              const sample = result.missingCode.slice(0, 5).map(a => `${a.id} (${a.name || 'unnamed'})`).join(', ');
              console.warn(`  Accounts without SRU codes: ${sample}${result.missingCode.length > 5 ? ` and ${result.missingCode.length - 5} more` : ''}`);
            }
            process.exit(1);
          }

          // Check for balance sheet and P&L sections
          // INK2R balance sheet: 7200-7399 (assets, equity, liabilities)
          // INK2R P&L: 7400+ (revenue, costs, financial items)
          const hasBalanceSheet = result.entries.some(e => {
            const code = parseInt(e.sruCode, 10);
            return code >= 7200 && code <= 7399;
          });
          const hasPnL = result.entries.some(e => {
            const code = parseInt(e.sruCode, 10);
            return code >= 7400;
          });
          if (hasBalanceSheet && !hasPnL) {
            console.warn('Warning: INK2R has balance sheet codes but no P&L section (7400-7599). Income/expense accounts may be missing #SRU tags.');
          } else if (!hasBalanceSheet && hasPnL) {
            console.warn('Warning: INK2R has P&L codes but no balance sheet section (7201-7383). Asset/equity/liability accounts may be missing #SRU tags.');
          }
        }

        // INK2S validation: informational only (empty is valid — no adjustments needed)
        if (options.form?.toLowerCase() === 'ink2s') {
          if (result.entries.length === 0) {
            console.warn('Note: No INK2S adjustment codes found. This is normal if no tax adjustments apply.');
          }
        }

        if (options.output || options.format === 'sru') {
          const formUpper = (options.form ?? 'ink2r').toUpperCase() as 'INK2R' | 'INK2S' | 'NE';
          const sruFileOptions: SruFileOptions = {
            form: formUpper,
            orgNumber: options.orgNumber,
            taxYear: options.taxYear ? parseInt(options.taxYear, 10) : undefined,
          };

          // NE form: compute egenavgifter schablonavdrag (R43/7714) from income statement
          // SRU codes verified from srufiler.se NE fältförteckning:
          //   R43 → 7714: "Årets beräknade avdrag för egenavgifter och särskild löneskatt"
          //   Schablonavdrag = 25% of profit (simplified deduction, applicable for tax year 2024-2025)
          if (formUpper === 'NE') {
            const alreadyHas7714 = result.entries.some(e => e.sruCode === '7714');
            if (!alreadyHas7714) {
              const incomeResult = new IncomeStatementCalculator().calculate(doc, yearId);
              if (incomeResult.netIncome > 0) {
                const schablonavdrag = Math.trunc(incomeResult.netIncome * 0.25);
                sruFileOptions.computedEntries = [
                  { sruCode: '7714', amount: schablonavdrag },
                ];
              }
            }
          }

          const sruText = writeSruFile(result, sruFileOptions);
          if (options.output) {
            // No directory restriction enforced — intentional for a tax filing tool
            const absOutput = resolve(options.output);
            await Bun.write(absOutput, sruText);
            console.log(`Written to ${absOutput}`);

            // Write info.sru companion file in the same directory (required for full SKV submission)
            const infoPath = join(dirname(absOutput), 'info.sru');
            const infoText = writeInfoSru(result, { orgNumber: options.orgNumber });
            await Bun.write(infoPath, infoText);
            console.log(`Written to ${infoPath}`);
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
}
