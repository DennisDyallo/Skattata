import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { writeSieFile } from '../../shared/writeFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { computeVatSplit, vatAccountsForRate } from '../../shared/vatCalculator.js';
import { nextVoucherNumber, confirm } from '../../shared/voucherHelpers.js';

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('expense <file>')
    .description('Record a purchase/expense (auto-computes VAT split)')
    .requiredOption('--date <YYYY-MM-DD>', 'Transaction date')
    .requiredOption('--text <text>', 'Voucher description')
    .requiredOption('--amount <n>', 'Total amount including VAT')
    .requiredOption('--account <n>', 'Expense account (typically 4000-7999)')
    .requiredOption('--vat <rate>', 'VAT rate as integer percentage: 25, 12, 6, or 0')
    .option('--bank-account <n>', 'Bank account to credit', '1930')
    .option('--series <S>', 'Voucher series', 'A')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher expense annual.se --date 2024-03-20 --text "Kontorsmaterial" --amount 6250 --account 6110 --vat 25
  $ skattata voucher expense annual.se --date 2024-03-21 --text "Hotell" --amount 2240 --account 5800 --vat 12
`)
    .action(async (file: string, options: {
      date: string;
      text: string;
      amount: string;
      account: string;
      vat: string;
      bankAccount: string;
      series: string;
      output?: string;
      backup?: boolean;
      yes?: boolean;
    }) => {
      try {
        const doc = await parseFile(file);

        const total = parseFloat(options.amount);
        if (isNaN(total) || total <= 0) {
          console.error('Error: --amount must be a positive number'); process.exit(1);
        }

        const vatPct = parseInt(options.vat, 10);
        if (![0, 6, 12, 25].includes(vatPct)) {
          console.error('Error: --vat must be 25, 12, 6, or 0'); process.exit(1);
        }
        const vatRate = vatPct / 100;

        const acctNum = parseInt(options.account, 10);
        if (acctNum < 4000 || acctNum > 7999) {
          process.stderr.write(`Warning: account ${options.account} is outside the typical expense range 4000-7999\n`);
        }

        const vatAccounts = vatAccountsForRate(vatRate);
        const { net, vat } = computeVatSplit(total, vatRate);

        const series = options.series;
        const number = nextVoucherNumber(doc, series);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
          console.error(`Error: Invalid date format '${options.date}' — must be YYYY-MM-DD`); process.exit(1);
        }
        const date = new Date(options.date + 'T00:00:00');

        const voucher = new SieVoucher();
        voucher.series = series;
        voucher.number = number;
        voucher.date = date;
        voucher.text = options.text;

        // Debit: expense account for net
        const expRow = new SieVoucherRow();
        expRow.accountNumber = options.account;
        expRow.amount = net;
        voucher.rows.push(expRow);

        // Debit: input VAT account (only if rate > 0)
        if (vatRate > 0 && vatAccounts.inputVat) {
          const vatRow = new SieVoucherRow();
          vatRow.accountNumber = vatAccounts.inputVat;
          vatRow.amount = vat;
          voucher.rows.push(vatRow);
        }

        // Credit: bank account for total
        const bankRow = new SieVoucherRow();
        bankRow.accountNumber = options.bankAccount;
        bankRow.amount = -total;
        voucher.rows.push(bankRow);

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
