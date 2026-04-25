-- KARTOTEKA — Helység-egyeztetés (locality matching) az import wizardban
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a cross-congregation-matching.sql után
--
-- Cél:
-- 1. `find_locality_match(input, country_code)` RPC — fuzzy lookup a
--    `adrlocality` táblában (12856 rekord) + `adrlocality_alias`-ban.
--    Visszaad 4 confidence szintet: 'exact_hu', 'exact_ro', 'exact_name', 'alias', 'fuzzy'.
-- 2. `add_locality_for_review(name, county_id, country_id)` RPC — új helység
--    beszúrása, jelölve `needs_review=true`-val. Az admin panelben listázódik.
-- 3. `adrlocality.needs_review` boolean oszlop (default false) + index.
-- 4. `pg_trgm` extension (fuzzy search-hez).
--
-- Idempotens: CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. pg_trgm extension (trigram-alapú fuzzy similarity)
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. adrlocality.needs_review oszlop (importból érkező felülvizsgálandó rekord)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.adrlocality
    ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.adrlocality
    ADD COLUMN IF NOT EXISTS review_source text;  -- pl. 'tagnyilvantartas-import-2026-04-26'

CREATE INDEX IF NOT EXISTS idx_adrlocality_needs_review
    ON public.adrlocality(needs_review) WHERE needs_review = true;

COMMENT ON COLUMN public.adrlocality.needs_review IS
    'TRUE ha az import wizard hozta létre, mert a lelkész nem találta meg a meglévő helységek között. Az admin felülvizsgálatra vár.';

COMMENT ON COLUMN public.adrlocality.review_source IS
    'Honnan került be a needs_review=true rekord (audit nyom).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. find_locality_match RPC
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemenet:
--   p_input — a lelkész által beírt helység-név (pl. "Barátos")
--   p_country_code — opcionális országkód (default 'RO' = Románia)
--   p_min_similarity — fuzzy küszöb (default 0.6 — konzervatív)
--
-- Kimenet (TABLE):
--   locality_id, name, name_hu, name_ro,
--   county_id, county_name, country_id, country_name,
--   default_postalcode, siruta_code,
--   match_type ('exact_hu' | 'exact_ro' | 'exact_name' | 'alias' | 'fuzzy'),
--   similarity (0.0 - 1.0)
--
-- Sorrend:
--   1. Exact match name_hu / name_ro / name (similarity = 1.0)
--   2. Alias match (similarity = 0.95)
--   3. Fuzzy match (similarity ≥ p_min_similarity, max 5 jelölt)
--
-- A találatok DISTINCT ON (locality_id) — egy helység csak egyszer szerepel,
-- a legmagasabb confidence-szel.

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

    -- Country lookup (opcionális szűrő)
    IF p_country_code IS NOT NULL THEN
        SELECT id INTO v_country_id
        FROM public.adrcountry
        WHERE LOWER(sname) = LOWER(p_country_code)
           OR LOWER(name) = LOWER(p_country_code)
        LIMIT 1;
    END IF;

    -- 1. EXACT match (name_hu, name_ro, name) — similarity = 1.0
    RETURN QUERY
    SELECT DISTINCT ON (l.id)
        l.id::integer,
        l.name::text,
        l.name_hu,
        l.name_ro,
        c.id::integer AS county_id,
        c.name::text AS county_name,
        co.id::integer AS country_id,
        co.name::text AS country_name,
        l.default_postalcode,
        l.siruta_code,
        CASE
            WHEN public.normalize_name(l.name_hu) = v_norm_input THEN 'exact_hu'
            WHEN public.normalize_name(l.name_ro) = v_norm_input THEN 'exact_ro'
            ELSE 'exact_name'
        END::text AS match_type,
        1.0::numeric AS similarity
    FROM public.adrlocality l
    JOIN public.adrcounty c ON c.id = l.countyid
    JOIN public.adrcountry co ON co.id = c.countryid
    WHERE
        (v_country_id IS NULL OR co.id = v_country_id)
        AND l.needs_review = false  -- ne ajánljunk felülvizsgálatlan rekordot
        AND (
            public.normalize_name(l.name_hu) = v_norm_input
            OR public.normalize_name(l.name_ro) = v_norm_input
            OR public.normalize_name(l.name) = v_norm_input
        )
    ORDER BY l.id, l.usagecnt DESC NULLS LAST;

    -- Ha exact volt, ne menjünk tovább
    IF FOUND THEN
        RETURN;
    END IF;

    -- 2. ALIAS match (similarity = 0.95)
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

    -- 3. FUZZY match (pg_trgm similarity ≥ küszöb, max 5 jelölt)
    -- A `set_limit()` állítja be a globális küszöböt; itt explicit használjuk a
    -- `similarity()` függvényt, hogy konkrét értéket kapjunk vissza.
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
        )::numeric AS similarity
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
    ORDER BY l.id, similarity DESC, l.usagecnt DESC NULLS LAST
    LIMIT 5;
