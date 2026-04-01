# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign whentolook.com with a deep-space atmosphere aesthetic, split signup into email-first landing + separate setup page, add shooting star favicon, and update the email mockup.

**Architecture:** Pure static HTML/CSS/JS — no framework. Four files change: `favicon.svg` (new), `styles.css` (full rewrite), `index.html` (full rewrite), `setup.html` (new). Deploy via `wrangler pages deploy frontend`. No backend changes needed.

**Tech Stack:** Vanilla HTML5, CSS3 (custom properties, keyframes, backdrop-filter), vanilla JS (Fetch API, Geolocation API), Google Fonts (Instrument Serif + DM Sans), Cloudflare Pages.

---

### Task 1: Shooting star favicon

**Files:**
- Create: `frontend/favicon.svg`
- Modify: `frontend/index.html` (add `<link rel="icon">` in `<head>`)
- Modify: `frontend/setup.html` (same favicon link)

**Step 1: Create favicon.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- Tail: fading line -->
  <line x1="4" y1="28" x2="22" y2="10" stroke="#D4A853" stroke-width="1.5"
        stroke-linecap="round" opacity="0.4"/>
  <line x1="8" y1="28" x2="24" y2="12" stroke="#D4A853" stroke-width="1"
        stroke-linecap="round" opacity="0.2"/>
  <!-- Head: bright dot -->
  <circle cx="24" cy="8" r="3" fill="#D4A853"/>
  <circle cx="24" cy="8" r="1.5" fill="#fff"/>
</svg>
```

**Step 2: Add to both HTML files**

In `<head>` of `index.html` and `setup.html`:
```html
<link rel="icon" href="favicon.svg" type="image/svg+xml">
```

**Step 3: Verify**

Open `frontend/index.html` locally in browser — check tab shows gold shooting star icon.

**Step 4: Commit**
```bash
git add frontend/favicon.svg frontend/index.html
git commit -m "feat: shooting star favicon"
```

---

### Task 2: Rewrite styles.css

**Files:**
- Rewrite: `frontend/styles.css`

This is the visual heart of the redesign. Write it in sections.

**Step 1: CSS custom properties + reset**

```css
:root {
  --navy:   #0B0F1A;
  --navy2:  #131827;
  --gold:   #D4A853;
  --gold-dim: #a07a30;
  --text:   #E8E6E1;
  --muted:  #8892a4;
  --card-bg: rgba(255,255,255,0.04);
  --card-border: rgba(255,255,255,0.09);
  --font-serif: 'Instrument Serif', Georgia, serif;
  --font-sans:  'DM Sans', system-ui, sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  background: var(--navy);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.6;
  min-height: 100vh;
  overflow-x: hidden;
}
```

**Step 2: Star field layers (3 layers)**

```css
/* Micro stars */
.stars-micro {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(1px 1px at var(--x,50%) var(--y,50%), rgba(255,255,255,0.6) 0%, transparent 100%);
  /* Generated via JS or use box-shadow trick — see note below */
}

/* Use the existing box-shadow stars technique but add a third layer: */
.stars-layer,
.stars-large,
.stars-micro {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none;
  border-radius: 50%;
}
```

Keep the existing star box-shadow values from the old CSS and add a third `.stars-micro` layer with smaller, denser stars (1px dots, higher count).

The animation stays as-is (`twinkle` keyframe on opacity).

**Step 3: Nebula glow**

```css
.nebula {
  position: fixed;
  top: -20vh; left: 50%;
  transform: translateX(-50%);
  width: 900px; height: 700px;
  z-index: 0; pointer-events: none;
  border-radius: 50%;
  background: radial-gradient(ellipse at center,
    rgba(45, 212, 191, 0.07) 0%,
    rgba(99, 62, 193, 0.06) 40%,
    transparent 70%
  );
  animation: nebula-pulse 10s ease-in-out infinite alternate;
  filter: blur(60px);
}

@keyframes nebula-pulse {
  from { opacity: 0.6; transform: translateX(-50%) scale(1); }
  to   { opacity: 1;   transform: translateX(-50%) scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  .nebula { animation: none; }
}
```

**Step 4: Layout + container**

```css
.container { max-width: 860px; margin: 0 auto; padding: 0 24px; position: relative; z-index: 1; }

section { position: relative; z-index: 1; }
```

**Step 5: Hero section**

```css
#hero {
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 80px 24px 60px;
}

