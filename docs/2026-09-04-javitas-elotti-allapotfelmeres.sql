-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — JAVÍTÁS ELŐTTI ÁLLAPOTFELMÉRÉS  (2026-09-04)
-- ════════════════════════════════════════════════════════════════════════════
--
-- MIRE VALÓ: a 2026-09-03-i felülvizsgálat P0/P1 javításait készíti elő.
-- Minden blokk egy KONKRÉT javítási döntést old fel — nem általános felmérés.
-- Ahol a javítás kockázata attól függ, kit érint, ott ez méri meg, kit érint.
--
-- ⚠️ CSAK OLVAS. Nincs benne DDL, nincs UPDATE/INSERT/DELETE, nincs TEMP tábla.
--    Egyetlen UNION ALL — az SQL editor csak az utolsó rácsot mutatná.
--
-- HASZNÁLAT: Supabase → SQL Editor → Run → a TELJES rácsot küldd vissza.
--
-- ⚠️ SZEMÉLYES ADAT: a 2. és 3. blokk e-mail-címet ad vissza, mert a kármentés
--    nem végezhető el nélküle. Ha nem akarod kiadni, cseréld a `u.email`-t
--    `left(u.email,3) || '***'`-ra — a döntéshez a darabszám is elég.
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

-- ════════════════════════════════════════════════════════════════════════════
-- A) A STÁTUSZ-KAPU HATÁSA  (P0·2 — getEffectiveAccessContext)
--    A javítás: a származtatott jogok (admin/esperes/könyvelő/számvevő) csak
--    `status='active'` mellett élnek. Kérdés: kit zárna ki, aki MA dolgozik?
-- ════════════════════════════════════════════════════════════════════════════

SELECT 1 AS sor, 'A) Státusz-kapu' AS terulet,
  'Minden fiók státusz × szerep szerint, utolsó aktivitással (kit érintene a kapu?)' AS kerdes,
  COALESCE(string_agg(x.sor_szoveg, E'\n' ORDER BY x.rendez, x.sor_szoveg), 'nincs profil')::text AS valasz
FROM (
  SELECT
    CASE WHEN p.status = 'active' THEN 2 ELSE 1 END AS rendez,
    COALESCE(p.status,'(nincs)') || ' / ' || COALESCE(p.role,'(nincs)') ||
    ' → ' || COUNT(*)::text || ' fiók' ||
    ' | utolsó aktivitás: ' ||
      COALESCE(MAX(p.last_seen_at)::date::text, 'soha') ||
    CASE WHEN p.status <> 'active' AND p.role IN
              ('admin','egyhazkeruleti_admin','egyhazmegyei_admin','esperes',
               'konyvelo','egyhazmegyei_szamvevo','egyhazkeruleti_szamvevo')
         THEN '  ⛔ EMELT SZEREP NEM AKTÍV FIÓKON'
         ELSE '' END AS sor_szoveg
  FROM public.profiles p
  GROUP BY p.status, p.role
) x

UNION ALL

SELECT 2, 'A) Státusz-kapu',
  'Van-e olyan NEM aktív fiók, amelyik az elmúlt 30 napban használta a rendszert? (ezeket zárná ki a javítás)',
  COALESCE((
    SELECT string_agg(p.email || ' | ' || COALESCE(p.status,'(nincs)') || ' / ' ||
                      COALESCE(p.role,'(nincs)') || ' | ' || p.last_seen_at::date::text,
                      E'\n' ORDER BY p.last_seen_at DESC)
    FROM public.profiles p
    WHERE COALESCE(p.status,'') <> 'active'
      AND p.last_seen_at > now() - interval '30 days'
  ), '✅ nincs ilyen — a státusz-kapu senkit nem zár ki, aki ma dolgozik')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- B) A METAADAT-KÁRMENTÉS MÉRETE  (P0·1 — handle_new_user)
--    A javítás után a triggerbe fix 'lelkesz' kerül. Kérdés: keletkezett-e
--    valaha profil metaadatból kapott szerepkörrel, amit vissza kell venni?
-- ════════════════════════════════════════════════════════════════════════════

