namespace Skattata.Core;

public class SieVoucher
{
    public SieVoucher()
    {
        Rows = new List<SieVoucherRow>();
    }
    public string Series { get; set; } = "";
    public string Number { get; set; } = "";
    public DateTime Date { get; set; }
    public string Text { get; set; } = "";
    public DateTime RegistrationDate { get; set; }
    public string RegistrationSign { get; set; } = "";

    public List<SieVoucherRow> Rows { get; }
    
    public decimal Balance => Rows.Sum(r => r.Amount);
}