// astro.js — Sun and Moon positions, rise/set searches, full moons, and local
// eclipse circumstances. Pure functions, no network.
//
// Algorithms are from Jean Meeus, "Astronomical Algorithms" (2nd ed.):
//   ch.25 (Sun, low precision), ch.47 (Moon, main periodic terms),
//   ch.49 (true phases of the Moon).
// Accuracy is about 0.01° for the Sun and about 0.005° for the Moon. That
// works out to rise/set times within about a minute and solar eclipse contact
// times within a couple of minutes. scripts/verify-astro.mjs checks all of
// this against NASA's published eclipse catalog. Run it after touching this file.
//
// Timestamps in and out are JS Dates or epoch milliseconds (UTC).

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6378.14;
const MOON_RADIUS_KM = 1737.4;
const SUN_RADIUS_KM = 696000;
const AU_KM = 149597870.7;
// TT − UT, about 69s in 2026. Meeus's series take TT. Feeding them UT
// shifts the Moon by roughly 38" (69s of lunar motion), which is enough to
// move eclipse contacts by a minute or more. Every theory function
// converts before evaluating.
const DELTA_T_SECONDS = 69;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const norm360 = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * RAD);
const cosd = x => Math.cos(x * RAD);

export function julianDay(ms) {
  return ms / 86400000 + 2440587.5;
}

// Julian centuries of TT since J2000, from a UT timestamp.
function centuries(ms) {
  return (julianDay(ms + DELTA_T_SECONDS * 1000) - 2451545.0) / 36525;
}

// ---------------------------------------------------------------------------
// Sun and Moon, geocentric ecliptic coordinates
// ---------------------------------------------------------------------------

// Apparent geocentric longitude (deg, equinox of date) and distance (km).
function sunEcliptic(ms) {
  const T = centuries(ms);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
    + (0.019993 - 0.000101 * T) * sind(2 * M)
    + 0.000289 * sind(3 * M);
  const trueLon = L0 + C;
  const nu = M + C;
  const R = 1.000001018 * (1 - e * e) / (1 + e * cosd(nu));
  const omega = 125.04 - 1934.136 * T;
  const lon = norm360(trueLon - 0.00569 - 0.00478 * sind(omega));
  return { lon, lat: 0, distKm: R * AU_KM };
}

// Meeus table 47.A: [D, M, M', F, Σl (1e-6 deg), Σr (1e-3 km)]
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

// Meeus table 47.B: [D, M, M', F, Σb (1e-6 deg)]
const MOON_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
];

