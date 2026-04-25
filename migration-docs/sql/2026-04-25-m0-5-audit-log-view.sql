-- 2026-04-25 — M0.5 hotfix: audit_log_with_profiles VIEW
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase Studio SQL Editor
--
--  PROBLÉMA, AMIT JAVÍT:
--  --------------------
--  Az admin → "Eszközök, licencek, napló" → Napló fül a következő hibát
--  kapja a Supabase-tól:
--      "Could not find a relationship between 'audit_log' and 'profiles'
--       in the schema cache"
--
--  GYÖKÉROK:
--  ---------
--  Az `audit_log.user_id` `REFERENCES auth.users(id) ON DELETE SET NULL`
--  (nullable). A PostgREST relationship inference nullable FK-ra nem
--  garantáltan működik — különösen úgy, hogy a `profiles` táblára nincs
--  közvetlen FK, csak az `auth.users`-en keresztüli implicit lánc.
--  A user_devices és licenses ugyanezt a syntax-t használja és működik,
--  mert ott a user_id NOT NULL.
--
--  MEGOLDÁS:
--  ---------
--  Új public.audit_log_with_profiles VIEW, ami az audit_log + profiles
--  flat join-t adja. A VIEW `WITH (security_invoker = true)` opcióval
--  jön létre — így az invoker user RLS-jét érvényesíti az alaptáblákon
--  (audit_log + profiles), tehát az adminok a meglévő `users_see_own_audit`
--  policy szerint látják a sorokat (admin: minden, user: saját).
--
--  IDEMPOTENS: a `DROP VIEW IF EXISTS` + `CREATE VIEW` minta miatt
--  többször is futtatható.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. VIEW létrehozása
-- ─────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.audit_log_with_profiles;

CREATE VIEW public.audit_log_with_profiles
  WITH (security_invoker = true)
  AS
SELECT
  al.id,
  al.user_id,
  al.device_id,
  al.action,
  al.target_table,
  al.target_id,
  al.metadata,
  al.ip,
  al.user_agent,
  al.created_at,
  p.email     AS user_email,
  p.full_name AS user_full_name
FROM public.audit_log al
LEFT JOIN public.profiles p ON p.id = al.user_id;

COMMENT ON VIEW public.audit_log_with_profiles IS
  'audit_log + profiles flat join az M0.5 admin Napló fülhöz. '
  'security_invoker=true: az invoker user RLS-je érvényben marad mind az '
  'audit_log, mind a profiles rétegen. Az audit_log.user_id ON DELETE SET NULL '
  'miatti PostgREST inference probléma kerülő megoldása.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. GRANT: authenticated SELECT
-- ─────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.audit_log_with_profiles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. ELLENŐRZÉS (futtatható SELECT-ek — egy run alatt látható eredmény)
-- ─────────────────────────────────────────────────────────────────────

-- 3.1 — A VIEW létezik?
SELECT
  'view_exists' AS check_name,
  COUNT(*)      AS value,
  CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'HIBA' END AS status
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'audit_log_with_profiles';

-- 3.2 — A security_invoker tényleg true-ra állt?
SELECT
  'security_invoker' AS check_name,
  c.reloptions       AS reloptions,
  CASE
    WHEN 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::text[]))
    THEN 'OK'
    ELSE 'HIBA — nem invoker, vagy nem támogatott PG verzió'
  END AS status
FROM pg_class c
WHERE c.relname = 'audit_log_with_profiles'
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 3.3 — Van-e SELECT GRANT a authenticated-nek?
SELECT
  'grants_authenticated' AS check_name,
  COUNT(*)               AS value,
  CASE WHEN COUNT(*) >= 1 THEN 'OK' ELSE 'HIBA' END AS status
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'audit_log_with_profiles'
  AND grantee = 'authenticated'
  AND privilege_type = 'SELECT';

-- 3.4 — Néhány sor a VIEW-ből (mennyi sor + minta a legutóbbi 3-ról)
SELECT
  'sample_count' AS check_name,
  COUNT(*)       AS value,
  'INFO'         AS status
FROM public.audit_log_with_profiles;

SELECT
  'sample_rows' AS check_name,
  id,
  action,
  user_email,
  created_at
FROM public.audit_log_with_profiles
ORDER BY created_at DESC
LIMIT 3;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Rollback (kommentben — manuális)
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP VIEW IF EXISTS public.audit_log_with_profiles;
-- COMMIT;
