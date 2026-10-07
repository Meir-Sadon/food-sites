# Site template

The starting point for a new business. Copy this folder to `sites/<site-id>/` (lowercase letters, digits and dashes) and fill it in:

| File | What it holds |
| --- | --- |
| `site.json` | `id` (must match the folder name), time zone, `serviceCities` (comma-separated delivery cities, copied into the admin settings on first start; empty means every city), top-bar emoji, WhatsApp template names, and the seed files to apply |
| `theme.css` | The colour palette: every `--color-*` variable the shared CSS uses |
| `logo.svg` (or `.jpg`, `.png`, `.webp`) | The logo on the order page |
| `public/` | Files served from the site root: `favicon.svg`, and pictures a seed refers to (e.g. `/drinks/cola.svg`) |
| `i18n/he.json` | Text overrides merged over `frontend/src/i18n/he.json`. Only keys that exist there; at least `app.name` |
| `seed/*.json` | Optional first menu data, listed in `site.json` → `seed` and applied on every start without undoing admin changes |

Nothing secret goes here: the repo is public. Secrets are the site's environment variables (see `docs/DEPLOY.md`).

Run it with `SITE=<site-id> npm run dev` in `frontend/`, and `node scripts/check-sites.mjs` to check the folder.
