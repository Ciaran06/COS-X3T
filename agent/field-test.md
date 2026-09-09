# Field test — Vapi, on a phone, on a real shelf

Two passes over the same fifteen cases. Once on Vapi, once on Scribe (set
**Data → Voice engine → Engine** to *Scribe only* and Save to drop a tier).
Same voice, same distance, same order.

Before you start: **Data → What the app heard → Clear.** Everything below is
recorded there with timestamps, so you do not have to keep score. Export the CSV
at the end of each pass and keep the two.

Set up a location first — job, contractor, Location, van — so nothing you say is
about setting up.

---

## The ten lines

Say them straight through. Do not stop between them unless it asks you something.

| # | Say | What should happen | Watching for |
| --- | --- | --- | --- |
| 1 | "three full drums of aerial ninety six fibre" | one line, readback "Aerial Fibre Cable 096F. Three drums." | pack words — a drum is 4,000m and the app must do that, not the agent |
| 2 | "eight hundred and fifty metres of aerial forty eight fibre" | 850 | the long number form |
| 3 | "drum A B C D one, one thousand two hundred metres" | 1,200m, and it should **ask which cable** | the drum ID as letters; ten cables carry drums, so naming one is a guess |
| 4 | "six nine metre medium poles" | 6 of Medium Pole 9.0m | two numbers in one phrase — 6 is the quantity, 9 is part of the name |
| 5 | "four nine metre light poles" | 4 of 9Mt Light Pole | the grade, not the height, is what separates them |
| 6 | "three cases of coach screws" | 3 cases | case → 200 each |
| 7 | "five sump hole gratings" | 5 | plain |
| 8 | "four in home NTUs" | 4 | plain |
| 9 | "one thousand two hundred and fifty pole steps" | 1,250 | the longest number |
| 10 | "ten poles" | it should **ask which pole** | a dozen poles on the master — asking is the right answer |

Then **"read total"**.

**The number that matters:** how many of the ten landed first time, on each
engine. Everything else is texture.

---

## The five interruption cases

These are the ones that decide whether it is usable on a ladder.

### 1 — Talk over a readback with "no"

Say **"ten nine metre medium poles"**. The moment it starts reading back, say
**"no"** over the top of it.

Should: stop talking mid-word, remove the line, say something like "Removed",
and listen again.
Should not: finish the sentence first; record a second line; hear "no" as part
of the next item.

*Check the sheet — there must be no 10-pole line left.*

### 2 — Say "yes" two words into a question

Say **"three hundred mil pole bolt, four hundred"**. It should ask which item —
there is a 300mm, a 350mm and an M12 x 300mm. As soon as you hear the first
option, say **"yes"** over it.

Should: take the first option and record it.
Should not: keep listing; ask again; record nothing.

*This is the one most likely to fail — "yes" arriving mid-question is exactly
where turn-taking breaks.*

### 3 — Say "wait" mid-line

Start **"four hundred coach…"** then say **"wait"** before finishing.

Should: stop, say "OK", go quiet. Nothing recorded. Then say **"carry on"** or
just start the line again and it should pick up.
Should not: record 400 of anything; keep asking what the item was.

### 4 — Ask for the total mid-count

Say **"total"**.

Should: read the lines back — item, number, unit. Then stop.
Should not: read the value in euro unless you asked for it; summarise; offer to
do anything.

### 5 — An item that is not on the sheet

Say **"forty two gopher wrenches"**.

Should: "Not on the sheet." Then silence.
Should not: guess the nearest thing; record anything; ask you to repeat it three
times.

*Then immediately say a real line — line 7 above — and check it still works. A
refusal must not leave it stuck.*

---

## What to send back

- Both CSVs from *What the app heard*.
- For the ten lines: how many landed first time on each engine.
- For the five interruptions: which of the five behaved, and for any that did
  not, what it did instead.
- Anything that felt slow. Latency is not in the log and it is the thing most
  likely to make a counter give up.

## Things that are known and not worth reporting

- The chime happens on tap; if the phone is silent, check the ringer switch
  before anything else.
- **The call is already connected before you tap.** Opening the Count tab dials
  Vapi with the microphone muted so the tap feels instant; the tap only unmutes.
  An untapped call is dropped after two minutes and re-dialled the next time you
  land on the tab.
- The mic pulses while the session is live. It stops pulsing when the session
  ends — including when the assistant's **max call duration** runs out, which is
  the most likely reason it stops mid-count. Tap it again.
- Pause does not end the call; it stops recording. Billing continues. Tap the
  mic **off** between locations if cost matters.
- Every tool the model calls is a row in *What the app heard* with its arguments
  and its result. If a line does not land, that is the first place to look — no
  `tool` rows at all means the dashboard is not sending tool calls to the
  browser (see `agent/README.md`, step 1).
