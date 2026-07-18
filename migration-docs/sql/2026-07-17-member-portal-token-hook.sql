-- ============================================================================
-- KARTOTEKA — Supabase Custom Access Token Hook szerepkör-izoláció
-- Dátum: 2026-07-17
-- Állapot: REVIEW-DRAFT — csak a role-foundation + member-core + P0 után
-- ============================================================================
--
-- FUTTATÁSI SORREND
--   1. 2026-07-17-member-portal-role-foundation.sql
--   2. 2026-07-17-member-portal-core.sql
--   3. 2026-07-17-member-portal-legacy-workflow-compat.sql
--   4. 2026-07-17-member-portal-p0-auth-isolation.sql
--   5. EZ A FÁJL
--   6. Supabase Dashboard > Authentication > Hooks alatt a
--      public.custom_access_token_hook engedélyezésének ellenőrzése.
--   7. Kötelező kijelentkezés/belépés és valódi token-próba.
--
-- A P0 cutover szándékosan megelőzi a hook cseréjét: így a régi
-- `authenticated` pending tokenek profil-öneszkalációs rése előbb zárul.
-- A két lépés közötti rövid maintenance ablakban a staff RPC-k nem
-- érhetők el; ez biztonságos, fail-closed szolgáltatáscsökkenés.
--
-- Ez a migráció még NEM módosítja a handle_new_user() triggert és nem
-- nyitja meg a tagi signupot. Az élő, szerveroldali adatbázisállapotból írja
-- felül a JWT kötelező role claimjét:
--   * app_staff_user: aktív, nem törölt/anonimizált profil + a legacy
--     role/tenant mezőkkel pontosan egyező aktív, approved assignment;
--   * member_portal_user: külön tagi account (staff precedence mellett);
--   * app_pending_user: minden más Auth user, fail-closed alapértelmezés.
--
-- raw_user_meta_data/user_metadata sem szerepkör-, sem tenant-döntéshez nem
-- használható. A hook kizárólag supabase_auth_admin számára hívható.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'kartoteka:schema-migration',
    0
  )
);

DO $preflight$
DECLARE
  v_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Token hook: csak postgres SQL Editor szereppel futtatható; current_user=%',
      current_user;
  END IF;

  FOREACH v_role IN ARRAY ARRAY[
    'authenticator',
    'authenticated',
    'app_staff_user',
    'app_pending_user',
    'member_portal_user',
    'supabase_auth_admin'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = v_role
    ) THEN
      RAISE EXCEPTION 'Token hook: hiányzó role: %', v_role;
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.profile_roles') IS NULL
     OR pg_catalog.to_regclass('public.member_accounts') IS NULL
     OR pg_catalog.to_regclass('public.districts') IS NULL
     OR pg_catalog.to_regclass('public.dioceses') IS NULL
     OR pg_catalog.to_regclass('public.congregations') IS NULL THEN
    RAISE EXCEPTION 'Token hook: hiányzik egy kötelező profil-, tagi- vagy scope-tábla.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'authenticator'
      AND r.rolcanlogin
      AND NOT r.rolinherit
      AND NOT r.rolsuper
      AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole
      AND NOT r.rolreplication
      AND NOT r.rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Token hook: az authenticator biztonsági attribútumai eltérnek.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    WHERE member_role.rolname = 'authenticator'
      AND granted.rolname IN (
        'app_staff_user', 'app_pending_user', 'member_portal_user'
      )
      AND NOT m.admin_option
  ) <> 3
  OR NOT pg_catalog.pg_has_role(
    'app_staff_user', 'authenticated', 'MEMBER'
  )
  OR pg_catalog.pg_has_role(
    'app_pending_user', 'authenticated', 'MEMBER'
  )
  OR pg_catalog.pg_has_role(
    'member_portal_user', 'authenticated', 'MEMBER'
  ) THEN
    RAISE EXCEPTION 'Token hook: a custom JWT role membership-gráf eltér.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'pg_catalog.pg_auth_members'::regclass
      AND a.attname = 'set_option'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
        JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
        WHERE member_role.rolname = 'authenticator'
          AND granted.rolname IN (
            'app_staff_user', 'app_pending_user', 'member_portal_user'
          )
          AND NOT m.set_option
      )
    $sql$
    INTO v_role;

    IF v_role::boolean THEN
      RAISE EXCEPTION 'Token hook: az authenticator SET ROLE opciója hiányzik.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE COALESCE(pg_catalog.btrim(p.status), '')
      NOT IN ('active', 'pending', 'approved', 'rejected', 'deleted')
  ) THEN
    RAISE EXCEPTION 'Token hook: ismeretlen profiles.status található.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = p.id
          AND pr.active
          AND pr.approval_status = 'approved'
          AND (
            (
              p.role = 'admin'
              AND pr.role = 'admin'
              AND pr.scope = 'system'
              AND pr.scope_id IS NULL
            )
            OR (
              p.role = 'egyhazkeruleti_admin'
              AND pr.role = p.role
              AND pr.scope = 'district'
              AND pr.scope_id = p.district_id
            )
            OR (
              p.role IN (
                'egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo'
              )
              AND pr.role = p.role
              AND pr.scope = 'diocese'
              AND pr.scope_id = p.diocese_id
            )
            OR (
              p.role IN ('lelkesz', 'konyvelo')
              AND pr.role = p.role
              AND pr.scope = 'congregation'
              AND pr.scope_id = p.congregation_id
            )
          )
      )
  ) THEN
    RAISE EXCEPTION 'Token hook: aktív profil approved/active assignment nélkül; cutover tiltva.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active
       AND pr.approval_status = 'approved'
       AND pr.role = 'admin'
       AND pr.scope = 'system'
       AND pr.scope_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Token hook: nincs legalább egy aktív system admin.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.custom_access_token_hook(jsonb)'
     ) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE p.oid = 'public.custom_access_token_hook(jsonb)'::regprocedure
         AND n.nspname = 'public'
         AND p.prosecdef
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
     ) THEN
    RAISE EXCEPTION 'Token hook: a meglévő hook owner/security módja eltér.';
  END IF;
