-- ============================================================================
-- 2026-06-05b — Időszaki kedvezmény: kezdő dátum (dátum-tartomány)
-- ----------------------------------------------------------------------------
-- Az "Időszaki kedvezmény" (tipus='idoszak') eddig csak EGY határidőt
-- (hatarid, HH-NN) tárolt: "aki eddig fizet, ennyit fizet".
--
-- Mostantól dátum-TARTOMÁNY: minden időszaknak van kezdő ÉS végdátuma, pl.
--   01-01 – 07-01 → 160 RON
--   07-02 – 10-31 → 190 RON
-- A tag aszerint fizet 160-at vagy 190-et, hogy melyik időablakban fizet
-- (a befizetés dátuma melyik [kezdet, hatarid] tartományba esik).
--
-- Mezőkiosztás a 'idoszak' soroknál:
--   kezdet      = az időablak kezdő dátuma (HH-NN) — ÚJ
--   hatarid     = az időablak vég dátuma (HH-NN) — eddig is megvolt
--   kedv_osszeg = ennyit fizet, aki ebben az ablakban fizet
--
-- Visszafelé kompatibilis: ahol kezdet NULL, a régi viselkedés él
-- (kumulatív: "a hataridő-ig befizetett összeg").
-- ============================================================================

ALTER TABLE public.jarulek_kedvezmeny
  ADD COLUMN IF NOT EXISTS kezdet text;

-- Ellenőrzés:
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'jarulek_kedvezmeny'
--     AND column_name = 'kezdet';
