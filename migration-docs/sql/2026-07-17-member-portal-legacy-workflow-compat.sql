-- REVIEW-DRAFT -- ELES ADATBAZISON MEG NE FUTTASD.
-- 2026-07-17 -- Tagi portal: legacy workflow kompatibilitas es transfer cutover
--
-- Kotelezo futtatasi sorrend:
--   1. 2026-07-17-member-portal-role-foundation.sql
--   2. 2026-07-17-member-portal-core.sql
--   3. EZ A FAJL
--   4. 2026-07-17-member-portal-p0-auth-isolation.sql
--   5. 2026-07-17-member-portal-token-hook.sql
--   6. 2026-07-17-member-portal-workflows.sql
--
-- FONTOS RERUN-SZERZODES:
--   Ezt a fajlt a P0 cutover utan TILOS ujrafuttatni. A preflight ezt a
--   `KARTOTEKA_P0_AUTH_ISOLATION_V1` marker alapjan fail-closed megallitja,
--   nehogy az `authenticated` ideiglenes RPC-jogat visszaadja.
--   A 3. es 4. lepes kozott az alkalmazasforgalomnak leallitva kell maradnia:
--   az ideiglenes authenticated kompatibilitasi grantot csak a kovetkezo P0
--   cutover szunteti meg. A ket lepes kozott nem nyithato meg a rendszer.
--
-- A live inventory es a repo-migraciok alapjan ez a tranzakcio:
--   * a wipe RPC-t az aktiv, nem torolt system-admin assignmenthez koti;
--   * a tagtorlest portal-history mellett fizikai torles helyett soft-hide-ra
--     valtja, account -> link -> person zarsorrenddel;
--   * atomiva teszi a transfer dontest es az elo portal-link visszavonasat;
--   * megszunteti a transfer-tabla kozvetlen statuszirasat. A regi mark-read
--     action csak a `read_at` oszlopot frissitheti tovabbra is;
--   * a forras-gyulekezet kulso ertesiteset NEM kuldi: azt a frontend a sikeres
--     RPC-valasz utan vegzi, adatbazis-tranzakcion kivul.
--
-- Minden valtozas egyetlen tranzakcio. Barmely preflight/postflight elteres a
-- teljes migraciot visszagorgeti; elo SQL-t ez a review-draft nem futtat.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

-- --------------------------------------------------------------------------
-- 0. Fail-closed preflight: sorrend, exact live alak es core invariansok
-- --------------------------------------------------------------------------

