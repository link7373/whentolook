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
    starlink: renderStarlink,
  };

  const renderer = templates[event.event_type];
  if (!renderer) throw new Error(`No template for event type: ${event.event_type}`);

  return renderer(JSON.parse(event.event_data));
}

// ---------------------------------------------------------------------------
// Shared layout helper
// Wraps content in the light-theme table structure. All color values are
// inlined so Gmail and Outlook render them correctly regardless of whether
// they strip the <style> block.
// ---------------------------------------------------------------------------

function emailWrapper({ title, subtitle, bodyHtml, unsubscribeToken }) {
  const footer = `
    <tr>
      <td style="padding:0 40px 36px;">
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
        <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;line-height:1.8;">
          You're receiving this because you signed up at
          <a href="https://whentolook.com" style="color:#D4A853;text-decoration:none;">whentolook.com</a><br>
          <a href="https://whentolook.com/unsubscribe?token=${unsubscribeToken}" style="color:#9CA3AF;text-decoration:none;">Unsubscribe</a>
          &nbsp;&middot;&nbsp;
          <a href="https://whentolook.com/preferences?token=${unsubscribeToken}" style="color:#9CA3AF;text-decoration:none;">Manage preferences</a>
        </p>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>When To Look</title>
<style>
  @media only screen and (max-width:620px) {
    .outer-table { padding: 16px 8px !important; }
    .inner-table { border-radius: 0 !important; }
    .content-cell { padding: 28px 24px !important; }
    .footer-cell { padding: 0 24px 28px !important; }
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
        <!-- Header / title -->
        <tr>
          <td class="content-cell" style="padding:36px 40px 28px;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;font-weight:600;">When To Look</p>
            <h1 style="margin:8px 0 6px;font-size:26px;font-weight:700;color:#1a1f2e;line-height:1.3;">${title}</h1>
            <p style="margin:0 0 28px;font-size:14px;color:#D4A853;font-weight:500;">${subtitle}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        ${footer}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Renders a single content section with a bold label.
function section(label, content) {
  return `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4B5563;">
    <strong style="color:#1a1f2e;">${label}:</strong> ${content}
  </p>`;
}

// ---------------------------------------------------------------------------
// Template renderers
// ---------------------------------------------------------------------------

function renderMeteor(data) {
  const suburbanLow  = Math.round(data.zhr / 3);
  const suburbanHigh = Math.round(data.zhr / 2);

  const bodyHtml = [
    section('Where to look', `Lie flat and look straight up. Meteors will appear all across the sky, radiating from ${data.radiant_constellation}. You don't need to stare at that spot — the longest streaks appear 30–45° away from it.`),
    section('What to expect', `Up to ${data.zhr} meteors per hour under ideal dark-sky conditions. From a suburban location, expect around ${suburbanLow}–${suburbanHigh} per hour.`),
    section('Best viewing time', 'Peak activity is usually between midnight and dawn. Give your eyes 20 minutes to adjust to the dark.'),
    section('What you\'re seeing', `Each streak is a ${data.particle_size || 'grain-of-sand'}-sized particle from ${data.parent_object} hitting Earth's atmosphere at ${data.velocity_kms} km/s and burning up 60–100 km above your head.`),
    section('Gear', 'None needed. Just your eyes, a blanket, and patience.'),
  ].join('\n');

  return {
    subject: `🌠 ${data.name} meteor shower peaks tonight`,
    html: emailWrapper({
      title: `${data.name} Meteor Shower`,
      subtitle: `Peaks tonight — up to ${data.zhr} meteors per hour`,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderIss(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const elevLabel = data.max_elevation >= 60 ? 'very bright, high arc'
    : data.max_elevation >= 45 ? 'bright pass'
    : 'good pass';

  const bodyHtml = [
    section('Where to look', `Face <strong style="color:#1a1f2e;">${data.start_az_compass}</strong> and watch for a bright, steady light moving smoothly toward the ${data.end_az_compass}. No blinking — that's how you know it's not a plane.`),
    section('How long', `Visible for about ${durationMins} minute${durationMins !== 1 ? 's' : ''}, climbing to ${data.max_elevation}° above the horizon at its peak.`),
    section('What you\'re seeing', 'A structure the size of a football field, orbiting 250 miles above your head at 17,500 mph. There are astronauts living and working up there right now.'),
    section('Tip', 'It moves fast — once you spot it, it crosses the sky in just a few minutes. Watch for it to fade as it enters Earth\'s shadow.'),
  ].join('\n');

  return {
    subject: `🛰️ Space Station visible in 30 minutes — look ${data.start_az_compass}`,
    html: emailWrapper({
      title: 'International Space Station',
      subtitle: `Visible overhead in 30 minutes — ${elevLabel}`,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderFullMoon(data) {
  const supermoonNote = data.supermoon
    ? ' — and it\'s a Supermoon, appearing about 14% larger and 30% brighter than average'
    : '';

  const supermoonSection = data.supermoon
    ? section('Why it\'s a Supermoon', 'The Moon\'s orbit is slightly elliptical. Tonight it\'s near its closest point to Earth (perigee), making it appear about 14% larger and 30% brighter than a typical full moon.')
    : '';

  const bodyHtml = [
    section('What to watch for', 'Look for it right at moonrise, when it\'s near the horizon — that\'s when the "Moon illusion" makes it look enormous. It\'ll seem to shrink as it climbs higher, even though its actual size hasn\'t changed.'),
    supermoonSection,
    section('The name', `${data.name_origin}.`),
    section('No gear needed', 'Just step outside. The full moon is bright enough to cast shadows.'),
  ].join('\n');

  return {
    subject: `🌕 Full ${data.name} rises tonight${data.supermoon ? ' — Supermoon' : ''}`,
    html: emailWrapper({
      title: `Full ${data.name}`,
      subtitle: `Rising tonight${supermoonNote}`,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderLunarEclipse(data) {
  const isReminder = data.is_reminder;
  const typeLabel = data.type === 'total' ? 'Total Lunar Eclipse'
    : data.type === 'partial' ? 'Partial Lunar Eclipse'
    : 'Penumbral Lunar Eclipse';

  const whatYoullSee = data.type === 'total'
    ? 'The Moon will turn a deep copper or blood red as Earth\'s shadow covers it completely. It\'s one of the most striking things you can see with the naked eye.'
    : data.type === 'partial'
    ? 'You\'ll see Earth\'s curved shadow slowly creeping across the Moon\'s surface — a visible reminder that Earth is a sphere.'
    : 'A subtle darkening on one side of the Moon. This one\'s understated — look carefully.';

  const timelineRows = data.partial_start ? `
    ${data.partial_start ? `Partial eclipse begins: ${new Date(data.partial_start).toUTCString().slice(17, 22)} UTC<br>` : ''}
    ${data.total_start   ? `Totality begins: ${new Date(data.total_start).toUTCString().slice(17, 22)} UTC<br>` : ''}
    Maximum: ${new Date(data.maximum).toUTCString().slice(17, 22)} UTC<br>
    ${data.total_end   ? `Totality ends: ${new Date(data.total_end).toUTCString().slice(17, 22)} UTC<br>` : ''}
    ${data.partial_end ? `Partial eclipse ends: ${new Date(data.partial_end).toUTCString().slice(17, 22)} UTC` : ''}
  ` : '';

  const timelineSection = data.partial_start
    ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.9;color:#4B5563;"><strong style="color:#1a1f2e;">Timeline (UTC):</strong><br>${timelineRows}</p>`
    : '';

  const bodyHtml = [
    section('What you\'ll see', whatYoullSee),
    timelineSection,
    section('Safe to watch', 'Unlike a solar eclipse, a lunar eclipse is completely safe to observe with your naked eyes. No equipment needed.'),
  ].join('\n');

  return {
    subject: isReminder
      ? `🌑 Reminder: ${typeLabel} tomorrow night`
      : `🌑 ${typeLabel} tonight — here's when to look`,
    html: emailWrapper({
      title: typeLabel,
      subtitle: isReminder ? 'Tomorrow night — plan ahead' : 'Visible tonight from your area',
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderSolarEclipse(data) {
  // Safety warning gets a distinct red-tinted box, per design spec.
  const safetyBox = `<div style="background:#FEF2F2;border-left:3px solid #EF4444;padding:14px 18px;border-radius:4px;margin-bottom:20px;font-size:15px;line-height:1.6;color:#1a1f2e;">
    ⚠️ <strong>NEVER look directly at the Sun</strong> without certified eclipse glasses (ISO 12312-2). Regular sunglasses are <strong>NOT</strong> safe.
  </div>`;

  const bodyHtml = safetyBox + [
    section('What\'s happening', `The Moon is passing between Earth and the Sun. The path of totality crosses ${data.path_description}.`),
    section('What to watch for', 'As totality approaches — temperature drops, animals go quiet, stars appear in the daytime sky. During totality (if you\'re in the path): the corona, Baily\'s beads, and the diamond ring effect.'),
    section('Eclipse glasses', 'Find ISO 12312-2 certified glasses at your local science museum, library, or search "AAS approved eclipse glasses" online.'),
  ].join('\n');

  return {
    subject: `🌗 Solar eclipse today — what you'll see from your area`,
    html: emailWrapper({
      title: 'Solar Eclipse Today',
      subtitle: `${data.type.charAt(0).toUpperCase() + data.type.slice(1)} eclipse — ${data.path_description}`,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderStarlink(data) {
  const durationMins = Math.round(data.duration_seconds / 60);

  const bodyHtml = [
    section('Where to look', `Face <strong style="color:#1a1f2e;">${data.start_az_compass}</strong> and watch for a line of bright dots moving in a row across the sky — like a string of pearls. They'll travel toward the ${data.end_az_compass}. Visible for about ${durationMins} minute${durationMins !== 1 ? 's' : ''}.`),
    section('What they are', `These are ${data.recent_satellite_count} recently-launched SpaceX Starlink internet satellites, still traveling in formation after launch. They'll gradually spread apart and become invisible over the next few weeks.`),
    section('Fun fact', 'Many people mistake Starlink trains for UFOs. Now you know better — and you can explain it to whoever is standing next to you.'),
    section('Tip', 'They move fast — have someone with you to point and look simultaneously. The train spans several degrees of sky.'),
  ].join('\n');

  return {
    subject: `✨ Starlink satellite train visible in 30 minutes`,
    html: emailWrapper({
      title: 'Starlink Satellite Train',
      subtitle: `Visible in 30 minutes — look ${data.start_az_compass}`,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderAsteroid(data) {
  const distRounded = Math.round(data.dist_ld * 10) / 10;
  const sizeDesc = data.diameter_m >= 500 ? 'the size of a skyscraper'
    : data.diameter_m >= 200 ? 'the size of a city block'
    : 'the size of a large building';

  const bodyHtml = [
    section('Size', `Approximately ${sizeDesc}${data.diameter_m ? ` (estimated ${Math.round(data.diameter_m)}m diameter)` : ''}.`),
    section('Distance', `${distRounded} times the distance from Earth to the Moon — a close pass in astronomical terms, but still hundreds of thousands of kilometres away.`),
    section('Speed', `Traveling at roughly ${data.v_rel ? Math.round(parseFloat(data.v_rel)) : '~20'} km/s — about 50 times faster than a bullet.`),
    section('Not a threat', 'NASA tracks thousands of near-Earth objects. This one passes safely. The purpose of this notification is simply — how often do you get to know there\'s a space rock flying by right now?'),
  ].join('\n');

  return {
    subject: `☄️ Asteroid ${data.name} is making a close pass by Earth today`,
    html: emailWrapper({
      title: `Asteroid ${data.name}`,
      subtitle: `Close approach today — ${distRounded} lunar distances away`,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}
