using System.Text;

namespace Skattata.Core;

/// <summary>
/// Provides helper methods for handling character encodings, specifically for SIE files.
/// </summary>
public static class EncodingHelper
{
    private static bool _isRegistered = false;

    /// <summary>
    /// Registers the necessary encoding providers to support PC-8 (codepage 437) used in SIE files.
    /// This method only needs to be called once.
    /// </summary>
    public static void Register()
    {
        if (_isRegistered) return;
        
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        _isRegistered = true;
    }

    /// <summary>
    /// Gets the IBM PC-8 (codepage 437) encoding.
    /// </summary>
    /// <returns>The IBM PC-8 Encoding.</returns>
    public static Encoding GetSieEncoding()
    {
        Register();
        return Encoding.GetEncoding(437);
    }
}