DO $preflight$
DECLARE
  v_marker_count integer;
  v_policy_names text[];
  v_missing_columns text[];
  v_live_mode boolean;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Legacy compat preflight: csak postgres SQL Editor szereppel futtathato; current_user=%',
      current_user;
  END IF;

  -- P0 utan a compat ujrafuttatasa visszaadna az authenticated ideiglenes
  -- EXECUTE jogat. Ezert a sorrend nem csak dokumentacio, hanem hard guard.
  IF pg_catalog.to_regprocedure(
       'public.current_user_is_active_staff()'
     ) IS NOT NULL
     AND pg_catalog.obj_description(
       pg_catalog.to_regprocedure('public.current_user_is_active_staff()'),
       'pg_proc'
     ) = 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
  THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a P0 cutover mar telepitve van; ezt a migraciot utana tilos ujrafuttatni.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.member_portal_my_request_state()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a downstream workflow mar telepitve van; hibas futtatasi sorrend.';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles r
       WHERE r.rolname = 'app_staff_user'
         AND NOT r.rolcanlogin
         AND NOT r.rolsuper
         AND NOT r.rolbypassrls
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles r
       WHERE r.rolname = 'app_pending_user'
         AND NOT r.rolcanlogin
         AND NOT r.rolsuper
         AND NOT r.rolbypassrls
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles r
       WHERE r.rolname = 'member_portal_user'
         AND NOT r.rolcanlogin
         AND NOT r.rolsuper
         AND NOT r.rolbypassrls
     ) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a role-foundation harom izolalt szerepe hianyzik vagy driftelt.';
  END IF;

  IF pg_catalog.to_regclass('public.member_accounts') IS NULL
     OR pg_catalog.to_regclass(
       'public.member_congregation_applications'
     ) IS NULL
     OR pg_catalog.to_regclass('public.member_person_links') IS NULL
     OR pg_catalog.to_regclass('public.member_portal_audit_log') IS NULL
     OR pg_catalog.to_regclass('public.member_transfer_notifications') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.profile_roles') IS NULL
     OR pg_catalog.to_regclass('public.szemely') IS NULL
     OR pg_catalog.to_regclass('public.congregations') IS NULL
  THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a core vagy a bizonyitott live alaptablak egyike hianyzik.';
  END IF;

  -- Exact oszlop/tipus szerzodes. A 12 transfer-oszlop a visszakuldott live
  -- column ACL inventorybol, a member_* oszlopok a kozvetlenul elozo core-bol
  -- szarmaznak; ismeretlen oszlopra vagy implicit castokra nem hagyatkozunk.
  WITH expected(schema_name, table_name, column_name, type_name) AS (
    VALUES
      ('public'::text, 'profiles'::text, 'id'::text, 'uuid'::text),
      ('public', 'profiles', 'status', 'text'),
      ('public', 'profiles', 'deleted_at', 'timestamp with time zone'),
      ('public', 'profiles', 'anonymized_at', 'timestamp with time zone'),
      ('public', 'profile_roles', 'profile_id', 'uuid'),
      ('public', 'profile_roles', 'role', 'text'),
      ('public', 'profile_roles', 'scope', 'text'),
      ('public', 'profile_roles', 'scope_id', 'uuid'),
      ('public', 'profile_roles', 'active', 'boolean'),
      ('public', 'profile_roles', 'approval_status', 'text'),
      ('public', 'congregations', 'id', 'uuid'),
      ('public', 'congregations', 'name', 'text'),
      ('public', 'congregations', 'nev_hu', 'text'),
      ('public', 'szemely', 'id', 'integer'),
      ('public', 'szemely', 'congregation_id', 'uuid'),
      ('public', 'szemely', 'isvisible', 'boolean'),
      ('public', 'szemely', 'member_status', 'text'),
      ('public', 'member_accounts', 'id', 'uuid'),
      ('public', 'member_accounts', 'status', 'text'),
      ('public', 'member_congregation_applications', 'id', 'uuid'),
      ('public', 'member_congregation_applications', 'member_account_id', 'uuid'),
      ('public', 'member_congregation_applications', 'congregation_id', 'uuid'),
      ('public', 'member_person_links', 'id', 'uuid'),
      ('public', 'member_person_links', 'member_account_id', 'uuid'),
      ('public', 'member_person_links', 'congregation_id', 'uuid'),
      ('public', 'member_person_links', 'person_id', 'integer'),
      ('public', 'member_person_links', 'application_id', 'uuid'),
      ('public', 'member_person_links', 'status', 'text'),
      ('public', 'member_person_links', 'status_message', 'text'),
      ('public', 'member_person_links', 'revoked_at', 'timestamp with time zone'),
      ('public', 'member_portal_audit_log', 'id', 'bigint'),
      ('public', 'member_portal_audit_log', 'congregation_id', 'uuid'),
      ('public', 'member_portal_audit_log', 'member_account_id', 'uuid'),
      ('public', 'member_transfer_notifications', 'id', 'uuid'),
      ('public', 'member_transfer_notifications', 'source_congregation_id', 'uuid'),
      ('public', 'member_transfer_notifications', 'target_congregation_id', 'uuid'),
      ('public', 'member_transfer_notifications', 'szemely_id', 'integer'),
      ('public', 'member_transfer_notifications', 'elkoltozott_id', 'integer'),
      ('public', 'member_transfer_notifications', 'member_snapshot', 'jsonb'),
      ('public', 'member_transfer_notifications', 'status', 'text'),
      ('public', 'member_transfer_notifications', 'created_at', 'timestamp with time zone'),
      ('public', 'member_transfer_notifications', 'read_at', 'timestamp with time zone'),
      ('public', 'member_transfer_notifications', 'responded_at', 'timestamp with time zone'),
      ('public', 'member_transfer_notifications', 'responded_by', 'uuid'),
      ('public', 'member_transfer_notifications', 'response_note', 'text')
  ), missing AS (
    SELECT
      e.table_name || '.' || e.column_name || ':' || e.type_name AS item
    FROM expected e
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.schema_name
    LEFT JOIN pg_catalog.pg_class c
      ON c.relnamespace = n.oid
     AND c.relname = e.table_name
     AND c.relkind IN ('r', 'p')
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.oid
     AND a.attname = e.column_name
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE a.attname IS NULL
       OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.type_name
  )
  SELECT pg_catalog.array_agg(item ORDER BY item)
    INTO v_missing_columns
    FROM missing;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Legacy compat preflight: hianyzo vagy driftelt oszlop/tipus: %',
      v_missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.role = 'admin'
      AND pr.scope = 'system'
      AND pr.scope_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: nincs aktiv, approved system-admin assignment; a wipe cutover leallt.';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.member_transfer_notifications'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) <> 12 THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a transfer-tabla nem a bizonyitott 12 oszlopos live alak.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.member_transfer_notifications'::regclass
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: member_transfer_notifications owner/RLS alak driftelt.';
  END IF;

  -- A live trigger ownerkent, SECURITY DEFINER modban tovabbra is kepes lesz
  -- INSERT-re akkor is, ha minden kliens INSERT joga megszunik.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.elkoltozott'::regclass
      AND t.tgname = 'trg_elkoltozott_create_transfer_notification'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND n.nspname = 'public'
      AND p.proname = 'create_transfer_notification_on_elkoltozott'
      AND p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: az elkoltozott -> transfer notification trigger driftelt.';
  END IF;

  -- A wipe explicit link DELETE-je csak akkor nevezheto auditaltnak, ha a core
  -- exact audittriggere aktiv. Az auditnaplo append-only vedelme is kotelezo.
  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = 'public.member_person_links'::regclass
         AND t.tgname = 'member_person_links_audit'
         AND t.tgfoid = 'member_private.member_portal_log_change()'::regprocedure
         AND NOT t.tgisinternal
         AND t.tgenabled IN ('O', 'A')
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = 'public.member_portal_audit_log'::regclass
         AND t.tgname = 'member_portal_audit_immutable_rows'
         AND t.tgfoid =
           'member_private.member_portal_audit_append_only_guard()'::regprocedure
         AND NOT t.tgisinternal
         AND t.tgenabled IN ('O', 'A')
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = 'public.member_portal_audit_log'::regclass
         AND t.tgname = 'member_portal_audit_no_truncate'
         AND t.tgfoid =
           'member_private.member_portal_audit_append_only_guard()'::regprocedure
         AND NOT t.tgisinternal
         AND t.tgenabled IN ('O', 'A')
     ) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a portal audit trigger/append-only vedelem hianyzik vagy driftelt.';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index i
       WHERE i.indexrelid =
         'public.member_person_links_one_live_per_person_idx'::regclass
         AND i.indrelid = 'public.member_person_links'::regclass
         AND i.indisunique
         AND i.indisvalid
         AND i.indpred IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint c
       WHERE c.conrelid = 'public.member_person_links'::regclass
         AND c.conname = 'member_person_links_live_person_tenant_fkey'
         AND c.contype = 'f'
         AND c.convalidated
     ) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a live portal-link egyediseg/tenant FK driftelt.';
  END IF;

  -- A ket lecserelendo routine neve alatt pontosan egy-egy live overload lehet.
  IF (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'wipe_congregation_data'
     ) <> 1
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'tagnyilvantartas_tag_torles'
     ) <> 1 THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a wipe vagy tagtorles overload-keszlete driftelt.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.wipe_congregation_data(uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.tagnyilvantartas_tag_torles(integer)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Legacy compat preflight: a bizonyitott live routine-signature hianyzik.';
  END IF;

  SELECT pg_catalog.count(*)
    INTO v_marker_count
  FROM (VALUES
    (pg_catalog.obj_description(
      'public.wipe_congregation_data(uuid,text)'::regprocedure,
      'pg_proc'
    ), 'KARTOTEKA_MEMBER_PORTAL_WIPE_COMPAT_V1'::text),
    (pg_catalog.obj_description(
      'public.tagnyilvantartas_tag_torles(integer)'::regprocedure,
      'pg_proc'
    ), 'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'::text),
    (CASE
      WHEN pg_catalog.to_regprocedure(
        'public.respond_to_member_transfer_notification(uuid,text,text)'
      ) IS NULL THEN NULL
      ELSE pg_catalog.obj_description(
        pg_catalog.to_regprocedure(
          'public.respond_to_member_transfer_notification(uuid,text,text)'
        ),
        'pg_proc'
      )
    END, 'KARTOTEKA_MEMBER_PORTAL_TRANSFER_COMPAT_V1'::text)
  ) marker(actual_marker, expected_marker)
  WHERE marker.actual_marker = marker.expected_marker;

  IF v_marker_count NOT IN (0, 3) THEN
    RAISE EXCEPTION
      'Legacy compat preflight: reszleges/idegen compat marker-allapot; count=%',
      v_marker_count;
  END IF;

  v_live_mode := v_marker_count = 0;

  IF v_live_mode THEN
    IF pg_catalog.to_regprocedure(
         'public.respond_to_member_transfer_notification(uuid,text,text)'
       ) IS NOT NULL
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'respond_to_member_transfer_notification'
       ) THEN
      RAISE EXCEPTION
        'Legacy compat preflight: ismeretlen transfer-response routine mar letezik.';
    END IF;

    -- Az attachmentbol visszakapott exact live torzsek biztonsagi ujjlenyomatai.
    IF NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         WHERE p.oid =
           'public.wipe_congregation_data(uuid,text)'::regprocedure
           AND p.prokind = 'f'
           AND p.prosecdef
           AND p.provolatile = 'v'
           AND p.proretset
           AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
           AND pg_catalog.pg_get_function_result(p.oid)
             = 'TABLE(deleted_table text, rows_deleted bigint)'
           AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[]
           AND p.prosrc LIKE '%keep_tables%'
           AND p.prosrc LIKE '%data_wipe_log%'
           AND p.prosrc LIKE '%caller_role <> ''admin''%'
           AND p.prosrc LIKE '%DELETE FROM public.szemely%'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         WHERE p.oid =
           'public.tagnyilvantartas_tag_torles(integer)'::regprocedure
           AND p.prokind = 'f'
           AND p.prosecdef
           AND p.provolatile = 'v'
           AND NOT p.proretset
           AND p.prorettype = 'pg_catalog.jsonb'::regtype
           AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
           AND p.proconfig IS NOT DISTINCT FROM
             ARRAY['search_path=public, pg_temp']::text[]
           AND p.prosrc LIKE '%hidden_payments%'
           AND p.prosrc LIKE '%hidden_registry%'
           AND p.prosrc LIKE '%DELETE FROM public.member_transfer_notifications%'
           AND p.prosrc LIKE '%foreign_key_violation%'
       ) THEN
      RAISE EXCEPTION
        'Legacy compat preflight: a visszakuldott live wipe/tagtorles torzs idokozben driftelt.';
    END IF;

    -- Exact direct live routine-ACL az inventory szerint. Inherited jogot nem
    -- keverunk a katalogusban tarolt granttal.
    IF EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode((
           SELECT p.proacl
           FROM pg_catalog.pg_proc p
           WHERE p.oid =
             'public.wipe_congregation_data(uuid,text)'::regprocedure
         )) acl
         LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
         WHERE acl.privilege_type <> 'EXECUTE'
            OR acl.is_grantable
            OR COALESCE(grantee.rolname, 'PUBLIC') NOT IN (
              'PUBLIC', 'postgres', 'authenticated', 'service_role'
            )
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode((
           SELECT p.proacl
           FROM pg_catalog.pg_proc p
           WHERE p.oid =
             'public.wipe_congregation_data(uuid,text)'::regprocedure
         )) acl
       ) <> 4
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode((
           SELECT p.proacl
           FROM pg_catalog.pg_proc p
           WHERE p.oid =
             'public.tagnyilvantartas_tag_torles(integer)'::regprocedure
         )) acl
         LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
         WHERE acl.privilege_type <> 'EXECUTE'
            OR acl.is_grantable
            OR COALESCE(grantee.rolname, 'PUBLIC') NOT IN (
              'postgres', 'authenticated', 'service_role'
            )
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode((
           SELECT p.proacl
           FROM pg_catalog.pg_proc p
           WHERE p.oid =
             'public.tagnyilvantartas_tag_torles(integer)'::regprocedure
         )) acl
       ) <> 3 THEN
      RAISE EXCEPTION
        'Legacy compat preflight: a bizonyitott live wipe/tagtorles direct ACL driftelt.';
    END IF;

    SELECT pg_catalog.array_agg(pol.policyname ORDER BY pol.policyname)
      INTO v_policy_names
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'member_transfer_notifications';

    IF v_policy_names IS DISTINCT FROM ARRAY['mtn_access']::text[]
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_policies pol
         WHERE pol.schemaname = 'public'
           AND pol.tablename = 'member_transfer_notifications'
           AND pol.policyname = 'mtn_access'
           AND pol.permissive = 'PERMISSIVE'
           AND pol.cmd = 'ALL'
           AND pol.roles = ARRAY['authenticated']::name[]
           AND COALESCE(pol.qual, '') LIKE '%source_congregation_id%'
           AND COALESCE(pol.qual, '') LIKE '%target_congregation_id%'
           AND COALESCE(pol.qual, '') LIKE '%current_user_congregation_id%'
           AND COALESCE(pol.qual, '') LIKE '%current_user_has_global_access%'
       ) THEN
      RAISE EXCEPTION
        'Legacy compat preflight: a bizonyitott live mtn_access policy driftelt.';
    END IF;

    -- Az inventory szerint a live tabla egyik oszlopan sincs explicit ACL.
    -- Ezt meg a tabla-szintu REVOKE elott rogzitjuk, hogy idegen grantot ne
    -- probaljunk csendben eltakaritani vagy mas grantor jogat megvaltoztatni.
    IF EXISTS (
         SELECT 1
         FROM pg_catalog.pg_attribute a
         CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
         WHERE a.attrelid =
           'public.member_transfer_notifications'::regclass
           AND a.attnum > 0
           AND NOT a.attisdropped
       ) THEN
      RAISE EXCEPTION
        'Legacy compat preflight: a bizonyitott live transfer column ACL driftelt.';
    END IF;
  ELSE
    -- Pre-P0, exact compat rerun csak a sajat ket policyjaval engedett.
    SELECT pg_catalog.array_agg(pol.policyname ORDER BY pol.policyname)
      INTO v_policy_names
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'member_transfer_notifications';

    IF v_policy_names IS DISTINCT FROM ARRAY[
      'member_transfer_notifications_select_staff',
      'member_transfer_notifications_update_read_at'
    ]::text[] THEN
      RAISE EXCEPTION
        'Legacy compat preflight: a pre-P0 rerun transfer-policy allapota driftelt: %',
        v_policy_names;
    END IF;

    -- Rerun csak a sajat ket, postgres altal adott read_at UPDATE grantunkkal
    -- engedett. A tabla-szintu REVOKE ezeket is automatikusan visszavonja.
    IF EXISTS (
         SELECT 1
         FROM pg_catalog.pg_attribute a
         CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
         LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
         LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
         WHERE a.attrelid =
           'public.member_transfer_notifications'::regclass
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND (
             a.attname <> 'read_at'
             OR grantee.rolname NOT IN ('authenticated', 'app_staff_user')
             OR grantor.rolname <> 'postgres'
             OR acl.privilege_type <> 'UPDATE'
             OR acl.is_grantable
           )
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_attribute a
         CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
         WHERE a.attrelid =
           'public.member_transfer_notifications'::regclass
           AND a.attnum > 0
           AND NOT a.attisdropped
       ) <> 2 THEN
      RAISE EXCEPTION
        'Legacy compat preflight: a pre-P0 rerun transfer column ACL allapota driftelt.';
    END IF;
  END IF;
