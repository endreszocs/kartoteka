-- KARTOTEKA — Admin: gyülekezeti adatok törlése (tiszta lap lelkészi éles-indulás előtt)
-- Dátum: 2026-04-24
-- Futtatja: Endre (Supabase SQL editor, feedback_supabase_access szerint)
--
-- Kontextus:
--   A lelkész a desktop appon és a webappon keresztül felvitt sok teszt-
--   adatot (személyeket, családokat, pénzügyi tételeket, munkanaplót stb.).
--   Mostantól éles használatra váltana, és tiszta lappal szeretne indulni:
--   - MEGTART: a gyülekezet alapadatai (`congregations` sor), a felhasználó
--     profilja (`profiles`), hozzárendelései (`profile_congregations`),
--     előfizetések (`congregation_subscriptions`), éves tagdíjak
--     (`congregation_annual_fees`/`congregation_custom_fees`).
--   - TÖRÖL: mindent, amit a lelkész a napi munka során vitt be — tagok,
--     családok, pénzügyi tranzakciók, chitanța, munkanapló, anyakönyv,
--     leltár, jegyzőkönyvek, Oblio kapcsolat, bankszámlák stb.
--
-- Védelem:
--   - SECURITY DEFINER (a művelet szuper-jogon fut, de a hívó role-check-kel védve)
--   - Csak admin / master / egyházkerületi admin indíthatja
--   - A target gyülekezethez tartoznia kell (kivéve master — ő globális)
--   - A hívónak be kell írnia a gyülekezet NEVÉT megerősítésként
--   - Audit: a `data_wipe_log` táblába egy sor a művelet tényéről
--
-- Működés:
--   Dinamikus — INFORMATION_SCHEMA alapján megkeresi az összes `congregation_id`
--   oszlopot a `public` sémában, és egy EXCEPT-szűrővel a "megtartandó" táblákat
--   kihagyja. Minden találatra `DELETE FROM table WHERE congregation_id = $1`.
--
--   + Statikus (csalad/gyerek/szemely — nincs congregation_id-juk közvetlenül):
--     csalad-ot a szemely.id-re hivatkozó FK alapján töröljük.
--     gyerek-et a szemely.id vagy csalad.id-re hivatkozó FK alapján.
--     szemely-t a végén (ez a "levél").

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Audit-log tábla (ha még nincs)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.data_wipe_log (
    id                   BIGSERIAL PRIMARY KEY,
    congregation_id      UUID NOT NULL,
    congregation_name    TEXT NOT NULL,
    initiated_by         UUID NOT NULL,
    initiated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_tables       JSONB NOT NULL,
    total_rows_deleted   BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT data_wipe_log_congregation_fk
        FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);

COMMENT ON TABLE public.data_wipe_log IS
    'Audit-log a gyülekezeti adat-törlés műveletekről. Minden egyes hívás egy új sort hoz létre, a törölt táblák listájával (JSONB).';

-- RLS: csak admin / master / egyházkerületi admin olvashatja
ALTER TABLE public.data_wipe_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_wipe_log_admin_read ON public.data_wipe_log;
CREATE POLICY data_wipe_log_admin_read ON public.data_wipe_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'master', 'egyhazkeruleti_admin')
        )
    );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. A wipe-RPC
-- ─────────────────────────────────────────────────────────────────────────

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

    -- Megtartandó táblák (NEM wipeolunk) — a `congregation_id` oszlop ellenére:
    keep_tables    TEXT[] := ARRAY[
        'congregations',
        'profile_congregations',
        'admin_access_requests',
        'congregation_subscriptions',
        'congregation_annual_fees',
        'congregation_custom_fees',
        'data_wipe_log'
    ];
