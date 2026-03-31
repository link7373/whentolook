// index.js
import { notify } from './notify.js';

export default {
  // Cron trigger: runs every 5 minutes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },

  // HTTP handler: allows manual trigger via GET /trigger (dev only)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/trigger') {
      ctx.waitUntil(dispatch(env));
      return new Response('Dispatch triggered', { status: 200 });
    }

    if (url.pathname === '/test-email') {
      // Temporary test route — remove after verifying emails send
      const testEmailAddress = url.searchParams.get('to');
      if (!testEmailAddress) {
        return new Response('Missing ?to= param', { status: 400 });
      }
      try {
        const emailId = await notify(
          { email: testEmailAddress },
          {
            event_type: 'meteor',
            event_data: JSON.stringify({
              name: 'Lyrids',
              zhr: 18,
              radiant_constellation: 'Lyra',
              parent_object: 'Comet Thatcher',
              velocity_kms: 49,
              particle_size: 'grain-of-sand',
              unsubscribe_token: 'test-token-preview',
            }),
          },
          env.RESEND_API_KEY
        );
        return new Response(`✅ Email sent: ${emailId}`, { status: 200 });
      } catch (err) {
        return new Response(`❌ Error: ${err.message}`, { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

async function dispatch(env) {
  const now = new Date().toISOString();

  const { results } = await env.DB.prepare(`
    SELECT eq.*, s.email, s.timezone, s.unsubscribe_token
    FROM event_queue eq
    JOIN subscribers s ON s.id = eq.subscriber_id
    WHERE eq.status = 'pending' AND eq.notify_at <= ?
    LIMIT 50
  `).bind(now).all();

  for (const event of results) {
    await processEvent(event, env);
  }
}

async function processEvent(event, env) {
  // Inject unsubscribe_token into event_data for template use
  const eventData = JSON.parse(event.event_data);
  eventData.unsubscribe_token = event.unsubscribe_token;

  const enrichedEvent = { ...event, event_data: JSON.stringify(eventData) };

  try {
    const emailId = await notify(
      { email: event.email },
      enrichedEvent,
      env.RESEND_API_KEY
    );

    await env.DB.prepare(`
      UPDATE event_queue SET status = 'sent' WHERE id = ?
    `).bind(event.id).run();

    await env.DB.prepare(`
      INSERT INTO notification_log (id, subscriber_id, event_type, event_id, sent_at, email_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      event.subscriber_id,
      event.event_type,
      event.event_id,
      new Date().toISOString(),
      emailId
    ).run();

  } catch (err) {
    console.error(`Failed to send event ${event.id}:`, err.message);

    // Track retry attempts inside event_data
    const data = JSON.parse(event.event_data);
    data._attempts = (data._attempts || 0) + 1;
    const newStatus = data._attempts >= 3 ? 'skipped' : 'pending';

    await env.DB.prepare(`
      UPDATE event_queue SET status = ?, event_data = ? WHERE id = ?
    `).bind(newStatus, JSON.stringify(data), event.id).run();
  }
}
