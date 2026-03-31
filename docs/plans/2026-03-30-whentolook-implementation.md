# When To Look — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a night sky event notification service that emails subscribers before visible sky events, personalized to their location.

**Architecture:** Four Cloudflare Workers sharing one D1 (SQLite) database — API, event-computer (daily cron), aurora-monitor (15-min cron), and email-dispatcher (5-min cron). Frontend is static HTML/CSS/JS on Cloudflare Pages. Build vertically: prove the full pipeline with meteor showers first, then layer in additional event types.

**Tech Stack:** Cloudflare Workers (ES modules), Cloudflare D1, Cloudflare Pages, Resend (email), N2YO API (ISS/Starlink), NOAA SWPC (aurora), JPL CNEOS (asteroids), Vitest (unit tests), Wrangler CLI (local dev + deployment)

---

## Pre-flight: Tools You Need

Install Wrangler CLI globally:
```bash
npm install -g wrangler
```

Log in to Cloudflare:
```bash
wrangler login
```

Verify your account:
```bash
wrangler whoami
```

---

## Phase 1: Foundation

### Task 1: Initialize GitHub Repo + Project Structure

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `schema.sql`

**Step 1: Create the repo directory structure**
```bash
mkdir -p workers/api/src
mkdir -p workers/event-computer/src/events
mkdir -p workers/aurora-monitor/src
mkdir -p workers/email-dispatcher/src/templates
mkdir -p frontend
mkdir -p data
mkdir -p docs/plans
```

**Step 2: Create root package.json**
```json
{
  "name": "whentolook",
  "private": true,
  "scripts": {
    "deploy:api": "cd workers/api && wrangler deploy",
    "deploy:event-computer": "cd workers/event-computer && wrangler deploy",
    "deploy:aurora-monitor": "cd workers/aurora-monitor && wrangler deploy",
    "deploy:email-dispatcher": "cd workers/email-dispatcher && wrangler deploy",
    "deploy:all": "npm run deploy:api && npm run deploy:event-computer && npm run deploy:aurora-monitor && npm run deploy:email-dispatcher",
    "dev:api": "cd workers/api && wrangler dev",
    "dev:dispatcher": "cd workers/email-dispatcher && wrangler dev"
  }
}
```

**Step 3: Create .gitignore**
```
node_modules/
.wrangler/
dist/
.dev.vars
*.local
```

**Step 4: Create schema.sql**
```sql
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_name TEXT,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed INTEGER DEFAULT 0,
  confirm_token TEXT,
  unsubscribe_token TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS preferences (
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  min_elevation INTEGER,
  PRIMARY KEY (subscriber_id, event_type)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_id TEXT,
  sent_at TEXT NOT NULL,
  email_id TEXT
);

CREATE TABLE IF NOT EXISTS event_queue (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_data TEXT NOT NULL,
  notify_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_notify ON event_queue(notify_at, status);
CREATE INDEX IF NOT EXISTS idx_queue_subscriber ON event_queue(subscriber_id, event_type);
CREATE INDEX IF NOT EXISTS idx_log_subscriber_event ON notification_log(subscriber_id, event_type, event_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(active, confirmed);
```

**Step 5: Initialize git and push to GitHub**
```bash
git init
git add .
git commit -m "feat: initial project structure and schema"
```

Create a new repo at github.com, then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/whentolook.git
git push -u origin main
```

---

### Task 2: Create the D1 Database

**Step 1: Create the D1 database**
```bash
wrangler d1 create whentolook
```

This outputs something like:
```
✅ Successfully created DB 'whentolook' in region WNAM
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "whentolook"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy that `database_id` — you'll need it in every wrangler.toml.**

**Step 2: Apply schema to local dev database**
```bash
wrangler d1 execute whentolook --local --file=schema.sql
```
Expected: `Executed 8 queries`

**Step 3: Apply schema to production database**
```bash
wrangler d1 execute whentolook --file=schema.sql
```
Expected: `Executed 8 queries`

**Step 4: Verify tables exist**
```bash
wrangler d1 execute whentolook --local --command="SELECT name FROM sqlite_master WHERE type='table'"
```
Expected: `subscribers`, `preferences`, `notification_log`, `event_queue`

**Step 5: Commit**
```bash
git add schema.sql
git commit -m "feat: create D1 database and apply schema"
```

---

### Task 3: Email Dispatcher Worker (Prove Emails Send)

**Files:**
- Create: `workers/email-dispatcher/wrangler.toml`
- Create: `workers/email-dispatcher/package.json`
- Create: `workers/email-dispatcher/src/index.js`
- Create: `workers/email-dispatcher/src/notify.js`

**Step 1: Create wrangler.toml** — replace `DATABASE_ID` with the one from Task 2
```toml
name = "whentolook-email-dispatcher"
main = "src/index.js"
compatibility_date = "2025-01-01"

[triggers]
crons = ["*/5 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "whentolook"
database_id = "DATABASE_ID_HERE"
```

**Step 2: Create package.json**
```json
{
  "name": "whentolook-email-dispatcher",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "vitest": "^1.0.0"
  }
}
```

**Step 3: Create notify.js — the channel-agnostic dispatch function**
```js
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
  // Templates are loaded dynamically by event_type.
  // Each template exports { html, subject } given event.event_data (parsed JSON).
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
```

