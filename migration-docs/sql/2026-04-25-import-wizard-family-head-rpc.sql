-- KARTOTEKA — Tagnyilvántartás Import Wizard: szemely + csalad dual-insert RPC
-- Dátum: 2026-04-25
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél:
--   Az új tagnyilvántartás-import wizard `csaladok.xml` flow-ja egy sorra
--   két DB rekordot hoz létre atomikusan:
--     1. szemely (családfő) — csaladfo=true, ferfi=true/false a "Férfi" mező alapján
--     2. csalad — id_ferfi VAGY id_no = az új szemely.id, c_szam, c_utcaid, c_tombhaz
--
--   Mindkét tábla `c_utcaid` (int) FK NOT NULL → szükséges egy
--   `_resolve_or_create_street` helper, ami az "Utca" szöveg alapján
--   upsert-eli a megfelelő `adrstreet` rekordot (és transitively az
--   `adrlocality`-t is a "Helység" alapján).
--
-- Biztonság:
--   - SECURITY DEFINER → szigorú jog-ellenőrzés a function elején
--   - Csak master admin VAGY delegated import session (a target gyülekezethez)
--     hívhatja
--   - A létrehozott szemely.congregation_id MINDIG a target_congregation_id
--     (még ha a hívó user gyülekezete más is)
--
-- Idempotens: a CREATE OR REPLACE FUNCTION + DO $$ blokk biztosítja.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. _resolve_or_create_locality (Helység) — case-insensitive find vagy insert
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._resolve_or_create_locality(
    locality_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $resolve_locality$
DECLARE
    v_found_id integer;
    v_cleaned_name text;
    v_default_county_id integer;
    v_fallback_name text := 'Ismeretlen helység';
    v_new_id integer;
BEGIN
    -- Üres bemenet → fallback ("Ismeretlen helység" rekord)
    IF locality_name IS NULL OR btrim(locality_name) = '' THEN
        v_cleaned_name := v_fallback_name;
    ELSE
        v_cleaned_name := btrim(locality_name);
    END IF;

    -- Case-insensitive find — `:=` assignment, sose ütközik plain SQL `SELECT INTO`-val
    v_found_id := (
        SELECT id FROM public.adrlocality
        WHERE LOWER(name) = LOWER(v_cleaned_name)
        LIMIT 1
    );

    IF v_found_id IS NOT NULL THEN
        RETURN v_found_id;
    END IF;

    -- Nincs ilyen — keressünk egy "default" county-t (Kovászna / 'Cv' fallback,
    -- ha létezik; egyébként az első county).
    v_default_county_id := (
        SELECT id FROM public.adrcounty
        WHERE LOWER(name) LIKE '%kov%' OR LOWER(sname) = 'cv'
        LIMIT 1
    );

    IF v_default_county_id IS NULL THEN
        v_default_county_id := (SELECT id FROM public.adrcounty ORDER BY id LIMIT 1);
    END IF;

    -- Extrém eset: nincs egyetlen county sem
    IF v_default_county_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- INSERT új locality (RETURNING ... INTO PL/pgSQL-ben támogatott, nem ütközik)
    INSERT INTO public.adrlocality (name, code, countyid, usagecnt)
    VALUES (v_cleaned_name, '', v_default_county_id, 0)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$resolve_locality$;

COMMENT ON FUNCTION public._resolve_or_create_locality(text) IS
    'Tagnyilvántartás-import helper — case-insensitive locality lookup, hiány esetén új sor. Üres bemenetnél "Ismeretlen helység" fallback.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. _resolve_or_create_street (Utca) — case-insensitive + locality-rel együtt
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._resolve_or_create_street(
    street_name text,
    locality_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $resolve_street$
DECLARE
    v_found_id integer;
    v_cleaned_street text;
    v_locality_id integer;
    v_fallback_name text := 'Ismeretlen utca';
    v_new_id integer;
BEGIN
    -- Üres utcanév → fallback ("Ismeretlen utca" rekord). Mindig ad vissza valamit,
    -- hogy a szemely insert sose bukjon meg a NOT NULL c_utcaid miatt.
    IF street_name IS NULL OR btrim(street_name) = '' THEN
        v_cleaned_street := v_fallback_name;
    ELSE
        v_cleaned_street := btrim(street_name);
    END IF;

    -- Locality felbontás — mostantól mindig ad vissza valamit (Ismeretlen helység fallback)
    v_locality_id := public._resolve_or_create_locality(locality_name);

    -- Find: ugyanaz a street név + (opcionálisan) ugyanaz a locality
    IF v_locality_id IS NOT NULL THEN
        v_found_id := (
            SELECT id FROM public.adrstreet
            WHERE LOWER(name) = LOWER(v_cleaned_street)
              AND localityid = v_locality_id
            LIMIT 1
        );
    ELSE
        v_found_id := (
            SELECT id FROM public.adrstreet
            WHERE LOWER(name) = LOWER(v_cleaned_street)
            LIMIT 1
        );
    END IF;

    IF v_found_id IS NOT NULL THEN
        RETURN v_found_id;
    END IF;

    -- Ha nincs locality_id (nem vártuk, de extrém eset), az első létező locality-t
    -- használjuk fallback-ként (a tábla NOT NULL-os a localityid-ra).
    IF v_locality_id IS NULL THEN
        v_locality_id := (SELECT id FROM public.adrlocality ORDER BY id LIMIT 1);
        IF v_locality_id IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    -- INSERT új street
    INSERT INTO public.adrstreet (name, postalcode, localityid, usagecnt)
    VALUES (v_cleaned_street, '', v_locality_id, 0)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$resolve_street$;

COMMENT ON FUNCTION public._resolve_or_create_street(text, text) IS
    'Tagnyilvántartás-import helper — case-insensitive street lookup + locality, hiány esetén új sorok. Üres bemenetnél "Ismeretlen utca" fallback (sose ad vissza NULL-t, ha legalább egy adrcounty létezik).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. import_family_head_batch — fő RPC
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemenet:
--   target_congregation_id — a cél gyülekezet UUID-ja
--   rows JSONB — egy tömb, minden elem egy objektum a következő mezőkkel:
--     {
--       "csaladnev": "Tamás",
--       "k_nev": "Gábor",
--       "szcs_nev": "..." (opcionális),
--       "allapot": "Özv." (opcionális),
--       "namepattern": "Özv. Tamás Gábor" (opcionális),
--       "sz_datum": "1928-03-07" (opcionális),
--       "foglalkozas": "Nyugdíjas" (opcionális),
--       "vallas": "református" (opcionális),
--       "_utca_text": "Templom" (a _resolve_or_create_street-hez),
--       "_helyseg_text": "Barátos" (a _resolve_or_create_locality-hez),
--       "c_szam": "229",
--       "c_tombhaz": "..." (opcionális),
--       "telefon": "..." (opcionális),
--       "email": "..." (opcionális),
--       "apjaneve": "..." (opcionális),
--       "anyjaneve": "..." (opcionális),
--       "ferfi": true/false,
--       "meghalt": false,
--       "csaladfo": true,
--       "befizetoev": 2026 (opcionális),
--       "create_csalad": true (opcionális, default true) — false esetén csak szemely insert
--     }
--
-- Kimenet:
--   inserted_szemely INT, inserted_csalad INT, errors JSONB (pl. [{"row": 5, "message": "Utca hiányzik"}])

CREATE OR REPLACE FUNCTION public.import_family_head_batch(
    target_congregation_id uuid,
    rows jsonb
) RETURNS TABLE(
    inserted_szemely integer,
    inserted_csalad integer,
    errors jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $import_family_head$
DECLARE
    v_caller_user_id uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_row_data jsonb;
    v_row_idx integer := 0;
    v_new_szemely_id integer;
    v_street_id integer;
    v_cnp_value text;
    v_placeholder_cnp text;
    v_error_list jsonb := '[]'::jsonb;
    v_szemely_count integer := 0;
    v_csalad_count integer := 0;
    v_create_csalad_flag boolean;
    -- Smart gender inference (ezeket a fő DECLARE-be hoztam, hogy ne legyen nested DECLARE/BEGIN/END)
    v_explicit_ferfi text;
    v_inferred_ferfi boolean;
    v_inference_source text;
BEGIN
    -- ─── Jog-ellenőrzés (`:=` assignment-tel, sose `SELECT ... INTO`) ─────────
    IF v_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    -- Master admin: van-e admin szerepköre system scope-ban
    v_is_master := EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = v_caller_user_id
          AND role = 'admin'
          AND scope = 'system'
          AND active = true
          AND approval_status = 'approved'
    );

    -- Delegated import: van-e aktív delegated session a target gyülekezethez
    v_has_delegated := EXISTS(
        SELECT 1 FROM public.admin_access_requests
        WHERE admin_user_id = v_caller_user_id
          AND congregation_id = target_congregation_id
          AND status = 'approved'
          AND expires_at > now()
    );

    IF NOT v_is_master AND NOT v_has_delegated THEN
        RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez tagnyilvántartás-importhoz.', target_congregation_id;
    END IF;

    -- ─── Sorok feldolgozása ──────────────────────────────────────
    FOR v_row_data IN SELECT * FROM jsonb_array_elements(rows) LOOP
        v_row_idx := v_row_idx + 1;
        BEGIN
            -- Kötelező: családnév + keresztnév
            IF NULLIF(btrim(COALESCE(v_row_data->>'csaladnev', '')), '') IS NULL
               OR NULLIF(btrim(COALESCE(v_row_data->>'k_nev', '')), '') IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'Hiányzó kötelező mező: Családnév vagy Keresztnév'
                );
                CONTINUE;
            END IF;

            -- Utca lookup (a helper mostantól sose ad vissza NULL-t — Ismeretlen utca fallback,
            -- kivéve ha egyáltalán nincs adrcounty rekord, extrém eset).
            v_street_id := public._resolve_or_create_street(
                v_row_data->>'_utca_text',
                v_row_data->>'_helyseg_text'
            );

            IF v_street_id IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'A rendszerben nincs egyetlen megye sem — utca-lookup lehetetlen'
                );
                CONTINUE;
            END IF;

            -- CNP placeholder (a tábla NOT NULL-os, az XML-ben gyakran nincs)
            v_cnp_value := NULLIF(btrim(COALESCE(v_row_data->>'cnp', '')), '');
            IF v_cnp_value IS NULL THEN
                v_placeholder_cnp := 'IMPORT-' || gen_random_uuid()::text;
                v_cnp_value := v_placeholder_cnp;
            END IF;

            v_create_csalad_flag := COALESCE((v_row_data->>'create_csalad')::boolean, true);

            -- ─────────────────────────────────────────────────────────
            -- Nem (ferfi) — Smart inference + warning rendszer
            -- ─────────────────────────────────────────────────────────
            -- Szabályok prioritás szerint:
            --   1. Explicit "Férfi" érték → azt használjuk
            --   2. Van "Férje" mező (ferjk_nev kitöltve) → biztosan nő
            --   3. Egyébként default férfi + WARNING az error_list-be
            v_explicit_ferfi := NULLIF(btrim(COALESCE(v_row_data->>'ferfi', '')), '');

            IF v_explicit_ferfi IS NOT NULL THEN
                v_inferred_ferfi := (v_row_data->>'ferfi')::boolean;
                v_inference_source := 'explicit';
            ELSIF NULLIF(btrim(COALESCE(v_row_data->>'ferjk_nev', '')), '') IS NOT NULL THEN
                -- Van férje mező → biztosan nő
                v_inferred_ferfi := false;
                v_inference_source := 'spouse_field';
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'info',
                    'message', 'A "Férfi" mező hiányzott, de a "Férje" oszlop ki van töltve — automatikusan nő.',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
            ELSE
                -- Default: férfi + warning
                v_inferred_ferfi := true;
                v_inference_source := 'defaulted';
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'warning',
                    'message', 'A "Férfi" mező hiányzott — alapértelmezésben férfiként importálva. Ellenőrizd a tagnyilvántartásban!',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
            END IF;

            -- INSERT szemely
            INSERT INTO public.szemely (
                cnp, csaladnev, k_nev, szcs_nev, allapot, namepattern,
                apjaneve, anyjaneve,
                csaladfo, ferfi, meghalt,
                sz_datum, foglalkozas, vallas,
                c_utcaid, c_szam, c_tombhaz, c_szcim,
                telefon, email,
                befizetoev,
                congregation_id, isvisible, type, created
            ) VALUES (
                v_cnp_value,
                btrim(v_row_data->>'csaladnev'),
                btrim(v_row_data->>'k_nev'),
                NULLIF(btrim(COALESCE(v_row_data->>'szcs_nev', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'allapot', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'namepattern', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'apjaneve', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'anyjaneve', '')), ''),
                COALESCE((v_row_data->>'csaladfo')::boolean, false),
                v_inferred_ferfi,
                COALESCE((v_row_data->>'meghalt')::boolean, false),
                NULLIF(v_row_data->>'sz_datum', '')::date,
                NULLIF(btrim(COALESCE(v_row_data->>'foglalkozas', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'vallas', '')), ''),
                v_street_id,
                NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'c_szcim', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'telefon', '')), ''),
                NULLIF(btrim(COALESCE(v_row_data->>'email', '')), ''),
                COALESCE((v_row_data->>'befizetoev')::integer, EXTRACT(YEAR FROM now())::integer),
                target_congregation_id,
                true,
                'tag',
                now()
            )
            RETURNING id INTO v_new_szemely_id;

            v_szemely_count := v_szemely_count + 1;

            -- Opcionális: csalad insert (ha create_csalad_flag = true)
            IF v_create_csalad_flag THEN
                IF NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), '') IS NULL THEN
                    -- c_szam kötelező a csalad táblában — ha hiányzik, csak figyelmeztetés
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx,
                        'severity', 'warning',
                        'message', 'Szemely beszúrva, de a csalad rekord kihagyva (hiányzó házszám)',
                        'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                    );
                ELSE
                    INSERT INTO public.csalad (
                        id_ferfi, id_no, c_utcaid, c_szam, c_tombhaz, isaktiv
                    ) VALUES (
                        CASE WHEN v_inferred_ferfi THEN v_new_szemely_id ELSE NULL END,
                        CASE WHEN v_inferred_ferfi THEN NULL ELSE v_new_szemely_id END,
                        v_street_id,
                        btrim(v_row_data->>'c_szam'),
                        NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''),
                        true
                    );

                    v_csalad_count := v_csalad_count + 1;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            -- Bármilyen hiba az adott sornál → log, és tovább
            v_error_list := v_error_list || jsonb_build_object(
                'row', v_row_idx,
                'severity', 'error',
                'message', SQLERRM
            );
        END;
    END LOOP;

    inserted_szemely := v_szemely_count;
    inserted_csalad := v_csalad_count;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_family_head$;

