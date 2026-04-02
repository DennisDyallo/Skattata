# Plan: Fix Financial Statement Calculations + Synthetic Test Vectors

> This plan fixes critical accounting correctness bugs, creates synthetic SIE test files with known expected outputs, and builds an E2E assertion suite verifiable end-to-end via the CLI.

---

## Context

Three calculators produce incorrect output due to Swedish BAS sign convention being mishandled. The balance sheet does not balance (fatal), the income statement uses the wrong field for P&L accounts, and the moms net VAT formula is inverted. Additionally, we have no synthetic SIE files with known expected outputs — all 127 test files come from external sources with unknown ground truth. This plan fixes the bugs and establishes verifiable test vectors.

---

## Root Cause Analysis

### Swedish BAS Sign Convention

In SIE files:
- **Asset accounts (1xxx):** DEBIT normal balance → `#UB` is **positive** when asset is present
- **Contra-asset accounts (e.g. 1219 accumulated depreciation):** CREDIT → `#UB` is **negative**
- **Equity/Liability accounts (2xxx):** CREDIT normal balance → `#UB` is **negative** in SIE
- **Exception:** Account 2640 (Ingående moms/Input VAT) is an ASSET → type T → positive `#UB`
- **Revenue accounts (3xxx):** CREDIT → `#RES` is **negative**
- **Cost accounts (4xxx–8xxx):** DEBIT → `#RES` is **positive**

The fundamental identity: `sum(all #UB values) = 0` when the P&L has been closed to equity.

---

## Bug 1: MomsCalculator — Net VAT formula inverted (CRITICAL)

**File:** `packages/cli/src/statements/MomsCalculator.ts`

**Current (WRONG):** `netVat = (val2610 + val2620 + val2630) - val2640`

With testWrite.se: val2610 = -485,650, val2640 = +1,090,775
→ Result: (-485,650) - 1,090,775 = **-1,576,425** (WRONG sign, wrong magnitude)

**Fix:**
```typescript
const netVat = -(val2610 + val2620 + val2630) - val2640;
```

This correctly computes: `|output VAT| - |input VAT|` = amount payable to Skatteverket.
Positive = you owe Skatteverket. Negative = Skatteverket owes you (refund).

The field display amounts (Math.abs) are already correct. Only `netVat` / Field 49 is wrong.

---

## Bug 2: BalanceSheetCalculator — Three problems (CRITICAL)

**File:** `packages/cli/src/statements/BalanceSheetCalculator.ts`

**Problem A:** 2xxx accounts stored as negative credit balances — calculator shows negative equity/liabilities. Must negate for display.

**Problem B:** Zero-balance accounts shown — real balansräkning omits zero lines.

**Problem C:** Uses account number range alone. Account 2640 (Ingående moms) is type T (asset) but lives in 2xxx. Without KTYP-awareness it gets placed in Liabilities.

**Fix:**
```typescript
for (const [id, acc] of doc.accounts) {
  const num = parseInt(id, 10);
  if (isNaN(num) || acc.closingBalance === 0) continue;  // skip zero-balance

  // Determine section using type tag first, then account range fallback
  const type = acc.type;
  const inAssetRange = num >= 1000 && num <= 1999;
  const inEquityRange = num >= 2000 && num <= 2099;
  const inLiabilityRange = num >= 2100 && num <= 2999;

  if (type === 'T' || (type === '' && inAssetRange)) {
    // Asset — shown as-is (positive = asset present)
    assets.accounts.push({ id, name: acc.name, balance: acc.closingBalance });
    assets.total += acc.closingBalance;
  } else if ((type === 'S' || type === '') && inEquityRange) {
    // Equity — negate (credit balance → positive equity)
    equity.accounts.push({ id, name: acc.name, balance: -acc.closingBalance });
    equity.total += -acc.closingBalance;
  } else if ((type === 'S' || type === '') && inLiabilityRange) {
    // Liability — negate (credit balance → positive liability)
    liabilities.accounts.push({ id, name: acc.name, balance: -acc.closingBalance });
    liabilities.total += -acc.closingBalance;
  }
}

// Årets resultat: add net income from income statement to equity
// Only add if not already captured in a 2099-type account
const incomeCalc = new IncomeStatementCalculator();
const incomeResult = incomeCalc.calculate(doc);
const netIncome = incomeResult.netIncome;

return {
  sections: [assets, equity, liabilities],
  totalAssets: assets.total,
  totalEquityAndLiabilities: equity.total + liabilities.total,
  netIncome,          // exposed so CLI can show Årets resultat
  balanceDiff: assets.total - (equity.total + liabilities.total + netIncome),
};
```

