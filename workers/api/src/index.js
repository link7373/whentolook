// index.js
import { handleSubscribe } from './subscribe.js';
import { handleConfirm } from './confirm.js';
import { handleUnsubscribe } from './unsubscribe.js';
import { handlePreferences } from './preferences.js';

export default {
  async fetch(request, env, ctx) {
    const res = await route(request, env);
    // The confirm/unsubscribe pages on whentolook.com call this API from the
    // browser. Without this header the browser hides every response from them,
    // so a successful confirmation showed up as "Network error".
    const out = new Response(res.body, res); // Response.redirect() headers are immutable
    out.headers.set('Access-Control-Allow-Origin', '*');
    return out;
  },
};

async function route(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/subscribe') {
      return handleSubscribe(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/confirm') {
      return handleConfirm(request, env);
    }
    // GET: the link in the email footer. POST: RFC 8058 one-click unsubscribe,
    // sent by the mail client when someone clicks the inbox "Unsubscribe" button.
    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    if (url.pathname === '/preferences') {
      return handlePreferences(request, env);
    }

    return new Response('Not found', { status: 404 });
}
