-- ==========================================================================
-- 2026-07-16 — F5 diagnosztika (CSAK SELECT — nem módosít semmit)
-- ==========================================================================
-- CÉL: az éles DB állapotának ellenőrzése a 2026-07-16-f5-lelkeszi-jelentes.sql
--   futtatása ELŐTT (séma-divergencia kizárása) és UTÁN (eredmény-ellenőrzés).
--   A Supabase SQL Editor csak az utolsó SELECT eredményét mutatja — a
--   blokkokat egyenként futtasd.
-- ==========================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. Van-e CHECK constraint a document_submissions.document_type-on?
--    (A migrációs fájlok és a séma-dump szerint NINCS — ha itt mégis van sor,
--     a migráció DO-blokkja WARNING-ot fog adni, és kézi bővítés kell.)
-- ────────────────────────────────────────────────────────────────────────
SELECT conname,
       pg_get_constraintdef(oid) AS definicio
  FROM pg_constraint
 WHERE conrelid = 'public.document_submissions'::regclass
   AND contype = 'c'
   AND pg_get_constraintdef(oid) ILIKE '%document_type%';
-- Várt eredmény: 0 sor.

-- ────────────────────────────────────────────────────────────────────────
-- 2. Milyen document_type értékek élnek most a document_submissions-ben?
-- ────────────────────────────────────────────────────────────────────────
SELECT document_type, count(*) AS db
  FROM public.document_submissions
 GROUP BY document_type
 ORDER BY document_type;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Létezik-e már a lelkeszi_jelentes tábla? (futtatás ELŐTT: false)
-- ────────────────────────────────────────────────────────────────────────
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'lelkeszi_jelentes'
) AS lelkeszi_jelentes_letezik;

-- ────────────────────────────────────────────────────────────────────────
-- 4. A migráció RLS-függőségei élnek-e? (mindkettőnek léteznie kell)
-- ────────────────────────────────────────────────────────────────────────
SELECT p.proname AS fuggveny,
       '✅ létezik' AS status,
       COALESCE(array_to_string(p.proconfig, '; '), '(nincs proconfig)') AS config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('current_user_congregation_id', 'current_user_has_global_access')
 ORDER BY p.proname;
-- Várt eredmény: 2 sor.

-- ────────────────────────────────────────────────────────────────────────
-- 5. FUTTATÁS UTÁN: oszlopok, constraintek, policy-k, grantok, trigger
--    (ugyanaz, mint a migráció végi verifikáció — külön is lekérdezhető)
-- ────────────────────────────────────────────────────────────────────────
SELECT 'oszlop' AS tipus, column_name AS nev,
       data_type || ' / nullable=' || is_nullable AS reszlet
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'lelkeszi_jelentes'
UNION ALL
SELECT 'constraint', conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.lelkeszi_jelentes'::regclass
UNION ALL
SELECT 'policy', policyname, 'cmd=' || cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'lelkeszi_jelentes'
UNION ALL
SELECT 'grant', grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'lelkeszi_jelentes'
   AND grantee = 'authenticated'
UNION ALL
SELECT 'trigger', tgname, '✅'
  FROM pg_trigger
 WHERE tgrelid = 'public.lelkeszi_jelentes'::regclass
   AND NOT tgisinternal
ORDER BY tipus, nev;
-- Elvárások futtatás UTÁN:
--   * 14 oszlop (id, congregation_id, ev, kezi_adatok, felulirasok, hatarozat,
--     statusz, veglegesitve_at, veglegesito_profile_id, snapshot,
--     unlock_requested, unlock_reason, created_at, updated_at)
--   * 4 policy (select_own, insert_own, update_own, select_diocese) — DELETE NINCS
--   * grant: SELECT, INSERT, UPDATE — DELETE NINCS
--   * 1 trigger: lelkeszi_jelentes_updated_at_trigger
