# Weather Suppression Design
**Date:** 2026-04-01
**Feature:** Skip notifications when sky is overcast + remove asteroid category

---

## Overview

Add an opt-in subscriber preference to suppress sky event notifications when cloud cover at their location is forecast to be ≥ 80%. Check is made at send time using the free Open-Meteo API (no key required). Also remove the asteroid close approach category, which is not visible with the naked eye.

---

## Design Decisions

- **Off by default** — existing subscribers unaffected; new subscribers must opt in
- **Global setting, not per-event** — if you want clear skies, you want it for all events
- **Check at send time** — email-dispatcher and aurora-monitor check weather immediately before sending, not at queue time; a forecast 5 minutes before send is far more accurate than one 24 hours ahead
- **Threshold: ≥ 80% cloud cover** — suppress if cloud_cover (hourly) for the event hour is ≥ 80
- **Skipped, not deleted** — queued events are marked `status='skipped'` so the notification log remains accurate

---

## Data Source

**Open-Meteo** — free, no API key, GDPR-compliant
Endpoint: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=cloud_cover&forecast_days=2&timezone=UTC`
Returns hourly `cloud_cover` (0–100) in UTC. Match event `notify_at` hour to array index.

---

## Changes

### 1. D1 Schema

```sql
ALTER TABLE subscribers ADD COLUMN suppress_if_cloudy INTEGER DEFAULT 0;
```

### 2. API Worker (`workers/api/`)

- `POST /subscribe` — accept `suppress_if_cloudy` boolean in request body; store to DB
- `GET /preferences?token=` — include `suppress_if_cloudy` in response
- `POST /preferences` — accept and update `suppress_if_cloudy`

### 3. Frontend

**`setup.html`:**
- Add opt-in checkbox (unchecked by default) below the event type grid:
  `☁️ Skip alerts if the sky is likely overcast (uses weather forecast)`
- Remove asteroid checkbox

**`preferences.html`:**
- Same checkbox addition + asteroid removal
- Load/save `suppress_if_cloudy` via GET/POST preferences API

### 4. Email Dispatcher (`workers/email-dispatcher/src/index.js`)

When processing a pending queued event:
1. Load subscriber row (need `suppress_if_cloudy`, `latitude`, `longitude`)
2. If `suppress_if_cloudy = 1`:
   - Determine event hour from `event_queue.notify_at`
   - Call Open-Meteo, find cloud_cover for that hour
   - If ≥ 80: `UPDATE event_queue SET status='skipped'` — do not send
3. Otherwise proceed to send as normal

Extract weather check into a shared helper `getCloudCover(lat, lon, utcIsoHour)` returning 0–100 or `null` on error. On Open-Meteo failure, send anyway (fail open — don't suppress due to API error).

### 5. Aurora Monitor (`workers/aurora-monitor/src/index.js`)

Before calling `sendAuroraEmail`:
1. If `subscriber.suppress_if_cloudy = 1`, call `getCloudCover` for current UTC hour
2. If ≥ 80: log skipped, continue to next subscriber
3. Fail open on API error

Copy the `getCloudCover` helper into `workers/aurora-monitor/src/weather.js` (same as email-dispatcher — workers can't share source files).

### 6. Email Dispatcher — Remove Asteroid

- Remove `renderAsteroid` from `notify.js`
- Remove `asteroid` from the `/test-email` fixture list in `index.js`

### 7. Event Computer (`workers/event-computer/src/`)

- Remove `workers/event-computer/src/events/asteroids.js`
- Remove asteroid import and call from `workers/event-computer/src/index.js`

---

## Error Handling

- **Open-Meteo timeout / non-200**: fail open — send the notification anyway
- **Hour not found in forecast**: fail open
- **DB missing column** (before migration runs): treat as `suppress_if_cloudy = 0`

---

## What Is Not Changing

- The 80% threshold is hardcoded — no per-user threshold setting
- No "you would have received this but it was cloudy" digest email
- No caching of weather results (one Open-Meteo call per event per dispatcher run — well within free tier at current scale)
- No weather check in the event-computer (queue time check rejected in favor of send time)
