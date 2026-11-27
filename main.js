(function(){
'use strict';
var EMAIL='montajes@pitagor.info', WA='34670517273';
var cur='en';
try{var s=localStorage.getItem('lang'); if(s==='es') cur='es';}catch(e){}

/* ---------- language ---------- */
function apply(l){
  cur=l; document.documentElement.lang=l;
  document.querySelectorAll('[data-en]').forEach(function(el){var t=el.getAttribute('data-'+l); if(t!==null) el.textContent=t;});
  document.querySelectorAll('[data-ph-en]').forEach(function(el){el.setAttribute('placeholder',el.getAttribute('data-ph-'+l));});
  document.querySelectorAll('[data-aria-en]').forEach(function(el){el.setAttribute('aria-label',el.getAttribute('data-aria-'+l));});
  var lt=document.getElementById('langtxt'); if(lt) lt.textContent=(l==='en'?'ES':'EN');
}
var lb=document.getElementById('lang');
if(lb) lb.addEventListener('click',function(){
  var n=cur==='en'?'es':'en';
  try{localStorage.setItem('lang',n);}catch(e){}
  apply(n);
});
if(cur==='es') apply('es');

/* ---------- mobile menu ---------- */
var bg=document.getElementById('burger'), nav=document.getElementById('mainnav');
if(bg&&nav){
  bg.addEventListener('click',function(){
    var o=nav.classList.toggle('open'); bg.setAttribute('aria-expanded',o?'true':'false');
  });
  nav.addEventListener('click',function(e){ if(e.target.tagName==='A'){nav.classList.remove('open');bg.setAttribute('aria-expanded','false');} });
}

/* ---------- reveal on scroll ---------- */
var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){
  es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
},{threshold:.25}):null;
document.querySelectorAll('.rv,.mini,.tstep').forEach(function(el){ if(io) io.observe(el); else el.classList.add('in'); });

/* ---------- process timeline progress ---------- */
var tl=document.querySelector('.timeline');
if(tl){
  var fill=tl.querySelector('.tl-line');
  var upd=function(){
    var r=tl.getBoundingClientRect(), vh=window.innerHeight;
    var p=(vh*.6-r.top)/r.height; p=Math.max(0,Math.min(1,p));
    fill.style.setProperty('--p',p.toFixed(3));
  };
  window.addEventListener('scroll',upd,{passive:true}); window.addEventListener('resize',upd); upd();
}

