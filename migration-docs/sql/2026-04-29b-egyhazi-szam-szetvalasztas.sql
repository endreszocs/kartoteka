-- KARTOTEKA — Állami vs egyházi anyakönyvi szám szétválasztása
-- Dátum: 2026-04-29 (b — második a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre javítása):
-- A 2026-04-29-i első migráció HIBÁS volt: az új generált egyházi
-- anyakönyvi számot (YYYYTTNNNN) az `okirat` (és `hlevel`, `igazolas`) mezőbe
-- írta. De az `okirat` mező ELEDLEG az ÁLLAMI anyakönyvi számot tárolja
-- (Magyar állam adja a születési anyakönyv alapján — pl. 418467, 297301).
--
-- HELYES SZERKEZET (Endre kérése):
--   - okirat        = ÁLLAMI anyakönyvi szám (a magyar állam adja)
--   - egyhazi_szam  = EGYHÁZI anyakönyvi szám (gyülekezet generálja, YYYYTTNNNN)
--   (hasonlóan: hlevel = állami, egyhazi_szam = egyházi az esketéseknél)
--
-- Ez a migration:
--   1. ADD COLUMN egyhazi_szam minden anyakönyvi táblához
--   2. UNDO: a 04-29-i hibás backfill visszavonása (csak az újonnan beírt
--      YYYYTTNNNN formátumúak — az eredeti állami számokat NEM bántjuk)
--   3. Új backfill: az egyhazi_szam mezőbe írunk minden rekordhoz
--      (gyülekezetenként + típusonként + évenként újraszámolt sorszám)
--   4. import_registry_batch: az új generált szám az egyhazi_szam mezőbe megy,
--      az állami szám (okirat / hlevel / igazolas) érintetlen marad
--   5. generate_egyhazi_anyakonyvi_szam: új mezőből számoljon

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. egyhazi_szam oszlop hozzáadása minden anyakönyvi táblához
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.keresztseg   ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.konfirmalas  ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.hazassag     ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.temetes      ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.bekoltozott  ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.elkoltozott  ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.attert       ADD COLUMN IF NOT EXISTS egyhazi_szam text;
ALTER TABLE public.kitert       ADD COLUMN IF NOT EXISTS egyhazi_szam text;

COMMENT ON COLUMN public.keresztseg.egyhazi_szam   IS 'Egyházi anyakönyvi szám (YYYYTTNNNN). Az okirat mező az ÁLLAMI számot tárolja. 2026-04-29.';
COMMENT ON COLUMN public.konfirmalas.egyhazi_szam  IS 'Egyházi anyakönyvi szám (YYYY02NNNN).';
COMMENT ON COLUMN public.hazassag.egyhazi_szam     IS 'Egyházi anyakönyvi szám (YYYY03NNNN). A hlevel az ÁLLAMI házassági levél száma.';
COMMENT ON COLUMN public.temetes.egyhazi_szam      IS 'Egyházi anyakönyvi szám (YYYY04NNNN).';
COMMENT ON COLUMN public.bekoltozott.egyhazi_szam  IS 'Egyházi anyakönyvi szám (YYYY05NNNN).';
COMMENT ON COLUMN public.elkoltozott.egyhazi_szam  IS 'Egyházi anyakönyvi szám (YYYY06NNNN).';
COMMENT ON COLUMN public.attert.egyhazi_szam       IS 'Egyházi anyakönyvi szám (YYYY07NNNN).';
COMMENT ON COLUMN public.kitert.egyhazi_szam       IS 'Egyházi anyakönyvi szám (YYYY08NNNN).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. UNDO — a 04-29-i hibás backfill visszavonása
-- ════════════════════════════════════════════════════════════════════════════
--
-- A 04-29-i első migráció a YYYYTTNNNN formátumú generált számot beleírta az
-- okirat / hlevel / igazolas mezőkbe, ahol azok üresek voltak.
-- Most VISSZAÁLLÍTJUK NULL-ra, csakis ahol:
--   - PONTOSAN 10 karakter hosszú
--   - Számjegyekből áll
--   - A 5-6. pozíción a típuskód (01-08) van, és illeszkedik az adott táblához
--
-- Ez a minta nagyon specifikus → kicsi az esélye, hogy egy igazi állami szám
-- pontosan így nézne ki. (Az állami számok pl. 418467, 297301, 304955, SZ09130472
-- formátumúak — nem 10-jegyű és nem ezzel a típuskód-mintával.)

