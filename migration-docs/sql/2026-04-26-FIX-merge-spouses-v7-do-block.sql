-- KARTOTEKA — Hiányzó házastársak v7 (egyetlen DO blokk, soros lépésekkel)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v6 hibája: data-modifying CTE chain — az UPDATE és DELETE EGYIDŐBEN futnak
-- (concurrent), ugyanazon snapshot-on. A férj-csalad UPDATE megpróbálja beírni
-- id_no=719-et, de a feleség-csalad ahol id_no=719 még él a snapshot-ban →
-- UNIQUE constraint violation → ROLLBACK.
--
-- A v7 megoldása: egyetlen DO $$ blokk SOROS lépésekkel:
--   1. UPDATE gyerek (átszerelés a férj-csaladba)
--   2. DELETE feleség-csalad (eltünteti az id_no=X bejegyzést)
--   3. UPDATE férj-csalad (id_no = X — most már szabad)
--   4. UPDATE szemely (csaladfo = false)
-- EXCEPTION-kezelés minden páron — egy hibás pár sem omlasztja a többit.
--
-- HASZNÁLAT: másold be → Run. Egyetlen statement, garantáltan fut.

DO $merge_strict$
DECLARE
    pair_rec record;
    v_merged int := 0;
    v_skipped int := 0;
    v_first_error text := NULL;
BEGIN
    FOR pair_rec IN
        WITH single_parent AS (
            SELECT
                c.id AS csalad_id,
                c.c_utcaid, c.c_szam,
                CASE WHEN c.id_ferfi IS NOT NULL THEN c.id_ferfi ELSE c.id_no END AS head_szemely_id,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi
            FROM public.csalad c
            INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE head.isvisible = true
              AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
              AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
        ),
        addr_pairs AS (
            SELECT
                c_utcaid, c_szam,
                MAX(csalad_id) FILTER (WHERE head_is_ferfi) AS ferj_csalad_id,
                MAX(csalad_id) FILTER (WHERE NOT head_is_ferfi) AS no_csalad_id,
                MAX(head_szemely_id) FILTER (WHERE head_is_ferfi) AS ferj_szemely_id,
                MAX(head_szemely_id) FILTER (WHERE NOT head_is_ferfi) AS no_szemely_id
            FROM single_parent
            WHERE c_utcaid IS NOT NULL
            GROUP BY c_utcaid, c_szam
            HAVING COUNT(*) FILTER (WHERE head_is_ferfi) = 1
               AND COUNT(*) FILTER (WHERE NOT head_is_ferfi) = 1
        )
        SELECT ferj_csalad_id, no_csalad_id, ferj_szemely_id, no_szemely_id
        FROM addr_pairs
        ORDER BY ferj_csalad_id
    LOOP
        BEGIN
            -- 1. Áthelyezzük a feleség-csalad gyerekeit a férj-csaladba
            UPDATE public.gyerek
            SET id_csalad = pair_rec.ferj_csalad_id
            WHERE id_csalad = pair_rec.no_csalad_id;

            -- 2. Töröljük a feleség-csaladot (most felszabadul az id_no=X bejegyzés)
            DELETE FROM public.csalad
            WHERE id = pair_rec.no_csalad_id;

            -- 3. Beírjuk a feleséget a férj-csaladba (most már nincs UNIQUE-konfliktus)
            UPDATE public.csalad
            SET id_no = pair_rec.no_szemely_id
            WHERE id = pair_rec.ferj_csalad_id;

            -- 4. csaladfo = false a feleségre
            UPDATE public.szemely
            SET csaladfo = false
            WHERE id = pair_rec.no_szemely_id;

            v_merged := v_merged + 1;
        EXCEPTION WHEN OTHERS THEN
            v_skipped := v_skipped + 1;
            IF v_first_error IS NULL THEN
                v_first_error := format('csalad %s+%s: %s',
                    pair_rec.ferj_csalad_id, pair_rec.no_csalad_id, SQLERRM);
            END IF;
        END;
    END LOOP;

    RAISE NOTICE 'STRICT MERGE: % pár MERGE-elve, % skip-elve', v_merged, v_skipped;
    IF v_first_error IS NOT NULL THEN
        RAISE NOTICE 'Első hiba: %', v_first_error;
    END IF;

    -- Plus: az ÖSSZES eredményt egy létező táblába rögzítjük amit le tudunk kérdezni
    -- (a Studio NOTICE-okat nem mindig mutatja)
    DROP TABLE IF EXISTS public._merge_v7_result;
    CREATE TABLE public._merge_v7_result (
        phase text,
        merged int,
        skipped int,
        first_error text,
        ran_at timestamptz DEFAULT now()
    );
    INSERT INTO public._merge_v7_result (phase, merged, skipped, first_error)
        VALUES ('STRICT', v_merged, v_skipped, v_first_error);
END;
$merge_strict$;