**In index.ts** after computing balance sheet:
- Show "Årets resultat: X" as a separate equity line
- Show `BALANCE CHECK: ✓ BALANCED` or `⚠ Difference: X SEK`

---

## Bug 3: IncomeStatementCalculator — Uses wrong field for P&L accounts (HIGH)

**File:** `packages/cli/src/statements/IncomeStatementCalculator.ts`

**Current (WRONG):**
```typescript
const value = acc.closingBalance !== 0 ? acc.closingBalance : acc.result;
```
For SIE 4 files, P&L accounts (3xxx–8xxx) may have a cumulative `closingBalance (#UB)` from all years. The period result (`#RES`) is what the income statement should show.

**Fix:** Prefer `result` for P&L accounts. Fall back to `closingBalance` only if `result === 0`.
```typescript
const value = acc.result !== 0 ? acc.result : acc.closingBalance;
```

**Display sign convention:** Revenue (3xxx) credit balances will be negative → negate for display:
```typescript
if (num >= 3000 && num <= 3999) {
  const displayValue = -value;  // negate: credit revenue → positive display
  revenue.accounts.push({ id, name: acc.name, balance: displayValue });
  revenue.total += displayValue;
}
// Costs (4xxx–8xxx): debit balances → already positive, show as-is
```

---

## Synthetic SIE Test Files

Create in `sie_test_files/synthetic/` with exact known expected outputs:

### File 1: `balanced_annual.se` — Minimal balanced balance sheet

```
#FLAGGA 0
#FORMAT PC8
#GEN 20240101
#SIETYP 1
#FNAMN "Test Balanced AB"
#ORGNR 556600-0001
#RAR 0 20230101 20231231
#KONTO 1930 "Bankkonto"
#KTYP 1930 T
#IB 0 1930 0.00
#UB 0 1930 150000.00
#KONTO 2081 "Aktiekapital"
#KTYP 2081 S
#IB 0 2081 0.00
#UB 0 2081 -100000.00
#KONTO 2099 "Årets resultat"
#KTYP 2099 S
#IB 0 2099 0.00
#UB 0 2099 -30000.00
#KONTO 2400 "Leverantörsskulder"
#KTYP 2400 S
#IB 0 2400 0.00
#UB 0 2400 -20000.00
```

**Expected CLI output:**
```bash
skattata balance-sheet balanced_annual.se --format json
```
```json
{ "totalAssets": 150000, "totalEquityAndLiabilities": 150000, "balanceDiff": 0 }
```
✓ **BALANCED**

### File 2: `income_statement.se` — P&L with known result

```
#FLAGGA 0
#FORMAT PC8
#GEN 20240101
#SIETYP 4
#FNAMN "Test Income AB"
#ORGNR 556600-0002
#RAR 0 20230101 20231231
#KONTO 3010 "Försäljning"
#KTYP 3010 I
#RES 0 3010 -100000.00
#KONTO 6010 "Lönekostnader"
#KTYP 6010 K
#RES 0 6010 60000.00
#KONTO 7010 "Avskrivningar"
#KTYP 7010 K
#RES 0 7010 20000.00
#KONTO 1930 "Bankkonto"
#KTYP 1930 T
#UB 0 1930 20000.00
#KONTO 2099 "Årets resultat"
#KTYP 2099 S
#UB 0 2099 -20000.00
```

**Expected CLI output:**
```bash
skattata income-statement income_statement.se --format json
```
```json
{ "grossProfit": 100000, "netIncome": 20000 }
```
(Revenue 100,000 − Wages 60,000 − Depreciation 20,000 = 20,000 net income)

### File 3: `moms_annual.se` — Known VAT amounts

```
#FLAGGA 0
#FORMAT PC8
#GEN 20240101
#SIETYP 1
#FNAMN "Test Moms AB"
#ORGNR 556600-0003
#RAR 0 20230101 20231231
#KONTO 3010 "Försäljning 25% moms"
#KTYP 3010 I
#UB 0 3010 -100000.00
#KONTO 2610 "Utgående moms 25%"
#KTYP 2610 S
#UB 0 2610 -25000.00
#KONTO 2640 "Ingående moms"
#KTYP 2640 T
#UB 0 2640 10000.00
```

