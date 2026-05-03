-- =========================================================================
-- 2026-05-04 — Admin user-status RPC függvények (SECURITY DEFINER)
-- =========================================================================
-- KONTEXTUS:
--   A web admin felületen a kerületi adminra (Endre) "permission denied for
--   table profiles" hibát kapunk, amikor a `+ Új szerepkör` vagy a
--   "Felhasználó aktiválása" gombbal aktiválni próbálnánk pending fiókot.
--
--   Eredet: a profiles tábla GRANT-jait szigorították, és a service-role
--   kulcs sem kap UPDATE jogot a kódból. (RLS-policy és GRANT együtt is
--   szigorú.)
--
-- MEGOLDÁS:
--   3 SECURITY DEFINER függvény, amik a függvény-tulajdonosaként
--   (postgres szuperuser) futnak, megkerülik mind az RLS-t, mind a
--   GRANT-okat. Belül szigorúan ellenőrzik, hogy a hívó (auth.uid())
--   admin / master / kerületi admin szerepkörű-e.
--
--   1. admin_activate_user(p_user_id, p_congregation_id, p_diocese_id, p_district_id)
--      — pending → active, opcionális congregation/diocese/district mezők
--      — visszaadja a végleges status-t és a previous_status-t
--
--   2. admin_reject_user(p_user_id, p_reason)
--      — pending → rejected, indoklás kötelező
--
--   3. admin_sync_legacy_role(p_user_id, p_new_role)
--      — profiles.role írás a multi-role-szinkronhoz
--
-- HASZNÁLAT:
--   A TS oldal a `supabase.rpc('admin_activate_user', { p_user_id: ..., ... })`
--   hívással használja. A jogosultság-check belül történik.
--
-- HOZZÁFÉRÉS:
--   GRANT EXECUTE TO authenticated — minden bejelentkezett user hívhatja a
--   függvényt, de a belső SELECT auth.uid() check eldobja, ha nem admin.
-- =========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Helper: hívó admin / master / kerületi admin?
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_caller_admin_for_user_mgmt()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text;
  caller_email text;
BEGIN
  -- A hívó email-jét lekérjük (master admin email-listához)
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

  -- Master admin email (egyetlen felhasználó hardkódolt)
  IF caller_email = 'endreszocs@gmail.com' THEN
    RETURN TRUE;
  END IF;

  -- profiles.role check: admin / egyhazkeruleti_admin
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role IN ('admin', 'egyhazkeruleti_admin') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.is_caller_admin_for_user_mgmt() IS
  $$Igaz, ha a hívó user (auth.uid()) master admin email-vel rendelkezik, vagy a profiles.role admin / egyhazkeruleti_admin.$$;

