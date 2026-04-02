import type { SieDocument } from '@skattata/sie-core';
import type { SieAccount } from '@skattata/sie-core';

export interface SruEntry {
  sruCode: string;
  totalAmount: number;
  accounts: { id: string; name: string; amount: number; field: 'closingBalance' | 'result' }[];
}

export interface SruReportResult {
  companyName: string;
  organizationNumber: string;
  sieType: number;
  yearId: number;
  entries: SruEntry[];
  missingCode: { id: string; name: string }[];
}

export class SruReportCalculator {
  calculate(doc: SieDocument, yearId = 0): SruReportResult {
    const map = new Map<string, SruEntry>();
    const missingCode: { id: string; name: string }[] = [];

    for (const [id, acc] of doc.accounts) {
      if (!acc.sruCode || acc.sruCode === '') {
        missingCode.push({ id, name: acc.name });
        continue;
      }

      const field = this.balanceField(acc, id);
      const raw = this.getAmount(acc, field, yearId);
      // SIE stores credits as negative (revenue=I, equity/liabilities=S).
      // SKV 269 expects positive amounts. Negate credit-balance accounts.
      const num = parseInt(id, 10);
      const isRevenue = acc.type === 'I' || (!acc.type && num >= 3000 && num <= 3999);
      const isEquityOrLiability = acc.type === 'S' || (!acc.type && num >= 2000 && num <= 2999);
      const shouldNegate = (isRevenue && field === 'result') || (isEquityOrLiability && field === 'closingBalance');
      const amount = shouldNegate ? -raw : raw;

      if (!map.has(acc.sruCode)) {
        map.set(acc.sruCode, { sruCode: acc.sruCode, totalAmount: 0, accounts: [] });
      }
      const entry = map.get(acc.sruCode)!;
      entry.accounts.push({ id, name: acc.name, amount, field });
      entry.totalAmount += amount;
    }

    return {
      companyName: doc.companyName,
      organizationNumber: doc.organizationNumber,
      sieType: doc.sieType,
      yearId,
      entries: [...map.values()].sort((a, b) => a.sruCode.localeCompare(b.sruCode)),
      missingCode,
    };
  }

  private balanceField(acc: SieAccount, id: string): 'closingBalance' | 'result' {
    if (acc.type === 'T' || acc.type === 'S') return 'closingBalance';
    if (acc.type === 'I' || acc.type === 'K') return 'result';
    const num = parseInt(id, 10);
    return num <= 2999 ? 'closingBalance' : 'result';
  }

  private getAmount(acc: SieAccount, field: string, yearId: number): number {
    const yr = acc.yearBalances.get(yearId);
    if (yr) return field === 'closingBalance' ? yr.closing : yr.result;
    return field === 'closingBalance' ? acc.closingBalance : acc.result;
  }
}
