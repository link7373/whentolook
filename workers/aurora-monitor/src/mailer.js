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

export async function sendEmail({ to, from, subject, html, apiKey }) {
  // Fail loudly and unambiguously on a missing secret. Without this the request
  // goes out unauthenticated and comes back as a generic 401, which reads like a
  // revoked key rather than one that was never set.
  if (!apiKey) throw new Error('BREVO_API_KEY is not set on this Worker');

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(from),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo error ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json().catch(() => ({}));
  return data.messageId ?? 'sent';
}
