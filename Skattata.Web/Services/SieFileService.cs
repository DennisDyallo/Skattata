using Skattata.Core;

namespace Skattata.Web.Services;

public class SieFileService
{
    private readonly List<LoadedSieDocument> _documents = new();
    private SieDocument? _currentDocument;

    public SieDocument? CurrentDocument => _currentDocument;
    public IReadOnlyList<LoadedSieDocument> AllDocuments => _documents.AsReadOnly();

    public event Action? OnDocumentChanged;

    public async Task<(bool Success, string? ErrorMessage)> LoadFileAsync(Stream fileStream, string fileName)
    {
        try
        {
            using var memoryStream = new MemoryStream();
            await fileStream.CopyToAsync(memoryStream);
            memoryStream.Position = 0;

            var document = SieDocument.ReadStream(memoryStream);
            var loadedDoc = new LoadedSieDocument
            {
                FileName = fileName,
                LoadedAt = DateTime.Now,
                Document = document
            };

            _documents.Add(loadedDoc);
            _currentDocument = document;
            OnDocumentChanged?.Invoke();

            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, $"Failed to parse SIE file: {ex.Message}");
        }
    }

    public void ClearAllDocuments()
    {
        _documents.Clear();
        _currentDocument = null;
        OnDocumentChanged?.Invoke();
    }

    public void RemoveDocument(LoadedSieDocument document)
    {
        _documents.Remove(document);
        if (_currentDocument == document.Document)
        {
            _currentDocument = _documents.LastOrDefault()?.Document;
        }
        OnDocumentChanged?.Invoke();
    }
}

public class LoadedSieDocument
{
    public required string FileName { get; set; }
    public DateTime LoadedAt { get; set; }
    public required SieDocument Document { get; set; }
}
