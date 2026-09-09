# The voice proxy — setup, start to finish

TruCount can use ElevenLabs for listening and speaking instead of the browser's
own speech engine. The ElevenLabs API key must never sit in `index.html`, because
anyone opening the page could read it and spend your credit. So the key lives in a
small Cloudflare Worker, and the app calls that.

> **This is the fallback tier now.** Vapi holds the conversation (see
> `agent/README.md`) and needs none of this — its public key is publishable and
> lives in the page. What follows is the Scribe tier underneath: what runs when
> Vapi will not start, or when the engine is set to *Scribe only*. It is worth
> having, and worth setting up, but the app works without it.

This takes about ten minutes and costs nothing on the free tiers.

---

## 1. Get an ElevenLabs API key

1. Go to **https://elevenlabs.io** and sign up (or sign in).
2. Click your avatar, bottom left → **API Keys**.
3. **Create API Key**. Name it `trucount`.
4. Copy it now — it is shown once. It starts `sk_`.

Keep this tab open; you will paste the key in step 3.

> Speech-to-text and text-to-speech both consume credit. Check
> **Settings → Subscription** for what your plan includes before a long field trial.

---

## 2. Create the Cloudflare Worker

1. Go to **https://dash.cloudflare.com** and sign up (free) or sign in.
2. Left sidebar → **Compute (Workers)** → **Create** → **Start with Hello World** → **Deploy**.
3. Name it `trucount-voice`. Cloudflare gives you a URL like
   `https://trucount-voice.<your-subdomain>.workers.dev` — **write this down**, the app needs it.
4. On the Worker's page → **Edit code**.
5. Delete everything in the editor, and paste in the whole of
   [`worker.js`](./worker.js) from this folder.
6. **Deploy**.

---

## 3. Paste the key in as a secret

Still on the Worker's page:

1. **Settings** → **Variables and Secrets** → **Add**.
2. Type: **Secret**. Name: `ELEVENLABS_API_KEY`. Value: the key from step 1.
3. **Deploy**.

**Strongly recommended — stop strangers using your credit.** The Worker URL is
public. Add a second secret so only your app can call it:

4. **Add** → Type: **Secret** → Name: `APP_TOKEN` → Value: any long random string
   you invent (e.g. `tc-9f2b-4a71-kk30-xr88`). **Deploy**.

Optional extras, added the same way as plain **Variables**, not secrets:

| Name | What it does |
| --- | --- |
| `ALLOWED_ORIGIN` | Restricts which site may call the proxy. Leave unset while testing. |
| `VOICE_ID` | Overrides the readback voice. Defaults to `IQjnnInWsKbdAesop75D`. |

---

## 4. Check it works

Open this in a browser, replacing the host with yours:

```
https://trucount-voice.<your-subdomain>.workers.dev/health
```

You should see:

```json
{"ok":true,"key":true,"guarded":true,"voice":"IQjnnInWsKbdAesop75D"}
```

- `key: false` → the secret in step 3 did not save. Re-add it and deploy again.
- `guarded: false` → you skipped `APP_TOKEN`. It will still work, but anyone who
  finds the URL can spend your credit.

---

## 5. Point the app at it

In TruCount: **Data tab → Voice engine**.

1. Paste the Worker URL into **Proxy URL** (no trailing slash).
2. Paste your `APP_TOKEN` into **App token**, if you set one.
3. **Save**, then **Test connection**.

The chip in the header should read **Voice: ElevenLabs**. If the proxy is
unreachable it falls back to the browser engine on its own and the chip says
**Voice: Browser** with the reason.

---

## What the app sends

| Route | When | Carries |
| --- | --- | --- |
| `GET /health` | On the Test button, and once at startup | nothing |
| `GET /stt-token` | Each time listening starts | nothing |
| `POST /tts` | Every readback | the sentence to speak |

### The readback voice

`/tts` speaks with `eleven_multilingual_v2` at **stability 0.5, similarity 0.8**
— quality rather than latency, chosen so the readback sounds like the voice's
own library preview. It is slower than the turbo model by a fraction of a
second per line, deliberately. Both are at the top of `worker.js`; `/health`
reports them, and the app prints what it is told on **Data → Voice engine**, so
you can see whether a deploy actually landed.

**After changing them you must redeploy the Worker.** The app cannot set the
model — it is a server-side choice on purpose, so a phone cannot spend your
credit on a more expensive one.

Audio from the microphone goes **straight from the phone to ElevenLabs** over a
WebSocket, using the single-use token. It does not pass through the Worker, so
the Worker stays inside Cloudflare's free request allowance easily.

## What it costs

- **Cloudflare Workers free tier**: 100,000 requests a day. A counter doing a
  full voice walk of a 385-row sheet uses a few hundred. Not a constraint.
- **ElevenLabs**: charged per minute of transcription and per character of
  speech. The readbacks are short; the transcription runs while the mic is open,
  so the meaningful cost is listening time, not the number of lines.

## If something goes wrong

| What you see | What it means |
| --- | --- |
| Chip says **Voice: Browser — proxy unreachable** | Wrong URL, or the Worker is not deployed. Open `/health` in a browser. |
| Chip says **Voice: Browser — proxy rejected the app token** | `APP_TOKEN` in the app does not match the Worker's secret. |
| `/health` shows `key: false` | The `ELEVENLABS_API_KEY` secret is missing. |
| Listening works, readback is silent | `/tts` is failing. Check the Worker's **Logs** tab in the Cloudflare dashboard. |
| Readbacks sound like the phone's own voice | The chip will be amber and say why. *the phone has not allowed audio yet* means tap the mic once — the first tap unlocks playback. Data → *What the app heard* names the engine that spoke every readback, so you can see it change. |
| The voice does not sound like the ElevenLabs preview | Check **Data → Voice engine** says `eleven_multilingual_v2`. If it says something else, the deployed Worker is an older copy. |
| Everything works, then stops after a while | The single-use token expired (15 minutes). The app mints a fresh one each time listening starts; stop and start the mic. |
