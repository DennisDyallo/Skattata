# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Skattata is a C# library for parsing and writing Swedish accounting files in the SIE format (Standard Import Export). The library supports both SIE 4 (tag-based text format) and SIE 5 (XML format) specifications. SIE files are the standard format for exchanging accounting data between Swedish accounting systems.

## Project Structure

- **Skattata.Core/**: Core library containing the main parsing and writing functionality
- **Skattata.Tests/**: MSTest unit and integration tests
- **Skattata.Tests.ConsoleApp/**: Console application for manual testing with SIE files
- **docs/**: Documentation including SIE format specifications
- **sie_test_files/**: Extensive collection of real SIE files for testing

## Key Architecture Components

### Core Classes

- **SieDocument** (`SieDocument.cs:12`): Main entry point containing dual parsers for SIE 4 (tag-based) and SIE 5 (XML) formats
  - Auto-detects format by checking for XML declaration
  - Contains nested `SieTagParser` for SIE 4 format parsing
  - Contains nested `SieXmlParser` for SIE 5 XML format parsing

- **SieDocumentWriter** (`SieDocumentWriter.cs:5`): Writes SieDocument objects back to SIE 4 format files

- **EncodingHelper** (`EncodingHelper.cs:8`): Handles IBM PC-8 (codepage 437) encoding required for SIE files

### Data Model Classes
- **SieAccount**: Represents chart of accounts entries
- **SieVoucher** & **SieVoucherRow**: Transaction vouchers and their constituent rows
- **SieDimension** & **SieObject**: Multi-dimensional accounting objects (projects, cost centers)
- **SieBookingYear**: Fiscal year definitions
- **SieCompany**: Company information

### Testing Infrastructure
- **SieDocumentComparer**: Compares two SieDocument instances for round-trip testing
- **IntegrationTests** (`IntegrationTests.cs:8`): Comprehensive tests using real SIE files

## Common Development Commands

### Build and Test
```bash
# Build the solution
dotnet build

# Run all tests
dotnet test

# Run integration tests with real SIE files
dotnet test --filter "TestCategory=Integration"

# Run the console test application
dotnet run --project Skattata.Tests.ConsoleApp
```

### Test with Specific SIE Files
The console app in `Skattata.Tests.ConsoleApp` automatically discovers and tests all `.se`, `.si`, and `.sie` files in the `sie_test_files` directory, performing both parsing and round-trip validation.

## SIE Format Context

### File Types and Extensions
- **.se**: SIE 1 files (yearly balances only)
- **.si**: SIE 2 files (monthly period balances) 
- **.sie**: General SIE 5 files. 

### Key Format Differences
- **SIE 4**: Tag-based plaintext format with IBM PC-8 encoding (`#KONTO`, `#VER`, etc.)
- **SIE 5**: Modern XML format with UTF-8 encoding and digital signatures

### Critical Parsing Considerations
- SIE 4 files use Codepage 437 (IBM PC-8) encoding - always use `EncodingHelper.GetSieEncoding()`
- Tag-based format requires careful regex splitting to handle quoted strings containing spaces
- XML format detection is done by checking for `<?xml` at file start
- Object references in voucher rows use curly brace syntax: `{1 "100"}` for dimension 1, object "100"

## Testing Strategy

The project uses extensive real-world SIE files for validation. The test suite:
1. Parses each SIE file successfully
2. Performs round-trip validation (parse → write → parse → compare)
3. Validates object parsing with multi-dimensional data
4. Tests both console app and MSTest frameworks

When adding new functionality, ensure it works with the existing test file collection in `sie_test_files/`.