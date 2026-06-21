-- =========================================================================
-- 2026-06-20 — KÉSZPÉNZ (Kassza) éves nyitó egyenleg
-- =========================================================================
-- CÉL:
--   A készpénz-könyvelés („Kassza") ÉV ELEJI nyitó egyenlegének tárolása,
--   évenkénti bontásban — a `bankszamla_nyito_egyenleg` MINTÁJÁRA, de a
--   készpénznek (nincs bankszámla → bankszamla_id IS NULL a befizetes/kiadas-ban).
--
-- MIÉRT KELL (Endre, 2026-06-20):
--   A hivatalos Adatok_YYYY.xlsx „Kassza" lap tetején szerepel az „Előző évi
--   készpénzegyenleg" (pl. 12 519,86). Enélkül a készpénz-egyenleg
--   (Σ készpénz-bevétel − Σ készpénz-kiadás) 0-ról indulna, és az ÉV VÉGI
--   egyenleg HIBÁS lenne → a könyvelés NEM hiteles. Korábbi évek importjánál
--   ez kötelező: az N. év nyitója = az (N-1). év zárója (évről évre láncol).
--
--   Empirikus igazolás: 12 519,86 (nyitó) + 106 747,00 (bev) − 112 803,12 (kia)
--   = 6 463,74 = az xlsx záró egyenlege. ✓
--
-- A bankszámláknál ez MÁR létezik (`bankszamla_nyito_egyenleg`); itt a
-- készpénzre hozzuk létre ugyanazzal a logikával (forrasa: manual/import/carryover).
--
-- Idempotens — újrafuttatható.
-- =========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) keszpenz_nyito_egyenleg — gyülekezetenként + évenként
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.keszpenz_nyito_egyenleg (
  id bigserial PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  eve integer NOT NULL CHECK (eve BETWEEN 2000 AND 2100),
  -- Nyitó készpénz-egyenleg RON-ban (a készpénz mindig RON).
  nyito_egyenleg numeric(14, 2) NOT NULL DEFAULT 0,
  -- Honnan: 'manual' = kézzel, 'import' = a hivatalos xlsx „Előző évi" cellájából,
  -- 'carryover' = az előző év zárójából átvezetve.
  forrasa text NOT NULL DEFAULT 'manual' CHECK (forrasa IN ('manual', 'import', 'carryover')),
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT keszpenz_nyito_egyenleg_unique UNIQUE (congregation_id, eve)
);

COMMENT ON TABLE public.keszpenz_nyito_egyenleg IS
  'Év eleji nyitó KÉSZPÉNZ-egyenleg gyülekezetenként és évente. A hivatalos xlsx „Előző évi készpénzegyenleg" cellájából (import) vagy kézzel/előző év zárójából. A bankszamla_nyito_egyenleg készpénz-megfelelője.';
COMMENT ON COLUMN public.keszpenz_nyito_egyenleg.nyito_egyenleg IS
  'Nyitó készpénz-egyenleg RON-ban. A készpénz-egyenleg = ez + Σ(készpénz-befizetés) − Σ(készpénz-kiadás), ahol bankszamla_id IS NULL.';
COMMENT ON COLUMN public.keszpenz_nyito_egyenleg.forrasa IS
  'manual = kézzel; import = az xlsx „Előző évi" cellájából; carryover = előző év zárójából.';

CREATE INDEX IF NOT EXISTS keszpenz_nyito_egyenleg_congregation_eve_idx
  ON public.keszpenz_nyito_egyenleg (congregation_id, eve);

-- ─────────────────────────────────────────────────────────────
-- 2) RLS — a bankszamla_nyito_egyenleg policy-mintája szerint
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.keszpenz_nyito_egyenleg ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knye_select ON public.keszpenz_nyito_egyenleg;
DROP POLICY IF EXISTS knye_insert ON public.keszpenz_nyito_egyenleg;
DROP POLICY IF EXISTS knye_update ON public.keszpenz_nyito_egyenleg;
DROP POLICY IF EXISTS knye_delete ON public.keszpenz_nyito_egyenleg;

CREATE POLICY knye_select ON public.keszpenz_nyito_egyenleg
  FOR SELECT TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = keszpenz_nyito_egyenleg.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

CREATE POLICY knye_insert ON public.keszpenz_nyito_egyenleg
  FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = keszpenz_nyito_egyenleg.congregation_id
    )
  );

CREATE POLICY knye_update ON public.keszpenz_nyito_egyenleg
  FOR UPDATE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = keszpenz_nyito_egyenleg.congregation_id
    )
  )
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = keszpenz_nyito_egyenleg.congregation_id
    )
  );

CREATE POLICY knye_delete ON public.keszpenz_nyito_egyenleg
  FOR DELETE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = keszpenz_nyito_egyenleg.congregation_id
    )
  );

REVOKE ALL ON public.keszpenz_nyito_egyenleg FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keszpenz_nyito_egyenleg TO authenticated;
GRANT USAGE ON SEQUENCE public.keszpenz_nyito_egyenleg_id_seq TO authenticated;

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================
SELECT
  'keszpenz_nyito_egyenleg tábla' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='keszpenz_nyito_egyenleg') AS result
UNION ALL
SELECT
  'keszpenz_nyito_egyenleg RLS',
  (SELECT relrowsecurity FROM pg_class WHERE relname='keszpenz_nyito_egyenleg')
UNION ALL
SELECT
  'UNIQUE (congregation_id, eve)',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keszpenz_nyito_egyenleg_unique');

-- Áttekintő: a rögzített készpénz-nyitók (ha van)
SELECT eve, COUNT(*) AS db, SUM(nyito_egyenleg) AS ossz_ron
FROM public.keszpenz_nyito_egyenleg
GROUP BY eve
ORDER BY eve;
