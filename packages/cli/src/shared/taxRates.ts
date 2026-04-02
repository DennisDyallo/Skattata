export interface TaxRates {
  year: number;
  egenavgifterRate: number;        // 2025: 0.2897
  schablonavdrag: number;          // 2025: 0.25 (stable but included for completeness)
  rantefordelningPositive: number; // statslåneräntan + 6%
  rantefordelningNegative: number; // statslåneräntan + 1%
  expansionsfondRate: number;      // corporate tax rate
  pbb: number;                     // prisbasbelopp
  stateTaxThreshold: number;       // statlig inkomstskatt brytpunkt
  stateTaxRate: number;            // statlig inkomstskatt rate
}

const RATES: Record<number, TaxRates> = {
  2024: {
    year: 2024,
    egenavgifterRate: 0.2897,
    schablonavdrag: 0.25,
    rantefordelningPositive: 0.0774, // statslåneräntan 2023-11-30: 1.74% + 6%
    rantefordelningNegative: 0.0274, // 1.74% + 1%
    expansionsfondRate: 0.206,
    pbb: 57300,
    stateTaxThreshold: 598500,
    stateTaxRate: 0.20,
  },
  2025: {
    year: 2025,
    egenavgifterRate: 0.2897,
    schablonavdrag: 0.25,
    rantefordelningPositive: 0.0796, // statslåneräntan 2024-11-30: 1.96% + 6%
    rantefordelningNegative: 0.0296, // 1.96% + 1%
    expansionsfondRate: 0.206,
    pbb: 58800,
    stateTaxThreshold: 613900,
    stateTaxRate: 0.20,
  },
};

export function getDefaultTaxYear(): number {
  const current = new Date().getFullYear();
  if (RATES[current]) return current;
  // Fall back to the latest supported year
  return Math.max(...Object.keys(RATES).map(Number));
}

export function getTaxRates(taxYear: number): TaxRates {
  const rates = RATES[taxYear];
  if (!rates) {
    throw new Error(`Unsupported tax year: ${taxYear}. Supported: ${Object.keys(RATES).join(', ')}`);
  }
  return rates;
}
