# CLAUDE.md — Agent reference for Skattata

Skattata is a TypeScript (Bun) CLI + library for parsing, writing, and reporting on Swedish SIE accounting files. The codebase is a Bun workspace monorepo. Read this file before touching any code.

---

## Project Structure

```
packages/
  sie-core/                    # Publishable library — no CLI deps
    src/
      models/                  # Pure data classes, no logic
      parser/
        SieTagParser.ts        # SIE 1–4 tag-based parser (CP437 + tab handling)
        SieXmlParser.ts        # SIE 5 XML parser (fast-xml-parser)
      writer/
        SieDocumentWriter.ts   # Writes SieDocument → SIE 4 CP437 Buffer
      comparer/
        SieDocumentComparer.ts # Field-by-field diff for round-trip testing
      internal/                # Private implementation details (not public API)
        encoding.ts            # iconv-lite CP437 encode/decode
        lineParser.ts          # State-machine token splitter for SIE 4 lines
    tests/
      unit/                    # Per-module unit tests
      integration/             # Parse all 127 real SIE files
  cli/
    src/
      index.ts                 # ~30 lines: program setup + register() calls only
      shared/
        parseFile.ts           # Auto-detects SIE 4/5 and parses to SieDocument
        formatters/
          index.ts             # formatRows(), formatKeyValue(), OutputFormat
      commands/                # Vertical slices — each command owns its logic
        parse/index.ts
        validate/index.ts
        balance-sheet/
          BalanceSheetCalculator.ts
          index.ts
        income-statement/
          IncomeStatementCalculator.ts
          index.ts
        moms/
          MomsCalculator.ts
          index.ts
        sru-report/
          SruReportCalculator.ts
          SruFileWriter.ts     # Writes SKV 269 blanketter.sru flat-file format
          InfoSruWriter.ts     # Writes SKV 269 info.sru companion file
          index.ts
        test-all/index.ts
    tests/
      e2e/                     # Spawns CLI binary, asserts stdout/exit code
sie_test_files/                # 133 test files: 127 real-world (SIE 1–5, various vendors) + 6 synthetic
docs/                          # SIE format PDFs
Plans/                         # Approved implementation plans (read-only history)
```

---

## Dev Commands

```bash
bun install                              # install all workspace deps
bun test                                 # run all tests (156 unit + integration)
bun test packages/sie-core               # library tests only
bun test packages/cli                    # CLI tests only
bun run packages/cli/src/index.ts --help                          # list all 7 commands
bun run packages/cli/src/index.ts parse <file>
bun run packages/cli/src/index.ts validate <file>
bun run packages/cli/src/index.ts balance-sheet <file> [--year -1]
bun run packages/cli/src/index.ts income-statement <file>
bun run packages/cli/src/index.ts moms <file> [--period YYYYMM]
bun run packages/cli/src/index.ts sru-report <file> [--output ink2r.sru]
bun run packages/cli/src/index.ts test-all ./sie_test_files           # E2E: 127/127 must pass
```

**Gate:** before committing any parser change, `test-all ./sie_test_files` must show 127/127.

---

## Key Models (`packages/sie-core/src/models/`)

### SieDocument
```
companyName: string
organizationNumber: string
format: string                   // 'PC8' for SIE 4, 'SIE5' for XML
sieType: number                  // from #SIETYP (1/2/3/4)
flagga: number                   // 0=export, 1=import (SIE 4i)
currency: string                 // from #VALUTA, default 'SEK'
program: string                  // from #PROGRAM (exporting software name)
generatedAt: string              // from #GEN (raw date string)
bookingYears: SieBookingYear[]
accounts: Map<string, SieAccount>
vouchers: SieVoucher[]
dimensions: SieDimension[]
errors: string[]
```

