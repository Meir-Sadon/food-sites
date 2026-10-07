# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

One codebase for the Hebrew (RTL) ordering sites of several home food businesses: a React/Vite frontend (`frontend/`) and an ASP.NET Core (.NET 10) + EF Core + PostgreSQL API (`backend/`). Each business is deployed separately (its own Render service, Neon database and secrets) from the same code. The product spec and decisions are in `docs/PLAN.md`; deployment in `docs/DEPLOY.md`. Commit and PR text is written in English; user-facing text is Hebrew.

## Platform status and rules

This repo started as a copy of `kuskus-shel-ima` (history imported) and is being made generic. **Read `docs/MIGRATION-PLAN.md` first**: it lists the phases, which are done, and the target layout (`sites/<site-id>/` per business). Until Phase 1 lands, the code still uses the `Kuskus.*` names described below; update this file in the same PR that changes them.

- Shared code never names a business or checks which site it runs as (`if (siteId == ...)`). Business-specific values (name, texts, palette, logo, WhatsApp template names, seeds) belong in `sites/<site-id>/`; behaviour only some businesses want goes behind a feature flag, off by default.
- Every migration reaches every site: make it backward compatible (expand, then contract), and keep `AppDbContextModelSnapshot.cs` in sync.
- This repo is public. Never commit secrets, client data, or a business's photos and texts collected for a demo; those go to Cloudinary or stay local.
- Mark a phase's checkboxes in `docs/MIGRATION-PLAN.md` in the PR that completes them.

## Commands

Frontend (`cd frontend`):
- `npm run dev` — Vite on :5173, proxies `/api` to `localhost:5000` (override with `API_PROXY_TARGET`)
- `npm run build` — `tsc -b && vite build`; this is also the typecheck
- `npm run lint` — oxlint (`.oxlintrc.json`)
- `npm test` — vitest once; single file: `npx vitest run src/order/model.test.ts`; single test: add `-t "<name>"`

Backend (`cd backend`, solution `Kuskus.slnx`):
- `dotnet build`, `dotnet run --project src/Kuskus.Api` (:5000; needs `src/Kuskus.Api/appsettings.Development.json` from `appsettings.Example.json`)
- `dotnet test` — single class/test: `dotnet test --filter "FullyQualifiedName~OrdersTests"`
- `dotnet run --project src/Kuskus.Api -- hash-password '<pw>'` — admin password hash for `Admin__PasswordHash`
- Migrations: `dotnet ef migrations add <Name> --project src/Kuskus.Api --output-dir Data/Migrations`. `Program.cs` throws without a 32+ byte `Jwt:Secret`, so for design-time `dotnet ef` commands set `Jwt__Secret=<32+ chars>` and a dummy `ConnectionStrings__Default` in the environment. `dotnet ef migrations has-pending-model-changes --project src/Kuskus.Api` verifies the snapshot matches the model.

Whole stack: `docker compose up --build` (site :8080, admin `/admin` with password `admin`, API :5000, Postgres :5432).

`/check` (`.claude/commands/check.md`) runs all of the above checks.

### Cloud sessions
`.claude/hooks/session-start.sh` installs `dotnet-sdk-10.0` from Ubuntu's apt (Microsoft's download hosts are blocked by the network policy), restores packages, installs `dotnet-ef` to `~/.dotnet/tools`, runs `npm install`, and starts `dockerd`. Backend tests other than `PhoneNumberTests`, `SupplyCalendarTests`, `OrderBuilderTests` and `AdminPasswordHasherTests` use Testcontainers (`postgres:17-alpine`) and need Docker; Docker Hub pulls may fail with 429 in cloud sessions — if so, say the integration tests were not run rather than claiming green.

## Architecture

**One origin in production.** The root `Dockerfile` builds the frontend into the API's `wwwroot`; `Program.cs` serves static files and falls back to `index.html` for non-`/api` paths. Deployed to Render (`render.yaml`) with Neon Postgres. Locally, docker-compose runs the frontend separately behind nginx (`frontend/nginx.conf`) proxying `/api`.

