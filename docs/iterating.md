# Iterating on TruCount with Claude Code

A short guide for driving changes to this repo. Written for someone who has not used
Claude Code before.

## The one thing to understand

You do not have to describe *how* to make a change. Describe **what should be different**,
and let the work happen. `CLAUDE.md` is read at the start of every session, so the product
context, conventions and roadmap are already known — you do not need to re-explain TruCount
each time.

## Starting a change

Say what you want in plain language. Useful shapes:

- **A behaviour change** — "When a counter says a quantity that's more than double the last
  count for that spot, ask them to confirm before accepting the line."
- **A bug** — "Saying 'twenty four' on the Data tab picks the wrong item. Reproduce it and fix it."
- **A question first** — "How does disambiguation decide which word to ask about?" Ask before
  changing when you are not sure what you want.
- **An experiment** — "Try three different layouts for the rollup table and show me screenshots."

Vague asks get vague results. "Make the count screen better" is worse than "The count screen
puts the job selector above the location picker, but counters pick location first. Swap them."

## Reviewing a change

Every change should come back with evidence it works. Ask for it if it does not:

- "Show me a screenshot of that."
- "What did you test?"
- "Show me the diff."

The prototype has no test suite, so screenshots and a described manual check are the evidence
available today. Extracting `parse()` into a testable module (roadmap item under Testing in
`CLAUDE.md`) is what changes that, and it is worth doing early because parsing is where
regressions hide.

## Branches and iterations

Each round of work goes on its own branch, and the branch name is worth choosing so you can
find it later — `voice-confirm-large-counts` beats `changes-2`. Ask for a branch per idea when
you want to try two directions and compare, rather than stacking both onto one.

If you want an iteration thrown away, say so — "drop that, go back to how it was" — rather than
patching over it. Reverting cleanly is cheaper than layering fixes on a direction you have
already decided against.

## Things worth saying out loud

- **"Don't do X"** is as useful as asking for something. "Fix the spacing but don't touch the
  parser" keeps a change small and reviewable.
- **"Ask me first"** — for anything where you want to see the plan before the code exists.
- **"This is a spike"** — if you want something quick and rough to look at, say so, otherwise
  the work will be done to keep.

## What not to change casually

From `CLAUDE.md`, the conventions that will quietly break things if ignored:

- No `prompt()`, `alert()` or `confirm()` — they fail silently in the hosting frame.
- Colours come from CSS custom properties; use `--accent-ink` and `--accent-hdr` for text,
  never raw `--accent`.
- The page must open in a working state with example data — never an empty shell.
- Irish spelling and `en-IE` formatting throughout.

## Running it

No build, no install. Open `index.html`, or serve it so the microphone works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Voice needs `https://` or `localhost`. Where speech recognition is unavailable, the typing box
takes the same phrases.
