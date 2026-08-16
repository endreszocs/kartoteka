-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI S1c — A KERÜLETI RÁLÁTÁS BEZÁRÁSA (K4)         2026-08-16 ║
-- ║ Fájl: migration-docs/sql/2026-08-16-egyhazkeruleti-S1c-ralatas-bezaras   ║
-- ║ (docs/EGYHAZKERULETI-SZINT-INDITO-BRIEF-2026-08-15.md, S1c szelet)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- ENDRE DÖNTÉSE (K4) — SZÓ SZERINT
-- ════════════════════════════════════════════════════════════════════════════
--
--   „A kerület nem írhatja és nem is olvashatja a kerület gyülekezeteinek és
--    egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve
--    azoknak az összesítőjét!"
--
-- Ez a fájl EZT az egyetlen mondatot érvényesíti az adatbázisban. Nem tesz
-- hozzá semmit, és nem is vesz el többet nála.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT VESZÜNK EL (a mondat első fele)
-- ════════════════════════════════════════════════════════════════════════════
--
--  (1) A GYÜLEKEZETI SOROK OLVASÁSÁT. Ma a kerületi admin SOR-SZINTEN
--      belelát a kerülete MINDEN gyülekezetének a nyilvántartásába: személyek,
--      családok, befizetések, kiadások, sírhelyek, iratok — mindenütt, ahol a
--      `felettes_szint_hozzaferese()` vagy a `felettes_szint_gyulekezet_ids()`
--      a kapu (ez ma ~50+ `<tábla>_szint_select` policy). A két függvény
--      MEGYE-ONLY alakra áll át: a kerületi láb kikerül belőlük.
--      A törzset BETŰHŰEN a 2026-08-11-globalis-hozzaferes-szukites.sql
--      ELŐKÉSZÍTETT, de SOHA LE NEM FUTOTT „2/B SZAKASZ"-ából vesszük át
--      (az S0 igazolta: a `felettes_szint_hozzaferese` élő törzse MA IS
--      tartalmaz `district_id`-t, tehát a 2/B tényleg nem futott le).
--
--  (2) A MEGYEI PÉNZÜGYI KÖNYVEK ÍRÁSÁT-OLVASÁSÁT. Az öt megyei pénzügyi
--      policy (diocese_bealitas_all, diocese_befizetes_all, diocese_kiadas_all,
--      diocese_koltsegvetes_all, diocese_annual_reports_all — mai alakjuk a
--      2026-08-15-egyhazmegyei-rls-szerep-szuro.sql-ből) harmadik ága ma a
--      `current_user_district_ids()`-t hívja, vagyis a kerületi admin a saját
--      kerülete MEGYÉINEK a könyveit írhatja is. A mondat második tagmondata
--      („és egyházmegyéinek az adatait") pontosan ezt tiltja: az ág megszűnik.
--      A megyei ág (current_user_diocese_ids) és a rendszergazda-ág
--      VÁLTOZATLAN, a számvevői olvasó policy (`_szamvevo_select`) érintetlen.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT NEM VESZÜNK EL (a mondat második fele: „csak a hivatalosan beküldött
-- adatokat illetve azoknak az összesítőjét")
-- ════════════════════════════════════════════════════════════════════════════
--
--  (A) A DOKUMENTUMKÖZPONTOT. A `document_submissions` táblán KÉT dedikált
--      kerületi policy él (2026-08-09-megye-kerulet-rls-fix.sql:82-183):
--        · document_submissions_district_select — csak
--          `forwarded_to_kerulet = true` VAGY `status = 'finalized'`;
--        · document_submissions_district_update — csak
--          `forwarded_to_kerulet = true`.
--      EZEK a „hivatalosan beküldött adatok" ablakai. Saját EXISTS-láncuk van
--      (nem hívják a felettes_szint_* függvényeket), tehát a szűkítés NEM
--      érinti őket, és a `getSubmissionMatrix('district')` továbbra is
--      megtelik. ⚠️ AZ 1. SZAKASZ ŐRSZEME FAIL-CLOSED MÓDON MEGKÖVETELI a
--      létezésüket: ha hiányoznának, a fájl RAISE EXCEPTION-nel megáll, mert
--      akkor a szűkítés elvenné a kerület dokumentum-központját.
--
--  (B) A FELTERJESZTÉSI CSATORNÁT. A `diocese_felterjesztes` kerületi policy-i
--      (diocese_felterjesztes_kerulet_select / _kerulet_update,
--      2026-08-15-egyhazmegyei-uj-tablak.sql:297-311) KÖZVETLENÜL a
--      `current_user_district_ids()`-t hívják a sor SAJÁT `district_id`
--      oszlopán — nem a felettes_szint_* kapukon állnak. Ezek MARADNAK: ez az
--      a csatorna, amin a megye hivatalosan felterjeszt a kerülethez.
--      ⚠️ A `diocese_felterjesztes_all` policy NEM tartalmaz kerületi ágat —
--      azt ez a fájl NEM ÉRINTI.
--
--  (C) AZ ÉVES JELENTÉS KERÜLETI ABLAKÁT. Az `annual_reports_select_district`
--      (2026-08-09-megye-kerulet-rls-fix.sql:773) ugyanazzal a szabállyal
--      dolgozik, mint a dokumentum-ablak (továbbított VAGY véglegesített),
--      és szintén saját EXISTS-lánca van → érintetlen.
--
--  (D) AZ ÖSSZESÍTŐT. A `district_member_counts()` RPC (2026-08-11-kerulet-
--      letszam-osszesito.sql) SECURITY DEFINER aggregátum — sorokat nem ad
--      vissza, csak darabszámokat. Ez „az összesítő", amit Endre engedélyez.
--
--  (E) A GYÜLEKEZETI TÖRZSADAT SZERKESZTÉSÉT — és ez a fájl legkényesebb
--      döntése, ezért külön alcím alatt áll:
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ MIÉRT MARAD MEG A `felettes_szint_szerkesztheto(uuid)` KERÜLETI LÁBA
-- ════════════════════════════════════════════════════════════════════════════
--
-- A `felettes_szint_szerkesztheto(uuid)` törzse MA LOGIKAILAG UGYANAZ, mint a
-- `felettes_szint_hozzaferese(uuid)`-é — betűre NEM: a szerkesztési kapu
-- törzsében ott áll a „a KERÜLETI láb itt MINDIG bent van (2/B nem érinti)"
-- magyarázó komment (a 0/A-4. sor ezért normalizálva, kommentek nélkül mér) —
-- mégis SZÁNDÉKOSAN KÜLÖN FÜGGVÉNY
-- (2026-08-11-globalis-hozzaferes-szukites.sql:988-1019). A különválasztás
-- PONTOSAN ERRE A NAPRA készült: ha egyetlen közös kapu lenne, akkor a mai
-- szűkítés NÉMÁN elvenne valamit, ami NEM „a gyülekezet adata".
--
-- Mit ad ez a függvény? A `current_user_can_edit_congregation()`-ön keresztül
-- a gyülekezet TÖRZSADATÁNAK (hivatalos név, cím, besorolás) a szerkesztését.
-- Ez ADMINISZTRATÍV, NYILVÁNTARTÁS-VEZETŐI funkció — a kerület a saját
-- gyülekezet-jegyzékét vezeti vele —, nem a gyülekezet belső adata (nem
-- anyakönyv, nem pénzügy, nem személyes adat). A K4 mondat a gyülekezet
-- ADATAIRÓL szól; a gyülekezet-jegyzék a kerület saját adminisztrációja.
--
-- ❓ EZ ENDRE DÖNTÉSE, ÉS DÖNTHET MÁSKÉPP. Ha azt mondja, hogy a kerület a
--    gyülekezet nevét-címét se írhassa, az EGY SOROS változtatás egy külön
--    fájlban: ugyanezzel a megye-only törzzsel felül kell írni a
--    `felettes_szint_szerkesztheto(uuid)`-t is. A 0. szakasz 3. sora ezért
--    KIÍRJA a mai állapotát — hogy ne legyen néma.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI NINCS BENNE (szándékosan, külön szeletben)
-- ════════════════════════════════════════════════════════════════════════════
--   · A `dioceses` / `districts` hivatalos törzsadatának (CIF, IBAN, pecsét)
--     szűkítése a BEJELENTKEZETT felhasználók felé. Ma minden bejelentkezett
--     látja minden egyházmegye CIF-jét — ez SZÉLESEBB döntés (az S1 fejléce
--     már jelezte), és nem csak a kerületet érinti.
--   · A `profile_roles_admin_manage` hatókör nélküli USING-ága (11. csapda).
--   · A kerületi SAJÁT könyvelés (K2) — az az S5 szelet.
--
-- ════════════════════════════════════════════════════════════════════════════
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok)
-- ════════════════════════════════════════════════════════════════════════════
--   · „A migration-fájl NEM bizonyíték arra, hogy lefutott élesben" → a 0.
--     SZAKASZ az ÉLŐ `pg_proc.prosrc`-t és az ÉLŐ `pg_policies`-t méri, nem a
--     repót. (Épp ez derítette ki, hogy a 2/B szakasz sosem futott le.)
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403-leállás" → az
--     őrszem `has_function_privilege`-dzsel ellenőriz, és pótol, MÉG a
--     policy-csere ELŐTT, UGYANABBAN a tranzakcióban.
--   · „Skalár hatókör + `if (id) filter` = néma teljes szivárgás" → az új
--     törzsek `= ANY (...)` alakúak, üres hatókörre FALSE / üres tömb
--     (fail-closed), és a policy-k `COALESCE(..., '{}'::uuid[])`-cel hívnak.
--   · A hatókört SZŰKÍTŐ lépés legveszélyesebb kimenetele nem a szivárgás,
--     hanem a NÉMA RENDELKEZÉSRE-ÁLLÁSI KIESÉS: valaki reggel üres képernyőt
--     lát hibaüzenet nélkül. Ezért van a 0/B fail-closed előfeltétel és a 2.
--     szakasz REGRESSZIÓS ŐRE ugyanazokra a policy-kra.
--
-- ÚJ TÁBLA NEM JÖN LÉTRE → a backup_table_policy besorolást ez a fájl nem
-- érinti (a kulcsoszlop egyébként `tabla`, NEM `table_name` — lásd #172).
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az UTOLSÓ utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--       ⚠️ EZT TÉNYLEG OLVASD EL: a 0/D szakasz NÉV SZERINT felsorolja azokat
--          a táblákat, amiket a kerület a futtatás után NEM lát többé.
--   2.  1. SZAKASZ — A SZŰKÍTÉS. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--       Utána a KÉZI PRÓBA (a 2. szakasz 900-as sora írja le).
--
-- IDEMPOTENS: minden lépés őrzött vagy CREATE OR REPLACE / DROP+CREATE;
-- akárhányszor újrafuttatható, ugyanoda konvergál.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 0/A · A HÁROM KAPU-FÜGGVÉNY MAI, ÉLŐ TÖRZSE ────────────────────────────
SELECT 1 AS sorszam,
       '0/A · A HÁROM KAPU' AS szakasz,
       'felettes_szint_hozzaferese(uuid) — van ma KERÜLETI láb? (district_id a törzsben)' AS mit,
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%district_id%'
                             THEN '⚠️ IGEN — a kerület MA sor-szinten olvassa a gyülekezeteit (ezt zárjuk be)'
                             ELSE '✅ nem — MÁR megye-only (a szűkítés lefutott, újrafuttatás rendben)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_hozzaferese'
                 LIMIT 1), '⛔ NINCS ILYEN FÜGGVÉNY') AS ertek,
       'Ha ⛔: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 1. szakasza fusson le — enélkül az őrszem leáll.' AS teendo

