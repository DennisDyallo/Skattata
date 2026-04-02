# Plan: Rewrite Moms Module for eSKDUpload v6.0

## Context

The Skatteverket eSKDUpload v6.0 DTD was retrieved directly from `https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd` and reveals three categories of issues in the current moms implementation:

1. **XML Writer** — Our draft XML format (`<Momsdeklaration>/<Uppgift kod="05">`) is entirely wrong. Skatteverket requires `<eSKDUpload Version="6.0">/<Moms>/<ForsMomsEjAnnan>` with named elements in DTD-defined order and ISO-8859-1 encoding.

2. **Wrong Ruta Numbers** — The MomsCalculator maps EU fields to wrong SKV 4700 ruta numbers (30→35, 31→39, 35→removed, 36→30, 37→folded into 48). Additionally, domestic output VAT (ruta 10/11/12) currently includes reverse charge and import sub-accounts that should be reported separately.

3. **Missing Fields** — Import VAT (ruta 50, 60-62), services from EU (ruta 21), output VAT 12%/6% on purchases (ruta 31/32), services sold to EU (ruta 39) are not calculated.

**Source of truth:** Official Skatteverket DTD, cross-verified against Microsoft Dynamics 365 Swedish VAT docs and Skatteverket form guidance.

---

## DTD Element Order (MUST match in XML output)

```
Period, ForsMomsEjAnnan(05), UttagMoms(06), UlagMargbesk(07),
HyrinkomstFriv(08), InkopVaruAnnatEg(20), InkopTjanstAnnatEg(21),
InkopTjanstUtomEg(22), InkopVaruSverige(23), InkopTjanstSverige(24),
MomsUlagImport(50), ForsVaruAnnatEg(35), ForsVaruUtomEg(36),
InkopVaruMellan3p(37), ForsVaruMellan3p(38), ForsTjSkskAnnatEg(39),
ForsTjOvrUtomEg(40), ForsKopareSkskSverige(41), ForsOvrigt(42),
MomsUtgHog(10), MomsUtgMedel(11), MomsUtgLag(12),
MomsInkopUtgHog(30), MomsInkopUtgMedel(31), MomsInkopUtgLag(32),
MomsImportUtgHog(60), MomsImportUtgMedel(61), MomsImportUtgLag(62),
MomsIngAvdr(48), MomsBetala(49), TextUpplysningMoms
```

**Note:** The DTD order is NOT numerically sorted by ruta. Section E (35-42) comes BEFORE Section B (10-12). This ordering must be respected in XML output.

---

## Step 1: Update MomsCalculator.ts

**File:** `packages/cli/src/commands/moms/MomsCalculator.ts`

### 1a. Add xmlElementName to MomsField interface

```typescript
export interface MomsField {
  code: string;           // Ruta number ('05', '10', etc.)
  xmlElementName: string; // DTD element name ('ForsMomsEjAnnan', etc.)
  label: string;
  amount: number;
}
```

### 1b. Define RUTA_DEFINITIONS constant (exported, in DTD order)

Single source of truth for ruta→element→label mapping, in the exact DTD sequence order. This constant is used by both the calculator (to build fields) and the XML writer (to emit elements in correct order).

