# Plan: NE Tax Adjustments, Moms DTD Validation, Blockers, Security

## Context

Skattata is production-ready for sole proprietors but the NE SRU output only auto-computes one tax adjustment field (R43/7714 schablonavdrag). The income-statement command already computes egenavgifter, rantefordelning, and expansionsfond values inline, but these don't flow into the SRU file output. Additionally, the moms XML output has no automated DTD validation test.

**Goal:** Connect existing tax calculations to NE SRU output, add DTD validation, address known blockers, run security review, then ship.

---

## Phase 1: NE Tax Adjustment Fields (R12-R48)

### 1A. Create shared `NeTaxCalculator.ts`

**New file:** `packages/cli/src/shared/NeTaxCalculator.ts`

Extract the enskild firma calculations currently inline in `income-statement/index.ts` (lines 82-157) into a reusable calculator class.

```typescript
export interface NeTaxResult {
  netIncome: number;
  capitalBase: number;                  // 2000-2999 opening balances, negated
  egenavgifter: number;                 // Math.trunc(netIncome * egenavgifterRate)
  schablonavdrag: number;               // Math.trunc(netIncome * schablonavdrag)
  rantefordelningPositive: number;      // capitalBase > 0: Math.trunc(capitalBase * rate)
  rantefordelningNegative: number;      // capitalBase < 0: Math.trunc(|capitalBase| * rate)
  expansionsfondBase: number;           // 2000-2099 equity change (closing - opening, negated)
}
```

**Single-pass calculation** over `doc.accounts`:
- 2000-2099: accumulate both `capitalBase` and `equityOpening/equityClosing` (expansionsfond range is subset of rantefordelning range)
- 2100-2999: accumulate `capitalBase` only
- Uses `IncomeStatementCalculator` for `netIncome`
- All amounts `Math.trunc()` per Swedish tax convention

### 1B. Refactor `income-statement/index.ts`

**Modified file:** `packages/cli/src/commands/income-statement/index.ts`

Replace lines 82-157 (inline enskild firma blocks) with calls to `NeTaxCalculator.calculate()`. Keep all display/console.log logic in the command file. Pure refactor -- identical output.

### 1C. Expand `sru-report/index.ts` computed entries

**Modified file:** `packages/cli/src/commands/sru-report/index.ts` (lines 150-163)

Replace the R43-only block with full NE tax adjustment computation:

| Field | SRU Code | Condition | Formula |
|-------|----------|-----------|---------|
| R41 | 7713 | netIncome > 0 | `Math.trunc(netIncome * egenavgifterRate)` |
| R43 | 7714 | netIncome > 0 | `Math.trunc(netIncome * schablonavdrag)` (already exists) |
| R30 | 7708 | capitalBase > 0 | `Math.trunc(capitalBase * rantefordelningPositive)` |
| R31 | 7607 | capitalBase < 0 | `Math.trunc(|capitalBase| * rantefordelningNegative)` |
| R36 | 7710 | expansionsfondBase > 0 | `Math.trunc(expansionsfondBase)` |
| R47 | 7630 | adjustedResult > 0 | surplus result |
| R48 | 7730 | adjustedResult < 0 | deficit result (absolute value) |

Each field skipped if SRU code already present in `result.entries` (respects existing `#SRU` tags).

`adjustedResult` = netIncome - schablonavdrag +/- rantefordelning - expansionsfond (the NE bottom line).

### 1D. Tests

**New file:** `packages/cli/tests/unit/neTaxCalculator.test.ts`
- Positive income: egenavgifter, schablonavdrag amounts
- Positive/negative/zero capitalBase: rantefordelning values
- Expansionsfond: equity change computation
- Zero/negative income: no tax fields

**Modified file:** `packages/cli/tests/e2e/enskild-firma.e2e.test.ts`
- `sru-report --form ne` on `skattata-test-rantefordelning.se`: verify `#UPPGIFT 7713`, `#UPPGIFT 7708 15920`, `#UPPGIFT 7630`
- `sru-report --form ne` on `skattata-test-rantefordelning-neg.se`: verify `#UPPGIFT 7607 1480`, no `7708`
- `sru-report --form ne` on `skattata-test-expansionsfond.se`: verify `#UPPGIFT 7710`
- Existing SRU tags not overwritten

---

## Phase 2: Moms XML DTD Validation

### 2A. Download DTD

