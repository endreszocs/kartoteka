-- ════════════════════════════════════════════════════════════════════════════
-- HOL TARTUNK A DEADLOCK UTÁN?  (2026-09-04)
-- ════════════════════════════════════════════════════════════════════════════
--
-- A 2. kör (2026-09-04-auth-p0-javitasok-2.sql) deadlockkal megállt:
--   Process A várt AccessExclusiveLock-ra a 16745-ös relation-en,
--   Process B várt AccessShareLock-ra az 53090-esen.
-- A tranzakció visszagördült — de a fájlban KÉT külön tranzakció van, és az
-- első (is_master_admin) LEHET, hogy commitolt. Ezt kell megmérni, mielőtt
-- bármit újrafuttatnék.
--
-- ⚠️ CSAK OLVAS. Nincs benne DDL, nincs zárolás-igény, néhány ezredmásodperc.
--
-- HASZNÁLAT: Supabase → SQL Editor → Run → a rácsot küldd vissza.
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

-- ── 1-2. A deadlockban szereplő két relation AZONOSÍTÁSA ────────────────────
-- Enélkül csak találgatnék arról, mi ütközött mivel. Ha a 16745 egy rendszer-
-- katalógus, az igazolja a feltevésemet (az őrszem katalógus-olvasása ütközött
-- a saját tranzakcióm tábla-zárolásával), és akkor a javítás a szétbontás.
SELECT 1 AS sor, 'Deadlock: 16745 relation'::text AS mit,
  COALESCE((SELECT n.nspname || '.' || c.relname || '  (' || c.relkind::text || ')'
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.oid = 16745), 'nem található (más adatbázisé lehet)')::text AS eredmeny

UNION ALL
SELECT 2, 'Deadlock: 53090 relation',
  COALESCE((SELECT n.nspname || '.' || c.relname || '  (' || c.relkind::text || ')'
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.oid = 53090), 'nem található (más adatbázisé lehet)')

UNION ALL
-- ── 3. Az 1. szakasz (is_master_admin) átment-e? ───────────────────────────
SELECT 3, '2. kör / 1. szakasz: is_master_admin() statusz-kapu',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='is_master_admin')
      THEN '⚠️ a fuggveny nem letezik'
    WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_master_admin'
                   AND p.prosrc ILIKE '%status%')
      THEN '✅ LEFUTOTT — nezi a status-t'
    ELSE '⛔ NEM futott le — meg mindig statusz-vak'
  END

UNION ALL
-- ── 4-6. A 2. szakasz (access_requests) átment-e? ──────────────────────────
SELECT 4, '2. kör / 2. szakasz: anon INSERT GRANT',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee='anon' AND table_schema='public'
      AND table_name='access_requests' AND privilege_type='INSERT')
  THEN '⛔ MEGVAN — a szakasz nem futott le'
  ELSE '✅ visszavonva' END

UNION ALL
SELECT 5, '2. kör / 2. szakasz: access_requests INSERT policy',
  COALESCE((SELECT string_agg(policyname || ' [' || array_to_string(roles,',') || ']', ', ')
            FROM pg_policies WHERE schemaname='public' AND tablename='access_requests' AND cmd='INSERT'),
           '✅ nincs INSERT policy')

UNION ALL
SELECT 6, '2. kör / 2. szakasz: admin-policy-k feltetele',
  COALESCE((SELECT string_agg(policyname || ' → ' || COALESCE(qual,'—'), E'\n' ORDER BY policyname)
            FROM pg_policies
            WHERE schemaname='public' AND tablename='access_requests' AND cmd IN ('SELECT','UPDATE')),
           'nincs ilyen policy')

UNION ALL
-- ── 7. Az 1. KÖR nem sérült-e? (a deadlock nem érinthette, de mérjük) ──────
SELECT 7, '1. kör allapota (valtozatlannak kell lennie)',
  (SELECT
     'handle_new_user: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='handle_new_user'
                           AND p.prosrc ILIKE '%requested_role%')
            THEN '⛔ visszaallt' ELSE '✅' END
   || ' | is_admin: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='is_admin' AND p.prosrc ILIKE '%status%')
            THEN '✅' ELSE '⛔' END
   || ' | import_finance_batch: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='import_finance_batch'
                           AND p.prosrc ILIKE '%auth.uid()%')
            THEN '✅' ELSE '⛔' END
   || ' | avatars policy: ' ||
       COALESCE((SELECT COUNT(*)::text FROM pg_policies
                 WHERE schemaname='storage' AND tablename='objects'
                   AND policyname LIKE 'avatars_scoped_%'), '0') || ' db')

UNION ALL
-- ── 8. Van-e MOST is hosszan futó vagy blokkolt folyamat? ──────────────────
-- Ha igen, az újrafuttatást előbb meg kell várni — különben megint deadlock.
SELECT 8, 'Eppen blokkolt vagy hosszan futo folyamatok',
  COALESCE((
    SELECT string_agg(
      'pid ' || pid::text || ' | ' || state ||
      ' | ' || COALESCE(wait_event_type || ':' || wait_event, 'nem var') ||
      ' | ' || round(EXTRACT(epoch FROM (now() - COALESCE(query_start, backend_start))))::text || ' mp' ||
      ' | ' || left(regexp_replace(COALESCE(query,''), '\s+', ' ', 'g'), 90),
      E'\n')
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state <> 'idle'
  ), '✅ nincs futo vagy varakozo folyamat — biztonsagos az ujrafuttatas')

UNION ALL
-- ── 9. Tábla-forgalom: mennyire "eleven" az access_requests? ───────────────
SELECT 9, 'access_requests forgalma (a zarolasi kockazat merteke)',
  COALESCE((SELECT 'sorok: ' || n_live_tup::text ||
                   ' | utolso autovacuum: ' || COALESCE(last_autovacuum::date::text,'soha') ||
                   ' | seq scan: ' || seq_scan::text
            FROM pg_stat_user_tables
            WHERE schemaname='public' AND relname='access_requests'), 'nincs statisztika')

) AS allapot ORDER BY sor;
