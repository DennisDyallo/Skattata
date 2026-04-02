# Handoff — main

**Date:** 2026-04-02
**Branch:** main
**Last commit:** `67f898b` — feat: add INK2R/INK2S validation to sru-report command
**Uncommitted:** 5 new features implemented + documentation (ready to commit)
**Tests:** 180 pass / 0 fail | 127/127 test-all

---

## Session Summary

This session **executed the 5-feature implementation plan** from the prior session's production readiness assessment. All 5 features are implemented, tested, and documented. Documentation updated across CLAUDE.md, README.md, and CLI help text.

### What was done:

1. **Feature 0 — Shared Tax Rates Module** (`shared/taxRates.ts`)
   - Created `TaxRates` interface + `getTaxRates(year)` + `getDefaultTaxYear()`
   - Added `--tax-year <YYYY>` option to f-skatt, income-statement, sru-report
   - Refactored all hardcoded rates out of command files (verified: 0 grep hits)
   - Supports 2024 + 2025; defaults to latest supported year when current year unavailable

2. **Feature 1 — Period Filtering** (`--period YYYYMM`)
   - Added `--period` to `balance-sheet` and `income-statement` commands
   - Uses `#PSALDO` data with `objects.length === 0` filter (aggregate only)
   - `BalanceSheetCalculator` passes period to internal `IncomeStatementCalculator` call
   - Warns via stderr when SIE file has no `#PSALDO` data
   - Created synthetic test file: `skattata-test-period-financial.se`

3. **Feature 2 — Expansionsfond** (`--expansionsfond`)
   - Added to `income-statement --enskild-firma`
   - Equity range correctly limited to 2000-2099 (NOT 2100-2999 liabilities)
   - Uses `rates.expansionsfondRate` from tax rates module
   - Includes simplified estimate disclaimer
   - Created synthetic test file: `skattata-test-expansionsfond.se`

4. **Feature 3 — Moms XML** (`--output-xml <file>`)
   - Created `MomsXmlWriter.ts` with XML escaping and draft disclaimer
   - Requires `--period`; validates org number (10/12 digits, falls back to `#ORGNR`)
   - Amounts as truncated integers (`Math.trunc`)

5. **Feature 4 — SNI Codes** (`--sni <code>`)
   - Created `shared/sniCodes.ts` with 5-digit validation
   - Added to `moms` (included in XML output) and `sru-report` (comment in info.sru)

6. **Documentation**
   - CLAUDE.md: new files, updated test counts (180), 5 new feature sections, 2 new synthetic files
   - README.md: added f-skatt to command table, added cross-command options table
   - CLI help: all new options visible in `--help` for all affected commands

---

## Readiness Assessment

**Target:** Swedish sole proprietors (enskild firma) preparing tax declarations from SIE file exports.

| Need | Status | Notes |
|---|---|---|
| Parse any real-world SIE file | ✅ | 127/127; SIE 1-5, CP437, XML |
| Balance sheet with year selection | ✅ | yearId, multi-year |
| Balance sheet with period filtering | ✅ | `--period YYYYMM` via `#PSALDO` |
| Income statement with BAS sections | ✅ | Revenue/COGS/Opex/Personnel/Depreciation/Financial |
| Income statement with period filtering | ✅ | `--period YYYYMM` via `#PSALDO` |
| Egenavgifter estimate (display) | ✅ | Rate from tax rates module |
| Egenavgifter in NE SRU (R43/7714) | ✅ | Auto-computed, dedup-safe |
| Momsdeklaration (domestic + EU VAT) | ✅ | Range-based scan, EU auto-detect, fields 20-37 |
| Moms XML export (draft) | ✅ | `--output-xml`, draft disclaimer, XML-escaped |
| NE-bilaga SRU generation + validation | ✅ | Empty/revenue warnings, exit 1 on error |
| INK2R/INK2S SRU validation | ✅ | Balance sheet/P&L section checks |
| F-skatt preliminary tax | ✅ | PBB grundavdrag, municipal + state tax, monthly |
| Rantefordelning (interest allocation) | ✅ | Positive 7.96%, negative 2.96% (2025) |
| Expansionsfond estimate | ✅ | Equity 2000-2099 only, 20.6% rate |
| Shared tax rates + --tax-year | ✅ | 2024 + 2025 rates, centralized, zero magic numbers |
| SNI code support | ✅ | 5-digit validation, moms XML + info.sru |
| SKV 269 format compliance | ✅ | TAXAR, CRLF, FILNAMN, hard error on orgNr |

**Overall:** ⭐ Feature-complete for enskild firma tax filing workflows. All planned features implemented and tested.

**Critical next step:** Consider publishing as npm package, or add 2026 tax rates when Skatteverket publishes them.

---

## Files Changed (uncommitted)

### New files:
- `packages/cli/src/shared/taxRates.ts` — centralized tax rates
- `packages/cli/src/shared/sniCodes.ts` — SNI validation
- `packages/cli/src/commands/moms/MomsXmlWriter.ts` — moms XML writer
- `sie_test_files/synthetic/skattata-test-period-financial.se` — period filtering test data
- `sie_test_files/synthetic/skattata-test-expansionsfond.se` — expansionsfond test data
- `Plans/cozy-floating-creek.md` — execution plan for this session
- `Plans/robust-mixing-origami.md` — original 5-feature design plan

### Modified files:
- `CLAUDE.md` — new files, features, test counts
- `README.md` — f-skatt command, cross-command options table
- `packages/cli/src/commands/f-skatt/FSkattCalculator.ts` — accepts TaxRates param
- `packages/cli/src/commands/f-skatt/index.ts` — `--tax-year` option
- `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts` — period param
- `packages/cli/src/commands/income-statement/index.ts` — `--period`, `--expansionsfond`, `--tax-year`
- `packages/cli/src/commands/balance-sheet/BalanceSheetCalculator.ts` — period param
- `packages/cli/src/commands/balance-sheet/index.ts` — `--period`
- `packages/cli/src/commands/moms/index.ts` — `--output-xml`, `--org-number`, `--sni`
- `packages/cli/src/commands/sru-report/index.ts` — `--sni`, tax rates refactor
- `packages/cli/src/commands/sru-report/InfoSruWriter.ts` — SNI comment support

---

## Quick Start for New Agent

```bash
cd /Users/Dennis.Dyall/Code/other/Skattata

# 1. Verify state
bun test                                                    # 180 pass, 0 fail
bun run packages/cli/src/index.ts test-all ./sie_test_files # 127/127

# 2. All features complete — next work could be:
#    - npm publishing setup
#    - Add 2026 tax rates
#    - Confirm Skatteverket XML schema for moms (currently draft)
#    - Confirm #SNI as valid info.sru tag (currently using comment)
```

---

*Resume with: `/resume-handoff`*
