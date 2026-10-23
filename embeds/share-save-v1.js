/* WEST VIRGINIA BIKERS — Share & Save · v1 · 2026-10-22
   Loaded site-wide (Webflow site script, footer).

   SHARE — on every detail page (stop, route, event, story, club, charity, region)
     * Phones / Safari / Edge: the device's own share sheet (navigator.share).
     * Elsewhere: a small menu — Copy link, Facebook, Email, Text.
   SAVE — the same pages get a Save toggle. Saved items live in this browser
     (localStorage), no account. A "Saved (n)" pill appears bottom-right once
     anything is saved, linking to /saved.
   /saved — renders into any element with [data-wvb-saved]:
     * the list, grouped by type, with Remove
     * "Share my list"  -> /saved?list=<encoded>  (opens on any device, for anyone)
     * "Email me my list" -> the rider's own email app, list pre-filled (mailto)
     * a shared list (?list=) shows with "Add these to my list"
   PLACEMENT — buttons go into [data-wvb-actions] if the template has one;
     otherwise right after the page's H1.
   ANALYTICS — gtag events: share {method, content_type, item_id},
     add_to_wishlist / remove_from_wishlist, share_list.
   Nothing here touches the CMS, filters or maps. If it fails, pages are unchanged. */
(function () {
  if (window.WVBShareSave) return;
  var KEY = 'wvb-saved-v1';
  var TYPES = {
    directory: { label: 'Stop', plural: 'Stops' },
    routes: { label: 'Route', plural: 'Routes' },
    events: { label: 'Event', plural: 'Events' },
    articles: { label: 'Story', plural: 'Stories' },
    'riding-clubs': { label: 'Club', plural: 'Clubs' },
    charities: { label: 'Charity', plural: 'Charities' },
    'travel-regions': { label: 'Region', plural: 'Regions' }
  };
  var ORDER = ['routes', 'directory', 'events', 'articles', 'travel-regions', 'riding-clubs', 'charities'];
  var NEWSLETTER = 'https://west-virginia-bikers.beehiiv.com/subscribe';

  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ---------- storage ----------
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} renderPill(); }
  function keyOf(i) { return i.t + '/' + i.s; }
  function isSaved(i) { return load().some(function (x) { return keyOf(x) === keyOf(i); }); }
  function add(i) { var l = load(); if (!l.some(function (x) { return keyOf(x) === keyOf(i); })) { l.push(i); store(l); } }
  function remove(i) { store(load().filter(function (x) { return keyOf(x) !== keyOf(i); })); }

  // ---------- list <-> link ----------
  function b64u(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function encodeList(l) { return b64u(JSON.stringify(l.map(function (i) { return [i.t, i.s, i.n]; }))); }
  function decodeList(s) {
    try {
      return JSON.parse(unb64u(s)).filter(function (a) { return a && TYPES[a[0]] && /^[a-z0-9-]+$/.test(a[1]); })
        .map(function (a) { return { t: a[0], s: a[1], n: String(a[2] || a[1]).slice(0, 140) }; });
    } catch (e) { return []; }
  }
  function urlOf(i) { return location.origin + '/' + i.t + '/' + i.s; }
  function listText(l) {
    return l.map(function (i) { return '• ' + i.n + ' (' + TYPES[i.t].label + ')\n  ' + urlOf(i); }).join('\n');
  }

  // ---------- this page ----------
  function current() {
    var p = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (p.length !== 2 || !TYPES[p[0]]) return null;
    var h1 = document.querySelector('h1');
    var name = (h1 && h1.textContent.trim()) || document.title.split('|')[0].trim();
    return { t: p[0], s: p[1], n: name.replace(/\s+/g, ' ').slice(0, 140) };
  }

  // ---------- styles ----------
  var CSS = ''
    + '.wvb-ss{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 0;font-family:var(--raleway),Raleway,sans-serif;position:relative}'
    + '.wvb-ss-btn{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:8px 16px;border-radius:6px;border:1px solid currentColor;background:transparent;font:inherit;font-size:.9rem;font-weight:700;cursor:pointer;line-height:1;text-decoration:none}'
    + '.wvb-ss-btn svg{width:18px;height:18px;flex:none}'
    + '.wvb-ss.on-dark .wvb-ss-btn{color:#F2F0EB;border-color:rgba(242,240,235,.55)}'
    + '.wvb-ss.on-light .wvb-ss-btn{color:#3D5A6B;border-color:rgba(61,90,107,.5)}'
    + '.wvb-ss-btn:hover,.wvb-ss-btn:focus-visible{border-color:#C8922A;outline:none}'
    + '.wvb-ss-btn:focus-visible{box-shadow:0 0 0 2px rgba(200,146,42,.5)}'
    + '.wvb-ss-btn.is-saved{background:#C8922A;border-color:#C8922A;color:#1A1A1A}'
    + '.wvb-ss-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:50;min-width:210px;background:#fff;border-radius:6px;box-shadow:0 8px 26px rgba(0,0,0,.25);padding:6px;display:none}'
    + '.wvb-ss-menu.is-open{display:block}'
    + '.wvb-ss-menu a,.wvb-ss-menu button{display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:none;border-radius:4px;font:inherit;font-size:.9rem;font-weight:600;color:#1A1A1A;text-decoration:none;cursor:pointer}'
    + '.wvb-ss-menu a:hover,.wvb-ss-menu button:hover{background:#F2F0EB}'
    + '.wvb-ss-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1A1A1A;color:#F2F0EB;padding:10px 16px;border-radius:6px;font-family:var(--raleway),Raleway,sans-serif;font-size:.9rem;z-index:9999;opacity:0;transition:opacity .2s}'
    + '.wvb-ss-toast.is-on{opacity:1}'
    + '.wvb-saved-pill{position:fixed;right:18px;bottom:18px;z-index:900;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:#2B414D;color:#F2F0EB;border:1px solid #C8922A;font-family:var(--raleway),Raleway,sans-serif;font-weight:700;font-size:.9rem;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.25)}'
    + '.wvb-saved-pill:hover{background:#3D5A6B}'
    + '.wvb-saved-pill svg{width:16px;height:16px}'
    + '.wvb-saved{font-family:var(--raleway),Raleway,sans-serif;color:#1A1A1A}'
    + '.wvb-saved h3{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#3D5A6B;margin:28px 0 8px}'
    + '.wvb-saved-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(61,90,107,.18);border-left:3px solid transparent}'
    + '.wvb-saved-row:hover{border-left-color:#C8922A;background:rgba(200,146,42,.06)}'
    + '.wvb-saved-row a{color:#1A1A1A;font-weight:700;text-decoration:none}'
    + '.wvb-saved-row a:hover{text-decoration:underline}'
    + '.wvb-saved-x{border:0;background:none;color:#55554E;font:inherit;font-size:.85rem;cursor:pointer;text-decoration:underline}'
    + '.wvb-saved-bar{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 4px}'
    + '.wvb-saved-bar .wvb-ss-btn{color:#3D5A6B;border-color:rgba(61,90,107,.5)}'
    + '.wvb-saved-bar .is-primary{background:#C8922A;border-color:#C8922A;color:#1A1A1A}'
    + '.wvb-saved-note{color:#55554E;font-size:.9rem;line-height:1.55;max-width:60ch}'
    + '.wvb-saved-note a{color:#3D5A6B;font-weight:700}'
    + '.wvb-saved-shared{padding:16px;border:1px solid rgba(200,146,42,.6);border-radius:6px;background:rgba(200,146,42,.06);margin:0 0 24px}';
  function addCss() { if (document.getElementById('wvb-ss-css')) return; var s = document.createElement('style'); s.id = 'wvb-ss-css'; s.textContent = CSS; document.head.appendChild(s); }

  var ICON = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    saved: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>'
  };

  function toast(msg) {
    var t = document.querySelector('.wvb-ss-toast');
    if (!t) { t = document.createElement('div'); t.className = 'wvb-ss-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('is-on'); }, 2200);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res) { var a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); res(); });
  }

  // Dark or light behind the buttons? (hero bands are dark, page body is light)
  function isDark(el) {
    while (el && el !== document.documentElement) {
      var cs = getComputedStyle(el);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
      var m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) { var v = m[1].split(',').map(parseFloat); if (v.length < 4 || v[3] > 0.5) return (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]) < 140; }
      el = el.parentElement;
    }
    return false;
  }

  // ---------- share (one page or a list) ----------
  function shareMenu(anchor, data, kind) {
    var menu = document.createElement('div');
    menu.className = 'wvb-ss-menu';
    var enc = encodeURIComponent;
    menu.innerHTML = '<button type="button" data-m="copy">Copy link</button>'
      + '<a data-m="facebook" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + enc(data.url) + '">Facebook</a>'
      + '<a data-m="email" href="mailto:?subject=' + enc(data.title) + '&body=' + enc(data.text + '\n\n' + data.url) + '">Email</a>'
      + '<a data-m="sms" href="sms:?&body=' + enc(data.title + ' ' + data.url) + '">Text message</a>';
    anchor.parentNode.appendChild(menu);
    menu.addEventListener('click', function (e) {
      var m = e.target.closest('[data-m]'); if (!m) return;
      track(kind === 'list' ? 'share_list' : 'share', { method: m.getAttribute('data-m'), content_type: data.type, item_id: data.id });
      if (m.getAttribute('data-m') === 'copy') { e.preventDefault(); copy(data.url).then(function () { toast('Link copied'); }); }
      menu.classList.remove('is-open');
    });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) menu.classList.remove('is-open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu.classList.remove('is-open'); });
    return menu;
  }
  function wireShare(btn, getData, kind) {
    var menu = null;
    btn.addEventListener('click', function () {
      var data = getData();
      if (navigator.share) {
        navigator.share({ title: data.title, text: data.text, url: data.url })
          .then(function () { track(kind === 'list' ? 'share_list' : 'share', { method: 'native', content_type: data.type, item_id: data.id }); })
          .catch(function () {});
        return;
      }
      if (menu) menu.remove();
      menu = shareMenu(btn, data, kind);
      menu.classList.add('is-open');
    });
  }

  // ---------- detail pages ----------
  function mountActions(item) {
    var host = document.querySelector('[data-wvb-actions]');
    var bar = document.createElement('div');
    bar.className = 'wvb-ss';
    bar.innerHTML = '<button type="button" class="wvb-ss-btn" data-wvb-share>' + ICON.share + '<span>Share</span></button>'
      + '<button type="button" class="wvb-ss-btn" data-wvb-save aria-pressed="false">' + ICON.save + '<span>Save</span></button>';
    if (host) host.appendChild(bar);
    else { var h1 = document.querySelector('h1'); if (!h1) return; h1.insertAdjacentElement('afterend', bar); }
    bar.classList.add(isDark(bar.parentElement) ? 'on-dark' : 'on-light');

    var desc = document.querySelector('meta[name="description"]');
    wireShare(bar.querySelector('[data-wvb-share]'), function () {
      return { title: item.n + ' | West Virginia Bikers', text: (desc && desc.content) || item.n, url: urlOf(item), type: item.t, id: item.s };
    }, 'item');

    var sb = bar.querySelector('[data-wvb-save]');
    function paint() {
      var on = isSaved(item);
      sb.classList.toggle('is-saved', on);
      sb.setAttribute('aria-pressed', on ? 'true' : 'false');
      sb.innerHTML = (on ? ICON.saved : ICON.save) + '<span>' + (on ? 'Saved' : 'Save') + '</span>';
    }
    sb.addEventListener('click', function () {
      if (isSaved(item)) { remove(item); track('remove_from_wishlist', { content_type: item.t, item_id: item.s }); toast('Removed from your list'); }
      else { add(item); track('add_to_wishlist', { content_type: item.t, item_id: item.s }); toast('Saved — see your list any time'); }
      paint();
    });
    paint();
  }

  // ---------- "Saved (n)" pill ----------
  function renderPill() {
    if (/^\/saved\/?$/.test(location.pathname)) return;
    var n = load().length, p = document.querySelector('.wvb-saved-pill');
    if (!n) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement('a'); p.className = 'wvb-saved-pill'; p.href = '/saved'; document.body.appendChild(p); }
    p.innerHTML = ICON.saved + '<span>Saved (' + n + ')</span>';
    p.setAttribute('aria-label', 'Your saved list, ' + n + ' item' + (n === 1 ? '' : 's'));
  }

  // ---------- /saved page ----------
  function groupHTML(l, removable) {
    var html = '';
    ORDER.forEach(function (t) {
      var g = l.filter(function (i) { return i.t === t; });
      if (!g.length) return;
      html += '<h3>' + TYPES[t].plural + '</h3>';
      g.forEach(function (i) {
        html += '<div class="wvb-saved-row"><a href="/' + i.t + '/' + esc(i.s) + '">' + esc(i.n) + '</a>'
          + (removable ? '<button type="button" class="wvb-saved-x" data-k="' + esc(keyOf(i)) + '">Remove</button>' : '') + '</div>';
      });
    });
    return html;
  }
  function renderSaved(root) {
    var shared = [];
    var q = new URLSearchParams(location.search).get('list');
    if (q) shared = decodeList(q);
    var l = load();
    var html = '';
    if (shared.length) {
      html += '<div class="wvb-saved-shared"><strong>Someone shared a ride list with you.</strong>'
        + groupHTML(shared, false)
        + '<div class="wvb-saved-bar"><button type="button" class="wvb-ss-btn is-primary" data-act="import">Add these to my list</button></div></div>';
    }
    if (!l.length) {
      html += '<p class="wvb-saved-note">Nothing saved yet. Tap <strong>Save</strong> on any route, stop, event or story and it lands here, so you can plan a ride and send it to the people you ride with.</p>'
        + '<p class="wvb-saved-note"><a href="/routes">Browse routes</a> · <a href="/directory">Find stops</a> · <a href="/events">See events</a></p>';
    } else {
      html += '<div class="wvb-saved-bar">'
        + '<button type="button" class="wvb-ss-btn is-primary" data-act="share">' + ICON.share + '<span>Share my list</span></button>'
        + '<a class="wvb-ss-btn" data-act="email" href="#">Email me my list</a>'
        + '<button type="button" class="wvb-ss-btn" data-act="clear">Clear list</button></div>'
        + groupHTML(l, true)
        + '<p class="wvb-saved-note" style="margin-top:24px">Your list lives in this browser. Use <strong>Share my list</strong> or <strong>Email me my list</strong> to keep a copy or open it on another device. '
        + 'Want new rides and events in your inbox? <a href="' + NEWSLETTER + '" target="_blank" rel="noopener">Get the newsletter</a>.</p>';
    }
    root.className = 'wvb-saved';
    root.innerHTML = html;

    root.querySelectorAll('.wvb-saved-x').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k'); var it = load().filter(function (i) { return keyOf(i) === k; })[0];
        if (it) { remove(it); track('remove_from_wishlist', { content_type: it.t, item_id: it.s }); }
        renderSaved(root);
      });
    });
    var imp = root.querySelector('[data-act="import"]');
    if (imp) imp.addEventListener('click', function () {
      shared.forEach(add); track('import_list', { items: shared.length });
      history.replaceState(null, '', '/saved'); toast('Added to your list'); renderSaved(root);
    });
    var clr = root.querySelector('[data-act="clear"]');
    if (clr) clr.addEventListener('click', function () { if (confirm('Clear your saved list?')) { store([]); renderSaved(root); } });
    var sh = root.querySelector('[data-act="share"]');
    if (sh) wireShare(sh, function () {
      var cur = load();
      return { title: 'My West Virginia ride list', text: cur.length + ' places to ride to in West Virginia', url: location.origin + '/saved?list=' + encodeList(cur), type: 'list', id: String(cur.length) };
    }, 'list');
    var em = root.querySelector('[data-act="email"]');
    if (em) em.addEventListener('click', function (e) {
      e.preventDefault();
      var cur = load();
      var body = 'My West Virginia ride list\n\n' + listText(cur) + '\n\nOpen the whole list: ' + location.origin + '/saved?list=' + encodeList(cur)
        + '\n\nNew rides and events by email: ' + NEWSLETTER;
      track('share_list', { method: 'email_self', content_type: 'list', item_id: String(cur.length) });
      location.href = 'mailto:?subject=' + encodeURIComponent('My West Virginia ride list') + '&body=' + encodeURIComponent(body);
    });
  }

  function boot() {
    addCss();
    var item = current();
    if (item) mountActions(item);
    var root = document.querySelector('[data-wvb-saved]');
    if (root) renderSaved(root);
    renderPill();
  }
  window.WVBShareSave = { version: 1, load: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
