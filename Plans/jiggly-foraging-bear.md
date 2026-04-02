# Plan: NE Default SRU Mapping — Eliminate #SRU Tag Dependency

## Context

A Swedish sole proprietor exports a SIE file from their bookkeeping software and runs `skattata sru-report --form ne --output ne.sru` to produce their NE-bilaga for Skatteverket. **Two problems block this workflow:**

1. **#SRU dependency** — If the SIE file lacks `#SRU` tags (common with basic accounting packages), the command exits with error. The sole proprietor is stuck.

2. **Incomplete NE form** — Even with #SRU tags, Skattata only passes through what the accounting software exported. It doesn't validate completeness against the NE field specification.

**The insight:** For NE K1 (förenklat årsbokslut — used by the vast majority of small sole proprietors), the BAS-to-SRU mapping is deterministic and standardized. We can derive it from account numbers.

**The elegant solution:** One mapping table, injected as a preprocessing step before the existing calculator. No calculator changes. Existing #SRU tags take precedence.

**Source:** Official BAS Kontogruppen mapping tables (`bas.se/sru/`, file `NE_K1-201002.xlsx`), cross-verified against `srufiler.se/ne`.

---

## Design

### New file: `packages/cli/src/commands/sru-report/neDefaultSru.ts`

A single exported function and mapping table:

```typescript
import type { SieDocument } from '@skattata/sie-core';

/**
 * K1 (förenklat årsbokslut) BAS account → NE SRU code mapping.
 * Source: BAS Kontogruppen official NE_K1 mapping table (bas.se/sru/).
 * Checked in order — first matching range wins.
 */
const NE_K1_MAP: ReadonlyArray<{ from: number; to: number; sru: string }> = [
  // Balance sheet — Assets
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

  // Balance sheet — Equity & Liabilities
  { from: 2000, to: 2099, sru: '7300' },  // B10: Equity
  // 2100-2199 (untaxed reserves) and 2200-2299 (provisions) are NOT used in K1.
  // If these accounts exist, they fall to missingCode with a warning.
  { from: 2300, to: 2399, sru: '7380' },  // B13: Loan debt
  { from: 2400, to: 2449, sru: '7382' },  // B15: Accounts payable
  { from: 2450, to: 2599, sru: '7383' },  // B16: Other liabilities
  { from: 2600, to: 2739, sru: '7381' },  // B14: Tax liabilities (VAT, payroll)
  { from: 2740, to: 2999, sru: '7383' },  // B16: Other liabilities

  // Income statement — Revenue
  { from: 3000, to: 3099, sru: '7400' },  // R1: Sales (VAT-liable)
  { from: 3100, to: 3199, sru: '7401' },  // R2: VAT-exempt income
  { from: 3200, to: 3299, sru: '7402' },  // R3: Car/housing benefits
  // 3300-3499: Not in K1 chart. Left unmapped (falls to missingCode).
  { from: 3500, to: 3699, sru: '7400' },  // R1: Invoiced costs
  { from: 3700, to: 3899, sru: '7400' },  // R1: Discounts (default R1; K1 says R1/R2)
  { from: 3900, to: 3969, sru: '7400' },  // R1: Other operating income (default R1)
  { from: 3970, to: 3989, sru: '7401' },  // R2: Asset disposal gains, grants (explicitly R2 in K1)
  { from: 3990, to: 3999, sru: '7400' },  // R1: Remaining other income

  // Income statement — Costs
  { from: 4000, to: 4999, sru: '7500' },  // R5: Goods, materials, services
  { from: 5000, to: 6999, sru: '7501' },  // R6: Other external costs
  { from: 7000, to: 7699, sru: '7502' },  // R7: Employee expenses

  // Income statement — Depreciation (K1 specific account mapping)
  { from: 7700, to: 7799, sru: '7504' },  // R9: Depreciation buildings/land
  { from: 7800, to: 7819, sru: '7505' },  // R10: Depreciation intangibles
  { from: 7820, to: 7829, sru: '7504' },  // R9: Depreciation buildings
  { from: 7830, to: 7899, sru: '7505' },  // R10: Depreciation equipment
  { from: 7900, to: 7999, sru: '7504' },  // R9: Replacement funds etc.

  // Income statement — Financial items
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
```

**Key design decisions:**
- **First-match-wins ordering** — Handles the 1130-1149/1150-1179 split for B2/B3
- **3700-3999 defaults to R1** — The K1 spec says "R1/R2" (accounting software decides). We default to VAT-liable (R1) since that's the common case for sole proprietors. A warning is emitted.
- **8xxx gaps** — Accounts 8000-8299, 8500-8989 are not mapped (unusual for K1). They'll appear in `missingCode` — that's correct, they represent unusual financial items that need manual classification.
- **Existing #SRU tags preserved** — `if (acc.sruCode) continue` ensures accounting software mappings always win.

