-- KARTOTEKA — Utca-szintű postakód-egyeztetés (multi-postakódos nagyvárosok)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a locality-matching és
--           import-rpc-locality-aware után
--
-- Cél:
-- A wizard egy új ÁTUGORHATÓ lépést kap: "Utca-postakód-egyeztetés".
-- Csak akkor jelenik meg, ha az importban legalább 1 olyan helységű sor van,
-- amely "multi-postakódú nagyváros" (Bukarest, Kolozsvár, Marosvásárhely, stb.).
--
-- A multi-postakódot a Geonames `feature_code` alapján detektáljuk:
--   PPLC  — Capital (Bukarest)
--   PPLA  — First-order administrative center (megyei jogú város)
--   PPLA2 — Second-order admin center (kisebb városok)
--
-- Ha a lelkész MEGADJA az utca + postakódot (pl. "Bd. Magheru" → "010333"),
-- az `adrstreet.postalcode` mező frissül vagy új rekord jön létre a pontos
-- postakóddal. Ha üresen hagyja vagy átugorja, a default `adrlocality`
-- postakód fallback-ként marad (üres `adrstreet.postalcode`).
--
-- Új SQL elemek:
--   1. `is_multi_postalcode_locality(p_locality_id)` — bool, feature_code alapján
--   2. `find_streets_with_postalcode(p_locality_id, p_street_pattern)` — utca-keresés
--   3. `_resolve_or_create_street` bővítés — opcionális `p_postalcode_override`
--   4. `import_family_head_batch` bővítés — új paraméter `p_resolved_street_postalcodes`

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. is_multi_postalcode_locality(p_locality_id)
-- ────────────────────────────────────────────────────────────────────────────
--
-- TRUE ha a helység "nagyváros" (több postakóddal). Geonames feature_code:
--   - PPLC: Capital (országos főváros)
--   - PPLA: Adminisztratív központ (megyeszékhely)
--   - PPLA2: Másodlagos adminisztratív központ
--
-- Vagy: ha az `adrstreet` táblában már több különböző postakód található
-- ehhez a helységhez (>1 distinct postalcode).

