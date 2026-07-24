-- ============================================================================
-- KARTOTEKA — P0 Auth/RPC izoláció a tagi portál előtt
-- Dátum: 2026-07-17
-- Állapot: REVIEW-DRAFT — TILOS MÉG LEFUTTATNI
-- ============================================================================
--
-- Ezt a javaslatot a 2026-07-17-i két live, read-only inventory eredménye és a
-- jelenlegi web/desktop forráskód alapján készítettük. A migráció fail-closed:
-- ismeretlen séma-, policy-, role- vagy Storage-drift esetén RAISE EXCEPTION-nel
-- megszakad, és a teljes tranzakció visszagörgetődik.
--
-- BLOKKOLÓ / BREAKING FELTÉTELEK — FUTTATÁS ELŐTT KÖTELEZŐ:
--
--   1. Ez CUTOVER migráció, nem role-foundation. Kötelező rollout-sorrend:
--        a) külön role-foundation (`app_staff_user`, `app_pending_user`,
--           `member_portal_user` + authenticator membership),
--        b) fail-closed member core,
--        c) member-portal legacy-workflow kompatibilitási migráció,
--        d) ez a P0 ACL/RLS maintenance cutover,
--        e) Custom Access Token Hook cseréje, Dashboard-aktiválása és tesztje,
--        f) kötelező re-login és mindhárom token-role end-to-end tesztje,
--        g) csak ezután a handle_new_user member/staff dispatcher.
--      A hooknak:
--        * aktív, jóváhagyott staffnak `app_staff_user`,
--        * függő staff-regisztrációnak `app_pending_user`,
--        * külön tagi accountnak `member_portal_user`
--      JWT `role` claimet kell adnia. Régi aktív `authenticated` staff token a
--      DB-helperes RESTRICTIVE gate miatt átmenetileg táblát olvashat/írhat, de
--      frontend RPC allowlistet csak új `app_staff_user` token kap. A d)-f)
--      lépések egy maintenance ablak: az RPC-szolgáltatás rövid kiesése vállalt,
--      de pending/inactive régi token sem kap ön-eszkalációs ablakot.
--      A workflow-fájl telepítése után EZ A CUTOVER NEM FUTTATHATÓ ÚJRA, mert
--      a deny-by-default rutinlépése visszavonná a később auditált workflow-RPC
--      grantokat. A preflight ezt fail-closed módon blokkolja.
--
--   2. A `handle_new_user()` auth triggerhez ez a migráció SZÁNDÉKOSAN NEM nyúl.
--      A tagi alap-táblák telepítése előtt nem dönthető el biztonságosan, hogy az
--      új auth user staff-kérelem vagy tagi fiók. A trigger jelenleg továbbra is
--      `raw_user_meta_data.requested_role` alapján hoz létre staff-profilt; ezért
--      a publikus tagi signupot TILOS bekapcsolni a teljes fenti sorrend végéig.
--
--   3. A jelenlegi OAuth/profile kód `profiles.upsert(...)` hívásai INSERT és
--      scope-oszlop írási jogot igényelnek. Ez a P0 helyesen csak safe self UPDATE
--      oszlopokat enged; a kódot futtatás előtt UPDATE/RPC alapúra kell átírni.
--
--   4. Bizonyítottan további hardeningot igénylő frontend RPC-k itt NEM kapnak
--      app_staff EXECUTE jogot (az érintett funkció ideiglenesen leáll):
--        * import_finance_batch
--        * next_bizonylat_szam
--        * next_chitanta_full
--        * next_chitanta_number
--        * find_potential_cross_congregation_match
--        * get_cross_match_pastor_contacts
--        * resolve_cross_congregation_match
--        * wipe_finance_data
--      Ezek közül több caller-supplied tenant/user azonosítót fogad, vagy széles
--      személyes adatot ad vissza; külön, auth.uid()-hoz kötött javítás kell.
--      A district-admin felhasználókezelés is fail-closed módon rendszeradminra
--      szűkül, amíg minden érintett legacy RPC saját scope-ellenőrzést nem kap.
--
--   5. A publikus RPC allowlist SZÁNDÉKOSAN pontosan két élő signature:
--        * check_access_request_rate_limit(text)
--        * congregations_for_registration()
--      A login_email_status(text) és registration_email_info(text) emailből
--      staff-státuszt/gyülekezetet enumerál, ezért anon jogukat visszavonjuk; a
--      jelenlegi pre-login UX-et külön, nem enumeráló folyamattal kell javítani.
--      A későbbi public_site_* RPC-k csak külön auditált migrációval kaphatnak
--      anon jogot. Ez addig a publikus statisztikai blokkokat kikapcsolhatja.
--      Az app_pending OAuth-űrlap közvetlenül csak districts(id,name) és
--      dioceses(id,name,district_id) oszlopokat olvashat; congregations továbbra
--      is kizárólag a congregations_for_registration() RPC-n keresztül érhető el.
--
--   6. Az `avatars` bucket a live inventory szerint üres. A migráció ezért csak
--      akkor telepíti az approved congregation-scope profile_roles + exact
--      személy/tenant útvonal policy-ket, ha futáskor is 0 objektum van benne.
--      Nem üres bucketnél külön útvonal/tenant audit kell, a preflight megáll.
--      A hard limit 2 MiB, a MIME allowlist JPEG/PNG/WebP, az exact útvonal:
--      `${congregationId}/szemely-${szemelyId}.ext`.
--      Az `access-request-docs` bucket privát marad; a bizonyított, tetszőleges
--      anonim feltöltést engedő policy megszűnik. Feltölteni/törölni kizárólag
--      a service-role szerverfolyamat tud, olvasni pedig csak aktív rendszeradmin.
--
--   7. A public sémában 35 supabase_admin-owned pg_trgm/unaccent C rutin van.
--      A postgres SQL Editor nem tulajdonosuk; nem SECURITY DEFINER rutinok és
--      extension-tagok. Ezek explicit, exact kivételek. Minden postgres-owned
--      alkalmazásfüggvény deny-by-default lesz.
--
--   8. A member core célállapotában 0 postgres-owned public member RPC van.
--      Későbbi tagi RPC csak külön exact signature allowlisttel vagy külön
--      sémában kaphat jogot; név-alapú member grant ebbe a fájlba nem kerülhet.
--
--   9. A live pg_policies inventory 10 postgres-owned SECURITY DEFINER
--      jogosultsag-helpert hiv kozvetlenul. Ezek exact signature EXECUTE joga
--      authenticatednek megmarad, mert nelkuluk maga az RLS evaluation hibazna;
--      az app_staff ezt orokli. A minden public RLS tablara telepitett RESTRICTIVE
--      active-staff gate a regi pending/inactive authenticated tokeneket ettol
--      fuggetlenul fail-closed modon zarja.
--
-- NEM RÉSZE ENNEK A FÁJLNAK:
--   * tagi táblák, tagi RLS/RPC-k, Custom Access Token Hook;
--   * a handle_new_user() átírása;
--   * a 393 legacy policy teljes tenant-auditja;
--   * deploy vagy live SQL-futtatás.
--
-- A fájl egyetlen tranzakció. A COMMIT előtti postflight assert hibánál minden
-- módosítás rollbackel. A COMMIT utáni SELECT egy JSON ellenőrző riportot ad.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

-- --------------------------------------------------------------------------
-- 1. Exact frontend-RPC allowlist (csak live-ban bizonyított nevek)
-- --------------------------------------------------------------------------