**Expected CLI output:**
```bash
skattata moms moms_annual.se --format json
```
```json
{
  "fields": [
    { "code": "05", "amount": 100000 },
    { "code": "10", "amount": 25000 },
    { "code": "48", "amount": 10000 },
    { "code": "49", "amount": 15000 }
  ],
  "netVat": 15000
}
```
Field 49 = 15,000 (you owe Skatteverket 15,000 SEK — 25,000 output minus 10,000 input)

### File 4: `sru_report.se` — SRU codes with known grouped totals

```
#FLAGGA 0
#FORMAT PC8
#GEN 20240101
#SIETYP 1
#FNAMN "Test SRU AB"
#ORGNR 556600-0004
#RAR 0 20230101 20231231
#KONTO 1930 "Bankkonto"
#KTYP 1930 T
#SRU 1930 7281
#UB 0 1930 50000.00
#KONTO 2081 "Aktiekapital"
#KTYP 2081 S
#SRU 2081 7301
#UB 0 2081 -50000.00
#KONTO 3010 "Försäljning"
#KTYP 3010 I
#SRU 3010 7410
#RES 0 3010 -30000.00
#KONTO 3011 "Försäljning tjänster"
#KTYP 3011 I
#SRU 3011 7410
#RES 0 3011 -10000.00
```

**Expected CLI output:**
```bash
skattata sru-report sru_report.se --format json
```
SRU 7281 total = 50,000 (bank closing balance)
SRU 7301 total = 50,000 (equity, negated from -50,000)
SRU 7410 total = 40,000 (two revenue accounts summed, negated from -40,000)

### File 5: `moms_period.se` — PSALDO period for quarterly moms test

```
#FLAGGA 0
#FORMAT PC8
#GEN 20240101
#SIETYP 2
#FNAMN "Test Moms Period AB"
#ORGNR 556600-0005
#RAR 0 20230101 20231231
#KONTO 2610 "Utgående moms 25%"
#KTYP 2610 S
#PSALDO 0 202301 2610 {} -12500.00
#PSALDO 0 202304 2610 {} -15000.00
#KONTO 2640 "Ingående moms"
#KTYP 2640 T
#PSALDO 0 202301 2640 {} 5000.00
#PSALDO 0 202304 2640 {} 6000.00
```

**Expected CLI output:**
```bash
skattata moms moms_period.se --period 202301 --format json
```
```json
{ "fields": [{"code": "10", "amount": 12500}, {"code": "48", "amount": 5000}, {"code": "49", "amount": 7500}], "netVat": 7500 }
```

---

## E2E Financial Statement Test Suite

**New file:** `packages/cli/tests/e2e/financial-statements.e2e.test.ts`

Uses `Bun.spawnSync` to call CLI with `--format json` and asserts exact values:

```typescript
import { describe, test, expect } from 'bun:test';
import { resolve } from 'path';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');

function runCli(...args: string[]) {
  const result = Bun.spawnSync(['bun', 'run', CLI, ...args]);
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout.toString());
}

describe('balance-sheet', () => {
  test('balanced_annual.se: totalAssets === totalEquityAndLiabilities', () => {
    const data = runCli('balance-sheet', `${SYNTHETIC}/balanced_annual.se`, '--format', 'json');
    expect(data.totalAssets).toBe(150000);
    expect(data.totalEquityAndLiabilities).toBe(150000);
    expect(data.balanceDiff).toBe(0);
  });
});

describe('income-statement', () => {
  test('income_statement.se: netIncome = 20000', () => {
    const data = runCli('income-statement', `${SYNTHETIC}/income_statement.se`, '--format', 'json');
    expect(data.netIncome).toBe(20000);
    expect(data.grossProfit).toBeCloseTo(100000, 1);
  });
});

describe('moms', () => {
  test('moms_annual.se: Field 49 = 15000 (net payable)', () => {
    const data = runCli('moms', `${SYNTHETIC}/moms_annual.se`, '--format', 'json');
    const f49 = data.fields.find((f: any) => f.code === '49');
    expect(f49.amount).toBe(15000);
    expect(data.netVat).toBe(15000);
  });

  test('moms_period.se --period 202301: Field 49 = 7500', () => {
    const data = runCli('moms', `${SYNTHETIC}/moms_period.se`, '--period', '202301', '--format', 'json');
    const f49 = data.fields.find((f: any) => f.code === '49');
    expect(f49.amount).toBe(7500);
  });

  test('moms_period.se --period 202404 (no data): all fields 0', () => {
    const data = runCli('moms', `${SYNTHETIC}/moms_period.se`, '--period', '202404', '--format', 'json');
    expect(data.netVat).toBe(0);
  });
});

describe('sru-report', () => {
  test('sru_report.se: SRU 7410 = 40000 (two revenue accounts aggregated)', () => {
    const data = runCli('sru-report', `${SYNTHETIC}/sru_report.se`, '--format', 'json');
    const e7410 = data.entries.find((e: any) => e.sruCode === '7410');
    expect(e7410?.totalAmount).toBeCloseTo(40000, 1);
  });

  test('sru_report.se: SRU 7281 = 50000 (bank asset)', () => {
    const data = runCli('sru-report', `${SYNTHETIC}/sru_report.se`, '--format', 'json');
    const e7281 = data.entries.find((e: any) => e.sruCode === '7281');
    expect(e7281?.totalAmount).toBeCloseTo(50000, 1);
  });
});
```

