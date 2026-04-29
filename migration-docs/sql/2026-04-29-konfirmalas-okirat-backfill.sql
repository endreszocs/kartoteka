-- KARTOTEKA — Konfirmáció okirat oszlop + meglevő bejegyzések backfill
-- Dátum: 2026-04-29
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR:
-- 2026-04-28-án bevezettük az egyházi anyakönyvi szám auto-generálást
-- (YYYYTTNNNN). De a `konfirmalas` táblában nem volt `okirat` mező,
-- ezért a típus-kód 02 (konfirmáció) szám sosem került rögzítésre.
--
-- Ez a migration:
--   1. ADD COLUMN konfirmalas.okirat text
--   2. import_registry_batch confirmation ágát módosítja: okirat insertálása
--   3. generate_egyhazi_anyakonyvi_szam confirmation ágát: now uses okirat field
--   4. Backfill: a meglevő keresztseg ÉS konfirmalas bejegyzéseknek generál
--      okirat-et, ha üres (gyülekezetenként + típusonként + évenként
--      sorszámozva, datum szerint növekvő sorrendben).
--
-- FONTOS: Endre kérdezte: "Ez gyülekezetenként ugyanúgy generálódik igaz?"
-- Válasz: IGEN. A `generate_egyhazi_anyakonyvi_szam` RPC `congregation_id`-re
-- szűr, így minden gyülekezet saját számozása (1-től újraindul).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. konfirmalas.okirat oszlop hozzáadása
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.konfirmalas
    ADD COLUMN IF NOT EXISTS okirat text;

COMMENT ON COLUMN public.konfirmalas.okirat IS
    'Egyházi anyakönyvi szám (YYYY02NNNN formátum). 2026-04-29 — Endre kérése.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. import_registry_batch confirmation ágának frissítése
-- ════════════════════════════════════════════════════════════════════════════
--
-- A konfirmáció INSERT-be bekerül az okirat (auto-gen ha üres).

CREATE OR REPLACE FUNCTION public.import_registry_batch(
    p_target_congregation_id uuid,
    p_profile_key text,
    p_rows jsonb,
    p_default_munkanaploba boolean DEFAULT false
) RETURNS TABLE(
    inserted_count integer,
    skipped_count integer,
    errors jsonb
)
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
    v_okirat_value text;
    v_hlevel_value text;
    v_igazolas_value text;
    v_year integer;
