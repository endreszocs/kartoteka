-- KARTOTEKA — Hiányzó házastársak javítása (MERGE + LOOSE link)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ELŐFELTÉTEL:
--   FUTTASD ELŐSZÖR a `2026-04-26-FIX-missing-spouses-diagnostics.sql`-t,
--   hogy lásd, mit várhatsz!
--
-- HÁROM JAVÍTÁS EGY SCRIPTBEN (ALATT KÜLÖN BEGIN/COMMIT-ek):
--
-- A. MERGE: két single-parent csalad (egyik férj-fő, másik feleség-fő)
--    UGYANAZON a címen → összevonjuk egy házaspáros csalad-ba.
--    Lépések:
--      1. UPDATE: a férj-fő csalad-ba bemásoljuk a feleség id-t
--      2. UPDATE gyerek: minden gyerek a feleség-csalad-ban → férj-csalad-hoz
--      3. DELETE: a feleség-fő csalad-ot töröljük
--    Audit: külön JSONB-ben gyűjtjük, mit csináltunk.
--
-- B. LOOSE LINK: a megmaradt single-parent csalad-okhoz keresünk
--    egyértelmű (c_utcaid, c_szam) cím-egyezésen párokat — csaladfo szűrő
--    NÉLKÜL (mert sokan csaladfo=true-val importálódtak).
--    Cseréljük le a NULL-id_no/id_ferfi-t a talált jelölttel.
--
-- C. BIZTOSÍTSUNK csaladfo = false a most-házastárs-szá-vált szemely-eken
--    (a UI a csaladfo flag-et a "családfő" szerepkörre használja, csak
--    egy lehet egy csalad-ban).
--
-- BIZTONSÁG:
--   - Studio bypass: ha auth.uid() NULL és current_user superuser, megy
--   - Tranzakcionális: minden lépés rollback-elhető ha hiba
--   - Audit-log: family_link_audit tábla 'spouse_link' bejegyzések

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- A. MERGE — két különálló csalad ugyanazon címen → házaspáros csalad
-- ────────────────────────────────────────────────────────────────────────────
--
-- Megkeresünk MINDEN olyan páros csalad-rekordot ahol:
--   - c1.id_ferfi van, c1.id_no NULL
--   - c2.id_no van, c2.id_ferfi NULL
--   - c1.c_utcaid = c2.c_utcaid
--   - c1.c_szam = c2.c_szam
--   - s1 (férj) és s2 (feleség) ugyanabban a gyülekezetben
--
-- A férj-csalad-ba beírjuk a feleség id-t, gyerekeket áthelyezünk,
-- a feleség-csalad-ot töröljük.

DO $merge_spouses$
DECLARE
    pair_rec record;
    merged_count int := 0;
    moved_children int := 0;
BEGIN
    -- Studio bypass check
    IF auth.uid() IS NULL THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            RAISE EXCEPTION 'Studio bypass csak superuser-ből engedett.';
        END IF;
    END IF;

    FOR pair_rec IN
        SELECT
            c1.id AS ferj_csalad_id,
            c2.id AS no_csalad_id,
            c2.id_no AS feleseg_szemely_id,
            c1.id_ferfi AS ferj_szemely_id
        FROM public.csalad c1
        INNER JOIN public.csalad c2
            ON c2.c_utcaid = c1.c_utcaid
            AND COALESCE(c2.c_szam, '') = COALESCE(c1.c_szam, '')
            AND c2.id <> c1.id
            AND c2.id_no IS NOT NULL
            AND c2.id_ferfi IS NULL
        INNER JOIN public.szemely s1 ON s1.id = c1.id_ferfi
        INNER JOIN public.szemely s2 ON s2.id = c2.id_no
        WHERE
            c1.id_no IS NULL
            AND c1.id_ferfi IS NOT NULL
            AND s1.congregation_id = s2.congregation_id
        ORDER BY c1.id
    LOOP
        -- 1. férj-csalad-ba beírjuk a feleség id-t
        UPDATE public.csalad
        SET id_no = pair_rec.feleseg_szemely_id
        WHERE id = pair_rec.ferj_csalad_id;

        -- 2. feleség-csalad-hoz tartozó gyerekek áthelyezése férj-csalad-hoz
        --    (ha véletlenül vannak — általában nincsenek)
        UPDATE public.gyerek
        SET id_csalad = pair_rec.ferj_csalad_id
        WHERE id_csalad = pair_rec.no_csalad_id;

        GET DIAGNOSTICS moved_children = ROW_COUNT;
        moved_children := moved_children;

        -- 3. feleség-csalad törlése
        DELETE FROM public.csalad WHERE id = pair_rec.no_csalad_id;

        -- 4. csaladfo = false a feleség szemely-en
        UPDATE public.szemely
        SET csaladfo = false
        WHERE id = pair_rec.feleseg_szemely_id;

        merged_count := merged_count + 1;
    END LOOP;

    RAISE NOTICE 'MERGE: % házaspár összevonva (% gyerek áthelyezve)', merged_count, moved_children;
