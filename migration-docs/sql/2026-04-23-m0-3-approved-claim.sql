-- 2026-04-23 — M0.3: profiles.status alapú custom JWT claim + auth hook
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  Ez a migráció:
--   1. SQL függvény a custom JWT claim-hez (`public.custom_access_token_hook`)
--   2. Ezt a Supabase Dashboard > Authentication > Hooks panelen kell aktiválni
--      (ld. fájl végi instrukció)
--   3. Segédfüggvény: `public.is_user_approved(user_id)` — a middleware/RLS
--      ebből tudja ellenőrizni a jóváhagyott státuszt
--   4. Index a gyakori lekérdezéshez
--
--  FIGYELEM: a `profiles.status` mező MÁR LÉTEZIK a rendszerben
--  (default 'pending'). Nem adunk új oszlopot — a meglévőt bővítjük.
--  Az értékek: 'pending' → 'approved' (vagy 'active', ha már dolgozik).
--  A 'approved' és 'active' egyaránt engedélyezett belépésre.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Custom access token hook — JWT claim-et ad
-- ─────────────────────────────────────────────────────────────────────

-- FONTOS (2026-04-23 tanulság v2): a Supabase parser a multi-value `INTO v1,v2,v3`
-- szintaxist relation-nek próbálja feloldani (42P01). A működő séma-minta
-- (standalone-licenses.sql) csak SINGLE-value INTO-t használ. A legtisztább
-- megoldás: LANGUAGE sql egyetlen SELECT-kifejezéssel, jsonb-építéssel.
-- Nincs plpgsql DECLARE, nincs INTO, nincs változó.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER               -- bypassRLS login-kor, amikor supabase_auth_admin hívja
SET search_path = public       -- injection-védelem
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
  'Supabase Auth custom access token hook. A JWT-be beírja: approved (bool), profile_status, congregation_id, profile_role.';

-- A Supabase auth service role-nak kell, hogy hívhassa a hook-ot
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Segédfüggvény: is_user_approved
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND status IN ('approved', 'active')
  );
$func$;

COMMENT ON FUNCTION public.is_user_approved IS
  'Visszaadja, hogy az adott user aktív/jóváhagyott-e (profiles.status IN approved/active).';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Index a status ellenőrzéshez
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON public.profiles(status)
  WHERE status IN ('pending', 'approved', 'active');

-- ─────────────────────────────────────────────────────────────────────
-- 4. Ellenőrzés
-- ─────────────────────────────────────────────────────────────────────

SELECT
  proname AS function_name,
  prorettype::regtype AS return_type
FROM pg_proc
WHERE proname IN ('custom_access_token_hook', 'is_user_approved')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

SELECT
  COALESCE(status, 'NULL') AS status,
  COUNT(*) AS user_count
FROM public.profiles
GROUP BY status
ORDER BY user_count DESC;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- SUPABASE DASHBOARD LÉPÉS (kötelező!)
-- ─────────────────────────────────────────────────────────────────────
--
-- 1. Dashboard → Authentication → Hooks
-- 2. "Customize Access Token (JWT) Claims" → Enable
-- 3. Function: custom_access_token_hook
-- 4. Save
--
-- Utána minden új login-nál a JWT tartalmazza: approved, profile_status,
-- congregation_id, profile_role.

-- ─────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP INDEX IF EXISTS idx_profiles_status;
-- DROP FUNCTION IF EXISTS public.is_user_approved(uuid);
-- DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
-- COMMIT;
