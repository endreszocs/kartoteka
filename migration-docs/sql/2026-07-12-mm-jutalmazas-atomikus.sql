-- Missziós Műhely — atomikus, idempotens pont- és jelvénykiosztás
-- Élő séma alapján: 2026-07-11-i diagnosztika, PostgreSQL 17.6.
-- Fő garanciák:
--   * ugyanazért a forráseseményért egy felhasználó csak egyszer kap pontot;
--   * a pont, a statisztika, a szint és a jelvény egy tranzakcióban frissül;
--   * a ki-/visszacsatlakozás és a feladat újranyitása nem farmolható;
--   * a 14 napos szavazás, az 5 támogatós továbbjutás és a megvalósítás
--     adatbázis-szintű, párhuzamos kérések mellett is konzisztens állapotgép;
--   * az értékelések, ötlet-státuszok és mind a 12 jelvény élő szabályt kap;
--   * az új ledger RLS-védett, a privileged függvények nem exponált sémában élnek.

begin;

-- A történeti seed és a triggerek csatlakoztatása között nem veszhet el írás.
-- A zárolás csak a tranzakció végéig tart; az olvasás közben is engedélyezett.
lock table
  public.mm_otletek,
  public.mm_szavazatok,
  public.mm_hozzaszolasok,
  public.mm_segedanyagok,
  public.mm_segedanyag_ertekelesek,
  public.mm_feladatok,
  public.mm_merfoldkovek,
  public.mm_dokumentumok,
  public.mm_felhasznalo_statisztika,
  public.mm_felhasznalo_jelveny
in share row exclusive mode;

-- -----------------------------------------------------------------------------
-- 1. Privát függvényséma + publikus, saját sorra olvasható jutalomnapló
-- -----------------------------------------------------------------------------

create schema if not exists mm_private;
revoke all on schema mm_private from public, anon, authenticated;

create table if not exists public.mm_jutalom_esemenyek (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  esemeny_tipus text not null,
  forras_id uuid not null,
  pont integer not null default 0 check (pont >= 0 and pont <= 1000),
  stat_kulcs text,
  elozo_szint text,
  uj_szint text,
  uj_osszpontszam integer,
  uj_jelvenyek text[] not null default array[]::text[],
  migralt boolean not null default false,
  utolso_kiserlet_alkalmazva boolean not null default true,
  utolso_kiserlet_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mm_jutalom_esemenyek_tipus_check check (
    esemeny_tipus = any (array[
      'otlet_bekuldve'::text,
      'otlet_tovabbjutott'::text,
      'otlet_megvalosult'::text,
      'szavazat_adva'::text,
      'csatlakozas'::text,
      'hozzaszolas'::text,
      'segedanyag_feltoltes'::text,
      'ertekeles_adva'::text,
      'feladat_teljesitve'::text
    ])
  ),
  constraint mm_jutalom_esemenyek_unique unique (user_id, esemeny_tipus, forras_id)
);

comment on table public.mm_jutalom_esemenyek is
  'Idempotens Missziós Műhely jutalomnapló; egy forrásesemény felhasználónként egyszer pontozható.';

create index if not exists mm_jutalom_esemenyek_user_created_idx
  on public.mm_jutalom_esemenyek (user_id, created_at desc);

-- Az egyszeres tulajdonosú források ugyanazért a rekordért globálisan csak
-- egyszer pontozhatók. A támogatás/csatlakozás/értékelés továbbra is userenkénti.
create unique index if not exists mm_jutalom_esemenyek_source_once_idx
  on public.mm_jutalom_esemenyek (esemeny_tipus, forras_id)
  where esemeny_tipus in (
    'otlet_bekuldve',
    'otlet_tovabbjutott',
    'otlet_megvalosult',
    'hozzaszolas',
    'segedanyag_feltoltes',
    'feladat_teljesitve'
  );

alter table public.mm_jutalom_esemenyek enable row level security;

drop policy if exists mm_jutalom_esemenyek_select_own on public.mm_jutalom_esemenyek;
create policy mm_jutalom_esemenyek_select_own
  on public.mm_jutalom_esemenyek
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.mm_jutalom_esemenyek from public, anon, authenticated;
grant select on table public.mm_jutalom_esemenyek to authenticated;
grant select on table public.mm_jutalom_esemenyek to service_role;

-- A Megbízható jelvényhez szükséges, korábban hiányzó teljesítési időpont.
alter table public.mm_feladatok
  add column if not exists teljesitve_at timestamptz;

alter table public.mm_feladatok
  add column if not exists teljesites_felelos_id uuid references auth.users(id) on delete set null,
  add column if not exists teljesites_hatarido date;

comment on column public.mm_feladatok.teljesitve_at is
  'Az első, migráció utáni kesz állapotba lépés bizonyított időpontja; újranyitáskor megmarad.';

comment on column public.mm_feladatok.teljesites_felelos_id is
  'Az első bizonyított teljesítéskor rögzített felelős; kliensből utólag nem módosítható.';

comment on column public.mm_feladatok.teljesites_hatarido is
  'Az első bizonyított teljesítés előtti határidő pillanatképe; kliensből utólag nem módosítható.';

-- A régi kész feladatokhoz NEM találunk ki teljesítési időt updated_at/created_at
-- alapján. NULL maradnak, ezért csak a migráció utáni bizonyított átmenetek
-- számíthatnak bele a Megbízható jelvénybe.

-- A projekt gyermekadatai csak akkor olvashatók, ha maga a szülő ötlet is
-- látható az mm_otletek RLS-en keresztül. Ez lezárja a közvetlen REST-lekérés
-- útját inaktív/archivált ötletek feladataihoz és dokumentumaihoz.
drop policy if exists mm_feladatok_read_all on public.mm_feladatok;
create policy mm_feladatok_read_all
  on public.mm_feladatok for select to authenticated
  using (exists (
    select 1 from public.mm_otletek idea
    where idea.id = mm_feladatok.otlet_id
  ));

drop policy if exists mm_merfoldkovek_read_all on public.mm_merfoldkovek;
create policy mm_merfoldkovek_read_all
  on public.mm_merfoldkovek for select to authenticated
  using (exists (
    select 1 from public.mm_otletek idea
    where idea.id = mm_merfoldkovek.otlet_id
  ));

drop policy if exists mm_dokumentumok_read_all on public.mm_dokumentumok;
create policy mm_dokumentumok_read_all
  on public.mm_dokumentumok for select to authenticated
  using (exists (
    select 1 from public.mm_otletek idea
    where idea.id = mm_dokumentumok.otlet_id
  ));

