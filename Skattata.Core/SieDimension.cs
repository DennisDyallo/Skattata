namespace Skattata.Core;

public class SieDimension
{
    public SieDimension()
    {
        Objects = new Dictionary<string, SieObject>();
    }
    public string Number { get; set; } = "";
    public string Name { get; set; } = "";
    public Dictionary<string, SieObject> Objects { get; }
}