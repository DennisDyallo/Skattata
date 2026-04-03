# Plan: CLI Bookkeeping for Enskild Firma ✅ IMPLEMENTED 2026-04-04 (commit 16f9f84)

## Context

Skattata users are sole proprietors (enskild firma) who export SIE files from their current accounting SaaS and want to **stop paying for SaaS entirely**. Today Skattata is read-only. The missing piece is the ability to **add transactions and save back to SIE** — the core bookkeeping loop.

The writer (`SieDocumentWriter`) already produces valid SIE 4 files (proven by round-trip tests). The models are plain mutable data classes. The gap: no CLI command creates or modifies SIE files.

---

## Design Philosophy

1. **Progressive disclosure** — common cases get shorthand templates; general case available for power users
2. **Human language** — `--debit` / `--credit` instead of signed amounts; account names shown alongside numbers
3. **Confirm before mutating** — preview with account names and balance check before writing
4. **Harmonize** — read-only commands stay top-level nouns; write commands group under `voucher`

---

## New Commands

### `skattata accounts` (read-only, top-level)

Look up account numbers from the file's chart of accounts. Solves the "what's the number for...?" problem.

```bash
skattata accounts annual.se                    # list all
skattata accounts annual.se --search bank      # fuzzy search by name
skattata accounts annual.se --type K           # filter by type (T/S/I/K)
skattata accounts annual.se --range 2610-2650  # filter by number range
```

### `skattata voucher add` (general-purpose write)

Full double-entry with explicit debit/credit. For power users and unusual entries.

```bash
skattata voucher add annual.se \
  --date 2024-03-15 \
  --text "Faktura 1001" \
  --debit 1930 10000 \
  --credit 3010 10000
```

Shows preview before writing:
```
  Verifikation A-47  2024-03-15  "Faktura 1001"
  ──────────────────────────────────────────────
  1930  Bankkonto              Debit   10 000,00
  3010  Försäljning            Credit  10 000,00
  ──────────────────────────────────────────────
  Balance: 0,00 SEK  ✓

  Write to annual.se? [Y/n]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--date YYYY-MM-DD` | yes | Transaction date (also accepts YYYYMMDD) |
| `--text "..."` | yes | Voucher description |
| `--debit <acct> <amount>` | yes (1+) | Repeatable. Account to debit |
| `--credit <acct> <amount>` | yes (1+) | Repeatable. Account to credit |
| `--series <S>` | no, default `A` | Voucher series |
| `--output <file>` | no | Write to different file |
| `--backup` | no | Create `.bak` before overwriting |
| `-y` / `--yes` | no | Skip confirmation (for scripting) |
| `--no-recalculate` | no | Skip balance recomputation |

### `skattata voucher sale` (template: record a sale)

Common pattern: customer pays you. Auto-computes VAT split.

```bash
# 12,500 total including 25% VAT
skattata voucher sale annual.se \
  --date 2024-03-15 --text "Faktura 1001" --amount 12500 --vat 25

# Preview:
#   1930  Bankkonto              Debit   12 500,00
#   3010  Försäljning 25%        Credit  10 000,00
#   2610  Utgående moms 25%      Credit   2 500,00

# VAT-exempt sale (0%)
skattata voucher sale annual.se \
  --date 2024-03-22 --text "Utbildning" --amount 5000 --vat 0
```

Optional overrides: `--bank-account`, `--revenue-account`.

### `skattata voucher expense` (template: record a purchase)

Common pattern: you buy something. Auto-computes VAT split.

```bash
# 6,250 total including 25% VAT, charged to office supplies
skattata voucher expense annual.se \
  --date 2024-03-20 --text "Kontorsmaterial" --amount 6250 --account 6110 --vat 25

# Preview:
#   6110  Kontorsmaterial        Debit    5 000,00
#   2640  Ingående moms          Debit    1 250,00
#   1930  Bankkonto              Credit   6 250,00

# 12% VAT (food/hotel)
skattata voucher expense annual.se \
  --date 2024-03-21 --text "Hotell konferens" --amount 2240 --account 5800 --vat 12
```

`--account` is required (expense categories vary). Warns if not in 4000-7999 range.

### `skattata voucher transfer` (template: between accounts)

```bash
skattata voucher transfer annual.se \
  --date 2024-03-22 --text "Uttag till handkassa" \
  --amount 5000 --from 1930 --to 1910
```

### `skattata voucher owner` (template: owner withdrawal/deposit)

```bash
skattata voucher owner annual.se \
  --date 2024-03-25 --text "Eget uttag mars" --withdrawal 10000

skattata voucher owner annual.se \
  --date 2024-03-25 --text "Eget insättning" --deposit 5000
```

