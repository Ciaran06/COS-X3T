/**
 * TruCount voice proxy — Cloudflare Worker.
 *
 * The ElevenLabs API key lives here as a secret and never reaches the browser.
 * The app calls three routes:
 *
 *   GET  /health     is the proxy alive, and is a key configured
 *   GET  /stt-token  mint a single-use token so the browser can open the
 *                    Scribe realtime WebSocket directly (expires in 15 min)
 *   POST /tts        { text } -> audio/mpeg, spoken in the configured voice
 *
 * Secrets and variables (see README.md):
 *   ELEVENLABS_API_KEY  required, secret
 *   APP_TOKEN           optional, secret — if set, callers must send it as
 *                       x-app-token, so a stranger who finds this URL cannot
 *                       spend your ElevenLabs credit
 *   ALLOWED_ORIGIN      optional — defaults to * ; set it to your app's origin
 *   VOICE_ID            optional — defaults to the TruCount readback voice
 */

const DEFAULT_VOICE = 'IQjnnInWsKbdAesop75D';
const TTS_MODEL = 'eleven_turbo_v2_5';   /* low latency, good enough for readbacks */
const MAX_TTS_CHARS = 800;

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'content-type, x-app-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
function json(body, env, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors(env), 'content-type': 'application/json' },
  });
}
function authed(req, env) {
  if (!env.APP_TOKEN) return true;
  return req.headers.get('x-app-token') === env.APP_TOKEN;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    /* /health is open so the app can tell "wrong token" apart from "no proxy",
       but it reports whether this caller's token would be accepted */
    if (url.pathname === '/health') {
      return json({
        ok: true,
        key: !!env.ELEVENLABS_API_KEY,
        guarded: !!env.APP_TOKEN,
        authed: authed(req, env),
        voice: env.VOICE_ID || DEFAULT_VOICE,
      }, env);
    }

    if (!env.ELEVENLABS_API_KEY) {
      return json({ error: 'no_key', message: 'ELEVENLABS_API_KEY is not set on this Worker.' }, env, 500);
    }
    if (!authed(req, env)) {
      return json({ error: 'unauthorised', message: 'Wrong or missing x-app-token.' }, env, 401);
    }

    /* a single-use token lets the browser open the realtime socket itself,
       so audio never round-trips through this Worker */
    if (url.pathname === '/stt-token') {
      const r = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      });
      if (!r.ok) {
        return json({ error: 'token_failed', status: r.status, message: (await r.text()).slice(0, 400) }, env, 502);
      }
      const data = await r.json();
      return json({ token: data.token }, env);
    }

    if (url.pathname === '/tts' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, env, 400); }
      const text = String((body && body.text) || '').slice(0, MAX_TTS_CHARS);
      if (!text.trim()) return json({ error: 'no_text' }, env, 400);

      const voice = env.VOICE_ID || DEFAULT_VOICE;
      const r = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/' + voice + '?output_format=mp3_44100_128',
        {
          method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: body.model_id || TTS_MODEL,
            voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.05 },
          }),
        }
      );
      if (!r.ok) {
        return json({ error: 'tts_failed', status: r.status, message: (await r.text()).slice(0, 400) }, env, 502);
      }
      return new Response(r.body, {
        headers: { ...cors(env), 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
      });
    }

    return json({ error: 'not_found' }, env, 404);
  },
};
