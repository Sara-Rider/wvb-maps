/* WVB — Travel region page top · v1 · 2026-11-15
   Loaded site-wide by commit SHA (Site settings, Footer code). Does nothing on a page
   without .region-hero (the Travel Regions template top). Lines the label, name,
   Share/Save, divider and blurb up on the left, and swaps the light locator map for
   the same dark WV map used on place pages and the share images: this region in
   gold, the others grey, at the right (computer widths; hidden on phones).
   Nothing in Webflow changes; removing the script line restores the old top. */
(function () {
  var hero = document.querySelector('.region-hero');
  if (!hero) return;
  var st = document.createElement('style');
  st.setAttribute('data-wvb', 'region-hero-v1');
  st.textContent =
    '.region-hero{position:relative}' +
    '.region-hero > .on-art,.region-hero > .paragraph-3{text-align:left!important;justify-content:flex-start!important;margin-left:0!important;margin-right:0!important}' +
    '.region-hero > .gold-divider{margin-left:0!important;margin-right:0!important}' +
    '.region-hero > .wvb-ss{justify-content:flex-start!important}' +
    '.region-hero .region-locator{display:none!important}' +
    '.region-hero.has-wvb-map > :not(.wvb-region-map){max-width:calc(100% - 360px)!important}' +
    '.wvb-region-map{position:absolute;right:24px;bottom:48px;width:300px}' +
    '.wvb-region-map svg{display:block;width:100%;height:auto}' +
    '@media (max-width:767px){.region-hero.has-wvb-map > :not(.wvb-region-map){max-width:none!important}.wvb-region-map{display:none}}';
  document.head.appendChild(st);

  var h1 = hero.querySelector('h1');
  var name = h1 ? h1.textContent.trim() : '';
  if (!name || !window.fetch) return;
  fetch('https://cdn.jsdelivr.net/gh/Sara-Rider/wvb-maps@main/regions.geojson')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (fc) {
      if (!fc || !fc.features) return;
      var norm = function (v) { return String(v || '').trim().toLowerCase(); };
      if (!fc.features.some(function (f) { return norm(f.properties.name) === norm(name); })) return;
      var k = Math.cos(38.9 * Math.PI / 180), minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      function rings(g) { return g.type === 'Polygon' ? g.coordinates : [].concat.apply([], g.coordinates); }
      fc.features.forEach(function (f) { rings(f.geometry).forEach(function (r) { r.forEach(function (c) {
        var x = c[0] * k; if (x < minx) minx = x; if (x > maxx) maxx = x; if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1]; }); }); });
      var W = 300, s = W / (maxx - minx), H = Math.round((maxy - miny) * s);
      var paths = fc.features.map(function (f) {
        var d = rings(f.geometry).map(function (r) { return 'M' + r.map(function (c) {
          return ((c[0] * k - minx) * s).toFixed(1) + ',' + ((maxy - c[1]) * s).toFixed(1); }).join('L') + 'Z'; }).join('');
        var on = norm(f.properties.name) === norm(name);
        return '<path d="' + d + '" fill="' + (on ? '#C8922A' : '#3A3E44') + '" stroke="#1A1A1A" stroke-width="1.5" stroke-linejoin="round"/>';
      }).join('');
      var box = document.createElement('div');
      box.className = 'wvb-region-map';
      box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + name.replace(/"/g, '') + ' on a map of West Virginia">' + paths + '</svg>';
      hero.appendChild(box);
      hero.classList.add('has-wvb-map');
    })
    .catch(function () {});
})();
