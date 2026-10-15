// notify.js
// Channel-agnostic notification dispatch.
// Currently routes to email only. Adding SMS later means adding a branch here.

import { sendEmail } from './mailer.js';

const SITE = 'https://whentolook.com';
const API = 'https://api.whentolook.com';

export async function notify(subscriber, event, { apiKey }) {
  const data = JSON.parse(event.event_data);
  const { html, subject } = renderTemplate(event.event_type, data);

  const messageId = await sendEmail({
    to: subscriber.email,
    from: 'When To Look <hello@whentolook.com>',
    subject,
    html,
    apiKey,
    // One-click unsubscribe (RFC 8058) goes straight to our API, so D1 and the
    // inbox's unsubscribe button agree. See mailer.js.
    unsubscribeUrl: data.unsubscribe_token
      ? `${API}/unsubscribe?token=${encodeURIComponent(data.unsubscribe_token)}`
      : null,
  });

  return messageId;
}

function renderTemplate(eventType, data) {
  const templates = {
    meteor: renderMeteor,
    iss: renderIss,
    fullmoon: renderFullMoon,
    lunar_eclipse: renderLunarEclipse,
    solar_eclipse: renderSolarEclipse,
    starlink: renderStarlink,
  };

  const renderer = templates[eventType];
  if (!renderer) throw new Error(`No template for event type: ${eventType}`);

  return renderer(data);
}

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

// "Share this with someone who should look up tonight." The only growth loop
// the product has. Each link carries ?ref=share-<type> so signups can be
// traced back to the alert that brought them.
//
// text: one line a friend can act on without opening anything ("Go outside at
// 9:42 and look southwest").
export function shareBlock({ text, ref, when = 'tonight' }) {
  const url = `${SITE}/?ref=${encodeURIComponent(ref)}`;
  const smsBody = `${text} ${url}`;
  const mailBody = `${text}\n\nI get these alerts free from When To Look: ${url}`;
  const sms = `sms:?&amp;body=${encodeURIComponent(smsBody)}`;
  const mail = `mailto:?subject=${encodeURIComponent('Look up tonight')}&amp;body=${encodeURIComponent(mailBody)}`;
  const link = 'color:#D4A853;font-weight:700;text-decoration:none;';

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;border-radius:8px;margin:28px 0 0;">
    <tr>
      <td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 10px;font-size:15px;color:#E8E6E1;line-height:1.5;">Share this with someone who should look up ${when} &rarr;</p>
        <p style="margin:0;font-size:14px;">
          <a href="${sms}" style="${link}">Text a friend</a>
          <span style="color:#6B7280;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
          <a href="${mail}" style="${link}">Email a friend</a>
        </p>
      </td>
    </tr>
  </table>`;
}

function emailWrapper({ title, subtitle, statsHtml, bodyHtml, unsubscribeToken, share }) {
  const token = encodeURIComponent(unsubscribeToken ?? '');
  const footer = `
    <tr>
      <td class="footer-cell" style="padding:0 40px 36px;">
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
        <p style="margin:0 0 12px;font-size:12px;color:#6B7280;text-align:center;line-height:1.6;">
          Forwarded this? <a href="${SITE}/?ref=forwarded" style="color:#D4A853;text-decoration:none;font-weight:600;">Get your own alerts, free &rarr;</a>
        </p>
        <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;line-height:1.8;">
          You're receiving this because you signed up at
          <a href="${SITE}" style="color:#D4A853;text-decoration:none;">whentolook.com</a><br>
          <a href="${SITE}/unsubscribe?token=${token}" style="color:#9CA3AF;text-decoration:none;">Unsubscribe</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE}/preferences?token=${token}" style="color:#9CA3AF;text-decoration:none;">Manage preferences</a>
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
            ${share ? shareBlock(share) : ''}
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

