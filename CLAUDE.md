# TruCount — project brief

Read this first. It is the context you need to work on this codebase.

## What this is

TruCount is a **voice-driven stocktake app** for field inventory. A counter opens it on a
phone, taps the mic, and speaks the count — *"ten cases of Coke"*, *"three full drums of
ninety six fibre"*, *"drum A B C D one, eight hundred metres"*. The app parses it, converts
pack sizes, reads the line back aloud, and keeps running totals per spot → per location →
per customer → per estate.

It is a product of **X3T**. The intended first customers are fibre build contractors working
on Ireland's National Broadband Plan, who between them run several hundred vans of stock and
count them on paper today. A second vertical is pubs and bars, where the same engine runs
against a drinks catalogue.

Strategically it is the **capture layer** for a sister forecasting and ordering product.
TruCount's job is to make the stock position live and first-hand instead of a monthly
spreadsheet that arrives three weeks late.

## Current state — read this before changing anything

`index.html` is a **single-file prototype**, roughly 2,500 lines: HTML, CSS and vanilla JS in
one document, no build step, no dependencies except SheetJS from a CDN for `.xlsx` import.
It runs by opening the file in a browser. All state is in `localStorage` (key `trucount.v1`)
plus IndexedDB (`trucount-audio`) for the voice clips.

It was built fast to prove the interaction, and it works. It is **not** the architecture to
scale — see "Where to take it" below. Do not treat the single file as a constraint to respect;
treat it as a specification of behaviour that must survive a rewrite.

### What works today

- **Voice capture.** Web Speech API (`webkitSpeechRecognition`) for recognition, `speechSynthesis`
  for readback. Both on-device, which is deliberate: it keeps working with no signal, which is
  most of the estate these customers care about. Hands-free continuous mode — tap once, keep talking.
- **Parsing** (`parse()`): number words including "and" ("one thousand two hundred and fifty"),
  pack-size conversion, drum IDs with part lengths, Irish and UK registration plates spoken as
  digits and letters, shelf codes, location commands, undo/total/finish.
- **Disambiguation.** When a phrase matches more than one item, it asks — out loud and on screen —
  and works the question out by diffing the candidates' descriptions. *"four hundred coach screws"*
  against two SAP codes produces "Which one — 360 or 500?"; *"twelve fibre"* against UG and OH
  variants produces "Which one — underground or overhead?". Answers can be an ordinal, a
  distinguishing word, or the code. See `distinguishers()`, `askChoices()`, `resolvePick()`.
- **Flexible import.** CSV/XLSX item master where columns arrive in any order under any heading
  (SAP code, material number, invoice code, part number…). It finds the header row wherever it sits
  in the file and guesses every column, then shows the guesses for correction. Same importer
  handles the location register and shelf lists. See `FIELDS`, `analyse()`, `renderMap()`.
  The item master is read from six columns, matched case-insensitively in any order: `Item code`,
  `Description`, `Product Group`, `Unit value`, `Pack size`, `Unit of measure`. **A missing column
  never fails the import** — every one of them is optional except the item code. After each import
  the app reports which of the six were found (and under which heading in the file) and which were
  missing, along with how many rows landed in Unassigned and how many items have no unit value.
  See `EXPECTED_COLS`, `columnReport()`.
- **Count sheet.** A *Sheet* tab holds a grid for the location selected on the Count tab: rows grouped
  by Product Group with a subtotal per group, and columns Part code, Description, UoM, Pack size,
  **Contractor count**, **NBI count**, **Difference**. Product Group is the group header rather than a
  repeated column, and on a phone the code, UoM and pack fold into a sub-line under the description;
  above 760px they get their own columns. Counts are typed straight into the cells — Enter or Tab
  moves down the column, Shift reverses — and a device may only edit its own role's column.
  Difference is NBI − Contractor, live, shown only once both sides have counted; a non-zero row is
  highlighted and its figure opens a note with a *Recounted* flag.
  **Voice and typing are the same grid**: every line records the role that entered it, so a spoken
  count fills that role's column, and *Dictate* on the sheet drives the same recogniser. A typed
  number replaces that role's typed lines for the item; drum lines are left alone.
  **Add item** takes material that is not in the catalogue, files it under Unassigned and flags it
  for NBI to classify. **Cable drums**: fibre items get a Drums sub-row of drum identifier and length,
  one line each; the item's count is their total, the count cell is read-only, and the drum lines are
  kept so they can be exported. See `renderSheet()`, `setCount()`, `addDrum()`, `setDiffNote()`,
  `addSheetItem()`, `isDrumItem()`, `curRole()`.
