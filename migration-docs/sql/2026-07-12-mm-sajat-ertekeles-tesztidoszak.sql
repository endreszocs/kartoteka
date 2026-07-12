-- Missziós Műhely · saját segédanyag értékelése a tesztidőszakban
-- Dátum: 2026-07-12
--
-- Előfeltétel:
--   2026-07-12-mm-jutalmazas-atomikus.sql már lefutott.
--
-- Hatás:
--   * a feltöltő a tesztidőszakban értékelheti a saját segédanyagát;
--   * saját értékelésre NEM jár pont, statisztika vagy jelvény;
--   * más segédanyagának első értékelése továbbra is ugyanabban az INSERT
--     tranzakcióban, az atomikus jutalomfüggvényen keresztül kap jutalmat;
--   * a trigger és a jutalmazó függvény nem kerül ki az exposed public sémába.

begin;

do $preflight$
begin
  if to_regclass('public.mm_segedanyagok') is null
    or to_regclass('public.mm_segedanyag_ertekelesek') is null
    or to_regclass('public.mm_jutalom_esemenyek') is null then
    raise exception 'Hiányzik a Missziós Műhely segédanyag-sémája.';
  end if;

  if to_regprocedure('mm_private.mm_reward_rating_trigger()') is null
    or to_regprocedure('mm_private.mm_award_event(uuid,text,uuid)') is null then
    raise exception
      'Előbb futtasd a 2026-07-12-mm-jutalmazas-atomikus.sql migrációt.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where not trigger_row.tgisinternal
      and trigger_row.tgrelid = to_regclass('public.mm_segedanyag_ertekelesek')
      and trigger_row.tgfoid = to_regprocedure('mm_private.mm_reward_rating_trigger()')
  ) then
    raise exception 'Hiányzik az értékelés jutalmazási triggere.';
  end if;
end
$preflight$;

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

  if not found then
    raise exception 'A segédanyag nem található.'
      using errcode = '23503';
  end if;

  -- Tesztidőszak: az értékelés elmenthető, de a saját aktivitás nem válhat
  -- ponttá, statisztikává vagy jelvénnyé. Korán visszatérünk, így az atomikus
  -- jutalomfüggvény ebben az ágban egyáltalán nem fut le.
  if v_uploader_id = new.user_id then
    return new;
  end if;

  -- Nem saját segédanyagnál az eredeti, tranzakcióbiztos jutalmazás marad.
  perform mm_private.mm_award_event(
    new.user_id,
    'ertekeles_adva',
    new.segedanyag_id
  );

  return new;
end;
$function$;

comment on function mm_private.mm_reward_rating_trigger() is
  'Tesztidőszak: saját segédanyag értékelhető jutalom nélkül; más értékelés atomikusan jutalmazott.';

revoke all on function mm_private.mm_reward_rating_trigger()
  from public, anon, authenticated;

