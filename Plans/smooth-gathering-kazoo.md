# Plan: Production Readiness — Enskild Firma Compliance
**Goal:** Bring Skattata from 6/10 → ~9/10 for Swedish sole proprietor (enskild firma) use.

---

## Context

The tool currently parses SIE files and produces display-quality output. The gaps fall into three categories:

1. **Bugs** — `--year` flag silently ignored; scalar balance fields used everywhere except SRU report
2. **Missing compliance output** — egenavgifter (the primary enskild firma tax) is entirely absent; moms only covers 5 hardcoded accounts out of a ~20-account BAS range
3. **Data quality risks** — missing org number produces a placeholder SRU file that Skatteverket will reject; NE-bilaga output has no validation of required SRU code coverage

All fixes target **enskild firma** (NE-bilaga filers). No aktiebolag-specific compliance work (INK2R/INK2S) is in scope.

---

## Applicable Compliance Terms

| Term | What it means | Where it impacts |
|---|---|---|
| **NE-bilaga** | Mandatory income tax supplement for enskild firma — filed with Inkomstdeklaration 1 (due ~2 May annually) | `sru-report --form ne` output |
| **SKV 4700** | Momsdeklaration form — all Swedish VAT obligations reported here | `moms` command |
| **SKV 269** | Official SRU file format spec (blanketter.sru + info.sru) — both files required for electronic submission | `SruFileWriter`, `InfoSruWriter` |
| **Egenavgifter** | ~28.97% social contributions on enskild firma profit — most important number for personal tax calc | New feature in `income-statement` |
| **BAS account plan** | Standard Swedish chart of accounts — defines account ranges for VAT, revenue, costs | `moms`, `income-statement`, `balance-sheet` |
| **Avskrivningar** | Depreciation of business assets (BAS 7000–7999) — has a dedicated NE-bilaga row; must be separated from operating expenses in output | `income-statement`, `sru-report --form ne` validation |
| **Periodiseringsfond / Expansionsfond** | Optional tax-deferral mechanisms — **out of scope** for this plan (not required for compliance) | — |

---

## Issues & Code Locations

| # | Issue | Severity | File(s) | Root Cause |
|---|---|---|---|---|
| 1 | `income-statement --year` flag silently ignored | HIGH | `commands/income-statement/index.ts:29`, `IncomeStatementCalculator.ts:16` | `calculate()` has no `yearId` param; uses `acc.result` scalar always |
| 2 | `balance-sheet --year` flag silently ignored | HIGH | `commands/balance-sheet/index.ts`, `BalanceSheetCalculator.ts:21` | Same root cause; uses `acc.closingBalance` scalar |
| 3 | Moms only covers 5 hardcoded accounts | MEDIUM | `MomsCalculator.ts:29-33` | Should scan BAS ranges 2610–2639 (output) + 2640–2669 (input) |
| 4 | Avskrivningar lumped into opex, not separated | MEDIUM | `IncomeStatementCalculator.ts` | 7000–7999 should be a distinct line; NE-bilaga has a dedicated depreciation row |
| 5 | Egenavgifter absent from both display and NE SRU output | HIGH | `commands/income-statement/`, `sru-report/SruFileWriter.ts` | 28.97% social contribution — must appear on screen (display) AND in blanketter.sru (filing) |
| 6 | `#TAXAR YYYY` missing from blanketter.sru; CRLF not verified | HIGH | `SruFileWriter.ts` | Skatteverket will reject files missing tax year declaration or with wrong line endings |
| 7 | Missing/invalid org number produces placeholder SRU | HIGH | `SruFileWriter.ts:19-23` | Warns + writes `XXXXXXXXXX`; Skatteverket will reject. Enskild firma use 12-digit personnummer. |
| 8 | `info.sru` missing `#FILNAMN` field | MEDIUM | `InfoSruWriter.ts` | SKV 269 requires `#FILNAMN BLANKETTER.SRU` in the metadata block |
| 9 | NE-bilaga has no required-field validation | MEDIUM | `SruReportCalculator.ts` | Silent empty output if SRU codes absent from SIE file |

---

## Implementation Checklist

