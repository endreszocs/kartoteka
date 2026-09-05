-- ═══════════════════════════════════════════════════════════════════════════
--  NYILVÁNOS GYÜLEKEZETI OLDAL — ÉLES ÁLLAPOTFELMÉRÉS
--  2026-09-05
--
--  MIÉRT: az audit MINDEN adatbázis-oldali megállapítása migrációs FÁJLON
--  alapul, a fájl viszont nem bizonyítja az éles állapotot (a repó és a
--  produkció némán széthúzhat). Ez a lekérdezés megméri, mi van VALÓBAN.
--
--  CSAK OLVAS. Egyetlen sort sem ír, nem módosít, nem töröl.
--
--  ⚠️ EGYETLEN LEKÉRDEZÉS, EGYETLEN RÁCS. A Supabase SQL-szerkesztő több
--     utasításnál csak az UTOLSÓ eredményrácsot mutatja meg — ezért van
--     minden kérdés egy UNION ALL-ba fűzve. Jelöld ki az EGÉSZET, futtasd,
--     és a teljes táblázatot küldd vissza.
--
--  A hiányzó táblákra/függvényekre a lekérdezés NEM hasal el: a
--  to_regclass/to_regprocedure őr miatt „NEM LÉTEZIK" választ ad.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT * FROM (

-- ─────────────────────────────────────────────────────────────────────────
-- A) A LEGSÜRGŐSEBB KÉRDÉS: az avatars vödör
-- ─────────────────────────────────────────────────────────────────────────
SELECT 1 AS sor, 'A) avatars' AS terulet,
  'Publikus-e a vödör, és van-e MIME/méret korlátja?' AS kerdes,
  COALESCE((
    SELECT 'public=' || b.public::text
        || ' | méretkorlát=' || COALESCE(b.file_size_limit::text,'NINCS')
        || ' | engedett MIME=' || COALESCE(array_to_string(b.allowed_mime_types,','),'NINCS (bármi)')
    FROM storage.buckets b WHERE b.id = 'avatars'
  ), '⚠️ NINCS ilyen vödör') AS valasz

UNION ALL
SELECT 2, 'A) avatars',
  'HÁNY tagfotó van benne? (ez dönti el, elméleti vagy valós a szivárgás)',
  COALESCE((
    SELECT count(*)::text || ' objektum | '
        || count(DISTINCT (storage.foldername(o.name))[1])::text || ' gyülekezet-mappa'
        || CASE WHEN count(*) = 0
                THEN '  → ÜRES, a szivárgás ma ELMÉLETI'
                ELSE '  → ⚠️ VAN BENNE ADAT, a szivárgás VALÓS' END
    FROM storage.objects o WHERE o.bucket_id = 'avatars'
  ), 'nem mérhető')

UNION ALL
SELECT 3, 'A) avatars',
  'Az olvasási policy melyik szerepre szól? (TO nélkül = PUBLIC = anon is)',
  COALESCE((
    SELECT string_agg(p.policyname || ' [' || p.cmd || '] → ' ||
             CASE WHEN p.roles::text IN ('{public}','{0}') THEN '⚠️ PUBLIC (anon is!)'
                  ELSE p.roles::text END, E'\n')
    FROM pg_policies p
    WHERE p.schemaname='storage' AND p.tablename='objects'
      AND p.policyname ILIKE 'avatars%'
  ), '⚠️ NINCS avatars policy')

-- ─────────────────────────────────────────────────────────────────────────
-- B) A TÖBBI VÖDÖR
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 4, 'B) vödrök',
  'Melyik vödör publikus, és mennyi van benne?',
  COALESCE((
    SELECT string_agg(
             b.id || ': public=' || b.public::text
             || ' | ' || COALESCE((SELECT count(*)::text FROM storage.objects o WHERE o.bucket_id=b.id),'?') || ' db',
             E'\n' ORDER BY b.id)
    FROM storage.buckets b
  ), 'nincs vödör')

