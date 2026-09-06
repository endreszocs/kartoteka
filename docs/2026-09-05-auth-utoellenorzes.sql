-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — A HITELESÍTÉSI LÁNC UTÓELLENŐRZÉSE   (2026-09-05)
-- ════════════════════════════════════════════════════════════════════════════
--
-- MIRE VALÓ: a 2026-09-04-i javítások (1. és 2b. kör) óta a rendszer tovább
-- fejlődött (v0.9.221 → v0.9.230, több PR). Ez a lekérdezés két dolgot mér:
--
--   A) NEM ROMLOTT-E VISSZA semmi. Egy javítás akkor ér valamit, ha egy hét
--      múlva is áll. A `CREATE OR REPLACE` bármikor felülírható egy régebbi
--      migráció újrafuttatásával — ez a fajta csendes visszaesés a projekt
--      rögzített hibaosztálya.
--
--   B) MI MARADT NYITVA, és mekkora a tényleges kitettsége MA. A számok
--      változhattak (új gyülekezet, új fiók, feltöltött tagfotó), és a
--      3. kör tervezése ezekre épül.
--
-- ⚠️ CSAK OLVAS. Nincs benne DDL, nincs UPDATE/INSERT/DELETE, nincs TEMP tábla,
--    nincs zárolás-igény. Néhány ezredmásodperc, élő forgalom mellett is
--    biztonságos (ellentétben a 2026-09-04-i deadlockos szkripttel — az DDL volt).
--
-- HASZNÁLAT: Supabase → SQL Editor → Run → a TELJES rácsot küldd vissza.
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

-- ════════════════════════════════════════════════════════════════════════════
-- A) NEM ROMLOTT-E VISSZA?  — mind a 9 javított kapu újramérése
-- ════════════════════════════════════════════════════════════════════════════

SELECT 1 AS sor, 'A) Visszaesés-őr'::text AS terulet,
  'Mind a 4 jogosultsági kapu nézi-e még a status-t?'::text AS kerdes,
  COALESCE(string_agg(
    p.proname || ' → ' ||
    CASE WHEN p.prosrc ILIKE '%status%' THEN '✅' ELSE '⛔ VISSZAESETT' END,
    E'\n' ORDER BY p.proname), 'egyik függvény sem található')::text AS valasz
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'is_caller_admin_for_user_mgmt',
                    'is_master_admin', 'current_user_has_global_access')

UNION ALL

SELECT 2, 'A) Visszaesés-őr',
  'A regisztrációs trigger olvas-e megint a felhasználói metaadatból?',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
      AND p.prosrc ILIKE '%requested_role%')
  THEN '⛔ VISSZAESETT — a metaadat-eszkaláció újra él'
  ELSE '✅ továbbra is fix lelkesz' END

UNION ALL

SELECT 3, 'A) Visszaesés-őr',
  'Az import_finance_batch a tokenből azonosít-e még?',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='import_finance_batch')
      THEN '⚠️ a függvény nem létezik'
    WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='import_finance_batch'
                   AND p.prosrc ILIKE '%auth.uid()%'
                   AND p.prosrc NOT ILIKE '%pr.profile_id = p_user_id%')
      THEN '✅ auth.uid()-ból dönt'
    ELSE '⛔ VISSZAESETT — megint a kliens p_user_id-jéből dönt'
  END

UNION ALL

SELECT 4, 'A) Visszaesés-őr',
  'Az önaktiválás-tilalom és a védő trigger a helyén van-e?',
  (SELECT
     'admin_activate_user önhivatkozás-tilalom: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='admin_activate_user'
                           AND p.prosrc ILIKE '%p_user_id = auth.uid()%')
            THEN '✅' ELSE '⛔ ELTŰNT' END
   || '  |  profiles_jogosultsag_vedelem_trg: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgrelid = 'public.profiles'::regclass
                           AND NOT tgisinternal
                           AND tgname = 'profiles_jogosultsag_vedelem_trg')
            THEN '✅' ELSE '⛔ ELTŰNT — ez a MÁSODIK védelmi vonal' END)

UNION ALL

