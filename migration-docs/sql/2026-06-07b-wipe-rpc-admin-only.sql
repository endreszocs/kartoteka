-- =============================================================================
-- FÁZIS 4 (defense-in-depth): a gyülekezeti adattisztítás (wipe) RPC szigetése
-- CSAK fő rendszergazda / teljes admin szerepkörre (#2 döntés, 2026-06-07).
--
-- HÁTTÉR: a TS-oldali server action (apps/web/app/(dashboard)/admin/wipe-actions.ts)
-- már `requireAdminAccess({ allowDistrictAdmin: false })`-szel blokkolja a kerületi
-- (és egyházmegyei) admint. Ez a migráció a szerveroldali RPC-t is ehhez igazítja,
-- hogy egy esetleges más hívási út se engedhesse át a kerületi admint.
--
-- VÁLTOZÁS A KORÁBBI VERZIÓHOZ KÉPEST: a 2. Role-check mostantól CSAK 'admin'-t
-- enged ('egyhazkeruleti_admin' és 'egyhazmegyei_admin' kivéve). A függvény többi
-- része (keep_tables, dinamikus törlés, onboarding-reset, audit) VÁLTOZATLAN — a
-- 2026-04-25 wipe-onboarding-reset + 2026-05-17 search_path-pin élő verziójából.
--
-- FUTTATÁS: egyetlen tranzakció. Idempotens (CREATE OR REPLACE).
-- =============================================================================

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

    -- 2. Role check — #2 (2026-06-07): a visszafordíthatatlan adattisztítás
    --    CSAK a teljes (system) admin / fő rendszergazda joga. A kerületi és
    --    egyházmegyei admin innentől NEM végezhet wipe-ot.
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role IS NULL OR caller_role <> 'admin' THEN
        RAISE EXCEPTION 'A gyülekezeti adattisztítást csak a fő rendszergazda (teljes admin) végezheti el'
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

    -- 5. Scope-check — már csak 'admin' juthat ide (lásd 2. lépés), ezért ez a
    --    feltétel ténylegesen sosem aktiválódik; biztonsági redundanciaként marad.
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

    -- 10. Régi wizard-állapot törlése
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
    '2026-06-07 (#2): a gyülekezeti adattisztítást CSAK a teljes (system) admin / fő rendszergazda végezheti — kerületi és egyházmegyei admin kizárva. A törzs egyébként a 2026-04-25 onboarding-reset verzió.';

GRANT EXECUTE ON FUNCTION public.wipe_congregation_data(UUID, TEXT) TO authenticated;

COMMIT;

-- === ELLENŐRZÉS (futtasd a COMMIT után) ===
-- A definícióban a 2. lépésnél már CSAK 'admin' szerepel:
SELECT pg_get_functiondef('public.wipe_congregation_data(uuid, text)'::regprocedure)
       LIKE '%caller_role <> ''admin''%' AS admin_only_ok;
