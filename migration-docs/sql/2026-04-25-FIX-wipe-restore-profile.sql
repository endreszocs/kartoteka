-- KARTOTEKA — KRITIKUS FIX: wipe-RPC profil-védelem + Endre profil-helyreállítás
-- Dátum: 2026-04-25
-- Futtatja: Endre (Supabase SQL editor)
--
-- ROOT CAUSE:
--   A 2026-04-24-i `wipe_congregation_data` RPC `keep_tables` listája NEM tartalmazta
--   a `profiles` táblát. A `profiles.congregation_id` oszlop (legacy single-congregation)
--   miatt a wipe **TÖRÖLTE A FELHASZNÁLÓ SAJÁT PROFILJÁT IS** a megadott gyülekezetnél.
--   Ezután az `auth.users` még megvan (login működik), de profil hiányában a dashboard
--   nem tölt be: minden auth-utáni page query a `profiles` táblára kérdez (full_name,
--   role, congregation_id), és NULL-ra fut.
--
-- HIBA HATÁSA:
--   - Endre (és minden más felhasználó, akinek a `congregation_id`-ja a wipeolt
--     gyülekezetre mutatott) profilja törölve.
--   - Login után a dashboard összeomlik (üres oldal / hiba).
--
-- JAVÍTÁS — KÉT LÉPÉSBEN:
--   1. RECOVERY: Endre profilját újra létrehozzuk az `auth.users`-ből és a
--      megőrzött `congregations` rekordból.
--   2. PREVENTÍV FIX: a `wipe_congregation_data` RPC `keep_tables`-t bővítjük:
--      `profiles`, `profile_roles`, `user_devices`, `user_login_attempts` (ezek
--      mind user-szintű konfigurációk, sose törlendők a wipe során).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RECOVERY: Endre profil-helyreállítás
-- ─────────────────────────────────────────────────────────────────────────
-- Az auth.users tábla érintetlen — onnan vesszük a user_id-t és az e-mail-t.
-- Ha Endre több user-rel rendelkezik, az e-mail alapján szűrünk.
--
-- TODO Endre: cseréld le az 'endreszocs@gmail.com' e-mailt a sajátodra,
-- ha más e-mail-lel vagy bejelentkezve. A `target_congregation_name` legyen
-- a wipeolt gyülekezet hivatalos neve (`congregations.nev_hu`).

DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'endreszocs@gmail.com';  -- ← cseréld saját e-mail-edre, ha kell
    v_full_name TEXT := 'Szőcs Endre';        -- ← cseréld a saját nevedre, ha kell
    v_congregation_id UUID;
    v_already_exists BOOLEAN;
BEGIN
    -- 1. user_id az auth.users-ből
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Az auth.users-ben nincs % e-mailű user. Cseréld a v_email értékét a sajátodra.', v_email;
    END IF;

    -- 2. Profil már létezik?
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_already_exists;
    IF v_already_exists THEN
        RAISE NOTICE 'A profil már létezik (id=%) — recovery nem szükséges.', v_user_id;
        RETURN;
    END IF;

    -- 3. A megtartott congregation rekord (a wipe NEM törölte) — default
    --    congregation_id-nek választunk. Sorrend (preferencia szerint):
    --
    --    a) Ha a `profile_congregations`-ben még megmaradt egy hozzárendelés
    --       Endréhez (a wipe NEM törölte ezt a junction táblát), abból
    --       vesszük a congregation_id-t.
    --    b) Fallback: az első congregations rekord név szerint.
    --
    --    Ha több van, Endre később a UI-n a Profil-switcher-rel válthat.

    -- a) profile_congregations próba
    --    Tényleges oszlopok (Database_schema.sql:1650-1671):
    --      id, profile_id, congregation_id, role_scope, assigned_by,
    --      assigned_at, active, revoked_at, ..., approval_status, ...
    --    `created_at` NEM létezik — `assigned_at` a megfelelő.
    SELECT pc.congregation_id INTO v_congregation_id
    FROM public.profile_congregations pc
    WHERE pc.profile_id = v_user_id
      AND pc.approval_status = 'approved'
      AND pc.active = true
    ORDER BY pc.assigned_at DESC NULLS LAST
    LIMIT 1;

    -- b) fallback: első congregation név szerint
    IF v_congregation_id IS NULL THEN
        SELECT id INTO v_congregation_id
        FROM public.congregations
        ORDER BY COALESCE(NULLIF(nev_hu, ''), name) ASC NULLS LAST
        LIMIT 1;
    END IF;

    -- 4. Profil újra-létrehozás
    -- Megj.: a `profiles.role` CHECK constraint csak ezeket engedi:
    -- 'lelkesz', 'esperes', 'egyhazmegyei_admin', 'egyhazkeruleti_admin',
    -- 'admin', 'konyvelo', 'egyhazmegyei_szamvevo'. ('master_admin' NEM létezik
    -- — a Kartotéka e-mail-alapon azonosítja a master user-t a kódban; a
    -- profile.role ilyenkor 'admin'.)
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        status,
        congregation_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_email,
        v_full_name,
        'admin',          -- legmagasabb érvényes role; minden hozzáférést visszaad
        'active',
        v_congregation_id,
        now(),
        now()
    );

    RAISE NOTICE '✅ Profil helyreállítva: id=%, email=%, congregation_id=%',
        v_user_id, v_email, v_congregation_id;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. PREVENTÍV FIX: wipe_congregation_data RPC keep_tables bővítés
