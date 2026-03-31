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
      from: 'When To Look <hello@resend.dev>', // TODO: switch to hello@whentolook.com once AWS SES is set up
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
    iss: renderIss,
    fullmoon: renderFullMoon,
    lunar_eclipse: renderLunarEclipse,
    solar_eclipse: renderSolarEclipse,
    asteroid: renderAsteroid,
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

function renderIss(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const elevLabel = data.max_elevation >= 60 ? 'very bright, high arc'
    : data.max_elevation >= 45 ? 'bright pass'
    : 'good pass';

  return {
    subject: `🛰️ Space Station visible in 30 minutes — look ${data.start_az_compass}`,
    html: issHtml(data, durationMins, elevLabel),
  };
}

function issHtml(data, durationMins, elevLabel) {
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
  <h1>International Space Station</h1>
  <div class="meta">Visible overhead in 30 minutes — ${elevLabel}</div>

  <div class="section">
    <strong>Where to look:</strong> Face <strong>${data.start_az_compass}</strong> and watch for a bright, steady light moving smoothly toward the ${data.end_az_compass}. No blinking — that's how you know it's not a plane.
  </div>

  <div class="section">
    <strong>How long:</strong> Visible for about ${durationMins} minute${durationMins !== 1 ? 's' : ''}, climbing to ${data.max_elevation}° above the horizon at its peak.
  </div>

  <div class="section">
    <strong>What you're seeing:</strong> A structure the size of a football field, orbiting 250 miles above your head at 17,500 mph. There are astronauts living and working up there right now.
  </div>

  <div class="section">
    <strong>Tip:</strong> It moves fast — once you spot it, it crosses the sky in just a few minutes. Watch for it to fade as it enters Earth's shadow.
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

function renderFullMoon(data) {
  const supermoonNote = data.supermoon
    ? ' — and it\'s a Supermoon, appearing about 14% larger and 30% brighter than average'
    : '';
  return {
    subject: `🌕 Full ${data.name} rises tonight${data.supermoon ? ' — Supermoon' : ''}`,
    html: fullMoonHtml(data, supermoonNote),
  };
}

function fullMoonHtml(data, supermoonNote) {
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
  <h1>Full ${data.name}</h1>
  <div class="meta">Rising tonight${supermoonNote}</div>

  <div class="section">
    <strong>What to watch for:</strong> Look for it right at moonrise, when it's near the horizon — that's when the "Moon illusion" makes it look enormous. It'll seem to shrink as it climbs higher, even though its actual size hasn't changed.
  </div>

  ${data.supermoon ? `<div class="section"><strong>Why it's a Supermoon:</strong> The Moon's orbit is slightly elliptical. Tonight it's near its closest point to Earth (perigee), making it appear about 14% larger and 30% brighter than a typical full moon.</div>` : ''}

  <div class="section">
    <strong>The name:</strong> ${data.name_origin}.
  </div>

  <div class="section">
    <strong>No gear needed</strong> — just step outside. The full moon is bright enough to cast shadows.
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

function renderLunarEclipse(data) {
  const isReminder = data.is_reminder;
  const typeLabel = data.type === 'total' ? 'Total Lunar Eclipse'
    : data.type === 'partial' ? 'Partial Lunar Eclipse'
    : 'Penumbral Lunar Eclipse';
  return {
    subject: isReminder
      ? `🌑 Reminder: ${typeLabel} tomorrow night`
      : `🌑 ${typeLabel} tonight — here's when to look`,
    html: lunarEclipseHtml(data, typeLabel, isReminder),
  };
}

function lunarEclipseHtml(data, typeLabel, isReminder) {
  const whatYoullSee = data.type === 'total'
    ? 'The Moon will turn a deep copper or blood red as Earth\'s shadow covers it completely. It\'s one of the most striking things you can see with the naked eye.'
    : data.type === 'partial'
    ? 'You\'ll see Earth\'s curved shadow slowly creeping across the Moon\'s surface — a visible reminder that Earth is a sphere.'
    : 'A subtle darkening on one side of the Moon. This one\'s understated — look carefully.';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0;padding:0;background:#0B0F1A;font-family:'DM Sans',Arial,sans-serif;color:#E8E6E1; }
  .container{max-width:600px;margin:0 auto;padding:40px 24px;}
  .header{font-size:13px;color:#6B7280;letter-spacing:.1em;text-transform:uppercase;margin-bottom:32px;}
  h1{font-family:Georgia,serif;font-size:28px;font-weight:normal;color:#E8E6E1;margin:0 0 8px;line-height:1.3;}
  .meta{color:#D4A853;font-size:14px;margin-bottom:32px;}
  .section{margin-bottom:24px;line-height:1.7;font-size:15px;color:#C9C7C2;}
  .section strong{color:#E8E6E1;}
  .divider{border:none;border-top:1px solid #1E2535;margin:28px 0;}
  .footer{font-size:12px;color:#4B5563;line-height:1.6;}
  .footer a{color:#6B7280;}
</style></head>
<body><div class="container">
  <div class="header">When To Look</div>
  <h1>${typeLabel}</h1>
  <div class="meta">${isReminder ? 'Tomorrow night — plan ahead' : 'Visible tonight from your area'}</div>
  <div class="section"><strong>What you'll see:</strong> ${whatYoullSee}</div>
  ${data.partial_start ? `<div class="section"><strong>Timeline (UTC):</strong><br>
    ${data.partial_start ? `Partial eclipse begins: ${new Date(data.partial_start).toUTCString().slice(17,22)} UTC<br>` : ''}
    ${data.total_start ? `Totality begins: ${new Date(data.total_start).toUTCString().slice(17,22)} UTC<br>` : ''}
    Maximum: ${new Date(data.maximum).toUTCString().slice(17,22)} UTC<br>
    ${data.total_end ? `Totality ends: ${new Date(data.total_end).toUTCString().slice(17,22)} UTC<br>` : ''}
    ${data.partial_end ? `Partial eclipse ends: ${new Date(data.partial_end).toUTCString().slice(17,22)} UTC` : ''}
  </div>` : ''}
  <div class="section"><strong>Safe to watch:</strong> Unlike a solar eclipse, a lunar eclipse is completely safe to observe with your naked eyes. No equipment needed.</div>
  <hr class="divider">
  <div class="footer">
    You're receiving this from <a href="https://whentolook.com">whentolook.com</a><br>
    <a href="https://whentolook.com/unsubscribe?token=${data.unsubscribe_token}">Unsubscribe</a> · <a href="https://whentolook.com/preferences?token=${data.unsubscribe_token}">Manage preferences</a>
  </div>
</div></body></html>`;
}

function renderSolarEclipse(data) {
  return {
    subject: `🌗 Solar eclipse today — what you'll see from your area`,
    html: solarEclipseHtml(data),
  };
}

function solarEclipseHtml(data) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{margin:0;padding:0;background:#0B0F1A;font-family:'DM Sans',Arial,sans-serif;color:#E8E6E1;}
  .container{max-width:600px;margin:0 auto;padding:40px 24px;}
  .header{font-size:13px;color:#6B7280;letter-spacing:.1em;text-transform:uppercase;margin-bottom:32px;}
  h1{font-family:Georgia,serif;font-size:28px;font-weight:normal;margin:0 0 8px;line-height:1.3;}
  .meta{color:#D4A853;font-size:14px;margin-bottom:32px;}
  .warning{background:#1a0a0a;border-left:3px solid #ef4444;padding:16px 20px;margin-bottom:24px;border-radius:4px;font-size:15px;line-height:1.6;}
  .section{margin-bottom:24px;line-height:1.7;font-size:15px;color:#C9C7C2;}
  .section strong{color:#E8E6E1;}
  .divider{border:none;border-top:1px solid #1E2535;margin:28px 0;}
  .footer{font-size:12px;color:#4B5563;line-height:1.6;}
  .footer a{color:#6B7280;}
</style></head>
<body><div class="container">
  <div class="header">When To Look</div>
  <h1>Solar Eclipse Today</h1>
  <div class="meta">${data.type.charAt(0).toUpperCase() + data.type.slice(1)} eclipse — ${data.path_description}</div>
  <div class="warning">⚠️ <strong>NEVER look directly at the Sun</strong> without certified eclipse glasses (ISO 12312-2). Regular sunglasses are NOT safe.</div>
  <div class="section"><strong>What's happening:</strong> The Moon is passing between Earth and the Sun. The path of totality crosses ${data.path_description}.</div>
  <div class="section"><strong>What to watch for:</strong> As totality approaches — temperature drops, animals go quiet, stars appear in the daytime sky. During totality (if you're in the path): the corona, Baily's beads, and the diamond ring effect.</div>
  <div class="section"><strong>Eclipse glasses:</strong> Find ISO 12312-2 certified glasses at your local science museum, library, or search "AAS approved eclipse glasses" online.</div>
  <hr class="divider">
  <div class="footer">
    You're receiving this from <a href="https://whentolook.com">whentolook.com</a><br>
    <a href="https://whentolook.com/unsubscribe?token=${data.unsubscribe_token}">Unsubscribe</a> · <a href="https://whentolook.com/preferences?token=${data.unsubscribe_token}">Manage preferences</a>
  </div>
</div></body></html>`;
}

function renderAsteroid(data) {
  const distRounded = Math.round(data.dist_ld * 10) / 10;
  const sizeDesc = data.diameter_m >= 500 ? 'the size of a skyscraper'
    : data.diameter_m >= 200 ? 'the size of a city block'
    : 'the size of a large building';
  return {
    subject: `☄️ Asteroid ${data.name} is making a close pass by Earth today`,
    html: asteroidHtml(data, distRounded, sizeDesc),
  };
}

function asteroidHtml(data, distRounded, sizeDesc) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{margin:0;padding:0;background:#0B0F1A;font-family:'DM Sans',Arial,sans-serif;color:#E8E6E1;}
  .container{max-width:600px;margin:0 auto;padding:40px 24px;}
  .header{font-size:13px;color:#6B7280;letter-spacing:.1em;text-transform:uppercase;margin-bottom:32px;}
  h1{font-family:Georgia,serif;font-size:28px;font-weight:normal;margin:0 0 8px;line-height:1.3;}
  .meta{color:#D4A853;font-size:14px;margin-bottom:32px;}
  .section{margin-bottom:24px;line-height:1.7;font-size:15px;color:#C9C7C2;}
  .section strong{color:#E8E6E1;}
  .divider{border:none;border-top:1px solid #1E2535;margin:28px 0;}
  .footer{font-size:12px;color:#4B5563;line-height:1.6;}
  .footer a{color:#6B7280;}
</style></head>
<body><div class="container">
  <div class="header">When To Look</div>
  <h1>Asteroid ${data.name}</h1>
  <div class="meta">Close approach today — ${distRounded} lunar distances away</div>
  <div class="section"><strong>Size:</strong> Approximately ${sizeDesc}${data.diameter_m ? ` (estimated ${Math.round(data.diameter_m)}m diameter)` : ''}.</div>
  <div class="section"><strong>Distance:</strong> ${distRounded} times the distance from Earth to the Moon — a close pass in astronomical terms, but still hundreds of thousands of kilometres away.</div>
  <div class="section"><strong>Speed:</strong> Traveling at roughly ${data.v_rel ? Math.round(parseFloat(data.v_rel)) : '~20'} km/s — about 50 times faster than a bullet.</div>
  <div class="section"><strong>Not a threat:</strong> NASA tracks thousands of near-Earth objects. This one passes safely. The purpose of this notification is simply — how often do you get to know there's a space rock flying by right now?</div>
  <hr class="divider">
  <div class="footer">
    You're receiving this from <a href="https://whentolook.com">whentolook.com</a><br>
    <a href="https://whentolook.com/unsubscribe?token=${data.unsubscribe_token}">Unsubscribe</a> · <a href="https://whentolook.com/preferences?token=${data.unsubscribe_token}">Manage preferences</a>
  </div>
</div></body></html>`;
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