CREATE TEMP TABLE p0_staff_rpc_allowlist (
  function_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO pg_temp.p0_staff_rpc_allowlist (function_name)
VALUES
  ('add_locality_for_review'),
  ('admin_activate_user'),
  ('admin_create_or_reinit_assignment'),
  ('admin_erase_user'),
  ('admin_overview_member_counts'),
  ('admin_reject_user'),
  ('admin_revoke_assignment'),
  ('admin_sync_legacy_role'),
  ('app_get_or_create_locality'),
  ('app_get_or_create_street'),
  ('check_access_request_rate_limit'),
  ('check_oblio_deadline_for_user'),
  ('complete_congregation_transfer'),
  ('complete_user_onboarding'),
  ('complete_user_walkthrough'),
  ('congregations_for_registration'),
  ('ensure_cash_denominations'),
  ('erase_my_account'),
  ('find_locality_match'),
  ('find_streets_with_postalcode'),
  ('generate_egyhazi_anyakonyvi_szam'),
  ('generate_egyhazi_cnp'),
  ('get_open_transfer_for_congregation'),
  ('get_record_audit'),
  ('import_families_from_existing_persons_batch'),
  ('import_family_head_batch'),
  ('import_registry_batch'),
  ('infer_family_links_for_congregation'),
  ('initiate_congregation_transfer'),
  ('is_multi_postalcode_locality'),
  ('list_family_link_batches'),
  ('log_audit_event'),
  ('login_email_status'),
  ('mm_list_segedanyagok'),
  ('mm_save_segedanyag_atomic'),
  ('next_iktato_sequence'),
  ('recompute_voter_eligibility'),
  ('record_pastor_tenure_start'),
  ('registration_email_info'),
  ('reopen_iktato_year'),
  ('respond_to_member_transfer_notification'),
  ('reserve_chitanta_numbers'),
  ('reserve_iratszam'),
  ('restart_user_onboarding'),
  ('revert_family_link_batch'),
  ('sync_iktato_sequence_pointer'),
  ('tagnyilvantartas_csalad_mentes'),
  ('tagnyilvantartas_tag_torles'),
  ('touch_last_seen'),
  ('transfer_add_remark'),
  ('transfer_approve'),
  ('vault_decrypt'),
  ('vault_encrypt'),
  ('wipe_congregation_data');

-- A live pg_policies inventoryban kozvetlenul hivatkozott helper-fuggvenyek.
-- Ezek nem frontend RPC-k: a legacy authenticated tokenek es az authenticatedet
-- oroklo app_staff_user policy evaluationje igenyli az EXECUTE jogot. A global
-- RESTRICTIVE active-staff gate tovabbra is minden legacy tabla-hozzaferest zar.
CREATE TEMP TABLE p0_authenticated_policy_helpers (
  function_signature text PRIMARY KEY,
  function_name text NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO pg_temp.p0_authenticated_policy_helpers (
  function_signature,
  function_name
)
VALUES
  ('public.current_user_can_access_congregation(uuid)', 'current_user_can_access_congregation'),
  ('public.current_user_can_edit_congregation(uuid)', 'current_user_can_edit_congregation'),
  ('public.current_user_can_edit_tva_flags()', 'current_user_can_edit_tva_flags'),
  ('public.current_user_congregation_id()', 'current_user_congregation_id'),
  ('public.current_user_has_global_access()', 'current_user_has_global_access'),
  ('public.csalad_resolves_to_accessible_cong(integer,integer)', 'csalad_resolves_to_accessible_cong'),
  ('public.gyerek_resolves_to_accessible_cong(integer,integer)', 'gyerek_resolves_to_accessible_cong'),
  ('public.is_admin()', 'is_admin'),
  ('public.is_koltsegvetes_locked(uuid,text)', 'is_koltsegvetes_locked'),
  ('public.same_congregation(uuid)', 'same_congregation');

CREATE TEMP TABLE p0_install_mode (
  mode text PRIMARY KEY CHECK (mode IN ('first_install', 'verified_rerun'))
) ON COMMIT DROP;

-- --------------------------------------------------------------------------
-- 2. Preflight — jogosultság, bizonyított live séma és drift
-- --------------------------------------------------------------------------

DO $preflight$
DECLARE
  v_custom_role_count integer;
  v_policy_names text[];
  v_avatar_policy_names text[];
  v_access_doc_policy_names text[];
  v_missing_columns text[];
  v_bad_rpc_names text[];
  v_mode text;
  v_extension_function_count integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'P0 preflight: ezt a review-draftot csak a bizonyított postgres SQL Editor szereppel szabad futtatni; current_user=%',
      current_user;
  END IF;

  -- A teljes member-portal maintenance sorozat közös tranzakciós lockja.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
  );

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin')
  THEN
    RAISE EXCEPTION 'P0 preflight: hiányzik legalább egy kötelező Supabase role.';
  END IF;

  SELECT count(*)::integer
    INTO v_custom_role_count
  FROM pg_catalog.pg_roles
  WHERE rolname IN ('app_staff_user', 'app_pending_user', 'member_portal_user');

  IF v_custom_role_count NOT IN (0, 3) THEN
    RAISE EXCEPTION
      'P0 preflight: részleges custom-role telepítés/drift (%/3 role). Kézi audit szükséges.',
      v_custom_role_count;
  END IF;

  -- A role foundation létezése nem jelenti azt, hogy a cutover is lefutott.
  -- A rerun-marker kizárólag a target helper exact kommentje lehet.
  IF to_regprocedure('public.current_user_is_active_staff()') IS NOT NULL
     AND pg_catalog.obj_description(
       to_regprocedure('public.current_user_is_active_staff()'),
       'pg_proc'
     ) = 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
  THEN
    v_mode := 'verified_rerun';
  ELSE
    v_mode := 'first_install';
  END IF;

  IF v_mode = 'verified_rerun' AND v_custom_role_count <> 3 THEN
    RAISE EXCEPTION 'P0 preflight rerun: a cutover marker mellett a három custom role kötelező.';
  END IF;

  INSERT INTO pg_temp.p0_install_mode(mode) VALUES (v_mode);

  IF pg_catalog.to_regprocedure(
       'public.member_portal_my_request_state()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION
      'P0 preflight: a downstream tagi workflow már telepítve van; ezt a cutover migrációt utána tilos újrafuttatni.';
  END IF;

  IF to_regclass('auth.users') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.profile_roles') IS NULL
     OR to_regclass('public.szemely') IS NULL
     OR to_regclass('public.districts') IS NULL
     OR to_regclass('public.dioceses') IS NULL
     OR to_regclass('public.congregations') IS NULL
     OR to_regclass('storage.objects') IS NULL
     OR to_regclass('storage.buckets') IS NULL
  THEN
    RAISE EXCEPTION 'P0 preflight: a bizonyított live alaptáblák egyike hiányzik.';
  END IF;

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
     ) IS DISTINCT FROM
       'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'
     OR pg_catalog.to_regprocedure(
       'public.respond_to_member_transfer_notification(uuid,text,text)'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.respond_to_member_transfer_notification(uuid,text,text)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_TRANSFER_COMPAT_V1'
  THEN
    RAISE EXCEPTION
      'P0 preflight: a kötelező legacy-workflow kompatibilitási migráció exact markerei hiányoznak.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('districts'::text, 'id'::text, 'uuid'::text),
      ('districts', 'name', 'text'),
      ('dioceses', 'id', 'uuid'),
      ('dioceses', 'name', 'text'),
      ('dioceses', 'district_id', 'uuid')
    ) expected(table_name, column_name, type_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = expected.table_name
        AND a.attname = expected.column_name
        AND NOT a.attisdropped
        AND pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.type_name
    )
  ) THEN
    RAISE EXCEPTION 'P0 preflight: a pending OAuth referenciaoszlopok egyike hiányzik vagy típusa driftelt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'P0 preflight: public.profiles nem postgres-owned RLS tábla.';
  END IF;

  -- A live inventory minden public base/partitioned táblán RLS-t igazolt. Ha
  -- új, RLS nélküli tábla jelent meg, a globális legacy-token gate nem teljes.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'P0 preflight: RLS nélküli public base/partitioned tábla jelent meg.';
  END IF;

  WITH expected(column_name, type_name) AS (
    VALUES
      ('id', 'uuid'),
      ('email', 'text'),
      ('full_name', 'text'),
      ('phone', 'text'),
      ('birth_date', 'date'),
      ('status', 'text'),
      ('role', 'text'),
      ('congregation_id', 'uuid'),
      ('diocese_id', 'uuid'),
      ('district_id', 'uuid'),
      ('deleted_at', 'timestamp with time zone'),
      ('anonymized_at', 'timestamp with time zone'),
      ('walkthrough_completed', 'boolean'),
      ('walkthrough_skipped_at', 'timestamp with time zone')
  ), missing AS (
    SELECT e.column_name || ':' || e.type_name AS item
    FROM expected e
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = 'public.profiles'::regclass
     AND a.attname = e.column_name
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE a.attname IS NULL
       OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.type_name
  )
  SELECT array_agg(item ORDER BY item) INTO v_missing_columns FROM missing;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'P0 preflight: hiányzó vagy eltérő profiles oszlop/típus: %',
      v_missing_columns;
  END IF;

  WITH expected(column_name, type_name) AS (
    VALUES
      ('profile_id', 'uuid'),
      ('scope', 'text'),
      ('scope_id', 'uuid'),
      ('active', 'boolean'),
      ('approval_status', 'text')
  ), missing AS (
    SELECT e.column_name || ':' || e.type_name AS item
    FROM expected e
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = 'public.profile_roles'::regclass
     AND a.attname = e.column_name
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE a.attname IS NULL
       OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.type_name
  )
  SELECT array_agg(item ORDER BY item) INTO v_missing_columns FROM missing;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'P0 preflight: hiányzó vagy eltérő profile_roles oszlop/típus: %',
      v_missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_pkey'
      AND contype = 'p'
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_id_fkey'
      AND contype = 'f'
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_role_check'
      AND contype = 'c'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'P0 preflight: a profiles PK/FK/role constraint bizonyíték eltért.';
  END IF;

  -- Az auth trigger állapotát csak ellenőrizzük; ebben a migrációban nem írjuk.
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  ) <> 1 THEN
    RAISE EXCEPTION 'P0 preflight: az on_auth_user_created -> public.handle_new_user trigger eltért.';
  END IF;

  IF to_regprocedure('public.check_access_request_rate_limit(text)') IS NULL
     OR to_regprocedure('public.congregations_for_registration()') IS NULL
  THEN
    RAISE EXCEPTION 'P0 preflight: a pontos két anon RPC signature egyike hiányzik.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = to_regprocedure('public.custom_access_token_hook(jsonb)')
      AND n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND (
        (
          (SELECT l.lanname FROM pg_catalog.pg_language l WHERE l.oid = p.prolang)
            = 'sql'
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
            WHERE cfg = 'search_path=public'
          )
          AND p.prosrc LIKE '%jsonb_build_object(%''approved''%'
          AND p.prosrc LIKE '%''profile_status''%'
          AND p.prosrc LIKE '%''congregation_id''%'
          AND p.prosrc LIKE '%''profile_role''%'
        )
        OR (
          (SELECT l.lanname FROM pg_catalog.pg_language l WHERE l.oid = p.prolang)
            = 'plpgsql'
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
            WHERE cfg IN ('search_path=', 'search_path=""')
          )
          AND COALESCE(pg_catalog.obj_description(p.oid, 'pg_proc'), '')
              LIKE 'KARTOTEKA P0 token hook v2:%'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'P0 preflight: sem az inventory-baseline legacy hook, sem a KARTOTEKA P0 token hook v2 exact alakja nem található.';
  END IF;

  -- Egy névhez pontosan egy live public signature tartozhat. Így a dinamikus
  -- GRANT nem tud ismeretlen overloadot véletlenül hozzáadni az allowlisthez.
  SELECT array_agg(a.function_name ORDER BY a.function_name)
    INTO v_bad_rpc_names
  FROM pg_temp.p0_staff_rpc_allowlist a
  WHERE (
    SELECT count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = a.function_name
      AND p.prokind = 'f'
  ) <> 1;

  IF v_bad_rpc_names IS NOT NULL THEN
    RAISE EXCEPTION
      'P0 preflight: hiányzó vagy overloadolt frontend RPC név: %. Exact signature audit kell.',
      v_bad_rpc_names;
  END IF;

  SELECT pg_catalog.array_agg(h.function_signature ORDER BY h.function_signature)
    INTO v_bad_rpc_names
  FROM pg_temp.p0_authenticated_policy_helpers h
  WHERE pg_catalog.to_regprocedure(h.function_signature) IS NULL
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = h.function_name
         AND p.prokind = 'f'
     ) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       WHERE p.oid = pg_catalog.to_regprocedure(h.function_signature)
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND p.prosecdef
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policies pol
       WHERE pol.schemaname = 'public'
         AND (
           COALESCE(pol.qual, '') LIKE
             '%' || h.function_name || '(%'
           OR COALESCE(pol.with_check, '') LIKE
             '%' || h.function_name || '(%'
         )
     );

  IF v_bad_rpc_names IS NOT NULL THEN
    RAISE EXCEPTION
      'P0 preflight: hianyzik, overloadolt, nem postgres/SECURITY DEFINER vagy mar nem policy-helper: %',
      v_bad_rpc_names;
  END IF;

  -- A public sémában 35, supabase_admin-owned C extension-rutin él a pg_trgm és
  -- unaccent extensionből. A postgres SQL Editor role nem tulajdonosuk, ezért
  -- ACL-jük nem írható. Csak ezt az exact, nem-SECURITY-DEFINER extensionhalmazt
  -- fogadjuk el kivételként; minden más nem-postgres rutin blokkoló drift.
  SELECT count(*)::integer
    INTO v_extension_function_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'supabase_admin'
    AND NOT p.prosecdef
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = p.oid
        AND d.refclassid = 'pg_catalog.pg_extension'::regclass
        AND d.deptype = 'e'
        AND e.extname IN ('pg_trgm', 'unaccent')
    );

  IF v_extension_function_count <> 35 OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
      AND NOT COALESCE((
        pg_catalog.pg_get_userbyid(p.proowner) = 'supabase_admin'
        AND NOT p.prosecdef
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_depend d
          JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
          WHERE d.classid = 'pg_catalog.pg_proc'::regclass
            AND d.objid = p.oid
            AND d.refclassid = 'pg_catalog.pg_extension'::regclass
            AND d.deptype = 'e'
            AND e.extname IN ('pg_trgm', 'unaccent')
        )
      ), false)
  ) THEN
    RAISE EXCEPTION
      'P0 preflight: a szűk public extension-rutin kivétel driftelt (elfogadott 35, talált %).',
      v_extension_function_count;
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_policy_names
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles';

  IF v_mode = 'first_install' THEN
    IF v_policy_names IS DISTINCT FROM ARRAY[
      'profiles_insert', 'profiles_read', 'profiles_write'
    ]::text[] THEN
      RAISE EXCEPTION
        'P0 preflight: ismeretlen profiles policy-drift: %', v_policy_names;
    END IF;

    IF (
      SELECT count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND permissive = 'PERMISSIVE'
        AND roles = ARRAY['authenticated']::name[]
        AND (
          (
            policyname = 'profiles_insert'
            AND cmd = 'INSERT'
            AND qual IS NULL
            AND with_check = '(id = auth.uid())'
          )
          OR (
            policyname = 'profiles_read'
            AND cmd = 'SELECT'
            AND qual = 'true'
            AND with_check IS NULL
          )
          OR (
            policyname = 'profiles_write'
            AND cmd = 'UPDATE'
            AND qual = '(id = auth.uid())'
            AND with_check IS NULL
          )
        )
    ) <> 3 THEN
      RAISE EXCEPTION 'P0 preflight: a három inventory-baseline profiles policy definíciója driftelt.';
    END IF;
  ELSE
    IF v_policy_names IS DISTINCT FROM ARRAY[
      'p0_legacy_authenticated_staff_gate',
      'p0_profiles_pending_select_self',
      'p0_profiles_pending_update_safe_self',
      'p0_profiles_staff_select',
      'p0_profiles_staff_update_safe_self'
    ]::text[] THEN
      RAISE EXCEPTION
        'P0 preflight rerun: a telepített profiles policy-k drifteltek: %',
        v_policy_names;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname IN (
          'p0_profiles_staff_select',
          'p0_profiles_staff_update_safe_self',
          'p0_profiles_pending_select_self',
          'p0_profiles_pending_update_safe_self'
        )
        AND (
          permissive <> 'PERMISSIVE'
          OR (
            policyname LIKE 'p0_profiles_staff_%'
            AND roles IS DISTINCT FROM
              ARRAY['authenticated', 'app_staff_user']::name[]
          )
          OR (
            policyname LIKE 'p0_profiles_pending_%'
            AND roles IS DISTINCT FROM ARRAY['app_pending_user']::name[]
          )
          OR (policyname LIKE '%_select%' AND cmd <> 'SELECT')
          OR (policyname LIKE '%_update_%' AND cmd <> 'UPDATE')
          OR (
            policyname = 'p0_profiles_staff_select'
            AND COALESCE(qual, '') NOT LIKE '%current_user_is_active_staff%'
          )
          OR (
            policyname <> 'p0_profiles_staff_select'
            AND COALESCE(qual, '') NOT LIKE '%auth.uid%'
          )
          OR (
            policyname LIKE '%_update_%'
            AND COALESCE(with_check, '') NOT LIKE '%auth.uid%'
          )
        )
    ) THEN
      RAISE EXCEPTION 'P0 preflight rerun: a profiles policy role/cmd/guard célállapota driftelt.';
    END IF;
  END IF;

  IF v_mode = 'first_install' THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'avatars'
        AND name = 'avatars'
        AND public = true
        AND file_size_limit IS NULL
        AND allowed_mime_types IS NULL
    ) THEN
      RAISE EXCEPTION
        'P0 preflight: a live inventoryban bizonyított korlátlan avatars bucket hiányzik/eltért.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'avatars'
        AND name = 'avatars'
        AND public = true
        AND file_size_limit = 2097152
        AND allowed_mime_types = ARRAY[
          'image/jpeg', 'image/png', 'image/webp'
        ]::text[]
    ) THEN
      RAISE EXCEPTION 'P0 preflight rerun: az avatars bucket limit/MIME driftelt.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars') THEN
    RAISE EXCEPTION
      'P0 preflight: az avatars bucket már nem üres. Owner/path backfill nélkül nem hardenelhető.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'access-request-docs'
      AND name = 'access-request-docs'
      AND public = false
      AND file_size_limit = 10485760
      AND allowed_mime_types = ARRAY[
        'application/pdf', 'image/jpeg', 'image/png'
      ]::text[]
  ) THEN
    RAISE EXCEPTION
      'P0 preflight: az access-request-docs privát bucket limit/MIME beállítása driftelt.';
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_avatar_policy_names
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      policyname LIKE 'avatars_%'
      OR policyname LIKE 'p0_avatars_%'
      OR COALESCE(qual, '') LIKE '%avatars%'
      OR COALESCE(with_check, '') LIKE '%avatars%'
    );

  IF v_mode = 'first_install' THEN
    IF v_avatar_policy_names IS DISTINCT FROM ARRAY[
      'avatars_auth_delete',
      'avatars_auth_insert',
      'avatars_auth_update',
      'avatars_public_read'
    ]::text[] THEN
      RAISE EXCEPTION
        'P0 preflight: ismeretlen avatars policy-drift: %',
        v_avatar_policy_names;
    END IF;

    IF (
      SELECT count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND permissive = 'PERMISSIVE'
        AND (
          (
            policyname = 'avatars_public_read'
            AND roles = ARRAY['public']::name[]
            AND cmd = 'SELECT'
            AND qual = '(bucket_id = ''avatars''::text)'
            AND with_check IS NULL
          )
          OR (
            policyname = 'avatars_auth_insert'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'INSERT'
            AND qual IS NULL
            AND with_check = '(bucket_id = ''avatars''::text)'
          )
          OR (
            policyname = 'avatars_auth_update'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'UPDATE'
            AND qual = '(bucket_id = ''avatars''::text)'
            AND with_check = '(bucket_id = ''avatars''::text)'
          )
          OR (
            policyname = 'avatars_auth_delete'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'DELETE'
            AND qual = '(bucket_id = ''avatars''::text)'
            AND with_check IS NULL
          )
        )
    ) <> 4 THEN
      RAISE EXCEPTION 'P0 preflight: az inventory-baseline avatars policy definíciók drifteltek.';
    END IF;
  ELSE
    IF v_avatar_policy_names IS DISTINCT FROM ARRAY[
      'avatars_public_read',
      'p0_avatars_staff_delete',
      'p0_avatars_staff_insert',
      'p0_avatars_staff_update'
    ]::text[] THEN
      RAISE EXCEPTION
        'P0 preflight rerun: a telepített avatars policy-k drifteltek: %',
        v_avatar_policy_names;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname IN (
          'p0_avatars_staff_insert',
          'p0_avatars_staff_update',
          'p0_avatars_staff_delete'
        )
        AND (
          permissive <> 'PERMISSIVE'
          OR roles IS DISTINCT FROM ARRAY['app_staff_user']::name[]
          OR (policyname = 'p0_avatars_staff_insert' AND cmd <> 'INSERT')
          OR (policyname = 'p0_avatars_staff_update' AND cmd <> 'UPDATE')
          OR (policyname = 'p0_avatars_staff_delete' AND cmd <> 'DELETE')
          OR COALESCE(qual, with_check, '') NOT LIKE '%current_user_is_active_staff%'
          OR COALESCE(qual, with_check, '') NOT LIKE '%profile_roles%'
          OR COALESCE(qual, with_check, '') NOT LIKE '%szemely-%'
          OR (
            COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
          ) LIKE '%owner%'
          OR (
            COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
          ) LIKE '%profiles.congregation_id%'
        )
    ) THEN
      RAISE EXCEPTION 'P0 preflight rerun: az avatars policy role/cmd/guard célállapota driftelt.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'avatars_public_read'
        AND permissive = 'PERMISSIVE'
        AND roles = ARRAY['public']::name[]
        AND cmd = 'SELECT'
        AND qual = '(bucket_id = ''avatars''::text)'
        AND with_check IS NULL
    ) THEN
      RAISE EXCEPTION 'P0 preflight rerun: az avatars public read policy driftelt.';
    END IF;
  END IF;

  SELECT pg_catalog.array_agg(policyname ORDER BY policyname)
    INTO v_access_doc_policy_names
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      policyname LIKE '%access_request_docs%'
      OR COALESCE(qual, '') LIKE '%access-request-docs%'
      OR COALESCE(with_check, '') LIKE '%access-request-docs%'
    );

  IF v_mode = 'first_install' THEN
    IF v_access_doc_policy_names IS DISTINCT FROM ARRAY[
      'access_request_docs_admin_read',
      'access_request_docs_anon_insert'
    ]::text[] THEN
      RAISE EXCEPTION
        'P0 preflight: ismeretlen access-request-docs policy-drift: %',
        v_access_doc_policy_names;
    END IF;

    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND permissive = 'PERMISSIVE'
        AND (
          (
            policyname = 'access_request_docs_admin_read'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'SELECT'
            AND COALESCE(qual, '') LIKE '%access-request-docs%'
            AND COALESCE(qual, '') LIKE '%profiles%'
            AND COALESCE(qual, '') LIKE '%auth.uid%'
            AND COALESCE(qual, '') LIKE '%status%active%'
            AND COALESCE(qual, '') LIKE '%role%admin%'
            AND with_check IS NULL
          )
          OR (
            policyname = 'access_request_docs_anon_insert'
            AND roles = ARRAY['anon', 'authenticated']::name[]
            AND cmd = 'INSERT'
            AND qual IS NULL
            AND with_check =
              '(bucket_id = ''access-request-docs''::text)'
          )
        )
    ) <> 2 THEN
      RAISE EXCEPTION
        'P0 preflight: az access-request-docs inventory-policy definíciója driftelt.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'p0_storage_legacy_authenticated_staff_gate'
    ) THEN
      RAISE EXCEPTION
        'P0 preflight: váratlan Storage legacy-token gate már létezik.';
    END IF;
  ELSE
    IF v_access_doc_policy_names IS DISTINCT FROM ARRAY[
      'p0_access_request_docs_admin_read',
      'p0_access_request_docs_no_client_delete',
      'p0_access_request_docs_no_client_insert',
      'p0_access_request_docs_no_client_update'
    ]::text[] THEN
      RAISE EXCEPTION
        'P0 preflight rerun: az access-request-docs policy-lista driftelt: %',
        v_access_doc_policy_names;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'p0_access_request_docs_admin_read'
        AND permissive = 'PERMISSIVE'
        AND roles = ARRAY['app_staff_user']::name[]
        AND cmd = 'SELECT'
        AND COALESCE(qual, '') LIKE '%access-request-docs%'
        AND COALESCE(qual, '') LIKE '%current_user_is_active_staff%'
        AND COALESCE(qual, '') LIKE '%profiles%'
        AND COALESCE(qual, '') LIKE '%profile_roles%'
        AND COALESCE(qual, '') LIKE '%auth.uid%'
        AND COALESCE(qual, '') LIKE '%status%active%'
        AND COALESCE(qual, '') LIKE '%deleted_at%IS NULL%'
        AND COALESCE(qual, '') LIKE '%approval_status%approved%'
        AND COALESCE(qual, '') LIKE '%scope%system%'
        AND COALESCE(qual, '') LIKE '%scope_id%IS NULL%'
        AND COALESCE(qual, '') LIKE '%role%admin%'
        AND with_check IS NULL
    ) THEN
      RAISE EXCEPTION
        'P0 preflight rerun: az access-request-docs admin-read policy driftelt.';
    END IF;

    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname IN (
          'p0_access_request_docs_no_client_insert',
          'p0_access_request_docs_no_client_update',
          'p0_access_request_docs_no_client_delete'
        )
        AND permissive = 'RESTRICTIVE'
        AND roles = ARRAY['public']::name[]
        AND (
          (
            policyname = 'p0_access_request_docs_no_client_insert'
            AND cmd = 'INSERT'
            AND qual IS NULL
            AND COALESCE(with_check, '') LIKE '%bucket_id%'
            AND COALESCE(with_check, '') LIKE '%<>%access-request-docs%'
          )
          OR (
            policyname = 'p0_access_request_docs_no_client_update'
            AND cmd = 'UPDATE'
            AND COALESCE(qual, '') LIKE '%bucket_id%'
            AND COALESCE(qual, '') LIKE '%<>%access-request-docs%'
            AND COALESCE(with_check, '') LIKE '%bucket_id%'
            AND COALESCE(with_check, '') LIKE '%<>%access-request-docs%'
          )
          OR (
            policyname = 'p0_access_request_docs_no_client_delete'
            AND cmd = 'DELETE'
            AND COALESCE(qual, '') LIKE '%bucket_id%'
            AND COALESCE(qual, '') LIKE '%<>%access-request-docs%'
            AND with_check IS NULL
          )
        )
    ) <> 3 THEN
      RAISE EXCEPTION
        'P0 preflight rerun: az access-request-docs restrictive write-deny policy-k drifteltek.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'p0_storage_legacy_authenticated_staff_gate'
        AND permissive = 'RESTRICTIVE'
        AND roles = ARRAY['authenticated']::name[]
        AND cmd = 'ALL'
        AND COALESCE(qual, '') LIKE '%current_user_is_active_staff%'
        AND COALESCE(with_check, '') LIKE '%current_user_is_active_staff%'
    ) THEN
      RAISE EXCEPTION
        'P0 preflight rerun: a Storage legacy-token gate hiányzik vagy driftelt.';
    END IF;
  END IF;

  IF v_mode = 'first_install' THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND (
          (tablename = 'districts'
            AND policyname = 'p0_districts_pending_reference_select')
          OR (tablename = 'dioceses'
            AND policyname = 'p0_dioceses_pending_reference_select')
        )
    ) THEN
      RAISE EXCEPTION 'P0 preflight: váratlan pending OAuth referencia-policy már létezik.';
    END IF;
  ELSIF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND cmd = 'SELECT'
      AND roles = ARRAY['app_pending_user']::name[]
      AND COALESCE(qual, '') = 'true'
      AND with_check IS NULL
      AND (
        (tablename = 'districts'
          AND policyname = 'p0_districts_pending_reference_select')
        OR (tablename = 'dioceses'
          AND policyname = 'p0_dioceses_pending_reference_select')
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'P0 preflight rerun: a pending OAuth referencia-policy célállapot driftelt.';
  END IF;
END
$preflight$;

-- Meglévő custom role esetén sem javítunk csendben attribútum- vagy membership
-- driftet. Első telepítéskor mindhárom egyszerre jön létre.
DO $role_preflight$
DECLARE
  v_mode text := (SELECT mode FROM pg_temp.p0_install_mode);
  v_bad text[];
  v_anon_functions text[];
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('app_staff_user', 'app_pending_user', 'member_portal_user')
  ) = 3 THEN
    SELECT array_agg(rolname ORDER BY rolname)
      INTO v_bad
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('app_staff_user', 'app_pending_user', 'member_portal_user')
      AND (
        rolsuper OR rolcanlogin OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls
        OR (rolname = 'app_staff_user' AND NOT rolinherit)
        OR (rolname IN ('app_pending_user', 'member_portal_user') AND rolinherit)
      );

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'P0 role preflight: veszélyes role-attribútum drift: %', v_bad;
    END IF;

    -- Pending/member sem közvetlenül, sem role-láncon nem örökölhet
    -- authenticated jogot. Ez már foundation-fázisban is blokkoló drift.
    IF pg_has_role('app_pending_user', 'authenticated', 'MEMBER')
       OR pg_has_role('member_portal_user', 'authenticated', 'MEMBER')
    THEN
      RAISE EXCEPTION 'P0 role preflight: pending/member authenticated öröklési drift.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname NOT IN ('app_staff_user', 'authenticated')
        AND pg_has_role('app_staff_user', r.oid, 'MEMBER')
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname <> 'app_pending_user'
        AND pg_has_role('app_pending_user', r.oid, 'MEMBER')
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname <> 'member_portal_user'
        AND pg_has_role('member_portal_user', r.oid, 'MEMBER')
    ) OR EXISTS (
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
      RAISE EXCEPTION 'P0 role preflight: váratlan közvetlen vagy közvetett custom-role membership drift.';
    END IF;

    IF v_mode = 'first_install'
       AND (
         has_table_privilege('app_pending_user', 'public.districts', 'SELECT')
         OR has_table_privilege('app_pending_user', 'public.districts', 'INSERT')
         OR has_table_privilege('app_pending_user', 'public.districts', 'UPDATE')
         OR has_table_privilege('app_pending_user', 'public.districts', 'DELETE')
         OR has_table_privilege('app_pending_user', 'public.dioceses', 'SELECT')
         OR has_table_privilege('app_pending_user', 'public.dioceses', 'INSERT')
         OR has_table_privilege('app_pending_user', 'public.dioceses', 'UPDATE')
         OR has_table_privilege('app_pending_user', 'public.dioceses', 'DELETE')
         OR has_table_privilege('app_pending_user', 'public.congregations', 'SELECT')
         OR has_table_privilege('app_pending_user', 'public.congregations', 'INSERT')
         OR has_table_privilege('app_pending_user', 'public.congregations', 'UPDATE')
         OR has_table_privilege('app_pending_user', 'public.congregations', 'DELETE')
         OR has_any_column_privilege(
           'app_pending_user', 'public.congregations', 'SELECT'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.congregations', 'INSERT'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.congregations', 'UPDATE'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.congregations', 'REFERENCES'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.districts', 'SELECT'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.districts', 'INSERT'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.districts', 'UPDATE'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.districts', 'REFERENCES'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.dioceses', 'SELECT'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.dioceses', 'INSERT'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.dioceses', 'UPDATE'
         )
         OR has_any_column_privilege(
           'app_pending_user', 'public.dioceses', 'REFERENCES'
         )
       )
    THEN
      RAISE EXCEPTION 'P0 role preflight: váratlan pending referencia-grant a first install előtt.';
    END IF;
  END IF;

  IF v_mode = 'verified_rerun' THEN
    IF NOT pg_has_role('app_staff_user', 'authenticated', 'MEMBER')
       OR pg_has_role('app_pending_user', 'authenticated', 'MEMBER')
       OR pg_has_role('member_portal_user', 'authenticated', 'MEMBER')
       OR NOT pg_has_role('authenticator', 'app_staff_user', 'MEMBER')
       OR NOT pg_has_role('authenticator', 'app_pending_user', 'MEMBER')
       OR NOT pg_has_role('authenticator', 'member_portal_user', 'MEMBER')
    THEN
      RAISE EXCEPTION 'P0 role preflight: custom role membership drift.';
    END IF;

    -- Rerun előtt a már telepített ACL-eket is exact célállapotként ellenőrizzük.
    -- Így egy újrafuttatás nem „javítja meg” és nem rejti el csendben a driftet.
    IF has_schema_privilege('anon', 'public', 'CREATE')
       OR has_schema_privilege('authenticated', 'public', 'CREATE')
       OR has_schema_privilege('service_role', 'public', 'CREATE')
       OR has_schema_privilege('supabase_auth_admin', 'public', 'CREATE')
       OR NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')
       OR has_schema_privilege('app_staff_user', 'public', 'CREATE')
       OR has_schema_privilege('app_pending_user', 'public', 'CREATE')
       OR has_schema_privilege('member_portal_user', 'public', 'CREATE')
    THEN
      RAISE EXCEPTION 'P0 rerun preflight: public schema CREATE ACL drift.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_default_acl d
      JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
      LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
      WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
        AND n.nspname = 'public'
        AND d.defaclobjtype IN ('f', 'r', 'S')
        AND (
          acl.grantee = 0
          OR grantee.rolname IN (
            'anon', 'authenticated', 'service_role', 'app_staff_user',
            'app_pending_user', 'member_portal_user'
          )
        )
    ) THEN
      RAISE EXCEPTION 'P0 rerun preflight: postgres public default ACL drift.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        )
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND p.proname <> 'current_user_is_active_staff'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_temp.p0_authenticated_policy_helpers h
          WHERE pg_catalog.to_regprocedure(h.function_signature) = p.oid
        )
    ) THEN
      RAISE EXCEPTION 'P0 rerun preflight: PUBLIC/authenticated function ACL drift.';
    END IF;

    IF NOT has_function_privilege(
         'supabase_auth_admin',
         'public.custom_access_token_hook(jsonb)',
         'EXECUTE'
       )
       OR has_function_privilege(
         'anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
       )
       OR has_function_privilege(
         'authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
       )
       OR has_function_privilege(
         'service_role', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
       )
       OR has_function_privilege(
         'app_staff_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
       )
       OR has_function_privilege(
         'app_pending_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
       )
       OR has_function_privilege(
         'member_portal_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
       )
    THEN
      RAISE EXCEPTION 'P0 rerun preflight: Custom Access Token Hook ACL drift.';
    END IF;

    SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
      INTO v_anon_functions
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF v_anon_functions IS DISTINCT FROM ARRAY[
      'check_access_request_rate_limit(text)',
      'congregations_for_registration()'
    ]::text[] THEN
      RAISE EXCEPTION 'P0 rerun preflight: anon function ACL drift: %', v_anon_functions;
    END IF;

    SELECT array_agg(a.function_name ORDER BY a.function_name)
      INTO v_bad
    FROM pg_temp.p0_staff_rpc_allowlist a
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = a.function_name
        AND has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
    );

    IF v_bad IS NOT NULL
       OR EXISTS (
         SELECT 1
         FROM pg_temp.p0_authenticated_policy_helpers h
         WHERE NOT has_function_privilege(
           'authenticated',
           pg_catalog.to_regprocedure(h.function_signature),
           'EXECUTE'
         )
       )
       OR to_regprocedure('public.current_user_is_active_staff()') IS NULL
       OR NOT has_function_privilege(
         'authenticated',
         'public.current_user_is_active_staff()',
         'EXECUTE'
       )
       OR NOT has_function_privilege(
         'app_staff_user',
         'public.current_user_is_active_staff()',
         'EXECUTE'
       )
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
           AND has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
           AND p.proname <> 'current_user_is_active_staff'
           AND NOT EXISTS (
             SELECT 1 FROM pg_temp.p0_staff_rpc_allowlist a
             WHERE a.function_name = p.proname
           )
           AND NOT EXISTS (
             SELECT 1 FROM pg_temp.p0_authenticated_policy_helpers h
             WHERE h.function_name = p.proname
           )
       )
    THEN
      RAISE EXCEPTION 'P0 rerun preflight: app_staff function ACL drift; hiányzó=%', v_bad;
    END IF;

    IF NOT has_function_privilege(
         'app_pending_user',
         'public.congregations_for_registration()',
         'EXECUTE'
       )
       OR (
         SELECT count(*)
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
           AND has_function_privilege('app_pending_user', p.oid, 'EXECUTE')
       ) <> 1
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
           AND has_function_privilege('member_portal_user', p.oid, 'EXECUTE')
       )
    THEN
      RAISE EXCEPTION 'P0 rerun preflight: pending/member function ACL drift.';
    END IF;

    IF has_table_privilege('app_pending_user', 'public.districts', 'SELECT')
       OR has_table_privilege('app_pending_user', 'public.districts', 'INSERT')
       OR has_table_privilege('app_pending_user', 'public.districts', 'UPDATE')
       OR has_table_privilege('app_pending_user', 'public.districts', 'DELETE')
       OR has_table_privilege('app_pending_user', 'public.dioceses', 'SELECT')
       OR has_table_privilege('app_pending_user', 'public.dioceses', 'INSERT')
       OR has_table_privilege('app_pending_user', 'public.dioceses', 'UPDATE')
       OR has_table_privilege('app_pending_user', 'public.dioceses', 'DELETE')
       OR has_table_privilege('app_pending_user', 'public.congregations', 'SELECT')
       OR has_table_privilege('app_pending_user', 'public.congregations', 'INSERT')
       OR has_table_privilege('app_pending_user', 'public.congregations', 'UPDATE')
       OR has_table_privilege('app_pending_user', 'public.congregations', 'DELETE')
       OR has_any_column_privilege(
         'app_pending_user', 'public.congregations', 'SELECT'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.congregations', 'INSERT'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.congregations', 'UPDATE'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.congregations', 'REFERENCES'
       )
       OR NOT has_column_privilege(
         'app_pending_user', 'public.districts', 'id', 'SELECT'
       )
       OR NOT has_column_privilege(
         'app_pending_user', 'public.districts', 'name', 'SELECT'
       )
       OR NOT has_column_privilege(
         'app_pending_user', 'public.dioceses', 'id', 'SELECT'
       )
       OR NOT has_column_privilege(
         'app_pending_user', 'public.dioceses', 'name', 'SELECT'
       )
       OR NOT has_column_privilege(
         'app_pending_user', 'public.dioceses', 'district_id', 'SELECT'
       )
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname IN ('districts', 'dioceses')
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND has_column_privilege(
             'app_pending_user', a.attrelid, a.attnum, 'SELECT'
           )
           AND NOT (
             (c.relname = 'districts' AND a.attname IN ('id', 'name'))
             OR (
               c.relname = 'dioceses'
               AND a.attname IN ('id', 'name', 'district_id')
             )
           )
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.districts', 'INSERT'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.districts', 'UPDATE'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.districts', 'REFERENCES'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.dioceses', 'INSERT'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.dioceses', 'UPDATE'
       )
       OR has_any_column_privilege(
         'app_pending_user', 'public.dioceses', 'REFERENCES'
       )
    THEN
      RAISE EXCEPTION 'P0 rerun preflight: pending OAuth referencia-grant drift.';
    END IF;

    IF NOT has_table_privilege('app_staff_user', 'public.profiles', 'SELECT')
       OR NOT has_table_privilege('app_pending_user', 'public.profiles', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT')
       OR has_table_privilege('member_portal_user', 'public.profiles', 'SELECT')
       OR has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.profiles', 'congregation_id', 'UPDATE')
       OR has_column_privilege('app_staff_user', 'public.profiles', 'role', 'UPDATE')
       OR has_column_privilege('app_staff_user', 'public.profiles', 'status', 'UPDATE')
       OR has_column_privilege('app_staff_user', 'public.profiles', 'congregation_id', 'UPDATE')
       OR has_column_privilege('app_pending_user', 'public.profiles', 'role', 'UPDATE')
       OR has_column_privilege('app_pending_user', 'public.profiles', 'status', 'UPDATE')
    THEN
      RAISE EXCEPTION 'P0 rerun preflight: profiles grant drift.';
    END IF;
  END IF;
END
$role_preflight$;

-- --------------------------------------------------------------------------
-- 3. Izolált JWT/Postgres role-ok
-- --------------------------------------------------------------------------

DO $create_roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_staff_user'
  ) THEN
    CREATE ROLE app_staff_user
      NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
    CREATE ROLE app_pending_user
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
    CREATE ROLE member_portal_user
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;
END
$create_roles$;