---

## Files to Modify

| File | Change |
|---|---|
| `packages/cli/src/statements/BalanceSheetCalculator.ts` | Use KTYP for section placement; negate 2xxx for display; filter zeros; expose `netIncome` + `balanceDiff` |
| `packages/cli/src/statements/IncomeStatementCalculator.ts` | Prefer `result` over `closingBalance` for 3xxx–8xxx; negate revenue for display |
| `packages/cli/src/statements/MomsCalculator.ts` | Fix: `netVat = -(val2610+val2620+val2630) - val2640` |
| `packages/cli/src/index.ts` | balance-sheet command: show Årets resultat + BALANCED/⚠ check |

## Files to Create

| File | Content |
|---|---|
| `sie_test_files/synthetic/skattata-test-balanced-annual.se` | Synthetic balanced SIE 1 |
| `sie_test_files/synthetic/skattata-test-income-statement.se` | Synthetic SIE 4 with P&L |
| `sie_test_files/synthetic/skattata-test-moms-annual.se` | Synthetic SIE 1 with VAT |
| `sie_test_files/synthetic/skattata-test-sru-report.se` | Synthetic with SRU codes |
| `sie_test_files/synthetic/skattata-test-moms-period.se` | Synthetic SIE 2 with PSALDO |
| `packages/cli/tests/e2e/financial-statements.e2e.test.ts` | E2E assertions |

### Naming Convention for Synthetic Files

Prefix: `skattata-test-<purpose>.se`

Each file must include a comment header as the first line:
```
; skattata-test-balanced-annual.se | origin: synthetic | created: 2026-04-02 | purpose: verify balance sheet balances (totalAssets = totalEquityAndLiabilities)
```

The `;` prefix is ignored by the SIE parser (comment line convention). This allows:
- Deduplication against external internet sources when the file is found online
- Clear audit trail of which files are synthetic vs vendor-exported
- Purpose documentation for future test maintenance

---

## SIE File Taxonomy Summary

From inventorying all 127 files:

| Category | Count | Best file for testing |
|---|---|---|
| SIE Type 1 | 19 | `BokslutSIE1.se` (91 SRU codes) |
| SIE Type 2 | 14 | `Test2.SE` (PSALDO present) |
| SIE Type 3 | 11 | `Test3.SE` (100 SRU codes) |
| SIE Type 4 | 77 | `si.SI` (32 vouchers, Visma) |
| SIE Type 5 XML | 6 | `Sample.sie`, `SampleEntry2.sie` |
| Has SRU codes | 43 | Use for `sru-report` |
| Has PSALDO | 4 | MAMUT SIE 2/3, Test2/4 |
| Has vouchers | 28 | si.SI, Exempelbolaget, SIE_with_long... |
| Edge cases (blinfo) | 41 | BLBLOV_* files — deliberate errors |

