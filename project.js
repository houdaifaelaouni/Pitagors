/* Project pages: parallax hero, counters, timeline fill, site videos, photo carousel and lightbox. */
(function(){
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var lang=function(){return document.documentElement.lang==='es'?'es-ES':'en-GB';};

/* ---------- hero parallax ---------- */
var bg=document.querySelector('.pv-hero-bg');
if(bg&&!reduce){
  var ticking=false;
  var move=function(){ var y=window.scrollY; if(y<window.innerHeight*1.2) bg.style.transform='translate3d(0,'+(y*0.35).toFixed(1)+'px,0) scale(1.12)'; ticking=false; };
  window.addEventListener('scroll',function(){ if(!ticking){ticking=true;requestAnimationFrame(move);} },{passive:true});
  move();
}
document.documentElement.classList.add('pv-ready');

/* ---------- counters ---------- */
var counters=[].slice.call(document.querySelectorAll('.pv-cnt'));
function fmt(n,el){ return el.getAttribute('data-plain')!==null ? String(n) : n.toLocaleString(lang()); }
function count(el){
  var to=parseFloat(el.getAttribute('data-to')), t0=null, dur=1500;
  if(reduce){ el.textContent=fmt(to,el); return; }
  function step(t){ if(!t0) t0=t; var k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3);
    el.textContent=fmt(Math.round(to*e),el); if(k<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
if('IntersectionObserver' in window){
  var co=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ count(e.target); co.unobserve(e.target); } }); },{threshold:.6});
  counters.forEach(function(c){ co.observe(c); });
} else counters.forEach(count);

/* ---------- timeline fill follows the scroll ---------- */
var steps=document.querySelector('.pv-steps');
if(steps){
  var items=[].slice.call(steps.querySelectorAll('.pv-step'));
  var fill=function(){
    var r=steps.getBoundingClientRect(), vh=window.innerHeight;
    var p=Math.min(1,Math.max(0,(vh*0.55-r.top)/r.height));
    steps.style.setProperty('--p',p.toFixed(3));
    items.forEach(function(it){ var b=it.getBoundingClientRect(); it.classList.toggle('on',b.top<vh*0.6); });
  };
  window.addEventListener('scroll',function(){requestAnimationFrame(fill);},{passive:true});
  window.addEventListener('resize',fill); fill();
}

/* ---------- site videos play only while visible ---------- */
var vids=[].slice.call(document.querySelectorAll('.pv-vid video'));
if(vids.length&&'IntersectionObserver' in window&&!reduce){
  var vo=new IntersectionObserver(function(es){ es.forEach(function(e){
    var v=e.target;
    if(e.isIntersecting){ if(v.preload==='none') v.preload='auto'; var p=v.play(); if(p&&p.catch) p.catch(function(){}); }
    else v.pause();
  }); },{threshold:.35});
  vids.forEach(function(v){ vo.observe(v); });
} else vids.forEach(function(v){ v.controls=true; });

/* ---------- photo carousel ---------- */
var track=document.querySelector('.pv-track');
if(track){
  var bar=document.querySelector('.pv-bar i'), prev=document.querySelector('.pv-prev'), next=document.querySelector('.pv-nextbtn');
  var by=function(d){ var c=track.querySelector('.pv-shot'); track.scrollBy({left:d*(c?c.offsetWidth+20:400),behavior:reduce?'auto':'smooth'}); };
  prev.addEventListener('click',function(){by(-1);}); next.addEventListener('click',function(){by(1);});
  var prog=function(){ var m=track.scrollWidth-track.clientWidth; var k=m>0?track.scrollLeft/m:1;
    if(bar) bar.style.transform='scaleX('+Math.max(.08,k).toFixed(3)+')';
    prev.disabled=track.scrollLeft<4; next.disabled=track.scrollLeft>m-4; };
  track.addEventListener('scroll',function(){requestAnimationFrame(prog);},{passive:true}); window.addEventListener('resize',prog); prog();
  /* drag with the mouse */
  var down=false, sx=0, sl=0, moved=false;
  track.addEventListener('pointerdown',function(e){ if(e.pointerType!=='mouse') return; down=true; moved=false; sx=e.clientX; sl=track.scrollLeft; track.classList.add('drag'); });
  window.addEventListener('pointermove',function(e){ if(!down) return; var d=e.clientX-sx; if(Math.abs(d)>5) moved=true; track.scrollLeft=sl-d; });
  window.addEventListener('pointerup',function(){ down=false; track.classList.remove('drag'); });
  track.addEventListener('click',function(e){ if(moved){ e.preventDefault(); e.stopPropagation(); moved=false; } },true);

  /* lightbox */
  var shots=[].slice.call(track.querySelectorAll('.pv-shot')), box=document.getElementById('pvlb');
  if(box){
    var im=box.querySelector('img'), cap=box.querySelector('.pvlb-cap'), idx=0;
    var show=function(i){ idx=(i+shots.length)%shots.length; var s=shots[idx], g=s.querySelector('img');
      im.src=g.getAttribute('src'); im.alt=g.alt; cap.textContent=(idx+1)+' / '+shots.length+'  ·  '+s.querySelector('figcaption').textContent; };
    var close=function(){ box.classList.remove('open'); document.body.style.overflow=''; };
    shots.forEach(function(s,i){ s.addEventListener('click',function(){ show(i); box.classList.add('open'); document.body.style.overflow='hidden'; }); });
    box.querySelector('.x').addEventListener('click',close);
    box.querySelector('.pv').addEventListener('click',function(e){e.stopPropagation();show(idx-1);});
    box.querySelector('.nx').addEventListener('click',function(e){e.stopPropagation();show(idx+1);});
    box.addEventListener('click',function(e){ if(e.target===box) close(); });
    document.addEventListener('keydown',function(e){ if(!box.classList.contains('open')) return;
      if(e.key==='Escape') close(); if(e.key==='ArrowLeft') show(idx-1); if(e.key==='ArrowRight') show(idx+1); });
  }
}
})();
