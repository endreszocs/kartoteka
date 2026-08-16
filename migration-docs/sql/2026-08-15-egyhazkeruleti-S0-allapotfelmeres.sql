-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI SZINT — S0 ÁLLAPOTFELMÉRÉS                     2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazkeruleti-S0-allapotfelmeres.sql║
-- ║ (docs/EGYHAZKERULETI-SZINT-INDITO-BRIEF-2026-08-15.md, S0 szelet)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EZ A FÁJL SEMMIT NEM MÓDOSÍT. Egyetlen SELECT, csak olvas.
--    Futtasd le a Supabase Studio SQL-szerkesztőjében, és az EREDMÉNYT küldd
--    vissza (elég egy képernyőkép vagy a táblázat kimásolva).
--
-- MIÉRT VAN ERRE SZÜKSÉG
-- ─────────────────────────────────────────────────────────────────────────────
-- A projekt egyik visszatérő hibaosztálya: „a migration-fájl NEM bizonyíték
-- arra, hogy lefutott élesben". A repó és a produkció NÉMÁN széthúzhat — ez
-- már kétszer okozott hibát (legutóbb a `dioceses-logos` bucket: „Bucket not
-- found"). Ráadásul a `migration-docs/Database_schema.sql` dump ELAVULT: a
-- 2026-08-15-ös migrációk nincsenek benne. Belőle tervezni tilos.
--
-- Ezért a 3. szint (egyházkerület) MINDEN további SQL-je EBBŐL az eredményből
-- indul ki, nem a repó fájljaiból.
--
-- HOGYAN OLVASD
-- ─────────────────────────────────────────────────────────────────────────────
--   ✅  = rendben, nincs teendő
--   ⚠️  = figyelemre méltó, de nem blokkoló
--   ⛔  = BLOKKOLÓ — a következő szelet SQL-je enélkül hibázna vagy adatot
--         rontana. Ezeket olvasd el először.
--
-- A `teendo` oszlop mindig megmondja, mi következik az adott értékből.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SZAKASZOK
--   0/A · districts törzsadat — van-e a kerületnek hivatalos identitása
--   0/B · districts RLS + GRANT — kimehet-e a CIF/IBAN/pecsét ANONIM olvasónak
--   0/C · a 6 scope-oszlopos tábla CHECK-je (1. BLOKKOLÓ csapda)
--   0/D · a kanonikus current_user_* függvények + GRANT-jaik
--   0/E · felettes_szint_hozzaferese() — a K4 kérdés MÉRÉSE
--   0/F · district hatókörű profile_roles sorok — ki dolgozik kerületi profillal
--   0/G · diocese_felterjesztes egyedi index: 3 vagy 4 oszlopos (7. csapda)
--   0/H · diocese_felterjesztes policy-k és FK-k (9. + 10. csapda)
--   0/I · iktato_csatolmany FK-k (3. BLOKKOLÓ csapda)
--   0/J · szerep-CHECK-ek — felvehető-e az `egyhazkeruleti_szamvevo`
--   0/K · backup_table_policy (2. BLOKKOLÓ csapda)
--   0/L · Kuka / purge_recycle_bin (13. csapda)
--   0/M · K4 SZÁMOKKAL: mit lát MA egy kerületi admin
--   0/N · szamadasicel.szint = 'kerulet' + storage bucketek
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/A · districts TÖRZSADAT — VAN-E A KERÜLETNEK HIVATALOS IDENTITÁSA      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '0/A · districts TÖRZSADAT' AS szakasz,
       'A districts tábla ÖSSZES oszlopa (élő állapot)' AS mit,
       COALESCE((SELECT string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position)
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public' AND c.table_name = 'districts'),
                '⛔ NINCS districts tábla!') AS ertek,
       'Ha csak id/name/created_at: a kerületnek NINCS hivatalos identitása — nem tud fejlécet nyomtatni és iratot hitelesíteni. Az S2 szelet ezt pótolja (nev_ro KÖTELEZŐ, nev_en opcionális — a 2026-08-15-i egyházmegyei tanulság).' AS teendo

UNION ALL
SELECT 101, '0/A · districts TÖRZSADAT',
       'Oszlopok SZÁMA (districts / dioceses összevetve)',
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema='public' AND table_name='districts')
       || ' oszlop  ⇄  dioceses: '
       || (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema='public' AND table_name='dioceses') || ' oszlop',
       'A dioceses a MINTA. A különbség pontosan az, amit az S2 szeletnek pótolnia kell.'

UNION ALL
SELECT 102, '0/A · districts TÖRZSADAT',
       'Melyik dioceses-oszlop HIÁNYZIK a districts-ből?',
       COALESCE((SELECT string_agg(d.column_name, ', ' ORDER BY d.column_name)
                 FROM information_schema.columns d
                 WHERE d.table_schema='public' AND d.table_name='dioceses'
                   AND NOT EXISTS (SELECT 1 FROM information_schema.columns k
                                   WHERE k.table_schema='public' AND k.table_name='districts'
                                     AND k.column_name = d.column_name)),
                '✅ egy sem — a districts már teljes'),
       'EZ AZ S2 SZELET PONTOS MUNKALISTÁJA. (A district_id értelemszerűen nem kell — a kerület a lánc teteje.)'

UNION ALL
SELECT 103, '0/A · districts TÖRZSADAT',
       'Hány egyházkerület van rögzítve?',
       (SELECT count(*)::text FROM public.districts) || ' db: '
       || COALESCE((SELECT string_agg(name, ' | ' ORDER BY name) FROM public.districts), '—'),
       'Romániában kettő van (Erdélyi, Királyhágómelléki). Ha több vagy kevesebb, tisztázzuk a beállítás-varázsló előtt.'

UNION ALL
SELECT 104, '0/A · districts TÖRZSADAT',
       'Hány egyházmegye tartozik ténylegesen kerülethez?',
       (SELECT count(*)::text FROM public.dioceses WHERE district_id IS NOT NULL)
       || ' / ' || (SELECT count(*)::text FROM public.dioceses) || ' egyházmegye',
       '⛔ Ha nem minden megyének van district_id-je: azok a megyék (és a gyülekezeteik) SOHA nem jelennek meg a kerületi felületen, és a felterjesztésük sem érkezik meg. A hiányzókat AZ S1 ELŐTT pótold.'

