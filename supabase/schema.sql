-- TruCount — schema.  Batch A.
--
-- Run this once, in the Supabase SQL editor, on a fresh project.
-- Then run policies.sql.  Nothing here is destructive; it is all "create if
-- not exists" so re-running it is safe.
--
-- The shape follows the decisions of 10 Sep 2026:
--   * Locations are ORGANISATION-WIDE.  A yard is a yard.  `private_to_book`
--     is the rare exception, not the rule.
--   * A book counts against ONE item master.  A contractor's own book points
--     at a master the contractor owns; a book shared with NBI points at NBI's.
--     (The note said "hangs off the grant"; a master the book points at is the
--     same outcome with one less way to be incoherent — a book cannot end up
--     with two masters because it was shared twice.)

create extension if not exists pgcrypto;

-- ─── who ────────────────────────────────────────────────────────────────────
create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- One row per signed-in person.  A person belongs to one organisation.
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references orgs(id) on delete restrict,
  name        text not null default '',
  role        text not null default 'counter'
              check (role in ('counter','supervisor','admin')),
  created_at  timestamptz not null default now()
);
create index if not exists profiles_org on profiles(org_id);

create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null,
  role        text not null default 'counter'
              check (role in ('counter','supervisor','admin')),
  invited_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz
);
create index if not exists invites_email on invites(lower(email));

-- ─── what is counted ────────────────────────────────────────────────────────
-- A master is a catalogue of parts, issued by one organisation.  NBI issues
-- one; a contractor issues its own for its own consumables.
create table if not exists masters (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  catalogue   text not null default 'fibre',
  created_at  timestamptz not null default now()
);
create index if not exists masters_org on masters(org_id);

create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  master_id   uuid not null references masters(id) on delete cascade,
  code        text not null,
  short       text not null default '',
  long        text not null default '',
  group_name  text,
  unit        text not null default 'each',
  pack        numeric not null default 1,
  pack_name   text,
  alias       text,
  price       numeric,
  expected    numeric,
  is_drum     boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (master_id, code)
);

-- ─── books ──────────────────────────────────────────────────────────────────
-- A book is a pot of stock inside an organisation: "NBI stock", "Eir stock",
-- "Own consumables".  It counts against exactly one master.
create table if not exists books (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  master_id   uuid references masters(id) on delete restrict,
  name        text not null,
  catalogue   text not null default 'fibre',
  created_at  timestamptz not null default now()
);
create index if not exists books_org on books(org_id);

-- The organisation that owns a book decides who else sees it, and at what level.
create table if not exists grants (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  to_org_id   uuid not null references orgs(id) on delete cascade,
  level       text not null check (level in ('view','witness','admin')),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (book_id, to_org_id)
);
create index if not exists grants_to_org on grants(to_org_id);

-- ─── where ──────────────────────────────────────────────────────────────────
-- Organisation-wide by design.  private_to_book is the exception: set it and
-- the location is only visible to somebody who can see that book.
create table if not exists locations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  name            text not null,
  da              text,
  alias           text,
  private_to_book uuid references books(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists locations_org on locations(org_id);

-- Registrations and store names — the places WITHIN a location.
create table if not exists places (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  label       text not null,
  kind        text not null default 'van',
  da          text,
  spots       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  unique (org_id, label)
);
create index if not exists places_org on places(org_id);

-- ─── the work ───────────────────────────────────────────────────────────────
create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  kind        text not null default '',
  catalogue   text not null default 'fibre',
  due         date,
  target      integer not null default 0,
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists jobs_org on jobs(org_id);

create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  job_id      uuid references jobs(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  place_id    uuid references places(id) on delete set null,
  container   text not null default '',
  ctype       text not null default '',
  counted_by  uuid references profiles(id) on delete set null,
  counted_name text not null default '',
  device_id   text not null default '',
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sessions_book on sessions(book_id);
create index if not exists sessions_job on sessions(job_id);

create table if not exists lines (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  code        text not null,
  qty         numeric not null,
  unit        text not null default 'each',
  spot        text not null default '',
  drum_id     text,
  raw         text,
  engine      text not null default '',
  said_at     timestamptz not null default now(),
  created_by  uuid references profiles(id) on delete set null,
  device_id   text not null default '',
  removed_at  timestamptz,
  removed_by  uuid references profiles(id) on delete set null
);
create index if not exists lines_session on lines(session_id);

-- A closed job, frozen.  The payload is the snapshot the app already builds:
-- every row carries its own item details so it never needs the master again.
create table if not exists snapshots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  book_id     uuid references books(id) on delete set null,
  job_id      uuid references jobs(id) on delete set null,
  name        text not null,
  closed_at   timestamptz not null default now(),
  closed_by   uuid references profiles(id) on delete set null,
  payload     jsonb not null
);
create index if not exists snapshots_org on snapshots(org_id);