-- KERESZTSEG: visszaállítjuk azokat az okirat-okat, amik 'YYYY01NNNN' mintát követnek
UPDATE public.keresztseg
SET okirat = NULL
WHERE okirat ~ '^[0-9]{4}01[0-9]{4}$'
  AND substring(okirat from 1 for 4)::integer BETWEEN 2000 AND 2099;

-- KONFIRMALAS: 'YYYY02NNNN'
UPDATE public.konfirmalas
SET okirat = NULL
WHERE okirat ~ '^[0-9]{4}02[0-9]{4}$'
  AND substring(okirat from 1 for 4)::integer BETWEEN 2000 AND 2099;

-- HAZASSAG: 'YYYY03NNNN' (a hlevel mezőben)
UPDATE public.hazassag
SET hlevel = NULL
WHERE hlevel ~ '^[0-9]{4}03[0-9]{4}$'
  AND substring(hlevel from 1 for 4)::integer BETWEEN 2000 AND 2099;

-- TEMETES: 'YYYY04NNNN'
UPDATE public.temetes
SET okirat = NULL
WHERE okirat ~ '^[0-9]{4}04[0-9]{4}$'
  AND substring(okirat from 1 for 4)::integer BETWEEN 2000 AND 2099;

-- BEKOLTOZOTT: 'YYYY05NNNN' (igazolas mezőben)
UPDATE public.bekoltozott
SET igazolas = NULL
WHERE igazolas ~ '^[0-9]{4}05[0-9]{4}$'
  AND substring(igazolas from 1 for 4)::integer BETWEEN 2000 AND 2099;

-- ATTERT: 'YYYY07NNNN' (igazolas mezőben)
UPDATE public.attert
SET igazolas = NULL
WHERE igazolas ~ '^[0-9]{4}07[0-9]{4}$'
  AND substring(igazolas from 1 for 4)::integer BETWEEN 2000 AND 2099;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ÚJ BACKFILL — minden rekordnak egyházi_szam (gyülekezetenként + évenként)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Az új mezőbe most minden meglevő rekord kap egyházi anyakönyvi számot,
-- gyülekezetenként + típusonként + évenként újraszámolt sorszámmal,
-- datum szerint növekvő sorrendben.

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM datum)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM datum)::integer ORDER BY datum ASC, id ASC) AS seq
    FROM public.keresztseg
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND datum IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.keresztseg k
SET egyhazi_szam = ranked.year::text || '01' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE k.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM datum)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM datum)::integer ORDER BY datum ASC, id ASC) AS seq
    FROM public.konfirmalas
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND datum IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.konfirmalas k
SET egyhazi_szam = ranked.year::text || '02' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE k.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM datum)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM datum)::integer ORDER BY datum ASC, id ASC) AS seq
    FROM public.hazassag
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND datum IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.hazassag h
SET egyhazi_szam = ranked.year::text || '03' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE h.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM tdatum)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM tdatum)::integer ORDER BY tdatum ASC, id ASC) AS seq
    FROM public.temetes
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND tdatum IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.temetes t
SET egyhazi_szam = ranked.year::text || '04' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE t.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM mikor)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM mikor)::integer ORDER BY mikor ASC, id ASC) AS seq
    FROM public.bekoltozott
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND mikor IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.bekoltozott b
SET egyhazi_szam = ranked.year::text || '05' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE b.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM mikor)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM mikor)::integer ORDER BY mikor ASC, id ASC) AS seq
    FROM public.elkoltozott
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND mikor IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.elkoltozott e
SET egyhazi_szam = ranked.year::text || '06' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE e.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM mikor)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM mikor)::integer ORDER BY mikor ASC, id ASC) AS seq
    FROM public.attert
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND mikor IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.attert a
SET egyhazi_szam = ranked.year::text || '07' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE a.id = ranked.id;