-- A denormalizált átlag és darabszám ugyanabban a tranzakcióban frissül,
-- mint maga az értékelés. Így párhuzamos értékeléseknél sem írhat vissza egy
-- régebbi klienspillanatkép elavult értéket.
create or replace function mm_private.mm_recalculate_material_rating(
  p_material_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- A material-sor szerializálja az ugyanahhoz az anyaghoz érkező párhuzamos
  -- értékeléseket. A lock után futó külön UPDATE új READ COMMITTED snapshotot
  -- kap, így már látja az előtte várakoztatott tranzakció commitját is.
  perform 1
  from public.mm_segedanyagok material
  where material.id = p_material_id
  for update;

  update public.mm_segedanyagok material
  set
    atlag_ertekeles = aggregate.average_rating,
    ertekelesek_szama = aggregate.rating_count
  from (
    select
      avg(rating.pontszam)::numeric as average_rating,
      count(*)::integer as rating_count
    from public.mm_segedanyag_ertekelesek rating
    where rating.segedanyag_id = p_material_id
  ) aggregate
  where material.id = p_material_id;
end;
$function$;

revoke all on function mm_private.mm_recalculate_material_rating(uuid)
  from public, anon, authenticated;

create or replace function mm_private.mm_material_rating_aggregate_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform mm_private.mm_recalculate_material_rating(old.segedanyag_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.segedanyag_id is distinct from new.segedanyag_id then
    perform mm_private.mm_recalculate_material_rating(old.segedanyag_id);
  end if;

  perform mm_private.mm_recalculate_material_rating(new.segedanyag_id);
  return new;
end;
$function$;

revoke all on function mm_private.mm_material_rating_aggregate_trigger()
  from public, anon, authenticated;

drop trigger if exists mm_segedanyag_rating_aggregate
  on public.mm_segedanyag_ertekelesek;

create trigger mm_segedanyag_rating_aggregate
after insert or delete or update of pontszam, segedanyag_id
on public.mm_segedanyag_ertekelesek
for each row
execute function mm_private.mm_material_rating_aggregate_trigger();

-- Egyszeri konzisztencia-helyreállítás a már meglévő sorokra.
with aggregate as (
  select
    material.id as material_id,
    avg(rating.pontszam)::numeric as average_rating,
    count(rating.id)::integer as rating_count
  from public.mm_segedanyagok material
  left join public.mm_segedanyag_ertekelesek rating
    on rating.segedanyag_id = material.id
  group by material.id
)
update public.mm_segedanyagok material
set
  atlag_ertekeles = aggregate.average_rating,
  ertekelesek_szama = aggregate.rating_count
from aggregate
where material.id = aggregate.material_id;

commit;

-- Ellenőrzés: az utolsó SELECT egyetlen JSON-sort ad vissza.
select jsonb_build_object(
  'mm_sajat_ertekeles_teszt_ellenorzes', jsonb_build_object(
    'trigger_function',
      to_regprocedure('mm_private.mm_reward_rating_trigger()') is not null,
    'trigger_security_definer',
      coalesce(
        (
          select procedure.prosecdef
          from pg_proc procedure
          where procedure.oid = to_regprocedure('mm_private.mm_reward_rating_trigger()')
        ),
        false
      ),
    'trigger_search_path_locked',
      exists (
        select 1
        from pg_proc procedure
        cross join unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting(value)
        where procedure.oid = to_regprocedure('mm_private.mm_reward_rating_trigger()')
          and setting.value in ('search_path=', 'search_path=""')
      ),
    'trigger_attached',
      exists (
        select 1
        from pg_trigger trigger_row
        join pg_class target_table on target_table.oid = trigger_row.tgrelid
        join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
        join pg_proc trigger_function on trigger_function.oid = trigger_row.tgfoid
        join pg_namespace function_schema on function_schema.oid = trigger_function.pronamespace
        where not trigger_row.tgisinternal
          and target_schema.nspname = 'public'
          and target_table.relname = 'mm_segedanyag_ertekelesek'
          and function_schema.nspname = 'mm_private'
          and trigger_function.proname = 'mm_reward_rating_trigger'
          and trigger_row.tgenabled <> 'D'
          and (trigger_row.tgtype & 4) = 4
          and (trigger_row.tgtype & (8 | 16 | 32)) = 0
      ),
    'aggregate_trigger_attached',
      exists (
        select 1
        from pg_trigger trigger_row
        where not trigger_row.tgisinternal
          and trigger_row.tgrelid = to_regclass('public.mm_segedanyag_ertekelesek')
          and trigger_row.tgfoid = to_regprocedure(
            'mm_private.mm_material_rating_aggregate_trigger()'
          )
          and trigger_row.tgenabled <> 'D'
          and (trigger_row.tgtype & 4) = 4
          and (trigger_row.tgtype & 8) = 8
          and (trigger_row.tgtype & 16) = 16
      ),
    'aggregate_search_path_locked',
      2 = (
        select count(*)
        from pg_proc procedure
        where procedure.oid in (
          to_regprocedure('mm_private.mm_recalculate_material_rating(uuid)'),
          to_regprocedure('mm_private.mm_material_rating_aggregate_trigger()')
        )
          and exists (
            select 1
            from unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting(value)
            where setting.value in ('search_path=', 'search_path=""')
          )
      ),
    'self_rating_rows',
      (
        select count(*)
        from public.mm_segedanyag_ertekelesek rating
        join public.mm_segedanyagok material
          on material.id = rating.segedanyag_id
        where material.feltolto_id = rating.user_id
      ),
    'self_reward_ledger_rows',
      (
        select count(*)
        from public.mm_jutalom_esemenyek reward
        join public.mm_segedanyagok material
          on material.id = reward.forras_id
        where reward.esemeny_tipus = 'ertekeles_adva'
          and reward.user_id = material.feltolto_id
      )
  )
);

-- ---------------------------------------------------------------------------
-- VISSZAÁLLÍTÁS A TESZTIDŐSZAK UTÁN
-- ---------------------------------------------------------------------------
-- Az alábbi blokkot KÜLÖN futtasd, miután az alkalmazásban ismét letiltottuk
-- a saját értékelést. A DELETE része eltávolítja a tesztsorokat; az aktív
-- aggregáló trigger ugyanebben a tranzakcióban helyreállítja az átlagokat.
--
-- begin;
--
-- lock table public.mm_segedanyag_ertekelesek
--   in share row exclusive mode;
--
-- delete from public.mm_segedanyag_ertekelesek rating
-- using public.mm_segedanyagok material
-- where material.id = rating.segedanyag_id
--   and material.feltolto_id = rating.user_id;
--
-- create or replace function mm_private.mm_reward_rating_trigger()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $function$
-- declare
--   v_uploader_id uuid;
-- begin
--   select material.feltolto_id
--   into v_uploader_id
--   from public.mm_segedanyagok material
--   where material.id = new.segedanyag_id;
--
--   if not found then
--     raise exception 'A segédanyag nem található.'
--       using errcode = '23503';
--   end if;
--
--   if v_uploader_id = new.user_id then
--     raise exception 'Saját segédanyag értékelése nem engedélyezett.'
--       using errcode = '42501';
--   end if;
--
--   perform mm_private.mm_award_event(
--     new.user_id,
--     'ertekeles_adva',
--     new.segedanyag_id
--   );
--   return new;
-- end
-- $function$;
--
-- comment on function mm_private.mm_reward_rating_trigger() is
--   'Saját segédanyag nem értékelhető; más első értékelése atomikusan jutalmazott.';
--
-- revoke all on function mm_private.mm_reward_rating_trigger()
--   from public, anon, authenticated;
--
-- commit;
