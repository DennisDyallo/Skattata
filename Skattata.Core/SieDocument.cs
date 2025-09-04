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
    public List<string> Errors { get; private set; } = new List<string>();
    public string CompanyName { get; set; }
    public string OrganizationNumber { get; set; }
    public List<SieBookingYear> BookingYears { get; set; } = new List<SieBookingYear>();
    public List<SieVoucher> Vouchers { get; set; } = new List<SieVoucher>();
    public Dictionary<string, SieAccount> Accounts { get; set; } = new Dictionary<string, SieAccount>();
    public List<SieDimension> Dimensions { get; set; } = new List<SieDimension>();

    public static SieDocument Load(string fileName, SieCallbacks callbacks = null)
    {
        using var stream = new FileStream(fileName, FileMode.Open, FileAccess.Read);
        return ReadStream(stream, callbacks);
    }

    public static SieDocument ReadStream(Stream stream, SieCallbacks callbacks = null)
    {
        var reader = new StreamReader(stream, Encoding.Default, true);
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
        private SieDocument _doc;
        private SieCallbacks _callbacks;

        public SieDocument Parse(Stream stream, SieCallbacks callbacks)
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
            var acc = new SieAccount() { AccountId = command[1], Name = command[2] };
            _doc.Accounts.Add(acc.AccountId, acc);
        }

        private void ParseDimension(List<string> command)
        {
            var dim = new SieDimension() { Number = command[1], Name = command[2] };
            _doc.Dimensions.Add(dim);
        }

        private void ParseObject(List<string> command)
        {
            var dim = _doc.Dimensions.FirstOrDefault(d => d.Number == command[1]);
            if (dim != null)
            {
                var obj = new SieObject() { DimensionNumber = command[1], Number = command[2], Name = command[3] };
                dim.Objects.Add(obj.Number, obj);
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
            // Format: #PSALDO yearNo period accountNo balance
            var accountId = command[3];
            if (_doc.Accounts.TryGetValue(accountId, out var acc))
            {
                var list = listSelector(acc);
                list.Add(new SiePeriodValue
                {
                    Period = command[2],
                    Value = decimal.Parse(command[4], CultureInfo.InvariantCulture)
                });
            }
        }

        private void ParseVoucher(List<string> command, StreamReader reader)
        {
            var voucher = new SieVoucher
            {
                Series = command[1],
                Number = command[2],
                Date = DateTime.ParseExact(command[3], "yyyyMMdd", CultureInfo.InvariantCulture),
                Text = command.Count > 4 ? command[4] : ""
            };

            string line;
            while ((line = reader.ReadLine()) != null && line.Trim() != "}")
            {
                if (line.Trim() == "{") continue;
                var rowCommand = SplitLine(line);
                if (rowCommand.Count > 0 && rowCommand[0].ToUpper() == "#TRANS")
                {
                    ParseVoucherRow(rowCommand, voucher);
                }
            }
            _doc.Vouchers.Add(voucher);
        }

        private void ParseVoucherRow(List<string> command, SieVoucher voucher)
        {
            var row = new SieVoucherRow
            {
                AccountNumber = command[1],
                Amount = decimal.Parse(command[3], CultureInfo.InvariantCulture),
            };
            var objectText = GetObjectText(command[2]);
            if (!string.IsNullOrEmpty(objectText))
            {
                var objectCommands = SplitLine(objectText);
                for (int i = 0; i < objectCommands.Count; i += 2)
                {
                    row.Objects.Add(new SieObject() { DimensionNumber = objectCommands[i], Number = objectCommands[i + 1] });
                }
            }
            voucher.Rows.Add(row);
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
        private SieCallbacks _callbacks;

        public SieDocument Parse(Stream stream, SieCallbacks callbacks)
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
                    StartDate = GetDate(yearElement.Element("StartDate")?.Value),
                    EndDate = GetDate(yearElement.Element("EndDate")?.Value)
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
                    Series = entryElement.Attribute("journalId")?.Value,
                    Number = entryElement.Attribute("entryNumber")?.Value,
                    Date = GetDate(entryElement.Attribute("entryDate")?.Value),
                    Text = entryElement.Attribute("description")?.Value,
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