### SieAccount
```
accountId: string
name: string
type: 'T'|'S'|'I'|'K'|''        // T=tillgång S=skuld I=intäkt K=kostnad
sruCode: string                  // from #SRU — used by SruReportCalculator
unit: string
openingBalance: number           // year-0 convenience scalar (from #IB 0)
closingBalance: number           // year-0 convenience scalar (from #UB 0)
result: number                   // year-0 convenience scalar (from #RES 0)
yearBalances: Map<number, { opening: number; closing: number; result: number }>
  // keyed by year index: 0=current, -1=prior, -2=two years back
periodValues: SiePeriodValue[]   // from #PSALDO / #PRES
```

### SieDimension
```
number: string
name: string
parentNumber: string             // from optional 3rd param of #DIM
objects: Map<string, SieObject>
```

### SiePeriodValue
```
bookingYear: SieBookingYear | null
period: string                   // YYYYMM
value: number
objects: Array<{ dimensionNumber: string; number: string }>
```

### SieVoucher / SieVoucherRow
```
// Voucher: series, number, date, text, registrationDate, registrationSign, rows[]
// Row: accountNumber, amount, transactionDate, rowText, objects[], quantity
```

---

## Critical Parser Notes (`SieTagParser.ts`)

**Always read the parser before modifying it.**

- **Encoding:** Read entire file as Buffer, decode CP437 via `iconv-lite` (`decodeSie4(buf)`). Never open SIE 4 files as UTF-8.
- **UTF-8 BOM detection:** Check raw bytes 0xEF 0xBB 0xBF before CP437 decode — BOM means the file is XML (SIE 5), route to `SieXmlParser`.
- **Tab separator:** Some vendors (Visma Compact, SoftOne XE, Norstedts) use `\t` or `\t\t` instead of spaces. Line is normalized with `rawLine.replace(/\t+/g, ' ')` before `splitLine()`. Do NOT remove this.
- **Line endings:** Handled by split regex `/\r\n|\r|\n/` — supports CRLF, LF, and bare CR (old Mac exports).
- **`#PSALDO` quirk:** When `tokens.length === 5` and `tokens[4]` contains a space, token 4 may be a joined `{objects} balance` string. `normalizePsaldoTokens()` splits it at `}`. Also handles case of no `{}` at all (injects implicit `{}`).
- **On-demand creation:** `#IB`/`#UB`/`#RES` and `#PSALDO` create accounts on-demand if not declared by `#KONTO`. `#OBJEKT` creates dimensions on-demand if not declared by `#DIM`. This is required — some SIE 4i files have balances with no chart of accounts.
- **`safeParseFloat()`:** All balance parsing uses this helper — returns 0 for NaN. Never use raw `parseFloat()` on tokens from SIE files.
- **`parseDate()`:** Validates 8 digits before constructing — returns `new Date(0)` sentinel for malformed dates (not `Invalid Date`).
- **`#KONTO` with no name:** `if (tokens.length >= 2)` — creates account with empty name if name is absent.
- **Malformed `#VER`:** If `tokens.length < 4`, still scans forward past `{...}` to avoid leaking rows into the top-level switch.

### Parser Audit — LOW items (disposition)

| Item | Decision |
|---|---|
| `parseDate` returns `new Date(0)` sentinel (not `Date \| null`) | **Keep sentinel** — callers check `date.getTime() === 0`. Changing to `Date \| null` would touch every caller with no correctness benefit. JSDoc added to the method. |
| `normalizePsaldoTokens` no-brace edge case (`tokens.length === 5`, no `{}`) | **Already handled** — the `else` branch injects `{}` when the 5th token has no space and no brace. Verified by existing tests. |
| `yearBalances` sort order | **Not applicable** — `Map` preserves insertion order (SIE tag order = current year first, prior years after). No sort needed or applied. |
| CRLF line endings in `SieDocumentWriter` | **Intentional per SIE spec** — `lines.join('\r\n') + '\r\n'`. Not configurable by design; the SIE 4 spec mandates CRLF. |

---

## Line Parser (`lineParser.ts`)

