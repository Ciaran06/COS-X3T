-- TruCount — row level security.  Batch A.  Run after schema.sql.
--
-- The whole point of choosing Postgres was that "KN's NBI-stock book is
-- visible to NBI at Witness level" is a ROW, and these policies turn that row
-- into the rule the database enforces.  The app never decides what you may
-- see — it asks, and the answer is the same whichever screen asked.
--
-- Read it as three questions:
--   my_org()            which organisation am I in
--   can_see_book(b)     mine, or granted to me at any level
--   book_level(b)       'own' | 'admin' | 'witness' | 'view' | null

-- ─── helpers ────────────────────────────────────────────────────────────────
-- security definer, so a policy on profiles can call it without recursing
-- into the policy on profiles.
create or replace function my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function book_level(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when (select org_id from books where id = b) = my_org() then 'own'
    else (select level from grants where book_id = b and to_org_id = my_org())
  end
$$;

create or replace function can_see_book(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select book_level(b) is not null
$$;

-- can I write counts into this book — my own, or somebody else's at witness
-- or admin.  'view' is exactly that: view.
create or replace function can_count_in(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select book_level(b) in ('own','witness','admin')
$$;

-- can I edit the master this book counts against, or close its jobs
create or replace function can_admin_book(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select book_level(b) = 'admin'
      or (book_level(b) = 'own' and my_role() in ('supervisor','admin'))
$$;

-- ─── turn it on ─────────────────────────────────────────────────────────────
alter table orgs       enable row level security;
alter table profiles   enable row level security;
alter table invites    enable row level security;
alter table masters    enable row level security;
alter table items      enable row level security;
alter table books      enable row level security;
alter table grants     enable row level security;
alter table locations  enable row level security;
alter table places     enable row level security;
alter table jobs       enable row level security;
alter table sessions   enable row level security;
alter table lines      enable row level security;
alter table snapshots  enable row level security;

-- ─── orgs ───────────────────────────────────────────────────────────────────
-- You can see your own organisation, and the name of any organisation you
-- share a book with in either direction — otherwise a grant would be from
-- "an organisation" with no name on the screen.
drop policy if exists orgs_read on orgs;
create policy orgs_read on orgs for select using (
  id = my_org()
  or exists (select 1 from grants g join books b on b.id = g.book_id
             where (g.to_org_id = my_org() and b.org_id = orgs.id)
                or (b.org_id = my_org() and g.to_org_id = orgs.id))
);
drop policy if exists orgs_admin on orgs;
create policy orgs_admin on orgs for update using (id = my_org() and my_role() = 'admin');

-- ─── profiles ───────────────────────────────────────────────────────────────
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (org_id = my_org());
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for update using (id = auth.uid());
drop policy if exists profiles_admin on profiles;
create policy profiles_admin on profiles for all
  using (org_id = my_org() and my_role() = 'admin')
  with check (org_id = my_org() and my_role() = 'admin');

-- ─── invites ────────────────────────────────────────────────────────────────
drop policy if exists invites_admin on invites;
create policy invites_admin on invites for all
  using (org_id = my_org() and my_role() = 'admin')
  with check (org_id = my_org() and my_role() = 'admin');

-- ─── masters and items ──────────────────────────────────────────────────────
-- You can read a master you own, or one that backs a book you can see.  That
-- is what makes a contractor able to count against NBI's codes.
drop policy if exists masters_read on masters;
create policy masters_read on masters for select using (
  org_id = my_org()
  or exists (select 1 from books b where b.master_id = masters.id and can_see_book(b.id))
);
drop policy if exists masters_write on masters;
create policy masters_write on masters for all
  using (org_id = my_org() and my_role() in ('supervisor','admin'))
  with check (org_id = my_org() and my_role() in ('supervisor','admin'));

drop policy if exists items_read on items;
create policy items_read on items for select using (
  exists (select 1 from masters m where m.id = items.master_id
          and (m.org_id = my_org()
               or exists (select 1 from books b where b.master_id = m.id and can_see_book(b.id))))
);
-- Editing the master is the issuer's job, or an Admin grant on a book that
-- uses it.  A Witness can enter counts; it cannot rewrite the catalogue.
drop policy if exists items_write on items;
create policy items_write on items for all
  using (
    exists (select 1 from masters m where m.id = items.master_id
            and (m.org_id = my_org() and my_role() in ('supervisor','admin')))
    or exists (select 1 from books b where b.master_id = items.master_id and can_admin_book(b.id))
  )
  with check (
    exists (select 1 from masters m where m.id = items.master_id
            and (m.org_id = my_org() and my_role() in ('supervisor','admin')))
    or exists (select 1 from books b where b.master_id = items.master_id and can_admin_book(b.id))
  );

-- ─── books and grants ───────────────────────────────────────────────────────
drop policy if exists books_read on books;
create policy books_read on books for select using (can_see_book(id));
drop policy if exists books_write on books;
create policy books_write on books for all
  using (org_id = my_org() and my_role() = 'admin')
  with check (org_id = my_org() and my_role() = 'admin');

-- You can see a grant that concerns you either way round.  Only the owner
-- makes one — sharing is the owner's decision, always.
drop policy if exists grants_read on grants;
create policy grants_read on grants for select using (
  to_org_id = my_org()
  or exists (select 1 from books b where b.id = grants.book_id and b.org_id = my_org())
);
drop policy if exists grants_write on grants;
create policy grants_write on grants for all
  using (exists (select 1 from books b where b.id = grants.book_id
                 and b.org_id = my_org() and my_role() = 'admin'))
  with check (exists (select 1 from books b where b.id = grants.book_id
                      and b.org_id = my_org() and my_role() = 'admin'));

-- ─── locations and places ───────────────────────────────────────────────────
-- Organisation-wide: mine, or the location list of an organisation that has
-- shared a book with me — a guest needs to know where a count happened.
-- private_to_book narrows one location to people who can see that book.
drop policy if exists locations_read on locations;
create policy locations_read on locations for select using (
  (org_id = my_org()
   or exists (select 1 from books b join grants g on g.book_id = b.id
              where b.org_id = locations.org_id and g.to_org_id = my_org()))
  and (private_to_book is null or can_see_book(private_to_book))
);
drop policy if exists locations_write on locations;
create policy locations_write on locations for all
  using (org_id = my_org() and my_role() in ('supervisor','admin'))
  with check (org_id = my_org() and my_role() in ('supervisor','admin'));

drop policy if exists places_read on places;
create policy places_read on places for select using (
  org_id = my_org()
  or exists (select 1 from books b join grants g on g.book_id = b.id
             where b.org_id = places.org_id and g.to_org_id = my_org())
);
drop policy if exists places_write on places;
create policy places_write on places for all
  using (org_id = my_org() and my_role() in ('supervisor','admin'))
  with check (org_id = my_org() and my_role() in ('supervisor','admin'));

-- ─── jobs ───────────────────────────────────────────────────────────────────
drop policy if exists jobs_read on jobs;
create policy jobs_read on jobs for select using (
  org_id = my_org()
  or exists (select 1 from books b join grants g on g.book_id = b.id
             where b.org_id = jobs.org_id and g.to_org_id = my_org())
);
drop policy if exists jobs_write on jobs;
create policy jobs_write on jobs for all
  using (org_id = my_org() and my_role() in ('supervisor','admin'))
  with check (org_id = my_org() and my_role() in ('supervisor','admin'));

-- ─── the counts ─────────────────────────────────────────────────────────────
drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select using (can_see_book(book_id));
drop policy if exists sessions_write on sessions;
create policy sessions_write on sessions for all
  using (can_count_in(book_id)) with check (can_count_in(book_id));

drop policy if exists lines_read on lines;
create policy lines_read on lines for select using (
  exists (select 1 from sessions s where s.id = lines.session_id and can_see_book(s.book_id))
);
drop policy if exists lines_write on lines;
create policy lines_write on lines for all
  using (exists (select 1 from sessions s where s.id = lines.session_id and can_count_in(s.book_id)))
  with check (exists (select 1 from sessions s where s.id = lines.session_id and can_count_in(s.book_id)));

-- ─── snapshots ──────────────────────────────────────────────────────────────
-- A closed job is readable by anyone who could see the book, and written by
-- whoever could close it.  Nothing updates one: frozen means frozen.
drop policy if exists snapshots_read on snapshots;
create policy snapshots_read on snapshots for select using (
  org_id = my_org() or (book_id is not null and can_see_book(book_id))
);
drop policy if exists snapshots_insert on snapshots;
create policy snapshots_insert on snapshots for insert
  with check (book_id is not null and can_admin_book(book_id));
