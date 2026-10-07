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

## 1. Read the inputs

From the ad and the person's message, write down before touching files:
- **Dishes**: name, what one unit is (e.g. a tray of 50), price. Prices come from the ad only; never guess a price. A photo of a dish with no price in the ad is a question for the owner, not a dish.
- **Contact**: name, phone, pickup address or area.
- **Service cities** (delivery area) and delivery terms (e.g. "משלוח בתוספת תשלום").
- **Palette**: two or three colours from the ad (background, main accent, highlight).
- **Business name**: if none is given, derive one (e.g. "הסיגרים של שירז") and an id from it, and say so in the reply so the owner can rename it.

Photo file names can mislead (a "beef" photo dusted with sugar was still beef): trust the owner's file names over your own reading, and ask once if something doesn't add up.

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
| `seed/<name>.json` | Categories and dishes (format: `backend/src/FoodSite.Api/Data/MenuSeed.cs`). A pack sold as one item (50 cigars for 120 ₪) is `sellBy: Units`, `unitPrice: 120`, with the pack size in the name, since the order page shows "₪120 ליחידה". |

Leave `images` out of the seed unless the pictures are already in Cloudinary (see step 3).

## 3. Pictures (Cloudinary)

Pictures live in the shared Cloudinary account under `<site-id>/dishes` and `<site-id>/background`.

- **Background**: generate one with the Cloudinary `generate-image` tool (`target.public_id: <site-id>/background/background-1`, 16:9, 2K, jpeg) from a prompt describing a light, low-contrast texture in the ad's palette with an empty centre and no text, and put its `secure_url` in `settings.backgroundImageUrl`. The page shows it with `background-size: cover` behind the content. Don't use stock photos you can't license.
- **Dish photos**: cloud sessions can't reach `api.cloudinary.com` (the network policy blocks it), so `sign-upload` + `curl` fails, and pasting photos as base64 data URIs into `upload-asset` isn't reliable. Unless the photos are already at a public HTTPS URL (then use `upload-asset` with `folder: <site-id>/dishes` and add the `secure_url`s to the seed's `images`), the owner adds them from the site's admin after the first deploy: **Admin → Dishes → the dish → Pictures**. Say so in the hand-off list.

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

## 8. What only the owner can do

List these in one reply:
1. **Admin password**: pick one, run `dotnet run --project backend/src/FoodSite.Api -- hash-password '<password>'` (or the Docker variant in `docs/DEPLOY.md`), and paste the hash as the service's `Admin__PasswordHash`.
2. **Render**: paste `Cloudinary__Url` (the same value as the other sites; Claude can't read it) and set the health check path to `/api/health`, then add the service's deploy hook (**Settings → Deploy Hook**) as the GitHub secret named in `deploy.yml`.
3. **Dish photos**, if they couldn't be uploaded: Admin → Dishes → each dish → Pictures.
4. **Supply days**: Admin → supply days (the order page says there are no open dates until they're set).
5. **WhatsApp** (optional): `WhatsApp__Token`, `WhatsApp__PhoneNumberId`, and the two templates named in `site.json` approved in Meta; without them messages are only logged.
6. Anything assumed: the business name and id, dish descriptions, and any dish left out for lack of a price.