### Changes to: `packages/cli/src/commands/sru-report/index.ts`

Insert the fallback logic between `parseFile()` and `SruReportCalculator().calculate()`:

```typescript
import { applyDefaultNeSru } from './neDefaultSru.js';

// After parseFile (line 65), before calculate (line 67):
if ((options.form ?? 'ink2r').toUpperCase() === 'NE') {
  const applied = applyDefaultNeSru(doc);
  if (applied > 0) {
    console.warn(`Note: Applied default NE K1 mapping to ${applied} account(s) missing #SRU tags.`);
    console.warn('  Mapping follows BAS Forenklat Arsbokslut (K1). Accounts 3700-3969 default to R1 (VAT-liable).');
  }
}
```

Always runs for NE form. The `if (acc.sruCode) continue` guard in `applyDefaultNeSru` ensures existing #SRU tags from the SIE file are never overwritten. Files with partial #SRU coverage get the gaps filled.

The existing NE validation (lines 70-90) then runs against the now-populated result. The `process.exit(1)` on empty entries becomes a true edge case (SIE file with zero accounts in any mapped range).

### No changes to:

- **SruReportCalculator.ts** — Unchanged. It already handles any accounts with `sruCode` set.
- **SruFileWriter.ts** — Unchanged. It already writes whatever entries the calculator produces.
- **InfoSruWriter.ts** — Unchanged.

---

## Test Plan

### New test file: `sie_test_files/synthetic/skattata-test-ne-no-sru.se`

A minimal SIE file for a sole proprietor with NO #SRU tags:

```
; purpose: verify NE K1 default SRU mapping when no #SRU tags present
#FLAGGA 0
#FORMAT PC8
#SIETYP 1
#FNAMN "Test Enskild Firma"
#ORGNR 198505151234
#RAR 0 20230101 20231231
#KONTO 1930 "Bankkonto"
#KTYP 1930 T
#UB 0 1930 80000.00
#KONTO 2010 "Eget kapital"
#KTYP 2010 S
#UB 0 2010 -30000.00
#KONTO 2440 "Leverantorsskulder"
#KTYP 2440 S
#UB 0 2440 -10000.00
#KONTO 3010 "Forsaljning"
#KTYP 3010 I
#RES 0 3010 -200000.00
#KONTO 4010 "Varuinkop"
#KTYP 4010 K
#RES 0 4010 50000.00
#KONTO 5010 "Lokalhyra"
#KTYP 5010 K
#RES 0 5010 30000.00
#KONTO 6200 "Tele och post"
#KTYP 6200 K
#RES 0 6200 5000.00
#KONTO 6500 "Ovriga tjanster"
#KTYP 6500 K
#RES 0 6500 15000.00
#KONTO 8310 "Ranteintakter"
#KTYP 8310 I
#RES 0 8310 -1000.00
```

Expected output with `--form ne --format json`:

**Sign convention:** `SruReportCalculator` only negates revenue (type I / 3xxx).
Equity and liability accounts return raw `closingBalance` (negative in SIE = credit balance).

- 7280 (B9, cash/bank): 80000 (asset, positive)
- 7300 (B10, equity): -30000 (raw closingBalance, NOT negated by calculator)
- 7382 (B15, AP): -10000 (raw closingBalance, NOT negated by calculator)
- 7400 (R1, sales): 200000 (revenue negated: -(-200000))
- 7500 (R5, goods): 50000 (cost, positive)
- 7501 (R6, external costs): 50000 (30000 + 5000 + 15000)
- 7403 (R4, interest income): 1000 (revenue negated: -(-1000))

Net income: 200000 + 1000 - 50000 - 30000 - 5000 - 15000 = 101000
Schablonavdrag: Math.trunc(101000 × 0.25) = 25250

### E2E test assertions

Add to `packages/cli/tests/e2e/enskild-firma.e2e.test.ts`:

```typescript
test('NE with no #SRU tags: default K1 mapping applied', () => {
  const data = runCli('sru-report', '--form', 'ne', '--format', 'json',
    `${SYNTHETIC}/skattata-test-ne-no-sru.se`);
  const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;

  // Balance sheet (equity/liabilities are raw SIE credit balances — negative)
  expect(entries.find(e => e.sruCode === '7280')?.totalAmount).toBeCloseTo(80000, 1);   // B9: asset
  expect(entries.find(e => e.sruCode === '7300')?.totalAmount).toBeCloseTo(-30000, 1);  // B10: equity (credit)
  expect(entries.find(e => e.sruCode === '7382')?.totalAmount).toBeCloseTo(-10000, 1);  // B15: AP (credit)

  // Income statement
  expect(entries.find(e => e.sruCode === '7400')?.totalAmount).toBeCloseTo(200000, 1); // R1
  expect(entries.find(e => e.sruCode === '7500')?.totalAmount).toBeCloseTo(50000, 1);  // R5
  expect(entries.find(e => e.sruCode === '7501')?.totalAmount).toBeCloseTo(50000, 1);  // R6
  expect(entries.find(e => e.sruCode === '7403')?.totalAmount).toBeCloseTo(1000, 1);   // R4
});