UNION ALL
SELECT 105, '0/A · districts TÖRZSADAT',
       'Kerület nélküli egyházmegyék NEVE',
       COALESCE((SELECT string_agg(name, ', ' ORDER BY name) FROM public.dioceses WHERE district_id IS NULL),
                '✅ nincs ilyen'),
       'Ezeket kell kerülethez rendelni (admin → Egyházmegyék), különben kimaradnak a 3. szintből. ⚠️ Az S3 kompozit FK-ja (diocese_id, district_id) is ezeken bukhat el.'

-- ── 0/A2 · A kerületi név KÉT helyen él, és széthúzhat ───────────────────────
UNION ALL
SELECT 106, '0/A2 · NÉV-DUPLIKÁTUM ⛔',
       'Van-e AZONOS NEVŰ egyházkerület? (a districts.name-en NINCS UNIQUE)',
       COALESCE((SELECT string_agg(name || ' (' || db::text || '×)', ', ')
                 FROM (SELECT name, count(*) AS db FROM public.districts GROUP BY name HAVING count(*) > 1) s),
                '✅ nincs duplikátum'),
       '⛔ Ha van: ÖT különböző seed-fájl szúr be districts sort, mind név-egyezés alapján (nincs ON CONFLICT, mert nincs UNIQUE). Duplikátum esetén a felhasználók KÉT kerület közé oszlanak szét, és az S2 kötelező nev_ro-ja is kétszer kérdezné meg ugyanazt. ELŐBB vond össze őket.'

UNION ALL
SELECT 107, '0/A2 · MÁSODIK IDENTITÁS ⚠️',
       'Hány gyülekezetnél tér el a congregations.district SZÖVEG a valódi lánctól?',
       (SELECT count(*)::text FROM public.congregations c
        LEFT JOIN public.dioceses d ON d.id = c.diocese_id
        LEFT JOIN public.districts k ON k.id = d.district_id
        WHERE c.district IS DISTINCT FROM k.name) || ' gyülekezet',
       '⚠️ A kerület neve KÉT helyen él: a valódi láncon (congregations.diocese_id → dioceses.district_id → districts.name) ÉS egy FK NÉLKÜLI szöveges oszlopban (congregations.district, alapértéke ''Erdélyi Református Egyházkerület''). Az ÉVES JELENTÉS generátora a SZÖVEGES oszlopot részesíti előnyben — tehát a nyomtatványon MÁS kerület állhat, mint a rendszerben. Az S6 szeletnek ezt rendeznie kell; addig is jó tudni a nagyságrendet.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/B · districts RLS + GRANT                                              ║
-- ║ Kimehet-e a CIF / IBAN / pecsét / aláírás ANONIM olvasónak?              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 200, '0/B · districts RLS',
       'Be van-e egyáltalán kapcsolva az RLS a districts-en?',
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ igen' ELSE '⛔ NINCS — a tábla RLS NÉLKÜL áll!' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='districts'), 'nincs tábla'),
       'RLS nélkül minden policy hatástalan. Ilyenkor az S1 SQL-je ENABLE ROW LEVEL SECURITY-vel kezd.'

UNION ALL
SELECT (210 + row_number() OVER (ORDER BY pol.policyname))::int, '0/B · districts RLS',
       'POLICY: ' || pol.policyname || '  [' || pol.cmd || ' → '
         || COALESCE(array_to_string(pol.roles, ','), '?') || ']',
       CASE
         WHEN 'anon' = ANY (pol.roles) AND COALESCE(pol.qual,'') IN ('true','(true)')
           THEN '⛔ ANONIM olvasó, USING(true) — BEJELENTKEZÉS NÉLKÜL kiolvasható lesz a CIF, IBAN, pecsét, aláírás!'
         WHEN 'anon' = ANY (pol.roles)
           THEN '⚠️ anonim olvasó, feltétellel: ' || COALESCE(pol.qual,'—')
         WHEN COALESCE(pol.qual,'') IN ('true','(true)')
           THEN '⚠️ minden BEJELENTKEZETT felhasználó látja az egész táblát (USING(true))'
         ELSE '✅ szűkített: ' || COALESCE(pol.qual,'—')
       END,
       'Az S1 szelet a districts SELECT policy-ját a törzsadat-bővítéssel EGY TRANZAKCIÓBAN szűkíti. A név/címer maradhat széles körben olvasható (a profilválasztónak kell), de a CIF/IBAN/pecsét/aláírás NEM.'
FROM pg_policies pol
WHERE pol.schemaname = 'public' AND pol.tablename = 'districts'

UNION ALL
SELECT 230, '0/B · districts RLS',
       'Hány policy van összesen a districts-en?',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='districts'),
       'Ha 0 és az RLS BE van kapcsolva: senki nem olvassa a táblát (a profilválasztó is üres). Ha 0 és az RLS KI van kapcsolva: mindenki mindent lát.'

UNION ALL
SELECT (240 + row_number() OVER (ORDER BY g.grantee, g.privilege_type))::int, '0/B · districts GRANT',
       'GRANT ' || g.privilege_type || ' → ' || g.grantee,
       CASE WHEN g.grantee = 'anon' THEN '⛔ az anon szerepnek TÁBLA-JOGA van'
            WHEN g.grantee = 'authenticated' AND g.privilege_type <> 'SELECT'
              THEN '⚠️ írási jog a bejelentkezettnek: ' || g.privilege_type
            ELSE '✅' END,
       'A GRANT és az RLS KÉT külön kapu. GRANT nélkül a policy sem segít; GRANT-tal viszont a policy az EGYETLEN védelem.'
FROM information_schema.role_table_grants g
WHERE g.table_schema='public' AND g.table_name='districts'
  AND g.grantee IN ('anon','authenticated','service_role')

UNION ALL
SELECT 260, '0/B · districts RLS',
       'ÖSSZEVETÉS: a dioceses tábla SELECT policy-ja hogyan néz ki?',
       COALESCE((SELECT string_agg(policyname || ' [' || cmd || '/' ||
                                   COALESCE(array_to_string(roles,','),'?') || ']: ' ||
                                   COALESCE(qual,'—'), '  ||  ' ORDER BY policyname)
                 FROM pg_policies WHERE schemaname='public' AND tablename='dioceses'),
                'nincs policy'),
       'A dioceses-nek MÁR van hivatalos identitása (CIF, IBAN, pecsét). Ha az is anon-olvasható, az UGYANAZ a hiba — az S1 mindkettőt rendezi.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/C · A 6 SCOPE-OSZLOPOS TÁBLA CHECK-JE — 1. BLOKKOLÓ CSAPDA             ║
