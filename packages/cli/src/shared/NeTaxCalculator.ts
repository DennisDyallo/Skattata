import type { SieDocument } from '@skattata/sie-core';
import { IncomeStatementCalculator } from '../commands/income-statement/IncomeStatementCalculator.js';
import type { TaxRates } from './taxRates.js';

export interface NeTaxResult {
  netIncome: number;
  capitalBase: number;
  egenavgifter: number;
  schablonavdrag: number;
  taxBase: number;
  rantefordelningPositive: number;
  rantefordelningNegative: number;
  expansionsfondBase: number;
  expansionsfondTax: number;
  equityOpening: number;
  equityClosing: number;
}

export class NeTaxCalculator {
  calculate(doc: SieDocument, yearId: number, rates: TaxRates, period?: string): NeTaxResult {
    const incomeResult = new IncomeStatementCalculator().calculate(doc, yearId, period);
    const netIncome = incomeResult.netIncome;

    // Single pass: compute capitalBase (2000-2999) and equity (2000-2099)
    let capitalBase = 0;
    let equityOpening = 0;
    let equityClosing = 0;

    for (const [id, acc] of doc.accounts) {
      const num = parseInt(id, 10);
      if (isNaN(num) || num < 2000 || num > 2999) continue;

      const yr = acc.yearBalances.get(yearId);
      const opening = yr ? yr.opening : acc.openingBalance;
      capitalBase += -opening; // negate credit → positive equity

      if (num <= 2099) {
        const closing = yr ? yr.closing : acc.closingBalance;
        equityOpening += -opening;
        equityClosing += -closing;
      }
    }

    const egenavgifter = netIncome > 0 ? Math.trunc(netIncome * rates.egenavgifterRate) : 0;
    const schablonavdrag = netIncome > 0 ? Math.trunc(netIncome * rates.schablonavdrag) : 0;
    const taxBase = netIncome > 0 ? Math.trunc(netIncome * (1 - rates.schablonavdrag)) : 0;

    const rantefordelningPositive = capitalBase > 0
      ? Math.trunc(capitalBase * rates.rantefordelningPositive) : 0;
    const rantefordelningNegative = capitalBase < 0
      ? Math.trunc(Math.abs(capitalBase) * rates.rantefordelningNegative) : 0;

    const expansionsfondBase = Math.max(0, equityClosing - equityOpening);
    const expansionsfondTax = expansionsfondBase > 0
      ? Math.trunc(expansionsfondBase * rates.expansionsfondRate) : 0;

    return {
      netIncome,
      capitalBase: Math.trunc(capitalBase),
      egenavgifter,
      schablonavdrag,
      taxBase,
      rantefordelningPositive,
      rantefordelningNegative,
      expansionsfondBase: Math.trunc(expansionsfondBase),
      expansionsfondTax,
      equityOpening: Math.trunc(equityOpening),
      equityClosing: Math.trunc(equityClosing),
    };
  }
}
