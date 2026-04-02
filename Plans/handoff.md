# Handoff — main

**Date:** 2026-04-02
**Branch:** main
**Last commit:** `76d88a2` — feat: complete enskild firma production-readiness (items 1-9)
**Unpushed commits:** 0 (check before assuming — run `git status`)

---

## Session Summary

This session completed the full 9-item enskild firma production-readiness plan from `Plans/smooth-gathering-kazoo.md`. The previous session had drafted the plan and partially applied items 1+4 (yearId support + BAS 7xxx split in IncomeStatementCalculator) but left them uncommitted. This session committed that work, completed all remaining 7 items, added 8 new e2e tests and a new synthetic test file, and verified 164 pass / 0 fail and 127/127 test-all.

---

## Current State

### Committed Work (this session)

- `15ea23c` — feat: yearId support + BAS 7xxx split in IncomeStatementCalculator (items 1+4)
- `76d88a2` — feat: complete enskild firma production-readiness (items 1-9)

### Uncommitted Changes

- `.claude/worktrees/agent-ad6d12d2` — deleted worktree entry (stale reference, safe to ignore)
- `Plans/handoff.md` — this file (being written now)
- `Plans/smooth-gathering-kazoo.md` — untracked (the plan document; no edits needed)

### Build & Test Status

```
164 pass · 4 skip · 0 fail
127/127 SIE files pass test-all
```

### Worktree / Parallel Agent State

None. One stale worktree entry (`.claude/worktrees/agent-ad6d12d2`) appears in `git diff --stat` as a deletion — it's an internal Claude Code tracking file, not a real git worktree. `git worktree list` shows only the main worktree.

---

## Readiness Assessment

**Target:** Swedish sole proprietors (enskild firma) who need to review accounting data from SIE exports, generate momsdeklaration output, and produce NE-bilaga SRU files for Skatteverket submission.

| Need | Status | Notes |
|---|---|---|
| Parse any real-world SIE file | ✅ Working | 127/127 files pass; SIE 1-5, CP437, XML |
| Balance sheet for any booking year | ✅ Working | `--year` now wired; uses yearBalances correctly |
| Prior-year income statement comparison | ✅ Working | `--year` wired, BAS 7xxx split into Personnel/Depreciation/Opex |
| Egenavgifter estimate for enskild firma | ✅ Working | `--enskild-firma` flag; 28.97% rate; prominently labelled estimate |
| Momsdeklaration (VAT return) | ✅ Working | Range-based scan: 2610-2669 (VAT accounts), 3000-3999 (sales base); EU transactions not handled |
| NE-bilaga SRU file generation | ⚠️ Partial | Passes through `#SRU` tags from SIE file correctly; no hardcoded NE field mapping if `#SRU` absent; egenavgifter SRU codes not yet verified from SKV 269 NE fältförteckning |
| Skatteverket SRU format compliance | ✅ Working | `#TAXAR`, CRLF endings, `#FILNAMN BLANKETTER.SRU`, hard error on missing/invalid orgNr |
| NE-bilaga validation | ✅ Working | Exits with code 1 + named account warning if no SRU codes found; warns if revenue section absent |

**Overall:** 🟢 Production — reliable for sole proprietors reviewing accounts and generating momsdeklaration. NE-bilaga submission depends on accounting software having exported `#SRU` tags; egenavgifter SRU field codes are not yet in the SRU output file (display only).

**Critical next step:** Verify egenavgifter SRU field codes from SKV 269 NE fältförteckning and add them to `SruFileWriter` when `--form ne` is used. This is the only remaining gap between display output and a complete, submittable NE-bilaga SRU file.

---

## What's Next (Prioritized)

