-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 2c — berleti_szerzodes policy takarítás
-- ============================================================================
--
-- Dátum: 2026-04-16
--
-- Törlendő policy-k (5 db, quintuple duplikáció):
--   - berleti_szerzodes_access (FOR ALL, inline expression)
--   - berleti_szerzodes_select
--   - berleti_szerzodes_update
--   - berleti_szerzodes_delete
--   - berleti_szerzodes_insert (NULL using — biztonsági rés!)
--
-- Új policy (1 db, FOR ALL, bővített helper-t használ):
--   - berleti_szerzodes_access
--

BEGIN;

DROP POLICY IF EXISTS berleti_szerzodes_access ON public.berleti_szerzodes;
DROP POLICY IF EXISTS berleti_szerzodes_select ON public.berleti_szerzodes;
DROP POLICY IF EXISTS berleti_szerzodes_update ON public.berleti_szerzodes;
DROP POLICY IF EXISTS berleti_szerzodes_delete ON public.berleti_szerzodes;
DROP POLICY IF EXISTS berleti_szerzodes_insert ON public.berleti_szerzodes;


CREATE POLICY berleti_szerzodes_access
  ON public.berleti_szerzodes
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));


COMMENT ON POLICY berleti_szerzodes_access ON public.berleti_szerzodes IS
  $$Egységes RLS policy minden CRUD műveletre a berleti_szerzodes táblán. A current_user_can_access_congregation() helper dönti el a hozzáférést.$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐ
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
--     WHERE polrelid = 'public.berleti_szerzodes'::regclass
--     ORDER BY polname;
--
--     VÁRT: 1 sor
--
