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
<html>
<head><meta charset="utf-8"><style>
  body { margin: 0; padding: 0; background: #0B0F1A; font-family: Arial, sans-serif; color: #E8E6E1; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
  .header { font-size: 13px; color: #6B7280; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 32px; }
  h1 { font-family: Georgia, serif; font-size: 24px; font-weight: normal; margin: 0 0 16px; }
  p { color: #C9C7C2; line-height: 1.7; font-size: 15px; }
  .btn { display: inline-block; background: #D4A853; color: #0B0F1A; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 24px 0; font-size: 15px; }
  .footer { margin-top: 40px; font-size: 12px; color: #4B5563; }
</style></head>
<body><div class="container">
  <div class="header">When To Look</div>
  <h1>Confirm your subscription</h1>
  <p>You're one click away from getting notified before meteor showers, ISS passes, eclipses, auroras, and more — personalized to your exact location.</p>
  <a href="${confirmUrl}" class="btn">Confirm my email →</a>
  <p>If you didn't sign up, you can safely ignore this email.</p>
  <div class="footer">whentolook.com</div>
</div></body>
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
