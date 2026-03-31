// iss.js
// Fetches upcoming ISS visible passes for a subscriber's location using the N2YO API.

const ISS_NORAD_ID = 25544;
const MIN_ELEVATION_DEFAULT = 30; // degrees — passes below this aren't worth watching

/**
 * Computes ISS pass events to queue for a given subscriber.
 * Returns array of event objects ready for event_queue insertion.
 * Returns empty array on API failure (non-fatal — retries next daily run).
 */
export async function computeIssEvents(subscriber, now, db, n2yoApiKey) {
  if (!n2yoApiKey) {
    console.warn('[iss] N2YO_API_KEY not set — skipping ISS computation');
    return [];
  }

  const minElevation = MIN_ELEVATION_DEFAULT;
  const observerAlt = 0; // metres above sea level — simplified
  const days = 2;        // fetch 2 days of predictions per run

  const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${ISS_NORAD_ID}/${subscriber.latitude}/${subscriber.longitude}/${observerAlt}/${days}/${minElevation}/&apiKey=${n2yoApiKey}`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[iss] N2YO API error ${res.status} for subscriber ${subscriber.id}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error(`[iss] Fetch failed for subscriber ${subscriber.id}:`, err.message);
    return [];
  }

  const passes = data.passes || [];
  const events = [];

  for (const pass of passes) {
    // pass.startUTC is a Unix timestamp (seconds)
    const notifyAtMs = pass.startUTC * 1000 - 30 * 60 * 1000; // 30 min before pass
    const notifyAt = new Date(notifyAtMs).toISOString();

    // Skip if notification time is already in the past
    if (notifyAtMs <= Date.now()) continue;

    // Skip if more than 36 hours away (will be picked up in tomorrow's run)
    const hoursAway = (notifyAtMs - Date.now()) / (1000 * 60 * 60);
    if (hoursAway > 36) continue;

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
