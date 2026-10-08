# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

One codebase for the Hebrew (RTL) ordering sites of several home food businesses: a React/Vite frontend (`frontend/`) and an ASP.NET Core (.NET 10) + EF Core + PostgreSQL API (`backend/`). Each business is deployed separately (its own Render service, Neon database and secrets) from the same code. The product spec and decisions are in `docs/PLAN.md`; deployment in `docs/DEPLOY.md`. Commit and PR text is written in English; user-facing text is Hebrew.

## Platform status and rules

This repo started as a copy of `kuskus-shel-ima` (history imported) and is being made generic. **Read `docs/MIGRATION-PLAN.md` first**: it lists the phases, which are done, and the target layout (`sites/<site-id>/` per business). Phase 1 renamed the projects to `FoodSite.*`; Phase 2 moved each business's identity into `sites/<site-id>/` (`site.json`, `theme.css`, logo, `public/`, `i18n/he.json` overrides, `seed/`), chosen by `SITE` at build time, with `sites/_template/` for a new one. Phase 3 added `sites/grape-leaves-eliel/` as the second site and moved every colour that differed between the sites into `theme.css` variables. Phase 4 added feature flags (`site.json` → `features`, overridden by the `FeatureFlags` table). Phase 5 made CI build an image per site and added per-site Render services with a canary rollout. `sites/cigars-shiraz/` was the first site added with the `new-food-site` skill (`.claude/skills/new-food-site/SKILL.md`), which is how a new business gets a site. Cookie names, the JWT issuer, WhatsApp template names, Cloudinary folders and the order-draft key are built from the site id. Update this file in the same PR that changes any of this.

- Shared code never names a business or checks which site it runs as (`if (siteId == ...)`). Business-specific values (name, texts, palette, logo, WhatsApp template names, seeds) belong in `sites/<site-id>/`; behaviour only some businesses want goes behind a feature flag, off by default (see Feature flags below).
- Every migration reaches every site: make it backward compatible (expand, then contract), and keep `AppDbContextModelSnapshot.cs` in sync.
- This repo is public. Never commit secrets, client data, or a business's photos and texts collected for a demo; those go to Cloudinary or stay local.
- Mark a phase's checkboxes in `docs/MIGRATION-PLAN.md` in the PR that completes them.
- `node scripts/check-sites.mjs` (run in CI) fails when a site folder is incomplete, a site's `theme.css` lacks a variable the shared CSS uses, a site overrides a `he.json` key the shared file lacks, or a site's id, name, emoji or template names appear in shared code.

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

Whole stack: `SITE=<site-id> docker compose up --build` (site :8080, admin `/admin` with password `admin`, API :5000, Postgres :5432).

`/check` (`.claude/commands/check.md`) runs all of the above checks.

### Cloud sessions
`.claude/hooks/session-start.sh` installs `dotnet-sdk-10.0` from Ubuntu's apt (Microsoft's download hosts are blocked by the network policy), restores packages, installs `dotnet-ef` to `~/.dotnet/tools`, runs `npm install`, and starts `dockerd`. Backend tests other than `PhoneNumberTests`, `SupplyCalendarTests`, `OrderBuilderTests` and `AdminPasswordHasherTests` use Testcontainers (`postgres:17-alpine`) and need Docker; Docker Hub pulls may fail with 429 in cloud sessions — if so, say the integration tests were not run rather than claiming green.

## Architecture

**One origin in production.** The root `Dockerfile` builds the frontend into the API's `wwwroot`; `Program.cs` serves static files and falls back to `index.html` for non-`/api` paths. Deployed to Render with Neon Postgres: one service per site in `render.yaml`, each with its own database and secrets. Every service has Render's auto-deploy off: after CI passes on `main`, `.github/workflows/deploy.yml` deploys the first service (the canary) through its Render deploy hook, then the others through theirs once the canary's `/api/health` reports the new commit (see `docs/DEPLOY.md`). Locally, docker-compose runs the frontend separately behind nginx (`frontend/nginx.conf`) proxying `/api`.