UNION ALL
SELECT 2, '0/A · A HÁROM KAPU',
       'felettes_szint_gyulekezet_ids() — van ma KERÜLETI láb? (district_id a törzsben)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%district_id%'
                             THEN '⚠️ IGEN — a lista-policy-k (~50 tábla) ma beengedik a kerületet'
                             ELSE '✅ nem — MÁR megye-only' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_gyulekezet_ids'
                 LIMIT 1), '⛔ NINCS ILYEN FÜGGVÉNY'),
       'Ezt a függvényt hívják a <tábla>_szint_select policy-k `= ANY (COALESCE((SELECT …), ''{}''::uuid[]))` alakban.'

UNION ALL
SELECT 3, '0/A · A HÁROM KAPU',
       '⚠️ felettes_szint_szerkesztheto(uuid) — MEGMARAD a kerületi lába? (SZÁNDÉKOSAN igen)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%district_id%'
                             THEN '✅ IGEN, és MEGMARAD — a gyülekezeti TÖRZSADAT (név, cím) szerkesztése adminisztratív funkció, nem „a gyülekezet adata"'
                             ELSE '⚠️ NINCS benne kerületi láb — a kerület MA SEM tudja szerkeszteni a gyülekezet törzsadatát (nem ez a fájl vette el)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_szerkesztheto'
                 LIMIT 1), '⚠️ nincs ilyen függvény'),
       '❓ ENDRE DÖNTHET MÁSKÉPP. Ha a kerület a gyülekezet nevét-címét se írhassa, szólj: egy külön fájl ugyanezzel a megye-only törzzsel felülírja ezt a függvényt is. E fájl NEM nyúl hozzá — a fejléc magyarázza, miért.'

