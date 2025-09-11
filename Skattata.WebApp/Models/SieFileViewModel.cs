using Skattata.Core;

namespace Skattata.WebApp.Models;

public class SieFileViewModel
{
    public string? FileName { get; set; }
    public string? CompanyName { get; set; }
    public string? OrganizationNumber { get; set; }
    public string? Format { get; set; }
    public int TotalVouchers { get; set; }
    public int TotalAccounts { get; set; }
    public int ErrorCount { get; set; }
    public List<string> Errors { get; set; } = new();
    public List<SieBookingYear> BookingYears { get; set; } = new();
    public List<AccountSummary> Accounts { get; set; } = new();
    public List<VoucherSummary> Vouchers { get; set; } = new();
    public List<SieDimension> Dimensions { get; set; } = new();
}

public class AccountSummary
{
    public string AccountId { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal OpeningBalance { get; set; }
    public decimal ClosingBalance { get; set; }
    public decimal Result { get; set; }
    public string? SruCode { get; set; }
    public int PeriodValueCount { get; set; }
}

public class VoucherSummary
{
    public string Series { get; set; } = "";
    public string Number { get; set; } = "";
    public DateTime Date { get; set; }
    public string Text { get; set; } = "";
    public int RowCount { get; set; }
    public decimal TotalAmount { get; set; }
}