// Apparent geocentric longitude/latitude (deg) and distance (km).
function moonEcliptic(ms) {
  const T = centuries(ms);
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.290 * T;
  const A3 = 313.45 + 481266.484 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, l, r] of MOON_LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sl += l * e * sind(arg);
    sr += r * e * cosd(arg);
  }
  for (const [d, m, mp, f, b] of MOON_B) {
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sb += b * e * sind(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sind(A1) + 1962 * sind(Lp - F) + 318 * sind(A2);
  sb += -2235 * sind(Lp) + 382 * sind(A3) + 175 * sind(A1 - F)
    + 175 * sind(A1 + F) + 127 * sind(Lp - Mp) - 115 * sind(Lp + Mp);

  // Nutation in longitude (main terms), so the Moon matches the Sun's apparent frame.
  const omega = 125.04452 - 1934.136261 * T;
  const Ls = 280.4665 + 36000.7698 * T;
  const dPsi = (-17.20 * sind(omega) - 1.32 * sind(2 * Ls) - 0.23 * sind(2 * Lp) + 0.21 * sind(2 * omega)) / 3600;

  return {
    lon: norm360(Lp + sl / 1e6 + dPsi),
    lat: sb / 1e6,
    distKm: 385000.56 + sr / 1000,
  };
}

function obliquity(ms) {
  const T = centuries(ms);
  const omega = 125.04 - 1934.136 * T;
  return 23.439291 - 0.0130042 * T + 0.00256 * cosd(omega);
}

// Greenwich mean sidereal time, degrees.
function gmst(ms) {
  const T = (julianDay(ms) - 2451545.0) / 36525; // UT, not TT
  return norm360(280.46061837 + 360.98564736629 * (julianDay(ms) - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000);
}

// Ecliptic (deg, km) → geocentric equatorial rectangular vector (km).
function eclipticToVector({ lon, lat, distKm }, eps) {
  const x = distKm * cosd(lat) * cosd(lon);
  const y = distKm * cosd(lat) * sind(lon);
  const z = distKm * sind(lat);
  return [x, y * cosd(eps) - z * sind(eps), y * sind(eps) + z * cosd(eps)];
}

// Observer's geocentric position (km) in the same equatorial frame.
function observerVector(latDeg, lonDeg, ms) {
  const u = Math.atan(0.99664719 * Math.tan(latDeg * RAD));
  const rhoSin = 0.99664719 * Math.sin(u);
  const rhoCos = Math.cos(u);
  const lst = gmst(ms) + lonDeg;
  return [
    EARTH_RADIUS_KM * rhoCos * cosd(lst),
    EARTH_RADIUS_KM * rhoCos * sind(lst),
    EARTH_RADIUS_KM * rhoSin,
  ];
}

// Topocentric position of a body as seen by the observer: unit direction,
// distance (km), altitude and azimuth (deg, azimuth clockwise from north).
function topocentric(ecl, latDeg, lonDeg, ms) {
  const eps = obliquity(ms);
  const g = eclipticToVector(ecl, eps);
  const o = observerVector(latDeg, lonDeg, ms);
  const v = [g[0] - o[0], g[1] - o[1], g[2] - o[2]];
  const dist = Math.hypot(v[0], v[1], v[2]);
  const ra = Math.atan2(v[1], v[0]) * DEG;
  const dec = Math.asin(v[2] / dist) * DEG;
  const ha = gmst(ms) + lonDeg - ra;
  const alt = Math.asin(sind(latDeg) * sind(dec) + cosd(latDeg) * cosd(dec) * cosd(ha)) * DEG;
  const az = norm360(Math.atan2(sind(ha), cosd(ha) * sind(latDeg) - Math.tan(dec * RAD) * cosd(latDeg)) * DEG + 180);
  return { unit: v.map(c => c / dist), dist, alt, az };
}

export function sunPosition(lat, lon, ms) {
  return topocentric(sunEcliptic(ms), lat, lon, ms);
}

export function moonPosition(lat, lon, ms) {
  return topocentric(moonEcliptic(ms), lat, lon, ms);
}

export function sunAltitude(lat, lon, ms) {
  return sunPosition(lat, lon, ms).alt;
}

export function moonAltitude(lat, lon, ms) {
  return moonPosition(lat, lon, ms).alt;
}

// Fraction of the Moon's disk that is lit, 0–1.
export function moonIllumination(ms) {
  const s = sunEcliptic(ms);
  const m = moonEcliptic(ms);
  const cosElong = cosd(m.lat) * cosd(m.lon - s.lon);
  return (1 - cosElong) / 2;
}

export function moonDistanceKm(ms) {
  return moonEcliptic(ms).distKm;
}

// Sun's apparent longitude referred to the J2000 equinox. The IMO gives meteor
// shower peaks in these terms. Precession moves the equinox-of-date frame by
// about 0.37° by 2026, which is about 9 hours of solar motion.
export function solarLongitudeJ2000(ms) {
  return norm360(sunEcliptic(ms).lon - 1.3969713 * centuries(ms));
}

// First moment after `afterMs` when the Sun's J2000 longitude equals `targetDeg`.
export function timeOfSolarLongitude(targetDeg, afterMs) {
  let t = afterMs + norm360(targetDeg - solarLongitudeJ2000(afterMs)) / 0.9856 * 86400000;
  for (let i = 0; i < 5; i++) {
    let diff = norm360(targetDeg - solarLongitudeJ2000(t) + 180) - 180;
    t += diff / 0.9856 * 86400000;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Generic time searches
// ---------------------------------------------------------------------------

// Returns every moment in [startMs, endMs] where fn(t) crosses zero, as
// { t, rising }. Scans at stepMs and then bisects each crossing to about 20s.
// A step of 20–30 minutes is safe for rise/set; nothing we track crosses twice
// inside that.
export function findCrossings(fn, startMs, endMs, stepMs = 20 * MINUTE) {
  const out = [];
  let t0 = startMs;
  let v0 = fn(t0);
  while (t0 < endMs) {
    const t1 = Math.min(t0 + stepMs, endMs);
    const v1 = fn(t1);
    if ((v0 < 0) !== (v1 < 0)) {
      let a = t0, b = t1, va = v0;
      while (b - a > 20 * 1000) {
        const mid = (a + b) / 2;
        const vm = fn(mid);
        if ((va < 0) === (vm < 0)) { a = mid; va = vm; } else { b = mid; }
      }
      out.push({ t: Math.round((a + b) / 2), rising: v1 > v0 });
    }
    t0 = t1;
    v0 = v1;
  }
  return out;
}

// Minimum of fn over [startMs, endMs]: coarse scan, then golden-section refine.
function findMinimum(fn, startMs, endMs, stepMs) {
  let bestT = startMs, bestV = Infinity;
  for (let t = startMs; t <= endMs; t += stepMs) {
    const v = fn(t);
    if (v < bestV) { bestV = v; bestT = t; }
  }
  let a = Math.max(startMs, bestT - stepMs), b = Math.min(endMs, bestT + stepMs);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = fn(c), fd = fn(d);
  while (b - a > 5 * 1000) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = fn(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = fn(d); }
  }
  const t = Math.round((a + b) / 2);
  return { t, value: fn(t) };
}

// Standard altitude for rise/set: refraction (34') plus semi-diameter (16').
export const HORIZON_ALT = -0.833;

// Moonrises in a window, as epoch ms.
export function moonrisesBetween(lat, lon, startMs, endMs) {
  return findCrossings(t => moonAltitude(lat, lon, t) - HORIZON_ALT, startMs, endMs, 30 * MINUTE)
    .filter(c => c.rising).map(c => c.t);
}

// Intervals in a window during which the Sun is below `sunAltDeg`.
// Returns [{ start, end }] where start/end are null if dark at the window edge.
export function darkIntervals(lat, lon, startMs, endMs, sunAltDeg) {
  const f = t => sunAltitude(lat, lon, t) - sunAltDeg;
  const crossings = findCrossings(f, startMs, endMs, 20 * MINUTE);
  const intervals = [];
  let start = f(startMs) < 0 ? null : undefined;
  for (const c of crossings) {
    if (!c.rising) start = c.t;
    else if (start !== undefined) { intervals.push({ start, end: c.t }); start = undefined; }
  }
  if (start !== undefined) intervals.push({ start, end: null });
  return intervals;
}

// ---------------------------------------------------------------------------
// Full moons (Meeus ch.49)
// ---------------------------------------------------------------------------

function fullMoonForLunation(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;

  jde += -0.40614 * sind(Mp) + 0.17302 * E * sind(M) + 0.01614 * sind(2 * Mp)
    + 0.01043 * sind(2 * F) + 0.00734 * E * sind(Mp - M) - 0.00514 * E * sind(Mp + M)
    + 0.00209 * E * E * sind(2 * M) - 0.00111 * sind(Mp - 2 * F) - 0.00057 * sind(Mp + 2 * F)
    + 0.00056 * E * sind(2 * Mp + M) - 0.00042 * sind(3 * Mp) + 0.00042 * E * sind(M + 2 * F)
    + 0.00038 * E * sind(M - 2 * F) - 0.00024 * E * sind(2 * Mp - M) - 0.00017 * sind(O)
    - 0.00007 * sind(Mp + 2 * M) + 0.00004 * sind(2 * Mp - 2 * F) + 0.00004 * sind(3 * M)
    + 0.00003 * sind(Mp + M - 2 * F) + 0.00003 * sind(2 * Mp + 2 * F) - 0.00003 * sind(Mp + M + 2 * F)
    + 0.00003 * sind(Mp - M + 2 * F) - 0.00002 * sind(Mp - M - 2 * F) - 0.00002 * sind(3 * Mp + M)
    + 0.00002 * sind(4 * Mp);

  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165],
    [251.83 + 26.651886 * k, 0.000164], [349.42 + 36.412478 * k, 0.000126],
    [84.66 + 18.206239 * k, 0.000110], [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.000060], [154.84 + 7.306860 * k, 0.000056],
    [34.52 + 27.261239 * k, 0.000047], [207.19 + 0.121824 * k, 0.000042],
    [291.34 + 1.844379 * k, 0.000040], [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023],
  ];
  for (const [arg, coef] of A) jde += coef * sind(arg);

  return (jde - 2440587.5) * 86400000 - DELTA_T_SECONDS * 1000;
}

// Full moons in [startMs, endMs], as [{ ms, distanceKm }].
export function fullMoonsBetween(startMs, endMs) {
  const yearsFrom2000 = (startMs - Date.UTC(2000, 0, 6)) / (365.25 * 86400000);
  let k = Math.floor(yearsFrom2000 * 12.3685) - 1 + 0.5;
  const out = [];
  for (;;) {
    const ms = fullMoonForLunation(k);
    if (ms > endMs) break;
    if (ms >= startMs) out.push({ ms, distanceKm: moonDistanceKm(ms) });
    k += 1;
  }
  return out;
}

// Moment the Sun reaches apparent longitude 180° (September equinox) in `year`.
export function septemberEquinox(year) {
  const guess = Date.UTC(year, 8, 22);
  let t = guess;
  for (let i = 0; i < 5; i++) {
    const diff = norm360(180 - sunEcliptic(t).lon + 180) - 180;
    t += diff / 0.9856 * 86400000;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Solar eclipse local circumstances
// ---------------------------------------------------------------------------

// Sun/Moon geometry for one observer at one moment. All angles in degrees.
function solarEclipseGeometry(lat, lon, ms) {
  const sun = sunPosition(lat, lon, ms);
  const moon = moonPosition(lat, lon, ms);
  const dot = sun.unit[0] * moon.unit[0] + sun.unit[1] * moon.unit[1] + sun.unit[2] * moon.unit[2];
  const sep = Math.acos(Math.min(1, Math.max(-1, dot))) * DEG;
  const rs = Math.asin(SUN_RADIUS_KM / sun.dist) * DEG;
  const rm = Math.asin(MOON_RADIUS_KM / moon.dist) * DEG;
  return { sep, rs, rm, sunAlt: sun.alt, sunAz: sun.az };
}

// Fraction of the Sun's disk area covered by the Moon (0–1).
function obscuration(sep, rs, rm) {
  if (sep >= rs + rm) return 0;
  if (sep <= Math.abs(rm - rs)) return rm >= rs ? 1 : (rm * rm) / (rs * rs);
  const a = Math.acos((sep * sep + rs * rs - rm * rm) / (2 * sep * rs));
  const b = Math.acos((sep * sep + rm * rm - rs * rs) / (2 * sep * rm));
  const area = rs * rs * (a - Math.sin(2 * a) / 2) + rm * rm * (b - Math.sin(2 * b) / 2);
  return area / (Math.PI * rs * rs);
}

/**
 * Local circumstances of a solar eclipse for one observer.
 * greatestUtMs: NASA's instant of greatest eclipse (UT). Local maximum falls
 * within ±4h of it.
 * Returns null if the Moon never touches the Sun from here, or if the Sun is
 * below the horizon the whole time it does.
 */
export function localSolarEclipse(lat, lon, greatestUtMs) {
  const f = t => {
    const g = solarEclipseGeometry(lat, lon, t);
    return g.sep - (g.rs + g.rm);
  };
  const lo = greatestUtMs - 4 * HOUR, hi = greatestUtMs + 4 * HOUR;
  const min = findMinimum(f, lo, hi, 4 * MINUTE);
  if (min.value >= 0) return null;

  const crossings = findCrossings(f, lo, hi, 4 * MINUTE);
  const c1 = crossings.find(c => !c.rising && c.t <= min.t)?.t ?? lo;
  const c4 = [...crossings].reverse().find(c => c.rising && c.t >= min.t)?.t ?? hi;

  // Only the part of the eclipse with the Sun above the horizon counts.
  let visibleStart = null, visibleEnd = null, best = null;
  for (let t = c1; t <= c4; t += 2 * MINUTE) {
    const g = solarEclipseGeometry(lat, lon, t);
    if (g.sunAlt < HORIZON_ALT) continue;
    visibleStart ??= t;
    visibleEnd = t;
    const obs = obscuration(g.sep, g.rs, g.rm);
    if (!best || obs > best.obs) best = { t, obs, g };
  }
  if (!best) return null;

  // If the true maximum happens with the Sun up, report it precisely.
  const gMax = solarEclipseGeometry(lat, lon, min.t);
  if (gMax.sunAlt >= HORIZON_ALT) {
    best = { t: min.t, obs: obscuration(gMax.sep, gMax.rs, gMax.rm), g: gMax };
  }

  const { sep, rs, rm } = best.g;
  let localType = 'partial';
  if (sep <= Math.abs(rm - rs)) localType = rm >= rs ? 'total' : 'annular';

  return {
    start: c1,
    end: c4,
    maximum: best.t,
    visible_start: visibleStart,
    visible_end: visibleEnd === c4 || c4 - visibleEnd < 2 * MINUTE ? c4 : visibleEnd,
    magnitude: (rs + rm - sep) / (2 * rs),
    diameter_ratio: rm / rs,
    obscuration: best.obs,
    local_type: localType,
    sun_altitude_at_max: best.g.sunAlt,
    sun_azimuth_at_max: best.g.sunAz,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(azDeg) {
  return COMPASS[Math.round(norm360(azDeg) / 22.5) % 16];
}