END
$preflight$;

-- A Supabase Auth hook futtató szerepének a függvény EXECUTE joga mellett
-- explicit schema USAGE is kell. Nem hagyatkozunk a PUBLIC öröklésre.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $hook$
DECLARE
  v_user_id uuid;
  v_claims jsonb;
  v_db_role text := 'app_pending_user';
  v_portal_kind text := 'pending';
  v_is_staff boolean := false;
  v_is_member boolean := false;
BEGIN
  IF pg_catalog.jsonb_typeof(event) <> 'object' THEN
    RAISE EXCEPTION 'A token-hook event csak JSON object lehet.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_user_id := NULLIF(event ->> 'user_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'A token-hook user_id nem érvényes UUID.'
      USING ERRCODE = '22023';
  END;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'A token-hook event user_id mezője kötelező.'
      USING ERRCODE = '22023';
  END IF;

  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_claims) <> 'object' THEN
    RAISE EXCEPTION 'A token-hook claims mező csak JSON object lehet.'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = p.id
          AND pr.active
          AND pr.approval_status = 'approved'
          AND (
            (
              p.role = 'admin'
              AND pr.role = 'admin'
              AND pr.scope = 'system'
              AND pr.scope_id IS NULL
            )
            OR (
              p.role = 'egyhazkeruleti_admin'
              AND pr.role = p.role
              AND pr.scope = 'district'
              AND pr.scope_id = p.district_id
            )
            OR (
              p.role IN (
                'egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo'
              )
              AND pr.role = p.role
              AND pr.scope = 'diocese'
              AND pr.scope_id = p.diocese_id
            )
            OR (
              p.role IN ('lelkesz', 'konyvelo')
              AND pr.role = p.role
              AND pr.scope = 'congregation'
              AND pr.scope_id = p.congregation_id
            )
          )
      )
  ) INTO v_is_staff;

  SELECT EXISTS (
    SELECT 1
    FROM public.member_accounts ma
    WHERE ma.auth_user_id = v_user_id
      AND ma.status <> 'deleted'
  ) INTO v_is_member;

  IF v_is_staff THEN
    v_db_role := 'app_staff_user';
    v_portal_kind := 'staff';
  ELSIF v_is_member THEN
    v_db_role := 'member_portal_user';
    v_portal_kind := 'member';
  END IF;

  -- Korábbi/stale authorization claim nem maradhat a tokenben.
  v_claims := v_claims - ARRAY[
    'role',
    'approved',
    'portal_kind',
    'profile_status',
    'profile_role',
    'congregation_id',
    'member_account_status'
  ]::text[];

  v_claims := v_claims || pg_catalog.jsonb_build_object(
    'role', v_db_role,
    'approved', v_is_staff,
    'portal_kind', v_portal_kind
  );

  RETURN pg_catalog.jsonb_set(event, '{claims}', v_claims, true);
END;
$hook$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'KARTOTEKA P0 token hook v2: trusted DB state alapján app_staff_user / member_portal_user / app_pending_user role claim; metadata authorization nincs.';

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

