-- ============================================================================
-- F4 (2026-07-17) — Nyitó-egyenleg táblák: admin + egyházkerületi admin ÍRÁS
--
-- HÁTTÉR: a bankszamla_nyito_egyenleg (2026-04-18) és a keszpenz_nyito_egyenleg
-- (2026-06-20) SELECT-policyja tartalmazza az admin/egyhazkeruleti_admin ágat,
-- az INSERT/UPDATE/DELETE viszont CSAK gyülekezeti scope-ot enged — az admin
-- látta, de nem javíthatta a nyitókat. Az F4 „admin később javíthassa" igényéhez
-- a írás-policyk újradefiniálása az admin-ággal kiegészítve.
--
-- Futtatás: Supabase SQL editor. Idempotens (DROP POLICY IF EXISTS + CREATE).
--
-- ✅ ÉLESBEN LEFUTTATVA: 2026-07-17 (a user futtatta, a 8 policy verifikálva).
--
-- MEGJEGYZÉS (scope): az egyhazkeruleti_admin ág kerület-korlát NÉLKÜLI — ez a
-- meglévő SELECT-policyk admin-ágával KONZISZTENS (ugyanez a minta), és tudatos
-- előre-nyitás a majdani kerületi admin-felülethez. A web-UI-ról jelenleg csak a
-- master-admin god-mode útja ér el más gyülekezetet (a saveOpeningBalancesSettings
-- az effectiveCongregationId-re ír, expectedCongregationId-guarddal); a kerület-
-- korlátot a globális RLS scope-fixszel együtt kell pótolni (ismert adósság,
-- lásd penzugy_rls_scope_divergencia).
-- ============================================================================

BEGIN;

-- ───────────────────────── keszpenz_nyito_egyenleg ─────────────────────────

DROP POLICY IF EXISTS knye_insert ON public.keszpenz_nyito_egyenleg;
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
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

DROP POLICY IF EXISTS knye_update ON public.keszpenz_nyito_egyenleg;
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
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
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
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

DROP POLICY IF EXISTS knye_delete ON public.keszpenz_nyito_egyenleg;
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
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

-- ──────────────────────── bankszamla_nyito_egyenleg ────────────────────────

DROP POLICY IF EXISTS bnye_insert ON public.bankszamla_nyito_egyenleg;
CREATE POLICY bnye_insert ON public.bankszamla_nyito_egyenleg
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
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

DROP POLICY IF EXISTS bnye_update ON public.bankszamla_nyito_egyenleg;
CREATE POLICY bnye_update ON public.bankszamla_nyito_egyenleg
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
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
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
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

DROP POLICY IF EXISTS bnye_delete ON public.bankszamla_nyito_egyenleg;
CREATE POLICY bnye_delete ON public.bankszamla_nyito_egyenleg
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
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

COMMIT;

-- ─────────────────────────────── Ellenőrzés ────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('keszpenz_nyito_egyenleg', 'bankszamla_nyito_egyenleg')
ORDER BY tablename, policyname;
