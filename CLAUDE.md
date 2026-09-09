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

- **Three engines, in tiers: Agent, then Scribe, then the browser.** The chip names the one
  actually running and goes amber the moment it is below the tier the settings ask for.
  - **ElevenLabs Agents is the top tier and owns the conversation.** Turn taking, interruptions,
    stop words and barge-in are the agent's job, not ours — the hand-built half-duplex machine
    below it is what runs when there is no agent. The SDK is loaded as the `@elevenlabs/client`
    IIFE build (global `ElevenLabsClient`), which is the only form a page with no build step can
    use. The Worker mints a short-lived conversation token from `/agent-token`; the key never
    reaches the browser. Set the agent up with `agent/README.md`; its system prompt is versioned
    at `agent/system-prompt.md` and must be kept in step with the dashboard.
  - **The tools are the only way the agent can touch data.** `AGENT_TOOLS` — `find_item`,
    `record_count`, `undo_last`, `set_location`, `read_total`, `pause`, `resume`, and in review
    `next_line`, `confirm_line`, `correct_line`, `jump_to`. The agent never matches an item, never
    converts a unit and never invents a code: `find_item` runs the app's own matcher and returns
    candidates with a confidence, `record_count` refuses an unknown code or a non-numeric quantity,
    and the unit conversion happens here. Every tool goes through `tool()`, which logs the call,
    its arguments and its result with a timestamp into *What the app heard*.
  - **The agent is told what it could not have heard.** `agentContext()` wraps the SDK's
    contextual update: which contractor and location the count is under when the session opens,
    that a review has started or stopped, that the location changed. It is context, not a turn —
    the agent does not answer it. `agentSay()` pushes text in as a user turn, which is how the
    typed box drives the real tools in an automated run rather than a parallel path.
  - **Ending a walk is not hanging up.** `endWalkListening()` stops our own recogniser but leaves
    an agent conversation running: the counter is still standing there and may carry on counting.
    Only `stopListen()` ends a session.
  - **While the agent runs it owns the voice and the microphone.** `speakThen()` returns silently
    and `openEar()` refuses to open. Anything that speaks or listens must respect `AGENT.on`.
