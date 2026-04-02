# Weather Suppression + Asteroid Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add opt-in weather-based notification suppression (skip if cloud cover ≥ 80%) and remove the asteroid close approach category entirely.

**Architecture:** New `suppress_if_cloudy` boolean column on `subscribers`. At send time, email-dispatcher and aurora-monitor call Open-Meteo for the subscriber's lat/lon and skip the notification if cloud cover ≥ 80%. Asteroid is removed from all layers: frontend, API, event-computer, and email templates.

**Tech Stack:** Cloudflare Workers (email-dispatcher, aurora-monitor, api, event-computer), D1 SQLite, Open-Meteo free API (no key), vanilla JS frontend

---

## Task 1: D1 Schema Migration

**Files:**
- No file to create — run SQL directly against D1

**Step 1: Run the migration**

```bash
cd "C:/Claude/When To Look"
npx wrangler d1 execute whentolook --remote --command "ALTER TABLE subscribers ADD COLUMN suppress_if_cloudy INTEGER DEFAULT 0"
```

Expected output: `✅ Successfully executed SQL`

**Step 2: Verify the column exists**

```bash
npx wrangler d1 execute whentolook --remote --command "SELECT suppress_if_cloudy FROM subscribers LIMIT 1"
```

Expected: returns a row with `suppress_if_cloudy: 0`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add suppress_if_cloudy column to subscribers"
```

---

## Task 2: Create Weather Helper (both workers)

Workers can't share source files, so create the same helper in both. It calls Open-Meteo and returns cloud cover (0–100) for a given lat/lon at a given UTC hour. Returns `null` on any error — callers must fail open (send the notification) on null.

**Files:**
- Create: `workers/email-dispatcher/src/weather.js`
- Create: `workers/aurora-monitor/src/weather.js`

**Step 1: Create `workers/email-dispatcher/src/weather.js`**

```js
// weather.js
// Returns cloud cover percentage (0-100) for the given lat/lon at the UTC hour
// matching utcIso (e.g. "2026-04-01T09:30:00Z" → checks the 09:00 hour).
// Returns null on any error — callers MUST fail open (send anyway) on null.
export async function getCloudCover(lat, lon, utcIso) {
  // Open-Meteo returns hourly times as "2026-04-01T09" (no minutes/seconds)
  const targetHour = utcIso.slice(0, 13); // "2026-04-01T09"
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover&forecast_days=2&timezone=UTC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const times = data.hourly?.time;
    const covers = data.hourly?.cloud_cover;
    if (!times || !covers) return null;
    const idx = times.indexOf(targetHour);
    if (idx === -1) return null;
    return covers[idx]; // 0-100
  } catch {
    return null;
  }
}
```

**Step 2: Copy identical content to `workers/aurora-monitor/src/weather.js`**

Exact same file. Workers are deployed independently and cannot share source.

**Step 3: Commit**

```bash
git add workers/email-dispatcher/src/weather.js workers/aurora-monitor/src/weather.js
git commit -m "feat: add Open-Meteo cloud cover helper to both workers"
```

---

## Task 3: Update API Worker — suppress_if_cloudy + remove asteroid

**Files:**
- Modify: `workers/api/src/subscribe.js`
- Modify: `workers/api/src/preferences.js`

### subscribe.js changes

**Step 1: Update `workers/api/src/subscribe.js`**

Three changes:
1. Destructure `suppress_if_cloudy` from request body
2. Include it in the INSERT / ON CONFLICT UPDATE
3. Remove `'asteroid'` from `allTypes`

Find and replace the destructuring line:
```js
// BEFORE
const { email, latitude, longitude, location_name, timezone, preferences } = body;

// AFTER
const { email, latitude, longitude, location_name, timezone, preferences, suppress_if_cloudy } = body;
```

Replace the INSERT statement (the whole `INSERT INTO subscribers` block):
```js
await env.DB.prepare(`
  INSERT INTO subscribers (id, email, latitude, longitude, location_name, timezone, created_at, confirm_token, unsubscribe_token, suppress_if_cloudy)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location_name = excluded.location_name,
    timezone = excluded.timezone,
    confirm_token = excluded.confirm_token,
    suppress_if_cloudy = excluded.suppress_if_cloudy,
    active = 1
`).bind(
  crypto.randomUUID(), email, latitude, longitude,
  location_name || null, timezone, now, confirmToken, unsubscribeToken,
  suppress_if_cloudy ? 1 : 0
).run();
```

Replace `allTypes`:
```js
// BEFORE
const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'];

