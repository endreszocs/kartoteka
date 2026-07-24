-- REVIEW-DRAFT — MÉG NE FUTTASD ÉLES ADATBÁZISON.
-- 2026-07-17 — Tagi portál: biztonságos regisztrációs és jóváhagyási workflow
--
-- Kötelező futtatási sorrend:
--   1. 2026-07-17-member-portal-role-foundation.sql
--   2. 2026-07-17-member-portal-core.sql
--   3. 2026-07-17-member-portal-legacy-workflow-compat.sql
--   4. 2026-07-17-member-portal-p0-auth-isolation.sql
--   5. 2026-07-17-member-portal-token-hook.sql
--   6. a Custom Access Token Hook Dashboard-engedélyezése, kötelező re-login
--      és valódi app_staff/app_pending/member JWT-próba
--   7. EZ A FÁJL
--
-- Biztonsági szerződés:
--   * raw_user_meta_data SOHA nem ad staff-szerepet, tenant-jogot vagy scope-ot;
--   * a `registration_flow = member_portal_v1` marker csak a szigorúbb,
--     alacsony jogosultságú tagi útvonalat választhatja ki;
--   * minden más új Auth user egy fix `pending` staff-profilt kap, fix
--     `lelkesz` placeholder szereppel, scope és jóváhagyás nélkül;
--   * a tagi e-mail-cím mindig auth.users.email-ből származik, RPC-paraméterként
--     nem fogadjuk el;
--   * a signuphoz szükséges PII-t a dispatcher ugyanabban a tranzakcióban a
--     kérelembe másolja, majd raw_user_meta_data-ból teljesen eltávolítja;
--   * a lelkészi döntéshez aktív, approved, role='lelkesz',
--     scope='congregation', scope_id=célgyülekezet hozzárendelés szükséges;
--   * a kliens közvetlenül továbbra sem írhatja a tagi táblákat: minden írás
--     explicit SECURITY DEFINER workflow RPC-n és a core guardokon halad át;
--   * minden állapotváltozást a core append-only, PII-szegény audittriggerei
--     naplóznak.
--
-- Tagi signup metadata-v1 szerződés (a frontendnek pontosan ezt kell küldenie):
--   registration_flow      = "member_portal_v1"
--   congregation_id        = canonical UUID string
--   display_name           = 1..200 karakter
--   birth_date             = YYYY-MM-DD, 1900-01-01..mai nap
--   phone                  = opcionális, 3..64 karakter
--   applicant_message      = opcionális, legfeljebb 2000 karakter
--   preferred_locale       = hu | ro | en
--   terms_accepted         = true (JSON boolean)
--   privacy_notice_version = "2026-07-17-v1"
--
-- A legacy access_requests jóváhagyását ez a migráció SZÁNDÉKOSAN nem írja át.
-- Az élő oszlopok ismertek, de a jelenlegi folyamat Auth Admin API-hívást,
-- e-mail-megerősítést/meghívást és több DB-írást kever; ezeket egy PostgreSQL
-- tranzakció nem tudja atomikusan összefogni. Külön backend-orchestráció és
-- idempotenciakulcs szükséges. Itt csak az e-mail-paraméter nélküli, self-only
-- staff státusz-RPC készül el.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

-- --------------------------------------------------------------------------
-- 0. Fail-closed előfeltételek
-- --------------------------------------------------------------------------

