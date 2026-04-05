# Handoff — main

**Date:** 2026-04-05
**Branch:** main
**Last commit:** `5163129` — test: add SKV 269 SRU format validation tests, document test endpoints
**Tests:** 284 pass / 0 fail / 4 skip across 19 files | 127/127 test-all (no parser changes)

---

## Session Summary

Compliance verification and hardening session. Audited all Skattata calculations against authoritative Swedish government sources for inkomstar 2025, found and fixed a real bug, added source traceability throughout the codebase, created a reusable compliance skill, and added 17 new format validation tests.

### Commits this session

```
5163129 test: add SKV 269 SRU format validation tests, document test endpoints
b45f3dd docs: update handoff after compliance audit session
0efc989 fix: correct 2025 skiktgrans from 613900 to 625800, add source traceability
```

### What was done

1. **Full compliance audit** — Verified all 5 domains (tax constants, moms DTD, BAS account ranges, SRU mappings, F-skatt formula) against Skatteverket, Riksgalden, SCB, and BAS Kontogruppen using parallel research agents.

2. **Bug fix: skiktgrans 2025** — `stateTaxThreshold` was 613,900; correct value is 625,800 per Skatteverket "Belopp och procent 2025". Fixed in taxRates.ts, test fixture, and CLAUDE.md.

3. **Source traceability** — Every constant in `taxRates.ts` now cites its authoritative source inline (Skatteverket, Riksgalden, SCB). Created `docs/SOURCES.md` as the canonical source registry.

4. **VerifyCompliance skill** — Created `~/.claude/skills/VerifyCompliance/` with 3 workflows (QuickCheck, FullAudit, StructuralCheck) and a living `CanonicalSources.md` registry. Invoked via `/verify-compliance`.

5. **SRU format validation tests** — 17 new e2e tests validating SKV 269 format: tag structure, ordering, CRLF encoding, field types, orgNr format, info.sru sections, NE form, SNI codes.

6. **Skatteverket test endpoint research** — Documented that no open API/sandbox exists; manual BankID upload is the only remote validation. Added to docs/SOURCES.md.

## Current State

### Uncommitted Changes

None. Working tree is clean (2 stale agent plan artifacts in Plans/ can be deleted).

### Build & Test Status

- 284 pass, 0 fail, 4 skip across 19 test files (288 total runs)
- 127/127 test-all on real SIE files
- All pushed to origin/main

### Worktree / Parallel Agent State

None.

---

## Readiness Assessment

**Target:** Swedish sole proprietors (enskild firma) managing bookkeeping and tax declarations from SIE files.

| Need | Status | Notes |
|---|---|---|
| Parse any real-world SIE file | ✅ Working | 127/127 files, CP437/UTF-8/XML |
| Add/reverse transactions and write back valid SIE | ✅ Working | voucher add/sale/expense/transfer/owner/reverse |
| Balance sheet with year/period selection | ✅ Working | Multi-year, --period YYYYMM |
| Income statement with EF mode | ✅ Working | Egenavgifter, schablonavdrag, rantefordelning, expansionsfond |
| Momsdeklaration (VAT return) | ✅ Working | eSKDUpload v6.0 XML, DTD validated (5 tests) |
| NE-bilaga tax declaration (SRU) | ✅ Working | K1 defaults, SKV 269 format validated (17 tests) |
| F-skatt preliminary tax estimate | ✅ Working | skiktgrans fixed, grundavdrag formula verified |
| Tax constants verified against official sources | ✅ Working | 10/10 constants correct, docs/SOURCES.md |
| Automated compliance verification | ✅ Working | /verify-compliance skill, 3 workflows |
| Automated format validation | ✅ Working | 22 tests (5 DTD + 17 SRU format) |
| Digital submission to Skatteverket | ❌ Missing | Manual portal upload with BankID required |
| npm binary (skattata) | ❌ Missing | Dev-only bun invocation |

**Overall:** 🟢 Production — full bookkeeping loop for enskild firma with verified 2025 compliance and automated format validation. Source traceability from authoritative sources to every constant.

**Critical next step:** Publish to npm so end users can install and use the tool.

---

## What's Next (Prioritized)

1. **Publish to npm** — package `@skattata/sie-core` and `skattata` CLI as installable tools
2. **Manual Skatteverket validation** — upload generated moms XML and SRU files via BankID e-service to verify acceptance (annual spot-check)
3. **Add 2026 tax constants** — after Skatteverket publishes "Belopp och procent 2026" (~November 2026), run `/verify-compliance` QuickCheck
4. **Plan for BAS 2026 structural changes** — kontoklass 1 (fixed assets) and 4 (inventory/COGS) restructuring affects calculators
5. **`.bak` cleanup** — see project memory for options
6. **Non-K1 NE mapping (K2/K3)** — for larger sole proprietors

## Blockers & Known Issues

- **No npm binary** — `bun run packages/cli/src/index.ts` is developer-only
- **Account 2670 (OSS VAT)** — added to BAS 2024, outside our 2640-2669 range; edge case for EU e-commerce
- **Local DTD fixture** — missing `TextUpplysningMoms` optional element; cosmetic
- **3700-3969 defaults to R1** — K1 mapping for discounts defaults to VAT-liable; warning emitted
- **BAS 2026 breaking changes ahead** — kontoklass 1 and 4 restructuring

## Key File References

| File | Purpose |
|------|---------|
| `packages/cli/src/shared/taxRates.ts` | All tax constants with source citations |
| `docs/SOURCES.md` | Canonical source registry + Skatteverket test endpoint docs |
| `~/.claude/skills/VerifyCompliance/` | Compliance verification skill (3 workflows) |
| `~/.claude/skills/VerifyCompliance/CanonicalSources.md` | Living registry of authoritative URLs |
| `packages/cli/tests/e2e/moms-dtd-validation.e2e.test.ts` | 5 DTD validation tests |
| `packages/cli/tests/e2e/sru-format-validation.e2e.test.ts` | 17 SRU format validation tests |
| `packages/cli/src/commands/moms/MomsCalculator.ts` | Moms ruta definitions (verified against DTD) |
| `packages/cli/src/commands/sru-report/neDefaultSru.ts` | NE K1 SRU mappings (verified against BAS) |

---

## Quick Start for New Agent

```bash
cd /Users/Dennis.Dyall/Code/other/Skattata
bun install
bun test                                       # 284 pass, 0 fail
bun run packages/cli/src/index.ts --help       # list all commands

# Compliance verification:
# /verify-compliance                           # full audit (all 5 domains)
# /verify-compliance quick                     # tax rates only

# Source traceability:
# cat docs/SOURCES.md                          # all authoritative sources
```

---

*Resume with: `/resume-handoff`*