END;
$find_locality$;

COMMENT ON FUNCTION public.find_locality_match(text, text, numeric) IS
    'Helység-egyeztetés a wizardban. 3 lépcsős keresés: 1. exact (name_hu/ro/name), 2. alias, 3. fuzzy (pg_trgm, küszöb default 0.6). Max 5 jelölt fuzzy esetén.';

GRANT EXECUTE ON FUNCTION public.find_locality_match(text, text, numeric) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. add_locality_for_review RPC
-- ────────────────────────────────────────────────────────────────────────────
--
-- Az import wizardban a lelkész egy új helységet ad meg, amit nem találtunk meg.
-- Ezt beszúrjuk az adrlocality táblába `needs_review=true` jelöléssel.
-- Az admin panel listázza, és a master admin később ellenőrzi/megerősíti.
--
-- Bemenet:
--   p_name — a helység neve (pl. "Barátosfalva")
--   p_county_id — opcionális megye (ha a lelkész tudja)
--   p_country_code — ország (default 'RO')
--   p_review_source — audit nyom (pl. 'tagnyilvantartas-import-2026-04-26')

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

    v_clean_name := substr(btrim(p_name), 1, 100);  -- adrlocality.name varchar(100)

    -- Megye lookup ha nincs explicit (default county a megadott országban)
    IF v_resolved_county_id IS NULL THEN
        -- Country lookup
        SELECT id INTO v_country_id
        FROM public.adrcountry
        WHERE LOWER(sname) = LOWER(COALESCE(p_country_code, 'RO'))
           OR LOWER(name) = LOWER(COALESCE(p_country_code, 'RO'))
        LIMIT 1;

        -- Default megye az adott országban (Kovászna ha RO)
        IF v_country_id IS NOT NULL THEN
            SELECT id INTO v_resolved_county_id
            FROM public.adrcounty
            WHERE countryid = v_country_id
              AND (LOWER(name) LIKE '%kov%' OR LOWER(sname) = 'cv')
            LIMIT 1;

            IF v_resolved_county_id IS NULL THEN
                SELECT id INTO v_resolved_county_id
                FROM public.adrcounty
                WHERE countryid = v_country_id
                ORDER BY id LIMIT 1;
            END IF;
        END IF;

        IF v_resolved_county_id IS NULL THEN
            RAISE EXCEPTION 'Nem található megye a megadott országhoz: %', p_country_code;
        END IF;
    END IF;

    -- INSERT új locality `needs_review=true`
    INSERT INTO public.adrlocality (name, code, countyid, usagecnt, needs_review, review_source)
    VALUES (v_clean_name, '', v_resolved_county_id, 0, true, p_review_source)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$add_locality$;

COMMENT ON FUNCTION public.add_locality_for_review(text, integer, text, text) IS
    'Új helység beszúrása `needs_review=true` jelöléssel — az admin panel listázza, master admin megerősíti.';

