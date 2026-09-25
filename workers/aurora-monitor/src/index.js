// index.js — Aurora Monitor
// Runs every 15 minutes. Fetches current Kp index from NOAA.
// If Kp meets the threshold for any subscriber's latitude, sends an immediate alert.
// Bypasses event_queue for real-time delivery. 12-hour suppression prevents spam.

import { sendEmail } from './mailer.js';
import { getCloudCover } from './weather.js';

// Minimum Kp required to see aurora at a given latitude (absolute value)
function minKpForLatitude(lat) {
  const absLat = Math.abs(lat);
  if (absLat >= 67) return 2;
  if (absLat >= 60) return 3;
  if (absLat >= 55) return 4;
  if (absLat >= 50) return 5;
  if (absLat >= 45) return 6;
  if (absLat >= 40) return 7;
  return 8; // below 40° — only extreme storms
}

function stormLabel(kp) {
  if (kp >= 9) return 'G5 Extreme storm';
  if (kp >= 8) return 'G4 Severe storm';
  if (kp >= 7) return 'G3 Strong storm';
  if (kp >= 6) return 'G2 Moderate storm';
  return 'G1 Minor storm';
}

// Returns the Sun's altitude in degrees above the horizon for a given location and time.
// Accurate to ~1° — sufficient for nighttime detection.
function solarAltitudeDeg(latDeg, lonDeg, date) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  const JD = date.getTime() / 86400000 + 2440587.5;
  const D = JD - 2451545.0;

  let L = (280.46 + 0.9856474 * D) % 360;
  if (L < 0) L += 360;
  let g = (357.528 + 0.9856003 * D) % 360;
  if (g < 0) g += 360;

  const lambda = L + 1.915 * Math.sin(toRad(g)) + 0.020 * Math.sin(toRad(2 * g));
  const eps = 23.439 - 0.0000004 * D;

  const dec = Math.asin(Math.sin(toRad(eps)) * Math.sin(toRad(lambda)));

  let RA = toDeg(Math.atan2(
    Math.cos(toRad(eps)) * Math.sin(toRad(lambda)),
    Math.cos(toRad(lambda))
  ));
  if (RA < 0) RA += 360;

  const GMST = (280.46061837 + 360.98564736629 * D) % 360;
  const LST = (GMST + lonDeg + 360) % 360;
  const HA = (LST - RA + 360) % 360;

  const sinAlt = Math.sin(toRad(latDeg)) * Math.sin(dec) +
    Math.cos(toRad(latDeg)) * Math.cos(dec) * Math.cos(toRad(HA));

  return toDeg(Math.asin(sinAlt));
}

async function fetchCurrentKp() {
  const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
  if (!res.ok) throw new Error(`NOAA fetch failed: ${res.status}`);
  const data = await res.json();
  // Array of [time_tag, Kp, ...], most recent last. Skip header row.
  const rows = data.filter(row => row[0] !== 'time_tag');
  const latest = rows[rows.length - 1];
  return parseFloat(latest[1]);
}

async function sendAuroraEmail(subscriber, kp, { apiKey }) {
  const storm = stormLabel(kp);
  const subject = `🌌 Aurora alert — Northern Lights may be visible RIGHT NOW`;

  const statsBlock = `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;border-radius:8px;margin:0 0 28px;overflow:hidden;">
    <tr>
      <td width="50%" style="padding:20px 24px;border-right:1px solid rgba(255,255,255,0.12);vertical-align:top;">
        <p style="margin:0 0 5px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;">When</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#D4A853;line-height:1.25;">Right now</p>
      </td>
      <td width="50%" style="padding:20px 24px;vertical-align:top;">
        <p style="margin:0 0 5px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;">Look</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#D4A853;line-height:1.25;">North, near horizon</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px;border-right:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.12);vertical-align:top;">
        <p style="margin:0 0 5px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;">Kp index</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#D4A853;line-height:1.25;">Kp ${kp} — ${storm}</p>
      </td>
      <td style="padding:20px 24px;border-top:1px solid rgba(255,255,255,0.12);vertical-align:top;">
        <p style="margin:0 0 5px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;">Key tip</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#D4A853;line-height:1.25;">Get dark skies</p>
      </td>
    </tr>
  </table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
  <tr><td style="background:#0B0F1A;height:8px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:36px 40px 32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;font-weight:600;">When To Look</p>
    <h1 style="margin:8px 0 6px;font-size:26px;font-weight:700;color:#1a1f2e;line-height:1.3;">Aurora Alert</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#6B7280;">Northern Lights may be visible from your area now</p>
    ${statsBlock}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">

    <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Where to look:</strong> Face north and get away from city lights — even a short drive to a dark spot makes a big difference. Look for a faint green glow on the northern horizon.
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">What you might see:</strong> The aurora often starts as a pale green arc. It can intensify into curtains, pillars, and rippling bands of green, purple, and red — moving in real time.
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Camera tip:</strong> Your phone sees aurora better than your eyes. Try a 3–10 second exposure pointing north.
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Conditions:</strong> Clear skies required. Aurora activity can fade quickly — head out within the next hour for the best chance.
    </p>
    ${shareBlock()}

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 20px;">
    <p style="margin:0 0 12px;font-size:12px;color:#6B7280;text-align:center;line-height:1.6;">
      Forwarded this? <a href="https://whentolook.com/?ref=forwarded" style="color:#D4A853;text-decoration:none;font-weight:600;">Get your own alerts, free &rarr;</a>
    </p>
    <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;line-height:1.8;">
      You're receiving this because you signed up at <a href="https://whentolook.com" style="color:#D4A853;text-decoration:none;">whentolook.com</a><br>
      <a href="https://whentolook.com/unsubscribe?token=${subscriber.unsubscribe_token}" style="color:#9CA3AF;text-decoration:none;">Unsubscribe</a> &nbsp;·&nbsp;
      <a href="https://whentolook.com/preferences?token=${subscriber.unsubscribe_token}" style="color:#9CA3AF;text-decoration:none;">Manage preferences</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  return sendEmail({
    to: subscriber.email,
    from: 'When To Look <hello@whentolook.com>',
    subject,
    html,
    apiKey,
    unsubscribeUrl: `https://api.whentolook.com/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribe_token)}`,
  });
}

