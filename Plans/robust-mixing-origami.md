# Plan: 5 Production-Readiness Features

## Context

Skattata is ~80% production-ready for enskild firma Skatteverket filing. The 5-feature batch (egenavgifter SRU, EU moms, f-skatt, räntefördelning, INK2R/INK2S) is complete. **180 tests pass, 127/127 test-all.**

This plan addresses 5 features: a foundational tax rates module (Feature 0) plus 4 remaining gaps. Each feature runs via `/DevTeam` (Engineer+Reviewer cycle), dispatched in background.

---

## Execution Strategy

**Dependency graph:**
```
Feature 0 (Tax Rates Module)  ─── FIRST (all others depend on it)
         │
         ├─ Feature 1 (Period Filtering)  ─┐── parallel ──┌─ Feature 3 (Moms XML)
         │                                 │              │
         └─ Feature 2 (Expansionsfond)  ───┘ after F1     └─── Feature 4 (SNI Codes) after F3
```

**Run order:**
1. **Wave 0:** Feature 0 (shared tax rates) — must complete first, all features consume it
2. **Wave 1:** Feature 1 + Feature 3 in parallel (no file overlap)
3. **Wave 2:** Feature 2 after Feature 1 (both touch `income-statement/index.ts`)
4. **Wave 3:** Feature 4 after Feature 3 (depends on `MomsXmlWriter.ts` created in F3)

**Gate per feature:** `bun test` 0 fail, `test-all ./sie_test_files` 127/127, commit before next.

---

## Feature 0: Shared Tax Rates Module + `--tax-year` Global Option

**Goal:** Consolidate all yearly-changing tax constants into a single module keyed by tax year. Add `--tax-year <YYYY>` global option that selects the correct rate set. Refactor all existing commands to consume rates from this module instead of inline magic numbers.

**Problem:** 7+ magic numbers scattered across 3 files change yearly. If a user works on a 2024 file, all rates are wrong for 2024 with no way to fix it. Each rate is independently hardcoded, risking inconsistency.

**Changes:**

| File | Change |
|---|---|
| `packages/cli/src/shared/taxRates.ts` | **NEW.** Export `TaxRates` interface and `getTaxRates(taxYear: number): TaxRates` function. Contains rate sets for 2024 and 2025. Throws if unsupported year requested. |
| `packages/cli/src/index.ts` | Add `.option('--tax-year <YYYY>', 'Tax year for rate selection (default: current year)', String(new Date().getFullYear()))` as a global option on the program. Pass to subcommands via `program.opts()`. |
| `packages/cli/src/commands/f-skatt/FSkattCalculator.ts` | Remove `PBB_2025`, `STATE_TAX_THRESHOLD_2025`, `STATE_TAX_RATE`, `EGENAVGIFTER_SCHABLONAVDRAG` constants. Accept `TaxRates` as parameter. `calculateGrundavdrag` uses `rates.pbb`. |
| `packages/cli/src/commands/f-skatt/index.ts` | Import `getTaxRates`, pass to calculator. Remove hardcoded rate references. |
| `packages/cli/src/commands/income-statement/index.ts` | Replace inline `0.2897`, `0.0796`, `0.0296` with `rates.egenavgifterRate`, `rates.rantefordelningPositive`, `rates.rantefordelningNegative`. |
| `packages/cli/src/commands/sru-report/index.ts` | Replace inline `0.25` schablonavdrag with `rates.schablonavdrag`. |

**TaxRates interface:**
```typescript
export interface TaxRates {
  year: number;
  egenavgifterRate: number;        // 2025: 0.2897
  schablonavdrag: number;          // 2025: 0.25 (stable but included for completeness)
  rantefordelningPositive: number; // 2025: 0.0796 (statslåneräntan + 6%)
  rantefordelningNegative: number; // 2025: 0.0296 (statslåneräntan + 1%)
  expansionsfondRate: number;      // 2025: 0.206
  pbb: number;                     // 2025: 58800
  stateTaxThreshold: number;       // 2025: 613900
  stateTaxRate: number;            // 2025: 0.20
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

export function getTaxRates(taxYear: number): TaxRates {
  const rates = RATES[taxYear];
  if (!rates) {
    throw new Error(`Unsupported tax year: ${taxYear}. Supported: ${Object.keys(RATES).join(', ')}`);
  }
  return rates;
}
```

