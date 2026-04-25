-- KARTOTEKA — wipe után onboarding-újraindítás
-- Dátum: 2026-04-25
-- Futtatja: Endre (Supabase SQL editor)
--
-- ROOT CAUSE:
--   A gyülekezeti wipe (`public.wipe_congregation_data`) megtartja a
--   `profiles` sort és a user-szintű konfigurációkat, ami helyes.
--   Viszont NEM nullázza vissza az onboarding-jelzőket:
--
--     - profiles.onboarding_completed_at
--     - profiles.walkthrough_completed
--     - profiles.walkthrough_skipped_at
--     - wizard_progress (különösen completed_at)
--
--   Emiatt reset után a következő belépéskor a rendszer továbbra is úgy látja,
--   mintha az onboarding már kész lenne.
--
--   Különösen fontos:
--   - a dashboard layout csak a `profiles.onboarding_completed_at` mező alapján
--     dönt a `/welcome` redirectről
--   - a `WelcomeWizardClient` a `wizard_progress.completed_at` miatt azonnal
--     visszadobhat a `/dashboard`-ra, még akkor is, ha a profile-flaget
--     manuálisan kinulláztuk volna
--
-- CÉL:
--   A wipe után a fő gyülekezeti profil(ok) újra onboarding-állapotba kerüljenek,
--   így a következő belépéskor a beépített `/welcome` wizard tisztán újraindul.
--
-- HATÓKÖR:
--   Csak azok a profilok érintettek, amelyeknek a `profiles.congregation_id`
--   pontosan a wipe-olt gyülekezetre mutat. A könyvelői / számvevői M:N
--   hozzárendeléseket nem érintjük.

BEGIN;

