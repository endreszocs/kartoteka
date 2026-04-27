-- KARTOTEKA — Anyakönyvi import RPC + temetes trigger + UNIQUE indexek + hazassag.vegyes
-- Dátum: 2026-04-27
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél: Az anyakönyvi import wizard (R1 sprint) backend-jának építése.
--   1. `hazassag.vegyes` BOOLEAN oszlop (új) — Endre döntése: hlevel = okirat
--      (levélszám), a Vegyes flag külön mezőre kerül.
--   2. AFTER INSERT trigger a `temetes` táblán → `szemely.meghalt = true`
--      automatikus beállítása. (Endre döntése: automatikusan, nem manuális.)
--   3. 8 UNIQUE INDEX a dupla-import elleni védelemhez (idempotens rerun).
--   4. RPC `import_registry_batch` — egyetlen RPC ami 8 anyakönyv-típust
--      kezel `p_profile_key` paraméter alapján:
--        baptism / confirmation / marriage / burial /
--        movement_bekoltozott / movement_elkoltozott /
--        movement_attert / movement_kitert
--      Konfirmációnál INVARIANT: ha a szemelynek nincs keresztseg-rekordja,
--      Endre szabálya szerint ELŐSZÖR kell rögzíteni a keresztelést. A wizard
--      a "special-fields" lépésben dönti el (auto-stub / manuális / kihagy);
--      a 'create_baptism_first' opció az RPC-ben atomikus.
--
-- HASZNÁLAT (Studio): másold be teljes egészben → Run.
-- A script idempotens (CREATE OR REPLACE + IF NOT EXISTS), többször futtatható.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. hazassag.vegyes oszlop (új)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.hazassag
    ADD COLUMN IF NOT EXISTS vegyes boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hazassag.vegyes IS
    'Vegyes házasság jelzése (egyik fél nem református). Az esketések anyakönyvi import a XML "Vegyes" oszlopából tölti.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AFTER INSERT trigger a temetes-en → szemely.meghalt = true
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_szemely_meghalt_on_temetes()
RETURNS trigger
LANGUAGE plpgsql
AS $set_szemely_meghalt$
BEGIN
    UPDATE public.szemely
    SET meghalt = true
    WHERE id = NEW.id_szemely
      AND meghalt = false;  -- csak akkor írunk, ha még nem volt true (UPDATE-trigger optimalizáció)
    RETURN NEW;
END;
$set_szemely_meghalt$;

DROP TRIGGER IF EXISTS trg_temetes_set_meghalt ON public.temetes;
CREATE TRIGGER trg_temetes_set_meghalt
    AFTER INSERT ON public.temetes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_szemely_meghalt_on_temetes();

COMMENT ON FUNCTION public.set_szemely_meghalt_on_temetes() IS
    'AFTER INSERT a temetes táblán: a kapcsolódó szemely.meghalt = true. Az anyakönyvi import és a manuális UI is automatikusan jó lesz.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. 8 UNIQUE INDEX (idempotens import-rerun védelem)
-- ════════════════════════════════════════════════════════════════════════════

-- Keresztelés: egy szemely egy adott napon csak egyszer kereszteltetik
CREATE UNIQUE INDEX IF NOT EXISTS uq_keresztseg_szemely_datum
    ON public.keresztseg (id_szemely, datum);

-- Konfirmáció: egy szemely egy adott napon csak egyszer konfirmáltatik
CREATE UNIQUE INDEX IF NOT EXISTS uq_konfirmalas_szemely_datum
    ON public.konfirmalas (id_szemely, datum);

-- Házasság: egy adott férj+nő pár csak egyszer egy adott napon
CREATE UNIQUE INDEX IF NOT EXISTS uq_hazassag_pair_datum
    ON public.hazassag (id_ferfi, id_no, datum);

-- Temetés: egy szemely csak egyszer temettetik el (egy temetes-dátum)
CREATE UNIQUE INDEX IF NOT EXISTS uq_temetes_szemely_tdatum
    ON public.temetes (id_szemely, tdatum);

