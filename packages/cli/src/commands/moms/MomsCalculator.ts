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
}

export class MomsCalculator {
  calculate(doc: SieDocument, period?: string): MomsResult {
    const getBalance = (accountId: string): number => {
      const acc = doc.accounts.get(accountId);
      if (!acc) return 0;

      if (period) {
        const pv = acc.periodValues.find(p => p.period === period);
        return pv?.value ?? 0;
      }

      return acc.closingBalance;
    };

    const val3010 = getBalance('3010');
    const val2610 = getBalance('2610');
    const val2620 = getBalance('2620');
    const val2630 = getBalance('2630');
    const val2640 = getBalance('2640');

    const netVat = -(val2610 + val2620 + val2630) - val2640;

    const fields: MomsField[] = [
      { code: '05', label: 'Taxable sales', amount: Math.abs(val3010) },
      { code: '10', label: 'Output VAT 25%', amount: Math.abs(val2610) },
      { code: '11', label: 'Output VAT 12%', amount: Math.abs(val2620) },
      { code: '12', label: 'Output VAT 6%', amount: Math.abs(val2630) },
      { code: '48', label: 'Input VAT', amount: Math.abs(val2640) },
      { code: '49', label: 'Net VAT payable', amount: netVat },
    ];

    return { period, fields, netVat };
  }
}
