// notify.js
// Channel-agnostic notification dispatch.
// Currently routes to email only. Adding SMS later means adding a branch here.

export async function notify(subscriber, event, resendApiKey) {
  const { html, subject } = renderTemplate(event);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'When To Look <hello@whentolook.com>',
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
  return data.id; // Resend message ID
}

function renderTemplate(event) {
  const templates = {
    meteor: renderMeteor,
  };

  const renderer = templates[event.event_type];
  if (!renderer) throw new Error(`No template for event type: ${event.event_type}`);

  return renderer(JSON.parse(event.event_data));
}

function renderMeteor(data) {
  return {
    subject: `🌠 ${data.name} meteor shower peaks tonight`,
    html: meteorHtml(data),
  };
}

function meteorHtml(data) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; padding: 0; background: #0B0F1A; font-family: 'DM Sans', Arial, sans-serif; color: #E8E6E1; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
  .header { font-size: 13px; color: #6B7280; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 32px; }
  h1 { font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #E8E6E1; margin: 0 0 8px; line-height: 1.3; }
  .meta { color: #D4A853; font-size: 14px; margin-bottom: 32px; }
  .section { margin-bottom: 24px; line-height: 1.7; font-size: 15px; color: #C9C7C2; }
  .section strong { color: #E8E6E1; }
  .divider { border: none; border-top: 1px solid #1E2535; margin: 28px 0; }
  .footer { font-size: 12px; color: #4B5563; line-height: 1.6; }
  .footer a { color: #6B7280; }
</style>
</head>
<body>
<div class="container">
  <div class="header">When To Look</div>
  <h1>${data.name} Meteor Shower</h1>
  <div class="meta">Peaks tonight — up to ${data.zhr} meteors per hour</div>

  <div class="section">
    <strong>Where to look:</strong> Lie flat and look straight up. Meteors will appear all across the sky, radiating from ${data.radiant_constellation}. You don't need to stare at that spot — the longest streaks appear 30–45° away from it.
  </div>

  <div class="section">
    <strong>What to expect:</strong> Up to ${data.zhr} meteors per hour under ideal dark-sky conditions. From a suburban location, expect around ${Math.round(data.zhr / 3)}–${Math.round(data.zhr / 2)} per hour.
  </div>

  <div class="section">
    <strong>Best viewing time:</strong> Peak activity is usually between midnight and dawn. Give your eyes 20 minutes to adjust to the dark.
  </div>

  <div class="section">
    <strong>What you're seeing:</strong> Each streak is a ${data.particle_size || 'grain-of-sand'}-sized particle from ${data.parent_object} hitting Earth's atmosphere at ${data.velocity_kms} km/s and burning up 60–100 km above your head.
  </div>

  <div class="section">
    <strong>Gear:</strong> None needed. Just your eyes, a blanket, and patience.
  </div>

  <hr class="divider">
  <div class="footer">
    You're receiving this because you signed up at <a href="https://whentolook.com">whentolook.com</a><br>
    <a href="https://whentolook.com/unsubscribe?token=${data.unsubscribe_token}">Unsubscribe</a> · <a href="https://whentolook.com/preferences?token=${data.unsubscribe_token}">Manage preferences</a>
  </div>
</div>
</body>
</html>`;
}
