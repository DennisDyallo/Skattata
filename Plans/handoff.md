# Handoff — main

**Date:** 2026-04-05
**Branch:** main
**Last commit:** `0efc989` — fix: correct 2025 skiktgrans from 613900 to 625800, add source traceability
**Tests:** 267 pass / 0 fail / 4 skip | 127/127 test-all (no parser changes)

---

## Session Summary

Compliance verification session. Audited all Skattata financial calculations against authoritative Swedish government sources for inkomstar 2025. Found and fixed one bug, added source traceability to all tax constants, and created a reusable compliance verification skill.

1. **Compliance audit** — Verified all 5 domains (tax constants, moms DTD, BAS account ranges, SRU mappings, F-skatt formula) against Skatteverket, Riksgalden, SCB, and BAS Kontogruppen sources using parallel research agents.

2. **Bug fix: skiktgrans 2025** — `stateTaxThreshold` was 613,900; correct value is 625,800 per Skatteverket "Belopp och procent 2025". This caused F-skatt to over-estimate state tax by applying 20% to ~12,000 kr extra income. Fixed in `taxRates.ts`, test fixture, and CLAUDE.md.

3. **Source traceability** — Every constant in `taxRates.ts` now cites its authoritative source inline. Created `docs/SOURCES.md` as the canonical source registry mapping all domains to their authoritative sources, verification methods, and update cadence.

4. **VerifyCompliance skill** — Created `~/.claude/skills/VerifyCompliance/` with 3 workflows (QuickCheck, FullAudit, StructuralCheck) and a living `CanonicalSources.md` registry. Invoked via `/verify-compliance`.

## Current State

### Committed Work
```
0efc989 fix: correct 2025 skiktgrans from 613900 to 625800, add source traceability
```

### Uncommitted Changes

| File | Change | Action needed |
|---|---|---|
| `M Plans/handoff.md` | This handoff document | Commit |
| `?? Plans/mossy-hugging-hejlsberg-agent-*.md` | Stale agent artifact | Safe to delete |
| `?? Plans/wiggly-juggling-flame.md` | Stale agent artifact | Safe to delete |

### Build & Test Status

- 267 pass, 0 fail, 4 skip across 18 test files
- 127/127 test-all on real SIE files (no parser changes this session)

### Worktree / Parallel Agent State

None. The stale `.claude/worktrees/agent-ad6d12d2` was cleaned up in this session's commit.

---

## Readiness Assessment

**Target:** Swedish sole proprietors (enskild firma) managing bookkeeping and tax declarations from SIE files.

| Need | Status | Notes |
|---|---|---|
| Parse any real-world SIE file | ✅ Working | 127/127 files, CP437/UTF-8/XML |
| Add/reverse transactions and write back valid SIE | ✅ Working | voucher add/sale/expense/transfer/owner/reverse |
| Balance sheet with year/period selection | ✅ Working | Multi-year, --period YYYYMM |
| Income statement with EF mode | ✅ Working | Egenavgifter, schablonavdrag, rantefordelning, expansionsfond |
| Momsdeklaration (VAT return) | ✅ Working | eSKDUpload v6.0 XML, DTD verified 2026-04-05 |
| NE-bilaga tax declaration (SRU) | ✅ Working | R41/R43/R30/R31/R36/R47/R48, K1 defaults, SKV 269 format |
| F-skatt preliminary tax estimate | ✅ Working | Monthly instalments, grundavdrag, **skiktgrans fixed** |
| Tax constants verified against official sources | ✅ Working | 10/10 constants verified, docs/SOURCES.md created |
| Compliance verification workflow | ✅ Working | /verify-compliance skill with 3 modes |
| Digital submission to Skatteverket | ❌ Missing | Manual portal upload required |
| npm binary (skattata) | ❌ Missing | Dev-only bun invocation |

**Overall:** 🟢 Production — full bookkeeping loop for enskild firma with verified 2025 compliance. All tax constants traced to authoritative sources.

**Critical next step:** Publish to npm so end users can install and use the tool.

---

## What's Next (Prioritized)

1. **Publish to npm** — package `@skattata/sie-core` and `skattata` CLI as installable tools
2. **Validate against Skatteverket test endpoints** — submit generated moms XML and SRU files to Skatteverket's test service for end-to-end validation
3. **Add 2026 tax constants** — after Skatteverket publishes "Belopp och procent 2026" (~November 2026), run `/verify-compliance` QuickCheck and add new entry
4. **Monitor BAS 2026 structural changes** — BAS 2026 restructures kontoklass 1 (fixed assets) and 4 (inventory/COGS); plan for calculator updates
5. **`.bak` cleanup** — see `project_backup_design.md` in memory
6. **Non-K1 NE mapping (K2/K3)** — for larger sole proprietors

## Blockers & Known Issues

- **No npm binary** — `bun run packages/cli/src/index.ts` is developer-only
- **Account-not-found warnings** — informational but alarming to non-technical users
- **Account 2670 (OSS VAT)** — added to BAS 2024, outside our 2640-2669 input VAT range; edge case for EU e-commerce
- **Local DTD fixture** — missing `TextUpplysningMoms` optional element; cosmetic
- **3700-3969 defaults to R1** — K1 mapping for discounts/other income defaults to VAT-liable; warning emitted
- **BAS 2026 breaking changes ahead** — kontoklass 1 and 4 restructuring will affect calculators

## Key File References

| File | Purpose |
|------|---------|
| `packages/cli/src/shared/taxRates.ts` | All tax constants with source citations |
| `docs/SOURCES.md` | Canonical source registry for all compliance domains |
| `~/.claude/skills/VerifyCompliance/` | Compliance verification skill (3 workflows) |
| `~/.claude/skills/VerifyCompliance/CanonicalSources.md` | Living registry of authoritative URLs |
| `packages/cli/src/commands/moms/MomsCalculator.ts` | Moms ruta definitions (verified against DTD) |
| `packages/cli/src/commands/sru-report/neDefaultSru.ts` | NE K1 SRU mappings (verified against BAS) |
| `packages/cli/src/commands/f-skatt/FSkattCalculator.ts` | F-skatt with grundavdrag formula (IL 63 kap) |

---

## Quick Start for New Agent

```bash
cd /Users/Dennis.Dyall/Code/other/Skattata
bun install
bun test                                       # 267 pass, 0 fail
bun run packages/cli/src/index.ts --help       # list all commands

# Compliance verification:
# /verify-compliance                           # full audit
# /verify-compliance quick                     # tax rates only

# Source traceability:
# cat docs/SOURCES.md                          # all authoritative sources
# see taxRates.ts JSDoc                        # inline source references
```

---

*Resume with: `/resume-handoff`*
