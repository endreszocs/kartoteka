-- ===================================================================
-- Pénzügyi import: új belső mozgás kód — 300.01
-- ===================================================================
--
-- 2026-05-03 — felhasználói visszajelzés alapján:
--
-- A Kassza fülön szerepel egy 300.01 kódú sor (200 RON, ATM-felvét),
-- "Készpénzfelvétel a(z) A számláról" / "Ridicare numerar" névvel.
-- Ez egy bevétel-oldali belső mozgás (a kasszába érkezett pénz az
-- ATM-ből, vagyis bankról kasszába).
--
-- A 300.01 párja a Bank A fülön valószínűleg 401.01 (kifizetés a kasszába).
-- ===================================================================

-- 1. szamadasicel rekord
INSERT INTO public.szamadasicel (
  id, nevro, nev, sorszam, aktiv, aktivevi, iscel, type, szint
) VALUES (
  '300.01',
  '300.01',
  'Készpénzfelvétel az ATM-ből / banki számláról a kasszába',
  30001,
  true,
  true,
  true,
  'B',
  'gyulekezet'
)
ON CONFLICT (id) DO NOTHING;

-- 2. befizetescel rekord (Kassza fülön bevétel-oldal)
INSERT INTO public.befizetescel (
  nevro, nev, id_szamadasicel, aktiv, belsotetel
) VALUES (
  'ATM/banki felvét',
  'Készpénzfelvétel ATM-ből vagy banki számláról a kasszába',
  '300.01',
  true,
  '300.01'
)
ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ===================================================================
-- Ellenőrzés
-- ===================================================================

SELECT
  sz.id AS kod,
  sz.nev AS szamadasi_nev,
  sz.type,
  bef.id AS befizetescel_id,
  bef.nev AS befizetescel_nev,
  CASE
    WHEN bef.id IS NOT NULL THEN '✓ kész'
    ELSE '⚠️ hiányzik'
  END AS allapot
FROM public.szamadasicel sz
LEFT JOIN public.befizetescel bef ON bef.id_szamadasicel = sz.id
WHERE sz.id = '300.01';
