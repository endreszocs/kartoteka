-- Missziós Műhely · idempotens letöltésszámláló Supabase-hardening
-- Dátum: 2026-07-13
--
-- Előfeltétel:
--   2026-07-12-mm-segedanyag-szerkeszto.sql már lefutott.
--
-- Hatás:
--   * a public SECURITY DEFINER számlálót megszünteti;
--   * SECURITY INVOKER, service_role-only RPC-re vált;
--   * nem exponált mm_private nyugtával ugyanaz a felhasználó ugyanazt az
--     anyagot és formátumot UTC naponként csak egyszer számolhatja;
--   * a fájl ettől továbbra is korlátlanul újramenthető.

begin;

do $preflight$
begin
  if to_regprocedure('public.mm_record_material_download(uuid)') is null
    and to_regprocedure(
      'public.mm_record_material_download(uuid,uuid,text)'
    ) is null then
    raise exception
      'Előbb futtasd a 2026-07-12-mm-segedanyag-szerkeszto.sql migrációt.';
  end if;

  if to_regnamespace('mm_private') is null then
    raise exception 'Hiányzik a jutalmazási migráció által létrehozott mm_private séma.';
  end if;

  if to_regrole('service_role') is null then
    raise exception 'Hiányzik a Supabase service_role adatbázis-szerepkör.';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.mm_segedanyagok',
    'SELECT'
  ) or not has_table_privilege(
    'service_role',
    'public.mm_segedanyagok',
    'UPDATE'
  ) then
    raise exception
      'A service_role nem rendelkezik SELECT és UPDATE joggal az mm_segedanyagok táblán.';
  end if;
end
$preflight$;

create table if not exists mm_private.mm_material_download_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.mm_segedanyagok(id) on delete cascade,
  export_format text not null,
  bucket_date date not null,
  created_at timestamptz not null default now(),
  constraint mm_material_download_receipts_format_check
    check (export_format in ('pdf', 'word')),
  constraint mm_material_download_receipts_pkey
    primary key (user_id, material_id, export_format, bucket_date)
);

alter table mm_private.mm_material_download_receipts enable row level security;
revoke all on table mm_private.mm_material_download_receipts
  from public, anon, authenticated;
grant usage on schema mm_private to service_role;
grant select, insert on table mm_private.mm_material_download_receipts
  to service_role;

-- A korábbi egyparaméteres SECURITY DEFINER belépési pont ugyanebben a
-- tranzakcióban tűnik el, ezért nincs köztes, nyitott állapot.
drop function if exists public.mm_record_material_download(uuid);

create or replace function public.mm_record_material_download(
  p_material_id uuid,
  p_user_id uuid,
  p_export_format text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_download_count integer;
  v_inserted integer;
begin
  if current_user <> 'service_role' then
    raise exception
      'A letöltésszámlálót csak a szerveroldali szolgáltatás hívhatja.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Hiányzik a letöltő felhasználó azonosítója.'
      using errcode = '23502';
  end if;

  p_export_format := lower(btrim(coalesce(p_export_format, '')));
  if p_export_format not in ('pdf', 'word') then
    raise exception 'Érvénytelen exportformátum.'
      using errcode = '23514';
  end if;

  -- A material-sor lockja az eltérő felhasználók párhuzamos első letöltéseit
  -- is szerializálja, így az összesített számláló nem veszít inkrementumot.
  select coalesce(material.letoltes_szam, 0)
  into v_download_count
  from public.mm_segedanyagok material
  where material.id = p_material_id
    and material.aktiv = true
  for update;

  if not found then
    raise exception 'A segédanyag nem található vagy már archivált.'
      using errcode = 'P0002';
  end if;

  insert into mm_private.mm_material_download_receipts (
    user_id,
    material_id,
    export_format,
    bucket_date,
    created_at
  ) values (
    p_user_id,
    p_material_id,
    p_export_format,
    (statement_timestamp() at time zone 'UTC')::date,
    statement_timestamp()
  )
  on conflict (user_id, material_id, export_format, bucket_date) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.mm_segedanyagok material
    set letoltes_szam = coalesce(material.letoltes_szam, 0) + 1
    where material.id = p_material_id
    returning material.letoltes_szam into v_download_count;
  end if;

  return v_download_count;
end
$function$;

comment on function public.mm_record_material_download(uuid, uuid, text) is
  'Napi, felhasználó- és formátumalapú idempotens letöltésszámláló; csak service_role hívhatja.';

revoke all on function public.mm_record_material_download(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mm_record_material_download(uuid, uuid, text)
  to service_role;

commit;

-- Ellenőrzés: az utolsó SELECT egyetlen JSON-sort ad vissza.
select jsonb_build_object(
  'mm_letoltes_szamlalo_hardening_ellenorzes', jsonb_build_object(
    'function_exists',
      to_regprocedure(
        'public.mm_record_material_download(uuid,uuid,text)'
      ) is not null,
    'old_function_removed',
      to_regprocedure('public.mm_record_material_download(uuid)') is null,
    'security_invoker',
      not coalesce(procedure.prosecdef, true),
    'search_path_locked',
      exists (
        select 1
        from unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting(value)
        where setting.value in ('search_path=', 'search_path=""')
      ),
    'anon_execute', has_function_privilege(
      'anon',
      'public.mm_record_material_download(uuid,uuid,text)',
      'EXECUTE'
    ),
    'authenticated_execute', has_function_privilege(
      'authenticated',
      'public.mm_record_material_download(uuid,uuid,text)',
      'EXECUTE'
    ),
    'service_role_execute', has_function_privilege(
      'service_role',
      'public.mm_record_material_download(uuid,uuid,text)',
      'EXECUTE'
    ),
    'service_role_select', has_table_privilege(
      'service_role',
      'public.mm_segedanyagok',
      'SELECT'
    ),
    'service_role_update', has_table_privilege(
      'service_role',
      'public.mm_segedanyagok',
      'UPDATE'
    ),
    'receipt_table_exists',
      to_regclass('mm_private.mm_material_download_receipts') is not null,
    'receipt_rls_enabled',
      coalesce(receipt_table.relrowsecurity, false),
    'receipt_anon_select', has_table_privilege(
      'anon',
      'mm_private.mm_material_download_receipts',
      'SELECT'
    ),
    'receipt_anon_insert', has_table_privilege(
      'anon',
      'mm_private.mm_material_download_receipts',
      'INSERT'
    ),
    'receipt_authenticated_select', has_table_privilege(
      'authenticated',
      'mm_private.mm_material_download_receipts',
      'SELECT'
    ),
    'receipt_authenticated_insert', has_table_privilege(
      'authenticated',
      'mm_private.mm_material_download_receipts',
      'INSERT'
    ),
    'receipt_service_role_select', has_table_privilege(
      'service_role',
      'mm_private.mm_material_download_receipts',
      'SELECT'
    ),
    'receipt_service_role_insert', has_table_privilege(
      'service_role',
      'mm_private.mm_material_download_receipts',
      'INSERT'
    )
  )
)
from pg_proc procedure
left join pg_class receipt_table
  on receipt_table.oid = to_regclass(
    'mm_private.mm_material_download_receipts'
  )
where procedure.oid = to_regprocedure(
  'public.mm_record_material_download(uuid,uuid,text)'
);