-- ║ CHECK (num_nonnulls(congregation_id, diocese_id) = 1)                    ║
-- ║ → kerületi sornál MINDKETTŐ NULL, tehát 0 ≠ 1, és az első kerületi        ║
-- ║   leltári tétel 23514-gyel elhasal.                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT (300 + row_number() OVER (ORDER BY t.tabla))::int, '0/C · SCOPE-ŐR CHECK ⛔',
       t.tabla || ' — a scope-őr CHECK definíciója',
       COALESCE((SELECT CASE
                          WHEN pg_get_constraintdef(con.oid) LIKE '%district_id%'
                            THEN '✅ MÁR háromoszlopos (kerületi sor beengedve)'
                          WHEN pg_get_constraintdef(con.oid) LIKE '%diocese_id%'
                            THEN '⛔ KÉTOSZLOPOS: ' || pg_get_constraintdef(con.oid)
                          ELSE '⚠️ ismeretlen alak: ' || pg_get_constraintdef(con.oid)
                        END
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'c'
                   AND pg_get_constraintdef(con.oid) LIKE '%num_nonnulls%'
                 LIMIT 1),
                '⚠️ NINCS num_nonnulls CHECK ezen a táblán'),
       '⛔ Ha kétoszlopos: az S5 szelet SQL-je mind a 6 táblán DROP + ADD-del háromoszlopos alakra cseréli, EGYETLEN tranzakcióban (különben van egy pillanat scope-őr nélkül). Az idempotencia-őr a DEFINÍCIÓRA néz, NEM a névre — névre nézve a bővítés némán kimaradna.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures'), ('iktato_csatolmany'),
             ('iktato_sequence_pointers')) AS t(tabla)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL

UNION ALL
SELECT (310 + row_number() OVER (ORDER BY t.tabla))::int, '0/C · SCOPE-ŐR CHECK ⛔',
       t.tabla || ' — a CHECK NEVE (az idempotencia-őrhöz)',
       COALESCE((SELECT string_agg(con.conname, ', ')
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'c'
                   AND pg_get_constraintdef(con.oid) LIKE '%num_nonnulls%'),
                '— (nincs)'),
       'A repó mintája `conname`-alapú őrt használ. Ha a név ugyanaz marad (…_pontosan_egy_scope), a névre néző őr azt hinné, kész van, és a háromoszlopos bővítés NÉMÁN kimaradna. Ezért néz az új őr a definícióra.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures'), ('iktato_csatolmany'),
             ('iktato_sequence_pointers')) AS t(tabla)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL

UNION ALL
SELECT (320 + row_number() OVER (ORDER BY t.tabla))::int, '0/C · RÉSZLEGES INDEXEK',
       t.tabla || ' — részleges EGYEDI indexei (egyediségi őrök)',
       COALESCE((SELECT string_agg(i.indexname || ' :: ' || i.indexdef, '  ||  ' ORDER BY i.indexname)
                 FROM pg_indexes i
                 WHERE i.schemaname='public' AND i.tablename = t.tabla
                   AND i.indexdef LIKE '%UNIQUE%' AND i.indexdef LIKE '%WHERE%'),
                '— (nincs részleges egyedi index)'),
       '⛔ 5. csapda: az iktatószám és a leltári szám egyedisége KIZÁRÓLAG ilyen scope-részleges indexeken áll. Kerületi sorra EGYIK SEM illeszkedik → DUPLIKÁLT IKTATÓSZÁM egy hivatalos iraton. Az S5 mindegyiknek megépíti a kerületi párját.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_yearly_closures'),
             ('iktato_sequence_pointers')) AS t(tabla)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL

-- ── 0/C2 · Az ELSŐDLEGES KULCSOK alakja — a 6. csapda ezen áll ──────────────
UNION ALL
SELECT (330 + row_number() OVER (ORDER BY t.tabla))::int, '0/C2 · PK-ALAK ⛔',
       t.tabla || ' — az elsődleges kulcs',
       COALESCE((SELECT pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla) AND con.contype = 'p'
                 LIMIT 1),
                '⚠️ NINCS elsődleges kulcs'),
       '⛔ 6. csapda: a sorszám-RPC `ON CONFLICT (…) WHERE …` ARBITERE részleges egyedi indexet keres. A megyei körben ezért cserélték a KOMPOZIT PK-t (congregation_id, year) surrogate `id`-re. Ha itt MÉG a kompozit alak áll, a kerületi bővítés (ahol mindkét scope-oszlop NULL) beszúrni sem tud — PK-oszlop nem lehet NULL. Az S5-nek ezt is kezelnie kell.'
FROM (VALUES ('iktato_yearly_closures'), ('iktato_sequence_pointers')) AS t(tabla)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/D · A KANONIKUS current_user_* FÜGGVÉNYEK + GRANT-JAIK                 ║
-- ║ Tanulság: „RLS-policy auth sémából olvas → GRANT nélkül 403-leállás"     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT (400 + row_number() OVER (ORDER BY f.fn))::int, '0/D · FÜGGVÉNY MEGLÉT',
       'Létezik-e: ' || f.fn || '()',
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL
            THEN CASE WHEN f.fn LIKE '%district_olvaso%' THEN '— még nincs (ezt az S1 hozza létre)'
                      ELSE '⛔ NINCS — pedig kellene!' END
            ELSE '✅ létezik' END,
       CASE WHEN f.fn LIKE '%district_olvaso%'
            THEN 'Az S1 szelet hozza létre, az egyházmegyei current_user_diocese_olvaso_ids() betűhű mintájára (írók + egyházkerületi számvevő).'
            ELSE 'Ha ⛔: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql és a 2026-08-11-szamvevo-megyei-hozzaferes.sql fusson le.' END
FROM (VALUES ('current_user_has_global_access'),
             ('current_user_diocese_ids'),
             ('current_user_diocese_olvaso_ids'),
             ('current_user_district_ids'),
             ('current_user_district_olvaso_ids'),
             ('felettes_szint_gyulekezet_ids')) AS f(fn)

UNION ALL
SELECT (420 + row_number() OVER (ORDER BY f.fn))::int, '0/D · FÜGGVÉNY-GRANT ⛔',
       'EXECUTE az authenticated-nek: ' || f.fn || '()',
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
              THEN '✅ van'
            ELSE '⛔ NINCS GRANT — minden erre épülő policy 403-mal ÁLL LE (nem tagad: HIBÁZIK)!' END,
       'A policy a HÍVÓ szerepében fut. GRANT nélkül nem „0 sort ad", hanem elszáll — a felhasználó hibaüzenetet lát, nem üres listát. Az S1 minden általa hívott függvényre explicit GRANT-ot ad, MÉG A POLICY-CSERE ELŐTT, ugyanabban a tranzakcióban.'