- **Voice capture, the fallback engines.** **ElevenLabs** is the good ear: Scribe v2 Realtime over a
  WebSocket for listening, and ElevenLabs text-to-speech (voice `IQjnnInWsKbdAesop75D`) for every
  readback. The **browser's own engine** (`webkitSpeechRecognition` + `speechSynthesis`) is the
  floor and the fallback — it is what runs when no proxy is set, when the proxy is unreachable, or
  when the socket drops mid-count. Falling back is silent to the workflow and loud on screen: the
  chip under the mic always names the running engine and, when it is the browser, why. Either way
  it is hands-free continuous — tap once, keep talking — and the browser path keeps working with no
  signal at all, which is most of the estate these customers care about.
  - **The API key is never in `index.html`.** It lives in a Cloudflare Worker (`proxy/worker.js`)
    that exposes three routes: `/health`, `/stt-token` (mints a 15-minute single-use token so the
    phone opens the Scribe socket itself — audio never round-trips the Worker) and `/tts`.
    `proxy/README.md` is the ten-minute setup. Configure it in **Data → Voice engine**; the config
    lives in `S.voice` as `{proxy, token, prefer}`.
  - **Keyterms.** Every listening session sends a boosted vocabulary, spent nearest-first
    across the **50 terms of 20 characters** the realtime API allows: the command words, then
    the rows either side of the one being read, then the rest of that group, then the group the
    walk is about to enter, then the group names, then whatever still fits. The spoken form
    wins over the printed one — the catalogue's first `alias` ("ninety six fibre") rather than
    its description — because the counter says the former. Only words a parser actually acts on
    go in `CMD_TERMS`: boosting a word the app then fails to understand turns a misheard line
    into a *confidently* misheard one. See `keytermsFor()` and `spokenFor()`.
  - **Keyterms are fixed for the life of a socket** — they go up in the query string. So the
    rotation only happens if the socket is reopened when the set changes. `keytermSig()` changes
    exactly when it would, and `retuneListening()` reconnects on that, debounced and never
    mid-sentence: a handful of reconnects per sheet, never one per row. A reconnect sets
    `VOICE.retuning` so the close is not mistaken for a dropped connection.
  - **Half duplex, always. One utterance, one line.** The ear is open or the mouth is, never
    both — `TURN` is `shut · open · thinking · speaking` and `openEar()`/`closeEar()` are the only
    ways through it. Listening continuously is what let a readback out of the speaker and back in
    the microphone: a real transcript read *"9m hole 350 each confirmed no no 350 each"* — the
    counter's words, the app's own "confirmed", and the correction, all one line. So: listen,
    close on the end of the utterance (VAD commit on ElevenLabs, `continuous=false` on the
    browser), think, speak, then reopen after a beat. `speakThen()` closes the ear before it makes
    a sound and reopens it when the sound stops. Nothing else may open a recogniser.
  - **Never let the app's own close look like a failure.** `closeEar()` sets `VOICE.closing`
    because it shuts the socket at the end of *every* turn; without that flag the close handler
    read it as a dropped connection and demoted the session to the browser engine after the first
    spoken line — ear and voice both. That is what "it still sounds like the robotic browser
    voice" was. The same trap exists for `VOICE.retuning`.
  - **Interrupting.** With the ear shut there is no microphone barge-in; tapping the mic during a
    readback stops it and listens instead. Readbacks are kept to *item, number, unit* so there is
    little to talk over.
  - **Stop words and taking a line back.** `"pause" / "wait" / "hang on" / "stop"` halt everything
    and hold. `"no" / "no no" / "wrong"` **straight after a readback** deletes that line
    (`LASTLINE`) and re-listens. Both are matched in `onHeardFinal()` *before* the parser sees the
    words, so a correction can never be read as an item or a quantity, and each is its own
    utterance in the log rather than being appended to the previous one.
  - **Pause is a real control.** A thumb-sized button beside the mic, and the spoken word does the
    same thing. While paused the microphone is shut and `onHeardFinal()` drops everything: nothing
    is recorded until it is tapped again.
  - **Audio has to be unlocked by a tap.** iOS refuses audio a page starts by itself, which sends
    every ElevenLabs readback to the browser voice. `primeAudio()` plays a silent clip inside the
    tap that starts listening. Keep it on every entry point.
  - **What the app heard.** Every final transcript is logged to `S.vlog` with the engine that
    heard it, **the engine that spoke the readback** (`LASTSPOKE` — the two are not always the
    same, and only the second one tells you why it sounds robotic), and whether the parser could
    use it, classified by re-running the pure parser (`outcomeOf()`). Data → *What the app heard*
    shows the hit rate per engine and exports CSV. A field trial has to produce a number, not a
    feeling. Typed input is never logged — it is not something the ear produced, and counting it
    would flatter the rate.
  - **The chip never flatters.** Green only when ElevenLabs is doing both jobs and nothing has
    fallen back this session; **amber** the moment the voice drops to the browser while the ear
    stays on ElevenLabs, with the reason on the chip. `VOICE.degraded` latches until the next
    successful probe. Data → *Voice engine* also lists the keyterms actually sent with the last
    session, so "are they really going up?" is answerable on the phone.
- **Parsing** (`parse()`): number words including "and" ("one thousand two hundred and fifty"),
  pack-size conversion, drum IDs with part lengths, Irish and UK registration plates spoken as
  digits and letters, shelf codes, location commands, undo/total/finish.
- **Never guess an item.** A match has to explain most of what was said. `identifying()` throws
  away the quantity, the number's own scaffolding (*hundred*, *and*), the unit and the filler, and
  what is left is scored by `matchItemAll()` against the whole utterance: mostly how much of what
  they said the item accounts for, partly how much of the item's own name they got through. Under
  `MATCH_BAR` (0.55), or within `MATCH_TIE` of the runner-up, it asks **"Which item?"** and shows
  the three closest rather than recording anything. The bar applies however the item was found —
  an exact phrase or an alias used to walk straight past it, which is how *"350 ml pole bolt"*
  became 350 poles on the strength of the one word "pole", and how *"nine m hole 350 each"*
  reached an MDU Fibre Retraction Tool because the word "each" appears in its description. Never
  match on the number alone: with no identifying words there is no candidate list at all.
