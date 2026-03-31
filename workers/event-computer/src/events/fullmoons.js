// fullmoons.js
import { isPeakTonight } from '../utils/time.js';

const FULL_MOONS = [
  { id: 'fullmoon-2026-01', date: '2026-01-03T10:03:00Z', name: 'Wolf Moon', supermoon: false, name_origin: 'Named by Algonquin peoples for the howling of wolves in deep winter' },
  { id: 'fullmoon-2026-02', date: '2026-02-01T22:09:00Z', name: 'Snow Moon', supermoon: false, name_origin: 'Named for the heavy snowfall typical in February in North America' },
  { id: 'fullmoon-2026-03', date: '2026-03-03T11:38:00Z', name: 'Worm Moon', supermoon: false, name_origin: 'Named for earthworms appearing as the ground thaws in spring' },
  { id: 'fullmoon-2026-04', date: '2026-04-02T02:12:00Z', name: 'Pink Moon', supermoon: false, name_origin: 'Named for wild ground phlox, one of the first spring flowers' },
  { id: 'fullmoon-2026-05', date: '2026-05-01T17:23:00Z', name: 'Flower Moon', supermoon: true, name_origin: 'Named for the abundance of flowers blooming in May' },
  { id: 'fullmoon-2026-06', date: '2026-05-31T08:45:00Z', name: 'Strawberry Moon', supermoon: true, name_origin: 'Named for the strawberry harvesting season beginning in June' },
  { id: 'fullmoon-2026-07', date: '2026-06-30T00:57:00Z', name: 'Buck Moon', supermoon: false, name_origin: 'Named for male deer beginning to regrow antlers in July' },
  { id: 'fullmoon-2026-08', date: '2026-07-29T17:36:00Z', name: 'Sturgeon Moon', supermoon: false, name_origin: 'Named for the large sturgeon fish easily caught in the Great Lakes in August' },
  { id: 'fullmoon-2026-09', date: '2026-08-28T10:54:00Z', name: 'Harvest Moon', supermoon: false, name_origin: 'Named for the full moon closest to the autumnal equinox, when farmers harvest by moonlight' },
  { id: 'fullmoon-2026-10', date: '2026-09-27T02:49:00Z', name: "Hunter's Moon", supermoon: false, name_origin: 'Named for the time to hunt game fattened through summer before winter' },
  { id: 'fullmoon-2026-11', date: '2026-10-26T16:12:00Z', name: 'Beaver Moon', supermoon: false, name_origin: 'Named for the time to set beaver traps before swamps froze' },
  { id: 'fullmoon-2026-12', date: '2026-11-25T02:53:00Z', name: 'Cold Moon', supermoon: false, name_origin: 'Named for the cold nights as winter sets in' },
];

export async function computeFullMoonEvents(subscriber, now, db) {
  const events = [];

  for (const moon of FULL_MOONS) {
    if (!isPeakTonight(moon.date, now)) continue;

    const alreadySent = await db.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'fullmoon' AND event_id = ?
    `).bind(subscriber.id, moon.id).first();
    if (alreadySent) continue;

    const alreadyQueued = await db.prepare(`
      SELECT id FROM event_queue
      WHERE subscriber_id = ? AND event_type = 'fullmoon' AND event_id = ?
        AND status IN ('pending', 'sent')
    `).bind(subscriber.id, moon.id).first();
    if (alreadyQueued) continue;

    // Notify at local sunset — approximate as 6 hours before peak
    const notifyAt = new Date(new Date(moon.date).getTime() - 6 * 60 * 60 * 1000).toISOString();

    events.push({
      event_type: 'fullmoon',
      event_id: moon.id,
      notify_at: notifyAt,
      event_data: JSON.stringify({ ...moon, unsubscribe_token: subscriber.unsubscribe_token, timezone: subscriber.timezone }),
    });
  }

  return events;
}