Agent: work through items in order. Mark each complete before moving to next. All changes must keep `bun test` at 156 pass / 0 fail and `test-all ./sie_test_files` at 127/127.

---

### 1 — Fix `--year` in IncomeStatementCalculator

**Files:** `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts`, `packages/cli/src/commands/income-statement/index.ts`

**Reference model:** `SruReportCalculator.ts` lines 62-66 — `getAmount()` checks `acc.yearBalances.get(yearId)` first, falls back to scalar.

**Changes:**
- [ ] Add `yearId = 0` parameter to `IncomeStatementCalculator.calculate(doc, yearId = 0)`
- [ ] Replace `acc.result` with: `acc.yearBalances.get(yearId)?.result ?? acc.result`
- [ ] In `index.ts`, pass `parseInt(options.year ?? '0', 10)` to `calc.calculate()`
- [ ] Create synthetic SIE file `skattata-test-income-multiyear.se` with two `#RAR` years and different `#RES` values per year (e.g. year 0 revenue=100000, year -1 revenue=80000)

**Verification — DONE:**
- [ ] `bun test` passes 0 fail
- [ ] `skattata income-statement --year -1 skattata-test-income-multiyear.se` outputs different revenue than `--year 0`

**Verification — CORRECT:**
- [ ] Cross-check: manually inspect the `#RES` tag in the synthetic file for yearId=-1 and confirm the CLI output matches that exact value — not the year-0 scalar

---

### 2 — Fix `--year` in BalanceSheetCalculator

**Files:** `packages/cli/src/commands/balance-sheet/BalanceSheetCalculator.ts`, `packages/cli/src/commands/balance-sheet/index.ts`

**Changes:**
- [ ] Add `yearId = 0` parameter to `BalanceSheetCalculator.calculate(doc, yearId = 0)`
- [ ] Replace `acc.closingBalance` with: `acc.yearBalances.get(yearId)?.closing ?? acc.closingBalance`
- [ ] The internal call to `IncomeStatementCalculator` (for `netIncome`) must also pass `yearId`
- [ ] In `index.ts`, parse `--year` option and pass to `calc.calculate()`
- [ ] Reuse `skattata-test-income-multiyear.se` from item 1, extended with `#UB` tags for both years

**Verification — DONE:**
- [ ] `skattata balance-sheet --year -1 skattata-test-income-multiyear.se` produces different asset/equity totals than `--year 0`
- [ ] `bun test` passes 0 fail

**Verification — CORRECT:**
- [ ] Manually read `#UB -1` values in the synthetic file and confirm CLI output matches exactly
- [ ] `balanceDiff` is 0 for both years (if the synthetic file is balanced for both years)

---

### 3 — Expand moms to full BAS VAT account ranges

**File:** `packages/cli/src/commands/moms/MomsCalculator.ts`

**Current:** Hardcoded to accounts 3010, 2610, 2620, 2630, 2640.

**Target:** Scan document accounts by BAS range instead of hardcoded IDs.

**BAS VAT ranges:**
- Output VAT 25% → accounts 2610–2619 → SKV 4700 field 10
- Output VAT 12% → accounts 2620–2629 → SKV 4700 field 11
- Output VAT 6%  → accounts 2630–2639 → SKV 4700 field 12
- Input VAT (deductible) → accounts 2640–2669 → SKV 4700 field 48
- Taxable sales base → accounts 3000–3999 → SKV 4700 field 05 (negate for display)
  - ⚠️ **Not all 3xxx revenue is VAT-taxable.** Accounts 3100–3199 (sjukvård, utbildning) are typically VAT-exempt. Include all 3xxx but emit a warning: `"Note: field 05 includes all 3xxx accounts. Manually exclude VAT-exempt revenue (3100-3199) if applicable."`

**Changes:**
- [ ] Replace hardcoded account lookups with range-based iteration over `doc.accounts`
- [ ] Sum all accounts in each range (period-filtered if `--period` given, else `closingBalance`)
- [ ] For annual moms (no `--period`): use `closingBalance` for VAT accounts (2610–2669) which accumulates the liability, **but sum `periodValues` across the full year for sales base (3xxx)** — `closingBalance` on revenue accounts reflects the cumulative running balance which is correct for annual. Proceed with `closingBalance` but add a note in the code comment.
- [ ] Output should retain the same row labels: `Output VAT 25%`, `Output VAT 12%`, etc.
- [ ] Update `skattata-test-moms-annual.se` synthetic file if needed to cover multi-account scenario
- [ ] Verify `skattata-test-moms-period.se` and `skattata-test-moms-refund.se` still produce correct output

