-- ============================================================================
-- 2026-06-05j — Átadás VÉGREHAJTÁSA (F3c)
-- ----------------------------------------------------------------------------
-- Amikor az átadás 'ready' (mindkét fél jóváhagyta, vagy admin + nincs számvevő),
-- a RENDSZERGAZDA megadja a bejövő lelkészt, és véglegesíti az átadást:
--   - a TÁVOZÓ lelkész tenure-je lezárul (end_reason='transfer'), a gyülekezete ürül,
--     a gyülekezeti lelkész-szerepe visszavonódik,
--   - a BEJÖVŐ lelkész a gyülekezethez rendelődik (congregation_id + lelkész
--     profile_roles + nyitott tenure),
--   - az átadás 'completed'.
--
-- Ha a bejövő lelkész MÉG NINCS a rendszerben, az app-réteg meghívó emailt küld
-- (regisztráljon), és az admin később véglegesít — ez az RPC csak meglévő
-- felhasználóra hívható.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: 2026-06-05g + 2026-06-05i + 2026-06-05e (record_pastor_tenure_start).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_congregation_transfer(
  p_transfer_id uuid,
  p_to_user_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.congregation_transfers%ROWTYPE;
  v_to_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Csak a rendszergazda véglegesítheti az átadást.';
  END IF;

  SELECT * INTO t FROM public.congregation_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Az átadás nem található.'; END IF;
  IF t.status <> 'ready' THEN
    RAISE EXCEPTION 'Az átadás még nem véglegesíthető (állapot: %). Mindkét félnek jóvá kell hagynia.', t.status;
  END IF;
  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzik a bejövő lelkész azonosítója.';
  END IF;
  IF p_to_user_id = t.from_user_id THEN
    RAISE EXCEPTION 'A bejövő és a távozó lelkész nem lehet ugyanaz.';
  END IF;

  SELECT full_name INTO v_to_name FROM public.profiles WHERE id = p_to_user_id;

  -- 1) A TÁVOZÓ lelkész tenure-jének lezárása + a gyülekezet ürítése
  UPDATE public.congregation_pastor_history
     SET ended_at = now(), end_reason = 'transfer'
   WHERE congregation_id = t.congregation_id AND user_id = t.from_user_id AND ended_at IS NULL;

  UPDATE public.profiles
     SET congregation_id = NULL
   WHERE id = t.from_user_id AND congregation_id = t.congregation_id;

  UPDATE public.profile_roles
     SET active = false, approval_status = 'revoked', revoked_at = now()
   WHERE profile_id = t.from_user_id AND scope = 'congregation'
     AND scope_id = t.congregation_id AND role = 'lelkesz';

  -- 2) A BEJÖVŐ lelkész hozzárendelése
  UPDATE public.profiles
     SET congregation_id = t.congregation_id, status = 'active'
   WHERE id = p_to_user_id;

  IF EXISTS (
    SELECT 1 FROM public.profile_roles
    WHERE profile_id = p_to_user_id AND scope = 'congregation'
      AND scope_id = t.congregation_id AND role = 'lelkesz'
  ) THEN
    UPDATE public.profile_roles
       SET active = true, approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), revoked_at = NULL
     WHERE profile_id = p_to_user_id AND scope = 'congregation'
       AND scope_id = t.congregation_id AND role = 'lelkesz';
  ELSE
    INSERT INTO public.profile_roles
      (profile_id, scope, scope_id, role, approval_status, granted_by, approved_by, approved_at, active)
    VALUES
      (p_to_user_id, 'congregation', t.congregation_id, 'lelkesz', 'approved', auth.uid(), auth.uid(), now(), true);
  END IF;

  -- 3) A BEJÖVŐ lelkész nyitott tenure-je (a szolgálati naplóba)
  PERFORM public.record_pastor_tenure_start(t.congregation_id, p_to_user_id, 'lelkesz', now());

  -- 4) Az átadás lezárása
  UPDATE public.congregation_transfers
     SET to_user_id = p_to_user_id, status = 'completed', executed_at = now(), version = version + 1
   WHERE id = p_transfer_id;

  RETURN json_build_object('completed', true, 'to_full_name', v_to_name, 'congregation_id', t.congregation_id, 'from_user_id', t.from_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_congregation_transfer(uuid, uuid) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT status, executed_at, to_user_id FROM public.congregation_transfers WHERE id = '<transfer-uuid>';
