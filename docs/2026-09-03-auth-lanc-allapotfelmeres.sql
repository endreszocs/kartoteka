-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — A HITELESÍTÉSI LÁNC ÁLLAPOTFELMÉRÉSE  (2026-09-03)
-- ════════════════════════════════════════════════════════════════════════════
--
-- MIRE VALÓ: a védelmi felülvizsgálat során 13 kérdés maradt, amit a repóból
-- ELVILEG sem lehet eldönteni — mert a repóbeli migráció nem bizonyíték arra,
-- hogy élesben le is futott. Ez a lekérdezés ezeket egyszerre megválaszolja.
--
-- ⚠️ CSAK OLVAS. Egyetlen sort sem módosít, nem hoz létre és nem töröl semmit.
--    Nincs benne DDL, nincs TEMP tábla, nincs függvényhívás mellékhatással.
--
-- HASZNÁLAT: Supabase → SQL Editor → beilleszt → Run → a TELJES eredményrácsot
--    küldd vissza. (Szándékosan EGYETLEN UNION ALL: az editor csak az utolsó
--    rácsot mutatja, több külön SELECT esetén a korábbi válaszok elvesznének.)
--
-- AMIT EZ NEM TUD MEGMONDANI (ezek a Supabase Dashboard beállításai):
--   · nyílt regisztráció (Authentication → Providers → Email → Enable signups)
--   · refresh-token rotáció és élettartam (Authentication → Sessions)
--   · „Revoke sessions on password change" viselkedés
--   · a bejelentkezési rate limit értékei (Authentication → Rate Limits)
--   · a deployolt edge függvények `verify_jwt` beállítása
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

-- ── 1. A profiles tábla RLS-policy-i ────────────────────────────────────────
-- KÉRDÉS: túlélte-e a 2026-04-13-as `profiles_read_all USING (true)` policy a
-- későbbi szigorítást? A szigorítás csak a `profiles_read` NEVŰ policy-t dobta
-- el — ha a `profiles_read_all` még él, minden bejelentkezett fiók MINDEN
-- profilt lát (a PERMISSIVE policy-k VAGY-kapcsolatban állnak).
SELECT 1 AS sor, 'RLS / profiles' AS terulet,
  'A profiles tábla összes policy-je (név | típus | parancs | szerep | feltétel)' AS kerdes,
  COALESCE(string_agg(
    policyname || ' | ' || permissive || ' | ' || cmd || ' | ' ||
    array_to_string(roles, ',') || ' | ' || COALESCE(qual, '—'),
    E'\n' ORDER BY policyname), '⛔ NINCS EGYETLEN POLICY SEM')::text AS valasz
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'

UNION ALL

-- ── 2. Van-e egyáltalán RLS a profiles / profile_roles / access_requests-en ──
SELECT 2, 'RLS / kulcstáblák',
  'Be van-e kapcsolva az RLS a hitelesítési lánc tábláin?',
  COALESCE(string_agg(
    c.relname || ' → ' || CASE WHEN c.relrowsecurity THEN 'RLS BE' ELSE '⛔ RLS KI' END ||
    CASE WHEN c.relforcerowsecurity THEN ' (FORCE)' ELSE '' END,
    E'\n' ORDER BY c.relname), 'a táblák nem találhatók')::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','profile_roles','access_requests','audit_log',
                    'congregations','szemely','gyerek','csalad','haztartas',
                    'admin_access_requests','user_devices')

UNION ALL