/* ---------- animated isometric rack (process step 3) ---------- */
function rack(svg,bays,levels,rows){
  var C=Math.cos(Math.PI/6), S=.5;
  var W=+svg.viewBox.baseVal.width, H=+svg.viewBox.baseVal.height;
  var bw=2, bd=1.1, lh=1, totalW=bays*bw, totalD=rows*bd*1.15, k=Math.min(W/((totalW+totalD)*C*1.08), (H-8)/((totalW+totalD)*S+levels*lh+.4));
  var o={k:k,ox:W/2+(totalD-totalW)*C*k/2,oy:H-4-(totalW+totalD)*S*k};
  function P(x,y,z){return [o.ox+(x-y)*C*o.k, o.oy+(x+y)*S*o.k-z*o.k];}
  function pts(a){return a.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');}
  var ink='#2B2D31', red='#D71920', out='', col=0;
  for(var r=0;r<rows;r++){
    var y0=r*bd*1.15, y1=y0+bd, top=levels*lh+.3;
    for(var b=0;b<=bays;b++){
      var x=b*bw;
      [y0,y1].forEach(function(y){
        out+='<polyline class="up" style="--d:'+(.15+col*.1).toFixed(2)+'s" fill="none" stroke="'+ink+'" stroke-width="1.5" points="'+pts([P(x,y,0),P(x,y,top)])+'"/>'; col++;
      });
    }
    for(var l=0;l<=levels;l++){
      var d=(1.0+l*.22).toFixed(2)+'s';
      out+='<g class="bm" style="--d:'+d+'"><polyline fill="none" stroke="'+ink+'" stroke-width="1.3" points="'+pts([P(0,y0,l*lh),P(totalW,y0,l*lh)])+'"/><polyline fill="none" stroke="'+ink+'" stroke-width="1.3" points="'+pts([P(0,y1,l*lh),P(totalW,y1,l*lh)])+'"/>';
      for(var b2=0;b2<=bays;b2++) out+='<polyline fill="none" stroke="'+ink+'" stroke-width="1" points="'+pts([P(b2*bw,y0,l*lh),P(b2*bw,y1,l*lh)])+'"/>';
      out+='</g>';
    }
    for(var l2=0;l2<levels;l2++){
      for(var b3=0;b3<bays;b3++){
        var px=b3*bw+.25,pw=bw-.5,py=y0+.12,pd=bd-.24,pz=l2*lh+.06,ph=.62;
        var a=P(px,py,pz),bq=P(px+pw,py,pz),c=P(px+pw,py+pd,pz),d2=P(px,py+pd,pz);
        var a2=P(px,py,pz+ph),b2p=P(px+pw,py,pz+ph),c2=P(px+pw,py+pd,pz+ph),d3=P(px,py+pd,pz+ph);
        var hot=((b3+l2+r)%3===0);
        out+='<g class="pl" style="--d:'+(1.6+l2*.35+b3*.1+r*.05).toFixed(2)+'s">'+
          '<polygon fill="'+(hot?'#B3141B':'#C9CDD4')+'" stroke="'+ink+'" stroke-width=".6" points="'+pts([d2,c,c2,d3])+'"/>'+
          '<polygon fill="'+(hot?'#8F1016':'#B2B7C0')+'" stroke="'+ink+'" stroke-width=".6" points="'+pts([bq,c,c2,b2p])+'"/>'+
          '<polygon fill="'+(hot?red:'#EEF0F3')+'" stroke="'+ink+'" stroke-width=".6" points="'+pts([a2,b2p,c2,d3])+'"/></g>';
      }
    }
  }
  svg.innerHTML=out;
}
document.querySelectorAll('svg[data-rack-anim]').forEach(function(s){
  var a=s.getAttribute('data-rack-anim').split(',').map(Number); rack(s,a[0],a[1],a[2]);
});

/* ---------- planning calculator (example estimate) ---------- */
document.querySelectorAll('.calc').forEach(function(box){
  var pos=box.querySelector('#cpos'), crew=box.querySelector('#ccrew'), prod=box.querySelector('#cprod');
  if(!pos||!crew||!prod) return;
  var days=box.querySelector('#cdays'), weeks=box.querySelector('#cweeks'), fill=box.querySelector('#cfill');
  function run(){
    var p=Math.max(1,+pos.value||0), c=+crew.value||1, r=Math.max(1,+prod.value||0);
    var d=Math.max(1,Math.ceil(p/(c*r))), w=Math.max(1,Math.ceil(d/5));
    days.textContent=d; weeks.textContent=w;
    fill.style.width=Math.min(100,d/40*100)+'%';
  }
  [pos,crew,prod].forEach(function(e){e.addEventListener('input',run);e.addEventListener('change',run);});
  run();
});

/* ---------- system tabs ---------- */
document.querySelectorAll('.systabs').forEach(function(box){
  var tabs=box.querySelectorAll('.tab'), panels=box.querySelectorAll('.tabpanel');
  tabs.forEach(function(t){ t.addEventListener('click',function(){
    tabs.forEach(function(x){x.classList.toggle('on',x===t);});
    panels.forEach(function(p){p.classList.toggle('on',p.id==='tab-'+t.getAttribute('data-tab'));});
  });});
});

/* ---------- gallery filter + lightbox ---------- */
var gal=document.querySelector('.gal');
if(gal){
  var items=[].slice.call(gal.querySelectorAll('.gi'));
  document.querySelectorAll('.filters button').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('.filters button').forEach(function(x){x.classList.remove('on');});
      b.classList.add('on');
      var f=b.getAttribute('data-f');
      items.forEach(function(it){ it.classList.toggle('hide', f!=='all' && it.getAttribute('data-cat')!==f); });
    });
  });
  var box=document.getElementById('lb'), img=box.querySelector('img'), idx=0, vis=[];
  function show(i){ idx=(i+vis.length)%vis.length; img.src=vis[idx].querySelector('img').getAttribute('src'); img.alt=vis[idx].querySelector('img').alt; }
  items.forEach(function(it){ it.addEventListener('click',function(){
    vis=items.filter(function(x){return !x.classList.contains('hide');}); show(vis.indexOf(it)); box.classList.add('open');
  });});
  function close(){box.classList.remove('open');}
  box.querySelector('.x').addEventListener('click',close);
  box.querySelector('.pv').addEventListener('click',function(){show(idx-1);});
  box.querySelector('.nx').addEventListener('click',function(){show(idx+1);});
  box.addEventListener('click',function(e){ if(e.target===box) close(); });
  document.addEventListener('keydown',function(e){
    if(!box.classList.contains('open')) return;
    if(e.key==='Escape') close(); if(e.key==='ArrowLeft') show(idx-1); if(e.key==='ArrowRight') show(idx+1);
  });
}

