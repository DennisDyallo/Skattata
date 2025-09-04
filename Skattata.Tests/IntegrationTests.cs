using Microsoft.VisualStudio.TestTools.UnitTesting;
using Skattata.Core;
using System.IO;
using System.Linq;

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
            .Concat(Directory.GetFiles(TestFilesPath, "*.si", SearchOption.AllDirectories));
    
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
            var doc = new SieDocument();
            using var reader = new StreamReader(filePath, EncodingHelper.GetSieEncoding());

            // Act
            doc.ReadStream(reader, null);

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
            var originalDoc = new SieDocument();
            using (var reader = new StreamReader(filePath, EncodingHelper.GetSieEncoding()))
            {
                originalDoc.ReadStream(reader, null);
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

            var newDoc = new SieDocument();
            using (var reader = new StreamReader(memoryStream, EncodingHelper.GetSieEncoding()))
            {
                newDoc.ReadStream(reader, null);
            }

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
}
