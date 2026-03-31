# When To Look — Build Design
*Date: 2026-03-30*

## Context

Night sky event notification service. Users sign up with location + preferences, receive email notifications before visible sky events. The notification is the product.

Domain `whentolook.com` is registered in Cloudflare. Resend account exists (domain verification pending). N2YO API key not yet obtained. No SMS for MVP — notification dispatch layer designed to be channel-agnostic for easy SMS addition later.

---

## Approach

**Option A selected: Vertical slice first.**

Pick one event type with no external API dependency (meteor showers) and build the entire stack end-to-end. Every subsequent event type drops into proven infrastructure. Target: **Lyrids meteor shower April 21–22** as first live notification.

---

## Architecture

One GitHub repo, four Cloudflare Workers, one D1 database.

```
whentolook/
  workers/
    api/              ← POST /subscribe, GET /confirm, GET /unsubscribe, POST /preferences
    event-computer/   ← Daily cron (00:00 UTC), populates event_queue
    aurora-monitor/   ← Every 15 min cron, real-time Kp check + direct send
    email-dispatcher/ ← Every 5 min cron, drains event_queue
  frontend/           ← Static HTML/CSS/JS → Cloudflare Pages
  data/
    meteor-showers.json
    full-moons.json
    eclipses.json
  schema.sql
```

Each Worker has its own `wrangler.toml` and shares the same D1 database binding. Secrets (`RESEND_API_KEY`, `N2YO_API_KEY`) stored via `wrangler secret put`.

---

## Build Phases

| Phase | What | Notes |
|-------|------|-------|
| 1 | Repo + D1 schema + email dispatcher | Prove emails send before any event logic |
| 2 | API worker + meteor showers | Full pipeline end-to-end, Lyrids target |
| 3 | ISS passes | After N2YO API key obtained |
| 4 | Full moons, eclipses, asteroids | Static data, low complexity |
| 5 | Aurora monitor | Real-time path, separate architecture |
| 6 | Starlink | Bursty/optional |
| 7 | Frontend | Homepage + sign-up flow, ship with backend |

---

## Data Flow

### Sign-up → Confirmation
```
Browser geolocation API → lat/lon + timezone (browser Intl API, no external geocoding)
  → POST /subscribe → create subscriber (confirmed=0) + preferences in D1
  → Resend sends confirmation email → user clicks link
  → GET /confirm?token= → confirmed=1 → subscriber active
```

### Daily Event Computation
```
Cron 00:00 UTC → event-computer worker
  → fetch all active + confirmed subscribers
  → for each subscribed event type:
      compute events in next 36 hours
      check notification_log (skip if already sent)
      write to event_queue with notify_at timestamp
```

### Email Dispatch
```
Cron every 5 min → email-dispatcher worker
  → SELECT * FROM event_queue WHERE status='pending' AND notify_at <= now() LIMIT 50
  → for each: render template → notify(subscriber, event) → Resend API
  → update status='sent', write notification_log
  → on failure: retry up to 3x, then mark 'skipped'
```

### Aurora (bypasses queue)
```
Cron every 15 min → aurora-monitor worker
  → fetch current Kp from NOAA SWPC
  → if Kp >= 5: check each aurora-subscribed subscriber's latitude threshold
  → check notification_log: skip if aurora alert sent within last 12 hours
  → send directly via Resend, log to notification_log
```

---

## Location → Visibility Logic

| Event | What location determines |
|-------|--------------------------|
| ISS / Starlink | lat/lon → N2YO API call, filter by elevation + dark hours |
| Aurora | latitude only → minimum Kp threshold lookup |
| Meteor showers / Full moons | timezone only → "tonight" in local time |
| Eclipses | lat/lon → visibility + local contact times |
| Asteroids | none — same notification for all subscribers |

All times stored as UTC in D1. Converted to local time only at email render time.

---

## Notification Dispatch — Channel-Agnostic Design

The email-dispatcher calls `notify(subscriber, event)` which resolves to Resend now. Adding SMS later means implementing the SMS branch in `notify()` and storing phone numbers — no structural changes required.

---

## Error Handling

- **N2YO failure:** Skip ISS/Starlink for that cron run, log, retry next day. Don't fail entire job.
- **Resend failure:** Retry up to 3x on subsequent dispatcher runs. Mark `skipped` after 3 failures.
- **Duplicate sends:** `notification_log (subscriber_id, event_type, event_id)` is the deduplication key. Always check before queueing.
- **Timezone:** All storage in UTC. Convert to local only at render time. No exceptions.

---

## Testing Strategy

- **Phase 1:** Send hardcoded test email via Resend before any event logic. Prove the pipeline.
- **Phase 2:** Sign up with own email, trigger event-computer via `wrangler dev`, verify Lyrids email arrives correctly.
- **Each new event type:** Add self as test subscriber, trigger, verify email before real event date.
- **Aurora:** Lower Kp threshold to 1 in dev to force a trigger without a real geomagnetic storm.

---

## Frontend Design

Shipped in Phase 7 alongside the completed backend.

- **Stack:** Static HTML/CSS/JS, no framework. Cloudflare Pages, auto-deploy from GitHub.
- **Aesthetic:** Deep indigo/navy base (`#0B0F1A`), soft white text (`#E8E6E1`), warm gold accent (`#D4A853`). Subtle CSS star-field animation. Instrument Serif headings, DM Sans body.
- **Structure:** Hero → How it works (3 steps) → Example notification mockup (Perseids) → Footer
- **Sign-up flow:** Browser geolocation → preference checkboxes (all checked by default) → email → submit. Under 30 seconds to complete.
- **Additional pages:** `/confirm`, `/preferences`, `/unsubscribe`

---

## External Services

| Service | Purpose | Key needed |
|---------|---------|-----------|
| Resend | Email delivery | Yes — store as `RESEND_API_KEY` Worker secret |
| N2YO | ISS + Starlink predictions | Yes — register at n2yo.com, store as `N2YO_API_KEY` |
| NOAA SWPC | Aurora Kp index | No |
| JPL CNEOS | Asteroid close approaches | No |

**To create and store the Resend API key:**
1. Resend dashboard → API Keys → Create Key
2. Run: `wrangler secret put RESEND_API_KEY` (from the relevant worker directory)
3. Paste the key when prompted — it's never stored in plaintext