FROM (VALUES ('current_user_diocese_ids'), ('current_user_diocese_olvaso_ids'),
             ('current_user_district_ids'), ('current_user_district_olvaso_ids'),
             ('felettes_szint_gyulekezet_ids'), ('current_user_has_global_access')) AS f(fn)

UNION ALL
SELECT 440, '0/D · FÜGGVÉNY-TÖRZS',
       'current_user_district_ids() SZEREP-SZŰRT-e? (említi-e az egyhazkeruleti_admin-t)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%egyhazkeruleti_admin%'
                             THEN '✅ szerep-szűrt' ELSE '⛔ NEM szerep-szűrt — bármely district-sor hatókört ad!' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='current_user_district_ids' LIMIT 1),
                'nincs függvény'),
       'Ez a KANONIKUS feloldó. Az app-oldali resolveDistrictScopeIds ma szerep-SZŰRETLEN (4. csapda) — pontosan az a réteg-divergencia, ami a számvevőnél ÜRES KÉPERNYŐT okozott hibaüzenet nélkül. Az S1 az appot igazítja ehhez.'

UNION ALL
SELECT 442, '0/D · FÜGGVÉNY-TÖRZS ⛔',
       'current_user_has_global_access() — MELYIK a KETTŐ közül fut élesben?',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%esperes%'
                             THEN '⛔ A RÉGI, TÁG törzs fut — az ESPERES GLOBÁLIS hozzáférésű!'
                             ELSE '✅ a szűkített törzs fut (csak rendszergazda)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='current_user_has_global_access' LIMIT 1),
                '⛔ NINCS ilyen függvény — pedig MINDEN szint-policy „globális" ága ezen áll'),
       '⛔ A repóban KÉT, egymásnak ELLENTMONDÓ definíció van UGYANABBAN a fájlban: az élesnek szánt csak a rendszergazdát ismeri, a VISSZAÁLLÍTÓ szakasz viszont visszaadja a régi, tág alakot (admin + esperes + egyhazmegyei_admin). A fájlokból NEM állapítható meg, melyik futott le utoljára — ezért kell ITT megmérni. Ha ⛔: MINDEN kerületi policy „globális" ága túl tág lenne.'

UNION ALL
SELECT 441, '0/D · FÜGGVÉNY-TÖRZS',
       'current_user_district_ids() törzse ÉRINTETLEN? (nem említ szamvevo-t)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%szamvevo%'
                             THEN '⛔ MEGVÁLTOZOTT — az ellenőr ÍRÁSJOGOT kaphatott!'
                             ELSE '✅ érintetlen (tisztán írási hatókör)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='current_user_district_ids' LIMIT 1),
                'nincs függvény'),
       'Az S1 az ÍRÁSI függvényt NEM bővíti; a számvevő KÜLÖN olvasó függvényt kap. Ha ez már ⛔, tisztázzuk, ki írta át.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/E · felettes_szint_hozzaferese() — A K4 KÉRDÉS MÉRÉSE                  ║
-- ║ „Lát-e a kerület SOR-SZINTEN a gyülekezetekbe?"                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 500, '0/E · K4 — KERÜLETI RÁLÁTÁS',
       'felettes_szint_hozzaferese() beengedi-e a KERÜLETET is?',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%district_id%'
                             THEN '⚠️ IGEN — a kerületi admin SOR-SZINTEN olvassa a kerülete ÖSSZES gyülekezetének adatait'
                             ELSE '✅ nem — csak az egyházmegyei láb él' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='felettes_szint_hozzaferese' LIMIT 1),
                'nincs függvény'),
       '❓ ENDRE DÖNTÉSE (K4). Alapértelmezés: MARAD. De ne legyen néma állapot — a 0/M szakasz SZÁMOKKAL mutatja, mit jelent ez a gyakorlatban. Ha szűkíteni akarod, az KÜLÖN szelet lesz (a megyei párja már megvan: felettes_szint_szerkesztheto).'

UNION ALL
SELECT 501, '0/E · K4 — KERÜLETI RÁLÁTÁS',
       'felettes_szint_szerkesztheto() beengedi-e a kerületet? (ÍRÁS!)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%district_id%'
                             THEN '⚠️ IGEN — a kerületi admin ÍRHATJA is a gyülekezeti sorokat'
                             ELSE '✅ nem — az írás megyei/gyülekezeti kézben' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='felettes_szint_szerkesztheto' LIMIT 1),
                '— nincs ilyen függvény'),
       'Az OLVASÁS és az ÍRÁS két külön kapu. Az olvasás tágabb lehet; az írás ne legyen az.'

UNION ALL
SELECT (510 + row_number() OVER (ORDER BY pol.tablename, pol.policyname))::int,
       '0/E · K4 — MELY TÁBLÁKON',
       pol.tablename || '.' || pol.policyname,
       '⚠️ kerületi rálátás ezen a táblán is (' || pol.cmd || ')',
       'Ezt a listát olvasd végig: EZEKET a táblákat látja ma sor-szinten a kerületi admin a kerülete gyülekezeteiben. Ha bármelyik nem kívánatos (pl. anyakönyv, személyes adatok), szólj — külön szeletbe veszem.'
FROM pg_policies pol
WHERE pol.schemaname='public'
  AND (COALESCE(pol.qual,'') LIKE '%felettes_szint_hozzaferese%'
    OR COALESCE(pol.qual,'') LIKE '%felettes_szint_gyulekezet_ids%'
    OR COALESCE(pol.qual,'') LIKE '%current_user_district_ids%')


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/F · KI DOLGOZIK KERÜLETI PROFILLAL (K1)                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 600, '0/F · KERÜLETI PROFILOK',
       'Hány district hatókörű profile_roles sor van?',
       (SELECT count(*)::text FROM public.profile_roles WHERE scope='district')
       || ' db (ebből aktív+jóváhagyott: '
       || (SELECT count(*)::text FROM public.profile_roles
           WHERE scope='district' AND active = true AND approval_status='approved') || ')',
       'Ha 0: MA SENKI nem tud kerületi profillal belépni — a profilválasztó kerületi ága kész, csak a sor hiányzik. Az S1 után létre kell hozni legalább egyet a teszteléshez.'