END
$preflight$;

-- --------------------------------------------------------------------------
-- 1. Gyulekezeti wipe: portal-audit megorzese, explicit auditalt linktorles
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wipe_congregation_data(
  target_congregation_id uuid,
  confirm_name text
)
RETURNS TABLE(deleted_table text, rows_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  expected_name text;
  affected bigint;
  total bigint := 0;
  deleted_list jsonb := '[]'::jsonb;
  rec record;
  v_member_account_id uuid;

  -- Ezek a tablakk a dinamikus loopban SOHA nem torolhetok. A linket kulon,
  -- az applications elott toroljuk; az append-only auditnaplo megmarad.
  keep_tables text[] := ARRAY[
    'congregations',
    'profile_congregations',
    'admin_access_requests',
    'congregation_subscriptions',
    'congregation_annual_fees',
    'congregation_custom_fees',
    'data_wipe_log',
    'profiles',
    'profile_roles',
    'user_devices',
    'user_login_attempts',
    'member_person_links',
    'member_portal_audit_log'
  ];
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezes szukseges'
      USING ERRCODE = '28000';
  END IF;

  IF target_congregation_id IS NULL THEN
    RAISE EXCEPTION 'A celgyulekezet azonositoja kotelezo'
      USING ERRCODE = '22023';
  END IF;

  -- Kizarolag aktiv, nem torolt/nem anonimizalt profil + aktiv, approved,
  -- role=admin, scope=system, NULL scope_id assignment jogosult. Nincs legacy
  -- profiles.role fallback, JWT metadata vagy global-helper rovidites.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    WHERE p.id = caller_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.role = 'admin'
      AND pr.scope = 'system'
      AND pr.scope_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'A gyulekezeti adattisztitast csak aktiv teljes rendszergazda vegezheti el'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'congregation-wipe:' || target_congregation_id::text,
      0
    )
  );

  SELECT COALESCE(NULLIF(c.nev_hu, ''), c.name)
    INTO expected_name
    FROM public.congregations c
   WHERE c.id = target_congregation_id
   FOR SHARE;

  IF NOT FOUND OR expected_name IS NULL THEN
    RAISE EXCEPTION 'A megadott gyulekezet (%) nem letezik', target_congregation_id
      USING ERRCODE = '23503';
  END IF;

  IF confirm_name IS NULL OR confirm_name <> expected_name THEN
    RAISE EXCEPTION
      'A megerosito nev (%) nem egyezik a gyulekezet nevevel (%)',
      COALESCE(confirm_name, '<ures>'),
      expected_name
      USING ERRCODE = '22023';
  END IF;

  -- Portal zarsorrend: account advisory -> account row -> link row -> person.
  -- A pending/rejected application-fiokokat is zarjuk, mert az applications a
  -- kesobbi dinamikus loopban torlodik.
  FOR v_member_account_id IN
    SELECT account_id
    FROM (
      SELECT l.member_account_id AS account_id
      FROM public.member_person_links l
      WHERE l.congregation_id = target_congregation_id
      UNION
      SELECT a.member_account_id
      FROM public.member_congregation_applications a
      WHERE a.congregation_id = target_congregation_id
    ) account_ids
    ORDER BY account_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-account:' || v_member_account_id::text,
        0
      )
    );
  END LOOP;

  PERFORM ma.id
    FROM public.member_accounts ma
   WHERE EXISTS (
     SELECT 1
     FROM public.member_person_links l
     WHERE l.member_account_id = ma.id
       AND l.congregation_id = target_congregation_id
   )
      OR EXISTS (
        SELECT 1
        FROM public.member_congregation_applications a
        WHERE a.member_account_id = ma.id
          AND a.congregation_id = target_congregation_id
      )
   ORDER BY ma.id
   FOR UPDATE OF ma;

  PERFORM l.id
    FROM public.member_person_links l
   WHERE l.congregation_id = target_congregation_id
   ORDER BY l.member_account_id, l.id
   FOR UPDATE OF l;

  PERFORM s.id
    FROM public.szemely s
   WHERE s.congregation_id = target_congregation_id
   ORDER BY s.id
   FOR UPDATE OF s;

  -- Explicit, az applications elotti torles. A core
  -- `member_person_links_audit` AFTER DELETE trigger minden sort PII-szegenyen
  -- a megorzott member_portal_audit_log tablaba naploz.
  DELETE FROM public.member_person_links l
   WHERE l.congregation_id = target_congregation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
  deleted_list := deleted_list || pg_catalog.jsonb_build_object(
    'table', 'member_person_links',
    'rows', affected,
    'action', 'explicit_audited_delete'
  );
  deleted_table := 'member_person_links';
  rows_deleted := affected;
  RETURN NEXT;

  -- A live torzs sorrendje: eloszor a kozvetett csalad/gyerek kapcsolatok.
  DELETE FROM public.gyerek
   WHERE id_szemely IN (
     SELECT s.id
     FROM public.szemely s
     WHERE s.congregation_id = target_congregation_id
   )
      OR id_csalad IN (
        SELECT c.id
        FROM public.csalad c
        WHERE c.id_ferfi IN (
          SELECT s.id
          FROM public.szemely s
          WHERE s.congregation_id = target_congregation_id
        )
           OR c.id_no IN (
             SELECT s.id
             FROM public.szemely s
             WHERE s.congregation_id = target_congregation_id
           )
      );
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
  deleted_list := deleted_list || pg_catalog.jsonb_build_object(
    'table', 'gyerek', 'rows', affected
  );
  deleted_table := 'gyerek';
  rows_deleted := affected;
  RETURN NEXT;

  DELETE FROM public.csalad c
   WHERE c.id_ferfi IN (
     SELECT s.id
     FROM public.szemely s
     WHERE s.congregation_id = target_congregation_id
   )
      OR c.id_no IN (
        SELECT s.id
        FROM public.szemely s
        WHERE s.congregation_id = target_congregation_id
      );
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
  deleted_list := deleted_list || pg_catalog.jsonb_build_object(
    'table', 'csalad', 'rows', affected
  );
  deleted_table := 'csalad';
  rows_deleted := affected;
  RETURN NEXT;

  -- A member_person_links es member_portal_audit_log a keep listan van. Az
  -- applications nincs: az explicit linktorles utan a sajat audittriggerevel
  -- egyutt a normal congregation_id loopban torlodik.
  FOR rec IN
    SELECT cols.table_name
    FROM information_schema.columns cols
    WHERE cols.table_schema = 'public'
      AND cols.column_name = 'congregation_id'
      AND cols.table_name <> ALL(keep_tables)
      AND cols.table_name <> 'szemely'
      AND EXISTS (
        SELECT 1
        FROM information_schema.tables tabs
        WHERE tabs.table_schema = cols.table_schema
          AND tabs.table_name = cols.table_name
          AND tabs.table_type = 'BASE TABLE'
      )
    ORDER BY cols.table_name
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'DELETE FROM public.%I WHERE congregation_id = $1',
        rec.table_name
      ) USING target_congregation_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      total := total + affected;
      deleted_list := deleted_list || pg_catalog.jsonb_build_object(
        'table', rec.table_name, 'rows', affected
      );
      deleted_table := rec.table_name;
      rows_deleted := affected;
      RETURN NEXT;
    EXCEPTION WHEN foreign_key_violation THEN
      deleted_list := deleted_list || pg_catalog.jsonb_build_object(
        'table', rec.table_name, 'error', 'FK violation'
      );
      deleted_table := rec.table_name || ' (FK hiba)';
      rows_deleted := 0;
      RETURN NEXT;
    END;
  END LOOP;

  DELETE FROM public.szemely s
   WHERE s.congregation_id = target_congregation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
  deleted_list := deleted_list || pg_catalog.jsonb_build_object(
    'table', 'szemely', 'rows', affected
  );
  deleted_table := 'szemely';
  rows_deleted := affected;
  RETURN NEXT;

  UPDATE public.profiles p
     SET walkthrough_completed = false,
         walkthrough_skipped_at = NULL,
         onboarding_completed_at = NULL,
         updated_at = pg_catalog.statement_timestamp()
   WHERE p.congregation_id = target_congregation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  deleted_list := deleted_list || pg_catalog.jsonb_build_object(
    'table', 'profiles',
    'rows', affected,
    'action', 'onboarding_reset'
  );

  DELETE FROM public.wizard_progress wp
   WHERE wp.user_id IN (
     SELECT p.id
     FROM public.profiles p
     WHERE p.congregation_id = target_congregation_id
   );
  GET DIAGNOSTICS affected = ROW_COUNT;
  total := total + affected;
  deleted_list := deleted_list || pg_catalog.jsonb_build_object(
    'table', 'wizard_progress',
    'rows', affected,
    'action', 'delete'
  );

  INSERT INTO public.data_wipe_log (
    congregation_id,
    congregation_name,
    initiated_by,
    deleted_tables,
    total_rows_deleted
  ) VALUES (
    target_congregation_id,
    expected_name,
    caller_id,
    deleted_list,
    total
  );

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.wipe_congregation_data(uuid, text) IS
  'KARTOTEKA_MEMBER_PORTAL_WIPE_COMPAT_V1';

