---
description: Run the TruCount test suite (all suites, or the ones matching your arguments)
---

Run the test suite and report the result.

```
cd $(git rev-parse --show-toplevel) && node test/run.js $ARGUMENTS
```

If `playwright-core` is missing, run `npm install` first — it is a devDependency
and the app itself has no dependencies.

`$ARGUMENTS` is an optional filter matched against suite filenames, so
`/test agent` runs `50-agent.js` and `51-agent-context.js`, `/test voice` runs
the voice suites, and `/test` with nothing runs all of them.

Report: the per-suite counts, the total, and every failing assertion verbatim.
Do not summarise a failure as "a test failed" — the assertion text names the
behaviour that broke and the detail string usually contains the actual value.
If a suite crashes rather than failing, say so separately: a crash means the
harness could not run, which is a different problem from a behaviour regression.