**Backend (`backend/src/FoodSite.Api`)**
- `Sites/SiteFolder` loads the site folder (`Site:Directory`, or `./site` in the image) into configuration under `Site:` (above appsettings.json, below environment variables); `SiteOptions` (`Site:Id`, required) is what shared code uses instead of naming a business. `UseSiteDefaults` on `JwtOptions`, `CookieOptions` and `WhatsAppOptions` fills unset values from the id.
- `Program.cs` wires everything: two JWT bearer schemes reading tokens from httpOnly cookies — admin (`<siteId>_admin`, default scheme, role `Admin`) and client (`UserTokenService.Scheme`, cookie `<siteId>_user`, separate audience so a client token never authorizes admin endpoints). Rate-limit policies are named constants on `PublicControllerBase` and `AdminAuthController`.
- Feature flags: `Sites/Features` lists the known flags; a site turns one on in `site.json` → `features` (anything unlisted is off; an unknown name stops the app), and a row in the `FeatureFlags` table overrides that. `FeatureFlags` (scoped service) answers which are on; `GET /api/site` returns them as `features`; endpoints are guarded with `[RequireFeature(Features.X)]` (404 `featureDisabled`). A new flag means: a constant in `Features` (and `All`), the `Feature` type in `frontend/src/api/site.ts`, the flag in each site's `site.json` that wants it, and `ApiFactory` turning it on if existing tests need it.
- `RequireRequestHeaderMiddleware`: every POST/PUT/DELETE to `/api` must carry `X-Food-Site-Request: 1` (CSRF guard). The frontend's `apiFetch` and the test `ApiFactory.CreateApiClient` add it.
- Controllers: `PublicController` (`/api/site`, `/api/menu`), `OrdersController` (`POST /api/orders`), `AccountController` (`/api/account/*`, phone-only login — no verification code), `ReviewsController` (`/api/reviews`: approved reviews, and the review page behind a per-order link `/r/<token>`), `Controllers/Admin/*` (all derive `AdminControllerBase`, `[Authorize(Roles=Admin)]`). WhatsApp messages to a client are sent by hand: `MessageTemplatesController` holds the admin's templates, and the Orders tab composes one (`admin/messages/compose.ts`: first name, text, review link) into a wa.me link.
- Errors are **codes, not text**: `Errors` collects `{field: [code]}` and `Invalid(...)` returns a ValidationProblem; whole-request failures are `{ code }` (e.g. `Conflict("categoryNotEmpty")`). The frontend lowercases field names and translates codes via `he.json` (`errors.*`). Adding a new code means adding its Hebrew text.
- `Orders/OrderBuilder` prices orders server-side from DB dishes (client prices are never trusted); order lines snapshot dish name/option/price so later edits don't change history. Dishes/categories are soft-deleted (`IsHidden`). `Orders/SupplyCalendar` + `SiteClock` compute open supply dates (weekday, per-day cutoff, closed dates) in `Site:TimeZone`, and each date's one-hour slots from the day's supply hours. A client picks a slot when the day has hours; `Settings.OrdersPerHour` caps a slot only softly: `GET /api/hour-availability` tells the order page a picked hour is full (it is never shown in advance), the order still goes through, and the admin's orders list marks the orders past the cap (`HourFull`). `Settings.PortionsPerSupplyDate` is a hard cap shared by all dishes (`Orders/DailyPortions`: unit dishes that are not sides or add-on only): the menu folds what is left of it into each counted dish's `remaining`, and an order past it fails with `portionLimitReached`.
- External services sit behind interfaces with fallbacks chosen at startup: `IWhatsAppSender` (Cloud API when token + phone id set, else `SimulatedWhatsAppSender` logs only; a failed message never fails an order) and `IImageStore` (Cloudinary, else `NotConfiguredImageStore` → uploads return 503 `imageStoreUnavailable`).
- `DatabaseInitializer` migrates (when `Database:MigrateOnStartup`), seeds the admin hash into `Settings` only if none exists (DB wins afterwards), copies `site.json` → `settings` (main contact, delivery texts, background) into empty `Settings` fields once (`SiteDefaultsApplied`), and idempotently applies the site's menu seed files (`site.json` → `seed`, format `Data/MenuSeed`; off with `Database:ApplySeeds=false`). `ApiFactory` sets `Site:Id`/`Site:Name` and no site folder, so tests start from an empty catalog.
- Migrations: recent ones were hand-written (no `.Designer.cs`); whichever way you add one, `AppDbContextModelSnapshot.cs` must be updated to match the model. JSON enums serialize as strings.