Uses account 2013 (BAS standard for EF owner draws). Override with `--owner-account`.

### `skattata voucher list` (read-only)

```bash
skattata voucher list annual.se [--series A] [--period 202403]
```

Discoverable alias for `parse --vouchers`.

### `skattata recalculate` (standalone, top-level)

```bash
skattata recalculate annual.se [--output <file>] [--backup]
```

Recomputes `#UB`/`#RES` from `#IB` + voucher movements without adding anything. Power-user tool.

---

## VAT Handling

Swedish VAT rates and their BAS account mappings:

| Rate | Output VAT (sales) | Input VAT (purchases) | Revenue account |
|------|-------------------|----------------------|-----------------|
| 25%  | 2610              | 2640                 | 3010            |
| 12%  | 2620              | 2641                 | 3011            |
| 6%   | 2630              | 2642                 | 3012            |
| 0%   | (none)            | (none)               | 3010            |

`--vat` flag semantics: the `--amount` is the **total including VAT** (matching invoice amounts). The tool computes:
- Net amount: `total / (1 + rate)`
- VAT amount: `total - net`

These defaults can be overridden. A `vatCalculator.ts` shared utility handles the math and account mapping.

---

## Post-Write Feedback

After confirming, the user sees:
```
  ✓ Added verifikation A-47 to annual.se
    Balances recalculated: 3 accounts updated
    Bank (1930): 150 000,00 → 162 500,00
```

Shows the bank account movement — the thing users most care about.

---

## Command Harmonization

```
  Read-only (top-level nouns):
    parse, validate, accounts, balance-sheet, income-statement,
    moms, sru-report, f-skatt, test-all

  Write (grouped under voucher):
    voucher add, voucher sale, voucher expense,
    voucher transfer, voucher owner, voucher list

  Maintenance (top-level):
    recalculate
```

---

## New sie-core Components

### `VoucherValidator` — `packages/sie-core/src/validator/VoucherValidator.ts`

**Hard errors (block save):**
- At least 2 rows
- Rows sum to 0 (balanced, tolerance < 0.005)
- Each row has non-empty accountNumber
- Each row has non-zero amount
- Voucher has valid date (not sentinel `new Date(0)`, not `Invalid Date`)
- Voucher date falls within `#RAR 0` booking year range (startDate ≤ date ≤ endDate). Error message shows the valid range: "Date 2025-06-15 is outside fiscal year 2023-01-01 to 2023-12-31"
- Voucher date is not in the future (warn-by-default, error with `--strict`)
- Duplicate voucher number within same series (auto-increment should prevent this, but validate as safety net)