drop policy if exists mm_hozzaszolasok_read_all on public.mm_hozzaszolasok;
create policy mm_hozzaszolasok_read_all
  on public.mm_hozzaszolasok for select to authenticated
  using (exists (
    select 1 from public.mm_otletek idea
    where idea.id = mm_hozzaszolasok.otlet_id
  ));

drop policy if exists mm_szavazatok_read_all on public.mm_szavazatok;
create policy mm_szavazatok_read_all
  on public.mm_szavazatok for select to authenticated
  using (exists (
    select 1 from public.mm_otletek idea
    where idea.id = mm_szavazatok.otlet_id
  ));

-- -----------------------------------------------------------------------------
-- 2. Szint- és jelvényértékelés
-- -----------------------------------------------------------------------------

create or replace function mm_private.mm_level_for_points(p_points integer)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case
    when greatest(coalesce(p_points, 0), 0) >= 1200 then 'Missziói bajnok'
    when greatest(coalesce(p_points, 0), 0) >= 700 then 'Közösségépítő'
    when greatest(coalesce(p_points, 0), 0) >= 350 then 'Tapasztalt munkatárs'
    when greatest(coalesce(p_points, 0), 0) >= 150 then 'Lelkes misszionárius'
    when greatest(coalesce(p_points, 0), 0) >= 50 then 'Szolgálattevő'
    else 'Újonc'
  end
$function$;

revoke all on function mm_private.mm_level_for_points(integer) from public, anon, authenticated;

