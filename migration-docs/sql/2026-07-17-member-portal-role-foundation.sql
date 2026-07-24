-- ============================================================================
-- KARTOTEKA — tagi portál P0 szerepkör-alapozás (nem breaking)
-- Dátum: 2026-07-17
-- Állapot: REVIEW-DRAFT — csak jóváhagyás után futtatható
-- ============================================================================
--
-- Cél:
--   * három, egymástól elkülönített JWT/Postgres role létrehozása;
--   * public schema CREATE jog lezárása;
--   * a postgres owner JÖVŐBELI public tábla/szekvencia/függvény default
--     ACL-jének deny-by-default beállítása.
--
-- Ez a fájl nem vált JWT role-t, nem módosít meglévő tábla-, RLS-,
-- függvény- vagy Storage-jogot, ezért a jelenlegi alkalmazás működését nem
-- vághatja el. A következő migrációk explicit grantokat adnak az új
-- objektumokra.
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
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Role foundation: csak postgres SQL Editor szereppel futtatható; current_user=%',
      current_user;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role'
     ) THEN
    RAISE EXCEPTION 'Role foundation: hiányzik egy kötelező Supabase role.';
  END IF;

  IF pg_catalog.to_regnamespace('public') IS NULL THEN
    RAISE EXCEPTION 'Role foundation: hiányzik a public schema.';
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
    RAISE EXCEPTION 'Role foundation: az authenticator biztonsági attribútumai eltérnek.';
  END IF;
END
$preflight$;

DO $create_roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_staff_user'
  ) THEN
    CREATE ROLE app_staff_user
      NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_pending_user'
  ) THEN
    CREATE ROLE app_pending_user
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'member_portal_user'
  ) THEN
    CREATE ROLE member_portal_user
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;
END
$create_roles$;

DO $role_attribute_assert$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'app_staff_user',
    'app_pending_user',
    'member_portal_user'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = v_role
        AND NOT r.rolcanlogin
        AND NOT r.rolsuper
        AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole
        AND NOT r.rolreplication
        AND NOT r.rolbypassrls
    ) THEN
      RAISE EXCEPTION 'Role foundation: nem biztonságos role-attribútumok: %', v_role;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'app_staff_user' AND rolinherit
  )
  OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('app_pending_user', 'member_portal_user') AND rolinherit
  ) THEN
    RAISE EXCEPTION 'Role foundation: a custom role INHERIT modell eltér.';
  END IF;
END
$role_attribute_assert$;

-- Meglévő custom role esetén nem javítunk csendben tagsági driftet. A
-- staff egyetlen megengedett parent role-ja az authenticated; a két izolált
-- role-nak nincs parentje. A custom role-ok futási tagja az authenticator;
-- PostgreSQL 16+-on emellett megmarad a nem-superuser CREATEROLE létrehozó
-- (`postgres`) automatikus admin-only bootstrap edge-e. Az authenticated maga
-- sem lehet más role tagja.
DO $membership_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles child ON child.oid = m.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
    WHERE child.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
      AND (
        NOT (
          child.rolname = 'app_staff_user'
          AND parent.rolname = 'authenticated'
        )
        OR m.admin_option
      )
  ) THEN
    RAISE EXCEPTION 'Role foundation: váratlan custom-role parent membership.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    WHERE granted.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
      AND NOT (
        (
          member_role.rolname = 'authenticator'
          AND NOT m.admin_option
        )
        OR (
          pg_catalog.current_setting('server_version_num')::integer >= 160000
          AND member_role.rolname = 'postgres'
          AND m.admin_option
        )
      )
  ) THEN
    RAISE EXCEPTION 'Role foundation: váratlan tag kapott custom role-t.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles child ON child.oid = m.member
    WHERE child.rolname = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'Role foundation: az authenticated váratlan parent role tagja.';
  END IF;
END
$membership_preflight$;

