import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { computeVatSplit, vatAccountsForRate } from '../../shared/vatCalculator.js';
import { nextVoucherNumber, confirm, commitVoucher } from '../../shared/voucherHelpers.js';

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('sale <file>')
    .description('Record a sale (auto-computes VAT split)')
    .requiredOption('--date <YYYY-MM-DD>', 'Transaction date')
    .requiredOption('--text <text>', 'Voucher description')
    .requiredOption('--amount <n>', 'Total amount including VAT')
    .requiredOption('--vat <rate>', 'VAT rate as integer percentage: 25, 12, 6, or 0')
    .option('--bank-account <n>', 'Bank/AR account to debit', '1930')
    .option('--revenue-account <n>', 'Override default revenue account')
    .option('--series <S>', 'Voucher series', 'A')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('--no-recalculate', 'Skip automatic balance recalculation (use for batch adds)')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher sale annual.se --date 2024-03-15 --text "Faktura 1001" --amount 12500 --vat 25
  $ skattata voucher sale annual.se --date 2024-03-22 --text "Utbildning" --amount 5000 --vat 0
`)
    .action(async (file: string, options: {
      date: string;
      text: string;
      amount: string;
      vat: string;
      bankAccount: string;
      revenueAccount?: string;
      series: string;
      output?: string;
      backup?: boolean;
      recalculate: boolean;
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
        const accounts = vatAccountsForRate(vatRate);
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

        // Debit: bank/AR account for total
        const bankRow = new SieVoucherRow();
        bankRow.accountNumber = options.bankAccount;
        bankRow.amount = total;
        voucher.rows.push(bankRow);

        // Credit: revenue account for net
        const revRow = new SieVoucherRow();
        revRow.accountNumber = options.revenueAccount ?? accounts.revenueAccount;
        revRow.amount = -net;
        voucher.rows.push(revRow);

        // Credit: VAT account (only if rate > 0)
        if (vatRate > 0 && accounts.outputVat) {
          const vatRow = new SieVoucherRow();
          vatRow.accountNumber = accounts.outputVat;
          vatRow.amount = -vat;
          voucher.rows.push(vatRow);
        }

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

        await commitVoucher(doc, voucher, {
          file,
          outputPath: options.output,
          backup: options.backup,
          recalculate: options.recalculate,
        });
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