**Step 4: Create index.js — the dispatcher cron worker**
```js
// index.js
import { notify } from './notify.js';

export default {
  // Cron trigger: runs every 5 minutes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },

  // HTTP handler: allows manual trigger via GET /trigger (dev only)
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/trigger') {
      ctx.waitUntil(dispatch(env));
      return new Response('Dispatch triggered', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  },
};

async function dispatch(env) {
  const now = new Date().toISOString();

  const { results } = await env.DB.prepare(`
    SELECT eq.*, s.email, s.timezone, s.unsubscribe_token
    FROM event_queue eq
    JOIN subscribers s ON s.id = eq.subscriber_id
    WHERE eq.status = 'pending' AND eq.notify_at <= ?
    LIMIT 50
  `).bind(now).all();

  for (const event of results) {
    await processEvent(event, env);
  }
}

async function processEvent(event, env) {
  // Inject unsubscribe_token into event_data for template use
  const eventData = JSON.parse(event.event_data);
  eventData.unsubscribe_token = event.unsubscribe_token;

  const enrichedEvent = { ...event, event_data: JSON.stringify(eventData) };

  try {
    const emailId = await notify(
      { email: event.email },
      enrichedEvent,
      env.RESEND_API_KEY
    );

    await env.DB.prepare(`
      UPDATE event_queue SET status = 'sent' WHERE id = ?
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

  } catch (err) {
    console.error(`Failed to send event ${event.id}:`, err.message);

    // Increment attempt count via a simple retry: mark failed after 3 attempts
    // event_data stores attempt count
    const data = JSON.parse(event.event_data);
    data._attempts = (data._attempts || 0) + 1;

    const newStatus = data._attempts >= 3 ? 'skipped' : 'pending';
    await env.DB.prepare(`
      UPDATE event_queue SET status = ?, event_data = ? WHERE id = ?
    `).bind(newStatus, JSON.stringify(data), event.id).run();
  }
}
```

**Step 5: Set up your Resend API key as a Worker secret**

First, create a new API key in Resend:
1. Log in to resend.com → API Keys → Create API Key
2. Name it "whentolook-production", Full Access
3. Copy the key immediately (shown once)

Store it as a Worker secret:
```bash
cd workers/email-dispatcher
npx wrangler secret put RESEND_API_KEY
```
Paste your key when prompted. It's stored encrypted — never in any file.

**Step 6: Test locally — send a hardcoded test email**

Add a test route to index.js temporarily (remove after testing):
```js
// In fetch() handler, add:
if (new URL(request.url).pathname === '/test-email') {
  const testEmailId = await notify(
    { email: 'YOUR_EMAIL@gmail.com' },
    {
      event_type: 'meteor',
      event_data: JSON.stringify({
        name: 'Test Shower',
        zhr: 100,
        radiant_constellation: 'Leo',
        parent_object: 'Test Comet',
        velocity_kms: 66,
        unsubscribe_token: 'test-token-123'
      })
    },
    env.RESEND_API_KEY
  );
  return new Response(`Email sent: ${testEmailId}`, { status: 200 });
}
```

Run the worker locally:
```bash
cd workers/email-dispatcher
npx wrangler dev
```

In another terminal:
```bash
curl http://localhost:8787/test-email
```
Expected: `Email sent: re_xxxxxxxxxx`

Check your inbox. Verify the email looks correct and dark theme renders properly.

**Step 7: Remove the test route, commit**
```bash
git add workers/email-dispatcher/
git commit -m "feat: email dispatcher worker with channel-agnostic notify()"
```

---

## Phase 2: Full Pipeline — Meteor Showers (Target: Lyrids, April 21–22)

### Task 4: API Worker (Sign-up + Confirm + Unsubscribe)

**Files:**
- Create: `workers/api/wrangler.toml`
- Create: `workers/api/package.json`
- Create: `workers/api/src/index.js`
- Create: `workers/api/src/subscribe.js`
- Create: `workers/api/src/confirm.js`
- Create: `workers/api/src/unsubscribe.js`
- Create: `workers/api/src/preferences.js`

**Step 1: Create wrangler.toml** (replace DATABASE_ID)
```toml
name = "whentolook-api"
main = "src/index.js"
compatibility_date = "2025-01-01"

[vars]
FRONTEND_URL = "https://whentolook.com"

