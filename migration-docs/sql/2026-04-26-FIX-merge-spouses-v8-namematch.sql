-- KARTOTEKA — Hiányzó házastársak v8 (NÉV-PÁROSÍTÁS)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v7 STRICT MERGE működött — 2 pár MERGE-elve (Benkő-Benkő, Finta-Földes).
--
-- A v8 a NÉV-PÁROSÍTÁS fázist csinálja: több családos cím ahol AZONOS vezetéknév
-- (vagy nő szcs_nev = férj csaladnev) alapján egyértelmű 1-1 párosítás.
-- Példa: Kiss Csaba ↔ Kiss Irma (Főút 33), miközben Kicsi Gergely is ott van
-- (más családnévvel, ezért nem zavarja össze).
-- Kádár Z/S/E ↔ Kádár Katalin: 3 Kádár férfi → nem unique → kihagyva (jó).
--
-- HASZNÁLAT: másold be → Run.

DO $merge_namematch$
DECLARE
    pair_rec record;
    v_merged int := 0;
    v_skipped int := 0;
    v_first_error text := NULL;
BEGIN
    FOR pair_rec IN
        WITH single_parent AS (
            SELECT
                c.id AS csalad_id, c.c_utcaid, c.c_szam,
                head.id AS head_szemely_id,
                head.csaladnev, head.szcs_nev,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi
            FROM public.csalad c
            INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE head.isvisible = true
              AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
              AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
        ),
        ferj_at_addr AS (
            SELECT c_utcaid, c_szam,
                public.normalize_name(csaladnev) AS norm_csaladnev,
                csalad_id, head_szemely_id
            FROM single_parent
            WHERE head_is_ferfi AND c_utcaid IS NOT NULL AND csaladnev IS NOT NULL
        ),
        no_at_addr AS (
            SELECT c_utcaid, c_szam,
                public.normalize_name(csaladnev) AS norm_csaladnev,
                public.normalize_name(szcs_nev) AS norm_szcs_nev,
                csalad_id, head_szemely_id
            FROM single_parent
            WHERE NOT head_is_ferfi AND c_utcaid IS NOT NULL AND csaladnev IS NOT NULL
        ),
        candidate_pairs AS (
            SELECT
                f.csalad_id AS ferj_csalad_id, n.csalad_id AS no_csalad_id,
                f.head_szemely_id AS ferj_szemely_id, n.head_szemely_id AS no_szemely_id
            FROM ferj_at_addr f
            INNER JOIN no_at_addr n
                ON f.c_utcaid = n.c_utcaid
                AND COALESCE(f.c_szam, '') = COALESCE(n.c_szam, '')
                AND (
                    f.norm_csaladnev = n.norm_csaladnev
                    OR (n.norm_szcs_nev IS NOT NULL AND f.norm_csaladnev = n.norm_szcs_nev)
                )
        ),
        unique_pairs AS (
            SELECT *
            FROM candidate_pairs cp
            WHERE
                (SELECT COUNT(*) FROM candidate_pairs cp2 WHERE cp2.ferj_csalad_id = cp.ferj_csalad_id) = 1
                AND
                (SELECT COUNT(*) FROM candidate_pairs cp2 WHERE cp2.no_csalad_id = cp.no_csalad_id) = 1
        )
        SELECT * FROM unique_pairs ORDER BY ferj_csalad_id
    LOOP
        BEGIN
            -- 1. Áthelyezzük a feleség-csalad gyerekeit
            UPDATE public.gyerek
            SET id_csalad = pair_rec.ferj_csalad_id
            WHERE id_csalad = pair_rec.no_csalad_id;

            -- 2. Töröljük a feleség-csaladot
            DELETE FROM public.csalad
            WHERE id = pair_rec.no_csalad_id;

            -- 3. Beírjuk a feleséget a férj-csaladba
            UPDATE public.csalad
            SET id_no = pair_rec.no_szemely_id
            WHERE id = pair_rec.ferj_csalad_id;

            -- 4. csaladfo = false
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

    RAISE NOTICE 'NÉV-PÁROSÍTÁS MERGE: % pár MERGE-elve, % skip-elve', v_merged, v_skipped;

    -- Eredmény-tábla bővítése (a v7 már létrehozta, csak INSERT)
    INSERT INTO public._merge_v7_result (phase, merged, skipped, first_error)
        VALUES ('NAMEMATCH', v_merged, v_skipped, v_first_error);
END;
$merge_namematch$;
