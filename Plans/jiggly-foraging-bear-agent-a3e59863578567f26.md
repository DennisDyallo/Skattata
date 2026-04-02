# NE Blankett SRU Field Codes Research

## Sources

- **Primary source**: BAS Kontogruppen official mapping tables (bas.se/sru/)
  - `NE_K1-201002.xlsx` -- K1 (forenklat arsbokslut) mapping
  - `NE_EJ_K1-Intervall-231002.xlsx` -- non-K1 (fullstandigt arsbokslut) mapping
- **Secondary source**: srufiler.se NE field list (confirms field codes and descriptions)
- **Tertiary**: Existing Skattata codebase `sru-report/index.ts` (already uses some NE codes)

---

## 1. NE Income Statement SRU Codes (Resultatrakning)

### Income (Intakter)

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| R1 | 7400 | Forsaljning och utfort arbete samt ovriga momspliktiga intakter | Sales and work performed, VAT-liable income |
| R2 | 7401 | Momsfria intakter | VAT-exempt income |
| R3 | 7402 | Bil- och bostadsforrman m.m. | Car and housing benefits |
| R4 | 7403 | Ranteintakter m.m. | Interest income etc. |

### Costs (Kostnader)

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| R5 | 7500 | Varor, material och tjanster / Varor och legoarbeten | Goods, materials and services |
| R6 | 7501 | Ovriga externa kostnader | Other external costs |
| R7 | 7502 | Anstalld personal | Employee expenses |
| R8 | 7503 | Rantekostnader m.m. | Interest expenses etc. |

### Depreciation (Avskrivningar)

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| R9 | 7504 | Avskrivningar och nedskrivningar byggnader och markanlaggningar | Depreciation -- buildings and land improvements |
| R10 | 7505 | Avskrivningar och nedskrivningar maskiner och inventarier och immateriella tillgangar | Depreciation -- machinery, equipment and intangibles |

### Result

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| R11 | 7440 | Bokfort resultat | Reported result (net income) |

---

## 2. NE Balance Sheet SRU Codes (Balansrakning)

### Fixed Assets (Anlaggningstillgangar)

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| B1 | 7200 | Immateriella anlaggningstillgangar | Intangible fixed assets |
| B2 | 7210 | Byggnader och markanlaggningar | Buildings and land improvements |
| B3 | 7211 | Mark och andra tillgangar som inte far skrivas av | Land and non-depreciable assets |
| B4 | 7212 | Maskiner och inventarier | Machinery and equipment |
| B5 | 7213 | Ovriga anlaggningstillgangar | Other fixed assets |

### Current Assets (Omsattningstillgangar)

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| B6 | 7240 | Varulager | Inventory |
| B7 | 7250 | Kundfordringar | Accounts receivable |
| B8 | 7260 | Ovriga fordringar | Other receivables |
| B9 | 7280 | Kassa och bank | Cash and bank |

### Equity and Liabilities (Eget kapital och skulder)

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| B10 | 7300 | Eget kapital | Equity |
| B11 | 7320 | Obeskattade reserver | Untaxed reserves (only in non-K1) |
| B12 | 7330 | Avsattningar | Provisions (only in non-K1) |
| B13 | 7380 | Laneskulder | Loan debt |
| B14 | 7381 | Skatteskulder | Tax liabilities |
| B15 | 7382 | Leverantorsskulder | Accounts payable |
| B16 | 7383 | Ovriga skulder | Other liabilities |

**K1 vs non-K1 difference**: K1 (forenklat arsbokslut) does NOT use B11 (7320) or B12 (7330). The K1 balance sheet goes directly from B10 to B13. Non-K1 uses all B10-B16 including B11 and B12.

---

## 3. NE Tax Adjustment SRU Codes (Skattemassiga justeringar)

These are the same for both K1 and non-K1. They are NOT part of the rackenkapschema but are on the NE blankett itself.

