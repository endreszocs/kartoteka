-- Kartotéka — M6.1: `congregations` kiegészítése `revision` + `updated_at` mezőkkel
-- ============================================================================
-- Cél: optimistic-concurrency alapú konfliktus-kezelés a desktop kliensben a
-- gyülekezet-adatokra (név, elérhetőség, IBAN, éves járulék, stb.).
--
-- A desktop-kliens így tud konfliktust észlelni:
--   UPDATE congregations SET telefon = '...'
--     WHERE id = :cg_id AND revision = <client_rev>;
--   Ha 0 sor frissül → szerver-oldali revision eltér → konfliktus.
--
-- Minta: a 2026-04-23-m2-6-profiles-revision.sql (profiles) migrációt követi.
--
-- Megjegyzés: a `csalad` és `csaladlatogatas` tábláknak **már van** ilyen
-- revision/updated_at oszlopa (`migration-docs/Database_schema.sql` L507, L525),
-- de a congregations-on még nem. Ez a migráció ezt pótolja.
--
-- Futtatás:
--   Supabase Studio SQL Editor → Run (egy körben).
--
-- Idempotens: a fájl többször futtatható egymás után, nem dob hibát.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Oszlopok hozzáadása (IF NOT EXISTS) — biztonságos repeat-futtatáshoz
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Trigger-függvény — minden UPDATE-nél revision++ és updated_at := now()
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_congregations_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- revision inkrementálása (OLD.revision mindig létezik, mert a DEFAULT 0-val
  -- minden sor kapott értéket az ADD COLUMN-kor)
  NEW.revision := COALESCE(OLD.revision, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Trigger (csak UPDATE-re; INSERT-nél a DEFAULT 0 / now() megoldja)
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS congregations_bump_revision ON public.congregations;
CREATE TRIGGER congregations_bump_revision
  BEFORE UPDATE ON public.congregations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_congregations_bump_revision();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Index az updated_at-re — delta-sync lekérdezésekhez
--    ("WHERE updated_at > :last_pull ORDER BY updated_at")
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_congregations_updated_at
  ON public.congregations(updated_at);

-- ============================================================================
-- === ELLENŐRZÉS ===
-- ============================================================================
-- Ezek NEM komment-szakaszok, hanem futtatható SELECT-ek — a Supabase Studio
-- az egész fájlt egy körben futtatja, az alábbi eredmények egyenként
-- megjelennek. Ha bármelyik üres, valamit újra kell nézni.
-- ============================================================================

-- 4a. Oszlopok léteznek-e
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'congregations'
  AND column_name IN ('revision', 'updated_at')
ORDER BY column_name;

-- 4b. Trigger aktív-e
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'congregations'
  AND trigger_name = 'congregations_bump_revision';

-- 4c. Trigger-függvény létezik és a jó SQL tartalommal
SELECT
  proname AS function_name,
  prosrc AS function_body_snippet
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE pg_namespace.nspname = 'public'
  AND proname = 'tg_congregations_bump_revision';

-- 4d. Index az updated_at-re
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'congregations'
  AND indexname = 'idx_congregations_updated_at';

-- 4e. Sample: hány gyülekezet-sor már létezik, és a revision eloszlása
--     (első futtatás után minden sor revision=0, subsequent UPDATE-eknél nő)
SELECT
  COUNT(*) AS total_congregations,
  MIN(revision) AS min_revision,
  MAX(revision) AS max_revision,
  MIN(updated_at) AS earliest_update,
  MAX(updated_at) AS latest_update
FROM public.congregations;

-- 4f. Smoke-test: egy konkrét gyülekezet megnézése névvel, revision-nel,
--     updated_at-tal — hasznos az első teszthez, hogy látszódjon a formátum
SELECT
  id,
  name,
  nev_hu,
  district,
  revision,
  updated_at
FROM public.congregations
ORDER BY name
LIMIT 5;
