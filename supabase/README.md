# Setting up the Supabase project — Batch A

About twenty minutes, most of it waiting for a project to spin up. Nothing here
touches the app until the last step, and the app counts perfectly well without
any of it.

---

## 1. The project

1. **https://supabase.com** → sign in → **New project**.
2. Organisation: your own. Name it `trucount`.
3. **Region: London (eu-west-2)**. Data residency is a question NBI will ask,
   and it cannot be changed later.
4. Set a database password and put it in your password manager. You will
   rarely need it.
5. Wait for it to come up — a couple of minutes.

## 2. The tables

1. Left-hand menu → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/schema.sql` from this repo. **Run**.
3. New query. Paste the whole of `supabase/policies.sql`. **Run**.

Both are safe to run again — they create nothing twice and drop each policy
before recreating it. If you change either file, re-run it.

## 3. Make the email a code, not a link

This is the one non-obvious step, and skipping it is why sign-in would send a
link that does nothing useful on a van phone.

1. **Authentication → Emails → Magic Link**.
2. In the template body, add the code on its own line:

   ```
   <p>Your TruCount sign-in code is <b>{{ .Token }}</b></p>
   ```

   Leave the rest. `{{ .Token }}` is the six digits; the app asks for those.
3. **Authentication → Providers → Email**: make sure **Enable email provider**
   is on, and turn **Confirm email** off (an invited user has already been
   vouched for by whoever invited them).
4. **Authentication → Sign In / Providers → "Allow new users to sign up"**:
   turn it **off**. TruCount is invite-only — the app asks Supabase not to
   create users, and this makes that true at the server as well.

## 4. The first organisation and the first user

There is no admin screen yet — that is Batch E — so the first one is made by
hand. SQL Editor, one query at a time.

1. Create the organisation and a master:

   ```sql
   insert into orgs (name) values ('KN Circet') returning id;
   -- copy the id, call it <ORG>
   insert into masters (org_id, name, catalogue)
     values ('<ORG>', 'NBI parts', 'fibre') returning id;
   -- copy the id, call it <MASTER>
   insert into books (org_id, master_id, name, catalogue)
     values ('<ORG>', '<MASTER>', 'NBI stock', 'fibre');
   ```

2. **Authentication → Users → Add user → Create new user**. Use a real address
   you can read on the phone. Tick *Auto Confirm User*. Copy the user's id.

3. Give that user a profile in the organisation:

   ```sql
   insert into profiles (id, org_id, name, role)
     values ('<USER ID>', '<ORG>', 'Ciarán Ó Sé', 'admin');
   ```

4. Repeat step 2 and 3 for the second phone's user — same `<ORG>`, role
   `counter`. Two users in one organisation is what the two-phone test needs.

5. Put some items in the master so there is something to count. Either paste a
   few rows:

   ```sql
   insert into items (master_id, code, short, group_name, unit, pack, pack_name, alias)
   values
     ('<MASTER>','500CONPOLE9M','Medium Pole 9.0m','01. Poles','each',1,null,'nine metre medium pole'),
     ('<MASTER>','500POLESTEP','Pole Step-30 Box','02. Poles - Accessories','each',30,'case','pole step');
   ```

   …or, faster, use **Table Editor → items → Insert → Import data from CSV**
   with a file whose columns are `master_id, code, short, group_name, unit,
   pack, pack_name, alias`. Exporting the current master from **Setup → Item
   master → Export to Excel** gives you every column except `master_id`, which
   you add and fill with the same value on every row.

6. And a couple of locations:

   ```sql
   insert into locations (org_id, name, da) values
     ('<ORG>','Claremorris','DA008'),
     ('<ORG>','Castlebar','DA005');
   ```

## 5. Point the app at it

1. **Settings → Data API** in Supabase. Copy the **Project URL** and the
   **anon** key — the one marked publishable. **Not** `service_role`; that one
   goes nowhere near the app, ever.
2. In TruCount: **Setup → Account**. Paste both. **Save**.
3. Sign in with the email you created. A six-digit code arrives; type it in.

---

## What you have not had to do

No server, no certificates, no backup job, no DNS. Supabase's own email sender
is rate-limited but fine for two phones; a custom sender is only needed when
real counters start signing in.

## What is deliberately not here yet

Counts still save on the phone and go nowhere — that is **Batch B**. Books are
created by hand — **Batch C**. Sharing between organisations, and the invite
flow — **Batch D**. Roles doing anything — **Batch E**.
