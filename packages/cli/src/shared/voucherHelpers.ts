import type { SieDocument } from '@skattata/sie-core';

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

export async function confirm(question: string): Promise<boolean> {
  process.stdout.write(question);
  return new Promise(resolve => {
    process.stdin.once('data', d => {
      const s = d.toString().trim().toLowerCase();
      resolve(s !== 'n' && s !== 'no');
    });
  });
}
