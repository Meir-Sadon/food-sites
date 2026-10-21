import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLead } from './lead.mjs';
import { createStore } from './store.mjs';
import { sendLeadMail } from './mail.mjs';
import { VARIANT_CONTENT } from './content.mjs';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const env = process.env;
const port = Number(env.PORT ?? 8080);
const defaultVariant = env.LANDING_VARIANT in VARIANT_CONTENT ? env.LANDING_VARIANT : 'b';
const phone = env.LANDING_PHONE ?? '0546359856';
const store = createStore(env.LEAD_DATABASE_URL);
if (store) await store.init();

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };

// Marketing ids come from the environment, validated by shape because they end up inside a script.
const pick = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');
const clientConfig = () => `window.LANDING_CONFIG=${JSON.stringify({
  phone, whatsapp: '972' + phone.replace(/^0/, ''),
  metaPixelId: pick(env.META_PIXEL_ID, /^\d{8,20}$/),
  googleAnalyticsId: pick(env.GOOGLE_ANALYTICS_ID, /^G-[A-Z0-9]{4,15}$/),
  googleAdsId: pick(env.GOOGLE_ADS_ID, /^AW-\d{6,15}$/),
  googleAdsLeadLabel: pick(env.GOOGLE_ADS_LEAD_LABEL, /^[\w-]{4,40}$/),
})};`;

const hits = new Map(); // ip -> timestamps, in memory: one instance is enough here
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 20_000) throw new Error('big'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

async function handleLead(req, res) {
  if (req.headers['x-landing-request'] !== '1') return send(res, 403, { code: 'forbidden' });
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { code: 'tooMany' });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { code: 'invalid' }); }
  if (body.website_url) return send(res, 200, { ok: true }); // honeypot: pretend it worked
  const { lead, errors } = parseLead(body);
  if (errors) return send(res, 400, { code: 'invalid', errors });
  let saved = false;
  try { if (store) { await store.insert(lead); saved = true; } } catch (e) { console.error('lead insert failed', e.message); }
  const mailed = await sendLeadMail(env, lead);
  console.log(`lead received saved=${saved} mailed=${mailed}`);
  // One working channel is enough; if both failed the visitor must know.
  if (!saved && !mailed && (store || env.LEAD_NOTIFY_EMAIL)) return send(res, 503, { code: 'unavailable' });
  send(res, 200, { ok: true });
}

const page = await readFile(new URL('./page.html', import.meta.url), 'utf8');
const render = (variant) => {
  const c = VARIANT_CONTENT[variant];
  return page.replaceAll('{{VARIANT}}', variant).replaceAll('{{BADGE}}', c.badge).replaceAll('{{HEADLINE}}', c.headline)
    .replaceAll('{{SUB}}', c.sub).replaceAll('{{TITLE}}', c.title).replaceAll('{{FONT}}', c.font).replaceAll('{{PHONE}}', phone)
    .replaceAll('{{WA}}', '972' + phone.replace(/^0/, ''));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/api/lead') return await handleLead(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { code: 'method' });
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname === '/config.js') return send(res, 200, clientConfig(), 'text/javascript');
    const v = url.pathname === '/' ? defaultVariant : url.pathname.slice(1);
    if (v in VARIANT_CONTENT) return send(res, 200, render(v), 'text/html');
    const file = join(root, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root)) return send(res, 404, { code: 'notFound' });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=300' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, { code: 'notFound' });
    console.error(e); send(res, 500, { code: 'error' });
  }
}).listen(port, () => console.log(`landing on :${port}, default variant ${defaultVariant}`));
