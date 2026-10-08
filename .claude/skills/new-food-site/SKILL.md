---
name: new-food-site
description: Add a new business to the food-sites platform from its ad, dish photos and contact details - site folder, menu seed, theme, background, Cloudinary pictures, Neon database, Render service and the steps only the owner can do.
---

# Adding a new food site

Use this when someone hands over a business's ad (or menu), dish photos and contact details and asks for a new site. The first site built this way was `sites/cigars-shiraz/` (PR "Add the cigars-shiraz site"); read it as a worked example.

Read `CLAUDE.md` and `sites/_template/README.md` first. The rules that matter most here:
- Everything business-specific goes in `sites/<site-id>/`. Shared code never names the business.
- The repo is public: never commit the business's photos, ad, or secrets. Photos go to Cloudinary.
- Commit and PR text in English, site text in Hebrew.

## 1. Gather the details first

Read the ad, the photos and the message, then ask the owner **once, in one message**, for everything still missing, before creating any files. Offer a default for each item where you can, so a one-word answer works.

| Detail | What you need | Default if they don't care |
| --- | --- | --- |
| **Site name** | The business's display name (Hebrew), and from it the site id (lowercase English letters, digits, dashes) | A name from the ad, e.g. "הסיגרים של שירז" → `cigars-shiraz` |
| **Main contact** | Name, phone, address (or pickup place), email | Email and address left empty |
| **Dishes** | For each: name, a short description, what one unit is (a tray of 50, a kilo, a portion), price, and which photo belongs to it | None for prices: never guess one. A dish without a price waits. |
| **Delivery and pickup** | Delivery cities, delivery fee or terms, pickup place | The ad's wording |
| **Other details** | Opening hours, kashrut (only if the business states it), minimum order, a different Bit/PayBox phone or extra phones for new-order alerts, a business logo if they have one | Empty; Bit/PayBox and alerts go to the main contact's phone; a hand-drawn logo |

Photo file names can mislead (a "beef" photo dusted with sugar was still beef): ask about anything that doesn't add up in the same message. While waiting for answers, work only on what doesn't depend on them (the palette from the ad, the background).

## 2. Site folder (`sites/<site-id>/`)

Copy `sites/_template/` to `sites/<site-id>/` (lowercase letters, digits, dashes) and fill in:

| File | What to put |
| --- | --- |
| `site.json` | `id` = folder name; `serviceCities`; an `emoji`; WhatsApp template names `<id_with_underscores>_order_confirmation` / `_new_order`; `features`; `settings` (below); `seed: ["seed/<name>.json"]` |
| `site.json` → `settings` | Copied into the new database once, on first start: `contactName`, `contactPhone`, `contactAddress` (pickup place), `deliveryFeeText`, `deliveryAreaText`, `kashrutText` (only if the business states it), `backgroundImageUrl`. `check-sites` rejects unknown keys. |
| `theme.css` | Every variable the template defines, in the ad's colours. Keep text dark on a light background. |
| `logo.svg` | A simple round SVG logo drawn by hand (see the existing sites), in the palette. |
| `public/favicon.svg` | A 32x32 version of the logo. |
| `i18n/he.json` | `app.name` and `order.hero.tagline`; override `order.hero.kosher` (a hero badge) when the business makes no kashrut claim. Only keys that exist in `frontend/src/i18n/he.json`. |
| `seed/<name>.json` | Categories and dishes (format: `backend/src/FoodSite.Api/Data/MenuSeed.cs`). A pack sold as one item (50 cigars for 120 ₪) is `sellBy: Units`, `unitPrice: 120`, with the pack size in the name, since the order page shows "₪120 ליחידה" (or set `unitName`, e.g. `"מנה"` → "₪50 למנה"). A daily limit per dish is `maxPerSupplyDate`; a daily limit on all portions together is the admin setting **מנות ליום אספקה** (`Settings.PortionsPerSupplyDate`), set with the business defaults below. A side that is sold on its own and also offered under main dishes is `isSideDish: true` with `addOnOf: ["<main dish name>", ...]`. |

Leave `images` out of the seed unless the pictures are already in Cloudinary (see step 3).

## 3. Pictures (Cloudinary)

