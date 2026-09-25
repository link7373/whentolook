// fullmoons.js
// Full moons, computed (Meeus ch.49) rather than tabled, so they never run out.
// The notification goes out 30 minutes before the subscriber's own moonrise,
// when the "Moon illusion" makes it look huge on the horizon.

import { compassPoint, fullMoonsBetween, moonPosition, moonrisesBetween, septemberEquinox } from '../utils/astro.js';
import { alreadyHandled, locationCell, memo } from '../utils/events.js';
import { DAY, HOUR, inQueueWindow, iso, localTimeOnDay } from '../utils/time.js';

const MONTH_NAMES = [
  'Wolf Moon', 'Snow Moon', 'Worm Moon', 'Pink Moon', 'Flower Moon', 'Strawberry Moon',
  'Buck Moon', 'Sturgeon Moon', 'Corn Moon', "Hunter's Moon", 'Beaver Moon', 'Cold Moon',
];

const NAME_ORIGINS = {
  'Wolf Moon': 'Named by Algonquin peoples for the howling of wolves in deep winter',
  'Snow Moon': 'Named for the heavy snowfall typical in February in North America',
  'Worm Moon': 'Named for earthworms appearing as the ground thaws in spring',
  'Pink Moon': 'Named for wild ground phlox, one of the first spring flowers',
  'Flower Moon': 'Named for the abundance of flowers blooming in May',
  'Strawberry Moon': 'Named for the strawberry harvesting season beginning in June',
  'Buck Moon': 'Named for male deer beginning to regrow antlers in July',
  'Sturgeon Moon': 'Named for the large sturgeon fish easily caught in the Great Lakes in August',
  'Corn Moon': 'Named for the corn harvest in early autumn',
  'Harvest Moon': 'The full moon closest to the autumn equinox. For several nights it rises soon after sunset, and farmers once used the extra light to harvest late into the evening',
  "Hunter's Moon": 'The full moon after the Harvest Moon, named for hunting game fattened through summer, by moonlight, before winter',
  'Beaver Moon': 'Named for the time to set beaver traps before the swamps froze',
  'Cold Moon': 'Named for the long, cold nights as winter sets in',
  'Blue Moon': 'The second full moon in a single calendar month. It happens only every two or three years, which is where "once in a blue moon" comes from',
};

// No single official definition exists. This is close to Richard Nolle's "within
// 90% of perigee", which the term comes from. It yields the three or four
// supermoons a year most outlets report.
const SUPERMOON_MAX_KM = 362500;
const AVERAGE_DISTANCE_KM = 384400;

// Names by the Old Farmer's Almanac convention. The Harvest Moon is the full
// moon nearest the September equinox. The one after it is the Hunter's Moon.
// The second full moon in a calendar month (UTC) is a Blue Moon. Otherwise
// the moon takes its month's name.
function nameFullMoon(fmMs) {
  const year = new Date(fmMs).getUTCFullYear();
  const equinox = septemberEquinox(year);
  const autumn = fullMoonsBetween(equinox - 45 * DAY, equinox + 75 * DAY);
  const harvestIdx = autumn.reduce((best, fm, i) =>
    Math.abs(fm.ms - equinox) < Math.abs(autumn[best].ms - equinox) ? i : best, 0);
  const near = ms => Math.abs(ms - fmMs) < HOUR;
  if (near(autumn[harvestIdx].ms)) return 'Harvest Moon';
  if (autumn[harvestIdx + 1] && near(autumn[harvestIdx + 1].ms)) return "Hunter's Moon";

  const d = new Date(fmMs);
  const previous = fullMoonsBetween(fmMs - 32 * DAY, fmMs - DAY).at(-1);
  if (previous && new Date(previous.ms).getUTCMonth() === d.getUTCMonth()) return 'Blue Moon';

  return MONTH_NAMES[d.getUTCMonth()];
}

