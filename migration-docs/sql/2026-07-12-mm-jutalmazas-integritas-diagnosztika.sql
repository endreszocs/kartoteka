-- Missziós Műhely — jutalmazási integritás, csak olvasás
-- A Supabase SQL Editorban futtasd egyben, majd küldd vissza az egyetlen JSON-sort.

with task_summary as (
  select
    count(*) as osszes,
    count(*) filter (where statusz = 'kesz') as kesz,
    count(*) filter (where statusz = 'kesz' and hatarido is not null) as kesz_hataridos,
    count(*) filter (
      where statusz = 'kesz'
        and hatarido is not null
        and (updated_at at time zone 'Europe/Bucharest')::date <= hatarido
    ) as updated_proxy_idoben,
    count(*) filter (
      where statusz = 'kesz'
        and hatarido is not null
        and (updated_at at time zone 'Europe/Bucharest')::date > hatarido
    ) as updated_proxy_kesve
  from public.mm_feladatok
),
self_votes as (
  select
    count(*) filter (where vote.tipus = 'tamogatas') as sajat_tamogatas,
    count(*) filter (where vote.tipus = 'csatlakozas') as sajat_csatlakozas
  from public.mm_szavazatok vote
  join public.mm_otletek idea on idea.id = vote.otlet_id
  where idea.otletgazda_id = vote.user_id
),
self_ratings as (
  select count(*) as sajat_ertekeles
  from public.mm_segedanyag_ertekelesek rating
  join public.mm_segedanyagok material on material.id = rating.segedanyag_id
  where rating.user_id = material.feltolto_id
),
idea_statuses as (
  select coalesce(jsonb_object_agg(statusz, darab order by statusz), '{}'::jsonb) as ertek
  from (
    select coalesce(statusz, '<null>') as statusz, count(*) as darab
    from public.mm_otletek
    group by coalesce(statusz, '<null>')
  ) grouped
),
idea_update_policies as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'policyname', policyname,
        'roles', roles,
        'cmd', cmd,
        'qual', qual,
        'with_check', with_check
      )
      order by policyname
    ),
    '[]'::jsonb
  ) as ertek
  from pg_policies
  where schemaname = 'public'
    and tablename = 'mm_otletek'
    and cmd in ('UPDATE', 'ALL')
),
earned_badges as (
  select coalesce(jsonb_object_agg(kod, darab order by sorrend), '{}'::jsonb) as ertek
  from (
    select badge_type.kod, badge_type.sorrend, count(*) as darab
    from public.mm_felhasznalo_jelveny earned
    join public.mm_jelveny_tipusok badge_type on badge_type.id = earned.jelveny_id
    group by badge_type.kod, badge_type.sorrend
  ) grouped
),
stats_summary as (
  select
    count(*) as felhasznalok,
    coalesce(sum(osszpontszam), 0) as osszpont,
    coalesce(max(osszpontszam), 0) as max_pont
  from public.mm_felhasznalo_statisztika
)
select jsonb_build_object(
  'feladatok', to_jsonb(task_summary),
  'sajat_interakciok', to_jsonb(self_votes) || to_jsonb(self_ratings),
  'otlet_statuszok', idea_statuses.ertek,
  'otlet_update_policies', idea_update_policies.ertek,
  'meglevo_jelvenyek', earned_badges.ertek,
  'statisztika', to_jsonb(stats_summary)
) as mm_jutalmazas_integritas
from task_summary,
  self_votes,
  self_ratings,
  idea_statuses,
  idea_update_policies,
  earned_badges,
  stats_summary;