UNION ALL
SELECT (610 + row_number() OVER (ORDER BY pr.granted_at))::int, '0/F · KERÜLETI PROFILOK',
       COALESCE(p.email, '(nincs e-mail)') || ' — szerep: ' || COALESCE(pr.role,'?'),
       'kerület: ' || COALESCE(d.name, '⛔ FELOLDHATATLAN scope_id')
         || ' | aktív: ' || COALESCE(pr.active::text,'?')
         || ' | jóváhagyás: ' || COALESCE(pr.approval_status,'?')
         || ' | profiles.role: ' || COALESCE(p.role,'?')
         || ' | profiles.district_id: ' || COALESCE(ds.name, '(nincs)'),
       CASE WHEN pr.role <> 'egyhazkeruleti_admin'
              THEN '⚠️ NEM egyhazkeruleti_admin: az app ma hatókörnek számítja (4. csapda), az RLS viszont NEM → ÜRES KÉPERNYŐ hibaüzenet nélkül. Az S1 ezt megszünteti.'
            WHEN ds.name IS NOT NULL AND d.name IS NOT NULL AND ds.id <> d.id
              THEN '⛔ DIVERGENCIA: a szerepkör-sor és a profiles.district_id KÜLÖNBÖZŐ kerületre mutat. Rendezd a futtatás ELŐTT.'
            ELSE '✅ rendben' END
FROM public.profile_roles pr
LEFT JOIN public.profiles p ON p.id = pr.profile_id
LEFT JOIN public.districts d ON d.id = pr.scope_id
LEFT JOIN public.districts ds ON ds.id = p.district_id
WHERE pr.scope = 'district'

UNION ALL
SELECT 630, '0/F · KERÜLETI PROFILOK',
       'Kinek van egyhazkeruleti_admin SKALÁR szerepe (profiles.role)?',
       COALESCE((SELECT string_agg(COALESCE(email,'?') || ' → ' || COALESCE(dd.name,'⛔ NINCS district_id!'), ', ')
                 FROM public.profiles pp LEFT JOIN public.districts dd ON dd.id = pp.district_id
                 WHERE pp.role='egyhazkeruleti_admin'),
                '— senki'),
       '⛔ Akinek NINCS district_id-je ÉS nincs district szerepkör-sora sem: az `effective-access.ts` szerint kerületi admin (skalár!), de a hatóköre üres → mindent lát vagy semmit. Az S1 ezt fail-closed irányba rendezi.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/G · diocese_felterjesztes EGYEDI INDEX — 7. CSAPDA                     ║
-- ║ A HÁROM oszlopos (rossz) vagy a NÉGY oszlopos (helyes) van érvényben?    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT (700 + row_number() OVER (ORDER BY i.indexname))::int, '0/G · FELTERJESZTÉS-INDEX ⛔',
       i.indexname,
       CASE
         WHEN i.indexdef LIKE '%modositas%' OR i.indexdef LIKE '%_mod_%' THEN '✅ NÉGY oszlopos (helyes)'
         WHEN i.indexdef LIKE '%UNIQUE%' THEN '⚠️ ellenőrizd: ' || i.indexdef
         ELSE i.indexdef
       END,
       '⛔ Ha a HÁROMoszlopos (diocese_id, doc_type, year) egyedi index van érvényben, a KÖLTSÉGVETÉS-MÓDOSÍTÁS felküldése NÉMÁN FELÜLÍRJA az eredeti költségvetést. Az S3 szelet 0. szakasza fail-closed RAISE EXCEPTION-nel áll meg, ha a hármas visszatért (pl. az uj-tablak.sql újrafuttatása után).'
FROM pg_indexes i
WHERE i.schemaname='public' AND i.tablename='diocese_felterjesztes' AND i.indexdef LIKE '%UNIQUE%'

UNION ALL
SELECT 720, '0/G · FELTERJESZTÉS-INDEX ⛔',
       'Él-e MÉG a régi, HÁROMoszlopos egyedi index?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname='public' AND tablename='diocese_felterjesztes'
                           AND indexname='diocese_felterjesztes_dio_tipus_ev_uidx')
            THEN '⛔ IGEN — a költségvetés-módosítás felülírja az eredetit'
            ELSE '✅ nincs (a négyoszlopos váltotta le)' END,
       'Ha ⛔: futtasd újra a 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql-t, MIELŐTT a kerületi fogadó felület élesedik.'

UNION ALL
SELECT 721, '0/G · FELTERJESZTÉS-INDEX',
       'Megvan-e a feloldás-elbíráló felület indexe?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname='public' AND tablename='diocese_felterjesztes'
                           AND indexname='diocese_felterjesztes_unlock_idx')
            THEN '✅ igen' ELSE '⚠️ nincs — a 2026-08-15-…-osszesito-feloldas.sql nem futott le' END,
       'Az S3 szelet feloldás-elbíráló listája erre az indexre épül. Enélkül működik, csak lassabban.'

UNION ALL
SELECT 722, '0/G · FELTERJESZTÉS-ADAT',
       'Hány felterjesztés érkezett eddig, és milyen státuszban?',
       COALESCE((SELECT string_agg(s.status || ': ' || s.db::text, ' | ' ORDER BY s.status)
                 FROM (SELECT COALESCE(status,'(nincs)') AS status, count(*) AS db
                       FROM public.diocese_felterjesztes GROUP BY 1) s),
                '— még egy sem'),
       'Ez az S3 fogadó felület valós bemenete. Ha 0: a felület üresen indul, ami rendben van — de teszteléshez kell majd egy megyei felküldés.'

UNION ALL
SELECT 723, '0/G · FELTERJESZTÉS-ADAT',
       'A diocese_felterjesztes.district_id NOT NULL maradt?',
       COALESCE((SELECT CASE WHEN is_nullable = 'NO'
                             THEN '✅ NOT NULL — árva (kerület nélküli) felterjesztés nem keletkezhet'
                             ELSE '⛔ NULLABLE — árva felterjesztések keletkezhetnek, amiket a kerület SOHA nem lát' END
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='diocese_felterjesztes'
                   AND column_name='district_id'),
                '⛔ nincs ilyen oszlop'),
       'Korábban itt a NULL-os sorokat számoltuk — az a szám a NOT NULL miatt SOHA nem lehetett más, mint 0, vagyis a mérés mindig zöldet mutatott volna. A valóban mérhető dolog az, hogy a NOT NULL megmaradt-e: egy jövőbeli lazítás így nem marad észrevétlen.'