-- ── 3. A regisztrációs trigger: metaadatból tölt-e szerepkört? ──────────────
-- EZ A LEGSÚLYOSABB EGYETLEN KÉRDÉS. Ha a `handle_new_user()` élő változata
-- olvassa a `raw_user_meta_data->>'requested_role'` értéket, akkor a regisztráló
-- SAJÁT MAGA adhatja meg, milyen szerepkörrel jöjjön létre a profilja.
SELECT 3, 'Regisztrációs trigger',
  'A handle_new_user() olvas-e a felhasználó által küldhető metaadatból?',
  COALESCE((
    SELECT CASE
      WHEN p.prosrc ILIKE '%requested_role%'
        THEN '⛔ IGEN — a forrásban szerepel a requested_role. A metaadat-eszkaláció ÉLŐ.'
      WHEN p.prosrc ILIKE '%raw_user_meta_data%'
        THEN '⚠️ Metaadatot olvas, de nem requested_role-t — nézd meg a forrást (lásd 4. sor).'
      ELSE '✅ NEM olvas felhasználói metaadatból szerepkört.'
    END
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'handle_new_user' AND n.nspname = 'public' LIMIT 1
  ), '⚠️ A handle_new_user() függvény NEM LÉTEZIK a public sémában')::text

UNION ALL

-- ── 4. A handle_new_user() teljes forrása ──────────────────────────────────
SELECT 4, 'Regisztrációs trigger',
  'A handle_new_user() teljes forráskódja (hogy lássam, mit tölt honnan)',
  COALESCE((
    SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'handle_new_user' AND n.nspname = 'public' LIMIT 1
  ), '(nincs ilyen függvény)')::text

UNION ALL

-- ── 5. Az auth.users triggerei ─────────────────────────────────────────────
SELECT 5, 'Regisztrációs trigger',
  'Milyen triggerek futnak az auth.users táblán?',
  COALESCE(string_agg(t.tgname || ' → ' || p.proname || '()', E'\n' ORDER BY t.tgname),
           'nincs egyéni trigger az auth.users-en')::text
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal

UNION ALL

-- ── 6. Az admin-kapuk néznek-e `status`-t? ─────────────────────────────────
-- Ha az is_admin() / is_caller_admin_for_user_mgmt() csak a role-t nézi, akkor
-- egy MÉG JÓVÁ NEM HAGYOTT (pending) fiók is adminként viselkedhet a DB felé.
SELECT 6, 'Admin-kapu',
  'A DB-oldali admin-kapuk ellenőrzik-e a profiles.status értékét?',
  COALESCE(string_agg(
    p.proname || ' → ' ||
    CASE WHEN p.prosrc ILIKE '%status%' THEN '✅ néz status-t' ELSE '⛔ NEM néz status-t' END ||
    ' | SECURITY ' || CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
    E'\n' ORDER BY p.proname), 'egyik függvény sem létezik')::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin','is_caller_admin_for_user_mgmt','admin_activate_user',
                    'current_user_has_global_access','current_user_congregation_id',
                    'current_user_can_access_congregation','profil_lathato_e')

UNION ALL