```typescript
export const RUTA_DEFINITIONS: ReadonlyArray<{ code: string; xmlElement: string; label: string }> = [
  { code: '05', xmlElement: 'ForsMomsEjAnnan', label: 'Taxable sales' },
  { code: '06', xmlElement: 'UttagMoms', label: 'Self-supply' },
  { code: '07', xmlElement: 'UlagMargbesk', label: 'Margin scheme base' },
  { code: '08', xmlElement: 'HyrinkomstFriv', label: 'Rental income (voluntary)' },
  { code: '20', xmlElement: 'InkopVaruAnnatEg', label: 'Goods from EU' },
  { code: '21', xmlElement: 'InkopTjanstAnnatEg', label: 'Services from EU' },
  { code: '22', xmlElement: 'InkopTjanstUtomEg', label: 'Services from outside EU' },
  { code: '23', xmlElement: 'InkopVaruSverige', label: 'Goods in Sweden (reverse charge)' },
  { code: '24', xmlElement: 'InkopTjanstSverige', label: 'Services in Sweden (reverse charge)' },
  { code: '50', xmlElement: 'MomsUlagImport', label: 'Import tax base' },
  { code: '35', xmlElement: 'ForsVaruAnnatEg', label: 'Goods sold to EU' },
  { code: '36', xmlElement: 'ForsVaruUtomEg', label: 'Goods sold outside EU (export)' },
  { code: '37', xmlElement: 'InkopVaruMellan3p', label: 'Triangulation purchases' },
  { code: '38', xmlElement: 'ForsVaruMellan3p', label: 'Triangulation sales' },
  { code: '39', xmlElement: 'ForsTjSkskAnnatEg', label: 'Services sold to EU' },
  { code: '40', xmlElement: 'ForsTjOvrUtomEg', label: 'Other services outside Sweden' },
  { code: '41', xmlElement: 'ForsKopareSkskSverige', label: 'Sales buyer liable Sweden' },
  { code: '42', xmlElement: 'ForsOvrigt', label: 'Other VAT-exempt sales' },
  { code: '10', xmlElement: 'MomsUtgHog', label: 'Output VAT 25%' },
  { code: '11', xmlElement: 'MomsUtgMedel', label: 'Output VAT 12%' },
  { code: '12', xmlElement: 'MomsUtgLag', label: 'Output VAT 6%' },
  { code: '30', xmlElement: 'MomsInkopUtgHog', label: 'Output VAT 25% on purchases' },
  { code: '31', xmlElement: 'MomsInkopUtgMedel', label: 'Output VAT 12% on purchases' },
  { code: '32', xmlElement: 'MomsInkopUtgLag', label: 'Output VAT 6% on purchases' },
  { code: '60', xmlElement: 'MomsImportUtgHog', label: 'Import output VAT 25%' },
  { code: '61', xmlElement: 'MomsImportUtgMedel', label: 'Import output VAT 12%' },
  { code: '62', xmlElement: 'MomsImportUtgLag', label: 'Import output VAT 6%' },
  { code: '48', xmlElement: 'MomsIngAvdr', label: 'Input VAT deduction' },
  { code: '49', xmlElement: 'MomsBetala', label: 'VAT to pay/receive' },
];
```

### 1c. Fix field calculations

**Correct ruta mapping (what changes vs current):**

| What | Current (WRONG) | Correct | BAS Accounts |
|---|---|---|---|
| EU sales of goods | ruta 30 | **ruta 35** | 3100-3199 (negate) |
| EU sales of services | ruta 31 | **ruta 39** | 3300-3399 (negate) |
| Reverse charge output VAT 25% | ruta 36 | **ruta 30** | 2614 (negate) |
| Reverse charge input VAT | ruta 37 (separate) | **folds into ruta 48** | 2645-2649 already in 2640-2669 range |
| "Reverse charge purchases" | ruta 35 | **remove** | Was a made-up concept |

**New fields to add:**

| Ruta | Element | BAS Accounts | Sign |
|---|---|---|---|
| 21 | InkopTjanstAnnatEg | 4520-4529 | positive (cost) |
| 31 | MomsInkopUtgMedel | 2624 | negate (liability) |
| 32 | MomsInkopUtgLag | 2634 | negate (liability) |
| 39 | ForsTjSkskAnnatEg | 3300-3399 | negate (revenue) |
| 50 | MomsUlagImport | 4545-4547 | positive (cost) |
| 60 | MomsImportUtgHog | 2615 | negate (liability) |
| 61 | MomsImportUtgMedel | 2625 | negate (liability) |
| 62 | MomsImportUtgLag | 2635 | negate (liability) |

**Domestic output VAT range splitting:**

The domestic output VAT (ruta 10/11/12) must EXCLUDE reverse-charge and import sub-accounts:

