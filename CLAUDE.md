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
        taxRates.ts            # TaxRates interface + getTaxRates(year) — all yearly-changing constants
        sniCodes.ts            # validateSniCode() — 5-digit SNI format check
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
          MomsXmlWriter.ts     # Writes momsdeklaration XML (draft format)
          index.ts
        sru-report/
          SruReportCalculator.ts
          SruFileWriter.ts     # Writes SKV 269 blanketter.sru flat-file format
          InfoSruWriter.ts     # Writes SKV 269 info.sru companion file
          index.ts
        test-all/index.ts
    tests/
      e2e/                     # Spawns CLI binary, asserts stdout/exit code
sie_test_files/                # 142 test files: 127 real-world (SIE 1–5, various vendors) + 15 synthetic
docs/                          # SIE format PDFs + SOURCES.md (authoritative source registry)
Plans/                         # Approved implementation plans (read-only history)
```

---

## Dev Commands

```bash
bun install                              # install all workspace deps
bun test                                 # run all tests (259 unit + integration)
bun test packages/sie-core               # library tests only
bun test packages/cli                    # CLI tests only
bun run packages/cli/src/index.ts --help                          # list all 11 commands
bun run packages/cli/src/index.ts parse <file>
bun run packages/cli/src/index.ts validate <file>
bun run packages/cli/src/index.ts balance-sheet <file> [--year -1]
bun run packages/cli/src/index.ts income-statement <file> [--enskild-firma]
bun run packages/cli/src/index.ts moms <file> [--period YYYYMM]
bun run packages/cli/src/index.ts sru-report <file> [--form ne] [--output ink2r.sru]
bun run packages/cli/src/index.ts f-skatt <file> [--municipality-rate 0.3274]
bun run packages/cli/src/index.ts accounts <file> [--search bank] [--type K] [--range 1000-1999]
bun run packages/cli/src/index.ts recalculate <file> [--backup] [--output <file>]
bun run packages/cli/src/index.ts voucher add <file> --date YYYY-MM-DD --text "..." --debit <acct> <amt> --credit <acct> <amt>
bun run packages/cli/src/index.ts voucher sale <file> --date YYYY-MM-DD --text "..." --amount <n> --vat 25
bun run packages/cli/src/index.ts voucher expense <file> --date YYYY-MM-DD --text "..." --amount <n> --account <acct> --vat 25
bun run packages/cli/src/index.ts voucher transfer <file> --date YYYY-MM-DD --text "..." --amount <n> --from <acct> --to <acct>
bun run packages/cli/src/index.ts voucher owner <file> --date YYYY-MM-DD --text "..." --withdrawal <n>
bun run packages/cli/src/index.ts voucher list <file> [--series A] [--period YYYYMM]
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

sie_test_files/             142 test files total:
  127 real-world files (named <sietype>-<vendor>-<description>.<ext>):
  - Original 72 from C# test suite (SIE 1–5, Visma/MAMUT/Magenta/SoftOne)
  - 51 from blinfo/Sie4j (deliberate edge cases: UTF-8, imbalanced, missing fields)
  - 4 from iCalcreator/Sie5Sdk (SIE 5 XML variants)
  synthetic/                15 hand-crafted files with provable expected outputs:
  - skattata-test-balanced-annual.se     Balance sheet: assets=equity=150000, diff=0
  - skattata-test-expansionsfond.se      Expansionsfond: equity increase 200000, tax 41200 (20.6%)
  - skattata-test-f-skatt.se             F-skatt preliminary tax estimation
  - skattata-test-income-multiyear.se    Multi-year income: year 0=50000, year -1=40000
  - skattata-test-income-statement.se    Income statement: revenue=100000, COGS=80000, net=20000
  - skattata-test-moms-annual.se         Moms: output VAT 25000, input 10000, net payable 15000
  - skattata-test-moms-eu.se             Moms with EU fields: rutor 20/21/30/35/39/50/60
  - skattata-test-moms-period.se         Moms by period: Jan=7500, Feb=7500
  - skattata-test-moms-refund.se         Moms: net -20000 (refund scenario)
  - skattata-test-ne-no-sru.se           NE K1 default mapping: no #SRU tags, verify computed codes
  - skattata-test-period-financial.se    Period filtering: 202301 assets=80000, net=20000; 202304 net=30000
  - skattata-test-rantefordelning-neg.se Rantefordelning with negative capital base
  - skattata-test-rantefordelning.se     Rantefordelning: capital base=200000, allocation=15920
  - skattata-test-sru-no-income.se       SRU with tags but zero net income (balance sheet only)
  - skattata-test-sru-report.se          SRU: 7281=50000, 7301=50000 (equity negated), 7410=40000
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
- `neDefaultSru.ts` — K1 BAS-to-NE-SRU default mapping (see below)
- Form types: `INK2R` (aktiebolag balance+P&L) · `INK2S` (tax adjustments) · `NE` (enskild firma)
- Values are truncated integers (`Math.trunc`) per Swedish tax convention