**Gaps now filled by synthetic files:**
- Known-correct balanced balance sheet: `balanced_annual.se` ✓
- Known-correct income statement: `income_statement.se` ✓
- Known-correct moms amounts: `moms_annual.se` ✓
- Known-correct period moms: `moms_period.se` ✓
- Known-correct SRU aggregation: `sru_report.se` ✓

---

## Verification

```bash
# After implementing fixes and creating files:

# 1. Run E2E financial statement tests (must all pass)
bun test packages/cli/tests/e2e/financial-statements.e2e.test.ts

# 2. Run all existing tests (must remain 127/127, 146 unit pass)
bun test packages/sie-core
bun run packages/cli/src/index.ts test-all ./sie_test_files

# 3. Manual spot-check on a real file
bun run packages/cli/src/index.ts balance-sheet ./sie_test_files/Balanserad\ förlust.se
# → Expect: BALANCED (this file balances perfectly as confirmed)

# 4. Moms sign check
bun run packages/cli/src/index.ts moms ./sie_test_files/synthetic/moms_annual.se
# → Field 49 must be +15000 (positive = you owe Skatteverket), not negative
```

---

## Step 0: Rename ALL Existing SIE Test Files (before any calculator fixes)

Every single one of the 127 files gets renamed to the same naming convention — no exceptions. Original filename is preserved in the `;` comment header prepended to each file. Then `test-all` confirms the rename didn't break anything before touching calculator code.

### Uniform Naming Convention

**Pattern:** `<sietype>-<vendor>-<description>.<ext>`

- `sietype`: `sie1` / `sie2` / `sie3` / `sie4` / `sie4i` / `sie5` (from `#SIETYP` tag)
- `vendor`: lowercase vendor name from `#PROGRAM` tag (e.g. `visma`, `mamut`, `blinfo`, `magenta`, `softone`, `norstedts`, `bl`, `avendo`, `demo`)
- `description`: short kebab-case description of distinctive content (e.g. `full-vouchers`, `missing-voucher-date`, `tab-separated`, `imbalanced`, `utf8-errors`)
- `ext`: preserve original extension lowercased (`.se`, `.si`, `.sie`)

**Header line prepended to every file (first line):**
```
; original: <old-filename> | sietype: N | vendor: <vendor> | source: <blinfo/Sie4j|iCalcreator/Sie5Sdk|vendor-export|unknown>
```

**The SIE parser already handles `;` as a comment/ignore — this is safe.**

### Complete Rename Map (all 127 files)

Representative examples (agent must derive the full map from taxonomy):

