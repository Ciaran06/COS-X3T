-- TruCount — Batch B.  Run after schema.sql and policies.sql.
--
-- Two things.  Counts already have their tables from Batch A; what they need
-- here is an index for the pull and a tombstone that survives it.  And the
-- voice engine settings move off the phone, so a new van is a sign-in rather
-- than a paste.

-- ─── the settings that should come with the account ─────────────────────────
-- A table of its own rather than a column on orgs, because orgs is readable by
-- an organisation you share a book with — and the Cloudflare APP_TOKEN in here
-- is a shared secret.  A guest can see your NAME.  It cannot see your keys.
create table if not exists org_settings (
  org_id      uuid primary key references orgs(id) on delete cascade,
  voice       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

alter table org_settings enable row level security;

-- members only, in both directions.  No grant reaches this table.
drop policy if exists org_settings_read on org_settings;
create policy org_settings_read on org_settings for select using (org_id = my_org());
drop policy if exists org_settings_write on org_settings;
create policy org_settings_write on org_settings for all
  using (org_id = my_org() and my_role() in ('supervisor','admin'))
  with check (org_id = my_org() and my_role() in ('supervisor','admin'));

-- ─── the pull ───────────────────────────────────────────────────────────────
-- The phone asks "what has changed in this book since I last looked", so both
-- tables need a stamp that moves when a row is written, and an index on it.
alter table sessions add column if not exists updated_at timestamptz not null default now();
alter table lines    add column if not exists updated_at timestamptz not null default now();

create or replace function touch_row() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sessions_touch on sessions;
create trigger sessions_touch before update on sessions
  for each row execute function touch_row();
drop trigger if exists lines_touch on lines;
create trigger lines_touch before update on lines
  for each row execute function touch_row();

create index if not exists sessions_updated on sessions(book_id, updated_at);
create index if not exists lines_updated on lines(session_id, updated_at);

-- A removed line is a tombstone, not a delete: the pull has to be able to tell
-- a phone that a line it still holds has been taken off.  removed_at and
-- removed_by are already on the table from Batch A; this is the note that they
-- are load-bearing and nothing may hard-delete a line.
comment on column lines.removed_at is
  'Set when a line is removed. Never DELETE a line — a phone that is offline '
  'would never learn it had gone.';

-- ─── the uid the phone mints ────────────────────────────────────────────────
-- A row is identified by an id the PHONE made, so pushing the same line twice
-- is an upsert onto itself rather than a second line.  That is what makes an
-- outbox safe to retry after a van drives out of a hollow.
alter table sessions add column if not exists uid uuid;
alter table lines    add column if not exists uid uuid;
create unique index if not exists sessions_uid on sessions(uid);
create unique index if not exists lines_uid on lines(uid);

-- ─── push ───────────────────────────────────────────────────────────────────
-- The phone sends names, not ids: it knows it counted at "Claremorris" on the
-- "Daily van count", and resolving those to rows is the server's job.  A name
-- it cannot resolve is left null rather than invented — the count still lands.
create or replace function push_sessions(rows jsonb)
returns integer language plpgsql security invoker as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into sessions (uid, book_id, job_id, location_id, container, ctype,
                          counted_by, counted_name, device_id, started_at, finished_at)
    values (
      (r->>'uid')::uuid,
      (r->>'book_id')::uuid,
      (select id from jobs where org_id = my_org() and name = r->>'job_name' limit 1),
      (select id from locations where org_id = my_org() and name = r->>'location_name' limit 1),
      coalesce(r->>'container',''), coalesce(r->>'ctype',''),
      auth.uid(), coalesce(r->>'counted_name',''), coalesce(r->>'device_id',''),
      coalesce((r->>'started_at')::timestamptz, now()),
      nullif(r->>'finished_at','')::timestamptz
    )
    on conflict (uid) do update set
      container = excluded.container, ctype = excluded.ctype,
      location_id = excluded.location_id, job_id = excluded.job_id,
      finished_at = excluded.finished_at, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function push_lines(rows jsonb)
returns integer language plpgsql security invoker as $$
declare r jsonb; n integer := 0;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into lines (uid, session_id, code, qty, unit, spot, drum_id, raw, engine,
                       said_at, created_by, device_id, removed_at, removed_by)
    values (
      (r->>'uid')::uuid,
      (select id from sessions where uid = (r->>'session_uid')::uuid),
      r->>'code', (r->>'qty')::numeric, coalesce(r->>'unit','each'),
      coalesce(r->>'spot',''), nullif(r->>'drum_id',''), nullif(r->>'raw',''),
      coalesce(r->>'engine',''), coalesce((r->>'said_at')::timestamptz, now()),
      auth.uid(), coalesce(r->>'device_id',''),
      nullif(r->>'removed_at','')::timestamptz,
      case when r->>'removed_at' is null then null else auth.uid() end
    )
    on conflict (uid) do update set
      qty = excluded.qty, unit = excluded.unit, spot = excluded.spot,
      removed_at = excluded.removed_at, removed_by = excluded.removed_by,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- ─── pull ───────────────────────────────────────────────────────────────────
-- "What has changed in this book since I last looked."  One row per session
-- with its lines nested, so a phone that has been in a hollow for an hour
-- catches up in one request rather than one per session.
create or replace function pull_counts(book uuid, since timestamptz)
returns table (uid uuid, updated_at timestamptz, container text, ctype text,
               counted_name text, device_id text, location_name text, da text,
               started_at timestamptz, finished_at timestamptz, lines jsonb)
language sql security invoker as $$
  select s.uid,
         greatest(s.updated_at, coalesce(max(l.updated_at), s.updated_at)) as updated_at,
         s.container, s.ctype, s.counted_name, s.device_id,
         coalesce(loc.name,'') as location_name, coalesce(loc.da,'') as da,
         s.started_at, s.finished_at,
         coalesce(jsonb_agg(jsonb_build_object(
            'uid', l.uid, 'code', l.code, 'qty', l.qty, 'unit', l.unit,
            'spot', l.spot, 'drum_id', l.drum_id, 'raw', l.raw, 'engine', l.engine,
            'said_at', l.said_at, 'removed_at', l.removed_at)
          ) filter (where l.uid is not null), '[]'::jsonb) as lines
  from sessions s
  left join lines l on l.session_id = s.id
  left join locations loc on loc.id = s.location_id
  where s.book_id = book
    and (s.updated_at > since or l.updated_at > since)
  group by s.id, loc.name, loc.da
  order by 2
$$;