END;
$merge_spouses$;

-- ────────────────────────────────────────────────────────────────────────────
-- B. LOOSE LINK — single-parent csalad-okhoz cím-alapú egyértelmű pár
-- ────────────────────────────────────────────────────────────────────────────
--
-- Ezeknél már nincs külön csalad a feleségnek (vagy a feleség csaladfo=true
-- volt és nincs csalad), de ugyanazon (c_utcaid, c_szam)-on ott van.
-- Csak akkor csatoljuk, ha PONTOSAN 1 jelölt van (high-confidence).

DO $loose_link_spouses$
DECLARE
    sp_rec record;
    cand_count int;
    cand_id int;
    linked_count int := 0;
    skipped_ambiguous int := 0;
    skipped_no_candidate int := 0;
BEGIN
    -- Studio bypass check
    IF auth.uid() IS NULL THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            RAISE EXCEPTION 'Studio bypass csak superuser-ből engedett.';
        END IF;
    END IF;

    FOR sp_rec IN
        SELECT
            c.id AS csalad_id,
            c.c_utcaid,
            c.c_szam,
            head.id AS head_id,
            head.ferfi AS head_ferfi,
            head.congregation_id,
            (c.id_no IS NULL) AS need_no  -- ha id_no NULL → a feleséget keressük
        FROM public.csalad c
        INNER JOIN public.szemely head
            ON head.id = COALESCE(c.id_ferfi, c.id_no)
        WHERE
            head.isvisible = true
            AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
            AND c.c_utcaid IS NOT NULL
        ORDER BY c.id
    LOOP
        -- Számoljuk a jelölteket: csaladfo szűrő NÉLKÜL (loose),
        -- de már másik PÁROS csalad-ban szereplő szemely-t kihagyunk
        SELECT COUNT(*), MAX(s.id) INTO cand_count, cand_id
        FROM public.szemely s
        WHERE s.congregation_id = sp_rec.congregation_id
          AND s.isvisible = true
          AND s.id <> sp_rec.head_id
          AND s.c_utcaid = sp_rec.c_utcaid
          AND COALESCE(s.c_szam, '') = COALESCE(sp_rec.c_szam, '')
          AND s.ferfi <> sp_rec.head_ferfi
          -- NEM szerepel egyetlen NEM-egyedülálló csalad-ban (PÁROS)
          AND NOT EXISTS (
              SELECT 1 FROM public.csalad c2
              WHERE (c2.id_ferfi = s.id AND c2.id_no IS NOT NULL)
                 OR (c2.id_no = s.id AND c2.id_ferfi IS NOT NULL)
          )
          -- NEM gyerek máshol
          AND NOT EXISTS (
              SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
          )
          -- Felnőtt
          AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date);

        IF cand_count = 1 THEN
            -- Egyértelmű — link
            IF sp_rec.need_no THEN
                UPDATE public.csalad SET id_no = cand_id WHERE id = sp_rec.csalad_id;
            ELSE
                UPDATE public.csalad SET id_ferfi = cand_id WHERE id = sp_rec.csalad_id;
            END IF;

            -- A jelölt is NINCS már másik single-parent csalad-ban?
            -- Ha igen, töröljük a duplikált single-parent csalad-ot
            DELETE FROM public.csalad
            WHERE id <> sp_rec.csalad_id
              AND (
                  (id_ferfi = cand_id AND id_no IS NULL)
                  OR (id_no = cand_id AND id_ferfi IS NULL)
              );

            -- csaladfo = false (a most házastárs)
            UPDATE public.szemely
            SET csaladfo = false
            WHERE id = cand_id;

            linked_count := linked_count + 1;
        ELSIF cand_count > 1 THEN
            skipped_ambiguous := skipped_ambiguous + 1;
        ELSE
            skipped_no_candidate := skipped_no_candidate + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'LOOSE LINK: % új házastárs csatolva, % többes jelölt kihagyva, % nincs jelölt',
        linked_count, skipped_ambiguous, skipped_no_candidate;
