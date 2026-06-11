-- ============================================================================
-- KARTOTÉKA — A rögzítő TELJES választéka + a „+1" azonosítása (2026-06-11)
--
-- MIT CSINÁL: kilistázza az ÖSSZES jelenleg választható kategóriát (bevétel
-- és kiadás), és minden sorról megmondja, szerepel-e a hivatalos
-- egyházközségi Excel-listán (Endre képei: 30 bevétel + 38 kiadás).
-- A KAKUKKTOJÁS (ami választható, de NEM hivatalos egyházközségi tétel)
-- a lista TETEJÉN jelenik meg, „⚠ EZ A +1" jelöléssel.
--
-- FUTTATÁS: Supabase → SQL Editor → Run → a teljes eredményt másold vissza.
-- CSAK OLVAS, semmit nem módosít. (EGYETLEN lekérdezés.)
-- ============================================================================
WITH hivatalos(kod) AS (
  VALUES
  -- bevétel (30)
  ('101.01'),('101.02'),('101.03'),('101.04'),('101.05'),('101.06'),
  ('102.01'),('102.02'),('102.03'),('102.04'),('102.05'),('102.06'),
  ('103.01'),('103.02'),('103.03'),('103.04'),('103.05'),('103.06'),
  ('103.07'),('103.08'),('103.09'),
  ('104.01'),('104.02'),('104.03'),('104.04'),('104.05'),
  ('105.01'),('105.02'),('107.01'),('107.02'),
  -- kiadás (38)
  ('201.01'),('201.02'),('201.03'),('201.04'),('201.05'),('201.06'),
  ('201.07'),('201.08'),('201.09'),('201.10'),('201.11'),('201.12'),
  ('201.13'),('201.14'),
  ('202.01'),('202.02'),('202.03'),('202.04'),('202.05'),('202.06'),
  ('202.07'),('202.08'),
  ('203.01'),('203.02'),('203.03'),('203.04'),('203.05'),('203.06'),('203.07'),
  ('204.01'),('204.02'),('204.03'),('204.04'),
  ('205.01'),('205.02'),('206.01'),('207.01'),('207.02')
),
valasztek AS (
  SELECT 'BEVETEL' AS oldal, b.id_szamadasicel AS kod, s.nev, s.szint
    FROM befizetescel b
    LEFT JOIN szamadasicel s ON s.id = b.id_szamadasicel
   WHERE b.aktiv = true
     AND b.id_szamadasicel ~ '^(10[1-7]|20[1-7])\.[0-9]+$'
     AND (s.szint IS NULL OR s.szint = 'gyulekezet')
  UNION ALL
  SELECT 'KIADAS', k.id_szamadasicel, s.nev, s.szint
    FROM kiadascel k
    LEFT JOIN szamadasicel s ON s.id = k.id_szamadasicel
   WHERE k.aktiv = true
     AND k.id_szamadasicel ~ '^(10[1-7]|20[1-7])\.[0-9]+$'
     AND (s.szint IS NULL OR s.szint = 'gyulekezet')
)
SELECT v.oldal,
       v.kod,
       v.nev,
       CASE WHEN h.kod IS NULL THEN '⚠ EZ A +1 — nem hivatalos egyházközségi tétel!'
            ELSE 'hivatalos ✔' END AS allapot
  FROM valasztek v
  LEFT JOIN hivatalos h ON h.kod = v.kod
 ORDER BY (h.kod IS NULL) DESC, v.oldal, v.kod;
