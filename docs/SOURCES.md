# Authoritative Sources

Every tax constant, account mapping, and file format in Skattata traces back to an authoritative Swedish government or industry source. This document maps each domain to its primary source and explains how to verify correctness.

For automated verification, run `/verify-compliance` (see `~/.claude/skills/VerifyCompliance/`).

---

## Tax Constants (`packages/cli/src/shared/taxRates.ts`)

| Constant | Source | Authority | How to verify |
|---|---|---|---|
| `egenavgifterRate` | Belopp och procent | Skatteverket | Search "belopp och procent {year}" on skatteverket.se |
| `schablonavdrag` | Belopp och procent | Skatteverket | Same page, under "Schablonavdrag för egenavgifter" |
| `rantefordelningPositive` | Statslåneräntan + 6 pp | Riksgälden | riksgalden.se → statslåneräntan as of Nov 30 of year-1 |
| `rantefordelningNegative` | Statslåneräntan + 1 pp | Riksgälden | Same value, different formula |
| `expansionsfondRate` | Bolagsskattesatsen | Skatteverket | Search "bolagsskatt" on skatteverket.se (20.6% since 2021) |
| `pbb` | Prisbasbelopp | SCB | scb.se → prisbasbelopp (published ~June for next year) |
| `stateTaxThreshold` | Skiktgräns | Skatteverket | Search "skiktgräns {year}" (NOT brytpunkt — see note below) |
| `stateTaxRate` | Statlig inkomstskatt | Skatteverket | Belopp och procent (20% since 2020) |

### Skiktgräns vs Brytpunkt

- **Skiktgräns** = threshold applied to *beskattningsbar förvärvsinkomst* (taxable income **after** grundavdrag). This is what we store as `stateTaxThreshold`.
- **Brytpunkt** = skiktgräns + grundavdrag = approximate gross income level where state tax kicks in. We do NOT use this value.

### Update Schedule

Tax constants change annually. Skatteverket publishes "Belopp och procent" for the next year around November. The statslåneräntan is set on November 30. When adding a new year:

1. Check Skatteverket "Belopp och procent {year}"
2. Check Riksgälden for statslåneräntan as of November 30
3. Check SCB for prisbasbelopp
4. Add entry to `RATES` in `taxRates.ts`
5. Run `/verify-compliance` to confirm

---

## Moms Declarations (`packages/cli/src/commands/moms/`)

| Component | Source | Authority |
|---|---|---|
| XML format | eSKDUpload DTD v6.0 | Skatteverket |
| Ruta definitions | SKV 4700 momsdeklaration | Skatteverket |
| VAT account ranges | BAS kontoplan (kontoklass 2) | BAS Kontogruppen |

### eSKDUpload DTD

The DTD has been at version 6.0 since ~2014. It defines the exact XML element names and their ordering for the `<Moms>` element. Our `RUTA_DEFINITIONS` in `MomsCalculator.ts` mirrors this ordering.

**DTD download URL:** `https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd`

### VAT Account Ranges (BAS)

| Range | Rate | Sub-accounts |
|---|---|---|
| 2610-2619 | 25% output VAT | 2614 reverse charge, 2615 import |
| 2620-2629 | 12% output VAT | 2624 reverse charge, 2625 import |
| 2630-2639 | 6% output VAT | 2634 reverse charge, 2635 import |
| 2640-2669 | Input VAT (deductible) | |

Source: BAS Kontogruppen (bas.se/kontoplaner/)

---

## BAS Account Ranges (calculators)

| Range | Category | Used by |
|---|---|---|
| 1000-1999 | Tillgångar (assets) | BalanceSheetCalculator |
| 2000-2099 | Eget kapital (equity) | BalanceSheetCalculator |
| 2100-2999 | Skulder (liabilities) | BalanceSheetCalculator |
| 3000-3999 | Intäkter (revenue) | IncomeStatementCalculator, MomsCalculator |
| 4000-4999 | Inköp/material (COGS) | IncomeStatementCalculator |
| 5000-6999 | Övriga externa kostnader | IncomeStatementCalculator |
| 7000-7399 | Personalkostnader | IncomeStatementCalculator |
| 7400-7499 | Avskrivningar (maskiner) | IncomeStatementCalculator |
| 7500-7699 | Övriga rörelsekostnader | IncomeStatementCalculator |
| 7700-7899 | Avskrivningar (byggnader) | IncomeStatementCalculator |
| 8000-8999 | Finansiella poster | IncomeStatementCalculator |

