-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ⛔ EZT A FÁJLT NE FUTTASD ÚJRA — FELÜLÍRT FÜGGVÉNY-TÖRZSET HORDOZ       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Ez a migráció annak idején helyes volt, és a történetet dokumentálja — de
-- azóta biztonsági javítás írta felül az alábbi függvény(ek) törzsét. A
-- `CREATE OR REPLACE` NEM egyirányú: ha ezt a fájlt ma bárki újrafuttatja
-- (új környezet felállításakor, vagy egy másik hibát keresve), NÉMÁN
-- visszaveszi a javítást. Az adatbázis nem tiltakozik, a felület nem
-- változik, és a következő auditig senki nem veszi észre.
--
-- AMI ITT ELAVULT:
--   · is_admin()
--     kanonikus törzs: migration-docs/sql/2026-09-04-auth-p0-javitasok-1.sql
--     ha mégis lefut: a status-kapu eltűnne: pending/deleted profil is admin lenne
--
-- Az őrszem, ami ezt a szabályt őrzi: scripts/selftest-sql-kanonikus-torzs.mjs
-- (a „NE FUTTASD" jelölés adja a felmentést — ezért ne töröld ezt a fejlécet).

-- 2026-04-23 — M0.4: RLS audit + hiányzó policy-k + segédfüggvények
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  CÉL: ellenőrizni, hogy minden `public` schema tábla RLS-védett, és minden
--  policy értelmes. A hiányosságokat itt pótoljuk.
--
--  FIGYELEM: ez egy AUDIT script, ami először RIPORTOL, és csak egy
--  másik tranzakcióban JAVÍT. Ezért a fájl 2 részből áll:
--
--   A) RIPORT (csak SELECT) — ne módosít semmit, mutatja az állapotot
--   B) SEGÉDFÜGGVÉNYEK — is_admin(), same_congregation(), is_owner()
--      Ezek újrafelhasználhatóak minden RLS policy-hoz
--
--  A konkrét hiányos policy-k pótlása minden táblához külön migrációs
--  fájlban (ezentúl minden új tábla RLS-sel jön).
-- ══════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════
-- A) RIPORT — minden public schema tábla RLS státusza
-- ═════════════════════════════════════════════════════════════════════

-- 1. Minden public schema tábla + RLS enabled/disabled + policy-szám
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN '❌ RLS nincs bekapcsolva'
    WHEN (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') = 0 THEN '⚠️ RLS be, de nincs policy (minden blokkolva)'
    ELSE '✅ OK'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'  -- csak normál táblák, nem view/matview
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT IN ('schema_migrations')  -- Supabase belső migrációs tábla
ORDER BY
  CASE
    WHEN NOT c.relrowsecurity THEN 1
    WHEN (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') = 0 THEN 2
    ELSE 3
  END,
  c.relname;

-- 2. Minden policy részletes listája
SELECT
  p.tablename,
  p.policyname,
  p.cmd,
  p.permissive,
  ARRAY(SELECT UNNEST(p.roles)) AS roles,
  LEFT(p.qual::text, 80) AS using_condition,
  LEFT(p.with_check::text, 80) AS check_condition
FROM pg_policies p
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.cmd, p.policyname;

-- 3. Táblák, ahol 'anon' engedélyezett művelet van — ezeket figyelni kell!
SELECT
  p.tablename,
  p.policyname,
  p.cmd,
  LEFT(p.qual::text, 80) AS using_condition
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND 'anon' = ANY(p.roles)
ORDER BY p.tablename, p.cmd;

-- 4. Táblák, amelyeken NEM lett használva a `authenticated` role és nincs spec. role —
--    ezek valószínűleg túl nyitottak vagy túl szűkek
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.tablename = c.relname
      AND p.schemaname = 'public'
      AND 'authenticated' = ANY(p.roles)
  )
ORDER BY c.relname;

-- ═════════════════════════════════════════════════════════════════════
-- B) SEGÉDFÜGGVÉNYEK — RLS policy-khez újrafelhasználható
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- B.1. is_admin() — az aktuális user admin-e?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$func$;

COMMENT ON FUNCTION public.is_admin IS
  'Visszaadja, hogy az aktuálisan bejelentkezett user admin szerepkörű-e. RLS policy-kban használd.';

-- B.2. is_egyhazkeruleti_admin() — egyházkerületi admin vagy fölé?
CREATE OR REPLACE FUNCTION public.is_egyhazkeruleti_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin')
  );
$func$;

-- B.3. same_congregation() — az aktuális user ugyanabba a congregation_id-ba tartozik?
CREATE OR REPLACE FUNCTION public.same_congregation(p_congregation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND congregation_id = p_congregation_id
  );
$func$;

-- B.4. is_user_approved_and_active() — kombinált check: pending nem jut be
CREATE OR REPLACE FUNCTION public.is_current_user_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status IN ('approved', 'active')
  );
$func$;

COMMENT ON FUNCTION public.is_current_user_approved IS
  'Visszaadja, hogy a bejelentkezett user approved/active státuszban van-e. A pending user NEM juthat be a dashboard adatokhoz.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- C) Policy-katalógus-karbantartás szabály
-- ═════════════════════════════════════════════════════════════════════
--
-- Ezentúl minden ÚJ tábla migráció MUSZÁJ tartalmazzon:
--   1. ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
--   2. Legalább egy explicit policy (SELECT, INSERT, UPDATE, DELETE)
--   3. `is_admin()` felhasználás admin-overrides-hoz
--   4. Ha van `congregation_id` → `same_congregation(row.congregation_id)`
--
-- A `migration-docs/rules/rls-policy-catalog.md` külön dokumentumban
-- tartalmaz minden policy-t (ez a dokumentum M0.4 második része).
