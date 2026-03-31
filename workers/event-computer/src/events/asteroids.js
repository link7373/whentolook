// asteroids.js
// Fetches close asteroid approaches from JPL CNEOS — no API key required.

const MAX_DIST_LD = 20;      // lunar distances
const MIN_DIAMETER_M = 100;  // metres

export async function computeAsteroidEvents(subscriber, now, db) {
  const today = now.slice(0, 10);
  const tomorrow = new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const url = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${today}&date-max=${tomorrow}&dist-max=50LD&sort=dist&diameter=true`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[asteroids] JPL API error ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error('[asteroids] Fetch failed:', err.message);
    return [];
  }

  if (!data.data || data.data.length === 0) return [];

  // JPL field order from data.fields
  const fields = data.fields;
  const idx = (name) => fields.indexOf(name);

  const events = [];
  // Only one asteroid notification per subscriber per day (the closest/most notable)
  let bestAsteroid = null;

  for (const row of data.data) {
    const dist_ld = parseFloat(row[idx('dist')]) * 389.17; // AU to LD (1 AU ≈ 389.17 LD)
    const diameter_km = row[idx('diameter')] ? parseFloat(row[idx('diameter')]) : null;
    const diameter_m = diameter_km ? diameter_km * 1000 : null;
    const name = row[idx('des')];
    const cd = row[idx('cd')]; // close-approach date string

    // Apply filtering thresholds
    const isNewsworthy = (diameter_m && diameter_m >= MIN_DIAMETER_M && dist_ld <= MAX_DIST_LD)
      || (diameter_m && diameter_m >= 500 && dist_ld <= 50);

    if (!isNewsworthy) continue;

    if (!bestAsteroid || dist_ld < bestAsteroid.dist_ld) {
      bestAsteroid = { name, dist_ld, diameter_m, cd, dist_au: row[idx('dist')], v_rel: row[idx('v_rel')] };
    }
  }

  if (!bestAsteroid) return [];

  const eventId = `asteroid-${bestAsteroid.name.replace(/\s+/g, '-')}-${today}`;

  const alreadySent = await db.prepare(`
    SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'asteroid' AND event_id = ?
  `).bind(subscriber.id, eventId).first();
  if (alreadySent) return [];

  const alreadyQueued = await db.prepare(`
    SELECT id FROM event_queue WHERE subscriber_id = ? AND event_type = 'asteroid' AND event_id = ? AND status IN ('pending','sent')
  `).bind(subscriber.id, eventId).first();
  if (alreadyQueued) return [];

  // Notify at 7pm local time — approximate as today at 19:00 UTC
  const notifyAt = `${today}T19:00:00Z`;

  events.push({
    event_type: 'asteroid',
    event_id: eventId,
    notify_at: notifyAt,
    event_data: JSON.stringify({ ...bestAsteroid, unsubscribe_token: subscriber.unsubscribe_token }),
  });

  return events;
}
