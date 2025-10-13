using Microsoft.JSInterop;
using Skattata.Core;
using System.Text.Json;

namespace Skattata.Web.Services;

public class VoucherStorageService
{
    private readonly IJSRuntime _jsRuntime;

    public event Action? OnVouchersChanged;

    public VoucherStorageService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    public async Task<int> AddVoucherAsync(StoredVoucher voucher)
    {
        try
        {
            var id = await _jsRuntime.InvokeAsync<int>("addVoucher", voucher);
            OnVouchersChanged?.Invoke();
            return id;
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to add voucher to IndexedDB: {ex.Message}", ex);
        }
    }

    public async Task<List<StoredVoucher>> GetAllVouchersAsync()
    {
        try
        {
            var vouchers = await _jsRuntime.InvokeAsync<List<StoredVoucher>>("getAllVouchers");
            return vouchers ?? new List<StoredVoucher>();
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to retrieve vouchers from IndexedDB: {ex.Message}", ex);
        }
    }

    public async Task DeleteVoucherAsync(int id)
    {
        try
        {
            await _jsRuntime.InvokeVoidAsync("deleteVoucher", id);
            OnVouchersChanged?.Invoke();
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to delete voucher from IndexedDB: {ex.Message}", ex);
        }
    }

    public async Task ClearAllVouchersAsync()
    {
        try
        {
            await _jsRuntime.InvokeVoidAsync("clearAllVouchers");
            OnVouchersChanged?.Invoke();
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to clear vouchers from IndexedDB: {ex.Message}", ex);
        }
    }

    // Read file as Base64 for storage
    public async Task<PdfFileData?> ReadPdfFileAsync(string fileInputId)
    {
        try
        {
            Console.WriteLine($"[VoucherStorageService] Calling JS readFileAsBase64 for element: {fileInputId}");

            var result = await _jsRuntime.InvokeAsync<PdfFileData>(
                "readFileAsBase64",
                fileInputId
            );

            Console.WriteLine($"[VoucherStorageService] JS call completed. Result: {(result != null ? $"FileName={result.FileName}, Size={result.Size}" : "null")}");

            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VoucherStorageService] Error reading PDF file: {ex.GetType().Name} - {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.WriteLine($"[VoucherStorageService] Inner exception: {ex.InnerException.GetType().Name} - {ex.InnerException.Message}");
            }
            throw new Exception($"Failed to read PDF file: {ex.Message}", ex);
        }
    }

    // Download PDF from voucher
    public async Task DownloadPdfAsync(string base64Data, string fileName, string contentType)
    {
        try
        {
            await _jsRuntime.InvokeVoidAsync("downloadPdf", base64Data, fileName, contentType);
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to download PDF: {ex.Message}", ex);
        }
    }

    // Create blob URL for PDF preview
    public async Task<string> CreatePdfBlobUrlAsync(string base64Data, string contentType)
    {
        try
        {
            return await _jsRuntime.InvokeAsync<string>("createBlobUrl", base64Data, contentType);
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to create blob URL: {ex.Message}", ex);
        }
    }

    // Convert StoredVoucher to SieVoucher for integration with existing code
    public SieVoucher ToSieVoucher(StoredVoucher storedVoucher)
    {
        var sieVoucher = new SieVoucher
        {
            Series = storedVoucher.Series,
            Number = storedVoucher.Number,
            Date = DateTime.Parse(storedVoucher.Date),
            Text = storedVoucher.Text
        };

        if (!string.IsNullOrEmpty(storedVoucher.RegistrationDate))
        {
            sieVoucher.RegistrationDate = DateTime.Parse(storedVoucher.RegistrationDate);
        }

        foreach (var storedRow in storedVoucher.Rows)
        {
            var row = new SieVoucherRow
            {
                AccountNumber = storedRow.AccountNumber,
                Amount = storedRow.Amount,
                RowText = storedRow.RowText
            };

            sieVoucher.Rows.Add(row);
        }

        return sieVoucher;
    }
}

// Data models for JSON serialization with IndexedDB
public class StoredVoucher
{
    public int? Id { get; set; }
    public string Series { get; set; } = "";
    public string Number { get; set; } = "";
    public string Date { get; set; } = "";
    public string Text { get; set; } = "";
    public string? RegistrationDate { get; set; }
    public List<StoredVoucherRow> Rows { get; set; } = new();

    // PDF attachment support
    public string? PdfFileName { get; set; }
    public string? PdfContentType { get; set; }
    public string? PdfDataBase64 { get; set; }
}

public class StoredVoucherRow
{
    public string AccountNumber { get; set; } = "";
    public decimal Amount { get; set; }
    public string RowText { get; set; } = "";
}

public class PdfFileData
{
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public string Base64Data { get; set; } = "";
    public long Size { get; set; }
}
