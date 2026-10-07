# Food sites platform — migration plan

Oct 7, 2026 · @Meir

This plan turns two copy-pasted repos into one platform. `kuskus-shel-ima` and `grape-leaves-eliel` are the same app with different branding. From now on, both businesses and every new one get their sites from this repo, so a feature built once reaches all of them. A separate console repo lets you manage every site from one place.

## Decisions

| Topic | Decision |
| --- | --- |
| Deployment | One deployment per business: its own Render web service, its own Neon database, its own cookies and secrets. Businesses never share a server, database or login. |
| Code | One codebase (this repo). Everything business-specific lives in `sites/<site-id>/`; nothing outside that folder names a business. |
| Starting point | `kuskus-shel-ima`, with its full history (imported in Phase 0). `grape-leaves-eliel` adds only branding, so it is brought in as a site folder. |
| Existing data | Neither site has real data, so names, cookies, storage keys and databases can change freely. No data migration is needed. |
| Features one business wants | A feature flag with an on/off value per site. Code never checks *which* site it is running for. |
| Managing the sites | A separate repo, `food-sites-console`, for feature toggles, reports, recommendations, comments and bugs across all sites (see [Console](#console-food-sites-console)). |
| Migrations | Every migration reaches every site, so migrations must be backward compatible, and deploys go to one site first. |
| Old repos | Archived (read-only) on GitHub once both sites run from this repo. |

## Target layout

```
/backend                FoodSite.Api (ASP.NET Core), FoodSite.Api.Tests
/frontend               React app; reads the active site's folder at build time
/sites
  /kuskus               one folder per business
    site.json           identity, time zone, WhatsApp templates, feature flags
    theme.css           colour palette as CSS variables
    logo.(svg|jpg|png)  logo shown on the order page
    public/             served from the site root: favicon.svg, seed pictures
    i18n/he.json        text overrides (site name, tagline, WhatsApp text…)
    seed/               optional first data (e.g. drinks), applied once
  /grape-leaves
  /_template            starting point for a new site
/scripts                new-site, check-sites and other helpers
/docs                   product spec, this plan, deploy guide
render.yaml             one service per site, same Dockerfile, different SITE
```

### `site.json` (draft)

```json
{
  "id": "kuskus",
  "timeZone": "Asia/Jerusalem",
  "language": "he",
  "emoji": "🥘",
  "whatsApp": {
    "orderConfirmationTemplate": "kuskus_order_confirmation",
    "newOrderTemplate": "kuskus_new_order"
  },
  "features": {
    "recommendations": true,
    "favorites": true
  },
  "seed": ["seed/drinks.json"]
}
```

The display name, tagline and other text live in `i18n/he.json`, not in `site.json`, so every piece of text goes through i18next as it does today.

## What is business-specific today

Comparing the two repos shows exactly what has to move into `sites/<id>/`:

| Today | Where it goes |
| --- | --- |
| `Kuskus.*` solution, project and namespace names | Renamed once to `FoodSite.*` (Phase 1) |
| Cookie names `kuskus_admin` / `kuskus_user`, JWT issuer | Built from `Site:Id` (each site is on its own domain, so the names only need to be readable) |
| CSRF header `X-Kuskus-Request` | One neutral header, `X-Food-Site-Request` |
| WhatsApp template names | `site.json` → `whatsApp` |
| `kuskus.orderDraft` localStorage key | `<siteId>.orderDraft` |
| Palette in `frontend/src/index.css` (already CSS variables) | `sites/<id>/theme.css` |
| `assets/logo.jpg`, `public/favicon.svg`, top-bar emoji | `sites/<id>/logo.*`, `public/favicon.svg`, `site.json` → `emoji` |
| `site.name`, the tagline and the WhatsApp text in `he.json` | `sites/<id>/i18n/he.json`, merged over the shared file |
| `<title>` in `index.html` | Set at build time from the site's `site.name` |
| Drinks seed in `DatabaseInitializer` and its pictures in `frontend/public/drinks/` | `sites/kuskus/seed/drinks.json` (pictures in `sites/kuskus/public/drinks/`), applied only when `site.json` lists it |
| Render service and database names | One `render.yaml` entry per site |
| `docs/PLAN.md` (written for kuskus) | Becomes `docs/PRODUCT.md`, the shared product spec |

## Phases

Each phase is its own pull request and leaves the repo green: frontend lint, build and tests; backend build and tests; no pending model changes.

### Phase 0 — New repo (done)
- [x] Import the full `kuskus-shel-ima` history.
- [x] README, this plan, `CLAUDE.md`, `.gitattributes`, `.editorconfig`, issue and PR templates, Dependabot, CI.

### Phase 1 — Neutral names (done)
- [x] Rename `Kuskus.Api` / `Kuskus.Api.Tests` / `Kuskus.slnx` to `FoodSite.*`: namespaces, Dockerfiles, `docker-compose.yml`, `render.yaml`, the session-start hook, `/check`, `CLAUDE.md`.
- [x] Rename the CSRF header to `X-Food-Site-Request` in the middleware, `api/client.ts` and `ApiFactory`.
- [x] Rename the local database and user from `kuskus` to `foodsite` in compose and examples.
- [x] Nothing changes in behaviour; all tests pass unchanged apart from names.

### Phase 2 — Site folders (done)
- [x] **Backend:** add a `SiteOptions` (`Site:Id`, plus the existing `Site:TimeZone`) and build cookie names, the JWT issuer and the WhatsApp template defaults from it. The site's `site.json` is copied into the image and bound as configuration. Environment variables still win, as today.
- [x] **Frontend:** a `SITE` variable chooses `sites/<SITE>` at build time (Vite alias `@site`). `main.tsx` imports `@site/theme.css` after `index.css`; the order page imports `@site/logo`; `TopBar` takes the emoji from the site config; `i18n/index.ts` deep-merges `@site/i18n/he.json` over the shared `he.json`; the draft key gets the site id; a small Vite plugin sets `<title>` and the favicon.
- [x] **Seeds:** `DatabaseInitializer` applies the seed files listed in `site.json`, and stays idempotent.
- [x] **Docker:** the root `Dockerfile` takes `ARG SITE` and fails the build when `sites/$SITE` is missing.
- [x] Move the kuskus branding into `sites/kuskus/` and create `sites/_template/`.
- [x] **Guard rail:** `scripts/check-sites` fails CI when a business name or site-specific value appears outside `sites/`, and when a site folder is missing a required file or a `he.json` key it overrides doesn't exist in the shared file.

How it was built, where it differs from the outline above:
- The favicon and the pictures a seed refers to live in `sites/<id>/public/`, which Vite uses as its `publicDir`, so they are served from the site root as before (`/favicon.svg`, `/drinks/cola.svg`).
- The logo can be `.svg`, `.jpg`, `.png` or `.webp`; the frontend finds it with `import.meta.glob`.
- The image folders (`<siteId>/dishes`, `<siteId>/background`) and the report file name also come from the site id.
- The API reads the business name from the site's `i18n/he.json` (`app.name`) and starts every WhatsApp message with it.
- Without `SITE`, local runs and tests use `_template`; the Docker images refuse to build without it.
- The delivery cities (hard-coded Ashkelon before) are an admin setting, a comma-separated list. `site.json` → `serviceCities` gives the first value; an empty list means every city is served.

### Phase 3 — Grape leaves as the second site (done)
- [x] Create `sites/grape-leaves/` from `grape-leaves-eliel`: palette (vine green and grape plum, plus its extra `--color-grape` variable), `logo.svg`, favicon, 🍇, and its three Hebrew texts.
- [x] Any CSS that hard-codes a colour (the gradient and button shadow that differ between the repos) moves to a variable, so `theme.css` alone defines a site's look.
- [x] Both sites build, and a screenshot of each order page looks like the original repo's.

How it was built:
- The colours that differed between the repos became theme variables: `--color-shadow` (the tint of every shadow), `--color-highlight` (a category's side stripe), `--color-badge` and `--color-badge-text` (the "default" option badge) and `--gradient-hero` (the order page's banner). The active top-bar link's shadow is now mixed from `--color-accent`, so it needed no variable.
- `check-sites` also fails when a site's `theme.css` leaves out a variable the shared CSS uses but doesn't define.
- Only two of the three texts are overrides (`app.name` and the tagline): the WhatsApp message is built from `app.name`.
- `grape-leaves` keeps its original WhatsApp template names and Ashkelon as its delivery city, and seeds the same drinks as kuskus (the original repo seeded them too, without pictures; they now have kuskus's drink pictures).
- CI builds the frontend of every folder under `sites/`.
- Checked by building the old and new frontends against the same API and comparing full-page phone screenshots: kuskus is pixel-identical, and grape leaves differs only in the drink pictures it gained.

### Phase 4 — Feature flags (done)
- [x] Defaults come from `site.json` → `features`. A `FeatureFlags` table in the site's own database overrides them; the console writes there through the ops API (Phase 6).
- [x] `GET /api/site` returns the enabled flags; the frontend gets a `useFeature('name')` hook, and the backend checks the same flag on the endpoints it guards.
- [x] Rule (in `CLAUDE.md`): new behaviour that not every business wants ships behind a flag that is off by default. Never `if (siteId == "...")`.
- [x] Candidates for the first flags: recommendations page, favorites, Bit/PayBox payment, delivery and pickup.

How it was built:
- Two flags: `recommendations` (the page, its top-bar button and the client's list on the profile page) and `favorites` (saving a past order as a favorite, the profile's list, and the order page's quick fill from a favorite; filling from the last order stays). Both `kuskus` and `grape-leaves` (and `_template`) turn both on, so neither site changes.
- Payment and delivery got no flag: they already are admin settings in each site's own database. Bit/PayBox is offered only while the admin has set a payment phone, and delivery and pickup each have an on/off setting. A flag on top would be a second switch for the same thing.
- The known flags are listed in `FoodSite.Api/Sites/Features.cs` and mirrored by the `Feature` type in `frontend/src/api/site.ts`. The API refuses to start when `site.json` (or an environment variable such as `Site__Features__favorites`) names an unknown flag, and a backend test checks every site folder.
- A row in `FeatureFlags` (name, on/off) wins over `site.json`. Nothing writes it yet; the ops API will (Phase 6).
- Guarded endpoints carry `[RequireFeature(Features.X)]` and answer 404 `{ code: "featureDisabled" }` while the flag is off.
- The frontend uses the site's `site.json` until `/api/site` answers, so the top bar doesn't flicker. A disabled page sends the visitor to the order page, and the profile page waits for the site info before deciding which sections to load.

### Phase 5 — CI and deploys
- [x] **CI** (`.github/workflows/ci.yml`, added in Phase 0, extended here): one job for the shared code, then a matrix that builds the production image for every folder under `sites/` (excluding `_template`).
- [x] **Render:** one service per site in `render.yaml`, all from the same `Dockerfile` with a different `SITE` build argument, each with its own environment variables and Neon database.
- [x] **Staged rollout:** one site deploys automatically on merge to `main` and is the canary. The others have auto-deploy off and are deployed by a workflow (Render deploy hooks, stored as GitHub secrets) once the canary passes its `/api/health` check after deploying.
- [x] **Migrations:** expand, then contract. Add new columns as nullable or with defaults, ship the code that uses them, and only drop the old ones in a later release. CI keeps running `dotnet ef migrations has-pending-model-changes`.
- [x] Update `docs/DEPLOY.md`: deploying a new site is a new `render.yaml` entry, a Neon project, and its secrets.
- [x] Before adding a third site, check Render's and Neon's current free-tier limits: free Render services share a monthly allowance of instance hours, and Neon limits the number of free projects.

### Phase 6 — Ops API (the console's view into each site)
- [ ] A third authentication scheme for the console: a per-site service token (only its hash is stored in the site's settings) in an `Authorization` header. It never works as an admin or client session, and the reverse holds too.
- [ ] `/api/ops/*`: `version` (commit, migration level), `summary` (orders and sales per period), `recommendations` (list and mark handled), `feedback` (see below), `features` (read and write).
- [ ] A **"Report a problem / comment"** form in the admin area, and optionally for clients, storing feedback in the site's own database for the console to collect.
- [ ] The ops DTOs are written up in `docs/OPS-API.md`; the console keeps its client types in sync with it.

### Phase 7 — Retire the old repos
- [ ] Both sites deployed from this repo and checked by hand: order, admin login, WhatsApp (simulated), picture upload.
- [ ] Archive `kuskus-shel-ima` and `grape-leaves-eliel` on GitHub, with a README line pointing here.

## Console (`food-sites-console`)

A separate private app for you only. It's the one place to see and manage every business.

| Area | What it does |
| --- | --- |
| Sites | List of sites with URL, deployed version, migration level and health (green, red or asleep). |
| Features | A grid of sites × flags; flipping one calls the site's `/api/ops/features`. |
| Reports | Orders and sales per site and in total, per week and month. |
| Recommendations | One inbox with every site's client recommendations; mark them handled. |
| Comments and bugs | Feedback from every site; one click turns an item into a GitHub issue on `food-sites`, labelled with the site. |
| New site (later) | Runs the new-site flow (below) and records the result. |

How it is built:
- The same stack (React + ASP.NET Core + Postgres), so the knowledge and the patterns carry over.
- It stores the site list and each site's service token (encrypted) in its own small database. It pulls from the sites; the sites never call it. If the console is down, every site keeps working.
- It holds the keys to every site, so it gets the strongest login: one admin with a passkey or a TOTP second factor, a short session, and a token per site that can be rotated.
- Deployed like a site: one Render service and one Neon database.

## Things to watch

- **One migration, every site.** A bad migration breaks every business at once. Keep migrations backward compatible, check the snapshot in CI, and deploy the canary first.
- **Per-site secrets.** Each site has its own `Jwt__Secret`, admin password, database and WhatsApp number (Meta allows one WhatsApp business number per phone line). Nothing secret goes in `sites/`.
- **Public repo.** `food-sites` is public. Code and branding there are fine. Client data, business photos for demos (see below) and anything a business owner hasn't approved must not be committed: keep them in Cloudinary or make the repo private.
- **Pictures.** One Cloudinary account can serve every site if each site uploads into its own folder (`<siteId>/…`); otherwise give each site its own account.
- **Divergence by stealth.** Shared CSS or components that only look right for one site. The `check-sites` script and a screenshot of each site in CI (later) catch most of it.

## Ideas for later

1. **`npm run new-site <id>`** — copies `sites/_template`, adds the `render.yaml` entry and the CI matrix entry, and prints the remaining manual steps (Neon project, secrets, WhatsApp templates).
2. **Theme preview in the admin area** — the owner sees their colours and logo on a sample order page, and can tune them, before anything is deployed.
3. **Shared monitoring** — one error-reporting and uptime setup for all sites, with the site id as a tag, surfaced in the console.
4. **Owner-editable branding** — the site name, tagline and contact texts move into the `Settings` table, so the owner edits them in the admin area without a deploy. The `sites/` folder keeps only the defaults.
5. **Demo site from a Facebook post** — see below.

### Demo site from a Facebook post

The goal: you give me a business's Facebook post, and I build a skeleton site in that business's style with their dishes, so you can show the owner a working demo before they commit.

**Input (from you):**
- The post text, pasted in (Facebook needs a login, so I can't read a post from its link).
- The post's images, saved as files.
- Optionally: the business name, phone number and supply days if the post doesn't say.

**What I do:**
1. **Read the post:** dish names, descriptions, prices, units or weights, options (sizes, "per kilo"), categories, and any days, areas or phone number it mentions. Anything unclear is listed as a question rather than guessed.
2. **Pick the style:** colours drawn from the images, adjusted to pass WCAG AA contrast (the site already targets Israeli Standard 5568), and an emoji. The layout stays the platform's fixed layout; only `theme.css`, the logo and the texts change.
3. **Create `sites/<id>/`** from `_template`: `site.json` with `"demo": true`, `theme.css`, a text logo (or a cropped image), `i18n/he.json` with the name and tagline, and `seed/menu.json` with categories, dishes, options and prices.
4. **Images:** uploaded to Cloudinary under `demo/<id>/` and referenced by URL from the seed, not committed to this public repo.
5. **Build and run it**, take screenshots of the order page on a phone-sized screen, and give you the screenshots and a list of what I assumed.
6. **Deploy as a demo** (optional): its own free Render service with an empty database seeded from `seed/menu.json`.

**Demo mode** (`"demo": true` in `site.json`):
- A visible "אתר הדגמה" banner and `noindex`, so search engines don't list it.
- Orders are accepted and shown in the admin area, but no WhatsApp message is sent.
- A shared demo admin password, which you can give the owner.
- Converting a demo into a real site means: switching demo mode off, real secrets, a fresh database, and the owner's approval of the texts and photos.

**How it will be built:**
- A Claude Code skill in this repo (`.claude/skills/site-from-post/SKILL.md`) that describes the steps above, plus `npm run new-site` for the mechanical part.
- The seed format (`seed/menu.json`) is the same one Phase 2 introduces for drinks, so a demo is just a site with a larger seed.

**Care points:**
- The photos and texts belong to the business. Use them only for the private demo you show that owner, and don't publish or index the demo until they agree.
- Prices and allergen information from a post may be out of date; the demo marks them as samples until the owner confirms.
