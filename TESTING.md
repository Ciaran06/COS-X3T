# Testing TruCount

There is one command:

```bash
npm install       # once — playwright-core and xlsx, for the tests only
node test/run.js  # or: npm test, or /test in Claude Code
```

It prints a line per suite and exits non-zero if anything failed.

```
────────────────────────────────────
  10-theme           28 passed
  20-turn-taking     27 passed
  …
────────────────────────────────────
  164 passed, 0 failed
```

Filter by name: `node test/run.js agent` runs the two agent suites,
`node test/run.js voice` the voice ones.

## What a test actually is

The app is one HTML file with no build step, so a test serves the folder, opens
it in a headless Chromium, and drives **the same functions the phone drives**.
There is no mock app and no second implementation of the parser — a suite calls
`parse()`, `AGENT_TOOLS.record_count()`, `onHeardFinal()`, `keytermsFor()`
exactly as the running app does.

Three things are stood in for, and only three:

| Stub | Why |
| --- | --- |
| **The voice proxy** (`test/lib/harness.js`) | serves the same routes as the Cloudflare Worker — `/health`, `/stt-token`, `/agent-token`, `/tts` — with no API key and no network. `/tts` returns a second of silence so a readback takes real time to play. |
| **The WebSocket** (`fakeSocket`) | opens and swallows, so a Scribe session can be observed without reaching ElevenLabs. The suite reads the keyterms straight off the URL the app tried to open. |
| **The agent session** (`fakeAgent`) | records what the app sends it, so the contextual updates and the typed path can be asserted without a live agent. |

Nothing else is faked. Excel files are read with the real SheetJS. The item
matcher, the unit conversion and the totals are the shipping code.

The two libraries the page loads from a CDN (SheetJS, `@elevenlabs/client`) are
fetched once into `test/.cache/` and served locally — the sandbox this was built
in blocks CDNs, and a test that needs the internet to pass is a test that fails
on a train. The cache is gitignored.

## Driving the voice paths without a voice

You cannot speak into a headless browser, so a suite drives the layer *below*
the microphone. That is deliberate: it is the same entry point the real engines
call, so the test exercises the real dispatch.

| To test | Call | Not |
| --- | --- | --- |
| something was heard | `onHeardFinal('ten poles')` | typing into `#typeIn` |
| the agent heard something | `agentSay('ten poles')`, or type into `#typeIn` with a session live | `handle()` |
| a readback | `speakThen(text, cb)` | `speechSynthesis` directly |

**Typed input is not a parallel path.** With an agent running, the typed box goes
in through `agentSay()` as a user turn, so an automated run exercises the real
tools rather than a shortcut around them. With no agent it goes to `parse()`,
as it always did. Typed lines are never written to the *What the app heard* log
either way — counting them would flatter the recognition rate.

## The suites

| File | What it holds the line on |
| --- | --- |
| `10-theme` | blue and white, contrast on the bar, one line reshades everything, contractor colours untouched |
| `20-turn-taking` | one utterance one line, the ear shut while speaking, "no" undoes, pause, never guessing an item |
| `22-spoken-rules` | a written part number, said out loud — and a pole's grade is never metres |
| `30-engine` | Agent / Scribe / Browser tiers, and each way a fallback can happen |
| `31-keyterms` | the boosted vocabulary rotates with the walk and stays within 50 × 20 |
| `32-retune` | the socket reopens when the vocabulary changes and not otherwise; which engine spoke every readback |
| `40-location` | the location list is closed — typed, spoken, or near-missed |
| `41-item-master` | editing, deleting, merging an upload without losing hand edits, export |
| `50-agent` | the tools are the only way the agent can touch data |
| `51-agent-context` | what the app tells the agent that it could not have heard |
| `60-delete` | every line can be removed, undone for five seconds, and the removal is in the record |
| `61-spots` | storage areas are optional, off by default, and never invented |

## Writing another one

A suite is a module that takes the shared browser and harness and returns
`{pass, fail}`:

```js
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);
  await H.useProxy(p, { agentId: 'agent_test123' });

  t('a name that reads as a sentence about behaviour',
    await p.evaluate(()=>VOICE.stt) === 'agent',
    await p.evaluate(()=>VOICE.stt));          // third argument: what it actually was

  const out = R.report('title shown in the run', p.errs);
  await p.ctx.close();
  return out;
};
```

Name the assertion after the behaviour, not the function — *"a near miss comes
back as candidates, not a guess"* tells you what broke; *"matchLoc returns
near"* does not. Always pass the third argument: a failure you cannot read the
actual value out of costs a debugging round.

`p.errs` collects page errors and console errors; the runner counts them as
failures. Noise the sandbox creates (blocked CDNs, missing favicon) is filtered
in the harness, not per suite.

## Screenshots

Suites write to `test/screenshots/` (gitignored). They are for looking at, not
asserting on — there is no image comparison. Two real layout faults were caught
this way and by nothing else: an edit form clipped off the side of a phone, and
an Edit button that could not be reached without scrolling sideways.

## What is not covered

- **Nothing here proves recognition accuracy.** Every voice suite drives text.
  Whether ElevenLabs actually hears an Irish site accent better than the browser
  is measured on a phone, by counting the same lines on each engine and reading
  the rate off Data → *What the app heard*.
- **No live ElevenLabs call is made.** The proxy and the agent are stubs, so a
  change in their API would pass here and fail in the field. `agent/README.md`
  is the manual check.
- **No `localStorage` migration tests.** The app has shipped several state shape
  changes (`S.locs`, `S.deleted`, `S.vlog`) with no upgrade path; an old device
  gets defaults. Worth a suite before there are real devices to break.
