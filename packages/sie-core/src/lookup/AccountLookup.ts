import type { SieDocument } from '../models/SieDocument.js';

export interface AccountInfo {
  id: string;
  name: string;
  type: string; // 'T' | 'S' | 'I' | 'K' | ''
}

function sortById(a: AccountInfo, b: AccountInfo): number {
  return parseInt(a.id, 10) - parseInt(b.id, 10);
}

export class AccountLookup {
  /** All accounts, sorted by id ascending. */
  all(doc: SieDocument): AccountInfo[] {
    const result: AccountInfo[] = [];
    for (const [id, acc] of doc.accounts) {
      result.push({ id, name: acc.name, type: acc.type });
    }
    return result.sort(sortById);
  }

  /** Case-insensitive substring search on account id and name. */
  search(doc: SieDocument, term: string): AccountInfo[] {
    const lower = term.toLowerCase();
    const result: AccountInfo[] = [];
    for (const [id, acc] of doc.accounts) {
      if (id.toLowerCase().includes(lower) || acc.name.toLowerCase().includes(lower)) {
        result.push({ id, name: acc.name, type: acc.type });
      }
    }
    return result.sort(sortById);
  }

  /** Accounts whose numeric id falls within [from, to] inclusive. */
  byRange(doc: SieDocument, from: number, to: number): AccountInfo[] {
    const result: AccountInfo[] = [];
    for (const [id, acc] of doc.accounts) {
      const numId = parseInt(id, 10);
      if (numId >= from && numId <= to) {
        result.push({ id, name: acc.name, type: acc.type });
      }
    }
    return result.sort(sortById);
  }

  /** Accounts of the given type code (T/S/I/K). */
  byType(doc: SieDocument, type: string): AccountInfo[] {
    const result: AccountInfo[] = [];
    for (const [id, acc] of doc.accounts) {
      if (acc.type === type) {
        result.push({ id, name: acc.name, type: acc.type });
      }
    }
    return result.sort(sortById);
  }
}
