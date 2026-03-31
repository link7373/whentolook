# CLAUDE.md — When To Look (whentolook.com)

## Project Overview

**When To Look** is a simple night sky event notification service. Users sign up with their location and email, choose which sky events they care about, and receive a beautifully written email notification 15–30 minutes before they need to step outside and look up.

The notification IS the product. The website is just the sign-up form. Keep everything radically simple.

**Tagline:** "We'll tell you when to look up."

---

## Design Philosophy

- **Radically simple.** One page. No app. No account dashboard. No planetarium. Just: location → preferences → email → done.
- **The notification is the product.** Every email should be a self-contained, delightful mini-experience — what to look for, where to look, what you're actually seeing, and a bit of the science.
- **Dark sky aesthetic.** The site should feel like looking up at night. Deep dark backgrounds, not black — think deep navy or dark indigo. Subtle star-field or grain texture. Clean white/cream typography. Minimal, calm, confident.
- **No clutter.** No ads (yet). No blog. No sidebar. No feature comparison tables. Just the sign-up flow and a brief explanation of what the service does.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Static HTML/CSS/JS | Single page, hosted on Cloudflare Pages |
| Backend | Cloudflare Workers | API endpoints for sign-up, preference management, notification dispatch |
| Database | Cloudflare D1 (SQLite) | Subscribers, preferences, event queue, sent log |
| Email | Resend (resend.com) | Free tier: 100 emails/day. Upgrade to $20/mo at scale (50K/mo). Use their API. |
| Cron | Cloudflare Workers Cron Triggers | Scheduled jobs for event computation and email dispatch |
| Domain | whentolook.com | Cloudflare registrar or Namecheap, DNS on Cloudflare |

**Cost target:** Under $100 to launch. Domain (~$10), everything else on free tiers.

---

## Sky Event Types

These are the event categories users can subscribe to. Each has a specific data source and notification strategy.

### 1. ISS Visible Passes