SELECT 3, 'B) Metaadat-kármentés',
  'Van-e auth.users sor, amelynek a metaadatában szerepel requested_role?',
  COALESCE((
    SELECT string_agg(
      u.email || ' | kért: ' || COALESCE(u.raw_user_meta_data->>'requested_role','—') ||
      ' | profiles.role: ' || COALESCE(p.role,'(nincs profil)') ||
      ' | status: ' || COALESCE(p.status,'—') ||
      ' | létrejött: ' || u.created_at::date::text ||
      CASE WHEN EXISTS (SELECT 1 FROM public.access_requests ar
                        WHERE ar.resulting_user_id = u.id)
           THEN ' | ✅ van hozzá access_requests sor'
           ELSE '  ⛔ NINCS hozzá access_requests sor — NEM a hivatalos úton jött' END,
      E'\n' ORDER BY u.created_at DESC)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.raw_user_meta_data ? 'requested_role'
  ), '✅ egyetlen fiók sem hordoz requested_role metaadatot — nincs mit visszavenni')::text

UNION ALL

SELECT 4, 'B) Metaadat-kármentés',
  'Van-e olyan profil, amelyhez NEM tartozik access_requests sor? (nem a hivatalos úton keletkezett fiókok)',
  COALESCE((
    SELECT string_agg(u.email || ' | ' || COALESCE(p.role,'—') || '/' || COALESCE(p.status,'—') ||
                      ' | ' || u.created_at::date::text ||
                      ' | belépési mód: ' || COALESCE(u.raw_app_meta_data->>'provider','?'),
                      E'\n' ORDER BY u.created_at)
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE NOT EXISTS (SELECT 1 FROM public.access_requests ar WHERE ar.resulting_user_id = u.id)
  ), 'minden profilhoz tartozik hozzáférés-kérelem')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- C) A CSERÉLENDŐ FÜGGVÉNYEK PONTOS FORRÁSA
--    Nem írok javítást olyan függvényre, aminek az ÉLŐ törzsét nem láttam.
-- ════════════════════════════════════════════════════════════════════════════

SELECT 5, 'C) Függvény-forrás',
  'is_admin() élő törzse',
  COALESCE((SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='is_admin' LIMIT 1),'(nincs ilyen)')::text

UNION ALL

SELECT 6, 'C) Függvény-forrás',
  'is_caller_admin_for_user_mgmt() élő törzse',
  COALESCE((SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='is_caller_admin_for_user_mgmt' LIMIT 1),'(nincs ilyen)')::text

UNION ALL

SELECT 7, 'C) Függvény-forrás',
  'import_finance_batch() élő törzse és paraméterlistája (P0·12 — a kliens p_user_id-je)',
  COALESCE((SELECT pg_get_function_identity_arguments(p.oid) || E'\n─────\n' || p.prosrc
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='import_finance_batch' LIMIT 1),'(nincs ilyen)')::text

UNION ALL

SELECT 8, 'C) Függvény-forrás',
  'A többi p_user_id paraméteres függvény (ugyanez a hibaosztály máshol is?)',
  COALESCE((
    SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ||
                      CASE WHEN p.prosrc ILIKE '%auth.uid()%' THEN '  ✅ hivatkozik auth.uid()-ra'
                           ELSE '  ⛔ NEM hivatkozik auth.uid()-ra' END,
                      E'\n' ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_user_id%'
  ), 'nincs ilyen függvény')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- D) FÜGGVÉNY-JOGOK: MELYIK anon ÉS MELYIK PUBLIC?
--    A 108-as szám nem elég a javításhoz: az anon-hívható a sürgős.
-- ════════════════════════════════════════════════════════════════════════════

SELECT 9, 'D) Függvény-jogok',
  'SECURITY DEFINER függvények KIFEJEZETT anon EXECUTE joggal (ezek a sürgősek)',
  COALESCE((
    SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN LATERAL aclexplode(p.proacl) a ON true
    WHERE n.nspname='public' AND p.prosecdef
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname='anon')
  ), '✅ egyetlen SECURITY DEFINER függvényt sem hívhat közvetlenül az anon')::text

UNION ALL

SELECT 10, 'D) Függvény-jogok',
  'SECURITY DEFINER függvények PUBLIC EXECUTE joggal (grantee=0 vagy alapértelmezett ACL)',
  (SELECT COUNT(DISTINCT p.oid)::text || ' db — ebből ' ||
          COUNT(DISTINCT p.oid) FILTER (WHERE p.proacl IS NULL)::text ||
          ' azért, mert soha nem nyúltak a jogaihoz (alapértelmezett = PUBLIC)'
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
   WHERE n.nspname='public' AND p.prosecdef
     AND (p.proacl IS NULL OR a.grantee = 0))::text

UNION ALL

