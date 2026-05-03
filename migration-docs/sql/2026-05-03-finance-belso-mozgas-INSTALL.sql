-- ===================================================================
-- Pénzügyi import: belső mozgás kódok TELEPÍTŐ SQL
-- ===================================================================
--
-- 2026-05-03 — felhasználói visszajelzés: a 4xx és 301.xx kódok
-- **nincsenek** a `szamadasicel` táblában. Ez az SQL létrehozza a teljes
-- belső-mozgás kód-családot (szamadasicel + befizetescel + kiadascel).
--
-- A type mező konvenciója a Kartotéka-ban:
--   - 'B' = bevétel-természetű kód (a riportokban bevételként jelenik meg)
--   - 'K' = kiadás-természetű kód (a riportokban kiadásként jelenik meg)
--
-- A 4xx és 301.xx kódok mindegyikét egy oldalra rögzítjük a `szamadasicel`-ben,
-- a kód-jellege szerint:
--   - 400.01 (Kassza KIADÁS-oldal) → type='K'
--   - 401.01 (Kassza BEVÉTEL-oldal / Bank KIADÁS) → type='B'
--   - 401.02 (Bank KIADÁS-oldal) → type='K'
--   - 301.01 (Bank BEVÉTEL-oldal) → type='B'
--   - 301.02 (Bank BEVÉTEL-oldal) → type='B'
--
-- Az `aktivevi=true` jelzi, hogy az adott évben aktív; az `iscel=true`
-- jelzi, hogy ez egy "végpont"-cél (nem szülő-csoport).
--
-- BIZTONSÁG: ON CONFLICT (id) DO NOTHING — ha a rekord már létezik,
-- változatlan marad.
-- ===================================================================

-- ───────────────────────────────────────────────────────────────────
-- 1. szamadasicel rekordok (a kódhalom alapja)
-- ───────────────────────────────────────────────────────────────────

INSERT INTO public.szamadasicel (
  id,
  nevro,
  nev,
  sorszam,
  aktiv,
  aktivevi,
  iscel,
  type,
  szint
) VALUES
  ('400.01', '400.01', 'Készpénzletétel a kasszáról a banki számlára',
   40001, true, true, true, 'K', 'gyulekezet'),
  ('401.01', '401.01', 'Készpénzfelvétel a banki számláról a kasszába',
   40101, true, true, true, 'B', 'gyulekezet'),
  ('401.02', '401.02', 'Bank-bank átutalás kimenő (Transfer între conturi)',
   40102, true, true, true, 'K', 'gyulekezet'),
  ('301.01', '301.01', 'Készpénzletétel a kasszából (bankra érkező)',
   30101, true, true, true, 'B', 'gyulekezet'),
  ('301.02', '301.02', 'Bank-bank átutalás érkező (Transfer între conturi)',
   30102, true, true, true, 'B', 'gyulekezet')
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- 2. befizetescel rekordok (BEVÉTEL-oldali belső mozgás)
-- ───────────────────────────────────────────────────────────────────

INSERT INTO public.befizetescel (
  nevro,
  nev,
  id_szamadasicel,
  aktiv,
  belsotetel
) VALUES
  -- 401.01 — Kassza fülön bevétel-oldal (bankról kasszába felvét)
  ('Készpénzfelvétel',
   'Készpénzfelvétel a bankról a kasszába',
   '401.01',
   true,
   '401.01'),
  -- 301.01 — Bank fülön bevétel-oldal (kasszából bankba érkező)
  ('Készpénzletétel',
   'Készpénzletétel a kasszából (bankba érkezik)',
   '301.01',
   true,
   '301.01'),
  -- 301.02 — Bank fülön bevétel-oldal (másik bankszámláról érkező)
  ('Bank-bank átutalás',
   'Átutalás másik banki számláról (érkező)',
   '301.02',
   true,
   '301.02')
ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- 3. kiadascel rekordok (KIADÁS-oldali belső mozgás)
-- ───────────────────────────────────────────────────────────────────

INSERT INTO public.kiadascel (
  nevro,
  nev,
  id_szamadasicel,
  aktiv,
  belsotetel
) VALUES
  -- 400.01 — Kassza fülön kiadás-oldal (kasszából bankra letétel)
  ('Készpénzletétel',
   'Készpénzletétel a kasszáról a banki számlára',
   '400.01',
   true,
   '400.01'),
  -- 401.01 — Bank fülön kiadás-oldal (bankról kasszába kifizetés)
  ('Készpénzfelvétel',
   'Készpénzfelvétel a bankról a kasszába (kifizetés)',
   '401.01',
   true,
   '401.01'),
  -- 401.02 — Bank fülön kiadás-oldal (másik bankszámlára kimenő)
  ('Bank-bank átutalás',
   'Átutalás másik banki számlára (kimenő)',
   '401.02',
   true,
   '401.02')
ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ===================================================================
-- ELLENŐRZÉS — minden rekord létezik-e
-- ===================================================================

SELECT
  sz.id AS kod,
  sz.nev AS szamadasi_nev,
  sz.type AS oldal_type,
  bef.id AS befizetescel_id,
  bef.nev AS befizetescel_nev,
  kia.id AS kiadascel_id,
  kia.nev AS kiadascel_nev,
  CASE
    WHEN sz.type = 'B' AND bef.id IS NOT NULL THEN '✓ BEVÉTEL OLDAL kész'
    WHEN sz.type = 'K' AND kia.id IS NOT NULL THEN '✓ KIADÁS OLDAL kész'
    WHEN sz.type = 'B' AND bef.id IS NULL THEN '⚠️ Hiányzik a befizetescel'
    WHEN sz.type = 'K' AND kia.id IS NULL THEN '⚠️ Hiányzik a kiadascel'
    ELSE '?'
  END AS allapot
FROM public.szamadasicel sz
LEFT JOIN public.befizetescel bef ON bef.id_szamadasicel = sz.id
LEFT JOIN public.kiadascel kia ON kia.id_szamadasicel = sz.id
WHERE sz.id IN ('400.01', '401.01', '401.02', '301.01', '301.02')
ORDER BY sz.id;
