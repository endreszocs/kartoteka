-- KARTOTEKA — Hiányzó házastársak v9 (LOOSE LINK)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v7+v8 után marad pár single-parent csalad ahol a házastárs CSAK szemely-ben
-- létezik (NINCS saját csalad-rekordja). A v9 ezeket csatolja:
--   - egyetlen másnemű felnőtt szemely ugyanazon címen
--   - csaladfo = false (egyébként a v7/v8 MERGE-elte volna)
--   - NINCS más csalad-ban / gyerek-ben
--   - 16+ év
--
-- HASZNÁLAT: másold be → Run.

DO $loose_link$
DECLARE
    sp_rec record;
    cand_count int;
    cand_id int;
    v_linked int := 0;
    v_ambiguous int := 0;
    v_no_cand int := 0;
    v_skipped int := 0;
    v_first_error text := NULL;
BEGIN
    FOR sp_rec IN
        SELECT
            c.id AS csalad_id, c.c_utcaid, c.c_szam,
            head.id AS head_id, head.ferfi AS head_ferfi,
            head.congregation_id, (c.id_no IS NULL) AS need_no
        FROM public.csalad c
        INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
        WHERE head.isvisible = true
          AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
          AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
          AND c.c_utcaid IS NOT NULL
        ORDER BY c.id
    LOOP
        SELECT COUNT(*), MAX(s.id) INTO cand_count, cand_id
        FROM public.szemely s
        WHERE s.congregation_id = sp_rec.congregation_id
          AND s.isvisible = true
          AND s.id <> sp_rec.head_id
          AND s.c_utcaid = sp_rec.c_utcaid
          AND COALESCE(s.c_szam, '') = COALESCE(sp_rec.c_szam, '')
          AND s.ferfi <> sp_rec.head_ferfi
          AND s.csaladfo = false
          AND NOT EXISTS (SELECT 1 FROM public.csalad c2 WHERE c2.id_ferfi = s.id OR c2.id_no = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id)
          AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date);

        IF cand_count = 1 THEN
            BEGIN
                IF sp_rec.need_no THEN
                    UPDATE public.csalad SET id_no = cand_id WHERE id = sp_rec.csalad_id;
                ELSE
                    UPDATE public.csalad SET id_ferfi = cand_id WHERE id = sp_rec.csalad_id;
                END IF;
                v_linked := v_linked + 1;
            EXCEPTION WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
                IF v_first_error IS NULL THEN
                    v_first_error := format('csalad %s + szemely %s: %s',
                        sp_rec.csalad_id, cand_id, SQLERRM);
                END IF;
            END;
        ELSIF cand_count > 1 THEN
            v_ambiguous := v_ambiguous + 1;
        ELSE
            v_no_cand := v_no_cand + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'LOOSE LINK: % csatolva, % többes jelölt, % nincs jelölt, % skipped',
        v_linked, v_ambiguous, v_no_cand, v_skipped;

    INSERT INTO public._merge_v7_result (phase, merged, skipped, first_error)
        VALUES ('LOOSE_LINKED', v_linked, v_skipped, v_first_error);
    INSERT INTO public._merge_v7_result (phase, merged, skipped, first_error)
        VALUES ('LOOSE_AMBIGUOUS', v_ambiguous, NULL, NULL);
    INSERT INTO public._merge_v7_result (phase, merged, skipped, first_error)
        VALUES ('LOOSE_NO_CAND', v_no_cand, NULL, NULL);
END;
$loose_link$;
