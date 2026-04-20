-- ═══════════════════════════════════════════════════════════════════════════
-- FÁZIS 0 — RLS BIZTONSÁGI MEGSZILÁRDÍTÁS
-- Dátum: 2026-04-12
--
-- Cél: Row Level Security engedélyezése a legacy tábláknál (szemely, befizetes,
-- csalad, gyerek), amelyek eddig csak app-szinten voltak szűrve congregation_id
-- alapján. Ez a védelem kritikus, mielőtt bármilyen új auth-olt felhasználói
-- típus (pl. tag portál) a rendszerbe kerülne.
--
-- A változtatás MEGTARTJA a jelenlegi lelkészi viselkedést:
--  - lelkesz: csak a saját congregation_id-jéhez tartozó rekordokat látja/módosítja
--  - esperes / egyhazmegyei_admin: összes gyülekezet látható
--  - admin: teljes hozzáférés
--  - master admin (env var alapján): nem RLS-szinten, hanem app-szinten kezelt
--
-- FONTOS: ezt a migrációt CSAK regressziós teszt UTÁN szabad produkcióban
-- futtatni. Teszt checklist:
--   [ ] /dashboard KPI számok változatlan
--   [ ] /tagnyilvantartas lelkészi nézet működik
--   [ ] /penzugy bevétel/kiadás lista helyes
--   [ ] /anyakonyv keresztelés/házasság/temetés lista
--   [ ] /sirhelyek, /munkanaplo, /leltar, /iktato modul működik
--   [ ] Admin override god mode látja a cél gyülekezetet
--   [ ] Anon user → SELECT * FROM szemely → 0 sor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- HELPER FÜGGVÉNYEK (SECURITY DEFINER)
--
-- Ezek a függvények a profiles táblát olvassák, hogy eldöntsék a jogosultságot.
-- SECURITY DEFINER-ként futnak, ami lehetővé teszi, hogy a RLS ellenőrzés
-- megbízhatóan olvassa a profiles táblát függetlenül attól, hogy azon is
-- van-e RLS. STABLE jelzés → eredmény cache-elhető egy query-n belül.
-- ─────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO authenticated;

-- A bejelentkezett felhasználó aktív-e és melyik congregation-höz tartozik?
CREATE OR REPLACE FUNCTION public.current_user_congregation_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT congregation_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND status = 'active';
$$;

-- Admin/esperes/egyhazmegyei_admin? (mindent látó szerepkörök)
CREATE OR REPLACE FUNCTION public.current_user_has_global_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
  );
$$;

-- Aktív lelkészi/admin felhasználó-e? (bármi auth-olt action-höz)
CREATE OR REPLACE FUNCTION public.current_user_is_active_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
  );
$$;

