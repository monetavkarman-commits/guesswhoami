-- Server-side limit for visitors without an account: 3 puzzles per network + browser type.
-- Run once in the Supabase SQL editor (safe to run again).
-- The visitor's address is never stored, only a salted hash of "address + browser".

create table if not exists public.guest_plays (
  who text not null,
  seed text not null,
  at timestamptz not null default now(),
  primary key (who, seed)
);
alter table public.guest_plays enable row level security;
-- no policies: nobody can read or write the table directly, only the function below can

create or replace function public.guest_play(p_seed text, p_register boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare
  hdr json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := coalesce(hdr->>'cf-connecting-ip', split_part(coalesce(hdr->>'x-forwarded-for', ''), ',', 1), 'unknown');
  w text := encode(sha256(convert_to('gwai-salt-9f1c|' || trim(ip) || '|' || coalesce(hdr->>'user-agent', ''), 'UTF8')), 'hex');
  used int;
  have boolean;
  lim constant int := 3;
begin
  if auth.uid() is not null then return json_build_object('ok', true, 'used', 0, 'limit', lim); end if;   -- logged in: no limit
  if p_seed is null or p_seed !~ '^[A-Za-z0-9:_.-]{3,80}$' then return json_build_object('ok', false, 'used', 0, 'limit', lim); end if;
  delete from public.guest_plays where at < now() - interval '30 days';
  select count(*) into used from public.guest_plays where who = w;
  select exists(select 1 from public.guest_plays where who = w and seed = p_seed) into have;
  if have then return json_build_object('ok', true, 'used', used, 'limit', lim); end if;   -- this puzzle was already started
  if used >= lim then return json_build_object('ok', false, 'used', used, 'limit', lim); end if;
  if p_register then
    insert into public.guest_plays(who, seed) values (w, p_seed) on conflict do nothing;
    used := used + 1;
  end if;
  return json_build_object('ok', true, 'used', used, 'limit', lim);
end $$;

revoke all on function public.guest_play(text, boolean) from public;
grant execute on function public.guest_play(text, boolean) to anon, authenticated;
