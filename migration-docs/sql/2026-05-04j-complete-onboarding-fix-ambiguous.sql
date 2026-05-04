-- =========================================================================
-- 2026-05-04 — complete_user_onboarding HOTFIX: ambiguous column ref
-- =========================================================================
-- HIBA:
--   "column reference 'onboarding_completed_at' is ambiguous"
--
-- OK:
--   A 2026-05-04f-ben létrehozott complete_user_onboarding() függvény
--   RETURNS TABLE-jében szerepelt egy "onboarding_completed_at" nevű mező,
--   ami ütközött a profiles tábla azonos nevű oszlopával — a PostgreSQL
--   ezt ambiguous-nek tekintette amikor az UPDATE-ben hivatkozott rá.
--
-- FIX:
--   Átnevezzük a return-table mezőt: onboarding_completed_at →
--   out_completed_at. A profiles oszlopnevére az UPDATE-ben már
--   egyértelműen utalhatunk.
--
-- A TS oldal is frissül (welcome/actions.ts) az új mezőnévre.
-- =========================================================================

DROP FUNCTION IF EXISTS public.complete_user_onboarding();

CREATE OR REPLACE FUNCTION public.complete_user_onboarding()
RETURNS TABLE (
  user_id                uuid,
  out_completed_at       timestamptz,   -- átnevezve a profiles oszloppal való ütközés miatt
  was_already_completed  boolean
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

  SELECT p.onboarding_completed_at INTO v_existing
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A profil nem található (id=%).', v_uid;
  END IF;

  -- Ha már be volt jelölve, csak visszaadjuk a meglévő dátumot
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_uid, v_existing, TRUE;
    RETURN;
  END IF;

  -- profiles update
  UPDATE public.profiles AS p
     SET onboarding_completed_at = v_now
   WHERE p.id = v_uid;

  -- wizard_progress update (best-effort)
  BEGIN
    UPDATE public.wizard_progress AS wp
       SET completed_at = v_now,
           current_step = 5
     WHERE wp.user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN QUERY SELECT v_uid, v_now, FALSE;
END;
$$;

COMMENT ON FUNCTION public.complete_user_onboarding() IS
  $$A bejelentkezett user (auth.uid()) saját maga jelöli befejezettnek a welcome wizardot. (Hotfix 2026-05-04: out_completed_at mező átnevezve.)$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding() TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS: a függvény definíciója most már OK
-- ──────────────────────────────────────────────────────────────────────────

SELECT proname, pg_get_function_arguments(oid) AS args, prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'complete_user_onboarding';