-- A staff megkapja a legacy authenticated táblajogokat/policy-ket. A pending és
-- member role szándékosan NEM örököl authenticated jogot.
GRANT authenticated TO app_staff_user;

-- A PostgREST authenticator csak akkor tud JWT role-ra SET ROLE-t végezni, ha a
-- custom szerepek tagja.
GRANT app_staff_user, app_pending_user, member_portal_user TO authenticator;

-- --------------------------------------------------------------------------
-- 4. Public schema CREATE lezárása
-- --------------------------------------------------------------------------

REVOKE CREATE ON SCHEMA public
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

GRANT USAGE ON SCHEMA public
  TO anon, authenticated, service_role,
     app_staff_user, app_pending_user, member_portal_user;

-- A már aktív legacy hookot a P0 nem szakíthatja meg: az Auth szervernek a
-- kizárólagos function EXECUTE mellett schema USAGE is szükséges.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE CREATE ON SCHEMA public FROM supabase_auth_admin;

-- --------------------------------------------------------------------------
-- 5. Public function EXECUTE deny-by-default + exact allowlist
-- --------------------------------------------------------------------------

-- A postgres-owned alkalmazásrutinokat lezárjuk. A preflight által exact módon
-- igazolt 35 pg_trgm/unaccent, supabase_admin-owned C rutin nem SECURITY DEFINER,
-- és tulajdonosi ACL nélkül SQL Editorból nem módosítható; ez a szűk kivétel.
DO $revoke_application_routines$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS routine_signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ORDER BY p.oid::regprocedure::text
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, '
      'app_staff_user, app_pending_user, member_portal_user',
      r.routine_signature
    );
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      r.routine_signature
    );
  END LOOP;
