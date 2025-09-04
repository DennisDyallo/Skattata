# Whats the difference between the SE, SI and SIE files in Swedish accounting digital format files?

The difference between SE, SI, and SIE files in Swedish accounting lies in their structure and purpose. The key distinction is that SIE is the official Swedish standard for digital bookkeeping data exchange, comprising a few major file "types" (sometimes labeled with numerals like SIE1, SIE2, etc.), each with varying levels of accounting detail.

SIE File Types Overview
SIE Format Specification - sie.se

SIE1 ("SE-fil"): Contains only the yearly opening and closing balances for all accounts in the chart of accounts. This is used primarily to export or import summary information for tax programs or high-level year-end reporting.

SIE2 ("SI-fil"): Includes the same data as SIE1, but additionally the balance change per month for each account—allowing for period (monthly) analysis.

SIE3: Adds further detail by including balances for different profit centers (cost centers, projects, etc.), not just aggregating by account.

SIE4: Contains everything above, plus all transaction vouchers (verifikat) from the full accounting year. This file is the most complete and is used for both export and import of transactional data—crucial for full historic bookkeeping and compliance.

SIE4i: Specialized for only supporting document vouchers—enables importing specific transactions from support systems (e.g., payroll or invoicing software).

Summary Table
File/Type	Swedish Name	Main Content	Typical Usage
SIE1	SE-fil	Year-end balances for all accounts 	Tax/declaration, annual report
SIE2	SI-fil	SIE1 content + monthly period balances 	Periodic/monthly analysis
SIE3	-	SIE2 content + profit center details 	Project/cost center reporting
SIE4	-	SIE3 content + all transaction vouchers 	Full bookkeeping exchange
SIE4i	-	Transaction vouchers only 	Supports system integration
Practical Implications
SE-fil (SIE1) is best for high-level summaries and annual closures.

SI-fil (SIE2) enables deeper monthly/period detail, vital for e.g. audit or trend analysis.

SIE4 is essential for data migration or archival, as it covers all transaction-level bookkeeping history.

All file types use the SIE format which is a tagged text (not XML), optimized for compact size and wide compatibility among Swedish accounting systems. They are universally used for compliance and reporting in digital Swedish bookkeeping.

As a C# developer implementing parsing and writing for SIE formats, understanding the key distinctions between SIE 4 and SIE 5 is crucial. The transition from SIE 4 to SIE 5 represents a significant modernization of the standard. Here’s a detailed breakdown of what you need to know, drawing from the provided sources.

### Key Differences: SIE 4 vs. SIE 5

The primary differences can be categorized into file structure and technology, data content and scope, and specific technical requirements.

#### 1. File Structure and Technology
This is the most significant change from a developer's perspective.

*   **Format Type**:
    *   **SIE 4**: This is a tag-based, plaintext format. Each data item begins with a label (e.g., `#KONTO`, `#VER`). The character set is specified as IBM PC 8-bits extended ASCII (Codepage 437).Of course. As a C# developer implementing parsing and writing for SIE formats, understanding the key distinctions between SIE 4 and SIE 5 is crucial. The transition from SIE 4 to SIE 5 represents a significant modernization of the standard. Here’s a detailed breakdown of what you need to know, drawing from the provided sources.

### Key Differences: SIE 4 vs. SIE 5

The primary differences can be categorized into file structure and technology, data content and scope, and specific technical requirements.

#### 1. File Structure and Technology
This is the most significant change from a developer's perspective.

*   **Format Type**:
    *   **SIE 4**: This is a tag-based, plaintext format. Each data item begins with a label (e.g., `#KONTO`, `#VER`). The character set is specified as IBM PC 8-bits extended ASCII (Codepage 437). This legacy format can be challenging to work with using modern tools.
    *   **SIE 5**: This format is **XML-based**, which is a fundamental shift. It uses a well-defined schema (`.xsd` file) for validation, making it easier for tools to ensure technical quality. For a C# developer, this means you can leverage powerful built-in libraries like `System.Xml.Linq` (LINQ to XML) or `System.Xml.Serialization` to parse and generate files. You can even auto-generate C# classes from the XSD schema, which significantly simplifies implementation.

