-- KARTOTEKA — Hiányzó házastársak diagnosztikája
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR:
-- A `csaladok.xml` import minden sora EGY single-parent családot hoz létre:
-- vagy `id_ferfi` van benne (férj-fő), vagy `id_no` (feleség-fő), de
-- mindkettő SOHA. A párosítás dolga az `infer_family_links_for_congregation`
-- RPC. Endre észrevette: "A családoknál sok helyen nincs házastás, pedig
-- kellene legyen!"
--
-- Ez a script:
--   1. SUMMARY: hány family single-parent vs házaspár
--   2. POTENCIÁLIS PÁROK: ugyanazon (c_utcaid, c_szam) másnemű felnőttek
--   3. NULL CÍM-PROBLÉMA: hány csalad-nak nincs c_utcaid (akkor cím-egyezés
--      lehetetlen)
--   4. NÉV-PÁR ALAPÚ PÁROSÍTÁS: hány feleség volna párosítható csak NÉV
--      alapján (ha az anyjaneve a férj nevére hasonlít vagy fordítva)
--
-- Nem ír semmit. Csak SELECT-ek.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ÖSSZEGZÉS — családok típus szerint
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Csak férj (id_ferfi van, id_no NULL)' AS metric, COUNT(*) AS db
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NULL
UNION ALL SELECT 'Csak feleség (id_no van, id_ferfi NULL)', COUNT(*)
    FROM public.csalad WHERE id_no IS NOT NULL AND id_ferfi IS NULL
UNION ALL SELECT 'Házaspár (mindkettő van)', COUNT(*)
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NOT NULL
UNION ALL SELECT 'Üres család (mindkettő NULL!)', COUNT(*)
    FROM public.csalad WHERE id_ferfi IS NULL AND id_no IS NULL
UNION ALL SELECT '— Összesen csalad rekord:', COUNT(*) FROM public.csalad;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. NULL CÍM-PROBLÉMA — hány csalad-nak nincs c_utcaid
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha c_utcaid NULL → az auto-link cím-egyezés alapján LEHETETLEN.
-- A felhasználónak valószínűleg manuálisan kell hozzárendelnie az utcát,
-- VAGY a wizard utca-resolválás hibásan ment.

SELECT
    'csalad rekord ahol c_utcaid IS NULL' AS metric, COUNT(*) AS db
    FROM public.csalad WHERE c_utcaid IS NULL
UNION ALL SELECT
    'csalad rekord ahol c_utcaid van', COUNT(*)
    FROM public.csalad WHERE c_utcaid IS NOT NULL
UNION ALL SELECT
    'csalad rekord ahol c_szam IS NULL/üres', COUNT(*)
    FROM public.csalad WHERE c_szam IS NULL OR btrim(c_szam) = '';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. POTENCIÁLIS HÁZASPÁROK — ugyanazon címen lakó másnemű felnőttek
-- ════════════════════════════════════════════════════════════════════════════
--
-- Megnézzük, hány csalad single-parent ahol UGYANAZON a (c_utcaid, c_szam)-on
-- létezik EGY másnemű felnőtt szemely aki:
--   - NEM csaladfo
--   - NINCS már csalad-ban
--   - NINCS gyerek-ben
--   - 16+ év (felnőtt)
--
-- Ezek lennének a HIGH-CONFIDENCE auto-link kandidátusok.

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
), candidate_check AS (
    SELECT
        sp.csalad_id,
        sp.head_id,
        sp.head_name,
        sp.head_ferfi,
        (
            SELECT COUNT(*)
            FROM public.szemely s
            WHERE s.congregation_id = sp.congregation_id
              AND s.isvisible = true
              AND s.id <> sp.head_id
              AND s.c_utcaid = sp.c_utcaid
              AND COALESCE(s.c_szam, '') = COALESCE(sp.c_szam, '')
              AND s.ferfi <> sp.head_ferfi
              AND s.csaladfo = false
              AND NOT EXISTS (
                  SELECT 1 FROM public.csalad c2
                  WHERE c2.id_ferfi = s.id OR c2.id_no = s.id
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
              )
              AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date)
        ) AS num_candidates
    FROM single_parent_csalad sp
)
SELECT
    'Single-parent csalad EGYBŐL párosítható (1 jelölt)' AS metric, COUNT(*) AS db
    FROM candidate_check WHERE num_candidates = 1
UNION ALL SELECT
    'Single-parent csalad TÖBB jelölt (kézi döntés)', COUNT(*)
    FROM candidate_check WHERE num_candidates > 1
UNION ALL SELECT
    'Single-parent csalad NINCS jelölt (cím-egyezés nem hozott)', COUNT(*)
    FROM candidate_check WHERE num_candidates = 0;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. PROBLÉMA-DETEKCIÓ — miért nincs jelölt? a feleség `csaladfo = true`-e?
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha a feleség is `csaladfo = true` (mert valahogy úgy importálódott vagy
-- manuálisan állították), akkor az `infer_family_links` SZŰRŐ kihagyja!
-- Ezért NULLA jelöltet talál.
--
-- Ez azt jelenti: az XML-ben sok család esetén MINDKÉT házasfél bekerült
-- "családfő"-ként a szemely-tagként, és külön egy-egy single-parent csalad
-- rekordjuk lett. Ez explicit párosítást igényel.

SELECT
    'Szemely.csaladfo = true (összesen)' AS metric, COUNT(*) AS db
    FROM public.szemely WHERE csaladfo = true AND isvisible = true
UNION ALL SELECT
    '... ebből férfi', COUNT(*)
    FROM public.szemely WHERE csaladfo = true AND isvisible = true AND ferfi = true
