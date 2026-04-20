-- 2026-04-23 — M0.3 HOTFIX v2: custom_access_token_hook SQL-nyelven
--
-- ══════════════════════════════════════════════════════════════════════════
--  ELŐZMÉNY
--
--  v0 (eredeti): DECLARE user_profile record + SELECT INTO user_profile
--               → ERROR 42P01: relation "user_profile" does not exist
--
--  v1 (első hotfix): DECLARE v_status/v_role/v_congregation_id + SELECT ... INTO v_status, v_role, v_congregation_id
--                   → ERROR 42P01: relation "v_status" does not exist
--
--  v2 (EZ A FÁJL): LANGUAGE sql, tiszta SELECT-expression, semmi plpgsql INTO.
--
--  DIAGNÓZIS
--
--  A séma-olvasás során a `standalone-licenses.sql` azt mutatja, hogy a Supabase
--  parser MINDEGYIK működő `INTO` SINGLE-value:
--
--    SELECT congregation_id INTO v_cong_id FROM public.profiles ...   (1 változó)
--    SELECT revoked INTO v_existing_revoked ...                        (1 változó)
--    RETURNING id INTO v_license_id;                                   (1 változó)
--
--  **Tehát**: a Supabase parser nem kezeli a multi-value INTO-t (`SELECT a, b, c
--  INTO v1, v2, v3`) — a változónevet relation-ként próbálja feloldani.
--
--  MEGOLDÁS: átírom az egész függvényt LANGUAGE sql-re, egyetlen SELECT
--  kifejezéssel. Nincs plpgsql változó, nincs INTO, nincs DECLARE. Tisztán
--  SQL — az eredmény ugyanaz: az event jsonb-be bekerülnek a claim-mezők.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Minden előző verzió eldobása
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

-- Új, SQL-nyelvű implementáció — nulla plpgsql, nulla INTO, nulla változó
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
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
      -- approved: true ha status IN ('approved', 'active'), különben false
      || jsonb_build_object(
        'approved',
        COALESCE((SELECT status IN ('approved', 'active') FROM user_info), false)
      )
      -- profile_status (ha nem null)
      || COALESCE(
        (SELECT jsonb_build_object('profile_status', status) FROM user_info WHERE status IS NOT NULL),
        '{}'::jsonb
      )
      -- congregation_id (mint szöveg, ha nem null)
      || COALESCE(
        (SELECT jsonb_build_object('congregation_id', congregation_id::text) FROM user_info WHERE congregation_id IS NOT NULL),
        '{}'::jsonb
      )
      -- profile_role (ha nem null)
      || COALESCE(
        (SELECT jsonb_build_object('profile_role', role) FROM user_info WHERE role IS NOT NULL),
        '{}'::jsonb
      )
  );
$func$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Supabase Auth custom access token hook (SQL-nyelvű, nem plpgsql — a Supabase parser multi-value INTO ambiguity elkerülésére). A JWT-be beírja: approved (bool), profile_status, congregation_id, profile_role.';

-- Supabase auth service role-nak kell grant
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY 1 — a függvény létrejött-e helyesen
-- ─────────────────────────────────────────────────────────────────────

SELECT
  proname AS fv_nev,
  pg_get_function_arguments(oid) AS argumentumok,
  CASE prolang
    WHEN (SELECT oid FROM pg_language WHERE lanname='sql') THEN 'sql'
    WHEN (SELECT oid FROM pg_language WHERE lanname='plpgsql') THEN 'plpgsql'
    ELSE 'egyéb'
  END AS nyelv,
  provolatile AS volatility_tipus
FROM pg_proc
WHERE proname = 'custom_access_token_hook'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Várt: 1 sor, nyelv='sql', volatility='s' (STABLE)

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY 2 — funkcionális teszt hamis event-tel (biztonságos, csak read-only)
-- ─────────────────────────────────────────────────────────────────────

-- Egy nem-létező UUID-val hívjuk meg — várt: approved=false, nincs profile_status
SELECT public.custom_access_token_hook(
  jsonb_build_object(
    'user_id', '00000000-0000-0000-0000-000000000000',
    'claims', '{}'::jsonb
  )
) AS teszt_eredmeny_nem_letezo_user;

-- Ha van egy valós user (pl. master admin), cseréld ki az UUID-t:
-- SELECT public.custom_access_token_hook(
--   jsonb_build_object(
--     'user_id', (SELECT id FROM auth.users LIMIT 1),
--     'claims', '{}'::jsonb
--   )
-- ) AS teszt_eredmeny_letezo_user;
-- Várt: approved=true/false + profile_status + (ha admin: congregation_id is benne)
