# Creating the TruCount agent — start to finish

The app talks to an **ElevenLabs Agent** that you create and own. The agent holds
the conversation; TruCount gives it a small set of tools and does all the
matching and arithmetic itself. Your API key stays in the Cloudflare Worker —
the browser only ever gets a short-lived conversation token from it.

About fifteen minutes.

> Do `proxy/README.md` first. The agent needs the same Worker, with the same
> `ELEVENLABS_API_KEY` secret, and it needs the `/agent-token` route — so if your
> Worker was deployed before this batch, paste the new `proxy/worker.js` over it
> and **Deploy** again.

---

## 1. Create the agent

1. **https://elevenlabs.io** → **Agents** → **Create agent** → start from **Blank**.
2. Name it `TruCount`.

## 2. Voice and language

On the agent's **Voice** tab:

| Field | Value |
| --- | --- |
| Voice | the voice with ID `IQjnnInWsKbdAesop75D` — paste the ID into the search box |
| Model | Flash v2.5 (lowest latency) unless you prefer the quality of Turbo |
| Language | English |

On the **Agent** tab, set **First message** to exactly:

```
Go.
```

Nothing longer. The counter has tapped the mic and is already looking at a shelf.

## 3. The system prompt

Copy the whole of [`system-prompt.md`](./system-prompt.md) into **Agent → System
prompt**. That file is the version kept in this repo; when you change it in the
dashboard, change it here too, or the next person will not know what the agent
was told.

## 4. Turn-taking — the settings that decide how it feels

**Advanced** tab:

| Setting | Value | Why |
| --- | --- | --- |
| **Client events** | make sure `agent_response`, `user_transcript` and `interruption` are all ticked | the app logs them into *What the app heard*; without them the log is blind |
| **Interruptions** | **enabled** | talking over a readback has to stop it dead |
| **Turn eagerness / turn timeout** | responsive end — around **1 second** | a counter says "twelve" and stops; waiting two seconds feels broken |
| **Silence / user inactivity timeout** | **180 seconds** or the maximum allowed | you may be walking to the next shelf, or up a ladder |
| **Max conversation duration** | the **highest your plan allows** (1800s on many plans, 3600s on higher ones) | a location can take 40 minutes and the session must not die mid-count |

If your plan caps duration below what a location needs, the session ends and the
app falls back — nothing is lost, the lines are already written, but you will
have to tap the mic again.

## 5. The tools

**Tools** tab → **Add tool** → **Client tool** for each row below. The name must
match **exactly** — the app registers handlers under these names and nothing else
reaches it.

Tick **Wait for response** on every one of them. The agent reads back what the
app returns; without that it is reading back its own guess.

| Tool | Parameters (all strings unless noted) | Description to paste |
| --- | --- | --- |
| `find_item` | `spoken_text` *(required)* | Find items matching what the counter said. Returns up to three candidates with a confidence. Never guess an item — always call this first. |
| `record_count` | `item_code` *(required)*, `quantity` *(number, required)*, `unit_as_spoken` | Record one counted line. The app converts the unit. Read back exactly what it returns. |
| `undo_last` | — | Remove the line just recorded. Returns what was removed. |
| `set_location` | `spoken_text` *(required)* | Set the location for this count from the uploaded list. Never creates one. |
| `read_total` | — | Totals for the location being counted. |
| `pause` | — | Stop recording until the counter speaks again. |
| `resume` | — | Start recording again. |
| `next_line` | — | Review mode: move to the next line on the sheet. |
| `confirm_line` | — | Review mode: accept the line as it stands and move on. |
| `correct_line` | `quantity` *(number, required)*, `unit_as_spoken` | Review mode: set a new number on the line being read. |
| `jump_to` | `spoken_text` *(required)* | Review mode: jump to a line by name. |

## 6. Copy the agent ID

Top of the agent page, under its name — it starts `agent_`. **Copy it.**

## 7. Point the app at it

TruCount → **Data → Voice engine** → paste it into **Agent ID** → **Save** →
**Test connection**.

The chip should read **Voice: Agent** in green. Tap the mic: a short chime, the
agent says "Go", and the mic pulses while the session is live.

## If it does not connect

| Chip says | What it means |
| --- | --- |
| **Agent SDK did not load** | the `@elevenlabs/client` script was blocked. It falls back to Scribe — the count still works. |
| **Agent id was refused** | wrong ID, or the agent belongs to a different ElevenLabs account than the key in the Worker. |
| **Agent token refused** | the Worker has no `/agent-token` route — redeploy `proxy/worker.js`. |
| **Voice: Scribe** with no warning | the Agent ID box is empty. |

Everything below the agent still works: Scribe listens, ElevenLabs speaks, and
the browser engine is under that again. You lose the conversation, not the count.
