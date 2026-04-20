-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 2d — bankszamlak + koltsegvetes + szamadasicel takarítás
-- ============================================================================
--
-- Dátum: 2026-04-16
--
-- 3 tábla egyben, mert a takarítás mintázata egyszerű és alacsony kockázatú:
--
--   1. bankszamlak (5 policy) → 1 policy
--   2. koltsegvetes (2 policy) → 1 policy
--   3. szamadasicel (2 policy) → 2 speciális (SELECT true + UPDATE TVA-ra)
--

BEGIN;

-- ============================================================================
-- 1. bankszamlak
-- ============================================================================
--
-- Törlendő (5 db):
--   - Bankszamlak_insert (NULL using — biztonsági rés)
--   - Bankszamlak_select (inline userid lekérdezés)
--   - Bankszamlak_update (ugyanaz)
--   - admin_read_all_bankszamlak (hardcoded email + admin role — duplikálja a helpert)
--   - bankszamlak_access (régi stílus, inline)

DROP POLICY IF EXISTS "Bankszamlak_insert" ON public.bankszamlak;
DROP POLICY IF EXISTS "Bankszamlak_select" ON public.bankszamlak;
DROP POLICY IF EXISTS "Bankszamlak_update" ON public.bankszamlak;
DROP POLICY IF EXISTS admin_read_all_bankszamlak ON public.bankszamlak;
DROP POLICY IF EXISTS bankszamlak_access ON public.bankszamlak;

CREATE POLICY bankszamlak_access
  ON public.bankszamlak
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY bankszamlak_access ON public.bankszamlak IS
  $$Egységes RLS minden CRUD-ra. A current_user_can_access_congregation() helper dönt.$$;


-- ============================================================================
-- 2. koltsegvetes
-- ============================================================================
--
-- Törlendő (2 db):
--   - "Teljes hozzaferes koltsegvetes" (authenticated → túl permisszív)
--   - koltsegvetes_access (régi stílus, inline)

DROP POLICY IF EXISTS "Teljes hozzaferes koltsegvetes" ON public.koltsegvetes;
DROP POLICY IF EXISTS koltsegvetes_access ON public.koltsegvetes;

CREATE POLICY koltsegvetes_access
  ON public.koltsegvetes
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY koltsegvetes_access ON public.koltsegvetes IS
  $$Egységes RLS minden CRUD-ra. A current_user_can_access_congregation() helper dönt.$$;


-- ============================================================================
-- 3. szamadasicel — SPECIÁLIS (globális katalógus)
-- ============================================================================
--
-- A szamadasicel minden gyülekezetnek közös katalógus (nincs congregation_id).
-- Ezért a SELECT szándékosan mindenkinek engedélyezett.
-- Az UPDATE csak a TVA-mezők szerkesztésére korlátozódik (admin + konyvelo).
-- INSERT/DELETE: nincs user-szintű policy → csak service_role (migrációval) kezeli.
--
-- Törlendő (2 db duplikált):
--   - "Mindenki lathatja a szamadasicelokat" (ékezet nélküli)
--   - szamadasicel_read (true)

DROP POLICY IF EXISTS "Mindenki lathatja a szamadasicelokat" ON public.szamadasicel;
DROP POLICY IF EXISTS szamadasicel_read ON public.szamadasicel;
DROP POLICY IF EXISTS szamadasicel_select ON public.szamadasicel;
DROP POLICY IF EXISTS szamadasicel_update_tva ON public.szamadasicel;

-- 3a) SELECT mindenki (globális katalógus)
CREATE POLICY szamadasicel_select
  ON public.szamadasicel
  FOR SELECT
  USING (true);

COMMENT ON POLICY szamadasicel_select ON public.szamadasicel IS
  $$A szamadasicel globális katalógus, minden authenticated és anon user olvashatja.$$;

-- 3b) UPDATE csak a TVA mezőket szerkesztő jogosultak (admin + konyvelo)
--     FIGYELEM: a PostgreSQL RLS nem támogat oszlop-szintű szabályt natívan.
--     Az alkalmazás (Server Action) feladata, hogy csak a tva_* mezőket
--     engedje módosítani — ez a policy az RLS-oldali gate.
CREATE POLICY szamadasicel_update_tva
  ON public.szamadasicel
  FOR UPDATE
  USING (public.current_user_can_edit_tva_flags())
  WITH CHECK (public.current_user_can_edit_tva_flags());

COMMENT ON POLICY szamadasicel_update_tva ON public.szamadasicel IS
  $$Csak admin és konyvelo szerkesztheti a szamadasicel sorokat (TVA flag miatt). Az alkalmazás oldalán kell garantálni, hogy csak a tva_plafonba_szamit és tva_mentesseg_hivatkozas mezőket írja.$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐK (futtatás után)
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
--       AND c.relname IN ('bankszamlak','koltsegvetes','szamadasicel')
--     ORDER BY c.relname, pol.polname;
--
-- VÁRT:
--   bankszamlak  | bankszamlak_access        | ALL    | helper | helper
--   koltsegvetes | koltsegvetes_access       | ALL    | helper | helper
--   szamadasicel | szamadasicel_select       | SELECT | true   | (üres)
--   szamadasicel | szamadasicel_update_tva   | UPDATE | helper | helper
