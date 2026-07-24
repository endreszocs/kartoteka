-- REVIEW-DRAFT -- MEG NE FUTTASD ELES ADATBAZISON.
-- 2026-07-17 -- Tagi portal: sajat adatok, modositas-keresek es hirlevelek
--
-- Kotelezo futtatasi sorrend:
--   1. 2026-07-17-member-portal-role-foundation.sql
--   2. 2026-07-17-member-portal-core.sql
--   3. 2026-07-17-member-portal-legacy-workflow-compat.sql
--   4. 2026-07-17-member-portal-p0-auth-isolation.sql
--   5. 2026-07-17-member-portal-token-hook.sql
--   6. Custom Access Token Hook Dashboard-engedelyezes + kotelezo re-login es
--      valodi app_staff/app_pending/member JWT-proba
--   7. 2026-07-17-member-portal-workflows.sql
--   8. EZ A FAJL
--
-- Biztonsagi szerzodes:
--   * minden tagi olvasas aktiv member_account + aktiv person-link alapjan indul;
--   * a befizeteseknel EGYSZERRE kotelezo az id_szemely es congregation_id, a
--     deleted sorok ki vannak zarva, id_csalad alapjan soha nem olvasunk;
--   * a sajat adatmodositas JSON patch-e zart allowlist, optimistic revisionnel;
--   * minden kliensszerep kozvetlen INSERT/UPDATE/DELETE joga tiltott;
--   * minden iras explicit SECURITY DEFINER RPC, DB-live auth.uid ellenorzessel;
--   * a lelkesz pontosan aktiv, approved, congregation-scope `lelkesz` lehet;
--   * az uj audit append-only es PII-szegeny; email, telefon, nev, cim, szuletesi
--     datum, hirlevel subject/body vagy teljes patch nem kerulhet a details-be;
--   * a hirlevel-sor csak recipient snapshot + `queued` allapotot hoz letre.
--     Kulso email worker es annak kulon, auditált claim/complete protokollja egy
--     kesobbi migracio feladata; ez a SQL semmit nem allit elkuldott allapotra.
--
-- Ez first-install migracio. Barmely mar letezo target objektum reszleges
-- telepitesnek vagy ismeretlen driftnek szamit, es rollbackelo EXCEPTION-t okoz.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL idle_in_transaction_session_timeout = '5min';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

-- --------------------------------------------------------------------------
-- 0. Fail-closed preflight: rollout-markerek, pontos live oszlopok, nincs drift
-- --------------------------------------------------------------------------

DO $preflight$
DECLARE
  v_role text;
  v_table text;
  v_proc_name text;
  v_trigger_function oid;
  v_trigger_enabled "char";
  v_trigger_type smallint;
  v_staff_helper_source text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter: csak postgres SQL Editor szereppel futtathato; current_user=%',
      current_user;
  END IF;

  FOREACH v_role IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'app_staff_user',
    'app_pending_user',
    'member_portal_user'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = v_role
        AND (
          v_role IN ('anon', 'authenticated', 'service_role')
          OR (
            NOT r.rolcanlogin
            AND NOT r.rolsuper
            AND NOT r.rolcreatedb
            AND NOT r.rolcreaterole
            AND NOT r.rolreplication
            AND NOT r.rolbypassrls
          )
        )
    ) THEN
      RAISE EXCEPTION 'Hianyzik vagy nem biztonsagos DB-role: %', v_role;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'auth.users',
    'public.profiles',
    'public.profile_roles',
    'public.congregations',
    'public.szemely',
    'public.csalad',
    'public.gyerek',
    'public.haztartas',
    'public.haztartas_tag',
    'public.szemely_kapcsolat',
    'public.befizetes',
    'public.befizetescel',
    'public.member_accounts',
    'public.member_congregation_applications',
    'public.member_person_links',
    'public.member_portal_audit_log'
  ]::text[]
  LOOP
    IF pg_catalog.to_regclass(v_table) IS NULL THEN
      RAISE EXCEPTION 'Hianyzik a kotelezo tabla: %', v_table;
    END IF;
  END LOOP;

  IF pg_catalog.to_regnamespace('member_private') IS NULL
     OR pg_catalog.pg_get_userbyid(
       (SELECT n.nspowner FROM pg_catalog.pg_namespace n
        WHERE n.nspname = 'member_private')
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'A member_private schema hianyzik vagy owner-driftelt.';
  END IF;

  -- Legacy compatibility + P0 + token hook + workflow exact markerek.
  IF pg_catalog.to_regprocedure(
       'public.wipe_congregation_data(uuid,text)'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.wipe_congregation_data(uuid,text)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_WIPE_COMPAT_V1'
     OR pg_catalog.to_regprocedure(
       'public.tagnyilvantartas_tag_torles(integer)'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.tagnyilvantartas_tag_torles(integer)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'
     OR pg_catalog.to_regprocedure(
       'public.respond_to_member_transfer_notification(uuid,text,text)'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.respond_to_member_transfer_notification(uuid,text,text)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_TRANSFER_COMPAT_V1'
     OR pg_catalog.to_regprocedure(
       'public.current_user_is_active_staff()'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.current_user_is_active_staff()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
     OR pg_catalog.to_regprocedure(
       'public.custom_access_token_hook(jsonb)'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.custom_access_token_hook(jsonb)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM
       'KARTOTEKA P0 token hook v2: trusted DB state alapján app_staff_user / member_portal_user / app_pending_user role claim; metadata authorization nincs.'
     OR pg_catalog.to_regprocedure('public.handle_new_user()') IS NULL
     OR pg_catalog.obj_description(
       'public.handle_new_user()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1'
     OR pg_catalog.to_regprocedure(
       'member_private.member_portal_on_auth_user_changed()'
     ) IS NULL
     OR pg_catalog.obj_description(
       'member_private.member_portal_on_auth_user_changed()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM
       'Auth lifecycle trigger: lockolt email-csere szinkron + idempotens pending_email -> active/pending_review átmenet; lezárt application snapshotot nem ír át.'
     OR pg_catalog.to_regprocedure(
       'public.member_portal_my_request_state()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.member_portal_approve_application(uuid,integer,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.member_portal_change_link_status(uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'member_private.member_portal_staff_can_review_congregation(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'A foundation -> core -> legacy compat -> P0 -> token hook -> workflow exact marker-lanc hianyzik vagy driftelt.';
  END IF;

  SELECT t.tgfoid, t.tgenabled, t.tgtype
    INTO v_trigger_function, v_trigger_enabled, v_trigger_type
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND t.tgname = 'member_portal_on_auth_user_changed'
    AND NOT t.tgisinternal;

  IF v_trigger_function IS DISTINCT FROM
       'member_private.member_portal_on_auth_user_changed()'::regprocedure::oid
     OR v_trigger_enabled <> 'O'
     OR v_trigger_type <> 17 THEN
    RAISE EXCEPTION
      'A workflow Auth UPDATE trigger exact kotes/engedelyezes driftelt.';
  END IF;

  -- A data/newsletter RPC-k minden lelkeszi agban ezt a DB-live helper-t
  -- hasznaljak. Ne elegedjunk meg a fuggveny nevenek letezesevel: a helper
  -- csak aktiv, jovahagyott, congregation-scope `lelkesz` szerepet fogadhat
  -- el, es nem lehet kliensszerepeknek kozvetlenul hivhato.
  SELECT p.prosrc
    INTO v_staff_helper_source
  FROM pg_catalog.pg_proc p
  WHERE p.oid =
    'member_private.member_portal_staff_can_review_congregation(uuid)'::regprocedure;

  IF v_staff_helper_source IS NULL
     OR v_staff_helper_source NOT ILIKE '%p.status = ''active''%'
     OR v_staff_helper_source NOT ILIKE '%p.deleted_at IS NULL%'
     OR v_staff_helper_source NOT ILIKE '%p.anonymized_at IS NULL%'
     OR v_staff_helper_source NOT ILIKE '%pr.active%'
     OR v_staff_helper_source NOT ILIKE '%pr.approval_status = ''approved''%'
     OR v_staff_helper_source NOT ILIKE '%pr.role = ''lelkesz''%'
     OR v_staff_helper_source NOT ILIKE '%pr.scope = ''congregation''%'
     OR v_staff_helper_source NOT ILIKE '%pr.scope_id = p_congregation_id%'
     OR pg_catalog.pg_get_userbyid((
          SELECT p.proowner
          FROM pg_catalog.pg_proc p
          WHERE p.oid =
            'member_private.member_portal_staff_can_review_congregation(uuid)'::regprocedure
        )) <> 'postgres'
     OR NOT (
       SELECT p.prosecdef
       FROM pg_catalog.pg_proc p
       WHERE p.oid =
         'member_private.member_portal_staff_can_review_congregation(uuid)'::regprocedure
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       CROSS JOIN LATERAL pg_catalog.unnest(
         COALESCE(p.proconfig, ARRAY[]::text[])
       ) cfg
       WHERE p.oid =
         'member_private.member_portal_staff_can_review_congregation(uuid)'::regprocedure
         AND cfg IN ('search_path=', 'search_path=""')
     )
     OR NOT pg_catalog.has_function_privilege(
       'app_staff_user',
       'member_private.member_portal_staff_can_review_congregation(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'member_private.member_portal_staff_can_review_congregation(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'member_private.member_portal_staff_can_review_congregation(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'app_pending_user',
       'member_private.member_portal_staff_can_review_congregation(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'member_portal_user',
       'member_private.member_portal_staff_can_review_congregation(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'A congregation-scope aktiv/jovahagyott lelkeszi helper security contract driftelt.';
  END IF;

  -- A felhasznalt live oszlopok pontos tipusellenorzese. A szemely tenantja a
  -- core utan kotelezoen NOT NULL.
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('szemely'::text, 'id'::text, 'integer'::text, true),
      ('szemely', 'szcs_nev', 'character varying', false),
      ('szemely', 'k_nev', 'character varying', false),
      ('szemely', 'csaladnev', 'character varying', false),
      ('szemely', 'ferjk_nev', 'character varying', false),
      ('szemely', 'apjaneve', 'character varying', false),
      ('szemely', 'anyjaneve', 'character varying', false),
      ('szemely', 'sz_datum', 'date', false),
      ('szemely', 'vallas', 'character varying', false),
      ('szemely', 'foglalkozas', 'character varying', false),
      ('szemely', 'nemzetiseg', 'character varying', false),
      ('szemely', 'c_szam', 'character varying', false),
      ('szemely', 'c_tombhaz', 'character varying', false),
      ('szemely', 'c_lepcsohaz', 'character varying', false),
      ('szemely', 'c_ajto', 'character varying', false),
      ('szemely', 'c_emelet', 'character varying', false),
      ('szemely', 'c_szcim', 'character varying', false),
      ('szemely', 'telefon', 'character varying', false),
      ('szemely', 'email', 'character varying', false),
      ('szemely', 'isvisible', 'boolean', true),
      ('szemely', 'meghalt', 'boolean', true),
      ('szemely', 'member_status', 'text', false),
      ('szemely', 'congregation_id', 'uuid', true),
      ('szemely', 'revision', 'bigint', true),
      ('szemely', 'updated_at', 'timestamp with time zone', true),
      ('szemely', 'photo_consent', 'boolean', true),
      ('szemely', 'mailing_consent', 'boolean', true),
      ('szemely', 'social_profil_url', 'text', false),
      ('csalad', 'id', 'integer', true),
      ('csalad', 'id_ferfi', 'integer', false),
      ('csalad', 'id_no', 'integer', false),
      ('csalad', 'isaktiv', 'boolean', true),
      ('gyerek', 'id', 'integer', true),
      ('gyerek', 'id_csalad', 'integer', true),
      ('gyerek', 'id_szemely', 'integer', true),
      ('haztartas', 'id', 'uuid', true),
      ('haztartas', 'congregation_id', 'uuid', true),
      ('haztartas', 'megnevezes', 'text', false),
      ('haztartas', 'isaktiv', 'boolean', true),
      ('haztartas_tag', 'id_haztartas', 'uuid', true),
      ('haztartas_tag', 'id_szemely', 'integer', true),
      ('haztartas_tag', 'szerep', 'text', true),
      ('haztartas_tag', 'is_primary', 'boolean', true),
      ('haztartas_tag', 'ervenyes_ig', 'date', false),
      ('haztartas_tag', 'congregation_id', 'uuid', true),
      ('szemely_kapcsolat', 'id', 'uuid', true),
      ('szemely_kapcsolat', 'id_szemely_1', 'integer', true),
      ('szemely_kapcsolat', 'id_szemely_2', 'integer', true),
      ('szemely_kapcsolat', 'tipus', 'text', true),
      ('szemely_kapcsolat', 'ver_szerinti', 'boolean', true),
      ('szemely_kapcsolat', 'ervenyes_ig', 'date', false),
      ('szemely_kapcsolat', 'congregation_id', 'uuid', true),
      ('befizetes', 'id', 'integer', true),
      ('befizetes', 'id_szemely', 'integer', false),
      ('befizetes', 'id_csalad', 'integer', false),
      ('befizetes', 'id_befizetescel', 'integer', true),
      ('befizetes', 'datum', 'date', true),
      ('befizetes', 'osszeg', 'numeric', true),
      ('befizetes', 'osszeg_ron', 'numeric', false),
      ('befizetes', 'fizetettev', 'integer', true),
      ('befizetes', 'nyugta', 'text', true),
      ('befizetes', 'iratszam', 'text', true),
      ('befizetes', 'deleted', 'boolean', true),
      ('befizetes', 'stornozott', 'boolean', true),
      ('befizetes', 'congregation_id', 'uuid', false),
      ('befizetescel', 'id', 'integer', true),
      ('befizetescel', 'nev', 'character varying', true),
      ('member_accounts', 'id', 'uuid', true),
      ('member_accounts', 'auth_user_id', 'uuid', true),
      ('member_accounts', 'email', 'text', true),
      ('member_accounts', 'display_name', 'text', true),
      ('member_accounts', 'preferred_locale', 'text', true),
      ('member_accounts', 'status', 'text', true),
      ('member_accounts', 'created_at', 'timestamp with time zone', true),
      ('member_person_links', 'id', 'uuid', true),
      ('member_person_links', 'member_account_id', 'uuid', true),
      ('member_person_links', 'congregation_id', 'uuid', true),
      ('member_person_links', 'person_id', 'integer', true),
      ('member_person_links', 'status', 'text', true),
      ('member_person_links', 'created_at', 'timestamp with time zone', true)
    ) expected(table_name, column_name, formatted_type, must_be_not_null)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND a.attname = expected.column_name
        AND NOT a.attisdropped
        AND pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.formatted_type
        AND (NOT expected.must_be_not_null OR a.attnotnull)
    )
  ) THEN
    RAISE EXCEPTION
      'A szemely/csalad/haztartas/befizetes vagy a core account/link oszlopmodell driftelt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.szemely'::regclass
      AND c.conname = 'szemely_member_portal_identity_tenant_key'
      AND c.contype = 'u'
      AND c.convalidated
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.member_person_links'::regclass
      AND c.conname = 'member_person_links_live_person_tenant_fkey'
      AND c.contype = 'f'
      AND c.convalidated
      AND c.confrelid = 'public.szemely'::regclass
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.member_accounts'::regclass
      AND c.conname = 'member_accounts_auth_user_id_key'
      AND c.contype = 'u'
      AND c.convalidated
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    WHERE i.indexrelid =
      pg_catalog.to_regclass('public.member_person_links_one_live_per_account_idx')
      AND i.indrelid = 'public.member_person_links'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NOT NULL
      AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) ILIKE '%active%'
      AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) ILIKE '%suspended%'
  ) THEN
    RAISE EXCEPTION
      'A core auth-user UNIQUE vagy az exact egy-live-link/tenant-FK alap hianyzik.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.befizetes b
    JOIN public.szemely s ON s.id = b.id_szemely
    WHERE b.id_szemely IS NOT NULL
      AND b.congregation_id IS DISTINCT FROM s.congregation_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.haztartas_tag ht
    JOIN public.haztartas h ON h.id = ht.id_haztartas
    JOIN public.szemely s ON s.id = ht.id_szemely
    WHERE ht.congregation_id IS DISTINCT FROM h.congregation_id
       OR ht.congregation_id IS DISTINCT FROM s.congregation_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.szemely_kapcsolat sk
    JOIN public.szemely s1 ON s1.id = sk.id_szemely_1
    JOIN public.szemely s2 ON s2.id = sk.id_szemely_2
    WHERE sk.congregation_id IS DISTINCT FROM s1.congregation_id
       OR sk.congregation_id IS DISTINCT FROM s2.congregation_id
  ) THEN
    RAISE EXCEPTION
      'A live payment/household/relationship tenant-integritas driftelt; telepites blokkolva.';
  END IF;

  -- First install only: barmely target nev vagy overload ismeretlen drift.
  FOREACH v_table IN ARRAY ARRAY[
    'public.member_person_change_requests',
    'public.member_newsletter_preferences',
    'public.member_newsletter_campaigns',
    'public.member_newsletter_deliveries',
    'public.member_portal_data_audit_log'
  ]::text[]
  LOOP
    IF pg_catalog.to_regclass(v_table) IS NOT NULL THEN
      RAISE EXCEPTION 'Mar letezo/reszleges target tabla: %', v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'member_person_changes_one_pending_idx',
    'member_person_changes_review_queue_idx',
    'member_person_changes_account_history_idx',
    'member_person_changes_link_idx',
    'member_person_changes_person_idx',
    'member_person_changes_reviewer_idx',
    'member_newsletter_campaigns_tenant_status_idx',
    'member_newsletter_deliveries_campaign_status_idx',
    'member_newsletter_deliveries_tenant_status_idx',
    'member_newsletter_deliveries_account_idx',
    'member_portal_data_audit_tenant_time_idx',
    'member_portal_data_audit_subject_idx',
    'member_portal_befizetes_person_tenant_date_idx'
  ]::text[]
  LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NOT NULL THEN
      RAISE EXCEPTION 'Mar letezo/reszleges target index: %', v_table;
    END IF;
  END LOOP;

  FOREACH v_proc_name IN ARRAY ARRAY[
    'member_portal_data_version',
    'member_portal_current_member_context',
    'member_person_patch_normalize',
    'member_person_patch_is_valid',
    'member_data_audit_details_is_valid',
    'member_portal_data_touch',
    'member_person_change_guard',
    'member_newsletter_preference_guard',
    'member_newsletter_campaign_guard',
    'member_newsletter_delivery_guard',
    'member_portal_data_audit_append_only_guard',
    'member_portal_my_overview',
    'member_portal_submit_person_change',
    'member_portal_withdraw_person_change',
    'member_portal_staff_list_person_changes',
    'member_portal_staff_review_person_change',
    'member_portal_set_newsletter_preferences',
    'member_portal_my_newsletter_preferences',
    'member_portal_create_newsletter_campaign',
    'member_portal_queue_newsletter_campaign',
    'member_portal_cancel_newsletter_campaign'
  ]::text[]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'member_private')
        AND p.proname = v_proc_name
    ) THEN
      RAISE EXCEPTION 'Mar letezo/reszleges target function nev: %', v_proc_name;
    END IF;
  END LOOP;
END
$preflight$;

-- --------------------------------------------------------------------------
-- 1. Private marker es tiszta, zart JSON-validalok
-- --------------------------------------------------------------------------

CREATE FUNCTION member_private.member_portal_data_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT 'KARTOTEKA_MEMBER_PORTAL_DATA_AND_NEWSLETTERS_V1'::text;
$function$;

COMMENT ON FUNCTION member_private.member_portal_data_version() IS
  'KARTOTEKA_MEMBER_PORTAL_DATA_AND_NEWSLETTERS_V1';

CREATE FUNCTION member_private.member_person_patch_normalize(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_key text;
  v_value jsonb;
  v_text text;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RETURN p_patch;
  END IF;

  FOR v_key, v_value IN
    SELECT e.key, e.value
    FROM pg_catalog.jsonb_each(p_patch) e
  LOOP
    IF pg_catalog.jsonb_typeof(v_value) = 'string' THEN
      v_text := pg_catalog.btrim(v_value #>> '{}');
      IF v_text = '' THEN
        v_value := 'null'::jsonb;
      ELSIF v_key = 'email' THEN
        v_value := pg_catalog.to_jsonb(pg_catalog.lower(v_text));
      ELSE
        v_value := pg_catalog.to_jsonb(v_text);
      END IF;
    END IF;
    v_result := v_result || pg_catalog.jsonb_build_object(v_key, v_value);
  END LOOP;

  RETURN v_result;
END;
$function$;

CREATE FUNCTION member_private.member_person_patch_is_valid(p_patch jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_key text;
  v_value jsonb;
  v_type text;
  v_text text;
  v_date date;
  v_key_count integer;
BEGIN
  IF p_patch IS NULL
     OR pg_catalog.jsonb_typeof(p_patch) <> 'object'
     OR pg_catalog.octet_length(p_patch::text) > 20000 THEN
    RETURN false;
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_key_count
  FROM pg_catalog.jsonb_object_keys(p_patch);

  IF v_key_count NOT BETWEEN 1 AND 20 THEN
    RETURN false;
  END IF;

  FOR v_key, v_value IN
    SELECT e.key, e.value
    FROM pg_catalog.jsonb_each(p_patch) e
  LOOP
    IF v_key NOT IN (
      'szcs_nev', 'k_nev', 'csaladnev', 'ferjk_nev',
      'apjaneve', 'anyjaneve', 'sz_datum', 'vallas', 'foglalkozas',
      'nemzetiseg', 'c_szam', 'c_tombhaz', 'c_lepcsohaz', 'c_ajto',
      'c_emelet', 'c_szcim', 'telefon', 'email', 'photo_consent',
      'mailing_consent', 'social_profil_url'
    ) THEN
      RETURN false;
    END IF;

    v_type := pg_catalog.jsonb_typeof(v_value);
    IF v_type = 'null' THEN
      IF v_key IN ('photo_consent', 'mailing_consent') THEN
        RETURN false;
      END IF;
      CONTINUE;
    END IF;

    IF v_key IN (
      'szcs_nev', 'k_nev', 'csaladnev', 'ferjk_nev',
      'apjaneve', 'anyjaneve', 'vallas', 'foglalkozas', 'nemzetiseg'
    ) THEN
      IF v_type <> 'string' THEN
        RETURN false;
      END IF;
      v_text := v_value #>> '{}';
      IF v_text <> pg_catalog.btrim(v_text)
         OR pg_catalog.char_length(v_text) NOT BETWEEN 1 AND 200 THEN
        RETURN false;
      END IF;
    ELSIF v_key IN (
      'c_szam', 'c_tombhaz', 'c_lepcsohaz', 'c_ajto', 'c_emelet', 'c_szcim'
    ) THEN
      IF v_type <> 'string' THEN
        RETURN false;
      END IF;
      v_text := v_value #>> '{}';
      IF v_text <> pg_catalog.btrim(v_text)
         OR pg_catalog.char_length(v_text) NOT BETWEEN 1 AND 100 THEN
        RETURN false;
      END IF;
    ELSIF v_key = 'telefon' THEN
      IF v_type <> 'string' THEN
        RETURN false;
      END IF;
      v_text := v_value #>> '{}';
      IF v_text <> pg_catalog.btrim(v_text)
         OR pg_catalog.char_length(v_text) NOT BETWEEN 3 AND 64 THEN
        RETURN false;
      END IF;
    ELSIF v_key = 'email' THEN
      IF v_type <> 'string' THEN
        RETURN false;
      END IF;
      v_text := v_value #>> '{}';
      IF v_text <> pg_catalog.lower(pg_catalog.btrim(v_text))
         OR pg_catalog.char_length(v_text) NOT BETWEEN 3 AND 320
         OR POSITION('@' IN v_text) <= 1 THEN
        RETURN false;
      END IF;
    ELSIF v_key = 'sz_datum' THEN
      IF v_type <> 'string' THEN
        RETURN false;
      END IF;
      v_text := v_value #>> '{}';
      IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RETURN false;
      END IF;
      BEGIN
        v_date := v_text::date;
      EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RETURN false;
      END;
      IF v_date < DATE '1900-01-01' OR v_date >= DATE '2100-01-01' THEN
        RETURN false;
      END IF;
    ELSIF v_key IN ('photo_consent', 'mailing_consent') THEN
      IF v_type <> 'boolean' THEN
        RETURN false;
      END IF;
    ELSIF v_key = 'social_profil_url' THEN
      IF v_type <> 'string' THEN
        RETURN false;
      END IF;
      v_text := v_value #>> '{}';
      IF v_text <> pg_catalog.btrim(v_text)
         OR pg_catalog.char_length(v_text) NOT BETWEEN 8 AND 500
         OR v_text !~* '^https://' THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

CREATE FUNCTION member_private.member_data_audit_details_is_valid(p_details jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT
    p_details IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_details) = 'object'
    AND (
      p_details - ARRAY[
        'old_status', 'new_status', 'changed_fields', 'base_revision',
        'applied_revision', 'email_opt_in', 'recipient_count', 'campaign_kind'
      ]::text[]
    ) = '{}'::jsonb
    AND (
      NOT (p_details ? 'old_status')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'old_status') = 'string'
        AND p_details ->> 'old_status' IN (
          'pending', 'withdrawn', 'approved', 'rejected', 'conflict',
          'draft', 'queued', 'cancelled'
        )
      )
    )
    AND (
      NOT (p_details ? 'new_status')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'new_status') = 'string'
        AND p_details ->> 'new_status' IN (
          'pending', 'withdrawn', 'approved', 'rejected', 'conflict',
          'draft', 'queued', 'cancelled'
        )
      )
    )
    AND (
      NOT (p_details ? 'changed_fields')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'changed_fields') = 'array'
        AND pg_catalog.jsonb_array_length(p_details -> 'changed_fields')
              BETWEEN 1 AND 20
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements(
            p_details -> 'changed_fields'
          ) field_value
          WHERE pg_catalog.jsonb_typeof(field_value) <> 'string'
             OR field_value #>> '{}' NOT IN (
               'szcs_nev', 'k_nev', 'csaladnev', 'ferjk_nev',
               'apjaneve', 'anyjaneve', 'sz_datum', 'vallas', 'foglalkozas',
               'nemzetiseg', 'c_szam', 'c_tombhaz', 'c_lepcsohaz', 'c_ajto',
               'c_emelet', 'c_szcim', 'telefon', 'email', 'photo_consent',
               'mailing_consent', 'social_profil_url'
             )
        )
      )
    )
    AND (
      NOT (p_details ? 'base_revision')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'base_revision') = 'number'
        AND p_details ->> 'base_revision' ~ '^[0-9]+$'
      )
    )
    AND (
      NOT (p_details ? 'applied_revision')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'applied_revision') = 'number'
        AND p_details ->> 'applied_revision' ~ '^[0-9]+$'
      )
    )
    AND (
      NOT (p_details ? 'email_opt_in')
      OR pg_catalog.jsonb_typeof(p_details -> 'email_opt_in') = 'boolean'
    )
    AND (
      NOT (p_details ? 'recipient_count')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'recipient_count') = 'number'
        AND p_details ->> 'recipient_count' ~ '^[0-9]+$'
      )
    )
    AND (
      NOT (p_details ? 'campaign_kind')
      OR (
        pg_catalog.jsonb_typeof(p_details -> 'campaign_kind') = 'string'
        AND p_details ->> 'campaign_kind' IN ('general', 'announcements', 'events')
      )
    );