UNION ALL
SELECT 4, '0/A · A HÁROM KAPU',
       'A két olvasó kapu törzse LOGIKAILAG azonos-e ma a szerkesztési kapuéval? (ha igen: a különválás még csak „papíron" van)',
       -- ⚠️ TÜNET, AMIT EZ A NORMALIZÁLÁS JAVÍT: a nyers `count(DISTINCT prosrc)`
       --    2-t adott, mert a két ÉLŐ törzs EGYETLEN KOMMENTBEN tér el (a
       --    szerkesztési kapuéban ott áll a „a KERÜLETI láb itt MINDIG bent van
       --    (2/B nem érinti)" magyarázat). Így ez a sor azt írta ki, hogy „már
       --    szétváltak" — ami ELLENTMONDOTT a fájl saját fejlécének, és azt a
       --    hamis benyomást keltette, hogy a szerkesztési kaput valaki már
       --    átírta. A mérés ezért kivágja a `--` kommenteket és egységesíti a
       --    whitespace-t: a LOGIKÁT méri, nem a tipográfiát.
       --    NE „egyszerűsítsd" vissza nyers prosrc-összehasonlításra.
       CASE WHEN (SELECT count(DISTINCT
                           btrim(regexp_replace(
                                   regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
                                   '\s+', ' ', 'g')))
                  FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public'
                    AND p.proname IN ('felettes_szint_hozzaferese', 'felettes_szint_szerkesztheto')) = 1
            THEN 'igen — ma logikailag azonosak (csak a kommentjük tér el; a futtatás után SZÉTVÁLNAK: ez a fájl célja)'
            ELSE 'nem — már szétváltak' END,
       'Tájékoztató. A 2026-08-11-es fájl azért csinált két függvényt, hogy a mai szűkítés ne vegye el némán a szerkesztési jogot.'

-- ── 0/B · FAIL-CLOSED ELŐFELTÉTEL: a kerület DOKUMENTUM-ABLAKAI ────────────
-- Ha ezek nincsenek meg, a szűkítés elvenné a kerület dokumentum-központját
-- (getSubmissionMatrix('district') → üres képernyő, hibaüzenet nélkül).
UNION ALL
SELECT 10, '0/B · ⛔ FAIL-CLOSED ELŐFELTÉTEL',
       'Él a document_submissions_district_select? (a „hivatalosan beküldött adatok" OLVASÓ ablaka)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pp
                         WHERE pp.schemaname = 'public'
                           AND pp.tablename = 'document_submissions'
                           AND pp.policyname = 'document_submissions_district_select')
            THEN '✅ él (forwarded_to_kerulet = true VAGY status = ''finalized'')'
            ELSE '⛔ NINCS MEG — az 1. szakasz RAISE EXCEPTION-nel MEGÁLL' END,
       'Ha ⛔: NE FUTTASD az 1. szakaszt. Előbb a 2026-08-09-megye-kerulet-rls-fix.sql 1a) pontja fusson le, különben a szűkítés elvenné a kerület dokumentum-központját.'

UNION ALL
SELECT 11, '0/B · ⛔ FAIL-CLOSED ELŐFELTÉTEL',
       'Él a document_submissions_district_update? (átvétel-nyugtázás a továbbított iraton)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pp
                         WHERE pp.schemaname = 'public'
                           AND pp.tablename = 'document_submissions'
                           AND pp.policyname = 'document_submissions_district_update')
            THEN '✅ él (csak forwarded_to_kerulet = true)'
            ELSE '⛔ NINCS MEG — az 1. szakasz RAISE EXCEPTION-nel MEGÁLL' END,
       'Ugyanaz a teendő, mint a 10. sornál. Az acknowledgeKeruletReceipt() ezen a policy-n át ír.'

UNION ALL
SELECT 12, '0/B · ⛔ FAIL-CLOSED ELŐFELTÉTEL',
       'A két kerületi dokumentum-policy FÜGGETLEN-e a szűkítendő kapuktól? (nem hívja a felettes_szint_*-ot)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pp
                         WHERE pp.schemaname = 'public'
                           AND pp.tablename = 'document_submissions'
                           AND pp.policyname IN ('document_submissions_district_select',
                                                 'document_submissions_district_update')
                           AND (COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
                                 LIKE '%felettes_szint%')
            THEN '⛔ VESZÉLY — valamelyik kerületi policy a szűkítendő kapun áll: a szűkítés ELVENNÉ a dokumentum-központot!'
            ELSE '✅ független (saját EXISTS-lánc a congregations→dioceses valódi láncon)' END,
       'Ha ⛔: az 1. szakasz őrszeme megáll. Ilyenkor előbb a kerületi dokumentum-policy-kat kell saját lábra állítani.'

UNION ALL
SELECT 13, '0/B · MEGMARADÓ ABLAKOK',
       'Él az annual_reports_select_district? (az éves jelentés kerületi ablaka)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pp
                         WHERE pp.schemaname = 'public'
                           AND pp.tablename = 'annual_reports'
                           AND pp.policyname = 'annual_reports_select_district')
            THEN '✅ él (továbbított VAGY véglegesített) — érintetlen marad'
            ELSE '⚠️ nincs — a kerületi éves-jelentés KPI ma is üres' END,
       'Nem blokkoló (ez a fájl nem érinti), de jó tudni: ez is a „hivatalosan beküldött adatok" ablaka.'

UNION ALL
SELECT 14, '0/B · MEGMARADÓ ABLAKOK',
       'Él a district_member_counts() összesítő RPC? („azoknak az összesítőjét")',
       CASE WHEN to_regprocedure('public.district_member_counts(uuid)') IS NULL
            THEN '⚠️ nincs — az összesítő nézet hiányozna'
            ELSE '✅ létezik (SECURITY DEFINER aggregátum: darabszám, nem sorok)' END,
       'Ez az a „összesítő", amit a K4 mondat kifejezetten megenged a kerületnek. Sorokat nem ad vissza.'

-- ── 0/C · AZ 5 MEGYEI PÉNZÜGYI POLICY KERÜLETI ÁGA ─────────────────────────
UNION ALL
SELECT (20 + row_number() OVER (ORDER BY t.tabla))::int,
       '0/C · MEGYEI PÉNZÜGY',
       t.tabla || '.' || t.tabla || '_all',
       CASE
         WHEN pol.policyname IS NULL THEN '⚠️ NINCS ilyen policy (repó⇄produkció eltérés) — az 1. szakasz létrehozza a kanonikus alakot'
         WHEN (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, '')) LIKE '%current_user_district_ids%'
           THEN '⚠️ VAN kerületi ág — a kerület ma ÍRJA a megye könyveit (ezt vesszük el)'
         WHEN (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, '')) LIKE '%current_user_diocese_ids%'
           THEN '✅ MÁR kerületi ág NÉLKÜLI, kanonikus alak (újrafuttatás rendben)'
         ELSE '⛔ ISMERETLEN alak — NÉZD MEG KÉZZEL a pg_policies-ban, mielőtt futtatsz!'
       END,
       'Az 1. szakasz idempotensen a kétágú (rendszergazda + megyei írók) alakra cseréli. A _szamvevo_select olvasó policy érintetlen marad.'
FROM (VALUES ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
             ('diocese_koltsegvetes'), ('diocese_annual_reports')) AS t(tabla)
LEFT JOIN pg_policies pol
  ON pol.schemaname = 'public' AND pol.tablename = t.tabla
 AND pol.policyname = t.tabla || '_all'