```typescript
// Full range amounts (used to derive domestic by subtraction)
const out25_full = -sumRange(2610, 2619);
const reverseCharge25 = -sumRange(2614, 2614);  // ruta 30
const import25 = -sumRange(2615, 2615);          // ruta 60
const out25 = out25_full - reverseCharge25 - import25;  // ruta 10

// Same pattern for 12% and 6%
const out12_full = -sumRange(2620, 2629);
const reverseCharge12 = -sumRange(2624, 2624);  // ruta 31
const import12 = -sumRange(2625, 2625);          // ruta 61
const out12 = out12_full - reverseCharge12 - import12;  // ruta 11

const out6_full = -sumRange(2630, 2639);
const reverseCharge6 = -sumRange(2634, 2634);   // ruta 32
const import6 = -sumRange(2635, 2635);           // ruta 62
const out6 = out6_full - reverseCharge6 - import6;  // ruta 12
```

**Updated netVat (ruta 49):**

```
netVat = (out25 + out12 + out6)                        // ruta 10+11+12
       + (reverseCharge25 + reverseCharge12 + reverseCharge6)  // ruta 30+31+32
       + (import25 + import12 + import6)                // ruta 60+61+62
       - inputVat                                       // ruta 48
```

**EU purchase range narrowing:**

Current ruta 20 uses 4500-4599 (too broad). Split into:
- Ruta 20: `sumRange(4500, 4519)` — goods from EU only
- Ruta 21: `sumRange(4520, 4529)` — services from EU

**Field array construction:**

Build all fields, then filter to non-zero for display. Always include ruta 05, 10-12, 48, 49 (core domestic fields). Only include EU/import/exempt fields when non-zero.

Each field gets `xmlElementName` from `RUTA_DEFINITIONS`.

**Warnings update:**

Remove the old "reverse charge VAT appears in both domestic and EU-specific fields" warning (that was caused by the wrong ranges). Replace with clearer notes about what's included where.

---

## Step 2: Rewrite MomsXmlWriter.ts

**File:** `packages/cli/src/commands/moms/MomsXmlWriter.ts`

Complete rewrite. The new writer produces valid eSKDUpload v6.0 XML:

```xml
<?xml version="1.0" encoding="iso-8859-1"?>
<!DOCTYPE eSKDUpload PUBLIC "-//Skatteverket, Sweden//DTD Skatteverket eSKDUpload-DTD Version 6.0//SV" "https://www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd">
<eSKDUpload Version="6.0">
<OrgNr>165566000006</OrgNr>
<Moms>
<Period>202401</Period>
<ForsMomsEjAnnan>100000</ForsMomsEjAnnan>
<MomsUtgHog>25000</MomsUtgHog>
<MomsIngAvdr>10000</MomsIngAvdr>
<MomsBetala>15000</MomsBetala>
</Moms>
</eSKDUpload>
```

**Key implementation details:**

- **Encoding:** `iso-8859-1` in XML declaration. Write as Latin-1 bytes via `new Uint8Array` mapping (charCode 0-255 maps directly to ISO-8859-1).
- **DOCTYPE:** Include full PUBLIC identifier and system URL.
- **OrgNr:** Strip hyphens. 10-digit corporate → prefix `16` to make 12 digits. 12-digit personnummer → use as-is.
- **Element order:** Iterate `RUTA_DEFINITIONS` (imported from MomsCalculator). For each, if the field exists in `MomsResult.fields` with `Math.trunc(amount) !== 0`, emit the named element.
- **MomsBetala:** Always include (even if zero) since Skatteverket likely expects it.
- **Remove:** `companyName`, `sniCode`, `<Foretag>`, `<SNI>`, `<!-- Draft -->` comment — none exist in the DTD.
- **No XML escaping needed** for numeric values. Period is digits only. OrgNr is digits only.

**Updated interface:**

```typescript
export interface MomsXmlOptions {
  orgNumber: string;  // 10 or 12 digits (hyphens stripped by caller)
  period: string;     // YYYYMM
}
```

---

## Step 3: Update CLI command (index.ts)

**File:** `packages/cli/src/commands/moms/index.ts`