.hero-eyebrow {
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--gold); font-weight: 600; margin-bottom: 20px;
  display: block;
}

.hero-h1 {
  font-family: var(--font-serif);
  font-size: clamp(3rem, 8vw, 5.5rem);
  font-weight: 400; line-height: 1.1;
  color: var(--text);
  margin-bottom: 24px;
}

.hero-sub {
  font-size: 1.125rem; color: var(--muted);
  max-width: 500px; line-height: 1.7;
  margin-bottom: 40px;
}

/* Email-capture form in hero */
.hero-form {
  display: flex; gap: 12px;
  max-width: 460px; width: 100%;
}

.hero-form input[type="email"] {
  flex: 1;
  padding: 14px 18px;
  background: rgba(255,255,255,0.07);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  color: var(--text);
  font-size: 1rem;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.2s;
}
.hero-form input[type="email"]::placeholder { color: var(--muted); }
.hero-form input[type="email"]:focus { border-color: var(--gold); }

.hero-form button {
  padding: 14px 24px;
  background: var(--gold);
  color: var(--navy);
  font-weight: 700; font-size: 0.95rem;
  border: none; border-radius: 8px;
  cursor: pointer; white-space: nowrap;
  transition: background 0.2s, transform 0.1s;
}
.hero-form button:hover { background: #e0b55a; }
.hero-form button:active { transform: scale(0.98); }

.hero-error {
  font-size: 0.85rem; color: #f87171;
  margin-top: 8px; display: none;
}

@media (max-width: 520px) {
  .hero-form { flex-direction: column; }
}
```

**Step 6: How it works section**

```css
#how-it-works {
  padding: 100px 0;
}

#how-it-works h2 {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 5vw, 3rem);
  text-align: center; margin-bottom: 12px;
}

.section-sub {
  text-align: center; color: var(--muted);
  margin-bottom: 56px;
}

.steps {
  display: flex; align-items: flex-start;
  gap: 0;
}

.step {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 32px 28px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.step-number {
  width: 36px; height: 36px;
  background: var(--gold);
  color: var(--navy);
  border-radius: 50%;
  font-weight: 700; font-size: 0.9rem;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}

.step h3 { font-size: 1.05rem; font-weight: 600; margin-bottom: 8px; }
.step p  { font-size: 0.9rem; color: var(--muted); line-height: 1.6; }

.step-connector {
  color: var(--gold); font-size: 1.4rem;
  padding: 0 16px; margin-top: 48px;
  flex-shrink: 0;
}

@media (max-width: 700px) {
  .steps { flex-direction: column; }
  .step-connector { transform: rotate(90deg); margin: 4px auto; }
}
```

**Step 7: Email preview mockup section**

```css
#email-preview {
  padding: 80px 0 100px;
  text-align: center;
}

#email-preview h2 {
  font-family: var(--font-serif);
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  margin-bottom: 12px;
}

.email-shell {
  max-width: 560px; margin: 48px auto 0;
  border-radius: 12px; overflow: hidden;
  border: 1px solid var(--card-border);
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  text-align: left;
}

.email-chrome {
  background: #1e2330;
  padding: 12px 18px;
  border-bottom: 1px solid var(--card-border);
  font-size: 12px; color: var(--muted);
}
.email-chrome strong { color: var(--text); }

.email-body {
  background: #f6f7f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
}
/* rest of mockup uses inline styles to match actual email */
```

**Step 8: Footer**

```css
footer {
  border-top: 1px solid var(--card-border);
  padding: 32px 24px;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
  position: relative; z-index: 1;
}
footer a { color: var(--gold); text-decoration: none; }
```

**Step 9: Setup page specifics**

```css
/* setup.html uses same base styles + these additions */

.setup-card {
  max-width: 600px; margin: 80px auto 60px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px; padding: 48px 40px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: relative; z-index: 1;
}

.setup-card h1 {
  font-family: var(--font-serif);
  font-size: 2rem; margin-bottom: 8px;
}

.form-label-heading {
  display: block;
  font-size: 0.8rem; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--gold);
  font-weight: 600; margin: 32px 0 16px;
}

.checkbox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 32px;
}