UNION ALL
SELECT 28, '0/C · AMIHEZ NEM NYÚLUNK',
       'diocese_felterjesztes_all — van benne kerületi ág? (VÁRT: nincs → nem bántjuk)',
       COALESCE((SELECT CASE WHEN (COALESCE(pp.qual,'') || ' ' || COALESCE(pp.with_check,''))
                                  LIKE '%current_user_district_ids%'
                             THEN '⚠️ VAN — ezt NEM vártuk, szólj mielőtt futtatsz'
                             ELSE '✅ nincs — érintetlen marad' END
                 FROM pg_policies pp
                 WHERE pp.schemaname = 'public' AND pp.tablename = 'diocese_felterjesztes'
                   AND pp.policyname = 'diocese_felterjesztes_all' LIMIT 1),
                '⚠️ nincs ilyen policy'),
       'A felterjesztési csatorna kerületi joga a KÜLÖN diocese_felterjesztes_kerulet_select/_update policy-kon áll (lásd 0/E) — azok maradnak.'

-- ── 0/D · MIT VESZÍT A KERÜLET: SZÁMOKKAL ÉS NÉV SZERINT ───────────────────
UNION ALL
SELECT 30, '0/D · MIT VESZÍT A KERÜLET',
       'HÁNY policy áll a szűkítendő két kapun? (ennyi helyen szűnik meg a kerületi rálátás EGY csapásra)',
       -- ⚠️ A két LIKE KÖZÖS zárójelben: az AND erősebben köt az OR-nál, tehát
       --    zárójel nélkül a második ág a séma-szűrőt is kikerülné.
       (SELECT count(*)::text || ' policy'
        FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND ((COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
                 LIKE '%felettes_szint_gyulekezet_ids%'
            OR (COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
                 LIKE '%felettes_szint_hozzaferese%')),
       '⚠️ EZ A LÉPÉS SÚLYA. A policy-kat NEM írjuk át — a KAPUT szűkítjük, tehát mind egyszerre vált. Az esperes/megyei admin hozzáférése VÁLTOZATLAN (a megyei láb bent marad).'

UNION ALL
SELECT 31, '0/D · MIT VESZÍT A KERÜLET',
       'HÁNY KÜLÖNBÖZŐ TÁBLÁRÓL tűnik el a kerületi sor-rálátás?',
       (SELECT count(DISTINCT pp.tablename)::text || ' tábla'
        FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND ((COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
                 LIKE '%felettes_szint_gyulekezet_ids%'
            OR (COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
                 LIKE '%felettes_szint_hozzaferese%')),
       'A tételes lista a 0/D 51-es sorszámtól kezdődik — OLVASD VÉGIG.'

UNION ALL
SELECT 32, '0/D · MIT VESZÍT A KERÜLET',
       'Hány kerületi (district hatókörű, aktív, jóváhagyott) profile_roles sor van élesben?',
       (SELECT count(*)::text || ' sor / ' || count(DISTINCT pr.profile_id)::text || ' fő'
        FROM public.profile_roles pr
        WHERE pr.scope = 'district' AND pr.active = true AND pr.approval_status = 'approved'),
       'Ennyi embert érint a változás. Ha éles felhasználó van köztük, ÉRTESÍTSD: holnaptól a gyülekezeti listák helyett a beküldött iratokat és az összesítőt látja.'

UNION ALL
SELECT (50 + row_number() OVER (ORDER BY pp.tablename, pp.policyname))::int,
       '0/D · NÉV SZERINT: EZT VESZTI EL',
       pp.tablename || '.' || pp.policyname || '  (' || pp.cmd || ')',
       '⚠️ a kerület ezen a táblán MA sor-szinten lát — a futtatás után NEM',
       'Ha valamelyik táblát a kerületnek MÉGIS látnia kell, az NEM ezen a kapun át fog menni: dedikált, hivatalos-beküldés-alapú policy-t kap (mint a document_submissions_district_select). Szólj, melyik az.'
FROM pg_policies pp
WHERE pp.schemaname = 'public'
  AND ((COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
         LIKE '%felettes_szint_gyulekezet_ids%'
    OR (COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, ''))
         LIKE '%felettes_szint_hozzaferese%')

-- ── 0/E · MI MARAD A KERÜLETNEK (a mondat második fele) ────────────────────
UNION ALL
SELECT 500, '0/E · MI MARAD',
       'diocese_felterjesztes_kerulet_select — a megyék felterjesztéseinek OLVASÁSA',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pp
                         WHERE pp.schemaname = 'public'
                           AND pp.tablename = 'diocese_felterjesztes'
                           AND pp.policyname = 'diocese_felterjesztes_kerulet_select')
            THEN '✅ él — közvetlenül a current_user_district_ids()-t hívja, ez a fájl NEM érinti'
            ELSE '⚠️ nincs — futtasd a 2026-08-15-egyhazmegyei-uj-tablak.sql-t' END,
       'Ez a hivatalos felterjesztési csatorna kerületi vége.'

UNION ALL
SELECT 501, '0/E · MI MARAD',
       'diocese_felterjesztes_kerulet_update — átvétel-nyugtázás / visszaküldés',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pp
                         WHERE pp.schemaname = 'public'
                           AND pp.tablename = 'diocese_felterjesztes'
                           AND pp.policyname = 'diocese_felterjesztes_kerulet_update')
            THEN '✅ él — érintetlen marad'
            ELSE '⚠️ nincs — futtasd a 2026-08-15-egyhazmegyei-uj-tablak.sql-t' END,
       'Csak SELECT + UPDATE; INSERT/DELETE a kerületnek nincs ezen a táblán.'

UNION ALL
SELECT 502, '0/E · MI MARAD',
       'congregations SELECT-je USING(true)? (a kerület gyülekezet-JEGYZÉKE megmarad)',
       COALESCE((SELECT CASE WHEN COALESCE(pp.qual, '') IN ('true', '(true)')
                             THEN '✅ igen — a gyülekezetek NEVE/besorolása továbbra is látszik (jegyzék, nem belső adat)'
                             ELSE '⚠️ nem USING(true): ' || left(COALESCE(pp.qual, ''), 80) END
                 FROM pg_policies pp
                 WHERE pp.schemaname = 'public' AND pp.tablename = 'congregations'
                   AND pp.policyname = 'congregations_select' LIMIT 1),
                '⚠️ nincs congregations_select policy'),
       'FONTOS: emiatt a dokumentumközpont gyülekezet-oszlopa a szűkítés után is kitöltődik. Ha ez NEM kívánatos, az KÜLÖN, szélesebb döntés (a publikus /gy/[slug] oldalakat is érinti).'

-- ── 0/F · GRANT-OK (a policy a HÍVÓ szerepében fut) ────────────────────────
UNION ALL
SELECT (600 + row_number() OVER (ORDER BY f.fn))::int,
       '0/F · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn || '()',
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
              THEN '✅ van'
            ELSE '⛔ NINCS GRANT — az erre épülő policy 403-mal ÁLL LE (nem tagad: HIBÁZIK)' END,
       'Ha ⛔: az 1. szakasz pótolja, MÉG a policy-csere ELŐTT, ugyanabban a tranzakcióban.'
FROM (VALUES ('current_user_has_global_access'),
             ('current_user_diocese_ids'),
             ('current_user_diocese_olvaso_ids'),
             ('current_user_district_ids'),
             ('felettes_szint_gyulekezet_ids')) AS f(fn)

UNION ALL
SELECT 620, '0/F · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: felettes_szint_hozzaferese(uuid)',
       CASE WHEN to_regprocedure('public.felettes_szint_hozzaferese(uuid)') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('authenticated',
                   'public.felettes_szint_hozzaferese(uuid)'::regprocedure, 'EXECUTE')
              THEN '✅ van' ELSE '⛔ NINCS GRANT' END,
       'A CREATE OR REPLACE MEGŐRZI a meglévő GRANT-okat, de az 1. szakasz a biztonság kedvéért újra kiadja.'

UNION ALL
SELECT 621, '0/F · RLS-ÁLLAPOT',
       'Be van kapcsolva az RLS mind az 5 megyei pénzügyi táblán? (5 = rendben)',
       (SELECT count(*)::text || ' / 5'
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relrowsecurity
          AND c.relname IN ('diocese_bealitas', 'diocese_befizetes', 'diocese_kiadas',
                            'diocese_koltsegvetes', 'diocese_annual_reports')),
       'Ha nem 5: azon a táblán a policy TÉTLEN — a GRANT alapján nyitva van. Az 1. szakasz WARNING-gal jelzi, de nem kapcsolja be (az külön, tudatos döntés).'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A SZŰKÍTÉS                                 FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ (őrszem + GRANT-ok + függvények + policy-k).      ║
-- ║ ⚠️ EZ HATÓKÖRT SZŰKÍT. Előtte OLVASD EL a 0/D szakasz név szerinti       ║
-- ║    listáját — az mutatja meg, mit veszít a kerület.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ──────────────────────────────────────
DO $orszem$
BEGIN
  -- (1) A szűkítendő két kapunak LÉTEZNIE kell.
  IF to_regprocedure('public.felettes_szint_hozzaferese(uuid)') IS NULL
     OR to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a felettes_szint_hozzaferese(uuid) vagy a felettes_szint_gyulekezet_ids() — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql 1. szakasza fusson le. Nem ez az adatbázis, vagy a fázis kimaradt.';
  END IF;

  -- (2) A megye-only törzs a current_user_diocese_ids()-re épül.
  IF to_regprocedure('public.current_user_diocese_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_diocese_ids() — az új, megye-only törzs erre épül. ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_has_global_access() — az 5 megyei policy rendszergazda-ága erre épül.';
  END IF;

  -- (3) A globál-függvény nem lehet a RÉGI, tág (esperest is beengedő) törzs —
  --     különben az újraépített policy-k GLOBÁLIS írást adnának minden esperesnek.
  --
  --     ⚠️ A minta SZÁNDÉKOSAN IDÉZŐJELES ('esperes'), és pontosan azt méri,
  --        amit a forrásfájl kanonikus ellenőrzése
  --        (2026-08-11-globalis-hozzaferes-szukites.sql, 6/A-601. sor):
  --            pg_get_functiondef(oid) NOT LIKE '%''esperes''%'
  --        TÜNET, AMIT MEGELŐZ: idézőjel nélküli `%esperes%` mintára egyetlen
  --        később hozzátoldott MAGYARÁZÓ KOMMENT is illeszkedne (pl. „az esperes
  --        már nem globális") — HAMIS POZITÍV, és ez a FAIL-CLOSED őr az EGÉSZ
  --        S1c tranzakciót megállítaná, holott a törzs helyes. Ugyanaz a
  --        hibaosztály, mint a pg_get_constraintdef LIKE-os keresése, ami már
  --        egyszer elsült. NE „egyszerűsítsd" vissza az idézőjelek nélküli
  --        alakra, és NE cseréld prosrc-re: a szerep-listát a TÉNYLEGES
  --        SQL-literál hordozza, a kommentszöveg nem számít.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
      AND pg_get_functiondef(p.oid) LIKE '%''esperes''%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_has_global_access() még a RÉGI (esperest is globálisnak vevő) törzs — ELŐBB a 2026-08-11-es szűkítő fájl 2a szakasza fusson le.';
  END IF;

  -- (4) ⛔ A LEGFONTOSABB ŐR: a kerület DOKUMENTUM-ABLAKAI. Ha ezek nincsenek,
  --     a szűkítés elvenné a kerület dokumentum-központját (getSubmissionMatrix
  --     ('district') → néma üres képernyő). Ilyenkor NEM futunk le.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'document_submissions'
      AND pp.policyname = 'document_submissions_district_select'
  ) THEN
    RAISE EXCEPTION '⛔ NINCS document_submissions_district_select policy. A szűkítés ELVENNÉ a kerület dokumentum-központját (getSubmissionMatrix(''district'')). ELŐBB a 2026-08-09-megye-kerulet-rls-fix.sql 1a) pontja fusson le.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'document_submissions'
      AND pp.policyname = 'document_submissions_district_update'
  ) THEN
    RAISE EXCEPTION '⛔ NINCS document_submissions_district_update policy. A kerület nem tudná nyugtázni a hozzá továbbított iratok átvételét. ELŐBB a 2026-08-09-megye-kerulet-rls-fix.sql 1b) pontja fusson le.';
  END IF;

  -- (5) A kerületi dokumentum-policy-k NEM állhatnak a szűkítendő kapukon —
  --     különben a szűkítés rajtuk keresztül is ütne.
  IF EXISTS (
    SELECT 1 FROM pg_policies pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'document_submissions'
      AND pp.policyname IN ('document_submissions_district_select',
                            'document_submissions_district_update')
      AND (COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, '')) LIKE '%felettes_szint%'
  ) THEN
    RAISE EXCEPTION '⛔ Valamelyik kerületi dokumentum-policy a szűkítendő felettes_szint_* kapun áll — a szűkítés elvenné a dokumentum-központot. Előbb állítsd saját (congregations→dioceses) lábra.';
  END IF;

  -- (6) A szerkesztési kapu állapotának KIMONDÁSA (nem blokkoló). A kerületi
  --     törzsadat-szerkesztés SZÁNDÉKOSAN megmarad — ha már korábban elveszett,
  --     azt HANGOSAN tudni kell, nehogy ennek a fájlnak tudjuk be.
  IF to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NULL THEN
    RAISE WARNING '⚠️ NINCS felettes_szint_szerkesztheto(uuid). A kerületi törzsadat-szerkesztés NEM ezen a fájlon múlik, de nézd meg, mi adja ma a can_edit jogot.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_szerkesztheto'
      AND p.prosrc LIKE '%district_id%'
  ) THEN
    RAISE WARNING '⚠️ A felettes_szint_szerkesztheto(uuid) törzsében NINCS kerületi láb — a kerület MA SEM szerkeszti a gyülekezeti törzsadatot. NEM ez a fájl vette el (ez a fájl hozzá sem nyúl).';
  ELSE
    RAISE NOTICE 'ℹ️ A felettes_szint_szerkesztheto(uuid) kerületi lába ÉRINTETLEN marad — a gyülekezeti törzsadat (név, cím) szerkesztése megmarad a kerületnek.';
  END IF;

  RAISE NOTICE '⚠️ S1c: a kerületi admin SOR-szintű olvasása MOST megszűnik. Marad: a hivatalosan beküldött iratok (document_submissions_district_*), a felterjesztések (diocese_felterjesztes_kerulet_*), az éves jelentés kerületi ablaka és a district_member_counts() összesítő.';
