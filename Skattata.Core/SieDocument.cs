using System.Globalization;
using System.Text.RegularExpressions;

namespace Skattata.Core;

/// <summary>
/// Represents a SIE (Standard Import och Export) document.
/// This class can be used to load, parse, and represent the data from a SIE file.
/// </summary>
public partial class SieDocument
{
    /// <summary>
    /// The date format used in SIE files.
    /// </summary>
    public const string SieDateFormat = "yyyyMMdd";

    /// <summary>
    /// Initializes a new instance of the <see cref="SieDocument"/> class.
    /// </summary>
    public SieDocument()
    {
        Accounts = new Dictionary<string, SieAccount>();
        Dimensions = new Dictionary<string, SieDimension>();
        Vouchers = new List<SieVoucher>();
        BookingYears = new List<SieBookingYear>();
        Errors = new List<SieException>();
    }

    /// <summary>
    /// Gets the accounts defined in the SIE document, indexed by account number.
    /// </summary>
    public Dictionary<string, SieAccount> Accounts { get; }
    /// <summary>
    /// Gets the dimensions defined in the SIE document, indexed by dimension number.
    /// </summary>
    public Dictionary<string, SieDimension> Dimensions { get; }
    /// <summary>
    /// Gets the list of vouchers in the SIE document.
    /// </summary>
    public List<SieVoucher> Vouchers { get; }
    /// <summary>
    /// Gets the list of booking years (fiscal years) in the SIE document.
    /// </summary>
    public List<SieBookingYear> BookingYears { get; }

    /// <summary>
    /// Gets a list of errors that occurred during parsing.
    /// </summary>
    public List<SieException> Errors { get; }

    /// <summary>
    /// Gets the name of the program that generated the SIE file.
    /// </summary>
    public string? ProgramName { get; private set; }
    /// <summary>
    /// Gets the version of the program that generated the SIE file.
    /// </summary>
    public string? ProgramVersion { get; private set; }
    /// <summary>
    /// Gets the format of the SIE file.
    /// </summary>
    public string? Format { get; private set; }
    /// <summary>
    /// Gets the date the SIE file was generated.
    /// </summary>
    public DateTime GeneratedDate { get; private set; }
    /// <summary>
    /// Gets the name of the company.
    /// </summary>
    public string? CompanyName { get; private set; }
    /// <summary>
    /// Gets the company's registration number.
    /// </summary>
    public string? RegistrationNumber { get; private set; }

    /// <summary>
    /// Loads a SIE document from the specified file.
    /// </summary>
    /// <param name="fileName">The path to the SIE file.</param>
    /// <returns>A new <see cref="SieDocument"/> instance.</returns>
    public static SieDocument Load(string fileName)
    {
        return Load(fileName, null);
    }

    /// <summary>
    /// Loads a SIE document from the specified file, using the provided callbacks.
    /// </summary>
    /// <param name="fileName">The path to the SIE file.</param>
    /// <param name="callbacks">Callbacks to invoke during parsing.</param>
    /// <returns>A new <see cref="SieDocument"/> instance.</returns>
    public static SieDocument Load(string fileName, SieCallbacks? callbacks)
    {
        var doc = new SieDocument();
        doc.ReadFile(fileName, callbacks);
        return doc;
    }


    private void ReadFile(string fileName, SieCallbacks? callbacks)
    {
        EncodingHelper.Register();
        using var reader = new StreamReader(fileName, EncodingHelper.GetSieEncoding());
        ReadStream(reader, callbacks);
    }
    