- **Disambiguation.** When a phrase matches more than one item, it asks — out loud and on screen —
  and works the question out by diffing the candidates' descriptions. *"four hundred coach screws"*
  against two SAP codes produces "Which one — 360 or 500?"; *"twelve fibre"* against UG and OH
  variants produces "Which one — underground or overhead?". Answers can be an ordinal, a
  distinguishing word, or the code. See `distinguishers()`, `askChoices()`, `resolvePick()`.
- **The item master is editable in the app.** Data → Item master is a table with a search box, an
  Edit button leading every row (the table is wider than a phone, so a button at the far right could
  not be reached), Add item, and Export to Excel in the shape the importer reads back. Every field is
  editable including **Spoken as** — comma-separated phrases that go into the ElevenLabs keyterms on
  the next listening session, so a word added here improves recognition immediately. `spokenAll()`
  sends *all* of them, not just the first.
  - Editing a built-in item writes an override into `S.custom` that keeps the built-in's position in
    the list rather than jumping to the end; deleting one leaves a tombstone in `S.deleted` so it
    stays deleted. `upsertItem()` and `deleteItem()` are the only ways in.
  - **An upload merges; it does not overwrite.** *Add to existing* matches on item code, updates the
    fields the file carries, and adds new rows — but a field the owner changed by hand is remembered
    in `it.edited` and wins over the file, and spoken-as words are **unioned** rather than replaced.
    A monthly supplier export must never quietly undo the words that make the voice work. Only
    **Replace item master** clears all of that, which is what its label says.
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
- **Count sheet — driven by an uploaded file, not the catalogue.** The *Sheet* tab shows the sheet
  that was uploaded for the selected location: **every column exactly as uploaded, in the file's
  order**, read-only, with **exactly one editable column** — the count column for the role that is
  counting. The sheet can be a different shape every time; nothing about it comes from the catalogue.
  The header block sets which location the sheet belongs to, and creates it under the right
  contractor if it is new. Where no sheet has been uploaded for a location, the tab falls back to a
  catalogue-driven grid so voice-only counting still has somewhere to show.
  It behaves like a spreadsheet: header row fixed, **first column frozen** so the item stays in view
  while you scroll out to the count, rows grouped by the file's own Product Group column with a
  subtotal per group, numbers right-aligned, Enter or Tab down the count column and Shift to reverse.
  The search bar filters live on **any** column — a bin number as readily as a part code — and
  clearing it restores the sheet.
  The count column is detected from its heading (Physical Count, Witness Count, NBI Count). A lone
  `Count` is ambiguous about role, so the app asks once and **remembers that answer for any sheet with
  the same columns** (`S.sheetLayouts`, keyed on the normalised header row).
  Difference is NBI − Contractor, live, appearing as an extra column once a row has both; a non-zero
  row is highlighted and its figure opens a note with a *Recounted* flag.
  See `uploadedSheet()`, `countColFor()`, `renderUploadedSheet()`, `renderColAsk()`.
  **Voice and typing are the same grid**: every line records the role that entered it, so a spoken
  count fills that role's column, and *Dictate* on the sheet drives the same recogniser. A typed
  number replaces that role's typed lines for the item; drum lines are left alone.
  **Add item** takes material that is not on the sheet, appends it at the bottom under Unassigned and
  flags it for NBI to classify. **Cable drums**: fibre rows get a Drums sub-row of drum identifier and
  length, one line each, in the row's own unit; the row's count is their total, the count cell is
  read-only, and the drum lines are kept so they can be exported. See `renderSheet()`, `setCount()`, `addDrum()`, `setDiffNote()`,
  `addSheetItem()`, `isDrumItem()`, `curRole()`.