END
$revoke_application_routines$;

-- A policy-expression fuggvenyeket az authenticated role kapja vissza. Az
-- app_staff_user ezt az exact foundation membershipen keresztul orokli; a
-- pending es member role szandekosan nem tagja az authenticated szerepnek.
DO $grant_policy_helpers$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pg_catalog.to_regprocedure(h.function_signature) AS routine_signature
    FROM pg_temp.p0_authenticated_policy_helpers h
    ORDER BY h.function_signature
  LOOP
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated',
      r.routine_signature
    );
  END LOOP;
END
$grant_policy_helpers$;

-- A Custom Access Token Hookot kizárólag a Supabase Auth szerver hívhatja.
-- A service_role sem kap EXECUTE jogot, akkor sem, ha az alkalmazásrutinok
-- explicit backend-grantja egyébként megadná.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

-- Jövőbeli, postgres által létrehozott public függvény se legyen automatikusan
-- klienshívható. Új frontend RPC-hez külön review + signature GRANT kell.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

-- A live default ACL jelenleg minden új postgres-owned public táblára arwd jogot
-- ad authenticatednek. Ezt és a sequence auto-grantot is fail-closed lezárjuk.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

-- Pontos anon allowlist — sem név-, sem overload-wildcard nincs.
GRANT EXECUTE ON FUNCTION
  public.check_access_request_rate_limit(text),
  public.congregations_for_registration()
TO anon;

-- A függő staff az OAuth kiegészítő űrlapon ezt az egy reference RPC-t használja.
GRANT EXECUTE ON FUNCTION public.congregations_for_registration()
  TO app_pending_user;

-- A live-ban pontosan egy signature-re igazolt frontend-nevek dinamikus GRANT-ja.
-- A regprocedure szöveget a katalógus állítja elő, ezért nincs user-input DDL-ben.
DO $grant_staff_rpcs$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS routine_signature
    FROM pg_temp.p0_staff_rpc_allowlist a
    JOIN pg_catalog.pg_proc p ON p.proname = a.function_name
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
    ORDER BY a.function_name
  LOOP
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO app_staff_user',
      r.routine_signature
    );
  END LOOP;
END
$grant_staff_rpcs$;

-- --------------------------------------------------------------------------
-- 6. Authoritative admin- és aktív staff helper — legacy role nélkül
-- --------------------------------------------------------------------------

-- A profile_roles saját RLS-policyjéből nem kérdezhetjük közvetlenül ugyanazt
-- a táblát (rekurzió). Ezért az exact system-admin ellenőrzés a nem exponált
-- member_private sémában, postgres ownerrel és üres search_path-tal fut.
DO $exact_system_admin_helper_drift_guard$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure(
    'member_private.current_staff_is_exact_system_admin()'
  );
  v_expected text := $body$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.scope_id IS NULL
    );
  $body$;
BEGIN
  IF v_oid IS NOT NULL AND (
    pg_catalog.obj_description(v_oid, 'pg_proc')
      IS DISTINCT FROM 'KARTOTEKA_P0_EXACT_SYSTEM_ADMIN_V1'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE p.oid = v_oid
        AND n.nspname = 'member_private'
        AND p.prosecdef
        AND p.provolatile = 's'
        AND p.prosrc = v_expected
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(
            COALESCE(p.proconfig, ARRAY[]::text[])
          ) cfg
          WHERE cfg IN ('search_path=', 'search_path=""')
        )
    )
  ) THEN
    RAISE EXCEPTION
      'P0 admin helper drift: ismeretlen exact-system-admin helper mar letezik.';
  END IF;
END
$exact_system_admin_helper_drift_guard$;

CREATE OR REPLACE FUNCTION member_private.current_staff_is_exact_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.scope_id IS NULL
    );
$body$;

COMMENT ON FUNCTION member_private.current_staff_is_exact_system_admin() IS
  'KARTOTEKA_P0_EXACT_SYSTEM_ADMIN_V1';

REVOKE ALL ON FUNCTION member_private.current_staff_is_exact_system_admin()
  FROM PUBLIC, anon, authenticated, app_pending_user, member_portal_user;
GRANT EXECUTE ON FUNCTION member_private.current_staff_is_exact_system_admin()
  TO app_staff_user, service_role;

-- A legacy public helpernevek sok policyban/RPC-ben szerepelnek. A signature-t
-- megtartjuk, de mindhárom kizárólag az authoritative exact system-admin
-- assignmentet fogadja el. Ezzel a stale profiles.role és a district-admin
-- ön-eszkaláció nem nyithat globális vagy destruktív hozzáférést.
DO $legacy_admin_helper_drift_guard$
DECLARE
  v_mode text := (SELECT mode FROM pg_temp.p0_install_mode);
  v_name text;
  v_oid oid;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.current_user_has_global_access()',
    'public.is_admin()',
    'public.is_caller_admin_for_user_mgmt()',
    'public.admin_sync_legacy_role(uuid,text)'
  ]::text[]
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_name);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'P0 admin helper drift: hianyzik a bizonyitott signature: %', v_name;
    END IF;

    IF v_mode = 'verified_rerun'
       AND pg_catalog.obj_description(v_oid, 'pg_proc')
         IS DISTINCT FROM 'KARTOTEKA_P0_AUTHORITATIVE_ADMIN_V1' THEN
      RAISE EXCEPTION 'P0 admin helper drift: rerunkor target marker nelkuli rutin: %', v_name;
    END IF;
  END LOOP;
END
$legacy_admin_helper_drift_guard$;

CREATE OR REPLACE FUNCTION public.current_user_has_global_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT member_private.current_staff_is_exact_system_admin();
$body$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT member_private.current_staff_is_exact_system_admin();
$body$;

CREATE OR REPLACE FUNCTION public.is_caller_admin_for_user_mgmt()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT member_private.current_staff_is_exact_system_admin();
$body$;