| NE Field | SRU Code | Swedish Name | English Description |
|----------|----------|----------------------------------------------|------|
| R12 | 7600 | Bokfort resultat fran foregaende ar | Reported result from prior year |
| R13 | 7601 | Ej avdragsgilla bokforda kostnader | Non-deductible booked expenses |
| R14 | 7700 | Ej skattepliktig bokforda intakter | Non-taxable booked income |
| R15 | 7602 | Ej bokforda intakter som ska beskattas | Unbooked taxable income |
| R16 | 7701 | Ej bokforda kostnader som ska dras av | Unbooked deductible expenses |
| R18 | 7702 | Andel i overskott fran handelsbolag | Joint venture surplus share |
| R19 | 7603 | Andel i underskott fran handelsbolag | Joint venture loss share |
| R20 | 7614 | Medhjalpande make, andel av intakt | Spouse income portion |
| R21 | 7703 | Medhjalpande make, avdrag | Spouse allocation |
| R22 | 7704 | Ovriga skattemassiga justeringar (kostnad) | Other tax adjustments (expense side) |
| R23 | 7604 | Ovriga skattemassiga justeringar (intakt) | Other tax adjustments (income side) |
| R24 | 7705 | Outnyttjat underskott fran foregaende ar | Unused loss carryforward |
| R25 | 7706 | Skogs-/substansminskningsavdrag | Forest/substance reduction deduction |
| R26 | 7605 | Aterford vardeminskningsavdrag | Depreciation reversal |
| R27 | 7606 | Uttag fran skogskonto | Forest account withdrawal |
| R28 | 7707 | Insattning pa skogskonto | Forest account deposit |
| R30 | 7708 | Positiv rantefordelning | Positive interest allocation |
| R31 | 7607 | Negativ rantefordelning | Negative interest allocation |
| R32 | 7608 | Aterforing periodiseringsfond | Periodization fund reversal |
| R34 | 7709 | Avsattning periodiseringsfond | Periodization fund allocation |
| R36 | 7710 | Okning expansionsfond | Expansion fund increase |
| R37 | 7609 | Minskning expansionsfond | Expansion fund decrease |
| R38 | 7711 | Pensionspremier avdrag | Pension contributions deduction |
| R39 | 7712 | Sarskild loneskatt pa pensionskostnader | Special wage tax on pension |
| R40 | 7610 | Foretagaravdrag fran foregaende ar | Prior year self-employment deduction |
| R41 | 7713 | Arets beraknade egenavgifter | Current year estimated self-employment tax |
| R43 | 7714 | Arets beraknade avdrag for egenavgifter (schablonavdrag) | Estimated self-employment deduction (flat-rate) |
| R44 | 7611 | Sjukpenning | Sick benefits |
| R45 | 7612 | Allmant avdrag | General deduction |
| R46 | 7613 | Underskott kapital (utnyttjat) | Loss utilization |
| R47 | 7630 | Overskottsresultat | Surplus result (positive -> INK1) |
| R48 | 7730 | Underskottsresultat | Deficit result (negative -> INK1) |

**Note**: R17, R29, R33, R35, R42 are intentionally skipped (not used).

---

## 4. BAS Account Ranges to NE SRU Code Mapping

### K1 (Forenklat arsbokslut) -- from BAS official mapping table

**Balance Sheet:**

| SRU Code | NE Field | BAS Accounts (K1 -- "BAS Forenklat arsbokslut 2023") |
|----------|----------|-------------------------------------------------------|
| 7200 | B1 | 1000 (Immateriella anlaggningstillgangar) |
| 7210 | B2 | 1110 (Byggnader), 1150 (Markanlaggningar) |
| 7211 | B3 | 1130 (Mark), 1180 (Pagaende nyanlaggningar/forskott) |
| 7212 | B4 | 1220 (Maskiner och inventarier), 1230 (Byggnads-/markinventarier), 1240 (Bilar/transportmedel) |
| 7213 | B5 | 1300 (Andelar) |
| 7240 | B6 | 1400 (Varulager) |
| 7250 | B7 | 1500 (Kundfordringar) |
| 7260 | B8 | 1600 (Ovriga fordringar), 1650 (Momsfordran), 1700 (Forskott till leverantorer) |
| 7280 | B9 | 1910 (Kassa), 1920 (PlusGiro), 1930 (Foretagskonto/checkkonto), 1940 (Ovriga bankkonton), 1970 (Sarskilda bankkonton) |
| 7300 | B10 | 2010 (Eget kapital delagare 1), 2020-2040 (Eget kapital delagare 2-4) |
| 7380 | B13 | 2330 (Checkrakningskredit), 2350 (Skulder kreditinstitut), 2390 (Ovriga laneskulder) |
| 7381 | B14 | 2610 (Utg moms oreducerad), 2620 (Utg moms reducerad 1), 2630 (Utg moms reducerad 2), 2640 (Ing moms), 2650 (Redovisningskonto moms), 2660 (Sarskilda punktskatter), 2710 (Personalskatt), 2730 (Lag/avtalade sociala avgifter) |
| 7382 | B15 | 2440 (Leverantorsskulder) |
| 7383 | B16 | 2900 (Ovriga skulder) |

