# Plan: TypeScript Port of Skattata + CLI

## Context

Skattata is a mature C# library for parsing/writing Swedish SIE accounting files (SIE 1-4 tag-based + SIE 5 XML). The goal is to port the core library to TypeScript using Bun, implement it in a git worktree to keep the C# repo untouched, and create a CLI that serves as E2E integration tests against the 82 real-world SIE test files. The CLI will generate Swedish financial statements: balance sheet, income statement, and momsdeklaration (VAT return).

**Execution model:** Implementation is driven by the `first-responder` CLI (`~/Code/y/first-responder`) — `fr start "goal"` orchestrates Claude to implement the plan. This plan file IS the goal.

---

## Phase 0: Git Worktree Setup

```bash
git worktree add ../Skattata-ts ts/typescript-port
cd ../Skattata-ts
ln -s ../Skattata/Skattata.Tests/sie_test_files ./sie_test_files
```

- Branch: `ts/typescript-port`
- Worktree dir: `../Skattata-ts` (sibling to main repo)
- Symlink test files so the 82 real-world SIE files are available

---

## Project Structure

```
Skattata-ts/
├── packages/
│   ├── sie-core/                     ← Pure library (publishable)
│   │   ├── src/
│   │   │   ├── models/               ← SieDocument, SieAccount, SieVoucher, etc.
│   │   │   ├── parser/
│   │   │   │   ├── SieTagParser.ts   ← SIE 4 tag-based parser
│   │   │   │   └── SieXmlParser.ts   ← SIE 5 XML parser
│   │   │   ├── writer/
│   │   │   │   └── SieDocumentWriter.ts
│   │   │   ├── comparer/
│   │   │   │   └── SieDocumentComparer.ts
│   │   │   └── utils/
│   │   │       ├── encoding.ts       ← iconv-lite CP437
│   │   │       ├── lineParser.ts     ← splitLine() regex utility
│   │   │       └── crc32.ts
│   │   └── tests/unit/ + integration/
│   └── cli/                          ← CLI package
│       ├── src/
│       │   ├── commands/             ← parse, validate, balance-sheet, income-statement, moms, k4, test-all
│       │   ├── statements/           ← calculators for each financial statement type
│       │   ├── formatters/           ← table, json, csv output
│       │   └── index.ts              ← CLI entry point (commander)
│       └── tests/e2e/
├── sie_test_files/                   ← symlink → ../Skattata/Skattata.Tests/sie_test_files/
├── package.json                      ← Bun workspace root
└── bunfig.toml
```

---

## Tech Stack

| Package | Purpose |
|---|---|
| `iconv-lite` | Decode/encode IBM Codepage 437 (CP437) for SIE 4 files — no native Bun support |
| `fast-xml-parser` | SIE 5 XML parsing — pure JS, handles attributes |
| `commander` | CLI subcommand framework |
| `chalk` | Terminal color output |
| `cli-table3` | Formatted terminal tables for financial statements |
| `bun:test` | Built-in test runner — no extra deps |

---

## Implementation Order (TDD)

### 1. Models (Day 1)

Port in dependency order — no logic, just typed classes:

