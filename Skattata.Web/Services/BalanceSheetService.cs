using Skattata.Core;

namespace Skattata.Web.Services;

public class BalanceSheetService
{
    private readonly SieFileService _sieFileService;
    private readonly VoucherStorageService _voucherStorage;

    public BalanceSheetService(SieFileService sieFileService, VoucherStorageService voucherStorage)
    {
        _sieFileService = sieFileService;
        _voucherStorage = voucherStorage;
    }

    public async Task<BalanceSheetReport> CalculateBalanceSheetAsync()
    {
        var allDocuments = _sieFileService.AllDocuments;
        var accountBalances = new Dictionary<string, AccountBalance>();

        // Aggregate accounts from all documents
        foreach (var loadedDoc in allDocuments)
        {
            var doc = loadedDoc.Document;

            // Add account balances from the document
            foreach (var kvp in doc.Accounts)
            {
                var accountId = kvp.Key;
                var account = kvp.Value;

                if (!accountBalances.ContainsKey(accountId))
                {
                    accountBalances[accountId] = new AccountBalance
                    {
                        AccountId = accountId,
                        Name = account.Name,
                        Type = account.Type
                    };
                }

                var balance = accountBalances[accountId];
                balance.OpeningBalance += account.OpeningBalance;
                balance.ClosingBalance += account.ClosingBalance;
            }

            // Calculate voucher transactions
            foreach (var voucher in doc.Vouchers)
            {
                foreach (var row in voucher.Rows)
                {
                    if (!accountBalances.ContainsKey(row.AccountNumber))
                    {
                        accountBalances[row.AccountNumber] = new AccountBalance
                        {
                            AccountId = row.AccountNumber,
                            Name = row.AccountNumber // Fallback to account number if name not found
                        };
                    }

                    accountBalances[row.AccountNumber].TransactionTotal += row.Amount;
                }
            }
        }

        // Include vouchers from IndexedDB
        var storedVouchers = await _voucherStorage.GetAllVouchersAsync();
        foreach (var storedVoucher in storedVouchers)
        {
            var sieVoucher = _voucherStorage.ToSieVoucher(storedVoucher);
            foreach (var row in sieVoucher.Rows)
            {
                if (!accountBalances.ContainsKey(row.AccountNumber))
                {
                    accountBalances[row.AccountNumber] = new AccountBalance
                    {
                        AccountId = row.AccountNumber,
                        Name = row.AccountNumber // Fallback to account number if name not found
                    };
                }

                accountBalances[row.AccountNumber].TransactionTotal += row.Amount;
            }
        }

        // Classify accounts into balance sheet categories
        var assets = new List<AccountBalance>();
        var liabilities = new List<AccountBalance>();
        var equity = new List<AccountBalance>();

        foreach (var balance in accountBalances.Values.OrderBy(a => a.AccountId))
        {
            var accountNumber = int.TryParse(balance.AccountId, out var num) ? num : 0;

            if (accountNumber >= 1000 && accountNumber < 2000)
            {
                // Assets (Tillgångar)
                assets.Add(balance);
            }
            else if (accountNumber >= 2000 && accountNumber < 2100)
            {
                // Equity (Eget kapital)
                equity.Add(balance);
            }
            else if (accountNumber >= 2100 && accountNumber < 3000)
            {
                // Liabilities (Skulder)
                liabilities.Add(balance);
            }
        }

        return new BalanceSheetReport
        {
            Assets = assets,
            Liabilities = liabilities,
            Equity = equity,
            GeneratedAt = DateTime.Now,
            DocumentCount = allDocuments.Count
        };
    }
}

public class BalanceSheetReport
{
    public List<AccountBalance> Assets { get; set; } = new();
    public List<AccountBalance> Liabilities { get; set; } = new();
    public List<AccountBalance> Equity { get; set; } = new();
    public DateTime GeneratedAt { get; set; }
    public int DocumentCount { get; set; }

    public decimal TotalAssets => Assets.Sum(a => a.CurrentBalance);
    public decimal TotalLiabilities => Liabilities.Sum(l => l.CurrentBalance);
    public decimal TotalEquity => Equity.Sum(e => e.CurrentBalance);
    public decimal LiabilitiesAndEquity => TotalLiabilities + TotalEquity;
    public bool IsBalanced => (Math.Abs(TotalAssets) - Math.Abs(LiabilitiesAndEquity)) < 0.01m;
}

public class AccountBalance
{
    public string AccountId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public decimal OpeningBalance { get; set; }
    public decimal ClosingBalance { get; set; }
    public decimal TransactionTotal { get; set; }

    // Current balance can be either closing balance or opening balance + transactions
    public decimal CurrentBalance => ClosingBalance != 0 ? ClosingBalance : (OpeningBalance + TransactionTotal);
}