*   **Character Encoding**:
    *   **SIE 4**: Strictly uses Codepage 437, which poorly represents special language-specific characters.
    *   **SIE 5**: Requires support for modern character sets. Writing systems must use **UTF-8 or ISO-8859-1**, and reading systems must be able to handle both. This provides robust support for special characters.

*   **Labels and Naming**:
    *   **SIE 4**: Uses Swedish labels (tags), such as `#KONTO`, `#VER`, `#TRANS`.
    *   **SIE 5**: Uses **English element and attribute names**, like `<Account>`, `<JournalEntry>`, and `<LedgerEntry>`, to be more accessible to international developers.

#### 2. Data Content and Scope
SIE 5 significantly expands the type and granularity of data that can be transferred.

*   **Sub-accounts (Sidoordnad bokföring)**:
    *   **SIE 4**: Lacks standardized structures for detailed sub-ledgers like accounts receivable/payable or fixed asset registers. This was a notable weakness.
    *   **SIE 5**: Introduces a **comprehensive and generic structure for "underindelade konton" (subdivided accounts)**. This includes specific structures for:
        *   Customer invoices (`<CustomerInvoices>`)
        *   Supplier invoices (`<SupplierInvoices>`)
        *   Fixed assets (`<FixedAssets>`)
        This allows for the transfer of not just account balances, but the individual items (invoices, assets) that make up those balances.

*   **Attached Documents**:
    *   **SIE 4**: Has no provision for including electronic documents like scanned invoices.
    *   **SIE 5**: Allows for **embedding electronic documents** (e.g., PDFs) directly into the XML file or including references to them. This is handled via the `<Documents>` section with `<EmbeddedFile>` or `<FileReference>` elements.

*   **Completeness and File Integrity**:
    *   **SIE 4**: The standard evolved over time, leading to many optional items and ambiguity for reading systems.
    *   **SIE 5**: Enforces **higher requirements for completeness**. It defines what constitutes a "complete file," making many more data points mandatory to ensure consistency and predictability for reading systems. For instance, a complete file must include chart of accounts, opening/closing balances for used accounts, all transaction entries for the primary fiscal year, and detailed sub-account posts.

*   **File Protection (Digital Signature)**:
    *   **SIE 4**: Lacks a built-in mechanism to ensure file integrity.
    *   **SIE 5**: Mandates a **digital signature (`<Signature>`)** for most file types, based on the XMLDsig standard. Reading systems must verify this signature and warn the user if it's invalid. This protects against accidental or deliberate changes to the file.

#### 3. Specific Technical and Conceptual Changes

*   **Proprietary Extensions**:
    *   **SIE 4**: Some vendors created proprietary tags, leading to an inconsistent standard.
    *   **SIE 5**: Provides a **standardized mechanism for proprietary extensions** using XML namespaces and extension schemas. This allows vendors to add system-specific data in an organized way without breaking compatibility for standard-compliant readers.

*   **Handling Corrections**:
    *   **SIE 4**: Has items for removed (`#BTRANS`) and supplementary (`#RTRANS`) transactions to handle corrections.
    *   **SIE 5**: Retains a similar mechanism with `<Overstrike>` for marking a struck ledger entry and adding a new one with its own `<EntryInfo>`. It also adds `<CorrectedBy>` to link a transaction to its correction voucher, improving traceability.

*   **Multi-dimensional Balances**:
    *   **SIE 4**: Representation of balances for objects is one-dimensional, meaning you can't get a balance for the intersection of two dimensions (e.g., sales for a specific project *in* a specific department).
    *   **SIE 5**: Solves this by introducing elements like `<OpeningBalanceMultidim>`, allowing for balances at the **intersection of multiple dimensions**, which is a significant improvement for analysis.

