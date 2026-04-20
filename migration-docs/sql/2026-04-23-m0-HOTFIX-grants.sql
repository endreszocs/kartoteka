-- 2026-04-23 — M0 HOTFIX: hiányzó GRANT-ek minden M0 tábla/függvényre
--
-- ══════════════════════════════════════════════════════════════════════════
--  OK
--
--  Az M0.1-M0.6 migrációk kódolásakor ELFELEJTETTEM explicit GRANT-et adni
--  az `authenticated` és `anon` role-oknak. A Supabase Postgres-ben a
--  default viselkedés: csak `postgres`/`supabase_admin` role-oknak van joga
--  a `public` schema új tábláihoz. Az RLS policy **csak a sorokon belül
--  szűr** — de a GRANT az előfeltétel.
--
--  Eredmény: ERROR 42501: permission denied for table access_requests
--
--  MEGOLDÁS: minden létező working minta (pl. 2026-04-12-phase-0-rls-hardening.sql,
--  2026-04-18-admin-system-finance.sql) tartalmaz explicit GRANT-eket —
--  ezt a mintát követjük itt is.
--
--  FUTTATÁS: Supabase SQL Editor → másold be → Run.
--  Idempotens (a GRANT ugyanazzal az értékkel ismételhető hiba nélkül).
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- 1. Schema-szintű USAGE (azok a role-ok, akik elérhetik a public-ot)
-- ═════════════════════════════════════════════════════════════════════
-- Ha ezek nincsenek már beállítva a korábbi migrációkból, itt megerősítjük.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 2. TÁBLA-GRANT-ek
-- ═════════════════════════════════════════════════════════════════════

-- access_requests (M0.1)
--   anon: csak INSERT (publikus űrlap)
--   authenticated: minden (de az RLS csak az admin-nak enged)
GRANT INSERT ON public.access_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO authenticated;

-- user_devices (M0.5)
--   authenticated: minden (RLS szűri: csak saját vagy admin)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;

-- licenses (M0.5)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;

-- audit_log (M0.5)
--   authenticated: SELECT + INSERT (audit-integritás — nincs UPDATE/DELETE)
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- documents (M0.6)
--   authenticated: SELECT + INSERT + UPDATE (soft-delete, nincs DELETE)
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;

-- document_keys (M0.6)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_keys TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 3. FÜGGVÉNY-EXECUTE GRANT-ek
-- ═════════════════════════════════════════════════════════════════════
-- Azok a függvények, amiket a server actions vagy a publikus űrlap hív

-- Publikus rate-limit check — anon is hívhatja (publikus űrlapról)
GRANT EXECUTE ON FUNCTION public.check_access_request_rate_limit(text)
  TO anon, authenticated;

-- RLS segédfüggvények — RLS policy-kban futnak, és a server action is hívja
GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_egyhazkeruleti_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.same_congregation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_approved() TO authenticated;

-- Audit + document helper-ek
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(uuid) TO authenticated;

-- custom_access_token_hook: csak supabase_auth_admin hívja (már beállítva)
-- Itt ismétlésként:
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Default privileges jövőbeli táblákhoz (megelőző biztosítás)
-- ═════════════════════════════════════════════════════════════════════
-- Ha a jövőben új tábla keletkezik a `public` schema-ban, automatikusan
-- kapjon GRANT-et. Ez backward-compat a Supabase default viselkedéshez.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═════════════════════════════════════════════════════════════════════

-- Melyik role-oknak van SELECT joga az M0 táblákon
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('access_requests', 'user_devices', 'licenses', 'audit_log', 'documents', 'document_keys')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- Várt eredmény:
--   access_requests | anon          | INSERT
--   access_requests | authenticated | DELETE, INSERT, SELECT, UPDATE
--   audit_log       | authenticated | INSERT, SELECT
--   document_keys   | authenticated | DELETE, INSERT, SELECT, UPDATE
--   documents       | authenticated | INSERT, SELECT, UPDATE
--   licenses        | authenticated | DELETE, INSERT, SELECT, UPDATE
--   user_devices    | authenticated | DELETE, INSERT, SELECT, UPDATE

-- Függvény EXECUTE jogok
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN (
    'check_access_request_rate_limit', 'is_admin', 'is_egyhazkeruleti_admin',
    'same_congregation', 'is_user_approved', 'is_current_user_approved',
    'log_audit_event', 'soft_delete_document', 'custom_access_token_hook'
  )
  AND grantee IN ('anon', 'authenticated', 'supabase_auth_admin')
ORDER BY routine_name, grantee;