### Correctness Validation

**What makes it WRONG:**
- Rate values for 2024 or 2025 are incorrect (wrong statslåneränta, wrong PBB, wrong threshold)
- Existing test assertions break because rate values changed during refactor
- `--tax-year` not propagated to all commands that use rates
- Commands still using hardcoded constants instead of `TaxRates`

**What makes it RIGHT:**
- All existing tests pass unchanged (same default year = 2025 = same rates)
- `grep -r '0\.2897\|0\.0796\|0\.0296\|58800\|613900' packages/cli/src/commands/` returns zero hits (all migrated)
- Only `shared/taxRates.ts` contains rate values
- `--tax-year 2024` produces different f-skatt results than `--tax-year 2025` (PBB and threshold differ)
- Unsupported year (e.g., `--tax-year 2020`) → clear error message listing supported years

**Why:** Yearly-changing rates are the #1 source of incorrect tax calculations. A user filing for 2024 with 2025 rates gets wrong F-skatt instalments, wrong egenavgifter, wrong räntefördelning. Centralizing rates makes it impossible to update one rate and forget another.

**Evidence (test assertions):**
1. Existing e2e tests pass with no changes (default year = 2025)
2. `f-skatt --tax-year 2024` produces different `grundavdrag` than `--tax-year 2025` (PBB differs: 57300 vs 58800)
3. `f-skatt --tax-year 2020` → exit 1 with "Unsupported tax year" error
4. `grep -rn '0\.2897' packages/cli/src/commands/` → 0 results (all migrated to rates module)
5. `income-statement --enskild-firma --tax-year 2024` → uses 2024 egenavgifter rate

---

## Feature 1: Period Filtering for Balance Sheet + Income Statement

**Goal:** Add `--period YYYYMM` flag to `balance-sheet` and `income-statement` commands, using `#PSALDO`/`#PRES` data already parsed into `acc.periodValues`.

**Reference pattern:** `MomsCalculator.ts:25-27` — `acc.periodValues.find(p => p.period === period)?.value ?? 0`

**Changes:**

| File | Change |
|---|---|
| `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts` | Add `period?: string` param to `calculate()`. When set, use period lookup instead of `getYearValue()`. **Critical:** filter to `pv.objects.length === 0` to skip object-level PSALDO entries. Sign conventions unchanged. |
| `packages/cli/src/commands/income-statement/index.ts` | Add `.option('--period <YYYYMM>', 'Filter to single period')`. Validate format with `/^\d{6}$/`. Pass to calculator. Print period header when set. |
| `packages/cli/src/commands/balance-sheet/BalanceSheetCalculator.ts` | Add `period?: string` param. When set, use `periodValues.find()` for closing balance. **Must pass period to internal `IncomeStatementCalculator` call** (line 54-55). |
| `packages/cli/src/commands/balance-sheet/index.ts` | Add `.option('--period <YYYYMM>')`. Validate format. Pass to calculator. |
| `sie_test_files/synthetic/skattata-test-period-financial.se` | **NEW.** `#PSALDO` for 1930, 2081, 3010, 4010 for periods 202301 and 202304. Also `#UB`/`#RES` for year-level fallback + `#KONTO`/`#KTYP` declarations. |
| `packages/cli/tests/e2e/financial-statements.e2e.test.ts` | Add period tests (see correctness evidence below). |

**Synthetic test file design:**
```
#PSALDO 0 202301 1930 {} 80000.00     → balance-sheet --period 202301: totalAssets=80000
#PSALDO 0 202301 2081 {} -80000.00    → equity=80000 (negated)
#PSALDO 0 202301 3010 {} -50000.00    → revenue=50000 (negated credit)
#PSALDO 0 202301 4010 {} 30000.00     → COGS=30000
→ Expected: netIncome=20000, balanceDiff=0

#PSALDO 0 202304 1930 {} 120000.00    → balance-sheet --period 202304: totalAssets=120000
#PSALDO 0 202304 3010 {} -80000.00    → revenue=80000
#PSALDO 0 202304 4010 {} 50000.00     → COGS=50000
→ Expected: netIncome=30000
```

