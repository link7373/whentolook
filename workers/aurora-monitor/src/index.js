// index.js — Aurora Monitor
// Runs every 15 minutes. Fetches current Kp index from NOAA.
// If Kp meets the threshold for any subscriber's latitude, sends an immediate alert.
// Bypasses event_queue for real-time delivery. 12-hour suppression prevents spam.

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

async function fetchCurrentKp() {
  const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
  if (!res.ok) throw new Error(`NOAA fetch failed: ${res.status}`);
  const data = await res.json();
  // Array of [time_tag, Kp, ...], most recent last. Skip header row.
  const rows = data.filter(row => row[0] !== 'time_tag');
  const latest = rows[rows.length - 1];
  return parseFloat(latest[1]);
}

async function sendAuroraEmail(subscriber, kp, resendApiKey) {
  const storm = stormLabel(kp);
  const subject = `🌌 Aurora alert — Northern Lights may be visible RIGHT NOW`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
  <tr><td style="background:#0B0F1A;height:8px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;font-weight:600;">When To Look</p>
    <h1 style="margin:8px 0 6px;font-size:26px;font-weight:700;color:#1a1f2e;line-height:1.3;">Aurora Alert</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#D4A853;font-weight:500;">Kp ${kp} — ${storm} — go outside now</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Where to look:</strong> Face north. Get away from city lights if you can — even a short drive to a dark spot makes a big difference. Look for a faint green glow on the northern horizon.
    </p>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">What you might see:</strong> The aurora often starts as a pale green arc or glow. It can intensify into curtains, pillars, or rippling bands of green, purple, and red. It moves and changes in real time.
    </p>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Camera tip:</strong> Your phone camera sees aurora better than your eyes do. Try a 3–10 second exposure pointing north — you may be amazed at what shows up.
    </p>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Current conditions:</strong> Kp index is ${kp} (${storm}). Clear skies required — check your local weather before heading out.
    </p>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">
      <strong style="color:#1a1f2e;">Note:</strong> Aurora activity can fade quickly. This alert fires when Kp reaches your threshold — go out within the next hour for the best chance.
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 20px;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;line-height:1.8;">
      You're receiving this because you signed up at <a href="https://whentolook.com" style="color:#D4A853;text-decoration:none;">whentolook.com</a><br>
      <a href="https://whentolook.com/unsubscribe?token=${subscriber.unsubscribe_token}" style="color:#9CA3AF;">Unsubscribe</a> &nbsp;·&nbsp;
      <a href="https://whentolook.com/preferences?token=${subscriber.unsubscribe_token}" style="color:#9CA3AF;">Manage preferences</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'When To Look <hello@resend.dev>',
      to: subscriber.email,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.id;
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
    SELECT s.id, s.email, s.latitude, s.timezone, s.unsubscribe_token
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

    // Send directly
    try {
      const emailId = await sendAuroraEmail(sub, currentKp, env.RESEND_API_KEY);

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
