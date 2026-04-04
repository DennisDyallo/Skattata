# Handoff — main

**Date:** 2026-04-04
**Branch:** main
**Last commit:** `67db7e6` — feat: add voucher reverse command for counter-entry reversal
**Tests:** 267 pass / 0 fail / 4 skip | 127/127 test-all

---

## Session Summary

This session had three main deliveries. First, the UX assessment surfaced a critical silent-stale-report bug: adding a voucher without recalculating left all reports showing old data with no warning. This was fixed by making all 5 write commands auto-recalculate before the single file write, then extracting the push/recalc/write/report block into a shared `commitVoucher()` helper via DevTeam Ship (b2ca1b3). Second, documentation was updated across CLAUDE.md, README, and getting-started.md to reflect the full command set and new bookkeeping workflow (2fa9ec9). Third, the Architect agent designed and the Engineer implemented `voucher reverse` — a counter-entry command that creates a negated voucher for any existing voucher by series+number ID, with a double-reversal guard and full audit-trail compliance (67db7e6).

## Current State

### Committed Work (this session)

- `16f9f84` — feat: add CLI bookkeeping for enskild firma (voucher add/sale/expense/transfer/owner/list)
- `2a9a898` — docs: update handoff, mark bookkeeping plan complete, add variadic flag spec
- `2fa9ec9` — docs: update docs for CLI bookkeeping write commands (CLAUDE.md/README/getting-started)
- `b2ca1b3` — feat: auto-recalculate balances on voucher write, show balance delta
  - All 5 write commands now auto-recalculate before write (one atomic file write)
  - `commitVoucher()` extracted to voucherHelpers.ts — DRY across add/sale/expense/transfer/owner
  - `--no-recalculate` flag for batch workflows
  - Post-write balance delta shown per-account
- `67db7e6` — feat: add voucher reverse command for counter-entry reversal
  - `voucher reverse <file> --voucher A-47` — creates negated counter-entry
  - Double-reversal guard (text prefix "Korrigering:"), bypassed with `--force`
  - Custom `--date`, `--series`, `--text` overrides; `--backup`, `--no-recalculate`, `--yes`
  - 8 e2e tests; 271 total tests passing

### Uncommitted Changes

- `M Plans/handoff.md` — this file (being written)
- `D .claude/worktrees/agent-ad6d12d2` — tracked deletion of stale worktree, safe to ignore
- `?? Plans/voucher-reversal.md` — Architect plan document, safe to commit or ignore
- `?? Plans/mossy-hugging-hejlsberg-agent-a571825f8d6d78b27.md` — stale agent artifact, safe to ignore
- `?? Plans/wiggly-juggling-flame.md` — stale agent artifact, safe to ignore

### Build & Test Status

- 267 pass, 0 fail, 4 skip across 18 test files
- 127/127 test-all on real SIE files (not re-run this session; no parser changes)
- Working tree clean except handoff update and untracked plan/artifact files

### Worktree / Parallel Agent State

None. No active worktrees.

---

## Readiness Assessment

**Target:** Swedish sole proprietors (enskild firma) who need to manage their bookkeeping, add transactions, reverse errors, and generate tax declarations from SIE files — replacing their accounting SaaS entirely.

| Need | Status | Notes |
|---|---|---|
| Parse any real-world SIE file | ✅ Working | 127/127 files, CP437/UTF-8/XML |
| Add transactions and write back valid SIE | ✅ Working | `voucher add/sale/expense/transfer/owner` |
| Reverse an erroneous transaction | ✅ Working | `voucher reverse --voucher A-47` — just shipped |
| Reports immediately reflect new transactions | ✅ Working | Auto-recalculate on every write; no separate step |
| Balance sheet with year/period selection | ✅ Working | Multi-year, `--period YYYYMM` |
| Income statement with EF mode | ✅ Working | Egenavgifter, schablonavdrag, räntefördelning, expansionsfond |
| Momsdeklaration (VAT return) | ✅ Working | eSKDUpload v6.0 XML, DTD validated |
| NE-bilaga tax declaration | ✅ Working | R41/R43/R30/R31/R36/R47/R48 auto-computed, K1 defaults |
| F-skatt preliminary tax estimate | ✅ Working | Monthly instalments with grundavdrag |
| SRU file output (SKV 269) | ✅ Working | INK2R/INK2S/NE forms |
| Account lookup / discovery | ✅ Working | `accounts` command with --search/--type/--range |
| Balance recalculation after edits | ✅ Working | Automatic on all write commands; `recalculate` also available standalone |
| User-facing documentation | ✅ Working | README, getting-started guide, CLAUDE.md all current |
| Digital submission to Skatteverket | ❌ Missing | Manual portal upload required |
| Non-K1 NE mapping (K2/K3) | ❌ Missing | Larger sole proprietors need #SRU tags from their software |

