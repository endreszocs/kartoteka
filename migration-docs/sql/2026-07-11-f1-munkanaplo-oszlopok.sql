-- ==========================================================================
-- 2026-07-11 — F1: Munkanapló oszlopbővítés (hivatalos nyomtatvány-rovatok)
-- ==========================================================================
-- KONTEXTUS (munkanapló+iktató redesign, F1 fázis):
--   A hivatalos munkanapló-nyomtatvány rovataihoz a `munkanaplo` táblából
--   három mező hiányzik:
--
--   1. `napszak` text — 'de' / 'du' / 'este'. Eddig csak a `du` boolean
--      létezett, ami kétértékű (délelőtt/délután), az „este" nem fért bele.
--      MOSTANTÓL A `napszak` A KANONIKUS MEZŐ; a `du` boolean legacy-
--      kompatibilitásként marad (régi kliensek / meglévő lekérdezések),
--      du = true ≈ napszak = 'du'.
--   2. `uv_templomban` integer — úrvacsorázók száma a templomban.
--   3. `uv_betegnel` integer — úrvacsorázók száma betegnél/háznál.
--
-- MIKOR KELL FUTTATNI: az F1 PR merge ELŐTT, a Supabase SQL Editorban.
--
-- ADATMIGRÁCIÓ: NINCS — a munkanaplo tábla élesben üres (0 sor,
--   2026-07-11-i diagnosztika), ezért csak ALTER fut, backfill nem kell.
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + a CHECK constraint DO-blokkban,
--   pg_constraint-ellenőrzéssel — biztonságos ismételt futtatás.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Új oszlopok
-- ─────────────────────────────────────────────────────────────────────────

-- Napszak: 'de' / 'du' / 'este'. NULL megengedett (régi/hiányos rekordok).
ALTER TABLE public.munkanaplo
  ADD COLUMN IF NOT EXISTS napszak text;

-- Úrvacsorázók száma templomban / betegnél. NULL = nem volt úrvacsora.
ALTER TABLE public.munkanaplo
  ADD COLUMN IF NOT EXISTS uv_templomban integer;

ALTER TABLE public.munkanaplo
  ADD COLUMN IF NOT EXISTS uv_betegnel integer;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraint a napszak-ra (külön, hogy meglévő oszlopnál is
--    idempotens legyen — az inline CHECK az ADD COLUMN IF NOT EXISTS-szel
--    kimaradna, ha az oszlop már létezik)
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'munkanaplo_napszak_check'
      AND conrelid = 'public.munkanaplo'::regclass
  ) THEN
    -- NULL átmegy a CHECK-en (SQL-szemantika), tehát a NULL továbbra is
    -- megengedett — csak a kitöltött érték korlátozott.
    ALTER TABLE public.munkanaplo
      ADD CONSTRAINT munkanaplo_napszak_check
      CHECK (napszak IN ('de', 'du', 'este'));
    RAISE NOTICE 'munkanaplo_napszak_check constraint létrehozva.';
  ELSE
    RAISE NOTICE 'munkanaplo_napszak_check constraint már létezik — kihagyva.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Oszlop-kommentek (dokumentáció a sémában)
-- ─────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.munkanaplo.napszak IS
  '2026-07-11 F1: a szolgálat napszaka (''de'' / ''du'' / ''este''). Ez a KANONIKUS napszak-mező; a du boolean legacy-kompatibilitásként marad (du = true ≈ napszak = ''du'').';

COMMENT ON COLUMN public.munkanaplo.du IS
  'LEGACY (2026-07-11 F1 óta): a napszak text oszlop a kanonikus. Régi kliensek/lekérdezések kompatibilitása miatt marad; du = true ≈ napszak = ''du''.';

COMMENT ON COLUMN public.munkanaplo.uv_templomban IS
  '2026-07-11 F1: úrvacsorázók száma a templomban (hivatalos munkanapló-nyomtatvány rovata). NULL = nem volt úrvacsora / nincs adat.';

COMMENT ON COLUMN public.munkanaplo.uv_betegnel IS
  '2026-07-11 F1: úrvacsorázók száma betegnél/háznál (hivatalos munkanapló-nyomtatvány rovata). NULL = nem volt úrvacsora / nincs adat.';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ
-- ─────────────────────────────────────────────────────────────────────────

-- Az új oszlopok léteznek (helyes típussal), és a CHECK constraint is —
-- egyetlen eredmény-halmazban (a SQL Editor csak az utolsó SELECT-et mutatja):
SELECT
  'munkanaplo.' || column_name AS verify_target,
  data_type || ' / nullable=' || is_nullable AS status
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'munkanaplo'
   AND column_name IN ('napszak', 'uv_templomban', 'uv_betegnel', 'du')
UNION ALL
SELECT
  'munkanaplo_napszak_check constraint' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'munkanaplo_napszak_check'
      AND conrelid = 'public.munkanaplo'::regclass
  ) THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS status
ORDER BY verify_target;

COMMIT;