| Old name | New name |
|---|---|
| `si.SI` | `sie4-visma-full-vouchers.si` |
| `Sie4.se` | `sie4-demo-company.se` |
| `Sie4.si` | `sie4i-demo-import.si` |
| `Sie3.se` | `sie3-demo-dimensions.se` |
| `Sie2.se` | `sie2-demo-psaldo.se` |
| `Sie1.se` | `sie1-visma-compact-tabs.se` |
| `testWrite.se` | `sie4-round-trip-test.se` |
| `testWrite1.se` | `sie4-round-trip-test-alt.se` |
| `Balanserad förlust.se` | `sie1-demo-balanced-loss.se` |
| `arsaldo_ovnbolag.se` | `sie1-demo-annual-balances.se` |
| `objektsaldo_ovnbolag.se` | `sie3-demo-object-balances.se` |
| `periodsaldo_ovnbolag.se` | `sie2-demo-period-balances.se` |
| `transaktioner_ovnbolag.se` | `sie4-demo-transactions.se` |
| `transaktioner_ovnbolag-bad-balance.se` | `sie4-demo-imbalanced.se` |
| `urval_ovnbolag.si` | `sie4i-demo-import-selection.si` |
| `CC2-foretaget.SE` | `sie3-avendo-cost-centers.se` |
| `CC3.SI` | `sie4i-avendo-import.si` |
| `Quotes_test.si` | `sie4i-demo-quotes-escapes.si` |
| `BokslutSIE1.se` | `sie1-demo-annual-closing.se` |
| `BokOrder.si` | `sie4i-demo-order-import.si` |
| `MAMUT_SIE1_EXPORT.SE` | `sie1-mamut-export.se` |
| `MAMUT_SIE2_EXPORT.SE` | `sie2-mamut-export.se` |
| `MAMUT_SIE3_EXPORT.SE` | `sie3-mamut-export.se` |
| `MAMUT_SIE4_EXPORT.SE` | `sie4-mamut-export.se` |
| `magenta_bokföring_SIE1.se` | `sie1-magenta-export.se` |
| `magenta_bokföring_SIE2.se` | `sie2-magenta-export.se` |
| `magenta_bokföring_SIE3.se` | `sie3-magenta-export.se` |
| `magenta_bokföring_SIE4E.se` | `sie4-magenta-export.se` |
| `magenta_bokföring_SIE4I.se` | `sie4i-magenta-import.se` |
| `BL0001_typ1.SE` | `sie1-bl-template.se` |
| `BL0001_typ2.SE` | `sie2-bl-template.se` |
| `BL0001_typ3.SE` | `sie3-bl-template.se` |
| `BL0001_typ4.SE` | `sie4-bl-template.se` |
| `BL0001_typ4I.SI` | `sie4i-bl-template.si` |
| `XE_SIE_1_20151125094750.SE` | `sie1-softone-xe.se` |
| `XE_SIE_2_20151125094903.SE` | `sie2-softone-xe.se` |
| `XE_SIE_3_20151125094952.SE` | `sie3-softone-xe.se` |
| `XE_SIE_4_20151125095119.SE` | `sie4-softone-xe.se` |
| `Norstedts%20Revision%20SIE%201.SE` | `sie1-norstedts-revision.se` |
| `Norstedts%20Bokslut%20SIE%201.se` | `sie1-norstedts-bokslut.se` |
| `Norstedts%20Bokslut%20SIE%204I.si` | `sie4i-norstedts-bokslut.si` |
| `Bokslut%20Norstedts%20SIE%204E.se` | `sie4-norstedts-bokslut.se` |
| `Dennis_20161004-20171231.se` | `sie4-dennis-fiscal-2016.se` |
| `Dennis_20180101-20181231.se` | `sie4-dennis-fiscal-2018.se` |
| `Dennis_20190101-20191231.se` | `sie4-dennis-fiscal-2019.se` |
| `Dennis_20200101-20201231.se` | `sie4-dennis-fiscal-2020.se` |
| `Dennis_20210101-20211231.se` | `sie4-dennis-fiscal-2021.se` |
| `Dennis_20220101-20221231.se` | `sie4-dennis-fiscal-2022.se` |
| `Test1.SE` | `sie1-blinfo-complete.se` |
| `Test2.SE` | `sie2-blinfo-complete.se` |
| `Test3.SE` | `sie3-blinfo-complete.se` |
| `Test4.SE` | `sie4-blinfo-complete.se` |
| `typ1.se` | `sie1-avendo-type.se` |
| `typ2.se` | `sie2-avendo-type.se` |
| `typ3.se` | `sie3-avendo-type.se` |
| `typ4.se` | `sie4-avendo-type.se` |
| `typ4si.si` | `sie4i-avendo-type.si` |
| `sie%203.SE` | `sie3-demo-alt.se` |
| `sie%204.SE` | `sie4-demo-alt.se` |
| `Sie%201+2.se` | `sie2-demo-combined.se` |
| `Sie%201.SE` | `sie1-demo.se` |
| `Sie%202.SE` | `sie2-demo.se` |
| `Sie%203%20+%204.se` | `sie4-demo-combined.se` |
| `Exempelbolaget_SIE_110322_B_33.si` | `sie4-visma-exempelbolaget.si` |
| `SIE_exempelfil.se` | `sie4-demo-example-file.se` |
| `SIE4 Exempelfil.SE` | `sie4-demo-example.se` |
| `SIE4_Exempelfil_med_underdim.SE` | `sie4-demo-subdimensions.se` |
| `SIE4%20Visma%20Anl%C3%A4ggningsregister.si` | `sie4i-visma-asset-register.si` |
| `SIE_with_long_voucher_series_number.SE` | `sie4-demo-long-series.se` |
| `SIE_with_missing_program_version.se` | `sie4-demo-no-program-version.se` |
| `SIE-fil%20fr%C3%A5n%20Visma%20Eget%20Aktiebolag%202010.se` | `sie4-visma-aktiebolag-2010.se` |
| `SIE-fil%20fr%C3%A5n%20Visma%20Enskild%20Firma%202010.se` | `sie4-visma-enskild-firma-2010.se` |
| `Testbolaget_Enskild_firma.SE` | `sie4-blinfo-enskild-firma.se` |
| `Transaktioner per Z-rapport.se` | `sie4-demo-z-report.se` |
| `Arousells_Visning_AB.SE` | `sie4-blinfo-arousells.se` |
| `live2011.se` | `sie4-demo-live-2011.se` |
| `L%C3%B6n.si` | `sie4i-demo-payroll.si` |
| `LON%20L%C3%B6nekörning.SI` | `sie4i-demo-payroll-run.si` |
| `FAKT.SI` | `sie4i-demo-invoice.si` |
| `HAS1_1412.se` | `sie1-has-2014.se` |
| `HAS2_1412.se` | `sie2-has-2014.se` |
| `HAS3_1412.se` | `sie3-has-2014.se` |
| `HAS4E_1412.Se` | `sie4-has-2014.se` |
| `HAS4i_1412.si` | `sie4i-has-2014.si` |
| `Sample.sie` | `sie5-icalcreator-sample.sie` |
| `SampleEntry.sie` | `sie5-icalcreator-entry.sie` |
| `SampleEntry2.sie` | `sie5-icalcreator-entry-2.sie` |
| `SampleEntry3.sie` | `sie5-icalcreator-entry-3.sie` |
| `SampleEntryExtension.sie` | `sie5-icalcreator-entry-extension.sie` |
| `SampleExtension.sie` | `sie5-icalcreator-extension.sie` |
| `SieWriterTest-result.si` | `sie4i-blinfo-writer-test.si` |
| `BLBLOV_SIE1.SE` | `sie1-blinfo-baseline.se` |
| `BLBLOV_SIE1_copy.SE` | `sie1-blinfo-baseline-copy.se` |
| `BLBLOV_SIE1_erroneous_leap_year.SE` | `sie1-blinfo-err-leap-year.se` |
| `BLBLOV_SIE1_file_is_read.SE` | `sie1-blinfo-file-read.se` |
| `BLBLOV_SIE2.SE` | `sie2-blinfo-baseline.se` |
| `BLBLOV_SIE2_UTF_8_with_errors.SE` | `sie2-blinfo-utf8-errors.se` |
| `BLBLOV_SIE2_UTF_8_with_multiple_errors.SE` | `sie2-blinfo-utf8-multi-errors.se` |
| `BLBLOV_SIE2_UTF_8_with_non_numeric_account_number.SE` | `sie2-blinfo-utf8-nonnumeric-account.se` |
| `BLBLOV_SIE3.SE` | `sie3-blinfo-baseline.se` |
| `BLBLOV_SIE3_UTF_8_with_vouchers.SE` | `sie3-blinfo-utf8-vouchers.se` |
| `BLBLOV_SIE4.SE` | `sie4-blinfo-baseline.se` |
| `BLBLOV_SIE4.SI` | `sie4i-blinfo-baseline.si` |
| `BLBLOV_SIE4_ISO_8859_15.SE` | `sie4-blinfo-iso8859.se` |
| `BLBLOV_SIE4_ISO_8859_15.SI` | `sie4i-blinfo-iso8859.si` |
| `BLBLOV_SIE4_UTF_8.SI` | `sie4i-blinfo-utf8.si` |
| `BLBLOV_SIE4_UTF_8_1.SE` | `sie4-blinfo-utf8.se` |
| `BLBLOV_SIE4_UTF_8_IMBALANCED.SI` | `sie4i-blinfo-utf8-imbalanced.si` |
| `BLBLOV_SIE4_UTF_8_MISSING_ACCOUNTS.SE` | `sie4-blinfo-utf8-missing-accounts.se` |
| `BLBLOV_SIE4_UTF_8_WITH_FAULTY_ADDRESS.SI` | `sie4i-blinfo-utf8-faulty-address.si` |
| `BLBLOV_SIE4_UTF_8_with_12_digit_cid.SI` | `sie4i-blinfo-utf8-12digit-cid.si` |
| `BLBLOV_SIE4_UTF_8_with_8-4_digit_cid.SI` | `sie4i-blinfo-utf8-8-4digit-cid.si` |
| `BLBLOV_SIE4_UTF_8_with_8_digit_account_number.SE` | `sie4-blinfo-utf8-8digit-account.se` |
| `BLBLOV_SIE4_UTF_8_with_critical_voucher_date_error.SI` | `sie4i-blinfo-utf8-critical-date-error.si` |
| `BLBLOV_SIE4_UTF_8_with_empty_voucher.SE` | `sie4-blinfo-utf8-empty-voucher.se` |
| `BLBLOV_SIE4_UTF_8_with_empty_voucher_date.SI` | `sie4i-blinfo-utf8-empty-voucher-date.si` |
| `BLBLOV_SIE4_UTF_8_with_erroneous_taxar.SE` | `sie4-blinfo-utf8-bad-taxar.se` |
| `BLBLOV_SIE4_UTF_8_with_erroneous_voucher_date.SI` | `sie4i-blinfo-utf8-bad-voucher-date.si` |
| `BLBLOV_SIE4_UTF_8_with_erroneous_voucher_numbers.SI` | `sie4i-blinfo-utf8-bad-voucher-numbers.si` |
| `BLBLOV_SIE4_UTF_8_with_errors.SE` | `sie4-blinfo-utf8-with-errors.se` |
| `BLBLOV_SIE4_UTF_8_with_faulty_transaction.SI` | `sie4i-blinfo-utf8-faulty-transaction.si` |
| `BLBLOV_SIE4_UTF_8_with_imbalanced_voucher.SE` | `sie4-blinfo-utf8-imbalanced-voucher.se` |
| `BLBLOV_SIE4_UTF_8_with_iso_voucher_date.SI` | `sie4i-blinfo-utf8-iso-voucher-date.si` |
| `BLBLOV_SIE4_UTF_8_with_missing_account_balance.SE` | `sie4-blinfo-utf8-missing-balance.se` |
| `BLBLOV_SIE4_UTF_8_with_missing_account_numbers.SE` | `sie4-blinfo-utf8-missing-account-numbers.se` |
| `BLBLOV_SIE4_UTF_8_with_missing_account_numbers_in_transaction.SI` | `sie4i-blinfo-utf8-missing-account-in-trans.si` |
| `BLBLOV_SIE4_UTF_8_with_missing_company_name.SI` | `sie4i-blinfo-utf8-missing-company.si` |
| `BLBLOV_SIE4_UTF_8_with_missing_sru_code.SE` | `sie4-blinfo-utf8-missing-sru.se` |
| `BLBLOV_SIE4_UTF_8_with_missing_voucher_date.SI` | `sie4i-blinfo-utf8-missing-voucher-date.si` |
| `BLBLOV_SIE4_UTF_8_with_missing_voucher_series.SE` | `sie4-blinfo-utf8-missing-voucher-series.se` |
| `BLBLOV_SIE4_UTF_8_with_non_numeric_account_number.SE` | `sie4-blinfo-utf8-nonnumeric-account.se` |
| `BLBLOV_SIE4_UTF_8_with_unparseable_taxar.SE` | `sie4-blinfo-utf8-unparseable-taxar.se` |
| `Balanserad förlust.se` | `sie1-demo-balanced-loss.se` |