*   **File Types and Usage Scenarios**:
    *   **SIE 4**: Defines distinct file types (1, 2, 3, 4) for different levels of detail, from closing balances to full transactions.
    *   **SIE 5**: Moves away from numbered "types." Instead, it defines a **"complete file"** and allows for data to be omitted in a controlled manner (e.g., to reduce file size). It also distinguishes between a standard data export file (rooted with `<Sie>`) and a "bokföringsorderfil" for importing data from subsystems (rooted with `<SieEntry>`), which has slightly different mandatory fields.

### Summary for C# Implementation

| Feature | SIE 4 | SIE 5 | C# Implementation Notes |
| :--- | :--- | :--- | :--- |
| **File Format** | Tag-based plaintext | XML with a formal schema | **SIE 4**: Requires manual line-by-line parsing. **SIE 5**: Use `XmlSerializer` or LINQ to XML. Generate classes from the XSD for type safety. |
| **Character Set** | Codepage 437 | UTF-8 / ISO-8859-1 | **SIE 4**: `Encoding.GetEncoding(437)`. **SIE 5**: Standard `Encoding.UTF8` will cover most cases. |
| **Sub-ledgers** | Not supported | Customer/Supplier Invoices, Fixed Assets | **SIE 5**: Model these as distinct classes in your C# object model. |
| **Digital Signature** | Not supported | Mandatory (XMLDsig) | **SIE 5**: Use the `System.Security.Cryptography.Xml` namespace. The `SignedXml` class is essential for creating and verifying signatures. |
| **Attached Files** | Not supported | Embedded or referenced | **SIE 5**: For embedded files, you'll need to handle Base64 encoding/decoding (`Convert.ToBase64String`/`FromBase64String`). |
| **Extensibility** | Ad-hoc proprietary tags | Standardized XML extensions | **SIE 5**: Your parser should be robust enough to ignore unknown elements/attributes from extensions without crashing. |

In essence, while SIE 4 is a simpler, line-oriented format, SIE 5 is a modern, structured, and far more comprehensive standard. For your C# implementation, parsing SIE 5 will be more complex due to its richer feature set, but the XML-based structure provides you with much more powerful and reliable tools within the .NET framework.


---
# Comprehensive SIE Format Guide (Versions 4 & 5)

This document provides a detailed specification for developers implementing parsers for both the classic tag-based SIE format (up to version 4B) and the modern XML-based SIE 5 format.

## Introduction: Two Different Formats

It is crucial to understand that SIE 4 and SIE 5 are fundamentally different formats.

**SIE 4 (and earlier):** A tag-based text file format. Each line begins with a #TAG identifier. It is sequential and procedural.

**SIE 5:** A modern, hierarchical XML format. This format is more structured, extensible, and supports new features like embedded file attachments.

A robust implementation must first detect the format (`#FLAGGA` for tag-based, `<?xml` for XML) and then delegate to the appropriate parser.

## SIE 4 (Tag-based Format) Specification

This section details the records (tags) for the classic SIE format.

### Header and Metadata Records

**#FLAGGA:** Indicates the direction of transfer. X for export/normal.
- Format: `#FLAGGA X`

**#PROGRAM:** Name and version of the program that generated the file.
- Format: `#PROGRAM "Program Name" "Version"`

**#FORMAT:** Character encoding. PC8 is the Swedish standard.
- Format: `#FORMAT PC8`

**#GEN:** Date and optional signature of file generation.
- Format: `#GEN YYYYMMDD [sign]`

**#SIETYP:** The type of SIE file (1, 2, 3, 4, 4I, 4E).
- Format: `#SIETYP 4`

**#FNAMN:** The name of the company.
- Format: `#FNAMN "Company Name"`

**#ORGNR:** The company's registration number.
- Format: `#ORGNR "YYYYMMDD-XXXX"`

**#RAR:** Defines the start and end dates of a fiscal year.
- Format: `#RAR year_no start_date end_date`
- Example: `#RAR 0 20230101 20231231`

### Chart of Accounts and Dimensions

**#KONTO:** Defines an account in the chart of accounts.
- Format: `#KONTO account_no "account_name"`
- Example: `#KONTO 1910 "Giro account"`

**#DIM:** Defines a dimension (e.g., cost center, project).
- Format: `#DIM dimension_no "dimension_name"`
- Example: `#DIM 1 "Project"`

