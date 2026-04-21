-- Kartotéka — M7.0: `szemely` + `csalad` BEFORE UPDATE triggerek + updated_at indexek
-- ============================================================================
-- Cél: optimistic-concurrency alapú konfliktus-kezelés a desktop kliensben a
-- személy- és család-adatokra.
--
-- A `revision` és `updated_at` oszlopok MÁR LÉTEZNEK mindkét táblán (l. a
-- `migration-docs/Database_schema.sql` L507/508 és L2013/2014), de a trigger
-- (ami a revision-t UPDATE-kor inkrementálja) hiányzik.
--
-- Ez a migráció három dolgot tesz:
--   1. tg_szemely_bump_revision + szemely_bump_revision trigger
--   2. tg_csalad_bump_revision + csalad_bump_revision trigger
--   3. idx_szemely_updated_at, idx_csalad_updated_at indexek a delta-sync-hez
--
-- Minta: a 2026-04-23-m6-1-congregations-revision.sql migrációt követi.
--
-- Futtatás:
--   Supabase Studio SQL Editor → Run (egy körben).
--
-- Idempotens: a fájl többször futtatható egymás után, nem dob hibát.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. szemely — trigger-függvény + trigger
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_szemely_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.revision := COALESCE(OLD.revision, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS szemely_bump_revision ON public.szemely;
CREATE TRIGGER szemely_bump_revision
  BEFORE UPDATE ON public.szemely
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_szemely_bump_revision();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. csalad — trigger-függvény + trigger
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_csalad_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.revision := COALESCE(OLD.revision, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS csalad_bump_revision ON public.csalad;
CREATE TRIGGER csalad_bump_revision
  BEFORE UPDATE ON public.csalad
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_csalad_bump_revision();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Indexek az updated_at-re — delta-sync lekérdezésekhez
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_szemely_updated_at
  ON public.szemely(updated_at);

CREATE INDEX IF NOT EXISTS idx_csalad_updated_at
  ON public.csalad(updated_at);

-- Bónusz: congregation_id-re is index a per-gyülekezet pull-hoz
-- (a kliens `WHERE congregation_id = :my_cg` formájában kéri)
CREATE INDEX IF NOT EXISTS idx_szemely_congregation_id
  ON public.szemely(congregation_id);

-- ============================================================================
-- === ELLENŐRZÉS ===
-- ============================================================================
-- Futtatható SELECT-ek, nem kommentek — a Supabase Studio egyenként megjeleníti.
-- ============================================================================

-- 4a. szemely trigger aktív-e
SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'szemely'
  AND trigger_name = 'szemely_bump_revision';

-- 4b. csalad trigger aktív-e
SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'csalad'
  AND trigger_name = 'csalad_bump_revision';

-- 4c. Trigger-függvények léteznek-e
SELECT
  proname AS function_name
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE pg_namespace.nspname = 'public'
  AND proname IN ('tg_szemely_bump_revision', 'tg_csalad_bump_revision')
ORDER BY proname;

-- 4d. Indexek (updated_at + congregation_id)
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_szemely_updated_at',
    'idx_csalad_updated_at',
    'idx_szemely_congregation_id'
  )
ORDER BY tablename, indexname;

-- 4e. Smoke-test: hány szemely-sor az én gyülekezetemben, revision-eloszlás
SELECT
  congregation_id,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE meghalt = false OR meghalt IS NULL) AS living,
  MIN(revision) AS min_rev,
  MAX(revision) AS max_rev,
  MIN(updated_at) AS earliest,
  MAX(updated_at) AS latest
FROM public.szemely
WHERE congregation_id IS NOT NULL
GROUP BY congregation_id
ORDER BY total DESC
LIMIT 5;

-- 4f. Smoke-test: hány csalad-sor az aktív családból összesen
SELECT
  COUNT(*) AS total_csalad,
  COUNT(*) FILTER (WHERE isaktiv = true) AS active_csalad,
  MAX(revision) AS max_rev,
  MAX(updated_at) AS latest_update
FROM public.csalad;