State-machine tokeniser. Key invariants:
- Spaces inside `"..."` do NOT split
- Spaces inside `{...}` do NOT split (braceDepth tracking)
- `\"` inside quoted strings is an escaped quote (prevCh tracking)
- `\\` collapses to one backslash and resets prevCh to `''`
- `{1 "P100"}` is always ONE token — verified in tests

---

## Adding a New CLI Command

**Recipe:**

1. Create `packages/cli/src/commands/my-command/MyCalculator.ts`:
   ```typescript
   import type { SieDocument } from '@skattata/sie-core';
   export interface MyResult { ... }
   export class MyCalculator {
     calculate(doc: SieDocument, ...args): MyResult { ... }
   }
   ```

2. Create `packages/cli/src/commands/my-command/index.ts`:
   ```typescript
   import type { Command } from 'commander';
   import { MyCalculator } from './MyCalculator.js';
   import { parseFile } from '../../shared/parseFile.js';
   import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';

   export function register(program: Command): void {
     program
       .command('my-command <file>')
       // ...
   }
   ```

3. Add one line to `packages/cli/src/index.ts`:
   ```typescript
   import { register as registerMyCommand } from './commands/my-command/index.js';
   // ...
   registerMyCommand(program);
   program
     .command('my-command <file>')
     .description('One sentence description')
     .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
     .addHelpText('after', `\nExamples:\n  $ skattata my-command annual.se\n`)
     .action(async (file, options) => {
       const doc = await parseFile(file);
       const result = new MyCalculator().calculate(doc);
       const headers = ['Col1', 'Col2'];
       const rows = result.items.map(i => [i.a, i.b]);
       console.log(formatRows(headers, rows, options.format ?? 'table'));
     });
   ```

3. Follow existing patterns: `BalanceSheetCalculator.ts` and `MomsCalculator.ts` are the canonical examples.

---

## Testing

```
packages/sie-core/tests/unit/
  encoding.test.ts          CP437 encode/decode
  lineParser.test.ts        splitLine() edge cases incl. escapes
  sieTagParser.test.ts      tag-by-tag parser coverage
  sieDocumentWriter.test.ts round-trip write/parse
  sieDocumentComparer.test.ts diff logic
  newFeatures.test.ts       yearBalances, sieType, PSALDO objects,
                            on-demand creation, parseDate validation

packages/sie-core/tests/integration/
  integration.test.ts       Parses all 127 real SIE files, checks errors[]

sie_test_files/             133 test files total:
  127 real-world files (named <sietype>-<vendor>-<description>.<ext>):
  - Original 72 from C# test suite (SIE 1–5, Visma/MAMUT/Magenta/SoftOne)
  - 51 from blinfo/Sie4j (deliberate edge cases: UTF-8, imbalanced, missing fields)
  - 4 from iCalcreator/Sie5Sdk (SIE 5 XML variants)
  synthetic/                6 hand-crafted files with provable expected outputs:
  - skattata-test-balanced-annual.se     Balance sheet: assets=equity=150000, diff=0
  - skattata-test-income-statement.se    Income statement: revenue=100000, COGS=80000, net=20000
  - skattata-test-moms-annual.se         Moms: output VAT 25000, input 10000, net payable 15000
  - skattata-test-moms-period.se         Moms by period: Jan=7500, Feb=7500
  - skattata-test-moms-refund.se         Moms: net -20000 (refund scenario)
  - skattata-test-sru-report.se          SRU: 7281=50000, 7301=-50000, 7410=40000
```

**When to run what:**
- After any parser change → `bun test packages/sie-core` + `test-all ./sie_test_files`
- After any CLI change → `bun test packages/cli` + manual `--help` spot-check
- Before committing → both, 0 fail required

---

## SIE Tag Reference