-- ─────────────────────────────────────────────────────────────────────────
-- Csak a `keep_tables` tömböt módosítjuk a 2026-04-24-i RPC-ben.
-- Hozzáadva: profiles, profile_roles, user_devices, user_login_attempts
-- — minden olyan user-szintű tábla, ami SOSE törlendő wipe során.

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

    -- KRITIKUS: a `profiles` és más user-szintű táblák ITT vannak, hogy a wipe
    -- SOHA NE törölje a felhasználó saját adatait. (2026-04-25 hibajavítás:
    -- a profiles a wipeolt user kizárását okozta — Endre a v0.6.0 után jelezte
    -- hogy az oldal nem tölt be.)
    keep_tables    TEXT[] := ARRAY[
        'congregations',
        'profile_congregations',
        'admin_access_requests',
        'congregation_subscriptions',
        'congregation_annual_fees',
        'congregation_custom_fees',
        'data_wipe_log',
        -- 2026-04-25 fix:
        'profiles',                  -- a felhasználó saját profilja
        'profile_roles',             -- multi-role hozzárendelések
        'user_devices',              -- desktop eszköz-regisztrációk
        'user_login_attempts'        -- login-history (ha létezik)
    ];
BEGIN
    -- 1. Auth check
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Bejelentkezés szükséges'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Role check (a 'profiles.role' CHECK constraint-je szerint érvényes
    --    értékek: 'admin', 'egyhazkeruleti_admin', 'egyhazmegyei_admin' a
    --    wipe-jogosultaknak. 'master_admin' nem létezik role-ként.)
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
    -- 'admin' = rendszer-szintű (minden gyülekezet); a többi role a saját
    -- gyülekezetére korlátozott (lásd profile_congregations + profiles fallback).
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

    -- 6. WIPE — gyerek (FK-szerű kezelés)
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

    -- csalad
    DELETE FROM public.csalad
        WHERE id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id)
           OR id_no IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id);
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'csalad', 'rows', affected);
    deleted_table := 'csalad'; rows_deleted := affected; RETURN NEXT;

    -- Dinamikus loop minden congregation_id-jú táblára (kivéve keep_tables + szemely)
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

    -- Szemely utoljára
    DELETE FROM public.szemely WHERE congregation_id = target_congregation_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'szemely', 'rows', affected);
    deleted_table := 'szemely'; rows_deleted := affected; RETURN NEXT;

    -- Audit
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
    '2026-04-25 FIX: profiles + user-szintű táblák hozzáadva a keep_tables-hez. Korábbi verzió törölte a felhasználó saját profilját.';

GRANT EXECUTE ON FUNCTION public.wipe_congregation_data(UUID, TEXT) TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS — futtasd külön a SQL editorban
-- ─────────────────────────────────────────────────────────────────────────

-- 1. A profil visszajött?
SELECT id, email, full_name, role, status, congregation_id, created_at
FROM public.profiles
WHERE email = 'endreszocs@gmail.com';

-- 2. Mely táblák számítanak most a wipe alól védettnek?
SELECT
    c.table_name,
    'KEEP (védett)' AS status
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'congregation_id'
  AND c.table_name IN (
      'congregations','profile_congregations','admin_access_requests',
      'congregation_subscriptions','congregation_annual_fees',
      'congregation_custom_fees','data_wipe_log',
      'profiles','profile_roles','user_devices','user_login_attempts'
  )
ORDER BY c.table_name;

-- 3. Mely táblák kerülnek wipe-ra (ha újra futna)?
SELECT
    c.table_name,
    'WIPE' AS status
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'congregation_id'
  AND c.table_name NOT IN (
      'congregations','profile_congregations','admin_access_requests',
      'congregation_subscriptions','congregation_annual_fees',
      'congregation_custom_fees','data_wipe_log',
      'profiles','profile_roles','user_devices','user_login_attempts'
  )
ORDER BY c.table_name;
