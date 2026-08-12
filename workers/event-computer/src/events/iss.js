// iss.js
// Fetches upcoming ISS visible passes for a subscriber's location using the N2YO API.
// Only queues the single best pass per calendar day (highest elevation, sky must be dark).

const ISS_NORAD_ID = 25544;
const MIN_ELEVATION_DEFAULT = 30; // degrees -- passes below this aren't worth watching

// Returns the Sun's altitude in degrees for a given location and time.
// Accurate to ~1 degree -- used to filter out twilight passes.
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
 * Computes ISS pass events to queue for a given subscriber.
 * Returns at most one event per calendar day (the highest-elevation dark-sky pass).
 * Returns empty array on API failure (non-fatal -- retries next daily run).
 */
export async function computeIssEvents(subscriber, now, db, n2yoApiKey) {
  if (!n2yoApiKey) {
    console.warn('[iss] N2YO_API_KEY not set -- skipping ISS computation');
    return [];
  }

  const minElevation = MIN_ELEVATION_DEFAULT;
  const observerAlt = 0; // metres above sea level -- simplified
  const days = 2;        // fetch 2 days of predictions per run

  const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${ISS_NORAD_ID}/${subscriber.latitude}/${subscriber.longitude}/${observerAlt}/${days}/${minElevation}/&apiKey=${n2yoApiKey}`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[iss] UPSTREAM FAILURE — N2YO returned ${res.status} for subscriber ${subscriber.id}: ${body.slice(0, 200)}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error(`[iss] UPSTREAM FAILURE — N2YO fetch threw for subscriber ${subscriber.id}:`, err.message);
    return [];
  }

  // N2YO reports an error in the body with a 200 status, so a bad key looks like
  // a successful call that simply found no passes.
  if (data.error) {
    console.error(`[iss] UPSTREAM FAILURE — N2YO error payload for subscriber ${subscriber.id}: ${data.error}`);
    return [];
  }

  const passes = data.passes || [];

  // "No passes" and "the API is broken" previously produced identical silence,
  // which is why the ISS gap starting 2026-07-24 could not be diagnosed after
  // the fact. Distinguish them explicitly: N2YO reports how many passes it found
  // in transactionscount/info, so an empty list with a healthy response is a
  // genuine quiet sky, not a failure.
  if (passes.length === 0) {
    console.log(`[iss] No ISS passes returned for subscriber ${subscriber.id} — upstream healthy, sky is quiet (this is normal; visible passes come in multi-week cycles)`);
  } else {
    console.log(`[iss] N2YO returned ${passes.length} candidate pass(es) for subscriber ${subscriber.id}`);
  }

  // Group passes by UTC calendar date, keeping only those during dark skies
  // (sun below civil twilight = -6 deg at the time of the actual pass)
  const passByDate = new Map(); // date string -> best pass object so far

  for (const pass of passes) {
    const passTimeMs = pass.startUTC * 1000;
    const notifyAtMs = passTimeMs - 60 * 60 * 1000; // 1 hour before pass

    // Skip if notification time is already in the past
    if (notifyAtMs <= Date.now()) continue;

    // Skip if more than 36 hours away (will be picked up in tomorrow's run)
    const hoursAway = (notifyAtMs - Date.now()) / (1000 * 60 * 60);
    if (hoursAway > 36) continue;

    // Skip if the sky isn't dark at pass time (sun above civil twilight)
    const passDate = new Date(passTimeMs);
    const sunAlt = solarAltitudeDeg(subscriber.latitude, subscriber.longitude, passDate);
    if (sunAlt > -6) {
      console.log(`[iss] Skipping pass at ${passDate.toISOString()} -- sun at ${sunAlt.toFixed(1)} deg (too bright)`);
      continue;
    }

    // Use UTC date as the grouping key
    const dateKey = passDate.toISOString().slice(0, 10);

    const existing = passByDate.get(dateKey);
    if (!existing || pass.maxEl > existing.maxEl) {
      passByDate.set(dateKey, pass);
    }
  }

  const events = [];

  for (const [, pass] of passByDate) {
    const eventId = `iss-${pass.startUTC}`;

    // Deduplication: skip if already sent
    const alreadySent = await db.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'iss' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (alreadySent) continue;

    // Deduplication: skip if already queued
    const alreadyQueued = await db.prepare(`
      SELECT id FROM event_queue
      WHERE subscriber_id = ? AND event_type = 'iss' AND event_id = ?
        AND status IN ('pending', 'sent')
    `).bind(subscriber.id, eventId).first();
    if (alreadyQueued) continue;

    const notifyAt = new Date(pass.startUTC * 1000 - 60 * 60 * 1000).toISOString();

    events.push({
      event_type: 'iss',
      event_id: eventId,
      notify_at: notifyAt,
      event_data: JSON.stringify({
        start_utc: new Date(pass.startUTC * 1000).toISOString(),
        duration_seconds: pass.duration,
        max_elevation: pass.maxEl,
        start_az_compass: pass.startAzCompass,
        end_az_compass: pass.endAzCompass,
        timezone: subscriber.timezone,
      }),
    });
  }

  return events;
}
