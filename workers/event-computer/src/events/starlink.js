// starlink.js
// Computes visible Starlink train passes for subscribers.
// Only relevant for recently-launched Starlink groups (within ~14 days of launch).
// Uses CelesTrak to get recent NORAD IDs, then N2YO for pass predictions.

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=json';
const TRAIN_WINDOW_DAYS = 14; // satellites form visible trains within this window post-launch
const MIN_ELEVATION = 25; // degrees — lower threshold than ISS since trains are easier to spot

/**
 * Parses a CelesTrak JSON entry's epoch to a Date.
 * EPOCH field format: "YYYY-DDD.DDDDDDDD" (year + day-of-year fraction)
 */
function parseEpoch(epochStr) {
  const year = parseInt(epochStr.slice(0, 2), 10);
  const fullYear = year >= 57 ? 1900 + year : 2000 + year; // TLE 2-digit year convention
  const dayOfYear = parseFloat(epochStr.slice(2));
  const date = new Date(Date.UTC(fullYear, 0, 1));
  date.setUTCDate(date.getUTCDate() + Math.floor(dayOfYear) - 1);
  return date;
}

/**
 * Fetches recent Starlink NORAD IDs launched within TRAIN_WINDOW_DAYS.
 * Returns array of NORAD IDs (strings).
 */
async function getRecentStarlinkIds(now) {
  let satellites;
  try {
    const res = await fetch(CELESTRAK_URL);
    if (!res.ok) throw new Error(`CelesTrak error ${res.status}`);
    satellites = await res.json();
  } catch (err) {
    console.error('[starlink] CelesTrak fetch failed:', err.message);
    return [];
  }

  const cutoff = new Date(new Date(now).getTime() - TRAIN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const recentIds = [];
  for (const sat of satellites) {
    if (!sat.OBJECT_NAME || !sat.OBJECT_NAME.startsWith('STARLINK')) continue;
    const epoch = parseEpoch(sat.EPOCH);
    if (epoch >= cutoff) {
      recentIds.push(sat.NORAD_CAT_ID.toString());
    }
  }

  console.log(`[starlink] Found ${recentIds.length} recently-launched Starlink satellites`);
  return recentIds;
}

/**
 * Computes Starlink train pass events for a subscriber.
 * Returns empty array if no recent launch or API failure.
 */
export async function computeStarlinkEvents(subscriber, now, db, n2yoApiKey) {
  if (!n2yoApiKey) {
    console.warn('[starlink] N2YO_API_KEY not set — skipping Starlink computation');
    return [];
  }

  const recentIds = await getRecentStarlinkIds(now);
  if (recentIds.length === 0) {
    console.log('[starlink] No recent Starlink launches — skipping');
    return [];
  }

  const events = [];
  const observerAlt = 0;
  const days = 2;

  // Check a sample of recent IDs (first 20 max to avoid N2YO rate limits)
  const idsToCheck = recentIds.slice(0, 20);

  for (const noradId of idsToCheck) {
    const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${noradId}/${subscriber.latitude}/${subscriber.longitude}/${observerAlt}/${days}/${MIN_ELEVATION}/&apiKey=${n2yoApiKey}`;

    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }

    const passes = data.passes || [];

    for (const pass of passes) {
      const notifyAtMs = pass.startUTC * 1000 - 30 * 60 * 1000;
      const notifyAt = new Date(notifyAtMs).toISOString();

      if (notifyAtMs <= Date.now()) continue;
      const hoursAway = (notifyAtMs - Date.now()) / (1000 * 60 * 60);
      if (hoursAway > 36) continue;

      const eventId = `starlink-${noradId}-${pass.startUTC}`;

      const alreadySent = await db.prepare(`
        SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'starlink' AND event_id = ?
      `).bind(subscriber.id, eventId).first();
      if (alreadySent) continue;

      const alreadyQueued = await db.prepare(`
        SELECT id FROM event_queue WHERE subscriber_id = ? AND event_type = 'starlink' AND event_id = ? AND status IN ('pending','sent')
      `).bind(subscriber.id, eventId).first();
      if (alreadyQueued) continue;

      events.push({
        event_type: 'starlink',
        event_id: eventId,
        notify_at: notifyAt,
        event_data: JSON.stringify({
          norad_id: noradId,
          start_utc: new Date(pass.startUTC * 1000).toISOString(),
          duration_seconds: pass.duration,
          max_elevation: pass.maxEl,
          start_az_compass: pass.startAzCompass,
          end_az_compass: pass.endAzCompass,
          recent_satellite_count: recentIds.length,
          timezone: subscriber.timezone,
        }),
      });
    }
  }

  return events;
}
