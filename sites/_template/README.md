# Site template

The starting point for a new business. Copy this folder to `sites/<site-id>/` (lowercase letters, digits and dashes) and fill it in:

| File | What it holds |
| --- | --- |
| `site.json` | `id` (must match the folder name), time zone, `serviceCities` (comma-separated delivery cities, copied into the admin settings on first start; empty means every city), top-bar emoji, WhatsApp template names, `features` (which optional features the site has, e.g. `"favorites": true`; a feature left out is off, and the known ones are in `backend/src/FoodSite.Api/Sites/Features.cs`), `settings` (the admin settings a new site starts with, copied into its database once: `contactName`, `contactPhone`, `contactAddress`, `contactEmail`, `contactOpeningHours`, `deliveryAreaText`, `deliveryFeeText`, `kashrutText`, `backgroundImageUrl`), and the seed files to apply |
| `theme.css` | The site's look: every variable the shared CSS uses without defining it (the `--color-*` palette with the shadow tint, and `--gradient-hero`); `check-sites` lists any that are missing |
| `logo.svg` (or `.jpg`, `.png`, `.webp`) | The logo on the order page |
| `public/` | Files served from the site root: `favicon.svg`, and pictures a seed refers to (e.g. `/drinks/cola.svg`) |
| `i18n/he.json` | Text overrides merged over `frontend/src/i18n/he.json`. Only keys that exist there; at least `app.name` |
| `seed/*.json` | Optional first menu data, listed in `site.json` → `seed` and applied on every start without undoing admin changes |

Nothing secret goes here: the repo is public. Secrets are the site's environment variables (see `docs/DEPLOY.md`).

To add a site from a business's ad and photos, follow `.claude/skills/new-food-site/SKILL.md`.

Run it with `SITE=<site-id> npm run dev` in `frontend/`, and `node scripts/check-sites.mjs` to check the folder.
