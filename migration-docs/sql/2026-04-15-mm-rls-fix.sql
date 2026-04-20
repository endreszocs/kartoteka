-- ═══════════════════════════════════════════════════════════════════════════
-- MISSZIÓS MŰHELY RLS BIZTONSÁGI JAVÍTÁS
-- Dátum: 2026-04-15
-- Hivatkozott audit: docs/project-tracking/KARTOTEKA-rendszerdiagnosztika-2026-04-12.md (K1)
-- Projekt log: docs/project-tracking/KARTOTEKA-project-log.md (018. lépés)
--
-- PROBLÉMA:
-- A 2026-04-13-rls-ALL-FIXED.sql migráció létrehozott egy sor _all policy-t
-- a 7 fő mm_* táblára `FOR ALL TO authenticated USING (true)` szabállyal.
-- Ez TELJESEN megengedő — minden authenticated user módosíthat MINDEN sort.
-- Mivel PostgreSQL-ben több policy OR-rel kombinálódik, ez felülírja a
-- 2026-04-12-missziós-muhely-rls.sql szigorú policy-jait.
--
-- KÖVETKEZMÉNY:
-- - Bárki módosíthatja más ötletét (mm_otletek)
-- - Bárki értékelheti más segédanyagát módosíthatja (mm_segedanyagok)
-- - Bárki törölhet/módosíthat junction sorokat (mm_otlet_kategoriak)
-- - Bárki feltölthet/törölhet dokumentumot (mm_dokumentumok)
-- - Bárki teljesítettre állíthat feladatot/mérföldkövet (mm_feladatok, mm_merfoldkovek)
-- - Bárki adhat címkét más ötletére (mm_otlet_cimkek)
--
-- MEGOLDÁS:
-- 1) DROP-oljuk a túlzottan megengedő _all policy-kat
-- 2) Restore-oljuk a szigorú tulajdonos-alapú policy-kat (idempotens módon)
-- 3) Az eddig használatlan mm_feladatok/merfoldkovek/dokumentumok/otlet_cimkek
--    táblákra ötletgazda-alapú policy-kat hozunk létre, így a D1 (Sziget) modul
--    fejlesztése előtt is biztonságos legyen.
-- 4) Ellenőrző query-k a végén
--
-- ELŐFELTÉTEL:
-- - 2026-04-12-phase-0-rls-hardening.sql futtatva (helper függvények)
-- - 2026-04-12-missziós-muhely-rls.sql futtatva (szigorú policy-k léteznek)
-- - 2026-04-13-rls-ALL-FIXED.sql futtatva (a megengedő policy-k léteznek)
--
-- IDEMPOTENS:
-- A migráció többször is futtatható. DROP POLICY IF EXISTS + DO $$ blokkok
-- biztosítják, hogy a hibás policy-k nem akasztják meg.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RÉSZ — A megengedő _all policy-k DROP-olása
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mm_dokumentumok_all      ON public.mm_dokumentumok;
DROP POLICY IF EXISTS mm_feladatok_all         ON public.mm_feladatok;
DROP POLICY IF EXISTS mm_merfoldkovek_all      ON public.mm_merfoldkovek;
DROP POLICY IF EXISTS mm_otlet_cimkek_all      ON public.mm_otlet_cimkek;
DROP POLICY IF EXISTS mm_otlet_kategoriak_all  ON public.mm_otlet_kategoriak;
DROP POLICY IF EXISTS mm_otletek_all           ON public.mm_otletek;
DROP POLICY IF EXISTS mm_segedanyagok_all      ON public.mm_segedanyagok;

-- A 2026-04-13-rls-mm-misc-tables.sql legacy nevű policy-i is ki kell takarítani,
-- ha még léteznek, mert ugyanúgy USING (true) szabályúak.
DROP POLICY IF EXISTS mm_dokumentumok_access      ON public.mm_dokumentumok;
DROP POLICY IF EXISTS mm_feladatok_access         ON public.mm_feladatok;
DROP POLICY IF EXISTS mm_merfoldkovek_access      ON public.mm_merfoldkovek;
DROP POLICY IF EXISTS mm_otlet_cimkek_access      ON public.mm_otlet_cimkek;
DROP POLICY IF EXISTS mm_otlet_kategoriak_access  ON public.mm_otlet_kategoriak;
DROP POLICY IF EXISTS mm_otletek_access           ON public.mm_otletek;
DROP POLICY IF EXISTS mm_segedanyagok_access      ON public.mm_segedanyagok;

