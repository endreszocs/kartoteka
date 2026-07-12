-- =============================================================================
-- MISSZIÓS MŰHELY — atomikus segédanyag-szerkesztés
-- Dátum: 2026-07-12
-- Előfeltétel: 2026-07-12-mm-jutalmazas-atomikus.sql már lefutott.
-- =============================================================================

begin;

do $preflight$
begin
  if to_regclass('public.mm_segedanyagok') is null
    or to_regclass('public.mm_segedanyag_kategoriak') is null
    or to_regclass('public.mm_kategoriak') is null then
    raise exception 'Hiányzik a Missziós Műhely segédanyag-sémája.';
  end if;

  if to_regprocedure('public.current_user_has_global_access()') is null then
    raise exception 'Hiányzik a globális hozzáférést ellenőrző adatbázis-függvény.';
  end if;

  if not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'mm_segedanyag_kategoriak'
      and policy.policyname = 'mm_segedanyag_kategoriak_write_own'
  ) then
    raise exception 'Hiányzik a tulajdonosi segédanyag-kategória RLS-policy.';
  end if;
end
$preflight$;

-- A korábbi, public szerepre létrehozott junction-policyk minden bejelentkezett
-- profilnak írást engedtek. Az RPC és a kanonikus write_own policy mellett ezek
-- feleslegesek és túl tágak.
drop policy if exists mm_segedanyag_kat_insert on public.mm_segedanyag_kategoriak;
drop policy if exists mm_segedanyag_kat_delete on public.mm_segedanyag_kategoriak;

-- Egyetlen tranzakcióban menti az alaprekordot és a kategória-kapcsolatokat.
-- SECURITY INVOKER: a hívó RLS-jogai érvényesülnek; a függvény nem emel
-- jogosultságot. Az üres search_path kizárja az objektum-árnyékolást.
create or replace function public.mm_save_segedanyag_atomic(
  p_material_id uuid,
  p_expected_updated_at timestamptz,
  p_cim text,
  p_leiras text,
  p_forras_url text,
  p_forras_nev text,
  p_formatum text,
  p_kategoria_ids integer[]
)
returns table (
  material_id uuid,
  material_updated_at timestamptz,
  was_created boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
  v_current_updated_at timestamptz;
  v_saved_id uuid;
  v_saved_updated_at timestamptz;
  v_uploader_name text;
  v_congregation_name text;
  v_category_ids integer[];
begin
  if v_actor_id is null then
    raise exception 'A segédanyag mentéséhez bejelentkezés szükséges.'
      using errcode = '42501';
  end if;

  p_cim := btrim(coalesce(p_cim, ''));
  p_leiras := nullif(btrim(coalesce(p_leiras, '')), '');
  p_forras_url := nullif(btrim(coalesce(p_forras_url, '')), '');
  p_forras_nev := nullif(btrim(coalesce(p_forras_nev, '')), '');
  p_formatum := coalesce(nullif(btrim(p_formatum), ''), 'link');

  if p_cim = '' or char_length(p_cim) > 200 then
    raise exception 'A cím 1–200 karakter hosszú lehet.'
      using errcode = '23514';
  end if;

  if char_length(coalesce(p_leiras, '')) > 50000 then
    raise exception 'A tartalom legfeljebb 50 000 karakter lehet.'
      using errcode = '23514';
  end if;

  if char_length(coalesce(p_forras_nev, '')) > 200 then
    raise exception 'A forrás neve legfeljebb 200 karakter lehet.'
      using errcode = '23514';
  end if;

  if p_forras_url is not null and p_forras_url !~* '^https?://' then
    raise exception 'Csak http:// vagy https:// kezdetű forráshivatkozás menthető.'
      using errcode = '23514';
  end if;

  if char_length(coalesce(p_forras_url, '')) > 2048 then
    raise exception 'A forráshivatkozás legfeljebb 2048 karakter lehet.'
      using errcode = '23514';
  end if;

  if p_formatum <> all (array['PDF', 'DOCX', 'PPTX', 'video', 'link', 'csomag']::text[]) then
    raise exception 'Érvénytelen segédanyag-formátum.'
      using errcode = '23514';
  end if;

  select coalesce(
    array_agg(distinct requested.category_id order by requested.category_id),
    '{}'::integer[]
  )
  into v_category_ids
  from unnest(coalesce(p_kategoria_ids, '{}'::integer[])) as requested(category_id)
  where requested.category_id is not null;

  if cardinality(coalesce(p_kategoria_ids, '{}'::integer[])) > 50
    or cardinality(v_category_ids) > 50 then
    raise exception 'Legfeljebb 50 kategória választható.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(v_category_ids) as requested(category_id)
    left join public.mm_kategoriak category on category.id = requested.category_id
    where category.id is null
  ) then
    raise exception 'A kiválasztott kategóriák között ismeretlen érték van.'
      using errcode = '23503';
  end if;

  if p_material_id is null then
    select
      profile.full_name,
      coalesce(congregation.nev_hu, congregation.name)
    into v_uploader_name, v_congregation_name
    from public.profiles profile
    left join public.congregations congregation on congregation.id = profile.congregation_id
    where profile.id = v_actor_id;

    insert into public.mm_segedanyagok (
      cim,
      leiras,
      forras_url,
      forras_nev,
      formatum,
      feltolto_id,
      feltolto_nev,
      feltolto_gyulekezet,
      aktiv,
      updated_at
    )
    values (
      p_cim,
      p_leiras,
      p_forras_url,
      p_forras_nev,
      p_formatum,
      v_actor_id,
      coalesce(v_uploader_name, 'Ismeretlen'),
      v_congregation_name,
      true,
      statement_timestamp()
    )
    returning id, updated_at into v_saved_id, v_saved_updated_at;
  else
    select material.feltolto_id, material.updated_at
    into v_owner_id, v_current_updated_at
    from public.mm_segedanyagok material
    where material.id = p_material_id
    for update;

    if not found then
      raise exception 'A segédanyag nem található.'
        using errcode = 'P0002';
    end if;

    if v_owner_id is distinct from v_actor_id
      and not public.current_user_has_global_access() then
      raise exception 'Csak a feltöltő vagy rendszergazda szerkesztheti ezt a segédanyagot.'
        using errcode = '42501';
    end if;

    if v_current_updated_at is distinct from p_expected_updated_at then
      raise exception 'A segédanyagot közben valaki módosította. Frissítsd az oldalt, majd próbáld újra.'
        using errcode = '40001';
    end if;

    update public.mm_segedanyagok material
    set
      cim = p_cim,
      leiras = p_leiras,
      forras_url = p_forras_url,
      forras_nev = p_forras_nev,
      formatum = p_formatum,
      updated_at = statement_timestamp()
    where material.id = p_material_id
      and material.updated_at is not distinct from p_expected_updated_at
    returning material.id, material.updated_at
    into v_saved_id, v_saved_updated_at;

    if not found then
      raise exception 'A segédanyagot közben valaki módosította. Frissítsd az oldalt, majd próbáld újra.'
        using errcode = '40001';
    end if;
  end if;

  delete from public.mm_segedanyag_kategoriak junction
  where junction.segedanyag_id = v_saved_id;

  insert into public.mm_segedanyag_kategoriak (segedanyag_id, kategoria_id)
  select v_saved_id, requested.category_id
  from unnest(v_category_ids) as requested(category_id);

  return query
  select v_saved_id, v_saved_updated_at, p_material_id is null;
