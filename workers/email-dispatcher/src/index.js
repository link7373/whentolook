// index.js
import { notify } from './notify.js';
import { getCloudCover } from './weather.js';
// The eclipse table lives with the event computer. It's imported here only so the
// health check can warn before the data runs out. Wrangler bundles it at deploy time.
import { ECLIPSE_DATA_THROUGH } from '../../event-computer/src/data/eclipses.js';

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
// Start failing the health check this long before the eclipse table ends.
// That leaves months to paste in the next rows from NASA's catalog.
const DATA_RUNWAY_ALERT_DAYS = 180;

// Brevo block reasons that mean "stop emailing this person".
const BREVO_STOP_REASONS = new Set([
  'unsubscribedViaEmail', 'unsubscribedViaApi', 'unsubscribedViaMA',
  'contactFlaggedAsSpam', 'hardBounce', 'adminBlocked',
]);

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
        // Same shape as the event computer's output. The values are
        // illustrative, not real computed circumstances. For those, run
        // workers/event-computer/scripts/simulate-events.mjs.
        meteor: {
          name: 'Perseids', zhr: 100, radiant_constellation: 'Perseus',
          parent_object: 'Comet Swift-Tuttle', velocity_kms: 59,
          particle_size: 'grain-of-sand', peak: '2027-08-13T08:10:00Z',
          dark_start: '2027-08-13T05:48:00Z', dark_end: '2027-08-13T10:52:00Z',
          darkness: 'astronomical', moon_illumination: 12, moon_up_fraction: 0.1,
          moon_conditions: 'excellent', timezone: 'America/Vancouver',
          unsubscribe_token: 'test-token',
        },
        iss: {
          start_utc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          duration_seconds: 240, max_elevation: 72,
          start_az_compass: 'SW', end_az_compass: 'NE',
          timezone: 'America/Vancouver', unsubscribe_token: 'test-token',
        },
        fullmoon: {
          name: 'Cold Moon', supermoon: true, distance_km: 356740, percent_closer: 7.2,
          name_origin: 'Named for the long, cold nights as winter sets in',
          full_moon_utc: '2026-12-24T01:28:00Z', moonrise_utc: '2026-12-23T23:40:00Z',
          moonrise_direction: 'NE', circumpolar: false,
          timezone: 'America/Vancouver', unsubscribe_token: 'test-token',
        },
        lunar_eclipse: {
          type: 'total',
          penumbral_start: '2029-06-26T01:14:00Z', partial_start: '2029-06-26T01:33:00Z',
          total_start: '2029-06-26T02:31:00Z', maximum: '2029-06-26T03:22:00Z',
          total_end: '2029-06-26T04:13:00Z', partial_end: '2029-06-26T05:12:00Z',
          penumbral_end: '2029-06-26T05:30:00Z',
          look_direction: 'SE', look_altitude: 14,
          moon_rises_during: '2029-06-26T03:40:00Z', moon_sets_during: null,
          contact_visible: { penumbral_start: false, partial_start: false, total_start: false, maximum: false, total_end: true, partial_end: true, penumbral_end: true },
          is_reminder: false, timezone: 'America/New_York',
          unsubscribe_token: 'test-token',
        },
        solar_eclipse: {
          type: 'total', local_type: 'partial', percent_covered: 87,
          location_name: 'Madrid, Spain',
          local_start: '2027-08-02T07:42:00Z', local_maximum: '2027-08-02T08:51:00Z',
          local_end: '2027-08-02T10:05:00Z',
          visible_start: '2027-08-02T07:42:00Z', visible_end: '2027-08-02T10:05:00Z',
          starts_before_sunrise: false, ends_after_sunset: false,
          sun_altitude_at_max: 40, sun_direction_at_max: 'E',
          path_description: 'southern Spain, North Africa (including Luxor, Egypt) and the Arabian Peninsula',
          map_url: 'https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=20270802',
          is_reminder: false, timezone: 'Europe/Madrid',
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

  // The 2026 tables ran dry silently once. Don't let the eclipse table do the same.
  const runwayDays = Math.floor((Date.parse(`${ECLIPSE_DATA_THROUGH}T00:00:00Z`) - Date.now()) / 86400000);
  if (runwayDays < DATA_RUNWAY_ALERT_DAYS) {
    problems.push(`Eclipse data ends ${ECLIPSE_DATA_THROUGH} (${runwayDays} days). Extend workers/event-computer/src/data/eclipses.js from NASA's catalog.`);
  }

  return {
    healthy: problems.length === 0,
    checked_at: new Date().toISOString(),
    last_sent_at: lastSent?.t ?? null,
    hours_since_last_send: Number.isFinite(hoursSinceSend) ? Math.round(hoursSinceSend) : null,
    events_due_in_window: dueInWindow?.n ?? 0,
    terminal_failures_24h: recentlyDead?.n ?? 0,
    eclipse_data_through: ECLIPSE_DATA_THROUGH,
    problems,
  };
}

// Brevo keeps its own block list: people who unsubscribed through Brevo's
// List-Unsubscribe header, marked us as spam, or hard-bounced. Brevo silently
// drops mail to them. If D1 still says "active", we'd keep "sending" into
// that void and the logs would look healthy. Mirror the list into D1 daily.
async function syncBrevoBlocks(env) {
  if (!env.BREVO_API_KEY) return { deactivated: 0, error: 'BREVO_API_KEY not set' };

  const day = ms => new Date(ms).toISOString().slice(0, 10);
  // A week of lookback, so a few missed daily runs don't lose anyone.
  const range = `startDate=${day(Date.now() - 7 * 86400000)}&endDate=${day(Date.now())}`;
  let deactivated = 0;

  try {
    for (let offset = 0; offset < 1000; offset += 100) {
      const res = await fetch(`https://api.brevo.com/v3/smtp/blockedContacts?${range}&limit=100&offset=${offset}`, {
        headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Brevo blockedContacts ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const { contacts = [] } = await res.json();

      for (const c of contacts) {
        if (!BREVO_STOP_REASONS.has(c.reason?.code)) continue;
        const result = await env.DB.prepare(
          'UPDATE subscribers SET active = 0 WHERE lower(email) = lower(?) AND active = 1'
        ).bind(c.email).run();
        if (result.meta?.changes) {
          deactivated++;
          console.log(`[health] Deactivated ${c.email}: blocked in Brevo (${c.reason.code})`);
        }
      }
      if (contacts.length < 100) break;
    }
    return { deactivated, error: null };
  } catch (err) {
    return { deactivated, error: err.message };
  }
}

async function runHealthCheck(env) {
  const sync = await syncBrevoBlocks(env);
  const report = await buildHealthReport(env);
  report.brevo_blocks_deactivated = sync.deactivated;
  if (sync.error) {
    report.healthy = false;
    report.problems.push(`Brevo block-list sync failed: ${sync.error}`);
  }

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