DO $preflight$
DECLARE
  v_role text;
  v_table regclass;
  v_required_columns integer;
  r record;
  v_child_columns text[];
  v_parent_columns text[];
  v_fk_update "char";
  v_fk_delete "char";
  v_dispatcher_source text;
  v_dispatcher_marker text;
  v_dispatcher_owner text;
  v_dispatcher_security_definer boolean;
  v_auth_trigger_definition text;
  v_auth_trigger_enabled "char";
  v_auth_trigger_type smallint;
  v_auth_trigger_function oid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Tagi workflow: csak postgres SQL Editor szereppel futtatható; current_user=%',
      current_user;
  END IF;

  FOREACH v_role IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'supabase_auth_admin',
    'app_staff_user',
    'app_pending_user',
    'member_portal_user'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = v_role
    ) THEN
      RAISE EXCEPTION 'Tagi workflow: hiányzó DB role: %', v_role;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'auth.users'::regclass,
    'public.profiles'::regclass,
    'public.profile_roles'::regclass,
    'public.access_requests'::regclass,
    'public.congregations'::regclass,
    'public.public_sites'::regclass,
    'public.szemely'::regclass,
    'public.member_accounts'::regclass,
    'public.member_congregation_applications'::regclass,
    'public.member_person_links'::regclass,
    'public.member_portal_audit_log'::regclass
  ]::regclass[]
  LOOP
    IF v_table IS NULL THEN
      RAISE EXCEPTION 'Tagi workflow: hiányzó kötelező tábla.';
    END IF;
  END LOOP;

  IF pg_catalog.to_regnamespace('member_private') IS NULL THEN
    RAISE EXCEPTION 'Tagi workflow: hiányzik a member_private schema.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'member_private.member_portal_staff_can_review_congregation(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.current_user_is_active_staff()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.custom_access_token_hook(jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Tagi workflow: a core/P0/token-hook alapfüggvények egyike hiányzik.';
  END IF;

  IF pg_catalog.obj_description(
       'public.current_user_is_active_staff()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
     OR pg_catalog.obj_description(
       'public.custom_access_token_hook(jsonb)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM
       'KARTOTEKA P0 token hook v2: trusted DB state alapján app_staff_user / member_portal_user / app_pending_user role claim; metadata authorization nincs.'
  THEN
    RAISE EXCEPTION
      'Tagi workflow: a P0 cutover vagy a target token-hook exact markerje hiányzik.';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'supabase_auth_admin',
       'public.custom_access_token_hook(jsonb)',
       'EXECUTE'
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
    RAISE EXCEPTION
      'Tagi workflow: a Custom Access Token Hook ACL-je eltér a fail-closed modelltől.';
  END IF;

  SELECT
    pg_catalog.pg_get_triggerdef(t.oid, true),
    t.tgenabled,
    t.tgtype,
    t.tgfoid
    INTO
      v_auth_trigger_definition,
      v_auth_trigger_enabled,
      v_auth_trigger_type,
      v_auth_trigger_function
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND t.tgname = 'on_auth_user_created'
    AND NOT t.tgisinternal;

  IF v_auth_trigger_definition IS NULL
     OR v_auth_trigger_enabled <> 'O'
     OR v_auth_trigger_type <> 5
     OR v_auth_trigger_function <>
       'public.handle_new_user()'::regprocedure::oid THEN
    RAISE EXCEPTION
      'Tagi workflow: az Auth INSERT trigger nem az exact enabled AFTER INSERT FOR EACH ROW handle_new_user kötés.';
  END IF;

  SELECT
    p.prosrc,
    pg_catalog.obj_description(p.oid, 'pg_proc'),
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef
    INTO
      v_dispatcher_source,
      v_dispatcher_marker,
      v_dispatcher_owner,
      v_dispatcher_security_definer
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.handle_new_user()'::regprocedure;

  IF v_dispatcher_owner <> 'postgres'
     OR NOT v_dispatcher_security_definer
     OR NOT (
       (
         v_dispatcher_marker = 'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1'
         AND v_dispatcher_source ILIKE '%member_portal_v1%'
         AND v_dispatcher_source NOT ILIKE '%requested_role%'
       )
       OR (
         v_dispatcher_marker IS DISTINCT FROM
           'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1'
         AND v_dispatcher_source ILIKE '%raw_user_meta_data%'
         AND v_dispatcher_source ILIKE '%requested_role%'
         AND v_dispatcher_source ILIKE '%INSERT INTO public.profiles%'
       )
     ) THEN
    RAISE EXCEPTION
      'Tagi workflow: ismeretlen handle_new_user baseline; a trigger felülírása blokkolva.';
  END IF;

  IF v_dispatcher_marker IS DISTINCT FROM
       'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1'
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = 'auth.users'::regclass
         AND t.tgname IN (
           'member_portal_on_auth_email_confirmed',
           'member_portal_on_auth_user_changed'
         )
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION
      'Tagi workflow: ismeretlen korábbi tagi Auth lifecycle trigger létezik.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid IN (
      'public.member_accounts'::regclass,
      'public.member_congregation_applications'::regclass,
      'public.member_person_links'::regclass,
      'public.member_portal_audit_log'::regclass
    )
      AND NOT c.convalidated
  ) THEN
    RAISE EXCEPTION 'Tagi workflow: nem validált core constraint maradt.';
  END IF;

  FOR r IN
    SELECT *
    FROM (VALUES
      (
        'member_person_links_person_fkey'::text,
        ARRAY['person_id']::text[],
        ARRAY['id']::text[]
      ),
      (
        'member_person_links_live_person_tenant_fkey'::text,
        ARRAY['live_person_id', 'live_congregation_id']::text[],
        ARRAY['id', 'congregation_id']::text[]
      )
    ) AS expected(constraint_name, child_columns, parent_columns)
  LOOP
    SELECT
      ARRAY(
        SELECT a.attname
        FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ORDER BY k.ordinality
      ),
      ARRAY(
        SELECT a.attname
        FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = c.confrelid AND a.attnum = k.attnum
        ORDER BY k.ordinality
      ),
      c.confupdtype,
      c.confdeltype
      INTO v_child_columns, v_parent_columns, v_fk_update, v_fk_delete
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.member_person_links'::regclass
      AND c.confrelid = 'public.szemely'::regclass
      AND c.conname = r.constraint_name
      AND c.contype = 'f'
      AND c.convalidated;

    IF v_child_columns IS DISTINCT FROM r.child_columns
       OR v_parent_columns IS DISTINCT FROM r.parent_columns
       OR v_fk_update <> 'r'
       OR v_fk_delete <> 'r' THEN
      RAISE EXCEPTION
        'Tagi workflow: eltérő person-link FK: name=%, child=%, parent=%, update=%, delete=%',
        r.constraint_name,
        v_child_columns,
        v_parent_columns,
        v_fk_update,
        v_fk_delete;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      'anon',
      'authenticated',
      'app_pending_user',
      'member_portal_user',
      'app_staff_user',
      'service_role'
    ]::text[]) role_name
    CROSS JOIN pg_catalog.unnest(ARRAY[
      'public.member_accounts',
      'public.member_congregation_applications',
      'public.member_person_links',
      'public.member_portal_audit_log'
    ]::text[]) table_name
    WHERE pg_catalog.has_table_privilege(
      role_name,
      table_name,
      'INSERT, UPDATE, DELETE, TRUNCATE'
    )
  ) THEN
    RAISE EXCEPTION
      'Tagi workflow: közvetlen kliens/service DML-grant található a tagi táblákon.';
  END IF;

  SELECT pg_catalog.count(*)
    INTO v_required_columns
    FROM (
      VALUES
        ('access_requests', 'id'),
        ('access_requests', 'email'),
        ('access_requests', 'status'),
        ('access_requests', 'requested_role'),
        ('access_requests', 'requested_congregation_id'),
        ('access_requests', 'requested_diocese_id'),
        ('access_requests', 'requested_district_id'),
        ('access_requests', 'resulting_user_id'),
        ('access_requests', 'rejection_reason'),
        ('access_requests', 'created_at'),
        ('access_requests', 'reviewed_at'),
        ('congregations', 'id'),
        ('congregations', 'status'),
        ('congregations', 'public_site_enabled'),
        ('public_sites', 'congregation_id'),
        ('public_sites', 'is_published'),
        ('profiles', 'deleted_at'),
        ('profiles', 'anonymized_at')
    ) AS required(table_name, column_name)
    JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = required.table_name
     AND c.column_name = required.column_name;

  IF v_required_columns <> 18 THEN
    RAISE EXCEPTION
      'Tagi workflow: a live access/public/profile oszlopkészlet eltér (%/18).',
      v_required_columns;
  END IF;
END
$preflight$;

-- --------------------------------------------------------------------------
-- 1. Biztonságos Auth dispatcher
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_flow text;
  v_email text;
  v_display_name text;
  v_phone text;
  v_locale text;
  v_message text;
  v_congregation_text text;
  v_congregation_id uuid;
  v_birth_date_text text;
  v_birth_date date;
  v_privacy_version text;
  v_confirmed_at timestamptz := NEW.email_confirmed_at;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_member_account_id uuid;
  v_staff_full_name text;
