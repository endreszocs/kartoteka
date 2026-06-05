-- ============================================================================
-- 2026-06-05h — Saját fiók törlése (self-erasure)
-- ----------------------------------------------------------------------------
-- Endre kérése: a lelkész a header → Beállítások → Adat & biztonság résznél
-- törölheti a SAJÁT profilját. Ekkor a gyülekezet MEGÜRÜL (felelős nélkül marad),
-- amit a rendszergazda lát. Az anonimizálás azonos az admin-törléssel (F2b):
-- csak a személyes adat + email tűnik el, a gyülekezeti adat megmarad.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: 2026-06-05f (erasure_requests, profiles.anonymized_at) + 2026-06-05e.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.erase_my_account(p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_email text;
  v_cong uuid;
  v_closed integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezve.';
  END IF;

  SELECT full_name, email, congregation_id INTO v_name, v_email, v_cong
  FROM public.profiles WHERE id = v_uid;

  -- Nyitott lelkészi tenure-ök lezárása (a szolgálati napló megmarad)
  UPDATE public.congregation_pastor_history
     SET ended_at = now(), end_reason = 'deletion'
   WHERE user_id = v_uid AND ended_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Szerepek visszavonása
  UPDATE public.profile_roles
     SET active = false, approval_status = 'revoked', revoked_at = now()
   WHERE profile_id = v_uid AND active IS DISTINCT FROM false;

  BEGIN
    UPDATE public.profile_congregations
       SET active = false, approval_status = 'revoked'
     WHERE profile_id = v_uid AND active IS DISTINCT FROM false;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- PII anonimizálása (a sor megmarad) + a gyülekezet ürítése (felelős nélkül marad)
  UPDATE public.profiles
     SET full_name = 'Törölt felhasználó',
         email = 'torolt+' || v_uid::text || '@kartoteka.invalid',
         phone = NULL,
         birth_date = NULL,
         status = 'deleted',
         congregation_id = NULL,
         anonymized_at = now(),
         deleted_at = now()
   WHERE id = v_uid;

  INSERT INTO public.erasure_requests (subject_user_id, subject_full_name, subject_email, requested_by, reason, closed_tenures)
  VALUES (v_uid, v_name, v_email, v_uid, COALESCE(p_reason, 'Saját kérésre törölve (self-service)'), v_closed);

  RETURN json_build_object('anonymized', true, 'congregation_id', v_cong, 'closed_tenures', v_closed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.erase_my_account(text) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT subject_full_name, reason, anonymized_at FROM public.erasure_requests ORDER BY created_at DESC;
