import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { writeSieFile } from '../../shared/writeFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { nextVoucherNumber, confirm } from '../../shared/voucherHelpers.js';

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('owner <file>')
    .description('Record owner withdrawal or deposit (enskild firma)')
    .requiredOption('--date <YYYY-MM-DD>', 'Transaction date')
    .requiredOption('--text <text>', 'Voucher description')
    .option('--withdrawal <n>', 'Amount withdrawn by owner')
    .option('--deposit <n>', 'Amount deposited by owner')
    .option('--bank-account <n>', 'Bank account', '1930')
    .option('--owner-account <n>', 'Owner equity account (BAS 2013)', '2013')
    .option('--series <S>', 'Voucher series', 'A')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher owner annual.se --date 2024-03-25 --text "Eget uttag mars" --withdrawal 10000
  $ skattata voucher owner annual.se --date 2024-03-25 --text "Eget insättning" --deposit 5000
`)
    .action(async (file: string, options: {
      date: string;
      text: string;
      withdrawal?: string;
      deposit?: string;
      bankAccount: string;
      ownerAccount: string;
      series: string;
      output?: string;
      backup?: boolean;
      yes?: boolean;
    }) => {
      try {
        const doc = await parseFile(file);

        const hasWithdrawal = options.withdrawal !== undefined;
        const hasDeposit = options.deposit !== undefined;

        if (hasWithdrawal && hasDeposit) {
          console.error('Error: --withdrawal and --deposit are mutually exclusive'); process.exit(1);
        }
        if (!hasWithdrawal && !hasDeposit) {
          console.error('Error: one of --withdrawal or --deposit is required'); process.exit(1);
        }

        const rawAmount = options.withdrawal ?? options.deposit!;
        const amount = parseFloat(rawAmount);
        if (isNaN(amount) || amount <= 0) {
          console.error('Error: amount must be a positive number'); process.exit(1);
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

        const ownerRow = new SieVoucherRow();
        const bankRow = new SieVoucherRow();
        ownerRow.accountNumber = options.ownerAccount;
        bankRow.accountNumber = options.bankAccount;

        if (hasWithdrawal) {
          // Withdrawal: debit owner equity (2013), credit bank (1930)
          ownerRow.amount = amount;
          bankRow.amount = -amount;
        } else {
          // Deposit: debit bank (1930), credit owner equity (2013)
          bankRow.amount = amount;
          ownerRow.amount = -amount;
        }

        voucher.rows.push(ownerRow, bankRow);

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