test('NE with no #SRU tags: 7714 still computed', () => {
  const data = runCli('sru-report', '--form', 'ne', '--format', 'sru',
    `${SYNTHETIC}/skattata-test-ne-no-sru.se`);
  // Check that 7714 appears in the SRU output
  const sruText = data as unknown as string; // sru format outputs raw text
  // ... assert 7714 present
});

test('NE with existing #SRU tags: defaults do not override', () => {
  // skattata-test-sru-report.se has #SRU tags — defaults must not change them
  const data = runCli('sru-report', '--form', 'ne', '--format', 'json',
    `${SYNTHETIC}/skattata-test-sru-report.se`);
  const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;
  expect(entries.find(e => e.sruCode === '7281')?.totalAmount).toBeCloseTo(50000, 1);
  expect(entries.find(e => e.sruCode === '7410')?.totalAmount).toBeCloseTo(40000, 1);
});
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/cli/src/commands/sru-report/neDefaultSru.ts` | **Create** — K1 mapping table + `applyDefaultNeSru()` |
| `packages/cli/src/commands/sru-report/index.ts` | **Modify** — Import and call `applyDefaultNeSru()` before calculator |
| `sie_test_files/synthetic/skattata-test-ne-no-sru.se` | **Create** — Test file with no #SRU tags |
| `packages/cli/tests/e2e/enskild-firma.e2e.test.ts` | **Modify** — Add E2E tests for default mapping |
| `packages/cli/tests/unit/neDefaultSru.test.ts` | **Create** — Unit tests for mapping function |
| `README.md` | **Modify** — Add "Who is this for" and "What this does NOT do" sections |
| `CLAUDE.md` | **Modify** — Document NE K1 default mapping in SRU System section |

---

## README Additions

Add two sections to `README.md`:

### Who is this for?

Skattata is built for **Swedish sole proprietors (enskild firma)** who use BAS-standard bookkeeping software (Fortnox, Visma, etc.) and want to generate their tax filings from a SIE export. It produces the financial data and declaration files — not a complete tax submission platform.

### What Skattata does NOT do

- **Submit to Skatteverket** — Skattata generates .sru and XML files in the correct formats. You upload them to Skatteverket's portal yourself.
- **Replace an accountant** — The tool automates calculations per BAS standards, but tax law has edge cases. Verify results before filing.
- **Handle employees** — Arbetsgivardeklaration (employer declarations) are not in scope.
- **Generate INK1** — Personal income tax (capital gains, rental income) is separate from business income.
- **Support K2/K3 NE mapping** — The default SRU mapping uses K1 (forenklat arsbokslut). Larger businesses using K2/K3 need #SRU tags from their accounting software.
- **Handle K10/K12 forms** — Partnership and corporation-specific forms are not supported.

---

## What This Does NOT Do

- **Non-K1 (K2/K3) mapping** — The 8xxx sign-dependent routing and R1/R2 VAT-status split make this complex. K1 covers the majority of sole proprietors. Non-K1 can be added later.
- **R11/7440 (net result) auto-computation** — Could compute from R1-R10 totals. Low priority since Skatteverket recalculates this field.
- **NE tax adjustment fields (R12-R48)** — These require manual input (räntefördelning, periodiseringsfond, expansionsfond). The income-statement command already calculates these, but connecting them to SRU codes is a separate feature.

---

## Verification

```bash
# 1. Existing tests still pass
bun test packages/cli

# 2. No #SRU file gets default mapping
bun run packages/cli/src/index.ts sru-report --form ne --format json \
  sie_test_files/synthetic/skattata-test-ne-no-sru.se

# 3. Existing #SRU file unchanged
bun run packages/cli/src/index.ts sru-report --form ne --format json \
  sie_test_files/synthetic/skattata-test-sru-report.se

# 4. SRU file output
bun run packages/cli/src/index.ts sru-report --form ne --output /tmp/ne.sru \
  sie_test_files/synthetic/skattata-test-ne-no-sru.se --org-number 198505151234
cat /tmp/ne.sru

# 5. Full test suite
bun test && bun run packages/cli/src/index.ts test-all ./sie_test_files
```
