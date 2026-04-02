# Skattata

TypeScript library and CLI for parsing, writing, and validating Swedish accounting files in the **SIE format** (Standard Import Export). Supports SIE 1–4 (tag-based, IBM Codepage 437) and SIE 5 (XML).

## Install

```bash
bun install
```

## CLI

```bash
bun run packages/cli/src/index.ts <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `parse <file>` | Display document summary: company, org number, accounts, vouchers, errors |
| `validate <file>` | Round-trip test: parse → write SIE 4 → re-parse → compare. Exits 0 on PASS. |
| `balance-sheet <file>` | Balance sheet (balansräkning) from closing balances, BAS accounts 1000–2999 |
| `income-statement <file>` | P&L (resultaträkning) from period results, BAS accounts 3000–8999 |
| `moms <file>` | VAT return (momsdeklaration) with SKV 4700 field codes (05/10/11/12/48/49) |
| `sru-report <file>` | Tax declaration report (INK2R/NE) aggregating balances by SRU code |
| `test-all <dir>` | Batch-parse every `.se`/`.si`/`.sie` file and report PASS/FAIL |

All commands support `--format table|json|csv`. Use `--help` on any command for full options including examples.

### Examples

**Parse a SIE file:**

```bash
bun run packages/cli/src/index.ts parse ./sie_test_files/Sie4.se
```

```
┌───────────────┬──────────────────┐
│ Company       │ Demoföretaget AB │
├───────────────┼──────────────────┤
│ OrgNo         │ 556654-7898      │
├───────────────┼──────────────────┤
│ Format        │ PC8              │
├───────────────┼──────────────────┤
│ Booking years │ 1                │
├───────────────┼──────────────────┤
│ Accounts      │ 291              │
├───────────────┼──────────────────┤
│ Vouchers      │ 70               │
├───────────────┼──────────────────┤
│ Errors        │ 0                │
└───────────────┴──────────────────┘
```

**Momsdeklaration (VAT return):**

```bash
bun run packages/cli/src/index.ts moms ./sie_test_files/Sie4.se
```

```
┌──────┬─────────────────┬──────────────┐
│ Code │ Label           │ Amount       │
├──────┼─────────────────┼──────────────┤
│ 05   │ Taxable sales   │ 0.00         │
│ 10   │ Output VAT 25%  │ 21639695.57  │
│ 11   │ Output VAT 12%  │ 120.00       │
│ 12   │ Output VAT 6%   │ 95.40        │
│ 48   │ Input VAT       │ 1137249.27   │
│ 49   │ Net VAT payable │ -22777160.24 │
└──────┴─────────────────┴──────────────┘
```

**Validate all SIE files in a directory:**

```bash
bun run packages/cli/src/index.ts test-all ./sie_test_files --report results.json
```

```
Total: 127 | Passed: 127 | Failed: 0
```

**Generate SRU tax declaration file:**

```bash
bun run packages/cli/src/index.ts sru-report ./sie_test_files/Sie4.se --output ink2r.sru
```

```
Written to /path/to/ink2r.sru
```

```bash
bun run packages/cli/src/index.ts sru-report ./sie_test_files/Sie4.se --format sru
```

```
#BLANKETT INK2R
#IDENTITET 5566547898 20240401 143022
#NAMN Demoföretaget AB
#SYSTEMINFO skattata 0.1.0
#UPPGIFT 7201 1500000
#UPPGIFT 7410 2200000
#BLANKETTSLUT
#FIL_SLUT
```

## Library

```typescript
import { parseSie4File, parseSie5File, writeSie4 } from '@skattata/sie-core';

// Parse SIE 4 (tag-based, CP437)
const doc = await parseSie4File('./accounting.se');
console.log(doc.companyName);     // "Demoföretaget AB"
console.log(doc.accounts.size);   // 291
console.log(doc.vouchers.length); // 70

// Parse SIE 5 (XML)
const xmlDoc = await parseSie5File('./accounting.sie');

// Write back to SIE 4 format
await writeSie4(doc, './output.se');
```

### Streaming with callbacks

```typescript
import { parseSie4File } from '@skattata/sie-core';

const doc = await parseSie4File('./large.se', {
  readVoucher: (voucher) => {
    // Return false to skip this voucher (useful for large files)
    return voucher.date.getFullYear() === 2024;
  },
});
```

## Tests

```bash
# Unit + integration tests (112 tests across 6 files)
bun test packages/sie-core

# E2E: parse and validate 81 real-world SIE files
bun run packages/cli/src/index.ts test-all ./sie_test_files
```

## SIE Format Reference

| Type | Extension | Content |
|---|---|---|
| SIE 1 | `.se` | Year-end opening/closing balances |
| SIE 2 | `.se` | SIE 1 + monthly period balances (`#PSALDO`) |
| SIE 3 | `.se` | SIE 2 + dimension/cost-centre balances |
| SIE 4 | `.se` | SIE 3 + full transaction vouchers (`#VER`/`#TRANS`) |
| SIE 4i | `.si` | Import format — vouchers only |
| SIE 5 | `.sie` | XML format with digital signatures |

SIE 4 files use **IBM Codepage 437** encoding. The library handles this transparently via `iconv-lite`.

### Key tags

`#FNAMN` company name · `#ORGNR` org number · `#RAR` fiscal year · `#KONTO` account · `#KTYP` account type · `#SRU` tax code · `#DIM` dimension · `#OBJEKT` cost centre object · `#IB`/`#UB` opening/closing balance · `#RES` result · `#PSALDO` period balance · `#VER` voucher · `#TRANS` transaction row

## BAS Chart of Accounts

The financial statement commands use standard Swedish BAS account number ranges:

| Range | Category |
|---|---|
| 1000–1999 | Assets (Tillgångar) |
| 2000–2099 | Equity (Eget kapital) |
| 2100–2999 | Liabilities (Skulder) |
| 3000–3999 | Revenue (Intäkter) |
| 4000–7999 | Expenses (Kostnader) |
| 8000–8999 | Financial items |
