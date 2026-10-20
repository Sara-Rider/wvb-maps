/* WVB — Shared Region Map Layer · v1 · 2026-10-19
   One region layer for every index map that filters by travel region
   (/events, /directory, /riding-clubs). /routes does NOT use this: its
   regions are display-only by decision, and it keeps its own drawing.

   Built from the Events Region Map layer v1.1 (2026-09-16), generalised so
   each page plugs in its own filter instead of the layer knowing about pills.

   WHAT IT DRAWS
     - a soft wash over the neighbouring states and the WV state outline
       (wv-state.geojson, the same file the Routes map uses)
     - the nine WV Tourism travel regions, shaded, outlined and named
       (regions.geojson)
     - on hover: "<Region> · N <items> · click to filter"
     - on click: toggles that region in the PAGE'S OWN filter

   WHAT IT DOES NOT DO
     It owns no filter state. The page adapter says how to read and change
     the page's filter, and calls refresh() whenever that filter changes.
     One state, no second implementation — the rule all three maps follow.

   USAGE (from a page embed, after the page's map exists)
     WVBRegionLayer.attach({
       map:          maplibre map,
       before:       'layer-id' to draw under (pins), or null when the map has none,
       avoidLayers:  ['layer-id', ...] clicks on these are not region clicks,
       noun:         ['event', 'events'],
       countFor:     function (regionName) -> number, or null for "none listed",
       activeNames:  function () -> [regionName, ...] currently selected,
       toggle:       function (regionName) — add/remove it in the page filter,
       setOnly:      function ([regionName, ...]) — make exactly these selected,
       bar:          optional { after: element } — adds the hint + Region select
                     + "Show all regions" under the map, for pages with no
                     region control of their own,
       frame:        true (default) — zoom to the selected regions
     }) -> { refresh: function () }   call refresh() after the page filter changes

   Degrades safely: if either geography file fails, the map and the page
   filter are left exactly as they were. */
