# Ops API

The console (`food-sites-console`) reads and manages each site through that site's `/api/ops/*` endpoints. This file is the contract: the console keeps its client types in sync with it, and a PR that changes an ops endpoint updates this file.

The console pulls; a site never calls the console. If the console is down, every site keeps working.

## Authentication

- Each site has its own **console token**. The master admin creates it in the site's admin: **הגדרות אתר → הגדרות כלליות → חיבור למסוף הניהול** (the section is shown to the master only). The token is shown once; copy it into the console's entry for that site.
- The site stores only the token's SHA-256 hash (`Settings.OpsTokenHash`). Creating a new token replaces the old one at once; revoking it turns the console off for that site until a new one is made. Both are recorded in the site's audit trail (without the hash).
- Tokens start with `fso_` followed by 43 base64url characters (32 random bytes).
- Every request sends it as `Authorization: Bearer fso_…`.
- Writes (`PUT`) also send `X-Food-Site-Request: 1`, like every state-changing request to a site's API.
- The token is a scheme of its own (`Ops`): it never works on admin or client endpoints, and an admin or client session never works on `/api/ops`. A missing or wrong token answers `401`.
- Changes made through the ops API are audited as the actor `console` and show in the site's **יומן שינויים** as "מסוף הניהול".

| Endpoint (admin, master session only) | What it does |
| --- | --- |
| `GET /api/admin/ops-token` | `{ createdAt }`: when the current token was made, `null` when there is none |
| `POST /api/admin/ops-token` | Makes a new token: `{ token, createdAt }`. The only time the token is returned |
| `DELETE /api/admin/ops-token` | Revokes the token (`204`) |

The site owner gets `403 { code: "masterOnly" }` on all three.

## Conventions

- JSON in camelCase; enums as strings; times as ISO 8601 with offset (UTC); dates as `yyyy-MM-dd` in the site's time zone.
- Validation errors are `400` with `{ errors: { field: [code] } }`, as in the rest of the API.
- Lists are newest first and return at most 500 items.

## Endpoints

### `GET /api/ops/version`

```json
{
  "siteId": "kuskus-shel-ima",
  "commit": "c643ef2…",
  "migration": "20261011173500_OpsApi",
  "pendingMigrations": []
}
```

- `commit`: Render's `RENDER_GIT_COMMIT`; `null` outside Render.
- `migration`: the last migration applied to the site's database.
- `pendingMigrations`: migrations this build has and the database lacks (empty once the site migrated on startup).

### `GET /api/ops/summary?from=&to=&period=`

Orders and their totals per period, by **supply date**, counted like the admin's statistics: cancelled orders and orders waiting for approval are left out.

- `from`, `to`: dates, both included. Without them: the first of the month 11 months ago up to today. At most 731 days; `from` after `to` or a longer range is `400` with `from: ["invalidRange"]`.
- `period`: `Day`, `Week` (Sunday to Saturday) or `Month` (default).

```json
{
  "from": "2030-01-01",
  "to": "2030-03-31",
  "period": "Month",
  "orders": 4,
  "sales": 250.00,
  "periods": [
    { "start": "2030-01-01", "orders": 3, "sales": 180.00 },
    { "start": "2030-02-01", "orders": 1, "sales": 70.00 }
  ]
}
```

`sales` is the sum of the orders' totals in shekels. Periods with no orders are left out.

### `GET /api/ops/recommendations?handled=`

Clients' recommendations (feature `recommendations`). `handled=true` or `false` filters; leave it out for all.

```json
[{ "id": 7, "text": "הקוסקוס מעולה", "clientName": "דנה כהן", "createdAt": "2026-10-11T09:00:00+00:00", "isHandled": false }]
```

### `PUT /api/ops/recommendations/{id}`

Body `{ "isHandled": true }`. `204`; `404` for an unknown id. The client sees the handled state on their profile page.

### `GET /api/ops/feedback?handled=`

Problems and comments the site's admins sent from **הגדרות אתר → דיווח על בעיה**.

```json
[{
  "id": 3,
  "kind": "Problem",
  "text": "ההדפסה נחתכת",
  "page": "/admin/orders",
  "actor": "owner",
  "createdAt": "2026-10-11T09:00:00+00:00",
  "isHandled": false
}]
```

- `kind`: `Problem` or `Comment`.
- `page`: the admin page (or `/` for the client site) the admin picked; `null` when none.
- `actor`: `owner` or `master`.

### `PUT /api/ops/feedback/{id}`

Body `{ "isHandled": true }`. `204`; `404` for an unknown id. The admin sees "טופל" next to the report.

### `GET /api/ops/features`

Every known feature flag (`FoodSite.Api/Sites/Features.cs`), in that order:

```json
[{ "name": "favorites", "enabled": true, "siteDefault": true, "overridden": false }]
```

- `siteDefault`: what the site's `site.json` says.
- `overridden`: a row in the site's `FeatureFlags` table decides instead of `site.json`.

### `PUT /api/ops/features/{name}`

Body `{ "enabled": false }` turns the feature on or off for this site, whatever `site.json` says; `{ "enabled": null }` removes the override so `site.json` decides again. Answers the feature as `GET` lists it. An unknown name is `404 { code: "unknownFeature" }`. `GET /api/site` (and so the client site) reflects the change on the next request.
