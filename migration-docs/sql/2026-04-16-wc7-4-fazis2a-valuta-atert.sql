-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 2a — valuta_atert policy takarítás
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Tervdokumentum: docs/project-tracking/KARTOTEKA-penzugy-rls-takaritas-terv-2026-04-16.md
-- Előfeltétel: 2026-04-16-wc7-4-fazis1-helper-functions.sql (LEFUTOTT ✅)
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE
--
-- MIT VÁLTOZTATUNK:
--
--   Törlendő policy-k (4 db, külön CRUD):
--     - valuta_atert_select_own  (SELECT)
--     - valuta_atert_insert_own  (INSERT — NULL using, nincs with_check!)
--     - valuta_atert_update_own  (UPDATE)
--     - valuta_atert_delete_own  (DELETE)
--
--   Új policy (1 db, FOR ALL):
--     - valuta_atert_access (bővített current_user_can_access_congregation()-t használja)
--
-- MIÉRT:
--   1. A régi 4 policy ugyanazt az OR kifejezést ismétli — redundáns
--   2. A régi policy-k NEM használják a helper-t, inline expressionnel dolgoznak
--      → az új szerepkörök (egyhazkeruleti_admin, konyvelo, szamvevo) NEM kapnak
--        automatikusan hozzáférést, egyenként kellene új policy-t adni
--   3. Az INSERT policy-nak nincs WITH CHECK → biztonsági hiba, bárki bárhova vihet be
--   4. Egyetlen FOR ALL policy egyszerűbb + bővített helper függvényt használ
--      → az új szerepkörök AZONNAL kapják a hozzáférést
--

BEGIN;

-- 1) Régi policy-k törlése (+ az új is IF EXISTS, idempotens)
DROP POLICY IF EXISTS valuta_atert_select_own ON public.valuta_atert;
DROP POLICY IF EXISTS valuta_atert_insert_own ON public.valuta_atert;
DROP POLICY IF EXISTS valuta_atert_update_own ON public.valuta_atert;
DROP POLICY IF EXISTS valuta_atert_delete_own ON public.valuta_atert;
DROP POLICY IF EXISTS valuta_atert_access ON public.valuta_atert;


-- 2) Egységes új policy
CREATE POLICY valuta_atert_access
  ON public.valuta_atert
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));


COMMENT ON POLICY valuta_atert_access ON public.valuta_atert IS
  $$Egységes RLS policy minden CRUD műveletre a valuta_atert táblán. A hozzáférést a current_user_can_access_congregation() helper dönti el, amely kezeli az összes szerepkört (admin, esperes, megyei admin, lelkész, kerületi admin, könyvelő, számvevő).$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉSEK (futtatás után)
-- ============================================================================
--
-- 1) Régi policy-k törlődtek, csak az új van?
--
--     SELECT polname,
--            CASE polcmd
--              WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
--              WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
--            END AS cmd,
--            pg_get_expr(polqual, polrelid) AS using_expr,
--            pg_get_expr(polwithcheck, polrelid) AS with_check_expr
--     FROM pg_policy
--     WHERE polrelid = 'public.valuta_atert'::regclass
--     ORDER BY polname;
--
--     VÁRT EREDMÉNY: 1 sor, polname = 'valuta_atert_access', cmd = 'ALL'
--
-- 2) Policy szám ellenőrzés:
--
--     SELECT COUNT(*) AS policy_count
--     FROM pg_policy
--     WHERE polrelid = 'public.valuta_atert'::regclass;
--
--     VÁRT: 1
--
-- ============================================================================
-- VISSZAFORDÍTÁS (ha szükséges)
-- ============================================================================
--
-- BEGIN;
-- DROP POLICY IF EXISTS valuta_atert_access ON public.valuta_atert;
--
-- CREATE POLICY valuta_atert_select_own ON public.valuta_atert
--   FOR SELECT
--   USING ((congregation_id = current_user_congregation_id()) OR current_user_has_global_access());
--
-- CREATE POLICY valuta_atert_insert_own ON public.valuta_atert
--   FOR INSERT
--   WITH CHECK (true);
--
-- CREATE POLICY valuta_atert_update_own ON public.valuta_atert
--   FOR UPDATE
--   USING ((congregation_id = current_user_congregation_id()) OR current_user_has_global_access());
--
-- CREATE POLICY valuta_atert_delete_own ON public.valuta_atert
--   FOR DELETE
--   USING ((congregation_id = current_user_congregation_id()) OR current_user_has_global_access());
-- COMMIT;