(function () {
  if (window.WVBRegionLayer) return;

  var BASE = 'https://cdn.jsdelivr.net/gh/Sara-Rider/wvb-maps@main/';
  var RAW  = 'https://raw.githubusercontent.com/Sara-Rider/wvb-maps/main/';
  var SLATE = '#3D5A6B', GOLD = '#C8922A', MIST = '#F2F0EB';
  var WV = [[-82.65, 37.2], [-77.72, 40.64]];

  var CSS = ''
    + '.wvb-region-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:12px 0 0;font-family:var(--raleway),Raleway,sans-serif}'
    + '.wvb-region-hint{font-size:.85rem;color:#3D5A6B}'
    + '.wvb-region-hint b{color:#1A1A1A;font-weight:700}'
    + '.wvb-region-bar label{font-size:.74rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3D5A6B}'
    + '.wvb-region-select{appearance:none;-webkit-appearance:none;min-height:40px;padding:8px 36px 8px 12px;border:1px solid #3D5A6B;border-radius:6px;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' fill=\'none\' stroke=\'%23C8922A\' stroke-width=\'2\'/%3E%3C/svg%3E") no-repeat right 12px center;font:inherit;font-size:.9rem;font-weight:600;color:#1A1A1A;cursor:pointer}'
    + '.wvb-region-select:focus-visible{outline:2px solid #C8922A;outline-offset:2px}'
    + '.wvb-region-clear{border:0;background:none;padding:4px 0;font:inherit;font-size:.85rem;font-weight:700;color:#C8922A;cursor:pointer;text-decoration:underline}'
    + '.wvb-region-tip .maplibregl-popup-content{padding:8px 11px;border-radius:4px;font-family:var(--raleway),Raleway,sans-serif;font-size:.82rem;line-height:1.3;color:#1A1A1A;box-shadow:0 4px 14px rgba(26,26,26,.18)}'
    + '.wvb-region-tip .maplibregl-popup-tip{display:none}'
    + '.wvb-region-tip small{display:block;color:#3D5A6B;font-weight:600}';

  function addCss() {
    if (document.getElementById('wvb-region-layer-css')) return;
    var s = document.createElement('style');
    s.id = 'wvb-region-layer-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function getJSON(file) {
    return fetch(BASE + file, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () {
        return fetch(RAW + file, { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
      });
  }

  // Both files are fetched once per page, however many times attach() runs.
  var geo = null;
  function geography() {
    if (!geo) {
      geo = Promise.all([
        getJSON('regions.geojson'),
        getJSON('wv-state.geojson').catch(function (e) {
          console.warn('[WVB regions] wv-state.geojson failed; regions drawn without the state outline.', e);
          return null;
        })
      ]);
    }
    return geo;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function bbox(g, b) {
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (poly) {
      poly[0].forEach(function (c) { b.extend(c); });
    });
  }

  function draw(o, fc, state) {
    var map = o.map, feats = fc.features;
    var before = o.before && map.getLayer(o.before) ? o.before : undefined;

    if (state && state.features) {
      var mask = state.features.filter(function (f) { return f.properties.kind === 'mask'; });
      var outline = state.features.filter(function (f) { return f.properties.kind === 'outline'; });
      map.addSource('wvb-wv-mask', { type: 'geojson', data: { type: 'FeatureCollection', features: mask } });
      map.addSource('wvb-wv-outline', { type: 'geojson', data: { type: 'FeatureCollection', features: outline } });
      map.addLayer({ id: 'wvb-wv-mask', type: 'fill', source: 'wvb-wv-mask',
        paint: { 'fill-color': MIST, 'fill-opacity': 0.55 } }, before);
    }

    var labels = { type: 'FeatureCollection', features: feats.map(function (f) {
      return { type: 'Feature', properties: { name: f.properties.name },
               geometry: { type: 'Point', coordinates: [f.properties.labelLng, f.properties.labelLat] } };
    }) };
    map.addSource('wvb-regions', { type: 'geojson', data: fc, promoteId: 'slug' });
    map.addSource('wvb-region-labels', { type: 'geojson', data: labels });

    map.addLayer({ id: 'wvb-region-fill', type: 'fill', source: 'wvb-regions', paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], GOLD, SLATE],
      'fill-opacity': ['case',
        ['boolean', ['feature-state', 'selected'], false], 0.22,
        ['boolean', ['feature-state', 'hover'], false], 0.2,
        ['boolean', ['feature-state', 'dim'], false], 0.02,
        0.08]
    } }, before);
    map.addLayer({ id: 'wvb-region-line', type: 'line', source: 'wvb-regions', paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], GOLD, SLATE],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1],
      'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 0.7]
    } }, before);

    if (state && state.features) {
      map.addLayer({ id: 'wvb-wv-outline', type: 'line', source: 'wvb-wv-outline',
        paint: { 'line-color': SLATE, 'line-width': 2.2, 'line-opacity': 0.85 } }, before);
    }

    map.addLayer({ id: 'wvb-region-label', type: 'symbol', source: 'wvb-region-labels', layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11,
      'text-transform': 'uppercase', 'text-letter-spacing': 0.06, 'text-max-width': 8,
      'text-allow-overlap': false
    }, paint: { 'text-color': SLATE, 'text-halo-color': MIST, 'text-halo-width': 1.6 } }, before);
  }

  function start(o, fc, state) {
    var map = o.map, feats = (fc && fc.features) || [];
    var one = o.noun ? o.noun[0] : 'item', many = o.noun ? o.noun[1] : 'items';
    if (!feats.length) { console.warn('[WVB regions] regions.geojson is empty; skipped.'); return null; }

    draw(o, fc, state);

    var slugByName = {}, names = [];
    feats.forEach(function (f) { slugByName[f.properties.name] = f.properties.slug; names.push(f.properties.name); });

    // Optional bar under the map, for pages with no region control of their own.
    var sel = null, clr = null;
    if (o.bar && o.bar.after) {
      var bar = document.createElement('div');
      bar.className = 'wvb-region-bar';
      bar.innerHTML = '<span class="wvb-region-hint">Tap a <b>region</b> on the map to filter ' + esc(many) + '.</span>'
        + '<label for="wvb-region-select">Region</label>'
        + '<select id="wvb-region-select" class="wvb-region-select"></select>'
        + '<button type="button" class="wvb-region-clear" hidden>Show all regions</button>';
      o.bar.after.parentNode.insertBefore(bar, o.bar.after.nextSibling);
      sel = bar.querySelector('select');
      clr = bar.querySelector('.wvb-region-clear');
      sel.addEventListener('change', function () {
        if (sel.value === '__multi') return;
        o.setOnly(sel.value ? [sel.value] : []);
      });
      clr.addEventListener('click', function () { o.setOnly([]); });
    }

    function buildSelect(active) {
      if (!sel) return;
      var extra = (o.extraNames ? o.extraNames() : []).filter(function (n) { return names.indexOf(n) === -1; });
      var html = '<option value="">All regions</option>';
      if (active.length > 1) html += '<option value="__multi" selected>' + active.length + ' regions selected</option>';
      names.concat(extra).forEach(function (n) {
        var c = o.countFor(n);
        html += '<option value="' + esc(n) + '"' + (c === null ? ' disabled' : '')
          + (active.length === 1 && active[0] === n ? ' selected' : '') + '>'
          + esc(n) + (c !== null ? ' (' + c + ')' : ' (no ' + esc(many) + ')') + '</option>';
      });
      sel.innerHTML = html;
      if (!active.length) sel.value = '';
    }

    var lastKey = null;
    function frame(active) {
      if (o.frame === false) return;
      if (active.some(function (n) { return names.indexOf(n) === -1; })) return; // e.g. Out of State: keep the page's own fit
      var b = new maplibregl.LngLatBounds(), n = 0;
      feats.forEach(function (f) { if (active.indexOf(f.properties.name) !== -1) { bbox(f.geometry, b); n++; } });
      map.fitBounds(n ? b : WV, { padding: 36, duration: 650 });
    }

    function refresh() {
      var active = o.activeNames();
      names.forEach(function (n) {
        var on = active.indexOf(n) !== -1;
        map.setFeatureState({ source: 'wvb-regions', id: slugByName[n] }, { selected: on, dim: active.length > 0 && !on });
      });
      buildSelect(active);
      if (clr) clr.hidden = !active.length;
      var key = active.slice().sort().join('|');
      // Runs just after the page map's own fit, so the regions win the framing.
      // While regions are selected, re-frame on every refresh too: the page map refits to its
      // pins after each filter change, which is very tight when a region has one item.
      if (key !== lastKey || active.length) { lastKey = key; setTimeout(function () { frame(active); }, 120); }
    }

    var avoid = (o.avoidLayers || []).filter(function (id) { return map.getLayer(id); });
    function onPin(e) { return avoid.length && map.queryRenderedFeatures(e.point, { layers: avoid }).length > 0; }

    var hoverId = null;
    var tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'wvb-region-tip' });

    map.on('mousemove', 'wvb-region-fill', function (e) {
      if (onPin(e)) { tip.remove(); return; }
      var f = e.features[0], id = f.properties.slug, n = f.properties.name;
      if (hoverId !== null && hoverId !== id) map.setFeatureState({ source: 'wvb-regions', id: hoverId }, { hover: false });
      hoverId = id;
      map.setFeatureState({ source: 'wvb-regions', id: id }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';
      var c = o.countFor(n), on = o.activeNames().indexOf(n) !== -1;
      tip.setLngLat(e.lngLat).setHTML('<strong>' + esc(n) + '</strong><small>'
        + (c === null || c === 0 ? 'No ' + esc(many) + ' yet' : c + ' ' + esc(c === 1 ? one : many)) + ' · '
        + (on ? 'click to remove' : 'click to filter') + '</small>').addTo(map);
    });
    map.on('mouseleave', 'wvb-region-fill', function () {
      if (hoverId !== null) map.setFeatureState({ source: 'wvb-regions', id: hoverId }, { hover: false });
      hoverId = null; tip.remove(); map.getCanvas().style.cursor = '';
    });
    map.on('click', 'wvb-region-fill', function (e) {
      if (onPin(e)) return;
      o.toggle(e.features[0].properties.name);
    });

    lastKey = o.activeNames().slice().sort().join('|');
    refresh();
    return { refresh: refresh, names: names };
  }

  window.WVBRegionLayer = {
    version: 1,
    attach: function (o) {
      addCss();
      var handle = { refresh: function () {}, ready: null };
      handle.ready = geography().then(function (r) {
        var fc = r[0], state = r[1];
        return new Promise(function (resolve) {
          function go() { var h = start(o, fc, state); if (h) handle.refresh = h.refresh; resolve(h); }
          if (o.map.isStyleLoaded()) go(); else o.map.once('idle', go);
        });
      }).catch(function (e) {
        console.warn('[WVB regions] regions.geojson failed to load; the page filter is unchanged.', e);
        return null;
      });
      return handle;
    }
  };
})();
