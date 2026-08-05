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

  /* ---------- address parsing ---------- */

  // Maps writes country names, the CSV wants ISO 3166-1 alpha-2. Only the
  // names Maps actually renders in an English locale are listed.
  const COUNTRY_CODES = {
    'united states': 'US', 'usa': 'US', 'canada': 'CA', 'mexico': 'MX',
    'united kingdom': 'GB', 'uk': 'GB', 'ireland': 'IE', 'france': 'FR',
    'germany': 'DE', 'spain': 'ES', 'portugal': 'PT', 'italy': 'IT',
    'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT',
    'denmark': 'DK', 'sweden': 'SE', 'norway': 'NO', 'finland': 'FI',
    'poland': 'PL', 'czechia': 'CZ', 'czech republic': 'CZ', 'greece': 'GR',
    'australia': 'AU', 'new zealand': 'NZ', 'japan': 'JP', 'south korea': 'KR',
    'china': 'CN', 'india': 'IN', 'singapore': 'SG', 'brazil': 'BR',
    'argentina': 'AR', 'chile': 'CL', 'colombia': 'CO', 'south africa': 'ZA',
    'israel': 'IL'
  };

  // Addresses arrive as comma-separated segments, most specific first. The
  // tail segment carries region/postal in a country-specific shape; the
  // segment before the city is the street line.
  function parseAddress(raw) {
    const out = {
      address_line_1: '', address_line_2: '', city: '',
      state_or_region: '', postal_code: '', country_code: ''
    };
    const parts = String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return out;

    // Trailing country name, when Maps bothers to include one.
    const code = COUNTRY_CODES[parts[parts.length - 1].toLowerCase().replace(/\./g, '')];
    if (code && parts.length > 1) {
      out.country_code = code;
      parts.pop();
    }

    if (parts.length > 1) {
      const tail = parts.pop();
      let m;
      if ((m = tail.match(/^([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/))) {
        // "PA 19107"
        out.state_or_region = m[1].toUpperCase();
        out.postal_code = m[2];
        if (!out.country_code) out.country_code = 'US';
      } else if ((m = tail.match(/^([A-Za-z]{2})\s+([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)$/))) {
        // "ON M5V 2T6"
        out.state_or_region = m[1].toUpperCase();
        out.postal_code = m[2].toUpperCase();
        if (!out.country_code) out.country_code = 'CA';
      } else if ((m = tail.match(/^(.+?)\s+([A-Z]{2,3})\s+(\d{4})$/))) {
        // "Sydney NSW 2000" — city, region and postal share the segment.
        out.city = m[1];
        out.state_or_region = m[2];
        out.postal_code = m[3];
      } else if ((m = tail.match(/^(.+?)\s+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i))) {
        // "London SW1A 2AA" — no region component at all.
        out.city = m[1];
        out.postal_code = m[2].toUpperCase();
      } else if ((m = tail.match(/^(\d{4,6})\s+(.+)$/))) {
        // "10115 Berlin"
        out.postal_code = m[1];
        out.city = m[2];
      } else if ((m = tail.match(/^(.+?)\s+(\d{4,6})$/))) {
        // "Milano 20121"
        out.city = m[1];
        out.postal_code = m[2];
      } else if (/^[A-Za-z]{2}$/.test(tail)) {
        out.state_or_region = tail.toUpperCase();
      } else {
        out.city = tail;
      }
    }

    // Whatever is left is the city (unless the tail already supplied one)
    // followed by the street lines.
    if (!out.city && parts.length > 1) out.city = parts.pop();
    out.address_line_1 = parts.shift() || '';
    out.address_line_2 = parts.join(', ');
    return out;
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
    const address = getAddress();
    const parts = parseAddress(address);
    return {
      name: name,
      address: address,
      address_line_1: parts.address_line_1,
      address_line_2: parts.address_line_2,
      city: parts.city,
      state_or_region: parts.state_or_region,
      postal_code: parts.postal_code,
      country_code: parts.country_code,
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

  // Exactly the columns the importer accepts, in order. Everything else we
  // scrape (plus_code, url, coord_source, added_at) stays in localStorage.
  const CSV_COLS = [
    'name', 'address_line_1', 'address_line_2', 'city',
    'state_or_region', 'postal_code', 'country_code', 'latitude', 'longitude'
  ];

  function toCSV(rows) {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [CSV_COLS.join(',')];
    rows.forEach(r => {
      // Rows saved before these columns existed only carry the raw address.
      const a = r.address_line_1 === undefined ? parseAddress(r.address) : r;
      const rec = {
        name: r.name,
        address_line_1: a.address_line_1,
        address_line_2: a.address_line_2,
        city: a.city,
        state_or_region: a.state_or_region,
        postal_code: a.postal_code,
        country_code: a.country_code,
        latitude: r.latitude,
        longitude: r.longitude
      };
      lines.push(CSV_COLS.map(c => esc(rec[c])).join(','));
    });
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
