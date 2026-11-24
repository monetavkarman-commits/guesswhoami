-- WhoAmIGuess: the leaderboard nickname lives in public.profiles and may be changed once every 7 days (admins: any time).
-- Safe to run again. Needs schema.sql and analytics.sql (is_admin) first.
alter table public.profiles add column if not exists name_changed_at timestamptz;   -- null = never changed (sign-up name), so the first change is free

-- enforced in the database, so a direct table write from the browser is held to the same rule as the button
create or replace function public.profiles_nick_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.name_changed_at := null;   -- the name chosen at sign-up does not count as a change
    return new;
  end if;
  new.name := trim(new.name);
  if new.name is not distinct from old.name then
    new.name_changed_at := old.name_changed_at;   -- the client cannot reset its own timer
    return new;
  end if;
  -- auth.uid() is null for the dashboard / service role; admins and staff are not limited
  if auth.uid() is not null and not public.is_admin()
     and old.name_changed_at is not null and old.name_changed_at > now() - interval '7 days' then
    raise exception 'nick_cooldown' using detail = to_char(old.name_changed_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), errcode = 'P0001';
  end if;
  new.name_changed_at := now();
  return new;
end $$;
drop trigger if exists profiles_nick_guard on public.profiles;
create trigger profiles_nick_guard before insert or update on public.profiles for each row execute function public.profiles_nick_guard();

-- what the profile window shows: current name, when it can be changed next (null = now) and whether the limit applies
create or replace function public.my_nick() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles%rowtype; adm boolean;
begin
  if uid is null then raise exception 'login required'; end if;
  select * into p from profiles where id = uid;
  adm := public.is_admin();
  return json_build_object('name', p.name, 'changed_at', p.name_changed_at, 'admin', adm,
    'next_at', case when not adm and p.name_changed_at > now() - interval '7 days' then p.name_changed_at + interval '7 days' end);
end $$;

-- the one way the site changes a nickname; returns the same shape as my_nick()
create or replace function public.set_my_nick(p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := trim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'login required'; end if;
  if char_length(n) not between 2 and 24 then raise exception 'bad name'; end if;
  insert into profiles (id, name) values (uid, n) on conflict (id) do update set name = excluded.name;
  return public.my_nick();
end $$;

revoke all on function public.profiles_nick_guard() from public, anon, authenticated;
revoke all on function public.my_nick() from public, anon;
revoke all on function public.set_my_nick(text) from public, anon;
grant execute on function public.my_nick() to authenticated;
grant execute on function public.set_my_nick(text) to authenticated;
