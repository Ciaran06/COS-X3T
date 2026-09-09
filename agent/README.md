# The Vapi assistant — everything the dashboard needs

The app talks to a **Vapi assistant** that you own. Vapi holds the conversation —
turn taking, interruptions, stop words. TruCount gives it a small set of tools
and does all the matching and arithmetic itself.

**The keys.** Vapi's *public* key is publishable by design: it identifies the
account to Vapi's own servers and can do nothing but start a web call against an
assistant you own. So it lives in `index.html`, along with the assistant id.
Nothing else moved — the Cloudflare Worker still holds the secret ElevenLabs key
for the Scribe fallback underneath, and that key still never reaches the page.

```
public key    f9d033a9-3631-4e7a-95ce-0823f3c9f378
assistant id  aefc0a29-6dc2-41ec-be44-254316db923c
```

Both are at the top of the Vapi section in `index.html` (`VAPI_PUBLIC_KEY`,
`VAPI_ASSISTANT_ID`). A different assistant can be pointed at from
**Data → Voice engine → Vapi assistant ID** without editing the file.

---

## The short way: let the app send the tools

Vapi takes tools as a **call override**, so the eleven do not have to be created
by hand. The catch is that `model` in an override is a whole object, not a
patch: `provider` and `model` are required fields on it, and the system prompt
lives in the same object. So sending the tools from the app means also naming
the LLM and carrying the prompt.

That is a real trade, so it is opt-in and it is one field:

> **Data → Voice engine → "Send the tools from the app — name the LLM"**
> Put in the provider and model your assistant already uses, e.g. `openai/gpt-4.1`.
> Save.

From then on every call carries all eleven tool definitions, the system prompt
from `agent/system-prompt.md`, and that LLM at temperature 0.2. **Step 2 and
step 3 below stop mattering** — there is nothing to create and nothing to
delete off the prompt, because the prompt comes from the app. Step 1 still
does: client messages are not part of the model object.

What the dashboard still owns either way: the voice, the transcriber, the
messaging settings, and every call setting (durations, timeouts, first message).
What it stops owning when the field is filled: the model, the temperature, the
system prompt and the tools.

Leave the field empty and nothing is overridden — the call takes all four from
the assistant, and steps 2 and 3 are the work.

The definitions live in `agent/tools.json` and the prompt in
`agent/system-prompt.md`; `node agent/build-overrides.js` writes both into
`index.html` and the test suite fails if they have drifted.

---

## The long way: create them in the dashboard

Three things, in this order.

### 1. Turn on client-side tool calls

**Assistant → Messaging → Client messages** must include **`tool-calls`**.
Without it Vapi never tells the browser the model wants a tool, and nothing the
counter says will ever record a line.

Include these four:

```
tool-calls
transcript
speech-update
status-update
```

The app also sends this list as a call override, so a call started from the app
works either way — but set it here so a call started from the dashboard's own
test panel behaves the same.

### 2. Add the eleven tools

**Assistant → Tools → Add tool → Function**, once per tool below. The two things
that matter on every one of them:

- **Leave the server URL empty.** An empty server URL is what makes a tool
  client-side. If you fill it in, Vapi will POST to it and the browser will
  never see the call.
- **Set it async** (`"async": true`). Vapi's client-side tools are one way:
  there is no channel for the browser to return a value on. A synchronous tool
  would leave the model waiting for a result that cannot arrive.

The results still reach the model — see *How a result gets back* below.

If your dashboard has a JSON view, paste the block below into the assistant's
`model.tools`. If it only has the form, the `name`, `description` and each
parameter are the fields to fill in. It is the same JSON the app sends —
`agent/tools.json` is the one copy of it.

