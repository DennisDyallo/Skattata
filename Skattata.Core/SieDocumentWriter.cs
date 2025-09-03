using System.Globalization;

namespace Skattata.Core;

public class SieDocumentWriter
{
    private readonly SieDocument _doc;
    private readonly TextWriter _writer;
    
    public SieDocumentWriter(SieDocument doc, TextWriter writer)
    {
        _doc = doc;
        _writer = writer;
    }

    public static void Write(SieDocument doc, string fileName)
    {
        EncodingHelper.Register();
        using var stream = new StreamWriter(fileName, false, EncodingHelper.GetSieEncoding());
        var writer = new SieDocumentWriter(doc, stream);
        writer.Write();
    }
    
    private void Write()
    {
        WriteLine("#FLAGGA", 0);
        WriteLine("#PROGRAM", "jsiSIE", "1.0");
        WriteLine("#FORMAT", "PC8");
        WriteLine("#GEN", DateTime.Now.ToString(SieDocument.SieDateFormat));
        WriteLine("#SIETYP", "4");
        WriteLine("#FNAMN", _doc.CompanyName);
        if(!string.IsNullOrEmpty(_doc.RegistrationNumber))
            WriteLine("#ORGNR", _doc.RegistrationNumber);

        foreach (var year in _doc.BookingYears)
        {
            WriteLine("#RAR", year.Id, year.StartDate.ToString(SieDocument.SieDateFormat), year.EndDate.ToString(SieDocument.SieDateFormat));
        }

        foreach (var account in _doc.Accounts.Values.OrderBy(a => a.AccountNumber))
        {
            WriteLine("#KONTO", account.AccountNumber, account.AccountName);
        }

        foreach (var voucher in _doc.Vouchers.OrderBy(v => v.VoucherDate))
        {
            WriteVoucher(voucher);
        }
    }

    private void WriteVoucher(SieVoucher voucher)
    {
        WriteLine("#VER", voucher.VoucherSeries, voucher.VoucherNumber, voucher.VoucherDate.ToString(SieDocument.SieDateFormat), voucher.VoucherText);
        WriteLine("{");
        foreach (var row in voucher.Rows)
        {
            WriteVoucherRow(row);
        }
        WriteLine("}");
    }

    private void WriteVoucherRow(SieVoucherRow row)
    {
        WriteLine("#TRANS", row.AccountNumber, "{}", row.Amount.ToString(CultureInfo.InvariantCulture), row.TransactionDate.ToString(SieDocument.SieDateFormat), row.RowText);
    }
    
    private void WriteLine(params object?[] values)
    {
        var parts = values.Select(v =>
        {
            var s = v?.ToString() ?? "";
            return s.Contains(' ') ? $"\"{s}\"" : s;
        });
        _writer.WriteLine(string.Join(" ", parts));
    }
}