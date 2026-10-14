# Publishing the site (free hosting)

Each site (a folder under `sites/`) runs as **its own free Render web service**, built from the `Dockerfile` at the repo root with that folder as `SITE`, and listed in `render.yaml`. Each site has **its own free Neon database** and its own secrets; pictures go to a **free Cloudinary** account.

When you're done, a site lives at an address like `https://kuskus-shel-ima.onrender.com`, with HTTPS included. A real domain can be connected later (see the end of this guide).

## How a merge reaches the sites

1. CI runs on `main` (tests, migrations check, and a production image per site).
2. `.github/workflows/deploy.yml` deploys the **canary** (the first service in `render.yaml`) at that commit through its Render **deploy hook**.
3. It waits until the canary's `/api/health` reports the new commit, then deploys every other site at the same commit through its deploy hook. If the canary never comes up, the others keep running the previous version.

The workflow needs, in GitHub **Settings → Secrets and variables → Actions**:
- variable `CANARY_URL`: the canary's address, e.g. `https://kuskus-shel-ima.onrender.com`
- secret `RENDER_DEPLOY_HOOK_CANARY`: the canary's deploy hook (Render: service → **Settings → Deploy Hook**)
- one secret per other site with its deploy hook, named in the workflow's matrix, e.g. `RENDER_DEPLOY_HOOK_GRAPE_LEAVES`

Every service has Render's **Auto-Deploy** set to Off. With "After CI checks pass", Render would also wait for the Deploy workflow's own check, which waits for Render, so nothing would deploy.

Migrations run on each site's start, so a migration must work with the code before it: add columns as nullable or with defaults, and drop old ones only in a later release (expand, then contract).

## Adding a site

The `new-food-site` skill (`.claude/skills/new-food-site/SKILL.md`) walks through all of it, from the business's ad and photos.

1. Its folder under `sites/` (copy `sites/_template/`), with the main contact and other starting settings in `site.json` → `settings`.
2. A service entry in `render.yaml` with `SITE` set to the folder, `autoDeployTrigger: "off"` and no `Database__ApplySeeds` (a new site wants its seed menu), a line in the matrix of `.github/workflows/deploy.yml`, and its id in `.github/keep-alive-sites.txt` if it should be kept awake (see below).
3. A Neon project and the service's secrets (steps 1 to 4 below), and the deploy hook secret.

Before adding a third site, check the free tiers: free Render services share a monthly allowance of instance hours, and Neon limits the number of free projects.

## Keeping sites awake

A free Render service sleeps after 15 minutes without a request, and the next visitor waits about a minute for it to start. `.github/workflows/keep-alive.yml` asks `/api/health` (no database) every 25 minutes, **between 09:00 and 21:00 Israel time**, of the sites listed in `.github/keep-alive-sites.txt` (one site id per line; a site not listed there is never pinged). A ping every 25 minutes is longer than Render's 15-minute idle limit, so a listed site still sleeps between pings and a visitor who arrives in that gap waits about a minute. The job cuts the hours a listed site uses; it does not keep the site always awake. A site that doesn't answer fails the run, which GitHub emails about. The hours are `START_HOUR` and `END_HOUR` in the workflow; **Actions → Keep sites awake → Run workflow** pings the listed sites at any hour.

- A listed site is awake about 15 minutes after each ping, roughly 7 to 8 hours a day, so about 230 of the workspace's **750 free instance hours a month**, shared by all free services. When they run out, Render suspends every free service until the next month. So list only what the hours cover (about three sites, less the hours the other sites use when visitors wake them), or move the sites that must answer at once to a paid plan (which never sleeps and needs no keep-alive).
- GitHub runs scheduled workflows late at busy times, sometimes by more than 15 minutes, so a site can still fall asleep now and then.
- GitHub turns a schedule off after 60 days without a commit to the repository. Turn it back on under **Actions → Keep sites awake → Enable workflow**.

## Before you start

- The `render.yaml` file has to be on the `main` branch. Merge the pull request that adds it first.
- You need: a GitHub login, and an email address for Neon and Cloudinary. You don't need a credit card.

## 1. Database: Neon

1. Sign up at https://neon.tech (signing in with GitHub works).
2. Create a project per site, named after its service (e.g. `kuskus-shel-ima`). Region: **AWS Europe Central (Frankfurt)**, which is closest to Israel and to the Render server.
3. On the project dashboard, click **Connect**. You get a connection string like this:
   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. The API needs that string in a different format. Take the parts from it and fill them in here:
   ```
   Host=ep-cool-name-123456.eu-central-1.aws.neon.tech;Database=neondb;Username=neondb_owner;Password=AbC123xyz;SSL Mode=Require
   ```
   This is your **connection string**. Keep it private.

