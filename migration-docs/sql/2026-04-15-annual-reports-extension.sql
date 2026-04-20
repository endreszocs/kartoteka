-- ═══════════════════════════════════════════════════════════════════════════
-- ANNUAL_REPORTS TÁBLA BŐVÍTÉS — Éves jelentések (C1 modul, MVP)
-- Dátum: 2026-04-15
-- Projekt log: 030. lépés
--
-- A meglévő `annual_reports` tábla minimális (9 oszlop). A C1 modul (10
-- szekciós hivatalos éves jelentés) bővíti workflow + snapshot mezőkkel.
--
-- STRATÉGIA: snapshot_data jsonb — minden szekciót egyetlen rugalmas
-- jsonb mezőben tárolunk. Konzisztens a `document_submissions` táblával,
-- és új szekció hozzáadása nem igényel migrációt.
--
-- A 3 számláló oszlop (members_count, services_count, total_income) marad
-- gyors KPI cache-szerűen, a snapshot_data tartalmazza a teljes szerkezetet.
--
-- WORKFLOW: draft → submitted → received → reviewed → finalized
--                                              → forwarded_to_kerulet (opcionális)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ÚJ MEZŐK ─────────────────────────────────────────────────

ALTER TABLE public.annual_reports
  ADD COLUMN IF NOT EXISTS snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS forwarded_to_kerulet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forwarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── 2. STATUS ENUM SZIGORÍTÁS ───────────────────────────────────

ALTER TABLE public.annual_reports DROP CONSTRAINT IF EXISTS annual_reports_status_check;
ALTER TABLE public.annual_reports ADD CONSTRAINT annual_reports_status_check
  CHECK (status IN ('draft', 'submitted', 'received', 'reviewed', 'finalized'));

-- Default: draft (új sor még nincs beküldve)
ALTER TABLE public.annual_reports ALTER COLUMN status SET DEFAULT 'draft';

-- ── 3. UNIQUE CONSTRAINT (egy gyülekezet, egy év = egy jelentés) ───

CREATE UNIQUE INDEX IF NOT EXISTS annual_reports_unique_per_year
  ON public.annual_reports (congregation_id, year)
  WHERE deleted = false;

-- ── 4. INDEX-EK ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_annual_reports_status
  ON public.annual_reports (status, year);

CREATE INDEX IF NOT EXISTS idx_annual_reports_year
  ON public.annual_reports (year);

CREATE INDEX IF NOT EXISTS idx_annual_reports_cong
  ON public.annual_reports (congregation_id, year);

-- ── 5. RLS POLICY-K BŐVÍTÉS ─────────────────────────────────────
-- A meglévő `annual_reports_access` policy túl egyszerű. Bővítjük az
-- esperes / egyházmegyei admin szerepkörrel és státusz-szigorítással.

DROP POLICY IF EXISTS annual_reports_access ON public.annual_reports;

-- SELECT: saját gyülekezet + esperes (saját egyházmegye gyülekezetei) + admin/master
DROP POLICY IF EXISTS annual_reports_select ON public.annual_reports;
CREATE POLICY annual_reports_select
  ON public.annual_reports
  FOR SELECT
  TO authenticated
  USING (
    deleted = false
    AND (
      congregation_id = current_user_congregation_id()
      OR current_user_has_global_access()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.congregations c ON c.diocese_id = p.diocese_id
        WHERE p.id = auth.uid()
          AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
          AND c.id = annual_reports.congregation_id
      )
    )
  );

-- INSERT: csak saját gyülekezetbe (a pásztor)
DROP POLICY IF EXISTS annual_reports_insert ON public.annual_reports;
CREATE POLICY annual_reports_insert
  ON public.annual_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- UPDATE (saját gyülekezet): csak draft vagy submitted státuszban
DROP POLICY IF EXISTS annual_reports_update_own ON public.annual_reports;
CREATE POLICY annual_reports_update_own
  ON public.annual_reports
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    AND status IN ('draft', 'submitted')
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
  );

-- UPDATE (esperes / egyházmegyei admin / admin / master): státusz-előrelépés és review_notes
DROP POLICY IF EXISTS annual_reports_update_esperes ON public.annual_reports;
CREATE POLICY annual_reports_update_esperes
  ON public.annual_reports
  FOR UPDATE
  TO authenticated
  USING (
    current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
        AND c.id = annual_reports.congregation_id
    )
  );

-- DELETE (soft delete): csak admin/master
DROP POLICY IF EXISTS annual_reports_delete ON public.annual_reports;
CREATE POLICY annual_reports_delete
  ON public.annual_reports
  FOR DELETE
  TO authenticated
  USING (current_user_has_global_access());

-- ── 6. UPDATED_AT TRIGGER ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.annual_reports_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS annual_reports_updated_at_trigger ON public.annual_reports;
CREATE TRIGGER annual_reports_updated_at_trigger
  BEFORE UPDATE ON public.annual_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.annual_reports_set_updated_at();

-- ── 7. VERIFIKÁCIÓ (futtasd kézzel a migráció után) ────────

-- 7a. Az új mezők ott vannak?
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'annual_reports'
--   ORDER BY ordinal_position;

-- 7b. RLS aktív + 4 policy?
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'annual_reports'
--   ORDER BY cmd, policyname;
--   → 5 sor: SELECT, INSERT, 2× UPDATE, DELETE

-- 7c. Status enum ellenőrzés
--   INSERT INTO public.annual_reports (congregation_id, year, status)
--   VALUES (gen_random_uuid(), 2025, 'invalid_status');
--   → CHECK constraint hibára kell futnia

-- 7d. UNIQUE constraint
--   Egy gyülekezet, egy év: csak egyetlen rekord létezhet (deleted=false esetén)

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉGE
-- ═══════════════════════════════════════════════════════════════════════════
