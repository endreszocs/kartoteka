-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 2b — belsomozgas policy takarítás
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Tervdokumentum: docs/project-tracking/KARTOTEKA-penzugy-rls-takaritas-terv-2026-04-16.md
-- Előfeltétel: 2026-04-16-wc7-4-fazis1-helper-functions.sql (LEFUTOTT ✅)
--              2026-04-16-wc7-4-fazis2a-valuta-atert.sql (LEFUTOTT ✅)
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE
--
-- Törlendő policy-k (2 db, duplikátum):
--   - "Saját gyülekezet belső mozgásai" (régi inline, szóközös név!)
--   - belsomozgas_access (új stílusú, DE inline expression — nem használja a bővítettet)
--
-- Új policy (1 db, FOR ALL, bővített helper-t használ):
--   - belsomozgas_access (ugyanazzal a névvel)
--

BEGIN;

-- 1) Régi policy-k törlése (idempotens)
--    FIGYELEM: a régi policy neve szóközt és ékezetet tartalmaz, idézőjelben kell
DROP POLICY IF EXISTS "Saját gyülekezet belső mozgásai" ON public.belsomozgas;
DROP POLICY IF EXISTS belsomozgas_access ON public.belsomozgas;


-- 2) Egységes új policy
CREATE POLICY belsomozgas_access
  ON public.belsomozgas
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));


COMMENT ON POLICY belsomozgas_access ON public.belsomozgas IS
  $$Egységes RLS policy minden CRUD műveletre a belsomozgas táblán (kassza-bank, bank-bank, valutacsere belső mozgások). A current_user_can_access_congregation() helper dönti el, amely kezeli az összes szerepkört.$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉS
-- ============================================================================
--
--     SELECT polname,
--            CASE polcmd
--              WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
--              WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
--            END AS cmd,
--            pg_get_expr(polqual, polrelid) AS using_expr,
--            pg_get_expr(polwithcheck, polrelid) AS with_check_expr
--     FROM pg_policy
--     WHERE polrelid = 'public.belsomozgas'::regclass
--     ORDER BY polname;
--
--     VÁRT: 1 sor, polname = 'belsomozgas_access', cmd = 'ALL'
--
-- ============================================================================
-- VISSZAFORDÍTÁS
-- ============================================================================
--
-- BEGIN;
-- DROP POLICY IF EXISTS belsomozgas_access ON public.belsomozgas;
--
-- CREATE POLICY "Saját gyülekezet belső mozgásai" ON public.belsomozgas
--   FOR ALL
--   USING (congregation_id IN (SELECT profiles.congregation_id FROM profiles WHERE profiles.id = auth.uid()));
--
-- CREATE POLICY belsomozgas_access ON public.belsomozgas
--   FOR ALL
--   USING ((congregation_id = current_user_congregation_id()) OR current_user_has_global_access());
-- COMMIT;
