namespace Skattata.Core;

public class SieDimension
{
    public SieDimension()
    {
        Objects = new List<SieObject>();
    }
    public string Number { get; set; } = "";
    public string Name { get; set; } = "";
    public List<SieObject> Objects { get; }
}