**Data source:** N2YO REST API (https://api.n2yo.com)
- Endpoint: `/rest/v1/satellite/visualpasses/{noradId}/{observerLat}/{observerLng}/{observerAlt}/{days}/{minVisibility}/`
- NORAD ID for ISS: 25544
- Free API key required (register at n2yo.com)
- Rate limit: 1000 transactions/hour
- Returns: start time (UTC timestamp), duration (seconds), max elevation (degrees), start azimuth, end azimuth

**Notification timing:** 30 minutes before pass start time.

**Notification content should include:**
- Exact time to go outside
- Direction to look (e.g., "Look southwest, moving toward the northeast")
- How long the pass lasts (e.g., "Visible for about 4 minutes")
- How bright it will be (max elevation as a proxy — higher = brighter)
- What it looks like: "A bright, steady light moving smoothly across the sky — no blinking. It's not a plane."
- Fun context: "There are [X] people aboard right now, traveling at 17,500 mph, 250 miles above your head."

**Filtering logic:**
- Only notify for passes with max elevation ≥ 30° (good visibility)
- Only notify for passes occurring during dark hours (after civil twilight ends, before it begins)
- Consider a user preference for "only the best passes" (≥ 60° elevation) vs "all visible passes"

**Polling strategy:** Fetch predictions for all subscriber locations once daily. N2YO returns up to 10 days of predictions per call.

---

### 2. Starlink Train Passes

**Data source:** N2YO API (same as ISS) OR CelesTrak TLE data + SGP4 propagation
- N2YO approach: Use group ID or recent Starlink NORAD IDs from CelesTrak's "Last 30 Days Launches" TLE set
- CelesTrak TLE URL: https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle (full catalog) or https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle (recent launches only)
- Recent launches (< 2–3 weeks old) form visible "trains" — older ones have dispersed and are not visually interesting

**Notification timing:** 30 minutes before pass.

**Notification content should include:**
- When and where to look
- What it looks like: "A line of bright dots moving in a row across the sky, like a string of pearls"
- Context: "These are [X] Starlink internet satellites launched [date]. They'll spread apart over the next few weeks and become invisible."
- Note: "Many people mistake these for UFOs — now you'll know better"

**Filtering logic:**
- Only notify for Starlink groups launched within the last ~14 days (still in train formation)
- Only good-elevation passes (≥ 25°)
- This is a bursty event type — lots of passes right after a launch, then nothing until the next launch

**Implementation note:** For MVP, consider monitoring SpaceX launch dates and manually triggering Starlink train tracking for the relevant NORAD IDs for 2 weeks post-launch. At scale, automate by polling CelesTrak's "last 30 days" group.

---

### 3. Meteor Shower Peaks

**Data source:** Static JSON compiled from the American Meteor Society calendar
- Source page: https://amsmeteors.org/meteor-showers/meteor-shower-calendar/
- Data includes: shower name, peak date/time (UT), Zenithal Hourly Rate (ZHR), radiant RA/Dec, velocity, parent object
- This data is known years in advance and changes only slightly year to year
- Moon phase on peak night must be computed to assess viewing conditions

**Notification timing:** Evening of peak night, ~30 minutes after astronomical twilight begins (i.e., when it's dark enough to see meteors).

**Notification content should include:**
- "The [Shower Name] meteor shower peaks tonight"
- Expected rate: "Up to [ZHR] meteors per hour under ideal conditions. Realistically, expect [ZHR/2 to ZHR/3] from a suburban location."
- Where to look: "Lie flat and look straight up. Meteors will appear all across the sky, but they'll seem to radiate from [constellation]. You don't need to stare at that spot — the longest streaks appear 30–45° away from it."
- Moon interference assessment: "The Moon is [X]% illuminated tonight — [excellent/good/poor] conditions for meteor watching."
- Gear advice: "You don't need binoculars or a telescope. Just your eyes, a blanket, and patience. Give your eyes 20 minutes to adjust to the dark."
- What you're actually seeing: "Each streak is a grain of [sand/dust]-sized particle from [parent object name] hitting Earth's atmosphere at [velocity] km/s and burning up [60–100] km above your head."
- Best viewing time: "Peak activity is usually between midnight and dawn"

**Major showers to include (minimum):**
- Quadrantids (Jan 3–4) — ZHR 120
- Lyrids (Apr 21–22) — ZHR 18
- Eta Aquariids (May 5–6) — ZHR 50
- Delta Aquariids (Jul 30) — ZHR 25
- Perseids (Aug 12–13) — ZHR 100 ⭐ The big one
- Draconids (Oct 8–9) — ZHR variable
- Orionids (Oct 21–22) — ZHR 20
- Leonids (Nov 17–18) — ZHR 15 (but occasional storms)
- Geminids (Dec 13–14) — ZHR 150 ⭐ The other big one
- Ursids (Dec 22–23) — ZHR 10

**Also send a "heads up" notification 1 day before each major shower (Perseids, Geminids, Quadrantids) so people can plan.**

---

### 4. Full Moons & Supermoons

**Data source:** Compute from astronomical algorithms (Jean Meeus "Astronomical Algorithms") or use USNO API
- USNO API: https://aa.usno.navy.mil/data/api (Moon phases endpoint)
- Alternative: Precompute a static JSON of full moon dates for 2026–2030 using published tables
- Supermoon definition: Full moon occurring within 90% of closest perigee approach

**Notification timing:** Evening of full moon night, at sunset.

**Notification content should include:**
- "Full Moon tonight — the [traditional name]"
- Traditional name (Wolf Moon, Snow Moon, Worm Moon, etc.) — these have great cultural appeal
- Moonrise time and direction for their location
- Whether it's a supermoon: "This is a Supermoon — the Moon is [X]% closer than average, making it appear about 14% larger and 30% brighter."
- What to notice: "Look for it right at moonrise, when it's near the horizon — that's when the 'Moon illusion' makes it look enormous."
- Brief cultural/historical note about the traditional name

**Full moon traditional names:**
- January: Wolf Moon
- February: Snow Moon
- March: Worm Moon
- April: Pink Moon
- May: Flower Moon
- June: Strawberry Moon
- July: Buck Moon
- August: Sturgeon Moon
- September: Harvest Moon (or Corn Moon)
- October: Hunter's Moon
- November: Beaver Moon
- December: Cold Moon
- Blue Moon: second full moon in a calendar month

---

### 5. Lunar Eclipses

**Data source:** NASA Eclipse Website (Fred Espenak's canonical tables)
- https://eclipse.gsfc.nasa.gov/lunar.html
- Static data: dates, types (total, partial, penumbral), times of each phase (UT), visibility maps
- Precompute and store as static JSON for next 10 years
- Compute local visibility from eclipse visibility coordinates + subscriber location

**Notification timing:** 1 hour before the eclipse begins (penumbral phase) for the subscriber's location.

**Notification content should include:**
- Type of eclipse: total, partial, or penumbral
- Timeline: "Partial eclipse begins at [time], totality from [time] to [time], ends at [time]"
- Where to look: "Look [direction] — the Moon will be [X]° above the horizon"
- What you'll see: For total — "The Moon will turn a deep copper or blood red as Earth's shadow covers it completely." For partial — "You'll see Earth's curved shadow slowly creeping across the Moon's surface." For penumbral — "Subtle darkening — look for a slight shadow on one side of the Moon. This one's subtle."
- Why it happens: Brief explanation of Earth's shadow
- "Unlike a solar eclipse, a lunar eclipse is safe to watch with your naked eyes."

**Also send a "reminder" notification 1 day before any total or partial lunar eclipse.**

---

### 6. Solar Eclipses

**Data source:** NASA Eclipse Website
- https://eclipse.gsfc.nasa.gov/solar.html
- Static data: dates, types (total, annular, partial), path of totality coordinates, local circumstances
- Must compute whether the eclipse is visible from the subscriber's location and what type (total, partial, annular) they'll see

**Notification timing:** 1 day before (planning notification) + morning of the eclipse day.

**Notification content should include:**
- ⚠️ **SAFETY WARNING FIRST**: "NEVER look directly at the Sun without certified eclipse glasses (ISO 12312-2). Regular sunglasses are NOT safe."
- Type visible from their location
- Timeline with local times
- How much of the Sun will be covered from their location (percentage)
- If they're near the path of totality: driving directions context ("Totality passes [X] km [direction] of you")
- What to watch for: shadow bands, Baily's beads, the diamond ring effect, temperature drop, animal behavior
- Where to get eclipse glasses (link to AAS-approved vendors list)

**Solar eclipses are rare for any given location. These notifications are critical — don't miss them.**

---

### 7. Aurora (Northern Lights) Alerts

**Data source:** NOAA Space Weather Prediction Center — multiple free JSON endpoints:
- Kp Index (observed): `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json`
- Kp Index (3-day forecast): `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`
- Aurora forecast map (OVATION model): `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json`
- Also: `https://auroraforecast.space/api/kp/now` (simpler API, returns single Kp value)

**Notification timing:** As soon as conditions are detected — this is the ONE event type that requires near-real-time monitoring (every 15–30 minutes).

**Notification logic:**
- Compute the minimum Kp required for aurora at the subscriber's latitude:
  - 67°N+ (Alaska, Scandinavia): Kp ≥ 2
  - 60–67°N: Kp ≥ 3
  - 55–60°N: Kp ≥ 4
  - 50–55°N (Vancouver, London, southern Canada): Kp ≥ 5
  - 45–50°N (Seattle, Minneapolis, Montreal): Kp ≥ 6
  - 40–45°N (Denver, NYC, Madrid): Kp ≥ 7
  - Below 40°N: Kp ≥ 8 (very rare, major storm)
- When Kp reaches or exceeds the threshold for a subscriber's latitude, send an alert
- DON'T spam: only one aurora alert per geomagnetic storm (suppress for 12 hours after sending)

**Notification content should include:**
- "🌌 Aurora alert — Northern Lights may be visible from your area RIGHT NOW"
- Current Kp level and what that means
- Where to look: "Look toward the north/northeast horizon. Get away from city lights if you can."
- What you'll see: "The aurora often starts as a faint green glow on the northern horizon. It can intensify into curtains, arcs, or pillars of green, purple, and red."
- Camera tip: "Your phone camera sees aurora better than your eyes. Try a 3–10 second exposure pointing north."
- Caveat: "Aurora is weather-dependent — clear skies are essential. Check your local forecast."
- Current conditions: "Kp index is currently [X]. [Description of storm intensity]."

**Kp scale descriptions:**
- Kp 5: G1 Minor storm — Aurora visible at high latitudes, may be visible on northern horizon at ~55°N
- Kp 6: G2 Moderate storm — Aurora visible down to ~50°N
- Kp 7: G3 Strong storm — Aurora visible down to ~45°N, may be overhead at ~55°N
- Kp 8: G4 Severe storm — Aurora visible as far south as ~40°N
- Kp 9: G5 Extreme storm — Aurora visible at very low latitudes, possibly overhead at 45°N

**Polling strategy:** Cron trigger every 15 minutes checks current Kp. If threshold crossed for any subscriber, queue immediate email.

---

### 8. Asteroid Close Approaches

**Data source:** JPL Center for Near Earth Object Studies (CNEOS) Close Approach API
- Endpoint: `https://ssd-api.jpl.nasa.gov/cad.api`
- Parameters: `date-min`, `date-max`, `dist-max` (AU), `sort=dist`
- Free, no API key needed
- Returns: object name, close approach date/time, miss distance (AU, LD, km), relative velocity, estimated diameter

**Notification timing:** Day of close approach, evening notification.

**Filtering logic:**
- Only notify for asteroids that are newsworthy:
  - Diameter > 100m AND miss distance < 20 lunar distances (LD), OR
  - Diameter > 500m AND miss distance < 50 LD, OR
  - Any asteroid making headlines (manual override)
- Most close approaches are NOT visible to the naked eye — the notification is informational/educational, not "go look"
- Frame as: "Right now, above your head..." rather than "go look for..."

**Notification content should include:**
- "🌑 Asteroid [name] is making a close pass by Earth right now"
- Size comparison: "About the size of [building/football field/city block]"
- Miss distance in understandable terms: "[X] times the distance from Earth to the Moon"
- Speed: "Traveling at [X] km/s — that's [X] times faster than a bullet"
- Context: "This is NOT a threat. NASA tracks [X]+ near-Earth objects. This one will safely pass by."
- What would happen (fun hypothetical): Brief Torino scale context if relevant

**Frequency:** Only a few notifications per year — quality over quantity. This is the "whoa, cool" event type.

---

## Database Schema (D1)

```sql
CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,           -- UUID
  email TEXT UNIQUE NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_name TEXT,            -- "Victoria, BC" (display only)
  timezone TEXT NOT NULL,        -- IANA timezone, e.g., "America/Vancouver"
  created_at TEXT NOT NULL,      -- ISO 8601
  confirmed INTEGER DEFAULT 0,  -- Email confirmation status (double opt-in)
  confirm_token TEXT,            -- Token for email confirmation
  unsubscribe_token TEXT NOT NULL, -- Token for one-click unsubscribe
  active INTEGER DEFAULT 1
);

CREATE TABLE preferences (
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,      -- 'iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'
  enabled INTEGER DEFAULT 1,
  -- Event-specific settings
  min_elevation INTEGER,         -- For ISS/Starlink: minimum pass elevation in degrees
  PRIMARY KEY (subscriber_id, event_type)
);

CREATE TABLE notification_log (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_id TEXT,                 -- Unique event identifier (e.g., ISS pass timestamp, shower name + year)
  sent_at TEXT NOT NULL,
  email_id TEXT                  -- Resend message ID for tracking
);

CREATE TABLE event_queue (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_data TEXT NOT NULL,      -- JSON blob with event details
  notify_at TEXT NOT NULL,       -- When to send (ISO 8601)
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped'
  created_at TEXT NOT NULL
);
```

**Indexes:**
```sql
CREATE INDEX idx_queue_notify ON event_queue(notify_at, status);
CREATE INDEX idx_queue_subscriber ON event_queue(subscriber_id, event_type);
CREATE INDEX idx_log_subscriber_event ON notification_log(subscriber_id, event_type, event_id);
CREATE INDEX idx_subscribers_active ON subscribers(active, confirmed);
```

---

## Cloudflare Workers Architecture

### Worker 1: Web API (`api.whentolook.com`)

Handles sign-up form submissions and preference management.

**Endpoints:**

```
POST /subscribe
  Body: { email, latitude, longitude, location_name, timezone, preferences: ['iss', 'meteor', ...] }
  → Validate, create subscriber + preferences, send confirmation email
  → Return: { success: true, message: "Check your email to confirm" }

GET /confirm?token={token}
  → Mark subscriber as confirmed, redirect to thank-you page

GET /unsubscribe?token={token}
  → Mark subscriber as inactive, show confirmation page

POST /preferences
  Body: { token, preferences: { iss: true, meteor: true, aurora: false, ... } }
  → Update preferences (use unsubscribe_token as auth)
```

### Worker 2: Event Computer (Cron — runs daily at 00:00 UTC)

Computes upcoming events for all active subscribers and populates the event_queue.

**Daily job flow:**
1. Fetch all active, confirmed subscribers with their preferences
2. For each event type, compute events for the next 36 hours:
   - **ISS:** Call N2YO API for each unique lat/lon (batch nearby subscribers within ~50km to same prediction). Filter by min elevation. Queue notification for 30 min before each pass.
   - **Starlink:** If active Starlink train (launched within 14 days), same as ISS flow with relevant NORAD IDs.
   - **Meteor showers:** Check static JSON — if peak is tonight, queue notification for 30 min after astronomical twilight.
   - **Full moons:** Check static JSON — if full moon is today, queue notification for sunset time.
   - **Lunar eclipses:** Check static JSON — if eclipse today AND visible from location, queue notification for 1 hour before penumbral contact.
   - **Solar eclipses:** Check static JSON — if eclipse today AND visible from location, queue notification for morning of.
   - **Asteroids:** Check JPL CAD API for close approaches today that meet threshold criteria.
3. Before queueing, check notification_log to avoid duplicate sends for the same event.
4. Write all new events to event_queue with status 'pending'.

### Worker 3: Aurora Monitor (Cron — runs every 15 minutes)

Special real-time monitor for aurora alerts.

**Flow:**
1. Fetch current Kp from NOAA SWPC JSON endpoint
2. If Kp ≥ 5 (lowest threshold for any subscriber):
   a. Fetch all aurora-subscribed, active subscribers
   b. For each, check if Kp meets their latitude threshold
   c. Check notification_log — only alert if no aurora alert sent in last 12 hours
   d. If conditions met, queue immediate email (bypass event_queue, send directly via Resend)
   e. Log to notification_log

### Worker 4: Email Dispatcher (Cron — runs every 5 minutes)

Picks up pending events from event_queue that are due and sends emails.

**Flow:**
1. Query: `SELECT * FROM event_queue WHERE status = 'pending' AND notify_at <= datetime('now') LIMIT 50`
2. For each event, render the email using the appropriate template
3. Send via Resend API
4. Update status to 'sent' and log to notification_log
5. On failure, update status to 'failed' (retry logic: try 3 times, then skip)

---

## Email Design

### General email structure:

```
From: When To Look <hello@whentolook.com>
Subject: [Contextual — see below]

[Clean HTML email, dark theme matching the website]
[Event-specific content block — see each event type above]
[Footer: "You're receiving this because you signed up at whentolook.com" | Manage preferences | Unsubscribe]
```

### Email design guidelines:
- **Dark theme** — dark navy/indigo background (#0a0e1a or similar), white/cream text
- **Minimal** — no header image, no logo (just "When To Look" in text), no sidebar
- **Single column**, max-width 600px, well-padded
- **One clear CTA** at the bottom: "Share this with someone who should look up tonight →" (mailto: or copy-link)
- **Event emoji** in subject line for visual scanning in inbox
- **Keep total length short** — scannable in 30 seconds. People receive this and go outside, they don't sit and read.
- **Unsubscribe link** must be prominent (legal requirement, and it builds trust)

### Subject line formats:
- ISS: "🛰️ Space Station flies over [City] tonight at [time]"
- Starlink: "✨ Starlink train visible tonight at [time]"
- Meteor: "🌠 [Shower name] meteor shower peaks tonight"
- Full Moon: "🌕 Full [Name] Moon rises tonight"
- Lunar Eclipse: "🌑 Lunar eclipse visible tonight — here's when to look"
- Solar Eclipse: "🌗 Solar eclipse tomorrow — here's what you'll see from [City]"
- Aurora: "🌌 Northern Lights alert — aurora may be visible NOW"
- Asteroid: "☄️ Asteroid [name] is passing Earth right now"

---

## Website (Single Page)

### URL Structure:
- `whentolook.com` — Landing page with sign-up form
- `whentolook.com/confirm?token=...` — Email confirmation
- `whentolook.com/preferences?token=...` — Manage preferences
- `whentolook.com/unsubscribe?token=...` — Unsubscribe

### Landing page flow:

**Section 1: Hero**
- Headline: "We'll tell you when to look up."
- Subhead: "Get a notification before meteor showers, ISS passes, eclipses, auroras, and more — personalized to your exact location. Free."
- Visual: Subtle animated star field or static grain-textured dark sky background

**Section 2: How it works**
Three steps, ultra simple:
1. "Tell us where you are" — Location input (auto-detect via browser geolocation API, or manual city search)
2. "Pick what you care about" — Checkboxes for each event type, with one-line descriptions:
   - ☑️ ISS Passes — "The Space Station flying overhead, visible with your naked eyes"
   - ☑️ Starlink Trains — "Newly launched Starlink satellites in formation — looks like a string of lights"
   - ☑️ Meteor Showers — "Shooting stars! We'll alert you on peak nights"
   - ☑️ Full Moons & Supermoons — "Including traditional moon names and supermoon events"
   - ☑️ Lunar Eclipses — "Earth's shadow turns the Moon red"
   - ☑️ Solar Eclipses — "When the Moon blocks the Sun (with safety info)"
   - ☑️ Aurora / Northern Lights — "Real-time alerts when geomagnetic storms may make aurora visible at your latitude"
   - ☑️ Asteroid Close Approaches — "When a notable space rock makes a close pass by Earth"
3. "Enter your email" — Email input + "Notify me" button

All checkboxes checked by default. The entire sign-up should be completable in under 30 seconds.

**Section 3: What you'll get (example notification)**
Show a mockup/preview of what a notification email looks like. Use the Perseid meteor shower as the example.

**Section 4: Footer**
"Made by [Colin's site/brand]. No spam. No ads. Just sky." + Privacy note (we only store your email and location to send you notifications).

### Design notes:
- Font: Something elegant with character — consider: "Instrument Serif" for headings, "DM Sans" or "Outfit" for body (you've used DM Sans before on Ety, so this would be consistent with your design language)
- Color palette: Deep indigo/navy base (#0B0F1A), soft white text (#E8E6E1), accent in a warm gold or soft amber (#D4A853) for CTAs and highlights — feels like stars against a night sky
- Mobile-first responsive
- No JavaScript frameworks needed — vanilla JS for the form logic, geolocation API, and fetch calls
- Consider a very subtle CSS animation: slow-twinkling dots in the background (pure CSS, no canvas needed)

---

## API Keys & External Services Required

| Service | What for | Free tier | Key required |
|---------|----------|-----------|-------------|
| N2YO | ISS + Starlink pass predictions | 1000 calls/hour | Yes — register at n2yo.com |
| NOAA SWPC | Aurora Kp index + forecast | Unlimited, no key | No |
| JPL CNEOS | Asteroid close approaches | Unlimited, no key | No |
| Resend | Email delivery | 100 emails/day, 1 domain | Yes — register at resend.com |
| Cloudflare | Pages, Workers, D1 | Generous free tier | Yes — Cloudflare account |

**Environment variables (Workers secrets):**
```
N2YO_API_KEY=...
RESEND_API_KEY=...
```

---

## Data Files (Static JSON)

Create these as static JSON files bundled with the Worker or stored in KV:

### `meteor-showers.json`
```json
[
  {
    "name": "Quadrantids",
    "peak": "2026-01-03T16:00:00Z",
    "zhr": 120,
    "velocity_kms": 40.4,
    "radiant_constellation": "Boötes",
    "parent_object": "Asteroid 2003 EH1",
    "description": "Short but intense — the peak only lasts about 6 hours",
    "best_hemisphere": "northern"
  }
  // ... all showers listed in event type #3 above
]
```

### `full-moons.json`
```json
[
  {
    "date": "2026-01-03T10:03:00Z",
    "name": "Wolf Moon",
    "supermoon": false,
    "name_origin": "Named by Algonquin peoples for the howling of wolves in the deep midwinter cold"
  }
  // ... all full moons for 2026-2030
]
```

### `eclipses.json`
```json
{
  "lunar": [
    {
      "date": "2026-03-03",
      "type": "total",
      "penumbral_start": "2026-03-03T03:21:00Z",
      "partial_start": "2026-03-03T04:30:00Z",
      "total_start": "2026-03-03T05:41:00Z",
      "maximum": "2026-03-03T06:33:00Z",
      "total_end": "2026-03-03T07:25:00Z",
      "partial_end": "2026-03-03T08:37:00Z",
      "penumbral_end": "2026-03-03T09:46:00Z",
      "visibility": "Americas, Europe, Africa"
    }
  ],
  "solar": [
    {
      "date": "2026-08-12",
      "type": "total",
      "path_description": "Arctic, Greenland, Iceland, Spain",
      "max_duration_seconds": 132
    }
  ]
}
```

---

## Launch Checklist

1. [ ] Register whentolook.com domain
2. [ ] Set up Cloudflare account, Pages project, D1 database
3. [ ] Register N2YO API key
4. [ ] Register Resend account, verify domain (add DNS records)
5. [ ] Build and deploy static frontend to Cloudflare Pages
6. [ ] Build and deploy Workers (API, Event Computer, Aurora Monitor, Email Dispatcher)
7. [ ] Create D1 database tables
8. [ ] Populate static JSON files (meteor showers, full moons, eclipses)
9. [ ] Test full flow: sign up → confirm email → receive test notification
10. [ ] Set up Cron Triggers in Cloudflare dashboard
11. [ ] Test all 8 event types with a real subscriber (yourself)
12. [ ] Launch 🚀

---

## Future Enhancements (NOT for MVP)

- SMS notifications (Twilio, premium tier)
- Weather-aware notifications ("It's cloudy tonight — skip this one" using a weather API)
- Push notifications via PWA / web push
- "Share with a friend" referral system
- Notification history dashboard ("Here's what you've seen this year")
- Premium tier with more granular control (e.g., only ISS passes above 60°)
- Blog/content for SEO ("Best meteor showers of 2026", "How to photograph the aurora")
- Telescope/binocular affiliate recommendations in emails (monetization)
- App (iOS/Android) — only if email proves the model

---

## Key Principles

1. **Ship ugly, iterate pretty.** Get the notification pipeline working first. The email content and website design can improve every week.
2. **Notifications are the product.** If the emails are good, people will stay subscribed and tell friends. If they're bad, nothing else matters.
3. **Respect the inbox.** Never send more than one email per day except for real-time aurora alerts. Let users control frequency.
4. **Be accurate.** Wrong timing = user goes outside, sees nothing, unsubscribes forever. Double-check all timezone conversions.
5. **Make it shareable.** Every notification should make someone want to text a friend "go outside and look up right now."
