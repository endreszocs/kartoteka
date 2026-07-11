-- ─────────────────────────────────────────────────────────────────────────
-- 2026-07-11 — system_finance_income: a rendszer bevétel-könyvelése
-- ─────────────────────────────────────────────────────────────────────────
-- A "személyre szabott könyvelés" bevétel-oldala. A kiadás-oldal a meglévő
-- system_finance_costs. Ide kerül minden bevétel: előfizetési díj-befizetés,
-- egyszeri kifizetés, adomány (a rendszer fejlesztésére/működtetésére),
-- speciális igény felára.
--
-- Idempotens (CREATE TABLE IF NOT EXISTS). Jogosultság: rendszer-szintű admin
-- (a system_finance_costs mintájára).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_finance_income (
  id            bigserial PRIMARY KEY,
  congregation_id uuid REFERENCES public.congregations(id) ON DELETE SET NULL,
  -- NULL congregation_id = nem gyülekezethez kötött általános adomány/bevétel
  kategoria     text NOT NULL DEFAULT 'egyszeri',
  megnevezes    text,
  osszeg        numeric NOT NULL DEFAULT 0,
  penznem       text NOT NULL DEFAULT 'RON',
  arfolyam      numeric,                 -- a datum-kori pénznem→RON árfolyam (ha nem RON)
  osszeg_ron    numeric,                 -- konvertált érték a kimutatáshoz
  datum         date NOT NULL DEFAULT CURRENT_DATE,
  megjegyzes    text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.system_finance_income
    ADD CONSTRAINT system_finance_income_kategoria_check
    CHECK (kategoria IN ('elofizetes', 'egyszeri', 'adomany', 'felar', 'egyeb'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_system_finance_income_datum
  ON public.system_finance_income (datum DESC);
CREATE INDEX IF NOT EXISTS idx_system_finance_income_cong
  ON public.system_finance_income (congregation_id);

-- RLS: csak rendszer-szintű admin (profiles.role='admin' VAGY profile_roles system/admin)
ALTER TABLE public.system_finance_income ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_finance_income TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.system_finance_income_id_seq TO authenticated;

DROP POLICY IF EXISTS "system_finance_income_admin_all" ON public.system_finance_income;
CREATE POLICY "system_finance_income_admin_all" ON public.system_finance_income
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system' AND pr.role = 'admin'
        AND pr.active = true AND pr.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system' AND pr.role = 'admin'
        AND pr.active = true AND pr.approval_status = 'approved'
    )
  );

-- Ellenőrzés
-- SELECT * FROM public.system_finance_income ORDER BY datum DESC LIMIT 5;
