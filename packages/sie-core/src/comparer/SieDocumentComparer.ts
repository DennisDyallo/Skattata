import { SieDocument } from '../models/SieDocument.js';

export class SieDocumentComparer {
  compare(a: SieDocument, b: SieDocument): string[] {
    return compareSieDocuments(a, b);
  }
}

function localDateStr(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function compareSieDocuments(a: SieDocument, b: SieDocument): string[] {
  const diffs: string[] = [];

  if (a.companyName !== b.companyName) {
    diffs.push(`companyName differs: "${a.companyName}" vs "${b.companyName}"`);
  }

  if (a.format !== b.format) {
    diffs.push(`format differs: "${a.format}" vs "${b.format}"`);
  }

  if (a.accounts.size !== b.accounts.size) {
    diffs.push(`accounts count differs: ${a.accounts.size} vs ${b.accounts.size}`);
  } else {
    for (const [id, accA] of a.accounts) {
      const accB = b.accounts.get(id);
      if (!accB) {
        diffs.push(`account ${id} missing in second document`);
      } else {
        if (accA.name !== accB.name) {
          diffs.push(`account ${id} name differs: "${accA.name}" vs "${accB.name}"`);
        }
        if (accA.openingBalance !== accB.openingBalance) {
          diffs.push(`account ${id} openingBalance differs: ${accA.openingBalance} vs ${accB.openingBalance}`);
        }
        if (accA.closingBalance !== accB.closingBalance) {
          diffs.push(`account ${id} closingBalance differs: ${accA.closingBalance} vs ${accB.closingBalance}`);
        }
        if (accA.result !== accB.result) {
          diffs.push(`account ${id} result differs: ${accA.result} vs ${accB.result}`);
        }
        if (accA.sruCode !== accB.sruCode) {
          diffs.push(`account ${id} sruCode differs: "${accA.sruCode}" vs "${accB.sruCode}"`);
        }
        if (accA.type !== accB.type) {
          diffs.push(`account ${id} type differs: "${accA.type}" vs "${accB.type}"`);
        }
      }
    }
  }

  if (a.vouchers.length !== b.vouchers.length) {
    diffs.push(`vouchers count differs: ${a.vouchers.length} vs ${b.vouchers.length}`);
  } else {
    for (let i = 0; i < a.vouchers.length; i++) {
      const va = a.vouchers[i];
      const vb = b.vouchers[i];
      if (va.series !== vb.series) {
        diffs.push(`voucher[${i}] series differs: "${va.series}" vs "${vb.series}"`);
      }
      if (va.number !== vb.number) {
        diffs.push(`voucher[${i}] number differs: "${va.number}" vs "${vb.number}"`);
      }
      const dateA = localDateStr(va.date);
      const dateB = localDateStr(vb.date);
      if (dateA !== dateB) {
        diffs.push(`voucher[${i}] date differs: "${dateA}" vs "${dateB}"`);
      }
      if (va.text !== vb.text) {
        diffs.push(`voucher[${i}] text differs: "${va.text}" vs "${vb.text}"`);
      }

      if (va.rows.length !== vb.rows.length) {
        diffs.push(`voucher[${i}] rows count differs: ${va.rows.length} vs ${vb.rows.length}`);
      } else {
        for (let r = 0; r < va.rows.length; r++) {
          const ra = va.rows[r];
          const rb = vb.rows[r];
          if (ra.accountNumber !== rb.accountNumber) {
            diffs.push(`voucher[${i}].row[${r}] accountNumber differs: "${ra.accountNumber}" vs "${rb.accountNumber}"`);
          }
          if (ra.amount.toFixed(2) !== rb.amount.toFixed(2)) {
            diffs.push(`voucher[${i}].row[${r}] amount differs: ${ra.amount.toFixed(2)} vs ${rb.amount.toFixed(2)}`);
          }
        }
      }
    }
  }

  return diffs;
}
