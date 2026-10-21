/* WVB — Directory Index Map · v6 · 2026-10-21 — script half.
   v6: an Attraction Type dropdown (select[name="Type"], an Embed in the filter bar) shows when
   Category is Attraction. Picking a type sets Category to Attraction. ?type= links set it too.
   The "Showing …" chip is only used when the page has no Type dropdown.
   Loaded by the /directory map Embed (embeds/directory-index-map-v5.html) from jsDelivr by commit SHA.
   See the .html file for what v5 does. */
(function () {
  var FEED     = 'https://cdn.jsdelivr.net/gh/Sara-Rider/wvb-maps@main/directory.geojson';
  var FEED_RAW = 'https://raw.githubusercontent.com/Sara-Rider/wvb-maps/main/directory.geojson';
  var STYLE    = 'https://tiles.openfreemap.org/styles/liberty';
  var CENTER   = [-80.55, 38.85], ZOOM = 6.3;
  var SLATE = '#3D5A6B', GOLD = '#C8922A', MIST = '#F2F0EB';

  /* ---- Canonical glyph set — 15 tokens ------------------------------
     Ported verbatim from tools/render-map/render-batch.mjs, so a map pin
     and its card tile draw the same mark. Do not add a token here that
     does not exist there. */
  var GLYPH = {
      'historic':     '<path d="M12 3l8 4.5H4z"/><path d="M7 7.5v9"/><path d="M12 7.5v9"/><path d="M17 7.5v9"/><path d="M4.5 16.5h15"/><path d="M3 20h18"/>',
    'overlook':    '<circle cx="7.5" cy="15" r="4"/><circle cx="16.5" cy="15" r="4"/><path d="M7.5 11V7"/><path d="M16.5 11V7"/><path d="M7.5 7h9"/>',
    'waterfall':   '<path d="M12 3c2.5 3.5 5 6.7 5 9a5 5 0 0 1-10 0c0-2.3 2.5-5.5 5-9z"/>',
    'bridge':      '<path d="M3 17v-3a9 9 0 0 1 18 0v3"/><path d="M3 14h18"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
    'monument':    '<path d="M5 9h14l-7-6z"/><path d="M9 9v10"/><path d="M15 9v10"/><path d="M6 21h12"/>',
    'park':        '<path d="M12 3l4.5 7H14l3.5 5.5H15L18 20H6l3-4.5H6.5L10 10H7.5z"/><path d="M12 20v2"/>',
    'scenic-road': '<path d="M17 4a2.5 2.5 0 1 1 0 5h-4a2.5 2.5 0 1 0 0 5h4a2.5 2.5 0 1 1 0 5H7"/>',
    'historic': '<path d="M12 3l8 4.5H4z"/><path d="M7 7.5v9"/><path d="M12 7.5v9"/><path d="M17 7.5v9"/><path d="M4.5 16.5h15"/><path d="M3 20h18"/>',
    'swing':       '<path d="M4 4h16"/><path d="M8 4v6"/><path d="M16 4v6"/><path d="M7 10h10v3H7z"/><path d="M9 13v4"/><path d="M15 13v4"/>',
    'lodging':     '<path d="M4 8v10"/><path d="M4 14h16"/><path d="M20 18v-4a2 2 0 0 0-2-2h-8v2"/><circle cx="7.5" cy="11" r="1.5"/>',
    'food':        '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/><path d="M16 3c-1.5 1.2-2 3.5-2 6 0 1.7 1 2.5 2 2.5V3"/><path d="M16 11.5V21"/>',
    'camping':     '<path d="M12 4l8 15H4z"/><path d="M12 4v15"/>',
    'moto':        '<path d="M15 6.5a3.5 3.5 0 0 0-4.7 4.6L4 17.5 6.5 20l6.4-6.3A3.5 3.5 0 0 0 17.5 9l-2 2-1.5-1.5z"/>',
    'fuel':        '<path d="M5 20V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15"/><path d="M4 20h11"/><path d="M7 8h5"/><path d="M14 10l3 3v4a2 2 0 0 0 4 0V8l-3-3"/>',
    'guides':      '<circle cx="12" cy="12" r="8.5"/><path d="M15 9l-4.5 1.5L9 15l4.5-1.5z"/>',
    'other':       '<circle cx="12" cy="12" r="3.2"/>',
    'attraction':  '<path d="M12 3l2.5 6H21l-5 4 2 6.5L12 15l-6 4.5 2-6.5-5-4h6.5z"/>'
  };

  function markSVG(token) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"'
      + ' viewBox="0 0 24 24" fill="none" stroke="' + MIST + '" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round">' + GLYPH[token] + '</svg>';
  }

  // Generated from GLYPH so the token list has exactly one home.
  function iconImageExpression() {
    var expr = ['match', ['get', 'glyph']];
    Object.keys(GLYPH).forEach(function (t) { expr.push(t, 'wvb-' + t); });
    expr.push('wvb-other');
    return expr;
  }

  /* ---- Category canonicaliser ---------------------------------------
     Three surfaces name the same category three ways, so all three are
     folded to one canonical token before any comparison:

       select option      Attraction              (canonical, corrected)
       card attribute     Attraction \ Sight to See   (CMS option name)
       feed property      Attraction              (canonical)

     Verified live 2026-08-19. The Directory collection's Business
     Category option names are `Attraction \ Sight to See`,
     `Motorcycle Dealers` and `Repair Shops`; the cards render those
     names verbatim, which is why a category selection matched zero
     cards while pins filtered correctly.

     Renaming the three CMS options to the canonical singulars is the
     real fix and is Designer-only — the Data API cannot write option
     names. This map exists so the filter survives that rename in either
     direction: canonical inputs pass through untouched. Divergences are
     logged once per page so the underlying defect stays visible. */
  var CANON = {
    'attraction \\ sight to see': 'attraction',
    'attraction / sight to see': 'attraction',
    'sight to see':              'attraction',
    'other stuff':               'other',
    'motorcycle dealers':        'motorcycle dealer',
    'repair shops':              'repair shop',
    'tire shops':                'tire shop',
    'paint shops':               'paint shop',
    'outfitters':                'outfitter',
    'tour guides':               'tour guide',
    'campgrounds':               'campground',
    'restaurants':               'restaurant',
    'bars':                      'bar'
  };

  /* ---- Attraction Type → glyph token (v5) ---------------------------
     Cards carry the CMS option name (data-type); the feed carries the
     glyph token (type). Both fold to the token. LABEL is what the chip
     says. */
  var TYPE_TOKEN = {
    'covered bridge': 'bridge', 'swing': 'swing', 'waterfall': 'waterfall',
    'overlook': 'overlook', 'monument': 'monument', 'park/nature': 'park',
    'scenic road/byway': 'scenic-road', 'historic site': 'historic'
  };
  var TYPE_LABEL = {
    bridge: 'covered bridges', swing: 'swings', waterfall: 'waterfalls',
    overlook: 'overlooks', monument: 'monuments', park: 'parks',
    'scenic-road': 'scenic roads', historic: 'historic sites'
  };

  var seenDivergence = {};

  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  function canonCat(v, where) {
    var raw = norm(v);
    if (!CANON[raw]) return raw;
    if (!seenDivergence[raw]) {
      seenDivergence[raw] = 1;
      console.warn('[WVB map] Category "' + String(v).trim() + '" (' + where
        + ') is not the canonical name; folded to "' + CANON[raw] + '". '
        + 'Rename the CMS option to remove this.');
    }
    return CANON[raw];
  }

  function cardType(card) {
    var raw = norm(card.getAttribute('data-type'));
    return TYPE_TOKEN[raw] || raw;
  }

  function selectValue(el, isCategory) {
    var v = norm(el && el.value);
    if (!v || v.indexOf('all') === 0) return '';
    return isCategory ? canonCat(el.value, 'select option') : v;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- ONE controller, one state ------------------------------------
  var state = { region: '', category: '', types: [] };
  var cards = [];
  var note  = null;
  var onStateChange = function () {};   // replaced once the map is ready

  function typeOk(card) {
    return !state.types.length || state.types.indexOf(cardType(card)) !== -1;
  }

  function cardMatches(card) {
    var okR = !state.region
      || norm(card.getAttribute('data-region')) === state.region;
    var okC = !state.category
      || canonCat(card.getAttribute('data-category'), 'card attribute') === state.category;
    return okR && okC && typeOk(card);
  }

  // Read by the region layer adapter so region counts honour the type filter.
  window.WVBDirFilter = { typeOk: typeOk, state: state };

  // The card's business name is the only key it shares with the feed. Its
  // one anchor points at /directory, not at the listing, so there is no
  // slug in the markup to join on. Used by the audit and the orphan
  // warning only — filtering never depends on it.
  function cardName(card) {
    var h = card.querySelector('.card-title');
    return norm(h && h.textContent);
  }

  function applyCards() {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = cardMatches(c);
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    return shown;
  }

  function apply(fit) {
    var shownCards = applyCards();
    onStateChange(fit);
    if (note && !note.dataset.mapDriven) {
      note.textContent = shownCards + (shownCards === 1 ? ' listing' : ' listings');
    }
  }

  // ---- Link-in filters (v5) -----------------------------------------
  function typeSel() { return document.querySelector('select[name="Type"]'); }
  function attractionOpt() {
    var sel = document.querySelector('select[name="Category"]');
    return sel ? [].slice.call(sel.options).filter(function (o) {
      return canonCat(o.value || o.textContent, 'select option') === 'attraction';
    })[0] || null : null;
  }
  function typeLabel(types) {
    var words = types.map(function (t) { return TYPE_LABEL[t] || t; });
    return words.length > 1
      ? words.slice(0, -1).join(', ') + ' & ' + words[words.length - 1]
      : words[0];
  }

  // Show the Type dropdown for attractions (or while a type filter is on) and keep it in step.
  function syncTypeUI() {
    var ts = typeSel();
    if (!ts) return;
    var v = state.types.join(',');
    if (v && ![].some.call(ts.options, function (o) { return o.value === v; })) {
      var o = document.createElement('option');
      var l = typeLabel(state.types);
      o.value = v; o.textContent = l.charAt(0).toUpperCase() + l.slice(1);
      ts.appendChild(o);
    }
    ts.value = v;
    var box = ts.closest('.wvb-type-wrap') || ts;
    box.style.display = (state.category === 'attraction' || state.types.length) ? '' : 'none';
  }

  function paintChip() {
    var chip = document.getElementById('wvb-dir-chip');
    syncTypeUI();
    if (!chip) return;
    if (typeSel() || !state.types.length) { chip.hidden = true; return; }
    document.getElementById('wvb-dir-chip-text').textContent =
      'Showing ' + typeLabel(state.types);
    chip.hidden = false;
  }

  function dropTypeParam() {
    try {
      var u = new URL(window.location.href);
      if (!u.searchParams.has('type')) return;
      u.searchParams.delete('type');
      window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }

  function clearTypes() {
    if (!state.types.length) return;
    state.types = [];
    dropTypeParam();
    paintChip();
  }

  function readUrl() {
    var p;
    try { p = new URLSearchParams(window.location.search); } catch (e) { return false; }
    var used = false;

    var cat = norm(p.get('category'));
    var sel = document.querySelector('select[name="Category"]');
    if (cat && sel) {
      var want = CANON[cat] || cat;
      var opt = [].slice.call(sel.options).filter(function (o) {
        var v = norm(o.value || o.textContent);
        return (CANON[v] || v) === want;
      })[0];
      if (opt) { sel.value = opt.value; used = true; }
      else console.warn('[WVB map] ?category=' + cat + ' matches no Category option.');
    }

    var types = norm(p.get('type')).split(',').map(function (t) { return t.trim(); })
      .filter(function (t) { return TYPE_LABEL[t]; });
    if (types.length) {
      state.types = types; used = true;
      // With a Type dropdown on the page, a type link also selects Attraction, so the dropdown shows.
      var ao = attractionOpt();
      if (typeSel() && ao && sel) sel.value = ao.value;
    }
    return used;
  }

  function bindSelects() {
    ['Regions', 'Category'].forEach(function (name) {
      var el = document.querySelector('select[name="' + name + '"]');
      if (!el) {
        console.warn('[WVB map] No select found for name "' + name + '".');
        return;
      }
      var isCategory = (name === 'Category');
      el.addEventListener('change', function () {
        if (isCategory) { state.category = selectValue(el, true); clearTypes(); syncTypeUI(); }
        else            state.region   = selectValue(el, false);
        apply(true);
      });
      // Honour any value the browser restored on reload, or the link-in filter.
      if (isCategory) state.category = selectValue(el, true);
      else            state.region   = selectValue(el, false);
    });
    paintChip();

    var ts = typeSel();
    if (ts) ts.addEventListener('change', function () {
      state.types = ts.value ? ts.value.split(',') : [];
      if (state.types.length && state.category !== 'attraction') {
        var cs = document.querySelector('select[name="Category"]'), ao = attractionOpt();
        if (cs && ao) { cs.value = ao.value; state.category = 'attraction'; }
      }
      dropTypeParam();
      paintChip();
      apply(true);
    });

    var clear = document.getElementById('wvb-dir-chip-clear');
    if (clear) clear.addEventListener('click', function () {
      clearTypes();
      apply(true);
      // Let anything listening on the selects (the region layer) redraw.
      var r = document.querySelector('select[name="Regions"]');
      if (r) r.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // ---- Map layer (added only if the feed loads) ---------------------
  function startMap(fc, fitFirst) {
    var features = (fc && fc.features) || [];
    var wrap = document.getElementById('wvb-dir-map-wrap');

    if (!features.length) {
      document.getElementById('wvb-dir-map').style.display = 'none';
      console.warn('[WVB map] Feed empty. Map hidden; card filtering unaffected.');
      return;
    }
    if (typeof maplibregl === 'undefined') {
      document.getElementById('wvb-dir-map').style.display = 'none';
      console.warn('[WVB map] MapLibre failed to load. Map hidden; card filtering unaffected.');
      return;
    }

    var unknown = [];
    features.forEach(function (f) {
      var t = f.properties && f.properties.type;
      f.properties.glyph = GLYPH[t] ? t : 'other';
      if (t && !GLYPH[t] && unknown.indexOf(t) === -1) unknown.push(t);
    });
    if (unknown.length) {
      console.warn('[WVB map] Unmapped type token(s), drawing `other`:', unknown);
    }

    // A card with no feed entry is legitimate (no coordinate yet). A feed
    // entry with no card means the feed is stale — that is worth saying.
    var byName = {};
    cards.forEach(function (c) {
      var n = cardName(c);
      if (n) byName[n] = c;
    });
    var orphans = features.filter(function (f) {
      return !byName[norm(f.properties.name)];
    }).length;
    if (orphans) {
      console.warn('[WVB map] ' + orphans + ' feed features have no matching card. '
        + 'The feed is probably stale — regenerate it and purge the jsDelivr cache.');
    }

    var map = new maplibregl.Map({
      container: 'wvb-dir-map', style: STYLE, center: CENTER, zoom: ZOOM,
      cooperativeGestures: true,               // one-finger drag scrolls the page
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    var popup = new maplibregl.Popup({ closeButton: true, offset: 14 });

    function shownFeatures() {
      return features.filter(function (f) {
        var p = f.properties;
        return (!state.region   || norm(p.region) === state.region)
            && (!state.category || canonCat(p.category, 'feed property') === state.category)
            && (!state.types.length || state.types.indexOf(norm(p.type)) !== -1);
      });
    }

    function draw(fit) {
      var shown = shownFeatures();
      map.getSource('wvb-listings').setData({ type: 'FeatureCollection', features: shown });
      note.dataset.mapDriven = '1';
      note.textContent = shown.length + (shown.length === 1 ? ' listing' : ' listings')
        + ' on the map';
      popup.remove();
      if (fit !== false && shown.length) {
        var b = new maplibregl.LngLatBounds();
        shown.forEach(function (f) { b.extend(f.geometry.coordinates); });
        map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 600 });
      }
    }

    map.on('load', function () {
      Object.keys(GLYPH).forEach(function (token) {
        var name = 'wvb-' + token;
        var img = new Image(48, 48);
        img.onload = function () {
          try { if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 }); } catch (e) {}
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markSVG(token));
      });

      map.addSource('wvb-listings', {
        type: 'geojson', promoteId: 'slug',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'pins', type: 'circle', source: 'wvb-listings',
        paint: {
          'circle-radius': ['case', ['get', 'certified'], 13, 10],
          'circle-color': SLATE,
          'circle-stroke-width': ['case', ['get', 'certified'], 3, 1.5],
          'circle-stroke-color': ['case', ['get', 'certified'], GOLD, MIST]
        }
      });

      map.addLayer({
        id: 'pin-icons', type: 'symbol', source: 'wvb-listings',
        layout: {
          'icon-image': iconImageExpression(),
          'icon-size': ['case', ['get', 'certified'], 0.46, 0.38],
          'icon-allow-overlap': true, 'icon-ignore-placement': true
        }
      });

      ['pins', 'pin-icons'].forEach(function (layer) {
        map.on('click', layer, function (e) {
          var p = e.features[0].properties;
          var cert = p.certified === true || p.certified === 'true';
          var links = ['<a href="' + esc(p.url) + '">View listing &rarr;</a>'];
          if (p.maps) links.push('<a href="' + esc(p.maps) + '" target="_blank" rel="noopener">Directions</a>');
          popup.setLngLat(e.features[0].geometry.coordinates)
               .setHTML(
                 '<div class="wvb-pop-name">' + esc(p.name)
                   + (cert ? '<span class="wvb-pop-badge">Certified</span>' : '') + '</div>'
                 + '<div class="wvb-pop-cat">' + esc(p.category)
                   + (p.county ? ' &middot; ' + esc(p.county) : '') + '</div>'
                 + '<div class="wvb-pop-links">' + links.join(' &middot; ') + '</div>'
               ).addTo(map);
        });
        map.on('mouseenter', layer, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, function () { map.getCanvas().style.cursor = ''; });
      });

      onStateChange = draw;      // pins now follow the shared state
      draw(fitFirst ? true : false);

      // Audit helper. Compares pins against cards that actually have a feed
      // entry, so a listing without coordinates is not reported as a failure.
      window.WVBDirMap = {
        map: map,
        audit: function () {
          var visible = cards.filter(function (c) { return c.style.display !== 'none'; });
          var mapped = visible.filter(function (c) {
            var n = cardName(c);
            return features.some(function (f) { return norm(f.properties.name) === n; });
          });
          var pins = shownFeatures().length;
          return {
            filter: { region: state.region || '(all)', category: state.category || '(all)',
                      types: state.types.length ? state.types.join(',') : '(all)' },
            cardsVisible: visible.length,
            cardsWithFeedEntry: mapped.length,
            pins: pins,
            match: mapped.length === pins
          };
        }
      };
    });
  }

  function getFeed() {
    return fetch(FEED, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () {
        // jsDelivr 404s on a cold cache immediately after a fresh commit.
        console.warn('[WVB map] jsDelivr feed unavailable; falling back to raw.');
        return fetch(FEED_RAW, { cache: 'no-store' }).then(function (r) { return r.json(); });
      });
  }

  function boot() {
    cards = [].slice.call(document.querySelectorAll('.collection-item'));
    note  = document.getElementById('wvb-dir-map-note');

    if (!cards.length) {
      console.warn('[WVB map] No .collection-item cards found.');
    }

    // Filtering works from here on, with or without a map.
    var linkedIn = readUrl();   // before bindSelects, so the select reads the linked value
    bindSelects();
    apply(false);

    getFeed().then(function (fc) { startMap(fc, linkedIn); }).catch(function (e) {
      document.getElementById('wvb-dir-map').style.display = 'none';
      console.warn('[WVB map] Feed fetch failed. Map hidden; card filtering unaffected.', e);
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