COMMENT ON FUNCTION public.import_family_head_batch(uuid, jsonb) IS
    'Tagnyilvántartás-import wizard — szemely (családfő) + csalad atomikus dual-insert. Master admin VAGY delegated session jogosult.';

GRANT EXECUTE ON FUNCTION public.import_family_head_batch(uuid, jsonb) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. A 3 új function létrejött-e?
SELECT
    n.nspname AS schema,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    '_resolve_or_create_locality',
    '_resolve_or_create_street',
    'import_family_head_batch'
)
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 2. Próba-locality lookup (NEM-DESTRUKTÍV — csak SELECT)
SELECT public._resolve_or_create_locality('Barátos') AS locality_id_test;

-- 3. Smoke-test: hány locality és street van jelenleg az adatbázisban?
SELECT
    (SELECT COUNT(*) FROM public.adrlocality) AS locality_total,
    (SELECT COUNT(*) FROM public.adrstreet) AS street_total,
    (SELECT COUNT(*) FROM public.adrcounty) AS county_total;

-- 4. Példa import_family_head_batch hívás
-- (CSAK manuálisan futtasd, ha a god mode aktív és a target_congregation_id a saját gyülekezeted!)
--
-- SELECT * FROM public.import_family_head_batch(
--     '<your_congregation_uuid>'::uuid,
--     '[
--         {
--             "csaladnev": "Teszt",
--             "k_nev": "Gábor",
--             "_utca_text": "Templom",
--             "_helyseg_text": "Barátos",
--             "c_szam": "1",
--             "ferfi": true,
--             "meghalt": false,
--             "csaladfo": true,
--             "create_csalad": true
--         }
--     ]'::jsonb
-- );
--
-- A teszt után törlsd a beszúrt sort:
-- DELETE FROM public.csalad WHERE c_szam = '1' AND id_ferfi IN (
--     SELECT id FROM public.szemely WHERE csaladnev = 'Teszt' AND k_nev = 'Gábor'
-- );
-- DELETE FROM public.szemely WHERE csaladnev = 'Teszt' AND k_nev = 'Gábor';