- **Contractor count, then NBI witness count.** A location is counted by the contractor, who
  **submits** it — their column locks. NBI then witnesses it **blind**: until they submit their own
  figures, every contractor cell reads `•••`, including the ones with no count, so they cannot even
  tell which items were counted. On NBI's submit both columns and the difference appear, to both
  roles. Neither role can ever edit the other's column. NBI may **Reveal** the contractor count
  early, which is recorded against the location, and may **Reopen for recount**, which clears both
  submissions and is also recorded. Location status follows this: Not started → Counting →
  Contractor counted → Witnessed → Closed.
  **Closing a job requires every registered location to have a submitted contractor count** — the
  confirm names the ones outstanding and the button stays disabled — and warns, listing them, about
  locations that were never witnessed. The snapshot carries the submission, reveal and reopen record
  per location. See `isSubmitted()`, `isBlind()`, `submitLocation()`, `revealCount()`,
  `reopenLocation()`, `renderSheetState()`, `jobReadiness()`.
- **Product groups.** Every item carries a Product Group. For the fibre / NBI catalogue the list is
  fixed — see `PRODUCT_GROUPS`, 17 entries, some of which deliberately share a number prefix
  (`06. Duct` and `06. Sub Duct`). Matching is on the text, case- and punctuation-insensitive, and
  works with or without the number prefix ("Poles" finds "01. Poles"); `&` and "and" are equivalent.
  Anything unrecognised or blank goes to a visible **Unassigned** bucket and is never dropped.
  Outside the fibre catalogue there is no fixed list, so whatever the file says is kept as written.
  See `matchGroup()`, `groupOf()`, `groupCmp()`.
- **Stock value.** Every item carries a Unit value in euro. Stock value is counted quantity in base
  units × unit value, and is shown everywhere a quantity is — the count screen, the estate rollup at
  contractor, location and item level, the by-item table, and the catalogue. An item with no unit
  value contributes zero and is marked with an asterisk so a total is never quietly understated.
  The Rollup tab breaks stock value down by Product Group under each contractor, with quantity and
  euro on every row, and the CSV export carries the same breakdown. Quantity is kept per base unit
  rather than summed across metres and each. See `unitValue()`, `valCell()`, `qtyByUnit()`, `eur()`.
- **Location register.** Counts must land on a registered vehicle reg or named location, each with a
  type, a contractor and the **DA it is served from** (DA008 and so on). Unregistered ones are
  challenged with the nearest matches. The picker is **strictly scoped to the place type** — a
  registration never appears under Store, or the reverse — and searches label, registration and DA.
- **A job is a list of locations.** The count screen carries a *Locations in <job>* list for the
  contractors in view: name, type, contractor, DA, spot count, and a status of Not started /
  Contractor counted / Witnessed / Closed, with a progress line ("12 of 25 locations counted"). It is
  searchable by name, registration, DA, type or contractor, and capped at 60 rows with a prompt to
  narrow further. Tapping a location selects it for counting **and sets the contractor from the
  location** — the location decides whose stock it is, not a separate dropdown. Witnessed depends on
  the witness flow, which is not built yet, so nothing reaches that state today.
  See `placesInView()`, `locStatus()`, `renderJobLocs()`, `pickJobLoc()`.