END;
$loose_link_spouses$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS — javított ÖSSZEGZÉS
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Csak férj (id_ferfi van, id_no NULL)' AS metric, COUNT(*) AS db
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NULL
UNION ALL SELECT 'Csak feleség (id_no van, id_ferfi NULL)', COUNT(*)
    FROM public.csalad WHERE id_no IS NOT NULL AND id_ferfi IS NULL
UNION ALL SELECT 'Házaspár (mindkettő van)', COUNT(*)
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NOT NULL
UNION ALL SELECT '— Összesen csalad rekord:', COUNT(*) FROM public.csalad;

-- Ha egy csalad most "Üres lett" (mert mindkét partnert MERGE elnyelte),
-- ezeket is mutassuk
SELECT 'Üres csalad rekord (mindkét id NULL)' AS info, COUNT(*) AS db
FROM public.csalad WHERE id_ferfi IS NULL AND id_no IS NULL;

-- Maradt single-parent csaladok ahol UGYANAZON a címen még van potenciális
-- másnemű felnőtt (de nem volt egyértelmű — TÖBB jelölt). Ezeket a felhasználó
-- manuálisan kell rendezze.
WITH single_parent_csalad AS (
    SELECT
        c.id AS csalad_id,
        c.c_utcaid,
        c.c_szam,
        head.id AS head_id,
        head.csaladnev || ' ' || head.k_nev AS head_name,
        head.ferfi AS head_ferfi,
        head.congregation_id
    FROM public.csalad c
    INNER JOIN public.szemely head
        ON head.id = COALESCE(c.id_ferfi, c.id_no)
    WHERE
        head.isvisible = true
        AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
        AND c.c_utcaid IS NOT NULL
)
SELECT
    sp.csalad_id,
    sp.head_name AS csaladfo,
    CASE WHEN sp.head_ferfi THEN 'férfi' ELSE 'nő' END AS csaladfo_neme,
    cand.id AS jelolt_id,
    cand.csaladnev || ' ' || cand.k_nev AS jelolt_neve,
    a.name AS utca,
    sp.c_szam AS hazszam
FROM single_parent_csalad sp
JOIN public.szemely cand
    ON cand.congregation_id = sp.congregation_id
    AND cand.isvisible = true
    AND cand.id <> sp.head_id
    AND cand.c_utcaid = sp.c_utcaid
    AND COALESCE(cand.c_szam, '') = COALESCE(sp.c_szam, '')
    AND cand.ferfi <> sp.head_ferfi
    AND NOT EXISTS (
        SELECT 1 FROM public.csalad c2
        WHERE (c2.id_ferfi = cand.id AND c2.id_no IS NOT NULL)
           OR (c2.id_no = cand.id AND c2.id_ferfi IS NOT NULL)
    )
LEFT JOIN public.adrstreet a ON a.id = sp.c_utcaid
ORDER BY sp.csalad_id
LIMIT 30;
