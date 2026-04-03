import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { writeSieFile } from '../../shared/writeFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { nextVoucherNumber, confirm } from '../../shared/voucherHelpers.js';

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('transfer <file>')
    .description('Transfer amount between two accounts')
    .requiredOption('--date <YYYY-MM-DD>', 'Transaction date')
    .requiredOption('--text <text>', 'Voucher description')
    .requiredOption('--amount <n>', 'Amount to transfer')
    .requiredOption('--from <account>', 'Source account (money leaves here)')
    .requiredOption('--to <account>', 'Destination account (money arrives here)')
    .option('--series <S>', 'Voucher series', 'A')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher transfer annual.se --date 2024-03-22 --text "Uttag till handkassa" --amount 5000 --from 1930 --to 1910
`)
    .action(async (file: string, options: {
      date: string;
      text: string;
      amount: string;
      from: string;
      to: string;
      series: string;
      output?: string;
      backup?: boolean;
      yes?: boolean;
    }) => {
      try {
        const doc = await parseFile(file);

        const amount = parseFloat(options.amount);
        if (isNaN(amount) || amount <= 0) {
          console.error('Error: --amount must be a positive number'); process.exit(1);
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
          console.error(`Error: Invalid date format '${options.date}' — must be YYYY-MM-DD`); process.exit(1);
        }
        const date = new Date(options.date + 'T00:00:00');

        const series = options.series;
        const number = nextVoucherNumber(doc, series);

        const voucher = new SieVoucher();
        voucher.series = series;
        voucher.number = number;
        voucher.date = date;
        voucher.text = options.text;

        const fromRow = new SieVoucherRow();
        fromRow.accountNumber = options.from;
        fromRow.amount = -amount;
        voucher.rows.push(fromRow);

        const toRow = new SieVoucherRow();
        toRow.accountNumber = options.to;
        toRow.amount = amount;
        voucher.rows.push(toRow);

        const validation = new VoucherValidator().validate(voucher, doc);
        for (const err of validation.errors) {
          if (!err.fatal) process.stderr.write(`Warning: ${err.message}\n`);
        }
        if (!validation.valid) {
          for (const err of validation.errors.filter(e => e.fatal)) console.error(`Error: ${err.message}`);
          process.exit(1);
        }

        console.log(renderVoucherPreview(voucher, doc));

        if (!options.yes) {
          const dest = options.output ?? file;
          const ok = await confirm(`Write to ${dest}? [Y/n] `);
          if (!ok) { console.log('Aborted.'); process.exit(0); }
        }

        doc.vouchers.push(voucher);
        const writtenPath = await writeSieFile(doc, file, { outputPath: options.output, backup: options.backup });
        console.log(`\u2713 Added verifikation ${series}-${number} to ${writtenPath}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