UNION ALL
SELECT 5, 'B) vödrök',
  'A publikus oldal vödrein van-e hatókör nélküli anon SELECT (listázás)?',
  COALESCE((
    SELECT string_agg(p.policyname || ' [' || p.cmd || '] roles=' || p.roles::text
             || ' | USING: ' || COALESCE(left(p.qual, 120),'—'), E'\n')
    FROM pg_policies p
    WHERE p.schemaname='storage' AND p.tablename='objects'
      AND (p.policyname LIKE 'public_site_media%' OR p.policyname LIKE 'public_magazin%')
  ), 'nincs ilyen policy')

UNION ALL
SELECT 6, 'B) vödrök',
  'Árva hero/címer fájlok: ahol 1-nél több van, ott a régiek bent maradtak',
  COALESCE((
    SELECT string_agg(t.gy || ' → ' || t.db::text || ' db', E'\n')
    FROM (
      SELECT (storage.foldername(o.name))[1] AS gy, count(*) AS db
      FROM storage.objects o
      WHERE o.bucket_id='public-site-media'
        AND (o.name LIKE '%/hero/%' OR o.name LIKE '%/crest/%')
      GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 20
    ) t
  ), 'nincs árva fájl (vagy üres a vödör)')

-- ─────────────────────────────────────────────────────────────────────────
-- C) FÜGGVÉNYJOGOK — a deny-by-default hiánya
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 7, 'C) függvényjogok',
  'HÁNY SECURITY DEFINER függvényt hívhat a PUBLIC vagy az anon?',
  (SELECT count(*)::text || ' db'
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                     WHERE a.grantee = 0 AND a.privilege_type='EXECUTE')))

UNION ALL
SELECT 8, 'C) függvényjogok',
  'Melyek ezek? (első 60, névsorban — ezt kell átnézni allowlist előtt)',
  COALESCE((
    SELECT string_agg(t.nev, E'\n')
    FROM (
      SELECT DISTINCT p.proname AS nev
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR p.proacl IS NULL
             OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                        WHERE a.grantee = 0 AND a.privilege_type='EXECUTE'))
      ORDER BY 1 LIMIT 60
    ) t
  ), 'nincs ilyen')

-- ─────────────────────────────────────────────────────────────────────────
-- D) NAPTÁR-FEED — a lelkigondozói jegyzet
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 9, 'D) naptár',
  'A public_calendar_feed szűr-e a publikus jelzőre, és kiadja-e a megjegyzést?',
  COALESCE((
    SELECT 'publikus-szűrő: ' || CASE WHEN pg_get_functiondef(p.oid) ILIKE '%publikus%' THEN 'VAN' ELSE '⚠️ NINCS' END
        || ' | megjegyzés kimegy: ' || CASE WHEN pg_get_functiondef(p.oid) ILIKE '%megjegyzes%' THEN '⚠️ IGEN' ELSE 'nem' END
        || ' | anon hívhatja: ' || CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN '⚠️ IGEN' ELSE 'nem' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1
  ), 'a függvény NEM LÉTEZIK')

UNION ALL
SELECT 10, 'D) naptár',
  'A congregations policy kiadja-e MINDENKINEK a naptár-tokent? (USING true)',
  COALESCE((
    SELECT string_agg(p.policyname || ' [' || p.cmd || '] roles=' || p.roles::text
             || ' | USING: ' || COALESCE(left(p.qual,80),'—')
             || CASE WHEN p.cmd='SELECT' AND COALESCE(p.qual,'true') = 'true'
                     THEN '  ⚠️ MINDENKI MINDEN SORT LÁT' ELSE '' END, E'\n')
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='congregations' AND p.cmd='SELECT'
  ), 'nincs SELECT policy a congregations táblán')

