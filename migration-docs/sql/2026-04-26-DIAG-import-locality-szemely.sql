-- KARTOTEKA DIAGNOSZTIKA — Tagnyilvántartás-import locality + utca eredménye
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — read-only diagnosztika
--
-- Cél: pontos kép arról, hogy a wizard hogyan kezelte a helységeket az importnál.
-- Visszaadja:
--   1. Összesítés: hány tag van, hány gyülekezetben
--   2. Helység-eloszlás: mely adrlocality-kre mutatnak a tagok (név + sorszám)
--   3. Utca-eloszlás: mely adrstreet-ekre mutatnak (top 20)
--   4. Felülvizsgálandó (needs_review) helységek/utcák
--   5. Hiányos helység-csatolás: tagok ahol c_helysegid IS NULL
--   6. Nemenkénti / családfői eloszlás
--   7. Egyházi CNP eloszlás (mind generated EC- prefix?)

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ALAP STATISZTIKA
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    'Összes tag' AS metric,
    COUNT(*) AS db
FROM public.szemely
WHERE isvisible = true
UNION ALL
SELECT
    'Egyedi gyülekezetek',
    COUNT(DISTINCT congregation_id)
FROM public.szemely
WHERE isvisible = true
UNION ALL
SELECT
    'Egyedi családok (csalad tábla)',
    (SELECT COUNT(*) FROM public.csalad)
UNION ALL
SELECT
    'Tagok családfővel (csaladfo=true)',
    (SELECT COUNT(*) FROM public.szemely WHERE isvisible = true AND csaladfo = true)
UNION ALL
SELECT
    'EC- prefixű egyházi CNP',
    (SELECT COUNT(*) FROM public.szemely WHERE isvisible = true AND cnp LIKE 'EC-%')
UNION ALL
SELECT
    'Nem EC- prefixű CNP (külső)',
    (SELECT COUNT(*) FROM public.szemely WHERE isvisible = true AND cnp NOT LIKE 'EC-%' AND cnp IS NOT NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HELYSÉG-ELOSZLÁS — mely adrlocality-kre mutatnak a tagok (top 20)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    l.id AS locality_id,
    l.name AS roman_nev,
    l.name_hu AS magyar_nev,
    c.name AS megye,
    l.default_postalcode AS postakod,
    l.feature_code AS tipus,
    l.needs_review AS felulvizsg,
    COUNT(s.id) AS tag_db,
    COUNT(DISTINCT s.congregation_id) AS gyulekezet_db
FROM public.szemely s
JOIN public.adrstreet st ON st.id = s.c_utcaid
JOIN public.adrlocality l ON l.id = st.localityid
JOIN public.adrcounty c ON c.id = l.countyid
WHERE s.isvisible = true
GROUP BY l.id, l.name, l.name_hu, c.name, l.default_postalcode, l.feature_code, l.needs_review
ORDER BY tag_db DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. UTCA-ELOSZLÁS — top 20 leggyakoribb utca
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    st.id AS street_id,
    st.name AS utca,
    st.postalcode AS postakod,
    l.name AS helyseg,
    c.name AS megye,
    COUNT(s.id) AS tag_db
FROM public.szemely s
JOIN public.adrstreet st ON st.id = s.c_utcaid
JOIN public.adrlocality l ON l.id = st.localityid
JOIN public.adrcounty c ON c.id = l.countyid
WHERE s.isvisible = true
GROUP BY st.id, st.name, st.postalcode, l.name, c.name
ORDER BY tag_db DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. FELÜLVIZSGÁLANDÓ helységek (a wizard "új helység" gomb hozta létre)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    l.id AS locality_id,
    l.name AS nev,
    c.name AS megye,
    l.review_source AS forrás,
    COUNT(s.id) AS hozzá_tartozó_tagok
FROM public.adrlocality l
LEFT JOIN public.adrstreet st ON st.localityid = l.id
LEFT JOIN public.szemely s ON s.c_utcaid = st.id AND s.isvisible = true
JOIN public.adrcounty c ON c.id = l.countyid
WHERE l.needs_review = true
GROUP BY l.id, l.name, c.name, l.review_source
ORDER BY l.id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. HIÁNYOS HELYSÉG-CSATOLÁS — tagok ahol c_helysegid NULL
--    (a c_utcaid van, de a helység-id direkt nem)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    'Tagok c_helysegid = NULL' AS metric,
    COUNT(*) AS db
FROM public.szemely
WHERE isvisible = true AND c_helysegid IS NULL
UNION ALL
SELECT
    'Tagok c_utcaid hivatkozott "Ismeretlen utca"-ra',
    COUNT(*)
FROM public.szemely s
JOIN public.adrstreet st ON st.id = s.c_utcaid
WHERE s.isvisible = true AND LOWER(st.name) = 'ismeretlen utca';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. NEM + CSALÁDFŐ ELOSZLÁS
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    'Férfi családfő' AS kategoria, COUNT(*) AS db
FROM public.szemely WHERE isvisible = true AND ferfi = true AND csaladfo = true
UNION ALL
SELECT 'Nő családfő', COUNT(*)
FROM public.szemely WHERE isvisible = true AND ferfi = false AND csaladfo = true
UNION ALL
SELECT 'Férfi nem-családfő', COUNT(*)
FROM public.szemely WHERE isvisible = true AND ferfi = true AND csaladfo = false
UNION ALL
SELECT 'Nő nem-családfő', COUNT(*)
FROM public.szemely WHERE isvisible = true AND ferfi = false AND csaladfo = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. EXAMPLE — első 5 tag teljes adatlapja (a wizard mit írt be)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    s.id,
    s.cnp,
    s.csaladnev,
    s.k_nev,
    s.ferfi,
    s.csaladfo,
    s.sz_datum,
    l.name AS helyseg,
    st.name AS utca,
    s.c_szam AS hazszam,
    s.c_szcim AS teljes_cim_szöveg,
    s.telefon,
    c.nev_hu AS gyulekezet
FROM public.szemely s
LEFT JOIN public.adrstreet st ON st.id = s.c_utcaid
LEFT JOIN public.adrlocality l ON l.id = st.localityid
LEFT JOIN public.congregations c ON c.id = s.congregation_id
WHERE s.isvisible = true
ORDER BY s.id
LIMIT 5;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. CSALÁDOK állapota (mennyi van a csalad táblában?)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    'Összes csalad rekord' AS metric, COUNT(*) AS db FROM public.csalad
UNION ALL
SELECT 'csalad ahol id_ferfi van', COUNT(*) FROM public.csalad WHERE id_ferfi IS NOT NULL
UNION ALL
SELECT 'csalad ahol id_no van', COUNT(*) FROM public.csalad WHERE id_no IS NOT NULL
UNION ALL
SELECT 'csalad ahol mindkettő van (házaspár)', COUNT(*) FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NOT NULL
UNION ALL
SELECT 'gyerek junction sorok', COUNT(*) FROM public.gyerek;
