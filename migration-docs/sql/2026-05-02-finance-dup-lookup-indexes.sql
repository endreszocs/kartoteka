-- ===================================================================
-- Pénzügyi import: duplikáció-detektáláshoz partial indexek
-- ===================================================================
--
-- 2026-05-02 (Fázis 1, Pénzügyi import-wizard)
--
-- A kassza-import wizard a `bank-import-actions.ts:hasExistingBankTransaction`
-- mintáját követi a duplikáció-védelemhez:
--   `(congregation_id, datum, osszeg, bankszamla_id)` négyesre szűr
--   minden importálandó tételnél.
--
-- 994 sor importja előtt 994 ilyen szűrt SELECT fut → index nélkül O(N²) seq scan.
-- Ez az index ezt log(N)-re redukálja.
--
-- A `WHERE deleted = false` partial szűrő csökkenti az index méretét — a
-- soft-delete-elt sorok nem érdekesek.
--
-- A bank-import (`bank-import-actions.ts`) is profitál ebből — közös indexek.
--
-- BIZTONSÁG: csak indexek, semmi szerkezet-változtatás. Visszafordítható.
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_befizetes_dup_lookup
  ON public.befizetes (congregation_id, datum, osszeg, bankszamla_id)
  WHERE deleted = false;

CREATE INDEX IF NOT EXISTS idx_kiadas_dup_lookup
  ON public.kiadas (congregation_id, datum, osszeg, bankszamla_id)
  WHERE deleted = false;

-- ===================================================================
-- Ellenőrzés
-- ===================================================================

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('befizetes', 'kiadas')
  AND indexname LIKE 'idx_%_dup_lookup'
ORDER BY tablename, indexname;
