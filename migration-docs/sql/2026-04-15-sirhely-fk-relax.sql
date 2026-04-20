-- ─────────────────────────────────────────────────────────────────
-- Sírhely modul — FK constraint-ek lazítása
-- ─────────────────────────────────────────────────────────────────
--
-- Probléma: A `sirhelyberles.befizetesid` és `sirhelyelhunyt.temetesid`
-- mezők NOT NULL FK-k, viszont:
--   - egy bérlet rögzítésekor nem mindig van még párosított befizetés
--     (a befizetés akár később, akár külön modulban kerül be)
--   - egy elhunyt rögzítésekor a temetés (anyakönyvi rekord) nem mindig
--     készült el a sírhely-rögzítéssel egy időben
--
-- Megoldás: a NOT NULL constraint eltávolítása. A FK megmarad — ha
-- megadunk értéket, az egzisztáljon. Az alapértelmezett NULL biztonságos.
--
-- ROLLBACK (csak ha biztosan minden sorra van befizetesid/temetesid):
--   ALTER TABLE public.sirhelyberles ALTER COLUMN befizetesid SET NOT NULL;
--   ALTER TABLE public.sirhelyelhunyt ALTER COLUMN temetesid SET NOT NULL;
-- ─────────────────────────────────────────────────────────────────

DO $mig$
BEGIN
  -- sirhelyberles.befizetesid → NULL-szabad
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sirhelyberles'
      AND column_name = 'befizetesid'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.sirhelyberles ALTER COLUMN befizetesid DROP NOT NULL;
    RAISE NOTICE 'sirhelyberles.befizetesid → NULLABLE';
  END IF;

  -- sirhelyelhunyt.temetesid → NULL-szabad
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sirhelyelhunyt'
      AND column_name = 'temetesid'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.sirhelyelhunyt ALTER COLUMN temetesid DROP NOT NULL;
    RAISE NOTICE 'sirhelyelhunyt.temetesid → NULLABLE';
  END IF;

  -- sirhelyelhunyt.ferfi → NULL-szabad (jelenleg NOT NULL, de a UI default-ja nem mindig egyértelmű)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sirhelyelhunyt'
      AND column_name = 'ferfi'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.sirhelyelhunyt ALTER COLUMN ferfi DROP NOT NULL;
    RAISE NOTICE 'sirhelyelhunyt.ferfi → NULLABLE';
  END IF;
END;
$mig$;

-- Ellenőrzés
SELECT
  table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sirhelyberles', 'sirhelyelhunyt')
  AND column_name IN ('befizetesid', 'temetesid', 'ferfi')
ORDER BY table_name, column_name;