| Tag | Format | Stored on |
|---|---|---|
| `#FNAMN` | name | `doc.companyName` |
| `#ORGNR` | orgNo | `doc.organizationNumber` |
| `#SIETYP` | n | `doc.sieType` |
| `#FLAGGA` | n | `doc.flagga` |
| `#VALUTA` | code | `doc.currency` |
| `#PROGRAM` | name | `doc.program` |
| `#GEN` | date [sign] | `doc.generatedAt` |
| `#FORMAT` | PC8 | `doc.format` |
| `#RAR` | id start end | `doc.bookingYears[]` |
| `#KONTO` | id name [unit] | `doc.accounts` |
| `#KTYP` | id T\|S\|I\|K | `acc.type` |
| `#SRU` | accountId sruCode | `acc.sruCode` |
| `#DIM` | id name [parentId] | `doc.dimensions[]` |
| `#OBJEKT` | dimId objId name | `dim.objects` |
| `#IB` | yearId accountId balance | `acc.yearBalances` + scalar |
| `#UB` | yearId accountId balance | `acc.yearBalances` + scalar |
| `#RES` | yearId accountId balance | `acc.yearBalances` + scalar |
| `#OIB`/`#OUB` | yearId accountId {dimId objId} balance | `obj.openingBalance`/`closingBalance` |
| `#PSALDO` | yearId period accountId {objects} balance | `acc.periodValues[]` |
| `#VER` | series number date [text [regDate [sign]]] | `doc.vouchers[]` |
| `#TRANS` | accountId {objects} amount [date [text]] | `voucher.rows[]` |

---

## BAS Account Ranges

| Range | Category | Balance field |
|---|---|---|
| ≤2999 | Balance sheet (assets/equity/liabilities) | `closingBalance` |
| 3000–3999 | Revenue | `result` |
| 4000–7999 | Costs and expenses | `result` |
| 8000–8999 | Financial items | `result` |

Exact splits used by calculators:
- **balance-sheet:** 1000–1999 assets · 2000–2099 equity · 2100–2999 liabilities
- **income-statement:** 3000–3999 revenue · 4000–4999 COGS · 5000–6999 opex · 7000–7999 depreciation · 8000–8999 financial

**`balanceDiff`** on `BalanceSheetResult` = `assets.total − (equity.total + liabilities.total)`. Zero means balanced. Does NOT include `netIncome` — adding it would double-count if 2099 (retained earnings) is already booked. The `BalanceSheetCalculator` calls `IncomeStatementCalculator` internally to derive `netIncome` for display purposes only.

**Sign conventions for display (all calculators apply these):**
- Assets (1xxx): `closingBalance` as-is (positive = asset present)
- Equity/Liability (2xxx): `closingBalance` negated (SIE stores credit as negative; negate for display)
- Revenue (3xxx): `result` negated (credit revenue → positive display)
- Costs (4xxx–8xxx): `result` as-is (debit costs → positive display)

---

## SRU System

SRU (Standardiserade Räkenskapsutdrag) codes appear in SIE files as `#SRU accountId code`. They map accounting data to Swedish tax declaration lines. The mapping was done by the exporting software — we don't need to re-derive it.

- `SruReportCalculator.ts` — groups `acc.sruCode`, sums correct field per account type
- `SruFileWriter.ts` — outputs SKV 269 flat-file format (`#BLANKETT`, `#UPPGIFT`, etc.)
- Form types: `INK2R` (aktiebolag balance+P&L) · `INK2S` (tax adjustments) · `NE` (enskild firma)
- Values are truncated integers (`Math.trunc`) per Swedish tax convention

---

## Momsdeklaration (moms command)

| Account | SKV 4700 field | Description |
|---|---|---|
| 3010 | 05 | Taxable sales base |
| 2610 | 10 | Output VAT 25% |
| 2620 | 11 | Output VAT 12% |
| 2630 | 12 | Output VAT 6% |
| 2640 | 48 | Input VAT (deductible) |
| computed | 49 | Net VAT = (2610+2620+2630) − 2640 |

---

## Runtime

- **Bun** — runtime, test runner, package manager (`bun test`, `bun run`)
- **iconv-lite** — CP437 encode/decode (no native Bun CP437 support)
- **fast-xml-parser** — SIE 5 XML parsing
- **commander** — CLI framework
- **chalk + cli-table3** — terminal output formatting