**#OBJECT:** Defines an object within a specific dimension.
- Format: `#OBJECT dimension_no object_no "object_name"`
- Example: `#OBJECT 1 "100" "Project X"`

### Vouchers and Transactions

**#VER:** Marks the beginning of a voucher. Followed by #TRANS records within {...}.
- Format: `#VER series "no" [date] ["text"] [reg_date] [sign]`
- Example: `#VER "A" "1" 20241026 "Office Supplies"`

**#TRANS:** A single transaction line (ledger entry) within a voucher.
- Format: `#TRANS acc_no {obj_info} amount [date] ["text"] [qty] [sign]`
- Example: `#TRANS 6110 {1 "100"} 500.00`

### Balance Records

**#IB:** Opening balance for an account.
- Format: `#IB year_no acc_no balance [quantity]`
- Example: `#IB 0 1910 50000.00`

**#UB:** Closing balance for an account.
- Format: `#UB year_no acc_no balance [quantity]`
- Example: `#UB 0 1910 75000.00`

**#RES:** Result for a results account for the fiscal year.
- Format: `#RES year_no acc_no balance [quantity]`
- Example: `#RES 0 3010 150000.00`

**#OIB:** Opening balance for an account/object combination.
- Format: `#OIB year_no acc_no dim_no obj_no balance [quantity]`
- Example: `#OIB 0 6110 1 "100" 12000.00`

**#OUB:** Closing balance for an account/object combination.
- Format: `#OUB year_no acc_no dim_no obj_no balance [quantity]`
- Example: `#OUB 0 6110 1 "100" 15000.00`

**#PSALDO:** Period balance for an account/object combination.
- Format: `#PSALDO year_no period acc_no {dim_no obj_no...} balance [quantity]`
- Example: `#PSALDO 0 202301 6110 {1 "100"} 3000.00`

## SIE 5 (XML Format) Specification

SIE 5 uses a structured XML format. The following describes the main elements and their mapping to SIE 4 concepts.

### Root Element

**`<Sie>`:** The root element of the entire document.
- Attributes: version, xsi:schemaLocation.

### Main Structure

The document is primarily structured within the `<SieEntry>` element.

**`<SieEntry>`:** The main container for the accounting data.

**`<Company>`:** Contains company information.
- `<Name>`: Maps to #FNAMN.
- `<CorporateIdentityNumber>`: Maps to #ORGNR.

**`<FinancialYear>`:** Contains data for a fiscal year. Maps to #RAR.
- `<StartDate>`, `<EndDate>`.

**`<Accounts>`:** Container for the chart of accounts.
- `<Account>`: A single account. Maps to #KONTO. Attributes: accountId, description.

**`<Dimensions>`:** Container for dimensions.
- `<Dimension>`: A single dimension with `<Objects>`. Maps to #DIM and #OBJECT.

**`<Balances>`:** Contains opening and closing balances.
- `<OpeningBalance>`, `<ClosingBalance>`. Maps to #IB and #UB.

**`<Journal>`:** Container for vouchers.
- `<JournalEntry>`: A single voucher. Maps to #VER.
- `<LedgerEntry>`: A single transaction line. Maps to #TRANS. Contains accountId, amount, and optional `<Dimensions>` for object information.

### Key Additions in SIE 5

**`<Documents>`:** A major new feature for attaching files.
- `<EmbeddedFile>`: Contains a base64-encoded file directly within the XML.
- `<FileReference>`: A link to an external file.

### Example: XML Voucher

This XML snippet is the SIE 5 equivalent of a simple #VER with two #TRANS lines from SIE 4.

```xml
<JournalEntry journalId="A" entryNumber="1" entryDate="2024-10-26" description="Office Supplies">
  <LedgerEntry accountId="1910" amount="-500.00" />
  <LedgerEntry accountId="6110" amount="500.00">
    <Dimensions>
      <Dimension dimensionId="1" objectId="100" />
    </Dimensions>
  </LedgerEntry>
</JournalEntry>
```