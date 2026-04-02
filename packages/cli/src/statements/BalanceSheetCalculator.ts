import type { SieDocument } from '@skattata/sie-core';

export interface BalanceSheetSection {
  title: string;
  accounts: { id: string; name: string; balance: number }[];
  total: number;
}

export interface BalanceSheetResult {
  sections: BalanceSheetSection[];
  totalAssets: number;
  totalEquityAndLiabilities: number;
}

export class BalanceSheetCalculator {
  calculate(doc: SieDocument): BalanceSheetResult {
    const assets: BalanceSheetSection = { title: 'Assets', accounts: [], total: 0 };
    const equity: BalanceSheetSection = { title: 'Equity', accounts: [], total: 0 };
    const liabilities: BalanceSheetSection = { title: 'Liabilities', accounts: [], total: 0 };

    for (const [id, acc] of doc.accounts) {
      const num = parseInt(id, 10);
      if (isNaN(num)) continue;

      if (num >= 1000 && num <= 1999) {
        assets.accounts.push({ id, name: acc.name, balance: acc.closingBalance });
        assets.total += acc.closingBalance;
      } else if (num >= 2000 && num <= 2099) {
        equity.accounts.push({ id, name: acc.name, balance: acc.closingBalance });
        equity.total += acc.closingBalance;
      } else if (num >= 2100 && num <= 2999) {
        liabilities.accounts.push({ id, name: acc.name, balance: acc.closingBalance });
        liabilities.total += acc.closingBalance;
      }
    }

    return {
      sections: [assets, equity, liabilities],
      totalAssets: assets.total,
      totalEquityAndLiabilities: equity.total + liabilities.total,
    };
  }
}
