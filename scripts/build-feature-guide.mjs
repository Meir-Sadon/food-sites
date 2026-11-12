#!/usr/bin/env node
// Builds the feature guide as ONE self-contained HTML file (styles, script and screenshots inlined, topics as pages
// inside it) from docs/food-sites-feature-guide.html and docs/feature-guide/. The source stays one file per topic;
// the production image runs this and the API serves the result to a signed-in admin (GET /api/admin/guide).
//   node scripts/build-feature-guide.mjs <output file>
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const SCRIPT = `(function(){
var lang='he',KEY='food-sites-guide-lang';
function store(v){try{if(v)localStorage.setItem(KEY,v);else return localStorage.getItem(KEY)}catch(e){}return null}
function filterPage(pg){
  var inp=pg.querySelector('[data-search]'),q=(inp?inp.value:'').toLocaleLowerCase().trim(),n=0;
  [].forEach.call(pg.querySelectorAll('.feature,.card'),function(c){var show=!q||c.textContent.toLocaleLowerCase().indexOf(q)>-1;c.classList.toggle('hidden',!show);if(show)n++});
  var cnt=pg.querySelector('.count');if(cnt)cnt.textContent=q?(lang==='he'?'נמצאו '+n:n+' found'):'';
  var none=pg.querySelector('.no-results');if(none)none.hidden=n>0||!q;
  [].forEach.call(pg.querySelectorAll('.card details'),function(d){d.open=!!q&&!d.parentNode.classList.contains('hidden')});
}
function setLanguage(l){
  lang=l;document.documentElement.lang=l;document.documentElement.dir=l==='he'?'rtl':'ltr';
  [].forEach.call(document.querySelectorAll('[data-en][data-he]'),function(e){e.textContent=e.dataset[l]});
  ['placeholder','aria-label','alt'].forEach(function(a){[].forEach.call(document.querySelectorAll('[data-'+a+'-'+l+']'),function(e){e.setAttribute(a,e.getAttribute('data-'+a+'-'+l))})});
  [].forEach.call(document.querySelectorAll('[data-lang]'),function(b){b.setAttribute('aria-pressed',String(b.dataset.lang===l))});
  document.title=l==='he'?'Food Sites — מדריך היכולות לעסק':'Food Sites — Feature guide';
  store(l);[].forEach.call(document.querySelectorAll('.page'),filterPage);
}
[].forEach.call(document.querySelectorAll('[data-lang]'),function(b){b.addEventListener('click',function(){setLanguage(b.dataset.lang)})});
document.addEventListener('input',function(e){if(e.target.matches('[data-search]'))filterPage(e.target.closest('.page'))});
var pr=document.querySelector('#print');if(pr)pr.onclick=function(){window.print()};
var dlg=document.querySelector('#lightbox'),cur=0;function shots(){return [].slice.call(document.querySelectorAll('.page:not([hidden]) .shot'))}
function show(i){var s=shots();if(!s.length)return;cur=(i+s.length)%s.length;var im=s[cur].querySelector('img');dlg.querySelector('img').src=im.src;dlg.querySelector('img').alt=im.alt;dlg.querySelector('.lb-cap').textContent=im.alt}
document.addEventListener('click',function(e){var b=e.target.closest('.shot');if(b){show(shots().indexOf(b));dlg.showModal()}});
dlg.querySelector('.lb-close').onclick=function(){dlg.close()};dlg.querySelector('.lb-prev').onclick=function(){show(cur-1)};dlg.querySelector('.lb-next').onclick=function(){show(cur+1)};
dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close()});
dlg.addEventListener('keydown',function(e){if(e.key==='ArrowLeft')show(cur+(document.dir==='rtl'?1:-1));if(e.key==='ArrowRight')show(cur+(document.dir==='rtl'?-1:1))});
var io=null;
function route(){
  var h=decodeURIComponent(location.hash.slice(1))||'home',p=h.split('/'),slug=p[0],id=p[1];
  var pg=document.getElementById('page-'+slug);if(!pg){slug='home';id=null;pg=document.getElementById('page-home')}
  [].forEach.call(document.querySelectorAll('.page'),function(x){x.hidden=x!==pg});
  var tg=id&&document.getElementById(id);
  if(tg){tg.scrollIntoView()}else{window.scrollTo(0,0)}
  var links=[].slice.call(pg.querySelectorAll('.toc a'));
  if(io)io.disconnect();
  if(links.length&&'IntersectionObserver' in window){io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+slug+'/'+e.target.id)})})},{rootMargin:'-20% 0px -70% 0px'});
  [].forEach.call(pg.querySelectorAll('.feature'),function(f){io.observe(f)})}
}
window.addEventListener('hashchange',route);
setLanguage(store()==='en'?'en':'he');route();
})();`

const between = (html, from, to, name) => {
  const a = html.indexOf(from)
  const b = to ? html.indexOf(to, a) : html.length
  if (a < 0 || b < 0) throw new Error(`${name}: cannot find ${from}${to ? ` … ${to}` : ''}`)
  return html.slice(a, b)
}

/** Returns the single-file guide as a string. */
export function buildGuide(repoRoot = root) {
  const docs = join(repoRoot, 'docs')
  const dir = join(docs, 'feature-guide')
  const css = readFileSync(join(dir, 'guide.css'), 'utf8') + '\n.page[hidden]{display:none}\n'
  const index = readFileSync(join(docs, 'food-sites-feature-guide.html'), 'utf8')
  const slugs = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort()
  const mark = (html, slug) => {
    let h = html
      .replace(/href="feature-guide\/([a-z-]+)\.html#(feature-\d+)"/g, 'href="#$1/$2"')
      .replace(/href="feature-guide\/([a-z-]+)\.html"/g, 'href="#$1"')
      .replace(/href="\.\.\/food-sites-feature-guide\.html"/g, 'href="#home"')
      .replace(/href="([a-z-]+)\.html"/g, 'href="#$1"')
      .replace(/src="(img\/[^"]+)"/g, (_, p) => `src="data:image/webp;base64,${readFileSync(join(dir, p)).toString('base64')}"`)
      .replace(/ id="search"/g, ' data-search="1"')
      .replace(/ id="count"/g, ' class="count"')
      .replace(/ id="no-results"/g, ' class="no-results"')
    if (slug) h = h.replace(/href="#(feature-\d+)"/g, `href="#${slug}/$1"`)
    return h
  }
  const topbar = between(index, '<div class="topbar">', '<header class="hero', 'index').replace('href="food-sites-feature-guide.html"', 'href="#home"')
  let pages = `<section class="page" id="page-home">${mark(between(index, '<header class="hero', '<script', 'index'))}</section>\n`
  let dialog = ''
  for (const slug of slugs) {
    const html = readFileSync(join(dir, `${slug}.html`), 'utf8')
    pages += `<section class="page" id="page-${slug}" hidden>${mark(between(html, '<header class="hero', '<dialog', slug), slug)}</section>\n`
    dialog ||= between(html, '<dialog id="lightbox"', null, slug).replace(/<\/dialog>[\s\S]*$/, '</dialog>')
  }
  return `<!doctype html>\n<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Food Sites — מדריך היכולות לעסק</title><style>${css}</style></head><body>${topbar}${pages}${dialog}<script>${SCRIPT}</script></body></html>`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2]
  if (!out) {
    console.error('Usage: node scripts/build-feature-guide.mjs <output file>')
    process.exit(2)
  }
  const html = buildGuide()
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  console.log(`Feature guide written to ${out} (${Math.round(html.length / 1024)} KB)`)
}
