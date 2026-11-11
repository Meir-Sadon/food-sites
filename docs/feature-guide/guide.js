(function(){
var lang='he',KEY='food-sites-guide-lang';
function store(v){try{if(v)localStorage.setItem(KEY,v);else return localStorage.getItem(KEY)}catch(e){}return null}
var search=document.querySelector('#search'),count=document.querySelector('#count'),none=document.querySelector('#no-results');
var items=[].slice.call(document.querySelectorAll('.feature,.card'));
function filter(){
  var q=(search?search.value:'').toLocaleLowerCase().trim(),n=0;
  items.forEach(function(c){var show=!q||c.textContent.toLocaleLowerCase().indexOf(q)>-1;c.classList.toggle('hidden',!show);if(show)n++});
  if(count)count.textContent=q?(lang==='he'?'נמצאו '+n:n+' found'):'';
  if(none)none.hidden=n>0||!q;
  [].forEach.call(document.querySelectorAll('.card details'),function(d){d.open=!!q&&!d.parentNode.classList.contains('hidden')});
}
function setLanguage(l){
  lang=l;document.documentElement.lang=l;document.documentElement.dir=l==='he'?'rtl':'ltr';
  [].forEach.call(document.querySelectorAll('[data-en][data-he]'),function(e){e.textContent=e.dataset[l]});
  ['placeholder','aria-label','alt'].forEach(function(a){[].forEach.call(document.querySelectorAll('[data-'+a+'-'+l+']'),function(e){e.setAttribute(a,e.getAttribute('data-'+a+'-'+l))})});
  [].forEach.call(document.querySelectorAll('[data-lang]'),function(b){b.setAttribute('aria-pressed',String(b.dataset.lang===l))});
  var t=document.querySelector('title');if(t&&t.dataset[l])t.textContent=t.dataset[l];
  store(l);filter();
}
[].forEach.call(document.querySelectorAll('[data-lang]'),function(b){b.addEventListener('click',function(){setLanguage(b.dataset.lang)})});
if(search)search.addEventListener('input',filter);
var pr=document.querySelector('#print');if(pr)pr.onclick=function(){window.print()};
// lightbox
var dlg=document.querySelector('#lightbox'),shots=[].slice.call(document.querySelectorAll('.shot')),cur=0;
function show(i){cur=(i+shots.length)%shots.length;var im=shots[cur].querySelector('img');dlg.querySelector('img').src=im.src;dlg.querySelector('img').alt=im.alt;dlg.querySelector('.lb-cap').textContent=im.alt}
if(dlg){shots.forEach(function(b,i){b.addEventListener('click',function(){show(i);dlg.showModal()})});
dlg.querySelector('.lb-close').onclick=function(){dlg.close()};dlg.querySelector('.lb-prev').onclick=function(){show(cur-1)};dlg.querySelector('.lb-next').onclick=function(){show(cur+1)};
dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close()});
dlg.addEventListener('keydown',function(e){if(e.key==='ArrowLeft')show(cur+(document.dir==='rtl'?1:-1));if(e.key==='ArrowRight')show(cur+(document.dir==='rtl'?-1:1))})}
// table of contents highlight
var links=[].slice.call(document.querySelectorAll('.toc a'));
if(links.length&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})}})},{rootMargin:'-20% 0px -70% 0px'});
[].forEach.call(document.querySelectorAll('.feature'),function(f){io.observe(f)})}
setLanguage(store()==='en'?'en':'he');
})();
