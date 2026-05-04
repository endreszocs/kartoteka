-- =========================================================================
-- 2026-05-04 — complete_user_onboarding RPC (SECURITY DEFINER)
-- =========================================================================
-- KONTEXTUS:
--   Egy lelkész végigvitte a welcome wizardot, a `completeWizard` action
--   `success: true`-t adott, átirányított a kezdőoldalra. DE: az oldal
--   frissítésekor a redirect-guard újra a /welcome-ra dobta, mert a
--   profiles.onboarding_completed_at NEM lett beállítva.
--
--   Eredet: a regular session-kliens UPDATE-ét RLS blokkolta (vagy a
--   profiles tábla policy-ja nem engedi a saját user-nek mindenhova,
--   vagy GRANT-szinten silent fail). Az actionben a `profMarkErr` csak
--   console.error volt, NEM dobott vissza error-t — silent fail.
--
-- MEGOLDÁS:
--   SECURITY DEFINER RPC, ami a saját user (auth.uid()) onboarding_completed_at
--   és wizard_progress.completed_at mezőit állítja be. Belül szigorú check:
--   csak saját maga jelölheti befejezettnek a wizardot.
-- =========================================================================

DROP FUNCTION IF EXISTS public.complete_user_onboarding();

CREATE OR REPLACE FUNCTION public.complete_user_onboarding()
RETURNS TABLE (
  user_id                uuid,
  onboarding_completed_at timestamptz,
  was_already_completed   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_existing timestamptz;
  v_now timestamptz := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezve.';
  END IF;

  -- Ellenőrzés: a profile létezik?
  SELECT onboarding_completed_at INTO v_existing
    FROM public.profiles
   WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A profil nem található (id=%).', v_uid;
  END IF;

  -- Ha már be volt jelölve, csak visszaadjuk a meglévő dátumot
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_uid, v_existing, TRUE;
    RETURN;
  END IF;

  -- profiles update
  UPDATE public.profiles
     SET onboarding_completed_at = v_now
   WHERE id = v_uid;

  -- wizard_progress update (best-effort, ha létezik a tábla)
  BEGIN
    UPDATE public.wizard_progress
       SET completed_at = v_now,
           current_step = 5
     WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN
    -- Ha nincs wizard_progress tábla, nem gond
    NULL;
  END;

  RETURN QUERY SELECT v_uid, v_now, FALSE;
END;
$$;

COMMENT ON FUNCTION public.complete_user_onboarding() IS
  $$A bejelentkezett user (auth.uid()) saját maga jelöli befejezettnek a welcome wizardot. Beállítja a profiles.onboarding_completed_at és wizard_progress.completed_at mezőket. Megkerüli az RLS-t és a GRANT-okat (SECURITY DEFINER).$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding() TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

-- 1. A függvény létezik?
SELECT proname AS function_name,
       pg_get_function_identity_arguments(oid) AS arguments,
       prosecdef AS is_security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'complete_user_onboarding';

-- 2. EXECUTE GRANT
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name = 'complete_user_onboarding'
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY grantee;

-- 3. Hányan vannak még pending wizardban?
SELECT COUNT(*) AS pending_wizard_count
FROM public.profiles
WHERE onboarding_completed_at IS NULL
  AND status = 'active';