-- --------------------------------------------------------------------------
-- 2. Tagtorles: portal-history mellett csak visszavonas + soft-hide
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tagnyilvantartas_tag_torles(
  p_szemely_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cong uuid;
  v_member_account_id uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF p_szemely_id IS NULL THEN
    RAISE EXCEPTION 'A szemelyazonosito kotelezo'
      USING ERRCODE = '22023';
  END IF;

  -- Jogosultsaghoz eloszor csak zar nelkuli tenant-olvasas. A szemely row lock
  -- kesobb, az account es link zarak utan jon; utana mindent ujraellenorzunk.
  SELECT s.congregation_id
    INTO v_cong
    FROM public.szemely s
   WHERE s.id = p_szemely_id;

  IF NOT FOUND OR v_cong IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF public.current_user_can_access_congregation(v_cong)
       IS DISTINCT FROM true THEN
    RETURN pg_catalog.jsonb_build_object('status', 'forbidden');
  END IF;

  -- Minden historikus account kulcsa determinisztikus sorrendben. Igy tobb
  -- korabbi revoked link eseten sincs account-account deadlock.
  FOR v_member_account_id IN
    SELECT DISTINCT l.member_account_id
    FROM public.member_person_links l
    WHERE l.person_id = p_szemely_id
    ORDER BY l.member_account_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-account:' || v_member_account_id::text,
        0
      )
    );
  END LOOP;

  -- Kotelezo zarsorrend: account -> link -> person.
  PERFORM ma.id
    FROM public.member_accounts ma
   WHERE EXISTS (
     SELECT 1
     FROM public.member_person_links l
     WHERE l.member_account_id = ma.id
       AND l.person_id = p_szemely_id
   )
   ORDER BY ma.id
   FOR UPDATE OF ma;

  PERFORM l.id
    FROM public.member_person_links l
   WHERE l.person_id = p_szemely_id
   ORDER BY l.member_account_id, l.id
   FOR UPDATE OF l;

  SELECT s.congregation_id
    INTO v_cong
    FROM public.szemely s
   WHERE s.id = p_szemely_id
   FOR UPDATE;

  IF NOT FOUND OR v_cong IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF public.current_user_can_access_congregation(v_cong)
       IS DISTINCT FROM true THEN
    RETURN pg_catalog.jsonb_build_object('status', 'forbidden');
  END IF;

  -- Barmilyen member_person_links history eseten nincs fizikai DELETE. Az elo
  -- linket elobb revoked-re valtjuk fix, PII-mentes technikai indokkal; a core
  -- audittrigger naplozza a statuszvaltast. A fiok es a linkhistory megmarad.
  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.person_id = p_szemely_id
  ) THEN
    UPDATE public.member_person_links l
       SET status = 'revoked',
           status_message = 'legacy_member_delete_soft_hide',
           revoked_at = v_now
     WHERE l.person_id = p_szemely_id
       AND l.status IN ('active', 'suspended');

    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;

    -- A regi frontend a hidden_fk statuszt mar helyesen, kapcsolodo rekord miatti
    -- soft-hide-kent jeleniti meg; igy nincs UI breaking valtozas.
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_fk');
  END IF;

  -- Portal-history nelkul valtozatlan live uzleti logika kovetkezik.
  IF EXISTS (
    SELECT 1
    FROM public.befizetes b
    WHERE b.id_szemely = p_szemely_id
      AND b.congregation_id = v_cong
      AND b.deleted IS DISTINCT FROM true
  ) THEN
    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_payments');
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.keresztseg k
       WHERE k.id_szemely = p_szemely_id
     )
     OR EXISTS (
       SELECT 1 FROM public.konfirmalas k
       WHERE k.id_szemely = p_szemely_id
     )
     OR EXISTS (
       SELECT 1 FROM public.hazassag h
       WHERE h.id_ferfi = p_szemely_id OR h.id_no = p_szemely_id
     )
     OR EXISTS (
       SELECT 1 FROM public.temetes t
       WHERE t.id_szemely = p_szemely_id
     ) THEN
    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_registry');
  END IF;

  BEGIN
    DELETE FROM public.member_transfer_notifications mtn
     WHERE mtn.szemely_id = p_szemely_id;
    DELETE FROM public.bekoltozott b WHERE b.id_szemely = p_szemely_id;
    DELETE FROM public.elkoltozott e WHERE e.id_szemely = p_szemely_id;
    DELETE FROM public.attert a WHERE a.id_szemely = p_szemely_id;
    DELETE FROM public.kitert k WHERE k.id_szemely = p_szemely_id;
    DELETE FROM public.felmentes f WHERE f.id_szemely = p_szemely_id;
    DELETE FROM public.gyerek g WHERE g.id_szemely = p_szemely_id;
    DELETE FROM public.presbiter p WHERE p.id_szemely = p_szemely_id;
    DELETE FROM public.szemely s WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'deleted');
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_fk');
  END;