$function$;

-- --------------------------------------------------------------------------
-- 2. Uj tablák es exact constraint-ek
-- --------------------------------------------------------------------------

CREATE TABLE public.member_person_change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_request_id uuid NOT NULL,
  member_account_id uuid NOT NULL,
  person_link_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  person_id integer NOT NULL,
  base_person_revision bigint NOT NULL,
  requested_patch jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  withdrawn_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid,
  decision_message text,
  applied_person_revision bigint,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_person_change_requests_pkey PRIMARY KEY (id),
  CONSTRAINT member_person_change_requests_client_key
    UNIQUE (member_account_id, client_request_id),
  CONSTRAINT member_person_change_requests_account_fkey
    FOREIGN KEY (member_account_id)
    REFERENCES public.member_accounts(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT member_person_change_requests_link_fkey
    FOREIGN KEY (person_link_id)
    REFERENCES public.member_person_links(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT member_person_change_requests_congregation_fkey
    FOREIGN KEY (congregation_id)
    REFERENCES public.congregations(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT member_person_change_requests_person_fkey
    FOREIGN KEY (person_id)
    REFERENCES public.szemely(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT member_person_change_requests_reviewer_fkey
    FOREIGN KEY (reviewed_by_profile_id)
    REFERENCES public.profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT member_person_change_requests_base_revision_check
    CHECK (base_person_revision >= 0),
  CONSTRAINT member_person_change_requests_patch_check
    CHECK (member_private.member_person_patch_is_valid(requested_patch)),
  CONSTRAINT member_person_change_requests_status_check
    CHECK (status IN ('pending', 'withdrawn', 'approved', 'rejected', 'conflict')),
  CONSTRAINT member_person_change_requests_decision_message_check
    CHECK (decision_message IS NULL OR char_length(decision_message) BETWEEN 1 AND 2000),
  CONSTRAINT member_person_change_requests_revision_check CHECK (revision > 0),
  CONSTRAINT member_person_change_requests_state_check
    CHECK (
      (
        status = 'pending'
        AND withdrawn_at IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by_profile_id IS NULL
        AND decision_message IS NULL
        AND applied_person_revision IS NULL
      )
      OR (
        status = 'withdrawn'
        AND withdrawn_at IS NOT NULL
        AND reviewed_at IS NULL
        AND reviewed_by_profile_id IS NULL
        AND decision_message IS NULL
        AND applied_person_revision IS NULL
      )
      OR (
        status = 'approved'
        AND withdrawn_at IS NULL
        AND reviewed_at IS NOT NULL
        AND reviewed_by_profile_id IS NOT NULL
        AND applied_person_revision IS NOT NULL
        AND applied_person_revision > base_person_revision
      )
      OR (
        status IN ('rejected', 'conflict')
        AND withdrawn_at IS NULL
        AND reviewed_at IS NOT NULL
        AND reviewed_by_profile_id IS NOT NULL
        AND decision_message IS NOT NULL
        AND applied_person_revision IS NULL
      )
    )
);

COMMENT ON TABLE public.member_person_change_requests IS
  'Tag altal bekuldott, zart allowlistes szemely-adat patch. Pending sor csak RPC-n vonhato vissza vagy lelkesz altal review-zhato; approve optimistic szemely.revision ellenorzessel atomikusan alkalmaz.';

CREATE UNIQUE INDEX member_person_changes_one_pending_idx
  ON public.member_person_change_requests (member_account_id, person_id)
  WHERE status = 'pending';

CREATE INDEX member_person_changes_review_queue_idx
  ON public.member_person_change_requests (
    congregation_id,
    status,
    submitted_at,
    id
  );

CREATE INDEX member_person_changes_account_history_idx
  ON public.member_person_change_requests (member_account_id, submitted_at DESC, id);

CREATE INDEX member_person_changes_link_idx
  ON public.member_person_change_requests (person_link_id);

CREATE INDEX member_person_changes_person_idx
  ON public.member_person_change_requests (person_id);

CREATE INDEX member_person_changes_reviewer_idx
  ON public.member_person_change_requests (reviewed_by_profile_id, reviewed_at DESC)
  WHERE reviewed_by_profile_id IS NOT NULL;

CREATE TABLE public.member_newsletter_preferences (
  member_account_id uuid NOT NULL,
  email_opt_in boolean NOT NULL DEFAULT false,
  announcements_opt_in boolean NOT NULL DEFAULT true,
  events_opt_in boolean NOT NULL DEFAULT true,
  preferred_locale text NOT NULL DEFAULT 'hu',
  consented_at timestamptz,
  withdrawn_at timestamptz DEFAULT statement_timestamp(),
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_newsletter_preferences_pkey PRIMARY KEY (member_account_id),
  CONSTRAINT member_newsletter_preferences_account_fkey
    FOREIGN KEY (member_account_id)
    REFERENCES public.member_accounts(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT member_newsletter_preferences_locale_check
    CHECK (preferred_locale IN ('hu', 'ro', 'en')),
  CONSTRAINT member_newsletter_preferences_revision_check CHECK (revision > 0),
  CONSTRAINT member_newsletter_preferences_consent_state_check
    CHECK (
      (email_opt_in AND consented_at IS NOT NULL AND withdrawn_at IS NULL)
      OR (NOT email_opt_in AND consented_at IS NULL AND withdrawn_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.member_newsletter_preferences IS
  'Account-szintu, sajat kezelesu hirlevel-hozzajarulas es kategoriapreferenciak. Email-cimet nem duplikal; a kampany snapshot a member_accounts kanonikus cimet hasznalja.';

CREATE TABLE public.member_newsletter_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL,
  congregation_id uuid NOT NULL,
  created_by_profile_id uuid NOT NULL,
  campaign_kind text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  recipient_snapshot_count integer,
  queued_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_newsletter_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT member_newsletter_campaigns_identity_tenant_key
    UNIQUE (id, congregation_id),
  CONSTRAINT member_newsletter_campaigns_creator_idempotency_key
    UNIQUE (created_by_profile_id, idempotency_key),
  CONSTRAINT member_newsletter_campaigns_congregation_fkey
    FOREIGN KEY (congregation_id)
    REFERENCES public.congregations(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT member_newsletter_campaigns_creator_fkey
    FOREIGN KEY (created_by_profile_id)
    REFERENCES public.profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT member_newsletter_campaigns_kind_check
    CHECK (campaign_kind IN ('general', 'announcements', 'events')),
  CONSTRAINT member_newsletter_campaigns_subject_check
    CHECK (
      subject = btrim(subject)
      AND char_length(subject) BETWEEN 1 AND 200
      AND subject !~ E'[\\n\\r\\x00]'
    ),
  CONSTRAINT member_newsletter_campaigns_body_check
    CHECK (
      body_text = btrim(body_text)
      AND char_length(body_text) BETWEEN 1 AND 50000
    ),
  CONSTRAINT member_newsletter_campaigns_status_check
    CHECK (status IN ('draft', 'queued', 'cancelled')),
  CONSTRAINT member_newsletter_campaigns_snapshot_count_check
    CHECK (recipient_snapshot_count IS NULL OR recipient_snapshot_count >= 0),
  CONSTRAINT member_newsletter_campaigns_cancel_reason_check
    CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 1000),
  CONSTRAINT member_newsletter_campaigns_revision_check CHECK (revision > 0),
  CONSTRAINT member_newsletter_campaigns_state_check
    CHECK (
      (
        status = 'draft'
        AND recipient_snapshot_count IS NULL
        AND queued_at IS NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
      )
      OR (
        status = 'queued'
        AND recipient_snapshot_count IS NOT NULL
        AND queued_at IS NOT NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
      )
      OR (
        status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.member_newsletter_campaigns IS
  'Lelkeszi hirlevelkampany. A draft RPC-bol jon letre; queue-zaskor egyszeri recipient snapshot keszul. Kulso worker protokoll nincs ebben a migracioban.';

CREATE INDEX member_newsletter_campaigns_tenant_status_idx
  ON public.member_newsletter_campaigns (
    congregation_id,
    status,
    created_at DESC,
    id
  );

CREATE TABLE public.member_newsletter_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  member_account_id uuid NOT NULL,
  person_id_snapshot integer NOT NULL,
  recipient_email text NOT NULL,
  recipient_display_name text NOT NULL,
  preferred_locale text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'queued',
  queued_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_newsletter_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT member_newsletter_deliveries_campaign_account_key
    UNIQUE (campaign_id, member_account_id),
  CONSTRAINT member_newsletter_deliveries_campaign_tenant_fkey
    FOREIGN KEY (campaign_id, congregation_id)
    REFERENCES public.member_newsletter_campaigns(id, congregation_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT member_newsletter_deliveries_account_fkey
    FOREIGN KEY (member_account_id)
    REFERENCES public.member_accounts(id)
    -- A delivery a kiküldési pillanatkép és audit része. Account hard delete
    -- nem tüntetheti el, mert attól a kampány exact számlálói beragadnának.
    -- A member account életciklusa ezért soft-delete; hard delete csak a
    -- deliveryk megőrzési idejének külön, auditált lezárása után lehetséges.
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT member_newsletter_deliveries_email_check
    CHECK (
      recipient_email = lower(btrim(recipient_email))
      AND char_length(recipient_email) BETWEEN 3 AND 320
      AND position('@' IN recipient_email) > 1
    ),
  CONSTRAINT member_newsletter_deliveries_name_check
    CHECK (
      recipient_display_name = btrim(recipient_display_name)
      AND char_length(recipient_display_name) BETWEEN 1 AND 200
    ),
  CONSTRAINT member_newsletter_deliveries_locale_check
    CHECK (preferred_locale IN ('hu', 'ro', 'en')),
  -- Tudatosan nincs processing/sent/failed allapot. Ezt csak a kesobbi kulso
  -- worker migracio bovitheti kontrollalt claim/complete RPC-vel.
  CONSTRAINT member_newsletter_deliveries_status_check
    CHECK (delivery_status IN ('queued', 'cancelled')),
  CONSTRAINT member_newsletter_deliveries_state_check
    CHECK (
      (delivery_status = 'queued' AND cancelled_at IS NULL)
      OR (delivery_status = 'cancelled' AND cancelled_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.member_newsletter_deliveries IS
  'Kampanyonkenti idempotens recipient snapshot es kulso workerre varo queue. Ez a schema csak queued/cancelled allapotot ismer, email kuldest nem vegez.';

CREATE INDEX member_newsletter_deliveries_campaign_status_idx
  ON public.member_newsletter_deliveries (
    campaign_id,
    delivery_status,
    queued_at,
    id
  );

CREATE INDEX member_newsletter_deliveries_tenant_status_idx
  ON public.member_newsletter_deliveries (
    congregation_id,
    delivery_status,
    queued_at,
    id
  );

CREATE INDEX member_newsletter_deliveries_account_idx
  ON public.member_newsletter_deliveries (member_account_id);

CREATE TABLE public.member_portal_data_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  actor_user_id uuid,
  actor_kind text NOT NULL,
  event_type text NOT NULL,
  congregation_id uuid,
  member_account_id uuid,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT member_portal_data_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT member_portal_data_audit_actor_kind_check
    CHECK (actor_kind IN ('member', 'staff', 'system')),
  CONSTRAINT member_portal_data_audit_event_type_check
    CHECK (char_length(event_type) BETWEEN 3 AND 120),
  CONSTRAINT member_portal_data_audit_subject_type_check
    CHECK (subject_type IN (
      'person_change_request',
      'newsletter_preference',
      'newsletter_campaign',
      'newsletter_delivery_batch'
    )),
  CONSTRAINT member_portal_data_audit_details_check
    CHECK (member_private.member_data_audit_details_is_valid(details))
);

COMMENT ON TABLE public.member_portal_data_audit_log IS
  'Append-only, zart allowlistes, PII-szegeny tagi adat/hirlevel audit. Email, telefon, nev, cim, szuletesi datum, subject/body es teljes patch tiltott.';

CREATE INDEX member_portal_data_audit_tenant_time_idx
  ON public.member_portal_data_audit_log (congregation_id, occurred_at DESC, id)
  WHERE congregation_id IS NOT NULL;

CREATE INDEX member_portal_data_audit_subject_idx
  ON public.member_portal_data_audit_log (subject_type, subject_id, occurred_at DESC);

-- A sajat befizetes RPC minden esetben id_szemely + congregation_id + deleted
-- predikatumot hasznal. Ez az exact access path a nagyobb live tabla miatt.
CREATE INDEX member_portal_befizetes_person_tenant_date_idx
  ON public.befizetes (id_szemely, congregation_id, datum DESC, id DESC)
  WHERE deleted = false AND id_szemely IS NOT NULL;

-- --------------------------------------------------------------------------
-- 3. Private auth-context es integritasi trigger-fuggvenyek
-- --------------------------------------------------------------------------

CREATE FUNCTION member_private.member_portal_current_member_context()
RETURNS TABLE (
  member_account_id uuid,
  person_link_id uuid,
  congregation_id uuid,
  person_id integer,
  account_email text,
  account_display_name text,
  account_locale text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    ma.id,
    l.id,
    l.congregation_id,
    l.person_id,
    ma.email,
    ma.display_name,
    ma.preferred_locale
  FROM public.member_accounts ma
  JOIN public.member_person_links l
    ON l.member_account_id = ma.id
   AND l.status = 'active'
  JOIN public.szemely s
    ON s.id = l.person_id
   AND s.congregation_id = l.congregation_id
  WHERE ma.auth_user_id = (SELECT auth.uid())
    AND ma.status = 'active'
    AND s.isvisible = true
  LIMIT 1;
$function$;

COMMENT ON FUNCTION member_private.member_portal_current_member_context() IS
  'DB-live self context: aktiv member account + aktiv person link + azonos tenantu, lathato szemely. JWT metadata authorization nincs.';

CREATE FUNCTION member_private.member_portal_data_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION member_private.member_person_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_account_auth_user_id uuid;
  v_account_status text;
  v_link_status text;
  v_link_account_id uuid;
  v_link_congregation_id uuid;
  v_link_person_id integer;
  v_person_congregation_id uuid;
  v_person_revision bigint;
  v_person_visible boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'Uj szemelyadat-modositas csak pending allapotban johet letre.'
        USING ERRCODE = '23514';
    END IF;

    SELECT ma.auth_user_id, ma.status
      INTO v_account_auth_user_id, v_account_status
    FROM public.member_accounts ma
    WHERE ma.id = NEW.member_account_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_account_auth_user_id IS DISTINCT FROM (SELECT auth.uid())
       OR v_account_status <> 'active' THEN
      RAISE EXCEPTION 'A modositas-kerelemhez aktiv sajat tagi account szukseges.'
        USING ERRCODE = '42501';
    END IF;

    SELECT
      l.status,
      l.member_account_id,
      l.congregation_id,
      l.person_id
      INTO
        v_link_status,
        v_link_account_id,
        v_link_congregation_id,
        v_link_person_id
    FROM public.member_person_links l
    WHERE l.id = NEW.person_link_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_link_status <> 'active'
       OR v_link_account_id IS DISTINCT FROM NEW.member_account_id
       OR v_link_congregation_id IS DISTINCT FROM NEW.congregation_id
       OR v_link_person_id IS DISTINCT FROM NEW.person_id THEN
      RAISE EXCEPTION 'A modositas-kerelem person-link/account/tenant azonossaga elter.'
        USING ERRCODE = '23514';
    END IF;

    SELECT s.congregation_id, s.revision, s.isvisible
      INTO v_person_congregation_id, v_person_revision, v_person_visible
    FROM public.szemely s
    WHERE s.id = NEW.person_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_person_congregation_id IS DISTINCT FROM NEW.congregation_id
       OR v_person_revision IS DISTINCT FROM NEW.base_person_revision
       OR v_person_visible IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'A modositas-kerelem szemely/tenant/base revision allapota elter.'
        USING ERRCODE = '40001';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.person_link_id IS DISTINCT FROM OLD.person_link_id
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.base_person_revision IS DISTINCT FROM OLD.base_person_revision
     OR NEW.requested_patch IS DISTINCT FROM OLD.requested_patch
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A modositas-kerelem identitasa, patch-e es base revisionje nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Lezart szemelyadat-modositas nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status NOT IN ('withdrawn', 'approved', 'rejected', 'conflict') THEN
    RAISE EXCEPTION 'Ervenytelen szemelyadat-modositas statuszatmenet: % -> %',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'withdrawn' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.member_accounts ma
      WHERE ma.id = NEW.member_account_id
        AND ma.auth_user_id = (SELECT auth.uid())
        AND ma.status <> 'deleted'
    ) THEN
      RAISE EXCEPTION 'Csak a sajat tagi account vonhatja vissza a kerelmet.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.reviewed_by_profile_id IS DISTINCT FROM (SELECT auth.uid())
       OR NOT member_private.member_portal_staff_can_review_congregation(
         NEW.congregation_id
       ) THEN
      RAISE EXCEPTION 'A review actor nem exact sajat-gyulekezeti aktiv lelkesz.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION member_private.member_newsletter_preference_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_account_status text;
  v_auth_user_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.member_account_id IS DISTINCT FROM OLD.member_account_id THEN
    RAISE EXCEPTION 'A hirlevel-preferencia account azonositoja nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  SELECT ma.status, ma.auth_user_id
    INTO v_account_status, v_auth_user_id
  FROM public.member_accounts ma
  WHERE ma.id = NEW.member_account_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_auth_user_id IS DISTINCT FROM (SELECT auth.uid())
     OR v_account_status = 'deleted' THEN
    RAISE EXCEPTION 'Hirlevel-preferencia csak a sajat, nem torolt accounthoz irhato.'
      USING ERRCODE = '42501';
  END IF;

  -- Uj opt-in csak aktiv account + aktiv link mellett engedelyezett. Opt-outot
  -- felfuggesztett account is mindig vegrehajthat.
  IF NEW.email_opt_in AND (
    v_account_status <> 'active'
    OR NOT EXISTS (
      SELECT 1
      FROM public.member_person_links l
      JOIN public.szemely s
        ON s.id = l.person_id
       AND s.congregation_id = l.congregation_id
      WHERE l.member_account_id = NEW.member_account_id
        AND l.status = 'active'
        AND s.isvisible = true
    )
  ) THEN
    RAISE EXCEPTION 'Hirlevel opt-in csak aktiv szemelykapcsolattal engedelyezett.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION member_private.member_newsletter_campaign_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'
       OR NEW.created_by_profile_id IS DISTINCT FROM (SELECT auth.uid())
       OR NOT member_private.member_portal_staff_can_review_congregation(
         NEW.congregation_id
       ) THEN
      RAISE EXCEPTION 'Kampanyt csak exact sajat-gyulekezeti lelkesz hozhat letre draftkent.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id
     OR NEW.campaign_kind IS DISTINCT FROM OLD.campaign_kind
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A kampany identitasa es tartalma letrehozas utan nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
       NEW.congregation_id
     ) THEN
    RAISE EXCEPTION 'A kampanyt csak exact sajat-gyulekezeti lelkesz allithatja.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('queued', 'cancelled'))
    OR (OLD.status = 'queued' AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Ervenytelen kampany-statuszatmenet: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'cancelled'
     AND (
       NEW.recipient_snapshot_count IS DISTINCT FROM OLD.recipient_snapshot_count
       OR NEW.queued_at IS DISTINCT FROM OLD.queued_at
     ) THEN
    RAISE EXCEPTION 'Cancel soran a recipient snapshot metaadata nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION member_private.member_newsletter_delivery_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_campaign_congregation_id uuid;
BEGIN
  SELECT c.congregation_id
    INTO v_campaign_congregation_id
  FROM public.member_newsletter_campaigns c
  WHERE c.id = NEW.campaign_id;

  IF NOT FOUND
     OR v_campaign_congregation_id IS DISTINCT FROM NEW.congregation_id
     OR NOT member_private.member_portal_staff_can_review_congregation(
       NEW.congregation_id
     ) THEN
    RAISE EXCEPTION 'A delivery snapshot kampanya/tenantja vagy lelkeszi actora elter.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.delivery_status <> 'queued' THEN
      RAISE EXCEPTION 'Uj delivery snapshot csak queued allapotban johet letre.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.person_id_snapshot IS DISTINCT FROM OLD.person_id_snapshot
     OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
     OR NEW.recipient_display_name IS DISTINCT FROM OLD.recipient_display_name
     OR NEW.preferred_locale IS DISTINCT FROM OLD.preferred_locale
     OR NEW.queued_at IS DISTINCT FROM OLD.queued_at
     OR OLD.delivery_status <> 'queued'
     OR NEW.delivery_status <> 'cancelled' THEN
    RAISE EXCEPTION 'A delivery snapshot csak queued -> cancelled iranyban modosithato.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION member_private.member_portal_data_audit_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION
    'A member_portal_data_audit_log append-only; UPDATE, DELETE es TRUNCATE tiltott.'
    USING ERRCODE = '55000';
END;
$function$;

-- Minden private helper kozvetlen hivasa tiltott. A public RPC-k postgres ownerrel
-- hivjak oket; a trigger-koteshez kulon EXECUTE grant nem kell.
REVOKE ALL ON FUNCTION member_private.member_portal_data_version()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_portal_current_member_context()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_person_patch_normalize(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_person_patch_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_data_audit_details_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_portal_data_touch()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_person_change_guard()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_newsletter_preference_guard()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_newsletter_campaign_guard()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_newsletter_delivery_guard()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_portal_data_audit_append_only_guard()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;

-- --------------------------------------------------------------------------
-- 4. Guard, revision es append-only trigger-k
-- --------------------------------------------------------------------------

CREATE TRIGGER member_person_changes_10_guard
  BEFORE INSERT OR UPDATE ON public.member_person_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_person_change_guard();

CREATE TRIGGER member_person_changes_90_touch
  BEFORE UPDATE ON public.member_person_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_data_touch();

CREATE TRIGGER member_newsletter_preferences_10_guard
  BEFORE INSERT OR UPDATE ON public.member_newsletter_preferences
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_newsletter_preference_guard();

CREATE TRIGGER member_newsletter_preferences_90_touch
  BEFORE UPDATE ON public.member_newsletter_preferences
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_data_touch();

CREATE TRIGGER member_newsletter_campaigns_10_guard
  BEFORE INSERT OR UPDATE ON public.member_newsletter_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_newsletter_campaign_guard();

CREATE TRIGGER member_newsletter_campaigns_90_touch
  BEFORE UPDATE ON public.member_newsletter_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_data_touch();

CREATE TRIGGER member_newsletter_deliveries_10_guard
  BEFORE INSERT OR UPDATE ON public.member_newsletter_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_newsletter_delivery_guard();

CREATE TRIGGER member_portal_data_audit_immutable_rows
  BEFORE UPDATE OR DELETE ON public.member_portal_data_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_data_audit_append_only_guard();

CREATE TRIGGER member_portal_data_audit_no_truncate
  BEFORE TRUNCATE ON public.member_portal_data_audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION member_private.member_portal_data_audit_append_only_guard();

-- --------------------------------------------------------------------------
-- 5. Self-only overview: minimalis szemelyadat, csaladfa, KIZAROLAG sajat fizetes
-- --------------------------------------------------------------------------

CREATE FUNCTION public.member_portal_my_overview(
  p_payment_limit integer DEFAULT 100,
  p_payment_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context record;
  v_result jsonb;
BEGIN
  IF p_payment_limit IS NULL OR p_payment_limit NOT BETWEEN 1 AND 200
     OR p_payment_offset IS NULL OR p_payment_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Ervenytelen payment pagination (limit 1..200, offset 0..100000).'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_context
  FROM member_private.member_portal_current_member_context();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktiv tagi account es aktiv szemelykapcsolat szukseges.'
      USING ERRCODE = '42501';
  END IF;

  WITH canonical_relationships AS (
    SELECT
      'canonical:' || sk.id::text AS edge_key,
      CASE
        WHEN sk.id_szemely_1 = v_context.person_id THEN sk.id_szemely_2
        ELSE sk.id_szemely_1
      END AS related_person_id,
      CASE
        WHEN sk.tipus IN ('hazastars', 'testver', 'felteszver') THEN sk.tipus
        WHEN sk.tipus = 'szulo_gyermek'
          AND sk.id_szemely_1 = v_context.person_id THEN 'gyermek'
        WHEN sk.tipus = 'szulo_gyermek' THEN 'szulo'
        WHEN sk.tipus = 'nagyszulo_unoka'
          AND sk.id_szemely_1 = v_context.person_id THEN 'unoka'
        WHEN sk.tipus = 'nagyszulo_unoka' THEN 'nagyszulo'
        WHEN sk.tipus = 'mostohaszulo_mostohagyermek'
          AND sk.id_szemely_1 = v_context.person_id THEN 'mostohagyermek'
        WHEN sk.tipus = 'mostohaszulo_mostohagyermek' THEN 'mostohaszulo'
        WHEN sk.tipus = 'gondviselo'
          AND sk.id_szemely_1 = v_context.person_id THEN 'gondozott'
        WHEN sk.tipus = 'gondviselo' THEN 'gondviselo'
        WHEN sk.tipus = 'orokbe_fogado'
          AND sk.id_szemely_1 = v_context.person_id THEN 'orokbefogadott'
        WHEN sk.tipus = 'orokbe_fogado' THEN 'orokbefogado'
        ELSE 'egyeb'
      END AS relationship,
      sk.ver_szerinti,
      1 AS source_priority,
      'szemely_kapcsolat'::text AS source
    FROM public.szemely_kapcsolat sk
    JOIN public.szemely related
      ON related.id = CASE
        WHEN sk.id_szemely_1 = v_context.person_id THEN sk.id_szemely_2
        ELSE sk.id_szemely_1
      END
    WHERE sk.congregation_id = v_context.congregation_id
      AND sk.ervenyes_ig IS NULL
      AND v_context.person_id IN (sk.id_szemely_1, sk.id_szemely_2)
      AND related.congregation_id = v_context.congregation_id
      AND related.isvisible = true
  ), legacy_families AS (
    SELECT c.id, c.id_ferfi, c.id_no
    FROM public.csalad c
    WHERE c.isaktiv = true
      AND (
        v_context.person_id IN (c.id_ferfi, c.id_no)
        OR EXISTS (
          SELECT 1
          FROM public.gyerek own_child
          WHERE own_child.id_csalad = c.id
            AND own_child.id_szemely = v_context.person_id
        )
      )
  ), legacy_relationships AS (
    SELECT
      'legacy-spouse:' || lf.id::text AS edge_key,
      CASE
        WHEN lf.id_ferfi = v_context.person_id THEN lf.id_no
        ELSE lf.id_ferfi
      END AS related_person_id,
      'hazastars'::text AS relationship,
      false AS ver_szerinti,
      2 AS source_priority,
      'csalad'::text AS source
    FROM legacy_families lf
    WHERE v_context.person_id IN (lf.id_ferfi, lf.id_no)
      AND CASE
        WHEN lf.id_ferfi = v_context.person_id THEN lf.id_no
        ELSE lf.id_ferfi
      END IS NOT NULL

    UNION ALL

    SELECT
      'legacy-child:' || g.id::text,
      g.id_szemely,
      'gyermek'::text,
      true,
      2,
      'gyerek'::text
    FROM legacy_families lf
    JOIN public.gyerek g ON g.id_csalad = lf.id
    WHERE v_context.person_id IN (lf.id_ferfi, lf.id_no)
      AND g.id_szemely <> v_context.person_id

    UNION ALL

    SELECT
      'legacy-parent-male:' || lf.id::text,
      lf.id_ferfi,
      'szulo'::text,
      true,
      2,
      'gyerek'::text
    FROM legacy_families lf
    WHERE lf.id_ferfi IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.gyerek g
        WHERE g.id_csalad = lf.id AND g.id_szemely = v_context.person_id
      )

    UNION ALL

    SELECT
      'legacy-parent-female:' || lf.id::text,
      lf.id_no,
      'szulo'::text,
      true,
      2,
      'gyerek'::text
    FROM legacy_families lf
    WHERE lf.id_no IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.gyerek g
        WHERE g.id_csalad = lf.id AND g.id_szemely = v_context.person_id
      )

    UNION ALL

    SELECT
      'legacy-sibling:' || sibling.id::text,
      sibling.id_szemely,
      'testver'::text,
      true,
      2,
      'gyerek'::text
    FROM legacy_families lf
    JOIN public.gyerek sibling ON sibling.id_csalad = lf.id
    WHERE sibling.id_szemely <> v_context.person_id
      AND EXISTS (
        SELECT 1 FROM public.gyerek own_child
        WHERE own_child.id_csalad = lf.id
          AND own_child.id_szemely = v_context.person_id
      )
  ), all_relationships AS (
    SELECT * FROM canonical_relationships
    UNION ALL
    SELECT * FROM legacy_relationships
  ), ranked_relationships AS (
    SELECT
      ar.*,
      pg_catalog.row_number() OVER (
        PARTITION BY ar.related_person_id, ar.relationship
        ORDER BY ar.source_priority, ar.edge_key
      ) AS relation_rank
    FROM all_relationships ar
    JOIN public.szemely related ON related.id = ar.related_person_id
    WHERE ar.related_person_id IS NOT NULL
      AND related.congregation_id = v_context.congregation_id
      AND related.isvisible = true
  ), relationships_json AS (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'person_id', related.id,
          'display_name', COALESCE(
            NULLIF(pg_catalog.concat_ws(
              ' ',
              NULLIF(pg_catalog.btrim(related.csaladnev), ''),
              NULLIF(pg_catalog.btrim(related.k_nev), '')
            ), ''),
            NULLIF(pg_catalog.btrim(related.szcs_nev), ''),
            'Szemely #' || related.id::text
          ),
          'birth_year', CASE
            WHEN related.sz_datum IS NULL THEN NULL
            ELSE EXTRACT(year FROM related.sz_datum)::integer
          END,
          'deceased', related.meghalt,
          'relationship', rr.relationship,
          'blood_relative', rr.ver_szerinti,
          'source', rr.source
        )
        ORDER BY rr.relationship, related.csaladnev, related.k_nev, related.id
      ),
      '[]'::jsonb
    ) AS value
    FROM ranked_relationships rr
    JOIN public.szemely related ON related.id = rr.related_person_id
    WHERE rr.relation_rank = 1
  ), households_json AS (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'household_id', h.id,
          'name', h.megnevezes,
          'members', (
            SELECT COALESCE(
              pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'person_id', household_person.id,
                  'display_name', COALESCE(
                    NULLIF(pg_catalog.concat_ws(
                      ' ',
                      NULLIF(pg_catalog.btrim(household_person.csaladnev), ''),
                      NULLIF(pg_catalog.btrim(household_person.k_nev), '')
                    ), ''),
                    NULLIF(pg_catalog.btrim(household_person.szcs_nev), ''),
                    'Szemely #' || household_person.id::text
                  ),
                  'role', household_member.szerep,
                  'primary', household_member.is_primary,
                  'self', household_person.id = v_context.person_id
                )
                ORDER BY
                  household_member.is_primary DESC,
                  household_member.szerep,
                  household_person.csaladnev,
                  household_person.k_nev,
                  household_person.id
              ),
              '[]'::jsonb
            )
            FROM public.haztartas_tag household_member
            JOIN public.szemely household_person
              ON household_person.id = household_member.id_szemely
             AND household_person.congregation_id = v_context.congregation_id
             AND household_person.isvisible = true
            WHERE household_member.id_haztartas = h.id
              AND household_member.congregation_id = v_context.congregation_id
              AND (
                household_member.ervenyes_ig IS NULL
                OR household_member.ervenyes_ig >= CURRENT_DATE
              )
          )
        )
        ORDER BY h.megnevezes NULLS LAST, h.id
      ),
      '[]'::jsonb
    ) AS value
    FROM public.haztartas h
    JOIN public.haztartas_tag own_membership
      ON own_membership.id_haztartas = h.id
     AND own_membership.id_szemely = v_context.person_id
     AND own_membership.congregation_id = v_context.congregation_id
    WHERE h.congregation_id = v_context.congregation_id
      AND h.isaktiv = true
      AND (own_membership.ervenyes_ig IS NULL OR own_membership.ervenyes_ig >= CURRENT_DATE)
  ), payment_page AS (
    SELECT
      b.id,
      b.datum,
      b.osszeg,
      b.osszeg_ron,
      b.fizetettev,
      b.nyugta,
      b.iratszam,
      b.id_befizetescel,
      b.stornozott,
      bc.nev AS payment_purpose
    FROM public.befizetes b
    LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
    WHERE b.id_szemely = v_context.person_id
      AND b.congregation_id = v_context.congregation_id
      AND b.deleted = false
    ORDER BY b.datum DESC, b.id DESC
    LIMIT p_payment_limit
    OFFSET p_payment_offset
  ), payments_json AS (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', p.id,
          'date', p.datum,
          'amount', p.osszeg,
          'amount_ron', p.osszeg_ron,
          'payment_year', p.fizetettev,
          'receipt_number', p.nyugta,
          'document_number', p.iratszam,
          'purpose_id', p.id_befizetescel,
          'purpose', p.payment_purpose,
          'voided', p.stornozott
        )
        ORDER BY p.datum DESC, p.id DESC
      ),
      '[]'::jsonb
    ) AS value
    FROM payment_page p
  ), payment_count AS (
    SELECT pg_catalog.count(*)::bigint AS value
    FROM public.befizetes b
    WHERE b.id_szemely = v_context.person_id
      AND b.congregation_id = v_context.congregation_id
      AND b.deleted = false
  )
  SELECT pg_catalog.jsonb_build_object(
    'account', pg_catalog.jsonb_build_object(
      'member_account_id', v_context.member_account_id,
      'email', v_context.account_email,
      'display_name', v_context.account_display_name,
      'preferred_locale', v_context.account_locale,
      'congregation_id', v_context.congregation_id
    ),
    'person', pg_catalog.jsonb_build_object(
      'person_id', s.id,
      'revision', s.revision,
      'updated_at', s.updated_at,
      'szcs_nev', s.szcs_nev,
      'k_nev', s.k_nev,
      'csaladnev', s.csaladnev,
      'ferjk_nev', s.ferjk_nev,
      'apjaneve', s.apjaneve,
      'anyjaneve', s.anyjaneve,
      'sz_datum', s.sz_datum,
      'vallas', s.vallas,
      'foglalkozas', s.foglalkozas,
      'nemzetiseg', s.nemzetiseg,
      'address', pg_catalog.jsonb_build_object(
        'house_number', s.c_szam,
        'building', s.c_tombhaz,
        'staircase', s.c_lepcsohaz,
        'floor', s.c_emelet,
        'door', s.c_ajto,
        'postal_code', s.c_szcim
      ),
      'phone', s.telefon,
      'email', s.email,
      'photo_consent', s.photo_consent,
      'mailing_consent', s.mailing_consent,
      'social_profile_url', s.social_profil_url
    ),
    'family_tree', pg_catalog.jsonb_build_object(
      'relationships', (SELECT rj.value FROM relationships_json rj),
      'households', (SELECT hj.value FROM households_json hj)
    ),
    'payments', pg_catalog.jsonb_build_object(
      'total_count', (SELECT pc.value FROM payment_count pc),
      'limit', p_payment_limit,
      'offset', p_payment_offset,
      'items', (SELECT pj.value FROM payments_json pj)
    )
  )
    INTO v_result
  FROM public.szemely s
  WHERE s.id = v_context.person_id
    AND s.congregation_id = v_context.congregation_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'A linkelt szemely rekord idokozben nem erheto el.'
      USING ERRCODE = '40001';
  END IF;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.member_portal_my_overview(integer, integer) IS
  'Self-only overview. Aktiv account+link; minimalis szemely/csaladfa; befizetes filter kotelezoen id_szemely + congregation_id + deleted=false.';

