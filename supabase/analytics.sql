-- GuessWhoAmI: statistics and the owner's dashboard. Run once in Supabase → SQL Editor → New query → Run.
-- Visitors (also logged-out) may only ADD rows; nobody can read them through the public API. The dashboard reads through admin_stats(), which checks the admins table.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  vid text not null check (char_length(vid) between 8 and 60),
  kind text not null check (kind in ('visit', 'ping', 'report')),
  path text check (char_length(path) <= 120),
  info text check (char_length(info) <= 400)
);
create index if not exists events_created on public.events (created_at);
create index if not exists events_vid on public.events (vid);
alter table public.events enable row level security;
drop policy if exists "events insert" on public.events;
create policy "events insert" on public.events for insert to anon, authenticated with check (true);
grant insert on public.events to anon, authenticated;

create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security; -- no policies: only the functions below can read it

create or replace function public.is_admin() returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- since/until: the period; bucket: 'hour' or 'day'
create or replace function public.admin_stats(since timestamptz, until timestamptz, bucket text default 'day') returns json
language plpgsql security definer set search_path = public as $$
declare res json;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if bucket not in ('hour', 'day') then bucket := 'day'; end if;
  select json_build_object(
    'online_now', (select count(distinct vid) from events where created_at > now() - interval '3 minutes' and kind <> 'report'),
    'unique', (select count(distinct vid) from events where created_at between since and until and kind <> 'report'),
    'new_unique', (select count(*) from (select vid from events where kind <> 'report' group by vid having min(created_at) between since and until) n),
    'visits', (select count(*) from events where kind = 'visit' and created_at between since and until),
    'users', (select count(*) from auth.users),
    'users_new', (select count(*) from auth.users where created_at between since and until),
    'series', (select coalesce(json_agg(x order by x.t), '[]'::json) from (
        select date_trunc(bucket, created_at) as t, count(distinct vid) as unique, count(*) filter (where kind = 'visit') as visits
        from events where created_at between since and until and kind <> 'report' group by 1) x),
    'pages', (select coalesce(json_agg(x), '[]'::json) from (
        select coalesce(nullif(split_part(replace(path, '#', ''), '-', 1), ''), 'home') as page, count(*) as n
        from events where kind = 'ping' and created_at between since and until group by 1 order by 2 desc limit 12) x),
    'reports', (select coalesce(json_agg(x), '[]'::json) from (
        select created_at, path, info from events where kind = 'report' order by created_at desc limit 30) x)
  ) into res;
  return res;
end $$;
revoke all on function public.admin_stats(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_stats(timestamptz, timestamptz, text) to authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- old rows are not needed for ever: this deletes events older than 400 days (run it by hand now and then)
-- delete from public.events where created_at < now() - interval '400 days';

-- YOU: add your own login email, once (replace the address, keep the quotes):
-- insert into public.admins (email) values ('YOUR-EMAIL@example.com');