UNION ALL
SELECT 724, '0/G · FELTERJESZTÉS-ADAT',
       'Van-e HAMIS district_id (nem a megye valódi kerülete)? — 10. csapda',
       (SELECT count(*)::text FROM public.diocese_felterjesztes f
        JOIN public.dioceses d ON d.id = f.diocese_id
        WHERE f.district_id IS NOT NULL AND d.district_id IS DISTINCT FROM f.district_id) || ' db',
       '⛔ Ha nem 0: egy esperes TETSZŐLEGES kerülethez küldött fel. Az S3 SQL-je kompozit FK-t tesz rá: FOREIGN KEY (diocese_id, district_id) REFERENCES dioceses(id, district_id) — előtte a hamis sorokat javítani kell.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/H · diocese_felterjesztes POLICY-K ÉS FK-K — 9. + 10. CSAPDA           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT (800 + row_number() OVER (ORDER BY pol.policyname))::int, '0/H · FELTERJESZTÉS-POLICY',
       pol.policyname || ' [' || pol.cmd || ']',
       'USING: ' || COALESCE(pol.qual,'—') || '   ||   WITH CHECK: ' || COALESCE(pol.with_check,'—'),
       CASE WHEN pol.cmd IN ('UPDATE','ALL') AND COALESCE(pol.qual,'') LIKE '%district%'
            THEN '⛔ 9. csapda: a kerületi UPDATE-policy csak a district_id-t nézi, OSZLOP-KORLÁT NINCS → a kerület felülírhatja a megye FAGYASZTOTT pillanatképét (snapshot_data). Az S3 BEFORE UPDATE triggert tesz rá: csak status, received_*, returned_reason, notes, unlock_* változhat; snapshot_data SOHA.'
            ELSE 'Tájékoztató.' END
FROM pg_policies pol
WHERE pol.schemaname='public' AND pol.tablename='diocese_felterjesztes'

UNION ALL
SELECT (830 + row_number() OVER (ORDER BY con.conname))::int, '0/H · FELTERJESZTÉS-FK',
       con.conname,
       pg_get_constraintdef(con.oid),
       'A (diocese_id, district_id) KOMPOZIT FK hiánya a 10. csapda. Ehhez a dioceses-en kell egy UNIQUE (id, district_id) — az S3 SQL-je mindkettőt megcsinálja, egy tranzakcióban.'
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.diocese_felterjesztes')
  AND con.contype = 'f'

UNION ALL
SELECT 860, '0/H · FELTERJESZTÉS-FK',
       'Van-e a dioceses-en UNIQUE (id, district_id)?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid = to_regclass('public.dioceses')
                           AND contype IN ('u','p')
                           AND pg_get_constraintdef(oid) LIKE '%district_id%')
            THEN '✅ igen' ELSE '— nincs (az S3 hozza létre)' END,
       'Kompozit FK csak UNIQUE/PK célra mutathat. Enélkül a 10. csapda nem javítható.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/I · iktato_csatolmany FK-K — 3. BLOKKOLÓ CSAPDA                        ║
-- ║ Kerületi sornál MINDKÉT kompozit FK VÁKUUMOSAN teljesül (MATCH SIMPLE):  ║
-- ║ a csatolmány BÁRMELYIK — akár idegen — iktató-sorra mutathat.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT (900 + row_number() OVER (ORDER BY con.conname))::int, '0/I · CSATOLMÁNY-FK ⛔',
       con.conname,
       pg_get_constraintdef(con.oid),
       CASE WHEN pg_get_constraintdef(con.oid) LIKE '%(iktato_id, %'
              OR pg_get_constraintdef(con.oid) LIKE '%, iktato_id)%'
            THEN '⛔ KOMPOZIT FK: kerületi sornál (ahol congregation_id ÉS diocese_id is NULL) MATCH SIMPLE mellett VÁKUUMOSAN teljesül → a csatolmány NEM LÉTEZŐ vagy IDEGEN iktató-sorra mutathat.'
            ELSE 'Tájékoztató.' END
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.iktato_csatolmany')
  AND con.contype = 'f'

UNION ALL
SELECT 930, '0/I · CSATOLMÁNY-FK ⛔',
       'Van-e EGYOSZLOPOS FK az iktato_csatolmany.iktato_id-n?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid = to_regclass('public.iktato_csatolmany')
                           AND contype='f'
                           AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (iktato_id) REFERENCES%')
            THEN '✅ igen — a csatolmány mindig valódi iktató-sorra mutat'
            ELSE '⛔ NINCS — csak kompozit FK-k vannak (lásd fent)' END,
       'MEGELŐZÉS (az S5-ben, a scope-oszloppal EGY tranzakcióban): iktato ADD CONSTRAINT iktato_id_district_uk UNIQUE (id, district_id), majd a HARMADIK kompozit FK. Egyoszlopos FK hozzáadása is jó megoldás, ha a kompozitok megmaradnak mellette.'

UNION ALL
SELECT 931, '0/I · IKTATO UNIQUE-K',
       'Az iktato tábla UNIQUE / PK megszorításai',
       COALESCE((SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), '  ||  ' ORDER BY conname)
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.iktato') AND contype IN ('u','p')),
                '— nincs'),
       'A kompozit FK-khoz UNIQUE (id, <scope>) kell. Az S5 hozzáadja a kerületi párt.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/J · SZEREP-CHECK-EK — FELVEHETŐ-E AZ egyhazkeruleti_szamvevo (K1)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 1000, '0/J · SZEREP-CHECK',
       'profiles.role CHECK — engedi-e már az egyhazkeruleti_szamvevo-t?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ igen' ELSE '— még nem: ' || pg_get_constraintdef(oid) END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profiles') AND contype='c'
                   -- NÉV szerint — lásd a következő sor indoklását.
                   AND conname = 'profiles_role_check'),
                '— nincs profiles_role_check'),
       'Az S1 bővíti a CHECK-et. FONTOS: a CHECK-cserét ÚGY kell, hogy a meglévő értékek mind érvényesek maradjanak (DROP + ADD egy tranzakcióban).'

UNION ALL
SELECT 1001, '0/J · SZEREP-CHECK',
       'profile_roles.role CHECK — engedi-e már az egyhazkeruleti_szamvevo-t?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ igen' ELSE '— még nem: ' || pg_get_constraintdef(oid) END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles') AND contype='c'
                   -- ⚠️ NÉV szerint, NEM `LIKE '%role%'` + LIMIT 1: a
                   -- `profile_roles_custom_label_check` definíciója is említi a
                   -- `role` oszlopot, tehát KÉT constraint illeszkedne, és a
                   -- LIMIT 1 ORDER BY nélkül tetszőlegesen választana közülük.
                   AND conname = 'profile_roles_role_check'),
                '— nincs profile_roles_role_check'),
       'Ugyanaz. Ha NINCS role CHECK egyik táblán sem, az önmagában ⚠️: bármilyen elgépelt szerepnév beírható.'

