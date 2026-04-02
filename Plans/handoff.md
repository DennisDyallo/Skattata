# Handoff — main

**Date:** 2026-04-02
**Branch:** main
**Last commit:** `7ceb092` — feat: fix financial statement calculations + rename test files + synthetic vectors

---

## Session Summary

This session completed a full TypeScript port of the Skattata SIE accounting library from C#, ran it through DevTeam Engineer→Reviewer cycles, built a 7-command CLI for Swedish accounting file analysis, fixed critical accounting calculation bugs (balance sheet sign convention, moms net VAT formula, income statement field priority), renamed all 127 test files to a uniform taxonomy, and created 6 synthetic SIE test files with provable expected outputs. The repo is clean on `main` with 156 tests passing and 127/127 SIE files passing E2E.

---

## Current State

### Committed Work (this session — key commits)

| Commit | What |
|---|---|
| `7ceb092` | Fix financial statement calcs + rename 127 test files + 6 synthetic vectors + 10 E2E tests |
| `44a2b52` | README for humans, CLAUDE.md for agents (clear split) |
| `e1c3a6d` | Comprehensive `--help` text for all 7 CLI commands |
| `0c33bb1` | `sru-report` command + `.sru` file generation (SKV 269) + 27 unit tests + LOW parser fixes |
| `3840046` | 4 SIE5 XML variant test files from iCalcreator/Sie5Sdk |
| `c0d1efd` | 51 edge-case test vectors from blinfo/Sie4j |
| `90aa5bb` | Major parser improvements: tab separators, BOM, on-demand creation, yearBalances, PSALDO objects, safeParseFloat |
| `c35db46` | Removed C# codebase — TypeScript port is now the sole implementation |

### Uncommitted Changes
None — repo is clean.

### Build & Test Status
```
156 pass · 4 skip · 0 fail
160 tests across 9 files (1.71s)
127/127 SIE files pass test-all
```

### Worktree / Parallel Agent State
None — single worktree on `main`.

---

## What's Next (Prioritized)

1. **Push to GitHub** — all work is local, nothing has been pushed.
   ```bash
   git push origin main
   ```

2. **Fix remaining deferred audit items** — 4 LOW items from the parser audit:
   - `parseDate` returns `new Date(0)` sentinel for invalid input — could add `Date | null` type (low risk)
   - `normalizePsaldoTokens` edge case when PSALDO has no brace block at all (now partially fixed; verify with new test)
   - `yearBalances` sort order (confirmed correct — descending = current year first per SIE spec)
   - CRLF line endings in writer — intentional per SIE spec but not configurable

3. **`sru-report` sign convention for SRU output** — SRU 7410 test shows `-40000` (raw revenue sign). Revenue accounts (3xxx) are credit/negative in SIE. The `SruReportCalculator` should negate revenue accounts the same way `IncomeStatementCalculator` now does, so SRU 7410 shows `40000` not `-40000`. One-line fix in `SruReportCalculator.ts` balanceField logic.

4. **Add `info.sru` generation** — `sru-report --output file.sru` generates `blanketter.sru` but a full Skatteverket submission also needs `info.sru` (company metadata companion file). Deferred — document in README.

5. **Add `skattata` as global binary** — `bun link` in `packages/cli/` so `skattata` runs without the `bun run packages/cli/src/index.ts` prefix.
   ```bash
   cd packages/cli && bun link
   ```

6. **Update CLAUDE.md** — several new things since last update: 133 total test files (127 + 6 synthetic), all test file names changed, `balanceDiff` semantics documented.

7. **Update README** — test count is still showing old numbers; add `sru-report` example with real output.

---

## Blockers & Known Issues

