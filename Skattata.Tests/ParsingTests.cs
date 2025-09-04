using Microsoft.VisualStudio.TestTools.UnitTesting;
using Skattata.Core;

namespace Skattata.Tests;

[TestClass]
public class ParsingTests
{
    [TestMethod]
    public void ParseVoucherRow_WithObjectData_ParsesCorrectly()
    {
        // Arrange
        var sieContent = """
                         #FNAMN "Test Company"
                         #DIM 1 "Project"
                         #OBJECT 1 "100" "Project X"
                         #VER A 1 20240101 ""
                         {
                         #TRANS 1910 {1 "100"} 500.00 20240101 ""
                         }
                         """;
        
        var doc = new SieDocument();
        using var reader = new StringReader(sieContent);
        
        // Act
        doc.ReadStream(reader, null);

        // Assert
        Assert.AreEqual(1, doc.Vouchers.Count, "Should be one voucher.");
        var voucher = doc.Vouchers[0];
        Assert.AreEqual(1, voucher.Rows.Count, "Voucher should have one row.");
        var row = voucher.Rows[0];
        
        Assert.AreEqual(1, row.Objects.Count, "Row should have one object.");
        var sieObject = row.Objects[0];

        Assert.AreEqual("1", sieObject.DimensionNumber, "Object dimension number should be 1.");
        Assert.AreEqual("100", sieObject.ObjectNumber, "Object number should be 100.");
    }
}