-- --------------------------------------------------------------------------
-- 6. Szemelyadat-modositas: submit, withdraw, staff list es atomic review
-- --------------------------------------------------------------------------

CREATE FUNCTION public.member_portal_submit_person_change(
  p_requested_patch jsonb,
  p_base_person_revision bigint,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_user_id uuid := (SELECT auth.uid());
  v_account_id uuid;
  v_link_id uuid;
  v_congregation_id uuid;
  v_person_id integer;
  v_account_status text;
  v_link_status text;
  v_person_revision bigint;
  v_person_visible boolean;
  v_patch jsonb;
  v_existing public.member_person_change_requests%ROWTYPE;
  v_request_id uuid;
  v_changed_fields jsonb;
BEGIN
  IF v_auth_user_id IS NULL
     OR p_client_request_id IS NULL
     OR p_base_person_revision IS NULL
     OR p_base_person_revision < 0
     OR p_requested_patch IS NULL
     OR pg_catalog.octet_length(p_requested_patch::text) > 20000 THEN
    RAISE EXCEPTION 'Hianyos vagy ervenytelen szemelyadat-modositas parameter.'
      USING ERRCODE = '22023';
  END IF;

  v_patch := member_private.member_person_patch_normalize(p_requested_patch);

  IF NOT member_private.member_person_patch_is_valid(v_patch) THEN
    RAISE EXCEPTION 'A requested_patch ismeretlen kulcsot vagy ervenytelen erteket tartalmaz.'
      USING ERRCODE = '22023';
  END IF;

  IF v_patch ? 'sz_datum'
     AND pg_catalog.jsonb_typeof(v_patch -> 'sz_datum') <> 'null'
     AND (v_patch ->> 'sz_datum')::date > CURRENT_DATE THEN
    RAISE EXCEPTION 'A szuletesi datum nem lehet jovobeli.'
      USING ERRCODE = '22023';
  END IF;

  SELECT ma.id
    INTO v_account_id
  FROM public.member_accounts ma
  WHERE ma.auth_user_id = v_auth_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nincs sajat tagi account.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-account:' || v_account_id::text, 0)
  );

  SELECT ma.status
    INTO v_account_status
  FROM public.member_accounts ma
  WHERE ma.id = v_account_id
    AND ma.auth_user_id = v_auth_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Aktiv sajat tagi account szukseges.' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.status, l.congregation_id, l.person_id
    INTO v_link_id, v_link_status, v_congregation_id, v_person_id
  FROM public.member_person_links l
  WHERE l.member_account_id = v_account_id
    AND l.status = 'active'
  FOR UPDATE;

  IF NOT FOUND OR v_link_status <> 'active' THEN
    RAISE EXCEPTION 'Aktiv szemelykapcsolat szukseges.' USING ERRCODE = '42501';
  END IF;

  SELECT s.revision, s.isvisible
    INTO v_person_revision, v_person_visible
  FROM public.szemely s
  WHERE s.id = v_person_id
    AND s.congregation_id = v_congregation_id
  FOR UPDATE;

  IF NOT FOUND OR v_person_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A linkelt szemely nem aktiv/lathato.' USING ERRCODE = '42501';
  END IF;

  -- Ugyanaz a kliens idempotenciakulcs ugyanazzal a payload-dal ugyanazt a
  -- valaszt adja. Ugyanaz a kulcs mas tartalommal explicit konfliktus.
  SELECT r.*
    INTO v_existing
  FROM public.member_person_change_requests r
  WHERE r.member_account_id = v_account_id
    AND r.client_request_id = p_client_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.person_link_id IS DISTINCT FROM v_link_id
       OR v_existing.congregation_id IS DISTINCT FROM v_congregation_id
       OR v_existing.person_id IS DISTINCT FROM v_person_id
       OR v_existing.base_person_revision IS DISTINCT FROM p_base_person_revision
       OR v_existing.requested_patch IS DISTINCT FROM v_patch THEN
      RAISE EXCEPTION 'Az idempotenciakulcs mar mas szemelyadat-kereshez tartozik.'
        USING ERRCODE = '23505';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'request_id', v_existing.id,
      'status', v_existing.status,
      'base_person_revision', v_existing.base_person_revision
    );
  END IF;

  IF v_person_revision IS DISTINCT FROM p_base_person_revision THEN
    RAISE EXCEPTION 'A szemely rekord idokozben valtozott; frissitsd az adatlapot.'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.member_person_change_requests (
    client_request_id,
    member_account_id,
    person_link_id,
    congregation_id,
    person_id,
    base_person_revision,
    requested_patch
  ) VALUES (
    p_client_request_id,
    v_account_id,
    v_link_id,
    v_congregation_id,
    v_person_id,
    p_base_person_revision,
    v_patch
  )
  RETURNING id INTO v_request_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k.key) ORDER BY k.key),
    '[]'::jsonb
  )
    INTO v_changed_fields
  FROM pg_catalog.jsonb_object_keys(v_patch) k(key);

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id,
    actor_kind,
    event_type,
    congregation_id,
    member_account_id,
    subject_type,
    subject_id,
    details
  ) VALUES (
    v_auth_user_id,
    'member',
    'person_change_submitted',
    v_congregation_id,
    v_account_id,
    'person_change_request',
    v_request_id,
    pg_catalog.jsonb_build_object(
      'new_status', 'pending',
      'changed_fields', v_changed_fields,
      'base_revision', p_base_person_revision
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request_id,
    'status', 'pending',
    'base_person_revision', p_base_person_revision
  );
END;
$function$;

CREATE FUNCTION public.member_portal_withdraw_person_change(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_user_id uuid := (SELECT auth.uid());
  v_account_id uuid;
  v_request public.member_person_change_requests%ROWTYPE;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_auth_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Hianyos withdraw parameter.' USING ERRCODE = '22023';
  END IF;

  SELECT ma.id
    INTO v_account_id
  FROM public.member_accounts ma
  WHERE ma.auth_user_id = v_auth_user_id
    AND ma.status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nincs sajat tagi account.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-account:' || v_account_id::text, 0)
  );

  PERFORM ma.id
  FROM public.member_accounts ma
  WHERE ma.id = v_account_id
    AND ma.auth_user_id = v_auth_user_id
    AND ma.status <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi account mar nem elerheto.' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
    INTO v_request
  FROM public.member_person_change_requests r
  WHERE r.id = p_request_id
    AND r.member_account_id = v_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A sajat modositas-kerelem nem talalhato.' USING ERRCODE = '42501';
  END IF;

  IF v_request.status = 'withdrawn' THEN
    RETURN pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'status', v_request.status
    );
  ELSIF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Csak pending modositas-kerelem vonhato vissza.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_person_change_requests r
  SET status = 'withdrawn', withdrawn_at = v_now
  WHERE r.id = v_request.id;

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id, actor_kind, event_type, congregation_id,
    member_account_id, subject_type, subject_id, details
  ) VALUES (
    v_auth_user_id, 'member', 'person_change_withdrawn',
    v_request.congregation_id, v_account_id, 'person_change_request',
    v_request.id,
    pg_catalog.jsonb_build_object(
      'old_status', 'pending',
      'new_status', 'withdrawn'
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', 'withdrawn'
  );
END;
$function$;

CREATE FUNCTION public.member_portal_staff_list_person_changes(
  p_congregation_id uuid,
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, 'pending')));
  v_result jsonb;