**Net VAT formula remains:** `netVat = (output25 + output12 + output6) - inputVat`

**Verification — DONE:**
- [ ] `bun test` passes; existing `skattata-test-moms-*.se` synthetic files still produce correct output
- [ ] Add accounts 2611, 2621, 2641 to `skattata-test-moms-annual.se`; confirm they are summed into the correct rate buckets
- [ ] `skattata moms skattata-test-moms-annual.se` output shows the expanded sums

**Verification — CORRECT:**
- [ ] Manually sum the account values in the synthetic file and compare to CLI output — they must match to the integer
- [ ] Run against a real-world SIE file (from `sie_test_files/`) that uses standard moms accounts; compare CLI output to the company's actual filed VAT declaration if available
- [ ] Confirm the exempt revenue warning appears when a 3100-series account is present

---

### 4 — Split 7xxx range into personnel and depreciation (NE-bilaga alignment)

**Files:** `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts`

**Why:** The BAS account plan has four distinct cost groups; the NE-bilaga treats personnel and depreciation as separate rows from operating expenses. The current lump of 5000–7999 is wrong for both NE-bilaga alignment and management reporting.

**Correct BAS ranges (confirmed from BAS kontoplan):**

| BAS range | Category | NE-bilaga row |
|---|---|---|
| 5000–6999 | Övriga externa kostnader (rent, marketing, travel, telecom) | R6 |
| 7000–7399 | Personalkostnader (wages, social fees, pensions) | R7 |
| 7400–7499 | Avskrivningar maskiner/inventarier (**most common depreciation accounts: 7410, 7420**) | R10 |
| 7500–7699 | Leasing, consumables, repairs — fold into opex (R6) for simplicity |
| 7700–7899 | Avskrivningar byggnader/immateriella (buildings 7700–7749, intangibles 7750–7899) | R9 |

> ⚠️ The previous draft used 7000–7699 for personnel. This is wrong — it would misclassify 7410/7420 (machinery depreciation, the most common accounts) as payroll. Use 7000–7399 for personnel.

**Changes:**
- [ ] Add four fields to `IncomeStatementResult`: `opex` (5000–6999 + 7500–7699), `personnel` (7000–7399), `depreciation` (7400–7499 + 7700–7899)
- [ ] Display labels: `Övriga externa kostnader` · `Personalkostnader (7000-7399)` · `Avskrivningar (7400-7499, 7700-7899)`
- [ ] Update `netIncome` formula: `revenue - cogs - opex - personnel - depreciation - financial`
- [ ] Update `skattata-test-income-statement.se` synthetic file to include accounts 7410 (machinery depreciation) and 7210 (personnel) to exercise the split
- [ ] Add a test asserting 7410 ends up in `depreciation`, NOT `personnel`
- [ ] Update any e2e test that asserts income-statement row count / column labels

**Verification — DONE:**
- [ ] `bun test` passes; income-statement output now has 5 cost lines instead of 3
- [ ] `skattata income-statement skattata-test-income-statement.se` shows `Personalkostnader`, `Övriga externa kostnader`, and `Avskrivningar` as separate rows

**Verification — CORRECT:**
- [ ] In the synthetic file: manually verify which accounts fall in 7000–7399 vs 7400–7499 vs 7700–7899. Assert that the CLI buckets match exactly.
- [ ] Specifically: account 7410 must appear in `Avskrivningar`, account 7210 must appear in `Personalkostnader` — confirm in test output
- [ ] Sum all three cost buckets + revenue + cogs + financial = netIncome; verify arithmetic is correct

---

### 5 — Add egenavgifter calculation to income-statement

**File:** `packages/cli/src/commands/income-statement/IncomeStatementCalculator.ts` and `index.ts`

**What it is:** Swedish sole proprietors pay 28.97% social contributions on business profit. Two additional display lines are needed:

