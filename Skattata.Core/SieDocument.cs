using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Skattata.Core;

public partial class SieDocument
{
    public const string SieDateFormat = "yyyyMMdd";
    
    public List<string> Errors { get; private set; } = new List<string>();
    public string CompanyName { get; set; } = "";
    public string OrganizationNumber { get; set; } = "";
    public string RegistrationNumber => OrganizationNumber;
    public string Format { get; set; } = "PC8";
    public List<SieBookingYear> BookingYears { get; set; } = new List<SieBookingYear>();
    public List<SieVoucher> Vouchers { get; set; } = new List<SieVoucher>();
    public Dictionary<string, SieAccount> Accounts { get; set; } = new Dictionary<string, SieAccount>();
    public List<SieDimension> Dimensions { get; set; } = new List<SieDimension>();

    public static SieDocument Load(string fileName, SieCallbacks? callbacks = null)
    {
        using var stream = new FileStream(fileName, FileMode.Open, FileAccess.Read);
        return ReadStream(stream, callbacks);
    }

    public static SieDocument ReadStream(Stream stream, SieCallbacks? callbacks = null)
    {
        var reader = new StreamReader(stream, EncodingHelper.GetSieEncoding(), true);
        var firstLine = reader.ReadLine();
        stream.Position = 0;

        if (firstLine != null && firstLine.Trim().StartsWith("<?xml", StringComparison.OrdinalIgnoreCase))
        {
            var xmlParser = new SieXmlParser();
            return xmlParser.Parse(stream, callbacks);
        }
        else
        {
            var tagParser = new SieTagParser();
            return tagParser.Parse(stream, callbacks);
        }
    }

    private class SieTagParser
    {
        private static readonly Regex Splitter = new Regex("(?<=^[^{}\"]*(\"[^{}\"]*\"[^{}\"]*)*) (?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", RegexOptions.Compiled);
        private SieDocument _doc = null!;
        private SieCallbacks? _callbacks;

