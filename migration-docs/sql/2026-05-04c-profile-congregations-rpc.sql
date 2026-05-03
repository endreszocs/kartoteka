-- =========================================================================
-- 2026-05-04 — profile_congregations admin RPC-k (SECURITY DEFINER)
-- =========================================================================
-- KONTEXTUS:
--   A 2026-05-04-admin-user-status-rpc.sql az admin_activate_user/reject/sync
--   függvényeket vezette be a profiles tábla írásokhoz, mert az RLS+GRANT
--   blokkolta a kerületi adminot (Endre).
--
--   A profile_congregations (könyvelő / egyházmegyei számvevő ↔ gyülekezet
--   hozzárendelések) ugyanezen a sorson áll: a regular session-kliens UPDATE/
--   INSERT-jei elbukhatnak az RLS és/vagy hiányzó GRANT-ok miatt. Eddig
--   nem ütköztünk bele, mert a /admin/konyvelok flow-t Endre nem használta —
--   de proaktívan most javítjuk.
--
-- 2 új SECURITY DEFINER függvény:
--   1. admin_create_or_reinit_assignment(...) — INSERT vagy reactivate
--      (rejected/revoked → pending). Belső validációkkal:
--        - hívó admin/master/kerületi admin
--        - cél user szerepe konyvelo VAGY egyhazmegyei_szamvevo
--        - cél user status = active
--        - role_scope == target.role
--        - indoklás >= 10 karakter
--        - duplikáció kezelés (pending → error, approved → error, rejected
--          vagy revoked → reactivate)
--      Visszaad: assignment_id, was_reactivated, action ('inserted' | 'reinitiated')
--
--   2. admin_revoke_assignment(p_assignment_id, p_reason) — approved → revoked.
--      Belső validáció: indoklás >= 5 karakter.
--
-- A `is_caller_admin_for_user_mgmt()` helper (a 2026-05-04-admin-user-status-rpc.sql
-- vezette be) — előfeltétel.
-- =========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. admin_create_or_reinit_assignment
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_create_or_reinit_assignment(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_create_or_reinit_assignment(
  p_profile_id        uuid,
  p_congregation_id   uuid,
  p_role_scope        text,
  p_reason            text
)
RETURNS TABLE (
  assignment_id   uuid,
  action          text,        -- 'inserted' VAGY 'reinitiated'
  was_reactivated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_role   text;
  v_target_status text;
  v_existing_id   uuid;
  v_existing_status text;
  v_inserted_id   uuid;
BEGIN
  -- 1. Jogosultság
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Szerepkör kiosztása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.';
  END IF;

  -- 2. role_scope validáció
  IF p_role_scope NOT IN ('konyvelo', 'egyhazmegyei_szamvevo') THEN
    RAISE EXCEPTION 'Érvénytelen role_scope: % (konyvelo vagy egyhazmegyei_szamvevo lehet).', p_role_scope;
  END IF;

  -- 3. Indoklás
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'A hozzárendelés indoklása legalább 10 karakter legyen.';
  END IF;

  -- 4. Cél user lekérdezése
  SELECT role, status INTO v_target_role, v_target_status
  FROM public.profiles WHERE id = p_profile_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'A felhasználó nem található (id=%).', p_profile_id;
  END IF;

  IF v_target_role NOT IN ('konyvelo', 'egyhazmegyei_szamvevo') THEN
    RAISE EXCEPTION 'Csak könyvelő vagy egyházmegyei számvevő szerepkörhöz rendelhető gyülekezet (jelenlegi: %).', v_target_role;
  END IF;

  IF v_target_status <> 'active' THEN
    RAISE EXCEPTION 'A felhasználó még nem aktív (jelenlegi státusz: %).', v_target_status;
  END IF;

  IF p_role_scope <> v_target_role THEN
    RAISE EXCEPTION 'A szerepkör (%) nem egyezik a kiválasztott hatókörrel (%).', v_target_role, p_role_scope;
  END IF;

  -- 5. Duplikáció ellenőrzés
  SELECT id, approval_status INTO v_existing_id, v_existing_status
  FROM public.profile_congregations
  WHERE profile_id = p_profile_id
    AND congregation_id = p_congregation_id
    AND role_scope = p_role_scope
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'pending' THEN
      RAISE EXCEPTION 'Már van függőben lévő kérés ugyanehhez a felhasználóhoz és gyülekezethez.';
    END IF;
    IF v_existing_status = 'approved' THEN
      RAISE EXCEPTION 'A felhasználó már aktív hozzáféréssel rendelkezik ehhez a gyülekezethez.';
    END IF;

    -- rejected vagy revoked → reactivate (új pending)
    UPDATE public.profile_congregations
       SET approval_status = 'pending',
           approval_reason = trim(p_reason),
           assigned_by = auth.uid(),
           assigned_at = now(),
           approved_at = NULL,
           approved_by = NULL,
           active = false,
           revoked_at = NULL,
           revoked_by = NULL,
           revoked_reason = NULL
     WHERE id = v_existing_id;

    RETURN QUERY SELECT v_existing_id, 'reinitiated'::text, TRUE;
    RETURN;
  END IF;

  -- 6. Új sor
  INSERT INTO public.profile_congregations (
    profile_id, congregation_id, role_scope, approval_reason,
    assigned_by, approval_status, active
  )
  VALUES (
    p_profile_id, p_congregation_id, p_role_scope, trim(p_reason),
    auth.uid(), 'pending', false
  )
  RETURNING id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, 'inserted'::text, FALSE;
END;
$$;

COMMENT ON FUNCTION public.admin_create_or_reinit_assignment(uuid, uuid, text, text) IS
  $$Új könyvelő/számvevő ↔ gyülekezet hozzárendelést hoz létre pending állapottal, vagy egy korábbi rejected/revoked sort reaktivál. Csak admin / master / kerületi admin hívhatja.$$;

GRANT EXECUTE ON FUNCTION public.admin_create_or_reinit_assignment(uuid, uuid, text, text) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 2. admin_revoke_assignment
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_revoke_assignment(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_revoke_assignment(
  p_assignment_id uuid,
  p_reason        text
)
RETURNS TABLE (
  assignment_id  uuid,
  was_revoked    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_status text;
BEGIN
  -- 1. Jogosultság
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Szerepkör visszavonása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.';
  END IF;

  -- 2. Indoklás
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A visszavonás indoklása legalább 5 karakter legyen.';
  END IF;

  -- 3. Aktuális státusz
  SELECT approval_status INTO v_prev_status
  FROM public.profile_congregations WHERE id = p_assignment_id;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'A hozzárendelés nem található (id=%).', p_assignment_id;
  END IF;

  -- Ha már revoked, visszaadjuk a was_revoked=FALSE
  IF v_prev_status = 'revoked' THEN
    RETURN QUERY SELECT p_assignment_id, FALSE;
    RETURN;
  END IF;

  -- 4. Update
  UPDATE public.profile_congregations
     SET approval_status = 'revoked',
         active = false,
         revoked_at = now(),
         revoked_by = auth.uid(),
         revoked_reason = trim(p_reason)
   WHERE id = p_assignment_id;

  RETURN QUERY SELECT p_assignment_id, TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_revoke_assignment(uuid, text) IS
  $$Egy könyvelő/számvevő ↔ gyülekezet hozzárendelés visszavonása. Csak admin / master / kerületi admin hívhatja. Az indoklás legalább 5 karakter.$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_assignment(uuid, text) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 3. (opcionális) GRANT-fix a service_role-ra a profile_congregations táblán
-- ──────────────────────────────────────────────────────────────────────────
--
-- Ha a service_role kulcsról később mégis írni szeretnénk a profile_congregations-ra
-- (pl. cascade törlésnél a deleteUser flow-ban), érdemes a service_role GRANT-okat
-- is megadni — biztonsági backup.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_congregations TO service_role;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Az új függvények léteznek?
SELECT proname AS function_name,
       pg_get_function_identity_arguments(oid) AS arguments,
       prosecdef AS is_security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('admin_create_or_reinit_assignment', 'admin_revoke_assignment')
ORDER BY proname;

-- 2. EXECUTE GRANT-ok
SELECT grantee, routine_name, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('admin_create_or_reinit_assignment', 'admin_revoke_assignment')
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY routine_name, grantee;

-- 3. profile_congregations service_role GRANT
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'profile_congregations'
  AND grantee = 'service_role'
ORDER BY privilege_type;
