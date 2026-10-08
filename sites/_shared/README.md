# Shared seeds

Not a site: menu seed files any site can list in its `site.json` → `seed`, as `"../_shared/seed/<name>.json"` (format: `backend/src/FoodSite.Api/Data/MenuSeed.cs`). The production image copies this folder next to the site's, so the same path works locally and deployed.

A seed only adds the dishes a site's database doesn't have yet (matched by name), so after the first start each site's admin edits, hides or re-pictures its own copy without touching the other sites or this file.

| File | What it holds |
| --- | --- |
| `seed/drinks.json` | The drinks category: one dish per picture in Cloudinary's `common/drinks` folder. Cans have plain names, bottles end in "- בקבוק". |