-- A korábbi konzervatív admin-only fallback-eket is kitakarítjuk, mert most
-- ennél finomabb policy-kat fogunk létrehozni a 4 használatlan táblára.
DROP POLICY IF EXISTS mm_feladatok_admin_only      ON public.mm_feladatok;
DROP POLICY IF EXISTS mm_merfoldkovek_admin_only   ON public.mm_merfoldkovek;
DROP POLICY IF EXISTS mm_dokumentumok_admin_only   ON public.mm_dokumentumok;
DROP POLICY IF EXISTS mm_otlet_cimkek_admin_only   ON public.mm_otlet_cimkek;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RÉSZ — Szigorú policy-k visszaállítása mm_otletek-re
-- (Ezek a 2026-04-12-missziós-muhely-rls.sql-ben már léteznek, de
--  idempotens újraépítés a biztonság kedvéért.)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mm_otletek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_otletek_read_all ON public.mm_otletek;
CREATE POLICY mm_otletek_read_all
  ON public.mm_otletek
  FOR SELECT
  TO authenticated
  USING (
    aktiv = true
    OR otletgazda_id = auth.uid()
    OR public.current_user_has_global_access()
  );

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
-- 3. RÉSZ — Szigorú policy-k visszaállítása mm_segedanyagok-ra
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mm_segedanyagok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_segedanyagok_read_all ON public.mm_segedanyagok;
CREATE POLICY mm_segedanyagok_read_all
  ON public.mm_segedanyagok
  FOR SELECT
  TO authenticated
  USING (
    aktiv = true
    OR feltolto_id = auth.uid()
    OR public.current_user_has_global_access()
  );

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
-- 4. RÉSZ — Szigorú policy-k visszaállítása mm_otlet_kategoriak junction-re
-- ─────────────────────────────────────────────────────────────────────────

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
-- 5. RÉSZ — Új szigorú policy-k a használatlan táblákra
-- (mm_feladatok, mm_merfoldkovek, mm_dokumentumok, mm_otlet_cimkek)
--
-- Logika: ezek mind otlet_id-vel hivatkoznak ötletre. A módosítást az
-- ötletgazda végezheti (és a felelős a saját feladat statuszát írhatja).
-- Az olvasás minden authenticated user-nek nyitott (közösségi tér).
-- ─────────────────────────────────────────────────────────────────────────

-- ── 5a. mm_feladatok ──
ALTER TABLE public.mm_feladatok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_feladatok_read_all ON public.mm_feladatok;
CREATE POLICY mm_feladatok_read_all
  ON public.mm_feladatok
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_feladatok_insert_owner ON public.mm_feladatok;
CREATE POLICY mm_feladatok_insert_owner
  ON public.mm_feladatok
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_feladatok.otlet_id
        AND (o.otletgazda_id = auth.uid() OR public.current_user_has_global_access())
    )
  );

DROP POLICY IF EXISTS mm_feladatok_update_owner_or_assignee ON public.mm_feladatok;
CREATE POLICY mm_feladatok_update_owner_or_assignee
  ON public.mm_feladatok
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_feladatok.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
    -- A felelős frissítheti saját feladat statuszát
    OR felelos_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_feladatok.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
    OR felelos_id = auth.uid()
  );

DROP POLICY IF EXISTS mm_feladatok_delete_owner ON public.mm_feladatok;
CREATE POLICY mm_feladatok_delete_owner
  ON public.mm_feladatok
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_feladatok.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
  );

-- ── 5b. mm_merfoldkovek ──
ALTER TABLE public.mm_merfoldkovek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_merfoldkovek_read_all ON public.mm_merfoldkovek;
CREATE POLICY mm_merfoldkovek_read_all
  ON public.mm_merfoldkovek
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_merfoldkovek_write_owner ON public.mm_merfoldkovek;
CREATE POLICY mm_merfoldkovek_write_owner
  ON public.mm_merfoldkovek
  FOR ALL
  TO authenticated
  USING (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_merfoldkovek.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_merfoldkovek.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
  );