### NE K1 Default SRU Mapping

When `--form ne` is used and accounts lack `#SRU` tags, `applyDefaultNeSru()` applies the BAS K1 (förenklat årsbokslut) mapping as a preprocessing step before `SruReportCalculator`. Source: BAS Kontogruppen official NE_K1 mapping table (`bas.se/sru/`).

**Key rules:**
- Existing `#SRU` tags are NEVER overwritten (`if (acc.sruCode) continue`)
- First matching range wins (ordered table in `neDefaultSru.ts`)
- 2100-2299 (untaxed reserves, provisions) intentionally unmapped — not used in K1
- 3300-3499 intentionally unmapped — not in K1 chart
- 3970-3989 maps to R2/7401 (asset disposal gains, grants — explicitly R2 in K1)
- 8000-8299, 8500+ gaps intentionally unmapped — unusual financial items need manual classification
- A `console.warn` is emitted when defaults are applied, noting that 3700-3969 defaults to R1 (VAT-liable)

---

## Momsdeklaration (moms command)

Field mapping verified against official Skatteverket eSKDUpload_6p0.dtd.

| BAS Accounts | Ruta | XML Element | Description |
|---|---|---|---|
| 3000-3999 | 05 | ForsMomsEjAnnan | Taxable sales base |
| 2610-2613,2616-2619 | 10 | MomsUtgHog | Output VAT 25% (domestic) |
| 2620-2623,2626-2629 | 11 | MomsUtgMedel | Output VAT 12% (domestic) |
| 2630-2633,2636-2639 | 12 | MomsUtgLag | Output VAT 6% (domestic) |
| 4500-4519 | 20 | InkopVaruAnnatEg | Goods from EU |
| 4520-4529 | 21 | InkopTjanstAnnatEg | Services from EU |
| 2614 | 30 | MomsInkopUtgHog | Output VAT 25% on purchases |
| 2624 | 31 | MomsInkopUtgMedel | Output VAT 12% on purchases |
| 2634 | 32 | MomsInkopUtgLag | Output VAT 6% on purchases |
| 3100-3199 | 35 | ForsVaruAnnatEg | Goods sold to EU |
| 3300-3399 | 39 | ForsTjSkskAnnatEg | Services sold to EU |
| 4545-4548 | 50 | MomsUlagImport | Import tax base |
| 2615 | 60 | MomsImportUtgHog | Import output VAT 25% |
| 2625 | 61 | MomsImportUtgMedel | Import output VAT 12% |
| 2635 | 62 | MomsImportUtgLag | Import output VAT 6% |
| 2640-2669 | 48 | MomsIngAvdr | Input VAT (deductible) |
| computed | 49 | MomsBetala | Net VAT = all output − input |

---

## Tax Rates Module (`shared/taxRates.ts`)