**Backend tests (`backend/tests/FoodSite.Api.Tests`)** — xunit integration tests through `ApiFactory` (`WebApplicationFactory<Program>`): one shared Postgres container (`PostgresFixture`, collection `"Postgres"`), a fresh database per factory (disposing the factory clears its Npgsql pool, so connections don't pile up), fake `IImageStore`/`IWhatsAppSender` (`FakeImageStore`, `CapturingWhatsAppSender` to assert messages), `CreateAdminClientAsync()` for an admin-cookie client. Tests reuse request/response records via `using static ...Controller;`.

**Frontend (`frontend/src`)**
- Routes in `App.tsx`: client pages under `ClientLayout` (`/` is the order page); admin under `/admin` wrapped in `RequireAdmin` (unlinked from the client site).
- `api/client.ts` (`apiFetch`/`apiJson`/`send`, `ApiError` with `code` and per-field `errors`); one module per area (`site`, `catalog`, `account`, `admin`, `operations`) holds types + calls mirroring backend DTOs. Keep these types in sync with C# records when changing an endpoint.
- Site identity: the `@site` alias points at `sites/<SITE>` (`vite.config.ts`, which also sets `publicDir` and `<title>`); `site/config.ts` exposes `site.json` and the logo; `main.tsx` loads `@site/theme.css` after `index.css`; `i18n/index.ts` merges `@site/i18n/he.json` over the shared texts. TypeScript checks `@site` against `_template`.
- Feature flags: `useFeature('name')` / `useFeatures()` (`site/useSite.ts`) read `/api/site` → `features`, falling back to the build's `site.json` until it loads; `RequireFeature` wraps a route so a disabled page redirects to `/`, and `TopBar` links carry a `feature` to hide them. Don't fetch a disabled feature's data (the API answers 404).
- State: `SiteContext` (`/api/site`: contact, delivery text, background, features) and `AccountContext` (logged-in client). Order page logic is pure functions in `order/model.ts` (selections, totals, rebuilding from history/favorites); drafts persist in the browser (`localStorage`) via `order/draft.ts`; `LeaveGuardProvider` asks before leaving with an unsaved order.
- Passing info messages (saved, draft restored, order filled) are toasts: `useToast()` (`components/toast.ts`, provider in `App.tsx`). Errors and warnings tied to a field or an order stay inline (`Status`, `.notice--warning`).
- Driver report (`admin/route/`, `/admin/orders/route?date=`): built only from the admin orders list. `plan.ts` orders the day's deliveries by requested hour, then nearest next address, and times each stop; travel is guessed from the address text (same street / city / other city), with no map service.
- Admin screens use `admin/hooks.ts` (`useLoad`, `useErrorMessage`) and shared `admin/ui.tsx` components.
- All UI text goes through i18next keys in `i18n/he.json` (no hard-coded Hebrew in components); `i18n/index.ts` keeps `<html lang dir>` in sync so another language is just a new JSON file.
- Tests: vitest + Testing Library in jsdom. Page tests render the whole app at a route with `renderAt(path)` (`test/render.tsx`) and stub the network with `fakeApi({ 'METHOD /regex/path': handler })` (`test/fakeApi.ts`), which throws on any unexpected request; `adminSession` and `invalid(...)` are helpers, sample menu data is in `test/catalogData.ts`. Tests sit next to the feature (`*.test.tsx`).

A feature typically touches: entity + migration + snapshot, controller DTO/validation, backend test, `api/*.ts` types, the component, `he.json`, `test/catalogData.ts`, and a frontend test.