BEGIN
  v_flow := CASE
    WHEN pg_catalog.jsonb_typeof(v_meta -> 'registration_flow') = 'string'
      THEN pg_catalog.btrim(v_meta ->> 'registration_flow')
    ELSE ''
  END;

  -- Az untrusted marker kizárólag a kevesebb jogosultságú tagi ágat nyitja;
  -- authorization-adatot ez az ág nem olvas ki.
  IF v_flow = 'member_portal_v1' THEN
    -- Az Auth user az egyetlen stabil kulcs az account-sor létrejötte előtt.
    -- Ez sorosítja az idempotens dispatcher-újrapróbálást minden első DML előtt.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('member-auth:' || NEW.id::text, 0)
    );

    v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));

    IF pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 320
       OR position('@' IN v_email) <= 1 THEN
      RAISE EXCEPTION 'Tagi regisztrációhoz érvényes e-mail-cím szükséges.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_meta -> 'display_name') <> 'string' THEN
      RAISE EXCEPTION 'Hiányzó vagy hibás tagi megjelenítési név.'
        USING ERRCODE = '22023';
    END IF;
    v_display_name := pg_catalog.btrim(v_meta ->> 'display_name');
    IF pg_catalog.char_length(v_display_name) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'A tagi megjelenítési név hossza 1 és 200 karakter közötti lehet.'
        USING ERRCODE = '22023';
    END IF;

    IF v_meta ? 'phone'
       AND pg_catalog.jsonb_typeof(v_meta -> 'phone') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Hibás telefonszám formátum.' USING ERRCODE = '22023';
    END IF;
    v_phone := NULLIF(pg_catalog.btrim(v_meta ->> 'phone'), '');
    IF v_phone IS NOT NULL
       AND pg_catalog.char_length(v_phone) NOT BETWEEN 3 AND 64 THEN
      RAISE EXCEPTION 'A telefonszám hossza 3 és 64 karakter közötti lehet.'
        USING ERRCODE = '22023';
    END IF;

    IF v_meta ? 'applicant_message'
       AND pg_catalog.jsonb_typeof(v_meta -> 'applicant_message') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Hibás bemutatkozó üzenet.' USING ERRCODE = '22023';
    END IF;
    v_message := NULLIF(
      pg_catalog.btrim(v_meta ->> 'applicant_message'),
      ''
    );
    IF v_message IS NOT NULL AND pg_catalog.char_length(v_message) > 2000 THEN
      RAISE EXCEPTION 'A bemutatkozó üzenet legfeljebb 2000 karakter lehet.'
        USING ERRCODE = '22023';
    END IF;

    v_locale := CASE
      WHEN pg_catalog.jsonb_typeof(v_meta -> 'preferred_locale') = 'string'
        THEN pg_catalog.lower(pg_catalog.btrim(v_meta ->> 'preferred_locale'))
      ELSE 'hu'
    END;
    IF v_locale NOT IN ('hu', 'ro', 'en') THEN
      RAISE EXCEPTION 'Nem támogatott nyelv.' USING ERRCODE = '22023';
    END IF;

    IF v_meta -> 'terms_accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'A felhasználási feltételek elfogadása kötelező.'
        USING ERRCODE = '22023';
    END IF;

    v_privacy_version := CASE
      WHEN pg_catalog.jsonb_typeof(v_meta -> 'privacy_notice_version') = 'string'
        THEN pg_catalog.btrim(v_meta ->> 'privacy_notice_version')
      ELSE ''
    END;
    IF v_privacy_version <> '2026-07-17-v1' THEN
      RAISE EXCEPTION 'Ismeretlen vagy elavult adatkezelési tájékoztató-verzió.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_meta -> 'congregation_id') <> 'string' THEN
      RAISE EXCEPTION 'Hiányzó gyülekezeti azonosító.' USING ERRCODE = '22023';
    END IF;
    v_congregation_text := pg_catalog.btrim(v_meta ->> 'congregation_id');
    IF v_congregation_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Hibás gyülekezeti azonosító.' USING ERRCODE = '22023';
    END IF;
    v_congregation_id := v_congregation_text::uuid;

    PERFORM c.id
      FROM public.congregations c
     WHERE c.id = v_congregation_id
       AND c.status = 'active'
       AND c.public_site_enabled
       AND EXISTS (
         SELECT 1
         FROM public.public_sites ps
         WHERE ps.congregation_id = c.id
           AND ps.is_published
       )
     FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A kiválasztott gyülekezet tagi regisztrációja nem elérhető.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_meta -> 'birth_date') <> 'string' THEN
      RAISE EXCEPTION 'Hiányzó születési dátum.' USING ERRCODE = '22023';
    END IF;
    v_birth_date_text := pg_catalog.btrim(v_meta ->> 'birth_date');
    IF v_birth_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'A születési dátum formátuma YYYY-MM-DD legyen.'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_birth_date := v_birth_date_text::date;
    EXCEPTION
      WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Érvénytelen születési dátum.' USING ERRCODE = '22023';
    END;
    IF v_birth_date < DATE '1900-01-01'
       OR v_birth_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'A születési dátum kívül esik az engedélyezett tartományon.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Az Auth userhez már staff-profil tartozik; tagi dispatcher ütközés.'
        USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.member_accounts (
      auth_user_id,
      email,
      display_name,
      phone,
      preferred_locale,
      status,
      email_confirmed_at,
      activated_at,
      terms_accepted_at,
      privacy_notice_version
    ) VALUES (
      NEW.id,
      v_email,
      v_display_name,
      v_phone,
      v_locale,
      'pending_email',
      NULL,
      NULL,
      v_now,
      '2026-07-17-v1'
    )
    ON CONFLICT (auth_user_id) DO NOTHING
    RETURNING id INTO v_member_account_id;

    IF v_member_account_id IS NULL THEN
      SELECT ma.id
        INTO v_member_account_id
        FROM public.member_accounts ma
       WHERE ma.auth_user_id = NEW.id
       FOR UPDATE;
    END IF;

    IF v_member_account_id IS NULL THEN
      RAISE EXCEPTION 'A tagi account idempotens létrehozása sikertelen.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-account:' || v_member_account_id::text,
        0
      )
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.member_congregation_applications a
      WHERE a.member_account_id = v_member_account_id
    ) THEN
      INSERT INTO public.member_congregation_applications (
        member_account_id,
        congregation_id,
        applicant_full_name,
        applicant_email,
        applicant_phone,
        applicant_birth_date,
        applicant_message,
        status,
        email_confirmed_at,
        submitted_at
      ) VALUES (
        v_member_account_id,
        v_congregation_id,
        v_display_name,
        v_email,
        v_phone,
        v_birth_date,
        v_message,
        'pending_email',
        NULL,
        NULL
      );
    END IF;

    -- Az autoconfirmed Auth INSERT is ugyanazon, auditálható állapotgépen halad:
    -- előbb mindkét sor szabályos pending_email kezdőállapotban jön létre,
    -- majd ugyanebben a tranzakcióban történik a két engedélyezett transition.
    IF v_confirmed_at IS NOT NULL THEN
      UPDATE public.member_accounts ma
         SET status = 'active',
             email_confirmed_at = v_confirmed_at,
             activated_at = COALESCE(ma.activated_at, v_now),
             status_message = NULL
       WHERE ma.id = v_member_account_id
         AND ma.status = 'pending_email';

      UPDATE public.member_congregation_applications a
         SET status = 'pending_review',
             email_confirmed_at = v_confirmed_at,
             submitted_at = COALESCE(a.submitted_at, v_now)
       WHERE a.member_account_id = v_member_account_id
         AND a.status = 'pending_email';
    END IF;

    -- A signup metadata user-editable és nem lehet másodlagos PII-adattár.
    -- A szükséges pillanatkép ekkorra constraintelt tagi táblákba került;
    -- authorization pedig eleve nem támaszkodhat erre a mezőre.
    UPDATE auth.users u
       SET raw_user_meta_data = '{}'::jsonb
     WHERE u.id = NEW.id;
  ELSE
    -- Legacy/staff signup: a kliens által kért szerep teljesen figyelmen kívül
    -- marad. A tényleges role/scope kizárólag külön, jóváhagyott admin workflow.
    v_staff_full_name := CASE
      WHEN pg_catalog.jsonb_typeof(v_meta -> 'full_name') = 'string'
        THEN pg_catalog.btrim(v_meta ->> 'full_name')
      WHEN pg_catalog.jsonb_typeof(v_meta -> 'name') = 'string'
        THEN pg_catalog.btrim(v_meta ->> 'name')
      ELSE ''
    END;
    v_staff_full_name := pg_catalog.left(v_staff_full_name, 200);

    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      status,
      role,
      congregation_id,
      diocese_id,
      district_id,
      created_at
    ) VALUES (
      NEW.id,
      pg_catalog.lower(pg_catalog.btrim(NEW.email)),
      v_staff_full_name,
      'pending',
      'lelkesz',
      NULL,
      NULL,
      NULL,
      v_now
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1';

-- --------------------------------------------------------------------------
-- 2. Auth e-mail-életciklus: címcsere + megerősítés szinkronizálása
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION member_private.member_portal_on_auth_user_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_account_id uuid;
  v_account_status text;
  v_confirmed_at timestamptz := NEW.email_confirmed_at;
  v_email_changed boolean := OLD.email IS DISTINCT FROM NEW.email;
  v_email text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-auth:' || NEW.id::text, 0)
  );

  SELECT ma.id
    INTO v_member_account_id
    FROM public.member_accounts ma
   WHERE ma.auth_user_id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_member_account_id::text,
      0
    )
  );

  SELECT ma.status
    INTO v_account_status
    FROM public.member_accounts ma
   WHERE ma.id = v_member_account_id
     AND ma.auth_user_id = NEW.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- A törölt account történeti rekord; Auth oldali címváltozás nem élesztheti
  -- újra, és a core guard helyesen tiltja a módosítását.
  IF v_account_status = 'deleted' THEN
    RETURN NEW;
  END IF;

  IF v_email_changed THEN
    v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));
    IF pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 320
       OR position('@' IN v_email) <= 1 THEN
      RAISE EXCEPTION 'Érvénytelen Auth e-mail-cím a tagi szinkron során.'
        USING ERRCODE = '22023';
    END IF;

    -- Előbb az account a kanonikus Auth-címre áll, utána csak a még nyitott
    -- kérelmek pillanatképe követi. Lezárt kérelmek audit-története változatlan.
    UPDATE public.member_accounts ma
       SET email = v_email
     WHERE ma.id = v_member_account_id
       AND ma.auth_user_id = NEW.id
       AND ma.status <> 'deleted';

    UPDATE public.member_congregation_applications a
       SET applicant_email = v_email
     WHERE a.member_account_id = v_member_account_id
       AND a.status IN ('pending_email', 'pending_review');
  END IF;

  IF v_account_status = 'pending_email' AND v_confirmed_at IS NOT NULL THEN
    UPDATE public.member_accounts ma
       SET status = 'active',
           email_confirmed_at = v_confirmed_at,
           activated_at = COALESCE(ma.activated_at, v_confirmed_at),
           status_message = NULL
     WHERE ma.id = v_member_account_id
       AND ma.status = 'pending_email';
  END IF;

  IF v_account_status IN ('pending_email', 'active')
     AND v_confirmed_at IS NOT NULL THEN
    UPDATE public.member_congregation_applications a
       SET status = 'pending_review',
           email_confirmed_at = v_confirmed_at,
           submitted_at = COALESCE(a.submitted_at, v_confirmed_at)
     WHERE a.member_account_id = v_member_account_id
       AND a.status = 'pending_email';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION member_private.member_portal_on_auth_user_changed() IS
  'Auth lifecycle trigger: lockolt email-csere szinkron + idempotens pending_email -> active/pending_review átmenet; lezárt application snapshotot nem ír át.';

