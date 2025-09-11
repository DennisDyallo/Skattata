using Microsoft.AspNetCore.Mvc.RazorPages;
using Skattata.WebApp.Models;

namespace Skattata.WebApp.Pages;

public class ResultsModel : PageModel
{
    public SieFileViewModel? SieData { get; set; }

    public void OnGet()
    {
        SieData = TempData["SieData"] as SieFileViewModel;
    }
}