END;
$function$;

COMMENT ON FUNCTION public.tagnyilvantartas_tag_torles(integer) IS
  'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1';

-- --------------------------------------------------------------------------
-- 3. Atomi transfer-dontes: exact target-lelkesz, link revoke, person move
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_to_member_transfer_notification(
  p_notification_id uuid,
  p_action text,
  p_response_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_action text := pg_catalog.lower(pg_catalog.btrim(p_action));
  v_response_note text := NULLIF(
    pg_catalog.btrim(p_response_note),
    ''
  );
  v_source_congregation_id uuid;
  v_target_congregation_id uuid;
  v_person_id integer;
  v_notification_status text;
  v_initial_link_id uuid;
  v_initial_account_id uuid;
  v_locked_link_id uuid;
  v_locked_account_id uuid;
  v_recheck_link_id uuid;
  v_recheck_account_id uuid;
  v_account_status text;
  v_person_congregation_id uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_rows bigint;
  v_portal_link_revoked boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezes szukseges'
      USING ERRCODE = '28000';
  END IF;

  IF p_notification_id IS NULL
     OR v_action IS NULL
     OR v_action NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Hibas notification azonosito vagy dontesi statusz'
      USING ERRCODE = '22023';
  END IF;

  IF v_response_note IS NOT NULL
     AND pg_catalog.char_length(v_response_note) > 500 THEN
    RAISE EXCEPTION 'A valasz megjegyzese legfeljebb 500 karakter lehet'
      USING ERRCODE = '22023';
  END IF;

  -- A notification a teljes dontes idejere row lockot kap. Ez zarja ki a ket
  -- lelkesz parhuzamos accepted/rejected versenyet.
  SELECT
    mtn.source_congregation_id,
    mtn.target_congregation_id,
    mtn.szemely_id,
    mtn.status
  INTO
    v_source_congregation_id,
    v_target_congregation_id,
    v_person_id,
    v_notification_status
  FROM public.member_transfer_notifications mtn
  WHERE mtn.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Az atjelentkezesi ertesites nem talalhato'
      USING ERRCODE = 'P0002';
  END IF;

  -- Exact celgyulekezeti actor: aktiv, nem torolt/nem anonimizalt profile es
  -- aktiv+approved congregation-scope lelkesz assignment ugyanarra a targetre.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    WHERE p.id = v_actor_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.role = 'lelkesz'
      AND pr.scope = 'congregation'
      AND pr.scope_id = v_target_congregation_id
  ) THEN
    RAISE EXCEPTION
      'Csak a celgyulekezet aktiv, jovahagyott lelkesze valaszolhat'
      USING ERRCODE = '42501';
  END IF;

  -- Lezart rekord ugyanazzal a dontessel idempotens. Ellentetes masodik dontes
  -- hiba; sem note-ot, sem szemelyt, sem linket nem irunk ujra.
  IF v_notification_status <> 'pending' THEN
    IF v_notification_status = v_action THEN
      v_portal_link_revoked := v_action = 'accepted' AND EXISTS (
        SELECT 1
        FROM public.member_person_links l
        WHERE l.person_id = v_person_id
          AND l.status = 'revoked'
          AND l.status_message = 'member_transfer_accepted'
      );

      RETURN pg_catalog.jsonb_build_object(
        'notification_id', p_notification_id,
        'source_congregation_id', v_source_congregation_id,
        'target_congregation_id', v_target_congregation_id,
        'status', v_notification_status,
        'changed', false,
        'portal_link_revoked', v_portal_link_revoked
      );
    END IF;

    RAISE EXCEPTION
      'A lezart atjelentkezesi dontes nem valtoztathato meg (% -> %)',
      v_notification_status,
      v_action
      USING ERRCODE = '23514';
  END IF;

  IF v_source_congregation_id = v_target_congregation_id THEN
    RAISE EXCEPTION 'A transfer forras- es celgyulekezete nem lehet azonos'
      USING ERRCODE = '23514';
  END IF;

  -- Elso, zar nelkuli live-link snapshot. A core unique partial index miatt
  -- legfeljebb egy sor lehet; tobb sor automatikusan fail-closed too_many_rows.
  SELECT l.id, l.member_account_id
    INTO v_initial_link_id, v_initial_account_id
    FROM public.member_person_links l
   WHERE l.person_id = v_person_id
     AND l.status IN ('active', 'suspended');

  IF v_initial_account_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-account:' || v_initial_account_id::text,
        0
      )
    );

    -- Portal zarsorrend: account -> link -> person.
    SELECT ma.status
      INTO v_account_status
      FROM public.member_accounts ma
     WHERE ma.id = v_initial_account_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Az elo portal-link tagi accountja nem letezik'
        USING ERRCODE = '23503';
    END IF;

    IF v_action = 'accepted' AND v_account_status <> 'active' THEN
      RAISE EXCEPTION
        'Az elo portal-linkhez aktiv tagi account szukseges; a transfer nem oldhat fel felfuggesztest'
        USING ERRCODE = '23514';
    END IF;

    SELECT l.id, l.member_account_id
      INTO v_locked_link_id, v_locked_account_id
      FROM public.member_person_links l
     WHERE l.id = v_initial_link_id
       AND l.person_id = v_person_id
       AND l.status IN ('active', 'suspended')
     FOR UPDATE;

    IF NOT FOUND
       OR v_locked_account_id IS DISTINCT FROM v_initial_account_id THEN
      RAISE EXCEPTION
        'A portal-link parhuzamosan megvaltozott; a transfer biztonsagosan ujraprobalhato'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  SELECT s.congregation_id
    INTO v_person_congregation_id
    FROM public.szemely s
   WHERE s.id = v_person_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Az atjelentkezesi ertesites szemelyrekordja nem letezik'
      USING ERRCODE = '23503';
  END IF;

  -- A person lock utan ujraolvassuk a live linket. Ha az elso snapshot ota egy
  -- masik account linkje jelent meg, rollback+retry kell; nem sertjuk meg az
  -- account -> link -> person globalis zarsorrendet azzal, hogy utolag zarjuk.
  SELECT l.id, l.member_account_id
    INTO v_recheck_link_id, v_recheck_account_id
    FROM public.member_person_links l
   WHERE l.person_id = v_person_id
     AND l.status IN ('active', 'suspended');

  IF v_recheck_link_id IS DISTINCT FROM v_initial_link_id
     OR v_recheck_account_id IS DISTINCT FROM v_initial_account_id THEN
    RAISE EXCEPTION
      'A portal-link parhuzamosan letrejott vagy megvaltozott; a transfer biztonsagosan ujraprobalhato'
      USING ERRCODE = '40001';
  END IF;

  IF v_person_congregation_id IS DISTINCT FROM v_source_congregation_id THEN
    RAISE EXCEPTION
      'A szemely jelenlegi gyulekezete nem egyezik a transfer forrasaval'
      USING ERRCODE = '23514';
  END IF;

  IF v_action = 'accepted' THEN
    -- A live composite FK es a szemely lifecycle guard miatt a visszavonasnak
    -- kotelezoen a tenantvaltas elott kell megtortennie. A fix reason PII-mentes.
    IF v_initial_link_id IS NOT NULL THEN
      UPDATE public.member_person_links l
         SET status = 'revoked',
             status_message = 'member_transfer_accepted',
             revoked_at = v_now
       WHERE l.id = v_initial_link_id
         AND l.status IN ('active', 'suspended');
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'Az elo portal-link visszavonasa nem volt egyertelmu'
          USING ERRCODE = '40001';
      END IF;
      v_portal_link_revoked := true;
    END IF;

    UPDATE public.szemely s
       SET congregation_id = v_target_congregation_id,
           member_status = 'aktív'
     WHERE s.id = v_person_id
       AND s.congregation_id = v_source_congregation_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSE
    -- Rejected: a szemely a forras tenantban marad, csak aktiv statuszra all
    -- vissza. Az elo portal-link es az account erintetlen marad.
    UPDATE public.szemely s
       SET member_status = 'aktív'
     WHERE s.id = v_person_id
       AND s.congregation_id = v_source_congregation_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'A szemely transfer-statusz frissitese nem volt egyertelmu'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.member_transfer_notifications mtn
     SET status = v_action,
         responded_at = v_now,
         responded_by = v_actor_id,
         response_note = v_response_note
   WHERE mtn.id = p_notification_id
     AND mtn.status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Az atjelentkezesi dontes parhuzamosan megvaltozott'
      USING ERRCODE = '40001';
  END IF;

  -- Tudatosan nincs INSERT public.ertesitesek-be. A frontend ezt csak a sikeres
  -- RPC commit utan vegzi; kulso uzenetkuldes nem resze ennek a tranzakcionak.
  RETURN pg_catalog.jsonb_build_object(
    'notification_id', p_notification_id,
    'source_congregation_id', v_source_congregation_id,
    'target_congregation_id', v_target_congregation_id,
    'status', v_action,
    'changed', true,
    'portal_link_revoked', v_portal_link_revoked
  );
