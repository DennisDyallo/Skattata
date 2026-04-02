import type { SieDocument } from '@skattata/sie-core';
import { IncomeStatementCalculator } from '../income-statement/IncomeStatementCalculator.js';

export interface BalanceSheetSection {
  title: string;
  accounts: { id: string; name: string; balance: number }[];
  total: number;
}

export interface BalanceSheetResult {
  sections: BalanceSheetSection[];
  totalAssets: number;
  totalEquityAndLiabilities: number;
  /** Net income from the income statement — informational only, NOT included in balanceDiff. */
  netIncome: number;
  /** assets.total − (equity.total + liabilities.total). 0 = balanced. Non-zero = may be unclosed P&L. */
  balanceDiff: number;
}

export class BalanceSheetCalculator {
  calculate(doc: SieDocument, yearId = 0): BalanceSheetResult {
    const assets: BalanceSheetSection = { title: 'Assets', accounts: [], total: 0 };
    const equity: BalanceSheetSection = { title: 'Equity', accounts: [], total: 0 };
    const liabilities: BalanceSheetSection = { title: 'Liabilities', accounts: [], total: 0 };

    for (const [id, acc] of doc.accounts) {
      const num = parseInt(id, 10);
      const closing = (() => {
        const yr = acc.yearBalances.get(yearId);
        return yr ? yr.closing : acc.closingBalance;
      })();
      if (isNaN(num) || closing === 0) continue;  // skip zero-balance

      const type = acc.type;
      const inAssetRange = num >= 1000 && num <= 1999;
      const inEquityRange = num >= 2000 && num <= 2099;
      const inLiabilityRange = num >= 2100 && num <= 2999;

      if (type === 'T' || (type === '' && inAssetRange)) {
        // Asset — shown as-is (positive = asset present)
        assets.accounts.push({ id, name: acc.name, balance: closing });
        assets.total += closing;
      } else if ((type === 'S' || type === '') && inEquityRange) {
        // Equity — negate (credit balance → positive equity display)
        equity.accounts.push({ id, name: acc.name, balance: -closing });
        equity.total += -closing;
      } else if ((type === 'S' || type === '') && inLiabilityRange) {
        // Liability — negate (credit balance → positive liability display)
        liabilities.accounts.push({ id, name: acc.name, balance: -closing });
        liabilities.total += -closing;
      }
    }

    const incomeCalc = new IncomeStatementCalculator();
    const incomeResult = incomeCalc.calculate(doc, yearId);
    const netIncome = incomeResult.netIncome;

    // Simple balance check: Assets = Equity + Liabilities.
    // For closed year-end files (2099 booked), balanceDiff = 0.
    // For in-year files (P&L not yet booked to 2099), balanceDiff shows the unreconciled income.
    const balanceDiff = assets.total - (equity.total + liabilities.total);

    return {
      sections: [assets, equity, liabilities],
      totalAssets: assets.total,
      totalEquityAndLiabilities: equity.total + liabilities.total,
      netIncome,
      balanceDiff,
    };
  }
}