**Overall:** 🟢 Production — full bookkeeping loop including error correction for enskild firma. Users can add, reverse, and report without SaaS. Voucher account-warning UX and missing npm binary remain rough edges but don't block correct use.

**Critical next step:** Publish to npm — package as `skattata` binary so users can `npx skattata` or `npm i -g skattata` instead of the dev-only `bun run packages/cli/src/index.ts` invocation.

---

## What's Next (Prioritized)

1. **Publish to npm** — package `@skattata/sie-core` and `skattata` CLI as installable tools. Update `package.json` bin, test `npx skattata --help`, write npm publish workflow. (Previous critical next step of e2e manual test completed this session.)
2. **Suppress or improve account-not-found warnings on write** — "Warning: Account 3010 not found" alarms users when adding first-time revenue entries to files that didn't have sales before. Should be more informative or suppressed for on-demand account creation.
3. **Non-K1 (K2/K3) NE mapping** — for sole proprietors using fullständigt årsbokslut.
4. **Skatteverket API submission** — digital filing via OAuth2, likely out of scope for CLI tool.

## Blockers & Known Issues

- **Account-not-found warnings** — appear when adding voucher rows for accounts not pre-declared in `#KONTO`. These are informational (accounts created on-demand), but the warning text is alarming to non-technical users.
- **3700-3969 defaults to R1** — K1 mapping for discounts/other income defaults to VAT-liable. Warning emitted.
- **8000-8299 unmapped in K1** — unusual financial items fall to missingCode. Expected for K1 chart.
- **No K2/K3 NE support** — larger sole proprietors need #SRU tags from their accounting software.
- **No npm binary** — `bun run packages/cli/src/index.ts` is developer-only; target users need `skattata` as an installed command.

## Key File References

| File | Purpose |
|------|---------|
| `packages/cli/src/commands/voucher/reverse.ts` | New reversal command — counter-entry with negated amounts |
| `packages/cli/src/shared/voucherHelpers.ts` | `commitVoucher()` — shared push/recalc/write/report for all write commands |
| `packages/cli/src/commands/voucher/add.ts` | Canonical write command pattern |
| `packages/cli/src/commands/voucher/sale.ts` | Template: sale with VAT auto-split |
| `packages/cli/src/shared/vatCalculator.ts` | VAT rate → BAS account mapping + `computeVatSplit` |
| `packages/sie-core/src/validator/VoucherValidator.ts` | Hard errors + warnings before write |
| `packages/sie-core/src/recalculator/BalanceRecalculator.ts` | Recomputes UB/RES from IB + voucher movements |
| `Plans/voucher-reversal.md` | Architect plan for reversal — implemented |
| `sie_test_files/sie4-dennis-fiscal-*.se` | 6 real-data files (2016-2022) for manual verification |
| `docs/getting-started.md` | User-facing workflow guide — current |

---

## Quick Start for New Agent

```bash
cd /Users/Dennis.Dyall/Code/other/Skattata
bun install
bun test                                       # 267 pass, 0 fail
bun run packages/cli/src/index.ts --help       # list all 12 commands (including voucher reverse)
bun run packages/cli/src/index.ts test-all ./sie_test_files  # 127/127

# Write commands — all auto-recalculate now:
bun run packages/cli/src/index.ts voucher sale annual.se \
  --date 2024-03-15 --text "Faktura 1001" --amount 12500 --vat 25 --yes
bun run packages/cli/src/index.ts voucher reverse annual.se --voucher A-1 --yes
bun run packages/cli/src/index.ts voucher add annual.se \
  --date 2024-03-28 --text "Korrigering" --debit 1930 500 --credit 2640 500 --yes

# Batch adds (skip auto-recalculate, do once at end):
bun run packages/cli/src/index.ts voucher sale annual.se ... --no-recalculate --yes
bun run packages/cli/src/index.ts voucher sale annual.se ... --no-recalculate --yes
bun run packages/cli/src/index.ts recalculate annual.se --yes

# Tax reporting:
bun run packages/cli/src/index.ts income-statement annual.se --enskild-firma
bun run packages/cli/src/index.ts moms annual.se --period 202401 --output-xml moms.xml
bun run packages/cli/src/index.ts sru-report annual.se --form ne --output ne.sru

# Real Dennis data:
bun run packages/cli/src/index.ts balance-sheet sie_test_files/sie4-dennis-fiscal-2022.se
```

---

*Resume with: `/resume-handoff`*
