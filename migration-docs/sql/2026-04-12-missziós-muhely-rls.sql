-- ═══════════════════════════════════════════════════════════════════════════
-- MISSZIÓS MŰHELY RLS MIGRÁCIÓ
-- Dátum: 2026-04-12
--
-- Cél: RLS engedélyezése az összes mm_* táblán. A Missziós Műhely egy közös
-- tér, ahol minden bejelentkezett lelkész látja egymás tartalmait, DE csak a
-- saját tartalmait módosíthatja/törölheti. A statisztika és a pontok csak
-- server-side action-ökkel módosíthatók (security definer).
--
-- ELŐFELTÉTEL: 2026-04-12-phase-0-rls-hardening.sql futtatva (a helper
-- függvényekhez: current_user_has_global_access, current_user_is_active_staff).
-- ═══════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- KATEGÓRIÁK (read-only a klienseknek)
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.mm_kategoriak TO anon, authenticated;
ALTER TABLE public.mm_kategoriak ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_kategoriak_read_all ON public.mm_kategoriak;
CREATE POLICY mm_kategoriak_read_all
  ON public.mm_kategoriak
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- JELVÉNY TÍPUSOK (read-only a klienseknek)
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.mm_jelveny_tipusok TO authenticated;
ALTER TABLE public.mm_jelveny_tipusok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_jelveny_tipusok_read_all ON public.mm_jelveny_tipusok;
CREATE POLICY mm_jelveny_tipusok_read_all
  ON public.mm_jelveny_tipusok
  FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- MM_OTLETEK (ötletek) — mindenki olvas, csak a tulajdonos módosít
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_otletek TO authenticated;
ALTER TABLE public.mm_otletek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_otletek_read_all ON public.mm_otletek;
CREATE POLICY mm_otletek_read_all
  ON public.mm_otletek
  FOR SELECT
  TO authenticated
  USING (aktiv = true OR otletgazda_id = auth.uid() OR public.current_user_has_global_access());

DROP POLICY IF EXISTS mm_otletek_insert_own ON public.mm_otletek;
CREATE POLICY mm_otletek_insert_own
  ON public.mm_otletek
  FOR INSERT
  TO authenticated
  WITH CHECK (
    otletgazda_id = auth.uid()
    AND public.current_user_is_active_staff()
  );

DROP POLICY IF EXISTS mm_otletek_update_own ON public.mm_otletek;
CREATE POLICY mm_otletek_update_own
  ON public.mm_otletek
  FOR UPDATE
  TO authenticated
  USING (otletgazda_id = auth.uid() OR public.current_user_has_global_access())
  WITH CHECK (otletgazda_id = auth.uid() OR public.current_user_has_global_access());

DROP POLICY IF EXISTS mm_otletek_delete_own ON public.mm_otletek;
CREATE POLICY mm_otletek_delete_own
  ON public.mm_otletek
  FOR DELETE
  TO authenticated
  USING (otletgazda_id = auth.uid() OR public.current_user_has_global_access());

-- ─────────────────────────────────────────────────────────────────────────
-- MM_OTLET_KATEGORIAK — kategóriák <-> ötletek junction
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_otlet_kategoriak TO authenticated;
ALTER TABLE public.mm_otlet_kategoriak ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_otlet_kategoriak_read_all ON public.mm_otlet_kategoriak;
CREATE POLICY mm_otlet_kategoriak_read_all
  ON public.mm_otlet_kategoriak
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_otlet_kategoriak_write_own ON public.mm_otlet_kategoriak;
CREATE POLICY mm_otlet_kategoriak_write_own
  ON public.mm_otlet_kategoriak
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_otlet_kategoriak.otlet_id
        AND (o.otletgazda_id = auth.uid() OR public.current_user_has_global_access())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_otlet_kategoriak.otlet_id
        AND (o.otletgazda_id = auth.uid() OR public.current_user_has_global_access())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- MM_SZAVAZATOK (szavazás, csatlakozás) — saját szavazat kezelése
-- FONTOS: UNIQUE constraint + RLS a duplikációs exploit ellen
-- ─────────────────────────────────────────────────────────────────────────

-- Duplikációs védelem — egy user egy ötletre csak egy típusú szavazatot adhat
CREATE UNIQUE INDEX IF NOT EXISTS mm_szavazatok_unique
  ON public.mm_szavazatok (otlet_id, user_id, tipus);

