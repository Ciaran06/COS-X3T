# TruCount — accounts, sharing and the shared back end

A plan, not a build. Nothing in here has been written. — 10 Sep 2026

---

## 1. What I would build it on: **Supabase**

Postgres, with Row Level Security, auth, file storage and a JavaScript client that loads
from a CDN into the page we already have.

The reason is the sharing model, not the database. *"KN's NBI-stock book is visible to
NBI at Witness level"* is a row in a `grants` table, and RLS turns that row into the rule
the database enforces on every query. Nobody can forget to apply it, and the app never
decides what you may see — it asks. That is the difference between a permissions model
and a permissions habit.

Three more reasons: Results is one SQL query with a `where` clause rather than a fan-out
of document reads; the price is flat and predictable rather than per-read; and the exit is
`pg_dump` — worth something for a product NBI might one day want on their own
infrastructure.

**Firebase** was the alternative and I would not pick it. Firestore's offline sync is
genuinely better out of the box, but its security rules cannot join, so a grants model
means denormalising permissions onto every single line — and every rollup is thousands of
billed reads. The thing it is best at is the thing we need least, and the thing it is
worst at is the crux of the model.

**The one honest gap:** Supabase gives you nothing for offline. But TruCount already
writes locally first, so what is missing is an outbox and a pull — a few hundred lines,
and *less* work than fighting Firestore's rules. It also keeps "never block the counter on
a network call" as our explicit promise rather than a vendor's black box.

---

## 2. What changes in the app

**Moves off the phone:** organisations, books, users, grants, item masters, locations,
registrations, jobs, sessions, lines, closed snapshots, audio clips.

**Stays on the phone:** a cache of all of it for the book you are counting, an outbox of
writes not yet acknowledged, and the voice settings. Today's "on device" store becomes
that cache. The counting screen does not change at all — it already writes locally and
reads locally.

**The login** is email plus a six-digit code, not a magic link. A magic link assumes a
working email client on the phone in your hand; a code can be read off any device. Then
"stay signed in on this device", because a counter should not sign in every morning. The
role switch and PIN on Setup disappear — you are whoever signed in.

**index.html stays one file** through the first two batches. For a field app that has to
open from a sideloaded file with no signal, one file is a feature. It gains the Supabase
client from a CDN and a sync section. It splits when the login and admin screens land —
and at that point it becomes a PWA with a manifest and a service worker, so it installs to
the home screen and opens offline. Splitting earlier buys nothing and costs the ability to
mail somebody the app.

---

## 3. Rough monthly cost

Sizing: 400 locations, ~300 counted a working day, ~20 lines each ≈ **130,000 lines a
month**.

| | |
| --- | --- |
| Line and session rows | ~26 MB/month, ~300 MB/year — nothing |
| Item masters, locations, jobs | a few MB in total |
| **Audio clips** | ~30 kB each × 130k ≈ **4 GB/month** — the only thing that grows |
| Supabase Pro | **$25/month** as priced today (8 GB database, 100 GB storage, 100k monthly users) |

**Year one: $25/month.** Year two ~$30–35 as clips accumulate, and flat after that if
clips are kept 90 days unless the line belongs to a closed job — which is the rule I would
set, because a clip's job is to settle an argument about a recent count. Check Supabase's
current pricing before committing; the shape is right, the numbers move.

**The database is not your cost.** Voice is. A counter with the mic open 30 minutes a day,
50 counters, 22 days ≈ **33,000 minutes a month**. Multiply that by your Vapi per-minute
rate and compare it to $25. That is the number to watch, and it is the argument for the
mic closing between lines rather than running all day.

---

## 4. What you set up yourself

1. Create a **Supabase** account and a project. Choose the **London (eu-west-2)** region —
   data residency is a question NBI will ask.
2. Save the database password in your password manager. You will rarely need it.
3. Copy the project **URL** and the **anon key**. Those two go in `index.html`, exactly as
   the Vapi public key does — they are publishable. Copy the **service_role** key and put
   it nowhere near the app; it lives in the Cloudflare Worker if anything ever needs it.