GRANT EXECUTE ON FUNCTION public.is_caller_admin_for_user_mgmt() TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 1. admin_activate_user — pending → active
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_activate_user(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_activate_user(
  p_user_id          uuid,
  p_congregation_id  uuid DEFAULT NULL,
  p_diocese_id       uuid DEFAULT NULL,
  p_district_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id          uuid,
  previous_status  text,
  new_status       text,
  was_updated      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_status text;
BEGIN
  -- Jogosultság check
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Nincs jogosultsága a felhasználó aktiválására (admin / master / kerületi admin szükséges).'
      USING HINT = 'Lépjen be admin fiókkal vagy kérjen jogosultságot.';
  END IF;

  -- Előző status
  SELECT status INTO v_prev_status FROM public.profiles WHERE id = p_user_id;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'A felhasználó nem található (id=%).', p_user_id;
  END IF;

  -- Csak akkor frissítünk, ha pending
  IF v_prev_status <> 'pending' THEN
    RETURN QUERY SELECT p_user_id, v_prev_status, v_prev_status, FALSE;
    RETURN;
  END IF;

  -- Update
  UPDATE public.profiles
     SET status          = 'active',
         congregation_id = COALESCE(p_congregation_id, congregation_id),
         diocese_id      = COALESCE(p_diocese_id, diocese_id),
         district_id     = COALESCE(p_district_id, district_id)
   WHERE id = p_user_id;

  RETURN QUERY SELECT p_user_id, v_prev_status, 'active'::text, TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_activate_user(uuid, uuid, uuid, uuid) IS
  $$Pending profiles → active. Csak admin / master / kerületi admin hívhatja. Az opcionális congregation_id / diocese_id / district_id COALESCE-szel csak akkor írja át, ha NEM null.$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_user(uuid, uuid, uuid, uuid) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 2. admin_reject_user — pending → rejected
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_reject_user(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_reject_user(
  p_user_id  uuid,
  p_reason   text
)
RETURNS TABLE (
  user_id          uuid,
  previous_status  text,
  new_status       text,
  was_updated      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_status text;
BEGIN
  -- Jogosultság check
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Nincs jogosultsága a felhasználó elutasítására.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Az elutasítás indoklása legalább 5 karakter legyen.';
  END IF;

  SELECT status INTO v_prev_status FROM public.profiles WHERE id = p_user_id;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'A felhasználó nem található (id=%).', p_user_id;
  END IF;

  IF v_prev_status <> 'pending' THEN
    RETURN QUERY SELECT p_user_id, v_prev_status, v_prev_status, FALSE;
    RETURN;
  END IF;

  UPDATE public.profiles SET status = 'rejected' WHERE id = p_user_id;

  RETURN QUERY SELECT p_user_id, v_prev_status, 'rejected'::text, TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_reject_user(uuid, text) IS
  $$Pending profiles → rejected. Csak admin / master / kerületi admin hívhatja. Az indoklás legalább 5 karakter.$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_user(uuid, text) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 3. admin_sync_legacy_role — profiles.role írás
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_sync_legacy_role(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_sync_legacy_role(
  p_user_id  uuid,
  p_new_role text
)
RETURNS TABLE (
  user_id        uuid,
  previous_role  text,
  new_role       text,
  was_updated    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_role text;
  v_allowed_roles text[] := ARRAY[
    'admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin',
    'egyhazmegyei_szamvevo', 'lelkesz', 'konyvelo'
  ];
BEGIN
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Nincs jogosultsága a felhasználó szerepkörének módosítására.';
  END IF;

  IF p_new_role IS NULL OR NOT (p_new_role = ANY (v_allowed_roles)) THEN
    RAISE EXCEPTION 'Érvénytelen szerepkör: %.', COALESCE(p_new_role, '(null)');
  END IF;

  SELECT role INTO v_prev_role FROM public.profiles WHERE id = p_user_id;

  IF v_prev_role = p_new_role THEN
    RETURN QUERY SELECT p_user_id, v_prev_role, p_new_role, FALSE;
    RETURN;
  END IF;

  UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;

  RETURN QUERY SELECT p_user_id, v_prev_role, p_new_role, TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_sync_legacy_role(uuid, text) IS
  $$Profiles.role írás. Csak admin / master / kerületi admin hívhatja. Az új role egy a 7 standard szerepkör közül.$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_legacy_role(uuid, text) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS — futtassd le ezt is, ha kíváncsi vagy az eredményre
-- ──────────────────────────────────────────────────────────────────────────

-- 1. A 3 új függvény létezik?
SELECT proname AS function_name,
       pg_get_function_identity_arguments(oid) AS arguments,
       prosecdef AS is_security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('admin_activate_user', 'admin_reject_user', 'admin_sync_legacy_role', 'is_caller_admin_for_user_mgmt')
ORDER BY proname;

-- 2. EXECUTE GRANT-ok az authenticated szerepkörre
SELECT grantee, routine_name, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('admin_activate_user', 'admin_reject_user', 'admin_sync_legacy_role', 'is_caller_admin_for_user_mgmt')
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY routine_name, grantee;

-- 3. Profiles tábla aktuális GRANT-jai (diagnosztikai célra — segít megérteni miért nem
--    működött az eredeti service-role-os update)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY grantee, privilege_type;
