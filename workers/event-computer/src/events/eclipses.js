// eclipses.js
import { isPeakTonight } from '../utils/time.js';

const LUNAR_ECLIPSES = [
  {
    id: 'lunar-eclipse-2026-03-03',
    date: '2026-03-03',
    type: 'total',
    penumbral_start: '2026-03-03T03:21:00Z',
    partial_start: '2026-03-03T04:30:00Z',
    total_start: '2026-03-03T05:41:00Z',
    maximum: '2026-03-03T06:33:00Z',
    total_end: '2026-03-03T07:25:00Z',
    partial_end: '2026-03-03T08:37:00Z',
    penumbral_end: '2026-03-03T09:46:00Z',
    visibility: 'Americas, Europe, Africa',
  },
  {
    id: 'lunar-eclipse-2026-08-28',
    date: '2026-08-28',
    type: 'partial',
    penumbral_start: '2026-08-28T08:00:00Z',
    partial_start: '2026-08-28T09:13:00Z',
    maximum: '2026-08-28T10:12:00Z',
    partial_end: '2026-08-28T11:11:00Z',
    penumbral_end: '2026-08-28T12:24:00Z',
    visibility: 'Asia, Australia, Pacific',
  },
];

const SOLAR_ECLIPSES = [
  {
    id: 'solar-eclipse-2026-08-12',
    date: '2026-08-12',
    type: 'total',
    path_description: 'Arctic, Greenland, Iceland, northern Spain',
    max_duration_seconds: 132,
  },
];

export async function computeEclipseEvents(subscriber, now, db) {
  const events = [];

  // Lunar eclipses — notify 1 hour before penumbral contact
  for (const eclipse of LUNAR_ECLIPSES) {
    if (!isPeakTonight(eclipse.maximum, now)) continue;

    const eventId = eclipse.id;
    const notifyAt = new Date(new Date(eclipse.penumbral_start).getTime() - 60 * 60 * 1000).toISOString();

    const alreadySent = await db.prepare(`
      SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'lunar_eclipse' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (alreadySent) continue;

    const alreadyQueued = await db.prepare(`
      SELECT id FROM event_queue WHERE subscriber_id = ? AND event_type = 'lunar_eclipse' AND event_id = ? AND status IN ('pending','sent')
    `).bind(subscriber.id, eventId).first();
    if (alreadyQueued) continue;

    events.push({
      event_type: 'lunar_eclipse',
      event_id: eventId,
      notify_at: notifyAt,
      event_data: JSON.stringify({ ...eclipse, unsubscribe_token: subscriber.unsubscribe_token, timezone: subscriber.timezone }),
    });

    // Also queue a reminder the day before for total eclipses
    if (eclipse.type === 'total') {
      const reminderId = `${eventId}-reminder`;
      const reminderAt = new Date(new Date(eclipse.penumbral_start).getTime() - 24 * 60 * 60 * 1000).toISOString();
      const hoursUntil = (new Date(reminderAt) - new Date(now)) / (1000 * 60 * 60);
      if (hoursUntil >= 0 && hoursUntil <= 36) {
        const reminderSent = await db.prepare(`
          SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'lunar_eclipse' AND event_id = ?
        `).bind(subscriber.id, reminderId).first();
        if (!reminderSent) {
          events.push({
            event_type: 'lunar_eclipse',
            event_id: reminderId,
            notify_at: reminderAt,
            event_data: JSON.stringify({ ...eclipse, is_reminder: true, unsubscribe_token: subscriber.unsubscribe_token, timezone: subscriber.timezone }),
          });
        }
      }
    }
  }

  // Solar eclipses — notify the morning of eclipse day
  for (const eclipse of SOLAR_ECLIPSES) {
    if (!isPeakTonight(eclipse.date + 'T12:00:00Z', now)) continue;

    const eventId = eclipse.id;
    // Notify at 8am UTC as a reasonable morning notification
    const notifyAt = new Date(eclipse.date + 'T08:00:00Z').toISOString();

    const alreadySent = await db.prepare(`
      SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'solar_eclipse' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (alreadySent) continue;

    const alreadyQueued = await db.prepare(`
      SELECT id FROM event_queue WHERE subscriber_id = ? AND event_type = 'solar_eclipse' AND event_id = ? AND status IN ('pending','sent')
    `).bind(subscriber.id, eventId).first();
    if (alreadyQueued) continue;

    events.push({
      event_type: 'solar_eclipse',
      event_id: eventId,
      notify_at: notifyAt,
      event_data: JSON.stringify({ ...eclipse, unsubscribe_token: subscriber.unsubscribe_token, timezone: subscriber.timezone }),
    });
  }

  return events;
}
