# CLAUDE.md

One codebase for the Hebrew (RTL) ordering sites of several home food businesses: a React/Vite frontend (`frontend/`) and an ASP.NET Core (.NET 10) + EF Core + PostgreSQL API (`backend/`). Each business is deployed separately (its own Render service, Neon database and secrets) from the same code. Product spec: `docs/PLAN.md`; deployment: `docs/DEPLOY.md`; migration phases: `docs/MIGRATION-PLAN.md` (read first); per-area architecture notes: `docs/ARCHITECTURE.md`. Commit and PR text is in English; user-facing text is Hebrew.

> **Every user-facing change updates the feature guide in the same PR.** A PR that adds, removes or changes anything a customer or the admin can see or do is not done until [`docs/food-sites-feature-guide.html`](docs/food-sites-feature-guide.html) describes it in Hebrew and English, with screenshots from demo data. If a PR has no guide impact, say why in the PR checklist. This applies to every feature PR, including ones started from a project thread or a skill. Rules: [Feature guide maintenance](#feature-guide-maintenance-required).

## Docs map (read the part you are about to change)

`docs/ARCHITECTURE.md` holds the detailed notes; `CLAUDE.md` holds only rules and commands. Sections there: platform history and site folders, one origin/deploy, site folder loading, auth and CSRF, feature flags, ops API, two admins, cancel reasons, audit trail, site styles/order layout/corners/colours/finish (appearance settings), basket and cart, category jump bar, `OrderBuilder`, variants/add-ons/questions/options, Google sign-in, accessibility, dietary tags, dish marks and groups, delivery fee and zones, social links, entry pop-up, duplicating dishes, usage, marketing tracking, owner mail, external services, `DatabaseInitializer`, backend tests, frontend routes/admin navigation/state/search/driver report/unsaved changes/reordering/i18n/tests. **Update the matching section in the same PR that changes the area** (a new setting, flag, style, palette, tracking tool or error code needs its checklist items there).

## Rules

- Shared code never names a business or checks which site it runs as (`if (siteId == ...)`). Business-specific values (name, texts, palette, logo, WhatsApp template names, seeds) belong in `sites/<site-id>/`; behaviour only some businesses want goes behind a feature flag, off by default (see Feature flags below).
- Every migration reaches every site: make it backward compatible (expand, then contract), and keep `AppDbContextModelSnapshot.cs` in sync.
- This repo is public. Never commit secrets, client data, or a business's photos and texts collected for a demo; those go to Cloudinary or stay local.
- Merge conflicts on your own PR are yours to resolve, immediately and without asking: when a PR you opened conflicts with `main` (or `main` moved on), merge `origin/main` into the branch (no rebase or force-push), resolve every conflict keeping both sides' intent (for the feature guide, take `main`'s file and re-add your section under the next free number), rerun lint, build and tests, push, and carry on. Only ask when both sides changed the same logic and keeping either would lose behaviour.
- Mark a phase's checkboxes in `docs/MIGRATION-PLAN.md` in the PR that completes them.
- `node scripts/check-sites.mjs` (run in CI) fails when a site folder is incomplete, a site's `theme.css` lacks a variable the shared CSS uses, a site overrides a `he.json` key the shared file lacks, or a site's id, name, emoji or template names appear in shared code.
- Cookie names, the JWT issuer, WhatsApp template names, Cloudinary folders and the order-draft key are built from the site id. `sites/_shared/seed/` holds seeds any site can list as `"../_shared/seed/<name>.json"`; it is not a site.
- Errors are **codes, not text** (`{field: [code]}` or `{ code }`); a new code needs its Hebrew text in `he.json` (`errors.*`). All UI text goes through `i18n/he.json`, never hard-coded Hebrew.
- Every POST/PUT/DELETE to `/api` needs `X-Food-Site-Request: 1` (CSRF guard).
- Orders are priced server-side from DB dishes (`Orders/OrderBuilder`); client prices are never trusted. Cancelling an order always needs a reason.
- Admin endpoints must load and save entities, not `ExecuteUpdate`/`ExecuteDelete`, or the audit trail misses the change.
- New feature flag: constant in `Features` (and `All`), `Feature` type in `frontend/src/api/site.ts`, the flag in each wanting site's `site.json`, `ApiFactory` if tests need it.
- Appearance settings (style, corners, palette, finish, order layout) keep colours in `theme.css`/`palettes.ts`, use `var(--radius)`/`--corner-scale` for corners, and follow the "new value" checklists in `docs/ARCHITECTURE.md`.
- Keep `docs/OPS-API.md` in step with any ops endpoint change.

## Feature guide maintenance (required)

The catalog is [`docs/food-sites-feature-guide.html`](docs/food-sites-feature-guide.html): Hebrew default, RTL, complete English switch, standalone HTML. Full rules: [`docs/FEATURE-GUIDE.md`](docs/FEATURE-GUIDE.md). Essentials:

