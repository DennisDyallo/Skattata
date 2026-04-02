import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { MomsCalculator } from './MomsCalculator.js';

export function register(program: Command): void {
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
}
