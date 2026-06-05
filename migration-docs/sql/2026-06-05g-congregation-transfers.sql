-- ============================================================================
-- 2026-06-05g — Lelkészcsere-átadás: állapot-tábla + meghagyások + indítás (F3a)
-- ----------------------------------------------------------------------------
-- A lelkészcsere kontrollált átadás-átvétele (Endre folyamata):
--   1) a TÁVOZÓ lelkész elindítja az átadást egy gombbal (status='requested'),
--   2) értesül az egyházmegye SZÁMVEVŐJE + a RENDSZERGAZDA,
--   3) (F3b) read-only belépés + jóváhagyás VAGY meghagyás,
--   4) (F3c) ha mindkettő OK → a rendszergazda jóváhagyja az új lelkészt a
--      lelkészi szerepre; a tenure-ök zárulnak/nyílnak.
--
-- Ez a fájl a TELJES állapot-modellt létrehozza, de a megvalósítás fázisonként
-- köti be (F3a: indítás + értesítés).
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: 2026-06-05e (congregation_pastor_history), is_admin(),
--   current_user_congregation_id(), current_user_has_global_access().
-- ============================================================================

BEGIN;

-- ── 1. congregation_transfers — állapotgép-rekord ───────────────────────────
CREATE TABLE IF NOT EXISTS public.congregation_transfers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id    uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  diocese_id         uuid,                          -- pillanatkép az értesítéshez/RLS-hez
  from_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_full_name     text,                          -- pillanatkép
  to_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- bejövő (ha már regisztrált)
  to_email           text,                          -- ha még NEM regisztrált → meghívandó email
  reason             text,
  status             text NOT NULL DEFAULT 'requested'
                       CHECK (status = ANY (ARRAY[
                         'requested','review','blocked_by_remarks','ready',
                         'executing','completed','rejected','cancelled','expired'])),
  initiated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_id           uuid,
  admin_approved_at  timestamptz,
  auditor_id         uuid,
  auditor_approved_at timestamptz,
  accepted_at        timestamptz,                   -- a bejövő lelkész elfogadta
  executed_at        timestamptz,
  expires_at         timestamptz,
  version            integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Rendszer-szintű négy-szem-elv: a két jóváhagyó NEM lehet ugyanaz
  CONSTRAINT ct_distinct_approvers CHECK (admin_id IS NULL OR auditor_id IS NULL OR admin_id <> auditor_id),
  CONSTRAINT ct_distinct_from_to   CHECK (to_user_id IS NULL OR from_user_id IS NULL OR from_user_id <> to_user_id)
);

-- Egy gyülekezethez egyszerre csak EGY folyamatban lévő átadás
CREATE UNIQUE INDEX IF NOT EXISTS uq_ct_open_transfer
  ON public.congregation_transfers(congregation_id)
  WHERE status NOT IN ('completed','rejected','cancelled','expired');
CREATE INDEX IF NOT EXISTS idx_ct_diocese ON public.congregation_transfers(diocese_id, status);

COMMENT ON TABLE public.congregation_transfers IS
  'Lelkészcsere-átadás állapotgép: a távozó lelkész indítja, admin+számvevő dual-control jóváhagyja, a bejövő lelkész elfogadja. 2026-06-05.';

-- ── 2. congregation_remarks — meghagyások (ha a review nem OK) ───────────────
CREATE TABLE IF NOT EXISTS public.congregation_remarks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  transfer_id     uuid REFERENCES public.congregation_transfers(id) ON DELETE SET NULL,
  author_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role     text,                             -- 'admin' | 'szamvevo' | 'lelkesz'
  szoveg          text NOT NULL,
  resolved        boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_congregation ON public.congregation_remarks(congregation_id, created_at DESC);

COMMENT ON TABLE public.congregation_remarks IS
  'Meghagyások: az átadás-ellenőrzéskor az admin/számvevő észrevételei a gyülekezethez (ha nem hagyja jóvá az átadást). 2026-06-05.';

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.congregation_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ct_select ON public.congregation_transfers;
-- Olvasás: a gyülekezet lelkésze (saját gyülekezet) + globális (admin/esperes) +
-- a be-/kilépő lelkész. (A számvevő-scope-ot az app-réteg + a diocese_id kezeli.)
CREATE POLICY ct_select ON public.congregation_transfers
  FOR SELECT TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
    OR from_user_id = auth.uid()
    OR to_user_id = auth.uid()
  );

ALTER TABLE public.congregation_remarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cr_select ON public.congregation_remarks;
CREATE POLICY cr_select ON public.congregation_remarks
  FOR SELECT TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

-- Írás CSAK a SECURITY DEFINER RPC-ken keresztül.

-- ── 4. initiate_congregation_transfer() — a TÁVOZÓ lelkész indítja ──────────
CREATE OR REPLACE FUNCTION public.initiate_congregation_transfer(
  p_congregation_id uuid,
  p_reason text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_role text;
  v_user_cong uuid;
  v_diocese uuid;
  v_existing uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezve.';
  END IF;

  SELECT full_name, role, congregation_id INTO v_name, v_role, v_user_cong
  FROM public.profiles WHERE id = v_uid;

  -- Csak az adott gyülekezet lelkésze (vagy admin) indíthat átadást.
  IF NOT public.is_admin() AND NOT (v_role = 'lelkesz' AND v_user_cong = p_congregation_id) THEN
    RAISE EXCEPTION 'Csak a gyülekezet lelkésze (vagy rendszergazda) indíthat átadást.';
  END IF;

  -- Van már folyamatban lévő átadás? → azt adjuk vissza (idempotens)
  SELECT id INTO v_existing FROM public.congregation_transfers
  WHERE congregation_id = p_congregation_id
    AND status NOT IN ('completed','rejected','cancelled','expired')
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('transfer_id', v_existing, 'already_open', true, 'diocese_id',
      (SELECT diocese_id FROM public.congregation_transfers WHERE id = v_existing));
  END IF;

  SELECT diocese_id INTO v_diocese FROM public.congregations WHERE id = p_congregation_id;

  INSERT INTO public.congregation_transfers
    (congregation_id, diocese_id, from_user_id, from_full_name, reason, status, initiated_by, expires_at)
  VALUES
    (p_congregation_id, v_diocese, v_uid, v_name, p_reason, 'requested', v_uid, now() + interval '30 days')
  RETURNING id INTO v_id;

  RETURN json_build_object('transfer_id', v_id, 'already_open', false, 'diocese_id', v_diocese);
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_congregation_transfer(uuid, text) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT congregation_id, from_full_name, status, created_at, expires_at
--   FROM public.congregation_transfers ORDER BY created_at DESC;
