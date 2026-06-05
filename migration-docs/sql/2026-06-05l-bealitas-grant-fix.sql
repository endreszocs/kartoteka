-- ============================================================================
-- 2026-06-05l — FIX: "permission denied for table bealitas" a welcome-záráskor
-- ----------------------------------------------------------------------------
-- TÜNET: a welcome wizard véglegesítésekor (completeWizard) a pénzügyi
-- alapbeállítások (bealitas) mentése elbukik:
--   "A pénzügyi alapbeállítások mentése sikertelen: permission denied for table bealitas"
--
-- OK: a completeWizard service-role klienssel ír; ha a SUPABASE_SERVICE_ROLE_KEY
-- nem elérhető az adott környezetben, visszaesik a bejelentkezett (authenticated)
-- session-kliensre. A `bealitas` táblán VAN RLS-policy (gyülekezet-scope), DE az
-- `authenticated` szerepnek hiányzik a tábla-szintű CRUD GRANT-ja (a 2026-04-17
-- szigorítás csak a TRUNCATE/REFERENCES/TRIGGER-t vonta meg, és feltételezte a
-- meglévő CRUD-grantet — a bealitas kimaradt). Ezért "permission denied".
--
-- MEGOLDÁS: explicit GRANT az authenticated szerepre a completeWizard által írt,
-- gyülekezet-scope-os, RLS-sel védett táblákra. Az RLS továbbra is csak a SAJÁT
-- gyülekezet sorait engedi — a GRANT csak a tábla-szintű hozzáférést adja meg.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ============================================================================

BEGIN;

-- A welcome-wizard által írt, gyülekezet-scope-os (RLS-védett) táblák:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bealitas            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarulek_kedvezmeny  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankszamlak         TO authenticated;

-- Biztonsági redundancia: a service_role mindent kap (ő amúgy is bypass-ol).
GRANT ALL ON public.bealitas           TO service_role;
GRANT ALL ON public.jarulek_kedvezmeny TO service_role;
GRANT ALL ON public.bankszamlak        TO service_role;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- Az authenticated jogai a bealitas-on (várt: SELECT/INSERT/UPDATE/DELETE):
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='bealitas' AND grantee='authenticated';
-- RLS aktív + policy megvan?
-- SELECT relrowsecurity FROM pg_class WHERE oid='public.bealitas'::regclass;
-- SELECT polname FROM pg_policy WHERE polrelid='public.bealitas'::regclass;