BEGIN
    IF v_caller IS NULL THEN
        IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            v_studio_bypass := true;
            v_is_master := true;
        ELSE
            RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
        END IF;
    END IF;

    IF NOT v_studio_bypass THEN
        v_is_master := EXISTS(
            SELECT 1 FROM public.profile_roles
            WHERE profile_id = v_caller
              AND role = 'admin' AND scope = 'system'
              AND active = true AND approval_status = 'approved'
        );
        v_has_delegated := EXISTS(
            SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = v_caller
              AND congregation_id = p_target_congregation_id
              AND status = 'approved' AND expires_at > now()
        );
        IF NOT v_is_master AND NOT v_has_delegated THEN
            RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', p_target_congregation_id;
        END IF;
    END IF;

    IF p_profile_key NOT IN (
        'baptism', 'confirmation', 'marriage', 'burial',
        'movement_bekoltozott', 'movement_elkoltozott',
        'movement_attert', 'movement_kitert'
    ) THEN
        RAISE EXCEPTION 'Érvénytelen profil-kulcs: %', p_profile_key;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_row_idx := v_row_idx + 1;
        BEGIN
            -- KERESZTELÉS
            IF p_profile_key = 'baptism' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                v_okirat_value := NULLIF(v_row->>'okirat', '');
                IF v_okirat_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_okirat_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                END IF;

                INSERT INTO public.keresztseg (
                    id_szemely, datum, lelkeszneve, okirat, keresztszulok,
                    megjegyzes, munkanaploba, helyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    v_okirat_value,
                    NULLIF(v_row->>'keresztszulok', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KONFIRMÁCIÓ — most már okirat-tal együtt
            ELSIF p_profile_key = 'confirmation' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                -- Keresztelés-stub (create_baptism_first) — változatlan logika
                v_baptism_stub := v_row->'create_baptism_first';
                IF v_baptism_stub IS NOT NULL AND NULLIF(v_baptism_stub->>'datum', '') IS NOT NULL THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM public.keresztseg
                        WHERE id_szemely = (v_row->>'id_szemely')::integer
                          AND datum = (v_baptism_stub->>'datum')::timestamp
                    ) THEN
                        v_okirat_value := NULLIF(v_baptism_stub->>'okirat', '');
                        IF v_okirat_value IS NULL THEN
                            v_year := EXTRACT(YEAR FROM (v_baptism_stub->>'datum')::timestamp)::integer;
                            v_okirat_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                        END IF;
                        INSERT INTO public.keresztseg (
                            id_szemely, datum, lelkeszneve, helyid, okirat, megjegyzes,
                            munkanaploba, congregation_id
                        ) VALUES (
                            (v_row->>'id_szemely')::integer,
                            (v_baptism_stub->>'datum')::timestamp,
                            NULLIF(v_baptism_stub->>'lelkeszneve', ''),
                            NULLIF(v_baptism_stub->>'helyid', '')::integer,
                            v_okirat_value,
                            'Konfirmáció-importtal együtt rögzített keresztelés (' || (v_row->>'datum') || ')',
                            COALESCE((v_baptism_stub->>'munkanaploba')::boolean, p_default_munkanaploba),
                            p_target_congregation_id
                        )
                        RETURNING id INTO v_baptism_id;
                        v_inserted := v_inserted + 1;
                    END IF;
                END IF;

                -- Konfirmáció okirat (új! 2026-04-29)
                v_okirat_value := NULLIF(v_row->>'okirat', '');
                IF v_okirat_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::date)::integer;
                    v_okirat_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'confirmation', v_year);
                END IF;

                INSERT INTO public.konfirmalas (
                    id_szemely, datum, lelkeszneve, keresztelesideje,
                    megjegyzes, helyid, okirat, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'datum')::date,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'keresztelesideje', '')::date,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'helyid', '')::integer,
                    v_okirat_value,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- HÁZASSÁG
            ELSIF p_profile_key = 'marriage' THEN
                IF (v_row->>'id_ferfi') IS NULL OR (v_row->>'id_no') IS NULL
                   OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_ferfi, id_no vagy datum');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                v_hlevel_value := NULLIF(v_row->>'hlevel', '');
                IF v_hlevel_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_hlevel_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'marriage', v_year);
                END IF;

                INSERT INTO public.hazassag (
                    id_ferfi, id_no, datum, lelkeszneve, hlevel, tanuk,
                    megjegyzes, munkanaploba, helyid, vegyes, congregation_id
                ) VALUES (
                    (v_row->>'id_ferfi')::integer,
                    (v_row->>'id_no')::integer,
                    (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    v_hlevel_value,
                    NULLIF(v_row->>'tanuk', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    COALESCE((v_row->>'vegyes')::boolean, false),
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- TEMETÉS
            ELSIF p_profile_key = 'burial' THEN
                IF (v_row->>'id_szemely') IS NULL
                   OR NULLIF(v_row->>'hdatum', '') IS NULL
                   OR NULLIF(v_row->>'tdatum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely, hdatum vagy tdatum');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                v_okirat_value := NULLIF(v_row->>'okirat', '');
                IF v_okirat_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'tdatum')::timestamp)::integer;
                    v_okirat_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'burial', v_year);
                END IF;

                INSERT INTO public.temetes (
                    id_szemely, hdatum, hoka, tdatum, lelkeszneve, okirat,
                    megjegyzes, munkanaploba, hhelyid, thelyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'hdatum')::timestamp,
                    NULLIF(v_row->>'hoka', ''),
                    (v_row->>'tdatum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    v_okirat_value,
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'hhelyid', '')::integer,
                    NULLIF(v_row->>'thelyid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- BEKÖLTÖZÖTT
            ELSIF p_profile_key = 'movement_bekoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'mikor', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely vagy mikor');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                v_igazolas_value := NULLIF(v_row->>'igazolas', '');
                IF v_igazolas_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_igazolas_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_bekoltozott', v_year);
                END IF;

                INSERT INTO public.bekoltozott (
                    id_szemely, mikor, megjegyzes, igazolas, honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'mikor')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    v_igazolas_value,
                    NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ELKÖLTÖZÖTT
            ELSIF p_profile_key = 'movement_elkoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                INSERT INTO public.elkoltozott (
                    id_szemely, kulfoldre, mikor, megjegyzes, hovaid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    COALESCE((v_row->>'kulfoldre')::boolean, false),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ÁTTÉRT
            ELSIF p_profile_key = 'movement_attert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                v_igazolas_value := NULLIF(v_row->>'igazolas', '');
                IF v_igazolas_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_igazolas_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_attert', v_year);
                END IF;

                INSERT INTO public.attert (
                    id_szemely, felekezet, mikor, igazolas, megjegyzes,
                    honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    v_igazolas_value,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KITÉRT
            ELSIF p_profile_key = 'movement_kitert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                INSERT INTO public.kitert (
                    id_szemely, felekezet, mikor, megjegyzes, hovaid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;
            END IF;

        EXCEPTION
            WHEN unique_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx, 'severity', 'warning',
                    'message', 'Dupla bejegyzés (UNIQUE) — már létezik');
            WHEN foreign_key_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx, 'severity', 'error',
                    'message', 'FK hiba: ' || SQLERRM);
            WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx, 'severity', 'error',
                    'message', SQLERRM);
        END;
    END LOOP;

    inserted_count := v_inserted;
    skipped_count := v_skipped;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_registry$;