// AFTER
const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora'];
```

### preferences.js changes

**Step 2: Update `workers/api/src/preferences.js`**

In `handleGetPreferences`: add `suppress_if_cloudy` to the response.

Replace the subscriber lookup + return:
```js
// BEFORE
const sub = await env.DB.prepare(
  'SELECT id FROM subscribers WHERE unsubscribe_token = ?'
).bind(token).first();
if (!sub) return json({ error: 'Invalid token' }, 404);
// ...
return json({ preferences: prefs });

// AFTER
const sub = await env.DB.prepare(
  'SELECT id, suppress_if_cloudy FROM subscribers WHERE unsubscribe_token = ?'
).bind(token).first();
if (!sub) return json({ error: 'Invalid token' }, 404);
// ...
return json({ preferences: prefs, suppress_if_cloudy: sub.suppress_if_cloudy === 1 });
```

In `handleUpdatePreferences`: accept and save `suppress_if_cloudy`.

Replace the destructure + subscriber lookup block:
```js
// BEFORE
const { token, preferences } = body;
if (!token || !preferences) return json({ error: 'Missing token or preferences' }, 400);

// AFTER
const { token, preferences, suppress_if_cloudy } = body;
if (!token || !preferences) return json({ error: 'Missing token or preferences' }, 400);
```

After updating preferences rows, add the suppress_if_cloudy update before the final `return json({ success: true })`:
```js
// Update suppress_if_cloudy on the subscriber row
await env.DB.prepare(
  'UPDATE subscribers SET suppress_if_cloudy = ? WHERE id = ?'
).bind(suppress_if_cloudy ? 1 : 0, sub.id).run();
```

Replace `allTypes` in preferences.js:
```js
// BEFORE
const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'];

// AFTER
const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora'];
```

**Step 3: Deploy the API worker**

```bash
cd "C:/Claude/When To Look/workers/api"
npx wrangler deploy
```

**Step 4: Smoke-test the preferences endpoint**

```bash
curl "https://api.whentolook.com/preferences?token=test-unsub-token-001"
```

Expected: response includes `"suppress_if_cloudy": false` (or true depending on current DB value)

**Step 5: Commit**

```bash
cd "C:/Claude/When To Look"
git add workers/api/src/subscribe.js workers/api/src/preferences.js
git commit -m "feat: add suppress_if_cloudy to subscribe + preferences API, remove asteroid type"
```

---

## Task 4: Update Email Dispatcher — Weather Check + Remove Asteroid

**Files:**
- Modify: `workers/email-dispatcher/src/index.js`
- Modify: `workers/email-dispatcher/src/notify.js`

### index.js changes

**Step 1: Add weather import at top of `workers/email-dispatcher/src/index.js`**

```js
// ADD after existing imports
import { getCloudCover } from './weather.js';
```

**Step 2: Update the `dispatch` SQL query to include weather fields**

```js
// BEFORE
const { results } = await env.DB.prepare(`
  SELECT eq.*, s.email, s.timezone, s.unsubscribe_token
  FROM event_queue eq
  JOIN subscribers s ON s.id = eq.subscriber_id
  WHERE eq.status = 'pending' AND eq.notify_at <= ?
  LIMIT 50
`).bind(now).all();

// AFTER
const { results } = await env.DB.prepare(`
  SELECT eq.*, s.email, s.timezone, s.unsubscribe_token,
         s.suppress_if_cloudy, s.latitude, s.longitude
  FROM event_queue eq
  JOIN subscribers s ON s.id = eq.subscriber_id
  WHERE eq.status = 'pending' AND eq.notify_at <= ?
  LIMIT 50
`).bind(now).all();
```

**Step 3: Add weather check at the top of `processEvent`**

Insert this block as the first thing inside `processEvent`, before the `eventData` line:

```js
// Weather suppression: skip if subscriber opted in and cloud cover >= 80%
if (event.suppress_if_cloudy) {
  const cover = await getCloudCover(event.latitude, event.longitude, event.notify_at);
  if (cover !== null && cover >= 80) {
    await env.DB.prepare(
      `UPDATE event_queue SET status = 'skipped' WHERE id = ?`
    ).bind(event.id).run();
    console.log(`[dispatcher] Skipped ${event.id} (${event.event_type}) — cloud cover ${cover}%`);
    return;
  }
}
```

### notify.js changes

**Step 4: Remove asteroid from `workers/email-dispatcher/src/notify.js`**

In the `templates` object inside `renderTemplate`, remove the `asteroid: renderAsteroid` entry:

```js
// BEFORE
const templates = {
  meteor: renderMeteor,
  iss: renderIss,
  fullmoon: renderFullMoon,
  lunar_eclipse: renderLunarEclipse,
  solar_eclipse: renderSolarEclipse,
  asteroid: renderAsteroid,
  starlink: renderStarlink,
};