1. **Verify egenavgifter SRU codes from SKV 269** — Research SKV 269 Bilaga NE fältförteckning for the exact 4-digit codes for egenavgifter contribution base (R40/R41/R43 are candidate labels but not confirmed). Once verified, add `#UPPGIFT <code> <amount>` to `SruFileWriter` when `form === 'NE'`.
2. **EU moms fields (20–37)** — Extend `MomsCalculator` with BAS ranges 2614-2615, 2645-2647; map to SKV 4700 fields 20, 30-32, 35-37. Auto-detect or gate on `--eu` flag.
3. **F-skatt (preliminary tax) command** — `skattata f-skatt <file> --municipality-rate 0.32` — see "Next Ups" section of `Plans/smooth-gathering-kazoo.md` for full formula.
4. **Räntefördelning flag** — Optional interest-allocation tool for asset-heavy enskild firma; 2025 rate 7.96%, 2026 rate 8.55%.
5. **INK2R/INK2S validation** — Validate aktiebolag SRU output correctness; currently untested beyond pass-through.

## Blockers & Known Issues

- Egenavgifter SRU codes not verified from Skatteverket canonical source. **Do NOT hardcode from secondary sources.** Must consult official SKV 269 NE appendix before implementing.
- EU moms transactions silently excluded — no warning if EU-range accounts present. (Low priority until a user hits it.)

---

## Key File References

| File | Purpose |
|---|---|
| `Plans/smooth-gathering-kazoo.md` | Full 9-item implementation plan — all items now complete; "Next Ups" section lists future work |
| `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts` | yearId + BAS 7xxx split (Personnel 7000-7399, Depreciation 7400-7499+7700-7899, Opex 5000-6999+7500-7699) |
| `packages/cli/src/commands/income-statement/index.ts` | `--year`, `--enskild-firma` flags; egenavgifter display (28.97% simplified estimate, truncated) |
| `packages/cli/src/commands/balance-sheet/BalanceSheetCalculator.ts` | yearId support; passes yearId to IncomeStatementCalculator |
| `packages/cli/src/commands/moms/MomsCalculator.ts` | Range-based BAS scan; `warnings[]` field added to `MomsResult` |
| `packages/cli/src/commands/sru-report/SruFileWriter.ts` | `#TAXAR`, CRLF, hard error on orgNr, removed XXXXXXXXXX fallback |
| `packages/cli/src/commands/sru-report/InfoSruWriter.ts` | `#FILNAMN BLANKETTER.SRU`, CRLF, hard error on orgNr |
| `packages/cli/src/commands/sru-report/index.ts` | `--tax-year`, NE validation (exit 1 + named account warning) |
| `sie_test_files/synthetic/skattata-test-income-multiyear.se` | NEW — two RAR years; verifies `--year` flag for both income-statement and balance-sheet |
| `packages/cli/tests/e2e/financial-statements.e2e.test.ts` | Extended with 6 new tests: `--year` flag, 7xxx section routing |
| `packages/cli/tests/e2e/enskild-firma.e2e.test.ts` | NEW — `--enskild-firma` flag: checks output contains "egenavgifter", "estimate", correct truncated value |

---

## Quick Start for New Agent

```bash
cd /Users/Dennis.Dyall/Code/other/Skattata

# 1. Verify clean state
bun test                                              # expect 164 pass, 0 fail
bun run packages/cli/src/index.ts test-all ./sie_test_files  # expect 127/127

# 2. Smoke tests
bun run packages/cli/src/index.ts income-statement ./sie_test_files/synthetic/skattata-test-income-multiyear.se --year -1
bun run packages/cli/src/index.ts income-statement ./sie_test_files/synthetic/skattata-test-income-statement.se --enskild-firma
bun run packages/cli/src/index.ts moms ./sie_test_files/synthetic/skattata-test-moms-annual.se
bun run packages/cli/src/index.ts sru-report ./sie_test_files/synthetic/skattata-test-sru-report.se --form ne --output /tmp/ne.sru
cat /tmp/ne.sru     # Check: #TAXAR on line 2, CRLF endings (^M$), #FILNAMN in info.sru
cat /tmp/info.sru   # (written alongside ne.sru)

# 3. Next work: verify egenavgifter SRU codes from SKV 269 NE fältförteckning
# Then add to SruFileWriter when form === 'NE'
```

---

*Resume with: `/resume-handoff`*