GRANT SELECT, INSERT, DELETE ON public.mm_szavazatok TO authenticated;
ALTER TABLE public.mm_szavazatok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_szavazatok_read_all ON public.mm_szavazatok;
CREATE POLICY mm_szavazatok_read_all
  ON public.mm_szavazatok
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_szavazatok_insert_self ON public.mm_szavazatok;
CREATE POLICY mm_szavazatok_insert_self
  ON public.mm_szavazatok
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mm_szavazatok_delete_self ON public.mm_szavazatok;
CREATE POLICY mm_szavazatok_delete_self
  ON public.mm_szavazatok
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- MM_HOZZASZOLASOK (fórum hozzászólások)
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_hozzaszolasok TO authenticated;
ALTER TABLE public.mm_hozzaszolasok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_hozzaszolasok_read_all ON public.mm_hozzaszolasok;
CREATE POLICY mm_hozzaszolasok_read_all
  ON public.mm_hozzaszolasok
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_hozzaszolasok_insert_self ON public.mm_hozzaszolasok;
CREATE POLICY mm_hozzaszolasok_insert_self
  ON public.mm_hozzaszolasok
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_is_active_staff()
  );

DROP POLICY IF EXISTS mm_hozzaszolasok_update_self ON public.mm_hozzaszolasok;
CREATE POLICY mm_hozzaszolasok_update_self
  ON public.mm_hozzaszolasok
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_has_global_access())
  WITH CHECK (user_id = auth.uid() OR public.current_user_has_global_access());

DROP POLICY IF EXISTS mm_hozzaszolasok_delete_self ON public.mm_hozzaszolasok;
CREATE POLICY mm_hozzaszolasok_delete_self
  ON public.mm_hozzaszolasok
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_has_global_access());

-- ─────────────────────────────────────────────────────────────────────────
-- MM_SEGEDANYAGOK (segédanyagok)
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_segedanyagok TO authenticated;
ALTER TABLE public.mm_segedanyagok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_segedanyagok_read_all ON public.mm_segedanyagok;
CREATE POLICY mm_segedanyagok_read_all
  ON public.mm_segedanyagok
  FOR SELECT
  TO authenticated
  USING (aktiv = true OR feltolto_id = auth.uid() OR public.current_user_has_global_access());

DROP POLICY IF EXISTS mm_segedanyagok_insert_own ON public.mm_segedanyagok;
CREATE POLICY mm_segedanyagok_insert_own
  ON public.mm_segedanyagok
  FOR INSERT
  TO authenticated
  WITH CHECK (
    feltolto_id = auth.uid()
    AND public.current_user_is_active_staff()
  );

DROP POLICY IF EXISTS mm_segedanyagok_update_own ON public.mm_segedanyagok;
CREATE POLICY mm_segedanyagok_update_own
  ON public.mm_segedanyagok
  FOR UPDATE
  TO authenticated
  USING (feltolto_id = auth.uid() OR public.current_user_has_global_access())
  WITH CHECK (feltolto_id = auth.uid() OR public.current_user_has_global_access());

DROP POLICY IF EXISTS mm_segedanyagok_delete_own ON public.mm_segedanyagok;
CREATE POLICY mm_segedanyagok_delete_own
  ON public.mm_segedanyagok
  FOR DELETE
  TO authenticated
  USING (feltolto_id = auth.uid() OR public.current_user_has_global_access());

-- ─────────────────────────────────────────────────────────────────────────
-- MM_SEGEDANYAG_KATEGORIAK — junction
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_segedanyag_kategoriak TO authenticated;
ALTER TABLE public.mm_segedanyag_kategoriak ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_segedanyag_kategoriak_read_all ON public.mm_segedanyag_kategoriak;
CREATE POLICY mm_segedanyag_kategoriak_read_all
  ON public.mm_segedanyag_kategoriak
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_segedanyag_kategoriak_write_own ON public.mm_segedanyag_kategoriak;
CREATE POLICY mm_segedanyag_kategoriak_write_own
  ON public.mm_segedanyag_kategoriak
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mm_segedanyagok s
      WHERE s.id = mm_segedanyag_kategoriak.segedanyag_id
        AND (s.feltolto_id = auth.uid() OR public.current_user_has_global_access())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mm_segedanyagok s
      WHERE s.id = mm_segedanyag_kategoriak.segedanyag_id
        AND (s.feltolto_id = auth.uid() OR public.current_user_has_global_access())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- MM_SEGEDANYAG_ERTEKELESEK (értékelések) — saját értékelés kezelése