- **Walking the sheet by voice.** *Review* on the Sheet tab, not a separate screen: the grid stays on
  show, the current row is highlighted and scrolled to, and the numbers change as they are spoken. It
  walks the **uploaded sheet's own row order**. Two ways in — *Walk me through*, which reads each line
  ("Coach screw 75 millimetre, box of 200 — currently 400") and waits, or a **jump**, by saying an
  item name at any time. After a line you can say a number, `next` / `yes` / `correct` to keep it,
  `skip`, `zero`, `back`, `pause` or `stop`.
  A number with a unit is converted to the row's own unit and read back in it — "86,000 metres" on a
  KM row is stored as 86 and spoken as "86 kilometres". A phrase that is not all number words is a
  jump, so "twelve fibre overhead" goes to the 012F aerial row rather than counting twelve.
  An ambiguous name asks the short question that separates the candidates ("Which one — 75 or 100?")
  and accepts the answer as words, digits, an ordinal or a code; anything that is not an answer is
  taken as a fresh instruction rather than asking again forever. No match says so and stays put.
  Options before starting: **all lines** or **only lines with a count**, and readback off for text
  only. Progress reads "row 2 of 5"; pause stores the position in `S.review` so it survives closing
  the app. Every count set in review is marked **changed in review** on the sheet and captures the
  audio clip like any other line.
  **It only ever reads back your own role's column**, so a blind witness count stays blind out loud
  as well as on screen. Speech is guarded by a watchdog, so a device with no usable voice cannot
  leave the walk stuck waiting on it. See `reviewStart()`, `reviewHeard()`, `reviewParse()`,
  `reviewFind()`, `pickFromAnswer()`, `toRowUom()`, `sayThen()`.
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
- **NBI count sheets, in and out.** Data → *NBI count sheets* reads a filled KN02 workbook as it
  stands. It finds the header block wherever it sits (a label cell with its value to the right or
  below) to set contractor, location, DA, witness name and sheet number; finds the item header row by
  its Physical Count column; reads Physical Count into the contractor column and Witness Count into
  NBI's; and reads the Cable Drums sheet into drum lines. **Drums win over the sheet's own figure**
  for their item, so a drummed item is counted once, and a disagreement between the two is reported.
  Unknown items are added with their group, and the location is added to the register if new. A filled
  sheet is a completed count, so it arrives already submitted for whichever columns had figures.
  Re-importing the same file changes nothing. A contractor device refuses another contractor's sheet.
  The report names every header field found or missing, the counts placed, items and groups added,
  rows skipped, drums that could not be placed, and anything worth checking.
  **Export** writes the same layout back — header block, columns in order, and a Cable Drums sheet —
  for one location, or for a whole job as one workbook with a sheet per location. Where a sheet was
  uploaded for that location it goes back out **in its own shape**: the same columns, in the same
  order, including ones the app knows nothing about, with the counts filled in. Only where no sheet
  was uploaded does it fall back to the KN02 seven-column default. Import → export → import returns
  identical numbers. It writes real .xlsx through SheetJS, falling back to CSV if that has not
  loaded.
  See `readHeaderBlock()`, `findCountHeader()`, `importCountSheet()`, `countSheetAoA()`,
  `drumsAoA()`, `saveWorkbook()`.
- **Units are kept exactly as given.** Each, KM, MTR — the item master importer no longer normalises
  the unit of measure, and nothing is silently converted. A unit that reads as a code rather than a
  word is never pluralised on screen. Where the sheet has KM against a metre-sized number, it is
  imported as written and flagged in the report. See item 18 of the 7 Sep note.
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
- **Location is a field of its own, and the list is closed.** *Where* the count is happening
  (Claremorris) is asked before *what* is being counted in (a van, the inside store) — the Location
  field sits above "Where are you counting?" on the Count tab, with type-ahead, a list and a mic.
  The list is **uploaded per contractor** on the Data tab: a column of names under any of the usual
  headings, plus a `DA` column if the file has one, with junk rows above the heading tolerated as
  everywhere else. `locsFor()` deliberately does **not** fall back to another contractor's list the
  way `placesFor()` does — showing one contractor another's towns is a leak, not a convenience — so
  a contractor with no list gets an empty field and cannot start counting. Picking a location
  carries its DA onto the session.
  - **Nothing may invent a location.** Typed or spoken, it has to be on the list: an exact name is
    taken, one near miss comes back as *"Did you mean Claremorris?"*, several near misses become a
    numbered choice, anything else is refused outright. Voice can never add one — locations are
    added by uploading a list, and only there. Typing a name off the list reverts the field.