// AFTER
const templates = {
  meteor: renderMeteor,
  iss: renderIss,
  fullmoon: renderFullMoon,
  lunar_eclipse: renderLunarEclipse,
  solar_eclipse: renderSolarEclipse,
  starlink: renderStarlink,
};
```

Also delete the entire `renderAsteroid` function (search for `function renderAsteroid` and remove it through its closing `}`).

**Step 5: Remove asteroid from test fixtures in `index.js`**

Remove the `asteroid` key from the `fixtures` object in the `/test-email` handler.

Also remove it from the error message: change `Object.keys(fixtures).join(', ')` — this auto-updates.

**Step 6: Deploy the email dispatcher**

```bash
cd "C:/Claude/When To Look/workers/email-dispatcher"
npx wrangler deploy
```

**Step 7: Smoke-test**

```bash
curl "https://whentolook-email-dispatcher.link7373.workers.dev/test-email?to=link7373@gmail.com&type=iss"
```

Expected: `✅ iss email sent: <messageId>`

```bash
curl "https://whentolook-email-dispatcher.link7373.workers.dev/test-email?to=link7373@gmail.com&type=asteroid"
```

Expected: `Unknown type. Options: meteor, iss, fullmoon, ...` (asteroid not listed)

**Step 8: Commit**

```bash
cd "C:/Claude/When To Look"
git add workers/email-dispatcher/src/index.js workers/email-dispatcher/src/notify.js
git commit -m "feat: weather suppression in email dispatcher, remove asteroid template"
```

---

## Task 5: Update Aurora Monitor — Weather Check

**Files:**
- Modify: `workers/aurora-monitor/src/index.js`

**Step 1: Add weather import at top of `workers/aurora-monitor/src/index.js`**

```js
// ADD after existing import
import { getCloudCover } from './weather.js';
```

**Step 2: Update the subscriber query to include `suppress_if_cloudy`**

```js
// BEFORE
SELECT s.id, s.email, s.latitude, s.timezone, s.unsubscribe_token

// AFTER
SELECT s.id, s.email, s.latitude, s.longitude, s.timezone, s.unsubscribe_token, s.suppress_if_cloudy
```

Note: `s.longitude` was also missing — add it too (needed for weather lookup).

**Step 3: Add weather check in the per-subscriber loop, after the 12-hour suppression check**

Find the block after `if (recentAlert)` and before the `sendAuroraEmail` call. Insert:

```js
// Weather suppression: skip if subscriber opted in and it's cloudy right now
if (sub.suppress_if_cloudy) {
  const cover = await getCloudCover(sub.latitude, sub.longitude, new Date().toISOString());
  if (cover !== null && cover >= 80) {
    console.log(`[aurora] Skipped for ${sub.email} — cloud cover ${cover}%`);
    continue;
  }
}
```

**Step 4: Deploy the aurora monitor**

```bash
cd "C:/Claude/When To Look/workers/aurora-monitor"
npx wrangler deploy
```

**Step 5: Commit**

```bash
cd "C:/Claude/When To Look"
git add workers/aurora-monitor/src/index.js
git commit -m "feat: weather suppression in aurora monitor"
```

---

## Task 6: Update Frontend — Weather Checkbox + Remove Asteroid

**Files:**
- Modify: `frontend/setup.html`
- Modify: `frontend/preferences.html`

### setup.html

**Step 1: Remove the asteroid checkbox from `frontend/setup.html`**

Delete the entire `<label class="checkbox-item">` block whose input has `value="asteroid"`.

**Step 2: Add weather checkbox after the `.checkbox-grid` div, before the `form-error` div**

```html
<!-- Weather suppression option -->
<span class="form-label-heading" style="margin-top:20px;">Notification options</span>
<label class="checkbox-item" style="max-width:100%;">
  <input type="checkbox" id="suppress-if-cloudy" name="suppress_if_cloudy">
  <div class="checkbox-label">
    <strong>☁️ Skip alerts if the sky is overcast</strong>
    <span>We'll check the weather forecast before sending — if cloud cover is over 80%, we'll hold the notification</span>
  </div>
</label>
```

**Step 3: Include `suppress_if_cloudy` in the fetch body**

In the form submit handler, find the `JSON.stringify({...})` call and add the field:

```js
// BEFORE
body: JSON.stringify({
  email: email,
  latitude: parseFloat(lat),
  longitude: parseFloat(lng),
  timezone: tz,
  location_name: locName,
  preferences: prefs,
}),

