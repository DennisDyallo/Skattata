using Skattata.Core;

namespace Skattata.Web.Services;

public class SieFileService
{
    private SieDocument? _currentDocument;

    public SieDocument? CurrentDocument => _currentDocument;

    public event Action? OnDocumentChanged;

    public async Task<(bool Success, string? ErrorMessage)> LoadFileAsync(Stream fileStream, string fileName)
    {
        try
        {
            using var memoryStream = new MemoryStream();
            await fileStream.CopyToAsync(memoryStream);
            memoryStream.Position = 0;

            _currentDocument = SieDocument.ReadStream(memoryStream);
            OnDocumentChanged?.Invoke();

            return (true, null);
        }
        catch (Exception ex)
        {
            _currentDocument = null;
            OnDocumentChanged?.Invoke();
            return (false, $"Failed to parse SIE file: {ex.Message}");
        }
    }

    public void ClearDocument()
    {
        _currentDocument = null;
        OnDocumentChanged?.Invoke();
    }
}
