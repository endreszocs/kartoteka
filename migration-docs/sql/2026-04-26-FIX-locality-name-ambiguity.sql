-- KARTOTEKA HOTFIX — find_locality_match + add_locality_for_review name ambiguity
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a 2026-04-26-locality-matching.sql UTÁN
--
-- Hiba diagnózis:
-- A `find_locality_match` függvény RETURNS TABLE(... name text, ...)-ja egy
-- `name` mezőt deklarál function-scope-ban. Amikor a country lookup belül
-- `LOWER(name)`-re hivatkozik, a Postgres NEM tudja, hogy a return-table
-- `name` oszlopa-e vagy az `adrcountry.name` oszlopa → 42702 ambiguous error.
--
-- Megoldás:
--   - Country lookup queries kapnak explicit alias-t (`c2`, `co`)
--   - Minden table-oszlopra explicit prefix
--
-- Idempotens: CREATE OR REPLACE FUNCTION

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- find_locality_match — JAVÍTOTT (country lookup alias-szal)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_locality_match(
    p_input text,
    p_country_code text DEFAULT 'RO',
    p_min_similarity numeric DEFAULT 0.6
) RETURNS TABLE(
    locality_id integer,
    name text,
    name_hu text,
    name_ro text,
    county_id integer,
    county_name text,
    country_id integer,
    country_name text,
    default_postalcode text,
    siruta_code text,
    match_type text,
    similarity numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $find_locality$
DECLARE
    v_norm_input text;
    v_country_id integer;
BEGIN
    IF p_input IS NULL OR btrim(p_input) = '' THEN
        RETURN;
    END IF;

    v_norm_input := public.normalize_name(p_input);

    -- Country lookup (EXPLICIT ALIAS hogy ne legyen ambiguity a return-table 'name'-mel)
    IF p_country_code IS NOT NULL THEN
        SELECT co_lookup.id INTO v_country_id
        FROM public.adrcountry co_lookup
        WHERE LOWER(co_lookup.sname) = LOWER(p_country_code)
           OR LOWER(co_lookup.name) = LOWER(p_country_code)
        LIMIT 1;
    END IF;

    -- 1. EXACT match
    RETURN QUERY
    SELECT DISTINCT ON (l.id)
        l.id::integer,
        l.name::text,
        l.name_hu,
        l.name_ro,
        c.id::integer,
        c.name::text,
        co.id::integer,
        co.name::text,
        l.default_postalcode,
        l.siruta_code,
        CASE
            WHEN public.normalize_name(l.name_hu) = v_norm_input THEN 'exact_hu'
            WHEN public.normalize_name(l.name_ro) = v_norm_input THEN 'exact_ro'
            ELSE 'exact_name'
        END::text,
        1.0::numeric
    FROM public.adrlocality l
    JOIN public.adrcounty c ON c.id = l.countyid
    JOIN public.adrcountry co ON co.id = c.countryid
    WHERE
        (v_country_id IS NULL OR co.id = v_country_id)
        AND l.needs_review = false
        AND (
            public.normalize_name(l.name_hu) = v_norm_input
            OR public.normalize_name(l.name_ro) = v_norm_input
            OR public.normalize_name(l.name) = v_norm_input
        )
    ORDER BY l.id, l.usagecnt DESC NULLS LAST;

    IF FOUND THEN
        RETURN;
    END IF;

    -- 2. ALIAS match
    RETURN QUERY
    SELECT DISTINCT ON (l.id)
        l.id::integer,
        l.name::text,
        l.name_hu,
        l.name_ro,
        c.id::integer,
        c.name::text,
        co.id::integer,
        co.name::text,
        l.default_postalcode,
        l.siruta_code,
        'alias'::text,
        0.95::numeric
    FROM public.adrlocality_alias a
    JOIN public.adrlocality l ON l.id = a.adrlocality_id
    JOIN public.adrcounty c ON c.id = l.countyid
    JOIN public.adrcountry co ON co.id = c.countryid
    WHERE
        (v_country_id IS NULL OR co.id = v_country_id)
        AND l.needs_review = false
        AND public.normalize_name(a.alias_name) = v_norm_input
    ORDER BY l.id, l.usagecnt DESC NULLS LAST;

    IF FOUND THEN
        RETURN;
    END IF;

    -- 3. FUZZY match (pg_trgm)
    RETURN QUERY
    SELECT DISTINCT ON (l.id)
        l.id::integer,
        l.name::text,
        l.name_hu,
        l.name_ro,
        c.id::integer,
        c.name::text,
        co.id::integer,
        co.name::text,
        l.default_postalcode,
        l.siruta_code,
        'fuzzy'::text,
        GREATEST(
            COALESCE(public.similarity(public.normalize_name(l.name_hu), v_norm_input), 0),
            COALESCE(public.similarity(public.normalize_name(l.name_ro), v_norm_input), 0),
            COALESCE(public.similarity(public.normalize_name(l.name), v_norm_input), 0)
        )::numeric
    FROM public.adrlocality l
    JOIN public.adrcounty c ON c.id = l.countyid
    JOIN public.adrcountry co ON co.id = c.countryid
    WHERE
        (v_country_id IS NULL OR co.id = v_country_id)
        AND l.needs_review = false
        AND (
            public.similarity(public.normalize_name(l.name_hu), v_norm_input) >= p_min_similarity
            OR public.similarity(public.normalize_name(l.name_ro), v_norm_input) >= p_min_similarity
            OR public.similarity(public.normalize_name(l.name), v_norm_input) >= p_min_similarity
        )
    ORDER BY
        l.id,
        GREATEST(
            COALESCE(public.similarity(public.normalize_name(l.name_hu), v_norm_input), 0),
            COALESCE(public.similarity(public.normalize_name(l.name_ro), v_norm_input), 0),
            COALESCE(public.similarity(public.normalize_name(l.name), v_norm_input), 0)
        ) DESC,
        l.usagecnt DESC NULLS LAST
    LIMIT 5;
END;
$find_locality$;

COMMENT ON FUNCTION public.find_locality_match(text, text, numeric) IS
    'Helység-egyeztetés a wizardban. Country lookup explicit alias-szal (`co_lookup`) — elkerüli az ambiguity-t a return-table `name` mezőjével.';

-- ────────────────────────────────────────────────────────────────────────────
-- add_locality_for_review — preventív javítás (country lookup explicit alias)
-- ────────────────────────────────────────────────────────────────────────────
-- Ennek nem return-TABLE-ja van, de a biztonság kedvéért szintén alias-szal:

CREATE OR REPLACE FUNCTION public.add_locality_for_review(
    p_name text,
    p_county_id integer DEFAULT NULL,
    p_country_code text DEFAULT 'RO',
    p_review_source text DEFAULT 'manual'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $add_locality$
DECLARE
    v_caller uuid := auth.uid();
    v_country_id integer;
    v_resolved_county_id integer := p_county_id;
    v_new_id integer;
    v_clean_name text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Hiányzó helység-név.';
    END IF;

    v_clean_name := substr(btrim(p_name), 1, 100);

    IF v_resolved_county_id IS NULL THEN
        -- Country lookup explicit alias
        SELECT co_lookup.id INTO v_country_id
        FROM public.adrcountry co_lookup
        WHERE LOWER(co_lookup.sname) = LOWER(COALESCE(p_country_code, 'RO'))
           OR LOWER(co_lookup.name) = LOWER(COALESCE(p_country_code, 'RO'))
        LIMIT 1;

        IF v_country_id IS NOT NULL THEN
            -- Default megye (Kovászna ha RO)
            SELECT cnty.id INTO v_resolved_county_id
            FROM public.adrcounty cnty
            WHERE cnty.countryid = v_country_id
              AND (LOWER(cnty.name) LIKE '%kov%' OR LOWER(cnty.sname) = 'cv')
            LIMIT 1;

            IF v_resolved_county_id IS NULL THEN
                SELECT cnty.id INTO v_resolved_county_id
                FROM public.adrcounty cnty
                WHERE cnty.countryid = v_country_id
                ORDER BY cnty.id LIMIT 1;
            END IF;
        END IF;

        IF v_resolved_county_id IS NULL THEN
            RAISE EXCEPTION 'Nem található megye a megadott országhoz: %', p_country_code;
        END IF;
    END IF;

    INSERT INTO public.adrlocality (name, code, countyid, usagecnt, needs_review, review_source)
    VALUES (v_clean_name, '', v_resolved_county_id, 0, true, p_review_source)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$add_locality$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. find_locality_match teszt — Endre eredeti példája "Barátos"
SELECT * FROM public.find_locality_match('Barátos', 'RO', 0.6);

-- 2. find_locality_match teszt — elütés "Baráos"
SELECT * FROM public.find_locality_match('Baráos', 'RO', 0.6);

-- 3. find_locality_match teszt — másik nagyváros "Sepsiszentgyörgy"
SELECT * FROM public.find_locality_match('Sepsiszentgyörgy', 'RO', 0.6);

-- 4. find_locality_match teszt — Bukarest (multi-postakódos detektáció)
SELECT * FROM public.find_locality_match('Bukarest', 'RO', 0.6);

-- 5. find_locality_match teszt — random külföldi városnév (NEM RO)
-- Nincs találat — várt eredmény: 0 sor
SELECT * FROM public.find_locality_match('Budapest', 'RO', 0.6);

-- 6. find_locality_match teszt — Budapest, ország nélkül (országkód NULL → mindenből keres)
SELECT * FROM public.find_locality_match('Budapest', NULL, 0.6);
