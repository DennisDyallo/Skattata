import type { SieDocument } from '@skattata/sie-core';
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

// Prisbasbelopp for tax year 2025
const PBB_2025 = 58800;
// State income tax threshold (statlig inkomstskatt brytpunkt) 2025
const STATE_TAX_THRESHOLD_2025 = 613900;
const STATE_TAX_RATE = 0.20;

/**
 * Grundavdrag (basic deduction) for persons under 66, based on prisbasbelopp.
 * Formula from inkomstskattelagen 63 kap, applicable for tax year 2025 (PBB=58800).
 * The bracket structure (as PBB multiples) is stable across years; only PBB changes.
 */
function calculateGrundavdrag(taxableIncome: number, pbb = PBB_2025): number {
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
    yearId = 0,
    grundavdragOverride?: number,
  ): FSkattResult {
    const incomeResult = new IncomeStatementCalculator().calculate(doc, yearId);
    const businessProfit = incomeResult.netIncome;

    // Egenavgifter deduction: 25% schablonavdrag (same as NE-bilaga R43)
    const egenavgifterDeduction = Math.max(0, Math.trunc(businessProfit * 0.25));

    const incomeAfterEgenavgifter = businessProfit - egenavgifterDeduction;

    // Grundavdrag: use override if provided, else calculate from PBB formula
    const grundavdrag = grundavdragOverride ?? calculateGrundavdrag(Math.max(0, incomeAfterEgenavgifter));

    const taxableIncome = Math.max(0, incomeAfterEgenavgifter - grundavdrag);

    const municipalTax = Math.trunc(taxableIncome * municipalRate);
    const stateTax = Math.trunc(Math.max(0, taxableIncome - STATE_TAX_THRESHOLD_2025) * STATE_TAX_RATE);
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
      stateTaxThreshold: STATE_TAX_THRESHOLD_2025,
    };
  }
}