BEGIN
  IF p_congregation_id IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
     OR v_status NOT IN (
       'all', 'pending', 'withdrawn', 'approved', 'rejected', 'conflict'
     ) THEN
    RAISE EXCEPTION 'Ervenytelen staff list parameter.' USING ERRCODE = '22023';
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
       p_congregation_id
     ) THEN
    RAISE EXCEPTION 'Nincs exact lelkeszi jogosultsag erre a gyulekezetre.'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'congregation_id', p_congregation_id,
    'status_filter', v_status,
    'items', COALESCE(
      pg_catalog.jsonb_agg(item.payload ORDER BY item.submitted_at, item.id),
      '[]'::jsonb
    )
  )
    INTO v_result
  FROM (
    SELECT
      r.id,
      r.submitted_at,
      pg_catalog.jsonb_build_object(
        'request_id', r.id,
        'status', r.status,
        'submitted_at', r.submitted_at,
        'reviewed_at', r.reviewed_at,
        'member_account_id', r.member_account_id,
        'account_display_name', ma.display_name,
        'account_email', ma.email,
        'person_id', r.person_id,
        'person_display_name', COALESCE(
          NULLIF(pg_catalog.concat_ws(
            ' ',
            NULLIF(pg_catalog.btrim(s.csaladnev), ''),
            NULLIF(pg_catalog.btrim(s.k_nev), '')
          ), ''),
          NULLIF(pg_catalog.btrim(s.szcs_nev), ''),
          'Szemely #' || s.id::text
        ),
        'base_person_revision', r.base_person_revision,
        'current_person_revision', s.revision,
        'requested_patch', r.requested_patch,
        'decision_message', r.decision_message,
        'applied_person_revision', r.applied_person_revision
      ) AS payload
    FROM public.member_person_change_requests r
    JOIN public.member_accounts ma ON ma.id = r.member_account_id
    JOIN public.szemely s
      ON s.id = r.person_id
     AND s.congregation_id = r.congregation_id
    WHERE r.congregation_id = p_congregation_id
      AND (v_status = 'all' OR r.status = v_status)
    ORDER BY r.submitted_at, r.id
    LIMIT p_limit
  ) item;

  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.member_portal_staff_review_person_change(
  p_request_id uuid,
  p_decision text,
  p_decision_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_decision text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_decision, '')));
  v_message text := NULLIF(pg_catalog.btrim(COALESCE(p_decision_message, '')), '');
  v_request public.member_person_change_requests%ROWTYPE;
  v_account_status text;
  v_link_status text;
  v_person_revision bigint;
  v_applied_revision bigint;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_changed_fields jsonb;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL
     OR v_decision NOT IN ('approve', 'reject')
     OR (v_message IS NOT NULL AND pg_catalog.char_length(v_message) > 2000)
     OR (v_decision = 'reject' AND v_message IS NULL) THEN
    RAISE EXCEPTION 'Ervenytelen staff review parameter.' USING ERRCODE = '22023';
  END IF;

  SELECT r.*
    INTO v_request
  FROM public.member_person_change_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND
     OR NOT member_private.member_portal_staff_can_review_congregation(
       v_request.congregation_id
     ) THEN
    RAISE EXCEPTION 'A modositas-kerelem nem talalhato vagy nem sajat gyulekezeti.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'member-account:' || v_request.member_account_id::text,
      0
    )
  );

  SELECT ma.status
    INTO v_account_status
  FROM public.member_accounts ma
  WHERE ma.id = v_request.member_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A modositas-kerelem accountja mar nem letezik.'
      USING ERRCODE = '23503';
  END IF;

  SELECT r.*
    INTO v_request
  FROM public.member_person_change_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT member_private.member_portal_staff_can_review_congregation(
       v_request.congregation_id
     ) THEN
    RAISE EXCEPTION 'A lockolt modositas-kerelem tenantja elter.'
      USING ERRCODE = '42501';
  END IF;

  IF (v_request.status = 'approved' AND v_decision = 'approve')
     OR (v_request.status = 'rejected' AND v_decision = 'reject')
     OR (v_request.status = 'conflict' AND v_decision = 'approve') THEN
    RETURN pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'status', v_request.status,
      'applied_person_revision', v_request.applied_person_revision
    );
  ELSIF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'A modositas-kerelem mar terminalis allapotban van: %',
      v_request.status
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k.key) ORDER BY k.key),
    '[]'::jsonb
  )
    INTO v_changed_fields
  FROM pg_catalog.jsonb_object_keys(v_request.requested_patch) k(key);

  -- A lelkesz egy meg idokozben felfuggesztett account/link kerelmet is le
  -- tud zarni elutasitassal. Szemelyadatot csak az approve ag irhat, ahhoz
  -- lent mar tovabbra is aktiv account, aktiv link es lathato szemely kell.
  IF v_decision = 'reject' THEN
    UPDATE public.member_person_change_requests r
    SET status = 'rejected',
        reviewed_at = v_now,
        reviewed_by_profile_id = v_actor,
        decision_message = v_message
    WHERE r.id = v_request.id;

    INSERT INTO public.member_portal_data_audit_log (
      actor_user_id, actor_kind, event_type, congregation_id,
      member_account_id, subject_type, subject_id, details
    ) VALUES (
      v_actor, 'staff', 'person_change_rejected', v_request.congregation_id,
      v_request.member_account_id, 'person_change_request', v_request.id,
      pg_catalog.jsonb_build_object(
        'old_status', 'pending',
        'new_status', 'rejected',
        'changed_fields', v_changed_fields,
        'base_revision', v_request.base_person_revision
      )
    );

    RETURN pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'status', 'rejected'
    );
  END IF;

  SELECT l.status
    INTO v_link_status
  FROM public.member_person_links l
  WHERE l.id = v_request.person_link_id
    AND l.member_account_id = v_request.member_account_id
    AND l.congregation_id = v_request.congregation_id
    AND l.person_id = v_request.person_id
  FOR UPDATE;

  IF NOT FOUND OR v_link_status <> 'active' OR v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Approve/reject elott aktiv account es aktiv, azonos person-link szukseges.'
      USING ERRCODE = '55000';
  END IF;

  SELECT s.revision
    INTO v_person_revision
  FROM public.szemely s
  WHERE s.id = v_request.person_id
    AND s.congregation_id = v_request.congregation_id
    AND s.isvisible = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A linkelt szemely mar nem aktiv/lathato.' USING ERRCODE = '55000';
  END IF;

  -- Stale base revisionnel semmilyen szemely mezot nem irunk. A request
  -- terminalis conflict allapotot kap, igy a tag friss adatbol uj kerest kuldhet.
  IF v_person_revision IS DISTINCT FROM v_request.base_person_revision THEN
    UPDATE public.member_person_change_requests r
    SET status = 'conflict',
        reviewed_at = v_now,
        reviewed_by_profile_id = v_actor,
        decision_message = 'A nyilvantartasi rekord idokozben megvaltozott; uj kerelem szukseges.'
    WHERE r.id = v_request.id;

    INSERT INTO public.member_portal_data_audit_log (
      actor_user_id, actor_kind, event_type, congregation_id,
      member_account_id, subject_type, subject_id, details
    ) VALUES (
      v_actor, 'staff', 'person_change_conflict', v_request.congregation_id,
      v_request.member_account_id, 'person_change_request', v_request.id,
      pg_catalog.jsonb_build_object(
        'old_status', 'pending',
        'new_status', 'conflict',
        'changed_fields', v_changed_fields,
        'base_revision', v_request.base_person_revision
      )
    );

    RETURN pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'status', 'conflict',
      'base_person_revision', v_request.base_person_revision,
      'current_person_revision', v_person_revision
    );
  END IF;

  -- Zart, statikus SET lista: dinamikus SQL nincs, ismeretlen oszlop nem juthat
  -- at. A WHERE revision optimistic lock, a live szemely trigger base+1-re bumpol.
  UPDATE public.szemely s
  SET
    szcs_nev = CASE WHEN v_request.requested_patch ? 'szcs_nev'
      THEN v_request.requested_patch ->> 'szcs_nev' ELSE s.szcs_nev END,
    k_nev = CASE WHEN v_request.requested_patch ? 'k_nev'
      THEN v_request.requested_patch ->> 'k_nev' ELSE s.k_nev END,
    csaladnev = CASE WHEN v_request.requested_patch ? 'csaladnev'
      THEN v_request.requested_patch ->> 'csaladnev' ELSE s.csaladnev END,
    ferjk_nev = CASE WHEN v_request.requested_patch ? 'ferjk_nev'
      THEN v_request.requested_patch ->> 'ferjk_nev' ELSE s.ferjk_nev END,
    apjaneve = CASE WHEN v_request.requested_patch ? 'apjaneve'
      THEN v_request.requested_patch ->> 'apjaneve' ELSE s.apjaneve END,
    anyjaneve = CASE WHEN v_request.requested_patch ? 'anyjaneve'
      THEN v_request.requested_patch ->> 'anyjaneve' ELSE s.anyjaneve END,
    sz_datum = CASE WHEN v_request.requested_patch ? 'sz_datum'
      THEN (v_request.requested_patch ->> 'sz_datum')::date ELSE s.sz_datum END,
    vallas = CASE WHEN v_request.requested_patch ? 'vallas'
      THEN v_request.requested_patch ->> 'vallas' ELSE s.vallas END,
    foglalkozas = CASE WHEN v_request.requested_patch ? 'foglalkozas'
      THEN v_request.requested_patch ->> 'foglalkozas' ELSE s.foglalkozas END,
    nemzetiseg = CASE WHEN v_request.requested_patch ? 'nemzetiseg'
      THEN v_request.requested_patch ->> 'nemzetiseg' ELSE s.nemzetiseg END,
    c_szam = CASE WHEN v_request.requested_patch ? 'c_szam'
      THEN v_request.requested_patch ->> 'c_szam' ELSE s.c_szam END,
    c_tombhaz = CASE WHEN v_request.requested_patch ? 'c_tombhaz'
      THEN v_request.requested_patch ->> 'c_tombhaz' ELSE s.c_tombhaz END,
    c_lepcsohaz = CASE WHEN v_request.requested_patch ? 'c_lepcsohaz'
      THEN v_request.requested_patch ->> 'c_lepcsohaz' ELSE s.c_lepcsohaz END,
    c_ajto = CASE WHEN v_request.requested_patch ? 'c_ajto'
      THEN v_request.requested_patch ->> 'c_ajto' ELSE s.c_ajto END,
    c_emelet = CASE WHEN v_request.requested_patch ? 'c_emelet'
      THEN v_request.requested_patch ->> 'c_emelet' ELSE s.c_emelet END,
    c_szcim = CASE WHEN v_request.requested_patch ? 'c_szcim'
      THEN v_request.requested_patch ->> 'c_szcim' ELSE s.c_szcim END,
    telefon = CASE WHEN v_request.requested_patch ? 'telefon'
      THEN v_request.requested_patch ->> 'telefon' ELSE s.telefon END,
    email = CASE WHEN v_request.requested_patch ? 'email'
      THEN v_request.requested_patch ->> 'email' ELSE s.email END,
    photo_consent = CASE WHEN v_request.requested_patch ? 'photo_consent'
      THEN (v_request.requested_patch ->> 'photo_consent')::boolean
      ELSE s.photo_consent END,
    mailing_consent = CASE WHEN v_request.requested_patch ? 'mailing_consent'
      THEN (v_request.requested_patch ->> 'mailing_consent')::boolean
      ELSE s.mailing_consent END,
    social_profil_url = CASE WHEN v_request.requested_patch ? 'social_profil_url'
      THEN v_request.requested_patch ->> 'social_profil_url'
      ELSE s.social_profil_url END
  WHERE s.id = v_request.person_id
    AND s.congregation_id = v_request.congregation_id
    AND s.revision = v_request.base_person_revision
    AND s.isvisible = true
  RETURNING s.revision INTO v_applied_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Optimistic szemely update elvesztett versenyhelyzet; tranzakcio rollback.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.member_person_change_requests r
  SET status = 'approved',
      reviewed_at = v_now,
      reviewed_by_profile_id = v_actor,
      decision_message = v_message,
      applied_person_revision = v_applied_revision
  WHERE r.id = v_request.id;

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id, actor_kind, event_type, congregation_id,
    member_account_id, subject_type, subject_id, details
  ) VALUES (
    v_actor, 'staff', 'person_change_approved', v_request.congregation_id,
    v_request.member_account_id, 'person_change_request', v_request.id,
    pg_catalog.jsonb_build_object(
      'old_status', 'pending',
      'new_status', 'approved',
      'changed_fields', v_changed_fields,
      'base_revision', v_request.base_person_revision,
      'applied_revision', v_applied_revision
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', 'approved',
    'applied_person_revision', v_applied_revision
  );
END;
$function$;

-- --------------------------------------------------------------------------
-- 7. Self-only hirlevel preferenciak
-- --------------------------------------------------------------------------

CREATE FUNCTION public.member_portal_set_newsletter_preferences(
  p_email_opt_in boolean,
  p_announcements_opt_in boolean,
  p_events_opt_in boolean,
  p_preferred_locale text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_account_id uuid;
  v_account_status text;
  v_account_locale text;
  v_congregation_id uuid;
  v_locale text;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_existing public.member_newsletter_preferences%ROWTYPE;
  v_result public.member_newsletter_preferences%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR p_email_opt_in IS NULL
     OR p_announcements_opt_in IS NULL
     OR p_events_opt_in IS NULL THEN
    RAISE EXCEPTION 'Hianyos hirlevel-preferencia parameter.' USING ERRCODE = '22023';
  END IF;

  SELECT ma.id
    INTO v_account_id
  FROM public.member_accounts ma
  WHERE ma.auth_user_id = v_actor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nincs sajat tagi account.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-account:' || v_account_id::text, 0)
  );

  SELECT ma.status, ma.preferred_locale
    INTO v_account_status, v_account_locale
  FROM public.member_accounts ma
  WHERE ma.id = v_account_id
    AND ma.auth_user_id = v_actor
  FOR UPDATE;

  IF NOT FOUND OR v_account_status = 'deleted' THEN
    RAISE EXCEPTION 'Torolt vagy hianyzo tagi account preferenciaja nem irhato.'
      USING ERRCODE = '42501';
  END IF;

  v_locale := pg_catalog.lower(
    pg_catalog.btrim(COALESCE(p_preferred_locale, v_account_locale, 'hu'))
  );
  IF v_locale NOT IN ('hu', 'ro', 'en') THEN
    RAISE EXCEPTION 'Ervenytelen hirlevel locale.' USING ERRCODE = '22023';
  END IF;

  SELECT l.congregation_id
    INTO v_congregation_id
  FROM public.member_person_links l
  WHERE l.member_account_id = v_account_id
  ORDER BY
    CASE l.status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
    l.created_at DESC,
    l.id
  LIMIT 1;

  IF v_congregation_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'newsletter-congregation:' || v_congregation_id::text,
        0
      )
    );
  END IF;

  SELECT p.*
    INTO v_existing
  FROM public.member_newsletter_preferences p
  WHERE p.member_account_id = v_account_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.member_newsletter_preferences p
    SET email_opt_in = p_email_opt_in,
        announcements_opt_in = p_announcements_opt_in,
        events_opt_in = p_events_opt_in,
        preferred_locale = v_locale,
        consented_at = CASE
          WHEN p_email_opt_in THEN
            CASE WHEN p.email_opt_in THEN p.consented_at ELSE v_now END
          ELSE NULL
        END,
        withdrawn_at = CASE
          WHEN p_email_opt_in THEN NULL
          ELSE CASE WHEN p.email_opt_in THEN v_now ELSE COALESCE(p.withdrawn_at, v_now) END
        END
    WHERE p.member_account_id = v_account_id
    RETURNING p.* INTO v_result;
  ELSE
    INSERT INTO public.member_newsletter_preferences (
      member_account_id,
      email_opt_in,
      announcements_opt_in,
      events_opt_in,
      preferred_locale,
      consented_at,
      withdrawn_at
    ) VALUES (
      v_account_id,
      p_email_opt_in,
      p_announcements_opt_in,
      p_events_opt_in,
      v_locale,
      CASE WHEN p_email_opt_in THEN v_now ELSE NULL END,
      CASE WHEN p_email_opt_in THEN NULL ELSE v_now END
    )
    RETURNING * INTO v_result;
  END IF;

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id, actor_kind, event_type, congregation_id,
    member_account_id, subject_type, subject_id, details
  ) VALUES (
    v_actor,
    'member',
    'newsletter_preference_changed',
    v_congregation_id,
    v_account_id,
    'newsletter_preference',
    v_account_id,
    pg_catalog.jsonb_build_object('email_opt_in', p_email_opt_in)
  );

  RETURN pg_catalog.jsonb_build_object(
    'member_account_id', v_result.member_account_id,
    'email_opt_in', v_result.email_opt_in,
    'announcements_opt_in', v_result.announcements_opt_in,
    'events_opt_in', v_result.events_opt_in,
    'preferred_locale', v_result.preferred_locale,
    'consented_at', v_result.consented_at,
    'withdrawn_at', v_result.withdrawn_at,
    'revision', v_result.revision
  );