| File | Maps From |
|---|---|
| `models/SieBookingYear.ts` | `SieBookingYear.cs` — `id, startDate, endDate` |
| `models/SiePeriodValue.ts` | `SiePeriodValue.cs` — `bookingYear, period, value, quantity` |
| `models/SieObject.ts` | `SieObject.cs` — `dimensionNumber, number, name, openingBalance, closingBalance` |
| `models/SieDimension.ts` | `SieDimension.cs` — `number, name, objects: Map<string, SieObject>` |
| `models/SieAccount.ts` | `SieAccount.cs` — add `type: 'T'\|'S'\|'I'\|'K'\|''` (from `#KTYP`, missing in C#) |
| `models/SieVoucherRow.ts` | `SieVoucherRow.cs` — `accountNumber, objects, amount, transactionDate, rowText, quantity` |
| `models/SieVoucher.ts` | `SieVoucher.cs` — `series, number, date, text, registrationDate, rows` |
| `models/SieDocument.ts` | `SieDocument.cs` — aggregate root: `companyName, organizationNumber, bookingYears, accounts, vouchers, dimensions, errors` |

### 2. Encoding Utility (Day 1)

**File:** `src/utils/encoding.ts`

```typescript
import iconv from 'iconv-lite';
export const decodeSie4 = (buf: Buffer): string => iconv.decode(buf, 'cp437');
export const encodeSie4 = (str: string): Buffer => iconv.encode(str, 'cp437');
```

Unit test: decode known CP437 bytes for å(0x86), ä(0x84), ö(0x94) → assert correct Unicode.

### 3. Line Parser Utility (Day 1)

**File:** `src/utils/lineParser.ts`

Port the C# `SplitLine()` regex exactly. JavaScript lookbehind (`(?<=...)`) works in Bun/V8:

```typescript
const SPLITTER = /(?<=^[^{}"]*("[^{}"]*"[^{}"]*)*) (?=(?:[^"]*"[^"]*")*[^"]*$)/g;

export function splitLine(line: string): string[] {
  return line.trim().split(SPLITTER)
    .map(p => p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p)
    .filter(p => p.length > 0);
}
```

Unit tests (required before moving on):
- `#FNAMN "Test Company"` → `['#FNAMN', 'Test Company']`
- `#KONTO 6110 "Phone and internet"` → `['#KONTO', '6110', 'Phone and internet']`
- `#TRANS 1910 {1 "100"} 500.00` → `['#TRANS', '1910', '{1 "100"}', '500.00']`
- `#VER A 1 20240101 ""` → `['#VER', 'A', '1', '20240101', '']`

### 4. SIE 4 Tag Parser (Days 2-3)

**File:** `src/parser/SieTagParser.ts`

Port the nested `SieTagParser` class from `SieDocument.cs:50-373`.

**Critical notes:**
- Read entire file as `Buffer` via `Bun.file().arrayBuffer()`, decode with `iconv-lite` (CP437), then split lines
- Format auto-detection: if first non-empty line starts with `<?xml` → delegate to `SieXmlParser`
- Voucher parsing: pre-split all lines into array, use cursor index; advance past `{` after `#VER`, collect `#TRANS` until `}`
- Replicate the `#PSALDO` quirk (C# `SieDocument.cs:268-303`): when element 4 contains joined `{objects} balance`, split at `}` first
- Handle `#KTYP accountId type` → set `account.type`
- Handle `#BTRANS` / `#RTRANS` same as `#TRANS` (supplementary/removed rows — store in voucher)
- Silently drop unknown tags (same behavior as C#)
- Implement `SieCallbacks` — `readVoucher?: (v: SieVoucher) => boolean` callback after each complete voucher

Key tags to parse: `#FNAMN`, `#ORGNR`, `#KONTO`, `#KTYP`, `#SRU`, `#DIM`, `#OBJEKT`/`#OBJECT`, `#RAR`, `#IB`, `#UB`, `#RES`, `#OIB`, `#OUB`, `#PSALDO`, `#PRES`, `#VER`, `#TRANS`

### 5. SIE 5 XML Parser (Day 3)

**File:** `src/parser/SieXmlParser.ts`

Use `fast-xml-parser`. Handle TWO root variants present in the 82 test files:
- `<Sie>` root (full export: `FileInfo > Company`, top-level `Accounts`, `Journal`)
- `<SieEntry>` root (import format, may lack `Journal`)

Map XML → `SieDocument` fields as per the nested `SieXmlParser` class in `SieDocument.cs:375-516`.

### 6. Writer (Day 4)

**File:** `src/writer/SieDocumentWriter.ts`

Port `SieDocumentWriter.cs`. Quote logic (critical for round-trip): parameters with spaces, empty strings, or backslashes get quoted; `{...}` notation never quoted. Write output as CP437 Buffer via `iconv-lite`.

### 7. Comparer (Day 4)

**File:** `src/comparer/SieDocumentComparer.ts`

Port `SieDocumentComparer.cs`. Returns `string[]` of diff errors. Compares: `companyName`, `format`, account count + names, voucher count + series/number/date/text.

### 8. Financial Statement Calculators (Day 5)

New code — does not exist in C#. Uses Swedish BAS account number ranges:

**`BalanceSheetCalculator.ts`**
- Assets: accounts `1000-1999` (closing balance)
- Equity: accounts `2000-2099`
- Liabilities: accounts `2100-2999`

**`IncomeStatementCalculator.ts`**
- Revenue: `3000-3999` (result)
- COGS: `4000-4999`
- Expenses: `5000-7999`
- Financial: `8000-8999`
- Net = Revenue − all expense groups

**`MomsCalculator.ts`** (Momsdeklaration / SKV 4700)
- Outgoing VAT 25%: account `2610` → Field 10
- Outgoing VAT 12%: account `2620` → Field 11
- Outgoing VAT 6%: account `2630` → Field 12
- Incoming VAT (input): account `2640` → Field 48
- Net VAT to pay: sum(261x+262x+263x) - 2640 → Field 49
- Sales base 25%: account `3010` → Field 05

~~K4 — out of scope~~

### 9. CLI Commands (Days 5-6)

**Entry:** `packages/cli/src/index.ts` — `#!/usr/bin/env bun`

| Command | Description |
|---|---|
| `skattata parse <file> [--format table\|json\|csv] [--accounts] [--vouchers]` | Parse and display document summary |
| `skattata validate <file> [--verbose]` | Round-trip validation (parse→write→parse→compare) |
| `skattata balance-sheet <file> [--format] [--year n]` | Balance sheet |
| `skattata income-statement <file> [--format] [--year n]` | P&L statement |
| `skattata moms <file> [--format] [--period YYYYMM]` | Momsdeklaration |
| ~~`skattata k4`~~ | ~~K4 — out of scope~~ |
| `skattata test-all <dir> [--stop-on-error] [--report file.json]` | E2E test all SIE files |

### 10. E2E Integration Tests (Day 6)

**File:** `packages/cli/tests/e2e/parseAllFiles.e2e.test.ts`

Uses `Bun.spawnSync` to call the actual CLI binary against all 82 test files. Asserts:
- `exitCode === 0` for all parse commands
- `validate` passes round-trip for all SIE 4 files (SIE 5 XML files may be read-only)

The `test-all` CLI command itself also serves as the integration test runner:
```bash
skattata test-all ./sie_test_files --report results.json
```

---

## Critical Files to Reference During Implementation

| C# File | Purpose |
|---|---|
| `Skattata.Core/SieDocument.cs` | Both model fields AND both parser classes (lines 50-516) |
| `Skattata.Core/SieDocumentWriter.cs` | Writer + exact `WriteLine` quoting logic |
| `Skattata.Tests/IntegrationTests.cs` | Round-trip test methodology to replicate in E2E |
| `Skattata.Tests/sie_test_files/SIE4 Exempelfil.SE` | Real file showing `#KTYP`, `#ADRESS`, `#TAXAR`, `#VALUTA` tags |
| `Skattata.Tests/sie_test_files/Sample.sie` | `<Sie>`-rooted SIE 5 variant |
| `Skattata.Tests/sie_test_files/SampleEntry.sie` | `<SieEntry>`-rooted SIE 5 variant |

---

## Known Pitfalls

1. **`#PSALDO` quirk** — C# `SieDocument.cs:268-303`: when element 4 contains joined `{objects} balance`, split at `}` to separate them. Must replicate or several test files fail.
2. **CP437 round-trip** — write-back must re-encode to CP437. Characters with no CP437 equivalent should error clearly.
3. **Decimal precision** — JS `number` (IEEE 754) vs C# `decimal`. Use `parseFloat` for parsing; display with `.toFixed(2)`.
4. **File extension casing** — use `/\.(se|si|sie)$/i` (case-insensitive); some files are `.SE`.
5. **`String.split()` with global regex in JS** — behavior differs from C# `Regex.Split()`; unit test all boundary cases in Phase 3.
6. **SIE 5 has two root variants** — `<Sie>` and `<SieEntry>`; handle both.
7. **K4 limitation** — K4 needs per-trade data; SIE files typically aggregate. The calculator will return best-effort from account 8xxx data; document the limitation in CLI output.

---

## Verification

```bash
# Unit tests pass
bun test packages/sie-core

# Most SIE test files parse without errors (some C# tests already failing — expected)
# Failures may be due to unfinished C# work or faulty SIE files — tolerated
skattata test-all ./sie_test_files --report results.json

# Round-trip validates
skattata validate ./sie_test_files/Sie4.se --verbose

# Financial statements produce output
skattata balance-sheet ./sie_test_files/Sie4.se --format json
skattata moms ./sie_test_files/Sie4.se
```

**Note on test failures:** The CLI is the canonical source, NOT the C# console app. Some SIE test files are known-broken or test unfinished C# features — the TypeScript CLI should pass on the majority and clearly report which files fail and why.

---

## How to Execute This Plan

Use `first-responder` CLI (`~/Code/y/first-responder`) to drive implementation:

```bash
# Start the first-responder server (if not already running)
cd ~/Code/y/first-responder
dotnet run --project src/FirstResponder &

# Start a flow — paste the content of this plan file as the goal
fr start "$(cat /Users/Dennis.Dyall/Code/other/Skattata/Plans/wondrous-wiggling-piglet.md)" \
  --repo Dennis-Dyall/Skattata

# Or interactively
fr start
# then paste the plan content
```

The worktree (`../Skattata-ts`, branch `ts/typescript-port`) should be set up manually first or as the first step in the goal.

Monitor at: `http://localhost:5000/dashboard`

---

## Implementation Timeline

| Day | Deliverables |
|---|---|
| 1 | Worktree + workspace setup, all models, encoding, lineParser (with unit tests) |
| 2-3 | SIE 4 Tag Parser (full + unit tests passing all 82 files) |
| 3 | SIE 5 XML Parser |
| 4 | Writer + Comparer + round-trip tests |
| 5 | Statement calculators (balance sheet, P&L, moms, K4) |
| 5-6 | CLI commands + formatters |
| 6 | E2E integration tests against all 82 files |