- Update affected descriptions and screenshots (both languages) in every PR that changes customer/admin behavior, or state why there is no impact.
- After a merge, review the merged changes against the guide; prepare a focused docs PR for gaps, never auto-merge it.
- At session start run `node scripts/check-feature-guide.mjs`; if the last review (`docs/feature-guide-review.json`) is 3+ days old or product files changed since, review before finishing (without interrupting an urgent unrelated fix). Update the marker only after a real review.
- Screenshots use synthetic local/staging data only: no credentials, tokens, real customers, orders, payments or contacts; never touch production. Never invent a screenshot; keep honest evidence labels.
- Run `node scripts/check-feature-guide.mjs --check` before committing.

## UI/UX design skill

Use `.claude/skills/ui-ux-pro-max/` for any UI work (new page/component, restyle, theme, accessibility/contrast/responsive review); skip for backend work. Search: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux` (local, no network). Its output is advice: this repo's rules win (Hebrew RTL, texts via `he.json`, colours only in `sites/<site-id>/theme.css`, corner rules); never use `--persist`.

## Commands

Frontend (`cd frontend`):
- `SITE=<site-id>` picks the site folder for `dev`, `build` and `test` (default `_template`; the Docker images require it)
- `npm run dev` — Vite on :5173, proxies `/api` to `localhost:5000` (override with `API_PROXY_TARGET`)
- `npm run build` — `tsc -b && vite build`; this is also the typecheck (CI builds every site)
- `npm run lint` — oxlint (`.oxlintrc.json`)
- `npm test` — vitest once; single file: `npx vitest run src/order/model.test.ts`; single test: add `-t "<name>"`

Backend (`cd backend`, solution `FoodSite.slnx`):
- `dotnet build`, `dotnet run --project src/FoodSite.Api` (:5000; needs `src/FoodSite.Api/appsettings.Development.json` from `appsettings.Example.json`)
- `dotnet test` — single class/test: `dotnet test --filter "FullyQualifiedName~OrdersTests"`
- `dotnet run --project src/FoodSite.Api -- hash-password '<pw>'` — admin password hash for `Admin__PasswordHash`
- Migrations: `dotnet ef migrations add <Name> --project src/FoodSite.Api --output-dir Data/Migrations`. `Program.cs` throws without a 32+ byte `Jwt:Secret`, and without a valid `Site:Id`, so for design-time `dotnet ef` commands set `Jwt__Secret=<32+ chars>`, `Site__Id=dev` and a dummy `ConnectionStrings__Default` in the environment. `dotnet ef migrations has-pending-model-changes --project src/FoodSite.Api` verifies the snapshot matches the model.

Whole stack: `SITE=<site-id> docker compose up --build` (site :8080, admin `/admin` with user name and password `admin`, API :5000, Postgres :5432).

`/check` (`.claude/commands/check.md`) runs all of the above checks.

### Cloud sessions
`.claude/hooks/session-start.sh` installs `dotnet-sdk-10.0` from Ubuntu's apt (Microsoft's download hosts are blocked by the network policy), restores packages, installs `dotnet-ef` to `~/.dotnet/tools`, runs `npm install`, and starts `dockerd`. Backend tests other than `PhoneNumberTests`, `SupplyCalendarTests`, `OrderBuilderTests` and `AdminPasswordHasherTests` use Testcontainers (`postgres:17-alpine`) and need Docker; Docker Hub pulls may fail with 429 in cloud sessions — if so, say the integration tests were not run rather than claiming green.

## Code layout (details in `docs/ARCHITECTURE.md`)

- Backend `backend/src/FoodSite.Api`: `Program.cs` wires everything (admin and client JWT cookies, ops token scheme); `Controllers/` (public, `Admin/*` deriving `AdminControllerBase`, `Ops/`), `Orders/`, `Sites/`, `Data/`. Tests in `backend/tests/FoodSite.Api.Tests` are xunit integration tests via `ApiFactory` with a Postgres container per run.
- Frontend `frontend/src`: routes in `App.tsx` (client pages under `ClientLayout`, admin under `/admin`); `api/*.ts` mirror backend DTOs (keep in sync with the C# records); `order/model.ts` holds order page logic as pure functions; admin screens use `admin/hooks.ts` and `admin/ui.tsx`. Tests are vitest + Testing Library: `renderAt(path)` with `fakeApi({...})` (`test/`), next to the feature.
- Production is one origin: the root `Dockerfile` builds the frontend into the API's `wwwroot`. Render auto-deploy is off; `deploy.yml` deploys a canary first (see `docs/DEPLOY.md`).

A feature typically touches: entity + migration + snapshot, controller DTO/validation, backend test, `api/*.ts` types, the component, `he.json`, `test/catalogData.ts`, a frontend test, and the feature guide (`docs/food-sites-feature-guide.html`, both languages and a screenshot).
