-- KARTOTEKA — import_family_head_batch RPC bővítés: locality-aware
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a locality-matching.sql után
--
-- Cél:
-- Az `import_family_head_batch` RPC mostantól fogad egy opcionális 3. paramétert:
--   `p_resolved_locality_map jsonb` — egy mapping: { "<helyseg_text>": <locality_id>, ... }
--
-- Ha a wizard "Helység-egyeztetés" lépésében a lelkész előre megfontolta egy
-- helységet (pl. "Barátos" → adrlocality.id=1234), az import ezt használja a
-- fuzzy `_resolve_or_create_locality()` helyett.
--
-- Ha a `_resolved_locality_map` üres / null / nincs benne a kulcs, a régi
-- viselkedés fut (fuzzy lookup vagy "Ismeretlen helység" fallback).
--
-- A street lookup is hasonlóan működhetne, de Endre döntése szerint
-- "az utca és házszám marad amit importált a lelkész" → utca-egyeztetés most nem
-- része a wizardnak. A street továbbra is fuzzy/create logikával fut.
--
-- Idempotens: CREATE OR REPLACE FUNCTION

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- _resolve_or_create_street — bővítés: opcionális p_locality_id_override
-- ────────────────────────────────────────────────────────────────────────────
--
-- Ha a hívó megadja a locality_id-t (a wizardban előzetesen megfontolt érték),
-- azt használja a `_resolve_or_create_locality()` fuzzy hívás helyett.

