// Minimal Open Location Code (Plus Code) decoder.
// Supports full codes ("87G7PX7V+2R") and short codes ("PX7V+2R") when a
// reference lat/lng is supplied (recoverNearest).
(function () {
  const ALPHABET = '23456789CFGHJMPQRVWX';
  const BASE = 20;
  const SEP = '+';
  const SEP_POS = 8;
  const PAD = '0';
  const PAIR_LEN = 10;
  const GRID_ROWS = 5;
  const GRID_COLS = 4;
  const PAIR_RES = [20.0, 1.0, 0.05, 0.0025, 0.000125];
  const MAX_LAT = 90;
  const MAX_LNG = 180;

  function clean(code) {
    return String(code || '').trim().toUpperCase();
  }

  function isValid(code) {
    code = clean(code);
    const sep = code.indexOf(SEP);
    if (sep === -1 || sep !== code.lastIndexOf(SEP)) return false;
    if (sep > SEP_POS || sep % 2 === 1) return false;
    const pad = code.indexOf(PAD);
    if (pad > -1) {
      if (pad === 0) return false;
      const padEnd = code.lastIndexOf(PAD);
      if (padEnd < code.length - 1 && code[padEnd + 1] !== SEP) return false;
      if ((padEnd - pad + 1) % 2 === 1) return false;
      if (sep !== SEP_POS) return false;
    }
    if (code.length - sep - 1 === 1) return false;
    for (const ch of code) {
      if (ch !== SEP && ch !== PAD && ALPHABET.indexOf(ch) === -1) return false;
    }
    return true;
  }

  function isShort(code) {
    if (!isValid(code)) return false;
    const sep = clean(code).indexOf(SEP);
    return sep >= 0 && sep < SEP_POS;
  }

  // Returns {lat, lng, latLo, lngLo, latHi, lngHi} — lat/lng is the center.
  function decode(code) {
    code = clean(code).replace(SEP, '').replace(/0+$/, '');
    let latLo = -MAX_LAT;
    let lngLo = -MAX_LNG;
    let latRes = PAIR_RES[0] * BASE; // 400 -> divided below
    let lngRes = PAIR_RES[0] * BASE;
    let i = 0;

    // Pair section.
    for (; i < Math.min(code.length, PAIR_LEN); i += 2) {
      latRes /= BASE;
      lngRes /= BASE;
      latLo += ALPHABET.indexOf(code[i]) * latRes;
      lngLo += ALPHABET.indexOf(code[i + 1]) * lngRes;
    }
    let latHi = latLo + latRes;
    let lngHi = lngLo + lngRes;

    // Grid refinement section.
    for (; i < code.length; i++) {
      const v = ALPHABET.indexOf(code[i]);
      const row = Math.floor(v / GRID_COLS);
      const col = v % GRID_COLS;
      latRes /= GRID_ROWS;
      lngRes /= GRID_COLS;
      latLo += row * latRes;
      lngLo += col * lngRes;
      latHi = latLo + latRes;
      lngHi = lngLo + lngRes;
    }

    return {
      latLo: latLo,
      lngLo: lngLo,
      latHi: latHi,
      lngHi: lngHi,
      lat: latLo + (latHi - latLo) / 2,
      lng: lngLo + (lngHi - lngLo) / 2
    };
  }

  function normalizeLng(lng) {
    while (lng < -180) lng += 360;
    while (lng >= 180) lng -= 360;
    return lng;
  }

  // Expand a short code ("PX7V+2R") into a full code using a nearby lat/lng.
  function recoverNearest(shortCode, refLat, refLng) {
    shortCode = clean(shortCode);
    if (!isShort(shortCode)) return shortCode;
    refLat = Math.min(Math.max(refLat, -MAX_LAT), MAX_LAT);
    refLng = normalizeLng(refLng);

    const padLen = SEP_POS - shortCode.indexOf(SEP);
    const resolution = Math.pow(BASE, 2 - padLen / 2);
    const halfRes = resolution / 2;

    const prefix = encode(refLat, refLng, SEP_POS).substring(0, padLen);
    const candidate = decode(prefix + shortCode);

    let lat = candidate.lat;
    let lng = candidate.lng;
    if (refLat - lat > halfRes && lat + resolution <= MAX_LAT) lat += resolution;
    else if (lat - refLat > halfRes && lat - resolution >= -MAX_LAT) lat -= resolution;
    if (refLng - lng > halfRes) lng += resolution;
    else if (lng - refLng > halfRes) lng -= resolution;

    return encode(lat, lng, shortCode.length - 1 + padLen);
  }

  // Integer arithmetic, like the reference implementation — float subtraction
  // drifts enough at grid resolutions to emit out-of-range digits.
  const GRID_LEN = 5;
  const PAIR_PRECISION = Math.pow(BASE, 3);                        // 8000
  const LAT_PRECISION = PAIR_PRECISION * Math.pow(GRID_ROWS, GRID_LEN); // 25e6
  const LNG_PRECISION = PAIR_PRECISION * Math.pow(GRID_COLS, GRID_LEN); // 8.192e6

  function latPrecision(codeLen) {
    if (codeLen <= PAIR_LEN) return Math.pow(BASE, Math.floor(codeLen / -2 + 2));
    return Math.pow(BASE, -3) / Math.pow(GRID_ROWS, codeLen - PAIR_LEN);
  }

  function encode(lat, lng, codeLen) {
    codeLen = Math.min(Math.max(codeLen || PAIR_LEN, 2), PAIR_LEN + GRID_LEN);
    if (codeLen < SEP_POS && codeLen % 2 === 1) codeLen -= 1;
    lat = Math.min(Math.max(lat, -MAX_LAT), MAX_LAT);
    lng = normalizeLng(lng);
    if (lat === MAX_LAT) lat -= latPrecision(codeLen);

    let latVal = Math.floor(Math.round((lat + MAX_LAT) * LAT_PRECISION * 1e6) / 1e6);
    let lngVal = Math.floor(Math.round((lng + MAX_LNG) * LNG_PRECISION * 1e6) / 1e6);
    latVal = Math.min(latVal, 2 * MAX_LAT * LAT_PRECISION - 1);
    lngVal = Math.min(lngVal, 2 * MAX_LNG * LNG_PRECISION - 1);

    let code = '';
    if (codeLen > PAIR_LEN) {
      for (let i = 0; i < GRID_LEN; i++) {
        code = ALPHABET[(latVal % GRID_ROWS) * GRID_COLS + (lngVal % GRID_COLS)] + code;
        latVal = Math.floor(latVal / GRID_ROWS);
        lngVal = Math.floor(lngVal / GRID_COLS);
      }
    } else {
      latVal = Math.floor(latVal / Math.pow(GRID_ROWS, GRID_LEN));
      lngVal = Math.floor(lngVal / Math.pow(GRID_COLS, GRID_LEN));
    }
    for (let i = 0; i < PAIR_LEN / 2; i++) {
      code = ALPHABET[latVal % BASE] + ALPHABET[lngVal % BASE] + code;
      latVal = Math.floor(latVal / BASE);
      lngVal = Math.floor(lngVal / BASE);
    }

    if (codeLen < SEP_POS) {
      return code.substring(0, codeLen) + PAD.repeat(SEP_POS - codeLen) + SEP;
    }
    return code.substring(0, SEP_POS) + SEP + code.substring(SEP_POS, codeLen);
  }

  window.OLC = { decode, encode, isValid, isShort, recoverNearest };
})();
