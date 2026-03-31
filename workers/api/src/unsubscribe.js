// unsubscribe.js
export async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE unsubscribe_token = ?'
  ).bind(token).first();

  if (!sub) {
    return new Response('Invalid unsubscribe link', { status: 404 });
  }

  await env.DB.prepare(
    'UPDATE subscribers SET active = 0 WHERE id = ?'
  ).bind(sub.id).run();

  return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { background: #0B0F1A; color: #E8E6E1; font-family: Arial, sans-serif;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .box { text-align: center; max-width: 400px; padding: 40px 24px; }
  h1 { font-family: Georgia, serif; font-weight: normal; font-size: 28px; margin-bottom: 16px; }
  p { color: #6B7280; line-height: 1.7; }
  a { color: #D4A853; text-decoration: none; }
</style></head>
<body><div class="box">
  <h1>You've been unsubscribed.</h1>
  <p>You won't receive any more notifications from When To Look.</p>
  <p><a href="https://whentolook.com">Sign up again →</a></p>
</div></body></html>`, {
    headers: { 'Content-Type': 'text/html' },
  });
}
