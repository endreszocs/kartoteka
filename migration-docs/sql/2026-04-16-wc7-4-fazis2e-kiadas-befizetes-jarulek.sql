-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 2e — kiadas + befizetes + jarulek_kedvezmeny takarítás
-- ============================================================================
--
-- Dátum: 2026-04-16
--
-- Három tábla, azonos minta szerint. Ezekben legtöbb a duplikáció és a
-- túl-permisszív maradvány policy.
--
--   1. kiadas (5 → 1)
--   2. befizetes (9 → 1)
--   3. jarulek_kedvezmeny (9 → 1, kettős rendszer rendezése)
--

BEGIN;

-- ============================================================================
-- 1. kiadas
-- ============================================================================
--
-- Törlendő (5 db):
--   - "Engedélyezett törlés a kiadas táblából" (userid-alapú, a user döntés szerint nem tartjuk meg)
--   - "Teljes hozzaferes kiadas" (authenticated — túl permisszív)
--   - admin_insert_all_kiadas (NULL using, redundáns)
--   - admin_read_all_kiadas (email+admin role, redundáns)
--   - kiadas_access (régi inline)

DROP POLICY IF EXISTS "Engedélyezett törlés a kiadas táblából" ON public.kiadas;
DROP POLICY IF EXISTS "Teljes hozzaferes kiadas" ON public.kiadas;
DROP POLICY IF EXISTS admin_insert_all_kiadas ON public.kiadas;
DROP POLICY IF EXISTS admin_read_all_kiadas ON public.kiadas;
DROP POLICY IF EXISTS kiadas_access ON public.kiadas;

CREATE POLICY kiadas_access
  ON public.kiadas
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY kiadas_access ON public.kiadas IS
  $$Egységes RLS minden CRUD-ra. A current_user_can_access_congregation() helper dönt.$$;


-- ============================================================================
-- 2. befizetes
-- ============================================================================
--
-- Törlendő (9 db):
--   Régi maradványok (TÚL PERMISSZÍV):
--     - "Engedélyezett törlés a befizetes táblából" (userid-alapú)
--     - "Mindenki olvashatja a befizeteseket" (true SELECT — minden gyülekezetre!)
--     - "Teljes hozzaferes befizetes" (authenticated)
--   Admin shortcutok:
--     - admin_insert_all_befizetes (NULL using)
--     - admin_read_all_befizetes (email + admin role)
--   Staff policy-k (már a helper-t használják, de párhuzamos rendszer):
--     - befizetes_staff_select
--     - befizetes_staff_insert
--     - befizetes_staff_update
--     - befizetes_staff_delete

DROP POLICY IF EXISTS "Engedélyezett törlés a befizetes táblából" ON public.befizetes;
DROP POLICY IF EXISTS "Mindenki olvashatja a befizeteseket" ON public.befizetes;
DROP POLICY IF EXISTS "Teljes hozzaferes befizetes" ON public.befizetes;
DROP POLICY IF EXISTS admin_insert_all_befizetes ON public.befizetes;
DROP POLICY IF EXISTS admin_read_all_befizetes ON public.befizetes;
DROP POLICY IF EXISTS befizetes_staff_select ON public.befizetes;
DROP POLICY IF EXISTS befizetes_staff_insert ON public.befizetes;
DROP POLICY IF EXISTS befizetes_staff_update ON public.befizetes;
DROP POLICY IF EXISTS befizetes_staff_delete ON public.befizetes;
DROP POLICY IF EXISTS befizetes_access ON public.befizetes;

CREATE POLICY befizetes_access
  ON public.befizetes
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY befizetes_access ON public.befizetes IS
  $$Egységes RLS minden CRUD-ra. A current_user_can_access_congregation() helper dönt. Felváltja a korábbi 9 policy-t, beleértve a "Teljes hozzaferes" és "Mindenki olvashatja" túl-permisszív maradványokat.$$;


-- ============================================================================
-- 3. jarulek_kedvezmeny
-- ============================================================================
--
-- Törlendő (9 db), két rendszer duplikációja:
--   Régi stílus (inline `congregation_id IN (SELECT ... profiles.id = auth.uid())`):
--     - jarulek_kedvezmeny_select
--     - jarulek_kedvezmeny_insert
--     - jarulek_kedvezmeny_update
--     - jarulek_kedvezmeny_delete
--   Új _scope stílus (EXISTS + role list):
--     - jarulek_kedvezmeny_select_scope
--     - jarulek_kedvezmeny_insert_scope
--     - jarulek_kedvezmeny_update_scope
--     - jarulek_kedvezmeny_delete_scope
--   ALL policy (régi inline):
--     - jarulek_kedvezmeny_access

DROP POLICY IF EXISTS jarulek_kedvezmeny_select ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_insert ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_update ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_delete ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_select_scope ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_insert_scope ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_update_scope ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_delete_scope ON public.jarulek_kedvezmeny;
DROP POLICY IF EXISTS jarulek_kedvezmeny_access ON public.jarulek_kedvezmeny;

CREATE POLICY jarulek_kedvezmeny_access
  ON public.jarulek_kedvezmeny
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY jarulek_kedvezmeny_access ON public.jarulek_kedvezmeny IS
  $$Egységes RLS minden CRUD-ra. Felváltja a régi és _scope-os párhuzamos rendszert (9 policy → 1).$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐ
-- ============================================================================
--
--     SELECT c.relname AS tbl,
--            pol.polname,
--            CASE pol.polcmd
--              WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
--              WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
--            END AS cmd,
--            pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
--            pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
--     FROM pg_policy pol
--     JOIN pg_class c ON c.oid = pol.polrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname = 'public'
--       AND c.relname IN ('kiadas','befizetes','jarulek_kedvezmeny')
--     ORDER BY c.relname, pol.polname;
--
-- VÁRT: 3 sor (egy-egy policy per tábla)
