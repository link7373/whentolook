// meteors.js
// Meteor shower peaks, timed to when it actually gets dark where the subscriber is.
//
// Peaks are defined by the Sun's position rather than a calendar date, so this
// never needs a yearly update. A shower peaks when Earth crosses the debris
// stream, which is at the same solar longitude every year. Longitudes (J2000)
// follow the International Meteor Organization's calendar.

import { darkIntervals, moonAltitude, moonIllumination, timeOfSolarLongitude } from '../utils/astro.js';
import { alreadyHandled, locationCell, memo } from '../utils/events.js';
import { DAY, HOUR, inQueueWindow, iso } from '../utils/time.js';

const METEOR_SHOWERS = [
  { key: 'quadrantids', name: 'Quadrantids', solar_longitude: 283.15, radiant_dec: 49, zhr: 120, velocity_kms: 40, radiant_constellation: 'Boötes', parent_object: 'Asteroid 2003 EH1', peak_duration_hours: 6 },
  { key: 'lyrids', name: 'Lyrids', solar_longitude: 32.32, radiant_dec: 34, zhr: 18, velocity_kms: 49, radiant_constellation: 'Lyra', parent_object: 'Comet Thatcher', peak_duration_hours: 12 },
  { key: 'eta-aquariids', name: 'Eta Aquariids', solar_longitude: 45.5, radiant_dec: -1, zhr: 50, velocity_kms: 66, radiant_constellation: 'Aquarius', parent_object: "Halley's Comet", peak_duration_hours: 24 },
  { key: 'delta-aquariids', name: 'Delta Aquariids', solar_longitude: 127, radiant_dec: -16, zhr: 25, velocity_kms: 41, radiant_constellation: 'Aquarius', parent_object: 'Comet 96P/Machholz', peak_duration_hours: 48 },
  { key: 'perseids', name: 'Perseids', solar_longitude: 140.0, radiant_dec: 58, zhr: 100, velocity_kms: 59, radiant_constellation: 'Perseus', parent_object: 'Comet Swift-Tuttle', peak_duration_hours: 24 },
  { key: 'draconids', name: 'Draconids', solar_longitude: 195.4, radiant_dec: 54, zhr: 10, velocity_kms: 20, radiant_constellation: 'Draco', parent_object: 'Comet 21P/Giacobini-Zinner', peak_duration_hours: 6 },
  { key: 'orionids', name: 'Orionids', solar_longitude: 208, radiant_dec: 16, zhr: 20, velocity_kms: 66, radiant_constellation: 'Orion', parent_object: "Halley's Comet", peak_duration_hours: 24 },
  { key: 'leonids', name: 'Leonids', solar_longitude: 235.27, radiant_dec: 22, zhr: 15, velocity_kms: 71, radiant_constellation: 'Leo', parent_object: 'Comet 55P/Tempel-Tuttle', peak_duration_hours: 12 },
  { key: 'geminids', name: 'Geminids', solar_longitude: 262.2, radiant_dec: 33, zhr: 150, velocity_kms: 35, radiant_constellation: 'Gemini', parent_object: 'Asteroid 3200 Phaethon', peak_duration_hours: 24 },
  { key: 'ursids', name: 'Ursids', solar_longitude: 270.7, radiant_dec: 75, zhr: 10, velocity_kms: 33, radiant_constellation: 'Ursa Minor', parent_object: 'Comet 8P/Tuttle', peak_duration_hours: 12 },
];

// Below this altitude at its highest, a radiant produces almost nothing worth
// watching. For example, the Quadrantids never rise for most of the southern hemisphere.
const MIN_RADIANT_ALTITUDE = 10;

// Try true darkness first. In high-latitude summer the Sun never gets that
// low, so fall back to the darkest the sky actually gets.
const DARKNESS_LEVELS = [
  { sunAlt: -18, label: 'astronomical' },
  { sunAlt: -12, label: 'nautical' },
  { sunAlt: -6, label: 'civil' },
];

// The local night whose middle is closest to the peak.
function peakNight(lat, lon, peakMs) {
  const lo = peakMs - 30 * HOUR, hi = peakMs + 30 * HOUR;
  for (const level of DARKNESS_LEVELS) {
    const nights = darkIntervals(lat, lon, lo, hi, level.sunAlt)
      .map(n => ({ start: n.start ?? lo, end: n.end ?? hi, darkness: level.label }));
    if (nights.length === 0) continue;
    nights.sort((a, b) => Math.abs((a.start + a.end) / 2 - peakMs) - Math.abs((b.start + b.end) / 2 - peakMs));
    return nights[0];
  }
  return null; // midnight sun
}

// How much the Moon will wash out the show: its brightness weighted by how
// much of the night it spends above the horizon.
function moonInterference(lat, lon, night) {
  const illumination = moonIllumination((night.start + night.end) / 2);
  const samples = 8;
  let up = 0;
  for (let i = 0; i < samples; i++) {
    const t = night.start + (night.end - night.start) * (i + 0.5) / samples;
    if (moonAltitude(lat, lon, t) > 0) up++;
  }
  const score = illumination * (up / samples);
  return {
    moon_illumination: Math.round(illumination * 100),
    moon_up_fraction: up / samples,
    moon_conditions: score < 0.15 ? 'excellent' : score < 0.45 ? 'good' : 'poor',
  };
}

export async function computeMeteorEvents(subscriber, now, db, cache = new Map()) {
  const nowMs = Date.parse(now);
  const cell = locationCell(subscriber);
  const events = [];

  for (const shower of METEOR_SHOWERS) {
    const peakMs = timeOfSolarLongitude(shower.solar_longitude, nowMs - 3 * DAY);
    if (peakMs > nowMs + 3 * DAY) continue;

    const radiantMaxAlt = 90 - Math.abs(cell.lat - shower.radiant_dec);
    if (radiantMaxAlt < MIN_RADIANT_ALTITUDE) continue;

    const eventId = `${shower.key}-${new Date(peakMs).getUTCFullYear()}`;
    const plan = memo(cache, `meteor:${eventId}:${cell.key}`, () => {
      const night = peakNight(cell.lat, cell.lon, peakMs);
      return night && { night, moon: moonInterference(cell.lat, cell.lon, night) };
    });
    if (!plan) {
      console.log(`[meteors] ${eventId}: no dark sky at ${cell.key} (midnight sun) — skipping`);
      continue;
    }

    // 30 minutes after it gets properly dark.
    const notifyMs = plan.night.start + 30 * 60 * 1000;
    if (!inQueueWindow(notifyMs, nowMs)) continue;
    if (await alreadyHandled(db, subscriber.id, 'meteor', eventId)) continue;

    events.push({
      event_type: 'meteor',
      event_id: eventId,
      notify_at: iso(notifyMs),
      event_data: JSON.stringify({
        ...shower,
        peak: iso(peakMs),
        dark_start: iso(plan.night.start),
        dark_end: iso(plan.night.end),
        darkness: plan.night.darkness,
        radiant_max_altitude: Math.round(radiantMaxAlt),
        ...plan.moon,
        timezone: subscriber.timezone,
      }),
    });
  }

  return events;
}
