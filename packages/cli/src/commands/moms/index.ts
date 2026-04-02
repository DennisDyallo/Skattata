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
  Field 05  Taxable sales base       (accounts 3000-3999)
  Field 10  Output VAT 25%           (accounts 2610-2619)
  Field 11  Output VAT 12%           (accounts 2620-2629)
  Field 12  Output VAT 6%            (accounts 2630-2639)
  Field 48  Deductible input VAT     (accounts 2640-2669)
  Field 49  Net VAT payable/refund   (sum output − input)

EU fields (shown only when EU accounts have non-zero balances):
  Field 20  EU acquisitions           (accounts 4500-4599)
  Field 30  EU sales of goods         (accounts 3100-3199)
  Field 31  EU sales of services      (accounts 3300-3399)
  Field 35  Reverse charge purchases  (accounts 4530-4599)
  Field 36  Reverse charge output VAT (accounts 2614-2615)
  Field 37  Reverse charge input VAT  (accounts 2645-2647)

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

        if (result.warnings.length > 0) {
          for (const w of result.warnings) console.warn(w);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
