// Captures real screens of a running food site for the promo video.
// Usage: node capture.mjs [baseUrl] [outDir]   (admin user/password: ADMIN_USER / ADMIN_PASS, default admin/admin)
// Dish photos that cannot load are replaced by a neutral placeholder so the shots are never broken.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5000';
const out = process.argv[3] ?? 'out/shots';
mkdirSync(out, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><radialGradient id="g"><stop offset="0" stop-color="#f6e3b4"/><stop offset="1" stop-color="#d9a441"/></radialGradient></defs><rect width="600" height="400" fill="url(#g)"/><circle cx="300" cy="210" r="120" fill="#f3d9a0" stroke="#fff" stroke-width="12"/><circle cx="300" cy="210" r="70" fill="#e9c379"/><circle cx="260" cy="190" r="14" fill="#8a5a1c"/><circle cx="330" cy="230" r="14" fill="#8a5a1c"/><circle cx="310" cy="170" r="12" fill="#6b8e23"/></svg>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5, locale: 'he-IL' });
const p = await ctx.newPage();
await p.route(/res\.cloudinary\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: svg }));
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${name}.png` }); };
const add = async () => {
  await p.getByRole('button', { name: 'הוספה להזמנה' }).first().click();
  await p.waitForTimeout(400);
};

await p.goto(base, { waitUntil: 'networkidle' });
await shot('home');
await p.evaluate(() => window.scrollTo(0, 1250));
await shot('dishes');
// search
await p.evaluate(() => window.scrollTo(0, 0));
await p.fill('input[placeholder*="חיפוש"]', 'חומוס');
await p.waitForTimeout(600);
await p.evaluate(() => window.scrollTo(0, 560));
await shot('search');
await p.fill('input[placeholder*="חיפוש"]', '');
// add-ons
await p.evaluate(() => window.scrollTo(0, 1250));
await add();
await p.getByRole('button', { name: 'הצג התאמת מנות' }).first().click();
await p.locator('summary').filter({ hasText: 'התאמה אישית' }).first().click();
await p.locator('summary').filter({ hasText: 'התאמה אישית' }).first().scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, 330));
await shot('addon');
// +2 pitas to show the counter
const plus = p.getByRole('button', { name: '+' });
await plus.nth(1).click().catch(() => {});
await plus.nth(1).click().catch(() => {});
await shot('addon2');
// cart
await p.evaluate(() => window.scrollTo(0, 0));
await p.locator('.top-bar button, header button').filter({ has: p.locator('svg') }).nth(1).click().catch(() => {});
await p.getByRole('button', { name: /סל|עגלה/ }).first().click().catch(() => {});
await shot('cart');
await p.keyboard.press('Escape');
// order form
await p.locator('text=פרטי ההזמנה').first().scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, -70));
await shot('form');
await p.evaluate(() => window.scrollBy(0, 560));
await shot('form2');
// club
await p.goto(`${base}/login`, { waitUntil: 'networkidle' });
await shot('login');
const phone = p.locator('input[type=tel], input[inputmode=tel], input').first();
await phone.fill('0501234567');
await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
await shot('login2');
await p.goto(`${base}/profile`, { waitUntil: 'networkidle' });
await shot('profile');
await p.goto(`${base}/about`, { waitUntil: 'networkidle' });
await shot('about');
// admin
const user = process.env.ADMIN_USER ?? 'admin', pass = process.env.ADMIN_PASS ?? 'admin';
const a = await ctx.newPage();
await a.route(/res\.cloudinary\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: svg }));
await a.goto(`${base}/admin`, { waitUntil: 'networkidle' });
await a.locator('input').nth(0).fill(user);
await a.locator('input').nth(1).fill(pass);
await a.keyboard.press('Enter');
await a.waitForTimeout(1500);
for (const [path, name] of [['/admin/orders', 'admin-orders'], ['/admin/settings', 'admin-settings'], ['/admin/dishes', 'admin-dishes'], ['/admin/appearance', 'admin-appearance'], ['/admin/popup', 'admin-popup'], ['/admin/usage', 'admin-usage']]) {
  await a.goto(base + path, { waitUntil: 'networkidle' });
  await a.waitForTimeout(700);
  await a.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