.checkbox-item {
  display: flex; align-items: flex-start;
  gap: 10px; cursor: pointer;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--card-border);
  border-radius: 8px; padding: 12px 14px;
  transition: border-color 0.15s;
}
.checkbox-item:hover { border-color: var(--gold); }
.checkbox-item input[type="checkbox"] { margin-top: 3px; accent-color: var(--gold); }
.checkbox-label strong { font-size: 0.88rem; display: block; margin-bottom: 2px; }
.checkbox-label span   { font-size: 0.78rem; color: var(--muted); }

.location-row {
  display: flex; align-items: center;
  gap: 12px; margin-bottom: 8px;
  flex-wrap: wrap;
}

.btn-detect {
  padding: 10px 16px;
  background: rgba(212,168,83,0.15);
  border: 1px solid var(--gold);
  color: var(--gold);
  border-radius: 8px; font-size: 0.9rem;
  cursor: pointer; white-space: nowrap;
  transition: background 0.15s;
}
.btn-detect:hover { background: rgba(212,168,83,0.25); }

.city-input {
  flex: 1; min-width: 160px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--card-border);
  border-radius: 8px; color: var(--text);
  font-size: 0.9rem; font-family: var(--font-sans);
  outline: none; transition: border-color 0.2s;
}
.city-input::placeholder { color: var(--muted); }
.city-input:focus { border-color: var(--gold); }

.or-divider { color: var(--muted); font-size: 0.85rem; }

