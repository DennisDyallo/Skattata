namespace Skattata.Core;

public class SieException : Exception
{
    public SieException(string? message) : base(message)
    {
    }

    public SieException(string? message, Exception? innerException) : base(message, innerException)
    {
    }
}