All sites share one Cloudinary account; each site's pictures sit under `<site-id>/dishes` and `<site-id>/background`. Give each site its own API key (Cloudinary console → **Settings → API Keys → Generate New API Key**, named after the site id) and use it in that site's `Cloudinary__Url` (`cloudinary://<key>:<secret>@<cloud_name>`). A key can still reach every folder in the account, so this doesn't stop a leaked key from touching other sites' pictures, but it lets that one key be revoked without breaking the other sites, and the console shows which site used which key. The owner creates the key and pastes the URL into Render; the secret never goes in the thread or the repo. A business that needs full isolation gets its own free Cloudinary account; nothing in the code changes.

- **Background**: generate one with the Cloudinary `generate-image` tool (`target.public_id: <site-id>/background/background-1`, 16:9, 2K, jpeg) from a prompt describing a light, low-contrast texture in the ad's palette with an empty centre and no text, and put its `secure_url` in `settings.backgroundImageUrl`. The page shows it with `background-size: cover` behind the content. Don't use stock photos you can't license. You can't preview it from a cloud session, so ask the owner to look at it.
- **Dish photos**: try these in order.
  1. The photos are already at a public HTTPS URL: `upload-asset` with that URL and `folder: <site-id>/dishes`, then add the `secure_url`s to the seed's `images`.
  2. The thread is linked to the owner's computer (the `mcp__remote-devices__` tools work) and the photos are in a folder there: get signed parameters with `sign-upload` (`folder` and `asset_folder` = `<site-id>/dishes`, a `public_id` per photo) and run the `curl` it describes with `device_bash`, which has normal internet access.
  3. Otherwise the owner uploads them from the site's admin after the first deploy: **מנות** → the dish → its pictures (needs `Cloudinary__Url` set on the service).

  What doesn't work from a cloud session: `curl` to `api.cloudinary.com` (blocked by the network policy), and passing a photo to `upload-asset` as a base64 data URI (a 25 KB photo is about 50,000 tokens to read and as many to write back, and one wrong character breaks the image).

## 4. Deploy files

- `render.yaml`: a new service copied from an existing non-canary entry: `name` and `SITE` = the id, `autoDeployTrigger: "off"`, and **no** `Database__ApplySeeds` line (a new site wants its seed).
- `.github/workflows/deploy.yml`: a matrix line `- site: <id>` / `hook: RENDER_DEPLOY_HOOK_<ID_UPPER>`.

## 5. Check it

```bash
node scripts/check-sites.mjs
cd frontend && SITE=<id> npm run build && npm run lint
```

Then look at it: start Postgres (`docker run -d -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=foodsite -p 55432:5432 postgres:17-alpine`), the API with `Site__Directory=<repo>/sites/<id>`, `Jwt__Secret=<32+ chars>`, `ConnectionStrings__Default=Host=localhost;Port=55432;Database=foodsite;Username=postgres;Password=pw`, `Database__MigrateOnStartup=true`, and `SITE=<id> npm run dev`. Check `/api/site` (contact, delivery text, background) and `/api/menu` (the seeded dishes), and take a phone-width Playwright screenshot of `/` to review (install `playwright` in the scratchpad, not the repo). Cloudinary pictures don't load from a cloud session, so the background won't show there.

## 6. PR

One PR with the site folder and the deploy files, on a readable branch. Run `/check` (backend tests need Docker). Watch it to green.

## 7. Database and service

