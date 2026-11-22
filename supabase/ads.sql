-- GuessWhoAmI: direct (sponsor) advertising. Run after analytics.sql and admin.sql; safe to run again.
-- Ads are off until the owner switches them on in the admin panel (Реклама). Counting is anonymous: only totals per ad, no visitor data.
create table if not exists public.ads (
  id bigint generated always as identity primary key,
  slot text not null check (slot in ('home', 'game', 'footer')),
  title text not null check (char_length(title) between 1 and 80),
  body text check (char_length(body) <= 160),
  url text not null check (url ~ '^https://' and char_length(url) <= 300),
  img text check (img is null or (img like 'data:image/%' and char_length(img) <= 200000)),
  advertiser text check (char_length(advertiser) <= 80),
  active boolean not null default false,
  starts date, ends date,
  weight int not null default 1 check (weight between 1 and 10),
  impressions bigint not null default 0, clicks bigint not null default 0,
  created_at timestamptz not null default now());
alter table public.ads enable row level security;   -- no policies: only the functions below touch it

-- what visitors get: one running ad for a slot (random by weight), only while the global switch is on
create or replace function public.get_ad(p_slot text) returns json
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if coalesce((select value from app_settings where key = 'ads_enabled'), '0') <> '1' then return null; end if;
  select id, title, body, url, img, advertiser into r from ads
    where slot = p_slot and active and (starts is null or starts <= current_date) and (ends is null or ends >= current_date)
    order by random() ^ (1.0 / weight) desc limit 1;
  if r.id is null then return null; end if;
  return json_build_object('id', r.id, 'title', r.title, 'body', r.body, 'url', r.url, 'img', r.img, 'advertiser', r.advertiser);
end $$;
create or replace function public.ad_event(p_id bigint, p_kind text) returns void
language sql security definer set search_path = public as $$
  update ads set impressions = impressions + (p_kind = 'view')::int, clicks = clicks + (p_kind = 'click')::int where id = p_id and active and p_kind in ('view', 'click');
$$;
revoke all on function public.get_ad(text), public.ad_event(bigint, text) from public;
grant execute on function public.get_ad(text), public.ad_event(bigint, text) to anon, authenticated;

-- owner/staff with the "ads" permission
create or replace function public.admin_ads() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ads') then raise exception 'forbidden'; end if;
  return json_build_object('enabled', coalesce((select value from app_settings where key = 'ads_enabled'), '0') = '1',
    'ads', (select coalesce(json_agg(a order by a.id desc), '[]'::json) from (select id, slot, title, body, url, img, advertiser, active, starts, ends, weight, impressions, clicks from ads) a));
end $$;
create or replace function public.admin_save_ad(p_ad jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint := nullif(p_ad ->> 'id', '')::bigint;
begin
  if not public.has_perm('ads') then raise exception 'forbidden'; end if;
  if i is null then
    insert into ads (slot, title, body, url, img, advertiser, active, starts, ends, weight)
    values (p_ad ->> 'slot', p_ad ->> 'title', nullif(p_ad ->> 'body', ''), p_ad ->> 'url', nullif(p_ad ->> 'img', ''), nullif(p_ad ->> 'advertiser', ''),
      coalesce((p_ad ->> 'active')::boolean, false), nullif(p_ad ->> 'starts', '')::date, nullif(p_ad ->> 'ends', '')::date, coalesce((p_ad ->> 'weight')::int, 1)) returning id into i;
  else
    update ads set slot = p_ad ->> 'slot', title = p_ad ->> 'title', body = nullif(p_ad ->> 'body', ''), url = p_ad ->> 'url', img = nullif(p_ad ->> 'img', ''),
      advertiser = nullif(p_ad ->> 'advertiser', ''), active = coalesce((p_ad ->> 'active')::boolean, false), starts = nullif(p_ad ->> 'starts', '')::date,
      ends = nullif(p_ad ->> 'ends', '')::date, weight = coalesce((p_ad ->> 'weight')::int, 1) where id = i;
  end if;
  perform public.log_admin('ad_save', i::text || ' ' || coalesce(p_ad ->> 'title', ''));
  return i;
end $$;
create or replace function public.admin_delete_ad(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ads') then raise exception 'forbidden'; end if;
  delete from ads where id = p_id;
  perform public.log_admin('ad_delete', p_id::text);
end $$;
create or replace function public.admin_set_ads_enabled(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ads') then raise exception 'forbidden'; end if;
  insert into app_settings (key, value) values ('ads_enabled', case when p_on then '1' else '0' end) on conflict (key) do update set value = excluded.value;
  perform public.log_admin('ads_enabled', p_on::text);
end $$;
do $$ declare f text; begin
  foreach f in array array['admin_ads()', 'admin_save_ad(jsonb)', 'admin_delete_ad(bigint)', 'admin_set_ads_enabled(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
