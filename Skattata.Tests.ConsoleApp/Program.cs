using Skattata.Core;
using System.Diagnostics;

Console.WriteLine("Starting Test Runner...");

var baseDirectory = AppContext.BaseDirectory;
var testFilesPath = Path.Combine(baseDirectory, "sie_test_files");

if (!Directory.Exists(testFilesPath))
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"Error: Test files directory not found at '{testFilesPath}'");
    Console.ResetColor();
    return;
}

var files = Directory.GetFiles(testFilesPath, "*.se", SearchOption.AllDirectories)
    .Concat(Directory.GetFiles(testFilesPath, "*.si", SearchOption.AllDirectories))
    .OrderBy(f => f)
    .ToList();

Console.WriteLine($"Found {files.Count} test files.");
Console.WriteLine();

var overallSuccess = true;
var failedFiles = new List<string>();
var stopwatch = Stopwatch.StartNew();

foreach (var file in files)
{
    var success = RunTest(file);
    if (!success)
    {
        overallSuccess = false;
        failedFiles.Add(file);
    }
}

stopwatch.Stop();
Console.WriteLine("--------------------------------------------------");
Console.WriteLine($"Test run finished in: {stopwatch.ElapsedMilliseconds}ms");

if (overallSuccess)
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("Result: All tests passed!");
}
else
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"Result: {failedFiles.Count} tests failed.");
    foreach (var failedFile in failedFiles)
    {
        Console.WriteLine($" - {Path.GetFileName(failedFile)}");
    }
}
Console.ResetColor();
return;


static bool RunTest(string fileName)
{
    var shortFileName = Path.GetFileName(fileName);
    Console.WriteLine($"--- Testing: {shortFileName} ---");
    var success = true;

    // --- 1. Load Test ---
    SieDocument? doc = null;
    try
    {
        doc = SieDocument.Load(fileName);
        WriteResult("Load", true);

        if (doc.Errors.Count != 0)
        {
            WriteResult("Parsing Errors", false);
            foreach (var error in doc.Errors)
            {
                Console.WriteLine($"  - {error}");
            }
            success = false;
        }
        else
        {
            WriteResult("Parsing Errors", true, "(None found)");
            Console.WriteLine($"  Accounts: {doc.Accounts.Count}, Vouchers: {doc.Vouchers.Count}");
        }
    }
    catch (Exception ex)
    {
        WriteResult("Load", false, ex.Message);
        success = false;
    }

    // --- 2. Round-trip Test (if load was successful) ---
    if (doc is not null)
    {
        var tempFileName = Path.GetTempFileName();
        try
        {
            SieDocumentWriter.Write(doc, tempFileName);
            var doc2 = SieDocument.Load(tempFileName);

            var comparer = new SieDocumentComparer(doc, doc2);
            var errors = comparer.Compare();
            if (errors.Any())
            {
                WriteResult("Round-trip", false);
                foreach (var error in errors)
                {
                    Console.WriteLine($"  - {error}");
                }
                success = false;
            }
            else
            {
                WriteResult("Round-trip", true);
            }
        }
        catch (Exception ex)
        {
            WriteResult("Round-trip", false, ex.Message);
            success = false;
        }
        finally
        {
            if(File.Exists(tempFileName))
            {
                File.Delete(tempFileName);
            }
        }
    }

    Console.WriteLine();
    return success;
}

static void WriteResult(string testName, bool success, string? details = null)
{
    Console.Write($"  {testName}: ");
    Console.ForegroundColor = success ? ConsoleColor.Green : ConsoleColor.Red;
    Console.Write(success ? "SUCCESS" : "FAILED");
    Console.ResetColor();
    if (details is not null)
    {
        Console.Write($" - {details}");
    }
    Console.WriteLine();
}