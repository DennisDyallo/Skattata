/**
 * Swedish VAT rates and their BAS account mappings.
 * Source: BAS kontoplan, CLAUDE.md moms field mapping.
 */
export interface VatAccounts {
  /** Output VAT account (sales side) */
  outputVat: string;
  /** Input VAT account (purchase side) */
  inputVat: string;
  /** Default revenue account for sales at this rate */
  revenueAccount: string;
}

export interface VatSplit {
  /** Amount excluding VAT */
  net: number;
  /** VAT amount */
  vat: number;
}

/**
 * Compute net and VAT from a VAT-inclusive total.
 * net = Math.round(total / (1 + rate) * 100) / 100
 * vat = total - net (ensures total is exact)
 */
export function computeVatSplit(total: number, rate: number): VatSplit {
  const net = Math.round((total / (1 + rate)) * 100) / 100;
  const vat = total - net; // exact: net is already rounded, no second round needed
  return { net, vat };
}

/**
 * Returns BAS account numbers for the given VAT rate (0.25, 0.12, 0.06, 0).
 * Throws for unsupported rates.
 */
export function vatAccountsForRate(rate: number): VatAccounts {
  const mapping: Record<number, VatAccounts> = {
    0.25: { outputVat: '2610', inputVat: '2640', revenueAccount: '3010' },
    0.12: { outputVat: '2620', inputVat: '2641', revenueAccount: '3011' },
    0.06: { outputVat: '2630', inputVat: '2642', revenueAccount: '3012' },
    0:    { outputVat: '',     inputVat: '',     revenueAccount: '3010' },
  };
  const result = mapping[rate];
  if (!result) {
    throw new Error(`Unsupported VAT rate: ${rate}. Use 0.25, 0.12, 0.06, or 0`);
  }
  return result;
}
