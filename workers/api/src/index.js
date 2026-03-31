// index.js
import { handleSubscribe } from './subscribe.js';
import { handleConfirm } from './confirm.js';
import { handleUnsubscribe } from './unsubscribe.js';
import { handlePreferences } from './preferences.js';

export default {
  async fetch(request, env, ctx) {
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
    if (request.method === 'GET' && url.pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    if (url.pathname === '/preferences') {
      return handlePreferences(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
