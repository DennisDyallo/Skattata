# Research: eSKDUpload XML Element Names for Momsdeklaration

## Status: VERIFIED (Triple-checked)

## Executive Summary

The previous research mapping of ruta 35-38 to `ForsSverige`, `ForsEU`, `ForsExport`, `MellEU` is **WRONG**. Those element names do not exist in the official DTD. The correct element names have been verified directly from the **official Skatteverket eSKDUpload_6p0.dtd file** (the authoritative source).

Additionally, the current `MomsCalculator.ts` has an incorrect understanding of what ruta 30, 31, 35, 36, 37 represent. The current code maps these to EU-related fields, but the actual SKV 4700 form uses different ruta numbers than what the code assumes.

---

## Source: Official eSKDUpload DTD (Version 6.0)

**URL**: `https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd`

The DTD was fetched directly and verified. The `Moms` element contains these child elements in order:

```dtd
<!ELEMENT Moms (Period, ForsMomsEjAnnan?, UttagMoms?, UlagMargbesk?,
  HyrinkomstFriv?, InkopVaruAnnatEg?, InkopTjanstAnnatEg?,
  InkopTjanstUtomEg?, InkopVaruSverige?, InkopTjanstSverige?,
  MomsUlagImport?, ForsVaruAnnatEg?, ForsVaruUtomEg?,
  InkopVaruMellan3p?, ForsVaruMellan3p?, ForsTjSkskAnnatEg?,
  ForsTjOvrUtomEg?, ForsKopareSkskSverige?, ForsOvrigt?,
  MomsUtgHog?, MomsUtgMedel?, MomsUtgLag?,
  MomsInkopUtgHog?, MomsInkopUtgMedel?, MomsInkopUtgLag?,
  MomsImportUtgHog?, MomsImportUtgMedel?, MomsImportUtgLag?,
  MomsIngAvdr?, MomsBetala?, TextUpplysningMoms?)>
```

---

## Complete Ruta-to-XML-Element Mapping

### Section A: Momspliktig forsaljning (Sales liable to VAT)

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 05 | `ForsMomsEjAnnan` | Forsaljning, ej annan ruta | Sales liable to VAT (not in boxes 06-08) |
| 06 | `UttagMoms` | Uttag moms | Self-supply liable to VAT |
| 07 | `UlagMargbesk` | Underlag marginalbeskatting | Tax base for profit margin taxation |
| 08 | `HyrinkomstFriv` | Hyrinkomst frivillig | Rental income - voluntary tax liability |

### Section C: Inkop momspliktig (Purchases liable to VAT)

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 20 | `InkopVaruAnnatEg` | Inkop varor annat EG-land | Purchases of goods from another EU country |
| 21 | `InkopTjanstAnnatEg` | Inkop tjanster annat EG-land | Purchases of services from another EU country |
| 22 | `InkopTjanstUtomEg` | Inkop tjanster utom EG | Purchases of services outside the EU |
| 23 | `InkopVaruSverige` | Inkop varor Sverige | Domestic purchases, buyer liable |
| 24 | `InkopTjanstSverige` | Inkop tjanster Sverige | Other purchases of services |

### Section B: Utgaende skatt forsaljning (Output VAT on sales)

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 10 | `MomsUtgHog` | Moms utg. hog | Output VAT 25% |
| 11 | `MomsUtgMedel` | Moms utg. medel | Output VAT 12% |
| 12 | `MomsUtgLag` | Moms utg. lag | Output VAT 6% |

### Section D: Utgaende skatt inkop (Output VAT on purchases / reverse charge)

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 30 | `MomsInkopUtgHog` | Moms inkop utg. hog | Output VAT 25% on purchases |
| 31 | `MomsInkopUtgMedel` | Moms inkop utg. medel | Output VAT 12% on purchases |
| 32 | `MomsInkopUtgLag` | Moms inkop utg. lag | Output VAT 6% on purchases |