## 2. Pictures: Cloudinary (you can skip this for now)

1. Sign up at https://cloudinary.com.
2. On the dashboard, copy the **API environment variable**. It looks like `cloudinary://123456:abcDEF@your-cloud-name`. Copy it without the `CLOUDINARY_URL=` part in front.

Without it the site still works, but the admin area can't upload pictures.

## 3. Admin password hashes

Each site has two admins: the business owner, and you as the master admin, with the same user name and password on every site. Passwords are never stored as plain text, only as hashes. Create one for the owner's first password, and (once, for all sites) one for your master password, in either of these ways:

- With .NET installed: `cd backend && dotnet run --project src/FoodSite.Api -- hash-password '<your password>'`
- With Docker: `docker build --build-arg SITE=kuskus-shel-ima -t kuskus . && docker run --rm kuskus hash-password '<your password>'`

Copy the line it prints (it starts with `AQAAAA`).

Pick a long passphrase for the master password (four or five random words). The same password opens every site, so if it leaks, every site is open until you change it.

## 4. Hosting: Render

1. Sign up at https://render.com with **GitHub**, and let Render see the `food-sites` repository.
2. Click **New → Blueprint**, pick the repository, and keep the `main` branch.
3. Render reads `render.yaml` and asks, per service, for these values:

   | Setting | What to paste |
   | --- | --- |
   | `ConnectionStrings__Default` | The connection string from step 1 |
   | `Admin__PasswordHash` | The owner's hash from step 3 |
   | `Admin__MasterUsername` | Your master user name, the same on every site |
   | `Admin__MasterPasswordHash` | Your master hash from step 3, the same on every site |
   | `Cloudinary__Url` | The Cloudinary value from step 2, or leave it empty |
   | `WhatsApp__Token`, `WhatsApp__PhoneNumberId` | From Meta's WhatsApp Cloud API, or leave both empty (messages are only logged) |
   | `Sms__Username`, `Sms__Token`, `Sms__Source` | From a TextMe account (textme.co.il): user name, API token, and the verified sender name the client sees (up to 11 English letters or digits). All three set turns on an SMS order confirmation to the client; empty: SMS is only logged. Optional `Sms__ConfirmationTemplate`: this site's text, with `{siteName} {name} {orderId} {date} {time} {method} {total}` |
| `Mail__ResendApiKey` | A Resend API key (resend.com, free: about 100 mails a day), or leave it empty (no mail to the owner). Optional `Mail__From`: the sender address, `onboarding@resend.dev` by default, which Resend lets send only to your own Resend account address; to mail the business owner at another address, verify a domain in Resend and set e.g. `Mail__From=orders@your-domain.com` |

   Render generates the login-signing secret (`Jwt__Secret`) itself. The `SITE` value in `render.yaml` picks the folder under `sites/` the service is built from; Render passes it to the `Dockerfile` as a build argument.
4. Click **Apply**. The first build takes about 5–10 minutes. When the service shows **Live**, open the address shown at the top of the service page.
5. Check that the admin area works: go to `/admin` and sign in with your master user name and password, then with `admin` and the owner's password.

## Good to know

- **Sleeping:** a free Render service goes to sleep after 15 minutes with no visitors. The next visit wakes it up, which takes about a minute. After that it's fast again.
- **Changing a setting:** on Render, open the service, then **Environment**, then edit the value and save. The service restarts by itself.
- **Changing the owner's password:** the owner changes it in the admin, under **הגדרות כלליות**. If they forgot it, sign in as the master and set a new one in the same place.
- **Master admin:** to add it to a site or change its password, open each service on Render, then **Environment**, and set `Admin__MasterUsername` and `Admin__MasterPasswordHash` (a new hash from step 3). Use the same two values on every service. Sessions already open stay open until they expire (12 hours).
- **Who changed what:** the admin's **יומן שינויים** tab lists every change and login, with whether the master or the owner made it.
- **Logs:** if something breaks, open the service on Render and look at **Logs**.

## Later: your own domain

1. Buy the domain from any registrar (for example `kuskus.co.il`).
2. On Render, open the service, then **Settings → Custom Domains**, and add the domain.
3. Render shows the DNS records to add at your registrar. HTTPS is set up automatically once they work.