UNION ALL
SELECT 11, 'D) naptár',
  'Hány gyülekezetnek van naptár-tokenje? (mindegyik = mindegyik feed elérhető)',
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema='public' AND c.table_name='congregations'
                          AND c.column_name='calendar_feed_token')
       THEN 'a calendar_feed_token oszlop NEM LÉTEZIK'
       ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
         $q$ SELECT count(*) FILTER (WHERE calendar_feed_token IS NOT NULL)::text
                 || ' / ' || count(*)::text || ' gyülekezetnek van tokenje' AS c
             FROM public.congregations $q$, false, true, '')))[1]::text
       , 'nem mérhető') END

UNION ALL
SELECT 12, 'D) naptár',
  'Lelkészi naptár-token AKTÍV SZEREPKÖR NÉLKÜLI fióknál (= él a visszavonás után)',
  CASE WHEN to_regclass('public.lelkeszi_naptar_token') IS NULL
       THEN 'a tábla NEM LÉTEZIK élesben'
       WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema='public' AND c.table_name='profile_roles'
                          AND c.column_name='active')
         OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema='public' AND c.table_name='profiles'
                          AND c.column_name='status')
       THEN 'a profile_roles.active / profiles.status oszlop hiányzik — kihagyva'
       ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
         $q$ SELECT count(*) AS c
             FROM public.lelkeszi_naptar_token t
             JOIN public.profiles pr ON pr.id = t.user_id
             WHERE NOT EXISTS (
               SELECT 1 FROM public.profile_roles r
               WHERE r.profile_id = t.user_id AND r.scope='congregation'
                 AND r.approval_status='approved' AND r.active)
                OR pr.status <> 'active' $q$,
         false, true, '')))[1]::text || ' db ilyen token'
       , 'nem mérhető') END

-- ─────────────────────────────────────────────────────────────────────────
-- E) MELYIK BETÖLTŐ-ÁG FUT ÉLESBEN
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 13, 'E) betöltő',
  'Léteznek-e a kontextus-RPC-k? (ha nem, a gyenge 3. ág fut)',
  -- Névre keresünk, NEM pontos szignatúrára: a to_regprocedure(…(text)) hamisan
  -- „nem létezik"-et adna, ha a paraméter varchar. A tényleges szignatúrát is kiírjuk.
  (SELECT string_agg(x.nev || ': ' || COALESCE((
            SELECT string_agg('létezik(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = x.nev
          ), '⚠️ NEM LÉTEZIK'), E'\n' ORDER BY x.nev)
   FROM (VALUES
     ('public_site_context_v2'),
     ('public_site_context'),
     ('public_sitemap_entries'),
     ('public_site_stats')
   ) AS x(nev))

UNION ALL
SELECT 14, 'E) betöltő',
  'Széthúzott gyülekezetek: az oldal ÉL, de a tartalom-kapuk zárva',
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema='public' AND c.table_name='congregations'
                          AND c.column_name='public_site_enabled')
       THEN 'a public_site_enabled oszlop NEM LÉTEZIK'
       ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
         $q$ SELECT count(*)::text || ' gyülekezetnél '
                 || CASE WHEN count(*)=0 THEN '(rendben)' ELSE 'FELIG ELO OLDAL' END AS c
             FROM public.public_sites ps
             JOIN public.congregations c ON c.id = ps.congregation_id
             WHERE ps.is_published = true
               AND (c.public_site_enabled IS DISTINCT FROM true OR c.status <> 'active') $q$,
         false, true, '')))[1]::text
       , 'nem mérhető') END

UNION ALL
SELECT 15, 'E) betöltő',
  'Hány publikált nyilvános oldal van egyáltalán, és hány indexelhető?',
  COALESCE((
    SELECT count(*) FILTER (WHERE ps.is_published)::text || ' publikált | '
        || count(*) FILTER (WHERE ps.is_published AND ps.robots_index)::text || ' indexelhető | '
        || count(*)::text || ' összes sor'
    FROM public.public_sites ps
  ), 'nem mérhető')

