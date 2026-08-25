-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ BIZTONSÁGI ÁLLAPOTFELMÉRÉS — EGYETLEN LEKÉRDEZÉSBEN          2026-08-25 ║
-- ║ Fájl: migration-docs/sql/2026-08-25-biztonsagi-allapotfelmeres-EGYBEN   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EZ A FÁJL SEMMIT NEM MÓDOSÍT. Csak a rendszerkatalógust olvassa.
--    Nincs benne CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/GRANT/REVOKE.
--    Éles üzem közben is futtatható, bárhányszor.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT EZ A VÁLTOZAT
-- ════════════════════════════════════════════════════════════════════════════
-- Az előző (2026-08-24-i) változat 18 KÜLÖN lekérdezés volt. A Supabase
-- SQL-szerkesztője viszont csak az UTOLSÓ eredményét mutatja — ezért abból
-- egyedül a B13/c (triggerek) jött vissza, a többi lefutott, de láthatatlanul.
--
-- Ez a változat EGYETLEN `SELECT`, ami MINDEN találatot egy táblázatban ad
-- vissza, és már ki is mondja az ítéletet.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HOGYAN FUTTASD
-- ════════════════════════════════════════════════════════════════════════════
-- Másold be az EGÉSZET a Supabase SQL editorba, futtasd, és küldd vissza a
-- teljes eredményt. Egy táblázat lesz, kb. 20 sor.
--
-- AZ `itelet` OSZLOP ÉRTÉKEI:
--   ⛔ MEGERŐSÍTVE — a találat élesben igaz, javítandó
--   ✅ RENDBEN     — nem áll fenn (vagy már javítva); NEM nyúlunk hozzá
--   ❓ NÉZD MEG    — se nem a leírt hiba, se nem a helyes állapot; kézi döntés
--
-- ⚠️ A `reszletek` oszlop hosszú lehet. Ha a szerkesztő levágja, elég az
--    `itelet` és a `mit` oszlop — a részleteket csak a bizonytalan soroknál kérem.
-- ════════════════════════════════════════════════════════════════════════════

WITH
-- ── segéd: van-e írási jog egy táblán az authenticated szerepnek ────────────
jog AS (
  SELECT table_name, grantee,
         string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS jogok
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('authenticated', 'anon')
  GROUP BY table_name, grantee
),
-- ── segéd: oszlop-szintű UPDATE-jogok ──────────────────────────────────────
oszlopjog AS (
  SELECT table_name,
         string_agg(DISTINCT column_name, ',' ORDER BY column_name) AS oszlopok
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND grantee = 'authenticated'
    AND privilege_type = 'UPDATE'
  GROUP BY table_name
),
-- ── segéd: nem-belső triggerek ─────────────────────────────────────────────
trig AS (
  SELECT c.relname AS tabla,
         string_agg(t.tgname, ', ' ORDER BY t.tgname) AS triggerek
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
  GROUP BY c.relname
),

-- ══════════════════════════════════════════════════════════════════════════
sorok AS (

-- ── B1: admin_access_requests — hiányzó WITH CHECK ─────────────── MAGAS ──
SELECT 1 AS sorrend, 'B1' AS talalat, 'MAGAS' AS suly,
  'admin_access_requests: van-e WITH CHECK az író policy-n?' AS mit,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public' AND tablename='admin_access_requests')
      THEN '✅ RENDBEN'
    WHEN NOT EXISTS (SELECT 1 FROM jog
                     WHERE table_name='admin_access_requests' AND grantee='authenticated'
                       AND (jogok LIKE '%INSERT%' OR jogok LIKE '%UPDATE%'))
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='admin_access_requests'
                   AND cmd='ALL' AND with_check IS NULL)
      THEN '⛔ MEGERŐSÍTVE'
    ELSE '❓ NÉZD MEG'
  END AS itelet,
  COALESCE((SELECT string_agg(policyname||' ['||cmd||'] with_check='||
                              COALESCE(with_check,'NINCS'), ' | ' ORDER BY policyname)
            FROM pg_policies
            WHERE schemaname='public' AND tablename='admin_access_requests'),
           'nincs policy')
  || '  ||  jogok: '
  || COALESCE((SELECT jogok FROM jog WHERE table_name='admin_access_requests'
                 AND grantee='authenticated'), 'nincs')
  || '  ||  trigger: '
  || COALESCE((SELECT triggerek FROM trig WHERE tabla='admin_access_requests'), 'nincs')
  AS reszletek

