// notify.js
// Channel-agnostic notification dispatch.
// Currently routes to email only. Adding SMS later means adding a branch here.

import { sendEmail } from './aws-ses.js';

export async function notify(subscriber, event, { awsAccessKeyId, awsSecretAccessKey }) {
  const { html, subject } = renderTemplate(event);

  const messageId = await sendEmail({
    to: subscriber.email,
    from: 'When To Look <hello@whentolook.com>',
    subject,
    html,
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  });

  return messageId;
}

function renderTemplate(event) {
  const templates = {
    meteor: renderMeteor,
    iss: renderIss,
    fullmoon: renderFullMoon,
    lunar_eclipse: renderLunarEclipse,
    solar_eclipse: renderSolarEclipse,
    starlink: renderStarlink,
  };

  const renderer = templates[event.event_type];
  if (!renderer) throw new Error(`No template for event type: ${event.event_type}`);

  return renderer(JSON.parse(event.event_data));
}

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

// 2×2 stat block — the first thing people see when they open the email.
// stats: array of exactly 4 { label, value } objects.
function statsBlock(stats) {
  const cell = (s, borderRight, borderTop) => `
    <td width="50%" style="padding:20px 24px;${borderRight ? 'border-right:1px solid rgba(255,255,255,0.12);' : ''}${borderTop ? 'border-top:1px solid rgba(255,255,255,0.12);' : ''}vertical-align:top;">
      <p style="margin:0 0 5px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;">${s.label}</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#D4A853;line-height:1.25;">${s.value}</p>
    </td>`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;border-radius:8px;margin:0 0 28px;overflow:hidden;">
    <tr>
      ${cell(stats[0], true, false)}
      ${cell(stats[1], false, false)}
    </tr>
    <tr>
      ${cell(stats[2], true, true)}
      ${cell(stats[3], false, true)}
    </tr>
  </table>`;
}

function emailWrapper({ title, subtitle, statsHtml, bodyHtml, unsubscribeToken }) {
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
          <td class="content-cell" style="padding:36px 40px 32px;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;font-weight:600;">When To Look</p>
            <h1 style="margin:8px 0 6px;font-size:26px;font-weight:700;color:#1a1f2e;line-height:1.3;">${title}</h1>
            <p style="margin:0 0 28px;font-size:14px;color:#6B7280;">${subtitle}</p>
            ${statsHtml}
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

// Renders a supporting detail section.
function section(label, content) {
  return `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4B5563;">
    <strong style="color:#1a1f2e;">${label}:</strong> ${content}
  </p>`;
}

// Expands compass abbreviation to full words (e.g. "NNE" → "North-northeast")
function compassFull(az) {
  const map = {
    N: 'North', NNE: 'North-northeast', NE: 'Northeast', ENE: 'East-northeast',
    E: 'East',  ESE: 'East-southeast', SE: 'Southeast', SSE: 'South-southeast',
    S: 'South', SSW: 'South-southwest', SW: 'Southwest', WSW: 'West-southwest',
    W: 'West',  WNW: 'West-northwest', NW: 'Northwest', NNW: 'North-northwest',
  };
  return map[az] || az;
}

// Converts elevation in degrees to a human-readable height description
function elevDesc(deg) {
  if (deg >= 85) return 'straight up';
  if (deg >= 60) return 'high overhead';
  if (deg >= 40) return 'halfway up';
  if (deg >= 20) return 'low in the sky';
  return 'near the horizon';
}

// Formats a UTC ISO string to local time (e.g. "9:42 PM")
function localTime(utcIso, timezone) {
  try {
    return new Date(utcIso).toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return utcIso.slice(11, 16) + ' UTC';
  }
}

// ---------------------------------------------------------------------------
// Template renderers
// ---------------------------------------------------------------------------

function renderMeteor(data) {
  const suburbanLow  = Math.round(data.zhr / 3);
  const suburbanHigh = Math.round(data.zhr / 2);

  const stats = statsBlock([
    { label: 'When',        value: 'Tonight' },
    { label: 'Where to look', value: 'Straight up' },
    { label: 'Rate',        value: `Up to ${data.zhr}/hr` },
    { label: 'Best time',   value: 'Midnight to dawn' },
  ]);

  const bodyHtml = [
    section('What to expect', `Up to ${data.zhr} meteors per hour under ideal dark-sky conditions. From a suburban location, expect around ${suburbanLow}–${suburbanHigh} per hour.`),
    section('How to watch', `Lie flat and look straight up. Meteors radiate from ${data.radiant_constellation} but appear all across the sky — the longest streaks show up 30–45° away from that point. Give your eyes 20 minutes to adjust.`),
    section('What you\'re seeing', `Each streak is a ${data.particle_size || 'grain-of-sand'}-sized particle from ${data.parent_object} hitting Earth's atmosphere at ${data.velocity_kms} km/s, burning up 60–100 km above your head.`),
    section('Gear', 'None. Just your eyes, a blanket, and patience.'),
  ].join('\n');

  return {
    subject: `🌠 ${data.name} meteor shower peaks tonight`,
    html: emailWrapper({
      title: `${data.name} Meteor Shower`,
      subtitle: `Peaks tonight`,
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderIss(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const timeStr = data.start_utc ? localTime(data.start_utc, data.timezone) : 'In ~30 min';
  const elevLabel = data.max_elevation >= 60 ? 'Very high arc'
    : data.max_elevation >= 45 ? 'High arc'
    : 'Good pass';

  const stats = statsBlock([
    { label: 'Visible at',   value: timeStr },
    { label: 'Where to look', value: `${compassFull(data.start_az_compass)}, ${elevDesc(data.max_elevation)}` },
    { label: 'Visible for',  value: `${durationMins} min` },
    { label: 'Max height',   value: `${data.max_elevation}°` },
  ]);

  const bodyHtml = [
    section('What to look for', `A bright, steady light moving smoothly across the sky — no blinking. Face ${data.start_az_compass} and watch it arc toward the ${data.end_az_compass}. It moves noticeably fast.`),
    section('What you\'re seeing', 'The International Space Station — a structure the size of a football field, orbiting 250 miles up at 17,500 mph. Astronauts are living and working up there right now.'),
    section('Tip', 'Once you spot it, track it across the sky. Watch for it to fade as it enters Earth\'s shadow — it doesn\'t set, it just disappears.'),
  ].join('\n');

  return {
    subject: `🛰️ Space Station passes over in 30 minutes — look ${data.start_az_compass}`,
    html: emailWrapper({
      title: 'International Space Station',
      subtitle: 'Passing overhead in 30 minutes',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderFullMoon(data) {
  const typeLabel = data.supermoon ? 'Supermoon' : 'Full Moon';

  const stats = statsBlock([
    { label: 'Tonight',      value: `Full ${data.name}` },
    { label: 'Look',         value: 'East at moonrise' },
    { label: 'Type',         value: typeLabel },
    { label: 'Visible',      value: 'All night' },
  ]);

  const supermoonSection = data.supermoon
    ? section('Why it\'s a Supermoon', 'The Moon\'s orbit is slightly elliptical. Tonight it\'s near its closest point to Earth (perigee), making it appear about 14% larger and 30% brighter than a typical full moon.')
    : '';

  const bodyHtml = [
    section('Best moment to watch', 'Look for it right at moonrise, when it\'s near the horizon — that\'s when the "Moon illusion" makes it look enormous. It\'ll seem to shrink as it climbs higher, even though its actual size hasn\'t changed.'),
    supermoonSection,
    section('The name', data.name_origin + '.'),
    section('No gear needed', 'The full moon is bright enough to cast shadows.'),
  ].join('\n');

  return {
    subject: `🌕 Full ${data.name} rises tonight${data.supermoon ? ' — Supermoon' : ''}`,
    html: emailWrapper({
      title: `Full ${data.name}`,
      subtitle: data.supermoon ? 'Supermoon tonight' : 'Full moon tonight',
      statsHtml: stats,
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

  const startsAt = data.partial_start
    ? new Date(data.partial_start).toUTCString().slice(17, 22) + ' UTC'
    : data.maximum
    ? new Date(data.maximum).toUTCString().slice(17, 22) + ' UTC'
    : 'Tonight';

  const peakAt = data.maximum
    ? new Date(data.maximum).toUTCString().slice(17, 22) + ' UTC'
    : '—';

  const safeLabel = data.type === 'solar' ? '⚠️ Glasses required' : 'Safe — naked eye';

  const stats = statsBlock([
    { label: 'Eclipse begins', value: startsAt },
    { label: 'Peak',           value: peakAt },
    { label: 'Type',           value: typeLabel },
    { label: 'Eye safety',     value: safeLabel },
  ]);

  const whatYoullSee = data.type === 'total'
    ? 'The Moon will turn a deep copper or blood red as Earth\'s shadow covers it completely — one of the most striking things you can see with the naked eye.'
    : data.type === 'partial'
    ? 'You\'ll see Earth\'s curved shadow slowly creeping across the Moon\'s surface — a visible reminder that Earth is a sphere.'
    : 'A subtle darkening on one side of the Moon. This one\'s understated — look carefully.';

  const timelineRows = [
    data.partial_start ? `Partial eclipse begins: ${new Date(data.partial_start).toUTCString().slice(17, 22)} UTC` : '',
    data.total_start   ? `Totality begins: ${new Date(data.total_start).toUTCString().slice(17, 22)} UTC` : '',
    data.maximum       ? `Maximum: ${new Date(data.maximum).toUTCString().slice(17, 22)} UTC` : '',
    data.total_end     ? `Totality ends: ${new Date(data.total_end).toUTCString().slice(17, 22)} UTC` : '',
    data.partial_end   ? `Partial eclipse ends: ${new Date(data.partial_end).toUTCString().slice(17, 22)} UTC` : '',
  ].filter(Boolean).join('<br>');

  const timelineSection = timelineRows
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.9;color:#4B5563;"><strong style="color:#1a1f2e;">Timeline (UTC):</strong><br>${timelineRows}</p>`
    : '';

  const bodyHtml = [
    section('What you\'ll see', whatYoullSee),
    timelineSection,
    section('Safe to watch', 'Unlike a solar eclipse, a lunar eclipse is completely safe to observe with your naked eyes. No equipment needed — though binoculars show beautiful detail.'),
  ].join('\n');

  return {
    subject: isReminder
      ? `🌑 Reminder: ${typeLabel} tomorrow night`
      : `🌑 ${typeLabel} tonight — here's when to look`,
    html: emailWrapper({
      title: typeLabel,
      subtitle: isReminder ? 'Tomorrow night — plan ahead' : 'Visible tonight from your area',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderSolarEclipse(data) {
  const safetyBox = `<div style="background:#FEF2F2;border-left:3px solid #EF4444;padding:14px 18px;border-radius:4px;margin-bottom:20px;font-size:14px;line-height:1.6;color:#1a1f2e;">
    ⚠️ <strong>NEVER look directly at the Sun</strong> without certified eclipse glasses (ISO 12312-2). Regular sunglasses are <strong>NOT</strong> safe.
  </div>`;

  const stats = statsBlock([
    { label: 'When',         value: 'Today' },
    { label: 'Type',         value: data.type.charAt(0).toUpperCase() + data.type.slice(1) + ' eclipse' },
    { label: 'Path',         value: data.path_description },
    { label: 'Eye safety',   value: '⚠️ Eclipse glasses required' },
  ]);

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
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

function renderStarlink(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const timeStr = data.start_utc ? localTime(data.start_utc, data.timezone) : 'In ~30 min';

  const stats = statsBlock([
    { label: 'Visible at',   value: timeStr },
    { label: 'Where to look', value: `${compassFull(data.start_az_compass)}, ${elevDesc(data.max_elevation)}` },
    { label: 'Visible for',  value: `${durationMins} min` },
    { label: 'Satellites',   value: `~${data.recent_satellite_count} in formation` },
  ]);

  const bodyHtml = [
    section('What to look for', `A line of bright dots moving in a row — like a string of pearls crossing the sky. Face ${data.start_az_compass} and watch them arc toward the ${data.end_az_compass}.`),
    section('What they are', `Newly-launched SpaceX Starlink internet satellites, still traveling in formation. They'll gradually spread apart and become invisible over the next few weeks.`),
    section('Fun fact', 'Many people mistake Starlink trains for UFOs. Now you know better.'),
  ].join('\n');

  return {
    subject: `✨ Starlink satellite train visible in 30 minutes`,
    html: emailWrapper({
      title: 'Starlink Satellite Train',
      subtitle: 'Visible in 30 minutes',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
    }),
  };
}

