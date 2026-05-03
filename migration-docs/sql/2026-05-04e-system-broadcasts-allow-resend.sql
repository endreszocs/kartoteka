-- =========================================================================
-- 2026-05-04 — system_broadcasts: UNIQUE constraint drop a re-send miatt
-- =========================================================================
-- KONTEXTUS:
--   A 2026-05-04-en bevezetett "Újraküldés" gomb DB-szintű UNIQUE constraint-be
--   ütközik:
--     "duplicate key value violates unique constraint
--      'system_broadcasts_release_changelog_key_key'"
--
--   A constraint eredetileg azért volt, hogy egy CHANGELOG-bejegyzést egyszer
--   broadcast-oljunk. Most viszont szándékosan engedjük a re-send-et:
--     - Az alkalmazás-szintű check (sendChangelogBroadcast `force` flag) blokkol
--       force=false esetén → tényleg csak akkor enged át, ha az admin explicit kéri.
--     - A UNIQUE constraint feleslegessé vált, és aktívan blokkolja a feature-t.
--
-- MEGOLDÁS:
--   - DROP CONSTRAINT
--   - Index megtartva (a query-k olvasásra használják, csak nem unique)
-- =========================================================================

-- 1. Drop a UNIQUE constraint
ALTER TABLE public.system_broadcasts
  DROP CONSTRAINT IF EXISTS system_broadcasts_release_changelog_key_key;

-- 2. Csak NEM-UNIQUE index marad — a sentByKey query gyors marad
DROP INDEX IF EXISTS public.system_broadcasts_release_changelog_key_key;
CREATE INDEX IF NOT EXISTS idx_system_broadcasts_release_key
  ON public.system_broadcasts (release_changelog_key);

-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

-- 1. A UNIQUE constraint nincs többé
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.system_broadcasts'::regclass
  AND conname LIKE '%release_changelog_key%';

-- 2. Az index létezik (NEM unique)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'system_broadcasts'
  AND indexname = 'idx_system_broadcasts_release_key';
