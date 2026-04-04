import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { nextVoucherNumber, confirm, commitVoucher } from '../../shared/voucherHelpers.js';

function parseVoucherId(
  id: string,
  errorFn: (msg: string) => never
): { series: string; number: string } {
  const dashIdx = id.indexOf('-');
  if (dashIdx < 1) {
    errorFn(
      `Invalid voucher ID '${id}' -- expected format S-N (e.g. A-47)`
    );
  }
  return {
    series: id.substring(0, dashIdx),
    number: id.substring(dashIdx + 1),
  };
}

function parseDate(dateStr: string, errorFn: (msg: string) => never): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errorFn(`Invalid date format '${dateStr}' -- must be YYYY-MM-DD`);
  }
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) {
    errorFn(`Invalid date: '${dateStr}'`);
  }
  return d;
}

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('reverse <file>')
    .description('Create a reversal (counter-entry) for an existing voucher')
    .requiredOption('--voucher <S-N>', 'Voucher to reverse, e.g. A-47')
    .option('--date <YYYY-MM-DD>', 'Reversal date (default: today)')
    .option('--text <text>', 'Override reversal description')
    .option('--series <S>', 'Series for the reversal voucher (default: same as original)')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('--no-recalculate', 'Skip automatic balance recalculation')
    .option('--force', 'Allow reversing an already-reversed voucher')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher reverse annual.se --voucher A-47
  $ skattata voucher reverse annual.se --voucher A-47 --date 2024-04-01
  $ skattata voucher reverse annual.se --voucher A-47 --series B --yes
`)
    .action(async (file: string, options: {
      voucher: string;
      date?: string;
      text?: string;
      series?: string;
      output?: string;
      backup?: boolean;
      recalculate: boolean;
      force?: boolean;
      yes?: boolean;
    }) => {
      try {
        const doc = await parseFile(file);
        const errorFn = (msg: string): never => { voucherCmd.error(msg); };

        const target = parseVoucherId(options.voucher, errorFn);

        const original = doc.vouchers.find(
          v => v.series === target.series && v.number === target.number
        );
        if (!original) {
          errorFn(`Voucher ${target.series}-${target.number} not found`);
        }

        // Double-reversal guard
        if (original.text.startsWith('Korrigering:') && !options.force) {
          console.error(
            `Error: Voucher ${target.series}-${target.number} appears to be a reversal itself ` +
            `("${original.text}"). Use --force to reverse it anyway.`
          );
          process.exit(1);
        }

        // Determine reversal date
        let reversalDate: Date;
        if (options.date) {
          reversalDate = parseDate(options.date, errorFn);
        } else {
          reversalDate = new Date();
        }

        const reversalSeries = options.series ?? original.series;
        const reversalNumber = nextVoucherNumber(doc, reversalSeries);

        const reversal = new SieVoucher();
        reversal.series = reversalSeries;
        reversal.number = reversalNumber;
        reversal.date = reversalDate;
        reversal.text = options.text ?? `Korrigering: ${original.text}`;

        for (const originalRow of original.rows) {
          const row = new SieVoucherRow();
          row.accountNumber = originalRow.accountNumber;
          row.amount = -originalRow.amount;
          row.objects = [...originalRow.objects];
          row.rowText = originalRow.rowText;
          reversal.rows.push(row);
        }

        const validation = new VoucherValidator().validate(reversal, doc);
        for (const err of validation.errors) {
          if (!err.fatal) process.stderr.write(`Warning: ${err.message}\n`);
        }
        if (!validation.valid) {
          for (const err of validation.errors.filter(e => e.fatal)) {
            console.error(`Error: ${err.message}`);
          }
          process.exit(1);
        }

        console.log('Original voucher:');
        console.log(renderVoucherPreview(original, doc));
        console.log('');
        console.log('Reversal voucher:');
        console.log(renderVoucherPreview(reversal, doc));

        if (!options.yes) {
          const dest = options.output ?? file;
          const ok = await confirm(`Write reversal to ${dest}? [Y/n] `);
          if (!ok) { console.log('Aborted.'); process.exit(0); }
        }

        await commitVoucher(doc, reversal, {
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
