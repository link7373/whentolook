// starlink.js
// Computes visible Starlink train passes for subscribers.
// Only relevant for recently-launched Starlink groups (within ~14 days of launch).
// Uses CelesTrak to get recent NORAD IDs, then N2YO for pass predictions.
// Like ISS: only queues the single best pass per calendar day, dark skies only.

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=json';
const TRAIN_WINDOW_DAYS = 14; // satellites form visible trains within this window post-launch
const MIN_ELEVATION = 25;     // degrees -- lower threshold than ISS since trains are easier to spot

// Returns the Sun's altitude in degrees for a given location and time (~1 deg accuracy).
function solarAltitudeDeg(latDeg, lonDeg, date) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const JD = date.getTime() / 86400000 + 2440587.5;
  const D = JD - 2451545.0;
  let L = (280.46 + 0.9856474 * D) % 360; if (L < 0) L += 360;
  let g = (357.528 + 0.9856003 * D) % 360; if (g < 0) g += 360;
  const lambda = L + 1.915 * Math.sin(toRad(g)) + 0.020 * Math.sin(toRad(2 * g));
  const eps = 23.439 - 0.0000004 * D;
  const dec = Math.asin(Math.sin(toRad(eps)) * Math.sin(toRad(lambda)));
  let RA = toDeg(Math.atan2(Math.cos(toRad(eps)) * Math.sin(toRad(lambda)), Math.cos(toRad(lambda))));
  if (RA < 0) RA += 360;
  const GMST = (280.46061837 + 360.98564736629 * D) % 360;
  const LST = (GMST + lonDeg + 360) % 360;
  const HA = (LST - RA + 360) % 360;
  const sinAlt = Math.sin(toRad(latDeg)) * Math.sin(dec) +
    Math.cos(toRad(latDeg)) * Math.cos(dec) * Math.cos(toRad(HA));
  return toDeg(Math.asin(sinAlt));
}

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
 * Returns at most one event per calendar day (best dark-sky pass by elevation).
 * Returns empty array if no recent launch or API failure.
 */
export async function computeStarlinkEvents(subscriber, now, db, n2yoApiKey) {
  if (!n2yoApiKey) {
    console.warn('[starlink] N2YO_API_KEY not set -- skipping Starlink computation');
    return [];
  }

  const recentIds = await getRecentStarlinkIds(now);
  if (recentIds.length === 0) {
    console.log('[starlink] No recent Starlink launches -- skipping');
    return [];
  }

  const observerAlt = 0;
  const days = 2;

  // Collect all candidate passes across all recent NORAD IDs
  // Key: "dateKey-noradId", value: best pass for that satellite on that date
  // Then we pick the single best per date across all satellites.
  const passByDate = new Map(); // dateKey -> { pass, noradId }

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
      const passTimeMs = pass.startUTC * 1000;
      const notifyAtMs = passTimeMs - 60 * 60 * 1000;

      if (notifyAtMs <= Date.now()) continue;
      const hoursAway = (notifyAtMs - Date.now()) / (1000 * 60 * 60);
      if (hoursAway > 36) continue;

      // Only passes during dark skies (sun below civil twilight)
      const passDate = new Date(passTimeMs);
      const sunAlt = solarAltitudeDeg(subscriber.latitude, subscriber.longitude, passDate);
      if (sunAlt > -6) continue;

      const dateKey = passDate.toISOString().slice(0, 10);
      const existing = passByDate.get(dateKey);
      if (!existing || pass.maxEl > existing.pass.maxEl) {
        passByDate.set(dateKey, { pass, noradId });
      }
    }
  }

  const events = [];

  for (const [, { pass, noradId }] of passByDate) {
    const eventId = `starlink-${noradId}-${pass.startUTC}`;

    const alreadySent = await db.prepare(`
      SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'starlink' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (alreadySent) continue;

    const alreadyQueued = await db.prepare(`
      SELECT id FROM event_queue WHERE subscriber_id = ? AND event_type = 'starlink' AND event_id = ? AND status IN ('pending','sent')
    `).bind(subscriber.id, eventId).first();
    if (alreadyQueued) continue;

    const notifyAt = new Date(pass.startUTC * 1000 - 60 * 60 * 1000).toISOString();

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

  return events;
}
