# Frontend Redesign — When To Look
**Date:** 2026-04-01

## Goals
- Fresh astronomy aesthetic (deep space + aurora atmosphere)
- Simplified landing page: email-only CTA
- New setup page: location + preferences after email capture
- Updated email mockup to match current Starlink email design
- Shooting star favicon

---

## Visual Design

### Palette (unchanged)
- Background: `#0B0F1A` (deep navy)
- Text: `#E8E6E1` (soft white)
- Gold accent: `#D4A853`
- Card/panel: semi-transparent dark (`rgba(255,255,255,0.05)`) with subtle border

### New Visual Elements
- **Nebula glow**: large radial gradient blob (deep teal + violet) behind hero, animated with a slow 10s breathing pulse
- **Star field**: existing 3-layer CSS box-shadow animation kept, add a third micro-star layer for more depth
- **Constellation overlay**: faint SVG dot-and-line pattern in hero (pure markup, no images)
- **Frosted glass cards**: `backdrop-filter: blur` panels for steps and form sections

### Typography (unchanged)
- Headings: Instrument Serif
- Body: DM Sans

---

## Pages

### index.html — Landing Page
**Sections:**
1. **Hero** — Full-viewport. Headline + subhead + single email input with "Notify me →" CTA. Nebula glow behind text. Constellation overlay.
2. **How it works** — 3 steps in frosted glass cards: "Enter your email → Choose your events → Look up." Arrow connectors between cards.
3. **Email preview** — Realistic email client mockup showing the Starlink notification template (dark stat block + prose). Framed with a mock subject/from line.
4. **Footer** — "Made with ☽ for people who look up." Privacy note.

**Signup flow change:**
- Email input in hero → on submit, redirect to `setup.html?email=<encoded>`
- No location or checkboxes on landing page
- Remove the separate `#signup` section

### setup.html — Preferences Setup (new page)
**Layout:** Centered frosted-glass card, same background as landing page.

**Content:**
1. Heading: "Almost done — tell us where you are"
2. Subhead: "We'll use your location to know which events are visible from your sky."
3. Location row: "📍 Use my location" + "or type your city" input
4. Location status feedback (same geolocation JS logic)
5. "What do you want to know about?" — 2-column checkbox grid, all 8 events checked by default
6. "Start watching →" submit button (gold)
7. Fine print: "We'll send a confirmation email before anything else. Unsubscribe any time."

**On submit:** `POST /subscribe` → redirect to `confirm.html` (already exists) or show inline confirmation.

### favicon.svg (new file)
SVG shooting star: diagonal line (`stroke: #D4A853`) with a bright circular head and a short fading tail. Referenced as `<link rel="icon" href="favicon.svg" type="image/svg+xml">`.

---

## Email Mockup (on landing page)

Replace current mockup with a realistic preview of the Starlink email:
- Outer frame: mock email client chrome (from, subject line)
- Inner card: white card with 8px navy stripe at top
- "When To Look" eyebrow + "Starlink Satellite Train" headline + subtitle
- Dark navy 2×2 stat block with gold values: VISIBLE AT / WHERE TO LOOK / VISIBLE FOR / SATELLITES
- 3 prose sections below
- Footer with unsubscribe link

---

## Files Changed
- `frontend/index.html` — full rewrite
- `frontend/styles.css` — full rewrite
- `frontend/setup.html` — new file
- `frontend/favicon.svg` — new file

## Files Unchanged
- `frontend/confirm.html`
- `frontend/unsubscribe.html`
- All workers
