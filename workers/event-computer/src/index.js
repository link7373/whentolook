// index.js
import { computeMeteorEvents } from './events/meteors.js';

export default {
  // Cron trigger: runs daily at 00:00 UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(computeAllEvents(env));
  },

  // HTTP handler for manual triggering during development
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/trigger') {
      ctx.waitUntil(computeAllEvents(env));
      return new Response('Event computation triggered', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};

async function computeAllEvents(env) {
  const now = new Date().toISOString();
  console.log(`[event-computer] Running at ${now}`);

  // Fetch all active, confirmed subscribers with their enabled event types
  const { results: subscribers } = await env.DB.prepare(`
    SELECT
      s.id, s.email, s.latitude, s.longitude, s.timezone, s.unsubscribe_token,
      GROUP_CONCAT(p.event_type) AS subscribed_types
    FROM subscribers s
    JOIN preferences p ON p.subscriber_id = s.id AND p.enabled = 1
    WHERE s.active = 1 AND s.confirmed = 1
    GROUP BY s.id
  `).all();

  console.log(`[event-computer] Processing ${subscribers.length} subscribers`);

  for (const subscriber of subscribers) {
    const types = subscriber.subscribed_types
      ? subscriber.subscribed_types.split(',')
      : [];

    await processSubscriber(subscriber, types, now, env);
  }

  console.log('[event-computer] Done');
}

async function processSubscriber(subscriber, types, now, env) {
  const allEvents = [];

  if (types.includes('meteor')) {
    const meteorEvents = await computeMeteorEvents(subscriber, now, env.DB);
    allEvents.push(...meteorEvents);
  }

  // Additional event types will be added here in future tasks:
  // if (types.includes('iss')) { ... }
  // if (types.includes('fullmoon')) { ... }
  // if (types.includes('aurora')) { ... }

  if (allEvents.length === 0) return;

  // Insert all new events into the queue
  for (const evt of allEvents) {
    await env.DB.prepare(`
      INSERT INTO event_queue (id, subscriber_id, event_type, event_id, event_data, notify_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      crypto.randomUUID(),
      subscriber.id,
      evt.event_type,
      evt.event_id,
      evt.event_data,
      evt.notify_at,
      now
    ).run();

    console.log(`[event-computer] Queued ${evt.event_type} event ${evt.event_id} for ${subscriber.email} at ${evt.notify_at}`);
  }
}
