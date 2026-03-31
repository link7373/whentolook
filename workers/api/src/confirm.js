// confirm.js
export async function handleConfirm(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing confirmation token', { status: 400 });
  }

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE confirm_token = ?'
  ).bind(token).first();

  if (!sub) {
    return new Response('Invalid or expired confirmation link', { status: 404 });
  }

  await env.DB.prepare(
    'UPDATE subscribers SET confirmed = 1, confirm_token = NULL WHERE id = ?'
  ).bind(sub.id).run();

  return Response.redirect(`${env.FRONTEND_URL}/?confirmed=1`, 302);
}
