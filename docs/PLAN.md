# הקוסקוס של אמא — project plan

Oct 4, 2026 · @Meir

A Hebrew ordering website where clients order admin-configured dishes for configured supply days, with a password-protected admin area for your mam.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Language | Hebrew only at launch, right-to-left. Texts kept in language files so Arabic can be added later. |
| Login | Phone number only, with no verification code. Guests enter their phone when ordering. |
| Registration | Optional. Phone, full name and address are required; email, birthday and ethnic background are optional. |
| Delivery or pickup | The client chooses. No range check: if the address is out of range or a fee applies, the admin calls the client. |
| Payment | Pay on delivery, or manual Bit/PayBox transfer to the number in General settings. Admin marks orders as paid. |
| Notifications | WhatsApp to the client and to every phone on the admin's list, at about 2 agorot per message. |
| Cancel or edit an order | By phone call only. The site shows the main contact number. |
| Daily capacity | Not needed for now. |
| Admin access | One admin password, on a separate URL. |
| Domain | Paid domain; hosting on free tiers. |

## Client site

The site opens on the Order page. A constant top bar holds five buttons: Order (home), Login/Register, Recommendations, Profile and About. The About page carries the kashrut text. The layout is mobile-first, since most clients will order from a phone.

### Order page

- Dishes are grouped by category. All categories start open and each can be collapsed.
- Each dish shows a picture, name, short description, price, and kashrut and allergen text when the admin filled them in. Several pictures rotate as a carousel every 4–5 seconds.
- Choosing a dish shows only what is needed: the weight or unit option (default preselected), then its add-ons with a quantity each.
- Dishes marked "add-on only" never appear as standalone dishes.
- The order total stays visible at all times in a bar fixed to the bottom of the screen.
- Supply day: the client picks from the next open dates that match the admin's supply days, cutoff and closed dates.
- Delivery or pickup choice, and an optional notes field.
- Guests enter phone and address, and the order goes through. Logged-in users have these prefilled.
- Logged-in users see "Last order" and "Favorites" buttons that fill the whole order in one click. Dishes or options that no longer exist are skipped, with a short notice.
- A "Reset order" button returns everything to the defaults.
- Payment choice: pay on delivery, or Bit/PayBox transfer. The sentence "התשלום יבוצע במעמד מסירת המשלוח" appears above the Submit button when pay on delivery is selected.
- After submit, a success popup shows the order summary and the client gets the details by WhatsApp.
- Leaving the page with an order in progress asks whether to save it. A saved draft is kept in the browser and restored on return.

### Login / Register

- Login shows one field, the phone number, and a Register button below it.
- Register asks for phone, full name and address (required), and email, birthday (date picker) and ethnic background (optional).

### Recommendations

- A logged-in user can write a suggestion for a new dish or anything else. Guests see a prompt to log in.

### Profile

- Personal details, all editable. The phone number can be changed.
- Order history with supply dates and status, a "Reorder" button, and "Save as favorite" with a name.
- The user's own recommendations.

### On every page

- Footer with the main contact details, privacy policy and accessibility statement.
- Accessibility to Israeli Standard 5568 (WCAG 2.0 AA): keyboard navigation, screen-reader labels, contrast, and a pause control on the carousel.

## Admin

The admin area sits on a separate URL, opens with one password, and is in Hebrew only. Every change shows on the client site immediately.

| Tab | What the admin does there |
| --- | --- |
| General settings | Main background picture. Supply days (a checkbox per weekday). Order cutoff per supply day (for example, Friday orders close Wednesday 20:00). Closed dates for holidays and vacations. Delivery and pickup on or off, with free text for delivery area and fee. Kashrut text. Bit/PayBox phone number. |
| Categories | Add, rename, reorder and remove categories. Only a name is needed; the id is automatic. |
| Dishes | Add, edit and remove dishes: name, category, pictures, short description (up to 254 characters), allergen info, sell by units or weight, fixed options or free choice, add-on links, "add-on only" flag, and a "sold out" toggle. |
| Orders | Orders by supply day with status (new, confirmed, ready, delivered, cancelled) and paid or not. A printable cooking summary per day: total of each dish and option. Cancel or edit an order after a client calls. |
| Contacts | Main contact: name, phone, and optional address, email and opening hours. A list of phone numbers that get a WhatsApp for every new order. |
| Recommendations | Read what users wrote and mark items as handled. |
| Statistics and reports | Dishes sold and total sales per week, with filters by date range, dish, category and payment method. Export to Excel. |

Removing or editing a dish that appears in orders not yet supplied shows a warning popup with the number of affected orders. The admin decides whether to proceed.

## Order rules

### Add-ons

- An add-on is a regular dish linked to other dishes. On each dish's admin form, the admin sees a checkbox for every other dish.
- Ticking A and B on dish C makes C appear as an add-on under A and under B on the order page.
- The "add-on only" flag hides the dish from the standalone list, so it can only be ordered with a parent dish.
- The client chooses a quantity for each add-on. The add-on's price is its own configured price, for example שוק at 10 ₪ and ירך at 12 ₪.

### Units and weight

- Fixed options: the admin defines at least one option with a price. With several options, the admin picks the default; with one, it is the default.
- Free choice: the admin defines the minimum, the maximum and the price per unit or per kilo. The client picks any amount in that range.

