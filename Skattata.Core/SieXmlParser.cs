namespace Skattata.Core;


/// <summary>
/// Handles parsing of the SIE 5 XML format.
/// </summary>
public class SieXmlParser
{
    private readonly SieDocument _doc;
    public SieXmlParser(SieDocument doc) => _doc = doc;

    public void Parse(Stream stream, SieCallbacks? callbacks)
    {
        // The logic for parsing the SIE 5 XML format will be implemented here.
        // It will read the XML and populate the same _doc object.
        // For now, we'll throw a NotImplementedException.

        // Example of how it might start:
        // var xmlDoc = XDocument.Load(stream);
        // var companyNode = xmlDoc.Descendants("Company").FirstOrDefault();
        // if (companyNode != null)
        // {
        //     _doc.CompanyName = companyNode.Element("Name")?.Value;
        //     _doc.RegistrationNumber = companyNode.Element("CorporateIdentityNumber")?.Value;
        // }
        // ... and so on for all other elements.

        throw new NotImplementedException("Parsing for SIE 5 XML format is not yet implemented.");
    }
}