-- A felhasználó elérheti-e az adott congregation-t?
-- (a saját congregation-je VAGY global access)
CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.current_user_has_global_access()
    OR (
      target_cong IS NOT NULL
      AND target_cong = public.current_user_congregation_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_congregation_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_active_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_congregation(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- SZEMELY tábla RLS
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.szemely TO authenticated;
ALTER TABLE public.szemely ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS szemely_staff_select ON public.szemely;
CREATE POLICY szemely_staff_select
  ON public.szemely
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS szemely_staff_insert ON public.szemely;
CREATE POLICY szemely_staff_insert
  ON public.szemely
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS szemely_staff_update ON public.szemely;
CREATE POLICY szemely_staff_update
  ON public.szemely
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS szemely_staff_delete ON public.szemely;
CREATE POLICY szemely_staff_delete
  ON public.szemely
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- ─────────────────────────────────────────────────────────────────────────
-- BEFIZETES tábla RLS
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.befizetes TO authenticated;
ALTER TABLE public.befizetes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS befizetes_staff_select ON public.befizetes;
CREATE POLICY befizetes_staff_select
  ON public.befizetes
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS befizetes_staff_insert ON public.befizetes;
CREATE POLICY befizetes_staff_insert
  ON public.befizetes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS befizetes_staff_update ON public.befizetes;
CREATE POLICY befizetes_staff_update
  ON public.befizetes
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS befizetes_staff_delete ON public.befizetes;
CREATE POLICY befizetes_staff_delete
  ON public.befizetes
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- ─────────────────────────────────────────────────────────────────────────
-- CSALAD tábla RLS
--
-- A csalad táblán NINCS közvetlen congregation_id. Az ellenőrzés a férfi vagy
-- nő szemely congregation_id-jén keresztül történik (az egyiknek létezni kell).
-- A szemely-re is van RLS, ezért a SECURITY DEFINER helper megkerülhető — de a
-- szemely táblába közvetlen congregation check kell helper-en keresztül.
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.csalad TO authenticated;
ALTER TABLE public.csalad ENABLE ROW LEVEL SECURITY;

-- Helper: a család tagjain keresztül ellenőrzi a congregation hozzáférést.
-- SECURITY DEFINER, hogy a szemely RLS ne blokkolja.
CREATE OR REPLACE FUNCTION public.csalad_resolves_to_accessible_cong(p_id_ferfi integer, p_id_no integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.szemely s
      WHERE (
        (p_id_ferfi IS NOT NULL AND s.id = p_id_ferfi)
        OR (p_id_no IS NOT NULL AND s.id = p_id_no)
      )
      AND s.congregation_id IS NOT NULL
      AND s.congregation_id = public.current_user_congregation_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.csalad_resolves_to_accessible_cong(integer, integer) TO authenticated;

DROP POLICY IF EXISTS csalad_staff_select ON public.csalad;
CREATE POLICY csalad_staff_select
  ON public.csalad
  FOR SELECT
  TO authenticated
  USING (public.csalad_resolves_to_accessible_cong(id_ferfi, id_no));

DROP POLICY IF EXISTS csalad_staff_insert ON public.csalad;
CREATE POLICY csalad_staff_insert
  ON public.csalad
  FOR INSERT
  TO authenticated
  WITH CHECK (public.csalad_resolves_to_accessible_cong(id_ferfi, id_no));

DROP POLICY IF EXISTS csalad_staff_update ON public.csalad;
CREATE POLICY csalad_staff_update
  ON public.csalad
  FOR UPDATE
  TO authenticated
  USING (public.csalad_resolves_to_accessible_cong(id_ferfi, id_no))
  WITH CHECK (public.csalad_resolves_to_accessible_cong(id_ferfi, id_no));

DROP POLICY IF EXISTS csalad_staff_delete ON public.csalad;
CREATE POLICY csalad_staff_delete
  ON public.csalad
  FOR DELETE
  TO authenticated
  USING (public.csalad_resolves_to_accessible_cong(id_ferfi, id_no));

-- ─────────────────────────────────────────────────────────────────────────
-- GYEREK tábla RLS
--
-- A gyerek táblán sincs közvetlen congregation_id. A csalad-on keresztül
-- ellenőrizünk: a gyerek láthatóvá válik, ha a család (amihez tartozik)
-- tagjainak congregation_id-je egyezik a user-ével.
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gyerek TO authenticated;
ALTER TABLE public.gyerek ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gyerek_resolves_to_accessible_cong(p_id_csalad integer, p_id_szemely integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.szemely s
      WHERE s.id = p_id_szemely
        AND s.congregation_id IS NOT NULL
        AND s.congregation_id = public.current_user_congregation_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.csalad c
      JOIN public.szemely s2 ON (s2.id = c.id_ferfi OR s2.id = c.id_no)
      WHERE c.id = p_id_csalad
        AND s2.congregation_id IS NOT NULL
        AND s2.congregation_id = public.current_user_congregation_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.gyerek_resolves_to_accessible_cong(integer, integer) TO authenticated;

DROP POLICY IF EXISTS gyerek_staff_select ON public.gyerek;
CREATE POLICY gyerek_staff_select
  ON public.gyerek
  FOR SELECT
  TO authenticated
  USING (public.gyerek_resolves_to_accessible_cong(id_csalad, id_szemely));

DROP POLICY IF EXISTS gyerek_staff_insert ON public.gyerek;
CREATE POLICY gyerek_staff_insert
  ON public.gyerek
  FOR INSERT
  TO authenticated
  WITH CHECK (public.gyerek_resolves_to_accessible_cong(id_csalad, id_szemely));

DROP POLICY IF EXISTS gyerek_staff_update ON public.gyerek;
CREATE POLICY gyerek_staff_update
  ON public.gyerek
  FOR UPDATE
  TO authenticated
  USING (public.gyerek_resolves_to_accessible_cong(id_csalad, id_szemely))
  WITH CHECK (public.gyerek_resolves_to_accessible_cong(id_csalad, id_szemely));

DROP POLICY IF EXISTS gyerek_staff_delete ON public.gyerek;
CREATE POLICY gyerek_staff_delete
  ON public.gyerek
  FOR DELETE
  TO authenticated
  USING (public.gyerek_resolves_to_accessible_cong(id_csalad, id_szemely));

-- ─────────────────────────────────────────────────────────────────────────
-- INDEXEK A TELJESÍTMÉNY MEGTARTÁSÁÉRT
--
-- A congregation_id-re épülő RLS gyakran szűr — ha nincs index, a large table-ok
-- lassúak lehetnek. Létrehozzuk az index-eket, ha még nincsenek.
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS szemely_congregation_id_idx
  ON public.szemely (congregation_id)
  WHERE congregation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS befizetes_congregation_id_idx
  ON public.befizetes (congregation_id)
  WHERE congregation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS csalad_id_ferfi_idx ON public.csalad (id_ferfi);
CREATE INDEX IF NOT EXISTS csalad_id_no_idx ON public.csalad (id_no);

CREATE INDEX IF NOT EXISTS gyerek_id_csalad_idx ON public.gyerek (id_csalad);
CREATE INDEX IF NOT EXISTS gyerek_id_szemely_idx ON public.gyerek (id_szemely);

-- ─────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION TESZT QUERY-K
--
-- Futtasd ezeket a migráció után, hogy ellenőrizd az RLS működését:
--
-- 1. Lelkészi session (auth.uid() = lelkész uuid):
--    SELECT count(*) FROM public.szemely;
--    → csak a saját congregation tagjainak száma
--
-- 2. Anon role (nincs auth):
--    SELECT count(*) FROM public.szemely;
--    → 0 (az RLS tiltja)
--
-- 3. Admin session:
--    SELECT count(*) FROM public.szemely;
--    → minden sor
--
-- 4. Családok láthatók-e:
--    SELECT count(*) FROM public.csalad;
--    → a user gyülekezetének családjai
-- ─────────────────────────────────────────────────────────────────────────