-- A meglévő INSERT trigger OID-kötését explicit újraépítjük, így nem függünk
-- korábbi search_path-tól vagy az action_statement szöveges alakjától.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS member_portal_on_auth_email_confirmed ON auth.users;
DROP FUNCTION IF EXISTS member_private.member_portal_on_auth_email_confirmed();
DROP TRIGGER IF EXISTS member_portal_on_auth_user_changed ON auth.users;
CREATE TRIGGER member_portal_on_auth_user_changed
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (
    OLD.email IS DISTINCT FROM NEW.email
    OR (
      OLD.email_confirmed_at IS NULL
      AND NEW.email_confirmed_at IS NOT NULL
    )
  )
  EXECUTE FUNCTION member_private.member_portal_on_auth_user_changed();

-- --------------------------------------------------------------------------
-- 3. Self-only státusz RPC-k — nincs e-mail-paraméter
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_portal_my_request_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_member_account_id uuid;
  v_account_status text;
  v_email_confirmed_at timestamptz;
  v_application jsonb;
  v_link jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;

  SELECT ma.id, ma.status, ma.email_confirmed_at
    INTO v_member_account_id, v_account_status, v_email_confirmed_at
    FROM public.member_accounts ma
   WHERE ma.auth_user_id = v_user_id
     AND ma.status <> 'deleted';

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'has_member_account', false,
      'account_status', NULL,
      'email_confirmed', false,
      'latest_application', NULL,
      'latest_link', NULL
    );
  END IF;

  SELECT pg_catalog.jsonb_build_object(
           'id', a.id,
           'congregation_id', a.congregation_id,
           'status', a.status,
           'submitted_at', a.submitted_at,
           'reviewed_at', a.reviewed_at,
           'withdrawn_at', a.withdrawn_at,
           'decision_message', a.decision_message
         )
    INTO v_application
    FROM public.member_congregation_applications a
   WHERE a.member_account_id = v_member_account_id
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT 1;

  SELECT pg_catalog.jsonb_build_object(
           'id', l.id,
           'congregation_id', l.congregation_id,
           'status', l.status,
           'linked_at', l.linked_at,
           'suspended_at', l.suspended_at,
           'revoked_at', l.revoked_at,
           'status_message', l.status_message
         )
    INTO v_link
    FROM public.member_person_links l
   WHERE l.member_account_id = v_member_account_id
   ORDER BY l.created_at DESC, l.id DESC
   LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'has_member_account', true,
    'member_account_id', v_member_account_id,
    'account_status', v_account_status,
    'email_confirmed', v_email_confirmed_at IS NOT NULL,
    'latest_application', v_application,
    'latest_link', v_link
  );
END;
$function$;

COMMENT ON FUNCTION public.member_portal_my_request_state() IS
  'Self-only tagi státusz: auth.uid() alapján, e-mail-paraméter és PII-visszaadás nélkül.';

CREATE OR REPLACE FUNCTION public.staff_my_access_request_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_profile jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(u.email))
    INTO v_email
    FROM auth.users u
   WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Az Auth user nem található.' USING ERRCODE = '28000';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
           'status', p.status,
           'role', p.role,
           'created_at', p.created_at
         )
    INTO v_profile
    FROM public.profiles p
   WHERE p.id = v_user_id;

  SELECT pg_catalog.jsonb_build_object(
           'id', ar.id,
           'status', ar.status,
           'requested_role', ar.requested_role,
           'requested_congregation_id', ar.requested_congregation_id,
           'requested_diocese_id', ar.requested_diocese_id,
           'requested_district_id', ar.requested_district_id,
           'created_at', ar.created_at,
           'reviewed_at', ar.reviewed_at,
           'rejection_reason', ar.rejection_reason
         )
    INTO v_request
    FROM public.access_requests ar
   WHERE ar.resulting_user_id = v_user_id
      OR (
        v_email IS NOT NULL
        AND pg_catalog.lower(pg_catalog.btrim(ar.email)) = v_email
      )
   ORDER BY (ar.resulting_user_id = v_user_id) DESC, ar.created_at DESC, ar.id DESC
   LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'has_profile', v_profile IS NOT NULL,
    'profile', v_profile,
    'is_active_staff', public.current_user_is_active_staff(),
    'has_access_request', v_request IS NOT NULL,
    'access_request', v_request
  );
END;
$function$;

COMMENT ON FUNCTION public.staff_my_access_request_state() IS
  'Self-only staff/pending státusz: auth.uid() -> auth.users.email belső feloldás; nincs email-paraméter és nincs admin_notes/document_path kimenet.';