All yearly-changing Swedish tax constants are centralized here. No command file contains hardcoded rates. Every constant cites its authoritative source inline. Full source registry: `docs/SOURCES.md`. Automated verification: `/verify-compliance`.

```typescript
getTaxRates(taxYear: number): TaxRates   // throws if unsupported year
getDefaultTaxYear(): number               // latest supported year (fallback when current year unsupported)
```

**Supported years:** 2024, 2025. Adding a year = one new entry in the `RATES` record.

| Constant | 2024 | 2025 | Source |
|---|---|---|---|
| `egenavgifterRate` | 0.2897 | 0.2897 | Skatteverket |
| `schablonavdrag` | 0.25 | 0.25 | Stable |
| `rantefordelningPositive` | 0.0774 | 0.0796 | Statslåneräntan + 6% |
| `rantefordelningNegative` | 0.0274 | 0.0296 | Statslåneräntan + 1% |
| `expansionsfondRate` | 0.206 | 0.206 | Corporate tax rate |
| `pbb` | 57300 | 58800 | SCB |
| `stateTaxThreshold` | 598500 | 625800 | Skatteverket |
| `stateTaxRate` | 0.20 | 0.20 | Since 2020 |

**Consumers:** f-skatt, income-statement (enskild firma + räntefördelning + expansionsfond), sru-report (NE schablonavdrag).

---

## Period Filtering

`--period YYYYMM` on `balance-sheet` and `income-statement` uses `#PSALDO` data instead of `#UB`/`#RES`.

- Filters to aggregate-level entries only (`pv.objects.length === 0`)
- `BalanceSheetCalculator` passes period to its internal `IncomeStatementCalculator` call
- Warns via stderr when SIE file has no `#PSALDO` data
- Validates format: exactly 6 digits (`/^\d{6}$/`)

---

## Expansionsfond

`--expansionsfond` on `income-statement --enskild-firma` shows expansion fund allocation potential.

- Equity range: **2000-2099 only** (NOT 2100-2999 which are liabilities)
- Base = closing equity − opening equity (negated from SIE credit convention)
- Tax = `Math.trunc(base * rates.expansionsfondRate)`
- Negative/zero base → "no allocation possible"
- Output includes disclaimer: simplified estimate per SKV blankett N6

---

## Moms XML (`MomsXmlWriter.ts`)

`--output-xml <file>` on `moms` writes Skatteverket eSKDUpload Version 6.0 XML.

- Format verified against official DTD: `eSKDUpload_6p0.dtd`
- Root element: `<eSKDUpload Version="6.0">`
- Encoding: `iso-8859-1` (written as Latin-1 bytes)
- DOCTYPE: includes full PUBLIC identifier and system URL
- Elements emitted in DTD-defined order (NOT numerically sorted by ruta)
- Requires `--period` (exit 1 without it)
- `--org-number` optional — falls back to `doc.organizationNumber` from `#ORGNR`
- OrgNr: 10-digit corporate prefixed with `16` to make 12 digits; 12-digit personnummer as-is
- Amounts are truncated integers (`Math.trunc`)
- Only non-zero fields emitted (except `MomsBetala` which is always included)
- `RUTA_DEFINITIONS` constant in `MomsCalculator.ts` is the single source of truth for element ordering

---

## SNI Codes (`shared/sniCodes.ts`)

`--sni <code>` on `sru-report` validates and includes SNI industry codes.

- Format: exactly 5 digits (`/^\d{5}$/`, SNI 2007 / NACE Rev. 2)
- In info.sru: comment line `* SNI: 62010` (not a `#SNI` tag — unconfirmed in SKV 269 spec)
- Not included in moms XML (SNI is not part of the eSKDUpload DTD)

---

## Runtime

- **Bun** — runtime, test runner, package manager (`bun test`, `bun run`)
- **iconv-lite** — CP437 encode/decode (no native Bun CP437 support)
- **fast-xml-parser** — SIE 5 XML parsing
- **commander** — CLI framework
- **chalk + cli-table3** — terminal output formatting
