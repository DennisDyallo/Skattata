namespace Skattata.Core;

public class SieInvalidCommandException : SieException
{
    public SieInvalidCommandException(string? message) : base(message)
    {
    }
}