CREATE OR REPLACE FUNCTION public.wipe_congregation_data(
    target_congregation_id UUID,
    confirm_name TEXT
)
RETURNS TABLE(deleted_table TEXT, rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    caller_id      UUID := auth.uid();
    caller_role    TEXT;
    expected_name  TEXT;
    affected       BIGINT;
    total          BIGINT := 0;
    deleted_list   JSONB := '[]'::jsonb;
    rec            RECORD;

    -- KRITIKUS: ezek a user-szintű táblák SOHA nem törlendők wipe során.
    keep_tables    TEXT[] := ARRAY[
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
        'user_login_attempts'
    ];
BEGIN
    -- 1. Auth check
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Bejelentkezés szükséges'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Role check
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role IS NULL OR caller_role NOT IN ('admin', 'egyhazkeruleti_admin', 'egyhazmegyei_admin') THEN
        RAISE EXCEPTION 'Csak admin / egyházkerületi admin / egyházmegyei admin szerepkör végezheti el ezt a műveletet'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 3. Gyülekezet-létezés
    SELECT COALESCE(NULLIF(nev_hu, ''), name) INTO expected_name
    FROM public.congregations
    WHERE id = target_congregation_id;

    IF expected_name IS NULL THEN
        RAISE EXCEPTION 'A megadott gyülekezet (%) nem létezik', target_congregation_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 4. Confirm-név
    IF confirm_name IS NULL OR confirm_name <> expected_name THEN
        RAISE EXCEPTION 'A megerősítő név (%) nem egyezik a gyülekezet nevével (%)',
            COALESCE(confirm_name, '<üres>'), expected_name
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 5. Scope-check
    IF caller_role <> 'admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profile_congregations pc
            WHERE pc.profile_id = caller_id
              AND pc.congregation_id = target_congregation_id
              AND pc.approval_status = 'approved'
              AND pc.active = true
        ) THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = caller_id
                  AND p.congregation_id = target_congregation_id
            ) THEN
                RAISE EXCEPTION 'Nincs jogosultságod ehhez a gyülekezethez (%)', expected_name
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        END IF;
    END IF;

    -- 6. WIPE — először a közvetett kapcsolatok
    DELETE FROM public.gyerek
        WHERE id_szemely IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id)
           OR id_csalad IN (
               SELECT c.id FROM public.csalad c
               WHERE c.id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id)
                  OR c.id_no IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id)
           );
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'gyerek', 'rows', affected);
    deleted_table := 'gyerek'; rows_deleted := affected; RETURN NEXT;

    DELETE FROM public.csalad
        WHERE id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id)
           OR id_no IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id);
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'csalad', 'rows', affected);
    deleted_table := 'csalad'; rows_deleted := affected; RETURN NEXT;

    -- 7. Dinamikus loop minden congregation_id-s táblára
    FOR rec IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = 'congregation_id'
          AND c.table_name <> ALL(keep_tables)
          AND c.table_name <> 'szemely'
          AND EXISTS (
              SELECT 1 FROM information_schema.tables t
              WHERE t.table_schema = c.table_schema
                AND t.table_name = c.table_name
                AND t.table_type = 'BASE TABLE'
          )
        ORDER BY c.table_name
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE congregation_id = $1', rec.table_name)
                USING target_congregation_id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            total := total + affected;
            deleted_list := deleted_list || jsonb_build_object('table', rec.table_name, 'rows', affected);
            deleted_table := rec.table_name; rows_deleted := affected; RETURN NEXT;
        EXCEPTION WHEN foreign_key_violation THEN
            deleted_list := deleted_list || jsonb_build_object('table', rec.table_name, 'error', 'FK violation');
            deleted_table := rec.table_name || ' (FK hiba)'; rows_deleted := 0; RETURN NEXT;
        END;
    END LOOP;

    -- 8. Személyek utoljára
    DELETE FROM public.szemely WHERE congregation_id = target_congregation_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'szemely', 'rows', affected);
    deleted_table := 'szemely'; rows_deleted := affected; RETURN NEXT;

    -- 9. Onboarding reset a fő gyülekezeti profilokra
    -- Ez NEM törli a profile-t, csak újra "első belépés" állapotba teszi.
    UPDATE public.profiles
    SET
        walkthrough_completed = false,
        walkthrough_skipped_at = NULL,
        onboarding_completed_at = NULL,
        updated_at = now()
    WHERE congregation_id = target_congregation_id;

    GET DIAGNOSTICS affected = ROW_COUNT;
    deleted_list := deleted_list || jsonb_build_object(
        'table', 'profiles',
        'rows', affected,
        'action', 'onboarding_reset'
    );

    -- 10. Régi wizard-állapot törlése, különben a kliens completed_at miatt
    -- visszaugrik a dashboardra és a welcome wizard nem indul el.
    DELETE FROM public.wizard_progress
    WHERE user_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.congregation_id = target_congregation_id
    );

    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object(
        'table', 'wizard_progress',
        'rows', affected,
        'action', 'delete'
    );

    -- 11. Audit
    INSERT INTO public.data_wipe_log (
        congregation_id, congregation_name, initiated_by,
        deleted_tables, total_rows_deleted
    ) VALUES (
        target_congregation_id, expected_name, caller_id,
        deleted_list, total
    );

    RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.wipe_congregation_data(UUID, TEXT) IS
    '2026-04-25 FIX v2: a wipe a gyülekezeti főprofilokon onboarding-resetet végez (walkthrough_completed=false, onboarding_completed_at=NULL), és törli a wizard_progress sorokat is.';

GRANT EXECUTE ON FUNCTION public.wipe_congregation_data(UUID, TEXT) TO authenticated;

COMMIT;

-- === ELLENŐRZÉS ===

-- [1/4] A függvény definíciója tartalmazza-e az onboarding resetet?
SELECT
  position('walkthrough_completed = false' in pg_get_functiondef(p.oid)) > 0 AS resets_walkthrough,
  position('onboarding_completed_at = NULL' in pg_get_functiondef(p.oid)) > 0 AS resets_onboarding_flag,
  position('DELETE FROM public.wizard_progress' in pg_get_functiondef(p.oid)) > 0 AS clears_wizard_progress
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'wipe_congregation_data'
  AND pg_get_function_identity_arguments(p.oid) = 'target_congregation_id uuid, confirm_name text';

-- [2/4] A függvény EXECUTE joga megvan-e authenticated számára?
SELECT
  routine_name,
  privilege_type,
  grantee
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name = 'wipe_congregation_data'
  AND grantee = 'authenticated';

-- [3/4] Megvan-e a wizard_progress tábla? (elvárás: 1 sor)
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'wizard_progress';

-- [4/4] A profiles onboarding-oszlopai megvannak-e? (elvárás: 3 sor)
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('walkthrough_completed', 'walkthrough_skipped_at', 'onboarding_completed_at')
ORDER BY column_name;
