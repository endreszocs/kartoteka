-- =========================================================================
-- 2026-05-04 — restart_user_onboarding RPC (SECURITY DEFINER)
-- =========================================================================
-- Endre kérése: legyen egy "Wizard újraindítása" gomb minden felhasználónak,
-- ha utólag adatokat akar javítani.
--
-- Ez az RPC visszaállítja a saját profile-jának onboarding_completed_at-ját
-- NULL-ra, és a wizard_progress-et 1. step-re. A redirect-guard ezután
-- újra a /welcome-ra dobja, és a user végigmehet a wizardon.
--
-- A meglévő gyülekezet/wizard_progress.data ÉRINTETLEN marad (nem törli a
-- korábbi adatokat), így a wizard maga az utolsó állapotból folytatható.
-- =========================================================================

DROP FUNCTION IF EXISTS public.restart_user_onboarding();

CREATE OR REPLACE FUNCTION public.restart_user_onboarding()
RETURNS TABLE (
  user_id  uuid,
  was_completed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_was_completed boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezve.';
  END IF;

  -- Volt-e már befejezett?
  SELECT (onboarding_completed_at IS NOT NULL) INTO v_was_completed
    FROM public.profiles
   WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A profil nem található (id=%).', v_uid;
  END IF;

  -- profiles.onboarding_completed_at = NULL
  UPDATE public.profiles
     SET onboarding_completed_at = NULL
   WHERE id = v_uid;

  -- wizard_progress.completed_at = NULL, current_step = 1
  -- (best-effort, ha nincs még wizard_progress sora, létrehozzuk)
  BEGIN
    INSERT INTO public.wizard_progress (user_id, current_step, completed_at, data)
    VALUES (v_uid, 1, NULL, '{}'::jsonb)
    ON CONFLICT (user_id) DO UPDATE
      SET completed_at = NULL,
          current_step = 1,
          updated_at = now();
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN QUERY SELECT v_uid, COALESCE(v_was_completed, FALSE);
END;
$$;

COMMENT ON FUNCTION public.restart_user_onboarding() IS
  $$A bejelentkezett user (auth.uid()) saját maga újraindítja a welcome wizardot. Az onboarding_completed_at NULL-ra, a wizard_progress 1. step-re. A korábbi adatok megmaradnak.$$;

GRANT EXECUTE ON FUNCTION public.restart_user_onboarding() TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

SELECT proname AS function_name,
       prosecdef AS is_security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('complete_user_onboarding', 'restart_user_onboarding')
ORDER BY proname;