GRANT EXECUTE ON FUNCTION public.add_locality_for_review(text, integer, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. list_localities_pending_review (admin panel nézet)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_localities_pending_review(
    p_limit integer DEFAULT 100
) RETURNS TABLE(
    locality_id integer,
    name text,
    county_name text,
    country_name text,
    review_source text,
    usagecnt integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $list_pending$
    SELECT
        l.id::integer,
        l.name::text,
        c.name::text,
        co.name::text,
        l.review_source,
        l.usagecnt
    FROM public.adrlocality l
    JOIN public.adrcounty c ON c.id = l.countyid
    JOIN public.adrcountry co ON co.id = c.countryid
    WHERE l.needs_review = true
    ORDER BY l.id DESC
    LIMIT p_limit;
$list_pending$;

GRANT EXECUTE ON FUNCTION public.list_localities_pending_review(integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. confirm_locality_review (admin döntés)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_locality_review(
    p_locality_id integer,
    p_action text,  -- 'confirm' (jóváhagy) | 'merge_with' | 'delete'
    p_merge_target_id integer DEFAULT NULL  -- csak merge_with esetén
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $confirm_locality$
DECLARE
    v_caller uuid := auth.uid();
    v_is_master boolean;
    v_affected int := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    -- Csak master admin
    SELECT EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = v_caller
          AND role = 'admin' AND scope = 'system'
          AND active = true AND approval_status = 'approved'
    ) INTO v_is_master;

    IF NOT v_is_master THEN
        RAISE EXCEPTION 'Csak rendszergazda végezhet helység-jóváhagyást.';
    END IF;

    IF p_action = 'confirm' THEN
        UPDATE public.adrlocality
        SET needs_review = false, review_source = NULL
        WHERE id = p_locality_id AND needs_review = true;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
    ELSIF p_action = 'merge_with' AND p_merge_target_id IS NOT NULL THEN
        -- Minden szemely / csalad / adrstreet ami a felülvizsgálandó locality-re mutat,
        -- átirányítódik a merge target-re. Aztán a felülvizsgálandó locality törlődik.
        UPDATE public.szemely SET sz_helyid = p_merge_target_id WHERE sz_helyid = p_locality_id;
        UPDATE public.szemely SET c_helysegid = p_merge_target_id WHERE c_helysegid = p_locality_id;
        UPDATE public.adrstreet SET localityid = p_merge_target_id WHERE localityid = p_locality_id;
        DELETE FROM public.adrlocality WHERE id = p_locality_id AND needs_review = true;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
    ELSIF p_action = 'delete' THEN
        -- Csak akkor törölhető, ha nincs FK hivatkozás rá
        DELETE FROM public.adrlocality WHERE id = p_locality_id AND needs_review = true;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'Érvénytelen action: %. Használható: confirm, merge_with, delete', p_action;
    END IF;

    RETURN jsonb_build_object(
        'success', v_affected > 0,
        'affected', v_affected,
        'action', p_action
    );
END;
$confirm_locality$;

GRANT EXECUTE ON FUNCTION public.confirm_locality_review(integer, text, integer) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. pg_trgm extension aktív?
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';

-- 2. needs_review oszlop hozzáadva?
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'adrlocality'
  AND column_name IN ('needs_review', 'review_source');

-- 3. Új függvények létrejöttek?
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'find_locality_match',
    'add_locality_for_review',
    'list_localities_pending_review',
    'confirm_locality_review'
)
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 4. FUZZY teszt — "Barátos" exact match (Endre eredeti példája)
SELECT * FROM public.find_locality_match('Barátos', 'RO', 0.6);

-- 5. FUZZY teszt — "Baráos" elütés, fuzzy match (Endre eredeti példája)
SELECT * FROM public.find_locality_match('Baráos', 'RO', 0.6);

-- 6. FUZZY teszt — "Sepsiszentgyörgy" exact
SELECT * FROM public.find_locality_match('Sepsiszentgyörgy', 'RO', 0.6);

-- 7. FUZZY teszt — random "Bukarestxx" külföld? (NEM, mert RO-ra szűrt)
SELECT * FROM public.find_locality_match('Bukarestxx', 'RO', 0.6);