- **`SruReportCalculator` sign bug:** Revenue SRU codes show negative amounts because raw `result` field is used without negation. E2E test `7410 ≈ -40000` is passing but semantically wrong — the report should show positive revenue amounts. See item #3 above.
- **`BalanceSheetCalculator` + `IncomeStatementCalculator` coupling:** Balance sheet calls income statement internally. Any bug in income statement will surface as a balance sheet error with no clear message. Acceptable for now but deferred improvement.
- **`moms` command for SIE 1/2 files:** Falls back to `closingBalance` when `#RES` is absent (SIE 1/2 don't have `#RES`). This may produce wrong period-level P&L for those formats. Acceptable for balance sheet numbers, wrong for income statement purpose.

---

## Key File References

| File | Purpose |
|---|---|
| `packages/cli/src/index.ts` | All 7 CLI commands: `parse`, `validate`, `balance-sheet`, `income-statement`, `moms`, `sru-report`, `test-all` |
| `packages/cli/src/statements/` | 5 calculators: `BalanceSheetCalculator`, `IncomeStatementCalculator`, `MomsCalculator`, `SruReportCalculator`, `SruFileWriter` |
| `packages/sie-core/src/parser/SieTagParser.ts` | SIE 4 tag-based parser — see CLAUDE.md for critical parser notes |
| `packages/sie-core/src/models/SieAccount.ts` | All account fields incl. `yearBalances`, `sruCode`, `type` (KTYP) |
| `CLAUDE.md` | Agent reference: architecture, model fields, parser gotchas, add-command pattern |
| `sie_test_files/synthetic/` | 6 synthetic files with provable expected outputs |
| `Plans/wondrous-wiggling-piglet.md` | Approved implementation plan (SRU report feature) — next to implement |
| `packages/cli/tests/e2e/financial-statements.e2e.test.ts` | E2E tests with exact value assertions against synthetic files |
| `~/Code/y/first-responder/` | first-responder CLI — had non-interactive SelectionPrompt bug FIXED this session |

---

## Architecture Snapshot

```
packages/
  sie-core/          ← library (publishable)
    src/models/      ← SieDocument, SieAccount (yearBalances), SieDimension, SiePeriodValue
    src/parser/      ← SieTagParser (SIE 1-4, CP437+tab), SieXmlParser (SIE 5)
    src/writer/      ← SieDocumentWriter (CP437 output)
    src/comparer/    ← SieDocumentComparer (round-trip diff)
    src/utils/       ← encoding.ts (iconv-lite CP437), lineParser.ts (state machine)
  cli/
    src/index.ts     ← commander.js, 7 commands
    src/statements/  ← 5 financial calculators
    src/formatters/  ← table/json/csv output

sie_test_files/
  *.se *.si *.sie    ← 127 files, named <sietype>-<vendor>-<description>.<ext>
  synthetic/         ← 6 synthetic files with known expected outputs

Swedish BAS sign convention (critical):
  Asset accounts (1xxx):    positive #UB = asset present
  Equity/Liability (2xxx):  negative #UB = credit balance (NEGATE for display)
  Revenue (3xxx):           negative #RES = credit (NEGATE for display)
  Cost accounts (4xxx-8xxx): positive #RES = debit (show as-is)
```

---

## Quick Start for New Agent

```bash
# 1. Install dependencies
cd /Users/Dennis.Dyall/Code/other/Skattata
bun install

# 2. Verify everything passes
bun test                                              # 156 pass, 0 fail
bun run packages/cli/src/index.ts test-all ./sie_test_files  # 127/127

# 3. Run any CLI command
bun run packages/cli/src/index.ts parse ./sie_test_files/sie4-demo-company.se
bun run packages/cli/src/index.ts balance-sheet ./sie_test_files/sie4-demo-company.se
bun run packages/cli/src/index.ts moms ./sie_test_files/sie4-demo-company.se
bun run packages/cli/src/index.ts sru-report ./sie_test_files/sie4-round-trip-test.se
bun run packages/cli/src/index.ts --help             # see all commands

# 4. Push to remote (not yet done)
git push origin main

# 5. First action after context load
# Read CLAUDE.md — it has architecture, parser gotchas, and add-command recipe
```

---

## Session Context for New Agent

**What this codebase is:** A TypeScript CLI for parsing Swedish SIE accounting files and generating tax reports (balansräkning, resultaträkning, momsdeklaration, SRU tax declarations).

**Key insight about Swedish BAS sign convention:** All 2xxx accounts (equity/liability) store CREDIT balances as NEGATIVE numbers in SIE files. Calculators MUST negate them for display. This was a critical bug that was fixed this session.

**The `balanceDiff` field** on `BalanceSheetResult` = `assets.total - (equity.total + liabilities.total)`. It does NOT include `netIncome` (that would double-count if 2099 is already booked). Zero means balanced.

**SRU sign issue (open):** `SruReportCalculator` currently passes raw `result` values to SRU entries without negating revenue accounts. Revenue (3xxx) shows as negative. Should be negated like `IncomeStatementCalculator` does.

---

*Resume with: `/resume-handoff`*