// Formats a UTC ISO string to a local day (e.g. "Monday, August 2")
function localDay(utcIso, timezone) {
  try {
    return new Date(utcIso).toLocaleDateString('en-US', {
      timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    return utcIso.slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// Template renderers
// ---------------------------------------------------------------------------

function renderMeteor(data) {
  const suburbanLow  = Math.round(data.zhr / 3);
  const suburbanHigh = Math.round(data.zhr / 2);
  const tz = data.timezone;
  const darkAt = data.dark_start ? localTime(data.dark_start, tz) : null;

  const moonLabel = data.moon_conditions
    ? `${data.moon_conditions.charAt(0).toUpperCase()}${data.moon_conditions.slice(1)}`
    : null;

  const stats = statsBlock([
    { label: 'Dark enough at', value: darkAt ?? 'Tonight' },
    { label: 'Where to look', value: 'Straight up' },
    { label: 'Rate',          value: `Up to ${data.zhr}/hr` },
    moonLabel
      ? { label: 'Moonlight',   value: `${moonLabel} (${data.moon_illumination}% lit)` }
      : { label: 'Best time',   value: 'Midnight to dawn' },
  ]);

  let moonSection = '';
  if (data.moon_conditions === 'excellent') {
    moonSection = section('The Moon tonight', data.moon_up_fraction < 0.25
      ? 'Out of the way. It\'s below the horizon for most of the night, so conditions are excellent.'
      : `Only ${data.moon_illumination}% lit, so conditions are excellent.`);
  } else if (data.moon_conditions === 'good') {
    moonSection = section('The Moon tonight', `${data.moon_illumination}% lit, so it will hide some of the fainter meteors. Conditions are still good. Keep the Moon behind you.`);
  } else if (data.moon_conditions === 'poor') {
    moonSection = section('The Moon tonight', `A bright ${data.moon_illumination}% Moon will wash out the faint meteors. You'll still catch the bright ones. Face away from it, and give it a look if you're out anyway.`);
  }

  const darkEnd = data.dark_end ? localTime(data.dark_end, tz) : 'dawn';
  const whenSection = data.darkness && data.darkness !== 'astronomical'
    ? section('Best time', `At your latitude the sky doesn't get fully dark this time of year, so expect fewer faint meteors. Your darkest stretch runs from ${darkAt} to ${darkEnd}.`)
    : section('Best time', `It's properly dark from ${darkAt ?? 'nightfall'} until about ${darkEnd}. Rates climb after midnight, when your side of Earth turns to face into the stream.`);

  const bodyHtml = [
    section('What to expect', `Up to ${data.zhr} meteors per hour under ideal dark-sky conditions. From a suburban location, expect around ${suburbanLow}–${suburbanHigh} per hour.`),
    moonSection,
    whenSection,
    section('How to watch', `Lie flat and look straight up. Meteors radiate from ${data.radiant_constellation} but appear all across the sky — the longest streaks show up 30–45° away from that point. Give your eyes 20 minutes to adjust.`),
    section('What you\'re seeing', `Each streak is a ${data.particle_size || 'grain-of-sand'}-sized particle from ${data.parent_object} hitting Earth's atmosphere at ${data.velocity_kms} km/s, burning up 60–100 km above your head.`),
    section('Gear', 'None. Just your eyes, a blanket, and patience.'),
  ].join('\n');

  return {
    subject: `🌠 ${data.name} meteor shower peaks tonight`,
    html: emailWrapper({
      title: `${data.name} Meteor Shower`,
      subtitle: darkAt ? `Peaks tonight. Head out after ${darkAt}` : 'Peaks tonight',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
      share: {
        text: `The ${data.name} meteor shower peaks tonight: up to ${data.zhr} an hour. Get somewhere dark${darkAt ? ` after ${darkAt}` : ''} and look straight up.`,
        ref: 'share-meteor',
      },
    }),
  };
}

function renderIss(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const timeStr = data.start_utc ? localTime(data.start_utc, data.timezone) : 'In ~1 hour';

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
    subject: `🛰️ Space Station passes over in 1 hour — look ${data.start_az_compass}`,
    html: emailWrapper({
      title: 'International Space Station',
      subtitle: 'Passing overhead in 1 hour',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
      share: {
        text: `Go outside at ${timeStr} and look ${compassFull(data.start_az_compass).toLowerCase()}: the Space Station is flying over. A bright, steady light moving fast.`,
        ref: 'share-iss',
      },
    }),
  };
}

function renderFullMoon(data) {
  const tz = data.timezone;
  const typeLabel = data.supermoon ? 'Supermoon' : 'Full Moon';
  const riseTime = data.moonrise_utc ? localTime(data.moonrise_utc, tz) : null;
  const riseDir = data.moonrise_direction ? compassFull(data.moonrise_direction) : 'East';

  const stats = statsBlock([
    { label: 'Tonight',      value: `Full ${data.name}` },
    data.circumpolar
      ? { label: 'Visible',  value: 'All night' }
      : { label: 'Moonrise', value: riseTime ?? 'At sunset' },
    { label: 'Look',         value: data.circumpolar ? 'Up — it never sets' : `${riseDir}, on the horizon` },
    data.distance_km
      ? { label: 'Distance', value: `${data.distance_km.toLocaleString('en-US')} km` }
      : { label: 'Type',     value: typeLabel },
  ]);

  const closer = data.percent_closer > 0 ? `${data.percent_closer}% closer than average` : 'near its closest point';
  const supermoonSection = data.supermoon
    ? section('Why it\'s a Supermoon', `The Moon's orbit is slightly oval, and tonight it's ${closer} (${(data.distance_km ?? 0).toLocaleString('en-US')} km away). That makes it look up to 14% larger and 30% brighter than a full moon at its farthest.`)
    : '';

  const bestMoment = data.circumpolar
    ? section('Best moment to watch', 'At your latitude this time of year, the full moon never sets. It circles the sky all night. Step out any time after dark.')
    : section('Best moment to watch', `Right at moonrise${riseTime ? `, ${riseTime}` : ''}, low in the ${riseDir.toLowerCase()}. Near the horizon the "Moon illusion" makes it look enormous. It'll seem to shrink as it climbs, even though its size hasn't changed.`);

  const bodyHtml = [
    bestMoment,
    supermoonSection,
    section('The name', data.name_origin + '.'),
    section('No gear needed', 'The full moon is bright enough to cast shadows.'),
  ].join('\n');

  return {
    subject: `🌕 Full ${data.name} rises tonight${riseTime ? ` at ${riseTime}` : ''}${data.supermoon ? ' — Supermoon' : ''}`,
    html: emailWrapper({
      title: `Full ${data.name}`,
      subtitle: data.supermoon ? 'Supermoon tonight' : 'Full moon tonight',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
      share: {
        text: data.circumpolar
          ? `Full ${data.name} tonight. It stays up all night, so look up any time after dark.`
          : `The full ${data.name} rises at ${riseTime ?? 'sunset'} tonight. Look ${riseDir.toLowerCase()} to catch it huge on the horizon.`,
        ref: 'share-fullmoon',
      },
    }),
  };
}

function renderLunarEclipse(data) {
  const isReminder = data.is_reminder;
  const tz = data.timezone;
  const typeLabel = data.type === 'total' ? 'Total Lunar Eclipse'
    : data.type === 'partial' ? 'Partial Lunar Eclipse'
    : 'Penumbral Lunar Eclipse';

  const t = iso => (iso ? localTime(iso, tz) : null);
  // Contacts that happen with the Moon below this subscriber's horizon are listed but marked.
  const hidden = key => data.contact_visible && data.contact_visible[key] === false;
  const firstInteresting = data.partial_start ?? data.penumbral_start;
  const beginKey = data.partial_start ? 'partial_start' : 'penumbral_start';
  // If the eclipse starts before moonrise here, lead with moonrise. That's the
  // first moment there's anything to see.
  const risesEclipsed = hidden(beginKey) && data.moon_rises_during;
  const firstLook = risesEclipsed ? data.moon_rises_during : firstInteresting;

  const stats = statsBlock([
    { label: risesEclipsed ? 'Moon rises eclipsed' : 'Eclipse begins', value: t(firstLook) ?? 'Tonight' },
    { label: data.total_start ? 'Totality' : 'Peak', value: data.total_start ? `${t(data.total_start)}–${t(data.total_end)}` : (t(data.maximum) ?? '—') },
    { label: 'Where to look', value: data.look_direction ? `${compassFull(data.look_direction)}, ${elevDesc(data.look_altitude ?? 30)}` : 'Find the Moon' },
    { label: 'Eye safety',     value: 'Safe, naked eye' },
  ]);

  const whatYoullSee = data.type === 'total'
    ? 'The Moon will turn a deep copper or blood red as Earth\'s shadow covers it completely — one of the most striking things you can see with the naked eye.'
    : data.type === 'partial'
    ? 'You\'ll see Earth\'s curved shadow slowly creeping across the Moon\'s surface — a visible reminder that Earth is a sphere.'
    : 'A subtle darkening on one side of the Moon. This one\'s understated, so look carefully, ideally around the peak.';

  const rows = [
    ['penumbral_start', 'Eclipse begins (faint shading)'],
    ['partial_start', 'Earth\'s shadow starts to bite'],
    ['total_start', 'Totality begins'],
    ['maximum', 'Maximum eclipse'],
    ['total_end', 'Totality ends'],
    ['partial_end', 'Shadow leaves the Moon'],
    ['penumbral_end', 'Eclipse ends'],
  ].filter(([key]) => data[key]).map(([key, label]) =>
    `${label}: <strong style="color:#1a1f2e;">${t(data[key])}</strong>${hidden(key) ? ' <span style="color:#9CA3AF;">(Moon below your horizon)</span>' : ''}`);

  const timelineSection = rows.length
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.9;color:#4B5563;"><strong style="color:#1a1f2e;">Timeline (your local time):</strong><br>${rows.join('<br>')}</p>`
    : '';

  const horizonNotes = [];
  if (data.moon_rises_during) horizonNotes.push(`The Moon rises at ${t(data.moon_rises_during)} with the eclipse already under way. Find a clear view of the eastern horizon.`);
  if (data.moon_sets_during) horizonNotes.push(`The Moon sets at ${t(data.moon_sets_during)}, before the eclipse ends. Catch it while it's still up.`);

  const bodyHtml = [
    section('What you\'ll see', whatYoullSee),
    timelineSection,
    horizonNotes.length ? section('Heads up', horizonNotes.join(' ')) : '',
    section('Why it happens', 'The Sun, Earth and Moon line up, and the Moon passes through Earth\'s shadow. The red color is sunlight bent through Earth\'s atmosphere, the light of every sunrise and sunset on the planet at once.'),
    section('Safe to watch', 'Unlike a solar eclipse, a lunar eclipse is completely safe to watch with your naked eyes. No equipment needed — though binoculars show beautiful detail.'),
  ].join('\n');

  const when = firstLook ? localDay(firstLook, tz) : null;
  return {
    subject: isReminder
      ? `🌑 Reminder: ${typeLabel} tomorrow night`
      : risesEclipsed
      ? `🌑 ${typeLabel} tonight — the Moon rises eclipsed at ${t(firstLook)}`
      : `🌑 ${typeLabel} tonight — starts at ${t(firstLook)}`,
    html: emailWrapper({
      title: typeLabel,
      subtitle: isReminder
        ? `Tomorrow night${when ? `, ${when}` : ''}. Plan ahead.`
        : 'Visible tonight from your area',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
      share: {
        text: risesEclipsed
          ? `${typeLabel} ${isReminder ? 'tomorrow night' : 'tonight'}: the Moon rises already eclipsed at ${t(firstLook)}. Look low in the east. Totally safe to watch with your eyes.`
          : `${typeLabel} ${isReminder ? 'tomorrow night' : 'tonight'}, starting at ${t(firstLook)}. Totally safe to watch with your eyes.`,
        ref: 'share-lunar-eclipse',
        when: isReminder ? 'tomorrow night' : 'tonight',
      },
    }),
  };
}

function renderSolarEclipse(data) {
  const tz = data.timezone;
  const t = iso => (iso ? localTime(iso, tz) : null);
  const where = data.location_name ? esc(data.location_name) : 'your area';
  const pct = data.percent_covered;
  const localType = data.local_type ?? 'partial';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const safetyBox = `<div style="background:#FEF2F2;border-left:3px solid #EF4444;padding:14px 18px;border-radius:4px;margin-bottom:20px;font-size:14px;line-height:1.6;color:#1a1f2e;">
    ⚠️ <strong>NEVER look directly at the Sun</strong> without certified eclipse glasses (ISO 12312-2). Regular sunglasses are <strong>NOT</strong> safe.${localType === 'total' ? ' Only during the brief moments of totality, when the Sun is completely covered, is it safe to look without them.' : ''}
  </div>`;

  const stats = statsBlock([
    { label: 'Maximum at',    value: t(data.local_maximum) ?? (data.is_reminder ? 'Tomorrow' : 'Today') },
    { label: 'Sun covered',   value: pct != null ? `${pct}%` : '—' },
    { label: 'From here',     value: `${cap(localType)} eclipse` },
    { label: 'Eye safety',    value: '⚠️ Glasses required' },
  ]);

  const rows = [
    data.starts_before_sunrise
      ? `Already under way at sunrise, <strong style="color:#1a1f2e;">${t(data.visible_start)}</strong>`
      : `Moon first touches the Sun: <strong style="color:#1a1f2e;">${t(data.local_start)}</strong>`,
    `Maximum (${pct}% covered): <strong style="color:#1a1f2e;">${t(data.local_maximum)}</strong>`,
    data.ends_after_sunset
      ? `Sun sets still eclipsed at <strong style="color:#1a1f2e;">${t(data.visible_end)}</strong>`
      : `Eclipse ends: <strong style="color:#1a1f2e;">${t(data.local_end)}</strong>`,
  ];
  const timelineSection = data.local_maximum
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.9;color:#4B5563;"><strong style="color:#1a1f2e;">Timeline (your local time):</strong><br>${rows.join('<br>')}</p>`
    : '';

  const whatYoullSee = localType === 'total'
    ? 'You\'re inside the path of totality. The sky will darken to deep twilight, the temperature will drop, and birds go quiet. At totality you\'ll see the Sun\'s corona, then Baily\'s beads and the diamond ring as the Sun returns. Near the edge of the path totality is brief, so check NASA\'s map for how long it lasts where you are.'
    : localType === 'annular'
    ? 'You\'re inside the path of annularity. At maximum the Moon sits inside the Sun, leaving a blazing "ring of fire." Glasses stay on the whole time: even the ring is dangerously bright.'
    : pct >= 80
    ? `The Moon will cover ${pct}% of the Sun. Daylight will turn strangely dim and silvery, and shadows get sharp. Look under a tree for hundreds of tiny crescent suns in the shade.`
    : `The Moon will take a ${pct}% bite out of the Sun. You won't notice the dimming, but through glasses (or a pinhole projector) you'll clearly see the crescent.`;

  const pathLabel = { total: 'totality', annular: 'the "ring of fire"', hybrid: 'totality' }[data.type];
  const pathSection = data.path_description && pathLabel && localType === 'partial'
    ? section('The full show', `${cap(pathLabel)} is visible along a narrow path through ${data.path_description}. <a href="${data.map_url}" style="color:#D4A853;">See NASA's map &rarr;</a>`)
    : data.map_url ? section('Map', `<a href="${data.map_url}" style="color:#D4A853;">NASA's eclipse map &rarr;</a>`) : '';

  const bodyHtml = safetyBox + [
    section('What you\'ll see', whatYoullSee),
    timelineSection,
    data.sun_direction_at_max ? section('Where to look', `At maximum the Sun will be ${elevDesc(data.sun_altitude_at_max ?? 30)} in the ${compassFull(data.sun_direction_at_max).toLowerCase()}. Make sure nothing blocks that part of the sky.`) : '',
    pathSection,
    section('Eclipse glasses', `Use glasses certified to ISO 12312-2 only. The American Astronomical Society keeps a list of <a href="https://eclipse.aas.org/eye-safety/viewers-filters" style="color:#D4A853;">reputable vendors</a>. No glasses? Poke a small hole in a card and project the Sun onto paper.`),
  ].join('\n');

  const subject = data.is_reminder
    ? `🌗 Solar eclipse tomorrow — here's what you'll see from ${data.location_name ?? 'your area'}`
    : localType === 'total'
    ? `🌑 Total solar eclipse today — totality at ${t(data.local_maximum)}`
    : `🌗 Solar eclipse today — ${pct}% of the Sun covered at ${t(data.local_maximum)}`;

  return {
    subject,
    html: emailWrapper({
      title: data.is_reminder ? 'Solar Eclipse Tomorrow' : 'Solar Eclipse Today',
      subtitle: `${cap(localType)} eclipse from ${where}${data.local_maximum ? `, ${localDay(data.local_maximum, tz)}` : ''}`,
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
      share: {
        text: `Solar eclipse ${data.is_reminder ? 'tomorrow' : 'today'}: ${pct}% of the Sun covered at ${t(data.local_maximum)}. Eclipse glasses only, never look directly!`,
        ref: 'share-solar-eclipse',
        when: data.is_reminder ? 'tomorrow' : 'today',
      },
    }),
  };
}

function renderStarlink(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const timeStr = data.start_utc ? localTime(data.start_utc, data.timezone) : 'In ~1 hour';

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
    subject: `✨ Starlink satellite train visible in 1 hour`,
    html: emailWrapper({
      title: 'Starlink Satellite Train',
      subtitle: 'Visible in 1 hour',
      statsHtml: stats,
      bodyHtml,
      unsubscribeToken: data.unsubscribe_token,
      share: {
        text: `Starlink satellite train visible at ${timeStr}: look ${compassFull(data.start_az_compass).toLowerCase()}. It's a line of lights moving in a row across the sky.`,
        ref: 'share-starlink',
      },
    }),
  };
}
