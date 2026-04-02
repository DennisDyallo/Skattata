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

    const netVat = (out25 + out12 + out6) - inputVat;

    const fields: MomsField[] = [
      { code: '05', label: 'Taxable sales', amount: salesBase },
      { code: '10', label: 'Output VAT 25%', amount: out25 },
      { code: '11', label: 'Output VAT 12%', amount: out12 },
      { code: '12', label: 'Output VAT 6%', amount: out6 },
      { code: '48', label: 'Input VAT', amount: inputVat },
      { code: '49', label: 'Net VAT payable', amount: netVat },
    ];

    // EU fields — only included when non-zero EU-range accounts exist
    // Reverse charge VAT (2614-2615, 2645-2647) is already in domestic sums above
    const euAcquisitions = sumRange(4500, 4599);          // Field 20: EU purchases tax base (cost accounts, positive debit)
    const euSalesGoods = -sumRange(3100, 3199);           // Field 30: EU goods sales (revenue, negate credit)
    const euSalesServices = -sumRange(3300, 3399);        // Field 31: EU services sales (revenue, negate credit)
    const reverseChargePurchases = sumRange(4530, 4599);  // Field 35: reverse charge purchase base (subset of field 20)
    const reverseChargeOut = -sumRange(2614, 2619);       // Field 36: reverse charge output VAT (2614=25%, 2615=12%, 2616=6%)
    const reverseChargeIn = sumRange(2645, 2649);         // Field 37: reverse charge input VAT

    const hasEuTransactions = euAcquisitions !== 0 || euSalesGoods !== 0 || euSalesServices !== 0
      || reverseChargePurchases !== 0 || reverseChargeOut !== 0 || reverseChargeIn !== 0;

    if (hasEuTransactions) {
      fields.push(
        { code: '20', label: 'EU acquisitions', amount: euAcquisitions },
        { code: '30', label: 'EU sales of goods', amount: euSalesGoods },
        { code: '31', label: 'EU sales of services', amount: euSalesServices },
        { code: '35', label: 'Reverse charge purchases', amount: reverseChargePurchases },
        { code: '36', label: 'Reverse charge output VAT', amount: reverseChargeOut },
        { code: '37', label: 'Reverse charge input VAT', amount: reverseChargeIn },
      );
      warnings.push('EU transactions detected. Reverse charge VAT (2614-2615, 2645-2647) is included in both domestic and EU-specific fields.');
    }

    // Warn if 3100-3199 accounts have balances beyond what EU sales (field 30) covers
    let hasExemptRange = false;
    for (const [id] of doc.accounts) {
      const num = parseInt(id, 10);
      if (num >= 3100 && num <= 3199) { hasExemptRange = true; break; }
    }
    if (hasExemptRange && (!hasEuTransactions || euSalesGoods !== salesBase)) {
      warnings.push('Note: field 05 includes all 3xxx accounts. Manually exclude VAT-exempt revenue (3100-3199) if applicable (sjukvard, utbildning).');
    }

    return { period, fields, netVat, warnings };
  }
}