CREATE OR REPLACE FUNCTION public._resolve_or_create_street(
    street_name text,
    locality_name text,
    p_locality_id_override integer DEFAULT NULL
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
    IF street_name IS NULL OR btrim(street_name) = '' THEN
        v_cleaned_street := v_fallback_name;
    ELSE
        v_cleaned_street := btrim(street_name);
    END IF;

    -- Locality felbontás: PRIORITÁS az explicit override-nak (a wizard adja)
    IF p_locality_id_override IS NOT NULL THEN
        v_locality_id := p_locality_id_override;
    ELSE
        v_locality_id := public._resolve_or_create_locality(locality_name);
    END IF;

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

    IF v_locality_id IS NULL THEN
        v_locality_id := (SELECT id FROM public.adrlocality ORDER BY id LIMIT 1);
        IF v_locality_id IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    INSERT INTO public.adrstreet (name, postalcode, localityid, usagecnt)
    VALUES (v_cleaned_street, '', v_locality_id, 0)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$resolve_street$;

COMMENT ON FUNCTION public._resolve_or_create_street(text, text, integer) IS
    'Utca lookup. Opcionális p_locality_id_override → a hívó (pl. wizard) előre eldöntött locality_id-t adhat, ami felülírja a fuzzy locality lookup-ot.';

-- ────────────────────────────────────────────────────────────────────────────
-- import_family_head_batch — TELJES FELÜLÍRÁS, új paraméter
-- ────────────────────────────────────────────────────────────────────────────

-- Először töröljük a régi (2-paraméteres) változatot, hogy ne legyen polymorphism conflict
DROP FUNCTION IF EXISTS public.import_family_head_batch(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.import_family_head_batch(
    target_congregation_id uuid,
    rows jsonb,
    p_resolved_locality_map jsonb DEFAULT NULL
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
    v_error_list jsonb := '[]'::jsonb;
    v_szemely_count integer := 0;
    v_csalad_count integer := 0;
    v_create_csalad_flag boolean;
    v_explicit_ferfi text;
    v_inferred_ferfi boolean;
    v_inference_source text;
    v_helyseg_input text;
    v_resolved_locality_id integer;
BEGIN
    -- Jog-ellenőrzés
    IF v_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    v_is_master := EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = v_caller_user_id
          AND role = 'admin'
          AND scope = 'system'
          AND active = true
          AND approval_status = 'approved'
    );

    v_has_delegated := EXISTS(
        SELECT 1 FROM public.admin_access_requests
        WHERE admin_user_id = v_caller_user_id
          AND congregation_id = target_congregation_id
          AND status = 'approved'
          AND expires_at > now()
    );

    IF NOT v_is_master AND NOT v_has_delegated THEN
        RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', target_congregation_id;
    END IF;

    -- Sorok feldolgozása
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

            -- HELYSÉG-RESOLVÁLÁS: ha a wizard előre megfontolta, használjuk azt
            v_helyseg_input := NULLIF(btrim(COALESCE(v_row_data->>'_helyseg_text', '')), '');
            v_resolved_locality_id := NULL;

            IF p_resolved_locality_map IS NOT NULL AND v_helyseg_input IS NOT NULL THEN
                -- Megpróbáljuk a wizard-térképből (key=lowercase, normalizált)
                v_resolved_locality_id := (
                    p_resolved_locality_map->>(public.normalize_name(v_helyseg_input))
                )::integer;
            END IF;

            -- Utca lookup (a wizard-locality_id-vel ha van, különben fuzzy fallback)
            v_street_id := public._resolve_or_create_street(
                v_row_data->>'_utca_text',
                v_helyseg_input,
                v_resolved_locality_id
            );

            IF v_street_id IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'A rendszerben nincs egyetlen megye sem — utca-lookup lehetetlen'
                );
                CONTINUE;
            END IF;

            -- Egyházi CNP
            v_cnp_value := NULLIF(btrim(COALESCE(v_row_data->>'cnp', '')), '');
            IF v_cnp_value IS NULL THEN
                v_cnp_value := public.generate_egyhazi_cnp();
            ELSE
                v_cnp_value := substr(v_cnp_value, 1, 20);
            END IF;

            v_create_csalad_flag := COALESCE((v_row_data->>'create_csalad')::boolean, true);

            -- Smart gender inference
            v_explicit_ferfi := NULLIF(btrim(COALESCE(v_row_data->>'ferfi', '')), '');

            IF v_explicit_ferfi IS NOT NULL THEN
                v_inferred_ferfi := (v_row_data->>'ferfi')::boolean;
                v_inference_source := 'explicit';
            ELSIF NULLIF(btrim(COALESCE(v_row_data->>'ferjk_nev', '')), '') IS NOT NULL THEN
                v_inferred_ferfi := false;
                v_inference_source := 'spouse_field';
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'info',
                    'message', 'A "Férfi" mező hiányzott, de a "Férje" oszlop ki van töltve — automatikusan nő.',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
            ELSE
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
                apjaneve, anyjaneve, ferjk_nev,
                csaladfo, ferfi, meghalt,
                sz_datum, foglalkozas, vallas,
                c_utcaid, c_helysegid, c_szam, c_tombhaz, c_szcim,
                telefon, email,
                befizetoev,
                congregation_id, isvisible, type, created
            ) VALUES (
                v_cnp_value,
                substr(btrim(v_row_data->>'csaladnev'), 1, 30),
                substr(btrim(v_row_data->>'k_nev'), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'szcs_nev', '')), ''), 1, 100),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'allapot', '')), ''), 1, 10),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'namepattern', '')), ''), 1, 15),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'apjaneve', '')), ''), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'anyjaneve', '')), ''), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'ferjk_nev', '')), ''), 1, 25),
                COALESCE((v_row_data->>'csaladfo')::boolean, false),
                v_inferred_ferfi,
                COALESCE((v_row_data->>'meghalt')::boolean, false),
                NULLIF(v_row_data->>'sz_datum', '')::date,
                substr(NULLIF(btrim(COALESCE(v_row_data->>'foglalkozas', '')), ''), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'vallas', '')), ''), 1, 25),
                v_street_id,
                v_resolved_locality_id,  -- a wizard-eldöntött helység, ha van
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), ''), 1, 10),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''), 1, 5),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_szcim', '')), ''), 1, 80),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'telefon', '')), ''), 1, 50),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'email', '')), ''), 1, 50),
                COALESCE((v_row_data->>'befizetoev')::integer, EXTRACT(YEAR FROM now())::integer),
                target_congregation_id,
                true,
                'L',
                now()
            )
            RETURNING id INTO v_new_szemely_id;

            v_szemely_count := v_szemely_count + 1;

            -- Opcionális: csalad insert
            IF v_create_csalad_flag THEN
                IF NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), '') IS NULL THEN
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
                        substr(btrim(v_row_data->>'c_szam'), 1, 10),
                        substr(NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''), 1, 5),
                        true
                    );

                    v_csalad_count := v_csalad_count + 1;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
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

COMMENT ON FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb) IS
    'Tagnyilvántartás-import RPC. Új 3. paraméter: p_resolved_locality_map (a wizard "Helység-egyeztetés" lépésében előre megfontolt locality_id-k). Ha NULL, a régi fuzzy fallback fut.';

GRANT EXECUTE ON FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Új signature elérhető?
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('import_family_head_batch', '_resolve_or_create_street')
  AND n.nspname = 'public'
ORDER BY p.proname;
