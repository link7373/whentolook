// index.js
import { notify } from './notify.js';
import { getCloudCover } from './weather.js';

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
      const to = url.searchParams.get('to');
      const type = url.searchParams.get('type') || 'meteor';
      if (!to) return new Response('Missing ?to= param', { status: 400 });

      const fixtures = {
        meteor: {
          name: 'Perseids', zhr: 100, radiant_constellation: 'Perseus',
          parent_object: 'Comet Swift-Tuttle', velocity_kms: 59,
          particle_size: 'grain-of-sand', unsubscribe_token: 'test-token',
        },
        iss: {
          start_utc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          duration_seconds: 240, max_elevation: 72,
          start_az_compass: 'SW', end_az_compass: 'NE',
          timezone: 'America/Vancouver', unsubscribe_token: 'test-token',
        },
        fullmoon: {
          name: 'Harvest Moon', supermoon: true,
          name_origin: 'Named for the full moon closest to the autumn equinox, when farmers historically used the extra light to harvest crops late into the evening',
          unsubscribe_token: 'test-token',
        },
        lunar_eclipse: {
          type: 'total',
          partial_start: '2026-03-03T04:30:00Z', total_start: '2026-03-03T05:41:00Z',
          maximum: '2026-03-03T06:33:00Z', total_end: '2026-03-03T07:25:00Z',
          partial_end: '2026-03-03T08:37:00Z', is_reminder: false,
          unsubscribe_token: 'test-token',
        },
        solar_eclipse: {
          type: 'total', path_description: 'Arctic, Greenland, Iceland, Spain',
          unsubscribe_token: 'test-token',
        },
        starlink: {
          start_utc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          duration_seconds: 180, max_elevation: 45,
          start_az_compass: 'WSW', end_az_compass: 'NNE',
          recent_satellite_count: 52, timezone: 'America/Vancouver',
          unsubscribe_token: 'test-token',
        },
      };

      const fixture = fixtures[type];
      if (!fixture) return new Response(`Unknown type. Options: ${Object.keys(fixtures).join(', ')}`, { status: 400 });

      // Look up real subscriber so unsubscribe/preferences links in the email work
      const sub = await env.DB.prepare(
        'SELECT email, unsubscribe_token FROM subscribers WHERE email = ?'
      ).bind(to).first();
      const unsubscribeToken = sub?.unsubscribe_token ?? 'test-token';
      fixture.unsubscribe_token = unsubscribeToken;

      try {
        const emailId = await notify(
          { email: to },
          { event_type: type, event_data: JSON.stringify(fixture) },
          { sendgridApiKey: env.SENDGRID_API_KEY }
        );
        return new Response(`✅ ${type} email sent: ${emailId}`, { status: 200 });
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
    SELECT eq.*, s.email, s.timezone, s.unsubscribe_token,
           s.suppress_if_cloudy, s.latitude, s.longitude
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
  // Weather suppression: skip if subscriber opted in and cloud cover >= 80%
  if (event.suppress_if_cloudy) {
    const cover = await getCloudCover(event.latitude, event.longitude, event.notify_at);
    if (cover !== null && cover >= 80) {
      await env.DB.prepare(
        `UPDATE event_queue SET status = 'skipped_weather' WHERE id = ?`
      ).bind(event.id).run();
      console.log(`[dispatcher] Skipped ${event.id} (${event.event_type}) — cloud cover ${cover}%`);
      return;
    }
  }

  // Inject unsubscribe_token into event_data for template use
  const eventData = JSON.parse(event.event_data);
  eventData.unsubscribe_token = event.unsubscribe_token;

  const enrichedEvent = { ...event, event_data: JSON.stringify(eventData) };

  try {
    const emailId = await notify(
      { email: event.email },
      enrichedEvent,
      { sendgridApiKey: env.SENDGRID_API_KEY }
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