END
$orszem$;

-- A policy-kban hívott függvények EXECUTE joga (idempotens; a policy a HÍVÓ
-- szerepében fut — EXECUTE nélkül nem „0 sort ad", hanem 42501/403-mal elszáll).
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_gyulekezet_ids()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_hozzaferese(uuid)  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) A KÉT OLVASÓ KAPU MEGYE-ONLY ALAKRA
-- ────────────────────────────────────────────────────────────────────────────
-- A két törzs BETŰHŰEN a 2026-08-11-globalis-hozzaferes-szukites.sql
-- „2/B SZAKASZ"-ából (2546-2595. sor) származik. Az a szakasz azért készült
-- előre, hogy amikor Endre meghozza a K4 döntést, ne kelljen újratervezni —
-- csak lefuttatni. A `district_id`-s láb (a `LEFT JOIN public.dioceses d`
-- és a `d.district_id = ANY (public.current_user_district_ids())` feltétel)
-- kikerül; a JOIN-ra a megyei ágnak nincs szüksége.
--
-- ⚠️ A `felettes_szint_szerkesztheto(uuid)` SZÁNDÉKOSAN NEM SZEREPEL ITT.

CREATE OR REPLACE FUNCTION public.felettes_szint_hozzaferese(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_kapu_b$
  -- v2026-08-16-S1c (a 2026-08-11-es 2/B változat: KERÜLETI LÁB NÉLKÜL)
  SELECT EXISTS (
    SELECT 1
    FROM public.congregations c
    WHERE c.id = target_cong
      AND c.diocese_id = ANY (public.current_user_diocese_ids())
  );
$felettes_kapu_b$;

COMMENT ON FUNCTION public.felettes_szint_hozzaferese(uuid) IS
  'OLVASÁSI kapu — 2026-08-16 (S1c, Endre K4 döntése): CSAK EGYHÁZMEGYEI hatókör. IGAZ, ha a megadott gyülekezet a hívó megyéjében van. A KERÜLETI láb SZÁNDÉKOSAN kikerült: „a kerület nem írhatja és nem is olvashatja a kerület gyülekezeteinek és egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve azoknak az összesítőjét". A kerület útjai: document_submissions_district_select/_update, annual_reports_select_district, diocese_felterjesztes_kerulet_select/_update, district_member_counts(). A gyülekezeti TÖRZSADAT-SZERKESZTÉS a külön felettes_szint_szerkesztheto()-n áll — azt ez a szűkítés NEM érintette. Egyetlen PK-keresés a congregations-en (soronkénti RLS-hívásra optimalizálva); NULL-ra és üres hatókörre FALSE (fail-closed).';

CREATE OR REPLACE FUNCTION public.felettes_szint_gyulekezet_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_congs_b$
  -- v2026-08-16-S1c (a 2026-08-11-es 2/B változat: KERÜLETI LÁB NÉLKÜL)
  WITH sc AS (SELECT public.current_user_diocese_ids() AS megyek)
  SELECT CASE
    WHEN sc.megyek = '{}'::uuid[] THEN '{}'::uuid[]
    ELSE COALESCE((SELECT array_agg(DISTINCT c.id)
                   FROM public.congregations c
                   WHERE c.diocese_id = ANY (sc.megyek)), '{}'::uuid[])
  END
  FROM sc;
$felettes_congs_b$;

COMMENT ON FUNCTION public.felettes_szint_gyulekezet_ids() IS
  '2026-08-16 (S1c, Endre K4 döntése): CSAK egyházmegyei hatókör. A kerületi admin SOR-szintű OLVASÁSÁT szándékosan nem adja meg — a kerület a hivatalosan beküldött iratokat (document_submissions_district_*), a felterjesztéseket (diocese_felterjesztes_kerulet_*) és a district_member_counts() összesítő RPC-t használja. A POLICY-K EZT hívják, `= ANY (COALESCE((SELECT …), ''{}''::uuid[]))` alakban, hogy a tervező InitPlan-ként LEKÉRDEZÉSENKÉNT EGYSZER futtassa. Üres tömb = nincs felettes hatókör (FAIL-CLOSED). A kerületi TÖRZSADAT-SZERKESZTÉS a külön felettes_szint_szerkesztheto()-n áll, azt ez a változat NEM érinti.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) AZ 5 MEGYEI PÉNZÜGYI POLICY ÚJRAÉPÍTÉSE — KERÜLETI ÁG NÉLKÜL
-- ────────────────────────────────────────────────────────────────────────────
-- A mai (2026-08-15-egyhazmegyei-rls-szerep-szuro.sql, 1/A) alak HÁROM ágú:
--   (1) rendszergazda:  current_user_has_global_access()
--   (2) megyei ÍRÓK:    diocese_id ∈ current_user_diocese_ids()
--   (3) kerületi admin: dioceses.district_id ∈ current_user_district_ids()   ← ELMARAD
-- Az új alak a (3) NÉLKÜL épül újra; az (1) és (2) BETŰHŰ. Ezzel a `dioceses`
-- al-lekérdezés is kikerül a policy-ból (a mai alak egyetlen olyan pontja,
-- ami táblaszintű SELECT-et igényelt az authenticated-től).
--
-- A `<tabla>_szamvevo_select` OLVASÓ policy-khoz NEM NYÚLUNK: azok a MEGYEI
-- olvasói kört (írók + egyházmegyei számvevő) szolgálják, kerületi águk nincs.

DO $policy_ujraepites$
DECLARE
    r      record;
    v_felt text;
    v_db   integer := 0;
BEGIN
    FOR r IN
        SELECT t.tabla FROM (VALUES
            ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
            ('diocese_koltsegvetes'), ('diocese_annual_reports')
        ) AS t(tabla)
    LOOP
        -- A repó és a produkció széthúzhat: tábla/oszlop-ellenőrzés előre.
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public' AND col.table_name = r.tabla
              AND col.column_name = 'diocese_id' AND col.data_type = 'uuid'
        ) THEN
            RAISE WARNING 'ℹ️ KIHAGYVA: %.diocese_id (uuid) nem létezik ebben az adatbázisban.', r.tabla;
            CONTINUE;
        END IF;

        IF NOT (SELECT c.relrowsecurity FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = r.tabla) THEN
            RAISE WARNING '⛔ %-n NINCS BEKAPCSOLVA AZ RLS — a policy tétlen lesz!', r.tabla;
        END IF;

        -- KÉT ág: rendszergazda + megyei írók. A kerületi ág megszűnt.
        v_felt := format(
            'public.current_user_has_global_access()
             OR %I.diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), ''{}''::uuid[]))',
            r.tabla);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_all', r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
               USING (%s) WITH CHECK (%s)',
            r.tabla || '_all', r.tabla, v_felt, v_felt);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
            r.tabla || '_all', r.tabla,
            '2026-08-16 (S1c, Endre K4 döntése): KÉT ág — rendszergazda (current_user_has_global_access) és megyei ÍRÓK (current_user_diocese_ids: esperes, egyhazmegyei_admin). A KERÜLETI ág MEGSZŰNT: „a kerület nem írhatja és nem is olvashatja a kerület gyülekezeteinek és egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve azoknak az összesítőjét." A kerület a diocese_felterjesztes_kerulet_select/_update csatornán kapja meg, amit a megye hivatalosan felterjeszt. A megyei számvevő olvasása a külön _szamvevo_select policy-ban él (érintetlen). App-tükör: apps/web/lib/auth/level-scope.ts.');

        v_db := v_db + 1;
        RAISE NOTICE '✅ %_all — kerületi ág nélküli, kétágú alak.', r.tabla;
    END LOOP;

    IF v_db = 0 THEN
        RAISE EXCEPTION '⛔ EGYETLEN diocese_* tábla policy-ja sem került újraépítésre — a séma nem a várt (lásd a 0/C listát).';
    END IF;
    RAISE NOTICE 'ÖSSZESEN % megyei pénzügyi policy újraépítve, kerületi ág nélkül.', v_db;
