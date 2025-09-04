namespace Skattata.Core;

public class SieObject
{
    public string DimensionNumber { get; set; } = "";
    public string Number { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal OpeningBalance { get; set; }
    public decimal ClosingBalance { get; set; }
}