END;
$function$;

CREATE FUNCTION public.member_portal_my_newsletter_preferences()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_account_id uuid;
  v_account_locale text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezes szukseges.' USING ERRCODE = '42501';
  END IF;

  SELECT ma.id, ma.preferred_locale
    INTO v_account_id, v_account_locale
  FROM public.member_accounts ma
  WHERE ma.auth_user_id = v_actor
    AND ma.status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nincs sajat, nem torolt tagi account.' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'member_account_id', v_account_id,
    'email_opt_in', COALESCE(p.email_opt_in, false),
    'announcements_opt_in', COALESCE(p.announcements_opt_in, true),
    'events_opt_in', COALESCE(p.events_opt_in, true),
    'preferred_locale', COALESCE(p.preferred_locale, v_account_locale, 'hu'),
    'consented_at', p.consented_at,
    'withdrawn_at', p.withdrawn_at,
    'revision', p.revision
  )
    INTO v_result
  FROM (SELECT 1) singleton
  LEFT JOIN public.member_newsletter_preferences p
    ON p.member_account_id = v_account_id;

  RETURN v_result;
END;
$function$;

-- --------------------------------------------------------------------------
-- 8. Lelkeszi kampany es idempotens recipient snapshot / delivery queue
-- --------------------------------------------------------------------------

