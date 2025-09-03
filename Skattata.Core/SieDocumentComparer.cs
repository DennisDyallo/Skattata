namespace Skattata.Core;

public class SieDocumentComparer
{
    private readonly SieDocument _a;
    private readonly SieDocument _b;
    private readonly List<string> _errors = new();

    public SieDocumentComparer(SieDocument a, SieDocument b)
    {
        _a = a;
        _b = b;
    }

    public List<string> Compare()
    {
        CompareSimpleProperties();
        CompareAccounts();
        CompareVouchers();
        return _errors;
    }

    private void CompareSimpleProperties()
    {
        CompareValue("Format", _a.Format, _b.Format);
        CompareValue("CompanyName", _a.CompanyName, _b.CompanyName);
    }
    
    private void CompareAccounts()
    {
        if (_a.Accounts.Count != _b.Accounts.Count)
        {
            _errors.Add($"Account count differs: {_a.Accounts.Count} vs {_b.Accounts.Count}");
        }

        foreach (var aAcc in _a.Accounts.Values)
        {
            if (!_b.Accounts.TryGetValue(aAcc.AccountNumber, out var bAcc))
            {
                _errors.Add($"Account {aAcc.AccountNumber} not found in B");
                continue;
            }

            CompareValue($"Account {aAcc.AccountNumber} Name", aAcc.AccountName, bAcc.AccountName);
        }
    }
    
    private void CompareVouchers()
    {
        if (_a.Vouchers.Count != _b.Vouchers.Count)
        {
            _errors.Add($"Voucher count differs: {_a.Vouchers.Count} vs {_b.Vouchers.Count}");
            return; 
        }

        for (var i = 0; i < _a.Vouchers.Count; i++)
        {
            var aVer = _a.Vouchers[i];
            var bVer = _b.Vouchers[i];

            var context = $"Voucher {aVer.VoucherSeries}{aVer.VoucherNumber}";

            CompareValue($"{context} VoucherSeries", aVer.VoucherSeries, bVer.VoucherSeries);
            CompareValue($"{context} VoucherNumber", aVer.VoucherNumber, bVer.VoucherNumber);
            CompareValue($"{context} VoucherDate", aVer.VoucherDate, bVer.VoucherDate);
            CompareValue($"{context} VoucherText", aVer.VoucherText, bVer.VoucherText);
        }
    }


    private void CompareValue<T>(string field, T valA, T valB)
    {
        if (EqualityComparer<T>.Default.Equals(valA, valB)) return;

        _errors.Add($"{field} differs: '{valA}' vs '{valB}'");
    }
}