// Same share block as the dispatcher's notify.js (Workers are bundled
// separately, so it's duplicated like mailer.js). The aurora alert is the
// most "text a friend right now" email we send.
function shareBlock() {
  const url = 'https://whentolook.com/?ref=share-aurora';
  const text = 'Northern Lights alert: aurora may be visible right now. Look north, away from city lights.';
  const sms = `sms:?&amp;body=${encodeURIComponent(`${text} ${url}`)}`;
  const mail = `mailto:?subject=${encodeURIComponent('Look up tonight')}&amp;body=${encodeURIComponent(`${text}\n\nI get these alerts free from When To Look: ${url}`)}`;
  const link = 'color:#D4A853;font-weight:700;text-decoration:none;';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;border-radius:8px;margin:28px 0 0;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 10px;font-size:15px;color:#E8E6E1;line-height:1.5;">Share this with someone who should look up tonight &rarr;</p>
        <p style="margin:0;font-size:14px;">
          <a href="${sms}" style="${link}">Text a friend</a>
          <span style="color:#6B7280;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
          <a href="${mail}" style="${link}">Email a friend</a>
        </p>
      </td></tr>
    </table>`;
}

async function checkAurora(env, kpOverride = null) {
  let currentKp;
  try {
    currentKp = kpOverride !== null ? kpOverride : await fetchCurrentKp();
  } catch (err) {
    console.error('[aurora] Failed to fetch Kp:', err.message);
    return;
  }

  console.log(`[aurora] Current Kp: ${currentKp}`);

  // No aurora visible below Kp 2 anywhere
  if (currentKp < 2) {
    console.log('[aurora] Kp too low, skipping');
    return;
  }

  // Fetch all aurora-subscribed, active, confirmed subscribers
  const { results: subscribers } = await env.DB.prepare(`
    SELECT s.id, s.email, s.latitude, s.longitude, s.timezone, s.unsubscribe_token, s.suppress_if_cloudy
    FROM subscribers s
    JOIN preferences p ON p.subscriber_id = s.id AND p.event_type = 'aurora' AND p.enabled = 1
    WHERE s.active = 1 AND s.confirmed = 1
  `).all();

  console.log(`[aurora] Checking ${subscribers.length} aurora subscribers`);

  // 12-hour suppression window
  const suppressAfter = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  for (const sub of subscribers) {
    const minKp = minKpForLatitude(sub.latitude);
    if (currentKp < minKp) continue;

    // Check 12-hour suppression
    const recentAlert = await env.DB.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'aurora' AND sent_at > ?
    `).bind(sub.id, suppressAfter).first();

    if (recentAlert) {
      console.log(`[aurora] Suppressed for ${sub.email} (recent alert within 12h)`);
      continue;
    }

    // Daytime check: aurora isn't visible if the sun is above civil twilight (-6°)
    const sunAlt = solarAltitudeDeg(sub.latitude, sub.longitude, new Date());
    if (sunAlt > -6) {
      console.log(`[aurora] Skipped for ${sub.email} — daytime (sun altitude ${sunAlt.toFixed(1)}°)`);
      continue;
    }

    // Weather suppression: skip if subscriber opted in and it's cloudy right now
    if (sub.suppress_if_cloudy) {
      let cover = null;
      try {
        cover = await getCloudCover(sub.latitude, sub.longitude, new Date().toISOString());
      } catch (err) {
        console.warn(`[aurora] Weather check failed for ${sub.email}, proceeding:`, err.message);
      }
      if (cover !== null && cover >= 80) {
        console.log(`[aurora] Skipped for ${sub.email} — cloud cover ${cover}%`);
        continue;
      }
    }

    // Send directly
    try {
      const emailId = await sendAuroraEmail(sub, currentKp, { apiKey: env.BREVO_API_KEY });

      await env.DB.prepare(`
        INSERT INTO notification_log (id, subscriber_id, event_type, event_id, sent_at, email_id)
        VALUES (?, ?, 'aurora', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        sub.id,
        `aurora-kp${Math.floor(currentKp)}-${new Date().toISOString().slice(0, 10)}`,
        new Date().toISOString(),
        emailId
      ).run();

      console.log(`[aurora] Alert sent to ${sub.email} (Kp ${currentKp})`);
    } catch (err) {
      console.error(`[aurora] Failed for ${sub.email}:`, err.message);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAurora(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/trigger') {
      // Optional kp override for testing: /trigger?kp=7
      const kpOverride = url.searchParams.has('kp')
        ? parseFloat(url.searchParams.get('kp'))
        : null;
      ctx.waitUntil(checkAurora(env, kpOverride));
      return new Response(`Aurora check triggered (Kp: ${kpOverride ?? 'live'})`, { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};
