-- 2026-04-23 — M0 DIAGNOSZTIKA (csak SELECT, nem módosít)
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  CÉL: megmondja, pontosan mit hozott létre a korábbi M0 migrációk futtatása.
--  Semmit nem módosít — csak riport. Ebből tudjuk, mit kell még lefuttatni.
--
--  Az output 5 blokkból áll:
--   1. M0 TÁBLÁK — melyik létezik, hány policy, sor
--   2. M0 FÜGGVÉNYEK — melyik létezik
--   3. POLICY-RÉSZLETEK — táblánként minden policy
--   4. RLS STÁTUSZ — minden M0 táblán
--   5. PROFILES.STATUS ELOSZLÁS
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. M0 TÁBLÁK ÁLLAPOTA
-- ─────────────────────────────────────────────────────────────────────

SELECT
  '1. TÁBLÁK ÁLLAPOTA' AS szekcio;

SELECT
  tbl AS tabla,
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = tbl
  ) AS tabla_letezik,
  (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
  ) AS policy_count,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=tbl)
    THEN (
      SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl
    )
    ELSE NULL
  END AS rls_enabled
FROM (VALUES
  ('access_requests'),
  ('user_devices'),
  ('licenses'),
  ('audit_log'),
  ('documents'),
  ('document_keys')
) t(tbl)
ORDER BY tbl;

-- ─────────────────────────────────────────────────────────────────────
-- 2. M0 FÜGGVÉNYEK
-- ─────────────────────────────────────────────────────────────────────

SELECT
  '2. FÜGGVÉNYEK ÁLLAPOTA' AS szekcio;

SELECT
  fn AS fuggveny,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn
  ) AS letezik
FROM (VALUES
  ('check_access_request_rate_limit'),
  ('custom_access_token_hook'),
  ('is_user_approved'),
  ('is_admin'),
  ('is_egyhazkeruleti_admin'),
  ('same_congregation'),
  ('is_current_user_approved'),
  ('log_audit_event'),
  ('soft_delete_document'),
  ('tg_access_requests_updated_at'),
  ('tg_documents_updated_at'),
  ('tg_licenses_updated_at')
) t(fn)
ORDER BY fn;

-- ─────────────────────────────────────────────────────────────────────
-- 3. POLICY-RÉSZLETEK — minden M0 tábla minden policy-ja
-- ─────────────────────────────────────────────────────────────────────

SELECT
  '3. POLICY-K RÉSZLETEI' AS szekcio;

SELECT
  tablename,
  policyname,
  cmd AS muvelet,
  LEFT(qual::text, 80) AS using_condition,
  LEFT(with_check::text, 80) AS check_condition
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('access_requests', 'user_devices', 'licenses', 'audit_log', 'documents', 'document_keys')
ORDER BY tablename, cmd, policyname;

-- ─────────────────────────────────────────────────────────────────────
-- 4. INDEXEK az M0 táblákon
-- ─────────────────────────────────────────────────────────────────────

SELECT
  '4. INDEXEK' AS szekcio;

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('access_requests', 'user_devices', 'licenses', 'audit_log', 'documents', 'document_keys', 'profiles')
  AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;

-- ─────────────────────────────────────────────────────────────────────
-- 5. PROFILES.STATUS ELOSZLÁS (csak az M0.3-ig eljutva értelmes)
-- ─────────────────────────────────────────────────────────────────────

SELECT
  '5. PROFILES.STATUS' AS szekcio;

SELECT
  COALESCE(status, 'NULL') AS status,
  COUNT(*) AS user_count
FROM public.profiles
GROUP BY status
ORDER BY user_count DESC;

-- ─────────────────────────────────────────────────────────────────────
-- 6. AUTH HOOK (Supabase Dashboard-ban kell aktiválni — SQL-ből csak létezést ellenőrizhetjük)
-- ─────────────────────────────────────────────────────────────────────

SELECT
  '6. AUTH HOOK FÜGGVÉNY' AS szekcio;

SELECT
  proname AS fv_nev,
  pg_get_function_arguments(oid) AS argumentumok,
  prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'custom_access_token_hook';

-- ─────────────────────────────────────────────────────────────────────
-- ÖSSZEFOGLALÓ
-- ─────────────────────────────────────────────────────────────────────
--
-- Ez a script NEM MÓDOSÍT semmit.
--
-- Az eredmények alapján tudom megmondani, mely migrációk futottak már sikerrel,
-- és melyikek nem — utána készítek célzott JAVÍTÓ SQL-t, ami pontosan csak
-- azt pótolja, amit kell.
-- ─────────────────────────────────────────────────────────────────────