CREATE OR REPLACE FUNCTION public.admin_sync_legacy_role(
  p_user_id uuid,
  p_new_role text
)
RETURNS TABLE(
  user_id uuid,
  previous_role text,
  new_role text,
  was_updated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_prev_role text;
BEGIN
  IF NOT member_private.current_staff_is_exact_system_admin() THEN
    RAISE EXCEPTION
      'A legacy szerepkor tukrozesehez teljes rendszeradmin jogosultsag kell.'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_new_role IS NULL OR p_new_role NOT IN (
    'admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin',
    'egyhazmegyei_szamvevo', 'lelkesz', 'konyvelo'
  ) THEN
    RAISE EXCEPTION 'Ervenytelen felhasznalo vagy szerepkor.'
      USING ERRCODE = '22023';
  END IF;

  -- A legacy role csak mar letezo, aktiv es approved authoritative assignment
  -- tukre lehet. Caller-supplied p_new_role onmagaban soha nem eleg.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    WHERE p.id = p_user_id
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.role = p_new_role
      AND (
        (p_new_role = 'admin' AND pr.scope = 'system' AND pr.scope_id IS NULL)
        OR (
          p_new_role = 'egyhazkeruleti_admin'
          AND pr.scope = 'district'
          AND pr.scope_id IS NOT NULL
        )
        OR (
          p_new_role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
          AND pr.scope = 'diocese'
          AND pr.scope_id IS NOT NULL
        )
        OR (
          p_new_role IN ('lelkesz', 'konyvelo')
          AND pr.scope = 'congregation'
          AND pr.scope_id IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION
      'A kert legacy szerepkorhoz nincs megfelelo aktiv, jovahagyott assignment.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.role
    INTO v_prev_role
    FROM public.profiles p
   WHERE p.id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A celprofil nem talalhato.' USING ERRCODE = 'P0002';
  END IF;

  IF v_prev_role IS NOT DISTINCT FROM p_new_role THEN
    RETURN QUERY SELECT p_user_id, v_prev_role, p_new_role, false;
    RETURN;
  END IF;

  UPDATE public.profiles p
     SET role = p_new_role
   WHERE p.id = p_user_id;

  RETURN QUERY SELECT p_user_id, v_prev_role, p_new_role, true;
END;
$body$;

COMMENT ON FUNCTION public.current_user_has_global_access() IS
  'KARTOTEKA_P0_AUTHORITATIVE_ADMIN_V1';
COMMENT ON FUNCTION public.is_admin() IS
  'KARTOTEKA_P0_AUTHORITATIVE_ADMIN_V1';
COMMENT ON FUNCTION public.is_caller_admin_for_user_mgmt() IS
  'KARTOTEKA_P0_AUTHORITATIVE_ADMIN_V1';
COMMENT ON FUNCTION public.admin_sync_legacy_role(uuid, text) IS
  'KARTOTEKA_P0_AUTHORITATIVE_ADMIN_V1';

-- A policy helpernevek a legacy authenticated policy-evaluationhoz maradnak
-- elerhetok. A user-management helper csak belso SECURITY DEFINER hivasra es
-- service-re kell; a sync RPC az exact app_staff allowlist resze.
REVOKE ALL ON FUNCTION public.is_caller_admin_for_user_mgmt()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user,
       member_portal_user;
REVOKE ALL ON FUNCTION public.admin_sync_legacy_role(uuid, text)
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user,
       member_portal_user;
GRANT EXECUTE ON FUNCTION public.is_caller_admin_for_user_mgmt()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sync_legacy_role(uuid, text)
  TO app_staff_user, service_role;

DO $authoritative_admin_postflight$
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'current_user_has_global_access',
        'is_admin',
        'is_caller_admin_for_user_mgmt',
        'admin_sync_legacy_role'
      )
      AND p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND pg_catalog.obj_description(p.oid, 'pg_proc')
        = 'KARTOTEKA_P0_AUTHORITATIVE_ADMIN_V1'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg IN ('search_path=', 'search_path=""')
      )
      AND p.prosrc LIKE
        '%member_private.current_staff_is_exact_system_admin%'
  ) <> 4 THEN
    RAISE EXCEPTION
      'P0 admin postflight: legalabb egy authoritative public helper/RPC driftelt.';
  END IF;

  IF has_function_privilege(
       'app_staff_user',
       'public.is_caller_admin_for_user_mgmt()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'app_staff_user',
       'public.wipe_finance_data(uuid,text)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'P0 admin postflight: belso vagy meg nem hardenelt RPC kliensjoga nyitva maradt.';
  END IF;
END
$authoritative_admin_postflight$;

-- Az általános aktív-staff kapu minden elfogadott staff-scope-ot kezel, de
-- önmagában sem globális, sem system-admin jogosultságot nem ad.

DO $helper_drift_guard$
DECLARE
  v_oid oid := to_regprocedure('public.current_user_is_active_staff()');
  v_mode text := (SELECT mode FROM pg_temp.p0_install_mode);
  v_src text;
  v_expected text := $body$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.profile_roles pr
            WHERE pr.profile_id = p.id
              AND pr.active = true
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
    );
  $body$;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'P0 helper drift: a live inventoryban bizonyított public.current_user_is_active_staff() hiányzik.';
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;

  IF v_mode = 'first_install' THEN
    -- Pontosan az inventoryban bizonyított legacy helper fogadható el cserére.
    IF pg_catalog.regexp_replace(
         pg_catalog.btrim(v_src),
         '[[:space:]]+',
         ' ',
         'g'
       ) IS DISTINCT FROM
       'SELECT EXISTS ( SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = ''active'' );'
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE p.oid = v_oid
           AND n.nspname = 'public'
           AND p.prosecdef
           AND p.provolatile = 's'
           AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
           AND EXISTS (
             SELECT 1
             FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg = 'search_path=public'
           )
       )
    THEN
      RAISE EXCEPTION
        'P0 helper drift: first cutoverkor nem az inventoryban bizonyított legacy helper található.';
    END IF;
  ELSIF v_src IS DISTINCT FROM v_expected
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE p.oid = v_oid
         AND n.nspname = 'public'
         AND p.prosecdef
         AND p.provolatile = 's'
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND EXISTS (
           SELECT 1
           FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
           WHERE cfg IN ('search_path=', 'search_path=""')
         )
     )
  THEN
    RAISE EXCEPTION
      'P0 helper drift: verified rerunkor nem az exact target helper található.';
  END IF;
END
$helper_drift_guard$;

CREATE OR REPLACE FUNCTION public.current_user_is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.profile_roles pr
            WHERE pr.profile_id = p.id
              AND pr.active = true
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
    );
$body$;

COMMENT ON FUNCTION public.current_user_is_active_staff() IS
  'KARTOTEKA_P0_AUTH_ISOLATION_V1';

REVOKE ALL ON FUNCTION public.current_user_is_active_staff()
  FROM PUBLIC, anon, app_pending_user, member_portal_user;
GRANT EXECUTE ON FUNCTION public.current_user_is_active_staff()
  TO authenticated, app_staff_user, service_role;

-- --------------------------------------------------------------------------
-- 7. Globális RESTRICTIVE gate a már kiadott legacy authenticated tokenekre
-- --------------------------------------------------------------------------

-- Minden jelenlegi public RLS base/partitioned táblán ugyanaz a restriktív kapu
-- fut. Egy PERMISSIVE legacy policy ezért önmagában többé nem elég:
--   * aktív, nem törölt/nem anonimizált, jóváhagyott staff átmegy;
--   * pending/inactive/anonimizált régi authenticated token fail-closed;
--   * anon és a külön, authenticatedet nem öröklő member role nem célja ennek a
--     policy-nek; azok csak saját explicit grant+policy felületen működhetnek.
DO $install_legacy_gate$
DECLARE
  r record;
  v_policy record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    SELECT permissive, roles, cmd, qual, with_check
      INTO v_policy
    FROM pg_catalog.pg_policies
    WHERE schemaname = r.nspname
      AND tablename = r.relname
      AND policyname = 'p0_legacy_authenticated_staff_gate';

    IF NOT FOUND THEN
      EXECUTE pg_catalog.format(
        'CREATE POLICY p0_legacy_authenticated_staff_gate ON %I.%I '
        'AS RESTRICTIVE FOR ALL TO authenticated '
        'USING ((SELECT public.current_user_is_active_staff())) '
        'WITH CHECK ((SELECT public.current_user_is_active_staff()))',
        r.nspname,
        r.relname
      );
    ELSIF v_policy.permissive <> 'RESTRICTIVE'
       OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
       OR v_policy.cmd <> 'ALL'
       OR COALESCE(v_policy.qual, '') NOT LIKE '%current_user_is_active_staff%'
       OR COALESCE(v_policy.with_check, '') NOT LIKE '%current_user_is_active_staff%'
    THEN
      RAISE EXCEPTION
        'P0 legacy gate drift a %.% táblán; policy-t nem írjuk felül.',
        r.nspname,
        r.relname;
    END IF;
  END LOOP;
END
$install_legacy_gate$;

-- --------------------------------------------------------------------------
-- 7/a. profile_roles write: exact system-admin, legacy role fallback nelkul
-- --------------------------------------------------------------------------

-- A live profile_roles_admin_manage policy az aktiv legacy profiles.role
-- admin/district-admin erteket minden sorra elegnek tekintette. Ez lehetove
-- tette volna, hogy egy district admin kozvetlen PostgREST DML-lel sajat maganak
-- system/admin assignmentet hozzon letre. Az uj policy rekurzio-mentes private
-- helperen keresztul csak MAR LETEZO exact system-adminnak enged teljes DML-t.
DO $profile_roles_admin_policy_drift_guard$
DECLARE
  v_names text[];
BEGIN
  SELECT pg_catalog.array_agg(policyname ORDER BY policyname)
    INTO v_names
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profile_roles';

  IF v_names = ARRAY[
    'p0_legacy_authenticated_staff_gate',
    'profile_roles_admin_manage',
    'profile_roles_diocese_read',
    'profile_roles_pastor_approve',
    'profile_roles_pastor_congregation_read',
    'profile_roles_self_read'
  ]::text[] THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profile_roles'
        AND policyname = 'profile_roles_admin_manage'
        AND permissive = 'PERMISSIVE'
        AND roles = ARRAY['authenticated']::name[]
        AND cmd = 'ALL'
        AND qual = with_check
        AND COALESCE(qual, '') LIKE '%profiles%'
        AND COALESCE(qual, '') LIKE '%auth.uid%'
        AND COALESCE(qual, '') LIKE '%status%active%'
        AND COALESCE(qual, '') LIKE '%egyhazkeruleti_admin%'
        AND COALESCE(qual, '') NOT LIKE '%profile_roles%'
    ) THEN
      RAISE EXCEPTION
        'P0 profile_roles: a bizonyitott legacy admin policy definicioja driftelt.';
    END IF;
  ELSIF v_names = ARRAY[
    'p0_legacy_authenticated_staff_gate',
    'p0_profile_roles_system_admin_manage',
    'profile_roles_diocese_read',
    'profile_roles_pastor_approve',
    'profile_roles_pastor_congregation_read',
    'profile_roles_self_read'
  ]::text[] THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profile_roles'
        AND policyname = 'p0_profile_roles_system_admin_manage'
        AND permissive = 'PERMISSIVE'
        AND roles = ARRAY['app_staff_user']::name[]
        AND cmd = 'ALL'
        AND COALESCE(qual, '') LIKE
          '%member_private.current_staff_is_exact_system_admin%'
        AND COALESCE(with_check, '') LIKE
          '%member_private.current_staff_is_exact_system_admin%'
    ) THEN
      RAISE EXCEPTION
        'P0 profile_roles: az exact system-admin target policy driftelt.';
    END IF;
  ELSE
    RAISE EXCEPTION
      'P0 profile_roles: ismeretlen policy-lista: %', v_names;
  END IF;
END
$profile_roles_admin_policy_drift_guard$;

DROP POLICY IF EXISTS profile_roles_admin_manage
  ON public.profile_roles;
DROP POLICY IF EXISTS p0_profile_roles_system_admin_manage
  ON public.profile_roles;

CREATE POLICY p0_profile_roles_system_admin_manage
  ON public.profile_roles
  FOR ALL
  TO app_staff_user
  USING (
    (SELECT member_private.current_staff_is_exact_system_admin())
  )
  WITH CHECK (
    (SELECT member_private.current_staff_is_exact_system_admin())
  );

DO $profile_roles_admin_policy_postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_roles'
      AND policyname = 'profile_roles_admin_manage'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_roles'
      AND policyname = 'p0_profile_roles_system_admin_manage'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['app_staff_user']::name[]
      AND cmd = 'ALL'
      AND COALESCE(qual, '') LIKE
        '%member_private.current_staff_is_exact_system_admin%'
      AND COALESCE(with_check, '') LIKE
        '%member_private.current_staff_is_exact_system_admin%'
  ) THEN
    RAISE EXCEPTION
      'P0 profile_roles postflight: a system-admin write policy nem exact.';
  END IF;
END
$profile_roles_admin_policy_postflight$;

-- A storage.objects nem a public sémában van, ezért külön ugyanilyen kaput
-- kap. Ez a maintenance alatt még élő, régi `authenticated` pending/inactive
-- JWT-ket a Storage write policy-kból is kizárja. Az anon publikus olvasást és
-- a service_role BYPASSRLS szerverfolyamatot nem érinti.
DROP POLICY IF EXISTS p0_storage_legacy_authenticated_staff_gate
  ON storage.objects;

CREATE POLICY p0_storage_legacy_authenticated_staff_gate
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING ((SELECT public.current_user_is_active_staff()))
  WITH CHECK ((SELECT public.current_user_is_active_staff()));

-- --------------------------------------------------------------------------
-- 7/b. Hozzáférési kérelmek: csak exact rendszeradmin olvasás/módosítás
-- --------------------------------------------------------------------------

-- A live policy a legacy profiles.role='admin' mezőt nézte. A globális staff
-- gate önmagában ehhez nem elég: egy stale admin mező + bármely szűkebb aktív
-- assignment túl széles hozzáférést adna. Az átírás előtt a bizonyított live
-- vagy a saját exact célállapotunkon kívül minden policy-drift fail-closed.
DO $access_requests_policy_drift_guard$
DECLARE
  v_names text[];
BEGIN
  SELECT pg_catalog.array_agg(policyname ORDER BY policyname)
    INTO v_names
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'access_requests';

  IF v_names = ARRAY[
    'access_requests_insert',
    'access_requests_select_admin',
    'access_requests_update_admin',
    'p0_legacy_authenticated_staff_gate'
  ]::text[] THEN
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'access_requests'
        AND (
          (
            policyname = 'access_requests_insert'
            AND roles = ARRAY['anon', 'authenticated']::name[]
            AND cmd = 'INSERT'
            AND qual IS NULL
            AND with_check = 'true'
          )
          OR (
            policyname = 'access_requests_select_admin'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'SELECT'
            AND COALESCE(qual, '') LIKE '%profiles%'
            AND COALESCE(qual, '') LIKE '%role%admin%'
            AND with_check IS NULL
          )
          OR (
            policyname = 'access_requests_update_admin'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'UPDATE'
            AND COALESCE(qual, '') LIKE '%profiles%'
            AND COALESCE(qual, '') LIKE '%role%admin%'
            AND COALESCE(with_check, '') LIKE '%profiles%'
            AND COALESCE(with_check, '') LIKE '%role%admin%'
          )
          OR (
            policyname = 'p0_legacy_authenticated_staff_gate'
            AND permissive = 'RESTRICTIVE'
            AND roles = ARRAY['authenticated']::name[]
            AND cmd = 'ALL'
            AND COALESCE(qual, '') LIKE '%current_user_is_active_staff%'
            AND COALESCE(with_check, '') LIKE '%current_user_is_active_staff%'
          )
        )
    ) <> 4 THEN
      RAISE EXCEPTION 'P0 access_requests: a bizonyított live policy-definíció driftelt.';
    END IF;
  ELSIF v_names = ARRAY[
    'p0_access_requests_system_admin_select',
    'p0_access_requests_system_admin_update',
    'p0_legacy_authenticated_staff_gate'
  ]::text[] THEN
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'access_requests'
        AND policyname IN (
          'p0_access_requests_system_admin_select',
          'p0_access_requests_system_admin_update'
        )
        AND roles = ARRAY['authenticated']::name[]
        AND COALESCE(qual, '') LIKE '%profile_roles%'
        AND COALESCE(qual, '') LIKE '%approval_status%approved%'
        AND COALESCE(qual, '') LIKE '%scope%system%'
        AND COALESCE(qual, '') LIKE '%scope_id%IS NULL%'
        AND COALESCE(qual, '') LIKE '%role%admin%'
        AND (
          (cmd = 'SELECT' AND with_check IS NULL)
          OR (
            cmd = 'UPDATE'
            AND COALESCE(with_check, '') LIKE '%profile_roles%'
            AND COALESCE(with_check, '') LIKE '%scope%system%'
          )
        )
    ) <> 2 THEN
      RAISE EXCEPTION 'P0 access_requests: az exact rendszeradmin célpolicy driftelt.';
    END IF;
  ELSE
    RAISE EXCEPTION 'P0 access_requests: ismeretlen policy-lista: %', v_names;
  END IF;
END
$access_requests_policy_drift_guard$;

DROP POLICY IF EXISTS access_requests_select_admin
  ON public.access_requests;
DROP POLICY IF EXISTS access_requests_update_admin
  ON public.access_requests;
DROP POLICY IF EXISTS access_requests_insert
  ON public.access_requests;
DROP POLICY IF EXISTS p0_access_requests_system_admin_select
  ON public.access_requests;
DROP POLICY IF EXISTS p0_access_requests_system_admin_update
  ON public.access_requests;

