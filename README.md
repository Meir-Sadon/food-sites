# הקוסקוס של אמא

A small Hebrew ordering website for a home food business. Clients order admin-configured dishes for configured supply days; the admin manages the menu, orders and reports from a password-protected area.

## Features

**Client site**
- Order page with dishes grouped by category, weight/unit options and add-ons
- Order total always visible, supply-day picker, delivery or pickup
- Guest ordering, or phone login with a WhatsApp one-time code
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
/docs        Project plan and decisions
```

## Getting started

### Prerequisites
- Node.js (LTS)
- .NET SDK
- PostgreSQL (local or Docker)

### Backend
```bash
cd backend
cp appsettings.Example.json appsettings.Development.json   # fill in your values
dotnet ef database update
dotnet run
```

### Frontend
```bash
cd frontend
cp .env.example .env.local   # set VITE_API_URL
npm install
npm run dev
```

## Configuration

Secrets are never committed. Set them in `appsettings.Development.json` locally and as environment variables in production.

| Setting | Purpose |
| --- | --- |
| `ConnectionStrings__Default` | PostgreSQL connection string |
| `Jwt__Secret` | Signing key for session tokens |
| `Admin__PasswordHash` | Hashed admin password |
| `WhatsApp__Token`, `WhatsApp__PhoneNumberId` | WhatsApp Cloud API credentials |
| `Cloudinary__Url` | Image storage credentials |

## Tests

```bash
cd backend && dotnet test
cd frontend && npm test
```

## Project plan

The full plan, decisions and build phases are in [`docs/PLAN.md`](docs/PLAN.md).

## License

Private project. All rights reserved.