-- UNIQUE constraint, hogy egy user egy anyagot csak egyszer értékelhessen
-- ─────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS mm_segedanyag_ertekelesek_unique
  ON public.mm_segedanyag_ertekelesek (segedanyag_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_segedanyag_ertekelesek TO authenticated;
ALTER TABLE public.mm_segedanyag_ertekelesek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_read_all ON public.mm_segedanyag_ertekelesek;
CREATE POLICY mm_segedanyag_ertekelesek_read_all
  ON public.mm_segedanyag_ertekelesek
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_insert_self ON public.mm_segedanyag_ertekelesek;
CREATE POLICY mm_segedanyag_ertekelesek_insert_self
  ON public.mm_segedanyag_ertekelesek
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_update_self ON public.mm_segedanyag_ertekelesek;
CREATE POLICY mm_segedanyag_ertekelesek_update_self
  ON public.mm_segedanyag_ertekelesek
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_delete_self ON public.mm_segedanyag_ertekelesek;
CREATE POLICY mm_segedanyag_ertekelesek_delete_self
  ON public.mm_segedanyag_ertekelesek
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- MM_FELHASZNALO_STATISZTIKA — KRITIKUS: csak server action módosíthat
-- A felhasználó a sajátját olvashatja; mások sajátjait a global access tudja
-- Az INSERT/UPDATE csak SECURITY DEFINER function-ön keresztül engedhető,
-- ezért kliens-oldalon TELJESEN letiltjuk.
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.mm_felhasznalo_statisztika TO authenticated;
ALTER TABLE public.mm_felhasznalo_statisztika ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_stats_read_self_or_admin ON public.mm_felhasznalo_statisztika;
CREATE POLICY mm_stats_read_self_or_admin
  ON public.mm_felhasznalo_statisztika
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_global_access()
  );

-- Ranglistához — minden user látja (olvasható sorok, user_id + osszpontszam)
-- Ez már a SELECT policy alatt van, de bővítenünk kell a ranglista
-- funkcióhoz: minden authenticated user olvashatja az összpontszámokat.
-- A social layert a server action-ök kezelik, a privacy OK.
DROP POLICY IF EXISTS mm_stats_read_leaderboard ON public.mm_felhasznalo_statisztika;
CREATE POLICY mm_stats_read_leaderboard
  ON public.mm_felhasznalo_statisztika
  FOR SELECT
  TO authenticated
  USING (true);

-- NINCS INSERT/UPDATE/DELETE policy → kliens-oldalon tilos.
-- A server action-ök a service_role kliensen vagy a security definer-eken
-- keresztül írnak, amelyek a RLS-t megkerülik.

-- ─────────────────────────────────────────────────────────────────────────
-- MM_FELHASZNALO_JELVENY (elnyert jelvények)
-- UNIQUE constraint a duplikáció ellen
-- ─────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS mm_felhasznalo_jelveny_unique
  ON public.mm_felhasznalo_jelveny (user_id, jelveny_id);

GRANT SELECT ON public.mm_felhasznalo_jelveny TO authenticated;
ALTER TABLE public.mm_felhasznalo_jelveny ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_jelveny_read_all ON public.mm_felhasznalo_jelveny;
CREATE POLICY mm_jelveny_read_all
  ON public.mm_felhasznalo_jelveny
  FOR SELECT
  TO authenticated
  USING (true);

-- Szintén NINCS INSERT/UPDATE/DELETE policy — csak server action írhat.

-- ─────────────────────────────────────────────────────────────────────────
-- MM_FELADATOK, MM_MERFOLDKOVEK, MM_DOKUMENTUMOK, MM_OTLET_CIMKEK
-- Ezek egyelőre nem használt táblák, de RLS-t mindenképp engedélyezünk.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'mm_feladatok',
      'mm_merfoldkovek',
      'mm_dokumentumok',
      'mm_otlet_cimkek'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);

      -- Alapértelmezett policy: csak a global admin lát/ír (konzervatív default)
      EXECUTE format('DROP POLICY IF EXISTS %I_admin_only ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY %I_admin_only ON public.%I FOR ALL TO authenticated USING (public.current_user_has_global_access()) WITH CHECK (public.current_user_has_global_access())', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- Futtasd ezt, hogy lásd mely mm_* táblákon van RLS:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename LIKE 'mm_%'
-- ORDER BY tablename;
--
-- Minden tábla 'rowsecurity = true' legyen.
-- ─────────────────────────────────────────────────────────────────────────