-- Az új kérelem beküldése kizárólag a validáló, rate-limitet alkalmazó
-- szerver action service-role kliensén keresztül történhet. Közvetlen PostgREST
-- INSERT sem táblaszinten, sem esetleges oszlopszintű legacy granttal nem maradhat.
REVOKE INSERT ON TABLE public.access_requests
  FROM PUBLIC, anon, authenticated, app_staff_user,
       app_pending_user, member_portal_user;

DO $revoke_access_request_column_insert$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.attname
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.access_requests'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE INSERT (%I) ON TABLE public.access_requests FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user',
      r.attname
    );
  END LOOP;
END
$revoke_access_request_column_insert$;

GRANT INSERT ON TABLE public.access_requests TO service_role;

CREATE POLICY p0_access_requests_system_admin_select
  ON public.access_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.scope_id IS NULL
    )
  );

CREATE POLICY p0_access_requests_system_admin_update
  ON public.access_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.scope_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.scope_id IS NULL
    )
  );

-- --------------------------------------------------------------------------
-- 8. Pending OAuth referenciaadatok: csak a kliens által használt oszlopok
-- --------------------------------------------------------------------------

GRANT SELECT (id, name)
  ON TABLE public.districts
  TO app_pending_user;

GRANT SELECT (id, name, district_id)
  ON TABLE public.dioceses
  TO app_pending_user;

DROP POLICY IF EXISTS p0_districts_pending_reference_select
  ON public.districts;
DROP POLICY IF EXISTS p0_dioceses_pending_reference_select
  ON public.dioceses;

CREATE POLICY p0_districts_pending_reference_select
  ON public.districts
  FOR SELECT
  TO app_pending_user
  USING (true);

CREATE POLICY p0_dioceses_pending_reference_select
  ON public.dioceses
  FOR SELECT
  TO app_pending_user
  USING (true);

-- --------------------------------------------------------------------------
-- 9. profiles: self-escalation megszüntetése
-- --------------------------------------------------------------------------

-- A table-level jogok mellett az esetleges explicit column ACL-eket is levesszük.
REVOKE ALL PRIVILEGES ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated,
       app_staff_user, app_pending_user, member_portal_user;

DO $revoke_profile_column_acl$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.attname
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.profiles'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) '
      'ON TABLE public.profiles FROM PUBLIC, anon, authenticated, '
      'app_staff_user, app_pending_user, member_portal_user',
      r.attname
    );
  END LOOP;
END
$revoke_profile_column_acl$;

-- Olvasás RLS-sel; írás kizárólag explicit safe self mezőkre.
GRANT SELECT ON TABLE public.profiles
  TO authenticated, app_staff_user, app_pending_user;
GRANT UPDATE (full_name, phone, birth_date, walkthrough_completed, walkthrough_skipped_at)
  ON TABLE public.profiles TO authenticated, app_staff_user;
GRANT UPDATE (full_name, phone, birth_date)
  ON TABLE public.profiles TO app_pending_user;

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_read ON public.profiles;
DROP POLICY IF EXISTS profiles_write ON public.profiles;
DROP POLICY IF EXISTS p0_profiles_staff_select ON public.profiles;
DROP POLICY IF EXISTS p0_profiles_staff_update_safe_self ON public.profiles;
DROP POLICY IF EXISTS p0_profiles_pending_select_self ON public.profiles;
DROP POLICY IF EXISTS p0_profiles_pending_update_safe_self ON public.profiles;

CREATE POLICY p0_profiles_staff_select
  ON public.profiles
  FOR SELECT
  TO authenticated, app_staff_user
  USING ((SELECT public.current_user_is_active_staff()));

CREATE POLICY p0_profiles_staff_update_safe_self
  ON public.profiles
  FOR UPDATE
  TO authenticated, app_staff_user
  USING (
    id = (SELECT auth.uid())
    AND status = 'active'
    AND deleted_at IS NULL
    AND (SELECT public.current_user_is_active_staff())
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    AND status = 'active'
    AND deleted_at IS NULL
    AND (SELECT public.current_user_is_active_staff())
  );

CREATE POLICY p0_profiles_pending_select_self
  ON public.profiles
  FOR SELECT
  TO app_pending_user
  USING (
    id = (SELECT auth.uid())
    AND status = 'pending'
    AND deleted_at IS NULL
  );

CREATE POLICY p0_profiles_pending_update_safe_self
  ON public.profiles
  FOR UPDATE
  TO app_pending_user
  USING (
    id = (SELECT auth.uid())
    AND status = 'pending'
    AND deleted_at IS NULL
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    AND status = 'pending'
    AND deleted_at IS NULL
  );

-- Nincs kliens INSERT/DELETE policy és nincs role/status/scope/email UPDATE grant.
-- Az aktiválás/elutasítás kizárólag külön, auditált admin RPC útvonalon történhet.

-- --------------------------------------------------------------------------
-- 10. avatars Storage: staff + approved scope + exact tenant/person útvonal
-- --------------------------------------------------------------------------

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
WHERE id = 'avatars'
  AND name = 'avatars'
  AND public = true;

DROP POLICY IF EXISTS avatars_auth_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_update ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_delete ON storage.objects;
DROP POLICY IF EXISTS p0_avatars_staff_insert ON storage.objects;
DROP POLICY IF EXISTS p0_avatars_staff_update ON storage.objects;
DROP POLICY IF EXISTS p0_avatars_staff_delete ON storage.objects;

-- A bucket publikus jellege miatt az olvasás nyilvános marad. A write policy nem
-- az objektum korábbi ownerét és nem a profiles elsődleges congregation_id-ját
-- használja: co-pastor/profilváltás esetén az active+approved congregation-scope
-- profile_roles assignment a forrás. Az exact név-egyezést valós szemely sorból
-- építjük fel, ezért hibás UUID/int user-inputot nem kell castolni.
CREATE POLICY p0_avatars_staff_insert
  ON storage.objects
  FOR INSERT
  TO app_staff_user
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT public.current_user_is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      JOIN public.szemely s ON s.congregation_id = pr.scope_id
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id IS NOT NULL
        AND name IN (
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpeg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.png',
          pr.scope_id::text || '/szemely-' || s.id::text || '.webp'
        )
    )
  );

CREATE POLICY p0_avatars_staff_update
  ON storage.objects
  FOR UPDATE
  TO app_staff_user
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.current_user_is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      JOIN public.szemely s ON s.congregation_id = pr.scope_id
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id IS NOT NULL
        AND name IN (
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpeg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.png',
          pr.scope_id::text || '/szemely-' || s.id::text || '.webp'
        )
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT public.current_user_is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      JOIN public.szemely s ON s.congregation_id = pr.scope_id
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id IS NOT NULL
        AND name IN (
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpeg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.png',
          pr.scope_id::text || '/szemely-' || s.id::text || '.webp'
        )
    )
  );

CREATE POLICY p0_avatars_staff_delete
  ON storage.objects
  FOR DELETE
  TO app_staff_user
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.current_user_is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      JOIN public.szemely s ON s.congregation_id = pr.scope_id
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id IS NOT NULL
        AND name IN (
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.jpeg',
          pr.scope_id::text || '/szemely-' || s.id::text || '.png',
          pr.scope_id::text || '/szemely-' || s.id::text || '.webp'
        )
    )
  );

-- --------------------------------------------------------------------------
-- 11. access-request-docs Storage: csak szerveroldali write + rendszeradmin read
-- --------------------------------------------------------------------------

-- A publikus jelentkezési Server Action service-role klienssel, szerveroldali
-- MIME/signature ellenőrzés után tölt fel. Emiatt sem anon, sem bármely JWT-s
-- kliens nem kap közvetlen INSERT/UPDATE/DELETE policy-t.
DROP POLICY IF EXISTS access_request_docs_anon_insert ON storage.objects;
DROP POLICY IF EXISTS access_request_docs_admin_read ON storage.objects;
DROP POLICY IF EXISTS p0_access_request_docs_admin_read ON storage.objects;
DROP POLICY IF EXISTS p0_access_request_docs_no_client_insert ON storage.objects;
DROP POLICY IF EXISTS p0_access_request_docs_no_client_update ON storage.objects;
DROP POLICY IF EXISTS p0_access_request_docs_no_client_delete ON storage.objects;

CREATE POLICY p0_access_request_docs_admin_read
  ON storage.objects
  FOR SELECT
  TO app_staff_user
  USING (
    bucket_id = 'access-request-docs'
    AND (SELECT public.current_user_is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.scope_id IS NULL
    )
  );

-- Defense-in-depth: egy későbbi, túl széles permissive Storage policy sem
-- teheti újranyithatóvá a privát bucket kliensoldali write felületét.
-- A service_role BYPASSRLS jogosultsággal továbbra is kezeli a dokumentumokat.
CREATE POLICY p0_access_request_docs_no_client_insert
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (bucket_id <> 'access-request-docs');

CREATE POLICY p0_access_request_docs_no_client_update
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (bucket_id <> 'access-request-docs')
  WITH CHECK (bucket_id <> 'access-request-docs');

CREATE POLICY p0_access_request_docs_no_client_delete
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (bucket_id <> 'access-request-docs');

-- --------------------------------------------------------------------------
-- 12. COMMIT előtti postflight assert — hiba esetén teljes rollback
-- --------------------------------------------------------------------------

DO $postflight_assert$
DECLARE
  v_bad text[];
  v_anon_functions text[];
  v_profile_policies text[];
  v_avatar_policies text[];
  v_access_doc_policies text[];
  v_extension_function_count integer;