SELECT 5, 'A) Visszaesés-őr',
  'Az avatars írási policy-k hatókör-ellenőrzöttek-e még?',
  COALESCE((
    SELECT string_agg(policyname || ' (' || cmd || ') → ' ||
             CASE WHEN COALESCE(qual, with_check, '') LIKE '%foldername%'
                  THEN '✅ hatókörös' ELSE '⛔ CSAK bucket_id' END,
             E'\n' ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND COALESCE(qual, with_check, '') LIKE '%avatars%'
  ), '⛔ NINCS avatars írási policy')

UNION ALL

SELECT 6, 'A) Visszaesés-őr',
  'Kapott-e az anon újra írási jogot bármely public táblára?',
  COALESCE((SELECT string_agg(DISTINCT table_name || ':' || privilege_type, ', ')
            FROM information_schema.role_table_grants
            WHERE grantee = 'anon' AND table_schema = 'public'
              AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')),
           '✅ továbbra sincs anon írási jog')

UNION ALL

SELECT 7, 'A) Visszaesés-őr',
  'Az access_requests policy-i a közös is_admin()-t hívják-e még?',
  COALESCE((SELECT string_agg(policyname || ' (' || cmd || ') → ' ||
                     CASE WHEN COALESCE(qual, with_check, '') LIKE '%is_admin()%'
                          THEN '✅' ELSE '⛔ beégetett feltétel' END,
                     E'\n' ORDER BY policyname)
            FROM pg_policies
            WHERE schemaname='public' AND tablename='access_requests'),
           '⚠️ nincs policy az access_requests-en')

UNION ALL

SELECT 8, 'A) Visszaesés-őr',
  'Hívhatja-e megint az anon a felsoroló orákulumokat?',
  COALESCE((
    SELECT string_agg(DISTINCT p.proname, ', ')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
    WHERE n.nspname = 'public'
      AND p.proname IN ('login_email_status', 'registration_email_info')
      AND (p.proacl IS NULL OR a.grantee = 0
           OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon'))
  ), '✅ továbbra is zárva')

UNION ALL

SELECT 9, 'A) Visszaesés-őr',
  'A függvény-jogok mérlege (a javítás után 79 PUBLIC / 12 anon volt)',
  (SELECT 'PUBLIC-hívható SECURITY DEFINER: ' ||
     (SELECT COUNT(DISTINCT p.oid)::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
      WHERE n.nspname='public' AND p.prosecdef AND (p.proacl IS NULL OR a.grantee=0))
   || '  (volt: 79)  |  anon-hívható: ' ||
     (SELECT COUNT(DISTINCT p.oid)::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN LATERAL aclexplode(p.proacl) a ON true
      WHERE n.nspname='public' AND p.prosecdef
        AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))
   || '  (volt: 12)')

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- B) MI MARADT NYITVA — a 3. kör méretezéséhez
-- ════════════════════════════════════════════════════════════════════════════

SELECT 10, 'B) Nyitott: törzsadat',
  'A congregations SELECT policy-je szűkült-e már? (3. kör fő tétele)',
  COALESCE((SELECT string_agg(policyname || ' (' || cmd || ') → ' || COALESCE(qual, '—'),
                     E'\n' ORDER BY policyname)
            FROM pg_policies
            WHERE schemaname='public' AND tablename='congregations' AND cmd IN ('SELECT','ALL')),
           'nincs SELECT policy')

UNION ALL

SELECT 11, 'B) Nyitott: törzsadat',
  'Mekkora a kitettség MA? (a számok változhattak a felmérés óta)',
  (SELECT 'gyülekezet: ' || COUNT(*)::text
       || '  |  naptár-token: ' || COUNT(*) FILTER (WHERE calendar_feed_token IS NOT NULL)::text
       || '  |  IBAN: ' || COUNT(*) FILTER (WHERE iban IS NOT NULL AND iban <> '')::text
       || '  |  adószám: ' || COUNT(*) FILTER (WHERE adoszam IS NOT NULL AND adoszam <> '')::text
       || '  |  e-mail: ' || COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')::text
       || '  |  pecsét: ' || COUNT(*) FILTER (WHERE pecset_url IS NOT NULL)::text
       || '  |  aláírás: ' || COUNT(*) FILTER (WHERE alairas_url IS NOT NULL)::text
   FROM public.congregations)

UNION ALL

SELECT 12, 'B) Nyitott: fájltár',
  'A publikus bucketek tartalma MA (az avatars üres volt — maradt is?)',
  COALESCE((
    SELECT string_agg(t.sor, E'\n' ORDER BY t.sor)
    FROM (
      SELECT b.id || ' → ' ||
             CASE WHEN b.public THEN 'PUBLIKUS' ELSE 'privát' END || ', ' ||
             COALESCE((SELECT COUNT(*)::text FROM storage.objects o WHERE o.bucket_id = b.id), '0') ||
             ' objektum' AS sor
      FROM storage.buckets b
      WHERE b.public
    ) t
  ), 'nincs publikus bucket')

UNION ALL

SELECT 13, 'B) Nyitott: munkamenet',
  'Van-e már abszolút munkamenet-lejárat? (Dashboard → Authentication → Sessions)',
  COALESCE((
    SELECT 'élő munkamenet: ' || COUNT(*)::text
        || '  |  van not_after korlát: ' || COUNT(*) FILTER (WHERE not_after IS NOT NULL)::text
        || '  |  legrégebbi: ' || COALESCE(MIN(created_at)::date::text, '—')
        || '  |  leghosszabb kor: ' ||
             COALESCE(EXTRACT(day FROM now() - MIN(created_at))::int::text, '—') || ' nap'
        || E'\n→ ' || CASE WHEN COUNT(*) FILTER (WHERE not_after IS NOT NULL) = 0
                           THEN '⛔ NINCS abszolút lejárat — egy ellopott munkamenet korlátlan ideig él'
                           ELSE '✅ van korlát' END
    FROM auth.sessions
  ), 'nem olvasható')

UNION ALL

SELECT 14, 'B) Nyitott: 2FA',
  'Bekapcsolta-e már valaki a kétlépcsős azonosítást?',
  COALESCE((
    SELECT 'ellenőrzött faktor: ' || COUNT(*) FILTER (WHERE status='verified')::text
        || '  |  eltérő fiók: ' || COUNT(DISTINCT user_id) FILTER (WHERE status='verified')::text
        || E'\n→ ' || CASE WHEN COUNT(*) FILTER (WHERE status='verified') = 0
                           THEN '⚠️ SENKINEK nincs — a 15 táblás DB-szintű 2FA-védelem ma senkit nem véd'
                           ELSE '✅ van, akit véd' END
    FROM auth.mfa_factors
  ), 'nem olvasható')

UNION ALL

SELECT 15, 'B) Nyitott: fiókok',
  'Változott-e a fiók-kép? (a státusz-kapu hatóköre)',
  COALESCE((
    SELECT string_agg(t.sor, E'\n' ORDER BY t.sor)
    FROM (SELECT COALESCE(status,'(nincs)') || ' / ' || COALESCE(role,'(nincs)')
                 || ' → ' || COUNT(*)::text || ' fiók' AS sor
          FROM public.profiles GROUP BY status, role) t
  ), 'nincs adat')

UNION ALL

SELECT 16, 'B) Nyitott: fiókok',
  'Van-e olyan NEM aktív fiók, amelyik a státusz-kapu óta próbált dolgozni?',
  COALESCE((
    SELECT string_agg(left(p.email, 3) || '***  ' || COALESCE(p.status,'—') || '/' ||
                      COALESCE(p.role,'—') || '  utolsó: ' || p.last_seen_at::date::text,
                      E'\n' ORDER BY p.last_seen_at DESC)
    FROM public.profiles p
    WHERE COALESCE(p.status,'') <> 'active'
      AND p.last_seen_at > '2026-09-04'::date
  ), '✅ nincs ilyen — a státusz-kapu senkit nem zárt ki tévesen')

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- C) ÚJ FELÜLET: keletkezett-e azóta olyasmi, ami visszahozza a hibaosztályt?
-- ════════════════════════════════════════════════════════════════════════════

