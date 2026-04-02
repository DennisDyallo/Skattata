# Skattata

CLI for reading Swedish SIE accounting files and generating tax reports.

## Requirements

[Bun](https://bun.sh) — install with `curl -fsSL https://bun.sh/install | bash`

## Install

```bash
bun install
```

## Usage

```bash
bun run packages/cli/src/index.ts <command> [file] [options]
```

## Commands

| Command | What it does |
|---|---|
| `parse <file>` | Show company name, org number, account count, voucher count |
| `validate <file>` | Confirm the file survives a parse → write → re-parse cycle |
| `balance-sheet <file>` | Balance sheet grouped by asset / equity / liability |
| `income-statement <file>` | P&L grouped by revenue / cost / operating expense |
| `moms <file>` | VAT return (momsdeklaration) with SKV 4700 field codes |
| `sru-report <file>` | Tax declaration lines (INK2R / NE) from SRU codes in the file |
| `f-skatt <file>` | Preliminary tax estimate (F-skatt) for enskild firma |
| `test-all <dir>` | Parse every `.se` `.si` `.sie` file in a directory |

Every command supports `--format table|json|csv` and `--help` for full options.

### Cross-command options

| Option | Available on | What it does |
|---|---|---|
| `--tax-year <YYYY>` | f-skatt, income-statement, sru-report | Select tax year for rate calculations (default: latest supported) |
| `--period <YYYYMM>` | balance-sheet, income-statement, moms | Filter to a single period using `#PSALDO` data |
| `--enskild-firma` | income-statement | Show egenavgifter, räntefördelning, expansionsfond estimates |
| `--output-xml <file>` | moms | Write momsdeklaration XML (draft format) |
| `--sni <code>` | moms, sru-report | SNI industry code (5 digits) — included in XML/SRU output |

## Examples

```bash
# What's in this file?
bun run packages/cli/src/index.ts parse annual.se
```
```
┌───────────────┬──────────────────┐
│ Company       │ Demoföretaget AB │
│ OrgNo         │ 556654-7898      │
│ Accounts      │ 291              │
│ Vouchers      │ 70               │
│ Errors        │ 0                │
└───────────────┴──────────────────┘
```

```bash
# VAT return for the year
bun run packages/cli/src/index.ts moms annual.se
```
```
┌──────┬─────────────────┬──────────────┐
│ Code │ Label           │ Amount       │
│ 10   │ Output VAT 25%  │ 21639695.57  │
│ 48   │ Input VAT       │ 1137249.27   │
│ 49   │ Net VAT payable │ -22777160.24 │
└──────┴─────────────────┴──────────────┘
```

```bash
# Tax declaration lines from SRU codes
bun run packages/cli/src/index.ts sru-report annual.se
```
```
┌──────────┬─────────────┬────────────┐
│ SRU Code │ Total (SEK) │ Accounts   │
├──────────┼─────────────┼────────────┤
│ 7281     │ 50000.00    │ 1930       │
├──────────┼─────────────┼────────────┤
│ 7301     │ -50000.00   │ 2081       │
├──────────┼─────────────┼────────────┤
│ 7410     │ 40000.00    │ 3010, 3011 │
└──────────┴─────────────┴────────────┘
```

```bash
# Generate Skatteverket .sru file for electronic submission
bun run packages/cli/src/index.ts sru-report annual.se --output ink2r.sru

# Balance sheet comparing current vs prior year
bun run packages/cli/src/index.ts balance-sheet annual.se --year -1

# Check a whole folder of SIE files
bun run packages/cli/src/index.ts test-all ./exports --report results.json
```
