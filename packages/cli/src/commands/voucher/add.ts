import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { nextVoucherNumber, confirm, commitVoucher } from '../../shared/voucherHelpers.js';

function parseVoucherEntries(
  flag: string,
  values: string[],
  errorFn: (msg: string) => never
): { accountId: string; amount: number }[] {
  if (values.length % 2 !== 0) {
    errorFn(
      `option '--${flag}' requires pairs of <account> <amount> — got ${values.length} value(s). ` +
      `Example: --${flag} 1930 10000`
    );
  }
  const result: { accountId: string; amount: number }[] = [];
  for (let i = 0; i < values.length; i += 2) {
    const accountId = values[i];
    const amount = parseFloat(values[i + 1]);
    if (isNaN(amount)) {
      errorFn(
        `option '--${flag}': invalid amount '${values[i + 1]}' for account ${accountId} — ` +
        `must be a number. Example: --${flag} ${accountId} 10000`
      );
    }
    result.push({ accountId, amount });
  }
  return result;
}

function parseDate(dateStr: string, errorFn: (msg: string) => never): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errorFn(`Invalid date format '${dateStr}' — must be YYYY-MM-DD`);
  }
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) {
    errorFn(`Invalid date: '${dateStr}'`);
  }
  return d;
}

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('add <file>')
    .description('Add a general-purpose double-entry voucher')
    .requiredOption('--date <YYYY-MM-DD>', 'Transaction date')
    .requiredOption('--text <text>', 'Voucher description')
    .option('--debit <entries...>', 'Debit entry: <account> <amount>. Repeatable.')
    .option('--credit <entries...>', 'Credit entry: <account> <amount>. Repeatable.')
    .option('--series <S>', 'Voucher series', 'A')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('--no-recalculate', 'Skip automatic balance recalculation (use for batch adds)')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher add annual.se --date 2024-03-15 --text "Faktura 1001" --debit 1930 12500 --credit 3010 10000 --credit 2610 2500
  $ skattata voucher add annual.se --date 2024-03-20 --text "Two debits" --debit 6100 300 6200 200 --credit 1930 500
`)
    .action(async (file: string, options: {
      date: string;
      text: string;
      debit?: string[];
      credit?: string[];
      series: string;
      output?: string;
      backup?: boolean;
      recalculate: boolean;
      yes?: boolean;
    }) => {
      try {
        const doc = await parseFile(file);
        const errorFn = (msg: string): never => { voucherCmd.error(msg); };

        const debitEntries = parseVoucherEntries('debit', options.debit ?? [], errorFn);
        const creditEntries = parseVoucherEntries('credit', options.credit ?? [], errorFn);

        if (debitEntries.length === 0 || creditEntries.length === 0) {
          voucherCmd.error('At least one --debit and one --credit entry is required');
        }

        const date = parseDate(options.date, errorFn);
        const series = options.series;
        const number = nextVoucherNumber(doc, series);

        const voucher = new SieVoucher();
        voucher.series = series;
        voucher.number = number;
        voucher.date = date;
        voucher.text = options.text;

        for (const entry of debitEntries) {
          const row = new SieVoucherRow();
          row.accountNumber = entry.accountId;
          row.amount = Math.abs(entry.amount);
          voucher.rows.push(row);
        }
        for (const entry of creditEntries) {
          const row = new SieVoucherRow();
          row.accountNumber = entry.accountId;
          row.amount = -Math.abs(entry.amount);
          voucher.rows.push(row);
        }

        const validation = new VoucherValidator().validate(voucher, doc);
        for (const err of validation.errors) {
          if (!err.fatal) process.stderr.write(`Warning: ${err.message}\n`);
        }
        if (!validation.valid) {
          for (const err of validation.errors.filter(e => e.fatal)) {
            console.error(`Error: ${err.message}`);
          }
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