-- A profile_roles ÖSSZES CHECK-je — a 2026-08-15-i eset tanulsága: egy
-- szöveg-alapú szűrő MÁSIK constraintet is eltalálhat. Lássuk mindet.
UNION ALL
SELECT (1010 + row_number() OVER (ORDER BY con.conname))::int, '0/J · SZEREP-CHECK',
       'profile_roles CHECK: ' || con.conname,
       pg_get_constraintdef(con.oid),
       CASE WHEN con.conname = 'profile_roles_custom_label_check'
                 AND pg_get_constraintdef(con.oid) NOT LIKE '%custom_label%'
            THEN '⛔ SÉRÜLT — a címke-őr helyére szerep-lista került. Futtasd a 2026-08-15-egyhazkeruleti-S1-JAVITAS-custom-label-check.sql fájlt.'
            ELSE '✅ a definíció a nevéhez illik' END
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.profile_roles') AND con.contype = 'c'

UNION ALL
SELECT 1002, '0/J · SZEREP-CHECK',
       'Milyen szerep-értékek FORDULNAK ELŐ ténylegesen?',
       COALESCE((SELECT string_agg(s.r || ' (' || s.db::text || ')', ', ' ORDER BY s.db DESC)
                 FROM (SELECT COALESCE(role,'(NULL)') AS r, count(*) AS db
                       FROM public.profile_roles GROUP BY 1) s),
                '—'),
       'Ha van itt olyan érték, ami nincs az app KNOWN_ROLES listájában (roles.ts), az a felhasználó „ismeretlen szerep" ágra esik.'

UNION ALL
SELECT 1003, '0/J · SZEREP-CHECK ⛔',
       'A profile_roles_admin_manage policy hatóköre (11. csapda)',
       COALESCE((SELECT COALESCE(qual,'—') FROM pg_policies
                 WHERE schemaname='public' AND tablename='profile_roles'
                   AND policyname LIKE '%admin%manage%' LIMIT 1),
                '— nincs ilyen policy'),
       '⛔ 11. csapda: ha a USING-ág HATÓKÖR NÉLKÜLI, a kerületi admin az EGÉSZ ORSZÁG szerepkör-tábláját látja és TÖRÖLHETI. Az S1 hatókörre szűkíti (a getAdminDistrictScope app-oldali őre már ezt teszi — az RLS nem).'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/K · backup_table_policy — 2. BLOKKOLÓ CSAPDA                           ║
-- ║ Besorolatlan tábla → a napi mentés MINDEN gyülekezetnél leáll.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 1100, '0/K · MENTÉS-BESOROLÁS ⛔',
       'A backup_table_policy KULCSOSZLOPÁNAK neve',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_table_policy'),
                '⛔ NINCS backup_table_policy tábla!'),
       '⚠️ A kulcsoszlop neve `tabla`, NEM `table_name` — ez már egyszer elbukott (#172). Minden új district_* táblát létrehozó SQL 1. szakaszának VÉGÉRE, UGYANABBA a tranzakcióba kell az INSERT … ON CONFLICT (tabla) DO UPDATE.'

UNION ALL
SELECT 1101, '0/K · MENTÉS-BESOROLÁS ⛔',
       'Van-e MA besorolatlan tábla? (a mentés 0. lépése ezen dob)',
       (SELECT count(*)::text FROM information_schema.tables t
        WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
          AND NOT EXISTS (SELECT 1 FROM public.backup_table_policy b WHERE b.tabla = t.table_name))
       || ' db besorolatlan',
       '⛔ Ha nem 0: a napi mentés MÁR MOST leáll (assertInventoryClassified dob, apps/web/lib/backup/inventory.ts:163). Ezt AZ S1 ELŐTT rendezni kell — nem a kerületi kör okozza, de a kerületi kör miatt derül ki.'

UNION ALL
SELECT 1102, '0/K · MENTÉS-BESOROLÁS ⛔',
       'A besorolatlan táblák NEVE',
       COALESCE((SELECT string_agg(t.table_name, ', ' ORDER BY t.table_name)
                 FROM information_schema.tables t
                 WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
                   AND NOT EXISTS (SELECT 1 FROM public.backup_table_policy b WHERE b.tabla = t.table_name)),
                '✅ nincs besorolatlan tábla'),
       'Mindegyiket be kell sorolni. A kerületi kör MINDEN új táblája (district_*) ugyanabban a tranzakcióban kap besorolást, amiben létrejön.'

UNION ALL
SELECT (1110 + row_number() OVER (ORDER BY b.tabla))::int, '0/K · MENTÉS-BESOROLÁS',
       'Megyei tábla besorolása: ' || b.tabla,
       'hatokor: ' || COALESCE(b.hatokor,'?')
         || ' | reteg: ' || COALESCE(b.reteg::text,'⚠️ NULL — mentjük, de VISSZAÁLLÍTANI NEM TUDJUK')
         || ' | visszaallithato: ' || COALESCE(b.visszaallithato::text,'?')
         || ' | join_predikatum: ' || COALESCE(b.join_predikatum,'(alap: t.congregation_id = $1)'),
       'Ez a MINTA: a district_* táblák ugyanezt a besorolás-alakot kapják. ⚠️ A `hatokor` értéke NEM lehet ''gyulekezet'' egy kerületi táblán — az a gyülekezeti mentés-szűrőt jelenti, amire a kerületi sor sosem illeszkedik.'
FROM public.backup_table_policy b
WHERE b.tabla LIKE 'diocese_%'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/L · KUKA / purge_recycle_bin — 13. CSAPDA                              ║
-- ║ A Kukának nincs kerületi útja, a heti takarítás viszont FIZIKAILAG TÖRÖL.║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 1200, '0/L · KUKA ⛔',
       'A purge_recycle_bin() DELETE-je szűkített-e congregation_id-re?',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%congregation_id IS NOT NULL%'
                             THEN '✅ igen — a nem-gyülekezeti sorokat békén hagyja'
                             ELSE '⛔ NEM — a kerületi (és megyei) sorokat is FIZIKAILAG TÖRLI, pedig nincs kerületi Kuka-útjuk' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='purge_recycle_bin' LIMIT 1),
                '— nincs purge_recycle_bin függvény'),
       '⛔ RÖVID TÁV (az S7-ben, de már az S5 ELŐTT): a DELETE-et szűkítsd `AND congregation_id IS NOT NULL`-ra. Enélkül a kerületi leltári tétel törlése VISSZAVONHATATLAN, mert a Kuka-felület nem éri el, a heti takarítás viszont igen.'

