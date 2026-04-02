import type { SieDocument, SieAccount } from '@skattata/sie-core';

export interface IncomeStatementSection {
  title: string;
  accounts: { id: string; name: string; balance: number }[];
  total: number;
}

export interface IncomeStatementResult {
  sections: IncomeStatementSection[];
  grossProfit: number;
  netIncome: number;
}

export class IncomeStatementCalculator {
  calculate(doc: SieDocument, yearId = 0): IncomeStatementResult {
    const revenue: IncomeStatementSection = { title: 'Revenue', accounts: [], total: 0 };
    const cogs: IncomeStatementSection = { title: 'Cost of Goods Sold', accounts: [], total: 0 };
    const opex: IncomeStatementSection = { title: 'Operating Expenses (5-6xxx, 7500-7699)', accounts: [], total: 0 };
    const personnel: IncomeStatementSection = { title: 'Personnel Costs (7000-7399)', accounts: [], total: 0 };
    const depreciation: IncomeStatementSection = { title: 'Depreciation (7400-7499, 7700-7899)', accounts: [], total: 0 };
    const financial: IncomeStatementSection = { title: 'Financial Items', accounts: [], total: 0 };

    for (const [id, acc] of doc.accounts) {
      const num = parseInt(id, 10);
      if (isNaN(num)) continue;

      const value = this.getYearValue(acc, yearId);
      if (value === 0) continue;

      if (num >= 3000 && num <= 3999) {
        const displayValue = -value;  // negate: credit revenue → positive display
        revenue.accounts.push({ id, name: acc.name, balance: displayValue });
        revenue.total += displayValue;
      } else if (num >= 4000 && num <= 4999) {
        cogs.accounts.push({ id, name: acc.name, balance: value });
        cogs.total += value;
      } else if ((num >= 5000 && num <= 6999) || (num >= 7500 && num <= 7699)) {
        // BAS R6: Övriga externa kostnader — external costs, leasing, consumables
        opex.accounts.push({ id, name: acc.name, balance: value });
        opex.total += value;
      } else if (num >= 7000 && num <= 7399) {
        // BAS R7: Personalkostnader — wages, social fees, pensions
        personnel.accounts.push({ id, name: acc.name, balance: value });
        personnel.total += value;
      } else if ((num >= 7400 && num <= 7499) || (num >= 7700 && num <= 7899)) {
        // BAS R9/R10: Avskrivningar — machinery (74xx), buildings/intangibles (77xx-78xx)
        depreciation.accounts.push({ id, name: acc.name, balance: value });
        depreciation.total += value;
      } else if (num >= 8000 && num <= 8999) {
        financial.accounts.push({ id, name: acc.name, balance: value });
        financial.total += value;
      }
    }

    const grossProfit = revenue.total - cogs.total;
    const netIncome = grossProfit - opex.total - personnel.total - depreciation.total - financial.total;

    return {
      sections: [revenue, cogs, opex, personnel, depreciation, financial],
      grossProfit,
      netIncome,
    };
  }

  private getYearValue(acc: SieAccount, yearId: number): number {
    const yr = acc.yearBalances.get(yearId);
    if (yr) return yr.result !== 0 ? yr.result : yr.closing;
    return acc.result !== 0 ? acc.result : acc.closingBalance;
  }
}