**Warnings (show but don't block):**
- Account number in a row doesn't exist in `doc.accounts` (might be intentional — new account)
- Voucher text is empty (valid but unusual)
- Amount exceeds 1,000,000 SEK on a single row (possible decimal error)
- Account type mismatch: e.g., debiting a revenue account (3xxx) or crediting a cost account (4xxx-8xxx) — unusual but not necessarily wrong

### `BalanceRecalculator` — `packages/sie-core/src/recalculator/BalanceRecalculator.ts`

- Recomputes year-0 `#UB` and `#RES` from `#IB` + voucher movements
- Balance sheet (1000-2999): `closingBalance = opening + movements`
- Income/cost (3000-8999): `result = movements`
- Creates accounts on-demand for unknown voucher row references
- Preserves year -1/-2 balances

### `AccountLookup` — `packages/sie-core/src/lookup/AccountLookup.ts`

- `search(term)`, `byRange(from, to)`, `byType(type)`
- Returns `{id, name, type}[]` sorted by account ID

---

## New CLI Shared Utilities

| File | Purpose |
|------|---------|
| `shared/writeFile.ts` | Write SIE buffer to disk with optional `.bak` backup |
| `shared/voucherPreview.ts` | Render preview table with account names, Swedish-formatted amounts |
| `shared/vatCalculator.ts` | Compute VAT splits, map rates to BAS accounts |

---

## File Structure

```
packages/
  sie-core/src/
    recalculator/BalanceRecalculator.ts     # NEW
    validator/VoucherValidator.ts            # NEW
    lookup/AccountLookup.ts                 # NEW
    index.ts                                # MODIFY (add exports)
  sie-core/tests/unit/
    balanceRecalculator.test.ts             # NEW
    voucherValidator.test.ts                # NEW
    accountLookup.test.ts                   # NEW
  cli/src/
    shared/
      writeFile.ts                          # NEW
      voucherPreview.ts                     # NEW
      vatCalculator.ts                      # NEW
    commands/
      accounts/index.ts                     # NEW
      voucher/
        index.ts                            # NEW (command group)
        add.ts                              # NEW
        sale.ts                             # NEW
        expense.ts                          # NEW
        transfer.ts                         # NEW
        owner.ts                            # NEW
        list.ts                             # NEW
      recalculate/index.ts                  # NEW
    index.ts                                # MODIFY (register commands)
  cli/tests/e2e/
    accounts.e2e.test.ts                    # NEW
    voucher-add.e2e.test.ts                 # NEW
    voucher-templates.e2e.test.ts           # NEW
    recalculate.e2e.test.ts                 # NEW
```

---

## Implementation Order — Parallel Agent Team

### Strategy: Contract-first, outside-in, parallel execution

**Phase 0: Contracts (sequential, done by orchestrator)**

Define TypeScript interfaces and type signatures for all shared code. These are the contracts that parallel agents code against. No implementation — just types and exports.

Files created:
- `packages/sie-core/src/validator/VoucherValidator.ts` — interface + class stub
- `packages/sie-core/src/recalculator/BalanceRecalculator.ts` — interface + class stub
- `packages/sie-core/src/lookup/AccountLookup.ts` — interface + class stub
- `packages/sie-core/src/index.ts` — updated exports
- `packages/cli/src/shared/writeFile.ts` — function signature stub
- `packages/cli/src/shared/voucherPreview.ts` — function signature stub
- `packages/cli/src/shared/vatCalculator.ts` — interface + function signature stub

**Phase 1: Tests first, parallel (3 agents in worktrees)**

Each agent writes tests against the contracts. No implementation yet — tests will fail.

| Agent | Scope | Files |
|-------|-------|-------|
| **Agent A: sie-core tests** | Unit tests for VoucherValidator, BalanceRecalculator, AccountLookup | `tests/unit/voucherValidator.test.ts`, `balanceRecalculator.test.ts`, `accountLookup.test.ts` |
| **Agent B: CLI e2e tests** | E2E tests for `accounts`, `voucher add`, `recalculate` commands | `tests/e2e/accounts.e2e.test.ts`, `voucher-add.e2e.test.ts`, `recalculate.e2e.test.ts` |
| **Agent C: Template e2e tests** | E2E tests for `voucher sale/expense/transfer/owner` | `tests/e2e/voucher-templates.e2e.test.ts` |

**Phase 2: Implementation, parallel (3 agents in worktrees)**

Each agent implements against contracts to make their tests pass.

| Agent | Scope | Files |
|-------|-------|-------|
| **Agent D: sie-core implementations** | VoucherValidator, BalanceRecalculator, AccountLookup implementations | All 3 sie-core modules |
| **Agent E: CLI infrastructure + simple commands** | writeFile, voucherPreview, vatCalculator, `accounts` command, `recalculate` command, `voucher list` | shared/ + 3 command dirs |
| **Agent F: Voucher commands** | `voucher add` + all 4 template commands (sale, expense, transfer, owner), voucher group index | commands/voucher/ |

**Phase 3: Integration (sequential, orchestrator)**

- Merge all worktree branches
- Register all commands in `cli/src/index.ts`
- Run full test suite: `bun test` + `test-all ./sie_test_files`
- Fix any integration issues

### Agent Contract Boundaries

```
Agent D (sie-core) exports:
  ├── VoucherValidator.validate(voucher, doc?) → ValidationResult
  ├── BalanceRecalculator.recalculate(doc) → RecalculationResult
  └── AccountLookup.search/byRange/byType(doc) → AccountInfo[]

Agent E (CLI infra) exports:
  ├── writeSieFile(doc, path, opts?) → void
  ├── renderVoucherPreview(voucher, doc) → string
  └── computeVatSplit(total, rate) → {net, vat, accounts}

Agent F (voucher commands) consumes:
  ├── parseFile() from shared/parseFile.ts (existing)
  ├── VoucherValidator from sie-core
  ├── BalanceRecalculator from sie-core
  ├── writeSieFile from Agent E
  ├── renderVoucherPreview from Agent E
  └── computeVatSplit from Agent E
```

### Synchronization Points

1. After Phase 0 (contracts): all agents have identical type definitions to code against
2. After Phase 1 (tests): test files merged into main, ready for implementation
3. After Phase 2 (impl): worktree merges, integration testing
4. Phase 3: final wiring + regression check

---

## Verification

1. `bun test packages/sie-core` — validator, recalculator, lookup unit tests pass
2. `bun test packages/cli` — all e2e tests pass
3. Manual test: add a sale voucher to Dennis's 2022 file, verify `balance-sheet` reflects it
4. Manual test: add an expense with 25% VAT, verify `moms` shows updated VAT amounts
5. `skattata test-all ./sie_test_files` — 127/127 still pass (no regression)
6. `skattata --help` — shows new commands in organized groups
