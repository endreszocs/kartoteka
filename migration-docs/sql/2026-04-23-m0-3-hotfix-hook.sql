-- 2026-04-23 — M0.3 HOTFIX: custom_access_token_hook javítás
--
-- ══════════════════════════════════════════════════════════════════════════
--  HIBA: ERROR 42P01: relation "user_profile" does not exist
--
--  OK: a `user_profile record` típusú plpgsql változót + `INTO user_profile`
--  szintaxist a Supabase parser tábla-hivatkozásnak látta. Ennek oka, hogy a
--  `record` típus + prefix-nélküli név ambiguous.
--
--  A SÉMÁBAN MEGLÉVŐ WORKING MINTA (migration-docs/sql/2026-04-15-standalone-licenses.sql:151):
--    v_cong_id uuid;                                              ← explicit típus + v_ prefix
--    SELECT congregation_id INTO v_cong_id FROM public.profiles;  ← parser egyértelműen látja
--
--  JAVÍTÁS: átírom a változókat `v_` prefixes, explicit típusú formára.
--  Minden logika változatlan.
-- ══════════════════════════════════════════════════════════════════════════
--
-- FONTOS: ha a custom_access_token_hook MÁR aktiválva van a Supabase Dashboard
-- > Authentication > Hooks panelen, akkor a régi (hibás) függvény **minden
-- login-ra** lefut, és a JWT-generálás hibát dob. Ebben az esetben:
--
--   1. Ideiglenesen KAPCSOLD KI a hookot (Dashboard > Authentication > Hooks
--      > Customize Access Token > Disable)
--   2. Futtasd le EZT a fájlt (DROP + CREATE a javított függvényt)
--   3. Kapcsold VISSZA a hookot (Enable)
--
-- Ha még NEM aktiváltad: egyszerűen futtasd, és aktiválás előtt ez lesz a
-- jó változat.
--
-- A Dashboard panel: https://supabase.com/dashboard/project/_/auth/hooks

BEGIN;

-- Régi (hibás) függvény eldobása
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

-- Új (javított) függvény — explicit típusú változók v_ prefixszel
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_status text;
  v_role text;
  v_congregation_id uuid;
BEGIN
  -- 1. User profile lekérdezés — explicit típusú változókba
  SELECT status, role, congregation_id
    INTO v_status, v_role, v_congregation_id
    FROM public.profiles
    WHERE id = (event->>'user_id')::uuid;

  -- 2. Alap claims objektum
  claims := event->'claims';

  -- 3. approved claim (status IN ('approved', 'active') → true)
  IF v_status IS NULL THEN
    claims := jsonb_set(claims, '{approved}', 'false');
  ELSIF v_status IN ('approved', 'active') THEN
    claims := jsonb_set(claims, '{approved}', 'true');
  ELSE
    claims := jsonb_set(claims, '{approved}', 'false');
  END IF;

  -- 4. profile_status (string)
  IF v_status IS NOT NULL THEN
    claims := jsonb_set(claims, '{profile_status}', to_jsonb(v_status));
  END IF;

  -- 5. congregation_id (UUID as string)
  IF v_congregation_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{congregation_id}', to_jsonb(v_congregation_id::text));
  END IF;

  -- 6. profile_role (string)
  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{profile_role}', to_jsonb(v_role));
  END IF;

  -- 7. Return the updated event
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Supabase Auth custom access token hook (javított plpgsql, explicit típusú v_ változókkal). A JWT-be beírja: approved (bool), profile_status, congregation_id, profile_role.';

-- Supabase auth service role-nak kell grant
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY — a függvény létrejött-e helyesen
-- ─────────────────────────────────────────────────────────────────────

SELECT
  proname AS fv_nev,
  pg_get_function_arguments(oid) AS argumentumok,
  prolang::regtype AS language_type,
  prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'custom_access_token_hook'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Várt eredmény: 1 sor, language_type nem 'void', argumentumok: 'event jsonb'

-- ─────────────────────────────────────────────────────────────────────
-- OPCIONÁLIS: funkcionális teszt hamis event-tel
-- ─────────────────────────────────────────────────────────────────────

-- Ha van egy valós user, tesztelheted (cseréld ki az UUID-t):
--   SELECT public.custom_access_token_hook(
--     jsonb_build_object(
--       'user_id', '00000000-0000-0000-0000-000000000000',
--       'claims', '{}'::jsonb
--     )
--   );
-- Ha a user létezik: megkapod a JWT claim-objektumot "approved" stb. mezőkkel.
-- Ha nem létezik: ugyanaz, de approved=false, profile_status nincs.