UNION ALL
-- ── B2: SECURITY DEFINER RPC-k a fenti táblát fogadják bizonyítéknak MAGAS ─
SELECT 2, 'B2', 'MAGAS',
  'SECURITY DEFINER függvények, amelyek az admin_access_requests-ből olvasnak',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND pg_get_functiondef(p.oid) LIKE '%admin_access_requests%')
  THEN '⛔ MEGERŐSÍTVE' ELSE '✅ RENDBEN' END,
  COALESCE((SELECT string_agg(p.proname ||
              CASE WHEN COALESCE(array_to_string(p.proconfig,','),'') LIKE '%search_path%'
                   THEN '' ELSE ' (search_path NINCS rögzítve!)' END, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.prosecdef
              AND pg_get_functiondef(p.oid) LIKE '%admin_access_requests%'),
           'egy sem')

UNION ALL
-- ── B4: a véglegesítés-zászló közvetlenül visszabillenthető ────── MAGAS ──
SELECT 3, 'B4', 'MAGAS',
  'bealitas: védve vannak-e a *_finalized zászlók?',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM jog WHERE table_name='bealitas'
                       AND grantee='authenticated' AND jogok LIKE '%UPDATE%')
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM oszlopjog WHERE table_name='bealitas')
         AND (SELECT oszlopok FROM oszlopjog WHERE table_name='bealitas')
             NOT LIKE '%finalized%'
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM trig WHERE tabla='bealitas'
                   AND triggerek LIKE '%vedelem%')
      THEN '✅ RENDBEN'
    ELSE '⛔ MEGERŐSÍTVE'
  END,
  'policy: ' || COALESCE((SELECT string_agg(policyname||' ['||cmd||']', ', ' ORDER BY policyname)
                          FROM pg_policies WHERE schemaname='public' AND tablename='bealitas'),
                         'nincs')
  || '  ||  tábla-UPDATE: '
  || COALESCE((SELECT CASE WHEN jogok LIKE '%UPDATE%' THEN 'IGEN' ELSE 'nem' END
               FROM jog WHERE table_name='bealitas' AND grantee='authenticated'), 'nem')
  || '  ||  oszlop-UPDATE: '
  || COALESCE((SELECT oszlopok FROM oszlopjog WHERE table_name='bealitas'), 'nincs (tehát MINDEN oszlop)')
  || '  ||  trigger: '
  || COALESCE((SELECT triggerek FROM trig WHERE tabla='bealitas'), 'nincs')

UNION ALL
-- ── B5+B7: a congregations policy PUBLIC és minden oszlopot kiad ─ KÖZEPES ─
SELECT 4, 'B5+B7', 'KÖZEPES',
  'congregations: anon (bejelentkezés nélkül) olvashatja-e az IBAN-t/adószámot?',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM jog WHERE table_name='congregations' AND grantee='anon')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                       AND tablename='congregations' AND roles::text LIKE '%public%')
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='congregations' AND cmd='SELECT'
                   AND roles::text LIKE '%public%' AND qual IN ('true','(true)'))
      THEN '⛔ MEGERŐSÍTVE (anon is!)'
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='congregations' AND cmd='SELECT' AND qual IN ('true','(true)'))
      THEN '⛔ MEGERŐSÍTVE (bejelentkezettek)'
    ELSE '❓ NÉZD MEG'
  END,
  'policy: ' || COALESCE((SELECT string_agg(policyname||' roles='||roles::text||' using='||
                                            COALESCE(qual,'-'), ' | ' ORDER BY policyname)
                          FROM pg_policies WHERE schemaname='public' AND tablename='congregations'
                            AND cmd IN ('SELECT','ALL')), 'nincs')
  || '  ||  anon jogai: '
  || COALESCE((SELECT jogok FROM jog WHERE table_name='congregations' AND grantee='anon'), 'NINCS')
  || '  ||  authenticated jogai: '
  || COALESCE((SELECT jogok FROM jog WHERE table_name='congregations' AND grantee='authenticated'), 'nincs')

UNION ALL
-- ── B5/c: MELY érzékeny oszlopok léteznek ma? (a javításhoz kell) ──────────
SELECT 5, 'B5/c', 'infó',
  'congregations: mely érzékeny oszlopok léteznek ma?',
  'ℹ️ csak adat',
  COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name='congregations'
              AND column_name IN ('iban','bank','adoszam','tva_kod','email','telefon',
                                  'cim','calendar_feed_token','pecset_url','alairas_url')),
           'egy sem')

UNION ALL
-- ── B6: a logos Storage-policy kerület-vak ─────────────────────── KÖZEPES ─
SELECT 6, 'B6', 'KÖZEPES',
  'logos bucket: a kerületi admin ág hatókörhöz van-e kötve?',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                       AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
                       AND (COALESCE(qual,'')||COALESCE(with_check,'')) LIKE '%egyhazkeruleti_admin%')
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                   AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
                   AND (COALESCE(qual,'')||COALESCE(with_check,'')) LIKE '%egyhazkeruleti_admin%'
                   AND (COALESCE(qual,'')||COALESCE(with_check,''))
                       NOT LIKE '%felettes_szint%')
      THEN '⛔ MEGERŐSÍTVE'
    ELSE '❓ NÉZD MEG'
  END,
  COALESCE((SELECT string_agg(policyname||' ['||cmd||']', ', ' ORDER BY policyname)
            FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
              AND (COALESCE(qual,'')||COALESCE(with_check,'')) LIKE '%logos%'),
           'nincs logos-policy')

