// preferences.js
export async function handlePreferences(request, env) {
  if (request.method === 'GET') {
    return handleGetPreferences(request, env);
  }
  if (request.method === 'POST') {
    return handleUpdatePreferences(request, env);
  }
  return new Response('Method not allowed', { status: 405 });
}

async function handleGetPreferences(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return json({ error: 'Missing token' }, 400);

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE unsubscribe_token = ?'
  ).bind(token).first();
  if (!sub) return json({ error: 'Invalid token' }, 404);

  const { results } = await env.DB.prepare(
    'SELECT event_type, enabled FROM preferences WHERE subscriber_id = ?'
  ).bind(sub.id).all();

  const prefs = {};
  for (const row of results) prefs[row.event_type] = row.enabled === 1;
  return json({ preferences: prefs });
}

async function handleUpdatePreferences(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { token, preferences } = body;
  if (!token || !preferences) return json({ error: 'Missing token or preferences' }, 400);

  const sub = await env.DB.prepare(
    'SELECT id FROM subscribers WHERE unsubscribe_token = ?'
  ).bind(token).first();
  if (!sub) return json({ error: 'Invalid token' }, 404);

  const allTypes = ['iss', 'starlink', 'meteor', 'fullmoon', 'lunar_eclipse', 'solar_eclipse', 'aurora', 'asteroid'];
  for (const type of allTypes) {
    await env.DB.prepare(`
      INSERT INTO preferences (subscriber_id, event_type, enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(subscriber_id, event_type) DO UPDATE SET enabled = excluded.enabled
    `).bind(sub.id, type, preferences[type] ? 1 : 0).run();
  }

  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
