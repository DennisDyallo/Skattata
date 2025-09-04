using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Skattata.Core;

namespace Skattata.Tests;

[TestClass]
public class IntegrationTests
{
    private static readonly string TestFilesPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "sie_test_files");

    private static IEnumerable<object[]> GetTestFiles()
    {
        if (!Directory.Exists(TestFilesPath))
        {
            Assert.Fail($"Test files directory not found: {TestFilesPath}");
            yield break;
        }

        var allFiles =
            Directory.GetFiles(TestFilesPath, "*.se", SearchOption.AllDirectories)
            .Concat(Directory.GetFiles(TestFilesPath, "*.si", SearchOption.AllDirectories))
            .Concat(Directory.GetFiles(TestFilesPath, "*.sie", SearchOption.AllDirectories));

        foreach (var file in allFiles)
        {
            yield return [file];
        }
    }

    public static IEnumerable<object[]> TestFiles => GetTestFiles();

    [DataTestMethod]
    [DynamicData(nameof(TestFiles))]
    public void ParseAllTestFiles(string filePath)
    {
        try
        {
            // Arrange
            using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);

            // Act
            var doc = SieDocument.ReadStream(stream, null);

            // Assert
            Assert.IsTrue(true, $"Successfully parsed {Path.GetFileName(filePath)}");
        }
        catch (Exception ex)
        {
            Assert.Fail($"Exception parsing {Path.GetFileName(filePath)}: {ex.Message}\n{ex.StackTrace}");
        }
    }

    [DataTestMethod]
    [DynamicData(nameof(TestFiles))]
    public void RoundTripTest(string filePath)
    {
        try
        {
            // Arrange
            SieDocument originalDoc;
            using (var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read))
            {
                originalDoc = SieDocument.ReadStream(stream, null);
            }

            // Act
            var memoryStream = new MemoryStream();
            using (var writer = new StreamWriter(memoryStream, EncodingHelper.GetSieEncoding(), leaveOpen: true))
            {
                var docWriter = new SieDocumentWriter(originalDoc, writer);
                // Use reflection to call the private Write() method
                var writeMethod = typeof(SieDocumentWriter).GetMethod("Write", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                writeMethod?.Invoke(docWriter, null);
                writer.Flush();
            }
            memoryStream.Position = 0;

            var newDoc = SieDocument.ReadStream(memoryStream, null);

            // Assert
            var comparer = new SieDocumentComparer(originalDoc, newDoc);
            var errors = comparer.Compare();
            Assert.IsTrue(errors.Count == 0, $"Round-trip failed for {Path.GetFileName(filePath)}: {string.Join(", ", errors)}");
        }
        catch (Exception ex)
        {
            Assert.Fail($"Exception in round-trip for {Path.GetFileName(filePath)}: {ex.Message}\n{ex.StackTrace}");
        }
    }
    
    [TestMethod]
    public void ParseVoucherRow_WithObjectData_ParsesCorrectly()
    {
        // Arrange
        var sieContent = """
                         #FNAMN "Test Company"
                         #DIM 1 "Project"
                         #OBJEKT 1 "100" "Project X"
                         #VER A 1 20240101 ""
                         {
                         #TRANS 1910 {1 "100"} 500.00 20240101 ""
                         }
                         """;

        using var stream = new MemoryStream(EncodingHelper.GetSieEncoding().GetBytes(sieContent));

        // Act
        var doc = SieDocument.ReadStream(stream, null);

        // Assert
        Assert.IsTrue(doc.Errors.Count == 0, "Document should have no errors: {0}", doc.Errors.Count > 0 ? doc.Errors.First() : "No errors");

        Assert.AreEqual(1, doc.Vouchers.Count, "Should be one voucher.");
        var voucher = doc.Vouchers[0];
        Assert.AreEqual(1, voucher.Rows.Count, $"Voucher should have one row. Errors: {string.Join(", ", doc.Errors)}");
        var row = voucher.Rows[0];
        
        Assert.AreEqual(1, row.Objects.Count, "Row should have one object.");
        var sieObject = row.Objects[0];

        Assert.AreEqual("1", sieObject.DimensionNumber, "Object dimension number should be 1.");
        Assert.AreEqual("100", sieObject.Number, "Object number should be 100.");
    }
}
