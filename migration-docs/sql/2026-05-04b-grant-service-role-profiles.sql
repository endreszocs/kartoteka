-- =========================================================================
-- 2026-05-04 — service_role GRANT a profiles táblára (post-mortem dokumentáció)
-- =========================================================================
-- KONTEXTUS:
--   A 2026-05-04-admin-user-status-rpc.sql 3. ellenőrző SELECT-je felfedte,
--   hogy a public.profiles táblán a service_role szerepkör SOHA NEM kapott
--   GRANT-ot. (Vagy egy korábbi RLS-hardening REVOKE-olta — a logban nincs
--   nyoma.)
--
--   Hatás: a TS kód getSupabaseAdminClient()-en át (service_role kulccsal)
--   indított UPDATE/INSERT/DELETE a profiles-on "permission denied for table
--   profiles" hibát kapott. Endre futtatta ezt a GRANT-et 2026-05-04-én
--   Supabase Studio-ból, és visszaállította a normál hozzáférést.
--
--   Ez a fájl idempotens — ismételt futtatás biztonságos.
--
-- AJÁNLOTT:
--   A RECOMMENDED setup most két párhuzamos védvonal:
--     1. SECURITY DEFINER RPC-k (admin_activate_user, ...) az "auth-igényes"
--        flow-khoz — explicit jogosultság-check belül.
--     2. service_role GRANT a backup util-flow-khoz, ahol a service-role
--        kliens egyébként is használt (pl. deleteUser → auth.admin.deleteUser
--        + profiles cascade).
-- =========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS — a service_role most minden core jogot megkapott
-- ──────────────────────────────────────────────────────────────────────────

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee = 'service_role'
ORDER BY privilege_type;
