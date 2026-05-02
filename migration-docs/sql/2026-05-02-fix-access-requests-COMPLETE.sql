-- ============================================================================
-- TELJES KÖRŰ FIX — Access requests anon INSERT (2. próbálkozás)
-- ============================================================================
-- 2026-05-02 — A felhasználó még mindig "permission denied for table
-- access_requests" hibát kap az SQL futtatása után. Ez egy alaposabb fix:
--
--   1. ELLENŐRZÉS: jelenlegi POLICY-k és GRANT-ek
--   2. TELJES RESET: minden POLICY drop, újra-create explicit szerepkörökkel
--   3. GRANT minden szükséges szerepkörre (anon, authenticated, service_role)
--   4. A `check_access_request_rate_limit` függvény GRANT EXECUTE
--   5. PostgREST cache-reload — `NOTIFY pgrst, 'reload schema'`
--   6. ELLENŐRZÉS újra: minden látható-e
--
-- FUTTATD A TELJES FÁJLT — minden lépés idempotens, nem ront el semmit.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. JELENLEGI ÁLLAPOT — DIAGNOSZTIKA
-- ─────────────────────────────────────────────────────────────────────

-- 1.1 — RLS engedélyezve van?
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_engedelyezve,
  c.relforcerowsecurity AS rls_kenyszeritve
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'access_requests';

-- 1.2 — Milyen POLICY-k vannak most?
SELECT
  polname AS policy_neve,
  CASE polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS muvelet,
  ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)) AS szerepkorok,
  pg_get_expr(polqual, polrelid) AS using_clause,
  pg_get_expr(polwithcheck, polrelid) AS with_check_clause
FROM pg_policy
WHERE polrelid = 'public.access_requests'::regclass
ORDER BY polname;

-- ─────────────────────────────────────────────────────────────────────
-- 2. TELJES POLICY RESET — minden drop, újra-create
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Bizonyosság: ha valami egyéb policy maradt, mindet eldobjuk
DO $$
DECLARE
  pol_name TEXT;
BEGIN
  FOR pol_name IN
    SELECT polname FROM pg_policy WHERE polrelid = 'public.access_requests'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.access_requests', pol_name);
  END LOOP;
END $$;

-- INSERT — anon és authenticated mehet
CREATE POLICY access_requests_insert
  ON public.access_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SELECT — csak admin
CREATE POLICY access_requests_select_admin
  ON public.access_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- UPDATE — csak admin
CREATE POLICY access_requests_update_admin
  ON public.access_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- DELETE — tiltva (audit-megőrzés)

-- ─────────────────────────────────────────────────────────────────────
-- 3. GRANT-ek a táblára
-- ─────────────────────────────────────────────────────────────────────

GRANT INSERT ON public.access_requests TO anon;
GRANT INSERT, SELECT, UPDATE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4. GRANT EXECUTE a rate-limit függvényre (anon, authenticated)
-- ─────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.check_access_request_rate_limit(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_access_request_rate_limit(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 5. (Opcionális) — a profiles tábla SELECT joga az anon-nak az
--     admin-notification email küldéshez. JELENLEG NEM SZÜKSÉGES, mert
--     a `submitAccessRequest` server-side fut a service_role helyett a
--     felhasználó session-jével. Ha az admin-notification email mégis
--     fail-el, akkor adunk SELECT jogot, de szigorítjuk: csak az admin
--     email-eket olvashatja.
-- ─────────────────────────────────────────────────────────────────────

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- 6. PostgREST cache-reload — KRITIKUS lépés a végén!
-- ─────────────────────────────────────────────────────────────────────
-- A Supabase PostgREST automatikusan figyel a 'pgrst' channel-re. Ez a
-- NOTIFY azonnal frissíti a schema cache-et (különben akár 10 perc is
-- eltelhet az új POLICY/GRANT érzékelésig).

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. ELLENŐRZÉS — mit csinált a script
-- ─────────────────────────────────────────────────────────────────────

-- 7.1 — POLICY-k:
SELECT
  polname AS policy_neve,
  CASE polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS muvelet,
  ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)) AS szerepkorok
FROM pg_policy
WHERE polrelid = 'public.access_requests'::regclass
ORDER BY polname;

-- 7.2 — GRANT-ek a táblára:
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'access_requests'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- 7.3 — GRANT EXECUTE a rate-limit függvényre:
SELECT
  r.rolname AS szerepkor,
  has_function_privilege(r.oid, 'public.check_access_request_rate_limit(TEXT)', 'EXECUTE') AS execute_jog
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

-- ============================================================================
-- KÉSZ. Várt eredmény (7.1):
--   access_requests_insert        | INSERT | {anon, authenticated}
--   access_requests_select_admin  | SELECT | {authenticated}
--   access_requests_update_admin  | UPDATE | {authenticated}
--
-- Várt eredmény (7.2):
--   anon          | INSERT
--   authenticated | INSERT
--   authenticated | SELECT
--   authenticated | UPDATE
--   service_role  | DELETE
--   service_role  | INSERT
--   service_role  | SELECT
--   service_role  | UPDATE
--   ...
--
-- Várt eredmény (7.3):
--   anon          | true
--   authenticated | true
--   service_role  | true
--
-- Ha mind ez OK, és a "permission denied" még mindig megvan, akkor:
--   - A Supabase Dashboard → Database → Replication → DB-restart
--   - VAGY: várj 1-2 percet, a PostgREST újra cache-eli
-- ============================================================================
