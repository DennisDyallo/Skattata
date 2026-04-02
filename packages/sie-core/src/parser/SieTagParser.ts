import { SieDocument } from '../models/SieDocument.js';
import { SieAccount } from '../models/SieAccount.js';
import { SieVoucher } from '../models/SieVoucher.js';
import { SieVoucherRow } from '../models/SieVoucherRow.js';
import { SieDimension } from '../models/SieDimension.js';
import { SieObject } from '../models/SieObject.js';
import { SieBookingYear } from '../models/SieBookingYear.js';
import { SiePeriodValue } from '../models/SiePeriodValue.js';
import { decodeSie4 } from '../utils/encoding.js';
import { splitLine } from '../utils/lineParser.js';
import type { SieAccountType } from '../models/SieAccount.js';

export interface SieCallbacks {
  /** Return false to abort further voucher parsing */
  readVoucher?: (voucher: SieVoucher) => boolean;
}

export class SieTagParser {
  parse(content: Buffer | string, callbacks?: SieCallbacks): SieDocument {
    const text = Buffer.isBuffer(content) ? decodeSie4(content) : content;

    // XML content must be parsed with SieXmlParser — signal caller with an error
    const trimmedStart = text.trimStart();
    if (trimmedStart.startsWith('<?xml') || trimmedStart.startsWith('\uFEFF<?xml')) {
      const doc = new SieDocument();
      doc.format = 'SIE5';
      doc.errors.push('XML content detected: use SieXmlParser instead of SieTagParser');
      return doc;
    }

    const lines = text.split(/\r\n|\r|\n/);
    const doc = new SieDocument();
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      i++;

      if (!line || !line.trim()) continue;

      const tokens = splitLine(line);
      if (tokens.length === 0) continue;

      const tag = tokens[0].toUpperCase();

      try {
        switch (tag) {
          case '#FNAMN':
            if (tokens.length >= 2) doc.companyName = tokens[1];
            break;
          case '#ORGNR':
            if (tokens.length >= 2) doc.organizationNumber = tokens[1];
            break;
          case '#FORMAT':
            if (tokens.length >= 2) doc.format = tokens[1];
            break;
          case '#KONTO':
            this.parseAccount(tokens, doc);
            break;
          case '#KTYP':
            this.parseAccountType(tokens, doc);
            break;
          case '#SRU':
            this.parseSruCode(tokens, doc);
            break;
          case '#DIM':
            this.parseDimension(tokens, doc);
            break;
          case '#OBJEKT':
          case '#OBJECT':
            this.parseObject(tokens, doc);
            break;
          case '#RAR':
            this.parseBookingYear(tokens, doc);
            break;
          case '#IB':
          case '#UB':
          case '#RES':
            this.parseBalance(tokens, tag, doc);
            break;
          case '#OIB':
          case '#OUB':
            this.parseObjectBalance(tokens, tag, doc);
            break;
          case '#PSALDO':
          case '#PRES':
            this.parsePeriodValue(tokens, doc);
            break;
          case '#VER': {
            const { voucher, linesConsumed } = this.parseVoucherBlock(tokens, lines, i, doc);
            i += linesConsumed;
            if (voucher) {
              if (callbacks?.readVoucher) {
                if (callbacks.readVoucher(voucher) === false) {
                  return doc;
                }
              }
              doc.vouchers.push(voucher);
            }
            break;
          }
          // All other tags are silently dropped (matching C# behavior)
        }
      } catch (err) {
        doc.errors.push(`Error parsing line: ${line}. Error: ${(err as Error).message}`);
      }
    }