[[d1_databases]]
binding = "DB"
database_name = "whentolook"
database_id = "DATABASE_ID_HERE"
```

**Step 2: Create package.json**
```json
{
  "name": "whentolook-api",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

**Step 3: Set Resend API key for this worker too**
```bash
cd workers/api
npx wrangler secret put RESEND_API_KEY
```
(Same key as the dispatcher)

**Step 4: Create subscribe.js**
```js
// subscribe.js
export async function handleSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { email, latitude, longitude, location_name, timezone, preferences } = body;

  if (!email || !latitude || !longitude || !timezone) {
    return json({ error: 'Missing required fields: email, latitude, longitude, timezone' }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  const subscriberId = crypto.randomUUID();
  const confirmToken = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();
  const now = new Date().toISOString();

  // Upsert subscriber (re-confirm if already exists but unconfirmed)
  try {
    await env.DB.prepare(`
      INSERT INTO subscribers (id, email, latitude, longitude, location_name, timezone, created_at, confirm_token, unsubscribe_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        confirm_token = excluded.confirm_token,
        active = 1
    `).bind(subscriberId, email, latitude, longitude, location_name || null, timezone, now, confirmToken, unsubscribeToken).run();
  } catch (err) {
    console.error('DB error:', err);
    return json({ error: 'Database error' }, 500);
  }

  // Get the actual subscriber id (may differ if email already existed)
  const sub = await env.DB.prepare('SELECT id, unsubscribe_token FROM subscribers WHERE email = ?').bind(email).first();

  // Upsert preferences
  const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'];
  const enabled = preferences || allTypes;

  for (const type of allTypes) {
    await env.DB.prepare(`
      INSERT INTO preferences (subscriber_id, event_type, enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(subscriber_id, event_type) DO UPDATE SET enabled = excluded.enabled
    `).bind(sub.id, type, enabled.includes(type) ? 1 : 0).run();
  }

  // Send confirmation email
  await sendConfirmationEmail(email, sub.id, confirmToken, env);

  return json({ success: true, message: 'Check your email to confirm your subscription.' });
}

async function sendConfirmationEmail(email, subscriberId, token, env) {
  const confirmUrl = `https://whentolook.com/confirm?token=${token}`;
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { margin: 0; padding: 0; background: #0B0F1A; font-family: Arial, sans-serif; color: #E8E6E1; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
  .header { font-size: 13px; color: #6B7280; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 32px; }
  h1 { font-family: Georgia, serif; font-size: 24px; font-weight: normal; margin: 0 0 16px; }
  p { color: #C9C7C2; line-height: 1.7; font-size: 15px; }
  .btn { display: inline-block; background: #D4A853; color: #0B0F1A; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 24px 0; }
</style></head>
<body><div class="container">
  <div class="header">When To Look</div>
  <h1>Confirm your subscription</h1>
  <p>You're one click away from getting notified before meteor showers, ISS passes, eclipses, auroras, and more.</p>
  <a href="${confirmUrl}" class="btn">Confirm my email →</a>
  <p style="font-size:13px;color:#4B5563;">If you didn't sign up, you can ignore this email.</p>
</div></body>
</html>`;

  await fetch('https://api.resend.com/emails', {
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
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
```

**Step 5: Create confirm.js**
```js
// confirm.js
export async function handleConfirm(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) return new Response('Missing token', { status: 400 });

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE confirm_token = ?'
  ).bind(token).first();

  if (!sub) return new Response('Invalid or expired token', { status: 404 });

  await env.DB.prepare(
    'UPDATE subscribers SET confirmed = 1, confirm_token = NULL WHERE id = ?'
  ).bind(sub.id).run();

  // Redirect to thank-you page
  return Response.redirect('https://whentolook.com/?confirmed=1', 302);
}
```

**Step 6: Create unsubscribe.js**
```js
// unsubscribe.js
export async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) return new Response('Missing token', { status: 400 });

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE unsubscribe_token = ?'
  ).bind(token).first();

  if (!sub) return new Response('Invalid token', { status: 404 });

  await env.DB.prepare(
    'UPDATE subscribers SET active = 0 WHERE id = ?'
  ).bind(sub.id).run();

  return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { background: #0B0F1A; color: #E8E6E1; font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .box { text-align: center; max-width: 400px; padding: 40px; }
  h1 { font-family: Georgia, serif; font-weight: normal; }
  p { color: #6B7280; }
</style></head>
<body><div class="box">
  <h1>You've been unsubscribed.</h1>
  <p>You won't receive any more notifications from When To Look.</p>
  <p><a href="https://whentolook.com" style="color:#D4A853;">Sign up again →</a></p>
</div></body></html>`, {
    headers: { 'Content-Type': 'text/html' },
  });
}
```

**Step 7: Create preferences.js**
```js
// preferences.js
export async function handlePreferences(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { token, preferences } = await request.json();
  if (!token || !preferences) return new Response('Missing token or preferences', { status: 400 });

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE unsubscribe_token = ?'
  ).bind(token).first();

  if (!sub) return new Response('Invalid token', { status: 404 });

  const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'];
  for (const type of allTypes) {
    await env.DB.prepare(`
      INSERT INTO preferences (subscriber_id, event_type, enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(subscriber_id, event_type) DO UPDATE SET enabled = excluded.enabled
    `).bind(sub.id, type, preferences[type] ? 1 : 0).run();
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 8: Create index.js — router**
```js
// index.js
import { handleSubscribe } from './subscribe.js';
import { handleConfirm } from './confirm.js';
import { handleUnsubscribe } from './unsubscribe.js';
import { handlePreferences } from './preferences.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/subscribe') {
      return handleSubscribe(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/confirm') {
      return handleConfirm(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/preferences') {
      return handlePreferences(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
```

**Step 9: Test the API locally**
```bash
cd workers/api
npx wrangler dev --local
```

In another terminal, test sign-up:
```bash
curl -X POST http://localhost:8787/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "email": "YOUR_EMAIL@gmail.com",
    "latitude": 48.4284,
    "longitude": -123.3656,
    "location_name": "Victoria, BC",
    "timezone": "America/Vancouver",
    "preferences": ["meteor", "aurora", "iss"]
  }'
```
Expected: `{"success":true,"message":"Check your email to confirm..."}`
Check your inbox for a confirmation email.

**Step 10: Commit**
```bash
git add workers/api/
git commit -m "feat: API worker with subscribe, confirm, unsubscribe, preferences"
```

---

### Task 5: Static Meteor Shower Data

**Files:**
- Create: `data/meteor-showers.json`

**Step 1: Create meteor-showers.json**
```json
[
  {
    "id": "quadrantids-2026",
    "name": "Quadrantids",
    "peak": "2026-01-03T16:00:00Z",
    "zhr": 120,
    "velocity_kms": 40,
    "radiant_constellation": "Boötes",
    "parent_object": "Asteroid 2003 EH1",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 6
  },
  {
    "id": "lyrids-2026",
    "name": "Lyrids",
    "peak": "2026-04-22T08:00:00Z",
    "zhr": 18,
    "velocity_kms": 49,
    "radiant_constellation": "Lyra",
    "parent_object": "Comet Thatcher",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 12
  },
  {
    "id": "eta-aquariids-2026",
    "name": "Eta Aquariids",
    "peak": "2026-05-06T00:00:00Z",
    "zhr": 50,
    "velocity_kms": 66,
    "radiant_constellation": "Aquarius",
    "parent_object": "Halley's Comet",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "southern",
    "peak_duration_hours": 24
  },
  {
    "id": "delta-aquariids-2026",
    "name": "Delta Aquariids",
    "peak": "2026-07-30T00:00:00Z",
    "zhr": 25,
    "velocity_kms": 41,
    "radiant_constellation": "Aquarius",
    "parent_object": "Comet 96P/Machholz",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "southern",
    "peak_duration_hours": 48
  },
  {
    "id": "perseids-2026",
    "name": "Perseids",
    "peak": "2026-08-12T20:00:00Z",
    "zhr": 100,
    "velocity_kms": 59,
    "radiant_constellation": "Perseus",
    "parent_object": "Comet Swift-Tuttle",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 24
  },
  {
    "id": "draconids-2026",
    "name": "Draconids",
    "peak": "2026-10-08T18:00:00Z",
    "zhr": 10,
    "velocity_kms": 20,
    "radiant_constellation": "Draco",
    "parent_object": "Comet 21P/Giacobini-Zinner",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 6
  },
  {
    "id": "orionids-2026",
    "name": "Orionids",
    "peak": "2026-10-21T20:00:00Z",
    "zhr": 20,
    "velocity_kms": 66,
    "radiant_constellation": "Orion",
    "parent_object": "Halley's Comet",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "both",
    "peak_duration_hours": 24
  },
  {
    "id": "leonids-2026",
    "name": "Leonids",
    "peak": "2026-11-17T20:00:00Z",
    "zhr": 15,
    "velocity_kms": 71,
    "radiant_constellation": "Leo",
    "parent_object": "Comet 55P/Tempel-Tuttle",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 12
  },
  {
    "id": "geminids-2026",
    "name": "Geminids",
    "peak": "2026-12-14T02:00:00Z",
    "zhr": 150,
    "velocity_kms": 35,
    "radiant_constellation": "Gemini",
    "parent_object": "Asteroid 3200 Phaethon",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 24
  },
  {
    "id": "ursids-2026",
    "name": "Ursids",
    "peak": "2026-12-22T12:00:00Z",
    "zhr": 10,
    "velocity_kms": 33,
    "radiant_constellation": "Ursa Minor",
    "parent_object": "Comet 8P/Tuttle",
    "particle_size": "grain-of-sand",
    "best_hemisphere": "northern",
    "peak_duration_hours": 12
  }
]
```

**Step 2: Commit**
```bash
git add data/meteor-showers.json
git commit -m "feat: meteor shower static data for 2026"
```

---

### Task 6: Event Computer Worker — Meteor Showers

**Files:**
- Create: `workers/event-computer/wrangler.toml`
- Create: `workers/event-computer/package.json`
- Create: `workers/event-computer/src/index.js`
- Create: `workers/event-computer/src/events/meteors.js`
- Create: `workers/event-computer/src/utils/time.js`

**Step 1: Create wrangler.toml** (replace DATABASE_ID)
```toml
name = "whentolook-event-computer"
main = "src/index.js"
compatibility_date = "2025-01-01"

[triggers]
crons = ["0 0 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "whentolook"
database_id = "DATABASE_ID_HERE"
```

**Step 2: Create package.json**
```json
{
  "name": "whentolook-event-computer",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "vitest": "^1.0.0"
  }
}
```

**Step 3: Create utils/time.js — timezone helpers**
```js
// time.js
// All helpers work in UTC. Local conversion only happens at the end.

/**
 * Given a UTC ISO string and an IANA timezone, return the local midnight (00:00) as UTC.
 * Used to determine "tonight" for a subscriber.
 */
export function localMidnightUTC(utcDateStr, timezone) {
  // Get the date in the subscriber's timezone
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utcDateStr));

  // localDate is "YYYY-MM-DD" — construct midnight UTC from it
  return new Date(`${localDate}T00:00:00`).toISOString();
}

/**
 * Given a UTC ISO timestamp and timezone, return a human-readable local time.
 * e.g. "10:45 PM"
 */
export function formatLocalTime(utcStr, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcStr));
}

/**
 * Given a UTC ISO timestamp and timezone, return the local date string.
 * e.g. "April 22"
 */
export function formatLocalDate(utcStr, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'long',
    day: 'numeric',
  }).format(new Date(utcStr));
}

/**
 * Returns true if the UTC peak time falls within "tonight" for this timezone.
 * "Tonight" = local date matching the current local date OR next local date.
 * We check 36 hours ahead.
 */
export function isPeakTonight(peakUtc, timezone, nowUtc) {
  const now = new Date(nowUtc);
  const peak = new Date(peakUtc);
  const diffHours = (peak - now) / (1000 * 60 * 60);
  return diffHours >= -12 && diffHours <= 36;
}
```

**Step 4: Create events/meteors.js**
```js
// meteors.js
import { isPeakTonight } from '../utils/time.js';
import METEOR_SHOWERS from '../../../data/meteor-showers.json' assert { type: 'json' };

/**
 * Returns events to queue for this subscriber, or empty array if none.
 */
export async function computeMeteorEvents(subscriber, now, db) {
  const events = [];

  for (const shower of METEOR_SHOWERS) {
    if (!isPeakTonight(shower.peak, subscriber.timezone, now)) continue;

    const eventId = shower.id;

    // Check if already sent
    const existing = await db.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'meteor' AND event_id = ?
    `).bind(subscriber.id, eventId).first();

    if (existing) continue;

    // Also check if already queued
    const queued = await db.prepare(`
      SELECT id FROM event_queue
      WHERE subscriber_id = ? AND event_type = 'meteor' AND event_id = ? AND status != 'skipped'
    `).bind(subscriber.id, eventId).first();

    if (queued) continue;

    // Notify at 30 minutes after local astronomical twilight (~9:30pm local as approximation)
    // For simplicity, notify at peak time minus 6 hours (evening notification)
    // TODO: compute actual astronomical twilight for precise timing
    const peakDate = new Date(shower.peak);
    const notifyAt = new Date(peakDate.getTime() - 6 * 60 * 60 * 1000).toISOString();

    events.push({
      event_type: 'meteor',
      event_id: eventId,
      event_data: JSON.stringify(shower),
      notify_at: notifyAt,
    });
  }

  return events;
}
```

**Step 5: Create index.js — event computer cron worker**
```js
// index.js
import { computeMeteorEvents } from './events/meteors.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(computeAllEvents(env));
  },

  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/trigger') {
      ctx.waitUntil(computeAllEvents(env));
      return new Response('Event computation triggered', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  },
};

async function computeAllEvents(env) {
  const now = new Date().toISOString();

  // Fetch all active, confirmed subscribers
  const { results: subscribers } = await env.DB.prepare(`
    SELECT s.id, s.email, s.latitude, s.longitude, s.timezone, s.unsubscribe_token,
           GROUP_CONCAT(p.event_type) as subscribed_types
    FROM subscribers s
    JOIN preferences p ON p.subscriber_id = s.id AND p.enabled = 1
    WHERE s.active = 1 AND s.confirmed = 1
    GROUP BY s.id
  `).all();

  for (const subscriber of subscribers) {
    const types = (subscriber.subscribed_types || '').split(',');
    await processSubscriber(subscriber, types, now, env);
  }
}

async function processSubscriber(subscriber, types, now, env) {
  const allEvents = [];

  if (types.includes('meteor')) {
    const meteorEvents = await computeMeteorEvents(subscriber, now, env.DB);
    allEvents.push(...meteorEvents);
  }

  // More event types will be added here in later phases

  // Insert all new events into queue
  for (const evt of allEvents) {
    await env.DB.prepare(`
      INSERT INTO event_queue (id, subscriber_id, event_type, event_id, event_data, notify_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      crypto.randomUUID(),
      subscriber.id,
      evt.event_type,
      evt.event_id,
      evt.event_data,
      evt.notify_at,
      now
    ).run();
  }
}
```

**Step 6: Test locally**
```bash
cd workers/event-computer
npx wrangler dev --local
```

In another terminal:
```bash
curl http://localhost:8787/trigger
```

Verify events were queued:
```bash
wrangler d1 execute whentolook --local --command="SELECT * FROM event_queue"
```
Expected: rows with `event_type='meteor'` and `status='pending'`

**Step 7: Commit**
```bash
git add workers/event-computer/
git commit -m "feat: event computer worker with meteor shower computation"
```

---

### Task 7: End-to-End Test — Lyrids Pipeline

**Goal:** Sign up with your own email, trigger computation, receive a real Lyrids notification email.

**Step 1: Temporarily set notify_at to now for testing**

After triggering the event computer, manually update a queued event's notify_at:
```bash
wrangler d1 execute whentolook --local --command="UPDATE event_queue SET notify_at = datetime('now') WHERE event_type = 'meteor' LIMIT 1"
```

**Step 2: Trigger the email dispatcher**
```bash
cd workers/email-dispatcher
npx wrangler dev --local
curl http://localhost:8787/trigger
```

Expected: email arrives in your inbox within 30 seconds.

**Step 3: Verify notification_log was written**
```bash
wrangler d1 execute whentolook --local --command="SELECT * FROM notification_log"
```
Expected: one row with `event_type='meteor'`

**Step 4: Verify deduplication — trigger again**
```bash
curl http://localhost:8787/trigger
```
Expected: no second email sent (already in notification_log)

**Step 5: Deploy both workers to production**
```bash
cd workers/event-computer && npx wrangler deploy
cd workers/api && npx wrangler deploy
cd workers/email-dispatcher && npx wrangler deploy
```

**Step 6: Set Resend API key on all workers**
```bash
cd workers/api && npx wrangler secret put RESEND_API_KEY
cd workers/event-computer && npx wrangler secret put RESEND_API_KEY
```

**Step 7: Commit**
```bash
git commit -m "chore: end-to-end pipeline verified, workers deployed"
```

---

## Phase 3: ISS Passes (After Obtaining N2YO API Key)

### Pre-requisite: Get N2YO API Key

1. Register at n2yo.com → click "API" in the nav → fill out the form
2. You'll receive an API key by email within a few hours
3. Store it:
```bash
cd workers/event-computer
npx wrangler secret put N2YO_API_KEY
```

### Task 8: ISS Event Computation

**Files:**
- Create: `workers/event-computer/src/events/iss.js`
- Modify: `workers/event-computer/src/index.js`
- Modify: `workers/email-dispatcher/src/notify.js` (add ISS template)

**Step 1: Create events/iss.js**
```js
// iss.js
const ISS_NORAD_ID = 25544;
const MIN_ELEVATION_DEFAULT = 30;

export async function computeIssEvents(subscriber, now, db, n2yoApiKey) {
  const minElevation = subscriber.min_elevation_iss || MIN_ELEVATION_DEFAULT;
  const alt = 0; // observer altitude in meters, simplified
  const days = 2;

  const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${ISS_NORAD_ID}/${subscriber.latitude}/${subscriber.longitude}/${alt}/${days}/${minElevation}/&apiKey=${n2yoApiKey}`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`N2YO error: ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error(`N2YO fetch failed for subscriber ${subscriber.id}:`, err.message);
    return []; // Skip this subscriber for this run
  }

  const passes = data.passes || [];
  const events = [];

  for (const pass of passes) {
    const startUtc = new Date(pass.startUTC * 1000).toISOString();
    const notifyAt = new Date(pass.startUTC * 1000 - 30 * 60 * 1000).toISOString();
    const eventId = `iss-${pass.startUTC}`;

    // Skip if notify_at is in the past
    if (new Date(notifyAt) <= new Date(now)) continue;

    // Deduplication check
    const existing = await db.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'iss' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (existing) continue;

    const queued = await db.prepare(`
      SELECT id FROM event_queue
      WHERE subscriber_id = ? AND event_type = 'iss' AND event_id = ? AND status != 'skipped'
    `).bind(subscriber.id, eventId).first();
    if (queued) continue;

    events.push({
      event_type: 'iss',
      event_id: eventId,
      notify_at: notifyAt,
      event_data: JSON.stringify({
        start_utc: startUtc,
        duration_seconds: pass.duration,
        max_elevation: pass.maxEl,
        start_az_compass: pass.startAzCompass,
        end_az_compass: pass.endAzCompass,
        timezone: subscriber.timezone,
      }),
    });
  }

  return events;
}
```

**Step 2: Add ISS computation to index.js**

In `workers/event-computer/src/index.js`, add inside `processSubscriber()`:
```js
if (types.includes('iss')) {
  const issEvents = await computeIssEvents(subscriber, now, env.DB, env.N2YO_API_KEY);
  allEvents.push(...issEvents);
}
```

And add the import at the top:
```js
import { computeIssEvents } from './events/iss.js';
```

**Step 3: Add ISS email template to notify.js**

In `workers/email-dispatcher/src/notify.js`, add to the `templates` object:
```js
iss: renderIss,
```

And add the renderer function:
```js
function renderIss(data) {
  const durationMins = Math.round(data.duration_seconds / 60);
  const brightness = data.max_elevation >= 60 ? 'very bright' : data.max_elevation >= 45 ? 'bright' : 'visible';

  return {
    subject: `🛰️ Space Station flies over in 30 minutes — look ${data.start_az_compass}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; padding:0; background:#0B0F1A; font-family:Arial,sans-serif; color:#E8E6E1; }
  .container { max-width:600px; margin:0 auto; padding:40px 24px; }
  .header { font-size:13px; color:#6B7280; letter-spacing:.1em; text-transform:uppercase; margin-bottom:32px; }
  h1 { font-family:Georgia,serif; font-size:28px; font-weight:normal; margin:0 0 8px; line-height:1.3; }
  .meta { color:#D4A853; font-size:14px; margin-bottom:32px; }
  .section { margin-bottom:24px; line-height:1.7; font-size:15px; color:#C9C7C2; }
  .section strong { color:#E8E6E1; }
  hr { border:none; border-top:1px solid #1E2535; margin:28px 0; }
  .footer { font-size:12px; color:#4B5563; line-height:1.6; }
  .footer a { color:#6B7280; }
</style></head>
<body><div class="container">
  <div class="header">When To Look</div>
  <h1>International Space Station</h1>
  <div class="meta">Visible in 30 minutes — ${brightness} pass</div>
  <div class="section"><strong>Where to look:</strong> Face ${data.start_az_compass} and watch for a bright, steady light moving smoothly toward the ${data.end_az_compass}. It doesn't blink — that's how you know it's not a plane.</div>
  <div class="section"><strong>How long:</strong> Visible for about ${durationMins} minute${durationMins !== 1 ? 's' : ''}. It will climb to ${data.max_elevation}° above the horizon at its highest point.</div>
  <div class="section"><strong>What you're seeing:</strong> A structure the size of a football field, orbiting 250 miles above your head at 17,500 mph. Right now, there are astronauts aboard.</div>
  <hr>
  <div class="footer">
    You're receiving this from <a href="https://whentolook.com">whentolook.com</a><br>
    <a href="https://whentolook.com/unsubscribe?token=${data.unsubscribe_token}">Unsubscribe</a> · <a href="https://whentolook.com/preferences?token=${data.unsubscribe_token}">Manage preferences</a>
  </div>
</div></body></html>`
  };
}
```

**Step 4: Test with a real N2YO call**
```bash
cd workers/event-computer
npx wrangler dev --local
curl http://localhost:8787/trigger
wrangler d1 execute whentolook --local --command="SELECT event_id, notify_at FROM event_queue WHERE event_type='iss'"
```
Expected: rows for upcoming ISS passes with `notify_at` 30 minutes before each pass.

**Step 5: Commit and deploy**
```bash
git add workers/event-computer/src/events/iss.js workers/event-computer/src/index.js workers/email-dispatcher/src/notify.js
git commit -m "feat: ISS pass computation and email template"
cd workers/event-computer && npx wrangler deploy
cd workers/email-dispatcher && npx wrangler deploy
```

---

## Phase 4: Static Data Events

### Task 9: Full Moons

**Files:**
- Create: `data/full-moons.json`
- Create: `workers/event-computer/src/events/fullmoons.js`
- Modify: `workers/event-computer/src/index.js`
- Modify: `workers/email-dispatcher/src/notify.js`

**Step 1: Create data/full-moons.json** (2026–2027 minimum)
```json
[
  { "id": "fullmoon-2026-01", "date": "2026-01-03T10:03:00Z", "name": "Wolf Moon", "supermoon": false, "name_origin": "Named by Algonquin peoples for the howling of wolves in deep winter" },
  { "id": "fullmoon-2026-02", "date": "2026-02-01T22:09:00Z", "name": "Snow Moon", "supermoon": false, "name_origin": "Named for the heavy snowfall typical in February in North America" },
  { "id": "fullmoon-2026-03", "date": "2026-03-03T11:38:00Z", "name": "Worm Moon", "supermoon": false, "name_origin": "Named for earthworms appearing as the ground thaws in spring" },
  { "id": "fullmoon-2026-04", "date": "2026-04-02T02:12:00Z", "name": "Pink Moon", "supermoon": false, "name_origin": "Named for wild ground phlox, one of the first spring flowers" },
  { "id": "fullmoon-2026-05", "date": "2026-05-01T17:23:00Z", "name": "Flower Moon", "supermoon": true, "name_origin": "Named for the abundance of flowers blooming in May" },
  { "id": "fullmoon-2026-06", "date": "2026-05-31T08:45:00Z", "name": "Strawberry Moon", "supermoon": true, "name_origin": "Named for the strawberry harvesting season beginning in June" },
  { "id": "fullmoon-2026-07", "date": "2026-06-30T00:57:00Z", "name": "Buck Moon", "supermoon": false, "name_origin": "Named for male deer (bucks) beginning to regrow antlers in July" },
  { "id": "fullmoon-2026-08", "date": "2026-07-29T17:36:00Z", "name": "Sturgeon Moon", "supermoon": false, "name_origin": "Named for the large sturgeon fish easily caught in the Great Lakes in August" },
  { "id": "fullmoon-2026-09", "date": "2026-08-28T10:54:00Z", "name": "Harvest Moon", "supermoon": false, "name_origin": "Named for the full moon closest to the autumnal equinox, when farmers harvest by moonlight" },
  { "id": "fullmoon-2026-10", "date": "2026-09-27T02:49:00Z", "name": "Hunter's Moon", "supermoon": false, "name_origin": "Named for the time to hunt game fattened through summer before winter" },
  { "id": "fullmoon-2026-11", "date": "2026-10-26T16:12:00Z", "name": "Beaver Moon", "supermoon": false, "name_origin": "Named for the time to set beaver traps before swamps froze" },
  { "id": "fullmoon-2026-12", "date": "2026-11-25T02:53:00Z", "name": "Cold Moon", "supermoon": false, "name_origin": "Named for the cold nights as winter sets in" }
]
```

**Step 2: Create events/fullmoons.js**
```js
// fullmoons.js
import { isPeakTonight } from '../utils/time.js';
import FULL_MOONS from '../../../data/full-moons.json' assert { type: 'json' };

export async function computeFullMoonEvents(subscriber, now, db) {
  const events = [];

  for (const moon of FULL_MOONS) {
    if (!isPeakTonight(moon.date, subscriber.timezone, now)) continue;

    const eventId = moon.id;

    const existing = await db.prepare(`
      SELECT id FROM notification_log WHERE subscriber_id = ? AND event_type = 'fullmoon' AND event_id = ?
    `).bind(subscriber.id, eventId).first();
    if (existing) continue;

    const queued = await db.prepare(`
      SELECT id FROM event_queue WHERE subscriber_id = ? AND event_type = 'fullmoon' AND event_id = ? AND status != 'skipped'
    `).bind(subscriber.id, eventId).first();
    if (queued) continue;

    // Notify at local sunset (~8pm local as approximation)
    const moonDate = new Date(moon.date);
    const notifyAt = new Date(moonDate.getTime() - 14 * 60 * 60 * 1000).toISOString();

    events.push({
      event_type: 'fullmoon',
      event_id: eventId,
      notify_at: notifyAt,
      event_data: JSON.stringify({ ...moon, timezone: subscriber.timezone }),
    });
  }

  return events;
}
```

**Step 3: Add to event-computer index.js and add email template to notify.js**

Pattern is identical to meteor showers — import the function, add the `if (types.includes('fullmoon'))` block, and add a `fullmoon` renderer to the templates map in notify.js.

The full moon email subject format: `🌕 Full ${data.name} Moon rises tonight`

**Step 4: Commit**
```bash
git add data/full-moons.json workers/event-computer/src/events/fullmoons.js
git commit -m "feat: full moon event computation and email template"
```

---

### Task 10: Eclipses & Asteroids

Follow the same pattern as full moons:

**Eclipses:**
- Create `data/eclipses.json` with lunar and solar eclipse data from NASA Eclipse website
- Create `workers/event-computer/src/events/eclipses.js`
- Add reminder notification 1 day before total/partial events (separate event_id: `lunar-eclipse-2026-03-03-reminder`)

**Asteroids:**
- Create `workers/event-computer/src/events/asteroids.js`
- Fetch from JPL CAD API (no key needed): `https://ssd-api.jpl.nasa.gov/cad.api?date-min=TODAY&date-max=TODAY+1&dist-max=20LD&sort=dist`
- Filter: diameter > 100m AND dist < 20LD, OR diameter > 500m AND dist < 50LD
- No location dependency — same notification for all subscribers

```bash
git commit -m "feat: eclipse and asteroid event computation"
```

---

## Phase 5: Aurora Monitor

### Task 11: Aurora Monitor Worker

**Files:**
- Create: `workers/aurora-monitor/wrangler.toml`
- Create: `workers/aurora-monitor/package.json`
- Create: `workers/aurora-monitor/src/index.js`
- Modify: `workers/email-dispatcher/src/notify.js` (add aurora template)

**Step 1: Create wrangler.toml** (replace DATABASE_ID)
```toml
name = "whentolook-aurora-monitor"
main = "src/index.js"
compatibility_date = "2025-01-01"

[triggers]
crons = ["*/15 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "whentolook"
database_id = "DATABASE_ID_HERE"
```

**Step 2: Set Resend secret**
```bash
cd workers/aurora-monitor
npx wrangler secret put RESEND_API_KEY
```

**Step 3: Create index.js**
```js
// index.js
import { notify } from '../../email-dispatcher/src/notify.js';

// Minimum Kp required to see aurora at given latitude
function minKpForLatitude(lat) {
  const absLat = Math.abs(lat);
  if (absLat >= 67) return 2;
  if (absLat >= 60) return 3;
  if (absLat >= 55) return 4;
  if (absLat >= 50) return 5;
  if (absLat >= 45) return 6;
  if (absLat >= 40) return 7;
  return 8;
}

async function fetchCurrentKp() {
  const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
  if (!res.ok) throw new Error(`NOAA fetch failed: ${res.status}`);
  const data = await res.json();
  // data is array of [time_tag, Kp, ...], most recent last
  const latest = data[data.length - 1];
  return parseFloat(latest[1]);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAurora(env));
  },

  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/trigger') {
      const testKp = parseFloat(new URL(request.url).searchParams.get('kp') || '0');
      ctx.waitUntil(checkAurora(env, testKp));
      return new Response(`Aurora check triggered (kp override: ${testKp})`, { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  },
};

async function checkAurora(env, kpOverride = null) {
  let currentKp;
  try {
    currentKp = kpOverride !== null ? kpOverride : await fetchCurrentKp();
  } catch (err) {
    console.error('Failed to fetch Kp:', err.message);
    return;
  }

  // No aurora possible below Kp 2
  if (currentKp < 2) return;

  console.log(`Current Kp: ${currentKp}`);

  const { results: subscribers } = await env.DB.prepare(`
    SELECT s.id, s.email, s.latitude, s.timezone, s.unsubscribe_token
    FROM subscribers s
    JOIN preferences p ON p.subscriber_id = s.id AND p.event_type = 'aurora' AND p.enabled = 1
    WHERE s.active = 1 AND s.confirmed = 1
  `).all();

  const suppressBefore = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  for (const sub of subscribers) {
    const minKp = minKpForLatitude(sub.latitude);
    if (currentKp < minKp) continue;

    // Check 12-hour suppression
    const recentAlert = await env.DB.prepare(`
      SELECT id FROM notification_log
      WHERE subscriber_id = ? AND event_type = 'aurora' AND sent_at > ?
    `).bind(sub.id, suppressBefore).first();
    if (recentAlert) continue;

    // Send directly (bypass event_queue for real-time delivery)
    try {
      const emailId = await notify(
        { email: sub.email },
        {
          event_type: 'aurora',
          event_data: JSON.stringify({
            kp: currentKp,
            unsubscribe_token: sub.unsubscribe_token,
          }),
        },
        env.RESEND_API_KEY
      );

      await env.DB.prepare(`
        INSERT INTO notification_log (id, subscriber_id, event_type, event_id, sent_at, email_id)
        VALUES (?, ?, 'aurora', ?, ?, ?)
      `).bind(
        crypto.randomUUID(), sub.id,
        `aurora-kp${Math.floor(currentKp)}-${new Date().toISOString().slice(0,10)}`,
        new Date().toISOString(), emailId
      ).run();

      console.log(`Aurora alert sent to ${sub.email} (Kp ${currentKp})`);
    } catch (err) {
      console.error(`Failed to send aurora alert to ${sub.email}:`, err.message);
    }
  }
}
```

**Step 4: Add aurora template to notify.js**

Add `aurora: renderAurora` to the templates map, and:
```js
function renderAurora(data) {
  const kp = data.kp;
  const stormLevel = kp >= 9 ? 'G5 Extreme' : kp >= 8 ? 'G4 Severe' : kp >= 7 ? 'G3 Strong' : kp >= 6 ? 'G2 Moderate' : 'G1 Minor';
  return {
    subject: `🌌 Northern Lights alert — aurora may be visible RIGHT NOW`,
    html: `<!-- dark-theme aurora email using same structure as other templates -->
    <!-- Key content: current Kp, look north, phone camera tip, storm description -->`
    // Full HTML follows same pattern as meteor template above
  };
}
```

**Step 5: Test with Kp override**
```bash
cd workers/aurora-monitor
npx wrangler dev --local
# Force Kp=7 to trigger for mid-latitude subscribers:
curl "http://localhost:8787/trigger?kp=7"
```

**Step 6: Commit and deploy**
```bash
git add workers/aurora-monitor/
git commit -m "feat: aurora monitor worker with 15-min Kp polling"
cd workers/aurora-monitor && npx wrangler deploy
```

---

## Phase 6: Starlink

### Task 12: Starlink Pass Computation

Follow the ISS pattern in `workers/event-computer/src/events/starlink.js`.

Key differences from ISS:
- Fetch active Starlink launch groups from CelesTrak: `https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle`
- Extract NORAD IDs for satellites launched within 14 days (train formation)
- Call N2YO visual passes endpoint for each active NORAD ID
- If no Starlink launch in last 14 days, skip entirely
- Min elevation: 25° (lower than ISS threshold)

```bash
git commit -m "feat: Starlink train pass computation"
```

---

## Phase 7: Frontend

### Task 13: Homepage + Sign-up Form

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/styles.css`
- Create: `frontend/app.js`
- Create: `frontend/wrangler.toml` (Pages config)

**Design spec:** Deep indigo/navy (`#0B0F1A`), white text (`#E8E6E1`), warm gold accent (`#D4A853`). Instrument Serif headings, DM Sans body. Subtle CSS star-field animation (pure CSS, no canvas). Mobile-first. Four sections: Hero → How it works → Example notification (Perseids mockup) → Footer.

**Sign-up form flow:**
1. "Detect my location" button → `navigator.geolocation.getCurrentPosition()` → populate lat/lon/timezone
2. Manual fallback: city name input → geocode via browser (or a free geocoding API)
3. Preference checkboxes — all checked by default
4. Email input + "Notify me" button
5. Submit → POST to `https://api.whentolook.com/subscribe`
6. On success: show "Check your email!" message

**Step 1: Set up Cloudflare Pages**

In Cloudflare Dashboard:
1. Pages → Create project → Connect to Git → select your repo
2. Build settings: Build command: (none), Output directory: `frontend`
3. Deploy → your site is live at `*.pages.dev`
4. Add custom domain: `whentolook.com`

**Step 2: Set up DNS for API worker**

In Cloudflare Dashboard → Workers & Pages → your API worker → Triggers → Custom Domains → Add `api.whentolook.com`

**Step 3: Verify Resend sending domain**

In Resend Dashboard → Domains → Add `whentolook.com`:
1. Copy the DNS records Resend gives you (DKIM, SPF, DMARC)
2. Add them in Cloudflare DNS for `whentolook.com`
3. Click "Verify" in Resend

**Step 4: Build and deploy the frontend**

Build the HTML/CSS/JS, push to GitHub, Cloudflare Pages auto-deploys.

**Step 5: Final end-to-end test (production)**
1. Sign up at whentolook.com with your own email
2. Confirm via the email link
3. Verify your subscriber row in D1: `wrangler d1 execute whentolook --command="SELECT * FROM subscribers WHERE email='YOUR_EMAIL'"`
4. Trigger event computer: `curl https://whentolook-event-computer.YOUR_SUBDOMAIN.workers.dev/trigger`
5. Verify event_queue has entries
6. Wait for next dispatcher run (or trigger manually)
7. Receive notification ✅

**Step 6: Commit and launch**
```bash
git add frontend/
git commit -m "feat: frontend homepage, sign-up form, and confirmation pages"
git push
```

---

## Deployment Checklist

Before launch, verify:
- [ ] Resend domain verified (`whentolook.com`)
- [ ] `RESEND_API_KEY` secret set on: api, event-computer, aurora-monitor, email-dispatcher workers
- [ ] `N2YO_API_KEY` secret set on: event-computer worker
- [ ] D1 schema applied to production database
- [ ] All 4 workers deployed and cron triggers active (verify in Cloudflare Dashboard → Workers → your worker → Triggers)
- [ ] `api.whentolook.com` custom domain pointing to API worker
- [ ] `whentolook.com` pointing to Cloudflare Pages
- [ ] End-to-end test passed in production (not just local)
- [ ] Unsubscribe flow tested
- [ ] Confirmation email tested