-- ── 5c. mm_dokumentumok ──
ALTER TABLE public.mm_dokumentumok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_dokumentumok_read_all ON public.mm_dokumentumok;
CREATE POLICY mm_dokumentumok_read_all
  ON public.mm_dokumentumok
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_dokumentumok_insert_owner_or_team ON public.mm_dokumentumok;
CREATE POLICY mm_dokumentumok_insert_owner_or_team
  ON public.mm_dokumentumok
  FOR INSERT
  TO authenticated
  WITH CHECK (
    feltolto_id = auth.uid()
    AND (
      public.current_user_has_global_access()
      OR EXISTS (
        SELECT 1 FROM public.mm_otletek o
        WHERE o.id = mm_dokumentumok.otlet_id
          AND (
            o.otletgazda_id = auth.uid()
            -- Csapat tagok is feltölthetnek
            OR EXISTS (
              SELECT 1 FROM public.mm_szavazatok sz
              WHERE sz.otlet_id = o.id
                AND sz.user_id = auth.uid()
                AND sz.tipus = 'csatlakozas'
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS mm_dokumentumok_delete_owner_or_uploader ON public.mm_dokumentumok;
CREATE POLICY mm_dokumentumok_delete_owner_or_uploader
  ON public.mm_dokumentumok
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_has_global_access()
    OR feltolto_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_dokumentumok.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
  );

-- A dokumentum metaadatait NEM lehet módosítani (URL, méret), újrafeltöltés
-- történik. Ezért UPDATE policy NINCS.

-- ── 5d. mm_otlet_cimkek ──
ALTER TABLE public.mm_otlet_cimkek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_otlet_cimkek_read_all ON public.mm_otlet_cimkek;
CREATE POLICY mm_otlet_cimkek_read_all
  ON public.mm_otlet_cimkek
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS mm_otlet_cimkek_write_owner ON public.mm_otlet_cimkek;
CREATE POLICY mm_otlet_cimkek_write_owner
  ON public.mm_otlet_cimkek
  FOR ALL
  TO authenticated
  USING (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_otlet_cimkek.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.mm_otletek o
      WHERE o.id = mm_otlet_cimkek.otlet_id
        AND o.otletgazda_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RÉSZ — Verifikáció (futtasd kézzel a migráció után)
-- ─────────────────────────────────────────────────────────────────────────

-- 6a. Ellenőrzés: minden mm_* táblán RLS aktív?
-- Várt eredmény: 15 sor, mind rowsecurity = true
--
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public' AND tablename LIKE 'mm_%'
--   ORDER BY tablename;

-- 6b. Ellenőrzés: nincs maradt _all vagy _access policy?
-- Várt eredmény: 0 sor
--
--   SELECT schemaname, tablename, policyname
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename LIKE 'mm_%'
--     AND (policyname LIKE '%_all' OR policyname LIKE '%_access')
--   ORDER BY tablename, policyname;

-- 6c. Ellenőrzés: mm_otletek-en a 4 szigorú policy létezik?
-- Várt eredmény: 4 sor (read_all, insert_own, update_own, delete_own)
--
--   SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'mm_otletek'
--   ORDER BY policyname;

-- 6d. Ellenőrzés: mm_felhasznalo_statisztika-n NINCS INSERT/UPDATE/DELETE policy?
-- Várt eredmény: csak SELECT cmd-jű sorok jelennek meg
--
--   SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'mm_felhasznalo_statisztika'
--   ORDER BY cmd;

-- 6e. Funkcionális teszt (egy nem-master usernek, anon kulcs):
-- Az alábbiak HIBÁRA kell hogy fussanak:
--
--   -- Másik user statisztikájának feltornázása
--   UPDATE public.mm_felhasznalo_statisztika
--     SET osszpontszam = 999999
--     WHERE user_id = '<masik-user-uuid>';
--   -- → ERROR: new row violates row-level security policy
--
--   -- Másik user ötletének módosítása
--   UPDATE public.mm_otletek
--     SET cim = 'eltérített'
--     WHERE otletgazda_id <> auth.uid();
--   -- → 0 rows updated (a USING szűrő miatt nem látszik)
--
--   -- Másik user segédanyagának deaktiválása
--   UPDATE public.mm_segedanyagok
--     SET aktiv = false
--     WHERE feltolto_id <> auth.uid();
--   -- → 0 rows updated

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉGE
-- ═══════════════════════════════════════════════════════════════════════════
