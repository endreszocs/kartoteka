-- ══════════════════════════════════════════════════════════════════
-- 2026-04-21 — ADR seed cleanup
--   1) Duplikált adrlocality_alias sorok törlése (ON CONFLICT-hiány miatt)
--   2) UNIQUE constraint hozzáadása a jövőbeli védelemért
--   3) Ellenőrzés
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Duplikátumok törlése — csak az első ID marad meg minden (adrlocality_id, alias_name) párnál
DELETE FROM public.adrlocality_alias a
USING public.adrlocality_alias b
WHERE a.id > b.id
  AND a.adrlocality_id = b.adrlocality_id
  AND a.alias_name = b.alias_name;

-- 2) UNIQUE constraint — a jövőben ne duplikálódjanak
ALTER TABLE public.adrlocality_alias
  ADD CONSTRAINT adrlocality_alias_uq UNIQUE (adrlocality_id, alias_name);

COMMIT;

-- Ellenőrzés
SELECT COUNT(*) AS alias_count_after_cleanup FROM public.adrlocality_alias;
-- Várt: ~14 956 (a dedup előtt 29 914 volt)

SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'adrlocality_alias'
  AND constraint_name = 'adrlocality_alias_uq';
