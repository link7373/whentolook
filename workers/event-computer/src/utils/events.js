// events.js — helpers shared by the event modules.

// True if this exact event has already been sent to, or queued for, the subscriber.
export async function alreadyHandled(db, subscriberId, eventType, eventId) {
  const sent = await db.prepare(`
    SELECT id FROM notification_log
    WHERE subscriber_id = ? AND event_type = ? AND event_id = ?
  `).bind(subscriberId, eventType, eventId).first();
  if (sent) return true;

  const queued = await db.prepare(`
    SELECT id FROM event_queue
    WHERE subscriber_id = ? AND event_type = ? AND event_id = ?
      AND status IN ('pending', 'sent')
  `).bind(subscriberId, eventType, eventId).first();
  return Boolean(queued);
}

// Astronomy for one location is shared by everyone nearby. 0.1° (about 11 km)
// moves rise/set and eclipse contact times by well under a minute.
// Computing once per cell keeps the daily run cheap as subscribers grow.
export function locationCell(subscriber) {
  const lat = Math.round(subscriber.latitude * 10) / 10;
  const lon = Math.round(subscriber.longitude * 10) / 10;
  return { lat, lon, key: `${lat},${lon}` };
}

export function memo(cache, key, compute) {
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key);
}