CREATE FUNCTION public.member_portal_create_newsletter_campaign(
  p_congregation_id uuid,
  p_idempotency_key uuid,
  p_campaign_kind text,
  p_subject text,
  p_body_text text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_kind text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_campaign_kind, '')));
  v_subject text := pg_catalog.btrim(COALESCE(p_subject, ''));
  v_body text := pg_catalog.btrim(COALESCE(p_body_text, ''));
  v_existing public.member_newsletter_campaigns%ROWTYPE;
  v_campaign_id uuid;
BEGIN
  IF v_actor IS NULL
     OR p_congregation_id IS NULL
     OR p_idempotency_key IS NULL
     OR v_kind NOT IN ('general', 'announcements', 'events')
     OR pg_catalog.char_length(v_subject) NOT BETWEEN 1 AND 200
     OR v_subject ~ E'[\\n\\r]'
     OR pg_catalog.char_length(v_body) NOT BETWEEN 1 AND 50000 THEN
    RAISE EXCEPTION 'Ervenytelen hirlevelkampany parameter.' USING ERRCODE = '22023';
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
       p_congregation_id
     ) THEN
    RAISE EXCEPTION 'Nincs exact lelkeszi jogosultsag erre a gyulekezetre.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsletter-congregation:' || p_congregation_id::text,
      0
    )
  );

  SELECT c.*
    INTO v_existing
  FROM public.member_newsletter_campaigns c
  WHERE c.created_by_profile_id = v_actor
    AND c.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.congregation_id IS DISTINCT FROM p_congregation_id
       OR v_existing.campaign_kind IS DISTINCT FROM v_kind
       OR v_existing.subject IS DISTINCT FROM v_subject
       OR v_existing.body_text IS DISTINCT FROM v_body THEN
      RAISE EXCEPTION 'A kampany idempotenciakulcs mar mas tartalomhoz tartozik.'
        USING ERRCODE = '23505';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'campaign_id', v_existing.id,
      'status', v_existing.status,
      'recipient_snapshot_count', v_existing.recipient_snapshot_count
    );
  END IF;

  INSERT INTO public.member_newsletter_campaigns (
    idempotency_key,
    congregation_id,
    created_by_profile_id,
    campaign_kind,
    subject,
    body_text
  ) VALUES (
    p_idempotency_key,
    p_congregation_id,
    v_actor,
    v_kind,
    v_subject,
    v_body
  )
  RETURNING id INTO v_campaign_id;

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id, actor_kind, event_type, congregation_id,
    subject_type, subject_id, details
  ) VALUES (
    v_actor, 'staff', 'newsletter_campaign_created', p_congregation_id,
    'newsletter_campaign', v_campaign_id,
    pg_catalog.jsonb_build_object(
      'new_status', 'draft',
      'campaign_kind', v_kind
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'campaign_id', v_campaign_id,
    'status', 'draft',
    'recipient_snapshot_count', NULL
  );
END;
$function$;

CREATE FUNCTION public.member_portal_queue_newsletter_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_campaign public.member_newsletter_campaigns%ROWTYPE;
  v_inserted integer := 0;
  v_total integer := 0;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF v_actor IS NULL OR p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Hianyos campaign queue parameter.' USING ERRCODE = '22023';
  END IF;

  SELECT c.*
    INTO v_campaign
  FROM public.member_newsletter_campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND
     OR NOT member_private.member_portal_staff_can_review_congregation(
       v_campaign.congregation_id
     ) THEN
    RAISE EXCEPTION 'A kampany nem talalhato vagy nem sajat gyulekezeti.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsletter-congregation:' || v_campaign.congregation_id::text,
      0
    )
  );

  SELECT c.*
    INTO v_campaign
  FROM public.member_newsletter_campaigns c
  WHERE c.id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT member_private.member_portal_staff_can_review_congregation(
       v_campaign.congregation_id
     ) THEN
    RAISE EXCEPTION 'A lockolt kampany tenantja elter.' USING ERRCODE = '42501';
  END IF;

  IF v_campaign.status = 'queued' THEN
    SELECT pg_catalog.count(*)::integer
      INTO v_total
    FROM public.member_newsletter_deliveries d
    WHERE d.campaign_id = v_campaign.id;

    RETURN pg_catalog.jsonb_build_object(
      'campaign_id', v_campaign.id,
      'status', v_campaign.status,
      'recipient_snapshot_count', v_total,
      'inserted_now', 0
    );
  ELSIF v_campaign.status <> 'draft' THEN
    RAISE EXCEPTION 'Csak draft kampany queue-zhato.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.member_newsletter_deliveries (
    campaign_id,
    congregation_id,
    member_account_id,
    person_id_snapshot,
    recipient_email,
    recipient_display_name,
    preferred_locale,
    delivery_status,
    queued_at
  )
  SELECT
    v_campaign.id,
    v_campaign.congregation_id,
    ma.id,
    l.person_id,
    ma.email,
    ma.display_name,
    pref.preferred_locale,
    'queued',
    v_now
  FROM public.member_person_links l
  JOIN public.member_accounts ma
    ON ma.id = l.member_account_id
   AND ma.status = 'active'
   AND ma.email_confirmed_at IS NOT NULL
  JOIN public.member_newsletter_preferences pref
    ON pref.member_account_id = ma.id
   AND pref.email_opt_in = true
  JOIN public.szemely s
    ON s.id = l.person_id
   AND s.congregation_id = l.congregation_id
   AND s.isvisible = true
  WHERE l.congregation_id = v_campaign.congregation_id
    AND l.status = 'active'
    AND CASE v_campaign.campaign_kind
      WHEN 'announcements' THEN pref.announcements_opt_in
      WHEN 'events' THEN pref.events_opt_in
      ELSE true
    END
  ORDER BY ma.id
  ON CONFLICT (campaign_id, member_account_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT pg_catalog.count(*)::integer
    INTO v_total
  FROM public.member_newsletter_deliveries d
  WHERE d.campaign_id = v_campaign.id;

  UPDATE public.member_newsletter_campaigns c
  SET status = 'queued',
      recipient_snapshot_count = v_total,
      queued_at = v_now
  WHERE c.id = v_campaign.id;

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id, actor_kind, event_type, congregation_id,
    subject_type, subject_id, details
  ) VALUES (
    v_actor, 'staff', 'newsletter_campaign_queued', v_campaign.congregation_id,
    'newsletter_campaign', v_campaign.id,
    pg_catalog.jsonb_build_object(
      'old_status', 'draft',
      'new_status', 'queued',
      'campaign_kind', v_campaign.campaign_kind,
      'recipient_count', v_total
    )
  ), (
    v_actor, 'staff', 'newsletter_delivery_snapshot_created',
    v_campaign.congregation_id,
    'newsletter_delivery_batch', v_campaign.id,
    pg_catalog.jsonb_build_object('recipient_count', v_total)
  );

  RETURN pg_catalog.jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', 'queued',
    'recipient_snapshot_count', v_total,
    'inserted_now', v_inserted
  );
END;
$function$;