SELECT 11, 'D) Függvény-jogok',
  'A registration_email_info() jogai (felsoroló végpont — szándékos volt?)',
  COALESCE((SELECT p.proname || ' → ' ||
                   CASE WHEN p.proacl IS NULL THEN 'ALAPÉRTELMEZETT (PUBLIC hívhatja)'
                        ELSE array_to_string(p.proacl::text[],' ') END
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='registration_email_info' LIMIT 1),
           '(nincs ilyen függvény)')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- E) A FÁJLTÁR ÁTÁLLÍTÁSÁNAK HATÁSA  (P0·6-7)
--    Az avatars/logos bucket priváttá tétele minden meglévő URL-t elront.
--    Kérdés: mekkora a készlet, és mi hivatkozik rá?
-- ════════════════════════════════════════════════════════════════════════════

SELECT 12, 'E) Fájltár',
  'Publikus bucketek tartalma: hány objektum, mekkora, mikori (az átállítás hatóköre)',
  COALESCE((
    SELECT string_agg(t.sor, E'\n' ORDER BY t.sor)
    FROM (
      SELECT o.bucket_id || ' → ' || COUNT(*)::text || ' objektum' ||
             ' | első: ' || MIN(o.created_at)::date::text ||
             ' | utolsó: ' || MAX(o.created_at)::date::text ||
             ' | eltérő gyökér-mappa: ' ||
             COUNT(DISTINCT (storage.foldername(o.name))[1])::text AS sor
      FROM storage.objects o
      WHERE o.bucket_id IN ('avatars','logos','misszios-muhely',
                            'dioceses-logos','districts-logos',
                            'public-magazines','public-site-media','updater')
      GROUP BY o.bucket_id
    ) t
  ), 'nincs objektum a publikus bucketekben')::text

UNION ALL

SELECT 13, 'E) Fájltár',
  'A logos bucketben vannak-e PECSÉT és ALÁÍRÁS képek? (ezek a legérzékenyebbek)',
  COALESCE((
    SELECT string_agg(t.sor, E'\n')
    FROM (
      SELECT 'pecset_url kitöltve: ' ||
             COUNT(*) FILTER (WHERE c.pecset_url IS NOT NULL)::text || ' gyülekezet | ' ||
             'alairas_url kitöltve: ' ||
             COUNT(*) FILTER (WHERE c.alairas_url IS NOT NULL)::text || ' gyülekezet | ' ||
             'összes gyülekezet: ' || COUNT(*)::text AS sor
      FROM public.congregations c
    ) t
  ), 'nincs adat')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- F) A TÖRZSADAT-SZŰKÍTÉS HATÁSA  (P0·8 — congregations_select USING(true))
-- ════════════════════════════════════════════════════════════════════════════

SELECT 14, 'F) Törzsadat',
  'Hány gyülekezetnek van naptár-tokenje, IBAN-ja és adószáma? (mi szivárog ma)',
  (SELECT 'összes gyülekezet: ' || COUNT(*)::text ||
          ' | naptár-token: ' || COUNT(*) FILTER (WHERE calendar_feed_token IS NOT NULL)::text ||
          ' | IBAN: ' || COUNT(*) FILTER (WHERE iban IS NOT NULL AND iban <> '')::text ||
          ' | adószám: ' || COUNT(*) FILTER (WHERE adoszam IS NOT NULL AND adoszam <> '')::text
   FROM public.congregations)::text

UNION ALL

SELECT 15, 'F) Törzsadat',
  'Az anon-írható törzsadat-táblákon van-e olyan policy, ami az anon-nak TÉNYLEG enged írni?',
  COALESCE((
    SELECT string_agg(pp.tablename || '.' || pp.policyname || ' | ' || pp.cmd ||
                      ' | szerepek: ' || array_to_string(pp.roles,',') ||
                      ' | CHECK=' || COALESCE(pp.with_check,'—'),
                      E'\n' ORDER BY pp.tablename, pp.policyname)
    FROM pg_policies pp
    WHERE pp.schemaname='public'
      AND pp.tablename IN ('befizetescel','csoport','kiadascel','nevnap','nom_cimlet','szamadasicel')
      AND pp.cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND ('anon' = ANY(pp.roles) OR 'public' = ANY(pp.roles))
  ), '✅ egyetlen írási policy sem engedi az anon-t — a GRANT önmagában hatástalan (de fölösleges)')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- G) MUNKAMENET-BEÁLLÍTÁSOK, AMIK MÉGIS OLVASHATÓK SQL-BŐL
--    (a Dashboard-kérdések egy részét ez kiváltja)
-- ════════════════════════════════════════════════════════════════════════════

