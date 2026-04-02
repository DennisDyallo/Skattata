import type { SieDocument } from '@skattata/sie-core';
import type { TaxRates } from '../../shared/taxRates.js';
import { IncomeStatementCalculator } from '../income-statement/IncomeStatementCalculator.js';

export interface FSkattResult {
  businessProfit: number;
  egenavgifterDeduction: number;
  grundavdrag: number;
  taxableIncome: number;
  municipalTax: number;
  stateTax: number;
  totalAnnualTax: number;
  monthlyInstalment: number;
  municipalRate: number;
  stateTaxThreshold: number;
}

/**
 * Grundavdrag (basic deduction) for persons under 66, based on prisbasbelopp.
 * Formula from inkomstskattelagen 63 kap.
 * The bracket structure (as PBB multiples) is stable across years; only PBB changes.
 */
function calculateGrundavdrag(taxableIncome: number, pbb: number): number {
  const inPbb = taxableIncome / pbb;

  let grundavdrag: number;
  if (inPbb <= 0.99) {
    grundavdrag = 0.423 * pbb;
  } else if (inPbb <= 2.72) {
    grundavdrag = 0.423 * pbb + 0.20 * (taxableIncome - 0.99 * pbb);
  } else if (inPbb <= 3.11) {
    grundavdrag = 0.770 * pbb;
  } else if (inPbb <= 7.88) {
    grundavdrag = 0.770 * pbb - 0.10 * (taxableIncome - 3.11 * pbb);
  } else {
    grundavdrag = 0.293 * pbb;
  }

  // Round to nearest 100 SEK (Skatteverket convention)
  return Math.round(grundavdrag / 100) * 100;
}

export class FSkattCalculator {
  calculate(
    doc: SieDocument,
    municipalRate: number,
    rates: TaxRates,
    yearId = 0,
    grundavdragOverride?: number,
  ): FSkattResult {
    const incomeResult = new IncomeStatementCalculator().calculate(doc, yearId);
    const businessProfit = incomeResult.netIncome;

    // Egenavgifter deduction: schablonavdrag (simplified)
    const egenavgifterDeduction = Math.max(0, Math.trunc(businessProfit * rates.schablonavdrag));

    const incomeAfterEgenavgifter = businessProfit - egenavgifterDeduction;

    // Grundavdrag: use override if provided, else calculate from PBB formula
    const grundavdrag = grundavdragOverride ?? calculateGrundavdrag(Math.max(0, incomeAfterEgenavgifter), rates.pbb);

    const taxableIncome = Math.max(0, incomeAfterEgenavgifter - grundavdrag);

    const municipalTax = Math.trunc(taxableIncome * municipalRate);
    const stateTax = Math.trunc(Math.max(0, taxableIncome - rates.stateTaxThreshold) * rates.stateTaxRate);
    const totalAnnualTax = municipalTax + stateTax;
    const monthlyInstalment = Math.trunc(totalAnnualTax / 12);

    return {
      businessProfit,
      egenavgifterDeduction,
      grundavdrag,
      taxableIncome,
      municipalTax,
      stateTax,
      totalAnnualTax,
      monthlyInstalment,
      municipalRate,
      stateTaxThreshold: rates.stateTaxThreshold,
    };
  }
}
