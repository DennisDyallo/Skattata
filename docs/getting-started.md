# Getting Started -- Skattata for Enskild Firma

This guide walks you through using Skattata to generate your Swedish tax filings from a SIE accounting export. By the end you'll have the files needed for momsdeklaration, NE-bilaga, and F-skatt -- ready to upload to Skatteverket.

## What you need

1. **A SIE 4 file** exported from your accounting software (Fortnox, Visma, Bokio, etc.)
2. **Bun** runtime installed (see [README](../README.md))
3. **Your organisation/personnummer** (usually embedded in the SIE file)

### How to export a SIE file

| Software | Path |
|----------|------|
| Fortnox | Settings > Import/Export > SIE > Export SIE 4 |
| Visma eEkonomi | Administration > Export > SIE file |
| Bokio | Settings > Export > SIE 4 |
| Visma Spcs | File > Export > SIE 4 |

Export the **full year** (SIE type 4) for annual filings. The file will have a `.se`, `.si`, or `.sie` extension.

---

## Step 1: Verify your file

```bash
bun run packages/cli/src/index.ts parse your-export.se
```

Check that company name, org number, and account count look right. If errors > 0, check the file.

```bash
bun run packages/cli/src/index.ts validate your-export.se
```

This round-trips the file (parse > write > re-parse) to confirm nothing is lost.

---

## Step 2: Review your financials

### Balance sheet

```bash
bun run packages/cli/src/index.ts balance-sheet your-export.se
```

Shows assets, equity, and liabilities. The diff should be 0 (balanced). Use `--year -1` to compare with last year.

### Income statement

```bash
bun run packages/cli/src/index.ts income-statement your-export.se --enskild-firma
```

Shows revenue, costs, and net income with egenavgifter estimate. Add flags for more detail:

```bash
# With rantefordelning and expansionsfond
bun run packages/cli/src/index.ts income-statement your-export.se \
  --enskild-firma --rantefordelning --expansionsfond
```

---

## Step 3: Generate momsdeklaration

### Review VAT amounts

```bash
bun run packages/cli/src/index.ts moms your-export.se
```

Output shows Skatteverket ruta codes (05, 10, 11, 12, 48, 49, etc.) with amounts. Verify these match your records.

### Generate XML for Skatteverket

```bash
bun run packages/cli/src/index.ts moms your-export.se \
  --period 202401 --output-xml momsdeklaration.xml
```

`--period` is required for XML output (format: YYYYMM for the reporting period).

**Upload to:** [Skatteverket e-tjänst Moms](https://www.skatteverket.se/foretag/moms) > Fil > Skicka in fil

The XML follows Skatteverket's eSKDUpload version 6.0 format (ISO 8859-1 encoding).

---

## Step 4: Generate NE-bilaga (SRU file)

The NE-bilaga is the tax form for enskild firma. Skattata generates the `.sru` file that Skatteverket accepts for electronic filing.

### Basic NE file

```bash
bun run packages/cli/src/index.ts sru-report your-export.se \
  --form ne --output ne-bilaga.sru
```

This creates two files:
- **ne-bilaga.sru** -- the declaration data (blanketter.sru)
- **info.sru** -- sender metadata (created automatically in the same directory)

### With periodiseringsfond

If you're making or reversing a periodiseringsfond allocation:

```bash
bun run packages/cli/src/index.ts sru-report your-export.se \
  --form ne \
  --periodisering-reversal 50000 \
  --periodisering-allocate 30000 \
  --output ne-bilaga.sru
```

- `--periodisering-reversal`: Amount you're reversing from a prior fund (R32)
- `--periodisering-allocate`: Amount you're setting aside this year (R34)

### What gets auto-computed

When you use `--form ne`, Skattata automatically calculates these NE tax adjustment fields from your accounting data:

| Field | Code | Description |
|-------|------|-------------|
| R41 | 7713 | Egenavgifter (self-employment contributions) |
| R43 | 7714 | Schablonavdrag (flat-rate deduction, 25%) |
| R30 | 7708 | Positiv rantefordelning (interest allocation on positive capital) |
| R31 | 7607 | Negativ rantefordelning (interest allocation on negative capital) |
| R36 | 7710 | Okning expansionsfond (expansion fund increase) |
| R32 | 7608 | Aterforing periodiseringsfond (from `--periodisering-reversal`) |
| R34 | 7709 | Avsattning periodiseringsfond (from `--periodisering-allocate`) |
| R47 | 7630 | Overskott -- your taxable business surplus (goes to INK1) |
| R48 | 7730 | Underskott -- your business deficit (goes to INK1) |

R47 or R48 is the bottom line: your business result after all adjustments. This is the number that transfers to your personal tax return (INK1).

**Upload to:** [Skatteverket SRU-filer](https://www.skatteverket.se/foretag/skatter/inkomstdeklaration) > Skicka in SRU-filer

Upload both `ne-bilaga.sru` and `info.sru` together.

---

## Step 5: Estimate F-skatt (preliminary tax)

```bash
bun run packages/cli/src/index.ts f-skatt your-export.se --municipality-rate 0.3274
```

Shows estimated monthly F-skatt instalments. Find your municipality tax rate on [Skatteverket kommunalskatt](https://www.skatteverket.se/privat/skatter/kommunalskatt).

---

## Understanding the SRU codes

SRU codes (e.g. 7400, 7713) are line numbers on the tax form. They map your accounting data to Skatteverket's declaration fields:

- **7200-7383**: Balance sheet lines (B1-B16)
- **7400-7505**: Income statement lines (R1-R11)
- **7607-7714**: Tax adjustment lines (R30-R43)
- **7630/7730**: Result lines (R47/R48 -- surplus or deficit)

If your SIE file has `#SRU` tags (most accounting software adds them), those mappings are used directly. If not, Skattata applies the BAS K1 (forenklat arsbokslut) default mapping and warns you.

---

## Account mapping: K1 vs K2/K3

**K1 (forenklat arsbokslut)** is the simplified accounting standard used by most sole proprietors with revenue under 3 MSEK. Skattata's default NE mapping uses K1.

**K2/K3** are full accounting standards for larger businesses. If you use K2/K3, your accounting software should include `#SRU` tags in the SIE export -- Skattata will use those instead of the K1 defaults.

---

## Quick reference

| Task | Command |
|------|---------|
| Check file contents | `parse your-export.se` |
| Balance sheet | `balance-sheet your-export.se` |
| Income statement (enskild firma) | `income-statement your-export.se --enskild-firma` |
| Momsdeklaration | `moms your-export.se` |
| Moms XML for upload | `moms your-export.se --period 202401 --output-xml moms.xml` |
| NE-bilaga SRU for upload | `sru-report your-export.se --form ne --output ne.sru` |
| F-skatt estimate | `f-skatt your-export.se --municipality-rate 0.3274` |
| Verify all test files | `test-all ./exports` |

All commands support `--format json` for programmatic output and `--help` for full options.
