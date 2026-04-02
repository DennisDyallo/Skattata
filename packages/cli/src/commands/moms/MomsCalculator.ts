import type { SieDocument } from '@skattata/sie-core';

export interface MomsField {
  code: string;
  label: string;
  amount: number;
}

export interface MomsResult {
  period?: string;
  fields: MomsField[];
  netVat: number;
  warnings: string[];
}

export class MomsCalculator {
  calculate(doc: SieDocument, period?: string): MomsResult {
    const warnings: string[] = [];

    const sumRange = (from: number, to: number): number => {
      let total = 0;
      for (const [id, acc] of doc.accounts) {
        const num = parseInt(id, 10);
        if (isNaN(num) || num < from || num > to) continue;
        if (period) {
          const pv = acc.periodValues.find(p => p.period === period);
          total += pv?.value ?? 0;
        } else {
          total += acc.closingBalance;
        }
      }
      return total;
    };

    // Output VAT — stored as negative credit balances in SIE -> negate for display
    const out25 = -sumRange(2610, 2619);  // SKV 4700 field 10
    const out12 = -sumRange(2620, 2629);  // SKV 4700 field 11
    const out6  = -sumRange(2630, 2639);  // SKV 4700 field 12
    // Input VAT — stored as positive debit balance
    const inputVat = sumRange(2640, 2669);  // SKV 4700 field 48

    // Taxable sales base — revenue stored as negative credit -> negate
    const salesBase = -sumRange(3000, 3999);  // SKV 4700 field 05

    // Warn if exempt-revenue accounts present
    let hasExempt = false;
    for (const [id] of doc.accounts) {
      const num = parseInt(id, 10);
      if (num >= 3100 && num <= 3199) { hasExempt = true; break; }
    }
    if (hasExempt) {
      warnings.push('Note: field 05 includes all 3xxx accounts. Manually exclude VAT-exempt revenue (3100-3199) if applicable (sjukvard, utbildning).');
    }

    const netVat = (out25 + out12 + out6) - inputVat;

    const fields: MomsField[] = [
      { code: '05', label: 'Taxable sales', amount: salesBase },
      { code: '10', label: 'Output VAT 25%', amount: out25 },
      { code: '11', label: 'Output VAT 12%', amount: out12 },
      { code: '12', label: 'Output VAT 6%', amount: out6 },
      { code: '48', label: 'Input VAT', amount: inputVat },
      { code: '49', label: 'Net VAT payable', amount: netVat },
    ];

    return { period, fields, netVat, warnings };
  }
}
