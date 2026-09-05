# TruCount

Voice stocktaking for vans, stores and yards. An X3T product.

## Run it

Open `index.html` in a browser. That's it — no build, no install.

Voice needs a secure context, so for the microphone to work either open it over
`https://`, or serve it locally, which counts as secure on `localhost`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Chrome on Android and Safari on iOS both support the voice mode. Desktop Chrome works
too. Where speech recognition isn't available there's a typing box that takes exactly
the same phrases.

## Try it in two minutes

1. **Data** tab → drop in `sample-data/TLI-location-register-sample.csv` → **Replace register**.
   That loads 20 vehicles and five named locations, each with its own shelf list.
2. **Count** tab → tap the mic, or use the typing box, and say:
   - `reg number two six one D one two eight four four` — picks the van off the register
   - `shelf A1`
   - `three full drums of ninety six fibre` — converts to 12,000 metres
   - `drum A B C D one, eight hundred metres` — keeps the drum ID with the part length
   - `total`
3. **Rollup** tab → the count rolls up by customer, location and item.
4. Tap the role chip in the header, PIN `1234`, to see the owner's view — every counter,
   every job, and what's still to count.

To test the disambiguation, import `sample-data/nbi-items-ambiguous-sample.csv` and say
`four hundred coach screws`, then `twelve fibre eight hundred metres`.

## Where things live

Everything is in `index.html`. Roughly in order down the file:

| Section | What's in it |
| --- | --- |
| `<style>` | Design tokens, light and dark themes, all components |
| Place types & catalogues | `BASE_PLACES`, `CATALOGUES`, seed jobs and sessions |
| State | `load()` / `save()`, localStorage shape |
| Branding | `brandFor()`, `applyBrand()`, auto colours and monograms |
| Units & numbers | `sing()`, `baseQty()`, number-word parsing, `trimNum()` |
| Matching | `extractAll()`, `distinguishers()`, `parse()` |
| Location register | `matchPlace()`, `placesFor()` |
| Session | `addLine()`, `resume()`, `doFinish()` |
| Voice | speech recognition, `MediaRecorder`, IndexedDB clips |
| Conversation | `handle()`, `askChoices()`, `resolvePick()` |
| Rendering | count screen, rollup tables, data tab |
| Import | `FIELDS`, `analyse()`, `doImport()`, `importPlaces()` |

Read `CLAUDE.md` for the product context and the roadmap, and `docs/iterating.md`
for how to drive changes to this repo with Claude Code.

## Storage

- `localStorage` key `trucount.v1` — counts, catalogues, registers, branding, settings.
- IndexedDB `trucount-audio` — one audio clip per spoken line.

Clearing site data resets everything. There is no server.