-- A staff visszafelé kompatibilisen örökli a legacy authenticated grantokat
-- és policy-ket. A pending és member role soha nem kap ilyen tagságot.
GRANT authenticated TO app_staff_user;
REVOKE authenticated FROM app_pending_user, member_portal_user;

-- A PostgREST authenticator csak tagság birtokában tud SET ROLE-t végezni a
-- JWT kötelező role claimje alapján.
GRANT app_staff_user, app_pending_user, member_portal_user TO authenticator;

-- Kliensrole nem hozhat létre objektumot az exponált public sémában.
REVOKE CREATE ON SCHEMA public
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

GRANT USAGE ON SCHEMA public
  TO anon, authenticated, service_role,
     app_staff_user, app_pending_user, member_portal_user;

-- Jövőbeli postgres-owned public objektumok: explicit allowlist nélkül
-- sem kliens-, sem service_role-hozzáférés nincs. A backend minden új
-- objektumhoz külön, felülvizsgált grantot kap.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

DO $postflight$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'app_staff_user',
    'app_pending_user',
    'member_portal_user'
  ]::text[]
  LOOP
    IF pg_catalog.has_schema_privilege(v_role, 'public', 'CREATE') THEN
      RAISE EXCEPTION 'Role foundation: public CREATE jog maradt: %', v_role;
    END IF;
  END LOOP;

  IF NOT pg_catalog.pg_has_role(
       'authenticator', 'app_staff_user', 'MEMBER'
     )
     OR NOT pg_catalog.pg_has_role(
       'authenticator', 'app_pending_user', 'MEMBER'
     )
     OR NOT pg_catalog.pg_has_role(
       'authenticator', 'member_portal_user', 'MEMBER'
     )
     OR NOT pg_catalog.pg_has_role(
       'app_staff_user', 'authenticated', 'MEMBER'
     )
     OR pg_catalog.pg_has_role(
       'app_pending_user', 'authenticated', 'MEMBER'
     )
     OR pg_catalog.pg_has_role(
       'member_portal_user', 'authenticated', 'MEMBER'
     ) THEN
    RAISE EXCEPTION 'Role foundation: custom role membership drift.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles child ON child.oid = m.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
    WHERE child.rolname = 'app_staff_user'
      AND parent.rolname = 'authenticated'
  ) <> 1
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles child ON child.oid = m.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
    WHERE child.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
      AND NOT (
        child.rolname = 'app_staff_user'
        AND parent.rolname = 'authenticated'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    WHERE granted.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
      AND NOT (
        member_role.rolname = 'authenticator'
        OR (
          pg_catalog.current_setting('server_version_num')::integer >= 160000
          AND member_role.rolname = 'postgres'
          AND m.admin_option
        )
      )
  )
  OR (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    WHERE granted.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
      AND member_role.rolname = 'authenticator'
  ) <> 3 THEN
    RAISE EXCEPTION 'Role foundation: a közvetlen custom role membership-gráf eltér.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    WHERE (
      granted.rolname IN (
        'app_staff_user', 'app_pending_user', 'member_portal_user'
      )
      OR member_role.rolname IN (
        'app_staff_user', 'app_pending_user', 'member_portal_user'
      )
    )
      AND m.admin_option
      AND NOT (
        pg_catalog.current_setting('server_version_num')::integer >= 160000
        AND granted.rolname IN (
          'app_staff_user', 'app_pending_user', 'member_portal_user'
        )
        AND member_role.rolname = 'postgres'
      )
  ) THEN
    RAISE EXCEPTION 'Role foundation: custom role membershipen ADMIN OPTION maradt.';
  END IF;

  -- Direct edges are not enough: no other non-superuser role may become an
  -- indirect member of a custom JWT role through authenticator membership.
  -- A live Supabase role topology egyetlen szűk backend-kivétele a
  -- `supabase_storage_admin`: ez a platform saját, nem kliens JWT-role-ja, és
  -- közvetlenül az `authenticator` tagja. Ezt a meglévő platform-edge-et nem
  -- bontjuk meg; minden más közvetett custom-role tagság drift.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles candidate
    CROSS JOIN pg_catalog.pg_roles granted
    WHERE granted.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
      AND NOT candidate.rolsuper
      AND candidate.rolname NOT IN (
        'authenticator',
        'supabase_storage_admin',
        'app_staff_user',
        'app_pending_user',
        'member_portal_user'
      )
      AND NOT (
        candidate.rolname = 'postgres'
        AND pg_catalog.current_setting('server_version_num')::integer >= 160000
      )
      AND pg_catalog.pg_has_role(candidate.oid, granted.oid, 'MEMBER')
  ) THEN
    RAISE EXCEPTION 'Role foundation: váratlan közvetett custom-role tag létezik.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    WHERE member_role.rolname = 'supabase_storage_admin'
      AND granted.rolname = 'authenticator'
      AND NOT m.admin_option
  ) <> 1 THEN
    RAISE EXCEPTION
      'Role foundation: a trusted Supabase Storage -> authenticator platform-edge eltér.';
  END IF;

  -- PostgreSQL 16+-on a SET ROLE jog külön membership-option. PG15 alatt
  -- ez az oszlop nem létezik, ott a közvetlen membership maga elegendő.
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
      RAISE EXCEPTION 'Role foundation: az authenticator SET ROLE opciója hiányzik.';
    END IF;

    -- PG16+ non-superuser CREATEROLE ownership model: CREATE ROLE creates an
    -- admin-only edge back to the creator. It is required for later GRANTs but
    -- must never be usable for SET ROLE or privilege inheritance.
    EXECUTE $sql$
      SELECT
        count(*) <> 3
        OR pg_catalog.bool_or(
          NOT m.admin_option OR m.set_option OR m.inherit_option
        )
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
      WHERE member_role.rolname = 'postgres'
        AND granted.rolname IN (
          'app_staff_user', 'app_pending_user', 'member_portal_user'
        )
    $sql$
    INTO v_role;

    IF v_role::boolean THEN
      RAISE EXCEPTION 'Role foundation: a postgres PG16+ bootstrap membership-gráf eltér.';
    END IF;

    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
        JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
        WHERE member_role.rolname = 'app_staff_user'
          AND granted.rolname = 'authenticated'
          AND NOT m.inherit_option
      )
    $sql$
    INTO v_role;

    IF v_role::boolean THEN
      RAISE EXCEPTION 'Role foundation: az app_staff_user nem örökli az authenticated grantokat.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.aclexplode(
      COALESCE(
        (SELECT n.nspacl FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'),
        pg_catalog.acldefault(
          'n',
          (SELECT n.nspowner FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public')
        )
      )
    ) acl
    WHERE acl.privilege_type = 'CREATE'
      AND acl.grantee <> (
        SELECT n.nspowner FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'
      )
  ) THEN
    RAISE EXCEPTION 'Role foundation: váratlan grantee CREATE jogot kapott a public sémán.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
    WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
      AND n.nspname = 'public'
      AND d.defaclobjtype IN ('r', 'S', 'f')
      AND acl.grantee <> d.defaclrole
  ) THEN
    RAISE EXCEPTION 'Role foundation: váratlan default ACL grantee maradt postgres/public alatt.';
  END IF;
END
$postflight$;

COMMIT;

SELECT pg_catalog.jsonb_build_object(
  'migration', '2026-07-17-member-portal-role-foundation',
  'roles', (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'role', r.rolname,
        'login', r.rolcanlogin,
        'inherit', r.rolinherit,
        'bypassrls', r.rolbypassrls,
        'authenticator_member', pg_catalog.pg_has_role(
          'authenticator', r.rolname, 'MEMBER'
        )
      )
      ORDER BY r.rolname
    )
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'app_staff_user', 'app_pending_user', 'member_portal_user'
    )
  ),
  'public_create_closed', NOT (
    pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
    OR pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
    OR pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE')
  )
) AS member_portal_role_foundation_verification;
