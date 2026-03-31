// subscribe.js
export async function handleSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { email, latitude, longitude, location_name, timezone, preferences } = body;

  if (!email || latitude == null || longitude == null || !timezone) {
    return json({ error: 'Missing required fields: email, latitude, longitude, timezone' }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  const confirmToken = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();
  const now = new Date().toISOString();

  // Upsert subscriber — re-issues confirmation if they sign up again
  try {
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, latitude, longitude, location_name, timezone, created_at, confirm_token, unsubscribe_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        location_name = excluded.location_name,
        timezone = excluded.timezone,
        confirm_token = excluded.confirm_token,
        active = 1
    `).bind(
      crypto.randomUUID(), email, latitude, longitude,
      location_name || null, timezone, now, confirmToken, unsubscribeToken
    ).run();
  } catch (err) {
    console.error('DB error on subscribe:', err);
    return json({ error: 'Database error' }, 500);
  }

  // Fetch the actual subscriber row (id may differ if email already existed)
  const sub = await env.DB.prepare(
    'SELECT id, confirm_token, unsubscribe_token FROM subscribers WHERE email = ?'
  ).bind(email).first();

  // Upsert preferences
  const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'];
  const enabled = Array.isArray(preferences) ? preferences : allTypes;

  for (const type of allTypes) {
    await env.DB.prepare(`
      INSERT INTO preferences (subscriber_id, event_type, enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(subscriber_id, event_type) DO UPDATE SET enabled = excluded.enabled
    `).bind(sub.id, type, enabled.includes(type) ? 1 : 0).run();
  }

  // Send confirmation email
  await sendConfirmationEmail(email, sub.confirm_token, env);

  return json({ success: true, message: 'Check your email to confirm your subscription.' });
}

async function sendConfirmationEmail(email, token, env) {
  const confirmUrl = `https://whentolook.com/confirm?token=${token}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Confirm your subscription — When To Look</title>
<style>
  @media only screen and (max-width:620px) {
    .outer-table { padding: 16px 8px !important; }
    .inner-table { border-radius: 0 !important; }
    .content-cell { padding: 28px 24px 32px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table class="outer-table" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
  <tr>
    <td align="center">
      <table class="inner-table" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        <!-- Brand stripe -->
        <tr>
          <td style="background:#0B0F1A;height:8px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <!-- Content -->
        <tr>
          <td class="content-cell" style="padding:36px 40px 40px;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;font-weight:600;">When To Look</p>
            <h1 style="margin:8px 0 16px;font-size:26px;font-weight:700;color:#1a1f2e;line-height:1.3;">Confirm your subscription</h1>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#4B5563;">
              You're one click away from getting notified before meteor showers, ISS passes, eclipses, auroras, and more — personalized to your exact location.
            </p>
            <p style="margin:0 0 32px;">
              <a href="${confirmUrl}" style="background:#D4A853;color:#0B0F1A;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block;font-size:15px;">Confirm my email &rarr;</a>
            </p>
            <p style="margin:0 0 32px;font-size:14px;line-height:1.6;color:#9CA3AF;">
              If you didn't sign up, you can safely ignore this email.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;line-height:1.8;">
              <a href="https://whentolook.com" style="color:#D4A853;text-decoration:none;">whentolook.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'When To Look <hello@whentolook.com>',
      to: email,
      subject: '✅ Confirm your When To Look subscription',
      html,
    }),
  });

  if (!res.ok) {
    console.error('Failed to send confirmation email:', await res.text());
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
