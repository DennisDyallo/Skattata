import type { SieDocument, SieVoucher, RecalculationResult } from '@skattata/sie-core';
import { BalanceRecalculator } from '@skattata/sie-core';
import { writeSieFile } from './writeFile.js';

export function nextVoucherNumber(doc: SieDocument, series: string): string {
  let max = 0;
  for (const v of doc.vouchers) {
    if (v.series === series) {
      const n = parseInt(v.number, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return String(max + 1);
}

function showRecalcResult(result: RecalculationResult, voucher: SieVoucher, doc: SieDocument): void {
  const voucherAccountIds = new Set(voucher.rows.map(r => r.accountNumber));
  const changed = result.updatedAccounts.filter(a => voucherAccountIds.has(a.accountId));
  if (changed.length === 0) return;
  for (const acc of changed) {
    const name = doc.accounts.get(acc.accountId)?.name ?? '';
    const label = (acc.accountId + (name ? `  ${name}` : '')).padEnd(30);
    const prev = acc.previousClosing.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const next = acc.newClosing.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    console.log(`  ${label} ${prev} \u2192 ${next} SEK`);
  }
}

export interface WriteVoucherOptions {
  file: string;
  outputPath?: string;
  backup?: boolean;
  recalculate: boolean;
}

/**
 * Push voucher to document, optionally recalculate balances, write file, and
 * print the confirmation + balance-delta output.  Shared by all 5 voucher
 * write commands to keep the push/recalc/write/report sequence in one place.
 */
export async function commitVoucher(
  doc: SieDocument,
  voucher: SieVoucher,
  opts: WriteVoucherOptions,
): Promise<void> {
  doc.vouchers.push(voucher);

  let recalcResult: RecalculationResult | null = null;
  if (opts.recalculate) {
    recalcResult = new BalanceRecalculator().recalculate(doc);
  }

  const writtenPath = await writeSieFile(doc, opts.file, {
    outputPath: opts.outputPath,
    backup: opts.backup,
  });
  console.log(`\u2713 Added verifikation ${voucher.series}-${voucher.number} to ${writtenPath}`);

  if (recalcResult) {
    showRecalcResult(recalcResult, voucher, doc);
  } else {
    console.log(`  Note: Balances not recalculated. Run 'skattata recalculate ${opts.outputPath ?? opts.file}' when done.`);
  }
}

export async function confirm(question: string): Promise<boolean> {
  process.stdout.write(question);
  return new Promise(resolve => {
    process.stdin.once('data', d => {
      const s = d.toString().trim().toLowerCase();
      resolve(s !== 'n' && s !== 'no');
    });
  });
}