BEGIN
  IF has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE')
     OR has_schema_privilege('service_role', 'public', 'CREATE')
     OR has_schema_privilege('supabase_auth_admin', 'public', 'CREATE')
     OR has_schema_privilege('app_staff_user', 'public', 'CREATE')
     OR has_schema_privilege('app_pending_user', 'public', 'CREATE')
     OR has_schema_privilege('member_portal_user', 'public', 'CREATE')
  THEN
    RAISE EXCEPTION 'P0 postflight: kliensrole továbbra is CREATE joggal bír public sémán.';
  END IF;

  IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'P0 postflight: a Supabase Auth hook schema USAGE joga hiányzik.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
      AND n.nspname = 'public'
      AND d.defaclobjtype IN ('f', 'r', 'S')
      AND (
        acl.grantee = 0
        OR grantee.rolname IN (
          'anon', 'authenticated', 'service_role', 'app_staff_user',
          'app_pending_user', 'member_portal_user'
        )
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: postgres public default ACL kliensjog maradt.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            p.proacl,
            pg_catalog.acldefault('f', p.proowner)
          )
        ) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: maradt PUBLIC EXECUTE public rutinon.';
  END IF;

  SELECT count(*)::integer
    INTO v_extension_function_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'supabase_admin'
    AND NOT p.prosecdef
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = p.oid
        AND d.refclassid = 'pg_catalog.pg_extension'::regclass
        AND d.deptype = 'e'
        AND e.extname IN ('pg_trgm', 'unaccent')
    );

  IF v_extension_function_count <> 35 OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
      AND NOT (
        pg_catalog.pg_get_userbyid(p.proowner) = 'supabase_admin'
        AND NOT p.prosecdef
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_depend d
          JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
          WHERE d.classid = 'pg_catalog.pg_proc'::regclass
            AND d.objid = p.oid
            AND d.refclassid = 'pg_catalog.pg_extension'::regclass
            AND d.deptype = 'e'
            AND e.extname IN ('pg_trgm', 'unaccent')
        )
      )
  ) THEN
    RAISE EXCEPTION
      'P0 postflight: supabase-owned extension routine exception drift (count=%).',
      v_extension_function_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname <> 'current_user_is_active_staff'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_temp.p0_authenticated_policy_helpers h
        WHERE pg_catalog.to_regprocedure(h.function_signature) = p.oid
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: maradt nem-helper authenticated EXECUTE alkalmazásrutinon.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = 'public.current_user_is_active_staff()'::regprocedure
      AND n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg IN ('search_path=', 'search_path=""')
      )
      AND pg_catalog.obj_description(p.oid, 'pg_proc')
          = 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
      AND p.prosrc LIKE '%p.status = ''active''%'
      AND p.prosrc LIKE '%p.deleted_at IS NULL%'
      AND p.prosrc LIKE '%p.anonymized_at IS NULL%'
      AND p.prosrc LIKE '%public.profile_roles%'
      AND p.prosrc LIKE '%pr.active = true%'
      AND p.prosrc LIKE '%pr.approval_status = ''approved''%'
      AND p.prosrc LIKE '%p.role = ''admin''%'
      AND p.prosrc LIKE '%pr.role = ''admin''%'
      AND p.prosrc LIKE '%p.role = ''egyhazkeruleti_admin''%'
      AND p.prosrc LIKE '%pr.role = p.role%'
      AND p.prosrc LIKE '%''egyhazmegyei_admin'', ''esperes'', ''egyhazmegyei_szamvevo''%'
      AND p.prosrc LIKE '%''lelkesz'', ''konyvelo''%'
      AND p.prosrc LIKE '%pr.scope_id = p.district_id%'
      AND p.prosrc LIKE '%pr.scope_id = p.diocese_id%'
      AND p.prosrc LIKE '%pr.scope_id = p.congregation_id%'
      AND p.prosrc NOT LIKE '%pr.role = ''custom''%'
      AND p.prosrc NOT LIKE '%public.districts%'
      AND p.prosrc NOT LIKE '%public.dioceses%'
      AND p.prosrc NOT LIKE '%public.congregations%'
  ) THEN
    RAISE EXCEPTION 'P0 postflight: a target active-staff helper definíció/marker driftelt.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.current_user_is_active_staff()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'P0 postflight: a legacy RLS gate helper authenticated EXECUTE joga hiányzik.';
  END IF;

  IF NOT has_function_privilege(
       'supabase_auth_admin',
       'public.custom_access_token_hook(jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'app_staff_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'app_pending_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'member_portal_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       WHERE p.oid = 'public.custom_access_token_hook(jsonb)'::regprocedure
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'P0 postflight: Custom Access Token Hook exact ACL drift.';
  END IF;

  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO v_anon_functions
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_functions IS DISTINCT FROM ARRAY[
    'check_access_request_rate_limit(text)',
    'congregations_for_registration()'
  ]::text[] THEN
    RAISE EXCEPTION 'P0 postflight: anon EXECUTE allowlist eltért: %', v_anon_functions;
  END IF;

  SELECT array_agg(a.function_name ORDER BY a.function_name)
    INTO v_bad
  FROM pg_temp.p0_staff_rpc_allowlist a
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND p.proname = a.function_name
      AND has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
  );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0 postflight: app_staff allowlist GRANT hiányzik: %', v_bad;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.p0_authenticated_policy_helpers h
    WHERE NOT has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure(h.function_signature),
      'EXECUTE'
    )
  ) THEN
    RAISE EXCEPTION
      'P0 postflight: legalabb egy authenticated RLS policy-helper EXECUTE joga hianyzik.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
      AND p.proname <> 'current_user_is_active_staff'
      AND NOT EXISTS (
        SELECT 1 FROM pg_temp.p0_staff_rpc_allowlist a
        WHERE a.function_name = p.proname
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_temp.p0_authenticated_policy_helpers h
        WHERE h.function_name = p.proname
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: app_staff_user ismeretlen public rutin EXECUTE jogot kapott.';
  END IF;

  IF NOT has_function_privilege(
       'app_pending_user',
       'public.congregations_for_registration()',
       'EXECUTE'
     )
     OR (
       SELECT count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND has_function_privilege('app_pending_user', p.oid, 'EXECUTE')
     ) <> 1
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         AND has_function_privilege('member_portal_user', p.oid, 'EXECUTE')
     )
  THEN
    RAISE EXCEPTION 'P0 postflight: pending/member alkalmazásrutin ACL eltért.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = 'public'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND acl.privilege_type = 'EXECUTE'
      AND NOT COALESCE((
        grantee.rolname = 'postgres'
        OR (
          grantee.rolname = 'service_role'
          AND p.oid <> 'public.custom_access_token_hook(jsonb)'::regprocedure
        )
        OR (
          grantee.rolname = 'supabase_auth_admin'
          AND p.oid = 'public.custom_access_token_hook(jsonb)'::regprocedure
        )
        OR (
          grantee.rolname = 'anon'
          AND p.oid IN (
            'public.check_access_request_rate_limit(text)'::regprocedure,
            'public.congregations_for_registration()'::regprocedure
          )
        )
        OR (
          grantee.rolname = 'authenticated'
          AND (
            p.oid = 'public.current_user_is_active_staff()'::regprocedure
            OR EXISTS (
              SELECT 1
              FROM pg_temp.p0_authenticated_policy_helpers h
              WHERE pg_catalog.to_regprocedure(h.function_signature) = p.oid
            )
          )
        )
        OR (
          grantee.rolname = 'app_staff_user'
          AND (
            p.oid = 'public.current_user_is_active_staff()'::regprocedure
            OR EXISTS (
              SELECT 1
              FROM pg_temp.p0_staff_rpc_allowlist a
              WHERE a.function_name = p.proname
            )
          )
        )
        OR (
          grantee.rolname = 'app_pending_user'
          AND p.oid = 'public.congregations_for_registration()'::regprocedure
        )
      ), false)
  ) THEN
    RAISE EXCEPTION 'P0 postflight: váratlan direct grantee maradt postgres-owned public rutinon.';
  END IF;

  IF has_table_privilege('anon', 'public.profiles', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     OR has_table_privilege('member_portal_user', 'public.profiles', 'SELECT')
     OR has_table_privilege('app_staff_user', 'public.profiles', 'INSERT')
     OR has_table_privilege('app_staff_user', 'public.profiles', 'DELETE')
     OR has_table_privilege('app_pending_user', 'public.profiles', 'INSERT')
     OR has_table_privilege('app_pending_user', 'public.profiles', 'DELETE')
  THEN
    RAISE EXCEPTION 'P0 postflight: profiles table-level grant eltért.';
  END IF;

  IF has_column_privilege('app_staff_user', 'public.profiles', 'role', 'UPDATE')
     OR has_column_privilege('app_staff_user', 'public.profiles', 'status', 'UPDATE')
     OR has_column_privilege('app_staff_user', 'public.profiles', 'congregation_id', 'UPDATE')
     OR has_column_privilege('app_staff_user', 'public.profiles', 'diocese_id', 'UPDATE')
     OR has_column_privilege('app_staff_user', 'public.profiles', 'district_id', 'UPDATE')
     OR has_column_privilege('app_staff_user', 'public.profiles', 'email', 'UPDATE')
     OR has_column_privilege('app_pending_user', 'public.profiles', 'role', 'UPDATE')
     OR has_column_privilege('app_pending_user', 'public.profiles', 'status', 'UPDATE')
     OR has_column_privilege('app_pending_user', 'public.profiles', 'congregation_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'congregation_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'P0 postflight: profiles érzékeny oszlop UPDATE grant maradt.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND cmd = 'SELECT'
      AND roles = ARRAY['app_pending_user']::name[]
      AND COALESCE(qual, '') = 'true'
      AND with_check IS NULL
      AND (
        (tablename = 'districts'
          AND policyname = 'p0_districts_pending_reference_select')
        OR (tablename = 'dioceses'
          AND policyname = 'p0_dioceses_pending_reference_select')
      )
  ) <> 2
     OR has_table_privilege('app_pending_user', 'public.districts', 'SELECT')
     OR has_table_privilege('app_pending_user', 'public.districts', 'INSERT')
     OR has_table_privilege('app_pending_user', 'public.districts', 'UPDATE')
     OR has_table_privilege('app_pending_user', 'public.districts', 'DELETE')
     OR has_table_privilege('app_pending_user', 'public.dioceses', 'SELECT')
     OR has_table_privilege('app_pending_user', 'public.dioceses', 'INSERT')
     OR has_table_privilege('app_pending_user', 'public.dioceses', 'UPDATE')
     OR has_table_privilege('app_pending_user', 'public.dioceses', 'DELETE')
     OR has_table_privilege('app_pending_user', 'public.congregations', 'SELECT')
     OR has_table_privilege('app_pending_user', 'public.congregations', 'INSERT')
     OR has_table_privilege('app_pending_user', 'public.congregations', 'UPDATE')
     OR has_table_privilege('app_pending_user', 'public.congregations', 'DELETE')
     OR has_any_column_privilege(
       'app_pending_user', 'public.congregations', 'SELECT'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.congregations', 'INSERT'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.congregations', 'UPDATE'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.congregations', 'REFERENCES'
     )
     OR NOT has_column_privilege(
       'app_pending_user', 'public.districts', 'id', 'SELECT'
     )
     OR NOT has_column_privilege(
       'app_pending_user', 'public.districts', 'name', 'SELECT'
     )
     OR NOT has_column_privilege(
       'app_pending_user', 'public.dioceses', 'id', 'SELECT'
     )
     OR NOT has_column_privilege(
       'app_pending_user', 'public.dioceses', 'name', 'SELECT'
     )
     OR NOT has_column_privilege(
       'app_pending_user', 'public.dioceses', 'district_id', 'SELECT'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('districts', 'dioceses')
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND has_column_privilege(
           'app_pending_user', a.attrelid, a.attnum, 'SELECT'
         )
         AND NOT (
           (c.relname = 'districts' AND a.attname IN ('id', 'name'))
           OR (
             c.relname = 'dioceses'
             AND a.attname IN ('id', 'name', 'district_id')
           )
         )
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.districts', 'INSERT'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.districts', 'UPDATE'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.districts', 'REFERENCES'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.dioceses', 'INSERT'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.dioceses', 'UPDATE'
     )
     OR has_any_column_privilege(
       'app_pending_user', 'public.dioceses', 'REFERENCES'
     )
  THEN
    RAISE EXCEPTION 'P0 postflight: pending OAuth referenciafelület grant/policy drift.';
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_profile_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles';

  IF v_profile_policies IS DISTINCT FROM ARRAY[
    'p0_legacy_authenticated_staff_gate',
    'p0_profiles_pending_select_self',
    'p0_profiles_pending_update_safe_self',
    'p0_profiles_staff_select',
    'p0_profiles_staff_update_safe_self'
  ]::text[] THEN
    RAISE EXCEPTION 'P0 postflight: profiles policy lista eltért: %', v_profile_policies;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname IN (
        'p0_profiles_staff_select',
        'p0_profiles_staff_update_safe_self',
        'p0_profiles_pending_select_self',
        'p0_profiles_pending_update_safe_self'
      )
      AND (
        permissive <> 'PERMISSIVE'
        OR (
          policyname LIKE 'p0_profiles_staff_%'
          AND roles IS DISTINCT FROM
            ARRAY['authenticated', 'app_staff_user']::name[]
        )
        OR (
          policyname LIKE 'p0_profiles_pending_%'
          AND roles IS DISTINCT FROM ARRAY['app_pending_user']::name[]
        )
        OR (policyname LIKE '%_select%' AND cmd <> 'SELECT')
        OR (policyname LIKE '%_update_%' AND cmd <> 'UPDATE')
        OR (
          policyname <> 'p0_profiles_staff_select'
          AND COALESCE(qual, '') NOT LIKE '%auth.uid%'
        )
        OR (
          policyname = 'p0_profiles_staff_select'
          AND COALESCE(qual, '') NOT LIKE '%current_user_is_active_staff%'
        )
        OR (
          policyname = 'p0_profiles_staff_update_safe_self'
          AND (
            COALESCE(qual, '') NOT LIKE '%current_user_is_active_staff%'
            OR COALESCE(qual, '') NOT LIKE '%status%active%'
            OR COALESCE(qual, '') NOT LIKE '%deleted_at%IS NULL%'
            OR COALESCE(with_check, '') NOT LIKE '%current_user_is_active_staff%'
            OR COALESCE(with_check, '') NOT LIKE '%status%active%'
            OR COALESCE(with_check, '') NOT LIKE '%deleted_at%IS NULL%'
          )
        )
        OR (
          policyname LIKE 'p0_profiles_pending_%'
          AND (
            COALESCE(qual, '') NOT LIKE '%status%pending%'
            OR COALESCE(qual, '') NOT LIKE '%deleted_at%IS NULL%'
          )
        )
        OR (
          policyname = 'p0_profiles_pending_update_safe_self'
          AND (
            COALESCE(with_check, '') NOT LIKE '%auth.uid%'
            OR COALESCE(with_check, '') NOT LIKE '%status%pending%'
            OR COALESCE(with_check, '') NOT LIKE '%deleted_at%IS NULL%'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: profiles policy role/cmd/guard drift.';
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_avatar_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      policyname LIKE 'avatars_%'
      OR policyname LIKE 'p0_avatars_%'
      OR COALESCE(qual, '') LIKE '%avatars%'
      OR COALESCE(with_check, '') LIKE '%avatars%'
    );

  IF v_avatar_policies IS DISTINCT FROM ARRAY[
    'avatars_public_read',
    'p0_avatars_staff_delete',
    'p0_avatars_staff_insert',
    'p0_avatars_staff_update'
  ]::text[] THEN
    RAISE EXCEPTION 'P0 postflight: avatars policy lista eltért: %', v_avatar_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatars_public_read'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['public']::name[]
      AND cmd = 'SELECT'
      AND qual = '(bucket_id = ''avatars''::text)'
      AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'P0 postflight: avatars public read policy drift.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'p0_avatars_staff_insert',
        'p0_avatars_staff_update',
        'p0_avatars_staff_delete'
      )
      AND (
        permissive <> 'PERMISSIVE'
        OR roles IS DISTINCT FROM ARRAY['app_staff_user']::name[]
        OR (policyname = 'p0_avatars_staff_insert' AND cmd <> 'INSERT')
        OR (policyname = 'p0_avatars_staff_update' AND cmd <> 'UPDATE')
        OR (policyname = 'p0_avatars_staff_delete' AND cmd <> 'DELETE')
        OR COALESCE(qual, with_check, '') NOT LIKE '%current_user_is_active_staff%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%profile_roles%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%szemely-%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%approval_status%approved%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%scope%congregation%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%.jpg%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%.jpeg%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%.png%'
        OR COALESCE(qual, with_check, '') NOT LIKE '%.webp%'
        OR (
          COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
        ) LIKE '%owner%'
        OR (
          COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
        ) LIKE '%profiles.congregation_id%'
        OR (
          policyname = 'p0_avatars_staff_update'
          AND (
            COALESCE(with_check, '') NOT LIKE '%current_user_is_active_staff%'
            OR COALESCE(with_check, '') NOT LIKE '%profile_roles%'
            OR COALESCE(with_check, '') NOT LIKE '%szemely-%'
            OR COALESCE(with_check, '') NOT LIKE '%approval_status%approved%'
            OR COALESCE(with_check, '') NOT LIKE '%scope%congregation%'
            OR COALESCE(with_check, '') NOT LIKE '%.jpg%'
            OR COALESCE(with_check, '') NOT LIKE '%.jpeg%'
            OR COALESCE(with_check, '') NOT LIKE '%.png%'
            OR COALESCE(with_check, '') NOT LIKE '%.webp%'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: avatars policy role/cmd/guard drift.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'avatars'
      AND name = 'avatars'
      AND public = true
      AND file_size_limit = 2097152
      AND allowed_mime_types = ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp'
      ]::text[]
  ) THEN
    RAISE EXCEPTION 'P0 postflight: avatars bucket limit/MIME drift.';
  END IF;

  SELECT pg_catalog.array_agg(policyname ORDER BY policyname)
    INTO v_access_doc_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      policyname LIKE '%access_request_docs%'
      OR COALESCE(qual, '') LIKE '%access-request-docs%'
      OR COALESCE(with_check, '') LIKE '%access-request-docs%'
    );

  IF v_access_doc_policies IS DISTINCT FROM ARRAY[
    'p0_access_request_docs_admin_read',
    'p0_access_request_docs_no_client_delete',
    'p0_access_request_docs_no_client_insert',
    'p0_access_request_docs_no_client_update'
  ]::text[] THEN
    RAISE EXCEPTION
      'P0 postflight: access-request-docs policy lista eltért: %',
      v_access_doc_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'p0_access_request_docs_admin_read'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['app_staff_user']::name[]
      AND cmd = 'SELECT'
      AND COALESCE(qual, '') LIKE '%access-request-docs%'
      AND COALESCE(qual, '') LIKE '%current_user_is_active_staff%'
      AND COALESCE(qual, '') LIKE '%profiles%'
      AND COALESCE(qual, '') LIKE '%profile_roles%'
      AND COALESCE(qual, '') LIKE '%auth.uid%'
      AND COALESCE(qual, '') LIKE '%status%active%'
      AND COALESCE(qual, '') LIKE '%deleted_at%IS NULL%'
      AND COALESCE(qual, '') LIKE '%approval_status%approved%'
      AND COALESCE(qual, '') LIKE '%scope%system%'
      AND COALESCE(qual, '') LIKE '%scope_id%IS NULL%'
      AND COALESCE(qual, '') LIKE '%role%admin%'
      AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION
      'P0 postflight: access-request-docs admin-read policy drift.';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'access_requests'
      AND policyname IN (
        'p0_access_requests_system_admin_select',
        'p0_access_requests_system_admin_update'
      )
      AND roles = ARRAY['authenticated']::name[]
      AND COALESCE(qual, '') LIKE '%profile_roles%'
      AND COALESCE(qual, '') LIKE '%approval_status%approved%'
      AND COALESCE(qual, '') LIKE '%scope%system%'
      AND COALESCE(qual, '') LIKE '%scope_id%IS NULL%'
      AND COALESCE(qual, '') LIKE '%role%admin%'
      AND (
        (cmd = 'SELECT' AND with_check IS NULL)
        OR (
          cmd = 'UPDATE'
          AND COALESCE(with_check, '') LIKE '%profile_roles%'
          AND COALESCE(with_check, '') LIKE '%scope%system%'
        )
      )
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'access_requests'
      AND policyname IN (
        'access_requests_insert',
        'access_requests_select_admin',
        'access_requests_update_admin'
      )
  ) OR (
    SELECT pg_catalog.array_agg(policyname ORDER BY policyname)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'access_requests'
  ) IS DISTINCT FROM ARRAY[
    'p0_access_requests_system_admin_select',
    'p0_access_requests_system_admin_update',
    'p0_legacy_authenticated_staff_gate'
  ]::text[] OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      'anon',
      'authenticated',
      'app_staff_user',
      'app_pending_user',
      'member_portal_user'
    ]::text[]) role_name
    WHERE has_table_privilege(
            role_name, 'public.access_requests', 'INSERT'
          )
       OR has_any_column_privilege(
            role_name, 'public.access_requests', 'INSERT'
          )
  ) OR NOT has_table_privilege(
    'service_role', 'public.access_requests', 'INSERT'
  ) THEN
    RAISE EXCEPTION
      'P0 postflight: access_requests exact rendszeradmin policy vagy service-only INSERT ACL drift.';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'p0_access_request_docs_no_client_insert',
        'p0_access_request_docs_no_client_update',
        'p0_access_request_docs_no_client_delete'
      )
      AND permissive = 'RESTRICTIVE'
      AND roles = ARRAY['public']::name[]
      AND (
        (
          policyname = 'p0_access_request_docs_no_client_insert'
          AND cmd = 'INSERT'
          AND qual IS NULL
          AND COALESCE(with_check, '') LIKE '%bucket_id%'
          AND COALESCE(with_check, '') LIKE '%<>%access-request-docs%'
        )
        OR (
          policyname = 'p0_access_request_docs_no_client_update'
          AND cmd = 'UPDATE'
          AND COALESCE(qual, '') LIKE '%bucket_id%'
          AND COALESCE(qual, '') LIKE '%<>%access-request-docs%'
          AND COALESCE(with_check, '') LIKE '%bucket_id%'
          AND COALESCE(with_check, '') LIKE '%<>%access-request-docs%'
        )
        OR (
          policyname = 'p0_access_request_docs_no_client_delete'
          AND cmd = 'DELETE'
          AND COALESCE(qual, '') LIKE '%bucket_id%'
          AND COALESCE(qual, '') LIKE '%<>%access-request-docs%'
          AND with_check IS NULL
        )
      )
  ) <> 3 THEN
    RAISE EXCEPTION
      'P0 postflight: access-request-docs restrictive write-deny policy drift.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'access-request-docs'
      AND name = 'access-request-docs'
      AND public = false
      AND file_size_limit = 10485760
      AND allowed_mime_types = ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png'
      ]::text[]
  ) THEN
    RAISE EXCEPTION
      'P0 postflight: access-request-docs bucket limit/MIME drift.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'p0_storage_legacy_authenticated_staff_gate'
      AND permissive = 'RESTRICTIVE'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'ALL'
      AND COALESCE(qual, '') LIKE '%current_user_is_active_staff%'
      AND COALESCE(with_check, '') LIKE '%current_user_is_active_staff%'
  ) THEN
    RAISE EXCEPTION
      'P0 postflight: hiányzó vagy driftelt Storage legacy-token gate.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policies pol
        WHERE pol.schemaname = n.nspname
          AND pol.tablename = c.relname
          AND pol.policyname = 'p0_legacy_authenticated_staff_gate'
          AND pol.permissive = 'RESTRICTIVE'
          AND pol.roles = ARRAY['authenticated']::name[]
          AND pol.cmd = 'ALL'
          AND COALESCE(pol.qual, '') LIKE '%current_user_is_active_staff%'
          AND COALESCE(pol.with_check, '') LIKE '%current_user_is_active_staff%'
      )
  ) THEN
    RAISE EXCEPTION 'P0 postflight: hiányzó vagy driftelt globális legacy-token gate.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  ) <> 1 THEN
    RAISE EXCEPTION 'P0 postflight: az auth trigger váratlanul megváltozott.';
  END IF;
