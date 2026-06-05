-- ============================================================================
-- 2026-06-05f — Felhasználó végleges törlése = GDPR-anonimizálás (F2b)
-- ----------------------------------------------------------------------------
-- Endre döntése: a "végleges törlés" CSAK a SZEMÉLYES adatot + az autentikáló
-- email-t törli/anonimizálja — SEMMI MÁS nem törlődik (a gyülekezetet más veszi
-- át, a pénzügyi/anyakönyvi adat jogi megőrzés alatt marad, a lelkészi napló
-- név-pillanatképe megmarad).
--
-- KORÁBBI viselkedés (lecserélve): a deleteUser() HARD törölte az auth.users +
-- profiles sort (CASCADE) — ez MINDENT törölt. Mostantól ANONIMIZÁLUNK:
--   - a profiles sor MEGMARAD, de a PII anonimizálódik (név, email, telefon, szül.),
--   - a szerepek visszavonódnak, a nyitott lelkészi tenure lezárul,
--   - az app-réteg az auth-oldalon SOFT-delete-et hív (login megszűnik, email törlődik),
--     így nincs CASCADE (a profiles_id_fkey amúgy is NO ACTION/RESTRICT).
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: 2026-06-05e (congregation_pastor_history + record_pastor_tenure_end).
-- ============================================================================

BEGIN;

-- ── 1. profiles: anonimizálás-időbélyegek ───────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.profiles.anonymized_at IS
  'Ha kitöltött: a fiók GDPR-anonimizálva lett (személyes adat + email törölve). A sor megmarad a hivatkozási integritásért + audit-nyomért. 2026-06-05.';

-- ── 2. erasure_requests — megfelelőségi nyilvántartás (ledger) ───────────────
CREATE TABLE IF NOT EXISTS public.erasure_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id    uuid,                       -- kit töröltünk (FK nélkül: a sor megmarad törlés után is)
  subject_full_name  text,                       -- pillanatkép (mit anonimizáltunk)
  subject_email      text,                       -- pillanatkép
  requested_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason             text,
  legal_basis        text DEFAULT 'Személyes adat törlése; a gyülekezeti pénzügyi/anyakönyvi adat jogi megőrzés alatt marad (GDPR 17(3)).',
  closed_tenures     integer DEFAULT 0,
  anonymized_at      timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erasure_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erasure_requests_admin_select ON public.erasure_requests;
CREATE POLICY erasure_requests_admin_select ON public.erasure_requests
  FOR SELECT TO authenticated USING (public.is_admin());

COMMENT ON TABLE public.erasure_requests IS
  'GDPR-törlési napló: ki, mikor, mit anonimizált + jogalap. Megfelelőség bizonyításához. 2026-06-05.';

-- ── 3. admin_erase_user() — a DB-oldali anonimizálás ────────────────────────
-- Az auth.users SOFT-delete-jét az app-réteg végzi (auth.admin.deleteUser(id,true)).
CREATE OR REPLACE FUNCTION public.admin_erase_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
  v_cong uuid;
  v_closed integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Csak rendszergazda törölhet felhasználót.';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó felhasználó-azonosító.';
  END IF;

  SELECT full_name, email, congregation_id INTO v_name, v_email, v_cong
  FROM public.profiles WHERE id = p_user_id;

  -- Nyitott lelkészi tenure-ök lezárása (a szolgálati napló megmarad, csak lezárul)
  UPDATE public.congregation_pastor_history
     SET ended_at = now(), end_reason = 'deletion'
   WHERE user_id = p_user_id AND ended_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Szerepek visszavonása
  UPDATE public.profile_roles
     SET active = false, approval_status = 'revoked', revoked_at = now()
   WHERE profile_id = p_user_id AND active IS DISTINCT FROM false;

  -- Könyvelő/számvevő gyülekezet-hozzárendelések visszavonása (ha létezik a tábla)
  BEGIN
    UPDATE public.profile_congregations
       SET active = false, approval_status = 'revoked'
     WHERE profile_id = p_user_id AND active IS DISTINCT FROM false;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- A PII anonimizálása (a sor MEGMARAD)
  UPDATE public.profiles
     SET full_name = 'Törölt felhasználó',
         email = 'torolt+' || p_user_id::text || '@kartoteka.invalid',
         phone = NULL,
         birth_date = NULL,
         status = 'deleted',
         congregation_id = NULL,
         anonymized_at = now(),
         deleted_at = now()
   WHERE id = p_user_id;

  -- Megfelelőségi napló
  INSERT INTO public.erasure_requests (subject_user_id, subject_full_name, subject_email, requested_by, reason, closed_tenures)
  VALUES (p_user_id, v_name, v_email, auth.uid(), p_reason, v_closed);

  RETURN json_build_object(
    'anonymized', true,
    'full_name', v_name,
    'email', v_email,
    'congregation_id', v_cong,
    'closed_tenures', v_closed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_erase_user(uuid, text) TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT subject_full_name, subject_email, reason, anonymized_at FROM public.erasure_requests ORDER BY created_at DESC;
-- SELECT full_name, email, status, anonymized_at FROM public.profiles WHERE anonymized_at IS NOT NULL;