1. **Remove `--sni` option** from XML output path (SNI not in DTD). Keep `--sni` for non-XML output if desired, or remove entirely (it was only used in XML).
2. **Remove `companyName` from `writeMomsXml` call**.
3. **Update help text** to reflect corrected ruta numbers and new fields.
4. **ISO-8859-1 file writing:** When `--output-xml` is used, write as Latin-1 bytes:
   ```typescript
   const xmlString = writeMomsXml(result, { orgNumber, period });
   const bytes = new Uint8Array(xmlString.length);
   for (let i = 0; i < xmlString.length; i++) bytes[i] = xmlString.charCodeAt(i);
   await Bun.write(absPath, bytes);
   ```

---

## Step 4: Update test data

### 4a. Update `sie_test_files/synthetic/skattata-test-moms-eu.se`

Add accounts for the new fields being tested:
- `4520 "Inkop tjanster EU"` with #UB 15000 → ruta 21
- `2615 "Utg moms import 25%"` with #UB -3000 → ruta 60
- `4546 "Import varor"` with #UB 12000 → ruta 50
- `3305 "Forsaljning tjanster EU"` with #UB -25000 → ruta 39

### 4b. Consider new file for import-only scenario

Optional: `skattata-test-moms-import.se` with only import accounts for isolated testing.

---

## Step 5: Update E2E tests

**File:** `packages/cli/tests/e2e/financial-statements.e2e.test.ts`

### EU test (lines 81-102): Fix assertions

```
Old: f10=55000, f30=30000(EU sales), f36=5000(rev.charge out), f37=5000(rev.charge in)
New: f10=50000(domestic only, excl 2614), f35=30000(EU goods), f30=5000(rev.charge 25%), f39=25000(services to EU)
     f20=20000(goods from EU, narrowed to 4500-4519), f21=15000(services from EU)
     f50=12000(import base), f60=3000(import VAT 25%)
```

### New tests to add

1. **XML output validation** — Generate XML, verify eSKDUpload root, DOCTYPE, element names, DTD order.
2. **Import VAT fields** — Verify ruta 50/60/61/62 when import accounts present.
3. **OrgNr formatting** — 10-digit gets `16` prefix; 12-digit unchanged.
4. **No EU fields when domestic only** — existing test, but verify new field codes absent.

---

## Step 6: Update CLAUDE.md

Update these sections:
- **Momsdeklaration table** (~line 331): Fix ruta→account mapping
- **Moms XML section** (~line 393): Replace draft format description with eSKDUpload v6.0
- **SNI Codes section** (~line 415): Remove "In moms XML: `<SNI>` element" (not in spec)

---

## Verification

```bash
# 1. Unit + integration tests
bun test packages/cli

# 2. Full parser regression
bun run packages/cli/src/index.ts test-all ./sie_test_files  # 127/127

# 3. Domestic moms (no EU fields)
bun run packages/cli/src/index.ts moms sie_test_files/synthetic/skattata-test-moms-annual.se --format json

# 4. EU moms (corrected ruta numbers)
bun run packages/cli/src/index.ts moms sie_test_files/synthetic/skattata-test-moms-eu.se --format json

# 5. XML output
bun run packages/cli/src/index.ts moms sie_test_files/synthetic/skattata-test-moms-eu.se \
  --period 202301 --output-xml /tmp/moms.xml --org-number 5566000006
cat /tmp/moms.xml  # Verify eSKDUpload structure

# 6. DTD validation (if xmllint available)
xmllint --dtdvalid <(curl -s https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd) /tmp/moms.xml

# 7. Refund scenario still works
bun run packages/cli/src/index.ts moms sie_test_files/synthetic/skattata-test-moms-refund.se --format json
```

---

## Implementation Order

1. MomsCalculator.ts — Interface + RUTA_DEFINITIONS + field corrections (foundation)
2. MomsXmlWriter.ts — Complete rewrite (depends on new interface)
3. index.ts — CLI option cleanup + ISO-8859-1 writing
4. Test data — Add new accounts to EU test file
5. E2E tests — Update assertions + add new tests
6. CLAUDE.md — Documentation
7. Run full verification suite