- **Registration by voice.** A mic beside the registration field takes a spoken reg. What is heard is
  normalised — spaces, dashes and the spoken word "dash" stripped, uppercased, spoken digits turned
  into numbers, so "one eight two D one two four five six" becomes `182D12456`. That is matched
  against the register for the selected customer: an exact match is selected and read back; one
  character out asks "Did you mean 261-D-12844?" with inline Yes / No; anything else says not found
  and falls back to the dropdown. **A spoken registration never creates a vehicle** — it can only
  select something already on the register. Say plates digit by digit; compound number words
  ("twelve thousand three hundred") are not converted and will simply fail to match.
  See `regFromSpeech()`, `lev()`, `regVoiceMatch()`, `resolveRegVoice()`, `regListen()`.
- **Editable place types per customer.** Delete "Outside store", add "Cold room" — persists for that
  business and voice picks it up immediately.
- **Roles.** Two roles, **NBI** and **Contractor**, switched from the chip in the header. No login and
  no PIN — it is a client-side switch to demonstrate the model, and it is **not** security.
  A contractor is fixed to their own stock and the fibre catalogue: the Catalogue and Counting-for
  controls are hidden, and every view is filtered to their org. For NBI, **Counting for is a
  multi-select** — tick one, several, or All, like an Excel column filter — and Rollup and History sum
  whatever is ticked. It offers every contractor on the register or holding counts, so a filter can
  never hide data that exists. Views are scoped by catalogue as well as contractor, so an NBI estate
  total is fibre stock and does not quietly absorb a pub.
  The banner says whose stock is on screen, not who you are: for NBI it reads `NBI · Viewing: TLI
  Group` (or *3 contractors*, or *All contractors*), keeping the contractor's own logo and colours
  when exactly one is in view, and a neutral badge otherwise. For a contractor it is just their own
  name and logo, with no Viewing label. "Already counted for…" carries the same framing.
  See `me()`, `isNBI()`, `viewOrgs()`, `viewLabel()`, `visible()`, `applyRole()`, `renderScope()`.
- **Moving counts between devices.** Counts live on the device that made them. There is no server, so
  **NBI's All contractors total is only as complete as the files imported onto that device.** As a
  stop-gap, Data → *Moving counts between devices* has **Export job** (writes the selected job's
  sessions as JSON, carrying the item records — description, group, unit, pack and unit value — so the
  receiving device can describe and value them) and **Import job** (merges sessions, skipping any id
  already present, and adds the job, any unknown items and any new contractor). Re-importing the same
  file changes nothing. See `exportJobFile()`, `importJobFile()`, `saveFile()`.
- **Jobs.** Counts belong to a named job (month-end, daily, etc.) with progress against a target.
  The job dropdown on the count screen ends in **+ New job…**, which opens an inline form — name,
  type (Month end / Mid-year / Year end / Ad hoc) and date — and the job it creates becomes the
  selected one. Note the older job admin on the Data tab still offers its own type list
  (Month end / Daily / Weekly / Spot check / Ad hoc); the two lists have not been reconciled.
- **Closing a job, and History.** *Close job* sits beside the job dropdown on the count screen. It
  shows what is about to be frozen — lines, locations, contractors, value — and on confirmation takes
  a **snapshot**: every line of every session on that job, with the item's description, product group,
  unit, pack and unit value all *copied in at close time*. The job then drops out of the active
  dropdown and appears on the **History** tab with its name, date closed, contractors, total lines,
  total quantity and total value. Opening one shows the full rollup — contractor, location, item, and
  the product-group breakdown — drawn entirely from the snapshot and never from the live catalogue,
  so a later price change or a new count cannot move a closed number. An open count on the job is
  finished first so its lines make the snapshot. Closed jobs live in `S.closed` and are never pruned,
  so they persist year over year. See `buildSnapshot()`, `doCloseJob()`, `renderHistory()`,
  `renderHistoryDetail()`.
- **Audio evidence.** Each spoken line is recorded (on by default, switchable) and played back
  against the line. Stored in IndexedDB.