**Backend (`backend/src/Kuskus.Api`)**
- `Program.cs` wires everything: two JWT bearer schemes reading tokens from httpOnly cookies — admin (`kuskus_admin`, default scheme, role `Admin`) and client (`UserTokenService.Scheme`, cookie `kuskus_user`, separate audience so a client token never authorizes admin endpoints). Rate-limit policies are named constants on `PublicControllerBase` and `AdminAuthController`.
- `RequireRequestHeaderMiddleware`: every POST/PUT/DELETE to `/api` must carry `X-Kuskus-Request: 1` (CSRF guard). The frontend's `apiFetch` and the test `ApiFactory.CreateApiClient` add it.
- Controllers: `PublicController` (`/api/site`, `/api/menu`), `OrdersController` (`POST /api/orders`), `AccountController` (`/api/account/*`, phone-only login — no verification code), `Controllers/Admin/*` (all derive `AdminControllerBase`, `[Authorize(Roles=Admin)]`).
- Errors are **codes, not text**: `Errors` collects `{field: [code]}` and `Invalid(...)` returns a ValidationProblem; whole-request failures are `{ code }` (e.g. `Conflict("categoryNotEmpty")`). The frontend lowercases field names and translates codes via `he.json` (`errors.*`). Adding a new code means adding its Hebrew text.
- `Orders/OrderBuilder` prices orders server-side from DB dishes (client prices are never trusted); order lines snapshot dish name/option/price so later edits don't change history. Dishes/categories are soft-deleted (`IsHidden`). `Orders/SupplyCalendar` + `SiteClock` compute open supply dates (weekday, per-day cutoff, closed dates) in `Site:TimeZone`.
- External services sit behind interfaces with fallbacks chosen at startup: `IWhatsAppSender` (Cloud API when token + phone id set, else `SimulatedWhatsAppSender` logs only; a failed message never fails an order) and `IImageStore` (Cloudinary, else `NotConfiguredImageStore` → uploads return 503 `imageStoreUnavailable`).
- `DatabaseInitializer` migrates (when `Database:MigrateOnStartup`), seeds the admin hash into `Settings` only if none exists (DB wins afterwards), and idempotently seeds the drinks category (unless `Database:SeedDrinks` is false, as in `ApiFactory`, so tests start from an empty catalog).
- Migrations: recent ones were hand-written (no `.Designer.cs`); whichever way you add one, `AppDbContextModelSnapshot.cs` must be updated to match the model. JSON enums serialize as strings.

**Backend tests (`backend/tests/Kuskus.Api.Tests`)** — xunit integration tests through `ApiFactory` (`WebApplicationFactory<Program>`): one shared Postgres container (`PostgresFixture`, collection `"Postgres"`), a fresh database per factory (disposing the factory clears its Npgsql pool, so connections don't pile up), fake `IImageStore`/`IWhatsAppSender` (`FakeImageStore`, `CapturingWhatsAppSender` to assert messages), `CreateAdminClientAsync()` for an admin-cookie client. Tests reuse request/response records via `using static ...Controller;`.

**Frontend (`frontend/src`)**
- Routes in `App.tsx`: client pages under `ClientLayout` (`/` is the order page); admin under `/admin` wrapped in `RequireAdmin` (unlinked from the client site).
- `api/client.ts` (`apiFetch`/`apiJson`/`send`, `ApiError` with `code` and per-field `errors`); one module per area (`site`, `catalog`, `account`, `admin`, `operations`) holds types + calls mirroring backend DTOs. Keep these types in sync with C# records when changing an endpoint.
- State: `SiteContext` (`/api/site`: contact, delivery text, background) and `AccountContext` (logged-in client). Order page logic is pure functions in `order/model.ts` (selections, totals, rebuilding from history/favorites); drafts persist in the browser (`localStorage`) via `order/draft.ts`; `LeaveGuardProvider` asks before leaving with an unsaved order.
- Admin screens use `admin/hooks.ts` (`useLoad`, `useErrorMessage`) and shared `admin/ui.tsx` components.
- All UI text goes through i18next keys in `i18n/he.json` (no hard-coded Hebrew in components); `i18n/index.ts` keeps `<html lang dir>` in sync so another language is just a new JSON file.
- Tests: vitest + Testing Library in jsdom. Page tests render the whole app at a route with `renderAt(path)` (`test/render.tsx`) and stub the network with `fakeApi({ 'METHOD /regex/path': handler })` (`test/fakeApi.ts`), which throws on any unexpected request; `adminSession` and `invalid(...)` are helpers, sample menu data is in `test/catalogData.ts`. Tests sit next to the feature (`*.test.tsx`).

A feature typically touches: entity + migration + snapshot, controller DTO/validation, backend test, `api/*.ts` types, the component, `he.json`, `test/catalogData.ts`, and a frontend test.
