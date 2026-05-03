-- ===================================================================
-- Pénzügyi import: 4xx belső mozgás cél-rekordok ellenőrzése
-- ===================================================================
--
-- 2026-05-03 (frissítve): a belső mozgás teljes kódtartománya
--
-- Az EREK könyvelési számhalomban a 4xx kód-tartomány a belső pénzmozgásokat
-- fedi le:
--   - 400.xx — Készpénzletétel a kasszáról bankra  (Kassza fül, kimenő)
--   - 401.xx — Készpénzfelvétel bankról kasszára   (Kassza fül, érkező)
--   - 402.xx — Transfer între conturi (bank-bank)  (Bank fülek)
--
-- A párja a 3xx tartományban él (a Bank fülön):
--   - 301.xx — Készpénzletétel a kasszából - bankra
--
-- A pénzügyi import-wizard a 4xx kódhoz tartozó `kiadascel` rekordokra
-- van rácsatlakozva, mert a Kassza fülön a kassza-oldali kiadás kerül be.
--
-- Ha valamelyik kódhoz hiányzik a megfelelő `kiadascel` rekord, a wizard
-- nem tudja importálni az adott sort (mert a `kiadas.id_kiadascel` NOT NULL).
-- ===================================================================

-- ───────────────────────────────────────────────────────────────────
-- 1. Diagnosztika — mit talál most a rendszer
-- ───────────────────────────────────────────────────────────────────

SELECT 'szamadasicel' AS tabla, id, nev, type, aktiv, szint
FROM public.szamadasicel
WHERE id LIKE '4%' OR id LIKE '301%'
ORDER BY id;

SELECT 'befizetescel' AS tabla, id, nev, nevro, id_szamadasicel, aktiv, belsotetel
FROM public.befizetescel
WHERE id_szamadasicel LIKE '4%' OR id_szamadasicel LIKE '301%'
ORDER BY id_szamadasicel;

SELECT 'kiadascel' AS tabla, id, nev, nevro, id_szamadasicel, aktiv, belsotetel
FROM public.kiadascel
WHERE id_szamadasicel LIKE '4%' OR id_szamadasicel LIKE '301%'
ORDER BY id_szamadasicel;

-- ───────────────────────────────────────────────────────────────────
-- 2. Áttekintés — minden 4xx és 301 kódhoz mindkét cel megvan-e?
-- ───────────────────────────────────────────────────────────────────

SELECT
  sz.id AS kod,
  sz.nev AS szamadasi_cel_nev,
  bef.id AS befizetescel_id,
  bef.nev AS befizetescel_nev,
  kia.id AS kiadascel_id,
  kia.nev AS kiadascel_nev,
  CASE
    WHEN bef.id IS NULL AND kia.id IS NULL THEN '⚠️ Mindkét cel hiányzik'
    WHEN bef.id IS NULL THEN '⚠️ Hiányzik a befizetescel'
    WHEN kia.id IS NULL THEN '⚠️ Hiányzik a kiadascel'
    ELSE '✓ Mindkettő megvan'
  END AS allapot,
  CASE
    WHEN sz.id LIKE '400%' THEN 'Kassza→Bank letétel (kassza-oldal kimenő)'
    WHEN sz.id LIKE '401%' THEN 'Bank→Kassza felvét (kassza-oldal érkező)'
    WHEN sz.id LIKE '402%' THEN 'Bank-bank átvitel (Transfer între conturi)'
    WHEN sz.id LIKE '301%' THEN 'Készpénzletétel a kasszából (bank-oldal érkező)'
    ELSE '?'
  END AS jellege
FROM public.szamadasicel sz
LEFT JOIN public.befizetescel bef ON bef.id_szamadasicel = sz.id
LEFT JOIN public.kiadascel kia ON kia.id_szamadasicel = sz.id
WHERE (sz.id LIKE '4%' OR sz.id LIKE '301%')
  AND sz.aktiv = true
ORDER BY sz.id;

-- ───────────────────────────────────────────────────────────────────
-- 3. Opcionális — létrehozás a hiányzó cel-rekordokhoz
-- ───────────────────────────────────────────────────────────────────
--
-- Csak akkor futtasd a vonatkozó INSERT-et, ha a fenti diagnosztika
-- alapján LÁTOD, hogy a megfelelő szamadasicel létezik, de a
-- befizetescel és/vagy kiadascel hiányzik.
--
-- A kódok PÁRBAN MŰKÖDNEK:
--   - 400.01 (Kassza→Bank kimenő) → kell `kiadascel`
--   - 301.01 (Bank-oldal érkező)  → kell `befizetescel`
--   - 401.01 (Bank→Kassza érkező) → kell `befizetescel`
--   - 402.02 (Bank→Bank)          → kell `befizetescel` ÉS `kiadascel`

-- 3.a — befizetescel rekordok (BEVÉTEL-oldali belső mozgás)
-- A bevétel-oldali kódok ott jelennek meg, ahol a pénz ÉRKEZIK.
--
-- INSERT INTO public.befizetescel (
--   nevro, nev, id_szamadasicel, aktiv, belsotetel
-- ) VALUES
--   -- 401.01: a Kassza fülön bevétel-oldal — bankról érkező készpénzfelvét
--   ('Készpénzfelvétel', 'Készpénzfelvétel a bankról a kasszába', '401.01', true, '401.01'),
--   -- 301.01: a Bank A fülön bevétel-oldal — kasszából érkező letétel
--   ('Készpénzletétel', 'Készpénzletétel a kasszából (bankba érkezik)', '301.01', true, '301.01'),
--   -- 301.02: a Bank A fülön bevétel-oldal — másik bankszámláról érkező átutalás
--   ('Bank-bank átvitel', 'Átutalás másik számláról (érkező)', '301.02', true, '301.02')
-- ON CONFLICT (id_szamadasicel) DO NOTHING;

-- 3.b — kiadascel rekordok (KIADÁS-oldali belső mozgás)
-- A kiadás-oldali kódok ott jelennek meg, ahol a pénz TÁVOZIK.
--
-- INSERT INTO public.kiadascel (
--   nevro, nev, id_szamadasicel, aktiv, belsotetel
-- ) VALUES
--   -- 400.01: a Kassza fülön kiadás-oldal — bankra letett pénz
--   ('Készpénzletétel', 'Készpénzletétel a kasszából bankra (kimenő)', '400.01', true, '400.01'),
--   -- 401.01: a Bank A fülön kiadás-oldal — kasszába felvett pénz
--   ('Készpénzfelvétel', 'Készpénzfelvétel a bankról (kifizetés)', '401.01', true, '401.01'),
--   -- 401.02: a Bank A fülön kiadás-oldal — másik bankszámlára átutalás (kimenő)
--   ('Bank-bank átvitel', 'Átutalás másik számlára (kimenő)', '401.02', true, '401.02'),
--   -- 402.02: bank-bank átvitel általános
--   ('Bank-bank átvitel', 'Transfer între conturi (általános)', '402.02', true, '402.02')
-- ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- Megjegyzés: a 2025-ös EREK Adatok_2025.xlsx Kassza fülén csak
--   - 400.01 (15 sor)
--   - 401.01 (1 sor)
-- van. A 402.xx és 301.xx a Bank A/B fülről jön majd a v2 import idején.
-- ───────────────────────────────────────────────────────────────────