SELECT 17, 'C) Új felület',
  'Keletkezett-e ÚJ tábla RLS nélkül, vagy RLS-sel de policy nélkül?',
  (SELECT
     'RLS nélkül: ' ||
       COALESCE((SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),
                '✅ nincs')
   || E'\nRLS-sel, de policy nélkül: ' ||
       COALESCE((SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
                   AND NOT EXISTS (SELECT 1 FROM pg_policies pp
                                   WHERE pp.schemaname='public' AND pp.tablename=c.relname)),
                'nincs'))

UNION ALL

SELECT 18, 'C) Új felület',
  'Van-e ÚJ, nyitott (USING true) SELECT-policy személyes adatot tartalmazó táblán?',
  COALESCE((
    SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND btrim(COALESCE(qual, '')) = 'true'
      AND tablename IN ('szemely','csalad','gyerek','haztartas','profiles','profile_roles',
                        'keresztseg','konfirmalas','hazassag','temetes','befizetes','kiadas',
                        'audit_log','access_requests','user_devices')
  ), '✅ nincs nyitott policy a személyes adatot tartalmazó táblákon')

UNION ALL

SELECT 19, 'C) Új felület',
  'Keletkezett-e ÚJ SECURITY DEFINER függvény search_path rögzítése nélkül?',
  COALESCE((
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%')
  ), '✅ mindegyiken rögzítve van a search_path')

UNION ALL

SELECT 20, 'C) Új felület',
  'A naptár-token forgatás hagy-e nyomot a naplóban? (a 2026-09-04-i új funkció)',
  COALESCE((
    SELECT 'esemény: ' || COUNT(*)::text
        || COALESCE('  |  utolsó: ' || MAX(created_at)::date::text, '')
    FROM public.audit_log
    WHERE action = 'program.naptar_token_forgatas'
  ), 'nincs ilyen naplóbejegyzés (még senki nem használta)')

) AS utoellenorzes ORDER BY sor;
