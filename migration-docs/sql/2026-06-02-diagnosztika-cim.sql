-- ────────────────────────────────────────────────────────────────────────
-- Diagnosztika: miért nem jelennek meg a címek a Családok oldalon?
-- ────────────────────────────────────────────────────────────────────────
-- Dátum: 2026-06-02
-- Cél: A `getFamilies()` action a haztartas → cim → adrstreet láncból
--      olvas. Ha bármelyik lánc-elemen NULL/üres adat van, „cím hiányzik"
--      jelenik meg a kártyán. Ezzel a SQL-szel megnézheted, hol szakad.
--
-- HOGYAN FUTTASD:
--   1. Supabase Dashboard → SQL Editor
--   2. Másold be ezt a teljes fájlt
--   3. Futtasd
--   4. Küldd át nekem a 4 lekérdezés eredményét

-- ────────────────────────────────────────────────────────────────────────
-- 1. Hány haztartas rekord van? Hányhoz van id_cim?
-- ────────────────────────────────────────────────────────────────────────
SELECT
  'haztartas — összesítés' AS info,
  COUNT(*) AS total,
  COUNT(id_cim) AS with_id_cim,
  COUNT(*) - COUNT(id_cim) AS without_id_cim
FROM public.haztartas
WHERE ervenyes_ig IS NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Hány cim-rekord van? Hányhoz van id_utca és szam?
-- ────────────────────────────────────────────────────────────────────────
SELECT
  'cim — összesítés' AS info,
  COUNT(*) AS total,
  COUNT(id_utca) AS with_id_utca,
  COUNT(CASE WHEN szam IS NOT NULL AND szam <> '' THEN 1 END) AS with_szam,
  COUNT(CASE WHEN id_utca IS NULL AND (szam IS NULL OR szam = '') THEN 1 END) AS fully_empty
FROM public.cim;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Példa-sorok: haztartas → cim → adrstreet lánc minden lépésével
-- ────────────────────────────────────────────────────────────────────────
SELECT
  h.id AS haztartas_id,
  h.legacy_csalad_id,
  h.id_cim,
  c.id AS cim_id,
  c.szam AS cim_szam,
  c.id_utca,
  a.name AS adrstreet_name,
  c.megjegyzes AS cim_megjegyzes
FROM public.haztartas h
LEFT JOIN public.cim c ON c.id = h.id_cim
LEFT JOIN public.adrstreet a ON a.id = c.id_utca
WHERE h.ervenyes_ig IS NULL
  AND h.legacy_csalad_id IS NOT NULL
ORDER BY h.legacy_csalad_id
LIMIT 15;

-- ────────────────────────────────────────────────────────────────────────
-- 4. Régi csalad tábla: van-e c_utcaid + c_szam tényleg? (kontroll)
-- ────────────────────────────────────────────────────────────────────────
SELECT
  c.id AS csalad_id,
  c.c_utcaid,
  c.c_szam,
  a.name AS adrstreet_name,
  COALESCE(s_f.csaladnev, s_n.csaladnev) AS csaladnev_minta
FROM public.csalad c
LEFT JOIN public.adrstreet a ON a.id = c.c_utcaid
LEFT JOIN public.szemely s_f ON s_f.id = c.id_ferfi
LEFT JOIN public.szemely s_n ON s_n.id = c.id_no
ORDER BY c.id
LIMIT 15;

-- ────────────────────────────────────────────────────────────────────────
-- 5. Mismatch — haztartas-okon ahol a cim üres, DE a régi csalad-on
--    van valódi cím-adat (= backfill subquery hibázott)
-- ────────────────────────────────────────────────────────────────────────
SELECT
  h.id AS haztartas_id,
  h.legacy_csalad_id,
  c_regi.c_utcaid AS regi_c_utcaid,
  c_regi.c_szam AS regi_c_szam,
  a_regi.name AS regi_utca,
  h.id_cim AS uj_id_cim,
  c_uj.szam AS uj_cim_szam,
  c_uj.id_utca AS uj_cim_id_utca,
  a_uj.name AS uj_utca
FROM public.haztartas h
JOIN public.csalad c_regi ON c_regi.id = h.legacy_csalad_id
LEFT JOIN public.adrstreet a_regi ON a_regi.id = c_regi.c_utcaid
LEFT JOIN public.cim c_uj ON c_uj.id = h.id_cim
LEFT JOIN public.adrstreet a_uj ON a_uj.id = c_uj.id_utca
WHERE h.ervenyes_ig IS NULL
  AND h.legacy_csalad_id IS NOT NULL
  AND c_regi.c_utcaid IS NOT NULL  -- a régi csalad-on van utca
  AND (c_uj.id_utca IS NULL OR a_uj.name IS NULL)  -- DE az új cim-en nincs
LIMIT 20;
