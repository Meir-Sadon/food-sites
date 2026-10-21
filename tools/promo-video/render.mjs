// Renders video.html to an mp4: node render.mjs --name "<site name>" --phone "054-6359856" --contact "מאיר" --shots out/shots --out out/promo.mp4 [--fps 30] [--workers 4] [--only 12.5]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdirSync, cpSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const cfgFile = arg('config', path.join(here, 'config.json'));
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const config = { siteName: arg('name', cfg.siteName ?? 'חומוס אל מסרי'), phone: arg('phone', cfg.phone ?? '054-6359856'), contactName: arg('contact', cfg.contactName ?? 'מאיר'), shots: 'shots/' };
const work = path.resolve(arg('work', 'out/work')); const shots = path.resolve(arg('shots', 'out/shots')); const output = path.resolve(arg('out', 'out/promo.mp4'));
const fps = +arg('fps', 30), workers = +arg('workers', 4), only = arg('only', null);
mkdirSync(work, { recursive: true });
cpSync(path.join(here, 'video.html'), path.join(work, 'index.html'));
mkdirSync(path.join(work, 'fonts'), { recursive: true });
const fontDir = arg('fonts', path.resolve(here, '../../frontend/node_modules/@fontsource/heebo/files'));
for (const w of [400, 700, 900]) for (const sub of ['hebrew', 'latin']) cpSync(path.join(fontDir, `heebo-${sub}-${w}-normal.woff2`), path.join(work, 'fonts', `heebo-${sub}-${w}-normal.woff2`));
cpSync(shots, path.join(work, 'shots'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const open = async () => { const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); const p = await ctx.newPage(); await p.addInitScript((c) => { window.CONFIG = c; }, config); await p.goto('file://' + path.join(work, 'index.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500); return p; };
const probe = await open(); const dur = await probe.evaluate(() => window.DURATION);
if (only) { await probe.evaluate((t) => render(t), +only); await probe.waitForTimeout(100); await probe.screenshot({ path: path.join(work, 'frame.png') }); console.log('wrote', path.join(work, 'frame.png')); await browser.close(); process.exit(0); }
const frames = path.join(work, 'frames'); rmSync(frames, { recursive: true, force: true }); mkdirSync(frames);
const total = Math.round(dur * fps);
await Promise.all(Array.from({ length: workers }, async (_, w) => {
  const p = w === 0 ? probe : await open();
  for (let f = w; f < total; f += workers) { await p.evaluate((t) => render(t), f / fps); await p.screenshot({ path: path.join(frames, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); if (f % 300 === w) console.log('frame', f, '/', total); }
}));
await browser.close();
const music = path.join(work, 'music.wav');
spawnSync('python3', [path.join(here, 'music.py'), String(dur), music], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-i', music, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', output], { stdio: 'inherit' });
console.log('done', output);
