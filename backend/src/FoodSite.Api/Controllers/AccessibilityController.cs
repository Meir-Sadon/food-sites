using FoodSite.Api.Controllers.Admin;
using FoodSite.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static FoodSite.Api.Controllers.Admin.AccessibilityAdminController;

namespace FoodSite.Api.Controllers;

/// <summary>What the public accessibility statement needs beyond the main contact: the coordinator and the known limits.</summary>
[Route("api")]
public class AccessibilityController(AppDbContext db) : PublicControllerBase
{
    [HttpGet("accessibility")]
    public async Task<AccessibilityDto> Get() => ToDto(await db.Settings.AsNoTracking().SingleAsync());
}