Source: BAS Kontogruppen (bas.se/kontoplaner/). BAS publishes yearly changelogs at `bas.se/{year}/{month}/andringar-i-kontoplanen-{year}/`.

---

## SRU Mappings (`packages/cli/src/commands/sru-report/`)

| Component | Source | Authority |
|---|---|---|
| NE K1 mapping | BAS NE_K1 SRU table | BAS Kontogruppen (bas.se/sru/) |
| SKV 269 file format | SKV260 specification | Skatteverket |
| Blankett field codes | Yearly version documents | Skatteverket |

The `neDefaultSru.ts` file maps BAS account ranges to NE K1 SRU codes (R1-R10, B1-B16). The official mapping is maintained by BAS Kontogruppen and published at bas.se/sru/.

The SKV 269 flat-file format uses tags: `#BLANKETT`, `#IDENTITET`, `#UPPGIFT`, `#SYSTEMINFO`, `#BLANKETTSLUT`. The specification is SKV260, 26th edition, version 4.0.

---

## F-Skatt / Grundavdrag (`packages/cli/src/commands/f-skatt/`)

| Component | Source | Authority |
|---|---|---|
| Grundavdrag brackets | Inkomstskattelagen 63 kap | Swedish law (riksdagen.se) |
| PBB multipliers | 0.423, 0.770, 0.293 etc. | IL 63 kap 3-5 §§ |

The grundavdrag formula uses PBB-indexed brackets defined in inkomstskattelagen chapter 63. The bracket multipliers are stable across years — only PBB changes. The formula rounds to nearest 100 SEK per Skatteverket convention.

---

## Skatteverket Test Endpoints

Skatteverket has **no open developer sandbox or API** for tax filing. All electronic submission requires Swedish e-legitimation (BankID). Here is what exists:

| Endpoint | Auth | Scope | Useful for us? |
|---|---|---|---|
| **Kontrolluppgifter (KU) test** | None | KU XML validation only | No (not moms/SRU) |
| **Momsdeklaration e-service** | BankID | Upload eSKDUpload XML, review errors before signing | Yes — manual spot-check |
| **Filoverforning (SRU)** | BankID | Upload SRU files, instant validation report | Yes — manual spot-check |
| **E-transport** | Certificate | Machine-to-machine batch filing | No (not accepting new agreements) |
| **REST APIs** | OAuth2 | Data retrieval only, not filing | No |

### Manual validation workflow (annual)

1. Generate moms XML and SRU files from a synthetic test file
2. Log into Skatteverket with BankID
3. Upload moms XML via "Lamna momsdeklaration" → review validation errors → do NOT sign
4. Upload SRU files via Filoverforing → review validation report → do NOT submit
5. Fix any errors found, update tests

### Automated validation (in test suite)

- **Moms XML**: `packages/cli/tests/e2e/moms-dtd-validation.e2e.test.ts` — validates generated XML against eSKDUpload v6.0 DTD using `xmllint` (5 tests)
- **SRU format**: `packages/cli/tests/e2e/sru-format-validation.e2e.test.ts` — validates SKV 269 tag structure, ordering, field types, CRLF encoding, org number format (17 tests)

### Test data

- **Test personnummer**: Skatteverket publishes ~40,000 as open data (JSON/XLS) at skatteverket.se
- **Test org numbers**: Not officially published; generate synthetic 10-digit numbers following Luhn checksum

---

## Verification Cadence

| Domain | Frequency | When | Triggered by |
|---|---|---|---|
| Tax constants | Yearly | After Nov 30 | New statslåneränta published |
| Moms DTD | Every 2-3 years | When Skatteverket announces changes | Rare |
| BAS ranges | Yearly | After Dec BAS changelog | BAS annual release |
| SRU mappings | Yearly | Before deklaration deadline | Tax form changes |
| F-skatt formula | Every 5+ years | When IL 63 kap is amended | Legislative change |

---

## Audit Trail

Each compliance verification produces a report saved to `Plans/compliance-audit-YYYY-MM-DD.md`. These form an audit trail showing when each constant was last verified and against which source.

| Date | Verified by | Findings |
|---|---|---|
| 2026-04-05 | VerifyCompliance/FullAudit | stateTaxThreshold 2025 was wrong (613900→625800). All other constants correct. eSKDUpload v6.0 current. BAS 2025 no structural changes. NE K1 SRU unchanged. |