-- --------------------------------------------------------------------------
-- 4. Tagi újrakérelem és visszavonás
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_portal_submit_application(
  p_congregation_id uuid,
  p_birth_date date,
  p_applicant_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_member_account_id uuid;
  v_account_status text;
  v_account_email text;
  v_display_name text;
  v_phone text;
  v_email_confirmed_at timestamptz;
  v_message text := NULLIF(pg_catalog.btrim(p_applicant_message), '');
  v_application_id uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;
  IF p_congregation_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó gyülekezeti azonosító.' USING ERRCODE = '22023';
  END IF;
  IF p_birth_date IS NULL
     OR p_birth_date < DATE '1900-01-01'
     OR p_birth_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Érvénytelen születési dátum.' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND pg_catalog.char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'A bemutatkozó üzenet legfeljebb 2000 karakter lehet.'
      USING ERRCODE = '22023';
  END IF;

  SELECT ma.id
    INTO v_member_account_id
    FROM public.member_accounts ma
   WHERE ma.auth_user_id = v_user_id
     AND ma.status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A bejelentkezett userhez nem tartozik tagi account.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_member_account_id::text,
      0
    )
  );

  SELECT ma.status, ma.email, ma.display_name, ma.phone, ma.email_confirmed_at
    INTO v_account_status, v_account_email, v_display_name, v_phone,
         v_email_confirmed_at
    FROM public.member_accounts ma
   WHERE ma.id = v_member_account_id
     AND ma.auth_user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND OR v_account_status <> 'active' OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Csak aktív, megerősített tagi account indíthat kérelmet.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM c.id
    FROM public.congregations c
   WHERE c.id = p_congregation_id
     AND c.status = 'active'
     AND c.public_site_enabled
     AND EXISTS (
       SELECT 1
       FROM public.public_sites ps
       WHERE ps.congregation_id = c.id
         AND ps.is_published
     )
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A kiválasztott gyülekezet tagi regisztrációja nem elérhető.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_congregation_applications a
    WHERE a.member_account_id = v_member_account_id
      AND a.status IN ('pending_email', 'pending_review')
  ) THEN
    RAISE EXCEPTION 'Már van nyitott tagi kérelme.' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.member_account_id = v_member_account_id
      AND l.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Élő személykapcsolat mellett új kérelem nem indítható.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.member_congregation_applications (
    member_account_id,
    congregation_id,
    applicant_full_name,
    applicant_email,
    applicant_phone,
    applicant_birth_date,
    applicant_message,
    status,
    email_confirmed_at,
    submitted_at
  ) VALUES (
    v_member_account_id,
    p_congregation_id,
    v_display_name,
    v_account_email,
    v_phone,
    p_birth_date,
    v_message,
    'pending_email',
    NULL,
    NULL
  )
  RETURNING id INTO v_application_id;

  UPDATE public.member_congregation_applications a
     SET status = 'pending_review',
         email_confirmed_at = v_email_confirmed_at,
         submitted_at = v_now
   WHERE a.id = v_application_id
     AND a.member_account_id = v_member_account_id
     AND a.status = 'pending_email';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi kérelem pending_review átmenete sikertelen.';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', v_application_id,
    'status', 'pending_review',
    'congregation_id', p_congregation_id,
    'submitted_at', v_now
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.member_portal_withdraw_my_application(
  p_application_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_member_account_id uuid;
  v_application_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó kérelemazonosító.' USING ERRCODE = '22023';
  END IF;

  SELECT a.member_account_id
    INTO v_member_account_id
    FROM public.member_congregation_applications a
    JOIN public.member_accounts ma ON ma.id = a.member_account_id
   WHERE a.id = p_application_id
     AND ma.auth_user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A saját tagi kérelem nem található.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_member_account_id::text,
      0
    )
  );

  PERFORM ma.id
    FROM public.member_accounts ma
   WHERE ma.id = v_member_account_id
     AND ma.auth_user_id = v_user_id
     AND ma.status <> 'deleted'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A saját tagi account nem aktív.' USING ERRCODE = '42501';
  END IF;

  SELECT a.status
    INTO v_application_status
    FROM public.member_congregation_applications a
   WHERE a.id = p_application_id
     AND a.member_account_id = v_member_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A saját tagi kérelem nem található.' USING ERRCODE = '42501';
  END IF;

  IF v_application_status = 'withdrawn' THEN
    RETURN pg_catalog.jsonb_build_object(
      'application_id', p_application_id,
      'status', 'withdrawn',
      'changed', false
    );
  END IF;

  IF v_application_status NOT IN ('pending_email', 'pending_review') THEN
    RAISE EXCEPTION 'Lezárt vagy elbírált kérelem nem vonható vissza.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_congregation_applications a
     SET status = 'withdrawn',
         withdrawn_at = v_now,
         decision_message = NULL
   WHERE a.id = p_application_id;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', p_application_id,
    'status', 'withdrawn',
    'changed', true,
    'withdrawn_at', v_now
  );
END;
$function$;