GRANT EXECUTE ON FUNCTION public.import_registry_batch(uuid, text, jsonb, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. generate_egyhazi_anyakonyvi_szam — confirmation now uses okirat
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
    v_okirat_field text;
    v_max_seq integer := 0;
    v_next_seq integer;
    v_year_prefix text;
    v_pattern text;
    v_query text;
BEGIN
    CASE p_profile_key
        WHEN 'baptism'              THEN v_type_code := '01'; v_table := 'keresztseg';   v_okirat_field := 'okirat';
        WHEN 'confirmation'         THEN v_type_code := '02'; v_table := 'konfirmalas';  v_okirat_field := 'okirat';   -- 2026-04-29: most már van okirat mező
        WHEN 'marriage'             THEN v_type_code := '03'; v_table := 'hazassag';     v_okirat_field := 'hlevel';
        WHEN 'burial'               THEN v_type_code := '04'; v_table := 'temetes';      v_okirat_field := 'okirat';
        WHEN 'movement_bekoltozott' THEN v_type_code := '05'; v_table := 'bekoltozott';  v_okirat_field := 'igazolas';
        WHEN 'movement_elkoltozott' THEN v_type_code := '06'; v_table := 'elkoltozott';  v_okirat_field := NULL;
        WHEN 'movement_attert'      THEN v_type_code := '07'; v_table := 'attert';       v_okirat_field := 'igazolas';
        WHEN 'movement_kitert'      THEN v_type_code := '08'; v_table := 'kitert';       v_okirat_field := NULL;
        ELSE
            RAISE EXCEPTION 'Érvénytelen profile_key: %', p_profile_key;
    END CASE;

    v_year_prefix := v_year::text || v_type_code;
    v_pattern := v_year_prefix || '____';

    IF v_okirat_field IS NOT NULL THEN
        v_query := format(
            'SELECT COALESCE(MAX(SUBSTRING(%I FROM 7 FOR 4)::integer), 0) FROM public.%I WHERE %I LIKE $1 AND congregation_id = $2',
            v_okirat_field, v_table, v_okirat_field
        );
        EXECUTE v_query INTO v_max_seq USING v_pattern, p_target_congregation_id;
    END IF;

    v_next_seq := v_max_seq + 1;
    IF v_next_seq > 9999 THEN
        RAISE EXCEPTION 'Túl sok bejegyzés egy évben (>9999) — formátum-túlcsordulás.';
    END IF;

    RETURN v_year_prefix || lpad(v_next_seq::text, 4, '0');
END;
$generate_szam$;

GRANT EXECUTE ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL — meglevő keresztseg + konfirmalas bejegyzések
-- ════════════════════════════════════════════════════════════════════════════
--
-- A meglevő bejegyzéseknek (akik még a 04-28 SQL ELŐTT kerültek be) generálunk
-- okirat-et: gyülekezetenként + típusonként + évenként sorszámozva,
-- datum szerint növekvő sorrendben (régiek 0001, újabbak 0002, stb.).
--
-- Csak az ÜRES okirat-okat töltjük ki — a már beállítottakat NEM bántjuk.

-- ── KERESZTSEG backfill ──────────────────────────────────────────────────
WITH ranked AS (
    SELECT
        id,
        congregation_id,
        EXTRACT(YEAR FROM datum)::integer AS year,
        ROW_NUMBER() OVER (
            PARTITION BY congregation_id, EXTRACT(YEAR FROM datum)::integer
            ORDER BY datum ASC, id ASC
        ) AS seq
    FROM public.keresztseg
    WHERE (okirat IS NULL OR trim(okirat) = '')
      AND datum IS NOT NULL
      AND congregation_id IS NOT NULL
)
UPDATE public.keresztseg k
SET okirat = ranked.year::text || '01' || lpad(ranked.seq::text, 4, '0')
FROM ranked
WHERE k.id = ranked.id;

-- ── KONFIRMALAS backfill ─────────────────────────────────────────────────
WITH ranked AS (
    SELECT
        id,
        congregation_id,
        EXTRACT(YEAR FROM datum)::integer AS year,
        ROW_NUMBER() OVER (
            PARTITION BY congregation_id, EXTRACT(YEAR FROM datum)::integer
            ORDER BY datum ASC, id ASC
        ) AS seq
    FROM public.konfirmalas
    WHERE (okirat IS NULL OR trim(okirat) = '')
      AND datum IS NOT NULL
      AND congregation_id IS NOT NULL
)
UPDATE public.konfirmalas k
SET okirat = ranked.year::text || '02' || lpad(ranked.seq::text, 4, '0')
FROM ranked
WHERE k.id = ranked.id;

-- ── HAZASSAG backfill ────────────────────────────────────────────────────
-- (Ezeknél is lehetnek üres hlevel-ek a régi importokból)
WITH ranked AS (
    SELECT
        id,
        congregation_id,
        EXTRACT(YEAR FROM datum)::integer AS year,
        ROW_NUMBER() OVER (
            PARTITION BY congregation_id, EXTRACT(YEAR FROM datum)::integer
            ORDER BY datum ASC, id ASC
        ) AS seq
    FROM public.hazassag
    WHERE (hlevel IS NULL OR trim(hlevel) = '')
      AND datum IS NOT NULL
      AND congregation_id IS NOT NULL
)
UPDATE public.hazassag h
SET hlevel = ranked.year::text || '03' || lpad(ranked.seq::text, 4, '0')
FROM ranked
WHERE h.id = ranked.id;

-- ── TEMETES backfill ─────────────────────────────────────────────────────
WITH ranked AS (
    SELECT
        id,
        congregation_id,
        EXTRACT(YEAR FROM tdatum)::integer AS year,
        ROW_NUMBER() OVER (
            PARTITION BY congregation_id, EXTRACT(YEAR FROM tdatum)::integer
            ORDER BY tdatum ASC, id ASC
        ) AS seq
    FROM public.temetes
    WHERE (okirat IS NULL OR trim(okirat) = '')
      AND tdatum IS NOT NULL
      AND congregation_id IS NOT NULL
)
UPDATE public.temetes t
SET okirat = ranked.year::text || '04' || lpad(ranked.seq::text, 4, '0')
FROM ranked
WHERE t.id = ranked.id;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. konfirmalas.okirat oszlop létezik
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'konfirmalas' AND column_name = 'okirat';

-- 2. Backfill statisztika
SELECT
    'keresztseg' AS tabla, COUNT(*) FILTER (WHERE okirat IS NOT NULL AND okirat <> '') AS van_okirat,
    COUNT(*) FILTER (WHERE okirat IS NULL OR okirat = '') AS nincs_okirat,
    COUNT(*) AS osszesen
FROM public.keresztseg
UNION ALL
SELECT 'konfirmalas', COUNT(*) FILTER (WHERE okirat IS NOT NULL AND okirat <> ''),
       COUNT(*) FILTER (WHERE okirat IS NULL OR okirat = ''), COUNT(*)
FROM public.konfirmalas
UNION ALL
SELECT 'hazassag', COUNT(*) FILTER (WHERE hlevel IS NOT NULL AND hlevel <> ''),
       COUNT(*) FILTER (WHERE hlevel IS NULL OR hlevel = ''), COUNT(*)
FROM public.hazassag
UNION ALL
SELECT 'temetes', COUNT(*) FILTER (WHERE okirat IS NOT NULL AND okirat <> ''),
       COUNT(*) FILTER (WHERE okirat IS NULL OR okirat = ''), COUNT(*)
FROM public.temetes;

-- 3. Példák a backfill eredményéből (2025-ös év, gyülekezetenként)
-- SELECT congregation_id, COUNT(*), MIN(okirat), MAX(okirat)
-- FROM public.keresztseg
-- WHERE okirat LIKE '202501%'
-- GROUP BY congregation_id;
