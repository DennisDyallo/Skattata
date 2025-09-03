namespace Skattata.Core;

public class SieVoucherRow : SieDataItem
{
    public SieVoucherRow()
    {
        Objects = new List<SieObject>();
    }

    public string AccountNumber { get; set; } = "";
    public List<SieObject> Objects { get; set; }
    public decimal Amount { get; set; }
    public DateTime TransactionDate { get; set; }
    public string RowText { get; set; } = "";
    public decimal Quantity { get; set; }
    public string RegistrationSign { get; set; } = "";
}