-- --------------------------------------------------------------------------
-- 5. Lelkészi döntés: approve + személylink egy tranzakcióban
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_portal_approve_application(
  p_application_id uuid,
  p_person_id integer,
  p_decision_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_staff_user_id uuid := auth.uid();
  v_member_account_id uuid;
  v_congregation_id uuid;
  v_application_status text;
  v_account_status text;
  v_person_congregation_id uuid;
  v_person_visible boolean;
  v_person_deceased boolean;
  v_decision_message text := NULLIF(
    pg_catalog.btrim(p_decision_message),
    ''
  );
  v_link_id uuid;
  v_existing_person_id integer;
  v_existing_link_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;
  IF p_application_id IS NULL OR p_person_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó kérelem- vagy személyazonosító.' USING ERRCODE = '22023';
  END IF;
  IF v_decision_message IS NOT NULL
     AND pg_catalog.char_length(v_decision_message) > 2000 THEN
    RAISE EXCEPTION 'A döntési üzenet legfeljebb 2000 karakter lehet.'
      USING ERRCODE = '22023';
  END IF;

  -- Első olvasás csak az advisory lock kulcsához; az azonosítók a core guard
  -- szerint változtathatatlanok. A tényleges döntés minden sort újra lezár.
  SELECT a.member_account_id
    INTO v_member_account_id
    FROM public.member_congregation_applications a
   WHERE a.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi kérelem nem található.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_member_account_id::text,
      0
    )
  );

  SELECT ma.status
    INTO v_account_status
    FROM public.member_accounts ma
   WHERE ma.id = v_member_account_id
   FOR UPDATE;

  SELECT a.congregation_id, a.status
    INTO v_congregation_id, v_application_status
    FROM public.member_congregation_applications a
   WHERE a.id = p_application_id
     AND a.member_account_id = v_member_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi kérelem nem található.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
    v_congregation_id
  ) THEN
    RAISE EXCEPTION 'A kérelem elbírálásához nincs gyülekezeti lelkészi jogosultsága.'
      USING ERRCODE = '42501';
  END IF;

  IF v_application_status = 'approved' THEN
    SELECT l.id, l.person_id, l.status
      INTO v_link_id, v_existing_person_id, v_existing_link_status
      FROM public.member_person_links l
     WHERE l.application_id = p_application_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integritási hiba: jóváhagyott kérelemhez nincs személykapcsolat.';
    END IF;
    IF v_existing_person_id IS DISTINCT FROM p_person_id THEN
      RAISE EXCEPTION 'A kérelmet korábban másik személyhez kapcsolták.'
        USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'application_id', p_application_id,
      'status', 'approved',
      'link_id', v_link_id,
      'link_status', v_existing_link_status,
      'person_id', v_existing_person_id,
      'changed', false
    );
  END IF;

  IF v_application_status <> 'pending_review' THEN
    RAISE EXCEPTION 'Csak pending_review kérelem hagyható jóvá (jelenlegi: %).',
      v_application_status
      USING ERRCODE = '23514';
  END IF;

  IF v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Csak aktív tagi account kérelme hagyható jóvá.'
      USING ERRCODE = '23514';
  END IF;

  -- Két külön account ugyanarra a személyre indított párhuzamos jóváhagyását
  -- a globális live-link UNIQUE index előtt is determinisztikusan sorosítjuk.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-person:' || p_person_id::text, 0)
  );

  SELECT s.congregation_id, s.isvisible, s.meghalt
    INTO v_person_congregation_id, v_person_visible, v_person_deceased
    FROM public.szemely s
   WHERE s.id = p_person_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A kapcsolni kívánt személy nem található.' USING ERRCODE = 'P0002';
  END IF;
  IF v_person_congregation_id IS DISTINCT FROM v_congregation_id THEN
    RAISE EXCEPTION 'Cross-tenant személykapcsolat tiltva.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_person_visible OR v_person_deceased THEN
    RAISE EXCEPTION 'Csak élő, látható személyrekord kapcsolható tagi fiókhoz.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.member_account_id = v_member_account_id
      AND l.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'A tagi accounthoz már tartozik élő személykapcsolat.'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.person_id = p_person_id
      AND l.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'A személyhez már tartozik élő tagi account.'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.member_congregation_applications a
     SET status = 'approved',
         reviewed_at = v_now,
         reviewed_by_profile_id = v_staff_user_id,
         decision_message = v_decision_message
   WHERE a.id = p_application_id;

  INSERT INTO public.member_person_links (
    member_account_id,
    congregation_id,
    person_id,
    application_id,
    status,
    linked_by_profile_id,
    linked_at
  ) VALUES (
    v_member_account_id,
    v_congregation_id,
    p_person_id,
    p_application_id,
    'active',
    v_staff_user_id,
    v_now
  )
  RETURNING id INTO v_link_id;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', p_application_id,
    'status', 'approved',
    'link_id', v_link_id,
    'link_status', 'active',
    'person_id', p_person_id,
    'changed', true,
    'reviewed_at', v_now
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.member_portal_reject_application(
  p_application_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_staff_user_id uuid := auth.uid();
  v_member_account_id uuid;
  v_congregation_id uuid;
  v_application_status text;
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó kérelemazonosító.' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'Az elutasítás indoklása 3 és 2000 karakter közötti legyen.'
      USING ERRCODE = '22023';
  END IF;

  SELECT a.member_account_id
    INTO v_member_account_id
    FROM public.member_congregation_applications a
   WHERE a.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi kérelem nem található.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_member_account_id::text,
      0
    )
  );

  PERFORM ma.id
    FROM public.member_accounts ma
   WHERE ma.id = v_member_account_id
   FOR UPDATE;

  SELECT a.congregation_id, a.status
    INTO v_congregation_id, v_application_status
    FROM public.member_congregation_applications a
   WHERE a.id = p_application_id
     AND a.member_account_id = v_member_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi kérelem nem található.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
    v_congregation_id
  ) THEN
    RAISE EXCEPTION 'A kérelem elbírálásához nincs gyülekezeti lelkészi jogosultsága.'
      USING ERRCODE = '42501';
  END IF;

  IF v_application_status = 'rejected' THEN
    RETURN pg_catalog.jsonb_build_object(
      'application_id', p_application_id,
      'status', 'rejected',
      'changed', false
    );
  END IF;
  IF v_application_status <> 'pending_review' THEN
    RAISE EXCEPTION 'Csak pending_review kérelem utasítható el (jelenlegi: %).',
      v_application_status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_congregation_applications a
     SET status = 'rejected',
         reviewed_at = v_now,
         reviewed_by_profile_id = v_staff_user_id,
         decision_message = v_reason
   WHERE a.id = p_application_id;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', p_application_id,
    'status', 'rejected',
    'changed', true,
    'reviewed_at', v_now
  );
END;
$function$;

-- --------------------------------------------------------------------------
-- 6. Lelkészi személykapcsolat felfüggesztés / visszaállítás / visszavonás
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_portal_change_link_status(
  p_link_id uuid,
  p_action text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_staff_user_id uuid := auth.uid();
  v_member_account_id uuid;
  v_congregation_id uuid;
  v_link_status text;
  v_account_status text;
  v_action text := pg_catalog.lower(pg_catalog.btrim(p_action));
  v_reason text := NULLIF(pg_catalog.btrim(p_reason), '');
  v_target_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.' USING ERRCODE = '28000';
  END IF;
  IF p_link_id IS NULL
     OR v_action IS NULL
     OR v_action NOT IN ('suspend', 'resume', 'revoke') THEN
    RAISE EXCEPTION 'Hibás linkazonosító vagy művelet.' USING ERRCODE = '22023';
  END IF;
  IF v_action IN ('suspend', 'revoke')
     AND (
       v_reason IS NULL
       OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 1000
     ) THEN
    RAISE EXCEPTION 'A felfüggesztés/visszavonás indoklása 3 és 1000 karakter közötti legyen.'
      USING ERRCODE = '22023';
  END IF;

  SELECT l.member_account_id
    INTO v_member_account_id
    FROM public.member_person_links l
   WHERE l.id = p_link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi személykapcsolat nem található.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_member_account_id::text,
      0
    )
  );

  SELECT ma.status
    INTO v_account_status
    FROM public.member_accounts ma
   WHERE ma.id = v_member_account_id
   FOR UPDATE;

  SELECT l.congregation_id, l.status
    INTO v_congregation_id, v_link_status
    FROM public.member_person_links l
   WHERE l.id = p_link_id
     AND l.member_account_id = v_member_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi személykapcsolat nem található.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
    v_congregation_id
  ) THEN
    RAISE EXCEPTION 'A személykapcsolat kezeléséhez nincs gyülekezeti lelkészi jogosultsága.'
      USING ERRCODE = '42501';
  END IF;

  v_target_status := CASE v_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'resume' THEN 'active'
    WHEN 'revoke' THEN 'revoked'
  END;

  IF v_link_status = v_target_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'link_id', p_link_id,
      'status', v_link_status,
      'changed', false
    );
  END IF;

  IF v_link_status = 'revoked' THEN
    RAISE EXCEPTION 'Visszavont személykapcsolat nem állítható vissza.'
      USING ERRCODE = '23514';
  END IF;
  IF v_action = 'suspend' AND v_link_status <> 'active' THEN
    RAISE EXCEPTION 'Csak aktív személykapcsolat függeszthető fel.'
      USING ERRCODE = '23514';
  END IF;
  IF v_action = 'resume'
     AND (v_link_status <> 'suspended' OR v_account_status <> 'active') THEN
    RAISE EXCEPTION 'Csak felfüggesztett link állítható vissza aktív account mellett.'
      USING ERRCODE = '23514';
  END IF;

  IF v_action = 'suspend' THEN
    UPDATE public.member_person_links l
       SET status = 'suspended',
           status_message = v_reason,
           suspended_at = v_now,
           revoked_at = NULL
     WHERE l.id = p_link_id;
  ELSIF v_action = 'resume' THEN
    UPDATE public.member_person_links l
       SET status = 'active',
           status_message = NULL,
           suspended_at = NULL,
           revoked_at = NULL
     WHERE l.id = p_link_id;
  ELSIF v_action = 'revoke' THEN
    UPDATE public.member_person_links l
       SET status = 'revoked',
           status_message = v_reason,
           revoked_at = v_now
     WHERE l.id = p_link_id;
  ELSE
    RAISE EXCEPTION 'Ismeretlen személykapcsolat-művelet.'
      USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'link_id', p_link_id,
    'status', v_target_status,
    'changed', true,
    'changed_at', v_now
  );
