// mailer.js
// Email sending, currently backed by Brevo's transactional API.
//
// Named for the role rather than the vendor deliberately: this module has been
// Resend, then SendGrid, and is now Brevo, but the filename said "resend.js"
// throughout. A vendor-named file becomes a lie the first time you switch.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Splits "When To Look <hello@whentolook.com>" into Brevo's sender object.
function parseFrom(from) {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from };
}

// unsubscribeUrl: when set, adds RFC 8058 one-click unsubscribe headers.
//
// Why we set our own: Brevo adds a List-Unsubscribe header by default that
// points at *Brevo's* unsubscribe. Clicking Gmail's "Unsubscribe" then blocks
// the address inside Brevo while D1 still marks it active, and later sends
// are dropped with nothing recorded anywhere. Ours points at the API worker,
// so the inbox button and our database agree. (The dispatcher's daily Brevo
// block-list sync covers the case where Brevo keeps its own header anyway.)
export async function sendEmail({ to, from, subject, html, apiKey, unsubscribeUrl = null }) {
  // Fail loudly and unambiguously on a missing secret. Without this the request
  // goes out unauthenticated and comes back as a generic 401, which reads like a
  // revoked key rather than one that was never set.
  if (!apiKey) throw new Error('BREVO_API_KEY is not set on this Worker');

  const payload = {
    sender: parseFrom(from),
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  let res = await post(payload, apiKey);

  // Brevo's docs say "standard email headers are not supported" in `headers`.
  // If it rejects ours, send without them. An alert without the header beats
  // no alert, and the log line makes the rejection visible.
  if (res.status === 400 && payload.headers) {
    const text = await res.text();
    console.error(`[mailer] Brevo rejected List-Unsubscribe headers, resending without them: ${text.slice(0, 300)}`);
    delete payload.headers;
    res = await post(payload, apiKey);
  }

  if (!res.ok) {
    const text = await res.text();
    // Truncated: this string is persisted to event_queue.last_error.
    throw new Error(`Brevo error ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json().catch(() => ({}));
  return data.messageId ?? 'sent';
}

function post(payload, apiKey) {
  return fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