        public SieDocument Parse(Stream stream, SieCallbacks? callbacks)
        {
            _callbacks = callbacks;
            _doc = new SieDocument();
            string line;

            var reader = new StreamReader(stream, EncodingHelper.GetSieEncoding());

            while ((line = reader.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                var command = SplitLine(line);
                if (command.Count == 0) continue;

                var tag = command[0].ToUpper();

                try
                {
                    switch (tag)
                    {
                        case "#FNAMN":
                            _doc.CompanyName = command[1];
                            break;
                        case "#ORGNR":
                            _doc.OrganizationNumber = command[1];
                            break;
                        case "#KONTO":
                            ParseAccount(command);
                            break;
                        case "#DIM":
                            ParseDimension(command);
                            break;
                        case "#OBJEKT":
                        case "#OBJECT":
                            ParseObject(command);
                            break;
                        case "#RAR":
                            ParseBookingYear(command);
                            break;
                        case "#IB":
                        case "#UB":
                        case "#RES":
                            ParseBalance(command, tag);
                            break;
                        case "#OIB":
                        case "#OUB":
                            ParseObjectBalance(command, tag);
                            break;
                        case "#PSALDO":
                            ParsePeriodValue(command, (acc) => acc.PeriodValues);
                            break;
                        case "#SRU":
                            ParseSruCode(command);
                            break;
                        case "#VER":
                            ParseVoucher(command, reader);
                            break;
                    }
                }
                catch (Exception ex)
                {
                    _doc.Errors.Add($"Error parsing line: {line}. Error: {ex.Message}");
                }
            }
            return _doc;
        }
        
        private void ParseAccount(List<string> command)
        {
            if (command.Count >= 3)
            {
                var acc = new SieAccount() { AccountId = command[1], Name = command[2] };
                _doc.Accounts.Add(acc.AccountId, acc);
            }
        }

        private void ParseDimension(List<string> command)
        {
            if (command.Count >= 3)
            {
                var dim = new SieDimension() { Number = command[1], Name = command[2] };
                _doc.Dimensions.Add(dim);
            }
        }

        private void ParseObject(List<string> command)
        {
            if (command.Count >= 4)
            {
                var dim = _doc.Dimensions.FirstOrDefault(d => d.Number == command[1]);
                if (dim != null)
                {
                    var obj = new SieObject() { DimensionNumber = command[1], Number = command[2], Name = command[3] };
                    dim.Objects.Add(obj.Number, obj);
                }
            }
        }
        
        private void ParseBookingYear(List<string> command)
        {
            var year = new SieBookingYear
            {
                Id = int.Parse(command[1]),
                StartDate = DateTime.ParseExact(command[2], "yyyyMMdd", CultureInfo.InvariantCulture),
                EndDate = DateTime.ParseExact(command[3], "yyyyMMdd", CultureInfo.InvariantCulture)
            };
            _doc.BookingYears.Add(year);
        }
        
        private void ParseBalance(List<string> command, string tag)
        {
            var accountId = command[2];
            if (_doc.Accounts.TryGetValue(accountId, out var acc))
            {
                var balance = decimal.Parse(command[3], CultureInfo.InvariantCulture);
                if (tag == "#IB") acc.OpeningBalance = balance;
                else if (tag == "#UB") acc.ClosingBalance = balance;
                else if (tag == "#RES") acc.Result = balance;
            }
        }
        
        private void ParseObjectBalance(List<string> command, string tag)
        {
            // Format: #OIB yearNo accountNo {dimNo objNo} balance
            var objectText = GetObjectText(command[3]);
            var objectCommands = SplitLine(objectText);
            var dimNo = objectCommands[0];
            var objNo = objectCommands[1];

            var dim = _doc.Dimensions.FirstOrDefault(d => d.Number == dimNo);
            if (dim != null && dim.Objects.TryGetValue(objNo, out var obj))
            {
                var balance = decimal.Parse(command[4], CultureInfo.InvariantCulture);
                if (tag == "#OIB") obj.OpeningBalance = balance;
                else if (tag == "#OUB") obj.ClosingBalance = balance;
            }
        }
        
        private void ParsePeriodValue(List<string> command, Func<SieAccount, List<SiePeriodValue>> listSelector)
        {
            // Format: #PSALDO yearNo period accountNo {objects} balance
            // Handle incorrect line splitting similar to ParseVoucherRow
            List<string> actualCommand = command;
            if (command.Count == 5 && command[4].Contains(' '))
            {
                // The fifth element contains: {} 6000
                var remaining = command[4];
                actualCommand = new List<string> { command[0], command[1], command[2], command[3] };
                
                // Find the closing brace for the object part
                var braceEnd = remaining.IndexOf('}');
                if (braceEnd >= 0)
                {
                    var objectPart = remaining.Substring(0, braceEnd + 1);
                    actualCommand.Add(objectPart);
                    
                    // Split the rest normally
                    var restPart = remaining.Substring(braceEnd + 1).Trim();
                    if (!string.IsNullOrEmpty(restPart))
                    {
                        var restParts = restPart.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        actualCommand.AddRange(restParts);
                    }
                }
                else
                {
                    // Fallback to simple splitting
                    var parts = remaining.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    actualCommand.AddRange(parts);
                }
            }
            
            if (actualCommand.Count >= 6)
            {
                var accountId = actualCommand[3];
                if (_doc.Accounts.TryGetValue(accountId, out var acc))
                {
                    var list = listSelector(acc);
                    list.Add(new SiePeriodValue
                    {
                        Period = actualCommand[2],
                        Value = decimal.Parse(actualCommand[5], CultureInfo.InvariantCulture)
                    });
                }
            }
        }
        
        private void ParseSruCode(List<string> command)
        {
            // Format: #SRU accountNo sruCode
            if (command.Count >= 3)
            {
                var accountId = command[1];
                if (_doc.Accounts.TryGetValue(accountId, out var acc))
                {
                    acc.SruCode = command[2];
                }
            }
        }

        private void ParseVoucher(List<string> command, StreamReader reader)
        {
            if (command.Count >= 4)
            {
                var voucher = new SieVoucher
                {
                    Series = command[1],
                    Number = command[2],
                    Date = DateTime.ParseExact(command[3], "yyyyMMdd", CultureInfo.InvariantCulture),
                    Text = command.Count > 4 ? command[4] : ""
                };
                
                // Handle extended voucher format with registration date and signature
                if (command.Count > 5 && DateTime.TryParseExact(command[5], "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var regDate))
                {
                    voucher.RegistrationDate = regDate;
                    voucher.RegistrationSign = command.Count > 6 ? command[6] : "";
                }

                string? line;
                while ((line = reader.ReadLine()) != null && line.Trim() != "}")
                {
                    if (line.Trim() == "{") continue;
                    var rowCommand = SplitLine(line);
                    if (rowCommand.Count > 0 && rowCommand[0].Equals("#TRANS", StringComparison.InvariantCultureIgnoreCase))
                    {
                        ParseVoucherRow(rowCommand, voucher);
                    }
                }
                _doc.Vouchers.Add(voucher);
            }
        }

        private void ParseVoucherRow(List<string> command, SieVoucher voucher)
        {
            // More robust parsing approach
            // Find the positions of key elements regardless of splitting issues
            List<string> actualCommand = new List<string>();
            
            // Handle various splitting scenarios
            if (command.Count >= 2)
            {
                actualCommand.Add(command[0]); // #TRANS
                actualCommand.Add(command[1]); // Account number
                
                // Find the object part and amount in the remaining elements
                var remainingElements = command.Skip(2).ToList();
                var flatContent = string.Join(" ", remainingElements);
                
                // Find object notation {...}
                var braceStart = flatContent.IndexOf('{');
                var braceEnd = flatContent.IndexOf('}');
                
                if (braceStart >= 0 && braceEnd >= braceStart)
                {
                    var objectPart = flatContent.Substring(braceStart, braceEnd - braceStart + 1);
                    actualCommand.Add(objectPart);
                    
                    // Process what comes after the object notation
                    var afterBrace = flatContent.Substring(braceEnd + 1).Trim();
                    if (!string.IsNullOrEmpty(afterBrace))
                    {
                        var restParts = afterBrace.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        actualCommand.AddRange(restParts);
                    }
                }
                else
                {
                    // No braces found, add remaining elements as-is
                    actualCommand.AddRange(remainingElements);
                }
            }
            
            if (actualCommand.Count >= 4)
            {
                var row = new SieVoucherRow
                {
                    AccountNumber = actualCommand[1],
                    Amount = decimal.Parse(actualCommand[3], CultureInfo.InvariantCulture),
                    TransactionDate = actualCommand.Count > 4 && DateTime.TryParseExact(actualCommand[4], "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var transDate) 
                        ? transDate 
                        : voucher.Date, // Default to voucher date if no transaction date
                    RowText = actualCommand.Count > 5 ? actualCommand[5] : ""
                };
                var objectText = GetObjectText(actualCommand[2]);
                if (!string.IsNullOrEmpty(objectText))
                {
                    var objectCommands = SplitLine(objectText);
                    for (int i = 0; i < objectCommands.Count - 1; i += 2)
                    {
                        if (i + 1 < objectCommands.Count)
                            row.Objects.Add(new SieObject() { DimensionNumber = objectCommands[i], Number = objectCommands[i + 1] });
                    }
                }
                voucher.Rows.Add(row);
            }
        }
        
        private static string GetObjectText(string text)
        {
            return text.TrimStart('{').TrimEnd('}');
        }

        private static List<string> SplitLine(string line)
        {
            var result = new List<string>();
            var items = Splitter.Split(line.Trim());
            foreach (var item in items)
            {
                if (!string.IsNullOrEmpty(item) && item.StartsWith("\"") && item.EndsWith("\""))
                    result.Add(item.Substring(1, item.Length - 2));
                else
                    result.Add(item);
            }
            return result;
        }
    }

    private class SieXmlParser
    {
        private SieCallbacks? _callbacks;

        public SieDocument Parse(Stream stream, SieCallbacks? callbacks)
        {
            _callbacks = callbacks;
            var doc = new SieDocument();
            var xml = XDocument.Load(stream);

            var sieEntry = xml.Root?.Element("SieEntry");
            if (sieEntry == null)
            {
                doc.Errors.Add("Could not find required root element <SieEntry>.");
                return doc;
            }

            ParseCompany(sieEntry.Element("Company"), doc);
            ParseFinancialYears(sieEntry.Elements("FinancialYear"), doc);
            ParseVouchers(sieEntry.Element("Journal"), doc);

            return doc;
        }

        private void ParseCompany(XElement companyElement, SieDocument doc)
        {
            if (companyElement == null) return;
            doc.CompanyName = companyElement.Element("Name")?.Value;
            doc.OrganizationNumber = companyElement.Element("CorporateIdentityNumber")?.Value;
        }

        private void ParseFinancialYears(IEnumerable<XElement> yearElements, SieDocument doc)
        {
            foreach (var yearElement in yearElements)
            {
                var year = new SieBookingYear
                {
                    StartDate = GetDate(yearElement.Element("StartDate")?.Value) ?? DateTime.MinValue,
                    EndDate = GetDate(yearElement.Element("EndDate")?.Value) ?? DateTime.MinValue
                };
                doc.BookingYears.Add(year);

                ParseAccounts(yearElement.Element("Accounts"), doc);
                ParseDimensions(yearElement.Element("Dimensions"), doc);
            }
        }

        private void ParseAccounts(XElement accountsElement, SieDocument doc)
        {
            if (accountsElement == null) return;
            foreach (var accElement in accountsElement.Elements("Account"))
            {
                var account = new SieAccount
                {
                    AccountId = accElement.Attribute("accountId")?.Value,
                    Name = accElement.Attribute("description")?.Value,
                    OpeningBalance = GetDecimal(accElement.Element("OpeningBalance")?.Value),
                    ClosingBalance = GetDecimal(accElement.Element("ClosingBalance")?.Value)
                };
                if (!string.IsNullOrEmpty(account.AccountId))
                {
                    doc.Accounts[account.AccountId] = account;
                }
            }
        }

        private void ParseDimensions(XElement dimensionsElement, SieDocument doc)
        {
            if (dimensionsElement == null) return;
            foreach (var dimElement in dimensionsElement.Elements("Dimension"))
            {
                var dimension = new SieDimension
                {
                    Number = dimElement.Attribute("dimensionId")?.Value,
                    Name = dimElement.Attribute("description")?.Value
                };

                foreach (var objElement in dimElement.Elements("Object"))
                {
                    var sieObject = new SieObject
                    {
                        DimensionNumber = dimension.Number,
                        Number = objElement.Attribute("objectId")?.Value,
                        Name = objElement.Attribute("description")?.Value
                    };
                    dimension.Objects.Add(sieObject.Number, sieObject);
                }
                doc.Dimensions.Add(dimension);
            }
        }

        private void ParseVouchers(XElement journalElement, SieDocument doc)
        {
            if (journalElement == null) return;
            foreach (var entryElement in journalElement.Elements("JournalEntry"))
            {
                var voucher = new SieVoucher
                {
                    Series = entryElement.Attribute("journalId")?.Value ?? "",
                    Number = entryElement.Attribute("entryNumber")?.Value ?? "",
                    Date = GetDate(entryElement.Attribute("entryDate")?.Value) ?? DateTime.MinValue,
                    Text = entryElement.Attribute("description")?.Value ?? "",
                };

                foreach (var ledgerElement in entryElement.Elements("LedgerEntry"))
                {
                    var row = new SieVoucherRow
                    {
                        AccountNumber = ledgerElement.Attribute("accountId")?.Value,
                        Amount = GetDecimal(ledgerElement.Attribute("amount")?.Value),
                        RowText = ledgerElement.Attribute("description")?.Value,
                        TransactionDate = GetDate(ledgerElement.Attribute("entryDate")?.Value) ?? voucher.Date
                    };

                    var rowDimensions = ledgerElement.Element("Dimensions");
                    if (rowDimensions != null)
                    {
                        foreach (var rowDimElement in rowDimensions.Elements("Dimension"))
                        {
                            row.Objects.Add(new SieObject()
                            {
                                DimensionNumber = rowDimElement.Attribute("dimensionId")?.Value,
                                Number = rowDimElement.Attribute("objectId")?.Value
                            });
                        }
                    }
                    voucher.Rows.Add(row);
                }
                doc.Vouchers.Add(voucher);
            }
        }

        private decimal GetDecimal(string value)
        {
            return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) ? result : 0;
        }

        private DateTime? GetDate(string value)
        {
            return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var result) ? result : (DateTime?)null;
        }
    }
}

