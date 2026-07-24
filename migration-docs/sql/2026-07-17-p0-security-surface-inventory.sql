-- ============================================================================
-- KARTOTEKA -- P0 Supabase tamadasi felulet, CSAK OLVASO inventory
-- Datum: 2026-07-17
--
-- Miert kell:
--   A live export kritikus, permissive szemely/profiles policykat igazolt.
--   A biztonsagos tagi signup elott azt is bizonyitani kell, hogy nincs masik
--   public RPC, view, ACL, trigger vagy storage policy, amely ugyanazt a
--   szeparaciot megkeruli.
--
-- A lekerdezes NEM modosit adatot, semat, policyt, grantet vagy Auth allapotot.
-- Egyetlen JSON cellat ad. Rekordadatot, emailt, fajlnevet es objektum-pathot
-- nem ad vissza. A Storage objektum-pathokat belsoleg csak aggregalt tenant/path
-- konzisztencia-darabszamok kiszamitasahoz olvassa; egyedi erteket nem exportal.
-- A JSON teljes function/trigger definiciokat es role configot is tartalmaz.
-- Visszakuldes elott az esetleges hardcoded kulcs/token erteket REDACTED szovegre
-- csereld; a kulcs neve es a definicio tobbi resze maradjon meg az audithoz.
-- ============================================================================

