// eclipses.js
// Lunar and solar eclipses, checked for visibility from each subscriber's
// location. A lunar eclipse only counts if the Moon is above their horizon.
// A solar eclipse only counts if enough of the Sun is covered from where
// they stand, while it's up.

import { LUNAR_ECLIPSES, SOLAR_ECLIPSES } from '../data/eclipses.js';
import { compassPoint, localSolarEclipse, moonPosition } from '../utils/astro.js';
import { alreadyHandled, locationCell, memo } from '../utils/events.js';
import { DAY, inQueueWindow, iso, localTimeOnDay } from '../utils/time.js';

const MINUTE = 60 * 1000;

// Below 5% of the Sun covered, the dimming is unnoticeable. That's not worth an email.
const MIN_SOLAR_OBSCURATION = 0.05;

// Moon altitude through the eclipse, for one location.
function lunarVisibility(lat, lon, e) {
  const p1 = Date.parse(e.penumbral_start), p4 = Date.parse(e.penumbral_end);
  // The part worth watching: the umbral phases, or the whole thing for a penumbral eclipse.
  const mainStart = Date.parse(e.partial_start ?? e.penumbral_start);
  const mainEnd = Date.parse(e.partial_end ?? e.penumbral_end);

  const up = t => moonPosition(lat, lon, t).alt > 0;
  let firstVisible = null, lastVisible = null, mainVisible = false;
  for (let t = p1; t <= p4; t += 5 * MINUTE) {
    if (!up(t)) continue;
    firstVisible ??= t;
    lastVisible = t;
    if (t >= mainStart && t <= mainEnd) mainVisible = true;
  }
  if (!mainVisible) return null;

  // Where to look: at maximum if the Moon is up then, otherwise the first moment it's up.
  const max = Date.parse(e.maximum);
  const lookAt = up(max) ? max : Math.max(firstVisible, mainStart);
  const pos = moonPosition(lat, lon, lookAt);

  const contacts = {};
  for (const key of ['penumbral_start', 'partial_start', 'total_start', 'maximum', 'total_end', 'partial_end', 'penumbral_end']) {
    if (e[key]) contacts[key] = up(Date.parse(e[key]));
  }

  return {
    first_visible: firstVisible,
    moon_rises_during: firstVisible > p1 ? firstVisible : null,
    moon_sets_during: lastVisible < p4 - 5 * MINUTE ? lastVisible : null,
    look_direction: compassPoint(pos.az),
    look_altitude: Math.round(pos.alt),
    contact_visible: contacts,
  };
}

export async function computeEclipseEvents(subscriber, now, db, cache = new Map()) {
  const nowMs = Date.parse(now);
  const cell = locationCell(subscriber);
  const events = [];
  // Wide enough to catch a day-before reminder that falls inside the queue horizon.
  const inRange = ms => ms >= nowMs - DAY && ms <= nowMs + 4 * DAY;

  const queue = async (eventType, eventId, notifyMs, data) => {
    if (!inQueueWindow(notifyMs, nowMs)) return;
    if (await alreadyHandled(db, subscriber.id, eventType, eventId)) return;
    events.push({
      event_type: eventType,
      event_id: eventId,
      notify_at: iso(notifyMs),
      event_data: JSON.stringify({ ...data, timezone: subscriber.timezone }),
    });
  };

  // Lunar: 1 hour before the eclipse begins, or before moonrise if the Moon
  // comes up partway through. Total and partial eclipses also get a day-before reminder.
  for (const e of LUNAR_ECLIPSES) {
    if (!inRange(Date.parse(e.maximum))) continue;
    const vis = memo(cache, `lunar:${e.id}:${cell.key}`, () => lunarVisibility(cell.lat, cell.lon, e));
    if (!vis) {
      console.log(`[eclipses] ${e.id} not visible from ${cell.key} (Moon below horizon) — skipping`);
      continue;
    }

    const notifyMs = vis.first_visible - 60 * MINUTE;
    const data = {
      ...e,
      look_direction: vis.look_direction,
      look_altitude: vis.look_altitude,
      moon_rises_during: vis.moon_rises_during && iso(vis.moon_rises_during),
      moon_sets_during: vis.moon_sets_during && iso(vis.moon_sets_during),
      contact_visible: vis.contact_visible,
    };
    await queue('lunar_eclipse', e.id, notifyMs, data);
    if (e.type === 'total' || e.type === 'partial') {
      await queue('lunar_eclipse', `${e.id}-reminder`, notifyMs - DAY, { ...data, is_reminder: true });
    }
  }

  // Solar: the evening before (planning, at 6 PM local) and the morning of
  // (7 AM local, or 90 minutes before it starts if that's earlier).
  for (const e of SOLAR_ECLIPSES) {
    if (!inRange(Date.parse(e.greatest_utc))) continue;
    const local = memo(cache, `solar:${e.id}:${cell.key}`, () => localSolarEclipse(cell.lat, cell.lon, Date.parse(e.greatest_utc)));
    if (!local || local.obscuration < MIN_SOLAR_OBSCURATION) {
      console.log(`[eclipses] ${e.id} not meaningfully visible from ${cell.key} — skipping`);
      continue;
    }

    const tz = subscriber.timezone;
    const morningOf = Math.min(localTimeOnDay(local.visible_start, tz, 7), local.visible_start - 90 * MINUTE);
    const eveningBefore = localTimeOnDay(local.visible_start, tz, 18, 0, -1);
    const data = {
      ...e,
      location_name: subscriber.location_name ?? null,
      local_type: local.local_type,
      percent_covered: Math.round(local.obscuration * 100),
      local_start: iso(local.start),
      local_maximum: iso(local.maximum),
      local_end: iso(local.end),
      visible_start: iso(local.visible_start),
      visible_end: iso(local.visible_end),
      starts_before_sunrise: local.visible_start > local.start,
      ends_after_sunset: local.visible_end < local.end,
      sun_altitude_at_max: Math.round(local.sun_altitude_at_max),
      sun_direction_at_max: compassPoint(local.sun_azimuth_at_max),
    };
    await queue('solar_eclipse', `${e.id}-reminder`, eveningBefore, { ...data, is_reminder: true });
    await queue('solar_eclipse', e.id, morningOf, data);
  }

  return events;
}