// AFTER
body: JSON.stringify({
  email: email,
  latitude: parseFloat(lat),
  longitude: parseFloat(lng),
  timezone: tz,
  location_name: locName,
  preferences: prefs,
  suppress_if_cloudy: document.getElementById('suppress-if-cloudy').checked,
}),
```

### preferences.html

**Step 4: Remove the asteroid checkbox from `frontend/preferences.html`**

Delete the entire `<label class="checkbox-item">` block whose input has `value="asteroid"`.

Also remove `'asteroid'` from the `EVENT_TYPES` array at the top of the script.

**Step 5: Add weather checkbox to `frontend/preferences.html`**

After the `.checkbox-grid` div, before the `form-error` div, add:

```html
<!-- Weather suppression option -->
<span class="form-label-heading" style="margin-top:20px;">Notification options</span>
<label class="checkbox-item" style="max-width:100%;">
  <input type="checkbox" id="suppress-if-cloudy" name="suppress_if_cloudy">
  <div class="checkbox-label">
    <strong>☁️ Skip alerts if the sky is overcast</strong>
    <span>We'll check the weather forecast before sending — if cloud cover is over 80%, we'll hold the notification</span>
  </div>
</label>
```

**Step 6: Load `suppress_if_cloudy` in `loadPreferences`**

After populating the event type checkboxes, add:

```js
// Load weather suppression preference
var weatherCb = document.getElementById('suppress-if-cloudy');
if (weatherCb) weatherCb.checked = data.suppress_if_cloudy === true;
```

**Step 7: Save `suppress_if_cloudy` in the form submit handler**

In the `JSON.stringify({...})` in the submit handler:

```js
// BEFORE
body: JSON.stringify({ token: token, preferences: prefs }),

// AFTER
body: JSON.stringify({
  token: token,
  preferences: prefs,
  suppress_if_cloudy: document.getElementById('suppress-if-cloudy').checked,
}),
```

**Step 8: Deploy frontend**

```bash
cd "C:/Claude/When To Look/frontend"
npx wrangler pages deploy . --project-name whentolook --commit-dirty=true
```

**Step 9: Verify**

Open https://whentolook.com/setup in browser (or via curl). Confirm asteroid checkbox is gone and weather checkbox appears unchecked.

Open https://whentolook.com/preferences?token=test-unsub-token-001. Confirm same.

**Step 10: Commit**

```bash
cd "C:/Claude/When To Look"
git add frontend/setup.html frontend/preferences.html
git commit -m "feat: add weather suppression checkbox, remove asteroid from frontend"
```

---

## Task 7: Remove Asteroid from Event Computer

**Files:**
- Modify: `workers/event-computer/src/index.js`
- Delete: `workers/event-computer/src/events/asteroids.js`

**Step 1: Remove asteroid import and call from `workers/event-computer/src/index.js`**

Remove this import line:
```js
import { computeAsteroidEvents } from './events/asteroids.js';
```

Remove this block from `processSubscriber`:
```js
if (types.includes('asteroid')) {
  const asteroidEvents = await computeAsteroidEvents(subscriber, now, env.DB);
  allEvents.push(...asteroidEvents);
}
```

**Step 2: Delete `workers/event-computer/src/events/asteroids.js`**

```bash
rm "C:/Claude/When To Look/workers/event-computer/src/events/asteroids.js"
```

**Step 3: Deploy the event computer**

```bash
cd "C:/Claude/When To Look/workers/event-computer"
npx wrangler deploy
```

**Step 4: Commit**

```bash
cd "C:/Claude/When To Look"
git add workers/event-computer/src/index.js
git rm workers/event-computer/src/events/asteroids.js
git commit -m "feat: remove asteroid event type from event computer"
```

---

## Verification Checklist

After all tasks complete, verify end-to-end:

1. **Schema**: `npx wrangler d1 execute whentolook --remote --command "SELECT suppress_if_cloudy FROM subscribers LIMIT 3"` — should return rows with `0`

2. **Preferences API**: `curl "https://api.whentolook.com/preferences?token=test-unsub-token-001"` — response includes `"suppress_if_cloudy": false`, no asteroid key

3. **Frontend setup**: Visit https://whentolook.com/setup — no asteroid checkbox, weather checkbox present and unchecked

4. **Frontend preferences**: Visit https://whentolook.com/preferences?token=test-unsub-token-001 — same

5. **Weather helper**: Manually set `suppress_if_cloudy = 1` on the test subscriber:
   ```bash
   npx wrangler d1 execute whentolook --remote --command "UPDATE subscribers SET suppress_if_cloudy = 1 WHERE email = 'link7373@gmail.com'"
   ```
   Then trigger a dispatch and verify events are skipped when it's cloudy (or verify logic by checking logs)

6. **Email templates**: `curl ".../test-email?to=link7373@gmail.com&type=asteroid"` — should return error (type not found)

7. **Restore test subscriber**: Reset suppress_if_cloudy back to 0 after testing:
   ```bash
   npx wrangler d1 execute whentolook --remote --command "UPDATE subscribers SET suppress_if_cloudy = 0 WHERE email = 'link7373@gmail.com'"
   ```