CREATE OR REPLACE FUNCTION public.is_multi_postalcode_locality(p_locality_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $is_multi$
DECLARE
    v_feature_code text;
    v_distinct_postalcodes int;
BEGIN
    IF p_locality_id IS NULL THEN
        RETURN false;
    END IF;

    -- 1. Feature code check
    SELECT feature_code INTO v_feature_code
    FROM public.adrlocality WHERE id = p_locality_id;

    IF v_feature_code IN ('PPLC', 'PPLA', 'PPLA2') THEN
        RETURN true;
    END IF;

    -- 2. Distinct postalcode count az adrstreet-ben
    SELECT COUNT(DISTINCT postalcode) INTO v_distinct_postalcodes
    FROM public.adrstreet
    WHERE localityid = p_locality_id
      AND postalcode IS NOT NULL
      AND postalcode != '';

    RETURN COALESCE(v_distinct_postalcodes, 0) > 1;
END;
$is_multi$;

COMMENT ON FUNCTION public.is_multi_postalcode_locality(integer) IS
    'TRUE ha a helység "nagyváros" — Geonames feature_code (PPLC/PPLA/PPLA2) VAGY már több distinct postakód az adrstreet-ben.';

GRANT EXECUTE ON FUNCTION public.is_multi_postalcode_locality(integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. find_streets_with_postalcode — utca-keresés egy helységen belül
-- ────────────────────────────────────────────────────────────────────────────
--
-- A wizard "Utca-postakód-egyeztetés" lépésben autocomplete-ként használható:
-- a lelkész elkezdi gépelni az utcát, megjelenik a meglévő utcák listája
-- a hozzájuk tartozó postakóddal.

CREATE OR REPLACE FUNCTION public.find_streets_with_postalcode(
    p_locality_id integer,
    p_street_pattern text DEFAULT NULL,
    p_limit integer DEFAULT 20
) RETURNS TABLE(
    street_id integer,
    street_name text,
    postalcode text,
    similarity numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $find_streets$
DECLARE
    v_norm_pattern text;
BEGIN
    IF p_locality_id IS NULL THEN
        RETURN;
    END IF;

    v_norm_pattern := public.normalize_name(p_street_pattern);

    IF v_norm_pattern IS NULL THEN
        -- Csak listázzuk az utcákat (postakóddal)
        RETURN QUERY
        SELECT
            s.id::integer,
            s.name::text,
            s.postalcode,
            1.0::numeric
        FROM public.adrstreet s
        WHERE s.localityid = p_locality_id
        ORDER BY s.usagecnt DESC NULLS LAST, s.name
        LIMIT p_limit;
    ELSE
        -- Fuzzy match az utca névre
        RETURN QUERY
        SELECT
            s.id::integer,
            s.name::text,
            s.postalcode,
            public.similarity(public.normalize_name(s.name), v_norm_pattern)::numeric
        FROM public.adrstreet s
        WHERE s.localityid = p_locality_id
          AND (
              public.normalize_name(s.name) LIKE v_norm_pattern || '%'
              OR public.similarity(public.normalize_name(s.name), v_norm_pattern) >= 0.4
          )
        ORDER BY similarity DESC, s.usagecnt DESC NULLS LAST
        LIMIT p_limit;
    END IF;
END;
$find_streets$;

COMMENT ON FUNCTION public.find_streets_with_postalcode(integer, text, integer) IS
    'Utca-keresés egy helységen belül: prefix vagy fuzzy match a postakóddal együtt. Wizard autocomplete-hez.';

GRANT EXECUTE ON FUNCTION public.find_streets_with_postalcode(integer, text, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. _resolve_or_create_street — bővítés: opcionális p_postalcode_override
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._resolve_or_create_street(
    street_name text,
    locality_name text,
    p_locality_id_override integer DEFAULT NULL,
    p_postalcode_override text DEFAULT NULL
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
    v_clean_postalcode text;
BEGIN
    IF street_name IS NULL OR btrim(street_name) = '' THEN
        v_cleaned_street := v_fallback_name;
    ELSE
        v_cleaned_street := btrim(street_name);
    END IF;

    -- Locality felbontás (override-hoz előny)
    IF p_locality_id_override IS NOT NULL THEN
        v_locality_id := p_locality_id_override;
    ELSE
        v_locality_id := public._resolve_or_create_locality(locality_name);
    END IF;

    -- Postakód normalizálás (max 16 karakter — adrstreet.postalcode varchar(16))
    v_clean_postalcode := substr(NULLIF(btrim(COALESCE(p_postalcode_override, '')), ''), 1, 16);

    -- 1. Próba: ugyanaz a name + locality + postalcode
    IF v_locality_id IS NOT NULL THEN
        IF v_clean_postalcode IS NOT NULL THEN
            -- Pontos egyezés: name + locality + postalcode
            v_found_id := (
                SELECT id FROM public.adrstreet
                WHERE LOWER(name) = LOWER(v_cleaned_street)
                  AND localityid = v_locality_id
                  AND COALESCE(postalcode, '') = v_clean_postalcode
                LIMIT 1
            );

            IF v_found_id IS NOT NULL THEN
                RETURN v_found_id;
            END IF;

            -- 2. Próba: ugyanaz a name + locality, de még nincs postakódja → frissítjük
            UPDATE public.adrstreet
            SET postalcode = v_clean_postalcode
            WHERE LOWER(name) = LOWER(v_cleaned_street)
              AND localityid = v_locality_id
              AND (postalcode IS NULL OR postalcode = '')
            RETURNING id INTO v_found_id;

            IF v_found_id IS NOT NULL THEN
                RETURN v_found_id;
            END IF;
        ELSE
            -- Postakód NINCS megadva — csak name + locality
            v_found_id := (
                SELECT id FROM public.adrstreet
                WHERE LOWER(name) = LOWER(v_cleaned_street)
                  AND localityid = v_locality_id
                LIMIT 1
            );

            IF v_found_id IS NOT NULL THEN
                RETURN v_found_id;
            END IF;
        END IF;
    ELSE
        v_found_id := (
            SELECT id FROM public.adrstreet
            WHERE LOWER(name) = LOWER(v_cleaned_street)
            LIMIT 1
        );

        IF v_found_id IS NOT NULL THEN
            RETURN v_found_id;
        END IF;
    END IF;

    -- 3. Új utca beszúrás
    IF v_locality_id IS NULL THEN
        v_locality_id := (SELECT id FROM public.adrlocality ORDER BY id LIMIT 1);
        IF v_locality_id IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    INSERT INTO public.adrstreet (name, postalcode, localityid, usagecnt)
    VALUES (
        substr(v_cleaned_street, 1, 100),
        COALESCE(v_clean_postalcode, ''),
        v_locality_id,
        0
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$resolve_street$;

COMMENT ON FUNCTION public._resolve_or_create_street(text, text, integer, text) IS
    'Utca lookup. Új paraméterek: p_locality_id_override (a wizard-eldöntött helység), p_postalcode_override (a wizard-eldöntött postakód). Ha a meglévő utcának még nincs postakódja és kapunk egyet, frissítjük.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. import_family_head_batch — új paraméter: resolved_street_postalcodes
-- ────────────────────────────────────────────────────────────────────────────
--
-- Új paraméter: p_resolved_street_postalcodes jsonb
-- Formátum: { "<helyseg_normalized>|<utca_normalized>": "10333", ... }
-- Példa: { "bukarest|bd. magheru": "010333", "bukarest|str. ion mincu": "010234" }

DROP FUNCTION IF EXISTS public.import_family_head_batch(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.import_family_head_batch(
    target_congregation_id uuid,
    rows jsonb,
    p_resolved_locality_map jsonb DEFAULT NULL,
    p_resolved_street_postalcodes jsonb DEFAULT NULL
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
    v_utca_input text;
    v_resolved_locality_id integer;
    v_resolved_postalcode text;
    v_postalcode_key text;
BEGIN
    -- Jog-ellenőrzés
    IF v_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    v_is_master := EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = v_caller_user_id
          AND role = 'admin' AND scope = 'system'
          AND active = true AND approval_status = 'approved'
    );

    v_has_delegated := EXISTS(
        SELECT 1 FROM public.admin_access_requests
        WHERE admin_user_id = v_caller_user_id
          AND congregation_id = target_congregation_id
          AND status = 'approved' AND expires_at > now()
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

            -- HELYSÉG-RESOLVÁLÁS
            v_helyseg_input := NULLIF(btrim(COALESCE(v_row_data->>'_helyseg_text', '')), '');
            v_utca_input := NULLIF(btrim(COALESCE(v_row_data->>'_utca_text', '')), '');
            v_resolved_locality_id := NULL;
            v_resolved_postalcode := NULL;

            IF p_resolved_locality_map IS NOT NULL AND v_helyseg_input IS NOT NULL THEN
                v_resolved_locality_id := (
                    p_resolved_locality_map->>(public.normalize_name(v_helyseg_input))
                )::integer;
            END IF;

            -- POSTAKÓD-RESOLVÁLÁS (csak ha helység + utca van)
            IF p_resolved_street_postalcodes IS NOT NULL
               AND v_helyseg_input IS NOT NULL
               AND v_utca_input IS NOT NULL THEN
                -- Kulcs: "helyseg_normalized|utca_normalized"
                v_postalcode_key :=
                    public.normalize_name(v_helyseg_input) || '|' ||
                    public.normalize_name(v_utca_input);
                v_resolved_postalcode := p_resolved_street_postalcodes->>v_postalcode_key;
            END IF;

            -- Utca lookup
            v_street_id := public._resolve_or_create_street(
                v_utca_input,
                v_helyseg_input,
                v_resolved_locality_id,
                v_resolved_postalcode
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
                v_resolved_locality_id,
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

            -- csalad insert
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

COMMENT ON FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb, jsonb) IS
    'Tagnyilvántartás-import RPC. 4 paraméter: target_congregation_id, rows, p_resolved_locality_map (helység-egyeztetés), p_resolved_street_postalcodes (utca-postakód-egyeztetés). Mindkét map opcionális — ha NULL, fuzzy fallback fut.';

GRANT EXECUTE ON FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb, jsonb) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Új függvények
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'is_multi_postalcode_locality',
    'find_streets_with_postalcode',
    '_resolve_or_create_street',
    'import_family_head_batch'
)
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 2. Multi-postakódú helységek statisztika (mennyi nagyváros van Romániában?)
SELECT
    feature_code,
    COUNT(*) AS db
FROM public.adrlocality
WHERE feature_code IN ('PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPL')
GROUP BY feature_code
ORDER BY feature_code;

-- 3. Bukarest detektálva-e mint multi-postakódos?
SELECT
    l.id, l.name, l.name_hu, l.feature_code,
    public.is_multi_postalcode_locality(l.id) AS is_multi_postal
FROM public.adrlocality l
WHERE LOWER(l.name) LIKE 'bucur%' OR LOWER(l.name_hu) = 'bukarest'
LIMIT 5;

-- 4. Próba: utca-keresés Bukarestben (ha vannak utcák)
-- SELECT * FROM public.find_streets_with_postalcode(
--     (SELECT id FROM public.adrlocality WHERE LOWER(name) LIKE 'bucur%' LIMIT 1),
--     'magheru'
-- );