```
Egenavgifter (28.97%)      [profit × 0.2897]
Approximate taxable income  [profit − (egenavgifter × 0.5)]   ← standard 25%-of-profit deduction approximated as half-egenavgifter for display
```

**Note on the deduction:** Skatteverket uses a 25% standard deduction on profit for calculating taxable income base, and a separate 7.5% special deduction on egenavgifter (max 15,000 SEK). For display purposes, show two lines: computed egenavgifter, and estimated taxable income after the standard deduction (`profit × 0.75`).

**Rate note:** 28.97% is the 2025 rate. It changes annually. Hardcode for now with the rate labelled in the output; add a `--egeavgifter-rate` override flag for future-proofing.

**Calculation note (important):** The real Skatteverket calculation is iterative (egenavgifter are deductible from their own base). The simplified formula is an approximation. **Must be prominently labelled as an estimate in output.** Formula:
```
egenavgifter ≈ netIncome × 0.2897          ← simplified (off by ~1-2% vs iterative)
taxBaseApprox = netIncome × 0.75           ← after standard 25% schablonavdrag
```

**Changes:**
- [ ] Add `--enskild-firma` boolean flag to the `income-statement` command
- [ ] When flag is set, append to output (clearly separated from the P&L):
  - `Egenavgifter ~28.97% (estimate)` = `Math.trunc(netIncome * 0.2897)`
  - `Taxable income approx. (after schablonavdrag)` = `Math.trunc(netIncome * 0.75)`
- [ ] Label these rows with: `(Estimates only. Actual amounts depend on Skatteverket's iterative calculation.)`
- [ ] Add unit test: profit=100000 → egenavgifter=28970, taxBase=75000
- [ ] No changes to `IncomeStatementResult` interface — computed only when flag is set

**NE SRU output (separate sub-task):** Egenavgifter must also appear in `blanketter.sru` when `sru-report --form ne` is used. The NE-bilaga page 2 has rows for the egenavgifter contribution base (research found labels R40/R41/R43 but exact 4-digit SRU codes are **not confirmed from Skatteverket directly**).
- [ ] ⚠️ Before implementing: verify exact SRU field codes for egenavgifter rows from the official SKV 269 NE appendix (Bilaga NE fältförteckning). Do NOT hardcode codes from secondary sources.
- [ ] Once verified: compute egenavgifter base from netIncome and write as `#UPPGIFT <code> <amount>` in SruFileWriter when form=NE

**Verification — DONE:**
- [ ] `skattata income-statement --enskild-firma skattata-test-income-statement.se` shows the egenavgifter section
- [ ] Output contains "estimate" / "Estimates only" label — absent or misnamed = fail
- [ ] `bun test` unit test passes: profit=100000 → egenavgifter=28970

**Verification — CORRECT:**
- [ ] Manual check: 100000 × 0.2897 = 28970 (truncated). Confirm CLI outputs 28970, not 28,970.00 or 29000.
- [ ] Compare against Skatteverket's own egenavgifter calculator (skatteverket.se) for the same profit — expect ~1-2% difference due to iterative vs simplified formula; if difference >5%, formula is wrong
- [ ] For NE SRU output: open the generated `blanketter.sru` and verify the `#UPPGIFT <code>` line is present with the computed egenavgifter base — then cross-check the field code against the official SKV 269 NE fältförteckning PDF

---

### 6 — Add `#TAXAR` to blanketter.sru and fix line endings

**File:** `packages/cli/src/commands/sru-report/SruFileWriter.ts`

**Why these are blocking:** Skatteverket's SRU intake system will reject files missing `#TAXAR` or using wrong line endings.

**Issue A — Missing `#TAXAR`:** SKV 269 requires `#TAXAR YYYY` immediately after `#BLANKETT`. This specifies which tax year the declaration covers. Currently absent from `SruFileWriter`.

**Issue B — Line endings:** SRU files must use `\r\n` (DOS/Windows CRLF). Check the current `SruFileWriter` join logic — if it uses `\n`, change to `\r\n`. (The `SieDocumentWriter` already does this correctly for SIE output.)

