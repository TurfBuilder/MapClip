(function () {
  'use strict';

  const STORAGE_KEY = 'turfbuilder_places';
  const BTN_ID = 'tb-add-btn';

  /* ---------- storage ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    renderPanel();
  }

  /* ---------- scraping ---------- */

  function textOf(el) {
    return el ? el.textContent.trim() : '';
  }

  function getName() {
    const h1 = document.querySelector('h1.DUwDvf') ||
      document.querySelector('[role="main"] h1');
    return textOf(h1);
  }

  function itemValue(id) {
    const btn = document.querySelector('button[data-item-id="' + id + '"], a[data-item-id="' + id + '"]');
    if (!btn) return '';
    const aria = btn.getAttribute('aria-label') || '';
    const colon = aria.indexOf(':');
    if (colon > -1) return aria.slice(colon + 1).trim();
    const inner = btn.querySelector('.Io6YTe');
    return textOf(inner) || textOf(btn);
  }

  function getAddress() {
    return itemValue('address');
  }

  function getPlusCode() {
    // data-item-id is "oloc" for plus codes.
    let v = itemValue('oloc');
    if (v) return v;
    // Fallback: scan sidebar text for a plus-code-looking token.
    const main = document.querySelector('[role="main"]');
    const m = main && main.textContent.match(/\b[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/);
    return m ? m[0] : '';
  }

  // Reference point for expanding short plus codes: place marker coords if the
  // URL has them, else the map viewport center.
  function refLatLng() {
    const url = location.href;
    let m = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    return null;
  }

  function decodePlusCode(code) {
    if (!code) return null;
    // Sidebar codes look like "XQ+F9 Philadelphia, PA" — keep the code token.
    const token = code.split(/\s+/)[0].toUpperCase();
    if (!window.OLC.isValid(token)) return null;
    let full = token;
    if (window.OLC.isShort(token)) {
      const ref = refLatLng();
      if (!ref) return null;
      full = window.OLC.recoverNearest(token, ref.lat, ref.lng);
    }
    const d = window.OLC.decode(full);
    return { full: full, lat: d.lat, lng: d.lng };
  }

  function currentPlace() {
    const name = getName();
    if (!name) return null;
    const plus = getPlusCode();
    const dec = decodePlusCode(plus);
    const ref = refLatLng();
    return {
      name: name,
      address: getAddress(),
      plus_code: dec ? dec.full : plus,
      latitude: dec ? dec.lat : (ref ? ref.lat : ''),
      longitude: dec ? dec.lng : (ref ? ref.lng : ''),
      coord_source: dec ? 'plus_code' : (ref ? 'url' : 'none'),
      url: location.href,
      added_at: new Date().toISOString()
    };
  }

  /* ---------- actions ---------- */

  function addCurrent() {
    const p = currentPlace();
    if (!p) return flash('No place open', true);
    const rows = load();
    if (rows.some(r => r.name === p.name && r.address === p.address)) {
      return flash('Already in list', true);
    }
    rows.push(p);
    save(rows);
    flash('Added: ' + p.name);
  }

  function toCSV(rows) {
    const cols = ['name', 'address', 'plus_code', 'latitude', 'longitude', 'coord_source', 'url', 'added_at'];
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [cols.join(',')];
    rows.forEach(r => lines.push(cols.map(c => esc(r[c])).join(',')));
    return lines.join('\r\n');
  }

  function download() {
    const rows = load();
    if (!rows.length) return flash('List empty', true);
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'turfbuilder-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- UI ---------- */

  let toastTimer = null;
  function flash(msg, isErr) {
    let t = document.getElementById('tb-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'tb-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = isErr ? 'tb-err' : '';
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2200);
  }

  function buildPanel() {
    if (document.getElementById('tb-panel')) return;
    const el = document.createElement('div');
    el.id = 'tb-panel';
    el.innerHTML =
      '<div id="tb-head">' +
        '<span id="tb-title">TurfBuilder (<span id="tb-count">0</span>)</span>' +
        '<button id="tb-toggle" title="Collapse">–</button>' +
      '</div>' +
      '<div id="tb-body">' +
        '<div id="tb-list"></div>' +
        '<div id="tb-actions">' +
          '<button id="tb-add">+ Add current</button>' +
          '<button id="tb-csv">Download CSV</button>' +
          '<button id="tb-clear" class="tb-danger">Clear</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('#tb-add').onclick = addCurrent;
    el.querySelector('#tb-csv').onclick = download;
    el.querySelector('#tb-clear').onclick = () => {
      if (confirm('Clear all saved places?')) save([]);
    };
    el.querySelector('#tb-toggle').onclick = () => {
      el.classList.toggle('tb-collapsed');
    };
    el.querySelector('#tb-list').onclick = e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const rows = load();
      rows.splice(parseInt(b.dataset.i, 10), 1);
      save(rows);
    };
  }

  function renderPanel() {
    const list = document.getElementById('tb-list');
    if (!list) return;
    const rows = load();
    document.getElementById('tb-count').textContent = rows.length;
    if (!rows.length) {
      list.innerHTML = '<div class="tb-empty">No places yet. Open a place, then hit “Add current”.</div>';
      return;
    }
    list.innerHTML = rows.map((r, i) =>
      '<div class="tb-row">' +
        '<div class="tb-info">' +
          '<div class="tb-name"></div>' +
          '<div class="tb-sub"></div>' +
        '</div>' +
        '<button data-i="' + i + '" title="Remove">×</button>' +
      '</div>'
    ).join('');
    // Fill text via textContent so place names can't inject markup.
    const nodes = list.querySelectorAll('.tb-row');
    rows.forEach((r, i) => {
      nodes[i].querySelector('.tb-name').textContent = r.name;
      nodes[i].querySelector('.tb-sub').textContent =
        (r.latitude !== '' ? Number(r.latitude).toFixed(6) + ', ' + Number(r.longitude).toFixed(6) : 'no coords');
    });
  }

  // Sidebar button, injected next to the place title.
  function injectSidebarButton() {
    const h1 = document.querySelector('h1.DUwDvf') || document.querySelector('[role="main"] h1');
    if (!h1) return;
    const host = h1.parentElement;
    if (!host || host.querySelector('#' + BTN_ID)) return;
    const b = document.createElement('button');
    b.id = BTN_ID;
    b.textContent = '+ Add to Turf list';
    b.onclick = addCurrent;
    host.appendChild(b);
  }

  function init() {
    buildPanel();
    renderPanel();
    injectSidebarButton();
    new MutationObserver(() => injectSidebarButton())
      .observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
