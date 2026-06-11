-- ============================================================================
-- KARTOTÉKA — 106.01 visszaállítása gyülekezeti szintre (2026-06-11)
--
-- KORREKCIÓ (Endre, 2026-06-11): a 106.01 „Bevételek más egyházi intézmények
-- részére" GYÜLEKEZETI szintű tétel — tévesen maradt ki a hivatalos listából.
-- A helyes egyházközségi bevétel-készlet tehát 31 tételes (a korábbi 30 + ez).
--
-- MIT CSINÁL: a 106.01-et kifejezetten gyülekezeti szintűnek jelöli.
-- AKKOR IS HELYES, ha a korábbi l-szkript már lefutott (visszaállítja),
-- és akkor is, ha nem futott le (megerősíti a helyes állapotot).
-- A többi 18 felsőbb szintű kód jelölését NEM érinti.
--
-- FUTTATÁS: Supabase → SQL Editor → az egészet illeszd be → Run →
-- a megjelenő ellenőrző táblázatot másold vissza.
-- ============================================================================

-- 1) A 106.01 gyülekezeti szintre állítása
UPDATE szamadasicel
   SET szint = 'gyulekezet'
 WHERE id = '106.01';

-- 2) Ellenőrzés: a 106.01 állapota + a gyülekezeti bevétel-választék darabszáma
--    ELVÁRT: szint = 'gyulekezet' · valasztekban = IGEN · bevetel_db = 31
SELECT s.id AS kod,
       s.nev,
       s.szint,
       CASE WHEN b.id IS NOT NULL AND b.aktiv = true THEN 'IGEN' ELSE 'NEM' END AS valasztekban,
       (SELECT COUNT(*)
          FROM befizetescel b2
          LEFT JOIN szamadasicel s2 ON s2.id = b2.id_szamadasicel
         WHERE b2.aktiv = true
           AND b2.id_szamadasicel ~ '^10[1-7]\.[0-9]+$'
           AND (s2.szint IS NULL OR s2.szint = 'gyulekezet')) AS bevetel_db
  FROM szamadasicel s
  LEFT JOIN befizetescel b ON b.id_szamadasicel = s.id
 WHERE s.id = '106.01';