**New file:** `packages/cli/tests/fixtures/eSKDUpload_6p0.dtd`

Download from `https://www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd`. Commit locally so tests don't depend on network.

### 2B. DTD validation e2e test

**New file:** `packages/cli/tests/e2e/moms-dtd-validation.e2e.test.ts`

Uses `Bun.spawnSync` to:
1. Generate XML via `moms --output-xml /tmp/test.xml --period YYYYMM`
2. Validate with `/usr/bin/xmllint --nonet --dtdvalid <local-dtd> <xml-file>`
3. Assert exit code 0

Test scenarios:
- Domestic-only (`skattata-test-moms-annual.se`)
- EU fields (`skattata-test-moms-eu.se`)
- Refund scenario (`skattata-test-moms-refund.se`)
- Period data (`skattata-test-moms-period.se`)
- 12-digit personnummer org number

**Note:** The generated XML has an inline DOCTYPE. `xmllint --dtdvalid <local>` overrides the SYSTEM identifier. Use `--nonet` to prevent network fetches. If conflict occurs, strip inline DOCTYPE before validation.

---

## Phase 3: Blocker Tests

### 3A. 3700-3969 R1 default

**Modified file:** `packages/cli/tests/unit/neDefaultSru.test.ts`
- Explicit test: accounts 3700, 3800, 3900, 3969 all map to `7400` (R1)

**Modified file:** `packages/cli/tests/e2e/enskild-firma.e2e.test.ts`
- E2E test: `sru-report --form ne` on `skattata-test-ne-no-sru.se` stderr contains `3700-3969` and `R1`

### 3B. 8000-8299 unmapped

Already tested as `missingCode` in `neDefaultSru.test.ts`. No code change — just verify coverage exists.

---

## Phase 4: Execution Pipeline

After implementation:
1. `bun test` — all tests pass (existing + new)
2. `bun run packages/cli/src/index.ts test-all ./sie_test_files` — 127/127
3. `/DevTeam` ship
4. `/security-review` of codebase and dependencies
5. If security changes needed: `/DevTeam` ship again
6. Commit, push, `/HandOff`

---

## Critical Files

| File | Action |
|------|--------|
| `packages/cli/src/shared/NeTaxCalculator.ts` | **Create** — shared tax calculation class |
| `packages/cli/src/commands/income-statement/index.ts` | **Modify** — refactor to use NeTaxCalculator |
| `packages/cli/src/commands/sru-report/index.ts` | **Modify** — expand computedEntries for R41/R30/R31/R36/R47/R48 |
| `packages/cli/tests/unit/neTaxCalculator.test.ts` | **Create** — unit tests for NeTaxCalculator |
| `packages/cli/tests/e2e/enskild-firma.e2e.test.ts` | **Modify** — add NE SRU adjustment + blocker tests |
| `packages/cli/tests/fixtures/eSKDUpload_6p0.dtd` | **Create** — local copy of Skatteverket DTD |
| `packages/cli/tests/e2e/moms-dtd-validation.e2e.test.ts` | **Create** — DTD validation e2e tests |
| `packages/cli/tests/unit/neDefaultSru.test.ts` | **Modify** — add 3700-3969 R1 explicit test |

## Reusable Code

- `IncomeStatementCalculator.calculate()` — already computes netIncome, reused inside NeTaxCalculator
- `getTaxRates(year)` / `getDefaultTaxYear()` — centralized rates, no duplication
- `SruFileOptions.computedEntries` — existing mechanism for injecting computed SRU fields
- `applyDefaultNeSru()` — unchanged, already handles account-to-SRU mapping
- E2E test pattern from `enskild-firma.e2e.test.ts` — `Bun.spawnSync` + assert stdout/stderr

## Verification

1. **Unit tests:** `bun test packages/cli/tests/unit/neTaxCalculator.test.ts`
2. **Refactor check:** `bun test packages/cli/tests/e2e/enskild-firma.e2e.test.ts` — all existing tests still pass
3. **New NE SRU fields:** Run `bun run packages/cli/src/index.ts sru-report --form ne --format sru sie_test_files/synthetic/skattata-test-rantefordelning.se` and verify `#UPPGIFT 7708 15920` appears
4. **DTD validation:** `bun test packages/cli/tests/e2e/moms-dtd-validation.e2e.test.ts`
5. **Full suite:** `bun test` (all tests) + `test-all ./sie_test_files` (127/127)
6. **Security:** `/security-review` pass
