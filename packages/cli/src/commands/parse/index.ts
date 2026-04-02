import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, formatKeyValue, type OutputFormat } from '../../shared/formatters/index.js';

export function register(program: Command): void {
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
}