WITH ranked AS (
    SELECT id, congregation_id, EXTRACT(YEAR FROM mikor)::integer AS year,
        ROW_NUMBER() OVER (PARTITION BY congregation_id, EXTRACT(YEAR FROM mikor)::integer ORDER BY mikor ASC, id ASC) AS seq
    FROM public.kitert
    WHERE (egyhazi_szam IS NULL OR trim(egyhazi_szam) = '')
      AND mikor IS NOT NULL AND congregation_id IS NOT NULL
)
UPDATE public.kitert ki
SET egyhazi_szam = ranked.year::text || '08' || lpad(ranked.seq::text, 4, '0')
FROM ranked WHERE ki.id = ranked.id;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. generate_egyhazi_anyakonyvi_szam — most az egyhazi_szam mezőből számol
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_egyhazi_anyakonyvi_szam(
    p_target_congregation_id uuid,
    p_profile_key text,
    p_year integer DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $generate_szam$
DECLARE
    v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
    v_type_code text;
    v_table text;
    v_max_seq integer := 0;
    v_next_seq integer;
    v_year_prefix text;
    v_pattern text;
    v_query text;
BEGIN
    CASE p_profile_key
        WHEN 'baptism'              THEN v_type_code := '01'; v_table := 'keresztseg';
        WHEN 'confirmation'         THEN v_type_code := '02'; v_table := 'konfirmalas';
        WHEN 'marriage'             THEN v_type_code := '03'; v_table := 'hazassag';
        WHEN 'burial'               THEN v_type_code := '04'; v_table := 'temetes';
        WHEN 'movement_bekoltozott' THEN v_type_code := '05'; v_table := 'bekoltozott';
        WHEN 'movement_elkoltozott' THEN v_type_code := '06'; v_table := 'elkoltozott';
        WHEN 'movement_attert'      THEN v_type_code := '07'; v_table := 'attert';
        WHEN 'movement_kitert'      THEN v_type_code := '08'; v_table := 'kitert';
        ELSE
            RAISE EXCEPTION 'Érvénytelen profile_key: %', p_profile_key;
    END CASE;

    v_year_prefix := v_year::text || v_type_code;
    v_pattern := v_year_prefix || '____';

    -- Most már minden táblának van egyhazi_szam mezője
    v_query := format(
        'SELECT COALESCE(MAX(SUBSTRING(egyhazi_szam FROM 7 FOR 4)::integer), 0) FROM public.%I WHERE egyhazi_szam LIKE $1 AND congregation_id = $2',
        v_table
    );
    EXECUTE v_query INTO v_max_seq USING v_pattern, p_target_congregation_id;

    v_next_seq := v_max_seq + 1;
    IF v_next_seq > 9999 THEN
        RAISE EXCEPTION 'Túl sok bejegyzés egy évben (>9999) — formátum-túlcsordulás.';
    END IF;

    RETURN v_year_prefix || lpad(v_next_seq::text, 4, '0');
END;
$generate_szam$;

GRANT EXECUTE ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. import_registry_batch — egyhazi_szam mezőbe írja az új generált számot
-- ════════════════════════════════════════════════════════════════════════════
--
-- Most szétválik:
--   - okirat / hlevel / igazolas: az XML-ből jön (ÁLLAMI szám), érintetlen
--   - egyhazi_szam: ha üres → auto-generálódik (EGYHÁZI szám)

CREATE OR REPLACE FUNCTION public.import_registry_batch(
    p_target_congregation_id uuid,
    p_profile_key text,
    p_rows jsonb,
    p_default_munkanaploba boolean DEFAULT false
) RETURNS TABLE(inserted_count integer, skipped_count integer, errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $import_registry$
DECLARE
    v_caller uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_studio_bypass boolean := false;
    v_row jsonb;
    v_row_idx integer := 0;
    v_inserted integer := 0;
    v_skipped integer := 0;
    v_error_list jsonb := '[]'::jsonb;
    v_baptism_stub jsonb;
    v_baptism_id integer;
    v_egyhazi_value text;
    v_year integer;
BEGIN
    IF v_caller IS NULL THEN
        IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            v_studio_bypass := true; v_is_master := true;
        ELSE
            RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
        END IF;
    END IF;

    IF NOT v_studio_bypass THEN
        v_is_master := EXISTS(SELECT 1 FROM public.profile_roles
            WHERE profile_id = v_caller AND role = 'admin' AND scope = 'system'
              AND active = true AND approval_status = 'approved');
        v_has_delegated := EXISTS(SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = v_caller AND congregation_id = p_target_congregation_id
              AND status = 'approved' AND expires_at > now());
        IF NOT v_is_master AND NOT v_has_delegated THEN
            RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', p_target_congregation_id;
        END IF;
    END IF;

    IF p_profile_key NOT IN ('baptism', 'confirmation', 'marriage', 'burial',
        'movement_bekoltozott', 'movement_elkoltozott',
        'movement_attert', 'movement_kitert') THEN
        RAISE EXCEPTION 'Érvénytelen profil-kulcs: %', p_profile_key;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_row_idx := v_row_idx + 1;
        BEGIN
            -- KERESZTELÉS
            IF p_profile_key = 'baptism' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                END IF;
                INSERT INTO public.keresztseg (
                    id_szemely, datum, lelkeszneve, okirat, egyhazi_szam, keresztszulok,
                    megjegyzes, munkanaploba, helyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'okirat', ''),
                    v_egyhazi_value, NULLIF(v_row->>'keresztszulok', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KONFIRMÁCIÓ
            ELSIF p_profile_key = 'confirmation' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_baptism_stub := v_row->'create_baptism_first';
                IF v_baptism_stub IS NOT NULL AND NULLIF(v_baptism_stub->>'datum', '') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM public.keresztseg
                        WHERE id_szemely = (v_row->>'id_szemely')::integer
                          AND datum = (v_baptism_stub->>'datum')::timestamp) THEN
                        v_egyhazi_value := NULLIF(v_baptism_stub->>'egyhazi_szam', '');
                        IF v_egyhazi_value IS NULL THEN
                            v_year := EXTRACT(YEAR FROM (v_baptism_stub->>'datum')::timestamp)::integer;
                            v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                        END IF;
                        INSERT INTO public.keresztseg (
                            id_szemely, datum, lelkeszneve, helyid, okirat, egyhazi_szam,
                            megjegyzes, munkanaploba, congregation_id
                        ) VALUES (
                            (v_row->>'id_szemely')::integer, (v_baptism_stub->>'datum')::timestamp,
                            NULLIF(v_baptism_stub->>'lelkeszneve', ''),
                            NULLIF(v_baptism_stub->>'helyid', '')::integer,
                            NULLIF(v_baptism_stub->>'okirat', ''),
                            v_egyhazi_value,
                            'Konfirmáció-importtal együtt rögzített keresztelés (' || (v_row->>'datum') || ')',
                            COALESCE((v_baptism_stub->>'munkanaploba')::boolean, p_default_munkanaploba),
                            p_target_congregation_id
                        ) RETURNING id INTO v_baptism_id;
                        v_inserted := v_inserted + 1;
                    END IF;
                END IF;

                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::date)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'confirmation', v_year);
                END IF;
                INSERT INTO public.konfirmalas (
                    id_szemely, datum, lelkeszneve, keresztelesideje,
                    megjegyzes, helyid, okirat, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'datum')::date,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'keresztelesideje', '')::date,
                    NULLIF(v_row->>'megjegyzes', ''), NULLIF(v_row->>'helyid', '')::integer,
                    NULLIF(v_row->>'okirat', ''), v_egyhazi_value,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- HÁZASSÁG
            ELSIF p_profile_key = 'marriage' THEN
                IF (v_row->>'id_ferfi') IS NULL OR (v_row->>'id_no') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_ferfi, id_no vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'marriage', v_year);
                END IF;
                INSERT INTO public.hazassag (
                    id_ferfi, id_no, datum, lelkeszneve, hlevel, egyhazi_szam, tanuk,
                    megjegyzes, munkanaploba, helyid, vegyes, congregation_id
                ) VALUES (
                    (v_row->>'id_ferfi')::integer, (v_row->>'id_no')::integer,
                    (v_row->>'datum')::timestamp, NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'hlevel', ''), v_egyhazi_value,
                    NULLIF(v_row->>'tanuk', ''), NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    COALESCE((v_row->>'vegyes')::boolean, false), p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- TEMETÉS
            ELSIF p_profile_key = 'burial' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'hdatum', '') IS NULL OR NULLIF(v_row->>'tdatum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely, hdatum vagy tdatum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'tdatum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'burial', v_year);
                END IF;
                INSERT INTO public.temetes (
                    id_szemely, hdatum, hoka, tdatum, lelkeszneve, okirat, egyhazi_szam,
                    megjegyzes, munkanaploba, hhelyid, thelyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'hdatum')::timestamp,
                    NULLIF(v_row->>'hoka', ''), (v_row->>'tdatum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'okirat', ''),
                    v_egyhazi_value, NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'hhelyid', '')::integer,
                    NULLIF(v_row->>'thelyid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- BEKÖLTÖZÖTT
            ELSIF p_profile_key = 'movement_bekoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'mikor', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy mikor');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_bekoltozott', v_year);
                END IF;
                INSERT INTO public.bekoltozott (
                    id_szemely, mikor, megjegyzes, igazolas, egyhazi_szam, honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'mikor')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''), NULLIF(v_row->>'igazolas', ''),
                    v_egyhazi_value, NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ELKÖLTÖZÖTT
            ELSIF p_profile_key = 'movement_elkoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_elkoltozott', v_year);
                END IF;
                INSERT INTO public.elkoltozott (
                    id_szemely, kulfoldre, mikor, megjegyzes, hovaid, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    COALESCE((v_row->>'kulfoldre')::boolean, false),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    v_egyhazi_value, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ÁTTÉRT
            ELSIF p_profile_key = 'movement_attert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_attert', v_year);
                END IF;
                INSERT INTO public.attert (
                    id_szemely, felekezet, mikor, igazolas, egyhazi_szam, megjegyzes,
                    honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp, NULLIF(v_row->>'igazolas', ''),
                    v_egyhazi_value, NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'honnanid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KITÉRT
            ELSIF p_profile_key = 'movement_kitert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_kitert', v_year);
                END IF;
                INSERT INTO public.kitert (
                    id_szemely, felekezet, mikor, megjegyzes, hovaid, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp, NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    v_egyhazi_value, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;
            END IF;

        EXCEPTION
            WHEN unique_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'warning', 'message', 'Dupla bejegyzés (UNIQUE) — már létezik');
            WHEN foreign_key_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'FK hiba: ' || SQLERRM);
            WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', SQLERRM);
        END;
    END LOOP;

    inserted_count := v_inserted;
    skipped_count := v_skipped;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_registry$;

