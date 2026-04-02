# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Skattata is a TypeScript library for parsing and writing Swedish accounting files in the SIE format (Standard Import Export). The library supports both SIE 4 (tag-based text format with IBM Codepage 437 encoding) and SIE 5 (XML format) specifications.

## Project Structure

```
packages/
  sie-core/          # Core library: parsers, writer, models, utilities
  cli/               # skattata CLI: parse, validate, balance-sheet, moms, test-all
sie_test_files/      # 82 real-world SIE files used for integration testing
docs/                # SIE format specifications
Plans/               # Implementation plans
```

## Common Development Commands

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Run only the core library tests
bun test packages/sie-core

# E2E: parse and validate all 82 SIE test files
bun run packages/cli/src/index.ts test-all ./sie_test_files

# CLI commands
bun run packages/cli/src/index.ts parse <file>
bun run packages/cli/src/index.ts validate <file>
bun run packages/cli/src/index.ts balance-sheet <file>
bun run packages/cli/src/index.ts income-statement <file>
bun run packages/cli/src/index.ts moms <file> [--period YYYYMM]
```

## Key Architecture

### sie-core

- **`src/models/`** — Data model classes: `SieDocument`, `SieAccount`, `SieVoucher`, `SieVoucherRow`, `SieDimension`, `SieObject`, `SieBookingYear`, `SiePeriodValue`
- **`src/parser/SieTagParser.ts`** — SIE 4 tag-based parser. Auto-detects format, handles CP437, parses all tags (`#KONTO`, `#VER`, `#TRANS`, `#PSALDO`, etc.)
- **`src/parser/SieXmlParser.ts`** — SIE 5 XML parser. Handles both `<Sie>` and `<SieEntry>` root variants
- **`src/writer/SieDocumentWriter.ts`** — Writes `SieDocument` back to SIE 4 format with correct CP437 encoding
- **`src/comparer/SieDocumentComparer.ts`** — Compares two parsed documents for round-trip validation
- **`src/utils/encoding.ts`** — CP437 (IBM PC-8) encode/decode via iconv-lite
- **`src/utils/lineParser.ts`** — Regex line splitter that handles quoted strings and `{dim obj}` notation

### Critical Parsing Notes

- SIE 4 files use **Codepage 437 (IBM PC-8)** — always decode with `iconv-lite` before parsing
- Line splitter regex handles quoted strings with spaces and `{dimNo "objNo"}` object notation
- The `#PSALDO` tag has a quirk: element 4 may contain joined `{objects} balance` — split at `}` first
- Date format: `yyyyMMdd` (e.g. `20240101`). Decimal: invariant culture (dot separator)
- `#KTYP` stores account type: `T`=assets, `S`=liabilities, `I`=income, `K`=expenses

### SIE File Types

- **SIE 1** (`.se`) — year-end balances only
- **SIE 2** (`.se`) — monthly period balances
- **SIE 3** (`.se`) — with dimension/cost center balances
- **SIE 4** (`.se`) — full transactional data
- **SIE 4i** (`.si`) — import format (vouchers only)
- **SIE 5** (`.sie`) — XML format

## Testing Strategy

- **Unit tests** (`packages/sie-core/tests/unit/`) — encoding, line parser, tag parser, writer, comparer
- **Integration tests** (`packages/sie-core/tests/integration/`) — parse all 82 SIE files, round-trip validation
- **E2E** (`skattata test-all ./sie_test_files`) — CLI-level validation of all files

Some SIE test files are known to produce no parsed content (e.g. certain Norstedts exports with non-standard encoding). This is expected and matches the original C# behaviour.

## BAS Account Ranges (for financial statement calculators)

| Range | Category |
|-------|----------|
| 1000–1999 | Assets (Tillgångar) |
| 2000–2099 | Equity (Eget kapital) |
| 2100–2999 | Liabilities (Skulder) |
| 3000–3999 | Revenue (Intäkter) |
| 4000–7999 | Expenses (Kostnader) |
| 8000–8999 | Financial items |

## Momsdeklaration (SKV 4700) Account Mapping

| Account | Field | Description |
|---------|-------|-------------|
| 2610 | Ruta 10 | Outgoing VAT 25% |
| 2620 | Ruta 11 | Outgoing VAT 12% |
| 2630 | Ruta 12 | Outgoing VAT 6% |
| 2640 | Ruta 48 | Incoming VAT (deductible) |
| Net | Ruta 49 | (2610+2620+2630) − 2640 |

## Runtime

- **Bun** — runtime, package manager, test runner
- **iconv-lite** — CP437 encoding/decoding
- **fast-xml-parser** — SIE 5 XML parsing
- **commander** — CLI framework