    return doc;
  }

  private parseAccount(tokens: string[], doc: SieDocument): void {
    if (tokens.length >= 3) {
      const acc = new SieAccount();
      acc.accountId = tokens[1];
      acc.name = tokens[2];
      if (tokens.length >= 4) acc.unit = tokens[3];
      doc.accounts.set(acc.accountId, acc);
    }
  }

  private parseAccountType(tokens: string[], doc: SieDocument): void {
    // #KTYP accountNo type  (T=Tillgång, S=Skuld, I=Intäkt, K=Kostnad)
    if (tokens.length >= 3) {
      const acc = doc.accounts.get(tokens[1]);
      if (acc) {
        acc.type = tokens[2] as SieAccountType;
      }
    }
  }

  private parseSruCode(tokens: string[], doc: SieDocument): void {
    // #SRU accountNo sruCode
    if (tokens.length >= 3) {
      const acc = doc.accounts.get(tokens[1]);
      if (acc) acc.sruCode = tokens[2];
    }
  }

  private parseDimension(tokens: string[], doc: SieDocument): void {
    if (tokens.length >= 3) {
      const dim = new SieDimension();
      dim.number = tokens[1];
      dim.name = tokens[2];
      doc.dimensions.push(dim);
    }
  }

  private parseObject(tokens: string[], doc: SieDocument): void {
    if (tokens.length >= 4) {
      const dim = doc.dimensions.find(d => d.number === tokens[1]);
      if (dim) {
        const obj = new SieObject();
        obj.dimensionNumber = tokens[1];
        obj.number = tokens[2];
        obj.name = tokens[3];
        dim.objects.set(obj.number, obj);
      }
    }
  }

  private parseBookingYear(tokens: string[], doc: SieDocument): void {
    if (tokens.length >= 4) {
      const year = new SieBookingYear();
      year.id = parseInt(tokens[1], 10);
      year.startDate = this.parseDate(tokens[2]);
      year.endDate = this.parseDate(tokens[3]);
      doc.bookingYears.push(year);
    }
  }

  private parseBalance(tokens: string[], tag: string, doc: SieDocument): void {
    // #IB/#UB/#RES yearNo accountNo balance [quantity]
    if (tokens.length >= 4) {
      const accountId = tokens[2];
      const acc = doc.accounts.get(accountId);
      if (acc) {
        const balance = parseFloat(tokens[3]);
        if (tag === '#IB') acc.openingBalance = balance;
        else if (tag === '#UB') acc.closingBalance = balance;
        else if (tag === '#RES') acc.result = balance;
        if (tokens.length >= 5) acc.quantity = parseFloat(tokens[4]);
      }
    }
  }

  private parseObjectBalance(tokens: string[], tag: string, doc: SieDocument): void {
    // #OIB/#OUB yearNo accountNo {dimNo objNo} balance
    if (tokens.length >= 5) {
      const objectText = this.stripBraces(tokens[3]);
      const parts = splitLine(objectText);
      if (parts.length >= 2) {
        const dimNo = parts[0];
        const objNo = parts[1];
        const dim = doc.dimensions.find(d => d.number === dimNo);
        if (dim) {
          const obj = dim.objects.get(objNo);
          if (obj) {
            const balance = parseFloat(tokens[4]);
            if (tag === '#OIB') obj.openingBalance = balance;
            else if (tag === '#OUB') obj.closingBalance = balance;
          }
        }
      }
    }
  }

  private parsePeriodValue(tokens: string[], doc: SieDocument): void {
    // #PSALDO yearNo period accountNo {objects} balance
    // Handle quirk: element 4 may contain "{objects} balance" as one token in some parsers
    const actual = this.normalizePsaldoTokens(tokens);
    if (actual.length >= 6) {
      const yearId = parseInt(actual[1], 10);
      const period = actual[2];
      const accountId = actual[3];
      const acc = doc.accounts.get(accountId);
      if (acc) {
        const year = doc.bookingYears.find(y => y.id === yearId) ?? null;
        const pv = new SiePeriodValue();
        pv.bookingYear = year;
        pv.period = period;
        pv.value = parseFloat(actual[5]);
        acc.periodValues.push(pv);
      }
    }
  }

  /**
   * Normalize PSALDO/PRES tokens, handling the quirk where element 4 may contain
   * "{objects} balance" concatenated without a separating split.
   */
  private normalizePsaldoTokens(tokens: string[]): string[] {
    if (tokens.length === 5 && tokens[4].includes(' ')) {
      const remaining = tokens[4];
      const braceEnd = remaining.indexOf('}');
      const normalized = tokens.slice(0, 4);
      if (braceEnd >= 0) {
        normalized.push(remaining.substring(0, braceEnd + 1));
        const rest = remaining.substring(braceEnd + 1).trim();
        if (rest) normalized.push(...rest.split(/\s+/).filter(Boolean));
      } else {
        normalized.push(...remaining.split(/\s+/).filter(Boolean));
      }
      return normalized;
    }
    return tokens;
  }

  private parseVoucherBlock(
    tokens: string[],
    lines: string[],
    startIdx: number,
    doc: SieDocument,
  ): { voucher: SieVoucher | null; linesConsumed: number } {
    if (tokens.length < 4) return { voucher: null, linesConsumed: 0 };

    const voucher = new SieVoucher();
    voucher.series = tokens[1];
    voucher.number = tokens[2];
    voucher.date = this.parseDate(tokens[3]);
    voucher.text = tokens.length > 4 ? tokens[4] : '';

    if (tokens.length > 5) {
      const regDate = this.tryParseDate(tokens[5]);
      if (regDate) {
        voucher.registrationDate = regDate;
        voucher.registrationSign = tokens.length > 6 ? tokens[6] : '';
      }
    }

    let consumed = 0;
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line ? line.trim() : '';
      consumed++;
      i++;

      if (trimmed === '}') break;
      if (trimmed === '{') continue;
      if (!trimmed) continue;

      const rowTokens = splitLine(line);
      if (rowTokens.length > 0) {
        const rowTag = rowTokens[0].toUpperCase();
        if (rowTag === '#TRANS' || rowTag === '#BTRANS' || rowTag === '#RTRANS') {
          const row = this.parseVoucherRow(rowTokens, voucher);
          if (row) voucher.rows.push(row);
        }
      }
    }

    return { voucher, linesConsumed: consumed };
  }

  private parseVoucherRow(tokens: string[], voucher: SieVoucher): SieVoucherRow | null {
    // Minimum valid: #TRANS accountNo {objects} amount
    if (tokens.length < 2) return null;

    const row = new SieVoucherRow();
    row.accountNumber = tokens[1];

    // Reconstruct remainder from index 2 to robustly handle {objects} and amount
    // Our splitLine keeps {…} as one token, but we join+resplit for safety with edge cases
    const flat = tokens.slice(2).join(' ');
    const braceStart = flat.indexOf('{');
    const braceEnd = flat.indexOf('}');

    let objectPart = '{}';
    let rest: string;

    if (braceStart >= 0 && braceEnd >= braceStart) {
      objectPart = flat.substring(braceStart, braceEnd + 1);
      const before = flat.substring(0, braceStart).trim();
      const after = flat.substring(braceEnd + 1).trim();
      rest = [before, after].filter(Boolean).join(' ');
    } else {
      // No braces — treat everything as amount and optional fields
      rest = flat;
    }

    const restParts = rest.split(/\s+/).filter(Boolean);
    if (restParts.length < 1) return null;

    row.amount = parseFloat(restParts[0]);

    // Optional: transactionDate, rowText, quantity
    if (restParts.length > 1) {
      const maybeDate = this.tryParseDate(restParts[1]);
      if (maybeDate) {
        row.transactionDate = maybeDate;
        row.rowText = restParts.length > 2 ? restParts.slice(2).join(' ') : '';
      } else {
        // restParts[1] might be text if no date
        row.transactionDate = voucher.date;
        row.rowText = restParts.slice(1).join(' ');
      }
    } else {
      row.transactionDate = voucher.date;
    }

    // Parse objects from the {dimNo objNo ...} block
    const objectText = objectPart.slice(1, -1).trim(); // strip { }
    if (objectText) {
      const objTokens = splitLine(objectText);
      for (let k = 0; k + 1 < objTokens.length; k += 2) {
        const obj = new SieObject();
        obj.dimensionNumber = objTokens[k];
        obj.number = objTokens[k + 1];
        row.objects.push(obj);
      }
    }

    return row;
  }

  private parseDate(str: string): Date {
    // yyyyMMdd format
    const y = parseInt(str.substring(0, 4), 10);
    const m = parseInt(str.substring(4, 6), 10) - 1;
    const d = parseInt(str.substring(6, 8), 10);
    return new Date(y, m, d);
  }

  private tryParseDate(str: string): Date | null {
    if (!str || str.length !== 8 || !/^\d{8}$/.test(str)) return null;
    return this.parseDate(str);
  }

  private stripBraces(text: string): string {
    return text.replace(/^\{/, '').replace(/\}$/, '');
  }
}

/**
 * Parse a SIE 4 file from disk, decoding CP437 bytes.
 */
export async function parseSie4File(filePath: string, callbacks?: SieCallbacks): Promise<SieDocument> {
  const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());
  return new SieTagParser().parse(buf, callbacks);
}