-- ── 7. SECURITY DEFINER függvények PUBLIC vagy anon EXECUTE joggal ─────────
-- A PostgreSQL alapból PUBLIC EXECUTE-ot ad. A `proacl IS NULL` azt jelenti:
-- soha senki nem nyúlt hozzá → PUBLIC hívhatja. A grantee = 0 szintén PUBLIC.
SELECT 7, 'Függvény-jogok',
  'Hány SECURITY DEFINER függvényt hívhat PUBLIC vagy anon? (darabszám)',
  (SELECT COUNT(DISTINCT p.oid)::text || ' db a public sémában'
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
   WHERE n.nspname = 'public' AND p.prosecdef
     AND (p.proacl IS NULL
          OR a.grantee = 0
          OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')))::text

UNION ALL

SELECT 8, 'Függvény-jogok',
  'Melyek ezek? (első 60, ábécésorrendben)',
  COALESCE((SELECT string_agg(x.nev, ', ' ORDER BY x.nev) FROM (
     SELECT DISTINCT p.proname || CASE WHEN p.proacl IS NULL THEN ' (alapértelmezett=PUBLIC)' ELSE ' (explicit)' END AS nev
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
     WHERE n.nspname = 'public' AND p.prosecdef
       AND (p.proacl IS NULL OR a.grantee = 0
            OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon'))
     ORDER BY nev LIMIT 60) x), 'nincs ilyen')::text

UNION ALL

-- ── 9. A titok-széf visszafejtő orákuluma ──────────────────────────────────
SELECT 9, 'Titok-széf',
  'Ki hívhatja a vault_encrypt / vault_decrypt függvényeket?',
  COALESCE(string_agg(
    p.proname || ' → ' ||
    CASE WHEN p.proacl IS NULL THEN '⛔ ALAPÉRTELMEZETT (PUBLIC hívhatja!)'
         ELSE array_to_string(p.proacl::text[], ' ') END,
    E'\n' ORDER BY p.proname), '(nincs ilyen függvény)')::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','vault') AND p.proname IN ('vault_encrypt','vault_decrypt')

UNION ALL

-- ── 10. Storage: publikus tárolók ──────────────────────────────────────────
SELECT 10, 'Storage',
  'Mely tárolók (bucket) publikusak?',
  COALESCE(string_agg(
    id || ' → ' || CASE WHEN public THEN '⛔ PUBLIKUS (link birtokában bárki letölti)'
                        ELSE '✅ privát' END,
    E'\n' ORDER BY id), 'nincs bucket')::text
FROM storage.buckets

UNION ALL

-- ── 11. Storage: az objektum-policy-k ──────────────────────────────────────
-- KÉRDÉS: az avatars / logos írási policy-k néznek-e gyülekezet-hatókört, vagy
-- csak a bucket_id-t? Ha csak azt, minden bejelentkezett fiók felülírhatja bármely
-- gyülekezet tagfotóit, pecsétjét és a lelkészi aláírásképet.
SELECT 11, 'Storage',
  'A storage.objects policy-i (név | parancs | szerep | feltétel)',
  COALESCE(string_agg(
    policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
    COALESCE(qual, with_check, '—'),
    E'\n' ORDER BY policyname), 'nincs policy')::text
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'

UNION ALL

-- ── 12. Az anon szerep tábla-jogai ─────────────────────────────────────────
SELECT 12, 'anon jogok',
  'Milyen táblákra van az anon szerepnek joga, és milyen?',
  COALESCE(string_agg(t.tabla || ' → ' || t.jogok, E'\n' ORDER BY t.tabla), 'nincs anon tábla-jog')::text
FROM (
  SELECT table_name::text AS tabla, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS jogok
  FROM information_schema.role_table_grants
  WHERE grantee = 'anon' AND table_schema = 'public'
  GROUP BY table_name
) t

UNION ALL

-- ── 13. A congregations tábla: teljes sor mindenkinek? ─────────────────────
-- A sorban IBAN, adószám és a naptár-feed token is benne van.
SELECT 13, 'Törzsadat',
  'A congregations tábla policy-i és oszlop-szintű jogai',
  (COALESCE((SELECT string_agg(policyname || ' | ' || cmd || ' | ' || COALESCE(qual,'—'), E'\n' ORDER BY policyname)
             FROM pg_policies WHERE schemaname='public' AND tablename='congregations'), 'nincs policy')
   || E'\n--- oszlop-szintű jogok ---\n'
   || COALESCE((SELECT string_agg(grantee || ':' || column_name || ':' || privilege_type, ', ' ORDER BY column_name)
                FROM information_schema.column_privileges
                WHERE table_schema='public' AND table_name='congregations'
                  AND grantee IN ('anon','authenticated')), 'nincs oszlop-szintű jog'))::text

UNION ALL

-- ── 14. access_requests: nyitva van-e az anon INSERT? ──────────────────────
SELECT 14, 'Hozzáférés-kérés',
  'Az access_requests tábla policy-i (beszúrhat-e anon közvetlenül?)',
  COALESCE(string_agg(
    policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') ||
    ' | USING=' || COALESCE(qual,'—') || ' | CHECK=' || COALESCE(with_check,'—'),
    E'\n' ORDER BY policyname), 'nincs policy')::text
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'access_requests'

UNION ALL

-- ── 15. Létezik-e a 2FA-t DB-szinten kikényszerítő restrictive policy? ─────
SELECT 15, '2FA',
  'Van-e RESTRICTIVE policy, ami aal2-t követel? (a 2026-08-15-mfa-optin-rls.sql terméke)',
  COALESCE((SELECT string_agg(schemaname||'.'||tablename||' → '||policyname, E'\n' ORDER BY tablename)
            FROM pg_policies
            WHERE permissive = 'RESTRICTIVE' AND (qual ILIKE '%aal%' OR with_check ILIKE '%aal%')),
           '⚠️ NINCS aal-alapú restrictive policy — a 2FA-t KIZÁRÓLAG az alkalmazás kényszeríti ki')::text

UNION ALL

-- ── 16. Létezik-e a sitemap RPC? ──────────────────────────────────────────
SELECT 16, 'Publikus oldal',
  'Létezik-e a public_sitemap_entries RPC? (ha nem, a legacy anon-olvasó ág fut élesben)',
  COALESCE((SELECT n.nspname || '.' || p.proname || ' ✅ létezik'
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.proname = 'public_sitemap_entries' LIMIT 1),
           '⚠️ NEM LÉTEZIK — a sitemap.ts a legacy, közvetlen anon tábla-olvasó ágra esik')::text

UNION ALL

-- ── 17. Realtime: mely táblák vannak publikálva? ──────────────────────────
-- Az értesítés-harang egyetlen GLOBÁLIS csatornán figyel postgres_changes-t.
SELECT 17, 'Realtime',
  'Mely táblák vannak a supabase_realtime publikációban?',
  COALESCE((SELECT string_agg(schemaname||'.'||tablename, ', ' ORDER BY tablename)
            FROM pg_publication_tables WHERE pubname = 'supabase_realtime'),
           'nincs publikált tábla (a Realtime postgres_changes nem működik)')::text

UNION ALL

-- ── 18. Melyik public táblán NINCS RLS? ───────────────────────────────────
SELECT 18, 'RLS-lyukak',
  'Mely public sémabeli táblákon NINCS bekapcsolva az RLS?',
  COALESCE((SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
           '✅ minden public táblán be van kapcsolva az RLS')::text

UNION ALL

-- ── 19. Van-e olyan tábla, amin RLS van, de EGYETLEN policy sincs? ────────
-- Ez a némán mindent tiltó (vagy service_role-lal némán mindent engedő) állapot.
SELECT 19, 'RLS-lyukak',
  'Mely táblákon van RLS bekapcsolva, de nincs rajtuk egyetlen policy sem?',
  COALESCE((SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
              AND NOT EXISTS (SELECT 1 FROM pg_policies pp
                              WHERE pp.schemaname = 'public' AND pp.tablename = c.relname)),
           '✅ nincs ilyen tábla')::text

UNION ALL

-- ── 20. Hány felhasználó van, és milyen állapotban? (érzékeny adat nélkül) ─
SELECT 20, 'Fiókok',
  'A fiókok megoszlása szerepkör és állapot szerint (nevek és e-mailek NÉLKÜL)',
  COALESCE((SELECT string_agg(x.sor, E'\n' ORDER BY x.sor) FROM (
     SELECT COALESCE(role,'(nincs role)') || ' / ' || COALESCE(status,'(nincs status)') ||
            ' → ' || COUNT(*)::text || ' fiók' AS sor
     FROM public.profiles GROUP BY role, status) x), 'nincs adat')::text

UNION ALL

-- ── 21. Van-e olyan fiók, ami admin szerepű DE nem aktív? ─────────────────
-- Ez a „status-vak admin-kapu" gyakorlati kockázatát méri: ha van ilyen fiók,
-- akkor a hiányzó status-ellenőrzés nem elméleti.
SELECT 21, 'Fiókok',
  'Van-e admin/kerületi admin szerepű, de NEM aktív fiók? (csak darabszám)',
  (SELECT CASE WHEN COUNT(*) = 0 THEN '✅ nincs ilyen'
               ELSE '⚠️ ' || COUNT(*)::text || ' db — a status-vak admin-kapu gyakorlati kockázat' END
   FROM public.profiles
   WHERE role IN ('admin','egyhazkeruleti_admin','egyhazmegyei_admin')
     AND COALESCE(status,'') <> 'active')::text

) AS eredmeny ORDER BY sor;