UNION ALL
SELECT 1201, '0/L · VISSZAÁLLÍTÁS',
       'Hány tábla esne el a visszaállításnál a hatókör-besorolása miatt? (14. csapda)',
       (SELECT count(*)::text FROM public.backup_table_policy
        WHERE hatokor <> 'gyulekezet' OR reteg IS NULL) || ' tábla',
       '⚠️ TÉNYADAT a döntéshez: a visszaállítás KIZÁRÓLAG a hatokor = ''gyulekezet'' ÉS reteg IS NOT NULL ÉS visszaallithato sorokat engedi; minden más „MEGTAGADVA". A backup_table_policy.hatokor CHECK-je NEM ismer ''egyhazkerulet'' értéket — a district_* táblák a megyei minta szerint ''globalis''-ba mennek, tehát eleve megtagadva lesznek. ❓ ENDRE DÖNTÉSE, hogy ez maradjon-e; addig az S7 KIÍRJA a felületen, hogy kerületi szinten nincs önkiszolgáló visszaállítás.'

UNION ALL
SELECT 1202, '0/L · VISSZAÁLLÍTÁS',
       'Megvan-e a backup_table_policy.globalis_predikatum oszlop?',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='backup_table_policy'
                           AND column_name='globalis_predikatum')
            THEN '✅ igen (a megyei S4 fájl hozta)'
            ELSE '⚠️ nincs — a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql nem futott le teljesen' END,
       'A NEM-gyülekezeti (globális besorolású) sorok mentés-szűrője ezen az oszlopon megy. A kerületi táblák mentése enélkül nem tud scope szerint szűrni.'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/M · K4 SZÁMOKKAL — MIT LÁT MA EGY KERÜLETI ADMIN                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT (1300 + row_number() OVER (ORDER BY d.name))::int, '0/M · K4 SZÁMOKKAL ⚠️',
       'Kerület: ' || d.name,
       (SELECT count(*)::text FROM public.dioceses dd WHERE dd.district_id = d.id) || ' egyházmegye, '
       || (SELECT count(*)::text FROM public.congregations c
           JOIN public.dioceses dd ON dd.id = c.diocese_id WHERE dd.district_id = d.id) || ' gyülekezet, '
       || (SELECT count(*)::text FROM public.szemely s
           JOIN public.congregations c ON c.id = s.congregation_id
           JOIN public.dioceses dd ON dd.id = c.diocese_id WHERE dd.district_id = d.id) || ' személy',
       '⚠️ EZT LÁTJA MA egy kerületi admin SOR-SZINTEN (K4). A számok azért vannak itt, hogy a döntés ne néma legyen. Alapértelmezés: marad.'
FROM public.districts d

UNION ALL
SELECT 1350, '0/M · K4 SZÁMOKKAL ⚠️',
       'Kerülethez NEM köthető gyülekezetek (kimaradnak a 3. szintből)',
       (SELECT count(*)::text FROM public.congregations c
        LEFT JOIN public.dioceses dd ON dd.id = c.diocese_id
        WHERE dd.district_id IS NULL) || ' gyülekezet',
       '⛔ Ha nem 0: ezek a gyülekezetek SOHA nem jelennek meg kerületi szinten, és az összesítőből is kimaradnak — némán. Rendezd (congregations.diocese_id és dioceses.district_id kitöltése).'


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0/N · EGYÉB ELŐFELTÉTELEK                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UNION ALL
SELECT 1400, '0/N · EGYÉB',
       'szamadasicel.szint — engedi-e a ''kerulet'' értéket?',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conrelid = to_regclass('public.szamadasicel') AND contype='c'
                   AND pg_get_constraintdef(oid) LIKE '%szint%' LIMIT 1),
                '— nincs szint CHECK'),
       'A brief szerint a ''kerulet'' érték MÁR megengedett, de egyetlen felület sem használja. Az S5 használatba veszi.'

UNION ALL
SELECT 1401, '0/N · EGYÉB',
       'Hány szamadasicel sor van szint = ''kerulet''-tel?',
       COALESCE((SELECT count(*)::text FROM public.szamadasicel WHERE szint = 'kerulet'), '0'),
       'Ha 0: az S5-nek fel kell töltenie a kerületi számadási célokat (a megyei mintára).'

UNION ALL
SELECT (1410 + row_number() OVER (ORDER BY b.name))::int, '0/N · STORAGE BUCKET',
       'bucket: ' || b.name,
       'nyilvános: ' || COALESCE(b.public::text,'?'),
       'Tanulság: „a migration-fájl NEM bizonyíték" — a dioceses-logos bucket hiánya adott „Bucket not found"-ot. Ha itt NINCS districts-logos, az S2 SQL-je hozza létre (és a felület addig se hivatkozzon rá).'
FROM storage.buckets b

UNION ALL
SELECT 1450, '0/N · STORAGE BUCKET',
       'Létezik-e a districts-logos bucket?',
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE name='districts-logos')
            THEN '✅ igen' ELSE '— nincs (az S2 hozza létre)' END,
       'A kerületi címer / pecsét / aláírás ide kerül, a 2026-04-18-dioceses-cimer-setup.sql mintájára (ugyanolyan storage policy-kkal).'

UNION ALL
SELECT 1451, '0/N · EGYÉB',
       'Létezik-e district_felterjesztes tábla?',
       CASE WHEN to_regclass('public.district_felterjesztes') IS NULL
            THEN '✅ nincs — és a K3 döntés szerint NEM is lesz'
            ELSE '⚠️ VAN — pedig a K3 szerint a kerület a lánc teteje' END,
       'K3: nincs 4. szint (Zsinat). A kerületi véglegesítés ZÁROL, de nem küld fel sehova.'

ORDER BY sorszam;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE — SEMMI NEM MÓDOSULT.                                               ║
-- ║                                                                          ║
-- ║ MIT CSINÁLJ AZ EREDMÉNNYEL:                                              ║
-- ║  1. Olvasd végig a ⛔ jelűeket — azok blokkolják a következő szeletet.    ║
-- ║  2. Küldd vissza az egész táblázatot (képernyőkép vagy másolás).         ║
-- ║  3. A 0/E és 0/M szakasz a K4 döntésed alapja — nézd meg a számokat.      ║
-- ║                                                                          ║
-- ║ A KÖVETKEZŐ SQL (S1) EBBŐL az eredményből épül, nem a repó fájljaiból.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