END
$policy_ujraepites$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 2/A · A KAPUK ÁTÁLLTAK-E ───────────────────────────────────────────────
SELECT 100 AS sorszam,
       '2/A · A KAPUK' AS szakasz,
       'felettes_szint_hozzaferese(uuid) MÁR megye-only? (nincs benne district_id)' AS mit,
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%district_id%'
                             THEN '⛔ MÉG MINDIG van kerületi láb — az 1/A nem futott le'
                             ELSE '✅ megye-only' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_hozzaferese'
                 LIMIT 1), '⛔ nincs függvény') AS ertek,
       'Ha ⛔: nézd meg, a tranzakció tényleg COMMIT-tal zárult-e (a Studio csak az utolsó utasítást mutatja).' AS teendo

UNION ALL
SELECT 101, '2/A · A KAPUK',
       'felettes_szint_gyulekezet_ids() MÁR megye-only? (nincs benne district_id)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%district_id%'
                             THEN '⛔ MÉG MINDIG van kerületi láb'
                             ELSE '✅ megye-only' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_gyulekezet_ids'
                 LIMIT 1), '⛔ nincs függvény'),
       'Ez a függvény kapuzza a ~50 <tábla>_szint_select policy-t egyszerre.'

UNION ALL
SELECT 102, '2/A · ⚠️ REGRESSZIÓS ŐR',
       'felettes_szint_szerkesztheto(uuid) MÉG MINDIG tartalmaz kerületi lábat? (VÁRT: igen)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%district_id%'
                             THEN '✅ IGEN — a gyülekezeti törzsadat-szerkesztés MEGMARADT (ezt akartuk)'
                             ELSE '⛔ ELVESZETT — a kerület nem tudja szerkeszteni a gyülekezet nevét/címét!' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'felettes_szint_szerkesztheto'
                 LIMIT 1), '⚠️ nincs ilyen függvény'),
       'Ha ⛔ ÉS a 0/A 3. sora még ✅-t mutatott: valami felülírta a szerkesztési kaput is. Állítsd vissza a 2026-08-11-globalis-hozzaferes-szukites.sql 1d2) pontjából.'