### Correctness Validation

**What makes it WRONG:**
- Silent zero output when SIE file has no `#PSALDO` data (user thinks report is valid when data is missing)
- Object-level `#PSALDO` entries (with `{1 "100"}`) matching before aggregate entries — must filter to `pv.objects.length === 0`
- `BalanceSheetCalculator` internal `IncomeStatementCalculator` call not receiving period — `netIncome` would come from year-level while balance sheet uses period-level
- Invalid period format accepted (e.g., `2023`, `january`, `20230101`)

**What makes it RIGHT:**
- Period-filtered income-statement `netIncome` matches expected value from synthetic test file
- Period-filtered balance-sheet `totalAssets` matches expected value
- When no `#PSALDO` data exists for the requested period, stderr contains a warning
- When no `#PSALDO` data exists in the file at all, stderr warns about missing period data
- Period format validated as exactly 6 digits (`/^\d{6}$/`)
- Sign conventions identical to year-level: revenue (3xxx) negated, costs as-is

**Why:** Period filtering is the mechanism for quarterly analysis. Silent zeros would cause users to believe they had no revenue in a quarter when the data simply wasn't exported.

**Evidence (test assertions):**
1. `income-statement --period 202301 --format json` → `netIncome ≈ 20000`
2. `balance-sheet --period 202301 --format json` → `totalAssets ≈ 80000`
3. `income-statement --period 202304 --format json` → `netIncome ≈ 30000`
4. `income-statement --period 999999` → stderr contains "no period data" or similar warning
5. `income-statement --period 202301` on a SIE file with no `#PSALDO` → stderr warns
6. `balance-sheet --period 202301 --format json` → `netIncome` matches period-filtered income (not year-level)
7. Invalid period format (e.g., `--period abc`) → exit code 1 with error message

---

## Feature 2: Expansionsfond

**Goal:** Add `--expansionsfond` flag to `income-statement --enskild-firma` showing expansion fund allocation potential.

**Tax rules (2025):**
- Expansion fund base = closing equity − opening equity (**2000-2099 only**, NOT 2100-2999 which are liabilities)
- Max allocation = positive expansion fund base
- Tax on allocation: `rates.expansionsfondRate` (0.206 for 2025) — driven by `--tax-year`
- Benefit: taxed at 20.6% instead of marginal personal income tax + egenavgifter (~55-60%)
- If base ≤ 0: no allocation possible

**Pattern to follow:** `income-statement/index.ts:62-103` (räntefördelning) — same structure: enskild firma only, computes from 2xxx account balances, displays after egenavgifter block.

**Changes:**

| File | Change |
|---|---|
| `packages/cli/src/commands/income-statement/index.ts` | Add `.option('--expansionsfond', 'Show expansion fund estimate — requires --enskild-firma')`. Use `rates.expansionsfondRate` from `getTaxRates()` (driven by `--tax-year`). Add warning if used without `--enskild-firma`. After räntefördelning block: compute closingEquity and openingEquity from **2000-2099** accounts, calculate base, max allocation, tax, show comparison with marginal tax. Include disclaimer: "Simplified estimate. Actual base involves adjustments per SKV blankett N6." |
| `sie_test_files/synthetic/skattata-test-expansionsfond.se` | **NEW.** IB 2081=-100000, UB 2081=-300000 (equity increase 200000). Revenue -500000, costs 300000. **Must also include a 2400 (liability) account** to verify it is NOT included in equity calculation. |
| `packages/cli/tests/e2e/enskild-firma.e2e.test.ts` | Tests per correctness evidence below. |

