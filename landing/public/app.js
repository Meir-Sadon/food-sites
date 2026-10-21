const cfg = window.LANDING_CONFIG || {};
const variant = document.documentElement.dataset.variant;
const $ = (s) => document.querySelector(s);

// Marketing tools load only with an id (set in the environment).
function track(event, params = {}) {
  try {
    if (window.fbq) window.fbq('track', event === 'Lead' ? 'Lead' : 'Contact', params);
    if (window.gtag) {
      window.gtag('event', event === 'Lead' ? 'generate_lead' : 'contact', params);
      if (event === 'Lead' && cfg.googleAdsId && cfg.googleAdsLeadLabel) window.gtag('event', 'conversion', { send_to: `${cfg.googleAdsId}/${cfg.googleAdsLeadLabel}` });
    }
  } catch { /* tracking must never break the page */ }
}
function load(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.append(s); }
if (cfg.metaPixelId) {
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', cfg.metaPixelId); window.fbq('track', 'PageView');
}
const gaId = cfg.googleAnalyticsId || cfg.googleAdsId;
if (gaId) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  load(`https://www.googletagmanager.com/gtag/js?id=${gaId}`);
  window.gtag('js', new Date());
  if (cfg.googleAnalyticsId) window.gtag('config', cfg.googleAnalyticsId);
  if (cfg.googleAdsId) window.gtag('config', cfg.googleAdsId);
}
document.querySelectorAll('[data-cta^="whatsapp"]').forEach((a) => a.addEventListener('click', () => track('Contact', { method: 'whatsapp' })));

// Media slots: filled from assets/media.json; an empty value keeps the placeholder.
const url = (p) => (/^(https?:)?\/\//.test(p) ? p : '/' + p.replace(/^\//, ''));
const el = (tag, attrs) => Object.assign(document.createElement(tag), attrs);
function video(src, poster) { return el('video', { src: url(src), poster: poster ? url(poster) : '', controls: true, playsInline: true, preload: 'metadata' }); }
function mainVideo(src, poster) {
  if (/youtube\.com\/embed|youtube-nocookie\.com\/embed/.test(src)) return el('iframe', { src, title: 'סרטון הסבר', loading: 'lazy', allowFullscreen: true });
  return video(src, poster);
}
fetch('/assets/media.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m) => {
  const put = (sel, node) => { const box = $(sel); box.replaceChildren(node); box.classList.add('filled'); };
  if (m.heroVideo) put('#heroMedia', Object.assign(video(m.heroVideo, m.heroPoster), { autoplay: true, muted: true, loop: true, controls: false }));
  else if (m.heroImage) put('#heroMedia', el('img', { src: url(m.heroImage), alt: '', fetchPriority: 'high' }));
  if (m.mainVideo) put('#mainVideo', mainVideo(m.mainVideo, m.heroPoster));
  if (m.ownerPhoto) put('#ownerPhoto', el('img', { src: url(m.ownerPhoto), alt: 'מאיר סדון', loading: 'lazy' }));
  if (Array.isArray(m.gallery) && m.gallery.length) {
    const g = $('#gallery');
    g.replaceChildren(...m.gallery.map((i) => (i.type === 'video' ? video(i.src) : el('img', { src: url(i.src), alt: i.alt || '', loading: 'lazy' }))));
    g.hidden = false;
  }
  document.querySelectorAll('#heroMedia video[muted]').forEach((v) => { v.muted = true; });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('#heroMedia video').forEach((v) => { v.pause(); v.controls = true; });
});

// The lead form: name and phone are required, the rest is optional.
const MESSAGES = {
  name: { required: 'כתבו את שמכם' },
  phone: { required: 'כתבו מספר טלפון', invalid: 'מספר הטלפון לא נראה תקין' },
};
const form = $('#leadForm');
const setErr = (field, text) => { $('#' + field + '-err').textContent = text || ''; $('#' + field).toggleAttribute('aria-invalid', !!text); };
let started = false;
form.addEventListener('input', () => { if (!started) { started = true; track('Contact', { method: 'form-start' }); } });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const status = $('#status');
  status.textContent = '';
  setErr('name', data.name.trim() ? '' : MESSAGES.name.required);
  setErr('phone', data.phone.trim() ? '' : MESSAGES.phone.required);
  if (!data.name.trim() || !data.phone.trim()) return (data.name.trim() ? $('#phone') : $('#name')).focus();
  const btn = $('#submit'); btn.disabled = true;
  try {
    const r = await fetch('/api/lead', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-landing-request': '1' },
      body: JSON.stringify({ ...data, variant, source: location.search.slice(0, 200) }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      track('Lead', { content_name: variant });
      form.hidden = true; const t = $('#thanks'); t.hidden = false; t.focus();
      return;
    }
    if (body.errors) {
      for (const f of ['name', 'phone']) setErr(f, body.errors[f] ? MESSAGES[f][body.errors[f]] : '');
      (body.errors.name ? $('#name') : $('#phone')).focus();
    } else status.textContent = r.status === 429 ? 'ניסיתם הרבה פעמים, נסו שוב בעוד כמה דקות.' : 'משהו השתבש. אפשר גם להתקשר או לכתוב בוואטסאפ.';
  } catch { status.textContent = 'אין חיבור. נסו שוב, או התקשרו אליי.'; }
  btn.disabled = false;
});