.location-status {
  font-size: 0.85rem; color: var(--muted);
  min-height: 20px; margin-bottom: 8px;
}
.location-status.success { color: #34d399; }
.location-status.error   { color: #f87171; }

.btn-submit {
  width: 100%;
  padding: 16px;
  background: var(--gold);
  color: var(--navy);
  font-weight: 700; font-size: 1rem;
  border: none; border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  margin-top: 8px;
}
.btn-submit:hover { background: #e0b55a; }
.btn-submit:active { transform: scale(0.99); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.fine-print {
  text-align: center; font-size: 0.8rem;
  color: var(--muted); margin-top: 16px;
}

@media (max-width: 600px) {
  .setup-card { margin: 40px 16px; padding: 32px 20px; }
  .checkbox-grid { grid-template-columns: 1fr; }
}
```

**Step 10: Verify CSS visually**

Open `frontend/index.html` in browser. Check:
- Star field visible
- Nebula glow visible behind hero
- No overflow or broken layout on mobile (resize browser)

**Step 11: Commit**
```bash
git add frontend/styles.css
git commit -m "feat: astronomy CSS redesign — nebula, stars, frosted glass"
```

---

### Task 3: Rewrite index.html

**Files:**
- Rewrite: `frontend/index.html`

**Step 1: Write new index.html structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>When To Look — Night sky notifications</title>
  <meta name="description" content="...">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Background layers -->
  <div class="nebula" aria-hidden="true"></div>
  <div class="stars-layer" aria-hidden="true"></div>
  <div class="stars-large" aria-hidden="true"></div>
  <div class="stars-micro" aria-hidden="true"></div>

  <!-- Confirmed banner -->
  <div id="confirmed-banner" role="alert" hidden>
    ✅ You're confirmed — we'll email you before your next sky event.
  </div>

  <!-- HERO -->
  <section id="hero" aria-label="Introduction">
    <span class="hero-eyebrow">Night sky notifications</span>
    <h1 class="hero-h1">We'll tell you<br><em>when to look up.</em></h1>
    <p class="hero-sub">
      Free alerts before meteor showers, ISS passes, eclipses, auroras, and more —
      personalized to your exact location.
    </p>
    <form class="hero-form" id="email-form" novalidate>
      <input type="email" id="hero-email" placeholder="your@email.com"
             autocomplete="email" required aria-label="Your email address">
      <button type="submit">Notify me &rarr;</button>
    </form>
    <p class="hero-error" id="hero-error" role="alert"></p>
  </section>

  <!-- HOW IT WORKS -->
  <section id="how-it-works" aria-label="How it works">
    <div class="container">
      <h2>How it works</h2>
      <p class="section-sub">Three steps. Under 30 seconds.</p>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Enter your email</h3>
          <p>Just your address — we'll take you to the setup page next.</p>
        </div>
        <div class="step-connector" aria-hidden="true">&#8594;</div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Choose your events</h3>
          <p>Pick from 8 types of sky events. Share your location so we know what's visible from your sky.</p>
        </div>
        <div class="step-connector" aria-hidden="true">&#8594;</div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Look up</h3>
          <p>We'll email you 15–30 minutes before each event. Step outside and look up.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- EMAIL PREVIEW -->
  <section id="email-preview" aria-label="Example notification">
    <div class="container">
      <h2>What you'll receive</h2>
      <p class="section-sub">A focused notification with everything you need — nothing you don't.</p>
      <!-- mockup HTML here — see Task 4 -->
    </div>
  </section>

  <!-- FOOTER -->
  <footer>
    <p>Made with ☽ for people who look up &nbsp;·&nbsp;
      <a href="/unsubscribe">Unsubscribe</a> &nbsp;·&nbsp;
      Privacy: we store only your email and location.
    </p>
  </footer>

  <script>
    // Show confirmed banner
    if (new URLSearchParams(location.search).get('confirmed') === '1') {
      document.getElementById('confirmed-banner').hidden = false;
    }

    // Email form → redirect to setup page
    document.getElementById('email-form').addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('hero-email').value.trim();
      const errorEl = document.getElementById('hero-error');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      location.href = `setup.html?email=${encodeURIComponent(email)}`;
    });
  </script>
</body>
</html>
```

**Step 2: Verify hero form redirects to setup.html with email in URL param**

Open `frontend/index.html`, enter an email, click "Notify me →" — should redirect to `setup.html?email=...`.

**Step 3: Commit**
```bash
git add frontend/index.html
git commit -m "feat: landing page — email-only hero, astronomy layout"
```

---

### Task 4: Email preview mockup

**Files:**
- Modify: `frontend/index.html` (replace `<!-- mockup HTML here -->` comment)

The mockup should be a self-contained HTML block using only inline styles (so it renders identically regardless of the outer page CSS).

**Step 1: Write the mockup HTML**

Replace the comment in the `#email-preview` section with:

```html
<div class="email-shell">
  <!-- Email client chrome -->
  <div class="email-chrome">
    <div><strong>From:</strong> When To Look &lt;hello@whentolook.com&gt;</div>
    <div><strong>Subject:</strong> ✨ Starlink satellite train visible in 30 minutes</div>
  </div>
  <!-- Email body (inline styles match actual sent emails) -->
  <div class="email-body">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 16px;">
    <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0B0F1A;height:6px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 32px 24px;">
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;font-weight:600;font-family:sans-serif;">When To Look</p>
        <h2 style="margin:6px 0 4px;font-size:22px;font-weight:700;color:#1a1f2e;font-family:sans-serif;">Starlink Satellite Train</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6B7280;font-family:sans-serif;">Visible in 30 minutes</p>
        <!-- Stat block -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;border-radius:8px;margin-bottom:20px;overflow:hidden;">
          <tr>
            <td width="50%" style="padding:16px 20px;border-right:1px solid rgba(255,255,255,0.12);vertical-align:top;">
              <p style="margin:0 0 4px;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;font-family:sans-serif;">Visible at</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#D4A853;font-family:sans-serif;">9:42 PM</p>
            </td>
            <td width="50%" style="padding:16px 20px;vertical-align:top;">
              <p style="margin:0 0 4px;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;font-family:sans-serif;">Where to look</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#D4A853;font-family:sans-serif;">West-southwest, halfway up</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;border-right:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.12);vertical-align:top;">
              <p style="margin:0 0 4px;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;font-family:sans-serif;">Visible for</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#D4A853;font-family:sans-serif;">3 min</p>
            </td>
            <td style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.12);vertical-align:top;">
              <p style="margin:0 0 4px;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;font-weight:600;font-family:sans-serif;">Satellites</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#D4A853;font-family:sans-serif;">~52 in formation</p>
            </td>
          </tr>
        </table>
        <!-- Prose -->
        <p style="margin:0 0 14px;font-size:13px;line-height:1.7;color:#4B5563;font-family:sans-serif;"><strong style="color:#1a1f2e;">What to look for:</strong> A line of bright dots moving in a row — like a string of pearls crossing the sky. Face west-southwest and watch them arc toward the north-northeast.</p>
        <p style="margin:0 0 14px;font-size:13px;line-height:1.7;color:#4B5563;font-family:sans-serif;"><strong style="color:#1a1f2e;">What they are:</strong> Newly-launched SpaceX Starlink satellites, still traveling in formation. They'll spread apart and become invisible over the next few weeks.</p>
        <!-- Footer -->
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;">
        <p style="margin:0;font-size:10px;color:#9CA3AF;text-align:center;font-family:sans-serif;">
          <a href="#" style="color:#9CA3AF;">Unsubscribe</a> &nbsp;·&nbsp;
          <a href="#" style="color:#9CA3AF;">Manage preferences</a>
        </p>
      </td></tr>
    </table>
    </td></tr></table>
  </div>
</div>
```

**Step 2: Verify mockup renders correctly**

Open index.html in browser — email preview should show dark stat block with gold values, white card body, no broken layout.

**Step 3: Commit**
```bash
git add frontend/index.html
git commit -m "feat: Starlink email preview mockup in landing page"
```

---

### Task 5: Create setup.html

**Files:**
- Create: `frontend/setup.html`

This page is reached via `setup.html?email=...` and handles location + preferences.

**Step 1: Write setup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set up your alerts — When To Look</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="nebula" aria-hidden="true"></div>
  <div class="stars-layer" aria-hidden="true"></div>
  <div class="stars-large" aria-hidden="true"></div>
  <div class="stars-micro" aria-hidden="true"></div>

  <div class="setup-card">
    <span class="hero-eyebrow">When To Look</span>
    <h1>Almost done.</h1>
    <p style="color:var(--muted);margin:8px 0 0;">
      Tell us where you are so we know what's visible from your sky.
    </p>

    <form id="setup-form" novalidate>
      <input type="hidden" id="email" name="email">
      <input type="hidden" id="lat" name="latitude">
      <input type="hidden" id="lng" name="longitude">
      <input type="hidden" id="timezone" name="timezone">
      <input type="hidden" id="location-name" name="location_name">

      <span class="form-label-heading">Your location</span>
      <div class="location-row">
        <button type="button" id="detect-location" class="btn-detect">📍 Use my location</button>
        <span class="or-divider">or</span>
        <input type="text" id="city-input" class="city-input"
               placeholder="City, country" autocomplete="off" aria-label="Enter your city">
      </div>
      <div id="location-status" class="location-status" role="status" aria-live="polite"></div>

      <span class="form-label-heading">What do you want alerts for?</span>
      <div class="checkbox-grid" role="group" aria-label="Event types">
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="iss" checked>
          <div class="checkbox-label"><strong>🛰️ ISS Passes</strong><span>Space Station visible overhead</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="starlink" checked>
          <div class="checkbox-label"><strong>✨ Starlink Trains</strong><span>Newly-launched satellites in formation</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="meteor" checked>
          <div class="checkbox-label"><strong>🌠 Meteor Showers</strong><span>Peak nights for shooting stars</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="fullmoon" checked>
          <div class="checkbox-label"><strong>🌕 Full Moons &amp; Supermoons</strong><span>Including traditional moon names</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="lunar_eclipse" checked>
          <div class="checkbox-label"><strong>🌑 Lunar Eclipses</strong><span>Earth's shadow turns the Moon red</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="solar_eclipse" checked>
          <div class="checkbox-label"><strong>🌗 Solar Eclipses</strong><span>When the Moon blocks the Sun</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="aurora" checked>
          <div class="checkbox-label"><strong>🌌 Aurora / Northern Lights</strong><span>Real-time geomagnetic storm alerts</span></div>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="event_type" value="asteroid" checked>
          <div class="checkbox-label"><strong>☄️ Asteroid Close Approaches</strong><span>Notable space rocks flying by</span></div>
        </label>
      </div>

      <div id="form-error" style="color:#f87171;font-size:0.85rem;margin-bottom:12px;display:none;"></div>
      <button type="submit" class="btn-submit" id="submit-btn">Start watching →</button>
      <p class="fine-print">
        We'll send a confirmation email before anything else.<br>
        Unsubscribe any time with one click.
      </p>
    </form>
  </div>

  <script>
    const API_BASE = 'https://whentolook-api.link7373.workers.dev';

    // Pre-fill email from URL param
    const params = new URLSearchParams(location.search);
    const emailVal = params.get('email') || '';
    document.getElementById('email').value = emailVal;

    // ── Geolocation ──────────────────────────────────────────
    const detectBtn    = document.getElementById('detect-location');
    const locationStatus = document.getElementById('location-status');
    const cityInput    = document.getElementById('city-input');

    detectBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setStatus('Geolocation not supported by your browser.', 'error');
        return;
      }
      setStatus('Detecting your location…', '');
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const { latitude, longitude } = pos.coords;
          setCoords(latitude, longitude);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const data = await res.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.county || addr.state || 'Your location';
            const country = addr.country_code ? addr.country_code.toUpperCase() : '';
            const name = city + (country ? `, ${country}` : '');
            document.getElementById('location-name').value = name;
            cityInput.value = name;
            setStatus(`📍 ${name}`, 'success');
          } catch {
            setStatus('📍 Location detected', 'success');
          }
        },
        () => setStatus('Could not detect location — try typing your city.', 'error')
      );
    });

    cityInput.addEventListener('change', async () => {
      const q = cityInput.value.trim();
      if (!q) return;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
        );
        const [place] = await res.json();
        if (place) {
          setCoords(parseFloat(place.lat), parseFloat(place.lon));
          document.getElementById('location-name').value = place.display_name.split(',').slice(0,2).join(',');
          setStatus(`📍 ${place.display_name.split(',').slice(0,2).join(', ')}`, 'success');
        } else {
          setStatus('Location not found — try a nearby city.', 'error');
        }
      } catch {
        setStatus('Location lookup failed — check your connection.', 'error');
      }
    });

    function setCoords(lat, lng) {
      document.getElementById('lat').value = lat;
      document.getElementById('lng').value = lng;
      document.getElementById('timezone').value =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    function setStatus(msg, type) {
      locationStatus.textContent = msg;
      locationStatus.className = 'location-status' + (type ? ` ${type}` : '');
    }

    // ── Form submit ──────────────────────────────────────────
    document.getElementById('setup-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errorEl = document.getElementById('form-error');
      const btn     = document.getElementById('submit-btn');

      const email    = document.getElementById('email').value;
      const lat      = document.getElementById('lat').value;
      const lng      = document.getElementById('lng').value;
      const tz       = document.getElementById('timezone').value;
      const locName  = document.getElementById('location-name').value;
      const prefs    = [...document.querySelectorAll('input[name="event_type"]:checked')]
                         .map(cb => cb.value);

      if (!email) { showError('No email found — go back and enter your email.'); return; }
      if (!lat || !lng) { showError('Please set your location before continuing.'); return; }
      if (prefs.length === 0) { showError('Please select at least one event type.'); return; }

      btn.disabled = true;
      btn.textContent = 'Setting up…';

      try {
        const res = await fetch(`${API_BASE}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email, latitude: parseFloat(lat), longitude: parseFloat(lng),
            timezone: tz, location_name: locName, preferences: prefs,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        location.href = `/?confirmed=1`;
      } catch (err) {
        showError('Something went wrong — please try again.');
        btn.disabled = false;
        btn.textContent = 'Start watching →';
      }

      function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>
```

**Step 2: Test setup flow end-to-end**

1. Open `index.html` → enter email → check redirect to `setup.html?email=...`
2. On setup page → click "Use my location" → verify status updates
3. Check all 8 checkboxes are present and checked by default
4. Submit → verify `POST /subscribe` is called with correct payload

**Step 3: Commit**
```bash
git add frontend/setup.html
git commit -m "feat: setup page — location + preferences after email capture"
```

---

### Task 6: Deploy to Cloudflare Pages

**Files:** No file changes — deploy only.

**Step 1: Deploy**
```bash
cd "C:/Claude/When To Look"
wrangler pages deploy frontend --project-name whentolook
```

**Step 2: Verify live site**

Open `https://whentolook.com` in browser:
- [ ] Nebula glow visible in hero
- [ ] Star field animating
- [ ] Email input in hero → clicking "Notify me" redirects to setup.html
- [ ] Setup.html loads with correct background
- [ ] Email mockup renders correctly
- [ ] Favicon shows shooting star in browser tab

**Step 3: Final commit**
```bash
git add -A
git commit -m "deploy: astronomy redesign with email-first signup flow"
git push origin main
```

---

## Quick Reference

| URL | What it does |
|-----|-------------|
| `whentolook.com` | Landing — email input only |
| `whentolook.com/setup.html?email=...` | Preferences setup |
| `whentolook.com/confirm.html` | Post-confirmation page (existing) |
| `whentolook.com/unsubscribe.html` | Unsubscribe page (existing) |