**Income Statement:**

| SRU Code | NE Field | BAS Accounts (K1) |
|----------|----------|---------------------|
| 7400 | R1 | 3000 (Forsaljning/utfort arbete), 3500 (Fakturerade kostnader), 3700 (Lamnade rabatter R1/R2), 3900 (Ovriga rorelseintakter R1/R2) |
| 7401 | R2 | 3100 (Momsfria intakter), 3700 (Lamnade rabatter R1/R2), 3900 (Ovriga rorelseintakter R1/R2), 3970 (Vinst vid avyttring anlaggningstillgangar), 3980 (Erhallna bidrag) |
| 7402 | R3 | 3200 (Bil- och bostadsforrman) |
| 7403 | R4 | 8310 (Ranteintakter/utdelningar), 8330 (Valutakursdifferenser fordringar) |
| 7500 | R5 | 4000 (Varor), 4600 (Legoarbeten/underentreprenader), 4700 (Erhallna rabatter/bonus), 4900 (Forandring av lager) |
| 7501 | R6 | 5000 (Lokalkostnader), 5100 (Fastighetskostnader), 5200 (Hyra anlaggningstillgangar), 5400 (Forbrukningsinventarier), 5500 (Reparation/underhall), 5600 (Kostnader transportmedel), 5610 (Personbilskostnader), 5620 (Lastbilskostnader), 5700 (Frakter/transporter), 5800 (Resekostnader), 5900 (Reklam/PR), 6000 (Ovriga forsaljningskostnader), 6070 (Representation), 6100 (Kontorsmateriel/trycksaker), 6200 (Tele/post), 6300 (Foretagsforsakringar), 6310 (Foretagsforsakringar/ovriga riskkostnader), 6500 (Ovriga externa tjanster), 6800 (Inhyrd personal), 6900 (Ovriga kostnader), 6980 (Foreningsavgifter) |
| 7502 | R7 | 7000 (Loner till anstallda), 7300 (Kostnadsersattningar/formaner), 7400 (Pensionskostnader), 7500 (Sociala avgifter), 7600 (Ovriga personalkostnader) |
| 7503 | R8 | 8410 (Rantekostnader skulder), 8430 (Valutakursdifferenser skulder) |
| 7504 | R9 | 7700 (Nedskrivningar R9/R10), 7820 (Avskrivningar byggnader/markanlaggningar), 7980 (Ersattningsfonder R9/R10) |
| 7505 | R10 | 7810 (Avskrivningar immateriella), 7830 (Avskrivningar maskiner/inventarier), 7980 (Ersattningsfonder R9/R10) |
| 7440 | R11 | 8990 (Resultat) |

### Non-K1 (Fullstandigt arsbokslut) -- interval-based from BAS official mapping table

**Balance Sheet:**

| SRU Code | NE Field | BAS Account Ranges |
|----------|----------|---------------------|
| 7200 | B1 | 10xx |
| 7210 | B2 | 1100-1129, 1150-1179, 1190-1199 |
| 7211 | B3 | 113x, 114x, 118x, 1291 |
| 7212 | B4 | 1200-1290, 1292-1299 |
| 7213 | B5 | 13xx |
| 7240 | B6 | 14xx |
| 7250 | B7 | 15xx |
| 7260 | B8 | 16xx-18xx |
| 7280 | B9 | 19xx |
| 7300 | B10 | 201x, 205x |
| 7320 | B11 | 21xx |
| 7330 | B12 | 22xx |
| 7380 | B13 | 23xx, 241x, 248x |
| 7381 | B14 | "Inget redovisas har" (Nothing reported here -- see note) |
| 7382 | B15 | 2440-2449, 2460-2479 |
| 7383 | B16 | 2420-2439, 2450-2459, 2490-2499, 26xx-29xx |

**Income Statement:**

