-- GuessWhoAmI: management tools for the owner (reports with status, users, bans, announcement, notifications, backup export).
-- Safe to run again. Everything here is readable/writable only through functions that check is_admin() (see analytics.sql).
create extension if not exists pg_net with schema extensions;

create table if not exists public.report_status (
  event_id bigint primary key references public.events(id) on delete cascade,
  status text not null check (status in ('open', 'progress', 'fixed', 'wontfix')),
  note text check (char_length(note) <= 400),
  updated_at timestamptz not null default now());
create table if not exists public.banned_users (id uuid primary key, reason text, created_at timestamptz not null default now());
create table if not exists public.app_settings (key text primary key, value text);
create table if not exists public.announcements (
  id int primary key default 1 check (id = 1),
  text text not null default '' check (char_length(text) <= 240),
  active boolean not null default false,
  updated_at timestamptz not null default now());
insert into public.announcements (id) values (1) on conflict do nothing;
alter table public.report_status enable row level security;   -- no policies: only the functions below can touch these
alter table public.banned_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.announcements enable row level security;
drop policy if exists "announcement read" on public.announcements;
create policy "announcement read" on public.announcements for select to anon, authenticated using (active);
grant select on public.announcements to anon, authenticated;

-- ---------- reports ----------
create or replace function public.admin_reports(p_filter text default 'open') returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (select coalesce(json_agg(x order by x.created_at desc), '[]'::json) from (
    select e.id, e.created_at, e.path, e.info, coalesce(r.status, 'open') as status, r.note
    from events e left join report_status r on r.event_id = e.id
    where e.kind = 'report' and (p_filter = 'all' or (p_filter = 'open' and coalesce(r.status, 'open') in ('open', 'progress')) or (p_filter = 'done' and r.status in ('fixed', 'wontfix')))
    order by e.created_at desc limit 200) x);
