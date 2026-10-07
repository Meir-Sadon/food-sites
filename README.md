# Food sites

One codebase for the Hebrew ordering websites of small home food businesses. Clients order dishes for the business's supply days; the owner manages the menu, orders and reports in a password-protected admin area.

Every business gets **its own deployment**: its own server, database, admin password and branding, built from this same code. A feature added here reaches every site on its next deploy.

| Site | Business | Status |
| --- | --- | --- |
| `kuskus` | הקוסקוס של אמא | Code imported from [kuskus-shel-ima](https://github.com/Meir-Sadon/kuskus-shel-ima) |
| `grape-leaves` | עלי גפן - אליאל | Branding to be moved in from [grape-leaves-eliel](https://github.com/Meir-Sadon/grape-leaves-eliel) |

> **Migration in progress.** The code still uses the `Kuskus.*` names of the site it came from. The phases, decisions and target layout are in [`docs/MIGRATION-PLAN.md`](docs/MIGRATION-PLAN.md); the commands below change with Phase 1.

## Features

**Client site**
- Order page with dishes grouped by category, weight/unit options and add-ons
- Order total always visible, supply-day picker, delivery or pickup
- Guest ordering, or login by phone number (no verification code)
- Last order, named favorites and reorder from history
- Recommendations and profile pages

**Admin area**
- General settings: supply days, order cutoff, closed dates, background picture
- Categories and dishes: pictures, options, prices, add-on links, sold-out toggle
- Orders by supply day with status, payment flag and a cooking summary
- Contacts and WhatsApp notification list
- Statistics and reports

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, i18next (RTL) |
| Backend | ASP.NET Core Web API (C#), Entity Framework Core |
| Database | PostgreSQL |
| Images | Cloudinary |
| Messages | WhatsApp Cloud API |

## Repository structure

```
/frontend    React client site and admin area
/backend     ASP.NET Core API, EF Core migrations, tests
/docs        Product spec, migration plan, deploy guide
/sites       One folder per business: config, theme, logo, texts (from Phase 2)
Dockerfile   Production image: frontend and API in one container
render.yaml  Render deployment (one service per site, from Phase 5)
```

Related repo (planned): `food-sites-console`, a private console for managing all the sites: feature toggles, reports, recommendations, comments and bugs.

## Getting started

### Everything at once (Docker)

```bash
docker compose up --build
```

- Site: http://localhost:8080
- Admin area: http://localhost:8080/admin (local password: `admin`)
- API: http://localhost:5000, PostgreSQL: localhost:5432 (user, password and database `kuskus`)

The API applies database migrations on startup. The defaults in `docker-compose.yml` are for local use only; override them in a `.env` file (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `CLOUDINARY_URL`).

Picture uploads need a Cloudinary account: put its `CLOUDINARY_URL` (from the Cloudinary dashboard) in `.env`. Without it the admin area works, but uploading a picture shows a message that uploads are not configured.

### Prerequisites for running parts separately
- Node.js (LTS)
- .NET 10 SDK, plus `dotnet tool install --global dotnet-ef` for migrations
- PostgreSQL (local, or `docker compose up db`)
- Docker, for the backend tests

### Cloud sessions (Claude Code on the web)

Each cloud session starts in a fresh container with only Node.js pre-installed. The repo's session-start hook (`.claude/hooks/session-start.sh`) installs the .NET 10 SDK from Ubuntu's package archive, restores packages, installs `dotnet-ef` and the frontend packages, and starts Docker for the backend tests. `/check` runs every check.

### Backend
```bash
cd backend
cp appsettings.Example.json src/Kuskus.Api/appsettings.Development.json   # fill in your values
dotnet run --project src/Kuskus.Api        # http://localhost:5000
```

With `Database:MigrateOnStartup` set to `true` the API migrates the database itself. To do it by hand:
```bash
dotnet ef database update --project src/Kuskus.Api
```

Add a migration after changing the model:
```bash
dotnet ef migrations add <Name> --project src/Kuskus.Api --output-dir Data/Migrations
```

### Frontend
```bash
cd frontend
cp .env.example .env.local   # leave VITE_API_URL empty to use the dev proxy
npm install
npm run dev                  # http://localhost:5173, proxies /api to localhost:5000
```

### Admin password

There is one admin password. Only its hash is stored, in the `Settings` table. Create a hash with:
```bash
cd backend
dotnet run --project src/Kuskus.Api -- hash-password '<password>'
```
Put the output in `Admin__PasswordHash`. On startup it is copied into `Settings` if no admin password is set there yet; after that the value in the database wins. To replace a password that is already set, clear `Settings.AdminPasswordHash` and restart with the new hash.

## Deployment

The site and API deploy together as one free Render web service: the root `Dockerfile` builds the frontend into the API's `wwwroot`, and `render.yaml` describes the service. The database is Neon PostgreSQL. Step-by-step instructions are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Configuration

Secrets are never committed. Set them in `appsettings.Development.json` locally and as environment variables in production.

| Setting | Purpose |
| --- | --- |
| `ConnectionStrings__Default` | PostgreSQL connection string |
| `Jwt__Secret` | Signing key for session tokens, at least 32 characters |
| `Admin__PasswordHash` | Hashed admin password, seeded into `Settings` on first start |
| `Admin__SessionHours` | Admin session length (default 12) |
| `Admin__LoginAttemptsPerMinute` | Admin login attempts allowed per IP per minute (default 5) |
| `Account__SessionDays` | How long a logged-in client stays logged in (default 30) |
| `AuthCookie__UserName` | Name of the client session cookie (default `kuskus_user`; the admin cookie is `kuskus_admin`) |
| `AuthCookie__Secure` | Send the session cookie over HTTPS only (default `true`) |
| `AuthCookie__SameSite` | `Lax` when site and API share a domain, `None` when they don't |
| `Database__MigrateOnStartup` | Apply migrations when the API starts |
| `ForwardedHeaders__Enabled` | Trust `X-Forwarded-For` from one reverse proxy in front of the API |
| `WhatsApp__Token`, `WhatsApp__PhoneNumberId` | WhatsApp Cloud API credentials. When both are set, messages are really sent; otherwise they are only logged (see below) |
| `WhatsApp__OrderConfirmationTemplate`, `WhatsApp__NewOrderTemplate` | Names of the two approved message templates (defaults `kuskus_order_confirmation`, `kuskus_new_order`) |
| `WhatsApp__LanguageCode` | Template language (default `he`) |
| `Site__TimeZone` | Time zone for supply-day cutoffs (default `Asia/Jerusalem`) |
| `Public__RequestsPerMinute` | Rate limit per IP for login, registration and orders (default 30) |
| `Cloudinary__Url` | `cloudinary://<api_key>:<api_secret>@<cloud_name>`. Without it, picture uploads are switched off |

## WhatsApp messages

With `WhatsApp__PhoneNumberId` and `WhatsApp__Token` set, order confirmations and the new-order messages to the admin's phones go out through the WhatsApp Cloud API as template messages. Create two templates in Meta's WhatsApp Manager (language Hebrew), each with a single body variable `{{1}}` that carries the message text (the API joins the lines with ` | `, since template variables cannot hold line breaks), and give them the names above. A failed message never fails an order; it still shows in the admin Orders tab.

Without those two settings nothing is sent: messages are written to the API log instead (`WhatsApp (simulated, ...) to ...`).

## API notes

- Every `POST`, `PUT` and `DELETE` to `/api` must send the header `X-Kuskus-Request: 1`. Browsers can't add it from another site's page, so other sites can't act with the admin's cookie. The frontend sends it on every request.
- Public endpoints: `GET /api/site` (contact, delivery text, background), `GET /api/menu` (categories, dishes, open supply dates), and `POST /api/orders`. Orders are priced and validated on the server.
- Client account endpoints live under `/api/account`: `login` (phone number only) and `register`, `logout`, `me`, `orders`, `favorites` and `recommendations`. They use the client's own session cookie, which never works as an admin session.
- Admin endpoints live under `/api/admin` and need the admin session cookie. Besides the catalog and settings, they include `orders` (list by supply date and status, `summary?date=` for the cooking summary, status, paid and edit), `dishes/{id}/affected-orders` (orders not yet supplied that contain a dish) and `reports` (sales per week and dish, with `reports/export` as an Excel file). Validation errors come back as codes per field (for example `{"errors": {"name": ["required"]}}`), which the admin screens translate.

## Tests

```bash
cd backend && dotnet test     # needs Docker: runs against a real PostgreSQL container
cd frontend && npm test
```

## Documents

- [`docs/MIGRATION-PLAN.md`](docs/MIGRATION-PLAN.md): how this repo becomes the shared platform, the console, and ideas for later
- [`docs/PLAN.md`](docs/PLAN.md): product spec and decisions (written for the first site)
- [`docs/DEPLOY.md`](docs/DEPLOY.md): deploying a site to Render, Neon and Cloudinary
- [`CLAUDE.md`](CLAUDE.md): commands and architecture notes for Claude Code and other contributors

## Contributing

Work on a branch and open a pull request; CI runs the frontend lint, build and tests, the backend build and tests, and a migration snapshot check. Use the issue templates for bugs, features and new sites, and say which sites a change affects.

## License

Private project. All rights reserved.