// The moonrise nearest the moment of full moon. At full moon the Moon rises
// around sunset, so this is the evening the subscriber thinks of as "full moon night".
// Returns null if the Moon stays below the horizon; { t: null, circumpolar: true }
// if it never sets (high latitudes near midwinter, the best full moon viewing there is).
function fullMoonRise(lat, lon, fmMs) {
  const rises = moonrisesBetween(lat, lon, fmMs - 30 * HOUR, fmMs + 30 * HOUR);
  if (rises.length === 0) {
    return moonPosition(lat, lon, fmMs).alt > 0 ? { t: null, circumpolar: true } : null;
  }
  const t = rises.reduce((a, b) => (Math.abs(b - fmMs) < Math.abs(a - fmMs) ? b : a));
  return { t, az: moonPosition(lat, lon, t).az };
}

// With no moonrise to aim for, alert at 5 PM local on the evening nearest the full moon.
function circumpolarNotifyTime(fmMs, timeZone) {
  const options = [-1, 0].map(offset => localTimeOnDay(fmMs, timeZone, 17, 0, offset));
  return options.reduce((a, b) => (Math.abs(b - fmMs) < Math.abs(a - fmMs) ? b : a));
}

// The old table-based IDs ("fullmoon-2026-10") don't match the new ones, so
// dedupe by time as well. That way nobody gets the same full moon twice across the deploy.
async function fullMoonAlreadyHandled(db, subscriberId, eventId, fmMs) {
  if (await alreadyHandled(db, subscriberId, 'fullmoon', eventId)) return true;
  const from = iso(fmMs - 2 * DAY), to = iso(fmMs + 2 * DAY);
  const queued = await db.prepare(`
    SELECT id FROM event_queue
    WHERE subscriber_id = ? AND event_type = 'fullmoon'
      AND status IN ('pending', 'sent') AND notify_at BETWEEN ? AND ?
  `).bind(subscriberId, from, to).first();
  if (queued) return true;
  const sent = await db.prepare(`
    SELECT id FROM notification_log
    WHERE subscriber_id = ? AND event_type = 'fullmoon' AND sent_at BETWEEN ? AND ?
  `).bind(subscriberId, from, to).first();
  return Boolean(sent);
}

export async function computeFullMoonEvents(subscriber, now, db, cache = new Map()) {
  const nowMs = Date.parse(now);
  const cell = locationCell(subscriber);
  const events = [];

  for (const fm of fullMoonsBetween(nowMs - 2 * DAY, nowMs + 3 * DAY)) {
    const rise = memo(cache, `moonrise:${fm.ms}:${cell.key}`, () => fullMoonRise(cell.lat, cell.lon, fm.ms));
    if (!rise) {
      console.log(`[fullmoons] Moon below the horizon all night near ${iso(fm.ms)} at ${cell.key} — skipping`);
      continue;
    }

    const notifyMs = rise.circumpolar
      ? circumpolarNotifyTime(fm.ms, subscriber.timezone)
      : rise.t - 30 * 60 * 1000;
    if (!inQueueWindow(notifyMs, nowMs)) continue;

    const eventId = `fullmoon-${iso(fm.ms).slice(0, 10)}`;
    if (await fullMoonAlreadyHandled(db, subscriber.id, eventId, fm.ms)) continue;

    const name = memo(cache, `moonname:${fm.ms}`, () => nameFullMoon(fm.ms));
    events.push({
      event_type: 'fullmoon',
      event_id: eventId,
      notify_at: iso(notifyMs),
      event_data: JSON.stringify({
        id: eventId,
        name,
        name_origin: NAME_ORIGINS[name],
        supermoon: fm.distanceKm <= SUPERMOON_MAX_KM,
        distance_km: Math.round(fm.distanceKm),
        percent_closer: Math.round((1 - fm.distanceKm / AVERAGE_DISTANCE_KM) * 1000) / 10,
        full_moon_utc: iso(fm.ms),
        moonrise_utc: rise.circumpolar ? null : iso(rise.t),
        moonrise_direction: rise.circumpolar ? null : compassPoint(rise.az),
        circumpolar: Boolean(rise.circumpolar),
        timezone: subscriber.timezone,
      }),
    });
  }

  return events;
}