SELECT 16, 'G) Munkamenet',
  'Refresh-token ROTÁCIÓ: ha a parent oszlop ki van töltve, a rotáció BE van kapcsolva',
  COALESCE((
    SELECT 'összes refresh token: ' || COUNT(*)::text ||
           ' | van szülője (rotált): ' || COUNT(*) FILTER (WHERE parent IS NOT NULL AND parent <> '')::text ||
           ' | visszavont: ' || COUNT(*) FILTER (WHERE revoked)::text ||
           ' | legrégebbi élő: ' || COALESCE(MIN(created_at) FILTER (WHERE NOT revoked)::date::text,'—') ||
           E'\n→ ' || CASE WHEN COUNT(*) FILTER (WHERE parent IS NOT NULL AND parent <> '') > 0
                          THEN 'A ROTÁCIÓ BE VAN KAPCSOLVA.'
                          ELSE 'Nincs rotált token — vagy ki van kapcsolva, vagy még nem volt token-frissítés.' END
    FROM auth.refresh_tokens
  ), 'nem olvasható')::text

UNION ALL

SELECT 17, 'G) Munkamenet',
  'Élő munkamenetek kora — ebből látszik a tényleges munkamenet-élettartam',
  COALESCE((
    SELECT 'élő munkamenet: ' || COUNT(*)::text ||
           ' | legrégebbi: ' || COALESCE(MIN(created_at)::date::text,'—') ||
           ' | leghosszabb kor: ' ||
             COALESCE(EXTRACT(day FROM now() - MIN(created_at))::int::text,'—') || ' nap' ||
           ' | van not_after korlát: ' || COUNT(*) FILTER (WHERE not_after IS NOT NULL)::text
    FROM auth.sessions
  ), 'nem olvasható (nincs auth.sessions tábla)')::text

UNION ALL

SELECT 18, 'G) Munkamenet',
  '2FA: hány fióknak van ELLENŐRZÖTT faktora? (a kikényszerítési döntéshez)',
  COALESCE((
    SELECT 'összes faktor: ' || COUNT(*)::text ||
           ' | ellenőrzött: ' || COUNT(*) FILTER (WHERE status = 'verified')::text ||
           ' | eltérő fiók ellenőrzött faktorral: ' ||
             COUNT(DISTINCT user_id) FILTER (WHERE status = 'verified')::text
    FROM auth.mfa_factors
  ), 'nem olvasható (nincs auth.mfa_factors tábla)')::text

UNION ALL

-- ════════════════════════════════════════════════════════════════════════════
-- H) A HOZZÁFÉRÉS-KÉRELMEK ÉPSÉGE  (P0·3 — anon INSERT WITH CHECK true)
-- ════════════════════════════════════════════════════════════════════════════

SELECT 19, 'H) Kérelmek',
  'Az access_requests sorok épsége: van-e olyan, ami megkerülte a szerver-akciót?',
  COALESCE((
    SELECT 'összes kérelem: ' || COUNT(*)::text ||
           ' | pending: ' || COUNT(*) FILTER (WHERE status='pending')::text ||
           ' | approved: ' || COUNT(*) FILTER (WHERE status='approved')::text ||
           ' | van resulting_user_id: ' || COUNT(*) FILTER (WHERE resulting_user_id IS NOT NULL)::text ||
           ' | hiányos hierarchia (nincs kerület VAGY megye VAGY gyülekezet): ' ||
             COUNT(*) FILTER (WHERE requested_district_id IS NULL
                                 OR requested_diocese_id IS NULL
                                 OR requested_congregation_id IS NULL)::text ||
           ' | ⛔ ellentmondó hierarchia (a megye nem a kerülethez tartozik): ' ||
             COUNT(*) FILTER (WHERE ar.requested_diocese_id IS NOT NULL
                                AND ar.requested_district_id IS NOT NULL
                                AND NOT EXISTS (
                                  SELECT 1 FROM public.dioceses d
                                  WHERE d.id = ar.requested_diocese_id
                                    AND d.district_id = ar.requested_district_id))::text
    FROM public.access_requests ar
  ), 'nincs kérelem')::text

UNION ALL

SELECT 20, 'H) Kérelmek',
  'Kért szerepkörök megoszlása (mit kérnek magukra a jelentkezők?)',
  COALESCE((
    SELECT string_agg(t.sor, E'\n' ORDER BY t.sor)
    FROM (SELECT COALESCE(requested_role,'(nincs)') || ' → ' || COUNT(*)::text || ' kérelem' AS sor
          FROM public.access_requests GROUP BY requested_role) t
  ), 'nincs kérelem')::text

) AS eredmeny ORDER BY sor;
