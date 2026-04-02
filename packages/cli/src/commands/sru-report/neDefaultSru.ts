import type { SieDocument } from '@skattata/sie-core';

/**
 * K1 (forenklat arsbokslut) BAS account -> NE SRU code mapping.
 * Source: BAS Kontogruppen official NE_K1 mapping table (bas.se/sru/).
 * Checked in order -- first matching range wins.
 */
const NE_K1_MAP: ReadonlyArray<{ from: number; to: number; sru: string }> = [
  // Balance sheet -- Assets
  { from: 1000, to: 1099, sru: '7200' },  // B1: Intangible assets
  { from: 1100, to: 1129, sru: '7210' },  // B2: Buildings
  { from: 1130, to: 1149, sru: '7211' },  // B3: Land (non-depreciable)
  { from: 1150, to: 1179, sru: '7210' },  // B2: Land improvements
  { from: 1180, to: 1199, sru: '7211' },  // B3: WIP / prepayments
  { from: 1200, to: 1299, sru: '7212' },  // B4: Machinery & equipment
  { from: 1300, to: 1399, sru: '7213' },  // B5: Other fixed assets
  { from: 1400, to: 1499, sru: '7240' },  // B6: Inventory
  { from: 1500, to: 1599, sru: '7250' },  // B7: Accounts receivable
  { from: 1600, to: 1899, sru: '7260' },  // B8: Other receivables
  { from: 1900, to: 1999, sru: '7280' },  // B9: Cash and bank

  // Balance sheet -- Equity & Liabilities
  { from: 2000, to: 2099, sru: '7300' },  // B10: Equity
  // 2100-2199 (untaxed reserves) and 2200-2299 (provisions) are NOT used in K1.
  // If these accounts exist, they fall to missingCode with a warning.
  { from: 2300, to: 2399, sru: '7380' },  // B13: Loan debt
  { from: 2400, to: 2449, sru: '7382' },  // B15: Accounts payable
  { from: 2450, to: 2599, sru: '7383' },  // B16: Other liabilities
  { from: 2600, to: 2739, sru: '7381' },  // B14: Tax liabilities (VAT, payroll)
  { from: 2740, to: 2999, sru: '7383' },  // B16: Other liabilities

  // Income statement -- Revenue
  { from: 3000, to: 3099, sru: '7400' },  // R1: Sales (VAT-liable)
  { from: 3100, to: 3199, sru: '7401' },  // R2: VAT-exempt income
  { from: 3200, to: 3299, sru: '7402' },  // R3: Car/housing benefits
  // 3300-3499: Not in K1 chart. Left unmapped (falls to missingCode).
  { from: 3500, to: 3699, sru: '7400' },  // R1: Invoiced costs
  { from: 3700, to: 3899, sru: '7400' },  // R1: Discounts (default R1; K1 says R1/R2)
  { from: 3900, to: 3969, sru: '7400' },  // R1: Other operating income (default R1)
  { from: 3970, to: 3989, sru: '7401' },  // R2: Asset disposal gains, grants (explicitly R2 in K1)
  { from: 3990, to: 3999, sru: '7400' },  // R1: Remaining other income

  // Income statement -- Costs
  { from: 4000, to: 4999, sru: '7500' },  // R5: Goods, materials, services
  { from: 5000, to: 6999, sru: '7501' },  // R6: Other external costs
  { from: 7000, to: 7699, sru: '7502' },  // R7: Employee expenses

  // Income statement -- Depreciation (K1 specific account mapping)
  { from: 7700, to: 7799, sru: '7504' },  // R9: Depreciation buildings/land
  { from: 7800, to: 7819, sru: '7505' },  // R10: Depreciation intangibles
  { from: 7820, to: 7829, sru: '7504' },  // R9: Depreciation buildings
  { from: 7830, to: 7899, sru: '7505' },  // R10: Depreciation equipment
  { from: 7900, to: 7999, sru: '7504' },  // R9: Replacement funds etc.

  // Income statement -- Financial items
  { from: 8300, to: 8399, sru: '7403' },  // R4: Interest income
  { from: 8400, to: 8499, sru: '7503' },  // R8: Interest expenses
];

/**
 * Apply default NE K1 SRU codes to accounts that lack #SRU tags.
 * Existing #SRU tags are NEVER overwritten.
 * Returns the number of accounts that received a default code.
 */
export function applyDefaultNeSru(doc: SieDocument): number {
  let applied = 0;
  for (const [id, acc] of doc.accounts) {
    if (acc.sruCode) continue;
    const num = parseInt(id, 10);
    if (isNaN(num)) continue;
    const match = NE_K1_MAP.find(m => num >= m.from && num <= m.to);
    if (match) {
      acc.sruCode = match.sru;
      applied++;
    }
  }
  return applied;
}