CREATE FUNCTION public.member_portal_cancel_newsletter_campaign(
  p_campaign_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_reason text := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  v_campaign public.member_newsletter_campaigns%ROWTYPE;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_cancelled_deliveries integer := 0;
BEGIN
  IF v_actor IS NULL OR p_campaign_id IS NULL OR v_reason IS NULL
     OR pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Ervenytelen campaign cancel parameter.' USING ERRCODE = '22023';
  END IF;

  SELECT c.*
    INTO v_campaign
  FROM public.member_newsletter_campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND
     OR NOT member_private.member_portal_staff_can_review_congregation(
       v_campaign.congregation_id
     ) THEN
    RAISE EXCEPTION 'A kampany nem talalhato vagy nem sajat gyulekezeti.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsletter-congregation:' || v_campaign.congregation_id::text,
      0
    )
  );

  SELECT c.*
    INTO v_campaign
  FROM public.member_newsletter_campaigns c
  WHERE c.id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT member_private.member_portal_staff_can_review_congregation(
       v_campaign.congregation_id
     ) THEN
    RAISE EXCEPTION 'A lockolt kampany tenantja elter.' USING ERRCODE = '42501';
  END IF;

  IF v_campaign.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'campaign_id', v_campaign.id,
      'status', 'cancelled',
      'cancelled_deliveries', 0
    );
  END IF;

  UPDATE public.member_newsletter_deliveries d
  SET delivery_status = 'cancelled',
      cancelled_at = v_now,
      updated_at = v_now
  WHERE d.campaign_id = v_campaign.id
    AND d.delivery_status = 'queued';

  GET DIAGNOSTICS v_cancelled_deliveries = ROW_COUNT;

  UPDATE public.member_newsletter_campaigns c
  SET status = 'cancelled',
      cancelled_at = v_now,
      cancellation_reason = v_reason
  WHERE c.id = v_campaign.id;

  INSERT INTO public.member_portal_data_audit_log (
    actor_user_id, actor_kind, event_type, congregation_id,
    subject_type, subject_id, details
  ) VALUES (
    v_actor, 'staff', 'newsletter_campaign_cancelled',
    v_campaign.congregation_id, 'newsletter_campaign', v_campaign.id,
    pg_catalog.jsonb_build_object(
      'old_status', v_campaign.status,
      'new_status', 'cancelled',
      'recipient_count', v_cancelled_deliveries
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', 'cancelled',
    'cancelled_deliveries', v_cancelled_deliveries
  );
END;
$function$;

-- --------------------------------------------------------------------------
-- 9. Least privilege ACL es minimalis SELECT-only RLS
-- --------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.member_portal_my_overview(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_submit_person_change(jsonb, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_withdraw_person_change(uuid)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_staff_list_person_changes(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_staff_review_person_change(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_set_newsletter_preferences(boolean, boolean, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_my_newsletter_preferences()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_create_newsletter_campaign(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_queue_newsletter_campaign(uuid)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_cancel_newsletter_campaign(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;

-- Staff precedence: kettos staff+member identitas app_staff_user JWT-t kap, ezert
-- a sajat tagi RPC-k mindket custom role-ra explicit engedelyezettek.
GRANT EXECUTE ON FUNCTION public.member_portal_my_overview(integer, integer)
  TO member_portal_user, app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_submit_person_change(jsonb, bigint, uuid)
  TO member_portal_user, app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_withdraw_person_change(uuid)
  TO member_portal_user, app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_set_newsletter_preferences(boolean, boolean, boolean, text)
  TO member_portal_user, app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_my_newsletter_preferences()
  TO member_portal_user, app_staff_user;

GRANT EXECUTE ON FUNCTION public.member_portal_staff_list_person_changes(uuid, text, integer)
  TO app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_staff_review_person_change(uuid, text, text)
  TO app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_create_newsletter_campaign(uuid, uuid, text, text, text)
  TO app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_queue_newsletter_campaign(uuid)
  TO app_staff_user;
GRANT EXECUTE ON FUNCTION public.member_portal_cancel_newsletter_campaign(uuid, text)
  TO app_staff_user;

REVOKE ALL ON TABLE public.member_person_change_requests
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON TABLE public.member_newsletter_preferences
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON TABLE public.member_newsletter_campaigns
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON TABLE public.member_newsletter_deliveries
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON TABLE public.member_portal_data_audit_log
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON SEQUENCE public.member_portal_data_audit_log_id_seq
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;

GRANT SELECT ON TABLE public.member_person_change_requests
  TO member_portal_user, app_staff_user;
GRANT SELECT ON TABLE public.member_newsletter_preferences
  TO member_portal_user, app_staff_user;
GRANT SELECT ON TABLE public.member_newsletter_campaigns
  TO app_staff_user;
GRANT SELECT ON TABLE public.member_newsletter_deliveries
  TO app_staff_user;
GRANT SELECT ON TABLE public.member_portal_data_audit_log
  TO app_staff_user;

ALTER TABLE public.member_person_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_newsletter_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_newsletter_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_newsletter_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_portal_data_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY member_person_changes_select_self
  ON public.member_person_change_requests
  FOR SELECT
  TO member_portal_user, app_staff_user
  USING (
    EXISTS (
      SELECT 1
      FROM public.member_accounts ma
      WHERE ma.id = member_person_change_requests.member_account_id
        AND ma.auth_user_id = (SELECT auth.uid())
        AND ma.status <> 'deleted'
    )
  );

CREATE POLICY member_person_changes_select_staff
  ON public.member_person_change_requests
  FOR SELECT
  TO app_staff_user
  USING (
    member_private.member_portal_staff_can_review_congregation(congregation_id)
  );

CREATE POLICY member_newsletter_preferences_select_self
  ON public.member_newsletter_preferences
  FOR SELECT
  TO member_portal_user, app_staff_user
  USING (
    EXISTS (
      SELECT 1
      FROM public.member_accounts ma
      WHERE ma.id = member_newsletter_preferences.member_account_id
        AND ma.auth_user_id = (SELECT auth.uid())
        AND ma.status <> 'deleted'
    )
  );

CREATE POLICY member_newsletter_campaigns_select_staff
  ON public.member_newsletter_campaigns
  FOR SELECT
  TO app_staff_user
  USING (
    member_private.member_portal_staff_can_review_congregation(congregation_id)
  );

CREATE POLICY member_newsletter_deliveries_select_staff
  ON public.member_newsletter_deliveries
  FOR SELECT
  TO app_staff_user
  USING (
    member_private.member_portal_staff_can_review_congregation(congregation_id)
  );

CREATE POLICY member_portal_data_audit_select_staff
  ON public.member_portal_data_audit_log
  FOR SELECT
  TO app_staff_user
  USING (
    congregation_id IS NOT NULL
    AND member_private.member_portal_staff_can_review_congregation(congregation_id)
  );

-- Szandekosan nincs INSERT/UPDATE/DELETE policy egyik uj tablan sem.

-- --------------------------------------------------------------------------
-- 7. Fail-closed postflight: exact owner/ACL/signature/RLS/trigger/index
-- --------------------------------------------------------------------------

DO $postflight$
DECLARE
  v_function regprocedure;
  v_expected_language text;
  v_expected_volatility "char";
  v_expected_security_definer boolean;
  v_expected_staff boolean;
  v_expected_member boolean;
  v_proc record;
  v_table_record record;
  v_policy_record record;
  v_trigger_record record;
  v_index_record record;
  v_source text;
  v_constraint_definition text;
BEGIN
  IF pg_catalog.obj_description(
       'member_private.member_portal_data_version()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DATA_AND_NEWSLETTERS_V1'
     OR member_private.member_portal_data_version()
          IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DATA_AND_NEWSLETTERS_V1' THEN
    RAISE EXCEPTION 'Tagi data/newsletter postflight: a sajat marker driftelt.';
  END IF;

  -- Public API: pontos overload, owner, language, volatility, SECURITY DEFINER,
  -- ures search_path es direct EXECUTE ACL.
  FOR
    v_function,
    v_expected_language,
    v_expected_volatility,
    v_expected_security_definer,
    v_expected_staff,
    v_expected_member
  IN
    SELECT *
    FROM (VALUES
      ('public.member_portal_my_overview(integer,integer)'::regprocedure,
       'plpgsql'::text, 's'::"char", true, true, true),
      ('public.member_portal_submit_person_change(jsonb,bigint,uuid)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, true),
      ('public.member_portal_withdraw_person_change(uuid)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, true),
      ('public.member_portal_staff_list_person_changes(uuid,text,integer)'::regprocedure,
       'plpgsql', 's'::"char", true, true, false),
      ('public.member_portal_staff_review_person_change(uuid,text,text)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, false),
      ('public.member_portal_set_newsletter_preferences(boolean,boolean,boolean,text)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, true),
      ('public.member_portal_my_newsletter_preferences()'::regprocedure,
       'plpgsql', 's'::"char", true, true, true),
      ('public.member_portal_create_newsletter_campaign(uuid,uuid,text,text,text)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, false),
      ('public.member_portal_queue_newsletter_campaign(uuid)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, false),
      ('public.member_portal_cancel_newsletter_campaign(uuid,text)'::regprocedure,
       'plpgsql', 'v'::"char", true, true, false)
    ) expected(
      function_oid,
      language_name,
      volatility,
      security_definer,
      staff_execute,
      member_execute
    )
  LOOP
    SELECT
      pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
      l.lanname AS language_name,
      p.provolatile,
      p.prosecdef,
      p.proleakproof,
      COALESCE(pg_catalog.array_length(p.proconfig, 1), 0) AS config_count,
      EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg IN ('search_path=', 'search_path=""')
      ) AS empty_search_path
      INTO v_proc
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE p.oid = v_function;

    IF v_proc.owner_name <> 'postgres'
       OR v_proc.language_name <> v_expected_language
       OR v_proc.provolatile <> v_expected_volatility
       OR v_proc.prosecdef IS DISTINCT FROM v_expected_security_definer
       OR v_proc.proleakproof
       OR v_proc.config_count <> 1
       OR NOT v_proc.empty_search_path THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: function owner/language/security/search_path drift: %',
        v_function;
    END IF;

    IF pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('app_pending_user', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege(
         'app_staff_user', v_function, 'EXECUTE'
       ) IS DISTINCT FROM v_expected_staff
       OR pg_catalog.has_function_privilege(
         'member_portal_user', v_function, 'EXECUTE'
       ) IS DISTINCT FROM v_expected_member THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: public RPC effective EXECUTE ACL drift: %',
        v_function;
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
            grantee.rolname = 'member_portal_user'
            AND v_expected_member
            AND NOT acl.is_grantable
          ),
          false
        )
    ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: varatlan direct RPC EXECUTE grantee: %',
        v_function;
    END IF;
  END LOOP;

  -- Private helper: exact signature es owner-only EXECUTE.
  FOR
    v_function,
    v_expected_language,
    v_expected_volatility,
    v_expected_security_definer
  IN
    SELECT *
    FROM (VALUES
      ('member_private.member_portal_data_version()'::regprocedure,
       'sql'::text, 'i'::"char", false),
      ('member_private.member_person_patch_normalize(jsonb)'::regprocedure,
       'plpgsql', 'i'::"char", false),
      ('member_private.member_person_patch_is_valid(jsonb)'::regprocedure,
       'sql', 'i'::"char", false),
      ('member_private.member_data_audit_details_is_valid(jsonb)'::regprocedure,
       'sql', 'i'::"char", false),
      ('member_private.member_portal_current_member_context()'::regprocedure,
       'sql', 's'::"char", true),
      ('member_private.member_portal_data_touch()'::regprocedure,
       'plpgsql', 'v'::"char", false),
      ('member_private.member_person_change_guard()'::regprocedure,
       'plpgsql', 'v'::"char", true),
      ('member_private.member_newsletter_preference_guard()'::regprocedure,
       'plpgsql', 'v'::"char", true),
      ('member_private.member_newsletter_campaign_guard()'::regprocedure,
       'plpgsql', 'v'::"char", true),
      ('member_private.member_newsletter_delivery_guard()'::regprocedure,
       'plpgsql', 'v'::"char", true),
      ('member_private.member_portal_data_audit_append_only_guard()'::regprocedure,
       'plpgsql', 'v'::"char", false)
    ) expected(function_oid, language_name, volatility, security_definer)
  LOOP
    SELECT
      pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
      l.lanname AS language_name,
      p.provolatile,
      p.prosecdef,
      p.proleakproof,
      COALESCE(pg_catalog.array_length(p.proconfig, 1), 0) AS config_count,
      EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg IN ('search_path=', 'search_path=""')
      ) AS empty_search_path
      INTO v_proc
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE p.oid = v_function;

    IF v_proc.owner_name <> 'postgres'
       OR v_proc.language_name <> v_expected_language
       OR v_proc.provolatile <> v_expected_volatility
       OR v_proc.prosecdef IS DISTINCT FROM v_expected_security_definer
       OR v_proc.proleakproof
       OR v_proc.config_count <> 1
       OR NOT v_proc.empty_search_path
       OR pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('app_staff_user', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('app_pending_user', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('member_portal_user', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: private helper security/ACL drift: %',
        v_function;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      WHERE p.oid = v_function
        AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee <> p.proowner
    ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: private helpernek direct kliens EXECUTE-ja maradt: %',
        v_function;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'member_portal_my_overview',
        'member_portal_submit_person_change',
        'member_portal_withdraw_person_change',
        'member_portal_staff_list_person_changes',
        'member_portal_staff_review_person_change',
        'member_portal_set_newsletter_preferences',
        'member_portal_my_newsletter_preferences',
        'member_portal_create_newsletter_campaign',
        'member_portal_queue_newsletter_campaign',
        'member_portal_cancel_newsletter_campaign'
      )
  ) <> 10
  OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'member_private'
      AND p.proname IN (
        'member_portal_data_version',
        'member_person_patch_normalize',
        'member_person_patch_is_valid',
        'member_data_audit_details_is_valid',
        'member_portal_current_member_context',
        'member_portal_data_touch',
        'member_person_change_guard',
        'member_newsletter_preference_guard',
        'member_newsletter_campaign_guard',
        'member_newsletter_delivery_guard',
        'member_portal_data_audit_append_only_guard'
      )
  ) <> 11 THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: hianyzo vagy varatlan function overload.';
  END IF;

  -- Uj tablak: postgres owner, RLS ON, FORCE RLS OFF (az owner-definer RPC-k
  -- tudatosan bypassolnak), direct DML nincs es csak a tervezett SELECT marad.
  FOR v_table_record IN
    SELECT *
    FROM (VALUES
      ('member_person_change_requests'::text, true, true),
      ('member_newsletter_preferences', true, true),
      ('member_newsletter_campaigns', true, false),
      ('member_newsletter_deliveries', true, false),
      ('member_portal_data_audit_log', true, false)
    ) expected(table_name, staff_select, member_select)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table_record.table_name
        AND c.relkind = 'r'
        AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
        AND c.relrowsecurity
        AND NOT c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: table owner/RLS drift: %',
        v_table_record.table_name;
    END IF;

    IF pg_catalog.has_table_privilege(
         'app_staff_user',
         'public.' || v_table_record.table_name,
         'SELECT'
       ) IS DISTINCT FROM v_table_record.staff_select
       OR pg_catalog.has_table_privilege(
         'member_portal_user',
         'public.' || v_table_record.table_name,
         'SELECT'
       ) IS DISTINCT FROM v_table_record.member_select
       OR pg_catalog.has_table_privilege(
         'anon', 'public.' || v_table_record.table_name, 'SELECT'
       )
       OR pg_catalog.has_table_privilege(
         'authenticated', 'public.' || v_table_record.table_name, 'SELECT'
       )
       OR pg_catalog.has_table_privilege(
         'service_role', 'public.' || v_table_record.table_name, 'SELECT'
       )
       OR pg_catalog.has_table_privilege(
         'app_pending_user', 'public.' || v_table_record.table_name, 'SELECT'
       ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: table SELECT ACL drift: %',
        v_table_record.table_name;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(ARRAY[
        'anon', 'authenticated', 'service_role', 'app_staff_user',
        'app_pending_user', 'member_portal_user'
      ]::text[]) role_name
      WHERE pg_catalog.has_table_privilege(
        role_name,
        'public.' || v_table_record.table_name,
        'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      )
    ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: direct kliens DML drift: %',
        v_table_record.table_name;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
      ) acl
      LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
      WHERE n.nspname = 'public'
        AND c.relname = v_table_record.table_name
        AND acl.grantee <> c.relowner
        AND NOT COALESCE(
          acl.privilege_type = 'SELECT'
          AND NOT acl.is_grantable
          AND (
            (grantee.rolname = 'app_staff_user' AND v_table_record.staff_select)
            OR (
              grantee.rolname = 'member_portal_user'
              AND v_table_record.member_select
            )
          ),
          false
        )
    ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: varatlan direct table grantee: %',
        v_table_record.table_name;
    END IF;
  END LOOP;

  IF pg_catalog.pg_get_serial_sequence(
       'public.member_portal_data_audit_log', 'id'
     ) IS DISTINCT FROM 'public.member_portal_data_audit_log_id_seq'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'member_portal_data_audit_log_id_seq'
         AND c.relkind = 'S'
         AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(c.relacl, pg_catalog.acldefault('S', c.relowner))
       ) acl
       WHERE c.oid = 'public.member_portal_data_audit_log_id_seq'::regclass
         AND acl.grantee <> c.relowner
     ) THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: audit identity sequence owner/ACL drift.';
  END IF;

  -- Constraint-nev, tipus, validaltsag es a kritikus definiciok is exactak.
  IF EXISTS (
    WITH expected(table_name, constraint_name, constraint_type) AS (
      VALUES
        ('member_person_change_requests', 'member_person_change_requests_pkey', 'p'),
        ('member_person_change_requests', 'member_person_change_requests_client_key', 'u'),
        ('member_person_change_requests', 'member_person_change_requests_account_fkey', 'f'),
        ('member_person_change_requests', 'member_person_change_requests_link_fkey', 'f'),
        ('member_person_change_requests', 'member_person_change_requests_congregation_fkey', 'f'),
        ('member_person_change_requests', 'member_person_change_requests_person_fkey', 'f'),
        ('member_person_change_requests', 'member_person_change_requests_reviewer_fkey', 'f'),
        ('member_person_change_requests', 'member_person_change_requests_base_revision_check', 'c'),
        ('member_person_change_requests', 'member_person_change_requests_patch_check', 'c'),
        ('member_person_change_requests', 'member_person_change_requests_status_check', 'c'),
        ('member_person_change_requests', 'member_person_change_requests_decision_message_check', 'c'),
        ('member_person_change_requests', 'member_person_change_requests_revision_check', 'c'),
        ('member_person_change_requests', 'member_person_change_requests_state_check', 'c'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_pkey', 'p'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_account_fkey', 'f'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_locale_check', 'c'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_revision_check', 'c'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_consent_state_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_pkey', 'p'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_identity_tenant_key', 'u'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_creator_idempotency_key', 'u'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_congregation_fkey', 'f'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_creator_fkey', 'f'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_kind_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_subject_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_body_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_status_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_snapshot_count_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_cancel_reason_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_revision_check', 'c'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_state_check', 'c'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_pkey', 'p'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_campaign_account_key', 'u'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_campaign_tenant_fkey', 'f'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_account_fkey', 'f'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_email_check', 'c'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_name_check', 'c'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_locale_check', 'c'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_status_check', 'c'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_state_check', 'c'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_log_pkey', 'p'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_actor_kind_check', 'c'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_event_type_check', 'c'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_subject_type_check', 'c'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_details_check', 'c')
    )
    SELECT 1
    FROM expected e
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = pg_catalog.to_regclass('public.' || e.table_name)
        AND c.conname = e.constraint_name
        AND c.contype::text = e.constraint_type
        AND c.convalidated
        AND NOT c.condeferrable
        AND NOT c.condeferred
    )
  )
  OR EXISTS (
    WITH expected(table_name, constraint_name) AS (
      VALUES
        ('member_person_change_requests', 'member_person_change_requests_pkey'),
        ('member_person_change_requests', 'member_person_change_requests_client_key'),
        ('member_person_change_requests', 'member_person_change_requests_account_fkey'),
        ('member_person_change_requests', 'member_person_change_requests_link_fkey'),
        ('member_person_change_requests', 'member_person_change_requests_congregation_fkey'),
        ('member_person_change_requests', 'member_person_change_requests_person_fkey'),
        ('member_person_change_requests', 'member_person_change_requests_reviewer_fkey'),
        ('member_person_change_requests', 'member_person_change_requests_base_revision_check'),
        ('member_person_change_requests', 'member_person_change_requests_patch_check'),
        ('member_person_change_requests', 'member_person_change_requests_status_check'),
        ('member_person_change_requests', 'member_person_change_requests_decision_message_check'),
        ('member_person_change_requests', 'member_person_change_requests_revision_check'),
        ('member_person_change_requests', 'member_person_change_requests_state_check'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_pkey'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_account_fkey'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_locale_check'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_revision_check'),
        ('member_newsletter_preferences', 'member_newsletter_preferences_consent_state_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_pkey'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_identity_tenant_key'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_creator_idempotency_key'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_congregation_fkey'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_creator_fkey'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_kind_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_subject_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_body_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_status_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_snapshot_count_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_cancel_reason_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_revision_check'),
        ('member_newsletter_campaigns', 'member_newsletter_campaigns_state_check'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_pkey'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_campaign_account_key'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_campaign_tenant_fkey'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_account_fkey'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_email_check'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_name_check'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_locale_check'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_status_check'),
        ('member_newsletter_deliveries', 'member_newsletter_deliveries_state_check'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_log_pkey'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_actor_kind_check'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_event_type_check'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_subject_type_check'),
        ('member_portal_data_audit_log', 'member_portal_data_audit_details_check')
    )
    SELECT 1
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN (
        'member_person_change_requests',
        'member_newsletter_preferences',
        'member_newsletter_campaigns',
        'member_newsletter_deliveries',
        'member_portal_data_audit_log'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM expected e
        WHERE e.table_name = t.relname
          AND e.constraint_name = c.conname
      )
  ) THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: hianyzo, extra vagy nem valid target constraint.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
    INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.member_person_change_requests'::regclass
    AND c.conname = 'member_person_change_requests_patch_check';

  IF v_constraint_definition NOT ILIKE
       '%member_private.member_person_patch_is_valid(requested_patch)%' THEN
    RAISE EXCEPTION 'Tagi data/newsletter postflight: patch CHECK drift.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
    INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.member_portal_data_audit_log'::regclass
    AND c.conname = 'member_portal_data_audit_details_check';

  IF v_constraint_definition NOT ILIKE
       '%member_private.member_data_audit_details_is_valid(details)%' THEN
    RAISE EXCEPTION 'Tagi data/newsletter postflight: PII-poor audit CHECK drift.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
    INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.member_newsletter_deliveries'::regclass
    AND c.conname = 'member_newsletter_deliveries_status_check';

  IF v_constraint_definition NOT ILIKE '%queued%'
     OR v_constraint_definition NOT ILIKE '%cancelled%'
     OR v_constraint_definition ILIKE '%sent%'
     OR v_constraint_definition ILIKE '%processing%'
     OR v_constraint_definition ILIKE '%failed%' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: delivery status CHECK nem exact queued/cancelled.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
    INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.member_newsletter_deliveries'::regclass
    AND c.conname = 'member_newsletter_deliveries_campaign_tenant_fkey';

  IF v_constraint_definition NOT ILIKE
       '%FOREIGN KEY (campaign_id, congregation_id)%REFERENCES%member_newsletter_campaigns(id, congregation_id)%ON UPDATE RESTRICT ON DELETE CASCADE%' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: campaign/delivery composite tenant FK drift.';
  END IF;

  -- Explicit indexek: exact tabla, btree, kulcsoszlop-sorrend, unique/predicate,
  -- valid/ready/live allapot. A payment index kulon a live forrastablan el.
  FOR v_index_record IN
    SELECT *
    FROM (VALUES
      ('member_person_changes_one_pending_idx'::text,
       'public.member_person_change_requests', true,
       ARRAY['member_account_id', 'person_id']::text[], 'status'::text, NULL::text),
      ('member_person_changes_review_queue_idx',
       'public.member_person_change_requests', false,
       ARRAY['congregation_id', 'status', 'submitted_at', 'id']::text[], NULL, NULL),
      ('member_person_changes_account_history_idx',
       'public.member_person_change_requests', false,
       ARRAY['member_account_id', 'submitted_at', 'id']::text[], NULL, 'submitted_at DESC'),
      ('member_person_changes_link_idx',
       'public.member_person_change_requests', false,
       ARRAY['person_link_id']::text[], NULL, NULL),
      ('member_person_changes_person_idx',
       'public.member_person_change_requests', false,
       ARRAY['person_id']::text[], NULL, NULL),
      ('member_person_changes_reviewer_idx',
       'public.member_person_change_requests', false,
       ARRAY['reviewed_by_profile_id', 'reviewed_at']::text[],
       'reviewed_by_profile_id', 'reviewed_at DESC'),
      ('member_newsletter_campaigns_tenant_status_idx',
       'public.member_newsletter_campaigns', false,
       ARRAY['congregation_id', 'status', 'created_at', 'id']::text[], NULL, 'created_at DESC'),
      ('member_newsletter_deliveries_campaign_status_idx',
       'public.member_newsletter_deliveries', false,
       ARRAY['campaign_id', 'delivery_status', 'queued_at', 'id']::text[], NULL, NULL),
      ('member_newsletter_deliveries_tenant_status_idx',
       'public.member_newsletter_deliveries', false,
       ARRAY['congregation_id', 'delivery_status', 'queued_at', 'id']::text[], NULL, NULL),
      ('member_newsletter_deliveries_account_idx',
       'public.member_newsletter_deliveries', false,
       ARRAY['member_account_id']::text[], NULL, NULL),
      ('member_portal_data_audit_tenant_time_idx',
       'public.member_portal_data_audit_log', false,
       ARRAY['congregation_id', 'occurred_at', 'id']::text[], 'congregation_id', 'occurred_at DESC'),
      ('member_portal_data_audit_subject_idx',
       'public.member_portal_data_audit_log', false,
       ARRAY['subject_type', 'subject_id', 'occurred_at']::text[], NULL, 'occurred_at DESC'),
      ('member_portal_befizetes_person_tenant_date_idx',
       'public.befizetes', false,
       ARRAY['id_szemely', 'congregation_id', 'datum', 'id']::text[], 'deleted', 'datum DESC')
    ) expected(
      index_name,
      table_name,
      is_unique,
      key_columns,
      predicate_marker,
      definition_marker
    )
  LOOP
    SELECT
      idx.relname AS actual_index_name,
      pg_catalog.pg_get_userbyid(idx.relowner) AS owner_name,
      i.indisunique,
      i.indisvalid,
      i.indisready,
      i.indislive,
      i.indnkeyatts,
      am.amname,
      pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicate_definition,
      pg_catalog.pg_get_indexdef(i.indexrelid) AS index_definition,
      ARRAY(
        SELECT a.attname
        FROM pg_catalog.unnest(i.indkey)
          WITH ORDINALITY indexed_column(attnum, ord)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = i.indrelid
         AND a.attnum = indexed_column.attnum
        WHERE indexed_column.ord <= i.indnkeyatts
        ORDER BY indexed_column.ord
      ) AS actual_key_columns
      INTO v_proc
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_catalog.pg_am am ON am.oid = idx.relam
    WHERE i.indexrelid = pg_catalog.to_regclass(
            'public.' || v_index_record.index_name
          )
      AND i.indrelid = pg_catalog.to_regclass(v_index_record.table_name);

    IF v_proc.actual_index_name IS NULL
       OR v_proc.owner_name <> 'postgres'
       OR v_proc.indisunique IS DISTINCT FROM v_index_record.is_unique
       OR NOT v_proc.indisvalid
       OR NOT v_proc.indisready
       OR NOT v_proc.indislive
       OR v_proc.indnkeyatts <> pg_catalog.cardinality(v_index_record.key_columns)
       OR v_proc.amname <> 'btree'
       OR v_proc.actual_key_columns IS DISTINCT FROM v_index_record.key_columns
       OR (
         v_index_record.predicate_marker IS NULL
         AND v_proc.predicate_definition IS NOT NULL
       )
       OR (
         v_index_record.predicate_marker IS NOT NULL
         AND (
           v_proc.predicate_definition IS NULL
           OR v_proc.predicate_definition NOT ILIKE
                '%' || v_index_record.predicate_marker || '%'
         )
       )
       OR (
         v_index_record.definition_marker IS NOT NULL
         AND v_proc.index_definition NOT ILIKE
               '%' || v_index_record.definition_marker || '%'
       ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: explicit index drift: %',
        v_index_record.index_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_catalog.pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = tbl.relnamespace
    WHERE n.nspname = 'public'
      AND tbl.relname IN (
        'member_person_change_requests',
        'member_newsletter_preferences',
        'member_newsletter_campaigns',
        'member_newsletter_deliveries',
        'member_portal_data_audit_log'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint c
        WHERE c.conindid = i.indexrelid
      )
      AND idx.relname NOT IN (
        'member_person_changes_one_pending_idx',
        'member_person_changes_review_queue_idx',
        'member_person_changes_account_history_idx',
        'member_person_changes_link_idx',
        'member_person_changes_person_idx',
        'member_person_changes_reviewer_idx',
        'member_newsletter_campaigns_tenant_status_idx',
        'member_newsletter_deliveries_campaign_status_idx',
        'member_newsletter_deliveries_tenant_status_idx',
        'member_newsletter_deliveries_account_idx',
        'member_portal_data_audit_tenant_time_idx',
        'member_portal_data_audit_subject_idx'
      )
  ) THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: varatlan explicit target index.';
  END IF;

  SELECT pg_catalog.pg_get_expr(i.indpred, i.indrelid)
    INTO v_constraint_definition
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid =
    'public.member_portal_befizetes_person_tenant_date_idx'::regclass;

  IF v_constraint_definition NOT ILIKE '%deleted = false%'
     OR v_constraint_definition NOT ILIKE '%id_szemely IS NOT NULL%' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: payment partial index predicate drift.';
  END IF;

  -- Exact, SELECT-only policy-keszlet. Iras-policy szandekosan nincs.
  FOR v_policy_record IN
    SELECT *
    FROM (VALUES
      ('public.member_person_change_requests'::regclass,
       'member_person_changes_select_self'::text,
       ARRAY['app_staff_user', 'member_portal_user']::text[], 'self'::text),
      ('public.member_person_change_requests'::regclass,
       'member_person_changes_select_staff',
       ARRAY['app_staff_user']::text[], 'staff'),
      ('public.member_newsletter_preferences'::regclass,
       'member_newsletter_preferences_select_self',
       ARRAY['app_staff_user', 'member_portal_user']::text[], 'self'),
      ('public.member_newsletter_campaigns'::regclass,
       'member_newsletter_campaigns_select_staff',
       ARRAY['app_staff_user']::text[], 'staff'),
      ('public.member_newsletter_deliveries'::regclass,
       'member_newsletter_deliveries_select_staff',
       ARRAY['app_staff_user']::text[], 'staff'),
      ('public.member_portal_data_audit_log'::regclass,
       'member_portal_data_audit_select_staff',
       ARRAY['app_staff_user']::text[], 'staff_nonnull_tenant')
    ) expected(table_oid, policy_name, expected_roles, qualifier_kind)
  LOOP
    SELECT
      p.polname,
      p.polpermissive,
      p.polcmd,
      pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS qualifier_definition,
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS check_definition,
      ARRAY(
        SELECT r.rolname
        FROM pg_catalog.unnest(p.polroles) role_oid
        JOIN pg_catalog.pg_roles r ON r.oid = role_oid
        ORDER BY r.rolname
      ) AS actual_roles
      INTO v_proc
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = v_policy_record.table_oid
      AND p.polname = v_policy_record.policy_name;

    IF v_proc.polname IS NULL
       OR NOT v_proc.polpermissive
       OR v_proc.polcmd <> 'r'
       OR v_proc.check_definition IS NOT NULL
       OR v_proc.actual_roles IS DISTINCT FROM v_policy_record.expected_roles
       OR v_proc.qualifier_definition IS NULL
       OR (
         v_policy_record.qualifier_kind = 'self'
         AND (
           v_proc.qualifier_definition NOT ILIKE '%member_accounts%'
           OR v_proc.qualifier_definition NOT ILIKE '%auth.uid()%'
           OR v_proc.qualifier_definition NOT ILIKE '%deleted%'
         )
       )
       OR (
         v_policy_record.qualifier_kind IN ('staff', 'staff_nonnull_tenant')
         AND v_proc.qualifier_definition NOT ILIKE
               '%member_portal_staff_can_review_congregation%'
       )
       OR (
         v_policy_record.qualifier_kind = 'staff_nonnull_tenant'
         AND v_proc.qualifier_definition NOT ILIKE
               '%congregation_id IS NOT NULL%'
       ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: RLS policy drift: %',
        v_policy_record.policy_name;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid IN (
      'public.member_person_change_requests'::regclass,
      'public.member_newsletter_preferences'::regclass,
      'public.member_newsletter_campaigns'::regclass,
      'public.member_newsletter_deliveries'::regclass,
      'public.member_portal_data_audit_log'::regclass
    )
  ) <> 6
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid IN (
      'public.member_person_change_requests'::regclass,
      'public.member_newsletter_preferences'::regclass,
      'public.member_newsletter_campaigns'::regclass,
      'public.member_newsletter_deliveries'::regclass,
      'public.member_portal_data_audit_log'::regclass
    )
      AND p.polcmd <> 'r'
  ) THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: extra vagy irasi RLS policy maradt.';
  END IF;

  -- Pontos trigger-nev, timing/event bitmask, function-kotes es nincs extra
  -- nem-internal trigger az uj tablakon.
  FOR v_trigger_record IN
    SELECT *
    FROM (VALUES
      ('public.member_person_change_requests'::regclass,
       'member_person_changes_10_guard'::text, 23::smallint,
       'member_private.member_person_change_guard()'::regprocedure),
      ('public.member_person_change_requests'::regclass,
       'member_person_changes_90_touch', 19::smallint,
       'member_private.member_portal_data_touch()'::regprocedure),
      ('public.member_newsletter_preferences'::regclass,
       'member_newsletter_preferences_10_guard', 23::smallint,
       'member_private.member_newsletter_preference_guard()'::regprocedure),
      ('public.member_newsletter_preferences'::regclass,
       'member_newsletter_preferences_90_touch', 19::smallint,
       'member_private.member_portal_data_touch()'::regprocedure),
      ('public.member_newsletter_campaigns'::regclass,
       'member_newsletter_campaigns_10_guard', 23::smallint,
       'member_private.member_newsletter_campaign_guard()'::regprocedure),
      ('public.member_newsletter_campaigns'::regclass,
       'member_newsletter_campaigns_90_touch', 19::smallint,
       'member_private.member_portal_data_touch()'::regprocedure),
      ('public.member_newsletter_deliveries'::regclass,
       'member_newsletter_deliveries_10_guard', 23::smallint,
       'member_private.member_newsletter_delivery_guard()'::regprocedure),
      ('public.member_portal_data_audit_log'::regclass,
       'member_portal_data_audit_immutable_rows', 27::smallint,
       'member_private.member_portal_data_audit_append_only_guard()'::regprocedure),
      ('public.member_portal_data_audit_log'::regclass,
       'member_portal_data_audit_no_truncate', 34::smallint,
       'member_private.member_portal_data_audit_append_only_guard()'::regprocedure)
    ) expected(table_oid, trigger_name, trigger_type, function_oid)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = v_trigger_record.table_oid
        AND t.tgname = v_trigger_record.trigger_name
        AND NOT t.tgisinternal
        AND t.tgenabled = 'O'
        AND t.tgtype = v_trigger_record.trigger_type
        AND t.tgfoid = v_trigger_record.function_oid
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.unnest(t.tgattr)
        )
        AND t.tgqual IS NULL
        AND NOT t.tgdeferrable
        AND NOT t.tginitdeferred
    ) THEN
      RAISE EXCEPTION
        'Tagi data/newsletter postflight: trigger drift: %',
        v_trigger_record.trigger_name;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid IN (
      'public.member_person_change_requests'::regclass,
      'public.member_newsletter_preferences'::regclass,
      'public.member_newsletter_campaigns'::regclass,
      'public.member_newsletter_deliveries'::regclass,
      'public.member_portal_data_audit_log'::regclass
    )
      AND NOT t.tgisinternal
  ) <> 9 THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: hianyzo vagy extra non-internal trigger.';
  END IF;

  -- A legfontosabb adatbiztonsagi allitasokat a tenyleges eltarolt function
  -- source-on is ellenorizzuk, nem csak az objektumneveken.
  SELECT p.prosrc INTO v_source
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.member_portal_my_overview(integer,integer)'::regprocedure;

  IF v_source NOT ILIKE '%b.id_szemely = v_context.person_id%'
     OR v_source NOT ILIKE
          '%b.congregation_id = v_context.congregation_id%'
     OR v_source NOT ILIKE '%b.deleted = false%'
     OR v_source ILIKE '%b.id_csalad%' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: sajat payment szemely+tenant+deleted contract drift.';
  END IF;

  SELECT p.prosrc INTO v_source
  FROM pg_catalog.pg_proc p
  WHERE p.oid =
    'public.member_portal_staff_review_person_change(uuid,text,text)'::regprocedure;

  IF v_source NOT ILIKE
       '%s.revision = v_request.base_person_revision%'
     OR v_source NOT ILIKE '%requested_patch ? ''szcs_nev''%'
     OR v_source NOT ILIKE '%requested_patch ? ''mailing_consent''%'
     OR v_source ~* '\mexecute\M' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: static allowlist/optimistic person update drift.';
  END IF;

  SELECT p.prosrc INTO v_source
  FROM pg_catalog.pg_proc p
  WHERE p.oid =
    'public.member_portal_queue_newsletter_campaign(uuid)'::regprocedure;

  IF v_source NOT ILIKE '%ma.status = ''active''%'
     OR v_source NOT ILIKE '%member_portal_staff_can_review_congregation%'
     OR v_source NOT ILIKE '%ma.email_confirmed_at IS NOT NULL%'
     OR v_source NOT ILIKE '%l.status = ''active''%'
     OR v_source NOT ILIKE '%l.congregation_id = v_campaign.congregation_id%'
     OR v_source NOT ILIKE '%s.congregation_id = l.congregation_id%'
     OR v_source NOT ILIKE '%s.isvisible = true%'
     OR v_source NOT ILIKE '%pref.email_opt_in = true%'
     OR v_source NOT ILIKE '%pref.announcements_opt_in%'
     OR v_source NOT ILIKE '%pref.events_opt_in%'
     OR v_source NOT ILIKE
          '%ON CONFLICT (campaign_id, member_account_id) DO NOTHING%'
     OR v_source ILIKE '%delivery_status = ''sent''%' THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: recipient snapshot/opt-in/idempotency drift.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'member_portal_create_newsletter_campaign',
        'member_portal_queue_newsletter_campaign',
        'member_portal_cancel_newsletter_campaign'
      )
      AND p.prosrc ~* 'delivery_status[[:space:]]*=[[:space:]]*''sent'''
  ) THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: SQL email-kuldest/sent atmenetet probal vegezni.';
  END IF;

  -- First-install migracio nem seedel szemelyes vagy hirleveladatot.
  IF EXISTS (SELECT 1 FROM public.member_person_change_requests)
     OR EXISTS (SELECT 1 FROM public.member_newsletter_preferences)
     OR EXISTS (SELECT 1 FROM public.member_newsletter_campaigns)
     OR EXISTS (SELECT 1 FROM public.member_newsletter_deliveries)
     OR EXISTS (SELECT 1 FROM public.member_portal_data_audit_log) THEN
    RAISE EXCEPTION
      'Tagi data/newsletter postflight: a first-install migracio varatlan sort seedelt.';
  END IF;
END
$postflight$;

COMMIT;

-- --------------------------------------------------------------------------
-- 8. Read-only telepitesi ellenorzo -- egy eredmenyhalmaz, PII nelkul
-- --------------------------------------------------------------------------

WITH table_state AS (
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'member_person_change_requests',
      'member_newsletter_preferences',
      'member_newsletter_campaigns',
      'member_newsletter_deliveries',
      'member_portal_data_audit_log'
    )
), policy_state AS (
  SELECT pg_catalog.count(*)::integer AS select_policy_count
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid IN (
    'public.member_person_change_requests'::regclass,
    'public.member_newsletter_preferences'::regclass,
    'public.member_newsletter_campaigns'::regclass,
    'public.member_newsletter_deliveries'::regclass,
    'public.member_portal_data_audit_log'::regclass
  )
    AND p.polcmd = 'r'
)
SELECT pg_catalog.jsonb_build_object(
  'migration', '2026-07-17-member-portal-data-and-newsletters',
  'review_draft', true,
  'marker', member_private.member_portal_data_version(),
  'tables', (
    SELECT pg_catalog.jsonb_object_agg(
      ts.table_name,
      pg_catalog.jsonb_build_object(
        'owner', ts.owner_name,
        'rls_enabled', ts.rls_enabled
      )
      ORDER BY ts.table_name
    )
    FROM table_state ts
  ),
  'select_policy_count', (SELECT ps.select_policy_count FROM policy_state ps),
  'member_overview_staff_execute', pg_catalog.has_function_privilege(
    'app_staff_user',
    'public.member_portal_my_overview(integer,integer)',
    'EXECUTE'
  ),
  'member_overview_member_execute', pg_catalog.has_function_privilege(
    'member_portal_user',
    'public.member_portal_my_overview(integer,integer)',
    'EXECUTE'
  ),
  'staff_review_execute', pg_catalog.has_function_privilege(
    'app_staff_user',
    'public.member_portal_staff_review_person_change(uuid,text,text)',
    'EXECUTE'
  ),
  'payment_index', pg_catalog.to_regclass(
    'public.member_portal_befizetes_person_tenant_date_idx'
  ) IS NOT NULL,
  'sql_email_worker_implemented', false,
  'remaining_blockers', pg_catalog.jsonb_build_array(
    'A kulso email workerhez kulon claim/retry/complete migracio es szolgaltatas kell; ez a SQL csak queued/cancelled allapotot kezel.',
    'A meglevo global audit.log_change() szemely trigger teljes OLD/NEW PII-retenciojat kulon adatvedelmi es retention review-ban kell rendezni.',
    'Elesites elott kell a Dashboard token-hook engedelyezes, kotelezo re-login, app_staff/member JWT-proba es localhost end-to-end teszt.'
  )
) AS member_portal_data_and_newsletter_verification;
