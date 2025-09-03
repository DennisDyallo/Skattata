namespace Skattata.Core;

public class SieVoucher
{
    public SieVoucher()
    {
        Rows = new List<SieVoucherRow>();
    }
    public string VoucherSeries { get; set; } = "";
    public string VoucherNumber { get; set; } = "";
    public DateTime VoucherDate { get; set; }
    public string VoucherText { get; set; } = "";
    public DateTime RegistrationDate { get; set; }
    public string RegistrationSign { get; set; } = "";

    public List<SieVoucherRow> Rows { get; }
    
    public decimal Balance => Rows.Sum(r => r.Amount);
}