- **Reconciliation.** Import a file with an expected-quantity column and every count is compared
  line by line.
- **Per-customer branding.** Each customer gets a colour and badge that themes the whole app; a real
  logo can be uploaded to replace the generated one. A sample logo is embedded as a seed.

### Conventions that matter

- Irish spelling and en-IE formatting throughout (`metre`, `colour`, `toLocaleString('en-IE')`).
- Copy is written in the customer's language, not the system's: "vehicle", "yard", "spot", "counter".
- The page must open in a working state with example data visible, never an empty shell.
- Light and dark themes are both first-class; every colour comes from a CSS custom property, and
  `--accent` is overwritten at runtime with the selected customer's brand colour. `--accent-ink`
  and `--accent-hdr` are derived cuts for text on light surfaces and on the dark header — use those
  for text, never raw `--accent`.
- **No `prompt()`, `alert()` or `confirm()`.** They are blocked in the hosting frame and fail
  silently. Everything is inline UI.

## Where to take it

Roughly in order. Items 1–3 are the ones that turn this from a demo into something sellable.

1. **Split the file and add a real backend.** Suggested: a small API (Node/Fastify or Python/FastAPI)
   with Postgres, and the front end as a PWA. The data model is already implicit in the prototype:
   `customers`, `locations` (with `spots`), `items`, `jobs`, `sessions`, `lines`, `clips`, `users`.
   Offline-first must survive the move — local writes first, sync when there's signal, never block
   the counter on a network call.
2. **Real authentication and multi-tenancy.** The role switch is a demo. An account owner, counters
   under them, and hard isolation between customers. Export/Import job is a hand-carried stand-in for
   the real thing; replacing it needs, roughly: accounts and org membership with server-enforced
   isolation; a sync endpoint the phone posts sessions and lines to, keyed by a stable client id so a
   retry cannot double-count; an outbox on the device so a counter is never blocked without signal;
   a per-line conflict rule with the device clock recorded, since two people can count the same van;
   and a read model for NBI that aggregates across contractors without giving one contractor sight of
   another. The frozen-snapshot rule from a closed job has to hold server-side too.
3. **Supervisor sign-off.** A count is not final until approved. This is what makes the number usable
   in a contract dispute, and it is the feature that gets it past procurement.
4. **A count sheet.** Show the counter last month's lines for this location as a checklist so nothing
   is missed. Biggest single accuracy win.
5. **Variance alerts at the moment of counting** — "that's 18 down on last count, is that right?"
6. **Transfers between locations** — one movement, two locations updated. This is where it stops being
   a stocktake app and becomes stock control.
7. **Cloud speech tier.** On-device recognition stays the floor. Add an optional cloud engine
   (Deepgram or similar) with the customer's part codes loaded as boosted vocabulary, used when
   there is signal, to re-score for accuracy. Accent handling comes from the vocabulary, not the vendor.
8. **Photo against a line.**
9. **Two people counting the same location at once.**
10. **A desk dashboard** separate from the phone app, for an owner looking at 150 vans.

## Sample data

`sample-data/` has three files, all real-shaped, all exercising the importer:

- `TLI-location-register-sample.csv` — 20 Irish vehicle registrations plus named locations, each with
  its own shelf list. Junk rows above the header, on purpose.
- `Powers-item-master-Jul-2026.csv` — 123 items from a pub drinks catalogue, with closing stock
  and pack conversions (88 pints per 50L keg, 20 measures per 70cl bottle), across 14 product
  groups.
- `nbi-items-ambiguous-sample.csv` — deliberately ambiguous items for testing disambiguation:
  two coach screws differing only by a number, and 12 Fibre UG vs OH.

## Testing

There is no test suite. The parser is the part that most needs one — `parse()` is pure and easy to
test in isolation. A good first task is to extract it into a module and put a table of spoken
phrases and expected outputs around it. The behaviours listed under "What works today" are the
specification; every one of them was verified by hand and should stay verified.
