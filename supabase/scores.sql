-- GuessWhoAmI: leaderboard scores can only be written through submit_score(), which checks them. Run once in Supabase → SQL Editor → Run.
-- After this, a logged-in player can no longer edit their own board row directly (so nobody can put in a made-up total).
drop policy if exists "docs insert own" on public.docs;
drop policy if exists "docs update own" on public.docs;
create policy "docs insert own" on public.docs for insert with check (owner = auth.uid() and collection = 'duels' and id like '%-' || auth.uid()::text);
create policy "docs update own" on public.docs for update using (owner = auth.uid() and collection = 'duels') with check (owner = auth.uid() and collection = 'duels');

create or replace function public.submit_score(p_game text, p_mode text, p_day int, p_score int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  srv int := (current_date - date '2026-11-17') + 1; -- puzzle number of today (the site starts at 1 on 2026-11-17)
  k text := p_game || ':' || p_mode || ':' || p_day;
  cur jsonb;
  s jsonb;
  kk text;
  b jsonb;
begin
  if uid is null then raise exception 'login required'; end if;
  if to_regclass('public.banned_users') is not null and exists (select 1 from public.banned_users where id = uid) then raise exception 'banned'; end if;
  if p_game !~ '^[a-z0-9]{2,16}$' then raise exception 'bad game'; end if;      -- any game id of the site (new games need no change here)
  if p_mode not in ('grid', 'whoami', 'chain', 'items', 'maps', 'gear', 'team', 'lineup') then raise exception 'bad mode'; end if;
  if p_score < 0 or p_score > 1000 then raise exception 'bad score'; end if;   -- the highest a single daily game can give is 1000
  if p_day < srv - 1 or p_day > srv + 1 then raise exception 'bad day'; end if; -- only today's puzzle (±1 for time zones)
  select data into cur from docs where collection = 'board' and id = uid::text;
  if cur is null then cur := jsonb_build_object('scores', '{}'::jsonb, 'total', 0, 'games', 0); end if;
  s := coalesce(cur -> 'scores', '{}'::jsonb);
  if s ? k then return; end if;                                                 -- one result per game, mode and day
  s := s || jsonb_build_object(k, p_score);
  for kk in select jsonb_object_keys(s) loop                                    -- keep the last 14 days of detail; totals keep everything
    if split_part(kk, ':', 3)::int < p_day - 14 then s := s - kk; end if;
  end loop;
  b := coalesce(cur -> 'by', '{}'::jsonb);                                       -- per-game totals for the personal statistics
  b := b || jsonb_build_object(p_game, jsonb_build_object('t', coalesce((b -> p_game ->> 't')::int, 0) + p_score, 'n', coalesce((b -> p_game ->> 'n')::int, 0) + 1, 'best', greatest(coalesce((b -> p_game ->> 'best')::int, 0), p_score)));
  cur := jsonb_build_object('scores', s, 'by', b, 'total', coalesce((cur ->> 'total')::int, 0) + p_score, 'games', coalesce((cur ->> 'games')::int, 0) + 1, 'updated', now());
  insert into docs (collection, id, owner, data) values ('board', uid::text, uid, cur)
    on conflict (collection, id) do update set data = excluded.data, updated_at = now();
end $$;
revoke all on function public.submit_score(text, text, int, int) from public, anon;
grant execute on function public.submit_score(text, text, int, int) to authenticated;
