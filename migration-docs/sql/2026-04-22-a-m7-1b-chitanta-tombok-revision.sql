-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.1b — chitanta_tombok: revision + sync-trigger (offline-sync alap)
--  Dátum: 2026-04-22
--  Futtatás: Endre → Supabase SQL Editor
--
--  MIÉRT:
--    Az A-M7.1a kliens-oldalon bevezette a chitanta_tombok_local Rust SQLite
--    táblát (revision oszloppal). Az offline-sync revision-alapú konfliktus-
--    detekciójához a szerver-oldali tábla is `revision` oszlopot + auto-bump
--    triggert igényel. A `sync_tracking_touch()` helper fn már létezik
--    (2026-04-15-sync-tracking.sql óta), csak a chitanta_tombok-ra még nem
--    volt rákötve.
--
--  HATÁS:
--    - `revision bigint NOT NULL DEFAULT 0` oszlop hozzáadva
--    - `trg_sync_chitanta_tombok` BEFORE UPDATE trigger — auto-bumps
--      revision + updated_at minden UPDATE-nél
--    - Index (congregation_id, updated_at DESC) — delta-pull sebességéhez
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Revision oszlop (idempotens — ha már van, skip)
ALTER TABLE public.chitanta_tombok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

-- 2) BEFORE UPDATE trigger a sync_tracking_touch() helper fn-nel
DROP TRIGGER IF EXISTS trg_sync_chitanta_tombok ON public.chitanta_tombok;
CREATE TRIGGER trg_sync_chitanta_tombok
  BEFORE UPDATE ON public.chitanta_tombok
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

COMMENT ON TRIGGER trg_sync_chitanta_tombok ON public.chitanta_tombok IS
  $$A-M7.1b: auto-bumps revision + updated_at minden UPDATE-nél. A delta-sync
    ezt használja a change-detection-höz, a kliens pedig a revision-t az
    optimistic-lock `WHERE revision = ?` conditional-update-hez.$$;

-- 3) Delta-pull index: a kliens a `WHERE updated_at > last_pull` lekérdezéssel
--    hozza le a változásokat, ezért az (congregation_id, updated_at) index
--    gyorsítja a pull-t.
CREATE INDEX IF NOT EXISTS idx_chitanta_tombok_cong_updated
  ON public.chitanta_tombok(congregation_id, updated_at DESC);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (DOWN) — csak ha muszáj, NE fusd le normál esetben
-- ════════════════════════════════════════════════════════════════════════════
--  BEGIN;
--  DROP INDEX IF EXISTS public.idx_chitanta_tombok_cong_updated;
--  DROP TRIGGER IF EXISTS trg_sync_chitanta_tombok ON public.chitanta_tombok;
--  ALTER TABLE public.chitanta_tombok DROP COLUMN IF EXISTS revision;
--  COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
--  ELLENŐRZŐ SELECT-EK (futtatható — a COMMIT után azonnal lefut)
-- ════════════════════════════════════════════════════════════════════════════

SELECT '════ Ellenőrzés 1: revision oszlop létezik ═══════════════════════════' AS section;

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'chitanta_tombok'
  AND column_name  = 'revision';

-- Várt: 1 sor, data_type='bigint', is_nullable='NO', column_default='0'

SELECT '════ Ellenőrzés 2: trigger bekötve ═══════════════════════════════════' AS section;

SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_schema         = 'public'
  AND event_object_table     = 'chitanta_tombok'
  AND trigger_name           = 'trg_sync_chitanta_tombok';

-- Várt: 1 sor, event_manipulation='UPDATE', action_timing='BEFORE', action_orientation='ROW'

SELECT '════ Ellenőrzés 3: delta-pull index létezik ══════════════════════════' AS section;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'chitanta_tombok'
  AND indexname  = 'idx_chitanta_tombok_cong_updated';

-- Várt: 1 sor, indexdef tartalmazza (congregation_id, updated_at DESC)

SELECT '════ Ellenőrzés 4: smoke-teszt — UPDATE bumpolja a revision-t ════════' AS section;

-- Válasszunk egy tesztelhető sort (csak info, nem módosít):
SELECT id, seria, revision, updated_at
  FROM public.chitanta_tombok
  ORDER BY created_at DESC
  LIMIT 1;

-- Endre: a fenti id-t kézzel be lehet írni egy tétel UPDATE-be, hogy lássa
-- hogy a revision +1-re ugrik és az updated_at a friss pillanatra frissül.
-- Példa (NE futtasd automatikusan; kommentálva marad):
--
--   UPDATE public.chitanta_tombok
--      SET megjegyzes = COALESCE(megjegyzes, '') || ' [A-M7.1b smoke]'
--    WHERE id = '<id>';
--
--   SELECT id, revision, updated_at FROM public.chitanta_tombok WHERE id = '<id>';
--   -- A revision +1-gyel nagyobb, updated_at frissebb.

-- ════════════════════════════════════════════════════════════════════════════
--  Ha minden zöld:
--    - A kliens (mind web, mind desktop) most már tud delta-pull-t csinálni
--      `WHERE updated_at > last_pull` alapon
--    - Az optimistic-lock UPDATE (`WHERE id = ? AND revision = ?`) működik
--    - A Rust chitanta_tombok_local és a Supabase chitanta_tombok séma szinkron
-- ════════════════════════════════════════════════════════════════════════════