**Calculation (CORRECTED — 2000-2099 only, not 2000-2999):**
```typescript
const rates = getTaxRates(taxYear);  // driven by --tax-year global option

let closingEquity = 0, openingEquity = 0;
for (const [id, acc] of doc.accounts) {
  const num = parseInt(id, 10);
  if (num >= 2000 && num <= 2099) {   // ← NOT 2999! Liabilities excluded.
    const yr = acc.yearBalances.get(yearId);
    closingEquity += -(yr ? yr.closing : acc.closingBalance);
    openingEquity += -(yr ? yr.opening : acc.openingBalance);
  }
}
const expansionBase = closingEquity - openingEquity;
const tax = Math.trunc(Math.max(0, expansionBase) * rates.expansionsfondRate);
```

### Correctness Validation

**What makes it WRONG:**
- Including liabilities (2100-2999) in equity calculation — would massively overstate the expansion fund base
- Using `Math.round()` instead of `Math.trunc()` — inconsistent with codebase convention
- Not showing disclaimer — user might treat simplified calculation as authoritative
- Allowing negative allocation amounts
- Computing without `--enskild-firma` flag (aktiebolag cannot use expansionsfond)

**What makes it RIGHT:**
- Equity range is exactly 2000-2099 (matches `BalanceSheetCalculator` equity range)
- Tax = `Math.trunc(base * rate)` with rate defaulting to 0.206
- Negative/zero base → clear message "no allocation possible"
- Output includes disclaimer about simplified calculation
- Only activates with `--enskild-firma`
- Rate comes from `getTaxRates(taxYear).expansionsfondRate` — user controls via `--tax-year`

**Why:** The equity range bug (2000-2999 vs 2000-2099) would include supplier debts, tax liabilities, and VAT liabilities in the "equity" calculation, producing an expansion fund base hundreds of thousands of SEK higher than reality. This would cause users to over-allocate and face Skatteverket penalties.

**Evidence (test assertions):**
1. Synthetic file with IB 2081=-100000, UB 2081=-300000 → stdout contains "200000" (base) and "41200" (tax at 20.6%)
2. Synthetic file also has account 2440 (supplier debt) IB/UB → verify 2440 is NOT included in base calculation
3. Without `--enskild-firma` → stderr contains "requires"
4. Negative base (IB 2081=-300000, UB 2081=-100000) → stdout contains "no allocation" or similar
5. Output contains "estimate" or "simplified" disclaimer text
6. Rate driven by `--tax-year` (via `getTaxRates()`) — no separate `--expansion-rate` flag needed

---

## Feature 3: Moms XML Submission Format

**Goal:** Add `--output-xml <file>` to `moms` command generating XML for Skatteverket e-filing.

**IMPORTANT: This is a DRAFT format.** The exact Skatteverket XML schema is not confirmed. The output must be clearly labeled as draft/preview in CLI help text and in the XML output itself (as a comment).

**Design:** Hand-craft XML strings (like `SruFileWriter` builds flat-file lines).

**Changes:**

| File | Change |
|---|---|
| `packages/cli/src/commands/moms/MomsXmlWriter.ts` | **NEW.** Export `writeMomsXml(result: MomsResult, options: MomsXmlOptions): string`. XML escaping function for `&`, `<`, `>`, `"`. Amounts as truncated integers (consistent with SRU convention). Include `<!-- Draft format — verify against Skatteverket schema before submission -->` comment. |
| `packages/cli/src/commands/moms/index.ts` | Add `--output-xml <file>` and `--org-number <value>` options. When `--output-xml` set, require `--period` (exit with error if missing). `--org-number` falls back to `doc.organizationNumber` from SIE file. Validate org number with same `/^\d{10}$\|^\d{12}$/` regex as `InfoSruWriter`. |
| `packages/cli/tests/e2e/financial-statements.e2e.test.ts` | Tests per correctness evidence below. |

**MomsXmlWriter interface:**
```typescript
export interface MomsXmlOptions {
  orgNumber: string;
  period: string;
  companyName?: string;
  sniCode?: string;     // Prepared for Feature 4
}
```

**XML output structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Draft format — verify against Skatteverket schema before submission -->
<Momsdeklaration>
  <Organisationsnummer>5566547898</Organisationsnummer>
  <Period>202301</Period>
  <Foretag>Demo AB</Foretag>
  <Uppgifter>
    <Uppgift kod="05" belopp="100000" />
    <Uppgift kod="10" belopp="25000" />
    ...
  </Uppgifter>