/* ---------- quote form: builds an email or a WhatsApp message, nothing is sent from the page ---------- */
var form=document.getElementById('qform');
if(form){
  var sm=location.search.match(/system=([a-z]+)/);
  if(sm&&form.elements.system) form.elements.system.value=sm[1];
  function text(){
    var f=form.elements, L=cur==='es'
      ? ['Nombre','Empresa','Email','Teléfono','País del proyecto','Tipo de sistema','Tamaño aproximado','Fecha de inicio deseada','Detalles']
      : ['Name','Company','Email','Phone','Project country','System type','Approximate size','Desired start date','Details'];
    var v=[f.name.value,f.company.value,f.email.value,f.phone.value,f.country.value,f.system.options[f.system.selectedIndex].text,(f.size?f.size.value:''),(f.date?f.date.value:''),f.message.value];
    var lines=[]; for(var i=0;i<L.length;i++){ if(v[i]) lines.push(L[i]+': '+v[i]); }
    var subj=(cur==='es'?'Solicitud de presupuesto':'Quote request')+(f.company.value?' - '+f.company.value:'')+(f.country.value?' - '+f.country.value:'');
    return {subject:subj, body:lines.join('\n')};
  }
  var ok=document.getElementById('qok');
  form.addEventListener('submit',function(e){
    e.preventDefault(); var t=text();
    window.location.href='mailto:'+EMAIL+'?subject='+encodeURIComponent(t.subject)+'&body='+encodeURIComponent(t.body);
    ok.classList.add('show');
  });
  var wb=document.getElementById('qwa');
  wb.addEventListener('click',function(){
    if(!form.reportValidity()) return;
    var t=text(); window.open('https://wa.me/'+WA+'?text='+encodeURIComponent(t.subject+'\n\n'+t.body),'_blank','noopener');
  });
}
})();

/* projects page: filter project cards by system and country */
(function(){
  var s=document.getElementById('fSys'), c=document.getElementById('fCty');
  if(!s||!c) return;
  var cards=[].slice.call(document.querySelectorAll('.pj-card')), empty=document.querySelector('.pj-empty');
  function run(){
    var n=0;
    cards.forEach(function(k){
      var ok=(s.value==='all'||k.getAttribute('data-sys')===s.value)&&(c.value==='all'||k.getAttribute('data-cty')===c.value);
      k.hidden=!ok; if(ok){n++; k.classList.add('in');}
    });
    if(empty) empty.hidden=n>0;
  }
  s.addEventListener('change',run); c.addEventListener('change',run);
})();
