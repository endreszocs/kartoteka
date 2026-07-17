-- ==========================================================================
-- 2026-07-17 — F6 DIAGNOSZTIKA: iratcsomók + csatolmányok állapot-ellenőrzés
-- ==========================================================================
-- CSAK SELECT — semmit NEM módosít. Biztonságosan futtatható bármikor.
--
-- HASZNÁLAT: a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql migráció
--   * ELŐTT: a függőségek megvannak-e, illetve maradt-e részleges állapot
--     egy korábbi (megszakadt) futtatásból;
--   * UTÁN: minden objektum (tábla, oszlop, FK, RLS, policy, grant, bucket,
--     storage-policy) a helyén van-e.
--
-- OLVASAT: ✅ = rendben · ❌ = hiba (kézi beavatkozás kell) ·
--   ℹ️ = még nincs (migráció előtt normális) · ⚠️ = figyelmet igényel.
-- Minden ellenőrzés to_regclass/COALESCE-alapú — hiányzó objektumnál sem
-- dob hibát, hanem ℹ️ sort ad.
-- ==========================================================================

-- ── 1. Függőségek (a migráció futtatása ELŐTT is ✅ kell legyen mind) ──────
SELECT
  '1. függőség: current_user_congregation_id()' AS cel,
  CASE WHEN to_regprocedure('public.current_user_congregation_id()') IS NOT NULL
       THEN '✅ létezik'
       ELSE '❌ HIÁNYZIK — futtasd: 2026-04-12-phase-0-rls-hardening.sql' END AS allapot

UNION ALL
SELECT
  '1. függőség: current_user_has_global_access()',
  CASE WHEN to_regprocedure('public.current_user_has_global_access()') IS NOT NULL
       THEN '✅ létezik'
       ELSE '❌ HIÁNYZIK — futtasd: 2026-04-12-phase-0-rls-hardening.sql' END

UNION ALL
SELECT
  '1. függőség: profile_roles tábla',
  CASE WHEN to_regclass('public.profile_roles') IS NOT NULL
       THEN '✅ létezik'
       ELSE '❌ HIÁNYZIK — futtasd: 2026-04-17-profile-roles-fazis-1' END

UNION ALL
SELECT
  '1. függőség: iktato tábla',
  CASE WHEN to_regclass('public.iktato') IS NOT NULL
       THEN '✅ létezik'
       ELSE '❌ HIÁNYZIK — az iktató-alaptáblák nélkül az F6 nem futtatható' END

UNION ALL
SELECT
  '1. függőség: iktato RLS policy (iktato_access, FOR ALL)',
  CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'iktato'
           AND policyname = 'iktato_access'
       )
       THEN '✅ él — az új csomo_id oszlopot sor-szinten fedi, új policy nem kell'
       ELSE '⚠️ nincs iktato_access nevű policy — nézd meg az iktato RLS-ét kézzel' END

UNION ALL
SELECT
  '1. függőség: default privileges a public sémán',
  CASE WHEN EXISTS (
         SELECT 1
         FROM pg_default_acl d
         JOIN pg_namespace n ON n.oid = d.defaclnamespace
         WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
       )
       THEN '⚠️ VAN (2026-04-23 m0 hotfix) — ezért kötelező a migrációban a REVOKE ALL + explicit grant'
       ELSE 'ℹ️ nincs default-ACL bejegyzés a public sémán' END

-- ── 2. Táblák + oszlop (migráció UTÁN ✅, előtte ℹ️) ───────────────────────
UNION ALL
SELECT
  '2. tábla: iratcsomo',
  CASE WHEN to_regclass('public.iratcsomo') IS NOT NULL
       THEN '✅ létezik' ELSE 'ℹ️ még nincs (a migráció hozza létre)' END

UNION ALL
SELECT
  '2. tábla: iktato_csatolmany',
  CASE WHEN to_regclass('public.iktato_csatolmany') IS NOT NULL
       THEN '✅ létezik' ELSE 'ℹ️ még nincs (a migráció hozza létre)' END