END;
$function$;

COMMENT ON FUNCTION public.respond_to_member_transfer_notification(
  uuid,
  text,
  text
) IS 'KARTOTEKA_MEMBER_PORTAL_TRANSFER_COMPAT_V1';

-- --------------------------------------------------------------------------
-- 4. Transfer-tabla megkerulesenek lezarasa, mark-read kompatibilitassal
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS mtn_access
  ON public.member_transfer_notifications;
DROP POLICY IF EXISTS member_transfer_notifications_select_staff
  ON public.member_transfer_notifications;
DROP POLICY IF EXISTS member_transfer_notifications_update_read_at
  ON public.member_transfer_notifications;

-- A forras, a cel es a legacy global actor tovabbra is olvashat. P0 kesobb
-- minden authenticated policy fole restrictive aktiv-staff gate-et telepit.
CREATE POLICY member_transfer_notifications_select_staff
  ON public.member_transfer_notifications
  FOR SELECT
  TO authenticated, app_staff_user
  USING (
    source_congregation_id = public.current_user_congregation_id()
    OR target_congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

-- Kozvetlen UPDATE-bol csak read_at engedelyezett oszlopszinten. A policy ezen
-- felul target/global actorra szukit; a forrasgyulekezet nem jelolhet olvasottnak.
CREATE POLICY member_transfer_notifications_update_read_at
  ON public.member_transfer_notifications
  FOR UPDATE
  TO authenticated, app_staff_user
  USING (
    target_congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  )
  WITH CHECK (
    target_congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

-- Exact, minimalis tabla-ACL: owneren kivul csak authenticated/service SELECT.
-- A trigger SECURITY DEFINER postgres ownerkent ettol fuggetlenul tud INSERT-elni.
REVOKE ALL PRIVILEGES ON TABLE public.member_transfer_notifications
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;

GRANT SELECT ON TABLE public.member_transfer_notifications
  TO authenticated, service_role;

-- PostgreSQL tabla-szintu REVOKE kozben az adott grantee megfelelo explicit
-- column grantjait is visszavonja. A preflight ezert elore exact allapotot ker;
-- itt mar csak a ket szukseges, determinisztikus read_at grantot adjuk vissza.
GRANT UPDATE (read_at) ON public.member_transfer_notifications
  TO authenticated, app_staff_user;

-- --------------------------------------------------------------------------
-- 5. Routine ACL: ideiglenes pre-P0 frontend kompatibilitas
-- --------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.wipe_congregation_data(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.tagnyilvantartas_tag_torles(integer)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.respond_to_member_transfer_notification(
  uuid,
  text,
  text
)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin,
       app_staff_user, app_pending_user, member_portal_user;

-- Atmeneti grant: a kovetkezo P0 migracio authenticatedrol visszavonja,
-- service_role-nak backend grantot, app_staff_usernek exact allowlist grantot ad.
GRANT EXECUTE ON FUNCTION
  public.wipe_congregation_data(uuid, text),
  public.tagnyilvantartas_tag_torles(integer),
  public.respond_to_member_transfer_notification(uuid, text, text)
TO authenticated, app_staff_user;

-- --------------------------------------------------------------------------
-- 6. Exact postflight: signature, marker, body, ACL, policy es oszlopjog
-- --------------------------------------------------------------------------

DO $postflight$
DECLARE
  v_policy_names text[];
  v_bad text[];
BEGIN
  IF (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'wipe_congregation_data'
     ) <> 1
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'tagnyilvantartas_tag_torles'
     ) <> 1
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'respond_to_member_transfer_notification'
     ) <> 1 THEN
    RAISE EXCEPTION 'Legacy compat postflight: routine overload drift.';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       WHERE p.oid = 'public.wipe_congregation_data(uuid,text)'::regprocedure
         AND p.prokind = 'f'
         AND p.prosecdef
         AND p.provolatile = 'v'
         AND p.proretset
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND pg_catalog.pg_get_function_result(p.oid)
           = 'TABLE(deleted_table text, rows_deleted bigint)'
         AND (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.unnest(
             COALESCE(p.proconfig, ARRAY[]::text[])
           ) cfg
           WHERE cfg IN ('search_path=', 'search_path=""')
         ) = 1
         AND pg_catalog.cardinality(
           COALESCE(p.proconfig, ARRAY[]::text[])
         ) = 1
         AND pg_catalog.obj_description(p.oid, 'pg_proc')
           = 'KARTOTEKA_MEMBER_PORTAL_WIPE_COMPAT_V1'
         AND p.prosrc LIKE '%member_person_links%'
         AND p.prosrc LIKE '%member_portal_audit_log%'
         AND p.prosrc LIKE '%explicit_audited_delete%'
         AND p.prosrc LIKE '%pr.role = ''admin''%'
         AND p.prosrc LIKE '%pr.scope = ''system''%'
         AND p.prosrc LIKE '%pr.scope_id IS NULL%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       WHERE p.oid =
         'public.tagnyilvantartas_tag_torles(integer)'::regprocedure
         AND p.prokind = 'f'
         AND p.prosecdef
         AND p.provolatile = 'v'
         AND NOT p.proretset
         AND p.prorettype = 'pg_catalog.jsonb'::regtype
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.unnest(
             COALESCE(p.proconfig, ARRAY[]::text[])
           ) cfg
           WHERE cfg IN ('search_path=', 'search_path=""')
         ) = 1
         AND pg_catalog.cardinality(
           COALESCE(p.proconfig, ARRAY[]::text[])
         ) = 1
         AND pg_catalog.obj_description(p.oid, 'pg_proc')
           = 'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'
         AND p.prosrc LIKE '%member-account:%'
         AND p.prosrc LIKE '%legacy_member_delete_soft_hide%'
         AND p.prosrc LIKE '%status IN (''active'', ''suspended'')%'
         AND p.prosrc LIKE '%member_status = ''törölt''%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       WHERE p.oid =
         'public.respond_to_member_transfer_notification(uuid,text,text)'::regprocedure
         AND p.prokind = 'f'
         AND p.prosecdef
         AND p.provolatile = 'v'
         AND NOT p.proretset
         AND p.prorettype = 'pg_catalog.jsonb'::regtype
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.unnest(
             COALESCE(p.proconfig, ARRAY[]::text[])
           ) cfg
           WHERE cfg IN ('search_path=', 'search_path=""')
         ) = 1
         AND pg_catalog.cardinality(
           COALESCE(p.proconfig, ARRAY[]::text[])
         ) = 1
         AND pg_catalog.obj_description(p.oid, 'pg_proc')
           = 'KARTOTEKA_MEMBER_PORTAL_TRANSFER_COMPAT_V1'
         AND p.prosrc LIKE '%FOR UPDATE%'
         AND p.prosrc LIKE '%pr.role = ''lelkesz''%'
         AND p.prosrc LIKE '%pr.scope = ''congregation''%'
         AND p.prosrc LIKE '%member_transfer_accepted%'
         AND p.prosrc LIKE '%portal_link_revoked%'
         AND p.prosrc NOT LIKE '%INSERT INTO public.ertesitesek%'
     ) THEN
    RAISE EXCEPTION
      'Legacy compat postflight: routine owner/security/config/body/marker drift.';
  END IF;

  -- Minden RPC direct ACL-je pontosan owner + authenticated + app_staff EXECUTE.
  WITH routines(oid) AS (
    VALUES
      ('public.wipe_congregation_data(uuid,text)'::regprocedure),
      ('public.tagnyilvantartas_tag_torles(integer)'::regprocedure),
      ('public.respond_to_member_transfer_notification(uuid,text,text)'::regprocedure)
  ), exploded AS (
    SELECT
      r.oid,
      COALESCE(grantee.rolname, 'PUBLIC') AS grantee_name,
      COALESCE(grantor.rolname, 'PUBLIC') AS grantor_name,
      acl.privilege_type,
      acl.is_grantable
    FROM routines r
    JOIN pg_catalog.pg_proc p ON p.oid = r.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
  ), bad AS (
    SELECT e.oid::regprocedure::text AS item
    FROM exploded e
    WHERE e.grantee_name NOT IN ('postgres', 'authenticated', 'app_staff_user')
       OR e.grantor_name <> 'postgres'
       OR e.privilege_type <> 'EXECUTE'
       OR e.is_grantable
    UNION ALL
    SELECT r.oid::regprocedure::text
    FROM routines r
    WHERE (
      SELECT pg_catalog.count(*)
      FROM exploded e
      WHERE e.oid = r.oid
    ) <> 3
       OR NOT EXISTS (
         SELECT 1 FROM exploded e
         WHERE e.oid = r.oid AND e.grantee_name = 'authenticated'
       )
       OR NOT EXISTS (
         SELECT 1 FROM exploded e
         WHERE e.oid = r.oid AND e.grantee_name = 'app_staff_user'
       )
  )
  SELECT pg_catalog.array_agg(item ORDER BY item)
    INTO v_bad
    FROM bad;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy compat postflight: routine ACL drift: %', v_bad;
  END IF;

  SELECT pg_catalog.array_agg(pol.policyname ORDER BY pol.policyname)
    INTO v_policy_names
  FROM pg_catalog.pg_policies pol
  WHERE pol.schemaname = 'public'
    AND pol.tablename = 'member_transfer_notifications';

  IF v_policy_names IS DISTINCT FROM ARRAY[
       'member_transfer_notifications_select_staff',
       'member_transfer_notifications_update_read_at'
     ]::text[]
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename = 'member_transfer_notifications'
         AND pol.policyname = 'member_transfer_notifications_select_staff'
         AND pol.permissive = 'PERMISSIVE'
         AND pol.cmd = 'SELECT'
         AND pg_catalog.cardinality(pol.roles) = 2
         AND pol.roles @> ARRAY['authenticated', 'app_staff_user']::name[]
         AND COALESCE(pol.qual, '') LIKE '%source_congregation_id%'
         AND COALESCE(pol.qual, '') LIKE '%target_congregation_id%'
         AND COALESCE(pol.qual, '') LIKE '%current_user_congregation_id%'
         AND COALESCE(pol.qual, '') LIKE '%current_user_has_global_access%'
         AND pol.with_check IS NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename = 'member_transfer_notifications'
         AND pol.policyname = 'member_transfer_notifications_update_read_at'
         AND pol.permissive = 'PERMISSIVE'
         AND pol.cmd = 'UPDATE'
         AND pg_catalog.cardinality(pol.roles) = 2
         AND pol.roles @> ARRAY['authenticated', 'app_staff_user']::name[]
         AND COALESCE(pol.qual, '') NOT LIKE '%source_congregation_id%'
         AND COALESCE(pol.qual, '') LIKE '%target_congregation_id%'
         AND COALESCE(pol.qual, '') LIKE '%current_user_congregation_id%'
         AND COALESCE(pol.qual, '') LIKE '%current_user_has_global_access%'
         AND COALESCE(pol.with_check, '') NOT LIKE '%source_congregation_id%'
         AND COALESCE(pol.with_check, '') LIKE '%target_congregation_id%'
         AND COALESCE(pol.with_check, '') LIKE '%current_user_congregation_id%'
         AND COALESCE(pol.with_check, '') LIKE '%current_user_has_global_access%'
     ) THEN
    RAISE EXCEPTION
      'Legacy compat postflight: transfer policy lista/role/cmd/guard drift: %',
      v_policy_names;
  END IF;

  -- Exact direct table ACL: owneren kivul authenticated SELECT es service SELECT.
  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
       ) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE c.oid = 'public.member_transfer_notifications'::regclass
         AND COALESCE(grantee.rolname, 'PUBLIC') <> 'postgres'
         AND NOT (
           COALESCE(grantee.rolname, 'PUBLIC') IN (
             'authenticated', 'service_role'
           )
           AND acl.privilege_type = 'SELECT'
           AND NOT acl.is_grantable
         )
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_class c
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
       ) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE c.oid = 'public.member_transfer_notifications'::regclass
         AND COALESCE(grantee.rolname, 'PUBLIC') <> 'postgres'
     ) <> 2 THEN
    RAISE EXCEPTION 'Legacy compat postflight: transfer direct table ACL drift.';
  END IF;

  -- Exact direct column ACL: ket nem-grantable UPDATE bejegyzes, csak read_at-on.
  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute a
       CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
       WHERE a.attrelid = 'public.member_transfer_notifications'::regclass
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND (
           a.attname <> 'read_at'
           OR grantee.rolname NOT IN ('authenticated', 'app_staff_user')
           OR grantor.rolname <> 'postgres'
           OR acl.privilege_type <> 'UPDATE'
           OR acl.is_grantable
         )
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_attribute a
       CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
       WHERE a.attrelid = 'public.member_transfer_notifications'::regclass
         AND a.attnum > 0
         AND NOT a.attisdropped
     ) <> 2
     OR NOT pg_catalog.has_column_privilege(
       'authenticated',
       'public.member_transfer_notifications',
       'read_at',
       'UPDATE'
     )
     OR NOT pg_catalog.has_column_privilege(
       'app_staff_user',
       'public.member_transfer_notifications',
       'read_at',
       'UPDATE'
     ) THEN
    RAISE EXCEPTION 'Legacy compat postflight: transfer read_at column ACL drift.';
  END IF;

  -- Semmilyen kliensnek nincs kozvetlen statusz/responded irasi utja, es a
  -- pending/member szerepek olvasni sem tudjak a legacy PII snapshotot.
  IF EXISTS (
       SELECT 1
       FROM (VALUES
         ('anon'::text),
         ('authenticated'),
         ('service_role'),
         ('supabase_auth_admin'),
         ('app_staff_user'),
         ('app_pending_user'),
         ('member_portal_user')
       ) roles(role_name)
       WHERE pg_catalog.has_table_privilege(
               roles.role_name,
               'public.member_transfer_notifications',
               'INSERT'
             )
          OR pg_catalog.has_table_privilege(
               roles.role_name,
               'public.member_transfer_notifications',
               'UPDATE'
             )
          OR pg_catalog.has_table_privilege(
               roles.role_name,
               'public.member_transfer_notifications',
               'DELETE'
             )
          OR pg_catalog.has_table_privilege(
               roles.role_name,
               'public.member_transfer_notifications',
               'TRUNCATE'
             )
     )
     OR pg_catalog.has_column_privilege(
       'authenticated',
       'public.member_transfer_notifications',
       'status',
       'UPDATE'
     )
     OR pg_catalog.has_column_privilege(
       'app_staff_user',
       'public.member_transfer_notifications',
       'status',
       'UPDATE'
     )
     OR pg_catalog.has_column_privilege(
       'authenticated',
       'public.member_transfer_notifications',
       'responded_at',
       'UPDATE'
     )
     OR pg_catalog.has_column_privilege(
       'authenticated',
       'public.member_transfer_notifications',
       'responded_by',
       'UPDATE'
     )
     OR pg_catalog.has_column_privilege(
       'authenticated',
       'public.member_transfer_notifications',
       'response_note',
       'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'app_pending_user',
       'public.member_transfer_notifications',
       'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'member_portal_user',
       'public.member_transfer_notifications',
       'SELECT'
     ) THEN
    RAISE EXCEPTION
      'Legacy compat postflight: kozvetlen transfer write vagy pending/member read megmaradt.';
  END IF;