    /// <summary>
    /// Reads and parses SIE data from a <see cref="TextReader"/>.
    /// </summary>
    /// <param name="reader">The TextReader to read from.</param>
    /// <param name="callbacks">Callbacks to invoke during parsing.</param>
    public void ReadStream(TextReader reader, SieCallbacks? callbacks)
    {
        string? line;
        SieVoucher? currentVer = null;
        var inBrace = false;

        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            if (line.StartsWith('{'))
            {
                inBrace = true;
                continue;
            }

            if (line.StartsWith('}'))
            {
                inBrace = false;
                if (currentVer != null)
                {
                    if (callbacks is null || callbacks.ReadVoucher is null)
                    {
                        Vouchers.Add(currentVer);
                    }
                    else if (callbacks.ReadVoucher(currentVer))
                    {
                        Vouchers.Add(currentVer);
                    }
                }
                currentVer = null;
                continue;
            }
            
            var item = SplitLine(line);
            var command = item[0].ToUpper();
            
            try
            {
                switch (command)
                {
                    case "#ADRESS": break;
                    case "#BTRANS": break;
                    case "#DIM": ParseDimension(item); break;
                    case "#ENDRAR": break;
                    case "#FLAGGA": break;
                    case "#FNAMN": CompanyName = item[1]; break;
                    case "#FORDER": break;
                    case "#FORMAT": Format = item[1]; break;
                    case "#FTYP": break;
                    case "#GEN": GeneratedDate = DateTime.ParseExact(item[1], SieDateFormat, CultureInfo.InvariantCulture); break;
                    case "#IB": ParsePeriodValue(item, acc => acc.PeriodValues, 0); break;
                    case "#KONTO": ParseAccount(item); break;
                    case "#KPTYP": break;
                    case "#KRSTYPKOD": break;
                    case "#KUNDLEVFODRINGAR": break;
                    case "#KTYP": break;
                    case "#OB": ParsePeriodValue(item, acc => acc.PeriodValues); break;
                    case "#OBJECT": ParseObject(item); break;
                    case "#OMFATTN": break;
                    case "#ORGNR": RegistrationNumber = item[1]; break;
                    case "#PBUDGET": break;
                    case "#PERIOD": break;
                    case "#PROGRAM": ProgramName = item[1]; ProgramVersion = item.Length > 2 ? item[2] : null; break;
                    case "#PROSA": break;
                    case "#PSALDO": ParsePeriodValue(item, acc => acc.ObjectValues); break;
                    case "#RAR": ParseBookingYear(item); break;
                    case "#RES": ParsePeriodValue(item, acc => acc.PeriodValues); break;
                    case "#SIETYP": break;
                    case "#SRU": break;
                    case "#TAXAR": break;
                    case "#TRANS": ParseVoucherRow(item, currentVer); break;
                    case "#UB": ParsePeriodValue(item, acc => acc.PeriodValues); break;
                    case "#UNDERDIM": break;
                    case "#VALUTA": break;
                    case "#VER": currentVer = ParseVoucher(item); break;
                    default:
                        if (command.StartsWith('#'))
                        {
                            throw new SieInvalidCommandException($"Unknown command: {command}");
                        }
                        break;
                }
            }
            catch(Exception ex)
            {
                var newEx = new SieException($"Error parsing line: {line}", ex);
                Errors.Add(newEx);
            }
        }
    }
    
    private void ParseAccount(string[] item)
    {
        var acc = new SieAccount
        {
            AccountNumber = item[1],
            AccountName = item[2]
        };
        Accounts[acc.AccountNumber] = acc;
    }
    
    private void ParseBookingYear(string[] item)
    {
        var year = new SieBookingYear();
        var idx = 0;
        if (item.Length > 1 && int.TryParse(item[1], out var i))
        {
            year.Id = i;
            idx = 1;
        }

        if (item.Length > idx + 1)
        {
            year.StartDate = DateTime.ParseExact(item[idx + 1], SieDateFormat, CultureInfo.InvariantCulture);
        }
        if (item.Length > idx + 2)
        {
            year.EndDate = DateTime.ParseExact(item[idx + 2], SieDateFormat, CultureInfo.InvariantCulture);
        }
        BookingYears.Add(year);
    }
    
    private SieVoucher ParseVoucher(string[] item)
    {
        var voucher = new SieVoucher
        {
            VoucherSeries = item[1],
            VoucherNumber = item[2]
        };
        if (item.Length > 3)
        {
            voucher.VoucherDate = DateTime.ParseExact(item[3], SieDateFormat, CultureInfo.InvariantCulture);
        }
        if (item.Length > 4)
        {
            voucher.VoucherText = item[4];
        }
        if (item.Length > 5)
        {
            voucher.RegistrationDate = DateTime.ParseExact(item[5], SieDateFormat, CultureInfo.InvariantCulture);
        }
        if (item.Length > 6)
        {
            voucher.RegistrationSign = item[6];
        }
        return voucher;
    }

    private void ParseVoucherRow(string[] item, SieVoucher? voucher)
    {
        if(voucher is null) throw new SieException("Voucher row found outside a voucher context.");
        
        var row = new SieVoucherRow
        {
            AccountNumber = item[1]
        };

        var objectData = GetObjectText(item[2]);
        if (objectData.Length > 0)
        {
            for(var i = 0; i < objectData.Length; i+= 2)
            {
                var dimNo = objectData[i];
                var objNo = objectData[i + 1];
                var obj = new SieObject
                {
                    DimensionNumber = dimNo,
                    ObjectNumber = objNo
                    // Note: ObjectName is not available on the #TRANS line,
                    // it must be looked up from the #OBJECT definitions if needed.
                };
                row.Objects.Add(obj);
            }
        }

        row.Amount = decimal.Parse(item[3], CultureInfo.InvariantCulture);
        if (item.Length > 4)
        {
            row.TransactionDate = DateTime.ParseExact(item[4], SieDateFormat, CultureInfo.InvariantCulture);
        }
        if (item.Length > 5)
        {
            row.RowText = item[5];
        }
        if (item.Length > 6)
        {
            row.Quantity = decimal.Parse(item[6], CultureInfo.InvariantCulture);
        }
        if (item.Length > 7)
        {
            row.RegistrationSign = item[7];
        }
        voucher.Rows.Add(row);
    }
    private void ParseObject(string[] item)
    {
        var dim = Dimensions[item[1]];
        dim.Objects.Add(new SieObject
        {
            DimensionNumber = item[1],
            ObjectNumber = item[2],
            ObjectName = item[3]
        });
    }

    private void ParseDimension(string[] item)
    {
        var dim = new SieDimension
        {
            DimensionNumber = item[1],
            DimensionName = item[2]
        };
        Dimensions[dim.DimensionNumber] = dim;
    }
    
    private void ParsePeriodValue(string[] item, Func<SieAccount, List<SiePeriodValue>> list, int? yearId = null)
    {
        var acc = Accounts[item[1]];
        var val = new SiePeriodValue();

        if (yearId.HasValue)
        {
            val.BookingYear = BookingYears.FirstOrDefault(y => y.Id == yearId.Value);
        }
        
        val.Period = item[2];
        val.Value = decimal.Parse(item[3], CultureInfo.InvariantCulture);
        if (item.Length > 4)
        {
            val.Quantity = decimal.Parse(item[4], CultureInfo.InvariantCulture);
        }
        list(acc).Add(val);
    }

    private static readonly Regex _itemex = SieDocumentRegex();
    
    internal static string[] SplitLine(string line)
    {
        var mc = _itemex.Matches(line);
        return mc.Cast<Match>().Select(m => {
            var val = m.Value;
            if (val.Length > 1 && val.StartsWith('"') && val.EndsWith('"')) {
                return val.Substring(1, val.Length - 2);
            }
            return val;
        }).ToArray();
    }
    
    private static string[] GetObjectText(string text)
    {
        if (string.IsNullOrWhiteSpace(text) || text == "{}") return Array.Empty<string>();

        // Remove outer braces before splitting
        var content = text.Trim().Substring(1, text.Length - 2).Trim();
        if (string.IsNullOrWhiteSpace(content)) return Array.Empty<string>();

        // Use the same robust splitter as the main line parser
        return SplitLine(content);
    }

    [GeneratedRegex("\\{.*?\\}|\"[^\"]*\"|[^\\s]+", RegexOptions.Compiled)]
    private static partial Regex SieDocumentRegex();
}
