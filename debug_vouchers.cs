using Skattata.Core;

var doc = SieDocument.Load("Skattata.Tests/sie_test_files/Dennis_20220101-20221231.se");

Console.WriteLine($"Found {doc.Vouchers.Count} vouchers");

foreach (var voucher in doc.Vouchers)
{
    Console.WriteLine($"Voucher {voucher.Series}-{voucher.Number} dated {voucher.Date:yyyy-MM-dd}");
    Console.WriteLine($"  Description: {voucher.Text}");
    Console.WriteLine($"  Rows: {voucher.Rows.Count}");

    foreach (var row in voucher.Rows)
    {
        Console.WriteLine($"    Account {row.AccountNumber}: {row.Amount:F2}");
    }

    Console.WriteLine($"  Balance: {voucher.Balance:F2}");
    Console.WriteLine();
}
