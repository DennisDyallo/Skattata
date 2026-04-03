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

## Who is this for?

Skattata is built for **Swedish sole proprietors (enskild firma)** who use BAS-standard bookkeeping software (Fortnox, Visma, etc.) and want to generate their tax filings from a SIE export. It produces the financial data and declaration files -- not a complete tax submission platform.

**New to Skattata?** Read the [Getting Started guide](docs/getting-started.md) -- it walks through the full workflow from SIE export to Skatteverket upload.

## What Skattata does NOT do

- **Submit to Skatteverket** -- Skattata generates .sru and XML files in the correct formats. You upload them to Skatteverket's portal yourself.
- **Replace an accountant** -- The tool automates calculations per BAS standards, but tax law has edge cases. Verify results before filing.
- **Handle employees** -- Arbetsgivardeklaration (employer declarations) are not in scope.
- **Generate INK1** -- Personal income tax (capital gains, rental income) is separate from business income.
- **Support K2/K3 NE mapping** -- The default SRU mapping uses K1 (forenklat arsbokslut). Larger businesses using K2/K3 need #SRU tags from their accounting software.
- **Handle K10/K12 forms** -- Partnership and corporation-specific forms are not supported.

### Cross-command options

| Option | Available on | What it does |
|---|---|---|
| `--tax-year <YYYY>` | f-skatt, income-statement, sru-report | Select tax year for rate calculations (default: latest supported) |
| `--period <YYYYMM>` | balance-sheet, income-statement, moms | Filter to a single period using `#PSALDO` data |
| `--form <form>` | sru-report | Declaration form: `ink2r` (aktiebolag), `ne` (enskild firma) |
| `--output <file>` | sru-report | Write Skatteverket .sru flat-file + companion info.sru |
| `--enskild-firma` | income-statement | Show egenavgifter, räntefördelning, expansionsfond estimates |
| `--rantefordelning` | income-statement | Show räntefördelning calculation (requires `--enskild-firma`) |
| `--expansionsfond` | income-statement | Show expansionsfond allocation potential (requires `--enskild-firma`) |
| `--periodisering-reversal <amount>` | sru-report | Återföring av periodiseringsfond, R32/7608 (NE only) |
| `--periodisering-allocate <amount>` | sru-report | Avsättning till periodiseringsfond, R34/7709 (NE only) |
| `--output-xml <file>` | moms | Write momsdeklaration XML (eSKDUpload v6.0 format) |
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
┌──────┬─────────────────────┬───────────┐
│ Code │ Label               │ Amount    │
├──────┼─────────────────────┼───────────┤
│ 05   │ Taxable sales       │ 100000.00 │
│ 10   │ Output VAT 25%      │ 25000.00  │
│ 48   │ Input VAT deduction │ 10000.00  │
│ 49   │ VAT to pay/receive  │ 15000.00  │
└──────┴─────────────────────┴───────────┘
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