DO $postflight$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = 'public.custom_access_token_hook(jsonb)'::regprocedure
      AND n.nspname = 'public'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          COALESCE(p.proconfig, ARRAY[]::text[])
        ) cfg
        WHERE cfg IN ('search_path=', 'search_path=""')
      )
      AND p.prosrc LIKE '%p.role = ''admin''%'
      AND p.prosrc LIKE '%pr.role = ''admin''%'
      AND p.prosrc LIKE '%p.role = ''egyhazkeruleti_admin''%'
      AND p.prosrc LIKE '%pr.role = p.role%'
      AND p.prosrc LIKE '%pr.scope_id = p.district_id%'
      AND p.prosrc LIKE '%pr.scope_id = p.diocese_id%'
      AND p.prosrc LIKE '%pr.scope_id = p.congregation_id%'
      AND p.prosrc NOT LIKE '%pr.role = ''custom''%'
      AND p.prosrc NOT LIKE '%public.districts%'
      AND p.prosrc NOT LIKE '%public.dioceses%'
      AND p.prosrc NOT LIKE '%public.congregations%'
  ) THEN
    RAISE EXCEPTION 'Token hook postflight: owner/security/search_path eltér.';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'supabase_auth_admin',
       'public.custom_access_token_hook(jsonb)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_schema_privilege(
       'supabase_auth_admin', 'public', 'USAGE'
     )
     OR pg_catalog.has_function_privilege(
       'anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'app_staff_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'app_pending_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'member_portal_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Token hook postflight: EXECUTE ACL eltér.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE p.oid = 'public.custom_access_token_hook(jsonb)'::regprocedure
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
      AND NOT (
        grantee.rolname IS NOT DISTINCT FROM 'supabase_auth_admin'
        AND NOT acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'Token hook postflight: váratlan közvetlen EXECUTE grantee maradt.';
  END IF;

  SELECT p.id
    INTO v_user_id
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = p.id
          AND pr.active
          AND pr.approval_status = 'approved'
          AND (
            (
              p.role = 'admin'
              AND pr.role = 'admin'
              AND pr.scope = 'system'
              AND pr.scope_id IS NULL
            )
            OR (
              p.role = 'egyhazkeruleti_admin'
              AND pr.role = p.role
              AND pr.scope = 'district'
              AND pr.scope_id = p.district_id
            )
            OR (
              p.role IN (
                'egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo'
              )
              AND pr.role = p.role
              AND pr.scope = 'diocese'
              AND pr.scope_id = p.diocese_id
            )
            OR (
              p.role IN ('lelkesz', 'konyvelo')
              AND pr.role = p.role
              AND pr.scope = 'congregation'
              AND pr.scope_id = p.congregation_id
            )
          )
      )
    ORDER BY p.id
    LIMIT 1;

  v_result := public.custom_access_token_hook(
    pg_catalog.jsonb_build_object(
      'user_id', v_user_id::text,
      'claims', pg_catalog.jsonb_build_object('role', 'authenticated')
    )
  );

  IF v_result #>> '{claims,role}' <> 'app_staff_user'
     OR v_result #>> '{claims,portal_kind}' <> 'staff'
     OR v_result #>> '{claims,approved}' <> 'true' THEN
    RAISE EXCEPTION 'Token hook postflight: aktív staff role-próba hibás: %', v_result;
  END IF;

  v_result := public.custom_access_token_hook(
    pg_catalog.jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-000000000000',
      'claims', pg_catalog.jsonb_build_object('role', 'authenticated')
    )
  );

  IF v_result #>> '{claims,role}' <> 'app_pending_user'
     OR v_result #>> '{claims,portal_kind}' <> 'pending'
     OR v_result #>> '{claims,approved}' <> 'false' THEN
    RAISE EXCEPTION 'Token hook postflight: ismeretlen user fail-closed próba hibás: %', v_result;
  END IF;
END
$postflight$;

COMMIT;

SELECT pg_catalog.jsonb_build_object(
  'migration', '2026-07-17-member-portal-token-hook',
  'hook_signature', 'public.custom_access_token_hook(jsonb)',
  'supabase_auth_admin_execute', pg_catalog.has_function_privilege(
    'supabase_auth_admin',
    'public.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ),
  'supabase_auth_admin_schema_usage', pg_catalog.has_schema_privilege(
    'supabase_auth_admin', 'public', 'USAGE'
  ),
  'client_execute_count', (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.unnest(ARRAY[
      'anon',
      'authenticated',
      'service_role',
      'app_staff_user',
      'app_pending_user',
      'member_portal_user'
    ]::text[]) role_name
    WHERE pg_catalog.has_function_privilege(
      role_name,
      'public.custom_access_token_hook(jsonb)',
      'EXECUTE'
    )
  ),
  'expected_staff_tokens', (
    SELECT pg_catalog.count(DISTINCT p.id)
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active
      AND pr.approval_status = 'approved'
      AND (
        (
          p.role = 'admin'
          AND pr.role = 'admin'
          AND pr.scope = 'system'
          AND pr.scope_id IS NULL
        )
        OR (
          p.role = 'egyhazkeruleti_admin'
          AND pr.role = p.role
          AND pr.scope = 'district'
          AND pr.scope_id = p.district_id
        )
        OR (
          p.role IN (
            'egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo'
          )
          AND pr.role = p.role
          AND pr.scope = 'diocese'
          AND pr.scope_id = p.diocese_id
        )
        OR (
          p.role IN ('lelkesz', 'konyvelo')
          AND pr.role = p.role
          AND pr.scope = 'congregation'
          AND pr.scope_id = p.congregation_id
        )
      )
  ),
  'expected_member_tokens', (
    SELECT pg_catalog.count(*)
    FROM public.member_accounts ma
    WHERE ma.status <> 'deleted'
  )
) AS member_portal_token_hook_verification;
