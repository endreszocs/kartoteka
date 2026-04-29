-- KARTOTEKA — Egyházi anyakönyvi szám automatikus generálása
-- Dátum: 2026-04-28
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre kérése):
-- A magyar reformárus egyházi anyakönyvekben a bejegyzéseknek hivatalos
-- "anyakönyvi szám"-uk van, ami a Supabase által automatikusan generálható.
--
-- FORMÁTUM: YYYYTTNNNN (10 karakter)
--   YYYY = év (pl. 2025)
--   TT   = típus-kód (01-08)
--   NNNN = sorszám az adott évben (gyülekezetenként + típusonként újraszámolva)
--
-- Típus-kódok:
--   01 = keresztelés
--   02 = konfirmáció
--   03 = esketés
--   04 = temetés
--   05 = beköltözött
--   06 = elköltözött
--   07 = áttért
--   08 = kitért
--
-- Példák:
--   2025010001 → 2025-ös év, 1. keresztelés
--   2025010042 → 2025-ös év, 42. keresztelés
--   2025020001 → 2025-ös év, 1. konfirmáció
--   2025030007 → 2025-ös év, 7. esketés
--
-- Az RPC a `congregation_id`-szintű sorszámot ad vissza — minden gyülekezet
-- saját számozása (nem ütközhetnek).
--
-- HASZNÁLAT: a `import_registry_batch` RPC + a webes/desktop dialógok
-- automatikusan hívják, ha az `okirat`/`hlevel` mező üres.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. RPC: generate_egyhazi_anyakonyvi_szam
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_egyhazi_anyakonyvi_szam(
    p_target_congregation_id uuid,
    p_profile_key text,        -- 'baptism' | 'confirmation' | 'marriage' | 'burial' | 'movement_*'
    p_year integer DEFAULT NULL -- ha NULL → aktuális év
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
    -- Típus-kód meghatározás
    CASE p_profile_key
        WHEN 'baptism'              THEN v_type_code := '01'; v_table := 'keresztseg';   v_okirat_field := 'okirat';
        WHEN 'confirmation'         THEN v_type_code := '02'; v_table := 'konfirmalas';  v_okirat_field := NULL;     -- konfirmalas-on nincs okirat mező
        WHEN 'marriage'             THEN v_type_code := '03'; v_table := 'hazassag';     v_okirat_field := 'hlevel';
        WHEN 'burial'               THEN v_type_code := '04'; v_table := 'temetes';      v_okirat_field := 'okirat';
        WHEN 'movement_bekoltozott' THEN v_type_code := '05'; v_table := 'bekoltozott';  v_okirat_field := 'igazolas';
        WHEN 'movement_elkoltozott' THEN v_type_code := '06'; v_table := 'elkoltozott';  v_okirat_field := NULL;     -- elkoltozott-on nincs igazolas mező
        WHEN 'movement_attert'      THEN v_type_code := '07'; v_table := 'attert';       v_okirat_field := 'igazolas';
        WHEN 'movement_kitert'      THEN v_type_code := '08'; v_table := 'kitert';       v_okirat_field := NULL;     -- kitert-en nincs igazolas mező
        ELSE
            RAISE EXCEPTION 'Érvénytelen profile_key: %', p_profile_key;
    END CASE;

    -- A számozás 'YYYYTT' prefix-szel megy. Lekérdezzük a táblából a már
    -- létező legmagasabb sorszámot (csak az okirat-mezős táblákon).
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
        RAISE EXCEPTION 'Túl sok bejegyzés egy évben (>9999) — formátum-túlcsordulás. Kérj segítséget a fejlesztőktől.';
    END IF;

    RETURN v_year_prefix || lpad(v_next_seq::text, 4, '0');
END;
$generate_szam$;

COMMENT ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) IS
    'Egyházi anyakönyvi szám generálás: YYYYTTNNNN (év + típus-kód + sorszám). Endre kérése (2026-04-28). Gyülekezetenként + típusonként + évenként újraszámolt sorszám.';

GRANT EXECUTE ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. import_registry_batch — auto-szám generálás ha okirat/hlevel üres
-- ════════════════════════════════════════════════════════════════════════════
--
-- A korábbi RPC-be (2026-04-27-registry-import-rpc.sql) automatikus szám-
-- generálás bekerül: ha a soron az `okirat` (vagy `hlevel` házasságnál vagy
-- `igazolas` mozgásoknál) NULL/üres → meghívjuk a generálót.

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
    -- ──────────────────────────────────────────────────────────
    -- Jog-ellenőrzés (Studio bypass + master / delegated)
    -- ──────────────────────────────────────────────────────────
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
            -- ──────────────────────────────────────────────
            -- KERESZTELÉS
            -- ──────────────────────────────────────────────
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

            -- ──────────────────────────────────────────────
            -- KONFIRMÁCIÓ — keresztelés-stub create_baptism_first ha kell
            -- ──────────────────────────────────────────────
            ELSIF p_profile_key = 'confirmation' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

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

                INSERT INTO public.konfirmalas (
                    id_szemely, datum, lelkeszneve, keresztelesideje,
                    megjegyzes, helyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'datum')::date,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'keresztelesideje', '')::date,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'helyid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ──────────────────────────────────────────────
            -- HÁZASSÁG (Esketés)
            -- ──────────────────────────────────────────────
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

            -- ──────────────────────────────────────────────
            -- TEMETÉS
            -- ──────────────────────────────────────────────
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

            -- ──────────────────────────────────────────────
            -- BEKÖLTÖZÖTT
            -- ──────────────────────────────────────────────
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

            -- ──────────────────────────────────────────────
            -- ELKÖLTÖZÖTT (nincs igazolas mező — csak megjegyzes-be kerülhet)
            -- ──────────────────────────────────────────────
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

            -- ──────────────────────────────────────────────
            -- ÁTTÉRT (Egyházunkba tért)
            -- ──────────────────────────────────────────────
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

            -- ──────────────────────────────────────────────
            -- KITÉRT (Egyházunkból kitért — nincs igazolas mező)
            -- ──────────────────────────────────────────────
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

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Új RPC létezik
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'generate_egyhazi_anyakonyvi_szam';

-- 2. Próba: 2025-ös 1. keresztelési szám
-- SELECT public.generate_egyhazi_anyakonyvi_szam(
--     '<your_congregation_uuid>'::uuid,
--     'baptism',
--     2025
-- );
-- Várt: '2025010001' (ha még nincs keresztelés ebben az évben)

-- 3. Próba: 2025-ös esketési szám
-- SELECT public.generate_egyhazi_anyakonyvi_szam(
--     '<your_congregation_uuid>'::uuid,
--     'marriage',
--     2025
-- );
-- Várt: '2025030001' (vagy a következő szabad sorszám)