UNION ALL
SELECT
  '2. oszlop: iktato.csomo_id',
  COALESCE(
    (SELECT '✅ ' || data_type || ' / nullable=' || is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'iktato'
       AND column_name = 'csomo_id'),
    'ℹ️ még nincs (a migráció adja hozzá)')

UNION ALL
SELECT
  '2. FK: iktato_csomo_id_fkey (ON DELETE SET NULL)',
  COALESCE(
    (SELECT CASE WHEN pg_get_constraintdef(oid) ILIKE '%SET NULL%'
                 THEN '✅ ' || pg_get_constraintdef(oid)
                 ELSE '❌ ROSSZ DEFINÍCIÓ: ' || pg_get_constraintdef(oid) END
     FROM pg_constraint
     WHERE conname = 'iktato_csomo_id_fkey'),
    'ℹ️ még nincs (a migráció hozza létre)')

UNION ALL
SELECT
  '2. FK: iktato_csatolmany_iktato_id_fkey (ON DELETE CASCADE)',
  COALESCE(
    (SELECT CASE WHEN pg_get_constraintdef(oid) ILIKE '%CASCADE%'
                 THEN '✅ ' || pg_get_constraintdef(oid)
                 ELSE '❌ ROSSZ DEFINÍCIÓ: ' || pg_get_constraintdef(oid) END
     FROM pg_constraint
     WHERE conname = 'iktato_csatolmany_iktato_id_fkey'),
    'ℹ️ még nincs (a migráció hozza létre)')

-- ── 3. RLS + policy-k (migráció UTÁN: iratcsomo 4 policy, csatolmány 3) ───
UNION ALL
SELECT
  '3. RLS: iratcsomo',
  COALESCE(
    (SELECT CASE WHEN relrowsecurity THEN '✅ engedélyezve'
                 ELSE '❌ NINCS ENGEDÉLYEZVE' END
     FROM pg_class WHERE oid = to_regclass('public.iratcsomo')),
    'ℹ️ tábla még nincs')

UNION ALL
SELECT
  '3. RLS: iktato_csatolmany',
  COALESCE(
    (SELECT CASE WHEN relrowsecurity THEN '✅ engedélyezve'
                 ELSE '❌ NINCS ENGEDÉLYEZVE' END
     FROM pg_class WHERE oid = to_regclass('public.iktato_csatolmany')),
    'ℹ️ tábla még nincs')

UNION ALL
SELECT
  '3. policy-k: iratcsomo (várt: SELECT+INSERT+UPDATE+DELETE)',
  COALESCE(
    (SELECT string_agg(policyname || ' [' || cmd || ']', ' · ' ORDER BY policyname)
     FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'iratcsomo'),
    'ℹ️ nincs policy (a migráció még nem futott)')

UNION ALL
SELECT
  '3. policy-k: iktato_csatolmany (várt: SELECT+INSERT+DELETE, UPDATE NINCS)',
  COALESCE(
    (SELECT string_agg(policyname || ' [' || cmd || ']', ' · ' ORDER BY policyname)
     FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'iktato_csatolmany'),
    'ℹ️ nincs policy (a migráció még nem futott)')

-- ── 4. Grantok (várt: iratcsomo SIUD; csatolmány SID, UPDATE NÉLKÜL) ──────
UNION ALL
SELECT
  '4. grantok: iratcsomo / authenticated',
  COALESCE(
    (SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'iratcsomo'
       AND grantee = 'authenticated'),
    'ℹ️ nincs grant (tábla még nincs, vagy a REVOKE után nem lett grant)')

