-- ============================================================================
-- 2026-06-05c — registration_email_info() RPC
-- ============================================================================
-- CÉL (Endre kérése):
-- Ha valaki egy MÁR regisztrált email-címmel próbál újra regisztrálni, a
-- rendszer mondja meg, MELYIK gyülekezetnél van már regisztrálva — és kínálja
-- fel az "Elfelejtett jelszó" lehetőséget (ez utóbbi UI-ja már létezik).
--
-- HÁTTÉR:
-- A meglévő login_email_status() szándékosan CSAK státuszt ad vissza (nincs PII,
-- a login arra épül — nem bővítjük). Ez az új függvény a regisztrációs flow-hoz
-- a státusz MELLETT a gyülekezet nevét is visszaadja.
--
-- A gyülekezet kétféleképp deríthető ki:
--   1. profiles.congregation_id (jóváhagyott/aktív felhasználónál)
--   2. ha az nincs (pl. még 'pending'), a legutóbbi access_requests sor
--      requested_congregation_id mezőjéből.
--
-- ADATVÉDELEM / KOCKÁZAT:
-- Szándékos email-enumeration végpont (mint a login_email_status) — belső,
-- zárt egyházi rendszer, Endre döntése alapján elfogadható. Csak a státuszt és
-- a gyülekezet NEVÉT adja vissza, egyéb PII-t (név, telefon) NEM.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registration_email_info(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status     text;
  v_cong_id    uuid;
  v_cong_name  text;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN json_build_object('status', 'not_registered', 'congregation_name', NULL);
  END IF;

  -- 1) Profil (a handle_new_user trigger minden auth.users-t tükröz ide)
  SELECT status, congregation_id
    INTO v_status, v_cong_id
  FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;

  IF v_status IS NULL THEN
    RETURN json_build_object('status', 'not_registered', 'congregation_name', NULL);
  END IF;

  -- 2) Ha a profilon nincs gyülekezet (pl. még pending), a legutóbbi
  --    access_requests sorból próbáljuk.
  IF v_cong_id IS NULL THEN
    SELECT requested_congregation_id
      INTO v_cong_id
    FROM public.access_requests
    WHERE lower(email) = lower(btrim(p_email))
      AND requested_congregation_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 3) Gyülekezet neve (magyar név elsőbbség, fallback a 'name'-re)
  IF v_cong_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(nev_hu), ''), NULLIF(btrim(name), ''))
      INTO v_cong_name
    FROM public.congregations
    WHERE id = v_cong_id
    LIMIT 1;
  END IF;

  RETURN json_build_object('status', v_status, 'congregation_name', v_cong_name);
END;
$$;

COMMENT ON FUNCTION public.registration_email_info(text) IS
  'Regisztrációs flow: egy email státusza (not_registered | pending | active | ...) + a hozzá tartozó gyülekezet neve (profiles.congregation_id, vagy fallback a legutóbbi access_requests.requested_congregation_id). Szándékos enumeration-végpont, csak státusz + gyülekezetnév (nincs egyéb PII). 2026-06-05.';

GRANT EXECUTE ON FUNCTION public.registration_email_info(text) TO anon, authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- Nem létező email → {"status":"not_registered","congregation_name":null}
SELECT public.registration_email_info('nincs-ilyen-email-xyz@example.com');

-- Létező email → pl. {"status":"active","congregation_name":"Barátosi Református Egyházközség"}
-- SELECT public.registration_email_info('ide-egy-letezo-email@pelda.hu');
