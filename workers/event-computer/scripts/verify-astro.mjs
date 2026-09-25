// verify-astro.mjs — checks src/utils/astro.js against NASA's published eclipse
// catalog (eclipse.gsfc.nasa.gov, Espenak). Run: node scripts/verify-astro.mjs
//
// Timing is the product, so run this after any change to astro.js.
// It exits non-zero on failure.

import {
  localSolarEclipse, moonPosition, fullMoonsBetween, solarLongitudeJ2000,
} from '../src/utils/astro.js';
import { SOLAR_ECLIPSES, LUNAR_ECLIPSES } from '../src/data/eclipses.js';

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);
  if (!ok) failures++;
}
const fmt = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

// 1. Solar eclipses. At NASA's point of greatest eclipse, our local maximum
// should land at NASA's time with NASA's magnitude and the same type.
console.log('\n-- Solar eclipses at the point of greatest eclipse --');
for (const e of SOLAR_ECLIPSES) {
  const local = localSolarEclipse(e.greatest_lat, e.greatest_lon, Date.parse(e.greatest_utc));
  if (!local) { check(e.id, false, 'no eclipse computed'); continue; }
  const dtMin = (local.maximum - Date.parse(e.greatest_utc)) / 60000;
  // NASA's magnitude for a central eclipse is the Moon/Sun diameter ratio; for a
  // partial one it is the fraction of the Sun's diameter covered.
  const ours = e.type === 'partial' ? local.magnitude : local.diameter_ratio;
  const dMag = ours - e.magnitude;
  // NASA rounds the point of greatest eclipse to whole degrees (~111 km). That
  // is 2–3 minutes of shadow travel, and it shifts a partial eclipse's magnitude
  // slightly. It can also put us outside a very narrow path: the 2031 hybrid's
  // path is 38 km wide. So for a hybrid only the diameter ratio is checked.
  const typeOk = e.type === 'hybrid' || local.local_type === e.type;
  const magTolerance = e.type === 'partial' ? 0.01 : 0.002;
  check(e.id,
    Math.abs(dtMin) <= 3 && Math.abs(dMag) <= magTolerance && typeOk,
    `max ${fmt(local.maximum)} (Δ ${dtMin.toFixed(1)} min), mag ${ours.toFixed(4)} vs ${e.magnitude} , type ${local.local_type} vs ${e.type}, sun alt ${local.sun_altitude_at_max.toFixed(0)}° vs ${e.sun_alt}°`);
}

// 2. Lunar eclipses. At greatest eclipse the Moon is at the zenith of NASA's
// listed sub-lunar point, which checks Moon position and sidereal time together.
console.log('\n-- Lunar eclipses: Moon altitude at the sub-lunar point --');
for (const e of LUNAR_ECLIPSES) {
  const alt = moonPosition(e.zenith_lat, e.zenith_lon, Date.parse(e.maximum)).alt;
  // NASA rounds the point to whole degrees, so allow ~1.5°.
  check(e.id, alt >= 88.5, `Moon altitude ${alt.toFixed(2)}°`);
}

// 3. Full moons. Every lunar eclipse is a full moon, so each catalog eclipse
// should have one of our full moons within an hour or so of greatest eclipse.
console.log('\n-- Full moons vs. lunar eclipse times --');
for (const e of LUNAR_ECLIPSES) {
  const t = Date.parse(e.maximum);
  const fm = fullMoonsBetween(t - 3 * 86400000, t + 3 * 86400000)[0];
  const dtMin = fm ? (fm.ms - t) / 60000 : Infinity;
  // Opposition in longitude and minimum shadow distance differ by up to ~1h
  // for eclipses far from a node, so this is a sanity bound, not a precision one.
  check(e.id, Math.abs(dtMin) <= 90, `full moon ${fm ? fmt(fm.ms) : 'none'} (Δ ${dtMin.toFixed(0)} min)`);
}

// 4. Solar longitude. The Sun's J2000 longitude at the September 2026
// equinox (apparent longitude 180° of date) should be ~0.37° less than 180°.
console.log('\n-- Solar longitude (J2000) --');
const lonAtEquinox = solarLongitudeJ2000(Date.parse('2026-09-23T00:05:00Z'));
check('J2000 precession offset', Math.abs(lonAtEquinox - 179.63) < 0.05, `λ☉(J2000) at 2026 equinox = ${lonAtEquinox.toFixed(3)}°`);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