end
$function$;

revoke all on function public.mm_save_segedanyag_atomic(
  uuid, timestamptz, text, text, text, text, text, integer[]
) from public, anon;
grant execute on function public.mm_save_segedanyag_atomic(
  uuid, timestamptz, text, text, text, text, text, integer[]
) to authenticated;

-- A polc csak rövid kivonatot kap, miközben a keresés az adatbázisban továbbra
-- is a teljes törzsön fut. Így a 130+ anyag teljes szövege nem utazik minden
-- oldalnyitáskor a DB és az alkalmazásszerver között.
create or replace function public.mm_list_segedanyagok(
  p_search text default null,
  p_category_id integer default null
)
returns table (
  id uuid,
  cim text,
  leiras text,
  forras_url text,
  forras_nev text,
  formatum text,
  feltolto_id uuid,
  feltolto_nev text,
  feltolto_gyulekezet text,
  letoltes_szam integer,
  atlag_ertekeles numeric,
  ertekelesek_szama integer,
  csatolmany_url text,
  aktiv boolean,
  created_at timestamptz,
  updated_at timestamptz,
  mm_segedanyag_kategoriak jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    material.id,
    material.cim,
    left(material.leiras, 420) as leiras,
    material.forras_url,
    material.forras_nev,
    material.formatum,
    material.feltolto_id,
    material.feltolto_nev,
    material.feltolto_gyulekezet,
    material.letoltes_szam,
    material.atlag_ertekeles,
    material.ertekelesek_szama,
    material.csatolmany_url,
    material.aktiv,
    material.created_at,
    material.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kategoria_id', junction.kategoria_id,
          'mm_kategoriak', jsonb_build_object(
            'nev', category.nev,
            'ikon', category.ikon,
            'szin', category.szin
          )
        )
        order by category.sorrend, category.id
      ) filter (where junction.kategoria_id is not null),
      '[]'::jsonb
    ) as mm_segedanyag_kategoriak
  from public.mm_segedanyagok material
  left join public.mm_segedanyag_kategoriak junction
    on junction.segedanyag_id = material.id
  left join public.mm_kategoriak category
    on category.id = junction.kategoria_id
  where material.aktiv = true
    and (
      nullif(btrim(p_search), '') is null
      or material.cim ilike '%' || btrim(p_search) || '%'
      or material.leiras ilike '%' || btrim(p_search) || '%'
      or material.feltolto_nev ilike '%' || btrim(p_search) || '%'
    )
    and (
      p_category_id is null
      or exists (
        select 1
        from public.mm_segedanyag_kategoriak category_filter
        where category_filter.segedanyag_id = material.id
          and category_filter.kategoria_id = p_category_id
      )
    )
  group by material.id
  order by material.created_at desc;