- **Location register.** The vehicle regs and named rooms *within* a location. Counts must land on a registered vehicle reg or named location, each with a
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
- **Job progress per location** lives at the top of the **History** tab, above the closed
  stocktakes — never on Count. It went there rather than into a tab of its own because the tab bar
  is already full enough that the wordmark hides below 480px, and because per-location progress is
  a property of a job, which is what History is already about. Count is a screen for counting.
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
- **Storage areas are optional and start off.** A count goes straight against the location; lines
  carry `loc:''` until somebody creates an area. One **+ Add storage area** button replaces the old
  shelf chips, and an area is named whatever the counter types or says — "Bay 3", "back yard",
  "container". **Nothing is ever seeded**: an app-invented "Shelf A1" is a shelf nobody chose and a
  column nobody asked for, so `CATALOGUES[].spots` no longer feeds the picker, the seeded example
  counts carry no areas, and an imported count sheet no longer invents a "Count sheet" area either.
  A location with an uploaded shelf list still offers those, because the office chose them.
  - Once one area exists, a **Whole location** chip appears so the counter can get back out.
  - **If nobody used one, it is not a column.** The tally shows no area headings, the Storage areas
    tile is not rendered, and the CSV export omits the column entirely rather than carrying an empty
    one on every row.
- **Removing is recorded, not silent.** A counted line is evidence, so taking one off writes an
  entry to the session's `audit` array — who, when, and what it was — and that appears as **Count
  history** under the lines on the Count tab. Every route in goes through `removeLine()`: the bin,
  the swipe, "undo" by voice, and the agent's `undo_last` tool. Deleting a line deletes its
  recording from IndexedDB with it, and **Undo** for five seconds puts both back at the original
  index.
  - On a phone, swipe a line left to uncover Delete; on a desktop a bin appears on hover. The
    swipe only engages on a horizontal drag, so the list still scrolls, and a short drag springs
    back rather than half-opening.
  - **Anything bigger than one line asks first and says how much**: *"This removes 2 lines counted
    at 12-G-12345"*, *"This removes 17 lines across 3 locations"*. `askConfirm()` is inline UI, not
    `confirm()`, which is blocked. Deleting a job takes its sessions with it — it used to orphan
    them silently, with no confirmation at all.
- **Audio evidence.** Each spoken line is recorded (on by default, switchable) and played back
  against the line. Stored in IndexedDB.
- **Reconciliation.** Import a file with an expected-quantity column and every count is compared
  line by line.
- **Per-customer branding.** Each customer gets a colour and badge that themes the whole app; a real
  logo can be uploaded to replace the generated one. A sample logo is embedded as a seed.

### Conventions that matter

- **Every committing button confirms itself.** Save, Save list, Add, Import and Export all go through
  `withFeedback(btn, fn, label)`: pressed at once, a spinner if the work takes more than 300ms, then a
  green tick and a past-tense label for two seconds before the button returns to normal. A handler
  returning `false` means nothing happened — the button restores silently, because a validation
  message has already said why — and a thrown error shows *Try again* in red. Nothing should ever
  feel like it did not register. The same goes for the **drop zones**, which are Import buttons by
  another name: `dropFeedback()` gives them a busy border, a spinner and a tick, and a file that
  cannot be read leaves a red edge and says so rather than falling silent.

- Irish spelling and en-IE formatting throughout (`metre`, `colour`, `toLocaleString('en-IE')`).
- Copy is written in the customer's language, not the system's: "vehicle", "yard", "spot", "counter".
- The page must open in a working state with example data visible, never an empty shell.
- **Blue and white, and the blue lives in one line.** `--brand` (currently `#1D5FD1`) is the only
  place TruCount's colour is written down; the header bar, the active tab, primary buttons, the mic
  and every accent are cut from it with `color-mix()`, so changing that one declaration reshades the
  whole app. Everything else is white and light grey with dark grey text. Every colour still comes
  from a CSS custom property — never a literal in a rule.
- **The theme is TruCount's; the contractor's colour is theirs.** `--org` and `--on-org` hold the
  selected contractor's brand colour, set at runtime by `applyBrand()`, and they dress exactly two
  things: their badge and the band that carries their name. The chrome never changes when you switch
  contractor. Do not reintroduce a runtime override of `--accent` — that is what made the app wear
  a different customer's colours on every screen.