UNION ALL
SELECT
  '4. grantok: iktato_csatolmany / authenticated',
  COALESCE(
    (SELECT CASE WHEN string_agg(privilege_type, ', ') ILIKE '%UPDATE%'
                 THEN '❌ UPDATE grant VAN, pedig szándékosan nem járna: '
                      || string_agg(privilege_type, ', ' ORDER BY privilege_type)
                 ELSE '✅ ' || string_agg(privilege_type, ', ' ORDER BY privilege_type) END
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'iktato_csatolmany'
       AND grantee = 'authenticated'),
    'ℹ️ nincs grant (tábla még nincs, vagy a REVOKE után nem lett grant)')

UNION ALL
SELECT
  '4. grantok: anon a két új táblán (várt: SEMMI)',
  COALESCE(
    (SELECT '⚠️ anon-grant maradt: '
            || string_agg(table_name || '/' || privilege_type, ', ' ORDER BY table_name, privilege_type)
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN ('iratcsomo', 'iktato_csatolmany')
       AND grantee = 'anon'),
    '✅ nincs anon-grant')

-- ── 5. Trigger + indexek ───────────────────────────────────────────────────
UNION ALL
SELECT
  '5. trigger: iratcsomo_updated_at_trigger',
  CASE
    WHEN to_regclass('public.iratcsomo') IS NULL THEN 'ℹ️ tábla még nincs'
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'iratcsomo_updated_at_trigger'
        AND tgrelid = to_regclass('public.iratcsomo')
    ) THEN '✅ él'
    ELSE '❌ HIÁNYZIK' END

UNION ALL
SELECT
  '5. indexek (várt: 4 db)',
  COALESCE(
    (SELECT string_agg(indexname, ' · ' ORDER BY indexname)
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname IN (
         'iratcsomo_congregation_ev_idx',
         'iktato_csomo_id_idx',
         'iktato_csatolmany_iktato_id_idx',
         'iktato_csatolmany_congregation_idx'
       )),
    'ℹ️ még egyik sincs (a migráció hozza létre)')

-- ── 6. Storage: bucket + objektum-policy-k ─────────────────────────────────
UNION ALL
SELECT
  '6. bucket: iktato-csatolmanyok (várt: privát, 10 MB, 4 mime-típus)',
  COALESCE(
    (SELECT CASE WHEN b.public = false
                  AND b.file_size_limit = 10485760
                  AND b.allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp','application/pdf']
                  AND array_length(b.allowed_mime_types, 1) = 4
                 THEN '✅ privát, 10 MB, ' || array_to_string(b.allowed_mime_types, ' + ')
                 ELSE '❌ ELTÉRŐ BEÁLLÍTÁS: public=' || b.public
                      || ', limit=' || COALESCE(b.file_size_limit::text, 'NULL')
                      || ', mime=' || COALESCE(array_to_string(b.allowed_mime_types, '+'), 'NULL') END
     FROM storage.buckets b
     WHERE b.id = 'iktato-csatolmanyok'),
    'ℹ️ még nincs (a migráció hozza létre)')

UNION ALL
SELECT
  '6. storage-policy-k (várt: INSERT+SELECT+DELETE, UPDATE NINCS)',
  COALESCE(
    (SELECT string_agg(policyname || ' [' || cmd || ']', ' · ' ORDER BY policyname)
     FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname LIKE 'iktato_csatolmanyok_%'),
    'ℹ️ nincs policy (a migráció még nem futott)')

-- ── 7. Adat-gyorskép (a migráció után is 0/üres, amíg az app nem használja) ─
UNION ALL
SELECT
  '7. adat: árva objektum-előtag a bucketben (nem uuid első szegmens)',
  COALESCE(
    (SELECT '⚠️ ' || count(*)::text || ' objektum NEM {congregation_id}/... úton'
     FROM storage.objects o
     WHERE o.bucket_id = 'iktato-csatolmanyok'
       -- COALESCE: a gyökérbe (mappa nélkül) feltöltött objektum is szabálytalan
       AND COALESCE((storage.foldername(o.name))[1], '') !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     HAVING count(*) > 0),
    '✅ nincs szabálytalan úton lévő objektum (vagy a bucket üres)')

ORDER BY cel;