$function$;

revoke all on function public.mm_list_segedanyagok(text, integer)
  from public, anon;
grant execute on function public.mm_list_segedanyagok(text, integer)
  to authenticated;

-- A generált Word/PDF exportokat egyetlen atomi UPDATE számolja. SECURITY
-- DEFINER szükséges, mert az olvasó jogosan tölthet le aktív anyagot akkor is,
-- ha nem ő a feltöltő; az üres search_path és a teljesen minősített nevek
-- megakadályozzák az objektum-árnyékolást.
create or replace function public.mm_record_material_download(
  p_material_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_download_count integer;
begin
  if auth.uid() is null then
    raise exception 'A letöltés rögzítéséhez bejelentkezés szükséges.'
      using errcode = '42501';
  end if;

  update public.mm_segedanyagok material
  set letoltes_szam = coalesce(material.letoltes_szam, 0) + 1
  where material.id = p_material_id
    and material.aktiv = true
  returning material.letoltes_szam into v_download_count;

  if not found then
    raise exception 'A segédanyag nem található vagy már archivált.'
      using errcode = 'P0002';
  end if;

  return v_download_count;
end
$function$;

revoke all on function public.mm_record_material_download(uuid)
  from public, anon;
grant execute on function public.mm_record_material_download(uuid)
  to authenticated;

commit;

-- Ellenőrzés: prosecdef=false (SECURITY INVOKER), üres search_path és jogosultság.
select jsonb_build_object(
  'rpc_exists', to_regprocedure(
    'public.mm_save_segedanyag_atomic(uuid,timestamp with time zone,text,text,text,text,text,integer[])'
  ) is not null,
  'security_invoker', not coalesce(procedure.prosecdef, true),
  'search_path_locked', exists (
    select 1
    from unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting(value)
    where setting.value in ('search_path=', 'search_path=""')
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.mm_save_segedanyag_atomic(uuid,timestamp with time zone,text,text,text,text,text,integer[])',
    'EXECUTE'
  ),
  'anon_execute', has_function_privilege(
    'anon',
    'public.mm_save_segedanyag_atomic(uuid,timestamp with time zone,text,text,text,text,text,integer[])',
    'EXECUTE'
  ),
  'download_counter_exists',
    to_regprocedure('public.mm_record_material_download(uuid)') is not null,
  'download_counter_security_definer',
    coalesce(download_counter.prosecdef, false),
  'download_counter_search_path_locked',
    exists (
      select 1
      from unnest(coalesce(download_counter.proconfig, '{}'::text[])) as setting(value)
      where setting.value in ('search_path=', 'search_path=""')
    ),
  'download_counter_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.mm_record_material_download(uuid)',
    'EXECUTE'
  ),
  'download_counter_anon_execute', has_function_privilege(
    'anon',
    'public.mm_record_material_download(uuid)',
    'EXECUTE'
  ),
  'list_rpc_exists',
    to_regprocedure('public.mm_list_segedanyagok(text,integer)') is not null,
  'list_rpc_security_invoker',
    not coalesce(list_rpc.prosecdef, true),
  'list_rpc_search_path_locked',
    exists (
      select 1
      from unnest(coalesce(list_rpc.proconfig, '{}'::text[])) as setting(value)
      where setting.value in ('search_path=', 'search_path=""')
    ),
  'list_rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.mm_list_segedanyagok(text,integer)',
    'EXECUTE'
  ),
  'list_rpc_anon_execute', has_function_privilege(
    'anon',
    'public.mm_list_segedanyagok(text,integer)',
    'EXECUTE'
  )
) as mm_segedanyag_szerkeszto_ellenorzes
from pg_proc procedure
left join pg_proc download_counter
  on download_counter.oid = to_regprocedure('public.mm_record_material_download(uuid)')
left join pg_proc list_rpc
  on list_rpc.oid = to_regprocedure('public.mm_list_segedanyagok(text,integer)')
where procedure.oid = to_regprocedure(
  'public.mm_save_segedanyag_atomic(uuid,timestamp with time zone,text,text,text,text,text,integer[])'
);