</Momsdeklaration>
```

### Correctness Validation

**What makes it WRONG:**
- Malformed XML (unclosed tags, unescaped `&` in company names like "Svensson & Son AB")
- Amounts as decimals instead of truncated integers (inconsistent with SRU convention)
- Missing the "draft format" disclaimer — user submits to Skatteverket and it's rejected
- Requiring `--org-number` when it's available from the SIE file's `#ORGNR`
- Not including EU fields (20, 30, 31, 35, 36, 37) when EU transactions are present

**What makes it RIGHT:**
- Output is well-formed XML (parseable, properly escaped, single root element)
- All `MomsResult.fields` (including EU fields when present) appear as `<Uppgift>` elements
- Amounts are truncated integers matching `Math.trunc()` convention
- Company name with special chars (`&`, `<`, `>`) properly escaped
- `--org-number` is optional when SIE file has `#ORGNR`
- Missing `--period` with `--output-xml` → exit 1 with clear error
- Invalid org number → exit 1 with format guidance
- XML contains draft disclaimer comment

**Why:** Malformed XML would fail any automated import. The draft label prevents users from assuming Skatteverket will accept this format without verification.

**Evidence (test assertions):**
1. Write XML to temp file, read back, verify it contains `<?xml version=` and `</Momsdeklaration>`
2. Verify all field codes from `MomsResult` appear in XML (e.g., `kod="05"`, `kod="10"`)
3. Verify amounts are integers (no decimal points in `belopp` attributes)
4. Test with `--output-xml` but no `--period` → exit code 1, stderr contains "requires --period"
5. Test org number fallback: no `--org-number` flag + SIE file with `#ORGNR` → XML contains org number from file
6. Test invalid org number `--org-number 123` → exit code 1
7. Verify XML contains `Draft format` comment
8. Test with EU moms synthetic file → EU fields appear in XML

---

## Feature 4: SNI Code Support

**Goal:** Accept `--sni <code>` on relevant commands, validate format, include in output files.

**Changes:**

| File | Change |
|---|---|
| `packages/cli/src/shared/sniCodes.ts` | **NEW.** Export `validateSniCode(code: string): boolean` — accepts 5 digits (`/^\d{5}$/`). No lookup table — validation only. Descriptions belong in help text, not runtime code (avoids maintenance burden). |
| `packages/cli/src/commands/moms/index.ts` | Add `.option('--sni <code>', 'SNI industry code (5 digits, e.g. 62010)')`. Validate with `validateSniCode()`. Pass to `writeMomsXml()` options. SNI only included in XML output (not table/JSON — no effect without `--output-xml`). |
| `packages/cli/src/commands/moms/MomsXmlWriter.ts` | Include `<SNI>62010</SNI>` element when `sniCode` provided. |
| `packages/cli/src/commands/sru-report/index.ts` | Add `.option('--sni <code>', 'SNI industry code')`. Pass to `writeInfoSru()` options. |
| `packages/cli/src/commands/sru-report/InfoSruWriter.ts` | Add `sniCode?: string` to options. **Research whether `#SNI` is a valid info.sru tag before adding.** If not recognized by SKV 269, include as a comment instead (`* SNI: 62010`). |
| `packages/cli/tests/e2e/financial-statements.e2e.test.ts` | Tests per correctness evidence below. |

### Correctness Validation

**What makes it WRONG:**
- Rejecting valid 5-digit codes
- Accepting letters, 4-digit, or 6-digit codes without error
- Adding `#SNI` to info.sru if it's not a recognized SKV 269 tag (would cause Skatteverket rejection)
- SNI appearing in standard table/JSON moms output (clutters output when not writing XML)

**What makes it RIGHT:**
- `--sni 62010` accepted, `--sni 6201` rejected, `--sni abcde` rejected
- Invalid SNI → exit 1 with clear error showing expected format
- SNI appears in moms XML output when provided
- SNI does NOT appear when omitted (optional everywhere)
- info.sru inclusion gated on SKV 269 spec research

**Why:** SNI codes have a fixed 5-digit format (SNI 2007, based on NACE Rev. 2). Accepting invalid formats would produce files that fail import.

