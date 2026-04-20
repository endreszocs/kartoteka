-- 2026-04-23 — M0.3 HOTFIX v3: SECURITY DEFINER hozzáadása
--
-- ══════════════════════════════════════════════════════════════════════════
--  OK
--
--  A v2 hotfix létrehozta a függvényt LANGUAGE sql + STABLE, de kimaradt
--  a SECURITY DEFINER záradék. A verify szerint: `security_definer: false`.
--
--  KÖVETKEZMÉNY
--
--  Login-kor a hookot a `supabase_auth_admin` role hívja. A `profiles` táblán
--  RLS van, és a policy-k általában az `auth.uid()`-ra építenek — ami login
--  közben még NEM LÉTEZIK. Tehát a supabase_auth_admin **nem lát profile sort**,
--  a hook mindenkire `approved: false` claim-et adna → senki nem tud belépni.
--
--  A SECURITY DEFINER alatt a függvény az **owner** role-jával fut (ami általában
--  a `postgres`), ami BYPASSRLS-szel rendelkezik. Minden profile látszik,
--  függetlenül az auth.uid()-tól.
--
--  A SET search_path = public injection-védelem — best practice SECURITY
--  DEFINER mellett.
--
--  A test-query (SQL Editor-ből `postgres` role-lal) az első tesztnél azért
--  működött, mert ott is BYPASSRLS volt. Login-kor más a helyzet.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER                 -- ← ÚJ: az owner role-lal fut, BYPASSRLS
SET search_path = public         -- ← ÚJ: injection-védelem
AS $func$
  WITH user_info AS (
    SELECT status, role, congregation_id
    FROM public.profiles
    WHERE id = (event->>'user_id')::uuid
    LIMIT 1
  )
  SELECT jsonb_set(
    event,
    '{claims}',
    COALESCE(event->'claims', '{}'::jsonb)
      || jsonb_build_object(
        'approved',
        COALESCE((SELECT status IN ('approved', 'active') FROM user_info), false)
      )
      || COALESCE(
        (SELECT jsonb_build_object('profile_status', status) FROM user_info WHERE status IS NOT NULL),
        '{}'::jsonb
      )
      || COALESCE(
        (SELECT jsonb_build_object('congregation_id', congregation_id::text) FROM user_info WHERE congregation_id IS NOT NULL),
        '{}'::jsonb
      )
      || COALESCE(
        (SELECT jsonb_build_object('profile_role', role) FROM user_info WHERE role IS NOT NULL),
        '{}'::jsonb
      )
  );
$func$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Supabase Auth custom access token hook. SECURITY DEFINER a bypassRLS-hez, SET search_path a biztonságért. Visszaadja: approved, profile_status, congregation_id, profile_role a JWT-claims objektumban.';

-- Grant-ek
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY
-- ─────────────────────────────────────────────────────────────────────

SELECT
  proname AS fv_nev,
  pg_get_function_arguments(oid) AS argumentumok,
  CASE prolang
    WHEN (SELECT oid FROM pg_language WHERE lanname='sql') THEN 'sql'
    WHEN (SELECT oid FROM pg_language WHERE lanname='plpgsql') THEN 'plpgsql'
    ELSE 'egyéb'
  END AS nyelv,
  prosecdef AS security_definer,
  proconfig AS config
FROM pg_proc
WHERE proname = 'custom_access_token_hook'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Várt eredmény: 1 sor
--   nyelv: sql
--   security_definer: TRUE   ← ez volt korábban false
--   config: {search_path=public}

-- Funkcionális teszt (a korábbival azonos — várható kimenet: approved=false)
SELECT public.custom_access_token_hook(
  jsonb_build_object(
    'user_id', '00000000-0000-0000-0000-000000000000',
    'claims', '{}'::jsonb
  )
) AS teszt_kimenet;
