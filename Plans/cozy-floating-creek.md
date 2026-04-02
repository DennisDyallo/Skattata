# Plan: Resume 5-Feature Implementation (from handoff)

## Context

Resuming from handoff dated 2026-04-02. A prior session completed a production readiness assessment and created a detailed 5-feature plan (`Plans/robust-mixing-origami.md`) reviewed by Opus. No code was written — this session executes the plan.

**Current state:** 180 tests pass, 127/127 test-all, branch `main`, commit `67f898b`.

## Approach

Execute the 5 features from `Plans/robust-mixing-origami.md` in wave order, using `/DevTeam` (Engineer+Reviewer cycle) for each feature, run in background where parallelizable.

### Wave 0: Feature 0 — Shared Tax Rates Module
- Create `packages/cli/src/shared/taxRates.ts` with `TaxRates` interface and `getTaxRates(year)` function
- Add `--tax-year <YYYY>` global option to CLI
- Refactor all commands to consume rates from module (f-skatt, income-statement, sru-report)
- Gate: all existing 180 tests must pass unchanged, `grep` confirms zero hardcoded rates in commands

### Wave 1: Feature 1 + Feature 3 (parallel)
- **Feature 1:** `--period YYYYMM` for balance-sheet and income-statement using `#PSALDO` data
- **Feature 3:** `--output-xml` on moms command for Skatteverket XML draft format
- No file overlap — safe to parallelize

### Wave 2: Feature 2 — Expansionsfond
- `--expansionsfond` flag on income-statement `--enskild-firma`
- Critical: equity range 2000-2099 only (NOT 2000-2999)
- Uses `rates.expansionsfondRate` from Feature 0

### Wave 3: Feature 4 — SNI Codes
- `--sni <code>` validation (5 digits) on moms and sru-report
- Included in moms XML output (from Feature 3)

## Key Files to Modify

- `packages/cli/src/shared/taxRates.ts` (NEW)
- `packages/cli/src/index.ts` (global --tax-year option)
- `packages/cli/src/commands/f-skatt/FSkattCalculator.ts` + `index.ts`
- `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts` + `index.ts`
- `packages/cli/src/commands/balance-sheet/BalanceSheetCalculator.ts` + `index.ts`
- `packages/cli/src/commands/sru-report/index.ts`
- `packages/cli/src/commands/moms/MomsXmlWriter.ts` (NEW)
- `packages/cli/src/commands/moms/index.ts`
- `packages/cli/src/shared/sniCodes.ts` (NEW)
- Synthetic test files + e2e tests per feature

## Verification

Per feature gate: `bun test` 0 fail + `test-all 127/127` before moving to next wave.

Final verification: full smoke test suite from `Plans/robust-mixing-origami.md` verification section.

## Detailed Specs

All detailed specifications (interfaces, calculations, correctness validation, test assertions) are in `Plans/robust-mixing-origami.md` — that document is the authoritative reference for implementation.
