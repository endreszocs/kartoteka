-- ===================================================================
-- Belső mozgás kódok TELEPÍTÉSE — a hivatalos Adatok_2025.xlsx alapján
-- ===================================================================
--
-- 2026-06-10 — felhasználói visszajelzés: „1 sor kimarad … Ismeretlen kód: 300.01".
--
-- A hivatalos `Adatok_2025.xlsx` PONTOSAN az alábbi belső-mozgás kódokat használja
-- (a Kassza + A–F lapok elemzése alapján):
--
--   Kód      Lap        Oldal      Pár            Tartalom
--   ------   --------   --------   ------------   --------------------------------------
--   400.01   Kassza     kiadás  →  Bank 301.01    Készpénzletétel a kasszából a bankra (87 855 RON, 15 sor)
--   301.01   Bank A     bevétel ←  Kassza 400.01  Készpénzletétel a kasszából (bankba érkezik)
--   300.01   Kassza     bevétel ←  Bank 401.01    Készpénzfelvétel ATM-ből / bankról a kasszába (200 RON)
--   401.01   Bank A     kiadás  →  Kassza 300.01  Készpénzfelvétel a kasszába (bankról)
--   402.02   Bank       mindkét              -    Bank-bank átutalás (jövőbeli; biztonságból telepítjük)
--
-- A pár-összegek a fájlban TÖKÉLETESEN egyeznek (400.01 = 301.01 = 87 855; 300.01 = 401.01 = 200),
-- ezért a belső mozgások az éves számadásban kiegyenlítik egymást.
--
-- Idempotens: minden INSERT `ON CONFLICT DO NOTHING`, többször is futtatható.
-- A szamadasicel/befizetescel/kiadascel táblák GLOBÁLISAK (nincs congregation_id).
-- ===================================================================

-- ───────────────────────────────────────────────────────────────────
-- 1. szamadasicel rekordok (a kód-szótár alaptáblája)
-- ───────────────────────────────────────────────────────────────────
INSERT INTO public.szamadasicel
  (id, nevro, nev, sorszam, aktiv, aktivevi, iscel, belsotetel, type, szint)
VALUES
  ('300.01', '300.01', 'Készpénzfelvétel ATM-ből / banki számláról a kasszába', 30001, true, true, true, '300.01', 'B', 'gyulekezet'),
  ('301.01', '301.01', 'Készpénzletétel a kasszából (bankba érkezik)',          30101, true, true, true, '301.01', 'B', 'gyulekezet'),
  ('400.01', '400.01', 'Készpénzletétel a kasszából a bankra (kimenő)',         40001, true, true, true, '400.01', 'K', 'gyulekezet'),
  ('401.01', '401.01', 'Készpénzfelvétel a bankról (kifizetés a kasszába)',      40101, true, true, true, '401.01', 'K', 'gyulekezet'),
  ('402.02', '402.02', 'Bank-bank átutalás (Transfer între conturi)',           40202, true, true, true, '402.02', 'K', 'gyulekezet')
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- 2. befizetescel rekordok (BEVÉTEL-oldali belső mozgás — ahol a pénz ÉRKEZIK)
-- ───────────────────────────────────────────────────────────────────
INSERT INTO public.befizetescel (nevro, nev, id_szamadasicel, aktiv, belsotetel)
VALUES
  ('ATM/banki felvét',   'Készpénzfelvétel ATM-ből vagy banki számláról a kasszába', '300.01', true, '300.01'),
  ('Készpénzletétel',    'Készpénzletétel a kasszából (bankba érkezik)',             '301.01', true, '301.01'),
  ('Bank-bank átvitel',  'Átutalás másik bankszámláról (érkező)',                    '402.02', true, '402.02')
ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- 3. kiadascel rekordok (KIADÁS-oldali belső mozgás — ahol a pénz TÁVOZIK)
-- ───────────────────────────────────────────────────────────────────
INSERT INTO public.kiadascel (nevro, nev, id_szamadasicel, aktiv, belsotetel)
VALUES
  ('Készpénzletétel',    'Készpénzletétel a kasszából a bankra (kimenő)',  '400.01', true, '400.01'),
  ('Készpénzfelvétel',   'Készpénzfelvétel a bankról a kasszába (kimenő)', '401.01', true, '401.01'),
  ('Bank-bank átvitel',  'Átutalás másik bankszámlára (kimenő)',           '402.02', true, '402.02')
ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ===================================================================
-- Ellenőrzés — minden belső-mozgás kódhoz megvan-e a megfelelő cel?
-- ===================================================================
SELECT
  sz.id AS kod,
  sz.nev AS szamadasi_nev,
  bef.id AS befizetescel_id,
  kia.id AS kiadascel_id,
  CASE
    WHEN sz.id IN ('300.01','301.01') AND bef.id IS NOT NULL THEN '✓ befizetescel kész'
    WHEN sz.id IN ('400.01','401.01') AND kia.id IS NOT NULL THEN '✓ kiadascel kész'
    WHEN sz.id = '402.02' AND bef.id IS NOT NULL AND kia.id IS NOT NULL THEN '✓ mindkettő kész'
    ELSE '⚠️ hiányzik'
  END AS allapot
FROM public.szamadasicel sz
LEFT JOIN public.befizetescel bef ON bef.id_szamadasicel = sz.id
LEFT JOIN public.kiadascel kia ON kia.id_szamadasicel = sz.id
WHERE sz.id IN ('300.01','301.01','400.01','401.01','402.02')
ORDER BY sz.id;
