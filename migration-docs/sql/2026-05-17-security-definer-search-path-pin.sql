-- ==========================================================================
-- 2026-05-17 — SECURITY DEFINER search_path pin (CVE-2018-1058 mitigation)
-- ==========================================================================
-- DIAGNOSTICS P2-11
--
-- KONTEXTUS:
--   A korábbi RPC-migrációk SECURITY DEFINER függvényei `SET search_path = public`
--   értéket használnak. A PostgreSQL ALAPÉRTELMEZÉSBEN a `pg_temp` schema-t
--   IMPLICIT a search_path elejére teszi (pg_catalog után). Egy rosszhiszemű
--   normál felhasználó létrehozhat saját `pg_temp.foo()` függvényt vagy
--   `pg_temp.tablename` táblát, ami felülírná a `public.foo`-t a SECURITY
--   DEFINER függvény belsejében — privilege escalation (CVE-2018-1058 osztály).
--
-- JAVÍTÁS:
--   Az érintett 18 SECURITY DEFINER függvénynél EXPLICIT pinekjük a search_path-et
--   `public, pg_temp` ÉRTÉKRE — így a `pg_temp` az utolsó helyre kerül, és
--   a `public` schema függvényei/táblái elsődlegesek a lookup-ban.
--
-- IDEMPOTENS:
--   Az `ALTER FUNCTION ... SET search_path = ...` parancs többször is futtatható.
--   Csak felülírja a meglévő beállítást — hibát nem dob.
--
-- TRANZAKCIÓ (P2-12 szerint):
--   A teljes batch BEGIN/COMMIT-be csomagolva. Ha bármelyik ALTER bukik
--   (pl. egy függvény még nincs telepítve), az egész batch visszagörget.
--
-- DOKUMENTÁCIÓ:
--   - https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--   - https://wiki.postgresql.org/wiki/A_Guide_to_CVE-2018-1058
-- ==========================================================================

BEGIN;

-- ── 2026-05-04-admin-user-status-rpc.sql ──────────────────────────────────
ALTER FUNCTION public.is_caller_admin_for_user_mgmt()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_activate_user(uuid, uuid, uuid, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_reject_user(uuid, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_sync_legacy_role(uuid, text)
  SET search_path = public, pg_temp;

-- ── 2026-05-04c-profile-congregations-rpc.sql ────────────────────────────
ALTER FUNCTION public.admin_create_or_reinit_assignment(uuid, uuid, text, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_revoke_assignment(uuid, text)
  SET search_path = public, pg_temp;

-- ── 2026-05-04f-complete-user-onboarding-rpc.sql ─────────────────────────
ALTER FUNCTION public.complete_user_onboarding()
  SET search_path = public, pg_temp;

-- ── 2026-04-26-family-link-inference-rpc.sql ─────────────────────────────
ALTER FUNCTION public._can_manage_family_links(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.infer_family_links_for_congregation(uuid, text, boolean)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.revert_family_link_batch(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.list_family_link_batches(uuid, integer)
  SET search_path = public, pg_temp;

-- ── 2026-05-02-finance-import-rpc.sql ────────────────────────────────────
ALTER FUNCTION public.import_finance_batch(uuid, uuid, jsonb)
  SET search_path = public, pg_temp;

-- ── 2026-04-15-standalone-licenses.sql ───────────────────────────────────
-- A `standalone_licenses_updated_at()` trigger fn és a `list_my_licenses()`
-- SECURITY INVOKER — kihagyva.
ALTER FUNCTION public.issue_license(text, text, text, inet, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.revoke_license(uuid, text)
  SET search_path = public, pg_temp;

-- ── 2026-04-24-admin-wipe-congregation-data.sql ──────────────────────────
ALTER FUNCTION public.wipe_congregation_data(uuid, text)
  SET search_path = public, pg_temp;

-- ── 2026-04-25-a-m7-9a-iratszam-pointers.sql ─────────────────────────────
ALTER FUNCTION public.bootstrap_iratszam_pointer(uuid, text, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_iratszam(uuid, text, integer, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.next_iratszam(uuid, text, integer)
  SET search_path = public, pg_temp;

-- ── 2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql ─────────────────────
ALTER FUNCTION public.reserve_chitanta_numbers(uuid, text, integer)
  SET search_path = public, pg_temp;


-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — minden ALTER-elt függvény search_path-je most public, pg_temp
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arg_signature,
  p.proconfig AS config,
  CASE
    WHEN p.proconfig IS NULL THEN '❌ NINCS proconfig'
    WHEN EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS c
      WHERE c = 'search_path=public, pg_temp'
    ) THEN '✅ OK (public, pg_temp)'
    WHEN EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS c
      WHERE c LIKE 'search_path=%'
    ) THEN '⚠️  search_path beállítva, de nem (public, pg_temp)'
    ELSE '❌ proconfig van, de NINCS search_path'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true  -- SECURITY DEFINER
  AND p.proname IN (
    'is_caller_admin_for_user_mgmt', 'admin_activate_user', 'admin_reject_user',
    'admin_sync_legacy_role', 'admin_create_or_reinit_assignment',
    'admin_revoke_assignment', 'complete_user_onboarding',
    '_can_manage_family_links', 'infer_family_links_for_congregation',
    'revert_family_link_batch', 'list_family_link_batches',
    'import_finance_batch', 'issue_license', 'revoke_license',
    'wipe_congregation_data', 'bootstrap_iratszam_pointer',
    'reserve_iratszam', 'next_iratszam', 'reserve_chitanta_numbers'
  )
ORDER BY p.proname;

COMMIT;
