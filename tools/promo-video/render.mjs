// Renders video.html to an mp4.
//   node render.mjs --name "<site name>" --clips out/clips --out out/promo.mp4 [--phone .. --contact ..] [--voice voice.mp3] [--fps 30] [--workers 4] [--only 12.5]
// Also writes <out>.srt and <out>.narration.txt (the captions with times) so a narrator can record the voice-over.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdirSync, cpSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const cfgFile = arg('config', path.join(here, 'config.json'));
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const config = { siteName: arg('name', cfg.siteName ?? 'חומוס אל מסרי'), phone: arg('phone', cfg.phone ?? '054-6359856'), contactName: arg('contact', cfg.contactName ?? 'מאיר') };
const work = path.resolve(arg('work', 'out/work')), clipsDir = path.resolve(arg('clips', 'out/clips')), output = path.resolve(arg('out', 'out/promo.mp4'));
const fps = +arg('fps', 30), workers = +arg('workers', 4), only = arg('only', null), voice = arg('voice', null);
mkdirSync(work, { recursive: true }); mkdirSync(path.dirname(output), { recursive: true });
cpSync(path.join(here, 'video.html'), path.join(work, 'index.html'));
mkdirSync(path.join(work, 'fonts'), { recursive: true });
const fontDir = arg('fonts', path.resolve(here, '../../frontend/node_modules/@fontsource/heebo/files'));
for (const w of [400, 700, 900]) for (const sub of ['hebrew', 'latin']) cpSync(path.join(fontDir, `heebo-${sub}-${w}-normal.woff2`), path.join(work, 'fonts', `heebo-${sub}-${w}-normal.woff2`));
// clips: re-encoded all-intra so the page can seek to any frame instantly
mkdirSync(path.join(work, 'clips'), { recursive: true });
const trim = { menu: 1.2, addons: 1.0, cart: 1.0, club: 1.0, admin: 1.0, zones: 0 };
for (const f of readdirSync(clipsDir).filter((f) => f.endsWith('.webm'))) {
  const n = f.replace('.webm', ''), dst = path.join(work, 'clips', f);
  if (!existsSync(dst)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(trim[n] ?? 0), '-i', path.join(clipsDir, f), '-vf', 'crop=390:844:0:0,scale=780:1688:flags=lanczos,unsharp=5:5:0.8', '-c:v', 'libvpx', '-g', '1', '-b:v', '6M', '-crf', '8', '-an', dst]);
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const open = async () => { const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); const p = await ctx.newPage(); await p.addInitScript((c) => { window.CONFIG = c; }, config); await p.goto('file://' + path.join(work, 'index.html')); await p.evaluate(() => document.fonts.ready); await p.evaluate(() => window.ready()); await p.waitForTimeout(300); return p; };
const probe = await open(); const dur = await probe.evaluate(() => window.DURATION);
if (only) { await probe.evaluate((t) => render(t), +only); await probe.waitForTimeout(150); await probe.screenshot({ path: path.join(work, 'frame.png') }); console.log('wrote', path.join(work, 'frame.png')); await browser.close(); process.exit(0); }
// captions -> srt + narration script
const caps = await probe.evaluate(() => window.captions());
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0').replace('.', ',')}`; };
writeFileSync(output.replace(/\.mp4$/, '.srt'), caps.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n'));
writeFileSync(output.replace(/\.mp4$/, '.narration.txt'), caps.map((c) => `[${Math.floor(c.a / 60)}:${String(Math.floor(c.a % 60)).padStart(2, '0')}] ${c.text}`).join('\n') + '\n');
const frames = path.join(work, 'frames'); rmSync(frames, { recursive: true, force: true }); mkdirSync(frames);
const total = Math.round(dur * fps);
await Promise.all(Array.from({ length: workers }, async (_, w) => {
  const p = w === 0 ? probe : await open();
  for (let f = w; f < total; f += workers) { await p.evaluate((t) => render(t), f / fps); await p.screenshot({ path: path.join(frames, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); if (f % 300 === w) console.log('frame', f, '/', total); }
}));
await browser.close();
const music = path.join(work, 'music.wav');
spawnSync('python3', [path.join(here, 'music.py'), String(dur), music], { stdio: 'inherit' });
const inputs = ['-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-i', music];
let audio = ['-map', '0:v', '-map', '1:a'];
if (voice) { inputs.push('-i', path.resolve(voice)); audio = ['-filter_complex', '[1:a]volume=0.35[m];[2:a]volume=1.0[v];[m][v]amix=inputs=2:duration=first:normalize=0[a]', '-map', '0:v', '-map', '[a]']; }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, ...audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-t', String(dur), '-movflags', '+faststart', output], { stdio: 'inherit' });
console.log('done', output);
