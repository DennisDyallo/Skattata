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
    
    internal void Write()
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

        foreach (var account in _doc.Accounts.Values.OrderBy(a => a.AccountId))
        {
            WriteLine("#KONTO", account.AccountId, account.Name);
        }

        foreach (var account in _doc.Accounts.Values.Where(a => !string.IsNullOrEmpty(a.SruCode)).OrderBy(a => a.AccountId))
        {
            WriteLine("#SRU", account.AccountId, account.SruCode);
        }

        foreach (var account in _doc.Accounts.Values.Where(a => a.OpeningBalance != 0).OrderBy(a => a.AccountId))
        {
            WriteLine("#IB", "0", account.AccountId, account.OpeningBalance.ToString(CultureInfo.InvariantCulture));
        }

        foreach (var account in _doc.Accounts.Values.Where(a => a.ClosingBalance != 0).OrderBy(a => a.AccountId))
        {
            WriteLine("#UB", "0", account.AccountId, account.ClosingBalance.ToString(CultureInfo.InvariantCulture));
        }

        foreach (var account in _doc.Accounts.Values.Where(a => a.Result != 0).OrderBy(a => a.AccountId))
        {
            WriteLine("#RES", "0", account.AccountId, account.Result.ToString(CultureInfo.InvariantCulture));
        }

        foreach (var voucher in _doc.Vouchers.OrderBy(v => v.Date))
        {
            WriteVoucher(voucher);
        }
    }

    private void WriteVoucher(SieVoucher voucher)
    {
        // Build voucher parameters - include registration date and sign if they exist
        var parameters = new List<object> { "#VER", voucher.Series, voucher.Number, voucher.Date.ToString(SieDocument.SieDateFormat), voucher.Text };
        
        if (voucher.RegistrationDate != DateTime.MinValue)
        {
            parameters.Add(voucher.RegistrationDate.ToString(SieDocument.SieDateFormat));
            
            if (!string.IsNullOrEmpty(voucher.RegistrationSign))
            {
                parameters.Add(voucher.RegistrationSign);
            }
        }
        
        WriteLine(parameters.ToArray());
        WriteLine("{");
        foreach (var row in voucher.Rows)
        {
            WriteVoucherRow(row);
        }
        WriteLine("}");
    }

    private void WriteVoucherRow(SieVoucherRow row)
    {
        var objectText = "{}";
        if (row.Objects.Count > 0)
        {
            var objParts = row.Objects.Select(obj => $"{obj.DimensionNumber} \"{obj.Number}\"");
            objectText = "{" + string.Join(" ", objParts) + "}";
        }
        
        WriteLine("#TRANS", row.AccountNumber, objectText, row.Amount.ToString(CultureInfo.InvariantCulture), row.TransactionDate.ToString(SieDocument.SieDateFormat), row.RowText);
    }
    
    private void WriteLine(params object?[] values)
    {
        var parts = values.Select((v, i) =>
        {
            var s = v?.ToString() ?? "";
            // Quote string parameters (account names, text, etc.) but not numeric parameters
            return (i > 0 && (s.Contains(' ') || s == "" || s.Contains('\\'))) ? $"\"{s}\"" : s;
        });
        _writer.WriteLine(string.Join(" ", parts));
    }
}