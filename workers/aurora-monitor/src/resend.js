// sendgrid.js (file kept as resend.js to avoid import changes)
// Sends email via SendGrid's v3 Mail Send API.

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

function parseFrom(from) {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from };
}

export async function sendEmail({ to, from, subject, html, apiKey }) {
  const fromObj = parseFrom(from);

  const res = await fetch(SENDGRID_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: fromObj,
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${text}`);
  }

  // SendGrid returns 202 with no body; message ID is in the response header
  return res.headers.get('X-Message-Id') ?? 'sent';
}
