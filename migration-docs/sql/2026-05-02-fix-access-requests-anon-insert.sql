-- ============================================================================
-- KRITIKUS BUG-FIX — Access requests: anon INSERT
-- ============================================================================
-- 2026-05-02 — Felhasználó panasza a publikus regisztrációs űrlapról:
-- "permission denied for table access_requests"
--
-- HÁTTÉR:
-- A `2026-04-22-m0-1-access-requests.sql` migráció létrehozta az
-- `access_requests` táblát + a `"Anyone can submit an access request"`
-- POLICY-t (WITH CHECK true). A POLICY rendben van, **DE** a táblára
-- nem lett kiadva GRANT INSERT az `anon` és `authenticated` szerepkörnek.
--
-- A PostgreSQL RLS modellje: a POLICY csak akkor enged át egy műveletet,
-- ha a base TABLE PRIVILEGE (GRANT) is megvan. Ha pl. az `anon` szerepkör
-- nem rendelkezik INSERT joggal, akkor a Supabase "permission denied" hibát
-- ad (kód: 42501) — a felhasználó pontosan ezt látja a regisztrációs
-- űrlap submit-jénél.
--
-- KÖVETKEZMÉNY: jelenleg ÚJ FELHASZNÁLÓ NEM TUD HOZZÁFÉRÉST KÉRNI a rendszerhez!
--
-- MEGOLDÁS:
-- - GRANT INSERT az `anon` és `authenticated` szerepkörnek
-- - A POLICY explicit `TO` paraméterrel — biztonság kedvéért
-- ============================================================================

BEGIN;

-- ── 1. GRANT INSERT az anon és authenticated szerepkörnek ────────────────

GRANT INSERT ON public.access_requests TO anon;
GRANT INSERT ON public.access_requests TO authenticated;

-- ── 2. Re-create POLICY explicit TO-val ─────────────────────────────────

DROP POLICY IF EXISTS "Anyone can submit an access request" ON public.access_requests;

CREATE POLICY "Anyone can submit an access request"
  ON public.access_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

COMMIT;

-- ── 3. ELLENŐRZÉS ────────────────────────────────────────────────────────

-- 3.1 — A POLICY létezik, és helyes szerepkörökre vonatkozik:
SELECT
  polname AS policy_neve,
  polcmd AS muvelet,
  ARRAY(
    SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)
  ) AS szerepkorok
FROM pg_policy
WHERE polrelid = 'public.access_requests'::regclass
ORDER BY polname;

-- 3.2 — A GRANT-ek megvannak:
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'access_requests'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- ============================================================================
-- KÉSZ. A felhasználó (Szőcs Endre rendszergazda) futtatja a Supabase-en.
-- A futtatás után a publikus regisztrációs űrlap újra működni fog.
-- ============================================================================
