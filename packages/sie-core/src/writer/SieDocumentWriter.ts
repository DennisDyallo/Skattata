import { SieDocument } from '../models/SieDocument.js';
import { SieAccount } from '../models/SieAccount.js';
import { SieVoucher } from '../models/SieVoucher.js';
import { SieVoucherRow } from '../models/SieVoucherRow.js';
import { SieObject } from '../models/SieObject.js';
import { encodeSie4 } from '../utils/encoding.js';

/**
 * Format a Date as yyyyMMdd string using local timezone,
 * matching the parser's `new Date(y, m, d)` convention.
 */
export function formatDate(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Quote a SIE 4 token if necessary.
 * - Empty strings become `""`
 * - Tokens containing spaces, backslashes, or double-quotes are quoted
 *   (inner double-quotes are escaped as `\"`)
 * - `{...}` object references are NEVER quoted
 */
export function quoteToken(value: string): string {
  // Object references pass through as-is
  if (value.startsWith('{') && value.endsWith('}')) {
    return value;
  }
  // Needs quoting if empty, contains space, backslash, or double-quote
  if (value === '' || value.includes(' ') || value.includes('\\') || value.includes('"')) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function buildObjectRef(objects: SieObject[]): string {
  if (objects.length === 0) return '{}';
  const inner = objects.map(o => `${o.dimensionNumber} "${o.number}"`).join(' ');
  return `{${inner}}`;
}

export class SieDocumentWriter {
  write(doc: SieDocument): Buffer {
    const lines: string[] = [];

    // 1. Standard header
    lines.push(`#FLAGGA ${doc.flagga}`);
    lines.push(`#PROGRAM ${quoteToken(doc.program || 'skattata')}`);
    lines.push(`#FORMAT ${quoteToken(doc.format || 'PC8')}`);
    lines.push(`#GEN ${doc.generatedAt || formatDate(new Date())}`);
    lines.push(`#SIETYP ${doc.sieType || 4}`);
    if (doc.currency && doc.currency !== 'SEK') {
      lines.push(`#VALUTA ${quoteToken(doc.currency)}`);
    }

    // 2. FNAMN
    if (doc.companyName) {
      lines.push(`#FNAMN ${quoteToken(doc.companyName)}`);
    }

    // 3. ORGNR
    if (doc.organizationNumber) {
      lines.push(`#ORGNR ${quoteToken(doc.organizationNumber)}`);
    }

    // 4. RAR (booking years)
    for (const year of doc.bookingYears) {
      lines.push(`#RAR ${year.id} ${formatDate(year.startDate)} ${formatDate(year.endDate)}`);
    }

    // 5. DIM + OBJEKT
    for (const dim of doc.dimensions) {
      let dimLine = `#DIM ${quoteToken(dim.number)} ${quoteToken(dim.name)}`;
      if (dim.parentNumber) dimLine += ` ${quoteToken(dim.parentNumber)}`;
      lines.push(dimLine);
      for (const [, obj] of dim.objects) {
        lines.push(`#OBJEKT ${quoteToken(dim.number)} ${quoteToken(obj.number)} ${quoteToken(obj.name)}`);
      }
    }

    // 6. Accounts: KONTO, KTYP, SRU
    const sortedAccounts = [...doc.accounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [id, acc] of sortedAccounts) {
      let kontoLine = `#KONTO ${quoteToken(id)} ${quoteToken(acc.name)}`;
      if (acc.unit) kontoLine += ` ${quoteToken(acc.unit)}`;
      lines.push(kontoLine);

      if (acc.type) {
        lines.push(`#KTYP ${quoteToken(id)} ${quoteToken(acc.type)}`);
      }
      if (acc.sruCode) {
        lines.push(`#SRU ${quoteToken(id)} ${quoteToken(acc.sruCode)}`);
      }
    }

    // 7. IB, UB, RES for accounts with non-zero values
    for (const [id, acc] of sortedAccounts) {
      if (acc.yearBalances.size > 0) {
        for (const [yearId, bal] of [...acc.yearBalances.entries()].sort((a, b) => b[0] - a[0])) {
          if (bal.opening !== 0) lines.push(`#IB ${yearId} ${quoteToken(id)} ${bal.opening.toFixed(2)}`);
          if (bal.closing !== 0) lines.push(`#UB ${yearId} ${quoteToken(id)} ${bal.closing.toFixed(2)}`);
          if (bal.result !== 0) lines.push(`#RES ${yearId} ${quoteToken(id)} ${bal.result.toFixed(2)}`);
        }
      } else {
        // Fallback to scalar fields for documents created without parsing
        if (acc.openingBalance !== 0) {
          lines.push(`#IB 0 ${quoteToken(id)} ${acc.openingBalance.toFixed(2)}`);
        }
        if (acc.closingBalance !== 0) {
          lines.push(`#UB 0 ${quoteToken(id)} ${acc.closingBalance.toFixed(2)}`);
        }
        if (acc.result !== 0) {
          lines.push(`#RES 0 ${quoteToken(id)} ${acc.result.toFixed(2)}`);
        }
      }
    }

    // 8. PSALDO for period values
    for (const [id, acc] of sortedAccounts) {
      for (const pv of acc.periodValues) {
        const yearId = pv.bookingYear?.id ?? 0;
        const objRef = pv.objects.length > 0
          ? `{${pv.objects.map(o => `${o.dimensionNumber} "${o.number}"`).join(' ')}}`
          : '{}';
        lines.push(`#PSALDO ${yearId} ${pv.period} ${quoteToken(id)} ${objRef} ${pv.value.toFixed(2)}`);
      }
    }

    // 9. Vouchers
    for (const voucher of doc.vouchers) {
      let verLine = `#VER ${quoteToken(voucher.series)} ${quoteToken(voucher.number)} ${formatDate(voucher.date)} ${quoteToken(voucher.text)}`;
      if (voucher.registrationDate) {
        verLine += ` ${formatDate(voucher.registrationDate)}`;
        if (voucher.registrationSign) {
          verLine += ` ${quoteToken(voucher.registrationSign)}`;
        }
      }
      lines.push(verLine);
      lines.push('{');

      for (const row of voucher.rows) {
        const objRef = buildObjectRef(row.objects);
        lines.push(`#TRANS ${quoteToken(row.accountNumber)} ${objRef} ${row.amount.toFixed(2)} ${formatDate(row.transactionDate)} ${quoteToken(row.rowText)}`);
      }

      lines.push('}');
    }

    const text = lines.join('\r\n') + '\r\n';
    return encodeSie4(text);
  }
}

/**
 * Convenience function: serialize a SieDocument to SIE 4 CP437 Buffer.
 */
export function writeSie4(doc: SieDocument): Buffer {
  return new SieDocumentWriter().write(doc);
}
