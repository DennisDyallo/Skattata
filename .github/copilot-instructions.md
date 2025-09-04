# Skattata Repository Onboarding

## High-Level Details

This repository contains a .NET solution for parsing and manipulating SIE (Standard Import och Export) files, a standard format for accounting data in Sweden.

- **Project Type:** .NET Class Library and associated tests.
- **Languages:** C#
- **Frameworks/Runtimes:** .NET (SDK version 9.0.0 or latest minor)

## Build Instructions

The project uses the standard .NET CLI tools for building and testing.

### Bootstrap

No special bootstrap steps are required.

### Build

To build the solution, run the following command from the root of the repository:

```bash
dotnet build
```

### Test

To run the tests, use the following command:

```bash
dotnet test
```

The tests depend on a collection of SIE files located in the `sie_test_files` directory. The tests will fail if this directory is not present at the expected relative path. The tests read files, parse them, and also perform round-trip write/read operations to ensure data integrity.

## Project Layout

- **`/Skattata.sln`**: The main solution file for Visual Studio or JetBrains Rider.
- **`/global.json`**: Specifies the .NET SDK version to be used.
- **`/Skattata.Core/`**: A .NET class library containing the core logic for handling SIE files.
  - **`Skattata.Core.csproj`**: The project file for the core library.
  - **`SieDocument.cs`**: A key file representing a SIE document.
  - **`SieDocumentWriter.cs`**: Handles writing of SIE documents.
- **`/Skattata.Tests/`**: Contains unit and integration tests for the `Skattata.Core` library.
  - **`Skattata.Tests.csproj`**: The project file for the tests.
  - **`IntegrationTests.cs`**: Contains integration tests that read and process all files from the `sie_test_files` directory.
- **`/Skattata.Tests.ConsoleApp/`**: A console application likely used for manual testing or debugging.
- **`/sie_test_files/`**: A directory containing a large number of `.se` and `.si` files used for testing.

### Important Notes

- Always trust these instructions first. If a command or step fails, then resort to exploring the codebase.
- Before running tests, ensure that the `sie_test_files` directory is present and accessible from the test execution path. The tests in `IntegrationTests.cs` expect to find this directory at `../sie_test_files/`.

