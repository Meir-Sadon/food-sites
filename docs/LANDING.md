# Landing page "מרוויחים ביחד" (`landing/`)

A separate deploy target from the ordering sites: a small Node 22 service (`landing/server.mjs`, one dependency, `pg`) with its own Render service `earn-together-landing` in `render.yaml`. It is not a site (`sites/`), does not use the API or the frontend build, and is not part of the canary rollout in `deploy.yml`; Render deploys it on push to `main`.

Two designs of the same page, to compare which converts: `/b` ("בצד שלך", dark green and yellow) and `/c` ("המנה שלנו", light with gradients). `/` serves `LANDING_VARIANT` (default `b`). Only the hero differs (`content.mjs`); the rest is `page.html`. Each lead stores which variant it came from.

## Offer text
The page shows only the commission offer (4–6% of sales, no setup fee, easy exit), never the fixed monthly plan. Details of the service agreement that are not on the page (monthly cap, advance payment, the 60-day no-sales rule, exit notice period) are deliberately left out until the owner decides to publish them.

## Leads
`POST /api/lead` (needs header `X-Landing-Request: 1`, rate limited, honeypot field). Name and phone are required; business name, type, size (`home`, `small`, `few-branches`, `chain`), website and notes are optional. A lead is saved in the `leads` table (created on start) and mailed. If both channels are configured and both fail the visitor gets an error.

## Environment variables
| Variable | Meaning |
| --- | --- |
| `LEAD_DATABASE_URL` | Neon Postgres connection string (`postgres://...`). Empty: no storage |
| `LEAD_NOTIFY_EMAIL`, `MAIL_FROM` | Recipient and verified sender of the lead mail |
| `BREVO_API_KEY` or `RESEND_API_KEY` | Mail provider (Brevo wins). Empty: no mail |
| `LANDING_PHONE` | Phone shown on the page and used by the WhatsApp button (default 0546359856) |
| `LANDING_VARIANT` | `b` or `c`, what `/` shows |
| `META_PIXEL_ID`, `GOOGLE_ANALYTICS_ID` (`G-…`), `GOOGLE_ADS_ID` (`AW-…`), `GOOGLE_ADS_LEAD_LABEL` | Tracking, each loads only when set. Events: `PageView`, `Lead` on a sent form, `Contact` on WhatsApp or starting the form |

There is no cookie banner, as on the ordering sites (Israeli audience).

## Pictures and videos
Put files in `landing/public/assets/` and list them in `media.json` (see `assets/README.md`): main image or video, explainer video, Meir's photo and a gallery. An empty field keeps a labelled placeholder.

## Local run and tests
`cd landing && npm install && npm start` (port 8080, or `PORT`), `npm test`.