**Evidence (test assertions):**
1. `--sni 62010` with `--output-xml` → XML contains `<SNI>62010</SNI>`
2. `--sni 6201` → exit code 1, stderr contains format error
3. `--sni abcde` → exit code 1
4. Without `--sni` → XML does not contain `<SNI>` element
5. `--sni 62010` with `--output` on sru-report → verify info.sru contains SNI reference (format depends on research)

---

## Cross-Feature Concerns

### Magic Numbers — All Consolidated in Feature 0

All yearly-changing rates are consolidated into `shared/taxRates.ts` (Feature 0). After Feature 0, no command file contains hardcoded tax rates. The `--tax-year` global option selects the rate set.

| Constant | 2024 | 2025 | Source |
|---|---|---|---|
| Egenavgifter rate | 0.2897 | 0.2897 | Skatteverket yearly |
| Schablonavdrag | 0.25 | 0.25 | Stable |
| Räntefördelning positive | 0.0774 | 0.0796 | Statslåneräntan + 6% |
| Räntefördelning negative | 0.0274 | 0.0296 | Statslåneräntan + 1% |
| Expansionsfond rate | 0.206 | 0.206 | Corporate tax rate |
| PBB | 57300 | 58800 | SCB yearly |
| State tax threshold | 598500 | 613900 | Skatteverket yearly |
| State tax rate | 0.20 | 0.20 | Changed 2020 |

**Adding a new tax year:** Add one entry to the `RATES` record in `shared/taxRates.ts`. All commands automatically pick it up.

### Truncation Convention

All features must use `Math.trunc()` for amounts, per Swedish tax convention and codebase consistency.

### Warning Pattern

Use `console.warn()` (stderr) for all warnings. Never `console.log()` for warnings — it corrupts JSON output.

---

## Verification

After all 5 features:
```bash
bun test                                                    # 0 fail
bun run packages/cli/src/index.ts test-all ./sie_test_files # 127/127

# Feature 0: verify magic numbers migrated
grep -rn '0\.2897\|0\.0796\|0\.0296' packages/cli/src/commands/  # should return 0 hits
grep -rn '58800\|613900' packages/cli/src/commands/              # should return 0 hits

# Feature 0: tax year selection
bun run packages/cli/src/index.ts f-skatt sie_test_files/synthetic/skattata-test-f-skatt.se --municipality-rate 0.3265 --tax-year 2024
bun run packages/cli/src/index.ts f-skatt sie_test_files/synthetic/skattata-test-f-skatt.se --municipality-rate 0.3265 --tax-year 2025
# ↑ should produce different grundavdrag values (PBB 57300 vs 58800)
bun run packages/cli/src/index.ts f-skatt sie_test_files/synthetic/skattata-test-f-skatt.se --municipality-rate 0.3265 --tax-year 2020
# ↑ should exit 1 with "Unsupported tax year" error

# Feature 1 smoke test
bun run packages/cli/src/index.ts income-statement sie_test_files/synthetic/skattata-test-period-financial.se --period 202301 --format json
bun run packages/cli/src/index.ts balance-sheet sie_test_files/synthetic/skattata-test-period-financial.se --period 202301 --format json

# Feature 2 smoke test
bun run packages/cli/src/index.ts income-statement sie_test_files/synthetic/skattata-test-expansionsfond.se --enskild-firma --expansionsfond
bun run packages/cli/src/index.ts income-statement sie_test_files/synthetic/skattata-test-expansionsfond.se --enskild-firma --expansionsfond --tax-year 2024

# Feature 3 smoke test
bun run packages/cli/src/index.ts moms sie_test_files/synthetic/skattata-test-moms-annual.se --period 202301 --org-number 5566547898 --output-xml /tmp/moms.xml
cat /tmp/moms.xml  # verify well-formed XML with draft disclaimer

# Feature 4 smoke test
bun run packages/cli/src/index.ts moms sie_test_files/synthetic/skattata-test-moms-annual.se --sni 62010 --period 202301 --org-number 5566547898 --output-xml /tmp/moms-sni.xml
grep SNI /tmp/moms-sni.xml  # verify SNI element present
```