END;
$function$;

-- --------------------------------------------------------------------------
-- 7. Least-privilege EXECUTE ACL
-- --------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_portal_on_auth_user_changed()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;

REVOKE ALL ON FUNCTION public.member_portal_my_request_state()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.staff_my_access_request_state()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_submit_application(uuid, date, text)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_withdraw_my_application(uuid)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_approve_application(uuid, integer, text)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_reject_application(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_change_link_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;

-- Staff precedence miatt egy kettős staff+member identitás app_staff_user JWT-t
-- kap; ezért a saját tagi műveletek erre a role-ra is explicit engedélyezettek.
GRANT EXECUTE ON FUNCTION public.member_portal_my_request_state()
  TO member_portal_user, app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_submit_application(uuid, date, text)
  TO member_portal_user, app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_withdraw_my_application(uuid)
  TO member_portal_user, app_staff_user;

GRANT EXECUTE ON FUNCTION public.staff_my_access_request_state()
  TO app_pending_user, app_staff_user;

GRANT EXECUTE ON FUNCTION public.member_portal_approve_application(uuid, integer, text)
  TO app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_reject_application(uuid, text)
  TO app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_change_link_status(uuid, text, text)
  TO app_staff_user;

-- --------------------------------------------------------------------------
-- 8. Fail-closed postflight
-- --------------------------------------------------------------------------

DO $postflight$
DECLARE
  v_function regprocedure;
  v_expected_staff boolean;
  v_expected_pending boolean;
  v_expected_member boolean;
  v_proc record;
  v_trigger_definition text;
  v_trigger_enabled "char";
  v_trigger_type smallint;
  v_trigger_function oid;
  v_trigger_columns text[];
BEGIN
  FOR v_function, v_expected_staff, v_expected_pending, v_expected_member IN
    SELECT *
    FROM (VALUES
      ('public.handle_new_user()'::regprocedure, false, false, false),
      ('member_private.member_portal_on_auth_user_changed()'::regprocedure, false, false, false),
      ('public.member_portal_my_request_state()'::regprocedure, true, false, true),
      ('public.staff_my_access_request_state()'::regprocedure, true, true, false),
      ('public.member_portal_submit_application(uuid,date,text)'::regprocedure, true, false, true),
      ('public.member_portal_withdraw_my_application(uuid)'::regprocedure, true, false, true),
      ('public.member_portal_approve_application(uuid,integer,text)'::regprocedure, true, false, false),
      ('public.member_portal_reject_application(uuid,text)'::regprocedure, true, false, false),
      ('public.member_portal_change_link_status(uuid,text,text)'::regprocedure, true, false, false)
    ) AS expected(function_oid, staff_execute, pending_execute, member_execute)
  LOOP
    SELECT p.prosecdef,
           r.rolname AS owner_name,
           EXISTS (
             SELECT 1
             FROM pg_catalog.unnest(
               COALESCE(p.proconfig, ARRAY[]::text[])
             ) cfg
             WHERE cfg IN ('search_path=', 'search_path=""')
           ) AS empty_search_path,
           EXISTS (
             SELECT 1
             FROM pg_catalog.aclexplode(
               COALESCE(
                 p.proacl,
                 pg_catalog.acldefault('f', p.proowner)
               )
             ) acl
             WHERE acl.grantee = 0
               AND acl.privilege_type = 'EXECUTE'
           ) AS public_execute
      INTO v_proc
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
     WHERE p.oid = v_function;

    IF NOT v_proc.prosecdef
       OR v_proc.owner_name <> 'postgres'
       OR NOT v_proc.empty_search_path
       OR v_proc.public_execute THEN
      RAISE EXCEPTION
        'Tagi workflow postflight: owner/security/search_path/PUBLIC ACL eltér: %',
        v_function;
    END IF;

    IF pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('supabase_auth_admin', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege(
         'app_staff_user', v_function, 'EXECUTE'
       ) IS DISTINCT FROM v_expected_staff
       OR pg_catalog.has_function_privilege(
         'app_pending_user', v_function, 'EXECUTE'
       ) IS DISTINCT FROM v_expected_pending
       OR pg_catalog.has_function_privilege(
         'member_portal_user', v_function, 'EXECUTE'
       ) IS DISTINCT FROM v_expected_member THEN
      RAISE EXCEPTION 'Tagi workflow postflight: EXECUTE ACL eltér: %', v_function;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
      WHERE p.oid = v_function
        AND acl.privilege_type = 'EXECUTE'
        AND NOT COALESCE(
          acl.grantee = p.proowner
          OR (
            grantee.rolname = 'app_staff_user'
            AND v_expected_staff
            AND NOT acl.is_grantable
          )
          OR (
            grantee.rolname = 'app_pending_user'
            AND v_expected_pending
            AND NOT acl.is_grantable
          )
          OR (
            grantee.rolname = 'member_portal_user'
            AND v_expected_member
            AND NOT acl.is_grantable
          ),
          false
        )
    ) THEN
      RAISE EXCEPTION
        'Tagi workflow postflight: váratlan direct EXECUTE grantee: %',
        v_function;
    END IF;
  END LOOP;

  IF pg_catalog.obj_description(
       'public.handle_new_user()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1'
     OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE (
      n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user',
        'member_portal_my_request_state',
        'staff_my_access_request_state',
        'member_portal_submit_application',
        'member_portal_withdraw_my_application',
        'member_portal_approve_application',
        'member_portal_reject_application',
        'member_portal_change_link_status'
      )
      OR n.nspname = 'member_private'
         AND p.proname = 'member_portal_on_auth_user_changed'
    )
      AND p.oid NOT IN (
        'public.handle_new_user()'::regprocedure,
        'member_private.member_portal_on_auth_user_changed()'::regprocedure,
        'public.member_portal_my_request_state()'::regprocedure,
        'public.staff_my_access_request_state()'::regprocedure,
        'public.member_portal_submit_application(uuid,date,text)'::regprocedure,
        'public.member_portal_withdraw_my_application(uuid)'::regprocedure,
        'public.member_portal_approve_application(uuid,integer,text)'::regprocedure,
        'public.member_portal_reject_application(uuid,text)'::regprocedure,
        'public.member_portal_change_link_status(uuid,text,text)'::regprocedure
      )
  ) THEN
    RAISE EXCEPTION
      'Tagi workflow postflight: váratlan stale RPC/trigger-function overload maradt.';
  END IF;

  SELECT
    pg_catalog.pg_get_triggerdef(t.oid, true),
    t.tgenabled,
    t.tgtype,
    t.tgfoid
    INTO
      v_trigger_definition,
      v_trigger_enabled,
      v_trigger_type,
      v_trigger_function
    FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid = 'auth.users'::regclass
     AND t.tgname = 'on_auth_user_created'
     AND NOT t.tgisinternal;

  IF v_trigger_definition IS NULL
     OR v_trigger_enabled <> 'O'
     OR v_trigger_type <> 5
     OR v_trigger_function <> 'public.handle_new_user()'::regprocedure::oid
     OR v_trigger_definition NOT ILIKE '%AFTER INSERT ON auth.users%'
     OR v_trigger_definition NOT ILIKE '%public.handle_new_user()%'
     OR v_trigger_definition ILIKE '%UPDATE%' THEN
    RAISE EXCEPTION 'Tagi workflow postflight: az INSERT Auth trigger eltér: %',
      v_trigger_definition;
  END IF;

  SELECT
    pg_catalog.pg_get_triggerdef(t.oid, true),
    t.tgenabled,
    t.tgtype,
    t.tgfoid,
    ARRAY(
      SELECT a.attname
      FROM pg_catalog.unnest(t.tgattr) x(attnum)
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = t.tgrelid AND a.attnum = x.attnum
      ORDER BY a.attname
    )
    INTO
      v_trigger_definition,
      v_trigger_enabled,
      v_trigger_type,
      v_trigger_function,
      v_trigger_columns
    FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid = 'auth.users'::regclass
     AND t.tgname = 'member_portal_on_auth_user_changed'
     AND NOT t.tgisinternal;

  IF v_trigger_definition IS NULL
     OR v_trigger_enabled <> 'O'
     OR v_trigger_type <> 17
     OR v_trigger_function <>
       'member_private.member_portal_on_auth_user_changed()'::regprocedure::oid
     OR v_trigger_columns IS DISTINCT FROM
       ARRAY['email', 'email_confirmed_at']::text[]
     OR v_trigger_definition NOT ILIKE '%AFTER UPDATE OF%ON auth.users%'
     OR v_trigger_definition NOT ILIKE '%member_private.member_portal_on_auth_user_changed()%'
     OR v_trigger_definition NOT ILIKE '%OLD.email IS DISTINCT FROM NEW.email%'
     OR v_trigger_definition NOT ILIKE '%OLD.email_confirmed_at IS NULL%'
     OR v_trigger_definition NOT ILIKE '%NEW.email_confirmed_at IS NOT NULL%' THEN
    RAISE EXCEPTION 'Tagi workflow postflight: az e-mail Auth trigger eltér: %',
      v_trigger_definition;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    WHERE p.oid = 'public.handle_new_user()'::regprocedure
      AND (
        p.prosrc ILIKE '%requested_role%'
        OR p.prosrc ILIKE '%scope_id%'
        OR p.prosrc ILIKE '%raw_app_meta_data%'
      )
  ) THEN
    RAISE EXCEPTION
      'Tagi workflow postflight: a dispatcher marker/authorization metadata modellje eltér.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'member_private.member_portal_on_auth_email_confirmed()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION
      'Tagi workflow postflight: stale e-mail-confirmation trigger-függvény maradt.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      'anon',
      'authenticated',
      'app_pending_user',
      'member_portal_user',
      'app_staff_user',
      'service_role'
    ]::text[]) role_name
    CROSS JOIN pg_catalog.unnest(ARRAY[
      'public.member_accounts',
      'public.member_congregation_applications',
      'public.member_person_links',
      'public.member_portal_audit_log'
    ]::text[]) table_name
    WHERE pg_catalog.has_table_privilege(
      role_name,
      table_name,
      'INSERT, UPDATE, DELETE, TRUNCATE'
    )
  ) THEN
    RAISE EXCEPTION
      'Tagi workflow postflight: közvetlen DML-grant nyílt a tagi táblákon.';
  END IF;
