-- Kartotéka — M8.0: `munkanaplo` BEFORE UPDATE trigger + updated_at index
-- ============================================================================
-- Cél: a lelkészi munkanapló offline-sync támogatása konfliktus-detektálással.
--
-- A `revision` és `updated_at` oszlopok MÁR LÉTEZNEK a munkanaplo táblán
-- (Database_schema.sql L1460-1461), csak a trigger hiányzik, ami a revision-t
-- UPDATE-kor inkrementálja.
--
-- Minta: a 2026-04-23-m7-0-szemely-csalad-triggers.sql migrációt követi.
--
-- Idempotens: többször futtatható, nem dob hibát.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Trigger-függvény + trigger
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_munkanaplo_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.revision := COALESCE(OLD.revision, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS munkanaplo_bump_revision ON public.munkanaplo;
CREATE TRIGGER munkanaplo_bump_revision
  BEFORE UPDATE ON public.munkanaplo
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_munkanaplo_bump_revision();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Indexek — delta-sync + per-gyülekezet szűrés
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_munkanaplo_updated_at
  ON public.munkanaplo(updated_at);

CREATE INDEX IF NOT EXISTS idx_munkanaplo_congregation_id
  ON public.munkanaplo(congregation_id);

-- Bónusz: időpont-alapú lekérdezéshez (pl. "Ezen a héten mit jelentettem")
CREATE INDEX IF NOT EXISTS idx_munkanaplo_idopont
  ON public.munkanaplo(idopont DESC);

-- ============================================================================
-- === ELLENŐRZÉS ===
-- ============================================================================

-- 4a. Trigger aktív-e
SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'munkanaplo'
  AND trigger_name = 'munkanaplo_bump_revision';

-- 4b. Trigger-függvény létezik-e
SELECT proname AS function_name
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE pg_namespace.nspname = 'public'
  AND proname = 'tg_munkanaplo_bump_revision';

-- 4c. Indexek
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'munkanaplo'
  AND indexname IN (
    'idx_munkanaplo_updated_at',
    'idx_munkanaplo_congregation_id',
    'idx_munkanaplo_idopont'
  )
ORDER BY indexname;

-- 4d. Smoke-test: hány bejegyzés gyülekezetenként
SELECT
  congregation_id,
  COUNT(*) AS total,
  MIN(idopont) AS earliest,
  MAX(idopont) AS latest,
  MIN(revision) AS min_rev,
  MAX(revision) AS max_rev
FROM public.munkanaplo
WHERE congregation_id IS NOT NULL
GROUP BY congregation_id
ORDER BY total DESC
LIMIT 5;