After renaming ALL files: `bun run packages/cli/src/index.ts test-all ./sie_test_files` → must still show ≥127/127 pass.

---

## Execution — Parallel Streams

All streams launch simultaneously after Step 0 (rename) completes.

```
Stream A (Engineer-1):           Stream B (Engineer-2):           Stream C (Writer):
Fix MomsCalculator.ts            Fix IncomeStatementCalculator.ts  Create all 5 synthetic SIE files
  ↓ (isolated, no deps)            ↓ (isolated, no deps)             ↓ (pure file writes, no code)
done                             done                              done
```

**After Streams A+B+C complete → single engineer:**
- Fix BalanceSheetCalculator.ts (depends on IncomeStatementCalculator interface for `netIncome`)
- Create E2E test file `financial-statements.e2e.test.ts` (depends on synthetic files from Stream C)

**After all fixes → single Reviewer pass** over all changed files → commit.

Dependency map:
- Step 0 (rename): no deps, must complete FIRST before any code changes
- MomsCalculator: depends only on Step 0 → immediately parallelizable after rename
- IncomeStatementCalculator: depends only on Step 0 → immediately parallelizable
- Synthetic SIE files: depends only on Step 0 → immediately parallelizable
- BalanceSheetCalculator: waits for IncomeStatementCalculator interface stable
- E2E tests: waits for synthetic files + all calculator fixes
- Reviewer: waits for all engineer work