**Changes:**
- [ ] In `SruFileWriter`, add `#TAXAR ${taxYear}` on the line immediately after `#BLANKETT ${form}`
- [ ] Add `taxYear` parameter to `SruFileWriterOptions` (default: current year - 1, since you're filing for prior year)
- [ ] In `sru-report/index.ts`, add `--tax-year <YYYY>` option with default `new Date().getFullYear() - 1`
- [ ] Verify line endings in output file are CRLF (check `join` calls — use `\r\n`)
- [ ] Update any snapshot tests for SRU output to include `#TAXAR` line

**Verification — DONE:**
- [ ] `skattata sru-report --form ne skattata-test-sru-report.se --output /tmp/test.sru` produces a file containing `#TAXAR` on line 2 (after `#BLANKETT NE`)
- [ ] `bun test` passes

**Verification — CORRECT:**
- [ ] `cat -A /tmp/test.sru | head -5` — every line must end with `^M$` (CRLF). If any line ends with `$` only (LF), the fix is incomplete.
- [ ] `grep '#TAXAR' /tmp/test.sru` — must return `#TAXAR YYYY` where YYYY = prior year (e.g. 2025 when run in 2026)
- [ ] Cross-reference: open SKV 269 and confirm `#TAXAR` placement is immediately after `#BLANKETT` — not before, not at end of block

---

### 7 — Hard error on missing org number in SruFileWriter

**File:** `packages/cli/src/commands/sru-report/SruFileWriter.ts:19-23`

**Current:** Warns and writes `XXXXXXXXXX` placeholder.

**Enskild firma format note:** Enskild firma use the owner's **personnummer** (12 digits, no hyphens: `YYYYMMDDNNNN`) as their org number in SRU files — not the corporate format (`XXXXXX-XXXX`). The validation must accept both formats.

**Change:**
- [ ] Replace `console.warn` + placeholder with `throw new Error('Organization number is required for SRU output. Add #ORGNR to the SIE file or use --orgnr option.')`
- [ ] In `sru-report/index.ts`, add `--orgnr <number>` option so the user can override if the SIE file lacks it
- [ ] Override logic: if `--orgnr` provided, use it; else use `doc.organizationNumber`; else throw
- [ ] Validate format: accept either 10-digit corporate (`\d{10}`) or 12-digit personnummer (`\d{12}`) — strip hyphens before writing
- [ ] Same guard in `InfoSruWriter.ts`

**Verification — DONE:**
- [ ] `skattata sru-report --form ne <file-without-orgnr>` exits non-zero with clear error message
- [ ] `skattata sru-report --form ne <file> --orgnr 198501151234` succeeds and writes org number correctly
- [ ] `bun test` for the error-path test passes

**Verification — CORRECT:**
- [ ] `grep '#ORGNR\|#IDENTITET' /tmp/test.sru /tmp/test.info.sru` — both files must contain the 12-digit number without hyphens
- [ ] Try input with a hyphen (`19850115-1234`) — confirm hyphens are stripped before writing
- [ ] Try a 10-digit corporate number (`5569066388`) — confirm it's accepted and written as-is
- [ ] Try an invalid format (too short, letters) — confirm it throws with a clear message citing the expected format

---

### 8 — Add `#FILNAMN` to info.sru

**File:** `packages/cli/src/commands/sru-report/InfoSruWriter.ts`

**Required per SKV 269:** The `#DATABESKRIVNING` block must include `#FILNAMN BLANKETTER.SRU`.

**Current block:**
```
#DATABESKRIVNING_START
#PRODUKT SRU
#SKAPAD <date> <time>
#DATABESKRIVNING_SLUT
```

**Target block:**
```
#DATABESKRIVNING_START
#PRODUKT SRU
#FILNAMN BLANKETTER.SRU
#SKAPAD <date> <time>
#DATABESKRIVNING_SLUT
```

- [ ] Insert `#FILNAMN BLANKETTER.SRU` line after `#PRODUKT SRU`
- [ ] Update any snapshot/expected-output tests that assert the info.sru content

**Verification — DONE:**
- [ ] `cat /tmp/test.info.sru` shows `#FILNAMN BLANKETTER.SRU` between `#PRODUKT SRU` and `#SKAPAD`
- [ ] `bun test` passes

**Verification — CORRECT:**
- [ ] The value must be uppercase `BLANKETTER.SRU` — Skatteverket's spec uses this exact casing
- [ ] Cross-reference: open SKV 269 section 3 (INFO.SRU structure) and confirm `#FILNAMN` is listed as a required field in the `#DATABESKRIVNING` block, positioned after `#PRODUKT`

---

### 9 — NE-bilaga required-field validation

**File:** `packages/cli/src/commands/sru-report/SruReportCalculator.ts`

**Context:** When `--form ne` is specified, the output is silent if the SIE file has no `#SRU` mappings to NE codes. This passes undetected.

**Minimum required NE SRU codes** (per NE-bilaga structure — these must be present for a valid return):
- At least one revenue code in the NE R-section (accounts 3xxx must map to NE SRU codes)
- If the company has any accounts in 4xxx–8xxx, at least one cost code must map to NE

**Changes:**
- [ ] After computing the NE report, check if `entries` is empty or contains zero revenue lines
- [ ] If empty: emit `console.warn('Warning: No NE SRU codes found in this SIE file. The accounting software did not export #SRU tags. NE-bilaga output will be empty.')` and exit with code 1
- [ ] If revenue codes missing but cost codes present (or vice versa): warn specifically which section is absent
- [ ] List any `missingCodes` accounts (already collected in calculator) in the warning output

**Verification — DONE:**
- [ ] Run `skattata sru-report --form ne <sie-file-with-no-sru-tags>` — exits with code 1 and prints the warning
- [ ] Run against `skattata-test-sru-report.se` (has SRU codes) — no warning, exits 0
- [ ] `bun test` passes

**Verification — CORRECT:**
- [ ] The warning message names specific missing accounts (e.g. "account 3000 has no SRU code") — a generic "no codes found" is not enough
- [ ] Run against a real-world SIE file from `sie_test_files/` that was exported by Fortnox or Visma — if it has `#SRU` tags, the warning must NOT fire
- [ ] Confirm that a SIE file with ONLY cost SRU codes (no revenue codes) triggers the specific "revenue section absent" warning, not the generic one

---

## Final Verification Gate

Each item has its own **Done** and **Correct** checklist above. After ALL 9 items pass their own checklists, run this final gate:

```bash
# 1. Full test suite — must be 0 fail
bun test

# 2. Integration gate — must be 127/127
bun run packages/cli/src/index.ts test-all ./sie_test_files

# 3. Manual smoke tests
skattata income-statement ./sie_test_files/synthetic/skattata-test-income-statement.se
skattata income-statement --year -1 ./sie_test_files/synthetic/skattata-test-income-statement.se
skattata income-statement --enskild-firma ./sie_test_files/synthetic/skattata-test-income-statement.se
skattata balance-sheet --year -1 ./sie_test_files/synthetic/skattata-test-balanced-annual.se
skattata moms ./sie_test_files/synthetic/skattata-test-moms-annual.se
skattata moms --period 202401 ./sie_test_files/synthetic/skattata-test-moms-period.se
skattata sru-report --form ne ./sie_test_files/synthetic/skattata-test-sru-report.se --output /tmp/ne-test.sru
cat /tmp/ne-test.sru           # Verify: #BLANKETT NE, then #TAXAR YYYY on next line, CRLF endings
cat /tmp/ne-test.info.sru      # Verify: #FILNAMN BLANKETTER.SRU present

# 4. Error paths — all must exit non-zero with actionable messages
skattata sru-report --form ne ./sie_test_files/synthetic/skattata-test-sru-report.se  # no --output: ok, display
echo "5569066388" | xargs -I{} skattata sru-report --form ne <file> --orgnr {}  # valid corporate org: ok
skattata sru-report --form ne <file-without-orgnr> --output /tmp/t.sru  # no orgnr: must error
skattata sru-report --form ne <file-with-no-sru-tags> --output /tmp/t.sru  # no SRU tags: must warn+exit 1

# 5. Cross-check a real-world file end-to-end
skattata income-statement ./sie_test_files/4-fortnox-*.sie     # pick any Fortnox SIE 4 file
skattata moms ./sie_test_files/4-fortnox-*.sie
skattata sru-report --form ne ./sie_test_files/4-fortnox-*.sie --output /tmp/real-ne.sru
# Review /tmp/real-ne.sru manually — does it look like a real NE-bilaga submission?
```

---

## What This Does NOT Cover (Current Plan)

All items below are deferred to **Next Ups** — they will be built, just not in this iteration.

---

## Source Verification Note

Several compliance facts in this plan were gathered from secondary sources (guides, blog posts, GitHub projects). **Before implementing any SRU field code, tax rate, or format rule, verify against the authoritative Skatteverket source:**

| Fact | Canonical source |
|---|---|
| Egenavgifter SRU codes (R40/R41/R43) | SKV 269 — Bilaga NE fältförteckning |
| SKV 4700 VAT field mapping | [SKV 4700 form + instructions](https://www.skatteverket.se/foretag/moms/deklareramoms) |
| `#TAXAR` format and placement | SKV 269 utgåva 19+ (technical SRU spec) |
| info.sru `#FILNAMN` requirement | SKV 269 section 3 |
| Egenavgifter rate (28.97%) | [Skatteverket — Egenavgifter 2025](https://skatteverket.se/foretag/drivaforetag/foretagsformer/enskildnaringsverksamhet/egenavgifterochsarskildloneskatt) |
| Personnummer format in SRU | SKV 269 ORGNR field definition |

If a secondary source contradicts Skatteverket, Skatteverket wins. Flag any discrepancy with a code comment linking to the official source.

---

## Next Ups (Post-This-Plan)

### F-skatt (Preliminary Tax) Command

**What it is:** Enskild firma owners pay preliminary income tax (F-skatt) in instalments throughout the year — typically 6 or 12 payments. The preliminary tax is based on the *prior year's* assessed income, adjusted by Skatteverket or the taxpayer. This is separate from egenavgifter.

**Why it matters:** Without this, a user can't answer "how much do I pay each month?" — the single most actionable personal finance number for a sole proprietor.

**Inputs required:**
- Prior year's taxable income (from NE-bilaga result)
- Municipal tax rate (kommunalskatt — varies by municipality, typically 30–33%)
- State income tax threshold (statlig skatt kicks in above ~613,900 SEK for 2025)
- Any applied deductions (grundavdrag — basic deduction, scales with income)

**Formula sketch:**
```
taxableIncome = priorYearProfit - egenavgifter * 0.5 - grundavdrag
municipalTax  = taxableIncome * kommunalskattesats  (e.g. 0.32)
stateTax      = max(0, taxableIncome - threshold) * 0.20
totalAnnualTax = municipalTax + stateTax
monthlyInstalment = totalAnnualTax / 12
```

**Implementation plan (when prioritised):**
- New command `skattata f-skatt <file> --municipality-rate 0.32 [--year -1]`
- Reuses egenavgifter logic from `income-statement --enskild-firma`
- Reads prior-year income via `yearBalances.get(-1)` on income-statement accounts
- Outputs: annual tax, monthly instalment, breakdown by municipal/state
- Add `--grundavdrag <amount>` override for edge cases
- Grundavdrag table (scales by income) can be hardcoded from SKV tables for current tax year

### Räntefördelning (Interest Allocation)

**What it is:** A voluntary tool allowing sole proprietors to reclassify a portion of business profit as capital income (taxed at 30%) rather than active income (taxed at marginal rate + 28.97% egenavgifter). Can significantly reduce total tax for asset-heavy businesses.

**Rate:** Statslåneräntan (Nov 30 prior year) + 6 percentage points.
- 2025 rate: **7.96%** · 2026 rate: **8.55%**

**Negative räntefördelning:** Mandatory (not voluntary) if capital base is negative — adds income at statslåneräntan + 1pp.

**Implementation plan (when prioritised):**
- Compute capital base = equity at year start (sum of 2xxx accounts at opening balance)
- Positive allocation = `capitalBase × (statslåneräntan + 0.06)` — shown as reduction of egenavgifter base
- Add `--rantefordelning` flag to `income-statement --enskild-firma`
- Output: shows capital income amount, adjusted egenavgifter base, estimated tax saving
- Hardcode current year's statslåneränta + update mechanism

### Periodiseringsfond and Expansionsfond

**What they are:**
- **Periodiseringsfond** — Defer up to 30% of annual profit, tax-free for up to 6 years. Used to smooth income across years.
- **Expansionsfond** — Accumulate business capital at 20.6% flat tax rate (vs full marginal rate). No time limit. The retained amount grows the business without triggering personal income tax.

**Why it matters:** These are the two primary tools Swedish sole proprietors use to reduce their effective tax rate. A tool that can't account for them will always show higher taxes than the user actually pays.

**Implementation plan:**
- New command `skattata tax-planning <file>` or flags on `income-statement --enskild-firma`
- Periodiseringsfond: `--periodiseringsfond-allocate <amount>` to simulate deduction; show updated taxable income and egenavgifter
- Expansionsfond: `--expansionsfond-allocate <amount>` to simulate deduction; show 20.6% expansion fund tax vs saved marginal tax
- Both feeds into NE-bilaga SRU output once SRU codes are verified from SKV 269

### Moms XML Submission File

**What it is:** Skatteverket accepts momsdeklaration as XML (not SRU format). The `moms` command currently produces display-only output — users must manually enter values in Mina sidor or Skatteverket's portal.

**Implementation plan:**
- Research Skatteverket's moms XML schema (not publicly documented — may require contacting Skatteverket or inspecting their portal's file upload format)
- New `--output <file.xml>` option on `moms` command that writes a submittable XML file
- Must match SKV's expected structure exactly (validate against schema if obtainable)
- Verify: is this the same XML format as the manual portal uses?

### INK2R / INK2S (Aktiebolag Support)

**What it is:** The SRU report already accepts `--form ink2r` and `--form ink2s` but these have not been validated for aktiebolag compliance. Many Swedish companies will eventually incorporate.

**Implementation plan:**
- Validate INK2R output against known aktiebolag SRU code ranges
- Add aktiebolag-specific fields: bolagets säte, räkenskapsår, etc.
- Separate from enskild firma work — plan as a distinct iteration

### EU Moms Fields (20–37)

**What it is:** Companies buying/selling across EU borders must report intra-EU acquisitions (field 20), reverse-charge purchases (fields 30–32), and EU sales (fields 35–37) on SKV 4700.

**Implementation plan:**
- Extend `MomsCalculator` with BAS ranges for EU accounts: 2614–2615 (EU output VAT), 2645–2647 (EU input VAT reverse charge)
- Map to SKV 4700 fields 20, 30–32, 35–37
- Add to moms output table when non-zero EU accounts exist
- Gate on `--eu` flag or auto-detect if any EU-range accounts present

### NE B-Section (Balansräkning in NE)

**What it is:** The NE-bilaga has a balance sheet section (B1–B16 rows) covering fixed assets, current assets, equity, and liabilities. This is conditional — only required if the business has material assets. Currently these flow through via `#SRU` tags if the accounting software exports them.

**Implementation plan:**
- Validate that when `sru-report --form ne` runs, any B-section SRU codes present in the document are correctly included in the output (they should already flow through — verify with a test file)
- If B-section codes are absent and the document has 1xxx asset accounts, warn that balance sheet may be incomplete
- Add `--validate-ne-b-section` flag that checks for expected B-section coverage

### SNI (Industry/Näringskod) Code

**What it is:** The business industry classification code (SNI/NACE). Required from 2026 for businesses claiming egenavgifter reductions in designated support areas (stödområde).

**Implementation plan:**
- Add `--sni <code>` optional parameter to `sru-report --form ne`
- If provided, write to the appropriate NE SRU field (verify field code from SKV 269)
- If absent, emit a reminder: "If your business is in a stödområde, --sni is required from 2026"

### Programmatic Submission via Skatteverket

**Current state:** Skatteverket has no public API for SRU submission. Users must manually authenticate with BankID and upload via the Filöverföring portal.

**Watch for:** Skatteverket is modernising its digital infrastructure. An API may become available. Monitor skatteverket.se/tekniskinformation for updates.

**Interim improvement:** Add a `skattata submit` command that opens the Filöverföring portal URL in the default browser and prints the files to upload. This bridges the gap without requiring an API.

