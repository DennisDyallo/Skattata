using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Skattata.Web;
using Skattata.Web.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Services are now scoped per user session (no SignalR needed!)
builder.Services.AddScoped<SieFileService>();
builder.Services.AddScoped<BalanceSheetService>();
builder.Services.AddScoped<VoucherStorageService>();

// Optional: Add HttpClient for API calls if needed in the future
builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });

await builder.Build().RunAsync();
