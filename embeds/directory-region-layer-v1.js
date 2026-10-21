/* WVB — Directory Region Map layer adapter · v1.1 · 2026-10-20 — script half of
   embeds/directory-region-layer-v1.html, hosted so the page footer can load it by commit SHA.
   Needs region-layer-v1.js loaded first. */
(function () {
  var CANON = {
    'attraction \\ sight to see': 'attraction', 'attraction / sight to see': 'attraction',
    'sight to see': 'attraction', 'other stuff': 'other', 'motorcycle dealers': 'motorcycle dealer',
    'repair shops': 'repair shop', 'tire shops': 'tire shop', 'paint shops': 'paint shop',
    'outfitters': 'outfitter', 'tour guides': 'tour guide', 'campgrounds': 'campground',
    'restaurants': 'restaurant', 'bars': 'bar'
  };
  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function canon(v) { var r = norm(v); return CANON[r] || r; }

  function regionSel() { return document.querySelector('select[name="Regions"]'); }
  function categorySel() { return document.querySelector('select[name="Category"]'); }
  function cards() { return [].slice.call(document.querySelectorAll('.collection-item')); }
  function isAll(v) { v = norm(v); return !v || v.indexOf('all') === 0; }
  function optFor(name) {
    var s = regionSel();
    return s ? [].slice.call(s.options).filter(function (o) {
      return norm(o.value) === norm(name) || norm(o.textContent) === norm(name);
    })[0] || null : null;
  }

  function activeNames() {
    var s = regionSel();
    if (!s || isAll(s.value)) return [];
    var o = optFor(s.value);
    return [o ? o.textContent.trim() : s.value.trim()];
  }

  function countFor(name) {
    var c = categorySel(), cat = c && !isAll(c.value) ? canon(c.value) : '';
    var F = window.WVBDirFilter;   // map embed v5+: honour a link-in type filter
    return cards().filter(function (card) {
      return norm(card.getAttribute('data-region')) === norm(name)
        && (!cat || canon(card.getAttribute('data-category')) === cat)
        && (!F || F.typeOk(card));
    }).length;
  }

  function choose(name) {
    var s = regionSel();
    if (!s) return;
    var o = name ? optFor(name) : null;
    s.value = o ? o.value : s.options[0].value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitForMap(cb, tries) {
    tries = tries || 0;
    var M = window.WVBDirMap;
    if (window.WVBRegionLayer && M && M.map && M.map.getLayer && M.map.getLayer('pins')) return cb(M.map);
    if (tries > 150) { console.warn('[WVB regions] Directory map or shared region layer not ready; region layer skipped.'); return; }
    setTimeout(function () { waitForMap(cb, tries + 1); }, 100);
  }

  function boot() {
    if (!regionSel()) { console.warn('[WVB regions] No Region select on this page; skipped.'); return; }
    waitForMap(function (map) {
      var layer = WVBRegionLayer.attach({
        map: map,
        before: 'pins',
        avoidLayers: ['pins', 'pin-icons'],
        noun: ['listing', 'listings'],
        countFor: countFor,
        activeNames: activeNames,
        toggle: function (name) {
          var on = activeNames().map(norm).indexOf(norm(name)) !== -1;
          choose(on ? null : name);
        },
        setOnly: function (names) { choose(names.length ? names[0] : null); }
      });
      layer.ready.then(function (h) {
        if (!h) return;
        [regionSel(), categorySel(), document.querySelector('select[name="Type"]')].forEach(function (s) {
          if (s) s.addEventListener('change', function () { layer.refresh(); });
        });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