| SRU Code | NE Field | BAS Account Ranges |
|----------|----------|---------------------|
| 7400 | R1 | 30xx-37xx, 39xx (same range as R2; see note about allocation) |
| 7401 | R2 | 30xx-37xx, 39xx (same range as R1; allocated by VAT status) |
| 7402 | R3 | (Bil- och bostadsforrman, no specific range listed) |
| 7403 | R4 | 38xx, 801x, 802x(+), 803x(+), 811x, 812x(+), 813x(+), 820x, 821x, 822x(+), 823x(+), 824x(+), 825x, 826x, 829x(+), 830x, 831x, 832x(+), 833x(+), 834x, 835x(+), 836x, 839x, 843x(+), 844x, 845x(+), 849x(+), 881x(+), 886x(+), 888x(+), 889x(+) |
| 7500 | R5 | 40xx-49xx |
| 7501 | R6 | 50xx-69xx |
| 7502 | R7 | 70xx-76xx |
| 7503 | R8 | 774x, 779x, 79xx, 802x(-), 803x(-), 807x, 808x, 812x(-), 813x(-), 817x, 818x, 822x(-), 823x, 824x(-), 827x, 828x, 829x(-), 832x(-), 833x(-), 835x(-), 837x, 838x, 840x, 841x, 842x, 843x(-), 845x(-), 846x, 848x, 849x(-), 881x(-), 886x(-), 888x(-), 889x(-), 89xx (excl. 899x) |
| 7504 | R9 | 772x, 777x, 782x, 784x, 885x |
| 7505 | R10 | 771x, 773x, 776x, 778x, 781x, 783x, 885x |
| 7440 | R11 | 899x |

**Note on R1/R2 split**: In the non-K1 mapping, BAS accounts 30xx-37xx and 39xx are shared between R1 (7400) and R2 (7401). The split depends on whether the income is VAT-liable (R1) or VAT-exempt (R2). The accounting software makes this determination based on the specific account used.

**Note on (+)/(-) notation**: For some accounts in 8xxx range, a (+) means "if the balance is income, report it on this row" and (-) means "if the balance is a cost, report it on this row." This allows the same account group to appear on both the R4 (interest income) and R8 (interest expenses) lines depending on sign.

---

## 5. Ovriga uppgifter (Additional Information Fields)

| SRU Code | Description |
|----------|-------------|
| 7011 | Rakenskapsar start (accounting year start) |
| 7012 | Rakenskapsar slut (accounting year end) |
| 7020 | Verksamhetens art (nature of business) |
| 7021 | Passiv naringsverksamhet (passive business indicator) |
| 7023 | Ej forenklar arsbokslut (NOT using simplified -- i.e., using K2/K3) |
| 7024 | Verksamhet utanfor EES (business outside EES) |
| 7025 | Redovisningsansvarig (accounting responsible person ID) |
| 8000 | Hyrbilskostnader (leased vehicle costs) |
| 8002 | Bilavdrag (car mileage deduction, 18.50 kr/mil) |
| 8003 | Rantekostnader enligt kontrolluppgifter (interest per control statements) |
| 8004 | Aterford vardeminskningsavdrag restvarde (residual depreciation reversal) |
| 8006 | Vardeminskningsavdrag byggnader (building depreciation deduction) |
| 8007 | Vardeminskningsavdrag markanlaggningar (land improvement depreciation) |
| 8008 | Ersattningsfonder (compensation funds) |
| 8009 | Kapitalunderlag rantefordelning positivt (capital base positive interest allocation) |
| 8010 | Kapitalunderlag rantefordelning negativt (capital base negative interest allocation) |
| 8011 | Positivt fordelningsbelopp sparat (saved positive distribution amount) |
| 8012 | Kapitalunderlag expansionsfond positivt (expansion fund capital base positive) |
| 8046 | Bitratt av redovisningsbyra (professional assistance indicator) |

---

## 6. K1 vs K2/K3 Differences

### Key Finding: Same SRU codes, different scope

Both K1 and non-K1 (K2/K3) use the **same NE blankett** and the **same SRU field codes** (7200-7505, 7440, etc.). The differences are:

1. **K1 (Forenklat arsbokslut)**:
   - Most common for small sole proprietors (revenue under 3 MSEK)
   - Uses "BAS Forenklat arsbokslut" chart of accounts (simplified, fewer accounts)
   - **Does NOT use B11 (7320) or B12 (7330)** -- no untaxed reserves or provisions
   - BAS mapping is account-by-account (specific accounts like 1110, 1150, etc.)
   - The field `7023` is NOT marked (since they ARE using forenklat)

2. **Non-K1 (Fullstandigt arsbokslut, K2 or K3)**:
   - For larger sole proprietors or those who choose full accounting
   - Uses standard BAS chart of accounts
   - **Uses B11 (7320) and B12 (7330)** -- untaxed reserves and provisions
   - BAS mapping is range-based (10xx, 14xx, 50xx-69xx, etc.)
   - The field `7023` IS marked to indicate non-simplified accounting
   - More complex 8xxx account handling with (+)/(-) sign-dependent routing

3. **Which is more common?**: K1 is significantly more common. Most enskild firma operators with annual revenue under 3 MSEK use forenklat arsbokslut. K2/K3 is required for larger businesses or those choosing voluntary audit.

