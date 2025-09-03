namespace Skattata.Core;

public class SieDimension
{
    public SieDimension()
    {
        Objects = new List<SieObject>();
    }
    public string DimensionNumber { get; set; } = "";
    public string DimensionName { get; set; } = "";
    public List<SieObject> Objects { get; }
}