- `--accent-ink` is the cut for brand-coloured text on white, `--accent-hdr` for text on the blue
  bar, `--on-accent` for text on a brand-filled surface. Use those, never raw `--accent`.
  `--ok`/`--bad` are for light surfaces; on the blue header they disappear, so the header has
  `--ok-hdr`, `--bad-hdr` and `--warn-hdr`.
- **Light only.** The OS-driven dark theme was removed with the blue: the app is one look on every
  phone, whatever the handset is set to. There is no theme toggle. If dark comes back it needs to be
  a deliberate blue-dark palette and a switch the counter can find, not a media query.
- **No `prompt()`, `alert()` or `confirm()`.** They are blocked in the hosting frame and fail
  silently. Everything is inline UI.
- **No secret ever reaches the page.** API keys, tokens and anything else that costs money live
  behind the proxy. `index.html` is served to anyone who opens it; treat everything in it as public.
- **One way in and one way out for speech.** All listening goes through `startListen()`, which picks
  the engine; everything heard arrives at `onHeardFinal()` whichever engine heard it. All speaking
  goes through `speakThen(text, cb)`. Never call `speechSynthesis` or the recogniser directly —
  a new call site is a new place the fallback can be forgotten.

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
7. ~~**Cloud speech tier.**~~ **Done** — ElevenLabs Scribe v2 Realtime, with the count sheet's own
   items sent as boosted keyterms, rotated as the walk moves, and the browser engine kept as the
   floor. Accent handling comes from the vocabulary, not the vendor. What is left is measurement:
   run the same lines on both engines against real Irish site accents on a real sheet and read the
   two rates off Data → *What the app heard*. If ElevenLabs is not clearly ahead on the number
   words and the drum IDs, the keyterm list is the thing to tune, not the vendor.
8. **Photo against a line.**
9. **Two people counting the same location at once.**
10. **A desk dashboard** separate from the phone app, for an owner looking at 150 vans.

## Sample data

`sample-data/` has four files, all real-shaped, all exercising the importer:

- `KN02_locations.xlsx` — the KN Circet location list: 23 Mayo/Roscommon towns across 7 DAs, with a
  title and a blank row above the heading so the header-finding is exercised.

- `TLI-location-register-sample.csv` — 20 Irish vehicle registrations plus named locations, each with
  its own shelf list. Junk rows above the header, on purpose.
- `Powers-item-master-Jul-2026.csv` — 123 items from a pub drinks catalogue, with closing stock
  and pack conversions (88 pints per 50L keg, 20 measures per 70cl bottle), across 14 product
  groups.
- `nbi-items-ambiguous-sample.csv` — deliberately ambiguous items for testing disambiguation:
  two coach screws differing only by a number, and 12 Fibre UG vs OH.

## Testing

`npm test`, `node test/run.js`, or `/test` in Claude Code. **TESTING.md** is the full
account; the short version:

- The app is one HTML file with no build step, so a test serves the folder, opens it in a
  headless Chromium, and drives **the same functions the phone drives** — `parse()`,
  `AGENT_TOOLS.record_count()`, `onHeardFinal()`, `keytermsFor()`. There is no second
  implementation of anything.
- Exactly three things are stubbed, all in `test/lib/harness.js`: the voice proxy (same
  routes as the Worker, no key, no network), the Scribe WebSocket (opens and swallows, so
  the keyterms can be read off the URL the app tried to open), and the agent session
  (records what the app sends it). Excel is read with the real SheetJS.
- The two CDN libraries are cached into `test/.cache/` on first run and served locally. A
  test that needs the internet to pass is a test that fails on a train.
- **Drive the layer below the microphone**, not the typed box: `onHeardFinal()` for
  something heard, `agentSay()` for something the agent heard, `speakThen()` for a readback.
  Typed input is not a parallel path — with an agent running it goes in through `agentSay()`
  so an automated run exercises the real tools — but it is never logged as something the ear
  heard, because counting it would flatter the recognition rate.
- Name an assertion after the behaviour, not the function, and always pass the third
  argument: a failure you cannot read the actual value out of costs a debugging round.

**Nothing here proves recognition accuracy.** Every voice suite drives text. Whether the
agent actually hears an Irish site accent is measured on a phone — `agent/field-test.md` is
that protocol, and the number comes off Data → *What the app heard*.
