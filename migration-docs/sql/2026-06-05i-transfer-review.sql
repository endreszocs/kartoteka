-- ============================================================================
-- 2026-06-05i — Átadás-felülvizsgálat: jóváhagyás / meghagyás (F3b)
-- ----------------------------------------------------------------------------
-- A rendszergazda ÉS az egyházmegyei számvevő átnézi a gyülekezetet, majd:
--   - JÓVÁHAGY (transfer_approve) → beállítja a saját *_approved_at-jét,
--   - vagy MEGHAGYÁST ír (transfer_add_remark) → status='blocked_by_remarks'.
--
-- Négy-szem-elv: a két jóváhagyó NEM lehet ugyanaz (DB CHECK + logika).
-- "Ha az egyházmegyében nincs számvevő, a rendszergazda jóváhagyása elég"
-- (Endre döntése): ekkor az admin jóváhagyása után a status egyből 'ready'.
--
-- A státusz 'ready'-re vált, ha:
--   - mindkét fél (admin + számvevő) jóváhagyott, VAGY
--   - az admin jóváhagyott ÉS az egyházmegyében nincs aktív számvevő.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: 2026-06-05g (congregation_transfers, congregation_remarks).
-- ============================================================================

BEGIN;

-- A hívó szerepe az adott átadásnál: 'admin' | 'szamvevo' | NULL
CREATE OR REPLACE FUNCTION public.transfer_reviewer_role(p_diocese_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_diocese uuid;
BEGIN
  IF public.is_admin() THEN
    RETURN 'admin';
  END IF;
  SELECT role, diocese_id INTO v_role, v_diocese FROM public.profiles WHERE id = auth.uid();
  IF v_role = 'egyhazmegyei_szamvevo' AND v_diocese IS NOT DISTINCT FROM p_diocese_id THEN
    RETURN 'szamvevo';
  END IF;
  RETURN NULL;
END;
$$;

-- ── Jóváhagyás ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_approve(p_transfer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.congregation_transfers%ROWTYPE;
  v_role text;
  v_has_auditor boolean;
  v_new_status text;
BEGIN
  SELECT * INTO t FROM public.congregation_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Az átadás nem található.'; END IF;
  IF t.status IN ('completed','rejected','cancelled','expired') THEN
    RAISE EXCEPTION 'Ez az átadás már lezárult.';
  END IF;

  v_role := public.transfer_reviewer_role(t.diocese_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Csak a rendszergazda vagy az egyházmegye számvevője hagyhatja jóvá.';
  END IF;

  v_has_auditor := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role = 'egyhazmegyei_szamvevo' AND diocese_id IS NOT DISTINCT FROM t.diocese_id
      AND status = 'active'
  );

  IF v_role = 'admin' THEN
    IF t.auditor_id = auth.uid() THEN
      RAISE EXCEPTION 'A két jóváhagyó nem lehet ugyanaz a személy (négy-szem-elv).';
    END IF;
    v_new_status := CASE WHEN t.auditor_approved_at IS NOT NULL OR NOT v_has_auditor THEN 'ready' ELSE 'review' END;
    UPDATE public.congregation_transfers
       SET admin_id = auth.uid(), admin_approved_at = now(), status = v_new_status, version = version + 1
     WHERE id = p_transfer_id;
  ELSE -- szamvevo
    IF t.admin_id = auth.uid() THEN
      RAISE EXCEPTION 'A két jóváhagyó nem lehet ugyanaz a személy (négy-szem-elv).';
    END IF;
    v_new_status := CASE WHEN t.admin_approved_at IS NOT NULL THEN 'ready' ELSE 'review' END;
    UPDATE public.congregation_transfers
       SET auditor_id = auth.uid(), auditor_approved_at = now(), status = v_new_status, version = version + 1
     WHERE id = p_transfer_id;
  END IF;

  RETURN json_build_object('status', v_new_status, 'reviewer', v_role, 'has_auditor', v_has_auditor);
END;
$$;

-- ── Meghagyás (észrevétel) rögzítése ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_add_remark(p_transfer_id uuid, p_szoveg text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.congregation_transfers%ROWTYPE;
  v_role text;
  v_id uuid;
BEGIN
  IF p_szoveg IS NULL OR btrim(p_szoveg) = '' THEN
    RAISE EXCEPTION 'A meghagyás szövege kötelező.';
  END IF;
  SELECT * INTO t FROM public.congregation_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Az átadás nem található.'; END IF;

  v_role := public.transfer_reviewer_role(t.diocese_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Csak a rendszergazda vagy az egyházmegye számvevője rögzíthet meghagyást.';
  END IF;

  INSERT INTO public.congregation_remarks (congregation_id, transfer_id, author_id, author_role, szoveg)
  VALUES (t.congregation_id, p_transfer_id, auth.uid(), v_role, btrim(p_szoveg))
  RETURNING id INTO v_id;

  -- A meghagyás blokkolja az átadást (rendezésig)
  UPDATE public.congregation_transfers
     SET status = 'blocked_by_remarks', version = version + 1
   WHERE id = p_transfer_id AND status NOT IN ('completed','rejected','cancelled','expired');

  RETURN v_id;
END;
$$;

-- ── Meghagyás rendezettre állítása ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_resolve_remark(p_remark_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cong uuid;
BEGIN
  SELECT congregation_id INTO v_cong FROM public.congregation_remarks WHERE id = p_remark_id;
  IF v_cong IS NULL THEN RAISE EXCEPTION 'A meghagyás nem található.'; END IF;
  -- A gyülekezet lelkésze vagy admin rendezheti
  IF NOT public.is_admin() AND v_cong IS DISTINCT FROM public.current_user_congregation_id() THEN
    RAISE EXCEPTION 'Nincs jogosultság a meghagyás rendezéséhez.';
  END IF;
  UPDATE public.congregation_remarks SET resolved = true, resolved_at = now() WHERE id = p_remark_id;
END;
$$;

-- ── Lekérdezés: az adott gyülekezet nyitott átadása + meghagyások ───────────
CREATE OR REPLACE FUNCTION public.get_open_transfer_for_congregation(p_congregation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.congregation_transfers%ROWTYPE;
  v_role text;
  v_remarks json;
BEGIN
  SELECT * INTO t FROM public.congregation_transfers
  WHERE congregation_id = p_congregation_id
    AND status NOT IN ('completed','rejected','cancelled','expired')
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Jogosultság: admin, a gyülekezet tagja, az érintett lelkész, vagy a diocese számvevője
  v_role := public.transfer_reviewer_role(t.diocese_id);
  IF v_role IS NULL
     AND NOT public.current_user_has_global_access()
     AND t.congregation_id IS DISTINCT FROM public.current_user_congregation_id()
     AND t.from_user_id IS DISTINCT FROM auth.uid()
     AND t.to_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
            'id', r.id, 'author_role', r.author_role, 'szoveg', r.szoveg,
            'resolved', r.resolved, 'created_at', r.created_at) ORDER BY r.created_at DESC), '[]'::json)
    INTO v_remarks
  FROM public.congregation_remarks r WHERE r.transfer_id = t.id;

  RETURN json_build_object(
    'id', t.id,
    'status', t.status,
    'from_full_name', t.from_full_name,
    'reason', t.reason,
    'admin_approved_at', t.admin_approved_at,
    'auditor_approved_at', t.auditor_approved_at,
    'created_at', t.created_at,
    'expires_at', t.expires_at,
    'my_review_role', v_role,
    'remarks', v_remarks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_reviewer_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_approve(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_add_remark(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_resolve_remark(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_transfer_for_congregation(uuid) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT public.get_open_transfer_for_congregation('<congregation-uuid>');
