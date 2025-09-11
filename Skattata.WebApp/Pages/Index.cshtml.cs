using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Skattata.Core;
using Skattata.WebApp.Models;

namespace Skattata.WebApp.Pages;

public class IndexModel : PageModel
{
    private readonly ILogger<IndexModel> _logger;

    public IndexModel(ILogger<IndexModel> logger)
    {
        _logger = logger;
    }

    public string? ErrorMessage { get; set; }
    public SieFileViewModel? SieData { get; set; }

    public void OnGet()
    {
    }

    public IActionResult OnPostUpload(IFormFile sieFile)
    {
        if (sieFile == null || sieFile.Length == 0)
        {
            ErrorMessage = "Please select a file to upload.";
            return Page();
        }

        if (sieFile.Length > 10 * 1024 * 1024) // 10MB limit
        {
            ErrorMessage = "File size exceeds 10MB limit.";
            return Page();
        }

        try
        {
            SieDocument document;
            using (var stream = sieFile.OpenReadStream())
            {
                document = SieDocument.ReadStream(stream, null);
            }

            // Create view model from parsed document
            var viewModel = new SieFileViewModel
            {
                FileName = sieFile.FileName,
                CompanyName = document.CompanyName,
                OrganizationNumber = document.OrganizationNumber,
                Format = document.Format,
                TotalVouchers = document.Vouchers.Count,
                TotalAccounts = document.Accounts.Count,
                ErrorCount = document.Errors.Count,
                Errors = document.Errors.ToList(),
                BookingYears = document.BookingYears.ToList(),
                Dimensions = document.Dimensions.ToList(),
                Accounts = document.Accounts.Values.Select(a => new AccountSummary
                {
                    AccountId = a.AccountId,
                    Name = a.Name,
                    OpeningBalance = a.OpeningBalance,
                    ClosingBalance = a.ClosingBalance,
                    Result = a.Result,
                    SruCode = a.SruCode,
                    PeriodValueCount = a.PeriodValues.Count
                }).OrderBy(a => a.AccountId).ToList(),
                Vouchers = document.Vouchers.Select(v => new VoucherSummary
                {
                    Series = v.Series,
                    Number = v.Number,
                    Date = v.Date,
                    Text = v.Text,
                    RowCount = v.Rows.Count,
                    TotalAmount = v.Rows.Sum(r => r.Amount)
                }).ToList()
            };

            // Store results in the model to display on the same page
            SieData = viewModel;
            return Page();
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Error parsing SIE file: {ex.Message}";
            _logger.LogError(ex, "Error parsing SIE file {FileName}", sieFile.FileName);
            return Page();
        }
    }
}