### Supply days

- The client can only pick dates that fall on a ticked weekday, are before that day's cutoff, and are not a closed date.

### Prices and history

- Each order line saves the dish name, option and price at order time. Later price changes do not touch past orders, statistics or history.
- A removed dish is hidden, not erased, so old orders still display correctly.
- Reorder and favorites use current prices, and skip items that no longer exist.

## Messages and payment

All messages go through WhatsApp's official business API, which charges per delivered template message ([Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing)). For Israeli numbers the rate is roughly 2 agorot per message; the exact figure will be confirmed at setup.

| Message | Sent to | When |
| --- | --- | --- |
| Order confirmation with details and total | Client | Order submitted |
| New order with details and total | Every phone on the admin's list | Order submitted |

- Setup needs a Meta business account, a phone number not already used in the regular WhatsApp app, and Meta's approval of the two message templates.
- If a WhatsApp message fails, the order is still saved and appears in the admin Orders tab.

### Payment

- Pay on delivery is the default.
- Bit/PayBox: after submit, the client sees the total and the phone number to transfer to. The admin marks the order as paid when the money arrives.
- Automatic Bit or card payment needs a paid clearing company. It can be added later without changing the order flow.

## Data model

The database has 14 tables. Order lines copy names and prices, so they never depend on the current dish state.

| Table | Main fields |
| --- | --- |
| Settings | Background picture, cutoff rules, delivery and pickup settings, kashrut text, Bit/PayBox phone, admin password (hashed) |
| SupplyDays | Weekday, enabled, cutoff day and hour |
| ClosedDates | Date, reason |
| Categories | Id (auto), name, display order |
| Dishes | Name, category, description, allergen info, sell by (units or weight), choice mode (fixed or free), min, max, unit price, add-on only, sold out, hidden |
| DishImages | Dish, image URL, display order |
| DishOptions | Dish, label, amount, price, is default |
| DishAddOns | Parent dish, add-on dish |
| Users | Phone, full name, address, email, birthday, ethnic background |
| Orders | User (empty for guests), phone, name, address, supply date, delivery or pickup, notes, payment method, paid, status, total, created at |
| OrderItems | Order, dish, parent item (for add-ons), dish name, option label, quantity or weight, unit price, line total |
| FavoriteOrders | User, name, saved items |
| Recommendations | User, text, created at, handled |
| NotifyPhones | Phone, name |

The main contact lives in Settings.

## Technology and hosting

The site is three parts: a React frontend, a C# API and a PostgreSQL database, plus an image store and WhatsApp. Hosting candidates below are from memory and their free tiers will be checked again before deployment.

| Part | Technology | Hosting candidate |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite, i18next, right-to-left layout | Free static hosting such as Cloudflare Pages or Vercel |
| Backend | ASP.NET Core Web API (C#), Entity Framework Core, in a Docker container | A free container tier such as Render, or Azure App Service free tier |
| Database | PostgreSQL | A free managed tier such as Neon or Supabase |
| Images | Uploaded from admin, resized automatically | Cloudinary free tier |
| Messages | WhatsApp Cloud API | Meta, paid per message |
| Domain | Paid domain, HTTPS included by the hosts | Registrar of your choice |

- Free backend tiers often sleep when idle, so the first visit after a quiet period can take 30–60 seconds. A paid tier of a few dollars a month removes this if it bothers clients.
- Security: phone-only client login (no code), signed session tokens, hashed admin password, HTTPS everywhere, rate limits on login and ordering, server-side validation of every price and date.
- Code quality: one Git repository with frontend and backend folders, database migrations, automated tests for price and date rules, and automatic deployment on every approved change.
- Privacy: a privacy policy page, minimal data collection, and user data visible only to its owner and the admin.

## Build phases

The work runs in six phases, each ending with something you can try. WhatsApp setup starts in phase 1 because Meta's approval can take days.

1. **Foundation.** Project setup, database and migrations, admin login. Start the Meta business account and template approval in parallel.
2. **Admin catalog.** General settings, categories, dishes with pictures, options and add-on links.
3. **Order page.** Categories, dish selection, add-ons, supply day, total bar, reset, draft saving, guest ordering and the success popup. The admin Contacts tab (main contact and the WhatsApp notification list), so the contact phone is on the site before clients order. Messages are simulated until WhatsApp is approved.
4. **Accounts.** Phone login, registration, profile, order history, last order, favorites and recommendations.
5. **Operations.** Admin Orders tab, cooking summary, dish-change warning, real WhatsApp messages, statistics and reports.
6. **Launch.** Accessibility review, privacy policy and accessibility statement, testing on phones, deployment, domain connection, and a walkthrough for your mam.

You approve the site after phase 5 on a test address. Phase 6 puts it on the real domain.

## Open items

- [ ] A phone number for the business WhatsApp that is not used in the regular WhatsApp app
- [ ] A Meta business account in your mam's name (I will guide you through it)
- [ ] The domain name you want to buy
- [ ] The main background picture and dish pictures
- [ ] The first menu: categories, dishes, options, prices and add-ons
- [ ] Supply days and the cutoff time for each
- [ ] Kashrut text and allergen info
- [ ] Privacy policy wording, ideally checked by someone with legal knowledge
- [ ] Expected number of orders per week, once known, to confirm the free tiers are enough