UNION ALL
SELECT 103, '2/A · GRANT',
       'EXECUTE megmaradt mindkét újraírt függvényen? (2 = rendben)',
       (SELECT count(*)::text || ' / 2' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('felettes_szint_hozzaferese', 'felettes_szint_gyulekezet_ids')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
       'A CREATE OR REPLACE megőrzi a GRANT-okat, de ha nem 2: GRANT EXECUTE … TO authenticated. GRANT nélkül a policy nem tagad, hanem 403-mal HIBÁZIK.'

-- ── 2/B · ⚠️ REGRESSZIÓS ŐR: MEGVANNAK-E MÉG A KERÜLET ABLAKAI ────────────
UNION ALL
SELECT 200, '2/B · ⚠️ REGRESSZIÓS ŐR',
       'document_submissions kerületi policy-i MEGVANNAK? (2 = rendben)',
       (SELECT count(*)::text || ' / 2' FROM pg_policies pp
        WHERE pp.schemaname = 'public' AND pp.tablename = 'document_submissions'
          AND pp.policyname IN ('document_submissions_district_select',
                                'document_submissions_district_update')),
       '⛔ Ha nem 2: a kerület dokumentum-központja ÜRES lenne. Azonnal futtasd a 2026-08-09-megye-kerulet-rls-fix.sql 1a)+1b) pontját.'

UNION ALL
SELECT 201, '2/B · ⚠️ REGRESSZIÓS ŐR',
       'diocese_felterjesztes kerületi policy-i MEGVANNAK? (2 = rendben)',
       (SELECT count(*)::text || ' / 2' FROM pg_policies pp
        WHERE pp.schemaname = 'public' AND pp.tablename = 'diocese_felterjesztes'
          AND pp.policyname IN ('diocese_felterjesztes_kerulet_select',
                                'diocese_felterjesztes_kerulet_update')),
       '⛔ Ha nem 2: a felterjesztési csatorna kerületi vége szakadt el. Futtasd a 2026-08-15-egyhazmegyei-uj-tablak.sql-t.'

UNION ALL
SELECT 202, '2/B · ⚠️ REGRESSZIÓS ŐR',
       'annual_reports_select_district MEGVAN? (1 = rendben)',
       (SELECT count(*)::text || ' / 1' FROM pg_policies pp
        WHERE pp.schemaname = 'public' AND pp.tablename = 'annual_reports'
          AND pp.policyname = 'annual_reports_select_district'),
       'Ha 0: a kerületi éves-jelentés KPI üres lesz. Ezt a fájl nem érinti — ha eltűnt, más vette el.'

UNION ALL
SELECT 203, '2/B · ⚠️ REGRESSZIÓS ŐR',
       'district_member_counts() összesítő RPC MEGVAN?',
       CASE WHEN to_regprocedure('public.district_member_counts(uuid)') IS NULL
            THEN '⛔ nincs' ELSE '✅ van' END,
       'Ez „az összesítő" a K4 mondatból — a kerület fő számadata a szűkítés után.'

-- ── 2/C · AZ 5 MEGYEI PÉNZÜGYI POLICY ──────────────────────────────────────
UNION ALL
SELECT 300, '2/C · MEGYEI PÉNZÜGY',
       'Maradt-e kerületi ág a 5 policy-ban? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND pp.policyname IN ('diocese_bealitas_all','diocese_befizetes_all','diocese_kiadas_all',
                                'diocese_koltsegvetes_all','diocese_annual_reports_all')
          AND (COALESCE(pp.qual,'') || ' ' || COALESCE(pp.with_check,''))
                LIKE '%current_user_district_ids%'),
       '⛔ Ha nem 0: az 1/B ciklus kihagyott táblát — nézd meg a NOTICE/WARNING sorokat a Studio üzenet-ablakában.'

