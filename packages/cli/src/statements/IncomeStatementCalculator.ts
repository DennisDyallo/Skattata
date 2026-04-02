import type { SieDocument } from '@skattata/sie-core';

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
  calculate(doc: SieDocument): IncomeStatementResult {
    const revenue: IncomeStatementSection = { title: 'Revenue', accounts: [], total: 0 };
    const cogs: IncomeStatementSection = { title: 'Cost of Goods Sold', accounts: [], total: 0 };
    const operating: IncomeStatementSection = { title: 'Operating Expenses', accounts: [], total: 0 };
    const financial: IncomeStatementSection = { title: 'Financial Items', accounts: [], total: 0 };

    for (const [id, acc] of doc.accounts) {
      const num = parseInt(id, 10);
      if (isNaN(num)) continue;

      const value = acc.result !== 0 ? acc.result : acc.closingBalance;
      if (value === 0) continue;

      if (num >= 3000 && num <= 3999) {
        const displayValue = -value;  // negate: credit revenue → positive display
        revenue.accounts.push({ id, name: acc.name, balance: displayValue });
        revenue.total += displayValue;
      } else if (num >= 4000 && num <= 4999) {
        cogs.accounts.push({ id, name: acc.name, balance: value });
        cogs.total += value;
      } else if (num >= 5000 && num <= 7999) {
        operating.accounts.push({ id, name: acc.name, balance: value });
        operating.total += value;
      } else if (num >= 8000 && num <= 8999) {
        financial.accounts.push({ id, name: acc.name, balance: value });
        financial.total += value;
      }
    }

    const grossProfit = revenue.total - cogs.total;
    const netIncome = grossProfit - operating.total - financial.total;

    return {
      sections: [revenue, cogs, operating, financial],
      grossProfit,
      netIncome,
    };
  }
}
