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

### `GET /api/ops/summary?from=&to=&period=&statuses=`

Orders and their totals per period, by **supply date**.

- `from`, `to`: dates, both included. Without them: the first of the month 11 months ago up to today. At most 731 days; `from` after `to` or a longer range is `400` with `from: ["invalidRange"]`. An order for a supply date after `to` is not in the answer, so a console that wants upcoming orders sends a `to` in the future.
- `period`: `Day`, `Week` (Sunday to Saturday) or `Month` (default).
- `statuses`: comma-separated states to count (case-insensitive): `New`, `Confirmed`, `Ready`, `Delivered`, `WaitingApproval` (a delivery outside the service area that the admin has not approved yet) and `Cancelled`. Without it everything but `Cancelled` counts. An unknown name is `400` with `statuses: ["invalid"]`.

```json
{
  "from": "2030-01-01",
  "to": "2030-03-31",
  "period": "Month",
  "orders": 4,
  "sales": 250.00,
  "deliveryFees": 30.00,
  "periods": [
    { "start": "2030-01-01", "orders": 3, "sales": 180.00, "deliveryFees": 30.00 },
    { "start": "2030-02-01", "orders": 1, "sales": 70.00, "deliveryFees": 0 }
  ],
  "statuses": ["New", "Confirmed", "Ready", "Delivered", "WaitingApproval"],
  "byStatus": [
    { "status": "New", "orders": 4, "sales": 250.00 },
    { "status": "Confirmed", "orders": 0, "sales": 0 },
    { "status": "Ready", "orders": 0, "sales": 0 },
    { "status": "Delivered", "orders": 0, "sales": 0 },
    { "status": "WaitingApproval", "orders": 0, "sales": 0 },
    { "status": "Cancelled", "orders": 0, "sales": 0 }
  ]
}
```

`sales` is the sum of the orders' totals in shekels, delivery fees included; `deliveryFees` (on the whole range and on each period) is the part of `sales` that is delivery fees, so a console can charge a commission on the dishes only. Periods with no orders are left out. `orders`, `sales` and `periods` count only the asked-for `statuses`; `byStatus` always lists every state in that order for the whole range, so a console can show cancelled orders next to the rest. (Before `statuses` existed, orders waiting for approval were left out of the counts.)

### `GET /api/ops/cancellations?from=&to=`

The cancelled orders with the admin's cancellation reason and the order's general details, so the console can check cancellations (no sales commission is charged on them). By **supply date**, newest first, at most 500 listed (`orders` and `total` count all of them in the range).

- `from`, `to`: dates, both included. Without them: the first of the month 11 months ago up to today. Same limits as `summary` (`from: ["invalidRange"]`).
- The admin must give a reason to cancel an order (`PUT /api/admin/orders/{id}/status` with `status: "Cancelled"` is `400` with `cancelReason: ["required"]` without one). An order cancelled before this was required has `reason` and `cancelledAt` `null`.

```json
{
  "from": "2030-01-01",
  "to": "2030-12-31",
  "orders": 1,
  "total": 80.00,
  "cancellations": [{
    "orderId": 42,
    "reason": "הלקוח התקשר",
    "cancelledAt": "2030-01-05T09:00:00+00:00",
    "orderedAt": "2030-01-04T18:30:00+00:00",
    "supplyDate": "2030-01-06",
    "deliveryHour": "12:00:00",
    "clientName": "דנה כהן",
    "phone": "0501234567",
    "fulfillmentMethod": "Delivery",
    "address": "אשקלון",
    "paymentMethod": "Cash",
    "isPaid": false,
    "total": 80.00,
    "deliveryFee": 10.00,
    "items": [{ "dishName": "קוסקוס", "optionLabel": null, "quantity": 2, "lineTotal": 70.00 }]
  }]
}
```

- `address` is `null` for a pickup. `total` includes the delivery fee, like `summary`'s `sales`.

### `GET /api/ops/usage?from=&to=`

How the client site is used: the numbers on the admin's **שימוש באתר** page, as `UsageReportDto` (`Controllers/Admin/UsageReportController`).

- `from`, `to`: dates in the site's time zone, both included. Without them: the last 30 days up to today. `from` after `to` or more than 366 days is `400` with `from: ["invalidRange"]`.

```json
{
  "from": "2030-01-01",
  "to": "2030-01-30",
  "approximate": false,
  "keptSince": "2029-10-03",
  "totalDevices": 120,
  "funnel": { "visitors": 90, "newVisitors": 40, "started": 25, "submitted": 12 },
  "registered": { "total": 55, "new": 6 },
  "orders": {
    "orders": 12, "sales": 960.00, "averageOrder": 80.00,
    "customers": 10, "returningCustomers": 3, "newCustomerOrders": 7, "returningCustomerOrders": 5
  },
  "days": [{ "day": "2030-01-01", "visitors": 3, "started": 1, "submitted": 1, "orders": 1 }],
  "ordersByWeekday": [0, 2, 1, 3, 2, 4, 0],
  "ordersByHour": [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 1, 0, 0, 0, 2, 3, 0, 0, 0, 0, 0, 0],
  "topDishes": [{ "dishName": "קוסקוס", "quantity": 20, "sales": 800.00 }]
}
```

- Visitors, started and submitted count devices (a random id the browser keeps), not people. `approximate` is `true` when the range starts before `keptSince`: older days only keep daily counts, so a device seen on several of them counts more than once.
- `orders` counts non-cancelled orders by the day they were **sent** (not their supply date); `registered.total` is every client account, `new` those made in the range.

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
