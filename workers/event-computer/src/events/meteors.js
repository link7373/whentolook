// meteors.js
import { isPeakTonight } from '../utils/time.js';

// Inlined from data/meteor-showers.json — update annually
const METEOR_SHOWERS = [
  {
    id: 'quadrantids-2026', name: 'Quadrantids', peak: '2026-01-03T16:00:00Z',
    zhr: 120, velocity_kms: 40, radiant_constellation: 'Boötes',
    parent_object: 'Asteroid 2003 EH1', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 6,
  },
  {
    id: 'lyrids-2026', name: 'Lyrids', peak: '2026-04-22T08:00:00Z',
    zhr: 18, velocity_kms: 49, radiant_constellation: 'Lyra',
    parent_object: 'Comet Thatcher', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 12,
  },
  {
    id: 'eta-aquariids-2026', name: 'Eta Aquariids', peak: '2026-05-06T00:00:00Z',
    zhr: 50, velocity_kms: 66, radiant_constellation: 'Aquarius',
    parent_object: "Halley's Comet", particle_size: 'grain-of-sand',
    best_hemisphere: 'southern', peak_duration_hours: 24,
  },
  {
    id: 'delta-aquariids-2026', name: 'Delta Aquariids', peak: '2026-07-30T00:00:00Z',
    zhr: 25, velocity_kms: 41, radiant_constellation: 'Aquarius',
    parent_object: 'Comet 96P/Machholz', particle_size: 'grain-of-sand',
    best_hemisphere: 'southern', peak_duration_hours: 48,
  },
  {
    id: 'perseids-2026', name: 'Perseids', peak: '2026-08-12T20:00:00Z',
    zhr: 100, velocity_kms: 59, radiant_constellation: 'Perseus',
    parent_object: 'Comet Swift-Tuttle', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 24,
  },
  {
    id: 'draconids-2026', name: 'Draconids', peak: '2026-10-08T18:00:00Z',
    zhr: 10, velocity_kms: 20, radiant_constellation: 'Draco',
    parent_object: 'Comet 21P/Giacobini-Zinner', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 6,
  },
  {
    id: 'orionids-2026', name: 'Orionids', peak: '2026-10-21T20:00:00Z',
    zhr: 20, velocity_kms: 66, radiant_constellation: 'Orion',
    parent_object: "Halley's Comet", particle_size: 'grain-of-sand',
    best_hemisphere: 'both', peak_duration_hours: 24,
  },
  {
    id: 'leonids-2026', name: 'Leonids', peak: '2026-11-17T20:00:00Z',
    zhr: 15, velocity_kms: 71, radiant_constellation: 'Leo',
    parent_object: 'Comet 55P/Tempel-Tuttle', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 12,
  },
  {
    id: 'geminids-2026', name: 'Geminids', peak: '2026-12-14T02:00:00Z',
    zhr: 150, velocity_kms: 35, radiant_constellation: 'Gemini',
    parent_object: 'Asteroid 3200 Phaethon', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 24,
  },
  {
    id: 'ursids-2026', name: 'Ursids', peak: '2026-12-22T12:00:00Z',
    zhr: 10, velocity_kms: 33, radiant_constellation: 'Ursa Minor',
    parent_object: 'Comet 8P/Tuttle', particle_size: 'grain-of-sand',
    best_hemisphere: 'northern', peak_duration_hours: 12,
  },
];

/**
 * Computes meteor shower events to queue for a given subscriber.
 * Returns array of event objects ready to insert into event_queue.
 */
export async function computeMeteorEvents(subscriber, now, db) {
  const events = [];

  for (const shower of METEOR_SHOWERS) {
    if (!isPeakTonight(shower.peak, now)) continue;

    const eventId = shower.id;

    // Skip if already sent
    const alreadySent = await db.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'meteor' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (alreadySent) continue;

    // Skip if already queued (and not skipped/failed permanently)
    const alreadyQueued = await db.prepare(`
      SELECT id FROM event_queue
      WHERE subscriber_id = ? AND event_type = 'meteor' AND event_id = ?
        AND status IN ('pending', 'sent')
    `).bind(subscriber.id, eventId).first();
    if (alreadyQueued) continue;

    // Notify 6 hours before peak (evening of peak night)
    const peakDate = new Date(shower.peak);
    const notifyAt = new Date(peakDate.getTime() - 6 * 60 * 60 * 1000).toISOString();

    // If notify_at is more than 36h away, skip (will be picked up tomorrow's run)
    const hoursUntilNotify = (new Date(notifyAt) - new Date(now)) / (1000 * 60 * 60);
    if (hoursUntilNotify > 36) continue;

    events.push({
      event_type: 'meteor',
      event_id: eventId,
      notify_at: notifyAt,
      event_data: JSON.stringify(shower),
    });
  }

  return events;
}