UNION ALL SELECT
    '... ebből nő', COUNT(*)
    FROM public.szemely WHERE csaladfo = true AND isvisible = true AND ferfi = false
UNION ALL SELECT
    'Szemely.csaladfo = true ÉS NINCS csalad-ban', COUNT(*)
    FROM public.szemely s
    WHERE s.csaladfo = true AND s.isvisible = true
      AND NOT EXISTS (
          SELECT 1 FROM public.csalad c WHERE c.id_ferfi = s.id OR c.id_no = s.id
      );

-- ════════════════════════════════════════════════════════════════════════════
-- 5. POTENCIÁLIS HÁZASTÁRSAK — `csaladfo`-szűrő LEVÉTELÉVEL is keressünk
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ez mutatja meg, hány single-parent csalad-nak van potenciális párja
-- ugyanazon a (c_utcaid, c_szam)-on, FÜGGETLENÜL attól hogy a feleség
-- csaladfo = true. Ez a "valódi" páratlan szám.

WITH single_parent_csalad AS (
    SELECT
        c.id AS csalad_id,
        c.c_utcaid,
        c.c_szam,
        head.id AS head_id,
        head.ferfi AS head_ferfi,
        head.congregation_id
    FROM public.csalad c
    INNER JOIN public.szemely head
        ON head.id = COALESCE(c.id_ferfi, c.id_no)
    WHERE
        head.isvisible = true
        AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
        AND c.c_utcaid IS NOT NULL
), candidate_check_loose AS (
    SELECT
        sp.csalad_id,
        (
            SELECT COUNT(*)
            FROM public.szemely s
            WHERE s.congregation_id = sp.congregation_id
              AND s.isvisible = true
              AND s.id <> sp.head_id
              AND s.c_utcaid = sp.c_utcaid
              AND COALESCE(s.c_szam, '') = COALESCE(sp.c_szam, '')
              AND s.ferfi <> sp.head_ferfi
              -- NINCS csaladfo szűrő (loose)
              -- NINCS már másik csalad-ban (single-parent VAGY már single-parent főben)
              AND NOT EXISTS (
                  SELECT 1 FROM public.csalad c2
                  WHERE (c2.id_ferfi = s.id AND c2.id_no IS NOT NULL)
                     OR (c2.id_no = s.id AND c2.id_ferfi IS NOT NULL)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
              )
              AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date)
        ) AS num_candidates_loose
    FROM single_parent_csalad sp
)
SELECT
    'LOOSE: Single-parent EGYBŐL párosítható (1 jelölt)' AS metric, COUNT(*) AS db
    FROM candidate_check_loose WHERE num_candidates_loose = 1
UNION ALL SELECT
    'LOOSE: Single-parent TÖBB jelölt', COUNT(*)
    FROM candidate_check_loose WHERE num_candidates_loose > 1
UNION ALL SELECT
    'LOOSE: Single-parent NINCS jelölt', COUNT(*)
    FROM candidate_check_loose WHERE num_candidates_loose = 0;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. SAMPLE — első 20 single-parent csalad ahol VAN egyértelmű jelölt (LOOSE)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hogy lásd, milyen párosításokat tudunk csinálni.

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
    cand.csaladfo AS jelolt_csaladfo_flag,
    CASE WHEN cand.ferfi THEN 'férfi' ELSE 'nő' END AS jelolt_neme,
    cand.sz_datum AS jelolt_sz_datum,
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
    AND NOT EXISTS (
        SELECT 1 FROM public.gyerek g WHERE g.id_szemely = cand.id
    )
    AND (cand.sz_datum IS NULL OR cand.sz_datum <= (now() - interval '16 years')::date)
LEFT JOIN public.adrstreet a ON a.id = sp.c_utcaid
ORDER BY sp.csalad_id
LIMIT 20;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. DUPLA SINGLE-PARENT — két különböző csalad-rekordban van férj és feleség?
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha mindkét házasfél a `csaladok.xml`-ben szerepelt mint csaladfo-bejegyzés
-- (pl. férj egyik sorban, feleség másikban), akkor KÉT különböző csalad
-- rekordjuk van — egyik csak id_ferfi, másik csak id_no — ugyanazon a címen.
--
-- Ezt detektáljuk: két single-parent csalad ugyanazon (c_utcaid, c_szam)-on,
-- ahol az egyikben férj van, a másikban feleség. Ezt MERGE-elni kell:
-- a két rekordot eggyé összevonni.

SELECT
    c1.id AS ferj_csalad_id,
    s1.csaladnev || ' ' || s1.k_nev AS ferj_neve,
    c2.id AS no_csalad_id,
    s2.csaladnev || ' ' || s2.k_nev AS no_neve,
    a.name AS utca,
    c1.c_szam AS hazszam
FROM public.csalad c1
INNER JOIN public.szemely s1 ON s1.id = c1.id_ferfi
INNER JOIN public.csalad c2
    ON c2.c_utcaid = c1.c_utcaid
    AND COALESCE(c2.c_szam, '') = COALESCE(c1.c_szam, '')
    AND c2.id <> c1.id
    AND c2.id_no IS NOT NULL
    AND c2.id_ferfi IS NULL
INNER JOIN public.szemely s2 ON s2.id = c2.id_no
LEFT JOIN public.adrstreet a ON a.id = c1.c_utcaid
WHERE
    c1.id_no IS NULL
    AND c1.id_ferfi IS NOT NULL
    AND s1.congregation_id = s2.congregation_id
ORDER BY c1.id
LIMIT 50;
