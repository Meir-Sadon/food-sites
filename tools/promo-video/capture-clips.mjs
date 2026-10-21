// Records short real interaction clips (webm) of a running food site: node capture-clips.mjs [baseUrl] [outDir] [clip,clip,...]
// Dish photos that cannot load are replaced by sample photos from PHOTOS (a folder of jpgs) or a plain placeholder.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdirSync, readdirSync, readFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
const base = process.argv[2] ?? 'http://localhost:5000';
const out = path.resolve(process.argv[3] ?? 'out/clips');
const only = process.argv[4]?.split(',');
const photosDir = process.env.PHOTOS ?? '/mnt/project-files/house-delicacies/photos';
const photoNames = ['hummus'].filter((n) => existsSync(`${photosDir}/${n}.jpg`));
mkdirSync(out, { recursive: true });
const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#e9c379"/></svg>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const wait = (p, ms) => p.waitForTimeout(ms);

async function newClip(name, { admin = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', recordVideo: { dir: path.join(out, '_tmp'), size: { width: 780, height: 1688 } } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  await p.route(/res\.cloudinary\.com/, (r) => {
    if (!photoNames.length) return r.fulfill({ contentType: 'image/svg+xml', body: fallback });
    let h = 0; for (const c of r.request().url()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return r.fulfill({ contentType: 'image/jpeg', body: readFileSync(`${photosDir}/${photoNames[h % photoNames.length]}.jpg`) });
  });
  // a small touch marker so taps are visible in the recording
  await p.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:99999;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:4px solid #d9a441;background:rgba(217,164,65,.35);pointer-events:none;opacity:0;transition:opacity .25s,transform .25s';
      document.body.appendChild(d);
      addEventListener('pointerdown', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; d.style.opacity = 1; d.style.transform = 'scale(1.4)'; setTimeout(() => { d.style.opacity = 0; d.style.transform = 'scale(1)'; }, 350); }, true);
    });
  });
  return { ctx, p, name };
}
async function done({ ctx, p, name }) {
  const v = p.video(); await ctx.close(); renameSync(await v.path(), path.join(out, name + '.webm')); console.log('clip', name);
}
const scrollTo = async (p, y, ms = 1500) => p.evaluate(([y, ms]) => new Promise((res) => {
  const y0 = scrollY, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, y0 + (y - y0) * e); k < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
}), [y, ms]);
const into = async (p, loc) => { await loc.scrollIntoViewIfNeeded(); await wait(p, 250); };
const clips = {
  async menu() {
    const c = await newClip('menu'); const p = c.p;
    await p.goto(base, { waitUntil: 'networkidle' }); await wait(p, 1200);
    await scrollTo(p, 700, 1600); await wait(p, 500);
    await scrollTo(p, 1500, 2200); await wait(p, 1200);
    await scrollTo(p, 0, 1400); await wait(p, 500);
    await p.locator('input[placeholder*="חיפוש"]').click(); await p.keyboard.type('חומוס', { delay: 220 }); await wait(p, 900);
    await scrollTo(p, 520, 1200); await wait(p, 1800);
    await done(c);
  },
  async addons() {
    const c = await newClip('addons'); const p = c.p;
    await p.goto(base, { waitUntil: 'networkidle' }); await wait(p, 800);
    await scrollTo(p, 1250, 1000); await wait(p, 600);
    await p.getByRole('button', { name: 'הוספה להזמנה' }).first().click(); await wait(p, 900);
    await p.getByRole('button', { name: 'הצג התאמת מנות' }).first().click(); await wait(p, 700);
    await p.locator('summary').filter({ hasText: 'התאמה אישית' }).first().click(); await wait(p, 600);
    await scrollTo(p, await p.evaluate(() => scrollY) + 330, 900); await wait(p, 700);
    const pita = p.getByRole('button', { name: 'הוספה: תוספת פיתה' }), egg = p.getByRole('button', { name: 'הוספה: תוספת ביצה' });
    for (let i = 0; i < 6; i++) { await pita.click({ force: true, timeout: 2000 }).catch(() => {}); await wait(p, 700); }
    await wait(p, 600);
    await egg.click({ force: true, timeout: 2000 }).catch(() => {}); await wait(p, 1600);
    await done(c);
  },
  async cart() {
    const c = await newClip('cart'); const p = c.p;
    await p.goto(base, { waitUntil: 'networkidle' }); await wait(p, 600);
    await scrollTo(p, 1250, 900); await wait(p, 400);
    await p.getByRole('button', { name: 'הוספה להזמנה' }).first().click(); await wait(p, 900);
    await scrollTo(p, 0, 700); await wait(p, 400);
    await p.getByRole('button', { name: /סל|עגלה/ }).first().click(); await wait(p, 2200);
    await p.getByRole('button', { name: /לפרטים ולתשלום/ }).first().click().catch(() => {}); await wait(p, 1400);
    await scrollTo(p, await p.evaluate(() => scrollY) + 450, 1400); await wait(p, 1600);
    await done(c);
  },
  async club() {
    const c = await newClip('club'); const p = c.p;
    await p.goto(`${base}/login`, { waitUntil: 'networkidle' }); await wait(p, 900);
    await p.locator('input').first().click(); await p.keyboard.type('0521234567', { delay: 160 }); await wait(p, 600);
    await p.getByRole('button', { name: 'התחברות' }).last().click(); await wait(p, 2200);
    await p.goto(`${base}/profile`, { waitUntil: 'networkidle' }); await wait(p, 1200);
    await p.getByText('היסטוריית הזמנות').first().scrollIntoViewIfNeeded(); await wait(p, 1500);
    await p.getByRole('button', { name: 'הזמנה חוזרת' }).first().click(); await wait(p, 2600);
    await scrollTo(p, 1250, 1400); await wait(p, 1800);
    await done(c);
  },
  async zones() {
    const c = await newClip('zones'); const p = c.p;
    await p.goto(`${base}/admin`, { waitUntil: 'networkidle' }); await wait(p, 500);
    await p.locator('input').nth(0).fill(process.env.ADMIN_USER ?? 'admin'); await p.locator('input').nth(1).fill(process.env.ADMIN_PASS ?? 'admin'); await p.keyboard.press('Enter'); await wait(p, 1800);
    await p.goto(`${base}/admin/settings`, { waitUntil: 'networkidle' }); await wait(p, 600);
    await p.getByRole('link', { name: 'דמי משלוח לפי אזורים' }).first().click().catch(async () => p.getByText('דמי משלוח לפי אזורים').first().click());
    await wait(p, 1800);
    await scrollTo(p, await p.evaluate(() => scrollY) + 420, 1400); await wait(p, 1000);
    await p.getByRole('button', { name: 'ציור על המפה' }).first().click(); await wait(p, 3500);
    await done(c);
  },
  async admin() {
    const c = await newClip('admin'); const p = c.p;
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${base}/admin`, { waitUntil: 'networkidle' }); await wait(p, 600);
    await p.locator('input').nth(0).click(); await p.keyboard.type(process.env.ADMIN_USER ?? 'admin', { delay: 90 });
    await p.locator('input').nth(1).click(); await p.keyboard.type(process.env.ADMIN_PASS ?? 'admin', { delay: 90 }); await wait(p, 300);
    await p.keyboard.press('Enter'); await wait(p, 2200);
    await scrollTo(p, 420, 1100); await wait(p, 900);
    for (const [label, hold] of [['תצוגה באתר לקוח', 2000], ['עיצוב האתר', 2200], ['הגדרות אתר', 2000], ['דוחות', 1500], ['שימוש באתר', 2200]]) { await p.getByRole('link', { name: label }).first().click().catch(() => {}); await wait(p, hold); }
    await done(c);
  },
};
for (const [n, f] of Object.entries(clips)) if (!only || only.includes(n)) await f();
await browser.close();
