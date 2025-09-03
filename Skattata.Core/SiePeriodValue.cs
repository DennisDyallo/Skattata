namespace Skattata.Core;

public class SiePeriodValue
{
    public SieBookingYear? BookingYear { get; set; }
    public string Period { get; set; } = "";
    public decimal Value { get; set; }
    public decimal Quantity { get; set; }
}