UNION ALL
SELECT 301, '2/C · MEGYEI PÉNZÜGY',
       '⚠️ A MEGYE írása MEGMARADT? (mind az 5 policy hívja a current_user_diocese_ids-t — 5 = rendben)',
       (SELECT count(*)::text || ' / 5' FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND pp.policyname IN ('diocese_bealitas_all','diocese_befizetes_all','diocese_kiadas_all',
                                'diocese_koltsegvetes_all','diocese_annual_reports_all')
          AND COALESCE(pp.qual,'')       LIKE '%current_user_diocese_ids%'
          AND COALESCE(pp.with_check,'') LIKE '%current_user_diocese_ids%'),
       '⛔ Ha nem 5: TÚL SOKAT vettünk el — az esperes elvesztette a saját megyéje könyveit. Azonnal jelezd.'

UNION ALL
SELECT 302, '2/C · MEGYEI PÉNZÜGY',
       'Maradt-e szerep-szűrő nélküli profile_roles-ág az 5 policy-ban? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND pp.policyname IN ('diocese_bealitas_all','diocese_befizetes_all','diocese_kiadas_all',
                                'diocese_koltsegvetes_all','diocese_annual_reports_all')
          AND (COALESCE(pp.qual,'') || ' ' || COALESCE(pp.with_check,'')) LIKE '%profile_roles%'),
       'Ha nem 0: a régi, kézi EXISTS-lánc él még valahol — a 2026-08-15-egyhazmegyei-rls-szerep-szuro.sql nem futott le arra a táblára.'

UNION ALL
SELECT 303, '2/C · MEGYEI PÉNZÜGY',
       'A megyei számvevő OLVASÓ policy-i érintetlenek? (5 = rendben)',
       (SELECT count(*)::text || ' / 5' FROM pg_policies pp
        WHERE pp.schemaname = 'public' AND pp.cmd = 'SELECT'
          AND pp.policyname IN ('diocese_bealitas_szamvevo_select','diocese_befizetes_szamvevo_select',
                                'diocese_kiadas_szamvevo_select','diocese_koltsegvetes_szamvevo_select',
                                'diocese_annual_reports_szamvevo_select')),
       'Ezekhez a fájl nem nyúlt. Ha nem 5, az korábbi hiány — a megyei számvevő olvasása hiányos.'

UNION ALL
SELECT 304, '2/C · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI (nem SELECT) policy olvasó-feloldót? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pp
        WHERE pp.schemaname = 'public' AND pp.cmd <> 'SELECT'
          AND (COALESCE(pp.qual,'') || ' ' || COALESCE(pp.with_check,''))
                LIKE '%current_user_diocese_olvaso_ids%'),
       '⛔ Ha nem 0: valaki írási ágba tette az olvasó hatókört — az ellenőr írhatná, amit ellenőriz.'

-- ── 2/D · MI TÖRTÉNT ÖSSZESSÉGÉBEN ─────────────────────────────────────────
UNION ALL
SELECT 400, '2/D · ÖSSZKÉP',
       'Hány policy áll a MOST megye-only kapukon? (ennyi tábláról tűnt el a kerületi rálátás)',
       (SELECT count(*)::text || ' policy / '
             || count(DISTINCT pp.tablename)::text || ' tábla'
        FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND ((COALESCE(pp.qual,'') || ' ' || COALESCE(pp.with_check,''))
                 LIKE '%felettes_szint_gyulekezet_ids%'
            OR (COALESCE(pp.qual,'') || ' ' || COALESCE(pp.with_check,''))
                 LIKE '%felettes_szint_hozzaferese%')),
       'Ugyanaz a szám, mint a 0/D 30-31. sorában — csak most már MEGYE-ONLY kaput jelentenek. Az esperes hozzáférése változatlan.'

UNION ALL
SELECT 401, '2/D · ÖSSZKÉP',
       'A kerületnek MEGMARADT dedikált policy-i (document_submissions + diocese_felterjesztes + annual_reports)',
       (SELECT count(*)::text || ' policy' FROM pg_policies pp
        WHERE pp.schemaname = 'public'
          AND pp.policyname IN ('document_submissions_district_select',
                                'document_submissions_district_update',
                                'diocese_felterjesztes_kerulet_select',
                                'diocese_felterjesztes_kerulet_update',
                                'annual_reports_select_district')),
       'VÁRT: 5. Ezek a „hivatalosan beküldött adatok" ablakai — a K4 mondat második fele.'

-- ── 2/E · KÉZI PRÓBA (ezt EMBER csinálja, nem az SQL) ──────────────────────
UNION ALL
SELECT 900, '2/E · ⚠️ KÉZI PRÓBA',
       '1. Lépj be KERÜLETI profillal (egyhazkeruleti_admin) → /dashboard-kerulet',
       'A DOKUMENTUMKÖZPONTNAK MEG KELL TELNIE',
       'Az iratlistában ott kell lennie a továbbított ÉS a véglegesített beküldéseknek, gyülekezet- és megyenévvel. Ha ÜRES: a 2/B 200-as sor a magyarázat — küldd vissza a riportot.'

UNION ALL
SELECT 901, '2/E · ⚠️ KÉZI PRÓBA',
       '2. Ugyanott: a felterjesztések és a létszám-összesítő',
       'MINDKETTŐNEK MŰKÖDNIE KELL',
       'A megyék felterjesztései (diocese_felterjesztes) látszanak és nyugtázhatók; a létszám-összesítő számokat mutat. Ha bármelyik üres: 2/B 201/203.'

UNION ALL
SELECT 902, '2/E · ⚠️ KÉZI PRÓBA',
       '3. Ugyanott: NYISS MEG egy gyülekezeti nyilvántartást (tagnyilvántartás/pénzügy)',
       'ENNEK MOSTANTÓL ÜRESNEK KELL LENNIE',
       'EZ A SZŰKÍTÉS BIZONYÍTÉKA. Ha még mindig látszanak a sorok: a 2/A 100-101. sor mutatja, hogy a kapu nem állt át (vagy a PostgREST séma-gyorsítótár régi — a NOTIFY pgrst után adj neki egy percet).'

UNION ALL
SELECT 903, '2/E · ⚠️ KÉZI PRÓBA',
       '4. Lépj be MEGYEI profillal (esperes) → /dashboard-egyhazmegye',
       'ITT SEMMI NEM VÁLTOZHATOTT',
       'A megyei listák, a megyei pénzügy és a dokumentumközpont pontosan úgy működjön, mint tegnap. Ha bármi eltűnt, TÚL SOKAT vettünk el — azonnal jelezd.'

ORDER BY 1;
