import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatSwedishNumber(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const abs = intPart.replace('-', '');
  const withSep = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${withSep},${decPart}`;
}

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('list <file>')
    .description('List vouchers in a SIE file')
    .option('--series <series>', 'Filter by voucher series')
    .option('--period <YYYYMM>', 'Filter vouchers by period (year+month of date)')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .addHelpText('after', `
Examples:
  $ skattata voucher list annual.se
  $ skattata voucher list annual.se --series A
  $ skattata voucher list annual.se --period 202403
`)
    .action(async (file: string, options: { series?: string; period?: string; format: OutputFormat }) => {
      try {
        if (options.period && !/^\d{6}$/.test(options.period)) {
          console.error('Error: --period must be YYYYMM (6 digits)');
          process.exit(1);
        }

        const doc = await parseFile(file);
        let vouchers = doc.vouchers;

        if (options.series) {
          vouchers = vouchers.filter(v => v.series === options.series);
        }

        if (options.period) {
          const periodYear = parseInt(options.period.substring(0, 4), 10);
          const periodMonth = parseInt(options.period.substring(4, 6), 10);
          vouchers = vouchers.filter(v => {
            return v.date.getFullYear() === periodYear && (v.date.getMonth() + 1) === periodMonth;
          });
        }

        const headers = ['Series', 'No', 'Date', 'Text', 'Rows', 'Balance'];
        const rows = vouchers.map(v => [
          v.series,
          v.number,
          formatDate(v.date),
          v.text,
          String(v.rows.length),
          formatSwedishNumber(v.balance),
        ]);

        console.log(formatRows(headers, rows, options.format));
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