create or replace function mm_private.mm_refresh_badges(p_user_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stats public.mm_felhasznalo_statisztika%rowtype;
  v_new_badges text[] := array[]::text[];
begin
  if p_user_id is null then
    return v_new_badges;
  end if;

  select *
  into v_stats
  from public.mm_felhasznalo_statisztika
  where user_id = p_user_id;

  if not found then
    return v_new_badges;
  end if;

  with eligible(kod) as (
    select 'elso_otlet'::text
    where coalesce(v_stats.otletek_szama, 0) >= 1
    union all
    select 'otletgyaros'::text
    where coalesce(v_stats.otletek_szama, 0) >= 5
    union all
    select 'tamogato'::text
    where coalesce(v_stats.tamogatasok_adva, 0) >= 10
    union all
    select 'tamogato_bajnok'::text
    where coalesce(v_stats.tamogatasok_adva, 0) >= 25
    union all
    select 'kozossegi'::text
    where (
      select count(distinct event.forras_id)
      from public.mm_jutalom_esemenyek event
      where event.user_id = p_user_id
        and event.esemeny_tipus = 'csatlakozas'
    ) >= 3
    union all
    select 'feltolto'::text
    where coalesce(v_stats.segedanyagok_feltoltve, 0) >= 5
    union all
    select 'siker'::text
    where coalesce(v_stats.megvalosult_otletek, 0) >= 1
    union all
    select 'nagy_siker'::text
    where coalesce(v_stats.megvalosult_otletek, 0) >= 3
    union all
    select 'top_ertekelo'::text
    where coalesce(v_stats.ertekelesek_adva, 0) >= 20
    union all
    select 'hozzaszolo'::text
    where coalesce(v_stats.hozzaszolasok_szama, 0) >= 50
    union all
    select 'mentor'::text
    where coalesce(v_stats.feladatok_teljesitve, 0) >= 10
    union all
    select 'megbizhato'::text
    where (
      select count(*)
      from (
        select responsibility.otlet_id
        from (
          select
            task.id,
            task.otlet_id,
            task.statusz,
            task.teljesites_hatarido as hatarido,
            task.teljesitve_at,
            completion.id is not null as completed_by_user
          from public.mm_feladatok task
          join public.mm_otletek idea on idea.id = task.otlet_id
          left join public.mm_jutalom_esemenyek completion
            on completion.esemeny_tipus = 'feladat_teljesitve'
            and completion.forras_id = task.id
            and completion.user_id = p_user_id
            and completion.migralt = false
          where idea.statusz = 'megvalosult'
            and (
              task.felelos_id = p_user_id
              or task.teljesites_felelos_id = p_user_id
              or completion.id is not null
            )
        ) responsibility
        group by responsibility.otlet_id
        having count(*) filter (where responsibility.hatarido is not null) > 0
          and bool_and(
            responsibility.statusz = 'kesz'
            and responsibility.completed_by_user
            and responsibility.teljesitve_at is not null
            and (
              responsibility.hatarido is null
              or (responsibility.teljesitve_at at time zone 'Europe/Bucharest')::date
                <= responsibility.hatarido
            )
          )
      ) reliable_projects
    ) >= 3
  ),
  inserted as (
    insert into public.mm_felhasznalo_jelveny (user_id, jelveny_id)
    select p_user_id, badge_type.id
    from eligible
    join public.mm_jelveny_tipusok badge_type on badge_type.kod = eligible.kod
    on conflict (user_id, jelveny_id) do nothing
    returning jelveny_id
  )
  select coalesce(array_agg(badge_type.kod order by badge_type.sorrend), array[]::text[])
  into v_new_badges
  from inserted
  join public.mm_jelveny_tipusok badge_type on badge_type.id = inserted.jelveny_id;

  return coalesce(v_new_badges, array[]::text[]);
end
$function$;

revoke all on function mm_private.mm_refresh_badges(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Egyetlen atomikus jutalmazó belső függvény
-- -----------------------------------------------------------------------------

create or replace function mm_private.mm_award_event(
  p_user_id uuid,
  p_event_type text,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
  v_points integer;
  v_stat_key text;
  v_old_level text;
  v_new_level text;
  v_new_total integer;
  v_new_badges text[] := array[]::text[];
begin
  if p_user_id is null or p_source_id is null then
    return null;
  end if;

  select rule.points, rule.stat_key
  into v_points, v_stat_key
  from (
    values
      ('otlet_bekuldve'::text, 10, 'otletek_szama'::text),
      ('otlet_tovabbjutott'::text, 25, 'elfogadott_otletek'::text),
      ('otlet_megvalosult'::text, 50, 'megvalosult_otletek'::text),
      ('szavazat_adva'::text, 2, 'tamogatasok_adva'::text),
      ('csatlakozas'::text, 5, null::text),
      ('hozzaszolas'::text, 3, 'hozzaszolasok_szama'::text),
      ('segedanyag_feltoltes'::text, 8, 'segedanyagok_feltoltve'::text),
      ('ertekeles_adva'::text, 1, 'ertekelesek_adva'::text),
      ('feladat_teljesitve'::text, 10, 'feladatok_teljesitve'::text)
  ) as rule(event_type, points, stat_key)
  where rule.event_type = p_event_type;

  if not found then
    raise exception 'Ismeretlen Missziós Műhely esemény: %', p_event_type
      using errcode = '22023';
  end if;

  -- Minden esemény ugyanabban a sorrendben zárol: előbb a felhasználó
  -- statisztikasora, utána az eseménynapló. Ez az egy felhasználót érintő,
  -- párhuzamos jutalmakat sorosítja, és megszünteti a ledger/stats holtpontot.
  insert into public.mm_felhasznalo_statisztika (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select coalesce(stats.szint, mm_private.mm_level_for_points(stats.osszpontszam))
  into v_old_level
  from public.mm_felhasznalo_statisztika stats
  where stats.user_id = p_user_id
  for update;

  insert into public.mm_jutalom_esemenyek (
    user_id,
    esemeny_tipus,
    forras_id,
    pont,
    stat_kulcs
  )
  values (
    p_user_id,
    p_event_type,
    p_source_id,
    v_points,
    v_stat_key
  )
  on conflict do nothing
  returning id into v_event_id;

  -- Dupla kérés, újracsatlakozás vagy újranyitott feladat: nincs új pont.
  if v_event_id is null then
    update public.mm_jutalom_esemenyek event
    set
      utolso_kiserlet_alkalmazva = false,
      utolso_kiserlet_at = now()
    where event.user_id = p_user_id
      and event.esemeny_tipus = p_event_type
      and event.forras_id = p_source_id;

    return (
      select jsonb_build_object(
        'applied', false,
        'points', event.pont,
        'totalPoints', event.uj_osszpontszam,
        'previousLevel', event.elozo_szint,
        'newLevel', event.uj_szint,
        'newBadges', event.uj_jelvenyek
      )
      from public.mm_jutalom_esemenyek event
      where event.user_id = p_user_id
        and event.esemeny_tipus = p_event_type
        and event.forras_id = p_source_id
    );
  end if;

  update public.mm_felhasznalo_statisztika stats
  set
    otletek_szama = coalesce(stats.otletek_szama, 0)
      + case when v_stat_key = 'otletek_szama' then 1 else 0 end,
    elfogadott_otletek = coalesce(stats.elfogadott_otletek, 0)
      + case when v_stat_key = 'elfogadott_otletek' then 1 else 0 end,
    megvalosult_otletek = coalesce(stats.megvalosult_otletek, 0)
      + case when v_stat_key = 'megvalosult_otletek' then 1 else 0 end,
    tamogatasok_adva = coalesce(stats.tamogatasok_adva, 0)
      + case when v_stat_key = 'tamogatasok_adva' then 1 else 0 end,
    hozzaszolasok_szama = coalesce(stats.hozzaszolasok_szama, 0)
      + case when v_stat_key = 'hozzaszolasok_szama' then 1 else 0 end,
    segedanyagok_feltoltve = coalesce(stats.segedanyagok_feltoltve, 0)
      + case when v_stat_key = 'segedanyagok_feltoltve' then 1 else 0 end,
    feladatok_teljesitve = coalesce(stats.feladatok_teljesitve, 0)
      + case when v_stat_key = 'feladatok_teljesitve' then 1 else 0 end,
    ertekelesek_adva = coalesce(stats.ertekelesek_adva, 0)
      + case when v_stat_key = 'ertekelesek_adva' then 1 else 0 end,
    osszpontszam = coalesce(stats.osszpontszam, 0) + v_points,
    szint = mm_private.mm_level_for_points(coalesce(stats.osszpontszam, 0) + v_points),
    frissitve = now()
  where stats.user_id = p_user_id
  returning stats.osszpontszam, stats.szint
  into v_new_total, v_new_level;

  v_new_badges := mm_private.mm_refresh_badges(p_user_id);

  update public.mm_jutalom_esemenyek
  set
    elozo_szint = v_old_level,
    uj_szint = v_new_level,
    uj_osszpontszam = v_new_total,
    uj_jelvenyek = coalesce(v_new_badges, array[]::text[]),
    utolso_kiserlet_alkalmazva = true,
    utolso_kiserlet_at = now()
  where id = v_event_id;

  return jsonb_build_object(
    'applied', true,
    'points', v_points,
    'totalPoints', v_new_total,
    'previousLevel', v_old_level,
    'newLevel', v_new_level,
    'newBadges', coalesce(v_new_badges, array[]::text[])
  );
end
$function$;

revoke all on function mm_private.mm_award_event(uuid, text, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Forrástábla-triggerek — a jutalom együtt commitol az alapművelettel
-- -----------------------------------------------------------------------------

-- Jóváhagyott ötletút:
--   uj -> (kizárólag az ötletgazda) 14 napos szavazas
--   szavazas -> (5 különböző, nem tulajdonos támogató) automatikus kozos_munka
--   kozos_munka -> (ötletgazda/globális admin) megvalosult, ha minden feladat kész
-- A trigger a széles, sor-alapú UPDATE RLS mellett oszlopszinten is védi az
-- állapotot, a szavazási időablakot és a denormalizált számlálókat.
create or replace function mm_private.mm_idea_workflow_guard_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_is_admin boolean := false;
  v_support_count integer := 0;
  v_task_count integer := 0;
  v_all_tasks_done boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'Missziós Műhely ötlet nem törölhető véglegesen; archiváld az aktiv jelző kikapcsolásával.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.statusz := 'uj';
    new.szavazas_kezdete := null;
    new.szavazas_vege := null;
    new.tamogatasok_szama := 0;
    new.csatlakozok_szama := 0;
    new.hozzaszolasok_szama := 0;
    return new;
  end if;

  v_actor_id := (select auth.uid());
  -- A rendszer általános current_user_has_global_access() helpere jelenleg
  -- esperesi szerepköröket is magában foglal. A műhely állapotgépében a
  -- „globális admin” szándékosan a DB-s, aktív system admin szerepet jelenti.
  select exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and profile.status = 'active'
      and profile.role = 'admin'
  )
  into v_is_admin;

  -- Az ötletgazda a sor létrejötte után nem cserélhető le közvetlen REST
  -- frissítéssel; a jutalmak és a jogosultságok ehhez az azonossághoz kötődnek.
  new.otletgazda_id := old.otletgazda_id;

  -- A publikus REST-kliens nem írhat közvetlenül számlálót. A kapcsolódó
  -- forrástriggerek egymásba ágyazott futásban (trigger depth > 1) tehetik meg.
  if pg_trigger_depth() <= 1 then
    new.tamogatasok_szama := old.tamogatasok_szama;
    new.csatlakozok_szama := old.csatlakozok_szama;
    new.hozzaszolasok_szama := old.hozzaszolasok_szama;
  end if;

  if new.statusz is not distinct from old.statusz then
    -- A 14 napos ablak egyszer indul. Lejárat után az ötlet lezárt
    -- szavazásként marad; új kör vagy automatikus archiválás külön döntésig nincs.
    new.szavazas_kezdete := old.szavazas_kezdete;
    new.szavazas_vege := old.szavazas_vege;

    return new;
  end if;

  if new.statusz = 'szavazas'
    and old.statusz = 'uj' then
    if v_actor_id is null
      or v_actor_id <> old.otletgazda_id then
      raise exception 'Csak az ötletgazda indíthat szavazást.'
        using errcode = '42501';
    end if;

    if not coalesce(old.aktiv, false) or not coalesce(new.aktiv, false) then
      raise exception 'Inaktív ötletnél nem indítható szavazás.'
        using errcode = '23514';
    end if;

    new.szavazas_kezdete := statement_timestamp();
    new.szavazas_vege := statement_timestamp() + interval '14 days';
    return new;
  end if;

  if new.statusz = 'kozos_munka'
    and old.statusz = 'szavazas' then
    select count(distinct vote.user_id)::integer
    into v_support_count
    from public.mm_szavazatok vote
    where vote.otlet_id = old.id
      and vote.tipus = 'tamogatas'
      and vote.user_id <> old.otletgazda_id;

    if pg_trigger_depth() <= 1
      or old.szavazas_kezdete is null
      or old.szavazas_vege is null
      or statement_timestamp() < old.szavazas_kezdete
      or statement_timestamp() >= old.szavazas_vege
      or not coalesce(old.aktiv, false)
      or not coalesce(new.aktiv, false)
      or v_support_count < 5 then
      raise exception 'A közös munka csak aktív szavazásban, 5 különböző támogatónál indulhat.'
        using errcode = '23514';
    end if;

    new.szavazas_kezdete := old.szavazas_kezdete;
    new.szavazas_vege := old.szavazas_vege;
    return new;
  end if;

  if new.statusz = 'megvalosult'
    and old.statusz = 'kozos_munka' then
    if v_actor_id is null
      or (v_actor_id <> old.otletgazda_id and not v_is_admin) then
      raise exception 'Csak az ötletgazda vagy globális admin zárhat le megvalósult projektet.'
        using errcode = '42501';
    end if;

    if not coalesce(old.aktiv, false) or not coalesce(new.aktiv, false) then
      raise exception 'Inaktív projekt nem zárható le megvalósultként.'
        using errcode = '23514';
    end if;

    select count(*)::integer, coalesce(bool_and(task.statusz = 'kesz'), false)
    into v_task_count, v_all_tasks_done
    from public.mm_feladatok task
    where task.otlet_id = old.id;

    if v_task_count < 1 or not v_all_tasks_done then
      raise exception 'A megvalósításhoz legalább egy, és minden feladatnak késznek kell lennie.'
        using errcode = '23514';
    end if;

    new.szavazas_kezdete := old.szavazas_kezdete;
    new.szavazas_vege := old.szavazas_vege;
    return new;
  end if;

  raise exception 'Nem engedélyezett Missziós Műhely státuszátmenet: % -> %', old.statusz, new.statusz
    using errcode = '23514';
end
$function$;

-- Minden feladatmódosítás ugyanazt a szülő ötletsort zárja. Így a
-- megvalósítási kapu és a feladatírások sorosíthatók; megvalósult projekt
-- feladatlistája utólag már nem változtatható.
create or replace function mm_private.mm_task_project_lock_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_idea_id uuid;
  v_idea_status text;
  v_owner_id uuid;
  v_owner_name text;
  v_actor_id uuid;
  v_actor_is_admin boolean := false;
  v_assignee_name text;
begin
  if tg_op = 'UPDATE' and new.otlet_id is distinct from old.otlet_id then
    raise exception 'Feladat nem helyezhető át másik Missziós Műhely projektbe.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    v_idea_id := old.otlet_id;
  else
    v_idea_id := new.otlet_id;
  end if;

  -- A jutalmazott taskot az ötlet hard-delete cascade útja sem tüntetheti el:
  -- különben ugyanaz a munka új UUID-val újra pontozható lenne.
  if tg_op = 'DELETE' and exists (
    select 1
    from public.mm_jutalom_esemenyek reward
    where reward.esemeny_tipus = 'feladat_teljesitve'
      and reward.forras_id = old.id
  ) then
    raise exception 'Már jutalmazott feladat nem törölhető; szükség esetén nyisd újra.'
      using errcode = '23514';
  end if;

  select idea.statusz, idea.otletgazda_id, idea.otletgazda_nev
  into v_idea_status, v_owner_id, v_owner_name
  from public.mm_otletek idea
  where idea.id = v_idea_id
  for update;

  if not found then
    -- Az ötlet törlésekor futó ON DELETE CASCADE alatt a szülősor már nem
    -- látható. Ez az egyetlen megengedett szülő nélküli törlési út.
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'A feladathoz tartozó ötlet nem található.'
      using errcode = '23503';
  end if;

  if v_idea_status is distinct from 'kozos_munka' then
    if v_idea_status = 'megvalosult' then
      raise exception 'Megvalósult projekt feladatai már nem módosíthatók.'
        using errcode = '23514';
    end if;

    raise exception 'Feladat csak közös munka állapotú projektnél módosítható.'
      using errcode = '23514';
  end if;

  v_actor_id := (select auth.uid());
  select exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and profile.status = 'active'
      and profile.role = 'admin'
  )
  into v_actor_is_admin;

  if tg_op in ('INSERT', 'DELETE')
    and v_actor_id is distinct from v_owner_id
    and not v_actor_is_admin then
    raise exception 'Feladatot csak az ötletgazda vagy rendszergazda hozhat létre és törölhet.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and v_actor_id is distinct from v_owner_id
    and not v_actor_is_admin then
    if v_actor_id is distinct from old.felelos_id then
      raise exception 'A feladatot csak a felelős, az ötletgazda vagy rendszergazda módosíthatja.'
        using errcode = '42501';
    end if;

    -- A felelős kizárólag a státuszt mozgathatja; a feladat tartalmát és
    -- kiosztását az ötletgazda/admin kezeli.
    if new.cim is distinct from old.cim
      or new.leiras is distinct from old.leiras
      or new.felelos_id is distinct from old.felelos_id
      or new.felelos_nev is distinct from old.felelos_nev
      or new.hatarido is distinct from old.hatarido
      or new.sorrend is distinct from old.sorrend then
      raise exception 'A felelős csak a saját feladata státuszát módosíthatja.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Közvetlen REST-beszúrással sem hozható létre eleve kész feladat.
    new.statusz := 'fuggeben';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Felelős csak az ötletgazda vagy egy élő csapattag lehet; a megjelenített
  -- nevet a profilból származtatjuk, nem a kliens által küldött szövegből.
  if new.felelos_id is null then
    new.felelos_nev := null;
  else
    if new.felelos_id is distinct from v_owner_id
      and not exists (
        select 1
        from public.mm_szavazatok membership
        where membership.otlet_id = v_idea_id
          and membership.user_id = new.felelos_id
          and membership.tipus = 'csatlakozas'
      ) then
      raise exception 'Feladatfelelős csak az ötletgazda vagy csatlakozott csapattag lehet.'
        using errcode = '23514';
    end if;

    select profile.full_name
    into v_assignee_name
    from public.profiles profile
    where profile.id = new.felelos_id;

    new.felelos_nev := coalesce(
      v_assignee_name,
      case when new.felelos_id = v_owner_id then v_owner_name else null end
    );
  end if;

  return new;
end
$function$;

-- A projekt többi közös tartalma (mérföldkő, dokumentum) is csak a közös
-- munka nyitott szakaszában írható. A szülősor-zár a realizálással versenyző
-- utolsó írást is helyes sorrendbe állítja.
create or replace function mm_private.mm_project_content_guard_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_idea_id uuid;
  v_idea_status text;
begin
  if tg_op = 'UPDATE' and new.otlet_id is distinct from old.otlet_id then
    raise exception 'Projekt-tartalom nem helyezhető át másik ötlethez.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    v_idea_id := old.otlet_id;
  else
    v_idea_id := new.otlet_id;
  end if;

  select idea.statusz
  into v_idea_status
  from public.mm_otletek idea
  where idea.id = v_idea_id
  for update;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'A projekt-tartalomhoz tartozó ötlet nem található.'
      using errcode = '23503';
  end if;

  if v_idea_status is distinct from 'kozos_munka' then
    raise exception 'A projekt tartalma csak közös munka állapotban módosítható.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create or replace function mm_private.mm_reward_idea_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignee uuid;
begin
  if tg_op = 'INSERT' then
    perform mm_private.mm_award_event(new.otletgazda_id, 'otlet_bekuldve', new.id);
    return new;
  end if;

  if new.statusz = 'megvalosult' and old.statusz is distinct from 'megvalosult' then
    -- A realizálás az ötletgazda mellett több felelős Megbízható jelvényét is
    -- frissítheti. Az összes érintett stat-sort még az első award/badge írás
    -- előtt UUID-sorrendben zárjuk, így keresztprojektek sem holtpontoznak.
    insert into public.mm_felhasznalo_statisztika (user_id)
    select participant.user_id
    from (
      select new.otletgazda_id as user_id
      union
      select task.felelos_id
      from public.mm_feladatok task
      where task.otlet_id = new.id
        and task.felelos_id is not null
      union
      select completion.user_id
      from public.mm_jutalom_esemenyek completion
      join public.mm_feladatok task on task.id = completion.forras_id
      where task.otlet_id = new.id
        and completion.esemeny_tipus = 'feladat_teljesitve'
        and completion.migralt = false
    ) participant
    where participant.user_id is not null
    order by participant.user_id
    on conflict (user_id) do nothing;

    perform 1
    from public.mm_felhasznalo_statisztika stats
    where stats.user_id in (
      select participant.user_id
      from (
        select new.otletgazda_id as user_id
        union
        select task.felelos_id
        from public.mm_feladatok task
        where task.otlet_id = new.id
          and task.felelos_id is not null
        union
        select completion.user_id
        from public.mm_jutalom_esemenyek completion
        join public.mm_feladatok task on task.id = completion.forras_id
        where task.otlet_id = new.id
          and completion.esemeny_tipus = 'feladat_teljesitve'
          and completion.migralt = false
      ) participant
      where participant.user_id is not null
    )
    order by stats.user_id
    for update;
  end if;

  if new.statusz is distinct from old.statusz then
    if new.statusz in ('kozos_munka', 'megvalosult')
      and coalesce(old.statusz, '') not in ('kozos_munka', 'megvalosult') then
      perform mm_private.mm_award_event(new.otletgazda_id, 'otlet_tovabbjutott', new.id);
    end if;

    if new.statusz = 'megvalosult' and old.statusz is distinct from 'megvalosult' then
      perform mm_private.mm_award_event(new.otletgazda_id, 'otlet_megvalosult', new.id);

      -- A Megbízható jelvény a lezárt projekt felelőseinél ekkor válhat jogosulttá.
      for v_assignee in
        select distinct candidate.user_id
        from (
          select task.felelos_id as user_id
          from public.mm_feladatok task
          where task.otlet_id = new.id
            and task.felelos_id is not null
          union
          select completion.user_id
          from public.mm_jutalom_esemenyek completion
          join public.mm_feladatok task on task.id = completion.forras_id
          where task.otlet_id = new.id
            and completion.esemeny_tipus = 'feladat_teljesitve'
            and completion.migralt = false
        ) candidate
        where candidate.user_id is not null
        order by candidate.user_id
      loop
        perform mm_private.mm_refresh_badges(v_assignee);
      end loop;
    end if;
  end if;

  return new;
end
$function$;

create or replace function mm_private.mm_reward_vote_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_idea_id uuid;
  v_user_id uuid;
  v_vote_type text;
  v_owner_id uuid;
  v_status text;
  v_active boolean;
  v_vote_start timestamptz;
  v_vote_end timestamptz;
  v_support_count integer := 0;
  v_join_count integer := 0;
begin
  if tg_op = 'DELETE' then
    v_idea_id := old.otlet_id;
    v_user_id := old.user_id;
    v_vote_type := old.tipus;
  else
    v_idea_id := new.otlet_id;
    v_user_id := new.user_id;
    v_vote_type := new.tipus;
  end if;

  -- Egy ötlet összes támogatási/csatlakozási írása ugyanazt a szülősort
  -- zárja, ezért az ötödik párhuzamos támogatás sem veszhet el.
  select
    idea.otletgazda_id,
    idea.statusz,
    idea.aktiv,
    idea.szavazas_kezdete,
    idea.szavazas_vege
  into
    v_owner_id,
    v_status,
    v_active,
    v_vote_start,
    v_vote_end
  from public.mm_otletek idea
  where idea.id = v_idea_id
  for update;

  if not found then
    -- Ötlettörléskor az FK-cascade gyermek DELETE triggere már nem látja a
    -- szülősort; ekkor nincs mit számlálni vagy validálni.
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'A művelethez tartozó ötlet nem található.'
      using errcode = '23503';
  end if;

  if tg_op = 'INSERT'
    and v_owner_id = v_user_id
    and v_vote_type in ('tamogatas', 'csatlakozas') then
    raise exception 'Saját ötlet támogatása vagy csatlakozása nem engedélyezett.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and v_vote_type = 'tamogatas' then
    if not coalesce(v_active, false)
      or v_status is distinct from 'szavazas'
      or v_vote_start is null
      or v_vote_end is null
      or statement_timestamp() < v_vote_start
      or statement_timestamp() >= v_vote_end then
      raise exception 'Támogatás csak az aktív, 14 napos szavazási időszakban adható.'
        using errcode = '23514';
    end if;

    select count(distinct vote.user_id)::integer
    into v_support_count
    from public.mm_szavazatok vote
    where vote.otlet_id = v_idea_id
      and vote.tipus = 'tamogatas'
      and vote.user_id <> v_owner_id;

    if v_support_count >= 5 then
      -- Az ötödik támogatás a támogatót és az ötletgazdát is jutalmazhatja.
      -- Mindkét stat-sort UUID-sorrendben előre zárjuk, így két keresztben
      -- támogatott ötlet sem tud A/B–B/A holtpontot létrehozni.
      insert into public.mm_felhasznalo_statisztika (user_id)
      select participant.user_id
      from (
        select v_user_id as user_id
        union
        select v_owner_id as user_id
      ) participant
      order by participant.user_id
      on conflict (user_id) do nothing;

      perform 1
      from public.mm_felhasznalo_statisztika stats
      where stats.user_id in (v_user_id, v_owner_id)
      order by stats.user_id
      for update;
    end if;

    perform mm_private.mm_award_event(v_user_id, 'szavazat_adva', v_idea_id);

    update public.mm_otletek idea
    set
      tamogatasok_szama = v_support_count,
      statusz = case
        when v_support_count >= 5 then 'kozos_munka'
        else idea.statusz
      end
    where idea.id = v_idea_id;

    return new;
  end if;

  if tg_op = 'INSERT' and v_vote_type = 'csatlakozas' then
    if not coalesce(v_active, false) or v_status is distinct from 'kozos_munka' then
      raise exception 'Csatlakozni csak közös munka állapotú, aktív projekthez lehet.'
        using errcode = '23514';
    end if;

    select count(distinct vote.user_id)::integer
    into v_join_count
    from public.mm_szavazatok vote
    where vote.otlet_id = v_idea_id
      and vote.tipus = 'csatlakozas'
      and vote.user_id <> v_owner_id;

    perform mm_private.mm_award_event(v_user_id, 'csatlakozas', v_idea_id);

    update public.mm_otletek idea
    set csatlakozok_szama = v_join_count
    where idea.id = v_idea_id;

    return new;
  end if;

  if tg_op = 'DELETE' and v_vote_type = 'tamogatas' then
    if v_status is distinct from 'szavazas' then
      raise exception 'A lezárt szavazás támogatásai már nem vonhatók vissza.'
        using errcode = '23514';
    end if;

    select count(distinct vote.user_id)::integer
    into v_support_count
    from public.mm_szavazatok vote
    where vote.otlet_id = v_idea_id
      and vote.tipus = 'tamogatas'
      and vote.user_id <> v_owner_id;

    update public.mm_otletek idea
    set tamogatasok_szama = v_support_count
    where idea.id = v_idea_id;

    return old;
  end if;

  if tg_op = 'DELETE' and v_vote_type = 'csatlakozas' then
    if v_status is distinct from 'kozos_munka' then
      raise exception 'Lezárt projekt csapattagsága már nem módosítható.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.mm_feladatok task
      where task.otlet_id = v_idea_id
        and task.felelos_id = v_user_id
    ) then
      raise exception 'Feladatfelelős addig nem léphet ki, amíg a feladatait át nem osztották.'
        using errcode = '23514';
    end if;

    select count(distinct vote.user_id)::integer
    into v_join_count
    from public.mm_szavazatok vote
    where vote.otlet_id = v_idea_id
      and vote.tipus = 'csatlakozas'
      and vote.user_id <> v_owner_id;

    update public.mm_otletek idea
    set csatlakozok_szama = v_join_count
    where idea.id = v_idea_id;

    return old;
  end if;

  raise exception 'Ismeretlen Missziós Műhely részvételi művelet.'
    using errcode = '22023';
end
$function$;

create or replace function mm_private.mm_reward_comment_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_idea_id uuid;
  v_active boolean;
  v_comment_count integer := 0;
begin
  v_idea_id := case when tg_op = 'DELETE' then old.otlet_id else new.otlet_id end;

  select idea.aktiv
  into v_active
  from public.mm_otletek idea
  where idea.id = v_idea_id
  for update;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'A hozzászóláshoz tartozó ötlet nem található.'
      using errcode = '23503';
  end if;

  if tg_op = 'INSERT' and not coalesce(v_active, false) then
    raise exception 'Inaktív ötlethez nem írható hozzászólás.'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_comment_count
  from public.mm_hozzaszolasok entry
  where entry.otlet_id = v_idea_id;

  update public.mm_otletek idea
  set hozzaszolasok_szama = v_comment_count
  where idea.id = v_idea_id;

  if tg_op = 'INSERT' then
    perform mm_private.mm_award_event(new.user_id, 'hozzaszolas', new.id);
    return new;
  end if;

  return old;
end
$function$;

create or replace function mm_private.mm_reward_material_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform mm_private.mm_award_event(new.feltolto_id, 'segedanyag_feltoltes', new.id);
  return new;
end
$function$;

create or replace function mm_private.mm_reward_rating_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uploader_id uuid;
begin
  select material.feltolto_id
  into v_uploader_id
  from public.mm_segedanyagok material
  where material.id = new.segedanyag_id;

  if v_uploader_id = new.user_id then
    raise exception 'Saját segédanyag értékelése nem engedélyezett.'
      using errcode = '42501';
  end if;

  perform mm_private.mm_award_event(new.user_id, 'ertekeles_adva', new.segedanyag_id);
  return new;
end
$function$;

create or replace function mm_private.mm_task_completion_timestamp_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    -- Kliensből beszúrt hamis teljesítési bizonyíték nem maradhat meg.
    new.teljesitve_at := null;
    new.teljesites_felelos_id := null;
    new.teljesites_hatarido := null;
    return new;
  end if;

  if new.statusz = 'kesz'
    and old.statusz is distinct from 'kesz'
    and old.teljesitve_at is null then
    new.teljesitve_at := now();
    new.teljesites_felelos_id := old.felelos_id;
    new.teljesites_hatarido := old.hatarido;
  else
    -- Az első bizonyított teljesítés pillanatképe immutábilis. Ez a közvetlen
    -- REST-frissítést is felülírja, nem csak az alkalmazásból érkező kérést.
    new.teljesitve_at := old.teljesitve_at;
    new.teljesites_felelos_id := old.teljesites_felelos_id;
    new.teljesites_hatarido := old.teljesites_hatarido;
  end if;
  return new;
end
$function$;

create or replace function mm_private.mm_reward_task_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.statusz = 'kesz'
    and old.statusz is distinct from 'kesz'
    and new.teljesites_felelos_id is not null then
    perform mm_private.mm_award_event(new.teljesites_felelos_id, 'feladat_teljesitve', new.id);
  end if;
  return new;
end
$function$;

revoke all on function mm_private.mm_reward_idea_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_idea_workflow_guard_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_reward_vote_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_reward_comment_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_reward_material_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_reward_rating_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_task_project_lock_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_project_content_guard_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_task_completion_timestamp_trigger() from public, anon, authenticated;
revoke all on function mm_private.mm_reward_task_trigger() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Történeti eseménykulcsok és statisztika-konzervatív helyreállítás
--    A meglévő összpontszámot soha nem csökkentjük és nem pontozzuk újra.
-- -----------------------------------------------------------------------------

with known_users as (
  select user_id from public.mm_felhasznalo_statisztika
  union select otletgazda_id from public.mm_otletek
  union select user_id from public.mm_szavazatok
  union select user_id from public.mm_hozzaszolasok
  union select feltolto_id from public.mm_segedanyagok
  union select user_id from public.mm_segedanyag_ertekelesek
  union select felelos_id from public.mm_feladatok where felelos_id is not null
)
insert into public.mm_felhasznalo_statisztika (user_id)
select user_id from known_users where user_id is not null
on conflict (user_id) do nothing;

update public.mm_felhasznalo_statisztika stats
set
  otletek_szama = greatest(
    coalesce(stats.otletek_szama, 0),
    (select count(*)::integer from public.mm_otletek idea where idea.otletgazda_id = stats.user_id)
  ),
  elfogadott_otletek = greatest(
    coalesce(stats.elfogadott_otletek, 0),
    (select count(*)::integer from public.mm_otletek idea
      where idea.otletgazda_id = stats.user_id and idea.statusz in ('kozos_munka', 'megvalosult'))
  ),
  megvalosult_otletek = greatest(
    coalesce(stats.megvalosult_otletek, 0),
    (select count(*)::integer from public.mm_otletek idea
      where idea.otletgazda_id = stats.user_id and idea.statusz = 'megvalosult')
  ),
  tamogatasok_adva = greatest(
    coalesce(stats.tamogatasok_adva, 0),
    (select count(*)::integer
      from public.mm_szavazatok vote
      join public.mm_otletek idea on idea.id = vote.otlet_id
      where vote.user_id = stats.user_id
        and vote.tipus = 'tamogatas'
        and idea.otletgazda_id is distinct from vote.user_id)
  ),
  hozzaszolasok_szama = greatest(
    coalesce(stats.hozzaszolasok_szama, 0),
    (select count(*)::integer from public.mm_hozzaszolasok comment
      where comment.user_id = stats.user_id)
  ),
  segedanyagok_feltoltve = greatest(
    coalesce(stats.segedanyagok_feltoltve, 0),
    (select count(*)::integer from public.mm_segedanyagok material
      where material.feltolto_id = stats.user_id)
  ),
  -- Régi kész feladatnál nem bizonyítható, hogy a jelenlegi felelős teljesítette;
  -- a meglévő statot megőrizzük, de ebből a táblából nem emeljük találgatással.
  feladatok_teljesitve = coalesce(stats.feladatok_teljesitve, 0),
  ertekelesek_adva = greatest(
    coalesce(stats.ertekelesek_adva, 0),
    (select count(*)::integer
      from public.mm_segedanyag_ertekelesek rating
      join public.mm_segedanyagok material on material.id = rating.segedanyag_id
      where rating.user_id = stats.user_id
        and material.feltolto_id is distinct from rating.user_id)
  ),
  szint = mm_private.mm_level_for_points(coalesce(stats.osszpontszam, 0)),
  frissitve = now();

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select idea.otletgazda_id, 'otlet_bekuldve', idea.id, 0, 'otletek_szama', true, false
from public.mm_otletek idea
on conflict do nothing;

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select idea.otletgazda_id, 'otlet_tovabbjutott', idea.id, 0, 'elfogadott_otletek', true, false
from public.mm_otletek idea
where idea.statusz in ('kozos_munka', 'megvalosult')
on conflict do nothing;

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select idea.otletgazda_id, 'otlet_megvalosult', idea.id, 0, 'megvalosult_otletek', true, false
from public.mm_otletek idea
where idea.statusz = 'megvalosult'
on conflict do nothing;

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select vote.user_id,
  case when vote.tipus = 'tamogatas' then 'szavazat_adva' else 'csatlakozas' end,
  vote.otlet_id,
  0,
  case when vote.tipus = 'tamogatas' then 'tamogatasok_adva' else null end,
  true,
  false
from public.mm_szavazatok vote
join public.mm_otletek idea on idea.id = vote.otlet_id
where vote.tipus in ('tamogatas', 'csatlakozas')
  and idea.otletgazda_id is distinct from vote.user_id
on conflict do nothing;

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select comment.user_id, 'hozzaszolas', comment.id, 0, 'hozzaszolasok_szama', true, false
from public.mm_hozzaszolasok comment
on conflict do nothing;

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select material.feltolto_id, 'segedanyag_feltoltes', material.id, 0, 'segedanyagok_feltoltve', true, false
from public.mm_segedanyagok material
on conflict do nothing;

insert into public.mm_jutalom_esemenyek
  (user_id, esemeny_tipus, forras_id, pont, stat_kulcs, migralt, utolso_kiserlet_alkalmazva)
select rating.user_id, 'ertekeles_adva', rating.segedanyag_id, 0, 'ertekelesek_adva', true, false
from public.mm_segedanyag_ertekelesek rating
join public.mm_segedanyagok material on material.id = rating.segedanyag_id
where material.feltolto_id is distinct from rating.user_id
on conflict do nothing;

-- Régi kész feladatokból nem seedelünk felelős-eseményt: a séma nem őrzi,
-- ki és mikor végezte el őket. A jövőbeli trigger az első bizonyított átmenetet rögzíti.

do $block$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select stats.user_id
    from public.mm_felhasznalo_statisztika stats
    order by stats.user_id
  loop
    perform mm_private.mm_refresh_badges(v_user_id);
  end loop;
end
$block$;

-- -----------------------------------------------------------------------------
-- 6. Triggerek csatlakoztatása csak a történeti seed után
-- -----------------------------------------------------------------------------

drop trigger if exists mm_idea_workflow_guard_trg on public.mm_otletek;
create trigger mm_idea_workflow_guard_trg
before insert or update or delete on public.mm_otletek
for each row execute function mm_private.mm_idea_workflow_guard_trigger();

drop trigger if exists mm_reward_idea_trg on public.mm_otletek;
create trigger mm_reward_idea_trg
after insert or update of statusz on public.mm_otletek
for each row execute function mm_private.mm_reward_idea_trigger();

drop trigger if exists mm_reward_vote_trg on public.mm_szavazatok;
create trigger mm_reward_vote_trg
after insert or delete on public.mm_szavazatok
for each row execute function mm_private.mm_reward_vote_trigger();

drop trigger if exists mm_reward_comment_trg on public.mm_hozzaszolasok;
create trigger mm_reward_comment_trg
after insert or delete on public.mm_hozzaszolasok
for each row execute function mm_private.mm_reward_comment_trigger();

drop trigger if exists mm_reward_material_trg on public.mm_segedanyagok;
create trigger mm_reward_material_trg
after insert on public.mm_segedanyagok
for each row execute function mm_private.mm_reward_material_trigger();

drop trigger if exists mm_reward_rating_trg on public.mm_segedanyag_ertekelesek;
create trigger mm_reward_rating_trg
after insert on public.mm_segedanyag_ertekelesek
for each row execute function mm_private.mm_reward_rating_trigger();

drop trigger if exists mm_task_completion_timestamp_trg on public.mm_feladatok;
create trigger mm_task_completion_timestamp_trg
before insert or update of statusz, teljesitve_at, teljesites_felelos_id, teljesites_hatarido
on public.mm_feladatok
for each row execute function mm_private.mm_task_completion_timestamp_trigger();

drop trigger if exists mm_task_project_lock_trg on public.mm_feladatok;
create trigger mm_task_project_lock_trg
before insert or update or delete on public.mm_feladatok
for each row execute function mm_private.mm_task_project_lock_trigger();

drop trigger if exists mm_project_content_guard_trg on public.mm_merfoldkovek;
create trigger mm_project_content_guard_trg
before insert or update or delete on public.mm_merfoldkovek
for each row execute function mm_private.mm_project_content_guard_trigger();

drop trigger if exists mm_project_content_guard_trg on public.mm_dokumentumok;
create trigger mm_project_content_guard_trg
before insert or update or delete on public.mm_dokumentumok
for each row execute function mm_private.mm_project_content_guard_trigger();

drop trigger if exists mm_reward_task_trg on public.mm_feladatok;
create trigger mm_reward_task_trg
after update of statusz on public.mm_feladatok
for each row execute function mm_private.mm_reward_task_trigger();

commit;

-- Egyetlen ellenőrző JSON-sor. Elvárt: booleanok=true, trigger_count=11,
-- private_functions=13. A teljes JSON-t küldd vissza ellenőrzésre.
select jsonb_build_object(
  'ledger_table', to_regclass('public.mm_jutalom_esemenyek') is not null,
  'task_completed_at', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mm_feladatok'
      and column_name = 'teljesitve_at'
  ),
  'task_completion_snapshot', (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mm_feladatok'
      and column_name in ('teljesitve_at', 'teljesites_felelos_id', 'teljesites_hatarido')
  ),
  'source_once_index', to_regclass('public.mm_jutalom_esemenyek_source_once_idx') is not null,
  'rls_enabled', (
    select relrowsecurity
    from pg_class
    where oid = 'public.mm_jutalom_esemenyek'::regclass
  ),
  'trigger_count', (
    select count(*)
    from pg_trigger trigger
    where trigger.tgrelid in (
      'public.mm_otletek'::regclass,
      'public.mm_szavazatok'::regclass,
      'public.mm_hozzaszolasok'::regclass,
      'public.mm_segedanyagok'::regclass,
      'public.mm_segedanyag_ertekelesek'::regclass,
      'public.mm_feladatok'::regclass,
      'public.mm_merfoldkovek'::regclass,
      'public.mm_dokumentumok'::regclass
    )
      and trigger.tgname in (
        'mm_idea_workflow_guard_trg',
        'mm_reward_idea_trg',
        'mm_reward_vote_trg',
        'mm_reward_comment_trg',
        'mm_reward_material_trg',
        'mm_reward_rating_trg',
        'mm_task_completion_timestamp_trg',
        'mm_task_project_lock_trg',
        'mm_project_content_guard_trg',
        'mm_reward_task_trg'
      )
      and not trigger.tgisinternal
  ),
  'private_functions', (
    select count(*)
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'mm_private'
      and proc.proname like 'mm\_%' escape '\'
  ),
  'ledger_rows', (select count(*) from public.mm_jutalom_esemenyek),
  'badge_rows', (select count(*) from public.mm_felhasznalo_jelveny)
) as mm_jutalmazas_migracio_ellenorzes;