### Section E: Momsfri forsaljning (VAT-exempt sales)

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 35 | `ForsVaruAnnatEg` | Fors. varor annat EG-land | Sales of goods to another EU country |
| 36 | `ForsVaruUtomEg` | Fors. varor utom EG | Sales of goods outside EU (export) |
| 37 | `InkopVaruMellan3p` | Inkop varor mellanman 3-part | Intermediary purchases in triangulation |
| 38 | `ForsVaruMellan3p` | Fors. varor mellanman 3-part | Intermediary sales in triangulation |
| 39 | `ForsTjSkskAnnatEg` | Fors. tjanster skattskyldigt annat EG | Sales of services to EU traders (main rule) |
| 40 | `ForsTjOvrUtomEg` | Fors. tjanster ovrig utom EG | Other services outside Sweden |
| 41 | `ForsKopareSkskSverige` | Fors. kopare skattskyldigt Sverige | Sales where buyer is liable in Sweden |
| 42 | `ForsOvrigt` | Fors. ovrigt | Other sales |

### Section F: Ingaende moms (Input VAT)

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 48 | `MomsIngAvdr` | Moms ing. avdrag | Input VAT deductible |

### Section G: Moms att betala/fa tillbaka

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 49 | `MomsBetala` | Moms betala | VAT to pay (or receive if negative) |

### Section H-I: Import

| Ruta | XML Element | Swedish Description | English Description |
|------|-------------|---------------------|---------------------|
| 50 | `MomsUlagImport` | Moms underlag import | Tax base on imports |
| 60 | `MomsImportUtgHog` | Moms import utg. hog | Output VAT 25% on imports |
| 61 | `MomsImportUtgMedel` | Moms import utg. medel | Output VAT 12% on imports |
| 62 | `MomsImportUtgLag` | Moms import utg. lag | Output VAT 6% on imports |

---

## Corrections to Previous Research

### Ruta 35-38: Previous mapping was COMPLETELY WRONG

| Ruta | WRONG (previous) | CORRECT (from DTD) | Why previous was wrong |
|------|-------------------|---------------------|----------------------|
| 35 | `ForsSverige` | `ForsVaruAnnatEg` | "ForsSverige" does not exist in the DTD |
| 36 | `ForsEU` | `ForsVaruUtomEg` | "ForsEU" does not exist in the DTD |
| 37 | `ForsExport` | `InkopVaruMellan3p` | "ForsExport" does not exist in the DTD |
| 38 | `MellEU` | `ForsVaruMellan3p` | "MellEU" does not exist in the DTD |

None of the previously researched element names (`ForsSverige`, `ForsEU`, `ForsExport`, `MellEU`) exist in the official DTD at all.

### Ruta 30-31: Current MomsCalculator is using wrong ruta numbers

The current `MomsCalculator.ts` maps:
- Ruta 30 to "EU sales of goods" (accounts 3100-3199)
- Ruta 31 to "EU sales of services" (accounts 3300-3399)

But in the actual SKV 4700 form:
- **Ruta 30** = `MomsInkopUtgHog` = Output VAT 25% on **purchases** (reverse charge)
- **Ruta 31** = `MomsInkopUtgMedel` = Output VAT 12% on **purchases** (reverse charge)
- EU sales of goods is actually **ruta 35** (`ForsVaruAnnatEg`)
- EU sales of services is actually **ruta 39** (`ForsTjSkskAnnatEg`)

This is a significant issue in the existing code. The field codes in MomsCalculator need to be reviewed.

### Ruta 50, 60-62: Previous mapping was CLOSE but element names were wrong

| Ruta | WRONG (previous) | CORRECT (from DTD) |
|------|-------------------|---------------------|
| 50 | `MomsImportUnderlag` | `MomsUlagImport` |
| 60 | `MomsImportHog` | `MomsImportUtgHog` |
| 61 | `MomsImportMedel` | `MomsImportUtgMedel` |
| 62 | `MomsImportLag` | `MomsImportUtgLag` |

### Ruta 48-49: Input VAT element name correction

| Ruta | Current code uses | CORRECT (from DTD) |
|------|-------------------|---------------------|
| 48 | (code '48') | `MomsIngAvdr` (not `MomsIngAvworddrag`) |
| 49 | (code '49') | `MomsBetala` |

---

## BAS Account Mapping for Import VAT

Triple-verified from BAS kontoplan, Fortnox documentation, and FAR Online.