end $$;
create or replace function public.admin_set_report(p_id bigint, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into report_status (event_id, status, note) values (p_id, p_status, nullif(left(p_note, 400), ''))
    on conflict (event_id) do update set status = excluded.status, note = coalesce(excluded.note, report_status.note), updated_at = now();
end $$;

-- ---------- users ----------
create or replace function public.admin_users(p_q text default '') returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (select coalesce(json_agg(x order by x.created_at desc), '[]'::json) from (
    select u.id, u.email, coalesce(p.name, u.raw_user_meta_data ->> 'name') as name, u.created_at, u.last_sign_in_at,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
      coalesce((d.data ->> 'total')::int, 0) as total, coalesce((d.data ->> 'games')::int, 0) as games,
      exists (select 1 from banned_users b where b.id = u.id) as banned
    from auth.users u left join profiles p on p.id = u.id left join docs d on d.collection = 'board' and d.id = u.id::text
    where p_q = '' or u.email ilike '%' || p_q || '%' or p.name ilike '%' || p_q || '%'
    order by u.created_at desc limit 100) x);
end $$;
create or replace function public.admin_ban(p_id uuid, p_ban boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_ban then
    insert into banned_users (id, reason) values (p_id, left(p_reason, 200)) on conflict (id) do update set reason = excluded.reason;
    delete from docs where owner = p_id and collection = 'board';   -- off the leaderboard at once
  else delete from banned_users where id = p_id; end if;
end $$;
create or replace function public.admin_reset_score(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from docs where owner = p_id and collection = 'board';
end $$;
create or replace function public.admin_set_nick(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if char_length(trim(p_name)) not between 1 and 24 then raise exception 'bad name'; end if;
  insert into profiles (id, name) values (p_id, trim(p_name)) on conflict (id) do update set name = excluded.name;
end $$;
create or replace function public.admin_delete_user(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if lower((select email from auth.users where id = p_id)) in (select lower(email) from admins) then raise exception 'cannot delete an admin'; end if;
  delete from docs where owner = p_id; delete from profiles where id = p_id; delete from banned_users where id = p_id; delete from auth.users where id = p_id;
end $$;

-- ---------- announcement banner (shown on the site while active) ----------
create or replace function public.admin_set_announcement(p_text text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update announcements set text = left(coalesce(p_text, ''), 240), active = coalesce(p_active, false) and coalesce(p_text, '') <> '', updated_at = now() where id = 1;
end $$;
create or replace function public.admin_get_announcement() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (select row_to_json(a) from (select text, active from announcements where id = 1) a);
end $$;

-- ---------- notifications: a new report is sent to a Discord webhook or a Telegram bot ----------
create or replace function public.admin_set_webhook(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if coalesce(p_url, '') = '' then delete from app_settings where key = 'webhook'; return; end if;
  if p_url !~ '^https://(discord\.com|discordapp\.com|api\.telegram\.org)/' or char_length(p_url) > 300 then raise exception 'only Discord or Telegram links are accepted'; end if;
  insert into app_settings (key, value) values ('webhook', p_url) on conflict (key) do update set value = excluded.value;
end $$;
create or replace function public.admin_webhook_state() returns json
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select value into v from app_settings where key = 'webhook';
  return json_build_object('set', v is not null, 'kind', case when v like '%telegram%' then 'Telegram' when v is not null then 'Discord' end);
end $$;
create or replace function public.send_notification(p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  select value into v from app_settings where key = 'webhook';
  if v is null then return; end if;
  perform net.http_post(url := v, body := case when v like '%api.telegram.org%' then jsonb_build_object('text', left(p_text, 1500)) else jsonb_build_object('content', left(p_text, 1500)) end,
    headers := '{"Content-Type": "application/json"}'::jsonb);
exception when others then null;   -- a broken webhook must never block a visitor's report
end $$;
revoke all on function public.send_notification(text) from public, anon, authenticated;
create or replace function public.admin_test_webhook() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  perform public.send_notification('✅ GuessWhoAmI: уведомления работают.');
end $$;
create or replace function public.notify_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'report' then perform public.send_notification('🐞 Новая жалоба на guesswhoami.eu' || E'\n' || coalesce(new.path, '') || E'\n' || coalesce(new.info, '')); end if;
  return new;
end $$;
drop trigger if exists events_notify on public.events;
create trigger events_notify after insert on public.events for each row when (new.kind = 'report') execute function public.notify_report();

-- ---------- backup ----------
create or replace function public.backup_data() returns json
language sql security definer set search_path = public as $$
  select json_build_object(
    'made_at', now(),
    'users', (select coalesce(json_agg(json_build_object('id', id, 'email', email, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at, 'meta', raw_user_meta_data)), '[]'::json) from auth.users),
    'profiles', (select coalesce(json_agg(p), '[]'::json) from profiles p),
    'board', (select coalesce(json_agg(d), '[]'::json) from docs d),
    'banned', (select coalesce(json_agg(b), '[]'::json) from banned_users b),
    'admins', (select coalesce(json_agg(a), '[]'::json) from admins a),
    'announcement', (select row_to_json(a) from announcements a where id = 1),
    'reports', (select coalesce(json_agg(r), '[]'::json) from (select e.id, e.created_at, e.path, e.info, s.status, s.note from events e left join report_status s on s.event_id = e.id where e.kind = 'report') r),
    'events_30d', (select coalesce(json_agg(e), '[]'::json) from (select id, created_at, vid, kind, path, uname from events where created_at > now() - interval '30 days' and kind <> 'report' order by id limit 50000) e));
$$;
revoke all on function public.backup_data() from public, anon, authenticated;
create or replace function public.admin_export() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return public.backup_data();
end $$;

do $$ declare f text; begin
  foreach f in array array['admin_reports(text)', 'admin_set_report(bigint,text,text)', 'admin_users(text)', 'admin_ban(uuid,boolean,text)', 'admin_reset_score(uuid)', 'admin_set_nick(uuid,text)',
    'admin_delete_user(uuid)', 'admin_set_announcement(text,boolean)', 'admin_get_announcement()', 'admin_set_webhook(text)', 'admin_webhook_state()', 'admin_test_webhook()', 'admin_export()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
