# Field test — the agent, on a phone, on a real shelf

Two passes over the same fifteen cases. Once on the agent, once on Scribe
(clear the **Agent ID** box in Data → Voice engine and Save to drop a tier).
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
| 1 | "three full drums of ninety six fibre" | one line, readback "96F fibre drum. Three drums." | pack words — a drum is 4,000m and the app must do that, not the agent |
| 2 | "eight hundred and fifty metres of forty eight fibre" | 850 | the long number form |
| 3 | "drum A B C D one, one thousand two hundred metres" | 1,200m against drum ABCD1 | the drum ID as letters, not a word |
| 4 | "six nine metre poles" | 6 poles | two numbers in one phrase — 6 is the quantity, 9 is part of the name |
| 5 | "twelve coils of thirty two duct" | 12 coils | "thirty two" is the product, not the count |
| 6 | "four boxes of cable hangers" | 4 boxes | box → 100 each |
| 7 | "two manhole covers" | 2 | plain |
| 8 | "seven connection kits" | 7 | plain |
| 9 | "one thousand two hundred and fifty fixing screws" | 1,250 | the longest number |
| 10 | "three twenty four way closures" | 3 | "twenty four way" is the name, 3 is the count |

Then **"read total"**.

**The number that matters:** how many of the ten landed first time, on each
engine. Everything else is texture.

---

## The five interruption cases

These are the ones that decide whether it is usable on a ladder.

### 1 — Talk over a readback with "no"

Say **"ten nine metre poles"**. The moment it starts reading back, say **"no"**
over the top of it.

Should: stop talking mid-word, remove the line, say something like "Removed",
and listen again.
Should not: finish the sentence first; record a second line; hear "no" as part
of the next item.

*Check the sheet — there must be no 10-pole line left.*

### 2 — Say "yes" two words into a question

Say **"350 ml pole bolt, four hundred"**. It should ask which item. As soon as
you hear the first option, say **"yes"** over it.

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

- The chime and "Go" happen on tap; if the phone is silent, check the ringer
  switch before anything else.
- The mic pulses while the session is live. It stops pulsing when the session
  ends — including when the plan's **max conversation duration** runs out, which
  is the most likely reason it stops mid-count. Tap it again.
- Pause does not end the agent session; it stops recording. Billing continues.
  Tap the mic **off** between locations if cost matters.