```json
[
  { "type": "function", "async": true, "function": {
      "name": "find_item",
      "description": "Look up an item on this customer's master from the words the counter said. Always call this before record_count. Returns up to three candidates with short names and a confidence.",
      "parameters": { "type": "object", "properties": {
        "spoken_text": { "type": "string", "description": "The item words exactly as the counter said them, without the quantity." }
      }, "required": ["spoken_text"] } } },

  { "type": "function", "async": true, "function": {
      "name": "record_count",
      "description": "Record one counted line. The only way to record anything. Use an item_code that find_item returned; never invent one.",
      "parameters": { "type": "object", "properties": {
        "item_code": { "type": "string", "description": "The code find_item returned." },
        "quantity":  { "type": "number", "description": "The number the counter said." },
        "unit_as_spoken": { "type": "string", "description": "The unit exactly as spoken — case, box, drum, metres, each. The app converts it." }
      }, "required": ["item_code", "quantity", "unit_as_spoken"] } } },

  { "type": "function", "async": true, "function": {
      "name": "undo_last",
      "description": "Remove the line just recorded. Call this on \"no\", \"wrong\" or \"no no\" straight after a readback.",
      "parameters": { "type": "object", "properties": {} } } },

  { "type": "function", "async": true, "function": {
      "name": "set_location",
      "description": "Set the location the count is happening at, from the words the counter said. Locations come from a list the office uploaded and cannot be created.",
      "parameters": { "type": "object", "properties": {
        "spoken_text": { "type": "string", "description": "The place name as the counter said it." }
      }, "required": ["spoken_text"] } } },

  { "type": "function", "async": true, "function": {
      "name": "read_total",
      "description": "Read back the running total for this location.",
      "parameters": { "type": "object", "properties": {} } } },

  { "type": "function", "async": true, "function": {
      "name": "pause",
      "description": "Stop recording. Call this on \"wait\", \"hang on\", \"stop\" or \"pause\", say OK, and stay silent.",
      "parameters": { "type": "object", "properties": {} } } },

  { "type": "function", "async": true, "function": {
      "name": "resume",
      "description": "Start recording again after a pause.",
      "parameters": { "type": "object", "properties": {} } } },

  { "type": "function", "async": true, "function": {
      "name": "next_line",
      "description": "Review mode only. Move to the next row of the sheet and return it.",
      "parameters": { "type": "object", "properties": {} } } },

  { "type": "function", "async": true, "function": {
      "name": "confirm_line",
      "description": "Review mode only. Accept the row as it stands and move on. Call this on \"yes\" or \"next\".",
      "parameters": { "type": "object", "properties": {} } } },

  { "type": "function", "async": true, "function": {
      "name": "correct_line",
      "description": "Review mode only. Set a new number on the row being read.",
      "parameters": { "type": "object", "properties": {
        "quantity": { "type": "number", "description": "The corrected number." },
        "unit_as_spoken": { "type": "string", "description": "The unit as spoken, if one was said." }
      }, "required": ["quantity"] } } },

  { "type": "function", "async": true, "function": {
      "name": "jump_to",
      "description": "Review mode only. Jump to a row by name.",
      "parameters": { "type": "object", "properties": {
        "spoken_text": { "type": "string", "description": "The item words the counter said." }
      }, "required": ["spoken_text"] } } }
]
```

### 3. Cut the item list off the end of the system prompt

The prompt in the dashboard ends with a **"for this test only"** list of items.
That was scaffolding so the model had something to name before the tools
existed. `find_item` is wired now and reads the customer's real master —
**388 NBI parts, and a different list per customer** — so the list in the prompt
is worse than useless: it is a second, stale, much smaller catalogue that the
model may prefer to the real one, and it will confidently name items this
customer does not stock.

**Delete everything from "for this test only" to the end of the prompt.**
`agent/system-prompt.md` in this repo is the prompt without it.

---

## The rest of the assistant

Worth checking, none of it surprising:

| Where | Setting | Value | Why |
| --- | --- | --- | --- |
| Model | Provider / model | anything fast with good tool calling | every line is a tool call |
| Model | Temperature | low (0–0.3) | it should not be creative about part numbers |
| Voice | any | your choice | Vapi does the speaking now, not ElevenLabs |
| Transcriber | keywords / vocabulary | see below | the one place accents get fixed |
| Analysis | Start speaking plan | leave default | Vapi's turn taking is the point of using it |
| Advanced | Max call duration | as long as a count takes | a walk of a 388-row sheet is not short |
| Advanced | Silence timeout | generous (60s+) | a counter walking to the next shelf is not finished |

**First message.** The app pre-connects the call when the Count tab opens and
overrides the first-message mode to *wait for the user*, so whatever you set
here is not spoken on a pre-connected call. Keep it short anyway for the case
where the call starts on the tap.

**Custom keywords / vocabulary.** If your transcriber supports a keyword or
vocabulary list, that is where part codes and Irish place names go —
`Claremorris`, `Tubbercurry`, `Dooleeg`, `ADSS`, `subduct`, `012F`. Accent
handling comes from the vocabulary, not from the vendor.

---

## How a result gets back

Worth understanding, because it explains the shape of the prompt.

Vapi's client-side tools are **one way**. The SDK hands the browser the call and
there is no channel to return a value on — Vapi's own documentation says as
much, and points at injected messages instead. So when the app runs a tool it
sends the result straight back as a system message:

```
Result of find_item: {"found":true,"confident":true,"candidates":[{"code":"500CONPOLE9M","short_name":"Medium Pole 9.0m",…}]}
```

and asks Vapi to let the model respond to it. From the model's side that is a
fact that appeared in the conversation the instant after it called the tool,
which is close enough to a return value to prompt against — and the prompt says
to read the fields rather than re-derive them.

The one exception is `pause`: its result goes in silently, with no response
asked for. Being told "paused" and then talking about it is the opposite of
pausing.

---

## If it does not work

| What you see | What it means |
| --- | --- |
| Chip says **Voice: Browser — the Vapi SDK did not load** | The page could not fetch the Vapi module. Check the phone has signal on first load; it is cached after that. |
| Chip is green, it talks, but nothing is ever recorded | `tool-calls` is not in **Client messages**, or the tools have a server URL set. Both are step 1 and step 2 above. |
| It calls a tool and then goes quiet | The tool is not marked `async`. It is waiting for a result the transport cannot deliver. |
| It names items that are not on the sheet | The "for this test only" list is still on the end of the system prompt. Filling in the LLM field also cures this, because the prompt then comes from the app. |
| The tools are sent but the assistant talks like a different agent | The LLM field is filled in, so the prompt comes from the app. Edit `agent/system-prompt.md` and run `node agent/build-overrides.js`, not the dashboard. |
| **Data → What the app heard** shows no `tool` rows | Same as "nothing is ever recorded" — the browser is not being told. |