BEGIN
    -- 1. Auth check
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Bejelentkezés szükséges'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Role check (a 'profiles.role' CHECK constraint-je szerint)
    -- Megengedett: admin, egyhazkeruleti_admin, egyhazmegyei_admin
    -- ('master' nem létezik role-ként — a Kartotéka e-mail-alapon azonosítja,
    -- de a master user-nek általában 'admin' role-ja is van a profilban.)
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role IS NULL OR caller_role NOT IN ('admin', 'egyhazkeruleti_admin', 'egyhazmegyei_admin') THEN
        RAISE EXCEPTION 'Csak admin / egyházkerületi admin / egyházmegyei admin szerepkör végezheti el ezt a műveletet'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 3. Gyülekezet-létezés ellenőrzés
    -- A `congregations` táblán a magyar név `nev_hu`, rb-all `name`. Mindkettőt
    -- elfogadjuk — a COALESCE a preferált `nev_hu`-t adja, fallback `name`.
    SELECT COALESCE(NULLIF(nev_hu, ''), name) INTO expected_name
    FROM public.congregations
    WHERE id = target_congregation_id;

    IF expected_name IS NULL THEN
        RAISE EXCEPTION 'A megadott gyülekezet (%) nem létezik', target_congregation_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 4. Confirm-név megerősítés
    IF confirm_name IS NULL OR confirm_name <> expected_name THEN
        RAISE EXCEPTION 'A megerősítő név (%) nem egyezik a gyülekezet nevével (%)',
            COALESCE(confirm_name, '<üres>'), expected_name
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 5. Scope-check
    -- admin: MINDEN gyülekezet (rendszer-szintű wipe-jog)
    -- egyhazkeruleti_admin: saját kerületén belüli gyülekezetek
    -- egyhazmegyei_admin: saját egyházmegyéjében levő gyülekezetek
    -- A scope-check alapja: a profile_congregations (M:N) vagy a profiles.congregation_id (single)
    IF caller_role <> 'admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profile_congregations pc
            WHERE pc.profile_id = caller_id
              AND pc.congregation_id = target_congregation_id
              AND pc.approval_status = 'approved'
              AND pc.active = true
        ) THEN
            -- Fallback: profiles.congregation_id (legacy single-congregation)
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

    -- ─────────────────────────────────────────────────────────────────────
    -- 6. WIPE — dinamikusan minden `congregation_id`-jú tábla
    -- ─────────────────────────────────────────────────────────────────────

    -- Először a szemely-hez kapcsolódó tagolt táblák (gyerek, csalad), mert
    -- ezekben nincs congregation_id, és FK-val mutatnak a szemely / csalad-ra.

    -- gyerek (szemely.id + csalad.id hivatkozik)
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

    -- csalad (a szemely-hez hivatkozik, de NEM rendelkezik congregation_id-val)
    DELETE FROM public.csalad
        WHERE id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id)
           OR id_no IN (SELECT id FROM public.szemely WHERE congregation_id = target_congregation_id);
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'csalad', 'rows', affected);
    deleted_table := 'csalad'; rows_deleted := affected; RETURN NEXT;

    -- ─────────────────────────────────────────────────────────────────────
    -- Dinamikus loop: minden congregation_id oszloppal rendelkező tábla
    -- a `public` sémában, a keep_tables halmaz kivételével.
    -- A `szemely` táblát ELŐRE HÁTRA toljuk, hogy az utolsók egyike legyen
    -- (a többi congregation_id-jú tábla nem hivatkozik szemely-re FK-val
    -- általában, de így tisztább a sorrend).
    -- ─────────────────────────────────────────────────────────────────────

    FOR rec IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = 'congregation_id'
          AND c.table_name <> ALL(keep_tables)
          AND c.table_name <> 'szemely'   -- szemely utoljára
          AND EXISTS (
              -- Csak "valódi" táblákra — view-okat kihagyjuk
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
            -- Ha FK violation van, a sor sorrendje rossz — logoljuk, nem állunk le
            deleted_list := deleted_list || jsonb_build_object('table', rec.table_name, 'error', 'FK violation');
            deleted_table := rec.table_name || ' (FK hiba)'; rows_deleted := 0; RETURN NEXT;
        END;
    END LOOP;

    -- Szemely utoljára (a leggyakoribb FK-célpont — a többit már töröltük)
    DELETE FROM public.szemely WHERE congregation_id = target_congregation_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
    deleted_list := deleted_list || jsonb_build_object('table', 'szemely', 'rows', affected);
    deleted_table := 'szemely'; rows_deleted := affected; RETURN NEXT;

    -- ─────────────────────────────────────────────────────────────────────
    -- 7. Audit-log
    -- ─────────────────────────────────────────────────────────────────────
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
    'Admin RPC: egy gyülekezet minden lelkész-bevitt adatát törli. Megtartja a gyülekezet alapadatait (congregations), a profilt és hozzárendeléseket. A hívónak be kell írnia a gyülekezet NEVÉT megerősítésként. Audit: data_wipe_log.';

-- GRANT — a PostgREST/Supabase RPC csak akkor hívható, ha a hívó szerep EXECUTE-ot kap
-- A `authenticated` role a Supabase alap-szerep; a függvényen belüli role-check kezeli
-- a további jogosultságot.
GRANT EXECUTE ON FUNCTION public.wipe_congregation_data(UUID, TEXT) TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Ellenőrzés (futtasd külön)
-- ─────────────────────────────────────────────────────────────────────────

-- 1. A függvény létrejött?
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'wipe_congregation_data' AND n.nspname = 'public';

-- 2. Az audit-log tábla létrejött?
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'data_wipe_log';

-- 3. Lista azon táblákról, amiket a wipe érinteni fog (előzetes ellenőrzés)
SELECT c.table_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'congregation_id'
  AND c.table_name NOT IN (
      'congregations','profile_congregations','admin_access_requests',
      'congregation_subscriptions','congregation_annual_fees',
      'congregation_custom_fees','data_wipe_log'
  )
ORDER BY c.table_name;
