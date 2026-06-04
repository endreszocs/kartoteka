-- ============================================================================
-- 2026-06-04 — complete_user_walkthrough() RPC (walkthrough-flag robusztus mentés)
-- ============================================================================
-- CÉL:
--   A belépés utáni interaktív túra (walkthrough) befejezésekor/kihagyásakor a
--   `profiles.walkthrough_completed = true` flaget eddig a sima session-kliens
--   írta. A rendszerben már volt dokumentált eset, amikor a profiles regular-
--   kliens UPDATE-je némán elbukott (RLS/GRANT), ezért az onboarding-flaget egy
--   SECURITY DEFINER RPC-re (complete_user_onboarding) cserélték. Ugyanezt a
--   robusztusságot adjuk most a walkthrough-flagnek is: ha némán elbukna, a túra
--   minden navigáción újraindulna (hurok-szerű élmény).
--
--   Ez az RPC megkerüli az RLS-t/GRANT-okat, és garantáltan beállítja a flaget a
--   bejelentkezett userre. Kihagyásnál a `walkthrough_skipped_at`-ot is rögzíti.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_user_walkthrough(p_skipped boolean DEFAULT false)
RETURNS TABLE(user_id uuid, walkthrough_completed boolean, was_skipped boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó (auth.uid() NULL).';
  END IF;

  UPDATE public.profiles
  SET
    walkthrough_completed = true,
    walkthrough_skipped_at = CASE WHEN p_skipped THEN now() ELSE walkthrough_skipped_at END
  WHERE id = v_uid;

  RETURN QUERY SELECT v_uid, true, p_skipped;
END;
$$;

COMMENT ON FUNCTION public.complete_user_walkthrough(boolean) IS
  'A belépés utáni walkthrough befejezése/kihagyása. SECURITY DEFINER → garantáltan beállítja a profiles.walkthrough_completed=true-t (kihagyásnál a walkthrough_skipped_at-ot is). 2026-06-04.';

GRANT EXECUTE ON FUNCTION public.complete_user_walkthrough(boolean) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- A függvény létezik?
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'complete_user_walkthrough';
