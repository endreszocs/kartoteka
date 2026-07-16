-- KARTOTEKA – globális személyazonosság, PII-mentes előellenőrzés
--
-- Csak olvas. Nem hoz létre, nem módosít és nem töröl adatot.
-- Nem ad vissza személynevet, CNP-t, telefonszámot, e-mailt vagy rekordazonosítót;
-- kizárólag katalógusadatokat és összesített darabszámokat jelenít meg.

WITH
relation_names(name) AS (
  VALUES
    ('szemely'),
    ('adrlocality'),
    ('congregations'),
    ('profiles'),
    ('profile_roles'),
    ('cross_congregation_match_notifications')
),
wanted_columns(table_name, column_name) AS (
  VALUES
    ('szemely', 'id'),
    ('szemely', 'congregation_id'),
    ('szemely', 'cnp'),
    ('szemely', 'csaladnev'),
    ('szemely', 'k_nev'),
    ('szemely', 'sz_datum'),
    ('szemely', 'sz_helyid'),
    ('szemely', 'vallas'),
    ('szemely', 'telefon'),
    ('szemely', 'email'),
    ('szemely', 'isvisible'),
    ('szemely', 'id_apja'),
    ('szemely', 'id_anyja'),
    ('szemely', 'family_id'),
    ('szemely', 'person_identity_id'),
    ('adrlocality', 'id'),
    ('adrlocality', 'name'),
    ('congregations', 'id'),
    ('congregations', 'name'),
    ('congregations', 'nev_hu'),
    ('congregations', 'email'),
    ('congregations', 'telefon'),
    ('profiles', 'id'),
    ('profiles', 'congregation_id'),
    ('profiles', 'full_name'),
    ('profiles', 'phone'),
    ('profiles', 'email'),
    ('profiles', 'role'),
    ('profiles', 'status'),
    ('profiles', 'deleted_at'),
    ('profile_roles', 'profile_id'),
    ('profile_roles', 'scope'),
    ('profile_roles', 'scope_id'),
    ('profile_roles', 'role'),
    ('profile_roles', 'approval_status'),
    ('profile_roles', 'active'),
    ('cross_congregation_match_notifications', 'id'),
    ('cross_congregation_match_notifications', 'triggering_szemely_id'),
    ('cross_congregation_match_notifications', 'triggering_congregation_id'),
    ('cross_congregation_match_notifications', 'matched_szemely_id'),
    ('cross_congregation_match_notifications', 'matched_congregation_id'),
    ('cross_congregation_match_notifications', 'confidence'),
    ('cross_congregation_match_notifications', 'resolution'),
    ('cross_congregation_match_notifications', 'resolved_by_triggering_user'),
    ('cross_congregation_match_notifications', 'resolved_by_matched_user'),
    ('cross_congregation_match_notifications', 'resolved_at')
),
visible_members AS MATERIALIZED (
  SELECT
    NULLIF(BTRIM(COALESCE(s.congregation_id::text, '')), '') AS congregation_id,
    NULLIF(
      LOWER(REGEXP_REPLACE(BTRIM(COALESCE(s.csaladnev, '')), '\s+', ' ', 'g')),
      ''
    ) AS family_name,
    NULLIF(
      LOWER(REGEXP_REPLACE(BTRIM(COALESCE(s.k_nev, '')), '\s+', ' ', 'g')),
      ''
    ) AS given_name,
    NULLIF(BTRIM(COALESCE(s.sz_datum::text, '')), '') AS birth_date,
    NULLIF(BTRIM(COALESCE(s.sz_helyid::text, '')), '') AS birth_place_id,
    NULLIF(BTRIM(COALESCE(s.vallas, '')), '') AS religion,
    NULLIF(BTRIM(COALESCE(s.cnp, '')), '') AS identifier
  FROM public.szemely AS s
  WHERE COALESCE(s.isvisible, true)
),
strong_signature_groups AS (
  SELECT
    family_name,
    given_name,
    birth_date,
    birth_place_id,
    COUNT(*) AS records,
    COUNT(DISTINCT congregation_id) AS congregations,
    COUNT(DISTINCT identifier) AS identifiers
  FROM visible_members
  WHERE family_name IS NOT NULL
    AND given_name IS NOT NULL
    AND birth_date IS NOT NULL
    AND birth_place_id IS NOT NULL
  GROUP BY family_name, given_name, birth_date, birth_place_id
),
same_congregation_signature_groups AS (
  SELECT congregation_id, family_name, given_name, birth_date, birth_place_id
  FROM visible_members
  WHERE congregation_id IS NOT NULL
    AND family_name IS NOT NULL
    AND given_name IS NOT NULL
    AND birth_date IS NOT NULL
    AND birth_place_id IS NOT NULL
  GROUP BY congregation_id, family_name, given_name, birth_date, birth_place_id
  HAVING COUNT(*) > 1
),
identifier_groups AS (
  SELECT
    identifier,
    COUNT(*) AS records,
    COUNT(DISTINCT congregation_id) AS congregations
  FROM visible_members
  WHERE identifier IS NOT NULL
  GROUP BY identifier
),
same_congregation_identifier_groups AS (
  SELECT congregation_id, identifier
  FROM visible_members
  WHERE congregation_id IS NOT NULL AND identifier IS NOT NULL
  GROUP BY congregation_id, identifier
  HAVING COUNT(*) > 1
),
report AS (
  SELECT
    10 AS sort_order,
    'schema'::text AS section,
    'required_relations'::text AS metric,
    (
      SELECT jsonb_object_agg(
        r.name,
        to_regclass(format('public.%I', r.name)) IS NOT NULL
        ORDER BY r.name
      )
      FROM relation_names AS r
    ) AS value

  UNION ALL

  SELECT
    20,
    'schema',
    'identity_named_relations',
    (
      SELECT COALESCE(jsonb_agg(t.table_name ORDER BY t.table_name), '[]'::jsonb)
      FROM information_schema.tables AS t
      WHERE t.table_schema = 'public'
        AND (
          t.table_name ILIKE '%identity%'
          OR t.table_name ILIKE '%cross_congregation%'
          OR t.table_name ILIKE '%person_link%'
        )
    )

  UNION ALL

  SELECT
    30,
    'schema',
    'relevant_columns',
    (
      SELECT jsonb_object_agg(
        format('%I.%I', w.table_name, w.column_name),
        jsonb_build_object(
          'exists', c.column_name IS NOT NULL,
          'type', c.data_type,
          'udt', c.udt_name,
          'nullable', CASE WHEN c.column_name IS NULL THEN NULL ELSE c.is_nullable = 'YES' END
        )
        ORDER BY w.table_name, w.column_name
      )
      FROM wanted_columns AS w
      LEFT JOIN information_schema.columns AS c
        ON c.table_schema = 'public'
       AND c.table_name = w.table_name
       AND c.column_name = w.column_name
    )

  UNION ALL

  SELECT
    40,
    'database_security',
    'matching_functions',
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name', p.proname,
            'arguments', pg_get_function_identity_arguments(p.oid),
            'result', pg_get_function_result(p.oid),
            'security_definer', p.prosecdef,
            'anon_can_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
            'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
            'configuration_present', p.proconfig IS NOT NULL,
            'search_path_configured', EXISTS (
              SELECT 1
              FROM unnest(p.proconfig) AS config(value)
              WHERE config.value LIKE 'search_path=%'
            ),
            'configuration_hash', CASE
              WHEN p.proconfig IS NULL THEN NULL
              ELSE md5(array_to_string(p.proconfig, ','))
            END
          )
          ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
        ),
        '[]'::jsonb
      )
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (
          p.proname IN (
            'normalize_name',
            'normalize_phone',
            'generate_egyhazi_cnp',
            'find_potential_cross_congregation_match',
            'tg_szemely_check_cross_congregation',
            'resolve_cross_congregation_match'
          )
          OR p.proname ILIKE '%identity%'
          OR p.proname ILIKE '%cross_congregation%'
        )
    )

  UNION ALL

  SELECT
    50,
    'database_security',
    'matching_triggers',
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name', t.tgname,
            'enabled', t.tgenabled,
            'function', fp.proname,
            'definition_hash', md5(pg_get_triggerdef(t.oid, true))
          )
          ORDER BY t.tgname
        ),
        '[]'::jsonb
      )
      FROM pg_trigger AS t
      JOIN pg_proc AS fp ON fp.oid = t.tgfoid
      WHERE t.tgrelid = to_regclass('public.szemely') AND NOT t.tgisinternal
    )

  UNION ALL

  SELECT
    60,
    'database_security',
    'rls_and_policies',
    jsonb_build_object(
      'tables', (
        SELECT COALESCE(
          jsonb_object_agg(
            c.relname,
            jsonb_build_object('rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity)
            ORDER BY c.relname
          ),
          '{}'::jsonb
        )
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relname IN (SELECT name FROM relation_names)
      ),
      'policies', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'table', pol.tablename,
              'name', pol.policyname,
              'command', pol.cmd,
              'roles', to_jsonb(pol.roles),
              'using_present', pol.qual IS NOT NULL,
              'with_check_present', pol.with_check IS NOT NULL,
              'using_hash', CASE WHEN pol.qual IS NULL THEN NULL ELSE md5(pol.qual) END,
              'with_check_hash', CASE WHEN pol.with_check IS NULL THEN NULL ELSE md5(pol.with_check) END
            )
            ORDER BY pol.tablename, pol.policyname
          ),
          '[]'::jsonb
        )
        FROM pg_policies AS pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename IN ('szemely', 'cross_congregation_match_notifications')
      )
    )

  UNION ALL

  SELECT
    70,
    'schema',
    'identity_indexes_and_constraints',
    jsonb_build_object(
      'indexes', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('name', i.indexname, 'definition_hash', md5(i.indexdef))
            ORDER BY i.indexname
          ),
          '[]'::jsonb
        )
        FROM pg_indexes AS i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'szemely'
          AND (
            i.indexdef ILIKE '%cnp%'
            OR i.indexdef ILIKE '%csaladnev%'
            OR i.indexdef ILIKE '%k_nev%'
            OR i.indexdef ILIKE '%sz_datum%'
            OR i.indexdef ILIKE '%sz_helyid%'
            OR i.indexdef ILIKE '%telefon%'
            OR i.indexname ILIKE '%identity%'
          )
      ),
      'constraints', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'name', con.conname,
              'type', con.contype,
              'definition_hash', md5(pg_get_constraintdef(con.oid, true))
            )
            ORDER BY con.conname
          ),
          '[]'::jsonb
        )
        FROM pg_constraint AS con
        WHERE con.conrelid = to_regclass('public.szemely')
          AND con.contype IN ('p', 'u', 'f', 'c')
      )
    )

  UNION ALL

  SELECT
    80,
    'data_aggregate',
    'identity_completeness',
    (
      SELECT jsonb_build_object(
        'visible_people', COUNT(*),
        'represented_congregations', COUNT(DISTINCT congregation_id),
        'missing_any_name_part', COUNT(*) FILTER (WHERE family_name IS NULL OR given_name IS NULL),
        'missing_birth_date', COUNT(*) FILTER (WHERE birth_date IS NULL),
        'missing_birth_place', COUNT(*) FILTER (WHERE birth_place_id IS NULL),
        'missing_religion', COUNT(*) FILTER (WHERE religion IS NULL),
        'complete_required_identity', COUNT(*) FILTER (
          WHERE family_name IS NOT NULL
            AND given_name IS NOT NULL
            AND birth_date IS NOT NULL
            AND birth_place_id IS NOT NULL
            AND religion IS NOT NULL
        ),
        'identifier_present', COUNT(*) FILTER (WHERE identifier IS NOT NULL),
        'identifier_ec_generated', COUNT(*) FILTER (WHERE identifier LIKE 'EC-%'),
        'identifier_999_generated', COUNT(*) FILTER (WHERE identifier LIKE '999%'),
        'identifier_other', COUNT(*) FILTER (
          WHERE identifier IS NOT NULL
            AND identifier NOT LIKE 'EC-%'
            AND identifier NOT LIKE '999%'
        )
      )
      FROM visible_members
    )

  UNION ALL

  SELECT
    90,
    'data_aggregate',
    'possible_identity_collisions',
    jsonb_build_object(
      'signature_definition', 'family name + given name + birth date + birth place id',
      'normalization', 'lowercase + trim + whitespace collapse; conservative, no unaccent',
      'cross_congregation_signature_groups', (
        SELECT COUNT(*) FROM strong_signature_groups WHERE congregations > 1
      ),
      'records_in_cross_congregation_signature_groups', (
        SELECT COALESCE(SUM(records), 0) FROM strong_signature_groups WHERE congregations > 1
      ),
      'cross_congregation_groups_with_multiple_identifiers', (
        SELECT COUNT(*)
        FROM strong_signature_groups
        WHERE congregations > 1 AND identifiers > 1
      ),
      'same_congregation_signature_duplicate_groups', (
        SELECT COUNT(*) FROM same_congregation_signature_groups
      ),
      'identifier_shared_across_congregations_groups', (
        SELECT COUNT(*) FROM identifier_groups WHERE congregations > 1
      ),
      'records_with_identifier_shared_across_congregations', (
        SELECT COALESCE(SUM(records), 0) FROM identifier_groups WHERE congregations > 1
      ),
      'same_congregation_identifier_duplicate_groups', (
        SELECT COUNT(*) FROM same_congregation_identifier_groups
      )
    )
)
SELECT section, metric, value
FROM report
ORDER BY sort_order;