GRANT EXECUTE ON FUNCTION public.import_registry_batch(uuid, text, jsonb, boolean) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. egyhazi_szam oszlop minden táblában
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'egyhazi_szam'
ORDER BY table_name;

-- 2. Backfill statisztika
SELECT 'keresztseg' AS tabla,
    COUNT(*) FILTER (WHERE okirat IS NOT NULL AND okirat <> '') AS van_allami_okirat,
    COUNT(*) FILTER (WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam <> '') AS van_egyhazi_szam,
    COUNT(*) AS osszesen
FROM public.keresztseg
UNION ALL
SELECT 'konfirmalas', COUNT(*) FILTER (WHERE okirat IS NOT NULL AND okirat <> ''),
       COUNT(*) FILTER (WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam <> ''), COUNT(*)
FROM public.konfirmalas
UNION ALL
SELECT 'hazassag', COUNT(*) FILTER (WHERE hlevel IS NOT NULL AND hlevel <> ''),
       COUNT(*) FILTER (WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam <> ''), COUNT(*)
FROM public.hazassag
UNION ALL
SELECT 'temetes', COUNT(*) FILTER (WHERE okirat IS NOT NULL AND okirat <> ''),
       COUNT(*) FILTER (WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam <> ''), COUNT(*)
FROM public.temetes;

-- 3. Példák a 2024-2025-ös kereszteléseknél (most már látható, hogy szét van választva)
-- SELECT id, datum, okirat AS allami_szam, egyhazi_szam
-- FROM public.keresztseg
-- WHERE datum >= '2024-01-01'
-- ORDER BY datum DESC LIMIT 10;
