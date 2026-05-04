-- =========================================================================
-- 2026-05-04 — restart_user_onboarding HOTFIX: ambiguous user_id
-- =========================================================================
-- HIBA:
--   "column reference 'user_id' is ambiguous"
--
-- OK:
--   A 2026-05-04i-restart-user-onboarding-rpc.sql-ben a RETURNS TABLE
--   user_id mezőt deklarált, ami ütközött a wizard_progress.user_id
--   oszloppal a INSERT...ON CONFLICT-ben.
--
-- FIX:
--   - A RETURNS TABLE mezőit átnevezzük (out_user_id, out_was_completed).
--   - Minden INSERT/UPDATE/WHERE alias-elve a kétértelműség elkerülésére.
-- =========================================================================

DROP FUNCTION IF EXISTS public.restart_user_onboarding();

CREATE OR REPLACE FUNCTION public.restart_user_onboarding()
RETURNS TABLE (
  out_user_id        uuid,
  out_was_completed  boolean
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

  SELECT (p.onboarding_completed_at IS NOT NULL) INTO v_was_completed
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A profil nem található (id=%).', v_uid;
  END IF;

  -- profiles.onboarding_completed_at = NULL
  UPDATE public.profiles AS p
     SET onboarding_completed_at = NULL
   WHERE p.id = v_uid;

  -- wizard_progress reset (best-effort, ha létezik a tábla)
  BEGIN
    INSERT INTO public.wizard_progress AS wp (user_id, current_step, completed_at, data)
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
  $$A bejelentkezett user (auth.uid()) saját maga újraindítja a welcome wizardot. (Hotfix 2026-05-04: out_user_id és out_was_completed mezők átnevezve.)$$;

GRANT EXECUTE ON FUNCTION public.restart_user_onboarding() TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

SELECT proname, pg_get_function_arguments(oid) AS args, prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('complete_user_onboarding', 'restart_user_onboarding')
ORDER BY proname;