END
$postflight$;

COMMIT;

-- --------------------------------------------------------------------------
-- 7. Read-only postflight riport (nem modosit adatot)
-- --------------------------------------------------------------------------

SELECT pg_catalog.jsonb_build_object(
  'migration', '2026-07-17-member-portal-legacy-workflow-compat',
  'review_draft', true,
  'required_order', pg_catalog.jsonb_build_array(
    'role-foundation',
    'core',
    'legacy-workflow-compat',
    'p0-auth-isolation',
    'token-hook',
    'workflows'
  ),
  'routine_markers', pg_catalog.jsonb_build_object(
    'wipe', pg_catalog.obj_description(
      'public.wipe_congregation_data(uuid,text)'::regprocedure,
      'pg_proc'
    ),
    'member_delete', pg_catalog.obj_description(
      'public.tagnyilvantartas_tag_torles(integer)'::regprocedure,
      'pg_proc'
    ),
    'transfer', pg_catalog.obj_description(
      'public.respond_to_member_transfer_notification(uuid,text,text)'::regprocedure,
      'pg_proc'
    )
  ),
  'transfer_policies', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pol.policyname ORDER BY pol.policyname),
      '[]'::jsonb
    )
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'member_transfer_notifications'
  ),
  'authenticated_read_at_update', pg_catalog.has_column_privilege(
    'authenticated',
    'public.member_transfer_notifications',
    'read_at',
    'UPDATE'
  ),
  'authenticated_status_update', pg_catalog.has_column_privilege(
    'authenticated',
    'public.member_transfer_notifications',
    'status',
    'UPDATE'
  ),
  'p0_rerun_guard', 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
) AS member_portal_legacy_workflow_compat_postflight;