### Summary of structural differences

| Feature | K1 (Forenklat) | Non-K1 (K2/K3) |
|---------|---------------|-----------------|
| B11 (Obeskattade reserver) | Not used | 7320 = 21xx |
| B12 (Avsattningar) | Not used | 7330 = 22xx |
| Revenue split R1/R2 | By account (3000=R1, 3100=R2) | By range (30xx-37xx shared) |
| BAS mapping style | Specific accounts | Account ranges |
| 8xxx financial items | Simple (8310, 8410) | Complex with (+)/(-) routing |
| Field 7023 | Not set | Set (marked) |

---

## 7. Simplified BAS Range Summary for Implementation

For a typical Skattata implementation targeting K1 (most common), the simplified mapping is:

| BAS Range | NE SRU | NE Field | Description |
|-----------|--------|----------|-------------|
| 1000-1099 | 7200 | B1 | Intangible assets |
| 1100-1149 | 7210 | B2 | Buildings |
| 1150-1199 | 7210 | B2 | Land improvements |
| 1130-1149 | 7211 | B3 | Land (non-depreciable) |
| 1180-1199 | 7211 | B3 | WIP and prepayments (buildings/land) |
| 1200-1299 | 7212 | B4 | Machinery and equipment |
| 1300-1399 | 7213 | B5 | Other fixed assets (shares etc.) |
| 1400-1499 | 7240 | B6 | Inventory |
| 1500-1599 | 7250 | B7 | Accounts receivable |
| 1600-1899 | 7260 | B8 | Other receivables |
| 1900-1999 | 7280 | B9 | Cash and bank |
| 2010-2049 | 7300 | B10 | Equity |
| 2330-2399 | 7380 | B13 | Loan debt |
| 2610-2730 | 7381 | B14 | Tax liabilities (VAT, payroll tax) |
| 2440-2449 | 7382 | B15 | Accounts payable |
| 2900-2999 | 7383 | B16 | Other liabilities |
| 3000-3099 | 7400 | R1 | Sales (VAT-liable) |
| 3100-3199 | 7401 | R2 | VAT-exempt income |
| 3200-3299 | 7402 | R3 | Car/housing benefits |
| 3500-3699 | 7400 | R1 | Invoiced costs, other operating income |
| 3700-3899 | 7400/7401 | R1/R2 | Discounts (allocated by VAT status) |
| 3900-3999 | 7400/7401 | R1/R2 | Other operating income (allocated by VAT status) |
| 4000-4999 | 7500 | R5 | Goods, materials, subcontracting |
| 5000-6999 | 7501 | R6 | Other external costs |
| 7000-7699 | 7502 | R7 | Employee expenses |
| 7700-7999 | 7504/7505 | R9/R10 | Depreciation (split by asset type) |
| 8310-8399 | 7403 | R4 | Interest income |
| 8400-8499 | 7503 | R8 | Interest expenses |
| 8990-8999 | 7440 | R11 | Net result |

**Important caveat**: The simplified range summary above is approximate. In practice, accounting software assigns #SRU codes per-account based on the official BAS mapping tables. The Skattata codebase correctly relies on the `#SRU` tags already present in the SIE file rather than deriving the mapping itself. This approach is correct because:
1. The BAS-to-NE mapping has overlapping ranges (3700, 3900 can go to either R1 or R2)
2. Sign-dependent routing exists for 8xxx accounts in non-K1
3. The exporting software has the context to make correct assignments

---

## 8. Relevance to Skattata Codebase

The existing `SruReportCalculator` already handles NE correctly by:
- Reading `#SRU` tags from the SIE file (assigned by exporting software)
- Grouping by SRU code and summing balances
- Computing R43/7714 (egenavgifter schablonavdrag) when not present

The research confirms:
- SRU code 7714 = R43 (egenavgifter schablonavdrag) -- already implemented correctly
- The NE form type uses the same SRU code numbering regardless of K1/K2/K3
- K1 omits B11 (7320) and B12 (7330) but they simply won't appear in the SIE file if not applicable
- No code changes needed to the calculator -- the `#SRU` tag approach is the correct one

### Potential enhancement opportunities:
1. **Fallback mapping**: When `#SRU` tags are missing (some SIE files don't have them), could derive NE SRU codes from BAS account ranges using the K1 mapping table above
2. **Validation**: Could warn when K1 fields B11/B12 appear (suggests non-K1 accounting for a file expected to be K1)
3. **R47/R48 computation**: Could compute surplus (7630) vs deficit (7730) from the sum of all NE result fields