WITH
api_context AS (
  SELECT jsonb_build_object(
    'current_database', current_database(),
    'current_user', current_user,
    'pgrst_db_schemas', current_setting('pgrst.db_schemas', true),
    'pgrst_db_extra_search_path', current_setting('pgrst.db_extra_search_path', true)
  ) AS value
),
role_security AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.role_name),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      rolname AS role_name,
      rolsuper,
      rolinherit,
      rolcreaterole,
      rolcreatedb,
      rolcanlogin,
      rolreplication,
      rolbypassrls,
      rolconfig
    FROM pg_roles role_row
    WHERE rolname IN (
      'anon', 'authenticated', 'service_role', 'authenticator',
      'postgres', 'supabase_auth_admin'
    )
       OR role_row.oid IN (
         SELECT relation_row.relowner
         FROM pg_class relation_row
         JOIN pg_namespace relation_ns ON relation_ns.oid = relation_row.relnamespace
         WHERE relation_ns.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
       )
       OR role_row.oid IN (
         SELECT routine_row.proowner
         FROM pg_proc routine_row
         JOIN pg_namespace routine_ns ON routine_ns.oid = routine_row.pronamespace
         WHERE routine_ns.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
       )
       OR role_row.oid IN (
         SELECT schema_row.nspowner
         FROM pg_namespace schema_row
         WHERE schema_row.nspname <> 'information_schema'
           AND schema_row.nspname !~ '^pg_'
       )
  ) r
),
role_memberships AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.member_role, r.granted_role),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      member_role.rolname AS member_role,
      granted_role.rolname AS granted_role,
      grantor_role.rolname AS grantor_role,
      membership.admin_option
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles grantor_role ON grantor_role.oid = membership.grantor
  ) r
),
schema_surface AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      pg_get_userbyid(n.nspowner) AS owner_name,
      n.nspacl::text AS raw_acl,
      has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
      has_schema_privilege('anon', n.oid, 'CREATE') AS anon_create,
      has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage,
      has_schema_privilege('authenticated', n.oid, 'CREATE') AS authenticated_create,
      has_schema_privilege('service_role', n.oid, 'USAGE') AS service_role_usage,
      has_schema_privilege('service_role', n.oid, 'CREATE') AS service_role_create
    FROM pg_namespace n
    WHERE n.nspname <> 'information_schema'
      AND n.nspname !~ '^pg_'
  ) r
),
default_acl_surface AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.owner_name, r.schema_name,
                                       r.object_type, r.grantee_name,
                                       r.privilege_type),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      pg_get_userbyid(d.defaclrole) AS owner_name,
      COALESCE(n.nspname, '*') AS schema_name,
      d.defaclobjtype AS object_type,
      d.defaclacl::text AS raw_acl,
      CASE WHEN exploded.grantee = 0
        THEN 'PUBLIC'
        ELSE pg_get_userbyid(exploded.grantee)
      END AS grantee_name,
      exploded.privilege_type,
      exploded.is_grantable
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) exploded
  ) r
),
public_relation_surface AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.relation_type, r.relation_name),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS relation_name,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'foreign_table'
        ELSE c.relkind::text
      END AS relation_type,
      pg_get_userbyid(c.relowner) AS owner_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS force_rls,
      c.relacl::text AS raw_acl,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
      has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
      has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
      has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
      has_table_privilege('anon', c.oid, 'REFERENCES') AS anon_references,
      has_table_privilege('anon', c.oid, 'TRIGGER') AS anon_trigger,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
      has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
      has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
      has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
      has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate,
      has_table_privilege('authenticated', c.oid, 'REFERENCES') AS authenticated_references,
      has_table_privilege('authenticated', c.oid, 'TRIGGER') AS authenticated_trigger,
      has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
      has_table_privilege('service_role', c.oid, 'INSERT') AS service_role_insert,
      has_table_privilege('service_role', c.oid, 'UPDATE') AS service_role_update,
      has_table_privilege('service_role', c.oid, 'DELETE') AS service_role_delete,
      has_table_privilege('service_role', c.oid, 'TRUNCATE') AS service_role_truncate,
      has_table_privilege('service_role', c.oid, 'REFERENCES') AS service_role_references,
      has_table_privilege('service_role', c.oid, 'TRIGGER') AS service_role_trigger
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  ) r
),
column_acl_surface AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.relation_name,
                                       r.column_number),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS relation_name,
      a.attnum AS column_number,
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      a.attidentity AS identity_kind,
      a.attgenerated AS generated_kind,
      a.attacl::text AS raw_column_acl,
      has_column_privilege('anon', c.oid, a.attnum, 'SELECT') AS anon_select,
      has_column_privilege('anon', c.oid, a.attnum, 'INSERT') AS anon_insert,
      has_column_privilege('anon', c.oid, a.attnum, 'UPDATE') AS anon_update,
      has_column_privilege('anon', c.oid, a.attnum, 'REFERENCES') AS anon_references,
      has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT') AS authenticated_select,
      has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') AS authenticated_insert,
      has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') AS authenticated_update,
      has_column_privilege('authenticated', c.oid, a.attnum, 'REFERENCES') AS authenticated_references,
      has_column_privilege('service_role', c.oid, a.attnum, 'SELECT') AS service_role_select,
      has_column_privilege('service_role', c.oid, a.attnum, 'INSERT') AS service_role_insert,
      has_column_privilege('service_role', c.oid, a.attnum, 'UPDATE') AS service_role_update,
      has_column_privilege('service_role', c.oid, a.attnum, 'REFERENCES') AS service_role_references
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (
        a.attacl IS NOT NULL
        OR (
          n.nspname = 'public'
          AND (
            c.relname IN (
              'profiles', 'profile_roles', 'szemely', 'befizetes',
              'access_requests', 'congregations', 'public_sites',
              'public_site_themes', 'public_posts', 'public_magazines',
              'public_magazine_issues', 'haztartas', 'haztartas_tag',
              'szemely_kapcsolat'
            )
            OR c.relname LIKE 'member\_%' ESCAPE '\'
          )
        )
        OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
      )
  ) r
),
public_sequence_surface AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.sequence_name),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS sequence_name,
      pg_get_userbyid(c.relowner) AS owner_name,
      c.relacl::text AS raw_acl,
      has_sequence_privilege('anon', c.oid, 'USAGE') AS anon_usage,
      has_sequence_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_sequence_privilege('anon', c.oid, 'UPDATE') AS anon_update,
      has_sequence_privilege('authenticated', c.oid, 'USAGE') AS authenticated_usage,
      has_sequence_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
      has_sequence_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
      has_sequence_privilege('service_role', c.oid, 'USAGE') AS service_role_usage,
      has_sequence_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
      has_sequence_privilege('service_role', c.oid, 'UPDATE') AS service_role_update
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
      AND c.relkind = 'S'
  ) r
),
public_policies AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schemaname, r.tablename, r.policyname),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage', 'graphql_public', 'member_private')
  ) r
),
callable_security_definers AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.function_name, r.identity_arguments),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_result(p.oid) AS result_type,
      pg_get_userbyid(p.proowner) AS owner_name,
      l.lanname AS language_name,
      p.prokind AS routine_kind,
      p.prosecdef AS security_definer,
      p.proleakproof AS leakproof,
      p.provolatile AS volatility,
      p.proparallel AS parallel_safety,
      p.proconfig AS function_config,
      p.proacl::text AS raw_acl,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
      AND p.prokind IN ('f', 'p', 'w')
      AND (
        p.prosecdef = true
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ) r
),
readable_views AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.view_type, r.view_name),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS view_name,
      CASE c.relkind WHEN 'm' THEN 'materialized_view' ELSE 'view' END AS view_type,
      pg_get_userbyid(c.relowner) AS owner_name,
      c.reloptions,
      COALESCE('security_invoker=true' = ANY(c.reloptions), false) AS security_invoker,
      COALESCE('security_barrier=true' = ANY(c.reloptions), false) AS security_barrier,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
      has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
      pg_get_viewdef(c.oid, true) AS definition
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
      AND c.relkind IN ('v', 'm')
      AND (
        has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('service_role', c.oid, 'SELECT')
      )
  ) r
),
critical_triggers AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.table_name, r.trigger_name),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      table_ns.nspname AS schema_name,
      table_rel.relname AS table_name,
      trigger_row.tgname AS trigger_name,
      trigger_row.tgenabled AS trigger_enabled,
      pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition,
      function_ns.nspname AS function_schema,
      function_row.proname AS function_name,
      pg_get_function_identity_arguments(function_row.oid) AS function_identity_arguments,
      pg_get_userbyid(function_row.proowner) AS function_owner_name,
      function_row.prosecdef AS function_security_definer,
      function_row.proconfig AS function_config,
      function_row.proacl::text AS function_raw_acl,
      pg_get_functiondef(function_row.oid) AS function_definition
    FROM pg_trigger trigger_row
    JOIN pg_class table_rel ON table_rel.oid = trigger_row.tgrelid
    JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_ns ON function_ns.oid = function_row.pronamespace
    WHERE NOT trigger_row.tgisinternal
      AND (
        table_ns.nspname IN ('public', 'storage', 'graphql_public', 'member_private')
        OR (table_ns.nspname = 'auth' AND table_rel.relname = 'users')
      )
  ) r
),
profile_role_duplicate_groups AS (
  SELECT
    'all'::text AS duplicate_set,
    pr.profile_id,
    pr.scope,
    pr.scope_id,
    pr.role,
    lower(btrim(COALESCE(pr.custom_label, ''))) AS normalized_custom_label,
    count(*)::bigint AS group_size
  FROM public.profile_roles pr
  GROUP BY 1, 2, 3, 4, 5, 6
  HAVING count(*) > 1

  UNION ALL

  SELECT
    'active_approved'::text AS duplicate_set,
    pr.profile_id,
    pr.scope,
    pr.scope_id,
    pr.role,
    lower(btrim(COALESCE(pr.custom_label, ''))) AS normalized_custom_label,
    count(*)::bigint AS group_size
  FROM public.profile_roles pr
  WHERE pr.active IS TRUE
    AND pr.approval_status = 'approved'
  GROUP BY 1, 2, 3, 4, 5, 6
  HAVING count(*) > 1
),
profile_role_duplicate_counts AS (
  SELECT jsonb_build_object(
    'all_duplicate_groups', count(*) FILTER (
      WHERE duplicate_set = 'all'
    )::bigint,
    'all_rows_in_duplicate_groups', COALESCE(sum(group_size) FILTER (
      WHERE duplicate_set = 'all'
    ), 0)::bigint,
    'active_approved_duplicate_groups', count(*) FILTER (
      WHERE duplicate_set = 'active_approved'
    )::bigint,
    'active_approved_rows_in_duplicate_groups', COALESCE(sum(group_size) FILTER (
      WHERE duplicate_set = 'active_approved'
    ), 0)::bigint
  ) AS value
  FROM profile_role_duplicate_groups
),
authorization_aggregates AS (
  SELECT jsonb_build_object(
    'profiles_by_status_and_role', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(grouped) ORDER BY grouped.profile_status, grouped.profile_role),
        '[]'::jsonb
      )
      FROM (
        SELECT
          CASE
            WHEN NULLIF(btrim(p.status), '') IS NULL THEN '<missing>'
            WHEN btrim(p.status) IN ('pending', 'approved', 'active', 'rejected')
              THEN btrim(p.status)
            ELSE '<unexpected>'
          END AS profile_status,
          CASE
            WHEN NULLIF(btrim(p.role), '') IS NULL THEN '<missing>'
            WHEN btrim(p.role) IN (
              'lelkesz', 'esperes', 'egyhazmegyei_admin',
              'egyhazkeruleti_admin', 'admin', 'konyvelo',
              'egyhazmegyei_szamvevo'
            ) THEN btrim(p.role)
            ELSE '<unexpected>'
          END AS profile_role,
          count(*)::bigint AS row_count
        FROM public.profiles p
        GROUP BY 1, 2
      ) grouped
    ),
    'profile_roles_by_state_role_and_scope', (
      SELECT COALESCE(
        jsonb_agg(
          to_jsonb(grouped)
          ORDER BY grouped.active DESC, grouped.approval_status,
                   grouped.role_name, grouped.scope_name
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          pr.active,
          CASE
            WHEN NULLIF(btrim(pr.approval_status), '') IS NULL THEN '<missing>'
            WHEN btrim(pr.approval_status) IN ('pending', 'approved', 'rejected', 'revoked')
              THEN btrim(pr.approval_status)
            ELSE '<unexpected>'
          END AS approval_status,
          CASE
            WHEN NULLIF(btrim(pr.role), '') IS NULL THEN '<missing>'
            WHEN btrim(pr.role) IN (
              'admin', 'egyhazkeruleti_admin', 'egyhazmegyei_admin',
              'esperes', 'egyhazmegyei_szamvevo', 'lelkesz',
              'konyvelo', 'custom'
            ) THEN btrim(pr.role)
            ELSE '<unexpected>'
          END AS role_name,
          CASE
            WHEN NULLIF(btrim(pr.scope), '') IS NULL THEN '<missing>'
            WHEN btrim(pr.scope) IN ('system', 'district', 'diocese', 'congregation')
              THEN btrim(pr.scope)
            ELSE '<unexpected>'
          END AS scope_name,
          count(*)::bigint AS row_count
        FROM public.profile_roles pr
        GROUP BY 1, 2, 3, 4
      ) grouped
    ),
    'role_state_anomalies', jsonb_build_object(
      'orphan_profile_references', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        LEFT JOIN public.profiles p ON p.id = pr.profile_id
        WHERE p.id IS NULL
      ),
      'active_approved_roles_on_non_active_profile', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        JOIN public.profiles p ON p.id = pr.profile_id
        WHERE pr.active IS TRUE
          AND pr.approval_status = 'approved'
          AND p.status IS DISTINCT FROM 'active'
      ),
      'active_rows_not_approved', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        WHERE pr.active IS TRUE
          AND pr.approval_status IS DISTINCT FROM 'approved'
      ),
      'inactive_rows_still_approved', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        WHERE pr.active IS FALSE
          AND pr.approval_status = 'approved'
      )
    ),
    'scope_anomalies', jsonb_build_object(
      'unknown_scope', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        WHERE pr.scope NOT IN ('system', 'district', 'diocese', 'congregation')
           OR pr.scope IS NULL
      ),
      'invalid_scope_id_shape', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        WHERE (pr.scope = 'system' AND pr.scope_id IS NOT NULL)
           OR (pr.scope <> 'system' AND pr.scope_id IS NULL)
      ),
      'role_scope_mismatch', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        WHERE (pr.role = 'admin' AND pr.scope <> 'system')
           OR (pr.role = 'egyhazkeruleti_admin' AND pr.scope <> 'district')
           OR (
             pr.role IN ('egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo')
             AND pr.scope <> 'diocese'
           )
           OR (pr.role IN ('lelkesz', 'konyvelo') AND pr.scope <> 'congregation')
      ),
      'missing_district_scope_target', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        LEFT JOIN public.districts d
          ON pr.scope = 'district' AND d.id = pr.scope_id
        WHERE pr.scope = 'district'
          AND pr.scope_id IS NOT NULL
          AND d.id IS NULL
      ),
      'missing_diocese_scope_target', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        LEFT JOIN public.dioceses d
          ON pr.scope = 'diocese' AND d.id = pr.scope_id
        WHERE pr.scope = 'diocese'
          AND pr.scope_id IS NOT NULL
          AND d.id IS NULL
      ),
      'missing_congregation_scope_target', (
        SELECT count(*)::bigint
        FROM public.profile_roles pr
        LEFT JOIN public.congregations c
          ON pr.scope = 'congregation' AND c.id = pr.scope_id
        WHERE pr.scope = 'congregation'
          AND pr.scope_id IS NOT NULL
          AND c.id IS NULL
      )
    ),
    'normalized_role_duplicates', profile_role_duplicate_counts.value,
    'auth_raw_user_metadata_requested_role_buckets', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(grouped) ORDER BY grouped.requested_role_bucket),
        '[]'::jsonb
      )
      FROM (
        SELECT
          CASE
            WHEN COALESCE(u.raw_user_meta_data, '{}'::jsonb) -> 'requested_role' IS NULL
              OR jsonb_typeof(COALESCE(u.raw_user_meta_data, '{}'::jsonb) -> 'requested_role') = 'null'
              THEN '<missing>'
            WHEN jsonb_typeof(COALESCE(u.raw_user_meta_data, '{}'::jsonb) -> 'requested_role') <> 'string'
              THEN '<non_string>'
            WHEN btrim(u.raw_user_meta_data ->> 'requested_role') = ''
              THEN '<empty>'
            WHEN btrim(u.raw_user_meta_data ->> 'requested_role') IN (
              'lelkesz', 'esperes', 'egyhazmegyei_admin',
              'egyhazkeruleti_admin', 'admin',
              'konyvelo', 'egyhazmegyei_szamvevo'
            ) THEN btrim(u.raw_user_meta_data ->> 'requested_role')
            ELSE '<unexpected>'
          END AS requested_role_bucket,
          count(*)::bigint AS user_count
        FROM auth.users u
        GROUP BY 1
      ) grouped
    ),
    'auth_profile_linkage', jsonb_build_object(
      'auth_user_count', (SELECT count(*)::bigint FROM auth.users),
      'profile_count', (SELECT count(*)::bigint FROM public.profiles),
      'auth_users_without_profile', (
        SELECT count(*)::bigint
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        WHERE p.id IS NULL
      ),
      'profiles_without_auth_user', (
        SELECT count(*)::bigint
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE u.id IS NULL
      )
    )
  ) AS value
  FROM profile_role_duplicate_counts
),
-- A csalad tablanak nincs congregation_id oszlopa. Ezert a csaladi befizetes
-- tenant-ellenorzese az id_ferfi/id_no szemely-sorok congregation_id-jat
-- hasznalja, ugyanugy, mint a repository csalad-hozzaferesi segedfuggvenye.
payment_data_quality AS (
  SELECT jsonb_build_object(
    'row_state', jsonb_build_object(
      'total_rows', count(*)::bigint,
      'deleted_true', count(*) FILTER (WHERE b.deleted IS TRUE)::bigint,
      'deleted_false', count(*) FILTER (WHERE b.deleted IS FALSE)::bigint,
      'deleted_null', count(*) FILTER (WHERE b.deleted IS NULL)::bigint,
      'stornozott_true', count(*) FILTER (WHERE b.stornozott IS TRUE)::bigint,
      'stornozott_false', count(*) FILTER (WHERE b.stornozott IS FALSE)::bigint,
      'stornozott_null', count(*) FILTER (WHERE b.stornozott IS NULL)::bigint,
      'deleted_and_stornozott', count(*) FILTER (
        WHERE b.deleted IS TRUE AND b.stornozott IS TRUE
      )::bigint,
      'active_not_deleted_not_stornozott', count(*) FILTER (
        WHERE b.deleted IS NOT TRUE AND b.stornozott IS NOT TRUE
      )::bigint
    ),
    'person_family_target_shape', jsonb_build_object(
      'neither_person_nor_family_id', count(*) FILTER (
        WHERE b.id_szemely IS NULL AND b.id_csalad IS NULL
      )::bigint,
      'person_id_only', count(*) FILTER (
        WHERE b.id_szemely IS NOT NULL AND b.id_csalad IS NULL
      )::bigint,
      'family_id_only', count(*) FILTER (
        WHERE b.id_szemely IS NULL AND b.id_csalad IS NOT NULL
      )::bigint,
      'both_person_and_family_id', count(*) FILTER (
        WHERE b.id_szemely IS NOT NULL AND b.id_csalad IS NOT NULL
      )::bigint,
      'family_flag_true', count(*) FILTER (WHERE b.csalad IS TRUE)::bigint,
      'family_flag_false', count(*) FILTER (WHERE b.csalad IS FALSE)::bigint,
      'family_flag_null', count(*) FILTER (WHERE b.csalad IS NULL)::bigint,
      'family_flag_true_without_family_id', count(*) FILTER (
        WHERE b.csalad IS TRUE AND b.id_csalad IS NULL
      )::bigint,
      'family_flag_false_without_person_id', count(*) FILTER (
        WHERE b.csalad IS FALSE AND b.id_szemely IS NULL
      )::bigint,
      'person_id_with_family_flag_true', count(*) FILTER (
        WHERE b.id_szemely IS NOT NULL AND b.csalad IS TRUE
      )::bigint,
      'family_id_with_family_flag_false', count(*) FILTER (
        WHERE b.id_csalad IS NOT NULL AND b.csalad IS FALSE
      )::bigint
    ),
    'orphan_references', jsonb_build_object(
      'missing_person', count(*) FILTER (
        WHERE b.id_szemely IS NOT NULL AND person_row.id IS NULL
      )::bigint,
      'missing_family', count(*) FILTER (
        WHERE b.id_csalad IS NOT NULL AND family_row.id IS NULL
      )::bigint,
      'missing_payment_target', count(*) FILTER (
        WHERE b.id_befizetescel IS NOT NULL AND payment_target.id IS NULL
      )::bigint,
      'missing_auth_user', count(*) FILTER (
        WHERE b.userid IS NOT NULL AND auth_user.id IS NULL
      )::bigint,
      'missing_male_family_head', count(*) FILTER (
        WHERE family_row.id_ferfi IS NOT NULL AND male_head.id IS NULL
      )::bigint,
      'missing_female_family_head', count(*) FILTER (
        WHERE family_row.id_no IS NOT NULL AND female_head.id IS NULL
      )::bigint
    ),
    'tenant_integrity', jsonb_build_object(
      'payment_congregation_missing', count(*) FILTER (
        WHERE b.congregation_id IS NULL
      )::bigint,
      'linked_person_congregation_missing', count(*) FILTER (
        WHERE person_row.id IS NOT NULL AND person_row.congregation_id IS NULL
      )::bigint,
      'payment_person_cross_congregation', count(*) FILTER (
        WHERE b.congregation_id IS NOT NULL
          AND person_row.congregation_id IS NOT NULL
          AND b.congregation_id <> person_row.congregation_id
      )::bigint,
      'family_without_resolvable_head_congregation', count(*) FILTER (
        WHERE family_row.id IS NOT NULL
          AND male_head.congregation_id IS NULL
          AND female_head.congregation_id IS NULL
      )::bigint,
      'family_heads_cross_congregation', count(*) FILTER (
        WHERE male_head.congregation_id IS NOT NULL
          AND female_head.congregation_id IS NOT NULL
          AND male_head.congregation_id <> female_head.congregation_id
      )::bigint,
      'payment_family_cross_congregation', count(*) FILTER (
        WHERE b.congregation_id IS NOT NULL
          AND (
            (
              male_head.congregation_id IS NOT NULL
              AND b.congregation_id <> male_head.congregation_id
            )
            OR (
              female_head.congregation_id IS NOT NULL
              AND b.congregation_id <> female_head.congregation_id
            )
          )
      )::bigint
    )
  ) AS value
  FROM public.befizetes b
  LEFT JOIN public.szemely person_row ON person_row.id = b.id_szemely
  LEFT JOIN public.csalad family_row ON family_row.id = b.id_csalad
  LEFT JOIN public.szemely male_head ON male_head.id = family_row.id_ferfi
  LEFT JOIN public.szemely female_head ON female_head.id = family_row.id_no
  LEFT JOIN public.befizetescel payment_target ON payment_target.id = b.id_befizetescel
  LEFT JOIN auth.users auth_user ON auth_user.id = b.userid
),
storage_buckets AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.bucket_id),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      b.id AS bucket_id,
      b.public,
      b.file_size_limit,
      b.allowed_mime_types,
      count(o.id)::bigint AS object_count,
      count(o.id) FILTER (WHERE o.owner IS NULL)::bigint AS objects_without_owner,
      count(DISTINCT o.owner) FILTER (WHERE o.owner IS NOT NULL)::bigint AS distinct_owner_count,
      COALESCE(
        sum(
          CASE
            WHEN o.metadata ->> 'size' ~ '^[0-9]+$'
              THEN (o.metadata ->> 'size')::numeric
            ELSE 0::numeric
          END
        ),
        0::numeric
      ) AS total_size_bytes
    FROM storage.buckets b
    LEFT JOIN storage.objects o ON o.bucket_id = b.id
    GROUP BY b.id, b.public, b.file_size_limit, b.allowed_mime_types
  ) r
),
storage_policies AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(r) ORDER BY r.tablename, r.policyname),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename IN ('objects', 'buckets')
  ) r
),
-- Igazolt repository-konvenciok:
--   public-site-media/{congregationId}/hero|crest/{filename}
--   public-site-media/{congregationId}/posts/{postSlug}/{filename}
--   public-site-media/{congregationId}/{issueId}/{filename} (magazin borito)
--   public-magazines/{congregationId}/{issueId}/{filename}
--   access-request-docs/requests/{randomUuid}/{filename}
--   avatars/{congregationId}/szemely-{szemelyId}.jpg
-- A riport ezekbol is csak aggregalt darabszamokat ad vissza.
public_site_media_paths AS (
  SELECT
    o.id AS object_id,
    o.owner,
    CASE
      WHEN parsed.path_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN parsed.path_parts[1]::uuid
      ELSE NULL
    END AS path_congregation_id,
    CASE
      WHEN parsed.path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN 'magazine_issue'
      ELSE parsed.path_parts[2]
    END AS target_kind,
    CASE
      WHEN parsed.path_parts[2] = 'posts' THEN NULLIF(parsed.path_parts[3], '')
      ELSE NULL
    END AS post_slug,
    CASE
      WHEN parsed.path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN parsed.path_parts[2]::uuid
      ELSE NULL
    END AS path_issue_id,
    (
      parsed.path_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (
        (
          parsed.path_parts[2] IN ('hero', 'crest')
          AND cardinality(parsed.path_parts) = 3
          AND COALESCE(parsed.path_parts[3], '') <> ''
        )
        OR (
          parsed.path_parts[2] = 'posts'
          AND cardinality(parsed.path_parts) = 4
          AND COALESCE(parsed.path_parts[3], '') ~ '^[a-z0-9][a-z0-9-]{0,127}[a-z0-9]?$'
          AND COALESCE(parsed.path_parts[4], '') <> ''
        )
        OR (
          parsed.path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND cardinality(parsed.path_parts) = 3
          AND COALESCE(parsed.path_parts[3], '') <> ''
        )
      )
    ) AS valid_path_shape
  FROM storage.objects o
  CROSS JOIN LATERAL (
    SELECT string_to_array(o.name, '/') AS path_parts
  ) parsed
  WHERE o.bucket_id = 'public-site-media'
),
public_site_media_correlation AS (
  SELECT jsonb_build_object(
    'bucket_exists', EXISTS (
      SELECT 1 FROM storage.buckets b WHERE b.id = 'public-site-media'
    ),
    'bucket_is_public', (
      SELECT b.public FROM storage.buckets b WHERE b.id = 'public-site-media'
    ),
    'total_objects', count(*)::bigint,
    'objects_without_owner', count(*) FILTER (WHERE path.owner IS NULL)::bigint,
    'invalid_path_shape', count(*) FILTER (
      WHERE path.valid_path_shape IS NOT TRUE
    )::bigint,
    'valid_path_without_public_site', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE AND site.id IS NULL
    )::bigint,
    'valid_path_for_unpublished_site', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND site.id IS NOT NULL
        AND site.is_published IS NOT TRUE
    )::bigint,
    'valid_path_for_published_site', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE AND site.is_published IS TRUE
    )::bigint,
    'post_objects', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE AND path.target_kind = 'posts'
    )::bigint,
    'post_objects_without_matching_post', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'posts'
        AND post_row.id IS NULL
    )::bigint,
    'draft_archived_or_future_post_objects', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'posts'
        AND post_row.id IS NOT NULL
        AND (
          post_row.status IS DISTINCT FROM 'published'
          OR post_row.published_at IS NULL
          OR post_row.published_at > now()
        )
    )::bigint,
    'published_post_objects_behind_unpublished_site', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'posts'
        AND post_row.status = 'published'
        AND post_row.published_at <= now()
        AND site.is_published IS NOT TRUE
    )::bigint,
    'fully_published_post_objects', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'posts'
        AND post_row.status = 'published'
        AND post_row.published_at <= now()
        AND site.is_published IS TRUE
    )::bigint,
    'magazine_cover_objects', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE AND path.target_kind = 'magazine_issue'
    )::bigint,
    'magazine_cover_objects_without_matching_issue', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'magazine_issue'
        AND media_issue.id IS NULL
    )::bigint,
    'magazine_cover_congregation_mismatch', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'magazine_issue'
        AND media_issue.id IS NOT NULL
        AND path.path_congregation_id <> media_issue.congregation_id
    )::bigint,
    'draft_magazine_cover_objects', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND path.target_kind = 'magazine_issue'
        AND media_issue.is_published IS NOT TRUE
    )::bigint
  ) AS value
  FROM public_site_media_paths path
  LEFT JOIN public.public_sites site
    ON path.valid_path_shape IS TRUE
   AND site.congregation_id = path.path_congregation_id
  LEFT JOIN public.public_posts post_row
    ON path.valid_path_shape IS TRUE
   AND path.target_kind = 'posts'
   AND post_row.congregation_id = path.path_congregation_id
   AND post_row.slug = path.post_slug
  LEFT JOIN public.public_magazine_issues media_issue
    ON path.valid_path_shape IS TRUE
   AND path.target_kind = 'magazine_issue'
   AND media_issue.id = path.path_issue_id
),
public_magazine_paths AS (
  SELECT
    o.id AS object_id,
    o.owner,
    CASE
      WHEN parsed.path_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN parsed.path_parts[1]::uuid
      ELSE NULL
    END AS path_congregation_id,
    CASE
      WHEN parsed.path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN parsed.path_parts[2]::uuid
      ELSE NULL
    END AS path_issue_id,
    (
      cardinality(parsed.path_parts) = 3
      AND parsed.path_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND parsed.path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND COALESCE(parsed.path_parts[3], '') <> ''
    ) AS valid_path_shape
  FROM storage.objects o
  CROSS JOIN LATERAL (
    SELECT string_to_array(o.name, '/') AS path_parts
  ) parsed
  WHERE o.bucket_id = 'public-magazines'
),
public_magazine_correlation AS (
  SELECT jsonb_build_object(
    'bucket_exists', EXISTS (
      SELECT 1 FROM storage.buckets b WHERE b.id = 'public-magazines'
    ),
    'bucket_is_public', (
      SELECT b.public FROM storage.buckets b WHERE b.id = 'public-magazines'
    ),
    'total_objects', count(*)::bigint,
    'objects_without_owner', count(*) FILTER (WHERE path.owner IS NULL)::bigint,
    'invalid_path_shape', count(*) FILTER (
      WHERE path.valid_path_shape IS NOT TRUE
    )::bigint,
    'valid_path_without_matching_issue', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE AND issue.id IS NULL
    )::bigint,
    'path_issue_congregation_mismatch', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND issue.id IS NOT NULL
        AND path.path_congregation_id <> issue.congregation_id
    )::bigint,
    'issue_magazine_congregation_mismatch', count(*) FILTER (
      WHERE issue.id IS NOT NULL
        AND magazine.id IS NOT NULL
        AND issue.congregation_id <> magazine.congregation_id
    )::bigint,
    'draft_issue_objects', count(*) FILTER (
      WHERE issue.id IS NOT NULL AND issue.is_published IS NOT TRUE
    )::bigint,
    'published_issue_objects_without_date', count(*) FILTER (
      WHERE issue.is_published IS TRUE AND issue.published_at IS NULL
    )::bigint,
    'published_issue_objects_behind_unpublished_site', count(*) FILTER (
      WHERE issue.is_published IS TRUE AND site.is_published IS NOT TRUE
    )::bigint,
    'fully_published_issue_objects', count(*) FILTER (
      WHERE issue.is_published IS TRUE AND site.is_published IS TRUE
    )::bigint
  ) AS value
  FROM public_magazine_paths path
  LEFT JOIN public.public_magazine_issues issue
    ON path.valid_path_shape IS TRUE AND issue.id = path.path_issue_id
  LEFT JOIN public.public_magazines magazine ON magazine.id = issue.magazine_id
  LEFT JOIN public.public_sites site ON site.congregation_id = issue.congregation_id
),
access_request_document_references AS (
  SELECT
    ar.document_path,
    count(*)::bigint AS reference_count
  FROM public.access_requests ar
  WHERE NULLIF(btrim(ar.document_path), '') IS NOT NULL
  GROUP BY ar.document_path
),
access_request_document_correlation AS (
  SELECT jsonb_build_object(
    'bucket_exists', EXISTS (
      SELECT 1 FROM storage.buckets b WHERE b.id = 'access-request-docs'
    ),
    'bucket_is_public', (
      SELECT b.public FROM storage.buckets b WHERE b.id = 'access-request-docs'
    ),
    'total_objects', count(o.id)::bigint,
    'objects_without_owner', count(o.id) FILTER (WHERE o.owner IS NULL)::bigint,
    'invalid_path_shape', count(o.id) FILTER (
      WHERE NOT (
        cardinality(string_to_array(o.name, '/')) = 3
        AND split_part(o.name, '/', 1) = 'requests'
        AND split_part(o.name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(o.name, '/', 3) <> ''
      )
    )::bigint,
    'objects_without_request_reference', count(o.id) FILTER (
      WHERE document_ref.document_path IS NULL
    )::bigint,
    'requests_with_document_path', (
      SELECT COALESCE(sum(document_ref2.reference_count), 0)::bigint
      FROM access_request_document_references document_ref2
    ),
    'unique_referenced_paths', (
      SELECT count(*)::bigint FROM access_request_document_references
    ),
    'paths_referenced_by_multiple_requests', (
      SELECT count(*)::bigint
      FROM access_request_document_references document_ref2
      WHERE document_ref2.reference_count > 1
    ),
    'referenced_paths_without_storage_object', (
      SELECT count(*)::bigint
      FROM access_request_document_references document_ref2
      LEFT JOIN storage.objects stored_object
        ON stored_object.bucket_id = 'access-request-docs'
       AND stored_object.name = document_ref2.document_path
      WHERE stored_object.id IS NULL
    ),
    'requests_pointing_to_missing_storage_object', (
      SELECT COALESCE(sum(document_ref2.reference_count), 0)::bigint
      FROM access_request_document_references document_ref2
      LEFT JOIN storage.objects stored_object
        ON stored_object.bucket_id = 'access-request-docs'
       AND stored_object.name = document_ref2.document_path
      WHERE stored_object.id IS NULL
    )
  ) AS value
  FROM storage.objects o
  LEFT JOIN access_request_document_references document_ref
    ON document_ref.document_path = o.name
  WHERE o.bucket_id = 'access-request-docs'
),
avatar_paths_raw AS (
  SELECT
    o.id AS object_id,
    o.owner,
    CASE
      WHEN parsed.path_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN parsed.path_parts[1]::uuid
      ELSE NULL
    END AS path_congregation_id,
    substring(parsed.path_parts[2] FROM '^szemely-([0-9]{1,10})[.]jpg$') AS person_id_text,
    cardinality(parsed.path_parts) AS path_part_count
  FROM storage.objects o
  CROSS JOIN LATERAL (
    SELECT string_to_array(o.name, '/') AS path_parts
  ) parsed
  WHERE o.bucket_id = 'avatars'
),
avatar_paths AS (
  SELECT
    raw_path.object_id,
    raw_path.owner,
    raw_path.path_congregation_id,
    CASE
      WHEN raw_path.person_id_text IS NOT NULL
        AND raw_path.person_id_text::numeric <= 2147483647
        THEN raw_path.person_id_text::integer
      ELSE NULL
    END AS person_id,
    (
      raw_path.path_part_count = 2
      AND raw_path.path_congregation_id IS NOT NULL
      AND raw_path.person_id_text IS NOT NULL
      AND raw_path.person_id_text::numeric <= 2147483647
    ) AS valid_path_shape
  FROM avatar_paths_raw raw_path
),
avatar_correlation AS (
  SELECT jsonb_build_object(
    'bucket_exists', EXISTS (
      SELECT 1 FROM storage.buckets b WHERE b.id = 'avatars'
    ),
    'bucket_is_public', (
      SELECT b.public FROM storage.buckets b WHERE b.id = 'avatars'
    ),
    'total_objects', count(*)::bigint,
    'objects_without_owner', count(*) FILTER (WHERE path.owner IS NULL)::bigint,
    'invalid_path_shape', count(*) FILTER (
      WHERE path.valid_path_shape IS NOT TRUE
    )::bigint,
    'valid_path_without_person', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE AND person_row.id IS NULL
    )::bigint,
    'path_person_congregation_mismatch', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND person_row.id IS NOT NULL
        AND path.path_congregation_id IS DISTINCT FROM person_row.congregation_id
    )::bigint,
    'valid_path_matching_person_and_congregation', count(*) FILTER (
      WHERE path.valid_path_shape IS TRUE
        AND person_row.id IS NOT NULL
        AND path.path_congregation_id = person_row.congregation_id
    )::bigint
  ) AS value
  FROM avatar_paths path
  LEFT JOIN public.szemely person_row
    ON path.valid_path_shape IS TRUE AND person_row.id = path.person_id
)
SELECT jsonb_build_object(
  'api_context', api_context.value,
  'role_security', role_security.value,
  'role_memberships', role_memberships.value,
  'schema_surface', schema_surface.value,
  'default_acl_surface', default_acl_surface.value,
  'public_relation_surface', public_relation_surface.value,
  'column_acl_surface', column_acl_surface.value,
  'public_sequence_surface', public_sequence_surface.value,
  'public_policies', public_policies.value,
  'callable_security_definers', callable_security_definers.value,
  'readable_views', readable_views.value,
  'critical_triggers', critical_triggers.value,
  'authorization_aggregates', authorization_aggregates.value,
  'payment_data_quality', payment_data_quality.value,
  'storage_buckets', storage_buckets.value,
  'storage_policies', storage_policies.value,
  'storage_correlations', jsonb_build_object(
    'public_site_media', public_site_media_correlation.value,
    'public_magazines', public_magazine_correlation.value,
    'access_request_documents', access_request_document_correlation.value,
    'avatars', avatar_correlation.value
  )
) AS p0_security_surface_inventory
FROM api_context
CROSS JOIN role_security
CROSS JOIN role_memberships
CROSS JOIN schema_surface
CROSS JOIN default_acl_surface
CROSS JOIN public_relation_surface
CROSS JOIN column_acl_surface
CROSS JOIN public_sequence_surface
CROSS JOIN public_policies
CROSS JOIN callable_security_definers
CROSS JOIN readable_views
CROSS JOIN critical_triggers
CROSS JOIN authorization_aggregates
CROSS JOIN payment_data_quality
CROSS JOIN storage_buckets
CROSS JOIN storage_policies
CROSS JOIN public_site_media_correlation
CROSS JOIN public_magazine_correlation
CROSS JOIN access_request_document_correlation
CROSS JOIN avatar_correlation;