-- ─────────────────────────────────────────────────────────────────────────
-- F) ANON TÁBLA-JOGOK a publikus táblákon
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 16, 'F) anon jogok',
  'Mely oszlopokra van anon SELECT a publikus táblákon? (tábla-szintű = mind)',
  COALESCE((
    SELECT string_agg(t.sor, E'\n')
    FROM (
      SELECT g.table_name || ': ' || string_agg(DISTINCT g.privilege_type, ',') AS sor
      FROM information_schema.role_table_grants g
      WHERE g.grantee='anon' AND g.table_schema='public'
        AND g.table_name IN ('public_sites','public_posts','public_magazines',
                             'public_magazine_issues','congregations','szemely')
      GROUP BY g.table_name ORDER BY 1
    ) t
  ), 'nincs anon tábla-jog ezeken')

UNION ALL
SELECT 17, 'F) anon jogok',
  'A public_posts anon policy köti-e a bejegyzést a PUBLIKÁLT oldalhoz?',
  COALESCE((
    SELECT string_agg(p.policyname || ' → ' || COALESCE(left(p.qual,150),'—')
             || CASE WHEN COALESCE(p.qual,'') NOT ILIKE '%public_sites%'
                     THEN '  ⚠️ nem nézi a szülő oldalt' ELSE '' END, E'\n')
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='public_posts'
      AND p.cmd='SELECT' AND p.roles::text ILIKE '%anon%'
  ), 'nincs anon SELECT policy a public_posts táblán')

UNION ALL
SELECT 18, 'F) anon jogok',
  'A publikus táblák ÍRÁSI policy-ja a tág vagy a szűk kapun áll?',
  COALESCE((
    SELECT string_agg(p.tablename || '.' || p.cmd || ' → ' ||
             CASE WHEN COALESCE(p.with_check, p.qual,'') ILIKE '%can_access_congregation%'
                  THEN '⚠️ TÁG (can_access)'
                  WHEN COALESCE(p.with_check, p.qual,'') ILIKE '%can_edit%' THEN 'szűk (can_edit)'
                  ELSE left(COALESCE(p.with_check,p.qual,'—'),60) END, E'\n')
    FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.tablename IN ('public_sites','public_posts','public_magazines','public_magazine_issues')
      AND p.cmd IN ('INSERT','UPDATE','DELETE')
  ), 'nincs írási policy')

-- ─────────────────────────────────────────────────────────────────────────
-- G) STATISZTIKA / k-anonimitás
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 19, 'G) statisztika',
  'Van-e k-anonimitási küszöb a korfában? (a törzsben keresünk küszöb-mintát)',
  COALESCE((
    SELECT CASE WHEN pg_get_functiondef(p.oid) ~* '(>=\s*5|< 5|k_min|kuszob|küszöb)'
                THEN 'a törzsben VAN küszöb-minta'
                ELSE '⚠️ NINCS küszöb-minta a törzsben' END
        || ' | anon hívhatja: ' || CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN 'igen' ELSE 'nem' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='public_site_stats' LIMIT 1
  ), 'a public_site_stats NEM LÉTEZIK')

-- ─────────────────────────────────────────────────────────────────────────
-- H) MENTÉS-BESOROLÁS — a napi mentés fail-closed megáll besorolatlan táblán
-- ─────────────────────────────────────────────────────────────────────────
UNION ALL
SELECT 20, 'H) mentés',
  'Van-e besorolatlan élő tábla? (a 2. ütem ÚJ tábláihoz kötelező lesz)',
  CASE WHEN to_regclass('public.backup_table_policy') IS NULL
       THEN 'a backup_table_policy NEM LÉTEZIK'
       WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema='public' AND c.table_name='backup_table_policy'
                          AND c.column_name='tabla')
       THEN 'a backup_table_policy oszlopneve eltér — kihagyva'
       ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
         $q$ SELECT count(*) AS c
             FROM information_schema.tables t
             WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
               AND NOT EXISTS (SELECT 1 FROM public.backup_table_policy b
                               WHERE b.tabla = t.table_name) $q$,
         false, true, '')))[1]::text || ' besorolatlan tábla'
       , 'nem mérhető') END

) q ORDER BY sor;
