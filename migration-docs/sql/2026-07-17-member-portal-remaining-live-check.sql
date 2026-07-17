-- ============================================================================
-- KARTOTEKA -- tagi portal: meg hianyzo live adatok, EGY JSON eredmenyben
-- Datum: 2026-07-17
--
-- CSAK OLVASO: nem modosit adatot, semat, RLS-t, grantet vagy Auth beallitast.
-- A Supabase SQL Editorban egyben futtathato. Az egyetlen eredmenycellat masold
-- vissza teljes egeszeben; szemelyes rekordadatot nem olvas. A JSON function
-- definiciot es role configot is tartalmazhat: az esetleges hardcoded kulcs/token
-- literal ERTEKET visszakuldes elott csereld REDACTED szovegre, de a kulcs neve
-- es a definicio tobbi resze maradjon meg az audithoz.
-- ============================================================================

WITH
live_constraints AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.table_name,
                                                     row_data.constraint_type,
                                                     row_data.constraint_name), '[]'::jsonb) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      pg_get_constraintdef(con.oid, true) AS definition,
      con.convalidated AS is_validated
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'profiles',
        'profile_roles',
        'congregations',
        'szemely',
        'befizetes',
        'haztartas',
        'haztartas_tag',
        'szemely_kapcsolat',
        'public_site_themes',
        'public_sites',
        'public_posts',
        'public_magazines',
        'public_magazine_issues'
      )
  ) row_data
),
live_functions AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.function_name,
                                                     row_data.identity_arguments), '[]'::jsonb) AS value
  FROM (
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_userbyid(p.proowner) AS owner_name,
      p.prosecdef AS security_definer,
      p.provolatile AS volatility,
      p.proconfig AS function_config,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user',
        'current_user_can_access_congregation',
        'current_user_can_edit_congregation',
        'current_user_has_global_access',
        'current_user_congregation_id'
      )
  ) row_data
),
auth_triggers AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.trigger_name,
                                                     row_data.event_manipulation), '[]'::jsonb) AS value
  FROM (
    SELECT
      event_object_schema AS schema_name,
      event_object_table AS table_name,
      trigger_name,
      action_timing,
      event_manipulation,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
  ) row_data
),
profile_table_grants AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.grantee,
                                                     row_data.privilege_type), '[]'::jsonb) AS value
  FROM (
    SELECT grantee, privilege_type, is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND grantee IN ('anon', 'authenticated')
  ) row_data
),
profile_column_grants AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.grantee,
                                                     row_data.column_name,
                                                     row_data.privilege_type), '[]'::jsonb) AS value
  FROM (
    SELECT grantee, column_name, privilege_type, is_grantable
    FROM information_schema.role_column_grants
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND grantee IN ('anon', 'authenticated')
  ) row_data
),
tenant_integrity AS (
  SELECT to_jsonb(row_data) AS value
  FROM (
    SELECT
      (SELECT count(*) FROM public.szemely WHERE congregation_id IS NULL)
        AS szemely_missing_congregation,
      (SELECT count(*) FROM public.befizetes WHERE congregation_id IS NULL)
        AS befizetes_missing_congregation,
      (SELECT count(*) FROM public.befizetes WHERE id_szemely IS NULL)
        AS befizetes_missing_person,
      (
        SELECT count(*)
        FROM public.befizetes b
        LEFT JOIN public.szemely s ON s.id = b.id_szemely
        WHERE b.id_szemely IS NOT NULL AND s.id IS NULL
      ) AS befizetes_orphan_person,
      (
        SELECT count(*)
        FROM public.befizetes b
        JOIN public.szemely s ON s.id = b.id_szemely
        WHERE b.congregation_id IS DISTINCT FROM s.congregation_id
      ) AS befizetes_cross_tenant_person,
      (
        SELECT count(*)
        FROM public.haztartas_tag ht
        JOIN public.haztartas h ON h.id = ht.id_haztartas
        WHERE ht.congregation_id IS DISTINCT FROM h.congregation_id
      ) AS household_membership_cross_tenant_household,
      (
        SELECT count(*)
        FROM public.haztartas_tag ht
        JOIN public.szemely s ON s.id = ht.id_szemely
        WHERE ht.congregation_id IS DISTINCT FROM s.congregation_id
      ) AS household_membership_cross_tenant_person,
      (
        SELECT count(*)
        FROM public.szemely_kapcsolat sk
        JOIN public.szemely s1 ON s1.id = sk.id_szemely_1
        JOIN public.szemely s2 ON s2.id = sk.id_szemely_2
        WHERE sk.congregation_id IS DISTINCT FROM s1.congregation_id
           OR sk.congregation_id IS DISTINCT FROM s2.congregation_id
      ) AS relationship_cross_tenant_person,
      (
        SELECT count(*)
        FROM (
          SELECT congregation_id
          FROM public.public_magazines
          GROUP BY congregation_id
          HAVING count(*) > 1
        ) duplicate_magazines
      ) AS congregations_with_multiple_magazines,
      (
        SELECT count(*)
        FROM public.public_magazine_issues pmi
        JOIN public.public_magazines pm ON pm.id = pmi.magazine_id
        WHERE pmi.congregation_id IS DISTINCT FROM pm.congregation_id
      ) AS cross_tenant_magazine_issues
  ) row_data
),
auth_profile_counts AS (
  SELECT to_jsonb(row_data) AS value
  FROM (
    SELECT
      (SELECT count(*) FROM auth.users) AS auth_user_count,
      (SELECT count(*) FROM public.profiles) AS staff_profile_count,
      (
        SELECT count(*)
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        WHERE p.id IS NULL
      ) AS auth_users_without_profile,
      (
        SELECT count(*)
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE u.id IS NULL
      ) AS profiles_without_auth_user
  ) row_data
)
SELECT jsonb_build_object(
  'constraints', live_constraints.value,
  'functions', live_functions.value,
  'auth_triggers', auth_triggers.value,
  'profile_table_grants', profile_table_grants.value,
  'profile_column_grants', profile_column_grants.value,
  'tenant_integrity', tenant_integrity.value,
  'auth_profile_counts', auth_profile_counts.value
) AS member_portal_remaining_live_check
FROM live_constraints
CROSS JOIN live_functions
CROSS JOIN auth_triggers
CROSS JOIN profile_table_grants
CROSS JOIN profile_column_grants
CROSS JOIN tenant_integrity
CROSS JOIN auth_profile_counts;