4. In Auth: turn on **email**, turn **off** public sign-ups (invite only), set the sender
   name, and set the redirect URL to the app's address.
5. Decide where the app is hosted. **Cloudflare Pages** is free and you already have a
   Cloudflare account for the voice proxy. Something like `app.trucount.ie`.
6. **DNS:** one CNAME, `app` → Cloudflare Pages. Supabase's default email sender is fine
   at this size; if you want mail from your own domain later that is an SPF and a DKIM
   record.
7. Move to **Supabase Pro** before the first paying customer. The free tier pauses a
   project after a week of inactivity, which is precisely what a quiet weekend looks like.
8. Nothing else. No servers, no certificates, no backup job — Pro takes daily backups.

---

## 5. How today's data moves

The awkward part is not the format, it is that the data is not one dataset — it is on N
phones. So the migration runs *from each phone*, not from a file somebody emails.

1. Create the organisations and their books in Supabase, empty.
2. Import each org's **item master** and **location list** through the importers that
   already exist, pointed at the server. Same files, same code path, same column guessing.
3. Add a one-time **"Upload everything on this phone"** button. It pushes the local store
   to the server under the signed-in org and book. It runs on the device that made the
   counts, so nothing has to be transported anywhere.
4. **Closed snapshots go up as they are** — they are already frozen, self-describing rows
   that carry their own item details. They do not need the item master to make sense.
5. **Nothing is deleted from the phone.** The local copy becomes the cache. If an upload is
   rejected the counts are still there. Verify by comparing the line count and the totals
   on Results before and after — the export makes that a two-minute check.

One thing not to automate: two phones that both counted the same location on the same job
produce two sessions. That is already true today and Results handles it. Merging them
automatically would guess, and guessing is the one thing this app does not do.

---

## 6. Order of work

Every batch is testable on two real phones, which is the only test that means anything here.

| | What lands | What you test |
| --- | --- | --- |
| **A** | Project, schema, RLS, sign-in, org and book picker. Counting still local. | Sign in on two phones as two users of one org — same item master, same locations, pulled from the server. |
| **B** | Counts sync: outbox out, changes in. | Airplane mode, count ten lines, turn it back on, watch them appear on the other phone's Results. |
| **C** | Books. Item master and counts per book; locations stay org-wide. | KN with "NBI stock" and "Own consumables" — counting in one never shows in the other. |
| **D** | Sharing: View / Witness / Admin, invites in both directions. | KN shares NBI stock with NBI at Witness. NBI can enter the second count, cannot touch the item master, and sees nothing of KN's Eir stock. |
| **E** | Users and roles: Counter / Supervisor / Admin, and who-counted-what-on-which-device on every line. | A Counter cannot close a job. A Supervisor can. A line names the person and the phone. |
| **F** | PWA: manifest, service worker, the file split. | Install it to the home screen, go into airplane mode from cold, count. |

Supervisor sign-off — already on the roadmap and the thing that gets this past procurement
— belongs after **E**, because it needs the roles to be real.

---

## Two decisions worth making before I start

**A shared book shows the guest your whole location list.** Locations are org-wide by
design, so when KN shares its NBI-stock book, NBI can see where a count happened — which
it needs — and that same list also serves KN's Eir stock. Nothing about the Eir *counts*
leaks. But if a location name is itself commercially sensitive, locations need to be
book-scoped instead, and that is easier to decide now than to change later.

**"All contractors" only adds up if the codes match.** If KN, TLI and Actavo each keep
their own item master, the same NBI part may be three different codes and the estate total
is a sum of three things that only look alike. The fix the model already allows: for books
shared with NBI, NBI issues the master — it creates the organisation, invites the
contractor as admin, and the contractor takes over everything except the catalogue. Worth
settling before Batch C, because it decides whether the item master hangs off the book or
off the grant.
