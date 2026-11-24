-- WhoAmIGuess: run once in Supabase → SQL Editor → New query → Run.
-- Public nicknames for the leaderboard.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24)
);
-- Leaderboard and duel documents: collection 'board' (id = user id) and 'duels' (id = <duel>-<user id>).
create table if not exists public.docs (
  collection text not null check (collection in ('board', 'duels')),
  id text not null check (char_length(id) <= 80),
  owner uuid not null references auth.users on delete cascade default auth.uid(),
  data jsonb not null check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

alter table public.profiles enable row level security;
alter table public.docs enable row level security;

-- everyone (also logged-out visitors) may read; only the owner may write their own rows
drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles write own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
create policy "profiles write own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "docs read" on public.docs;
drop policy if exists "docs insert own" on public.docs;
drop policy if exists "docs update own" on public.docs;
create policy "docs read" on public.docs for select using (true);
-- a board row must be keyed by the writer's own id; a duel row must end with it
create policy "docs insert own" on public.docs for insert with check (
  owner = auth.uid() and (
    (collection = 'board' and id = auth.uid()::text) or
    (collection = 'duels' and id like '%-' || auth.uid()::text)));
create policy "docs update own" on public.docs for update using (owner = auth.uid()) with check (owner = auth.uid());

-- the site talks to these tables through the Data API: logged-out visitors read, logged-in players write (RLS above limits what)
grant select on public.profiles, public.docs to anon, authenticated;
grant insert, update on public.profiles, public.docs to authenticated;