END
$postflight_assert$;

COMMIT;

-- --------------------------------------------------------------------------
-- 13. Read-only postflight JSON — ezt az egy eredményt kell visszaküldeni
-- --------------------------------------------------------------------------

WITH public_function_acl AS (
  SELECT
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            p.proacl,
            pg_catalog.acldefault('f', p.proowner)
          )
        ) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      )
    )::integer AS public_execute_count,
    count(*) FILTER (
      WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
    )::integer AS anon_execute_count,
    count(*) FILTER (
      WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )::integer AS authenticated_execute_count,
    count(*) FILTER (
      WHERE has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
    )::integer AS app_staff_execute_count,
    count(*) FILTER (
      WHERE has_function_privilege('app_pending_user', p.oid, 'EXECUTE')
    )::integer AS app_pending_execute_count,
    count(*) FILTER (
      WHERE has_function_privilege('member_portal_user', p.oid, 'EXECUTE')
    )::integer AS member_execute_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
), anon_signatures AS (
  SELECT COALESCE(
    jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text),
    '[]'::jsonb
  ) AS value
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
), staff_signatures AS (
  SELECT COALESCE(
    jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text),
    '[]'::jsonb
  ) AS value
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
), extension_function_exceptions AS (
  SELECT jsonb_build_object(
    'count', count(*)::integer,
    'all_non_security_definer', bool_and(NOT p.prosecdef),
    'signatures', COALESCE(
      jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text),
      '[]'::jsonb
    )
  ) AS value
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'supabase_admin'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = p.oid
        AND d.refclassid = 'pg_catalog.pg_extension'::regclass
        AND d.deptype = 'e'
        AND e.extname IN ('pg_trgm', 'unaccent')
    )
), legacy_gate_state AS (
  SELECT jsonb_build_object(
    'public_rls_table_count', count(*)::integer,
    'gated_table_count', count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policies pol
        WHERE pol.schemaname = n.nspname
          AND pol.tablename = c.relname
          AND pol.policyname = 'p0_legacy_authenticated_staff_gate'
          AND pol.permissive = 'RESTRICTIVE'
          AND pol.roles = ARRAY['authenticated']::name[]
          AND pol.cmd = 'ALL'
      )
    )::integer
  ) AS value
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relrowsecurity
), default_acl_state AS (
  SELECT count(*)::integer AS client_grant_count
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
  LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
  WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
    AND n.nspname = 'public'
    AND d.defaclobjtype IN ('f', 'r', 'S')
    AND (
      acl.grantee = 0
      OR grantee.rolname IN (
        'anon', 'authenticated', 'service_role', 'app_staff_user',
        'app_pending_user', 'member_portal_user'
      )
    )
), profile_policy_state AS (
  SELECT COALESCE(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles'
), avatar_policy_state AS (
  SELECT COALESCE(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      policyname LIKE 'avatars_%'
      OR policyname LIKE 'p0_avatars_%'
      OR COALESCE(qual, '') LIKE '%avatars%'
      OR COALESCE(with_check, '') LIKE '%avatars%'
    )
), access_doc_policy_state AS (
  SELECT COALESCE(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND (
      policyname LIKE '%access_request_docs%'
      OR COALESCE(qual, '') LIKE '%access-request-docs%'
      OR COALESCE(with_check, '') LIKE '%access-request-docs%'
    )
)
SELECT jsonb_build_object(
  'migration', '2026-07-17-member-portal-p0-auth-isolation',
  'review_draft_warning',
    'Maintenance sorrend: foundation + member core + P0, majd token-hook csere, Dashboard teszt, kötelező re-login; dispatcher csak ezután.',
  'roles', jsonb_build_object(
    'app_staff_user_exists', EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_staff_user'
    ),
    'app_pending_user_exists', EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_pending_user'
    ),
    'member_portal_user_exists', EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'member_portal_user'
    ),
    'staff_inherits_authenticated',
      pg_has_role('app_staff_user', 'authenticated', 'MEMBER'),
    'pending_inherits_authenticated',
      pg_has_role('app_pending_user', 'authenticated', 'MEMBER'),
    'member_inherits_authenticated',
      pg_has_role('member_portal_user', 'authenticated', 'MEMBER')
  ),
  'public_schema_create', jsonb_build_object(
    'anon', has_schema_privilege('anon', 'public', 'CREATE'),
    'authenticated', has_schema_privilege('authenticated', 'public', 'CREATE'),
    'service_role', has_schema_privilege('service_role', 'public', 'CREATE'),
    'supabase_auth_admin_create',
      has_schema_privilege('supabase_auth_admin', 'public', 'CREATE'),
    'supabase_auth_admin_usage',
      has_schema_privilege('supabase_auth_admin', 'public', 'USAGE'),
    'app_staff_user', has_schema_privilege('app_staff_user', 'public', 'CREATE'),
    'app_pending_user', has_schema_privilege('app_pending_user', 'public', 'CREATE'),
    'member_portal_user', has_schema_privilege('member_portal_user', 'public', 'CREATE')
  ),
  'active_staff_helper', (
    SELECT jsonb_build_object(
      'signature', p.oid::regprocedure::text,
      'owner', pg_catalog.pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'config', to_jsonb(COALESCE(p.proconfig, ARRAY[]::text[])),
      'marker', pg_catalog.obj_description(p.oid, 'pg_proc')
    )
    FROM pg_catalog.pg_proc p
    WHERE p.oid = 'public.current_user_is_active_staff()'::regprocedure
  ),
  'custom_access_token_hook_execute', jsonb_build_object(
    'supabase_auth_admin', has_function_privilege(
      'supabase_auth_admin',
      'public.custom_access_token_hook(jsonb)',
      'EXECUTE'
    ),
    'anon', has_function_privilege(
      'anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
    ),
    'authenticated', has_function_privilege(
      'authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
    ),
    'service_role', has_function_privilege(
      'service_role', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
    ),
    'app_staff_user', has_function_privilege(
      'app_staff_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
    ),
    'app_pending_user', has_function_privilege(
      'app_pending_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
    ),
    'member_portal_user', has_function_privilege(
      'member_portal_user', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'
    )
  ),
  'postgres_owned_public_function_execute_counts', to_jsonb(public_function_acl),
  'anon_function_signatures', (SELECT value FROM anon_signatures),
  'app_staff_function_signatures', (SELECT value FROM staff_signatures),
  'supabase_owned_extension_function_exceptions',
    (SELECT value FROM extension_function_exceptions),
  'legacy_authenticated_restrictive_gate',
    (SELECT value FROM legacy_gate_state),
  'postgres_public_default_acl_client_grants',
    (SELECT client_grant_count FROM default_acl_state),
  'pending_oauth_reference_access', jsonb_build_object(
    'congregations_table_select', has_table_privilege(
      'app_pending_user', 'public.congregations', 'SELECT'
    ),
    'congregations_any_column_select', has_any_column_privilege(
      'app_pending_user', 'public.congregations', 'SELECT'
    ),
    'districts_table_select', has_table_privilege(
      'app_pending_user', 'public.districts', 'SELECT'
    ),
    'districts_id_select', has_column_privilege(
      'app_pending_user', 'public.districts', 'id', 'SELECT'
    ),
    'districts_name_select', has_column_privilege(
      'app_pending_user', 'public.districts', 'name', 'SELECT'
    ),
    'dioceses_table_select', has_table_privilege(
      'app_pending_user', 'public.dioceses', 'SELECT'
    ),
    'dioceses_id_select', has_column_privilege(
      'app_pending_user', 'public.dioceses', 'id', 'SELECT'
    ),
    'dioceses_name_select', has_column_privilege(
      'app_pending_user', 'public.dioceses', 'name', 'SELECT'
    ),
    'dioceses_district_id_select', has_column_privilege(
      'app_pending_user', 'public.dioceses', 'district_id', 'SELECT'
    ),
    'policies', (
      SELECT COALESCE(jsonb_agg(policyname ORDER BY tablename), '[]'::jsonb)
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND policyname IN (
          'p0_districts_pending_reference_select',
          'p0_dioceses_pending_reference_select'
        )
    )
  ),
  'profiles_policies', (SELECT value FROM profile_policy_state),
  'profiles_sensitive_update', jsonb_build_object(
    'staff_role', has_column_privilege(
      'app_staff_user', 'public.profiles', 'role', 'UPDATE'
    ),
    'staff_status', has_column_privilege(
      'app_staff_user', 'public.profiles', 'status', 'UPDATE'
    ),
    'staff_congregation_id', has_column_privilege(
      'app_staff_user', 'public.profiles', 'congregation_id', 'UPDATE'
    ),
    'pending_role', has_column_privilege(
      'app_pending_user', 'public.profiles', 'role', 'UPDATE'
    ),
    'pending_status', has_column_privilege(
      'app_pending_user', 'public.profiles', 'status', 'UPDATE'
    )
  ),
  'avatars', jsonb_build_object(
    'object_count', (
      SELECT count(*) FROM storage.objects WHERE bucket_id = 'avatars'
    ),
    'file_size_limit', (
      SELECT file_size_limit FROM storage.buckets WHERE id = 'avatars'
    ),
    'allowed_mime_types', (
      SELECT to_jsonb(allowed_mime_types)
      FROM storage.buckets
      WHERE id = 'avatars'
    ),
    'policies', (SELECT value FROM avatar_policy_state)
  ),
  'access_request_docs', jsonb_build_object(
    'object_count', (
      SELECT count(*)
      FROM storage.objects
      WHERE bucket_id = 'access-request-docs'
    ),
    'public', (
      SELECT public
      FROM storage.buckets
      WHERE id = 'access-request-docs'
    ),
    'file_size_limit', (
      SELECT file_size_limit
      FROM storage.buckets
      WHERE id = 'access-request-docs'
    ),
    'allowed_mime_types', (
      SELECT to_jsonb(allowed_mime_types)
      FROM storage.buckets
      WHERE id = 'access-request-docs'
    ),
    'policies', (SELECT value FROM access_doc_policy_state),
    'legacy_authenticated_gate', EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'p0_storage_legacy_authenticated_staff_gate'
        AND permissive = 'RESTRICTIVE'
    )
  ),
  'auth_trigger_untouched', (
    SELECT count(*) = 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  ),
  'blocked_frontend_rpcs', jsonb_build_array(
    'import_finance_batch',
    'next_bizonylat_szam',
    'next_chitanta_full',
    'next_chitanta_number',
    'find_potential_cross_congregation_match',
    'get_cross_match_pastor_contacts',
    'resolve_cross_congregation_match'
  ),
  'blocked_anonymous_rpcs', jsonb_build_array(
    'login_email_status(text)',
    'registration_email_info(text)'
  )
) AS p0_auth_isolation_verification
FROM public_function_acl;
