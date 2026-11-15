/* WVB — A place's own page: night-ridge band · v1 · 2026-11-15
   Loaded site-wide by commit SHA (Site settings, Footer code). Does nothing on a
   page without .dir-hero-band (the Directory template top). Replaces the card-art
   picture on the right with the night-ridge band behind the whole top, as in the
   approved board "Stops as a list, Featured as cards" (section 3), and adds the
   county to the region line ("Monongalia County · Mountaineer Country"), read from
   the directory pin file by the page's slug. Nothing in Webflow changes; removing
   the script line restores the old top. */
(function () {
  var band = document.querySelector('.dir-hero-band');
  if (!band) return;
  var st = document.createElement('style');
  st.setAttribute('data-wvb', 'place-hero-v1');
  st.textContent =
    '.dir-hero-band{position:relative;overflow:hidden;background:#141414!important}' +
    '.wvb-ridge{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}' +
    '.dir-hero-band .dir-hero-inner{position:relative;z-index:1;grid-template-columns:minmax(0,1fr)!important;min-height:380px;align-content:end;box-sizing:border-box;padding-top:48px;padding-bottom:64px}' +
    '.dir-hero-band .dir-banner-image{display:none!important}' +
    '@media (max-width:767px){.dir-hero-band .dir-hero-inner{min-height:320px;padding-bottom:48px}}';
  document.head.appendChild(st);
  var svg = '<svg class="wvb-ridge" viewBox="0 0 1312 380" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><radialGradient id="wvbRidgeGlow" cx="900" cy="150" r="420" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#e2b866" stop-opacity="0.55"/><stop offset="1" stop-color="#c8922a" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="1312" height="380" fill="url(#wvbRidgeGlow)"/>' +
    '<path d="M0 250 C 180 200 320 230 480 205 C 640 180 760 235 900 210 C 1060 185 1180 225 1312 200 L 1312 380 L 0 380 Z" fill="#2c2b27"/>' +
    '<path d="M0 300 C 200 270 380 300 560 280 C 760 258 900 300 1080 282 C 1180 272 1260 290 1312 285 L 1312 380 L 0 380 Z" fill="#1f1f1c"/>' +
    '<path d="M0 330 C 300 312 620 345 900 322 C 1080 308 1220 325 1312 318" stroke="#c8922a" stroke-width="3" fill="none"/></svg>';
  band.insertAdjacentHTML('afterbegin', svg);

  var label = band.querySelector('.dir-region-label');
  var slug = location.pathname.replace(/\/+$/, '').split('/').pop();
  if (!label || !slug || !window.fetch) return;
  fetch('https://cdn.jsdelivr.net/gh/Sara-Rider/wvb-maps@main/directory.geojson')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (fc) {
      if (!fc || !fc.features) return;
      var f = fc.features.filter(function (x) { return x.properties && x.properties.slug === slug; })[0];
      var county = f && (f.properties.county || '').trim();
      if (!county) return;
      if (!/county$/i.test(county)) county += ' County';
      var region = label.textContent.trim();
      label.textContent = region ? county + ' · ' + region : county;
    })
    .catch(function () {});
})();
