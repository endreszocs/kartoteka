-- Missziós Műhely — jutalmazási rendszer élő séma-diagnosztika
-- Csak olvas; nem hoz létre, nem módosít és nem töröl adatot.
-- Futtasd egyben a Supabase SQL Editorban, majd a result egyetlen JSON sorát küldd vissza.

with
mm_tables as (
  select
    c.table_name,
    pc.relrowsecurity as rls_enabled,
    pc.relforcerowsecurity as rls_forced,
    pg_get_userbyid(pc.relowner) as owner,
    pc.relacl is null as acl_is_default,
    to_jsonb(coalesce(pc.relacl, acldefault('r', pc.relowner))) as effective_acl,
    jsonb_agg(
      jsonb_build_object(
        'name', c.column_name,
        'type', c.data_type,
        'udt', c.udt_name,
        'nullable', c.is_nullable = 'YES',
        'default', c.column_default
      )
      order by c.ordinal_position
    ) as columns
  from information_schema.columns c
  join pg_namespace pn
    on pn.nspname = c.table_schema
  join pg_class pc
    on pc.relnamespace = pn.oid
   and pc.relname = c.table_name
  where c.table_schema = 'public'
    and c.table_name like 'mm\_%' escape '\'
    and pc.relkind in ('r', 'p')
  group by c.table_name, pc.relrowsecurity, pc.relforcerowsecurity, pc.relowner, pc.relacl
),
mm_policies as (
  select jsonb_agg(
    jsonb_build_object(
      'table', tablename,
      'name', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'check', with_check
    )
    order by tablename, cmd, policyname
  ) as value
  from pg_policies
  where schemaname = 'public'
    and tablename like 'mm\_%' escape '\'
),
mm_indexes as (
  select jsonb_agg(
    jsonb_build_object(
      'table', tablename,
      'name', indexname,
      'definition', indexdef
    )
    order by tablename, indexname
  ) as value
  from pg_indexes
  where schemaname = 'public'
    and tablename like 'mm\_%' escape '\'
),
mm_constraints as (
  select jsonb_agg(
    jsonb_build_object(
      'table', rel.relname,
      'name', con.conname,
      'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)
    )
    order by rel.relname, con.conname
  ) as value
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname like 'mm\_%' escape '\'
),
mm_triggers as (
  select jsonb_agg(
    jsonb_build_object(
      'table', rel.relname,
      'name', trigger.tgname,
      'enabled', trigger.tgenabled,
      'internal', trigger.tgisinternal,
      'definition', pg_get_triggerdef(trigger.oid, true)
    )
    order by rel.relname, trigger.tgname
  ) as value
  from pg_trigger trigger
  join pg_class rel on rel.oid = trigger.tgrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname like 'mm\_%' escape '\'
),
candidate_functions as materialized (
  select
    proc.oid,
    proc.proname,
    proc.proowner,
    proc.proacl,
    proc.prosecdef,
    proc.proleakproof,
    proc.provolatile,
    proc.proparallel,
    proc.proconfig,
    ns.nspname
  from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname not in ('pg_catalog', 'information_schema')
    and proc.prokind in ('f', 'p')
),
mm_functions as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', candidate.nspname,
      'name', candidate.proname,
      'arguments', pg_get_function_identity_arguments(candidate.oid),
      'owner', pg_get_userbyid(candidate.proowner),
      'acl_is_default', candidate.proacl is null,
      'effective_acl', to_jsonb(coalesce(candidate.proacl, acldefault('f', candidate.proowner))),
      'security_definer', candidate.prosecdef,
      'leakproof', candidate.proleakproof,
      'volatility', candidate.provolatile,
      'parallel', candidate.proparallel,
      'config', candidate.proconfig,
      'definition', pg_get_functiondef(candidate.oid)
    )
    order by candidate.nspname, candidate.proname, pg_get_function_identity_arguments(candidate.oid)
  ) as value
  from candidate_functions candidate
  where candidate.proname like 'mm\_%' escape '\'
     or pg_get_functiondef(candidate.oid) ilike '%mm\_%' escape '\'
),
mm_function_grants as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', candidate.nspname,
      'function', candidate.proname,
      'arguments', pg_get_function_identity_arguments(candidate.oid),
      'grantor', pg_get_userbyid(grant_row.grantor),
      'grantee', case
        when grant_row.grantee = 0 then 'PUBLIC'
        else pg_get_userbyid(grant_row.grantee)
      end,
      'privilege', grant_row.privilege_type,
      'grantable', grant_row.is_grantable
    )
    order by candidate.nspname, candidate.proname, pg_get_function_identity_arguments(candidate.oid), grant_row.grantee
  ) as value
  from candidate_functions candidate
  cross join lateral aclexplode(
    coalesce(candidate.proacl, acldefault('f', candidate.proowner))
  ) grant_row
  where candidate.proname like 'mm\_%' escape '\'
     or pg_get_functiondef(candidate.oid) ilike '%mm\_%' escape '\'
),
mm_table_grants as (
  select jsonb_agg(
    jsonb_build_object(
      'table', table_name,
      'grantor', grantor,
      'grantee', grantee,
      'privilege', privilege_type,
      'grantable', is_grantable = 'YES'
    )
    order by table_name, grantee, privilege_type
  ) as value
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'mm\_%' escape '\'
),
mm_enums as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', ns.nspname,
      'name', typ.typname,
      'values', labels.values
    )
    order by ns.nspname, typ.typname
  ) as value
  from pg_type typ
  join pg_namespace ns on ns.oid = typ.typnamespace
  join lateral (
    select jsonb_agg(enum.enumlabel order by enum.enumsortorder) as values
    from pg_enum enum
    where enum.enumtypid = typ.oid
  ) labels on labels.values is not null
  where typ.oid in (
    select distinct attr.atttypid
    from pg_attribute attr
    join pg_class rel on rel.oid = attr.attrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    where rel_ns.nspname = 'public'
      and rel.relname like 'mm\_%' escape '\'
      and attr.attnum > 0
      and not attr.attisdropped
  )
),
badge_catalog as (
  select coalesce(jsonb_agg(to_jsonb(badge) order by badge.sorrend), '[]'::jsonb) as value
  from public.mm_jelveny_tipusok badge
)
select jsonb_build_object(
  'generated_at', now(),
  'postgres_version', current_setting('server_version'),
  'tables', coalesce((select jsonb_agg(to_jsonb(mm_tables) order by table_name) from mm_tables), '[]'::jsonb),
  'policies', coalesce((select value from mm_policies), '[]'::jsonb),
  'indexes', coalesce((select value from mm_indexes), '[]'::jsonb),
  'constraints', coalesce((select value from mm_constraints), '[]'::jsonb),
  'triggers', coalesce((select value from mm_triggers), '[]'::jsonb),
  'functions', coalesce((select value from mm_functions), '[]'::jsonb),
  'function_grants', coalesce((select value from mm_function_grants), '[]'::jsonb),
  'table_grants', coalesce((select value from mm_table_grants), '[]'::jsonb),
  'enums', coalesce((select value from mm_enums), '[]'::jsonb),
  'badge_catalog', (select value from badge_catalog)
) as misszios_muhely_diagnosztika;