END
$postflight$;

COMMIT;

-- Read-only kézi ellenőrző összefoglaló.
SELECT pg_catalog.jsonb_build_object(
  'migration', '2026-07-17-member-portal-workflows',
  'review_draft', true,
  'auth_insert_trigger', pg_catalog.to_regprocedure('public.handle_new_user()') IS NOT NULL,
  'auth_lifecycle_trigger', pg_catalog.to_regprocedure(
    'member_private.member_portal_on_auth_user_changed()'
  ) IS NOT NULL,
  'member_self_state_rpc', pg_catalog.has_function_privilege(
    'member_portal_user',
    'public.member_portal_my_request_state()',
    'EXECUTE'
  ),
  'pending_staff_self_state_rpc', pg_catalog.has_function_privilege(
    'app_pending_user',
    'public.staff_my_access_request_state()',
    'EXECUTE'
  ),
  'staff_approval_rpc', pg_catalog.has_function_privilege(
    'app_staff_user',
    'public.member_portal_approve_application(uuid,integer,text)',
    'EXECUTE'
  ),
  'legacy_access_request_approval_atomized', false,
  'legacy_access_request_blocker',
    'Auth Admin API + DB writes require a separate idempotent backend orchestrator'
) AS member_portal_workflow_verification;

-- PII-mentes blocker-diagnosztika a KÜLÖN megtervezendő legacy staff approval
-- orchestrátorhoz. Ez nem módosít access_requests/auth/profiles adatot.
WITH request_counts AS (
  SELECT
    pg_catalog.count(*) FILTER (WHERE ar.status = 'pending')
      AS pending_requests,
    pg_catalog.count(*) FILTER (
      WHERE ar.status = 'approved' AND ar.resulting_user_id IS NULL
    ) AS approved_without_resulting_user,
    pg_catalog.count(*) FILTER (
      WHERE ar.resulting_user_id IS NOT NULL AND p.id IS NULL
    ) AS resulting_user_without_profile
  FROM public.access_requests ar
  LEFT JOIN public.profiles p ON p.id = ar.resulting_user_id
), duplicate_open_emails AS (
  SELECT pg_catalog.count(*) AS duplicate_groups
  FROM (
    SELECT pg_catalog.lower(pg_catalog.btrim(ar.email)) AS normalized_email
    FROM public.access_requests ar
    WHERE ar.status = 'pending'
    GROUP BY pg_catalog.lower(pg_catalog.btrim(ar.email))
    HAVING pg_catalog.count(*) > 1
  ) duplicates
)
SELECT pg_catalog.jsonb_build_object(
  'legacy_access_request_approval_ready_for_db_only_atomic_migration', false,
  'pending_requests', rc.pending_requests,
  'approved_without_resulting_user', rc.approved_without_resulting_user,
  'resulting_user_without_profile', rc.resulting_user_without_profile,
  'duplicate_pending_email_groups', de.duplicate_groups,
  'blocker',
    'Auth Admin API side effects and database writes need an idempotent backend state machine'
) AS legacy_access_request_approval_blocker
FROM request_counts rc
CROSS JOIN duplicate_open_emails de;
