/* WVB — Stops as rows, grouped by type · v1 · 2026-11-15
   Loaded on /directory by commit SHA (Before </body> tag of the Directory page).
   Turns the directory card grid into compact rows under type headings, with the
   approved stop icons (same glyphs as the maps), plus a line and a
   "jump to" row of types above the rows (scroll only; follows the filters). Does not touch filtering: the
   existing filters and directory-region-layer keep working; this only regroups
   what they show. Type comes from the card's data-token attribute when present,
   otherwise from the category and attraction type on the card (same mapping as
   the Airtable Type Token formula). Card colours are set here, not in Webflow. */
(function () {
  var st = document.createElement('style');
  st.setAttribute('data-wvb', 'stops-rows-v1');
  st.textContent = ".w-dyn-list:has(.collection-list-2){display:contents}\n.collection-list-2{display:contents!important}\n.wvb-stops-intro{box-sizing:border-box;max-width:1160px;margin:0 auto 18px;padding:0 24px}\n.wvb-stops-intro p{margin:0 0 10px;font-size:15px;line-height:1.5;color:#CFCAC0}\n.wvb-jump{display:flex;flex-wrap:wrap;gap:8px}\n.wvb-jump a{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #3A3E44;border-radius:999px;background:#26292D;color:#F2F0EB;font-size:14px;line-height:1.2;text-decoration:none;white-space:nowrap}\n.wvb-jump a:hover,.wvb-jump a:focus-visible{border-color:#C8922A;color:#F2F0EB}\n.wvb-jump a span{color:#CFCAC0;font-size:13px}\n@media (max-width:767px){.wvb-jump{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;scrollbar-width:none}.wvb-jump::-webkit-scrollbar{display:none}}\n.wvb-rows{box-sizing:border-box;max-width:1160px;margin:0 auto 48px;padding:0 24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}\n@media (max-width:767px){.wvb-rows{grid-template-columns:1fr}}\n.wvb-group{grid-column:1/-1;display:flex;align-items:baseline;gap:12px;margin:22px 0 2px;padding-bottom:8px;border-bottom:1px solid #C8922A}\n.wvb-group:first-child{margin-top:0}\n.wvb-group h2{margin:0;font-family:Cinzel,serif;font-size:22px;line-height:1.2;color:#F2F0EB}\n.wvb-group span{font-size:14px;color:#CFCAC0}\n.wvb-rows .collection-item{height:auto}\n.wvb-rows .directory-card{display:grid!important;grid-template-columns:44px minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:14px;row-gap:2px;align-items:center;padding:12px 16px;min-height:72px;height:100%;box-sizing:border-box;background:#26292D;border:1px solid #3A3E44;border-radius:8px;transform:none!important}\n.wvb-rows .directory-card:hover{border-color:#C8922A}\n.wvb-rows .directory-card > img,.wvb-rows .card-body,.wvb-rows .card-description{display:none!important}\n.wvb-row-icon{grid-row:1/3;width:44px;height:44px;border-radius:50%;border:1.5px solid #C8922A;display:flex;align-items:center;justify-content:center}\n.wvb-row-icon svg{width:22px;height:22px;fill:none;stroke:#C8922A;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}\n.wvb-rows .card-title{grid-column:2;margin:0!important;padding:0!important;font-size:17px!important;line-height:1.25;-webkit-line-clamp:1!important}\n.wvb-rows .card-category{position:static!important;grid-column:2;grid-row:2;display:inline;margin:0!important;padding:0!important;background:none!important;box-shadow:none!important;color:#CFCAC0!important;font-size:13px!important;font-weight:600!important;letter-spacing:0!important;text-transform:none!important;max-width:none!important}\n.wvb-rows .card-category[data-type]:not([data-type=\"\"])::after{padding:0!important;font-size:13px!important;letter-spacing:0!important}\n.wvb-rows .card-region{grid-column:2;grid-row:2;justify-self:end;margin:0!important;padding:0!important;font-size:12px!important}\n.wvb-rows.is-one-region .card-region{display:none}\n.wvb-rows .directory-card > .w-embed{grid-column:3;grid-row:1/3}\n.wvb-rows .wvb-rate{padding:0!important;display:flex;flex-direction:column;align-items:flex-end;gap:2px}\n.wvb-rows .wvb-rate__bikes svg{width:18px;height:18px}\n.wvb-rows .wvb-rate__meta{font-size:10px!important}\n@media (max-width:479px){.wvb-rows .directory-card > .w-embed{grid-column:2;grid-row:3;justify-self:start}.wvb-rows .wvb-rate{align-items:flex-start}}\n";
  document.head.appendChild(st);
})();
(function(){
  var G={food:'<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/><path d="M16 3c-1.5 1.2-2 3.5-2 6 0 1.7 1 2.5 2 2.5V3"/><path d="M16 11.5V21"/>',
  bar:'<path d="M5 9h10v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 12h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/><path d="M5 9c0-2.2 1.6-3.5 3.2-3.2C9 4.4 11.2 4 12.5 5c1.6-.4 3 .9 2.5 4"/><path d="M9 13v5"/><path d="M12 13v5"/>',
  lodging:'<path d="M4 8v10"/><path d="M4 14h16"/><path d="M20 18v-4a2 2 0 0 0-2-2h-8v2"/><circle cx="7.5" cy="11" r="1.5"/>',
  camping:'<path d="M12 4l8 15H4z"/><path d="M12 4v15"/>',
  moto:'<path d="M15 6.5a3.5 3.5 0 0 0-4.7 4.6L4 17.5 6.5 20l6.4-6.3A3.5 3.5 0 0 0 17.5 9l-2 2-1.5-1.5z"/>',
  fuel:'<path d="M5 20V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15"/><path d="M4 20h11"/><path d="M7 8h5"/><path d="M14 10l3 3v4a2 2 0 0 0 4 0V8l-3-3"/>',
  guides:'<circle cx="12" cy="12" r="8.5"/><path d="M15 9l-4.5 1.5L9 15l4.5-1.5z"/>',
  post:'<path d="M5 21V3"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  swing:'<path d="M4 4h16"/><path d="M8 4v6"/><path d="M16 4v6"/><path d="M7 10h10v3H7z"/><path d="M9 13v4"/><path d="M15 13v4"/>',
  bridge:'<path d="M3 17v-3a9 9 0 0 1 18 0v3"/><path d="M3 14h18"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
  waterfall:'<path d="M12 3c2.5 3.5 5 6.7 5 9a5 5 0 0 1-10 0c0-2.3 2.5-5.5 5-9z"/>',
  overlook:'<path d="M7 5h8l2 4H9z"/><path d="M12 9v9"/><path d="M8 21h8"/><path d="M9 18h6"/><path d="M5 6l2 1"/>',
  park:'<path d="M12 3l4.5 7H14l3.5 5.5H15L18 20H6l3-4.5H6.5L10 10H7.5z"/><path d="M12 20v2"/>',
  'scenic-road':'<path d="M5 21c1-5 4-7 4-11 0-3-1-5-1-7"/><path d="M15 21c1-5 4-7 4-11 0-3-1-5-1-7"/><path d="M10.5 19.5l.5-2"/><path d="M12.5 13.5l.3-2"/><path d="M12.6 7l-.1-2"/>',
  monument:'<path d="M5 9h14l-7-6z"/><path d="M9 9v10"/><path d="M15 9v10"/><path d="M6 21h12"/>',
  historic:'<path d="M12 3l8 4.5H4z"/><path d="M7 7.5v9"/><path d="M12 7.5v9"/><path d="M17 7.5v9"/><path d="M4.5 16.5h15"/><path d="M3 20h18"/>',
  attraction:'<path d="M12 3l2.5 6H21l-5 4 2 6.5L12 15l-6 4.5 2-6.5-5-4h6.5z"/>',
  other:'<circle cx="12" cy="12" r="3.2"/>'};
  var GROUPS=[['food','Food & drink',['food','bar']],['stay','Places to stay',['lodging','camping']],['fuel','Fuel',['fuel']],['shops','Rider shops',['moto','guides']],['posts','Legion & VFW posts',['post']],['swings','Almost Heaven swings',['swing']],['bridges','Covered bridges',['bridge']],['sights','Sights & scenery',['waterfall','overlook','park','scenic-road','monument','historic','attraction']],['other','Other stops',['other']]];
  var CAT={'lodging':'lodging','restaurant':'food','bar':'bar','campground':'camping','motorcycle dealer':'moto','repair shop':'moto','tire shop':'moto','paint shop':'moto','fuel':'fuel','tour guide':'guides','outfitter':'guides','club / post':'post','other':'other','meeting point':'other'};
  var ATT={'covered bridge':'bridge','swing':'swing','waterfall':'waterfall','overlook':'overlook','monument':'monument','park/nature':'park','scenic road/byway':'scenic-road','historic site':'historic'};
  function token(card){
    var t=(card.getAttribute('data-token')||'').trim(); if(t) return t;
    var c=card.querySelector('.card-category'); if(!c) return 'other';
    var dt=(c.getAttribute('data-type')||'').trim().toLowerCase(), cat=c.textContent.trim().toLowerCase();
    if(cat==='attraction') return ATT[dt]||'attraction';
    return CAT[cat]||'other';
  }
  function groupOf(tok){for(var i=0;i<GROUPS.length;i++){if(GROUPS[i][2].indexOf(tok)>-1)return i}return GROUPS.length-1}
  function init(){
    var lists=[].slice.call(document.querySelectorAll('.w-dyn-list')).filter(function(l){return l.querySelector('.collection-list-2')});
    if(!lists.length) return;
    var wrap=document.createElement('div'); wrap.className='wvb-rows';
    lists[0].parentNode.insertBefore(wrap,lists[0]);
    lists.forEach(function(l){wrap.appendChild(l)});
    var heads=GROUPS.map(function(g,i){var h=document.createElement('div');h.className='wvb-group';h.id='stops-'+g[0];h.style.order=i*10000;h.innerHTML='<h2>'+g[1]+'</h2><span></span>';wrap.insertBefore(h,wrap.firstChild);return h});
    var intro=document.createElement('div');intro.className='wvb-stops-intro';
    intro.innerHTML='<p></p><nav class="wvb-jump" aria-label="Jump to a type of stop"></nav>';
    wrap.parentNode.insertBefore(intro,wrap);
    var note=intro.querySelector('p'),nav=intro.querySelector('nav');
    var links=GROUPS.map(function(g,i){var a=document.createElement('a');a.href='#stops-'+g[0];a.innerHTML=g[1].replace('&','&amp;')+' <span></span>';
      a.addEventListener('click',function(e){e.preventDefault();var bar=document.querySelector('.dir-filter-bar'),off=bar&&getComputedStyle(bar).position==='sticky'?bar.getBoundingClientRect().height:0;window.scrollTo({top:heads[i].getBoundingClientRect().top+window.pageYOffset-off-12,behavior:'smooth'})});
      nav.appendChild(a);return a});
    [].slice.call(wrap.querySelectorAll('.collection-item')).forEach(function(item,n){
      var card=item.querySelector('.directory-card'); if(!card) return;
      var tok=token(card), gi=groupOf(tok);
      item.style.order=gi*10000+1+n; item.setAttribute('data-group',gi);
      if(!card.querySelector('.wvb-row-icon')){var s=document.createElement('span');s.className='wvb-row-icon';s.setAttribute('aria-hidden','true');s.innerHTML='<svg viewBox="0 0 24 24">'+(G[tok]||G.other)+'</svg>';card.insertBefore(s,card.firstChild)}
    });
    function refresh(){
      var region=document.getElementById('Regions'); wrap.classList.toggle('is-one-region',!!(region&&region.value));
      var total=0,shown=0;
      heads.forEach(function(h,i){var n=[].slice.call(wrap.querySelectorAll('.collection-item[data-group="'+i+'"]')).filter(function(it){return it.offsetParent!==null&&getComputedStyle(it).display!=='none'}).length;var d=n?'':'none',t=n+(n===1?' stop':' stops'),sp=h.querySelector('span');if(h.style.display!==d)h.style.display=d;if(sp.textContent!==t)sp.textContent=t;
        total+=n;if(n)shown++;var a=links[i],ls=a.querySelector('span');if(a.style.display!==d)a.style.display=d;if(ls.textContent!==String(n))ls.textContent=n});
      var nd=shown>1?'':'none';if(nav.style.display!==nd)nav.style.display=nd;
      var msg=shown>1?total+' stops, grouped by type. Tap a type to jump to it, or use the filters to narrow the list.':total+(total===1?' stop':' stops')+' match your filters.';
      if(note.textContent!==msg)note.textContent=msg;
    }
    refresh();
    new MutationObserver(function(){clearTimeout(window.__wvbRowsT);window.__wvbRowsT=setTimeout(refresh,60)}).observe(wrap,{subtree:true,attributes:true,attributeFilter:['style','class'],childList:true});
    document.addEventListener('change',function(){setTimeout(refresh,120)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
