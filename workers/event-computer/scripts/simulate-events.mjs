// simulate-events.mjs — replays the daily 00:00 UTC cron over a date range for
// sample cities and prints every notification that would be queued, in local time.
// No network or database: dedupe is simulated in memory.
//
//   node scripts/simulate-events.mjs [startDate] [endDate] [cityFilter]
//   node scripts/simulate-events.mjs 2026-09-24 2027-01-01 vancouver

import { computeMeteorEvents } from '../src/events/meteors.js';
import { computeFullMoonEvents } from '../src/events/fullmoons.js';
import { computeEclipseEvents } from '../src/events/eclipses.js';

const CITIES = [
  { id: 'vancouver', location_name: 'Vancouver, BC', latitude: 49.28, longitude: -123.12, timezone: 'America/Vancouver' },
  { id: 'newyork', location_name: 'New York, NY', latitude: 40.71, longitude: -74.01, timezone: 'America/New_York' },
  { id: 'london', location_name: 'London, UK', latitude: 51.51, longitude: -0.13, timezone: 'Europe/London' },
  { id: 'madrid', location_name: 'Madrid, Spain', latitude: 40.42, longitude: -3.70, timezone: 'Europe/Madrid' },
  { id: 'luxor', location_name: 'Luxor, Egypt', latitude: 25.69, longitude: 32.64, timezone: 'Africa/Cairo' },
  { id: 'sydney', location_name: 'Sydney, Australia', latitude: -33.87, longitude: 151.21, timezone: 'Australia/Sydney' },
  { id: 'tromso', location_name: 'Tromsø, Norway', latitude: 69.65, longitude: 18.96, timezone: 'Europe/Oslo' },
];

const [start = '2026-09-24', end = '2027-01-01', filter] = process.argv.slice(2);

// In-memory stand-in for D1: records queued (subscriber, type, id) triples and
// answers the modules' dedupe queries from them.
function fakeDb(queued) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (!/event_queue/.test(sql)) return null; // notification_log: nothing sent yet
              const [sub, typeOrId, idOrFrom, to] = args;
              if (/notify_at BETWEEN/.test(sql)) {
                return queued.find(q => q.sub === sub && q.type === 'fullmoon' && q.notify_at >= idOrFrom && q.notify_at <= to) ?? null;
              }
              return queued.find(q => q.sub === sub && q.type === typeOrId && q.id === idOrFrom) ?? null;
            },
          };
        },
      };
    },
  };
}

const fmtLocal = (ms, tz) => new Date(ms).toLocaleString('en-US', {
  timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const t0 = performance.now();
for (const city of CITIES.filter(c => !filter || c.id === filter)) {
  const sub = { ...city, id: `sub-${city.id}`, unsubscribe_token: 'x' };
  const queued = [];
  const db = fakeDb(queued);
  console.log(`\n=== ${city.location_name} (${city.timezone}) ===`);
  for (let day = Date.parse(start); day <= Date.parse(end); day += 86400000) {
    const now = new Date(day).toISOString();
    const cache = new Map();
    const evts = [
      ...await computeMeteorEvents(sub, now, db, cache),
      ...await computeFullMoonEvents(sub, now, db, cache),
      ...await computeEclipseEvents(sub, now, db, cache),
    ];
    for (const e of evts) {
      queued.push({ sub: sub.id, type: e.event_type, id: e.event_id, notify_at: e.notify_at });
      const d = JSON.parse(e.event_data);
      const detail = {
        meteor: () => `${d.name}: dark ${fmtLocal(Date.parse(d.dark_start), city.timezone)} (${d.darkness}), moon ${d.moon_illumination}% → ${d.moon_conditions}`,
        fullmoon: () => `${d.name}${d.supermoon ? ' (SUPERMOON)' : ''}: ${d.circumpolar ? 'up all night (never sets)' : `rises ${fmtLocal(Date.parse(d.moonrise_utc), city.timezone)} ${d.moonrise_direction}`}, ${d.distance_km} km`,
        lunar_eclipse: () => `${d.type}${d.is_reminder ? ' REMINDER' : ''}: look ${d.look_direction} ${d.look_altitude}°${d.moon_rises_during ? ', moon rises mid-eclipse' : ''}${d.moon_sets_during ? ', moon sets mid-eclipse' : ''}`,
        solar_eclipse: () => `${d.local_type} ${d.percent_covered}%${d.is_reminder ? ' REMINDER' : ''}: max ${fmtLocal(Date.parse(d.local_maximum), city.timezone)}, sun ${d.sun_altitude_at_max}° ${d.sun_direction_at_max}`,
      }[e.event_type]();
      console.log(`  ${e.event_type.padEnd(13)} notify ${fmtLocal(Date.parse(e.notify_at), city.timezone).padEnd(24)} ${detail}`);
    }
  }
}
console.log(`\n(${Math.round(performance.now() - t0)} ms)`);