| Ruta | Description | BAS Accounts | Account Type |
|------|-------------|-------------|--------------|
| 50 | Tax base on imports | 4545, 4546, 4547 (cost accounts for imported goods) | Cost accounts (debit balance) |
| 60 | Output VAT 25% import | **2615** | Liability (credit balance, negate for display) |
| 61 | Output VAT 12% import | **2625** | Liability (credit balance, negate for display) |
| 62 | Output VAT 6% import | **2635** | Liability (credit balance, negate for display) |

Note: The import VAT is a self-assessment mechanism. The company books both output VAT (2615/2625/2635) and deductible input VAT (2640/2645) for imports. The output VAT goes in ruta 60-62, and the input VAT goes in ruta 48 (along with all other input VAT). The tax base (ruta 50) comes from cost accounts 4545-4547.

---

## DTD Structure Notes

Important implementation details from the DTD:

1. **Element ordering matters** - The DTD uses a sequence model (comma-separated, not `|`). Elements must appear in the order defined in the DTD.
2. **All fields are optional** (marked with `?`) except `Period`.
3. **All values are `#PCDATA`** - plain text, meaning integer values as strings.
4. **Root element**: `<eSKDUpload>` with `Version="6.0"` fixed attribute.
5. **DOCTYPE declaration**: `<!DOCTYPE eSKDUpload PUBLIC "-//Skatteverket, Sweden//DTD Skatteverket eSKDUpload-DTD Version 6.0//SV" "https://www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd">`
6. **No namespace** - the DTD does not define an XML namespace.
7. **Encoding**: `iso-8859-1` (Latin-1), NOT UTF-8.
8. **`TextUpplysningMoms`** - free-text field for additional information.

---

## Verification Sources

1. **Primary (authoritative)**: Official Skatteverket DTD file at `https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd` - fetched and read directly, contains the complete element definitions.

2. **Secondary**: Microsoft Dynamics 365 Swedish VAT Declaration documentation at `https://github.com/MicrosoftDocs/Dynamics-365-Unified-Operations-Public/blob/main/articles/finance/localizations/sweden/emea-swe-VAT-declaration-Sweden.md` - maps box numbers to XML element names, confirmed consistent with DTD.

3. **Tertiary**: Skatteverket form guidance at `https://www.skatteverket.se/foretag/moms/deklareramoms/fyllaimomsdeklarationen.4.3a2a542410ab40a421c80004214.html` - confirms ruta descriptions match element semantic meanings.

4. **BAS accounts**: Verified via BAS kontoplan 2022 PDF, Fortnox import VAT documentation, FAR Online kontoplan, and eDeklarera.se.

---

## Impact on Current Code

### MomsXmlWriter.ts
The current writer uses a generic `<Uppgift kod="XX" belopp="YY" />` format, which is **NOT the eSKDUpload format at all**. The eSKDUpload format uses named elements like `<MomsUtgHog>25000</MomsUtgHog>`, not attribute-based entries.

To generate valid eSKDUpload XML, the writer needs to be completely restructured to:
1. Use the `<!DOCTYPE eSKDUpload ...>` declaration
2. Use `iso-8859-1` encoding (not UTF-8)
3. Use named child elements of `<Moms>` in the correct DTD order
4. Wrap in `<eSKDUpload Version="6.0">` root element

### MomsCalculator.ts
The field codes 30 and 31 in the current calculator are mapped to "EU sales of goods/services" but the official form uses ruta 30/31 for output VAT on purchases (reverse charge). The EU sales fields should use codes 35 and 39 respectively. This needs careful review.

---

## Complete Example XML (valid eSKDUpload)

```xml
<?xml version="1.0" encoding="iso-8859-1"?>
<!DOCTYPE eSKDUpload PUBLIC "-//Skatteverket, Sweden//DTD Skatteverket eSKDUpload-DTD Version 6.0//SV" "https://www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd">
<eSKDUpload Version="6.0">
  <OrgNr>165599990602</OrgNr>
  <Moms>
    <Period>202401</Period>
    <ForsMomsEjAnnan>100000</ForsMomsEjAnnan>
    <MomsUtgHog>25000</MomsUtgHog>
    <MomsIngAvdr>10000</MomsIngAvdr>
    <MomsBetala>15000</MomsBetala>
  </Moms>
</eSKDUpload>
```

Note: Only non-zero fields need to be included (all are optional except Period). Elements must appear in DTD-defined order.
