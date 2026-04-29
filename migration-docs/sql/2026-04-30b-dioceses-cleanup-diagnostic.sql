-- KARTOTEKA — Dioceses takarítás: diagnosztika a törlések ELŐTT
-- Dátum: 2026-04-30b (második a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR:
-- A `dioceses` táblában 18 sor van, de csak 15 hivatalos egyházmegye létezik
-- a reformatus.ro/cimtar szerint. Endre döntése: 3 sort törölni:
--   1. Marosmezőségi (egybeírva) — duplikáció, helyes neve "Maros-Mezőségi"
--      ID: 43fd33cc-9cf5-4c8d-a61b-c7ab1297e299 → remap → f2a9d632-2b85-41dc-a3fc-9872b84819ae
--   2. Hunyad-Zarándi → remap a "Hunyadi"-ra
--      ID: 87306ff3-3120-44de-b55b-29fbdbc4befe → remap → 88978652-8c11-4a1a-94fb-70cbbb424df5
--   3. Nagysajói → törlendő (nem létezik, kérdés: van-e hivatkozás?)
--      ID: 478fb30e-36fe-43ae-89ed-119f307b4839
--
-- EZ A SCRIPT CSAK FELMÉR — NEM MÓDOSÍT semmit.
-- A pontos FK-listát a Database_schema.sql alapján (REFERENCES public.dioceses):
--   bankszamlak, chitanta_tombok, congregations, diocese_annual_reports,
--   diocese_bealitas, diocese_befizetes, diocese_kiadas, diocese_koltsegvetes,
--   profiles

-- ════════════════════════════════════════════════════════════════════════════
-- Hivatkozások felmérése: 9 tábla, ami diocese_id FK-val rendelkezik
-- ════════════════════════════════════════════════════════════════════════════

WITH targets AS (
    SELECT '43fd33cc-9cf5-4c8d-a61b-c7ab1297e299'::uuid AS id, 'Marosmezőségi (duplikáció)' AS nev
    UNION ALL
    SELECT '87306ff3-3120-44de-b55b-29fbdbc4befe'::uuid, 'Hunyad-Zarándi (Hunyadi-vel azonos)'
    UNION ALL
    SELECT '478fb30e-36fe-43ae-89ed-119f307b4839'::uuid, 'Nagysajói (törlendő)'
),
hivatkozasok AS (
    SELECT 'congregations' AS tabla, diocese_id, COUNT(*) AS db
    FROM public.congregations
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'bankszamlak', diocese_id, COUNT(*)
    FROM public.bankszamlak
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'chitanta_tombok', diocese_id, COUNT(*)
    FROM public.chitanta_tombok
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'diocese_annual_reports', diocese_id, COUNT(*)
    FROM public.diocese_annual_reports
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'diocese_bealitas', diocese_id, COUNT(*)
    FROM public.diocese_bealitas
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'diocese_befizetes', diocese_id, COUNT(*)
    FROM public.diocese_befizetes
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'diocese_kiadas', diocese_id, COUNT(*)
    FROM public.diocese_kiadas
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'diocese_koltsegvetes', diocese_id, COUNT(*)
    FROM public.diocese_koltsegvetes
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id

    UNION ALL
    SELECT 'profiles', diocese_id, COUNT(*)
    FROM public.profiles
    WHERE diocese_id IN (SELECT id FROM targets)
    GROUP BY diocese_id
)

-- 1. Részletes lista táblánként
SELECT t.nev AS torlendo_egyhazmegye, h.tabla, h.db
FROM hivatkozasok h
JOIN targets t ON t.id = h.diocese_id
ORDER BY t.nev, h.tabla;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Összegzés (egy sor egyházmegyénként, az összes hivatkozás darabszámmal)
-- ════════════════════════════════════════════════════════════════════════════

WITH targets AS (
    SELECT '43fd33cc-9cf5-4c8d-a61b-c7ab1297e299'::uuid AS id, 'Marosmezőségi (duplikáció)' AS nev
    UNION ALL
    SELECT '87306ff3-3120-44de-b55b-29fbdbc4befe'::uuid, 'Hunyad-Zarándi (Hunyadi-vel azonos)'
    UNION ALL
    SELECT '478fb30e-36fe-43ae-89ed-119f307b4839'::uuid, 'Nagysajói (törlendő)'
)
SELECT
    t.nev AS torlendo_egyhazmegye,
    t.id,
    COALESCE(c.cong, 0) AS congregations,
    COALESCE(b.bank, 0) AS bankszamlak,
    COALESCE(ct.chit, 0) AS chitanta_tombok,
    COALESCE(da.ann, 0) AS annual_reports,
    COALESCE(db_.beal, 0) AS bealitas,
    COALESCE(dbf.bef, 0) AS befizetes,
    COALESCE(dki.kia, 0) AS kiadas,
    COALESCE(dko.kol, 0) AS koltsegvetes,
    COALESCE(p.prof, 0) AS profiles,
    (COALESCE(c.cong, 0) + COALESCE(b.bank, 0) + COALESCE(ct.chit, 0) +
     COALESCE(da.ann, 0) + COALESCE(db_.beal, 0) + COALESCE(dbf.bef, 0) +
     COALESCE(dki.kia, 0) + COALESCE(dko.kol, 0) + COALESCE(p.prof, 0)) AS osszes_hivatkozas
FROM targets t
LEFT JOIN (SELECT diocese_id, COUNT(*) AS cong FROM public.congregations GROUP BY diocese_id) c ON c.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS bank FROM public.bankszamlak GROUP BY diocese_id) b ON b.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS chit FROM public.chitanta_tombok GROUP BY diocese_id) ct ON ct.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS ann FROM public.diocese_annual_reports GROUP BY diocese_id) da ON da.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS beal FROM public.diocese_bealitas GROUP BY diocese_id) db_ ON db_.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS bef FROM public.diocese_befizetes GROUP BY diocese_id) dbf ON dbf.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS kia FROM public.diocese_kiadas GROUP BY diocese_id) dki ON dki.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS kol FROM public.diocese_koltsegvetes GROUP BY diocese_id) dko ON dko.diocese_id = t.id
LEFT JOIN (SELECT diocese_id, COUNT(*) AS prof FROM public.profiles WHERE diocese_id IS NOT NULL GROUP BY diocese_id) p ON p.diocese_id = t.id
ORDER BY t.nev;

-- ════════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha az "osszes_hivatkozas" minden id-nél 0 → tiszta törlés mehet (cleanup SQL).
-- Ha van pozitív szám → REMAP-elni kell ELŐBB:
--   - Marosmezőségi → Maros-Mezőségi
--   - Hunyad-Zarándi → Hunyadi
--   - Nagysajói → Endre dönti el (ha van hivatkozás)
