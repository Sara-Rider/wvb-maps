/* WVB — Nearby lists as rows · v1 · 2026-11-15
   Loaded site-wide by commit SHA (Site settings, Footer code). Does nothing on a
   page with no .route-biz-grid. Turns the picture cards in route "The stops",
   route "Along the Way" and a place's nearby list into compact rows with the stop
   icons (same glyphs and type mapping as embeds/stops-rows-v1.js). Order is left
   exactly as Webflow gives it (nearest first). Colours are set here. */
(function(){
  if(!document.querySelector('.route-biz-grid')) return;
  var st=document.createElement('style');st.setAttribute('data-wvb','nearby-rows-v1');
  st.textContent=".route-biz-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px 14px!important}@media (max-width:767px){.route-biz-grid{grid-template-columns:1fr!important}}.route-biz-grid > .w-dyn-item{height:auto}.route-biz-card{display:grid!important;grid-template-columns:44px minmax(0,1fr);column-gap:14px;align-items:center;padding:12px 16px!important;min-height:72px;height:100%;box-sizing:border-box;background:#26292D!important;border:1px solid #3A3E44!important;border-radius:8px!important;transform:none!important;box-shadow:none!important;text-decoration:none}.route-biz-card:hover{border-color:#C8922A!important}.route-biz-card .route-biz-image-wrap,.route-biz-card .route-biz-desc{display:none!important}.route-biz-card .route-biz-body{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;row-gap:2px;padding:0!important;min-width:0}.route-biz-card .route-biz-title{grid-column:1/-1;grid-row:1;margin:0!important;padding:0!important;font-size:17px!important;line-height:1.25!important;color:#F2F0EB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.route-biz-card .route-biz-category{grid-column:1;grid-row:2;position:static!important;margin:0!important;padding:0!important;background:none!important;box-shadow:none!important;color:#CFCAC0!important;font-size:13px!important;font-weight:600!important;letter-spacing:0!important;text-transform:none!important}.route-biz-card .route-biz-category[data-type]:not([data-type=\"\"])::after{padding:0!important;font-size:13px!important;letter-spacing:0!important}.route-biz-card .route-biz-region{grid-column:2;grid-row:2;justify-self:end;margin:0!important;padding:0!important;font-size:12px!important;white-space:nowrap}.wvb-row-icon{width:44px;height:44px;border-radius:50%;border:1.5px solid #C8922A;display:flex;align-items:center;justify-content:center}.wvb-row-icon svg{width:22px;height:22px;fill:none;stroke:#C8922A;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}@media (max-width:479px){.route-biz-card .route-biz-region{display:none}}";
  document.head.appendChild(st);
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
  var CAT={'lodging':'lodging','restaurant':'food','bar':'bar','campground':'camping','motorcycle dealer':'moto','repair shop':'moto','tire shop':'moto','paint shop':'moto','fuel':'fuel','tour guide':'guides','outfitter':'guides','club / post':'post','other':'other','meeting point':'other'};
  var ATT={'covered bridge':'bridge','swing':'swing','waterfall':'waterfall','overlook':'overlook','monument':'monument','park/nature':'park','scenic road/byway':'scenic-road','historic site':'historic'};
  function token(card){
    var t=(card.getAttribute('data-token')||'').trim(); if(t) return t;
    var c=card.querySelector('.route-biz-category'); if(!c) return 'other';
    var dt=(c.getAttribute('data-type')||'').trim().toLowerCase(), cat=c.textContent.trim().toLowerCase();
    if(cat==='attraction') return ATT[dt]||'attraction';
    return CAT[cat]||'other';
  }
  function run(){
    [].slice.call(document.querySelectorAll('.route-biz-card')).forEach(function(card){
      if(card.querySelector('.wvb-row-icon')) return;
      var s=document.createElement('span');s.className='wvb-row-icon';s.setAttribute('aria-hidden','true');
      s.innerHTML='<svg viewBox="0 0 24 24">'+(G[token(card)]||G.other)+'</svg>';
      card.insertBefore(s,card.firstChild);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