UNION ALL
-- ── B8: az országos KÖZÖS számlatükör bárki által átírható ─────── KÖZEPES ─
SELECT 7, 'B8', 'KÖZEPES',
  'befizetescel / kiadascel: bárki átírhatja az országos közös számlatükröt?',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('befizetescel','kiadascel','szamadasicel')
      AND cmd IN ('UPDATE','INSERT','ALL')
      AND (qual IN ('true','(true)') OR with_check IN ('true','(true)')))
  THEN '⛔ MEGERŐSÍTVE' ELSE '✅ RENDBEN' END,
  COALESCE((SELECT string_agg(tablename||'.'||policyname||' ['||cmd||'] using='||
                              COALESCE(qual,'-')||' check='||COALESCE(with_check,'-'),
                              ' | ' ORDER BY tablename, policyname)
            FROM pg_policies WHERE schemaname='public'
              AND tablename IN ('befizetescel','kiadascel','szamadasicel')
              AND cmd IN ('UPDATE','INSERT','ALL')),
           'nincs író policy')

UNION ALL
-- ── B12: a pénzügyi tételek nyers DELETE-tel törölhetők ────────── KÖZEPES ─
SELECT 8, 'B12', 'KÖZEPES',
  'befizetes / kiadas / belsomozgas / oblio_szamlak: van-e nyers DELETE jog?',
  CASE WHEN EXISTS (
    SELECT 1 FROM jog
    WHERE table_name IN ('befizetes','kiadas','belsomozgas','oblio_szamlak')
      AND grantee='authenticated' AND jogok LIKE '%DELETE%')
  THEN '⛔ MEGERŐSÍTVE' ELSE '✅ RENDBEN' END,
  COALESCE((SELECT string_agg(table_name||': '||jogok, ' | ' ORDER BY table_name)
            FROM jog WHERE table_name IN ('befizetes','kiadas','belsomozgas','oblio_szamlak')
              AND grantee='authenticated'), 'nincs jog')
  || '  ||  szűkítő DELETE-policy: '
  || COALESCE((SELECT string_agg(tablename||'.'||policyname, ', ')
               FROM pg_policies WHERE schemaname='public'
                 AND tablename IN ('befizetes','kiadas','belsomozgas','oblio_szamlak')
                 AND permissive='RESTRICTIVE' AND cmd IN ('DELETE','ALL')), 'NINCS')

UNION ALL
-- ── B13: a lelkész oszlop-korlát nélkül írhatja a profile_roles-t ─ ALACSONY ─
SELECT 9, 'B13', 'ALACSONY',
  'profile_roles: oszlop-korlát vagy védő trigger van-e az íráson?',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM jog WHERE table_name='profile_roles'
                       AND grantee='authenticated' AND jogok LIKE '%UPDATE%')
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM oszlopjog WHERE table_name='profile_roles')
      THEN '✅ RENDBEN'
    WHEN EXISTS (SELECT 1 FROM trig WHERE tabla='profile_roles'
                   AND triggerek LIKE '%vedelem%')
      THEN '✅ RENDBEN'
    ELSE '⛔ MEGERŐSÍTVE'
  END,
  'tábla-UPDATE: '
  || COALESCE((SELECT CASE WHEN jogok LIKE '%UPDATE%' THEN 'IGEN' ELSE 'nem' END
               FROM jog WHERE table_name='profile_roles' AND grantee='authenticated'), 'nem')
  || '  ||  oszlop-UPDATE: '
  || COALESCE((SELECT oszlopok FROM oszlopjog WHERE table_name='profile_roles'),
              'nincs (tehát MINDEN oszlop)')
  || '  ||  trigger: '
  || COALESCE((SELECT triggerek FROM trig WHERE tabla='profile_roles'), 'nincs')
  || '  ||  ÖSSZEHASONLÍTÁSUL profiles trigger: '
  || COALESCE((SELECT triggerek FROM trig WHERE tabla='profiles'), 'nincs')

)
SELECT sorrend, talalat, suly, itelet, mit, reszletek
FROM sorok
ORDER BY sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MI TÖRTÉNIK EZUTÁN
-- ════════════════════════════════════════════════════════════════════════════
-- Küldd vissza a teljes táblázatot. Csak azokhoz a találatokhoz írok javító
-- SQL-t, amelyek ⛔ MEGERŐSÍTVE értékkel jönnek vissza — a ✅ RENDBEN sorokhoz
-- hozzá sem nyúlunk (ott a „javítás" kárt okozna: vagy nem létező policy-t
-- módosítana, vagy visszanyitna valamit, amit időközben szigorítottunk).
--
-- A ❓ NÉZD MEG sorokat egyesével átbeszéljük a `reszletek` oszlop alapján.
-- ════════════════════════════════════════════════════════════════════════════