- **Neon**: create a project named after the id, region `aws-eu-central-1`, in the same organization as the other sites (`list_projects` shows it). The API needs the Npgsql form of the connection string (`Host=...;Database=neondb;Username=...;Password=...;SSL Mode=Require`). Never post the password in the thread or the repo; pass it straight to Render.
- **Render** (after the PR is merged, since the service builds from `main`): create it with the Render `create_web_service` tool in the workspace the other sites live in (`list_services` shows them): runtime `docker`, region `frankfurt`, plan `free`, branch `main`, `autoDeploy: no`, and the env vars from `render.yaml`: `SITE`, `ConnectionStrings__Default` (the Neon string in Npgsql form, using the host without `-pooler`), `Jwt__Secret` (a random 48+ character string, e.g. `openssl rand -base64 48`), `Database__MigrateOnStartup=true`, `ForwardedHeaders__Enabled=true`, `AuthCookie__SameSite=Lax`, `PORT=8080`. Creating the service starts the first deploy. The tool can't set the health check path, so the owner sets `/api/health` under the service's **Settings → Health Checks**. Don't also sync the Blueprint, or Render creates a second service.
- **Check the deploy** with `get_deploy` (status `live`) and `list_logs` (type `app`): look for "Site settings defaults applied", "Seeded N dishes" and "Now listening". "No admin password is set" is expected until the owner adds the hash. A `libgssapi_krb5.so.2` error at start is harmless.
- First start migrates the database, applies `settings` and the seed.

- **Business defaults**: once the first deploy is live, apply these in one `run_sql_transaction` on the site's Neon project (they're admin settings, so the owner can change them later):
  - Supply days: every day but Saturday, orders closing at 15:00 the day before.
  - Bit/PayBox phone: the main contact's phone.
  - New-order WhatsApp alerts: the main contact's phone first (in its normalized form, digits only, e.g. `0545776707`).
  ```sql
  UPDATE "SupplyDays" SET "Enabled" = ("Weekday" <> 6), "CutoffDay" = ("Weekday" + 6) % 7, "CutoffTime" = '15:00';
  UPDATE "Settings" SET "PaymentPhone" = "ContactPhone" WHERE "PaymentPhone" IS NULL;
  INSERT INTO "NotifyPhones" ("Phone", "Name") VALUES ('<contact phone, digits only>', '<contact name>') ON CONFLICT ("Phone") DO NOTHING;
  ```
  If the business limits its portions per day across all dishes, also `UPDATE "Settings" SET "PortionsPerSupplyDate" = <n>;`. Use the business's real supply days and cutoff instead of the defaults when it gave them.
  Read the rows back to check them.
- **Admin password**: set it to the default `admin`: run `dotnet run --project backend/src/FoodSite.Api -- hash-password 'admin'` and add the output as the service's `Admin__PasswordHash` with `update_environment_variables`. The owner changes it after signing in, under **הגדרות כלליות** (the password section).

## 8. Tell the owner how to activate the site

End with one reply that gives the site's address and a numbered checklist of exactly what the owner has to do, with where to click. Mark what's required and what's optional, and say which steps Claude does once they answer. Fill in the real names (site id, secret name, address):

1. **Change the admin password** (required): the site is public and the password is `admin`, so anyone who guesses it can see the orders and the clients' phone numbers. Sign in to the admin and change it under **הגדרות כלליות**.
2. **Cloudinary key** (required for pictures): Cloudinary → **Settings → API Keys → Generate New API Key**, named `<site-id>`. Then Render → the `<site-id>` service → **Environment** → add `Cloudinary__Url` = `cloudinary://<key>:<secret>@<cloud_name>` → **Save**.
3. **Health check** (required): Render → the service → **Settings → Health Check Path** → `/api/health`.
4. **Deploy hook** (required for later updates): Render → the service → **Settings → Deploy Hook** → copy. GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**, named `RENDER_DEPLOY_HOOK_<ID_UPPER>`, with the hook as the value.
5. **Sign in to the admin** at `https://<site-id>.onrender.com/admin` and:
   - **Supply days** (check): **הגדרות כלליות → ימי אספקה**. They're set to Sunday to Friday, with orders closing at 15:00 the day before; change them to the business's real days.
   - **Bit/PayBox phone and order alerts** (check): both are the main contact's phone (**הגדרות כלליות** and **אנשי קשר**); add more alert phones there if needed.
   - **Dish photos** (if Claude couldn't upload them): **מנות** → each dish → its pictures.
   - Check the contact (**אנשי קשר**), and the delivery texts and background (**הגדרות כלליות**).
6. **WhatsApp** (optional): `WhatsApp__Token` and `WhatsApp__PhoneNumberId` on the service, plus the two templates named in `site.json` approved in Meta. Without them, order messages are only logged.
7. **Confirm the assumptions**: list what was guessed (name and id, dish descriptions, any dish left out for lack of a price).
