/**
 * Swedish tax constants by year. Every value comes from an authoritative source.
 *
 * Sources:
 *   egenavgifterRate        Skatteverket "Belopp och procent {year}"
 *   schablonavdrag          Skatteverket "Belopp och procent {year}"
 *   rantefordelningPositive Riksgälden statslåneräntan (Nov 30 of year-1) + 6 pp
 *   rantefordelningNegative Riksgälden statslåneräntan (Nov 30 of year-1) + 1 pp
 *   expansionsfondRate      Bolagsskattesatsen (Skatteverket)
 *   pbb                     SCB prisbasbelopp
 *   stateTaxThreshold       Skatteverket skiktgräns (applied after grundavdrag, NOT brytpunkt)
 *   stateTaxRate            Skatteverket statlig inkomstskatt
 *
 * Full source registry: docs/SOURCES.md
 * Verification: run /verify-compliance or see Plans/compliance-audit-*.md
 */
export interface TaxRates {
  year: number;
  egenavgifterRate: number;        // Skatteverket — full rate (7 components)
  schablonavdrag: number;          // Skatteverket — simplified egenavgifter deduction
  rantefordelningPositive: number; // Riksgälden — statslåneräntan + 6 pp
  rantefordelningNegative: number; // Riksgälden — statslåneräntan + 1 pp
  expansionsfondRate: number;      // Skatteverket — bolagsskattesatsen
  pbb: number;                     // SCB — prisbasbelopp
  stateTaxThreshold: number;       // Skatteverket — skiktgräns (NOT brytpunkt)
  stateTaxRate: number;            // Skatteverket — statlig inkomstskatt
}

const RATES: Record<number, TaxRates> = {
  2024: {
    year: 2024,
    egenavgifterRate: 0.2897,        // Skatteverket
    schablonavdrag: 0.25,            // Skatteverket
    rantefordelningPositive: 0.0774, // Riksgälden: statslåneräntan 2023-11-30 = 1.74% + 6%
    rantefordelningNegative: 0.0274, // Riksgälden: 1.74% + 1%
    expansionsfondRate: 0.206,       // Bolagsskattesatsen (since 2021)
    pbb: 57300,                      // SCB prisbasbelopp 2024
    stateTaxThreshold: 598500,       // Skatteverket skiktgräns 2024
    stateTaxRate: 0.20,              // Skatteverket (since 2020)
  },
  2025: {
    year: 2025,
    egenavgifterRate: 0.2897,        // Skatteverket
    schablonavdrag: 0.25,            // Skatteverket
    rantefordelningPositive: 0.0796, // Riksgälden: statslåneräntan 2024-11-30 = 1.96% + 6%
    rantefordelningNegative: 0.0296, // Riksgälden: 1.96% + 1%
    expansionsfondRate: 0.206,       // Bolagsskattesatsen (since 2021)
    pbb: 58800,                      // SCB prisbasbelopp 2025
    stateTaxThreshold: 625800,       // Skatteverket skiktgräns 2025
    stateTaxRate: 0.20,              // Skatteverket (since 2020)
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
