// index.js
import { notify } from './notify.js';
import { getCloudCover } from './weather.js';

// How long after notify_at an email is still worth sending.
//
// A "go outside NOW" message that lands after the event has passed is worse than
// no message at all — it teaches people the alerts can't be trusted, and the
// product's whole promise is timing. So retries are bounded by relevance, not
// just by attempt count.
const FRESHNESS_HOURS = {
  iss: 1,             // notify_at is 1h pre-pass; the pass itself lasts minutes
  starlink: 1,
  lunar_eclipse: 4,
  meteor: 10,         // all-night events tolerate a late send
  fullmoon: 10,
  solar_eclipse: 10,
};
const DEFAULT_FRESHNESS_HOURS = 6;

// Minutes to wait before each subsequent attempt. Five tries spread over ~3
// hours, rather than the old three tries inside 15 minutes — which meant any
// provider blip longer than a quarter hour destroyed the notification for good.
const BACKOFF_MINUTES = [5, 15, 45, 120];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

// Health check thresholds.
const SILENCE_ALERT_HOURS = 72;

export default {
  async scheduled(event, env, ctx) {
    // Two crons on this Worker: the 5-minute dispatch loop and a daily health
    // check. event.cron distinguishes them.
    if (event.cron === '0 12 * * *') {
      ctx.waitUntil(runHealthCheck(env));
    } else {
      ctx.waitUntil(dispatch(env));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/trigger') {
      ctx.waitUntil(dispatch(env));
      return new Response('Dispatch triggered', { status: 200 });
    }

    // Human-readable health snapshot. Answers "is it sending?" without a query.
    if (url.pathname === '/health') {
      const report = await buildHealthReport(env);
      return new Response(JSON.stringify(report, null, 2), {
        status: report.healthy ? 200 : 503,
        headers: { 'content-type': 'application/json' },
      });
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
          { apiKey: env.BREVO_API_KEY }
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
    WHERE eq.status = 'pending'
      AND eq.notify_at <= ?
      AND (eq.next_attempt_at IS NULL OR eq.next_attempt_at <= ?)
    LIMIT 50
  `).bind(now, now).all();

  for (const event of results) {
    await processEvent(event, env);
  }
}

// Returns the moment after which this event is no longer worth delivering.
function stalenessDeadline(event) {
  const hours = FRESHNESS_HOURS[event.event_type] ?? DEFAULT_FRESHNESS_HOURS;
  return new Date(new Date(event.notify_at).getTime() + hours * 60 * 60 * 1000);
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

  // Don't send something that's no longer true.
  if (new Date() > stalenessDeadline(event)) {
    await env.DB.prepare(`
      UPDATE event_queue
      SET status = 'expired',
          last_error = COALESCE(last_error, 'Event window closed before any send succeeded')
      WHERE id = ?
    `).bind(event.id).run();
    console.error(`[dispatcher] EXPIRED ${event.id} (${event.event_type}) after ${event.attempts} attempts — window closed`);
    return;
  }

  // Inject unsubscribe_token into event_data for template use
  const eventData = JSON.parse(event.event_data);
  eventData.unsubscribe_token = event.unsubscribe_token;

  const enrichedEvent = { ...event, event_data: JSON.stringify(eventData) };

  try {
    const emailId = await notify(
      { email: event.email },
      enrichedEvent,
      { apiKey: env.BREVO_API_KEY }
    );

    await env.DB.prepare(`
      UPDATE event_queue SET status = 'sent', last_error = NULL WHERE id = ?
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

    console.log(`[dispatcher] Sent ${event.event_type} to ${event.email} (${emailId})`);

  } catch (err) {
    const attempts = (event.attempts ?? 0) + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;

    // The reason now lives in the database, not just a console line. This is the
    // single change that would have turned the July outage from five invisible
    // weeks into one obvious query.
    const message = String(err.message ?? err).slice(0, 500);

    if (giveUp) {
      await env.DB.prepare(`
        UPDATE event_queue SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?
      `).bind(attempts, message, event.id).run();
      console.error(`[dispatcher] FAILED PERMANENTLY ${event.id} (${event.event_type}) after ${attempts} attempts: ${message}`);
    } else {
      const waitMins = BACKOFF_MINUTES[attempts - 1];
      const nextAttemptAt = new Date(Date.now() + waitMins * 60 * 1000).toISOString();
      await env.DB.prepare(`
        UPDATE event_queue
        SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ?
        WHERE id = ?
      `).bind(attempts, nextAttemptAt, message, event.id).run();
      console.warn(`[dispatcher] Attempt ${attempts}/${MAX_ATTEMPTS} failed for ${event.id}, retrying in ${waitMins}m: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Health check — the dead man's switch
// ---------------------------------------------------------------------------

async function buildHealthReport(env) {
  const lastSent = await env.DB.prepare(
    `SELECT MAX(sent_at) AS t FROM notification_log`
  ).first();

  // Terminal failures in the last day mean delivery is actively broken.
  const recentlyDead = await env.DB.prepare(`
    SELECT COUNT(*) AS n, MAX(last_error) AS sample
    FROM event_queue
    WHERE status IN ('failed', 'expired')
      AND notify_at >= datetime('now', '-1 day')
  `).first();

  // Was there anything to send during the silence? A quiet sky is not an outage.
  const dueInWindow = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM event_queue
    WHERE notify_at >= datetime('now', ?) AND notify_at <= datetime('now')
  `).bind(`-${SILENCE_ALERT_HOURS} hours`).first();

  const hoursSinceSend = lastSent?.t
    ? (Date.now() - new Date(lastSent.t).getTime()) / 3600000
    : Infinity;

  const problems = [];
  if ((recentlyDead?.n ?? 0) > 0) {
    problems.push(`${recentlyDead.n} event(s) failed or expired in the last 24h. Last error: ${recentlyDead.sample}`);
  }
  if (hoursSinceSend > SILENCE_ALERT_HOURS && (dueInWindow?.n ?? 0) > 0) {
    problems.push(`Nothing sent in ${Math.round(hoursSinceSend)}h despite ${dueInWindow.n} event(s) coming due.`);
  }

  return {
    healthy: problems.length === 0,
    checked_at: new Date().toISOString(),
    last_sent_at: lastSent?.t ?? null,
    hours_since_last_send: Number.isFinite(hoursSinceSend) ? Math.round(hoursSinceSend) : null,
    events_due_in_window: dueInWindow?.n ?? 0,
    terminal_failures_24h: recentlyDead?.n ?? 0,
    problems,
  };
}

async function runHealthCheck(env) {
  const report = await buildHealthReport(env);

  if (report.healthy) {
    console.log('[health] OK —', JSON.stringify(report));
  } else {
    console.error('[health] UNHEALTHY —', JSON.stringify(report));
  }

  // Report to an external monitor. Deliberately not email: the failure mode this
  // exists to catch is "email is broken", so an emailed alert would be lost in
  // exactly the situation it matters. HEARTBEAT_URL is optional — without it the
  // check still runs and still logs, it just can't page anyone.
  if (!env.HEARTBEAT_URL) {
    console.warn('[health] HEARTBEAT_URL not set — no external alerting configured');
    return;
  }

  const target = report.healthy ? env.HEARTBEAT_URL : `${env.HEARTBEAT_URL}/fail`;
  try {
    await fetch(target, {
      method: 'POST',
      body: report.problems.join('\n') || 'ok',
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('[health] Failed to reach heartbeat monitor:', err.message);
  }
}
