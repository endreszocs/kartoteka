-- =========================================================================
-- 2026-04-18 — Chitanță finomítás: román reprezentand + teljes gyülekezeti cím
-- =========================================================================
-- CÉL:
--   1. A nyugtán a "reprezentând (címén)" mezőbe MAGYAR + ROMÁN szöveg
--      kerüljön (mint az "adică / éspedig" mezőnél).
--      → Új oszlop: oblio_szamlak.reprezentand_ro
--      → Az auto-kiállításnál a befizetescel.nevro-t is olvassa
--
--   2. A nyugta fejlécében a "Sediul / Székhely" sorban ne csak az utca,
--      hanem a falu/város + megye is jelenjen meg.
--      → Új oszlopok: congregations.varos, congregations.megye
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

BEGIN;

-- 1) oblio_szamlak.reprezentand_ro
ALTER TABLE public.oblio_szamlak
  ADD COLUMN IF NOT EXISTS reprezentand_ro text;

COMMENT ON COLUMN public.oblio_szamlak.reprezentand_ro IS
  'A "reprezentând (címén)" mező ROMÁN fordítása — a befizetescel.nevro-ból automatikusan kitöltve.';

-- 2) congregations.varos + megye (ha még nem létezik)
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS varos text,
  ADD COLUMN IF NOT EXISTS megye text;

COMMENT ON COLUMN public.congregations.varos IS
  'Gyülekezeti székhely városa / falva (pl. "Brateș"). A nyugta fejlécében a Sediul sorban jelenik meg.';

COMMENT ON COLUMN public.congregations.megye IS
  'Gyülekezeti székhely megyéje (pl. "Jud. Covasna"). A nyugta fejlécében a Sediul sorban jelenik meg.';

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

-- 1) Az új oszlopok megvannak?
SELECT
  'oblio_szamlak.reprezentand_ro' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='oblio_szamlak'
      AND column_name='reprezentand_ro'
  ) AS result
UNION ALL
SELECT
  'congregations.varos',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='congregations'
      AND column_name='varos'
  )
UNION ALL
SELECT
  'congregations.megye',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='congregations'
      AND column_name='megye'
  );

-- 2) Ha szeretnéd, töltsd ki a saját gyülekezeted adatait
--    (cseréld le a gyülekezet nevét és a megfelelő értékeket!):
--
-- UPDATE public.congregations
-- SET varos = 'Brateș', megye = 'Jud. Covasna'
-- WHERE nev_hu = 'Barátosi Református Egyházközség';
--
-- Vagy az összes gyülekezetre felkínált lista (hogy lásd melyiknél mit kell tölteni):
-- SELECT id, nev_hu, cim, varos, megye FROM public.congregations ORDER BY nev_hu;