-- Mozgások: szemely + dátum
CREATE UNIQUE INDEX IF NOT EXISTS uq_bekoltozott_szemely_mikor
    ON public.bekoltozott (id_szemely, mikor);
CREATE UNIQUE INDEX IF NOT EXISTS uq_elkoltozott_szemely_mikor
    ON public.elkoltozott (id_szemely, mikor);
CREATE UNIQUE INDEX IF NOT EXISTS uq_attert_szemely_mikor
    ON public.attert (id_szemely, mikor);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kitert_szemely_mikor
    ON public.kitert (id_szemely, mikor);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RPC: import_registry_batch
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bemenet:
--   p_target_congregation_id : célzott gyülekezet UUID
--   p_profile_key : 'baptism' | 'confirmation' | 'marriage' | 'burial' |
--                   'movement_bekoltozott' | 'movement_elkoltozott' |
--                   'movement_attert' | 'movement_kitert'
--   p_rows : JSONB tömb — minden elem egy anyakönyvi rekord predigested
--            (a wizard person-link és locality-resolve lépéseket már elvégezte).
--            Példa egy keresztelés-sornál:
--              {
--                "id_szemely": 123,
--                "datum": "2025-10-12",
--                "lelkeszneve": "Márk József",
--                "okirat": "K-2025-001",
--                "keresztszulok": "Kovács István és Kovács Anna",
--                "helyid": 12345,
--                "megjegyzes": null
--              }
--            Konfirmációnál speciális kulcs:
--              "create_baptism_first": { "datum": "2010-09-26", "lelkeszneve": null, "helyid": 12345 }
--              — ha jelen van, ELŐSZÖR keresztseg INSERT, AZTÁN konfirmalas
--   p_default_munkanaploba : default a `munkanaploba` flag (true/false)
--
-- Kimenet:
--   inserted_count : sikeres INSERT-ek száma (a baptism-stub is számít!)
--   skipped_count : kihagyott (UNIQUE-ütközés vagy egyéb ok)
--   errors : JSONB lista [{row, severity, message, ...}]

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

    -- ──────────────────────────────────────────────────────────
    -- Profil-érvényesítés
    -- ──────────────────────────────────────────────────────────
    IF p_profile_key NOT IN (
        'baptism', 'confirmation', 'marriage', 'burial',
        'movement_bekoltozott', 'movement_elkoltozott',
        'movement_attert', 'movement_kitert'
    ) THEN
        RAISE EXCEPTION 'Érvénytelen profil-kulcs: %', p_profile_key;
    END IF;

    -- ──────────────────────────────────────────────────────────
    -- Sorok feldolgozása
    -- ──────────────────────────────────────────────────────────
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

                INSERT INTO public.keresztseg (
                    id_szemely, datum, lelkeszneve, okirat, keresztszulok,
                    megjegyzes, munkanaploba, helyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'okirat', ''),
                    NULLIF(v_row->>'keresztszulok', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ──────────────────────────────────────────────
            -- KONFIRMÁCIÓ — Endre invariáns: keresztelés nélkül nincs konfirmálás
            -- ──────────────────────────────────────────────
            ELSIF p_profile_key = 'confirmation' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx, 'severity', 'error',
                        'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                -- Ha a wizard 'create_baptism_first'-tel jelez, ELŐSZÖR keresztseg INSERT
                v_baptism_stub := v_row->'create_baptism_first';
                IF v_baptism_stub IS NOT NULL AND NULLIF(v_baptism_stub->>'datum', '') IS NOT NULL THEN
                    -- Csak akkor insertáljunk, ha még nincs ilyen keresztseg-rekord
                    IF NOT EXISTS (
                        SELECT 1 FROM public.keresztseg
                        WHERE id_szemely = (v_row->>'id_szemely')::integer
                          AND datum = (v_baptism_stub->>'datum')::timestamp
                    ) THEN
                        INSERT INTO public.keresztseg (
                            id_szemely, datum, lelkeszneve, helyid,
                            okirat, megjegyzes, munkanaploba, congregation_id
                        ) VALUES (
                            (v_row->>'id_szemely')::integer,
                            (v_baptism_stub->>'datum')::timestamp,
                            NULLIF(v_baptism_stub->>'lelkeszneve', ''),
                            NULLIF(v_baptism_stub->>'helyid', '')::integer,
                            NULLIF(v_baptism_stub->>'okirat', ''),
                            'Konfirmáció-importtal együtt rögzített keresztelés (' || (v_row->>'datum') || ')',
                            COALESCE((v_baptism_stub->>'munkanaploba')::boolean, p_default_munkanaploba),
                            p_target_congregation_id
                        )
                        RETURNING id INTO v_baptism_id;
                        v_inserted := v_inserted + 1;
                    END IF;
                END IF;

                -- Konfirmáció INSERT
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

                INSERT INTO public.hazassag (
                    id_ferfi, id_no, datum, lelkeszneve, hlevel, tanuk,
                    megjegyzes, munkanaploba, helyid, vegyes, congregation_id
                ) VALUES (
                    (v_row->>'id_ferfi')::integer,
                    (v_row->>'id_no')::integer,
                    (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'hlevel', ''),
                    NULLIF(v_row->>'tanuk', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    COALESCE((v_row->>'vegyes')::boolean, false),
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ──────────────────────────────────────────────
            -- TEMETÉS (két dátum, két helyszín)
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

                INSERT INTO public.temetes (
                    id_szemely, hdatum, hoka, tdatum, lelkeszneve, okirat,
                    megjegyzes, munkanaploba, hhelyid, thelyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'hdatum')::timestamp,
                    NULLIF(v_row->>'hoka', ''),
                    (v_row->>'tdatum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'okirat', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'hhelyid', '')::integer,
                    NULLIF(v_row->>'thelyid', '')::integer,
                    p_target_congregation_id
                );
                -- Trigger automatikusan beállítja szemely.meghalt = true
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

                INSERT INTO public.bekoltozott (
                    id_szemely, mikor, megjegyzes, igazolas, honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    (v_row->>'mikor')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'igazolas', ''),
                    NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ──────────────────────────────────────────────
            -- ELKÖLTÖZÖTT (kulfoldre flag)
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

                INSERT INTO public.attert (
                    id_szemely, felekezet, mikor, igazolas, megjegyzes,
                    honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    NULLIF(v_row->>'igazolas', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ──────────────────────────────────────────────
            -- KITÉRT (Egyházunkból kitért)
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

COMMENT ON FUNCTION public.import_registry_batch(uuid, text, jsonb, boolean) IS
    'Anyakönyvi import wizard backend RPC — 8 anyakönyvi profil egyetlen RPC-ben. A wizard a person-link és locality-resolve lépéseket már elvégezte; ez a függvény csak az INSERT-eket csinálja, a UNIQUE/FK ütközéseket skipped-be teszi.';

GRANT EXECUTE ON FUNCTION public.import_registry_batch(uuid, text, jsonb, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Új oszlop a hazassag-on
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hazassag' AND column_name = 'vegyes';

-- 2. Trigger a temetes-en
SELECT tgname, tgrelid::regclass, tgfoid::regproc
FROM pg_trigger
WHERE tgrelid = 'public.temetes'::regclass
  AND NOT tgisinternal;

-- 3. UNIQUE indexek
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'uq_%'
  AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes',
                    'bekoltozott','elkoltozott','attert','kitert')
ORDER BY tablename, indexname;

-- 4. RPC létezik
SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args,
    p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'import_registry_batch'
  AND n.nspname = 'public';

-- 5. Próba (csak Studio-ban!) — üres rows tömbbel hívás, csak a függvény-szignatúrát teszteli
-- SELECT * FROM public.import_registry_batch(
--     '<your_congregation_uuid>'::uuid,
--     'baptism',
--     '[]'::jsonb,
--     false
-- );
