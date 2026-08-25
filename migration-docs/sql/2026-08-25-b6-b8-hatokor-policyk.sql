-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2026-08-25 — B6 + B8: HATÓKÖR-VAK STORAGE ÉS A KÖZÖS SZÁMLATÜKÖR         ║
-- ║                                                                          ║
-- ║ MIT JAVÍT:  B6 — a `logos` és a `dioceses-logos` Storage-vödör író/törlő  ║
-- ║                  policy-jának első ága PUSZTÁN A SZEREPET nézte           ║
-- ║                  (`role IN ('admin','egyhazkeruleti_admin')`), a          ║
-- ║                  fájlútvonalból kiolvasott gyülekezet-/egyházmegye-       ║
-- ║                  azonosítót SEMMILYEN hatókörrel nem vetette össze.       ║
-- ║             B8 — a `befizetescel` és a `kiadascel` (az ORSZÁGOS, KÖZÖS    ║
-- ║                  számlatükör) INSERT/UPDATE policy-ja `true` volt:        ║
-- ║                  bármelyik bejelentkezett felhasználó átírhatta.          ║
-- ║                                                                          ║
-- ║ TALÁLAT:    B6 + B8 (2026-08-24-i biztonsági átvilágítás, ÉLŐ DB-n        ║
-- ║             megerősítve — ⛔ kategória)                                   ║
-- ║ DÁTUM:      2026-08-25                                                   ║
-- ║ FUTTATÁS:   Supabase → SQL Editor. ELŐBB a 0. szakasz EGYEDÜL. Csak ha    ║
-- ║             az eredménye a lenti „ELVÁRT" oszloppal egyezik, jöhet az     ║
-- ║             1., majd — külön futtatásként — a 2. szakasz.                 ║
-- ║ IDEMPOTENS: igen (DROP POLICY IF EXISTS + CREATE POLICY, GRANT).          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- B6 — MI A BAJ, EMBERI NYELVEN
-- ════════════════════════════════════════════════════════════════════════════
-- A gyülekezetek CÍMERE, hivatali PECSÉTJE és ALÁÍRÁS-KÉPE a `logos` vödörben,
-- az egyházmegyéké a `dioceses-logos` vödörben lakik, mindkettőben
-- „mappánként" ({congregation_id}/… ill. {diocese_id}/…).
--
-- A feltöltés/felülírás/törlés szabályának ELSŐ ága eddig ennyit kérdezett:
-- „a hívó szerepe admin VAGY egyhazkeruleti_admin?" — és ha igen, ÁTENGEDTE,
-- BÁRMELYIK mappába. A mappanévben álló azonosítót meg sem nézte.
--
-- KÖVETKEZMÉNY: az „A" egyházkerület adminja beírhatott és TÖRÖLHETETT a „B"
-- egyházkerület bármelyik gyülekezetének a mappájában. Nem „csak egy kép":
-- a PECSÉT és az ALÁÍRÁS képe együtt kész OKIRAT-FELÜLET. Egy kicserélt
-- aláírás-PNG minden ezután nyomtatott iraton más nevében hitelesít, egy
-- törölt pecsét pedig NÉMÁN kiüresíti az összes nyomtatványt — a hiba a
-- gyülekezetnél jelentkezik, a nyoma máshol keletkezett.
--
-- A JAVÍTÁS: a rendszergazdai ág marad (ő az egész országé), de a
-- kerületi/megyei ág mostantól HATÓKÖRHÖZ KÖTÖTT:
--   · `logos`          → a repóban MÁR MEGLÉVŐ `felettes_szint_szerkesztheto()`
--                        szerkesztési kapu dönt (ez a gyülekezeti TÖRZSADAT —
--                        köztük a cimer_url / pecset_url / alairas_url oszlopok —
--                        mai kapuja is: `current_user_can_edit_congregation()`
--                        ezen a függvényen áll).
--   · `dioceses-logos` → a mappában álló egyházmegye `district_id`-jának a hívó
--                        `current_user_district_ids()` hatókörébe kell esnie.
-- ⚠️ Ez PONTOSAN az a minta, amit a `districts-logos` vödör 2026-08-16 óta már
--    használ (2026-08-16-egyhazkeruleti-S2-identitas.sql:867-950). Ez a fájl a
--    másik két szintet hozza fel ugyanarra a szintre. A `districts_logos_*`
--    policy-khoz EZ A FÁJL NEM NYÚL — azok már jók.
--
-- ⚠️ AMIHEZ SZÁNDÉKOSAN NEM NYÚLUNK: a `logos` vödör PUBLIKUS volta. Az
--    rögzített, vállalt döntés (2026-08-15, S2-fejléc) — nem ennek a találatnak
--    a része. A pecsét/aláírás privát vödörbe költöztetése KÜLÖN kör, mind a
--    három szintre egyszerre.
--
-- ────────────────────────────────────────────────────────────────────────────
-- B6 — HATÁSVIZSGÁLAT (grep, 2026-08-25): kik töltenek fel ma?
-- ────────────────────────────────────────────────────────────────────────────
--   `logos` vödör, `congregations/{id}/…`:
--     · apps/web/app/(dashboard)/congregation/actions.ts:1632  uploadCongregationCimer
--     · apps/web/app/(dashboard)/congregation/actions.ts:1759  uploadCongregationIratKep (pecsét/aláírás)
--     · apps/web/components/modals/congregation-dialog-v2.tsx:349 (böngészőből, saját JWT)
--     Az app-oldali kapu mindháromnál: admin || master || egyhazkeruletiAdmin ||
--     profile.congregation_id === congregationId.
--   `logos` vödör, `profiles/{profile_id}/…`:
--     · apps/web/components/modals/profile-dialog.tsx:195 — PROFILKÉP.
--       ⚠️ EZ A MEGLEPETÉS: ugyanabba a vödörbe megy, de NEM „congregations/"
--          útvonalra. A mai policy 2. és 3. ága kifejezetten megköveteli, hogy
--          az útvonal első szegmense „congregations" legyen — vagyis a profilkép
--          feltöltése MA KIZÁRÓLAG az 1. (szerep-vak) ágon megy át. Ha az 1. ágat
--          csak úgy szűkítenénk, a kerületi admin ELVESZTENÉ a SAJÁT profilképe
--          feltöltését is. Ezért kap a fájl egy KESKENY, ÚJ ágat: mindenki a
--          SAJÁT `profiles/{auth.uid()}/…` mappájába írhat. Ez a legszűkebb
--          megfogalmazás, ami a törést megelőzi (és mellékesen kijavít egy élő
--          hibát: ma a lelkész nem tudja feltölteni a profilképét).
--   `dioceses-logos` vödör, `{diocese_id}/…`:
--     · apps/web/app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts:739  uploadDioceseCimer
--     · apps/web/app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts:861  uploadDioceseIratKep
--     Mindkettő a `requireDioceseAccess()` kapun megy át (uo. :122-182), ami
--     PONTOSAN a mi három águnkat engedi: admin/master; szerep-szűrt megyei
--     írási hatókör; kerületi admin, HA a cél egyházmegye a kerületében van
--     (assertDioceseInScope). A policy mostantól ugyanezt mondja.
--   Storage-TÖRLÉS egyik vödörből sincs a kódban (nincs `.remove(` hívás rájuk).
--
-- ⚠️ ISMERT, ELŐZETESEN IS FENNÁLLÓ RÉS (ez a fájl NEM javítja, hogy a diff
--    auditálható maradjon): a `dioceses-logos` megyei ága CSAK `profile_roles`
--    sorból old fel. Az a NÉHÁNY esperes, akinek csak a `profiles.diocese_id`
--    skalárja van (szerepkör-sora nincs), ma sem tud címert feltölteni — pedig
--    az app engedné neki. Külön, SZŰKÍTÉST NEM tartalmazó javítás kellene:
--    a `current_user_diocese_ids()` (kétlábú feloldó) beemelése 3. ágként.
--
-- ════════════════════════════════════════════════════════════════════════════
-- B8 — MI A BAJ, EMBERI NYELVEN
-- ════════════════════════════════════════════════════════════════════════════
-- A `befizetescel` és a `kiadascel` az ORSZÁG MINDEN GYÜLEKEZETE ÁLTAL KÖZÖSEN
-- HASZNÁLT számlatükör (nincs `congregation_id` oszlopuk — a 0. szakasz ezt
-- külön megméri). A `befizetes.id_befizetescel` és a `kiadas.id_kiadascel`
-- MINDEN eddig rögzített tétele ezekre a sorokra mutat.
--
-- Az írási szabályuk eddig szó szerint ez volt:
--     befizetescel_write  [INSERT] WITH CHECK (true)
--     befizetescel_update [UPDATE] USING (true) WITH CHECK (true)
--     kiadascel_write     [INSERT] WITH CHECK (true)
--     kiadascel_update    [UPDATE] USING (true) WITH CHECK (true)
-- Vagyis BÁRMELYIK bejelentkezett felhasználó — az ország bármelyik
-- gyülekezetéből — átírhatta őket. Egyetlen `PATCH`-csel:
--   · az `aktiv` mező kikapcsolásával a célok eltűnnek MINDEN gyülekezet
--     rögzítő-ablakából (a rendszer működésképtelen, de nem „hibás"),
--   · egy cél ÁTNEVEZÉSÉVEL vagy másik számadási kódra (`id_szamadasicel`)
--     állításával a MÁR RÖGZÍTETT tételek NÉMÁN átcsúsznak egy másik rovatba —
--     az éves számadás minden száma megváltozik, visszamenőleg, országosan,
--     anélkül hogy egyetlen tétel is módosult volna.
--
-- A KÖVETENDŐ MINTA a szomszéd táblán MÁR ÉLESBEN VAN:
--     szamadasicel.szamadasicel_update_tva [UPDATE]
--       USING/CHECK = public.current_user_can_edit_tva_flags()
-- Ugyanez az alak, csak a rendszergazdai kapuval:
--     public.current_user_has_global_access()
-- (2026-08-11 óta ez KIZÁRÓLAG rendszergazdát jelent: `profiles.role='admin'`
--  VAGY `profile_roles` system-hatókörű admin sor, mindkettőn `status='active'`
--  kapuval. Az 1/0 őrszem külön ellenőrzi, hogy a szűkítés tényleg lefutott —
--  a régi, esperest is „globálisnak" vevő törzsre KÖTNI a számlatükröt
--  ugyanolyan rossz lenne, mint a mai `true`.)
--
-- ────────────────────────────────────────────────────────────────────────────
-- B8 — HATÁSVIZSGÁLAT (grep, 2026-08-25): ír-e ide az app normál úton?
-- ────────────────────────────────────────────────────────────────────────────
-- Végigkeresve az apps/ és packages/ könyvtárat a `befizetescel` / `kiadascel`
-- MINDEN előfordulására (nem csak a `.from()` hívásokra):
--   · ÍRÁS a teljes kódbázisban EGYETLEN helyen van:
--       apps/web/app/(dashboard)/penzugy/actions.ts:5829  `.from('befizetescel').insert(newBev)`
--       apps/web/app/(dashboard)/penzugy/actions.ts:5839  `.from('kiadascel').insert(newKia)`
--     mindkettő a `seedFinanceCategories()` szerver-akción belül (:5771).
--     ⚠️ ENNEK AZ AKCIÓNAK NINCS EGYETLEN HÍVÓJA SEM a repóban (teljes
--        `seedFinanceCategories` keresés: csak a definíció, :5771). A saját
--        docstringje szerint „a dialog nyitásakor felkínáljuk" — ez a bekötés
--        soha nem készült el. Vagyis a szigorítás EGYETLEN MŰKÖDŐ FELÜLETET SEM
--        tör el. (A kliense a felhasználó JWT-jével fut — `createClient()` az
--        `effective-access.ts:339`-ben —, tehát ha valaki mégis meghívná, RLS
--        alá esik; lásd `viselkedes_valtozas`.)
--   · MINDEN egyéb hivatkozás CSAK OLVASÁS (a `_read` policy `USING (true)`
--     marad, hozzá NEM nyúlunk):
--       packages/core/src/finance/befizetes/list-cel.ts:41, .../kiadas/list-cel.ts:38,
--       apps/web/app/(dashboard)/penzugy/actions.ts:1488-1489,1689,1715,5083-5084,5418,5624,5795-5796,5954-5955,
--       .../chitanta-actions.ts:319, .../decont-actions.ts:316, .../dispozitie-actions.ts:265-266,
--       .../egyhfenntartas-import-actions.ts:353,505, .../finalization-actions.ts:178,
--       .../general-income-actions.ts:189, .../oblio-ellenorzes-actions.ts:454,
--       apps/web/app/(dashboard)/leltar/actions.ts:428, .../dokumentumtar/kifizetetlen-actions.ts:184-185,
--       apps/web/lib/finance/tva-plafon.ts:92, apps/web/lib/import/lookup-resolver.ts:984,
--       apps/web/components/finance/finance-import/helpers/budget-code-resolver.ts:92,111,
--       apps/desktop/src/lib/finance-categories-sync.ts:64-65 (a desktop CSAK tükrözi
--       lokális SQLite-ba, vissza nem ír).
--   · Az offline/desktop szinkron regisztere (apps/web/lib/offline/table-registry.ts:220,245)
--     a `befizetes`/`kiadas` tételeket viszi, a KATEGÓRIA-táblákat nem.
--   ⇒ NINCS legitim, nem-rendszergazdai író út. A szűkítés biztonságos.
--
-- ⚠️ DELETE: a két táblán MA EGYETLEN DELETE POLICY SINCS, tehát a törlés RLS
--    alatt már ma is tiltott. Ez a fájl SZÁNDÉKOSAN NEM HOZ LÉTRE DELETE
--    policy-t — az TÁGÍTÁS lenne. A 0. és a 2. szakasz külön kiírja, hogy
--    tényleg nincs ilyen.
--
-- ════════════════════════════════════════════════════════════════════════════
-- A PROJEKT RÖGZÍTETT CSAPDÁI, AMIKET EZ A FÁJL KIKERÜL
-- ════════════════════════════════════════════════════════════════════════════
--  (1) „GRANT nélkül a policy nem tagad, hanem HIBÁZIK (42501)." — a policy a
--      HÍVÓ szerepében fut. Ezért az 1/A blokk KÖTELEZŐEN kiadja az EXECUTE-ot
--      mindhárom hívott függvényre, a `public.dioceses` tábla-szintű SELECT-jét
--      pedig őrzötten pótolja (a `dioceses-logos` kerületi ága azt olvassa).
--      GRANT nélkül nem „szép tiltás", hanem MINDENKINEK eltörő címerfeltöltés
--      lenne az eredmény.
--  (2) „Constraintet/policyt SOHA ne LIKE-kal keress." — minden DROP itt
--      POLICYNÉV szerint megy (`DROP POLICY IF EXISTS <pontos_nev> ON …`).
--      LIKE-ot kizárólag a 0./2. szakasz KIÍRÓ (semmit nem módosító)
--      lekérdezései használnak.
--  (3) „A migrációs fájl nem bizonyíték." — ezért van 0. szakasz, ezért mér az
--      1/0 őrszem az ÉLŐ katalógusból, és ezért van 1/E záró őrszem, amely a
--      COMMIT ELŐTT bizonyítja, hogy az új policy-szövegekben tényleg nincs
--      benne a vak szerep-lista. Ha mégis, az EGÉSZ tranzakció visszagördül.
--  (4) Szöveg→uuid kényszerítés a policy-ban: `('valami')::uuid` HIBÁT dob
--      (22P02) rossz alakú útvonalon — vagyis a policy hibázna, nem tagadna.
--      Ezért a gyülekezeti ág `CASE`-be zárt, UUID-alakra illesztett kasztot
--      használ, `ELSE NULL::uuid`-dal; a `felettes_szint_szerkesztheto(NULL)`
--      dokumentáltan FALSE. A `CASE` nem választott ága nem értékelődik ki, és
--      itt nincs konstans-összevonás sem (a kifejezés a `name` oszloptól függ).
--      ⚠️ Az `AND` operandusainak sorrendjére a PostgreSQL NEM ad garanciát —
--         ezért a védelem a CASE-en belül van, nem egy `AND` előtag mögött.
--
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. SEMMIT NEM MÓDOSÍT.                                     ║
-- ║ Azt méri, fennáll-e a javítás ELŐTTI állapot. Ha nem az jön ki, ami az    ║
-- ║ „elvart" oszlopban áll: ÁLLJ MEG, és ne futtasd az 1. szakaszt.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT sorszam, terulet, mit, ertek, elvart
FROM (

-- ── B6/1 · A HÁROM POLICY-CSALÁD MAI ÁLLAPOTA ──────────────────────────────
SELECT 10 AS sorszam, 'B6 · LOGOS' AS terulet,
       'A `logos` vödör ÍRÓ/TÖRLŐ policy-i, és hogy a szövegük említi-e a vak szerep-listát' AS mit,
       COALESCE((
         SELECT string_agg(
                  pol.policyname || ' [' || pol.cmd || '] → ' ||
                  CASE WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
                            LIKE '%egyhazkeruleti_admin%'
                       THEN '⛔ SZEREP-VAK (egyhazkeruleti_admin hatókör nélkül)'
                       ELSE '✅ nincs benne vak szerep-lista' END,
                  E'\n' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND pol.policyname IN ('logos_pastor_write','logos_pastor_update','logos_pastor_delete')
       ), '— egyik sem létezik') AS ertek,
       'ELVÁRT MOST: mind a 3 sor ⛔ SZEREP-VAK. Ez maga a találat.' AS elvart

-- ── B6/2 ──────────────────────────────────────────────────────────────────
UNION ALL
SELECT 11, 'B6 · DIOCESES-LOGOS',
       'A `dioceses-logos` vödör ÍRÓ/TÖRLŐ policy-i ugyanígy',
       COALESCE((
         SELECT string_agg(
                  pol.policyname || ' [' || pol.cmd || '] → ' ||
                  CASE WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
                            LIKE '%egyhazkeruleti_admin%'
                       THEN '⛔ SZEREP-VAK (egyhazkeruleti_admin hatókör nélkül)'
                       ELSE '✅ nincs benne vak szerep-lista' END,
                  E'\n' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND pol.policyname IN ('dioceses_logos_esperes_write','dioceses_logos_esperes_update','dioceses_logos_esperes_delete')
       ), '— egyik sem létezik'),
       'ELVÁRT MOST: mind a 3 sor ⛔ SZEREP-VAK. Ez maga a találat.'

-- ── B6/3 · a KÖVETENDŐ minta (nem nyúlunk hozzá) ───────────────────────────
UNION ALL
SELECT 12, 'B6 · DISTRICTS-LOGOS (minta)',
       'A kerületi vödör policy-i — EZ A JÓ MINTA, ez a fájl NEM módosítja',
       COALESCE((
         SELECT string_agg(
                  pol.policyname || ' [' || pol.cmd || '] → ' ||
                  CASE WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
                            LIKE '%current_user_district_ids%'
                       THEN '✅ hatókörhöz kötött'
                       ELSE '⚠️ NEM hivatkozik hatókör-feloldóra' END,
                  E'\n' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND pol.policyname LIKE 'districts_logos_kerulet%'
       ), '— nincs ilyen policy (a 2026-08-16-S2 nem futott le?)'),
       'ELVÁRT: 3 sor, mind ✅. Ha nem, ELŐBB az S2-t futtasd — arra mintázunk.'

-- ── B6/4 · a HASZNÁLT SEGÉDFÜGGVÉNYEK MEGLÉTE ──────────────────────────────
UNION ALL
SELECT 20, 'B6 · ELŐFELTÉTEL',
       'Létezik-e a public.felettes_szint_szerkesztheto(uuid) szerkesztési kapu?',
       CASE WHEN to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NULL
            THEN '⛔ NINCS — az 1. szakasz ŐRSZEME meg fogja állítani'
            ELSE '✅ létezik' END,
       'ELVÁRT: ✅. Ha nincs, előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 1. szakasza fusson le.'

UNION ALL
SELECT 21, 'B6 · ELŐFELTÉTEL',
       'Létezik-e a public.current_user_district_ids() kerület-feloldó?',
       CASE WHEN to_regprocedure('public.current_user_district_ids()') IS NULL
            THEN '⛔ NINCS — az 1. szakasz ŐRSZEME meg fogja állítani'
            ELSE '✅ létezik' END,
       'ELVÁRT: ✅. Ugyanabból a fájlból származik.'

UNION ALL
SELECT 22, 'B6 · ELŐFELTÉTEL',
       'Van-e public.dioceses.district_id oszlop? (a megyei vödör kerületi ága ezen áll)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='dioceses' AND column_name='district_id')
            THEN '✅ van' ELSE '⛔ NINCS' END,
       'ELVÁRT: ✅ van.'

-- ── B6/5 · GRANT-CSAPDA: a policy a HÍVÓ szerepében fut ────────────────────
UNION ALL
SELECT 30, 'B6 · GRANT',
       'Az `authenticated` szerep olvashatja-e TÁBLA-SZINTEN a public.dioceses-t? (a kerületi ág azt olvassa)',
       CASE WHEN has_table_privilege('authenticated','public.dioceses','SELECT')
            THEN '✅ igen' ELSE '⚠️ NEM — az 1/A blokk őrzötten pótolja' END,
       'Tájékoztató. GRANT nélkül a policy nem tagadna, hanem 42501-gyel HIBÁZNA.'

UNION ALL
SELECT 31, 'B6 · GRANT',
       'EXECUTE-joga van-e az `authenticated`-nek a felettes_szint_szerkesztheto(uuid)-re?',
       CASE WHEN to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NULL
            THEN '— a függvény sincs meg'
            WHEN has_function_privilege('authenticated','public.felettes_szint_szerkesztheto(uuid)','EXECUTE')
            THEN '✅ igen' ELSE '⚠️ NEM — az 1/A blokk kiadja' END,
       'Tájékoztató. Az 1/A blokk mindenképpen újra kiadja (idempotens).'

UNION ALL
SELECT 32, 'B6 · GRANT',
       'EXECUTE-joga van-e az `authenticated`-nek a current_user_district_ids()-re?',
       CASE WHEN to_regprocedure('public.current_user_district_ids()') IS NULL
            THEN '— a függvény sincs meg'
            WHEN has_function_privilege('authenticated','public.current_user_district_ids()','EXECUTE')
            THEN '✅ igen' ELSE '⚠️ NEM — az 1/A blokk kiadja' END,
       'Tájékoztató.'

UNION ALL
SELECT 33, 'B6 · GRANT',
       'Használhatja-e az `authenticated` az auth sémát és az auth.uid()-ot? (a profilkép-ág ezt hívja)',
       CASE WHEN NOT has_schema_privilege('authenticated','auth','USAGE')
            THEN '⚠️ NINCS USAGE az auth sémán'
            WHEN to_regprocedure('auth.uid()') IS NULL
            THEN '⚠️ nincs auth.uid() függvény'
            WHEN has_function_privilege('authenticated','auth.uid()','EXECUTE')
            THEN '✅ igen (mint minden mai policy-nál)'
            ELSE '⚠️ NINCS EXECUTE az auth.uid()-on' END,
       'ELVÁRT: ✅. Ha nem az, MINDEN mai RLS-policy hibázna — akkor ÁLLJ MEG, mert nem ez a fájl a baj.'

-- ── B6/6 · a profilkép-ág indoklása: van-e egyáltalán ilyen fájl? ──────────
UNION ALL
SELECT 40, 'B6 · PROFILKÉP',
       'Hány objektum van MA a `logos` vödörben `profiles/` előtaggal? (miattuk kell a keskeny saját-mappa ág)',
       COALESCE((SELECT count(*)::text FROM storage.objects
                 WHERE bucket_id='logos' AND name LIKE 'profiles/%'), '—'),
       'Tájékoztató. Ma ezt az útvonalat CSAK a szerep-vak ág engedte — ezért kap keskeny, saját-mappás ágat.'

UNION ALL
SELECT 41, 'B6 · VÖDRÖK',
       'Megvan-e a három vödör?',
       COALESCE((SELECT string_agg(b.id || ' (public=' || b.public::text || ')', ', ' ORDER BY b.id)
                 FROM storage.buckets b WHERE b.id IN ('logos','dioceses-logos','districts-logos')),
                '⛔ egy sincs'),
       'ELVÁRT: mind a három. A `logos` public=true VÁLLALT döntés — nem ez a találat.'

-- ── B8/1 · A SZÁMLATÜKÖR MAI ÍRÁSI SZABÁLYA ────────────────────────────────
UNION ALL
SELECT 50, 'B8 · SZÁMLATÜKÖR',
       'A befizetescel + kiadascel ÖSSZES policy-ja, kifejezéssel együtt',
       COALESCE((
         SELECT string_agg(
                  pol.tablename || '.' || pol.policyname || ' [' || pol.cmd || '] using=' ||
                  COALESCE(pol.qual,'∅') || ' check=' || COALESCE(pol.with_check,'∅'),
                  E'\n' ORDER BY pol.tablename, pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
       ), '⛔ egyetlen policy sincs'),
       'ELVÁRT MOST: a *_write / *_update sorokban `true` áll. Ez maga a találat. A *_read (USING true) MARAD.'

UNION ALL
SELECT 51, 'B8 · SZÁMLATÜKÖR',
       'Van-e MA DELETE policy a két táblán?',
       COALESCE((SELECT string_agg(pol.tablename||'.'||pol.policyname, ', ')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
                   AND pol.cmd='DELETE'),
                '✅ nincs — a törlés RLS alatt már ma is tiltott'),
       'ELVÁRT: nincs. Ez a fájl SZÁNDÉKOSAN nem hoz létre DELETE policy-t (az tágítás lenne).'

UNION ALL
SELECT 52, 'B8 · SZÁMLATÜKÖR',
       'Be van-e kapcsolva a soralapú biztonság (RLS) a két táblán?',
       COALESCE((SELECT string_agg(c.relname || '=' || CASE WHEN c.relrowsecurity THEN 'BE' ELSE '⛔ KI' END, ', ' ORDER BY c.relname)
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname IN ('befizetescel','kiadascel')),
                '⛔ a táblák nem találhatók'),
       'ELVÁRT: mindkettő BE. Ha KI, a policy-k mit sem érnek — akkor ÁLLJ MEG és jelezd.'

-- ── B8/2 · FAIL-CLOSED ELŐFELTÉTEL: tényleg KÖZÖS-e a tábla? ───────────────
UNION ALL
SELECT 53, 'B8 · ELŐFELTÉTEL',
       'Van-e `congregation_id` oszlop a befizetescel / kiadascel táblán? (ha VAN, a tábla NEM közös — akkor a szigorítás rossz)',
       COALESCE((SELECT string_agg(c.table_name || '.congregation_id', ', ' ORDER BY c.table_name)
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name IN ('befizetescel','kiadascel')
                   AND c.column_name='congregation_id'),
                '✅ EGYIKEN SINCS — tényleg országos, közös számlatükör'),
       'ELVÁRT: „EGYIKEN SINCS". Ha mégis van, ÁLLJ MEG — az 1/0 őrszem is meg fog állni.'

UNION ALL
SELECT 54, 'B8 · MIT VÉDÜNK',
       'Hány sor van ma a két táblában? (ennyi cél tűnne el egyetlen PATCH-csel)',
       COALESCE((SELECT (SELECT count(*) FROM public.befizetescel)::text || ' befizetéscél + '
                     || (SELECT count(*) FROM public.kiadascel)::text || ' kiadáscél'), '—'),
       'Tájékoztató — a találat súlyát mutatja.'

-- ── B8/3 · A KÖVETENDŐ MINTA + a rendszergazda-kapu épsége ─────────────────
UNION ALL
SELECT 60, 'B8 · MINTA',
       'A szamadasicel TVA-policy-ja (EZ a minta, nem nyúlunk hozzá)',
       COALESCE((SELECT pol.policyname || ' [' || pol.cmd || '] using=' || COALESCE(pol.qual,'∅')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='szamadasicel'
                   AND pol.policyname='szamadasicel_update_tva'),
                '— nincs ilyen policy'),
       'ELVÁRT: current_user_can_edit_tva_flags(). Erre mintázzuk a javítást.'

UNION ALL
SELECT 61, 'B8 · ELŐFELTÉTEL',
       'A public.current_user_has_global_access() törzse említi-e még az „esperes"-t? (ha igen, a szűkítés nem futott le)',
       CASE WHEN to_regprocedure('public.current_user_has_global_access()') IS NULL
            THEN '⛔ a függvény NEM LÉTEZIK'
            WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='current_user_has_global_access'
                           AND p.prosrc LIKE '%esperes%')
            THEN '⛔ IGEN, említi — ez MÉG A RÉGI, országos törzs'
            ELSE '✅ nem említi — a 2026-08-11-es szűkítés lefutott (csak rendszergazda)' END,
       'ELVÁRT: ✅. Ha ⛔, ÁLLJ MEG: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 2a szakasza fusson le.'

UNION ALL
SELECT 62, 'B8 · GRANT',
       'EXECUTE-joga van-e az `authenticated`-nek a current_user_has_global_access()-re?',
       CASE WHEN to_regprocedure('public.current_user_has_global_access()') IS NULL
            THEN '— a függvény sincs meg'
            WHEN has_function_privilege('authenticated','public.current_user_has_global_access()','EXECUTE')
            THEN '✅ igen' ELSE '⚠️ NEM — az 1/A blokk kiadja' END,
       'Tájékoztató. GRANT nélkül a számlatükör-olvasás is 42501-be futna.'

) AS felmeres
ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                 FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ. Ha bármi hibázik, MINDEN visszagördül.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '5min';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/0) ŐRSZEM — fail-closed. Előfeltétel nélkül NEM futunk.
--      Az ÉLŐ katalógusból mér, nem a repóból: „a migrációs fájl nem bizonyíték."
-- ────────────────────────────────────────────────────────────────────────────
DO $orszem_elo$
DECLARE
  v_baj text;
BEGIN
  -- (a) A gyülekezeti szerkesztési kapu megléte
  IF to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NULL THEN
    RAISE EXCEPTION '⛔ HIÁNYZIK a public.felettes_szint_szerkesztheto(uuid). Nélküle a `logos` vödör kerületi/megyei ága nem köthető hatókörhöz. Futtasd le előbb: migration-docs/sql/2026-08-11-globalis-hozzaferes-szukites.sql (1. szakasz).';
  END IF;

  -- (b) A kerület-feloldó megléte
  IF to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ HIÁNYZIK a public.current_user_district_ids(). Nélküle a `dioceses-logos` vödör kerületi ága nem köthető hatókörhöz. Ugyanabból a fájlból származik, mint az (a) pont.';
  END IF;

  -- (c) A rendszergazda-kapu megléte ÉS épsége
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL THEN
    RAISE EXCEPTION '⛔ HIÁNYZIK a public.current_user_has_global_access(). Erre kötnénk a közös számlatükör írását.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
      AND p.prosrc LIKE '%esperes%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_has_global_access() MÉG A RÉGI törzs (említi az „esperes"-t), vagyis országos hozzáférést ad az espereseknek is. Erre KÖTNI a közös számlatükör írását majdnem annyira rossz lenne, mint a mai `true`. Futtasd le előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 2a szakaszát.';
  END IF;

  -- (d) A megyei vödör kerületi ága a dioceses.district_id-n áll
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dioceses' AND column_name='district_id'
  ) THEN
    RAISE EXCEPTION '⛔ Nincs public.dioceses.district_id oszlop — a `dioceses-logos` vödör kerületi ága nem építhető meg.';
  END IF;

  -- (e) FAIL-CLOSED: tényleg KÖZÖS-e a számlatükör? Ha van congregation_id
  --     oszlopuk, akkor ezek NEM országos táblák, és a rendszergazdai
  --     szigorítás elvenné a gyülekezet saját célfelvitelét.
  SELECT string_agg(c.table_name, ', ' ORDER BY c.table_name) INTO v_baj
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name IN ('befizetescel','kiadascel')
    AND c.column_name='congregation_id';

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION '⛔ VISSZAGÖRDÍTVE: a(z) % tábla/táblák MÉGIS gyülekezethez kötöttek (van congregation_id oszlopuk). Akkor NEM országos közös számlatükörről van szó, és a rendszergazdai szigorítás elvenné a gyülekezetek saját célfelvitelét. Ilyenkor SZŰKEBB megoldás kell: a KÖZÖS (congregation_id IS NULL) sorokat védeni, a sajátokat nem. Jelezd — a fájl nem fut tovább.', v_baj;
  END IF;

  -- (f) A két tábla létezik és RLS-ük be van kapcsolva
  IF to_regclass('public.befizetescel') IS NULL OR to_regclass('public.kiadascel') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a public.befizetescel vagy a public.kiadascel tábla.';
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_baj
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('befizetescel','kiadascel')
    AND NOT c.relrowsecurity;

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION '⛔ A(z) % táblán NINCS bekapcsolva a soralapú biztonság (RLS). Policy-t írni rá öncsalás lenne: a szabály nem érvényesülne. Kapcsold be előbb (ALTER TABLE … ENABLE ROW LEVEL SECURITY), és mérd fel, mi támaszkodott a kikapcsolt állapotra.', v_baj;
  END IF;

  -- (g) GRANT-CSAPDA: a policy a HÍVÓ szerepében fut. A `dioceses-logos`
  --     kerületi ága a public.dioceses-t olvassa → tábla-szintű SELECT kell.
  --     (Precedens: 2026-08-15-egyhazmegyei-rls-szerep-szuro.sql:233-236.)
  IF NOT has_table_privilege('authenticated','public.dioceses','SELECT') THEN
    GRANT SELECT ON public.dioceses TO authenticated;
    RAISE NOTICE 'ℹ️ GRANT SELECT ON public.dioceses TO authenticated — pótolva (a dioceses-logos policy kerületi ága ezt olvassa).';
  END IF;
END
$orszem_elo$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) JOGOK — a policy-kban hívott függvények EXECUTE-ja
--      ⛔ A policy a HÍVÓ szerepében fut. GRANT nélkül nem szép tagadás lenne
--         az eredmény, hanem 42501-es leállás: a címerfeltöltés MINDENKINEK
--         eltörne, a számlatükör olvasása pedig 403-at adna.
--      Idempotens: a GRANT újrafuttatható.
-- ────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.felettes_szint_szerkesztheto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()   TO authenticated;

GRANT EXECUTE ON FUNCTION public.felettes_szint_szerkesztheto(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()        TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()   TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) B6 — a `logos` vödör (GYÜLEKEZETI címer / pecsét / aláírás + profilkép)
-- ────────────────────────────────────────────────────────────────────────────
-- Útvonal-séma:  congregations/{congregation_id}/{fájlnév}
--                profiles/{profile_id}/{fájlnév}        ← profilkép
--
-- A NÉGY ÁG (a sorrend csak olvashatóság, a PostgreSQL nem garantál sorrendet):
--   (1) RENDSZERGAZDA — `current_user_has_global_access()`. Bármelyik mappa.
--       ⚠️ Ez SZŰKEBB a mainál: a mai ág az `egyhazkeruleti_admin` szerepet is
--          feltétel nélkül átengedte, országosan. A kerületi admin mostantól a
--          (2) ágon megy — a SAJÁT kerületére.
--   (2) ⭐ HATÓKÖRÖS SZERKESZTÉSI KAPU — `felettes_szint_szerkesztheto()`.
--       Ez a gyülekezeti TÖRZSADAT mai kapuja (a `current_user_can_edit_
--       congregation()` is ezen áll), tehát épp azé az adaté, amelynek a
--       cimer_url / pecset_url / alairas_url oszlopa erre a fájlra mutat.
--       SECURITY DEFINER → nem függ attól, hogy a hívó LÁTJA-e RLS alatt a
--       congregations sort (ez a „policy más táblát olvas" csapda kikerülése).
--       ⚠️ A kaszt CASE-be zárva, UUID-alakra illesztve: rossz alakú útvonalon
--          NULL megy be (a függvény dokumentáltan FALSE-ot ad), nem 22P02 hiba.
--   (3) SAJÁT GYÜLEKEZET a `profiles.congregation_id` skaláron — VÁLTOZATLAN,
--       betűhűen a mai policy-ból (a lelkész/könyvelő útja).
--   (4) `profile_roles` gyülekezeti hatókör — VÁLTOZATLAN (profilváltó).
--   (5) SAJÁT PROFILKÉP-MAPPA — `profiles/{auth.uid()}/…`. ÚJ, keskeny ág.
--       Miért kell: a profilkép ugyanebbe a vödörbe megy, de NEM
--       „congregations/" útvonalra, tehát MA KIZÁRÓLAG az (1) szerep-vak ágon
--       fért át. Enélkül a kerületi admin elvesztené a SAJÁT profilképe
--       feltöltését. Mindenki csak a SAJÁT mappájába írhat.
--
-- ⚠️ Miért `string_to_array(name,'/')` és nem `storage.foldername(name)`?
--    Mert a mai három policy is ezt használja — így a diff a lehető
--    legkisebb és a legjobban összevethető. Ráadásul a `string_to_array`
--    beépített (pg_catalog) függvény: nem függ a `storage` séma jogaitól.

-- Olvasás (`logos_read_all`) — NEM MÓDOSÍTJUK. A vödör publikus volta rögzített,
-- vállalt döntés (2026-08-15), és NEM ennek a találatnak a része.

-- ── BESZÚRÁS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "logos_pastor_write" ON storage.objects;
CREATE POLICY "logos_pastor_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      -- (1) Rendszergazda
      public.current_user_has_global_access()

      -- (2) ⭐ Hatókörös szerkesztési kapu a mappa gyülekezetére
      OR public.felettes_szint_szerkesztheto(
           CASE
             WHEN (string_to_array(name, '/'))[1] = 'congregations'
              AND (string_to_array(name, '/'))[2] ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN ((string_to_array(name, '/'))[2])::uuid
             ELSE NULL::uuid
           END
         )

      -- (3) Saját gyülekezet a profiles-skaláron — VÁLTOZATLAN
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )

      -- (4) profile_roles gyülekezeti hatókör — VÁLTOZATLAN
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'congregation'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND pr.scope_id::text = (string_to_array(name, '/'))[2]
      )

      -- (5) SAJÁT profilkép-mappa
      OR (
        (string_to_array(name, '/'))[1] = 'profiles'
        AND (string_to_array(name, '/'))[2] = auth.uid()::text
      )
    )
  );

-- ── FRISSÍTÉS (UPSERT: a varázsló felülírja a korábbi képet) ───────────────
-- A WITH CHECK szándékosan AZONOS a USING-gal: az objektum nem mozdítható ki a
-- hívó hatóköréből. (WITH CHECK nélkül a PostgreSQL amúgy is a USING-ot
-- használná — itt csak kimondjuk, hogy ne kelljen kikövetkeztetni.)
DROP POLICY IF EXISTS "logos_pastor_update" ON storage.objects;
CREATE POLICY "logos_pastor_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      public.current_user_has_global_access()
      OR public.felettes_szint_szerkesztheto(
           CASE
             WHEN (string_to_array(name, '/'))[1] = 'congregations'
              AND (string_to_array(name, '/'))[2] ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN ((string_to_array(name, '/'))[2])::uuid
             ELSE NULL::uuid
           END
         )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'congregation'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND pr.scope_id::text = (string_to_array(name, '/'))[2]
      )
      OR (
        (string_to_array(name, '/'))[1] = 'profiles'
        AND (string_to_array(name, '/'))[2] = auth.uid()::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      public.current_user_has_global_access()
      OR public.felettes_szint_szerkesztheto(
           CASE
             WHEN (string_to_array(name, '/'))[1] = 'congregations'
              AND (string_to_array(name, '/'))[2] ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN ((string_to_array(name, '/'))[2])::uuid
             ELSE NULL::uuid
           END
         )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'congregation'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND pr.scope_id::text = (string_to_array(name, '/'))[2]
      )
      OR (
        (string_to_array(name, '/'))[1] = 'profiles'
        AND (string_to_array(name, '/'))[2] = auth.uid()::text
      )
    )
  );

-- ── TÖRLÉS ─────────────────────────────────────────────────────────────────
-- ⚠️ A mai törlő policy-ban NINCS `profile_roles` ág, és nincs profilkép-ág sem.
--    SZÁNDÉKOSAN ÍGY HAGYJUK: a törlés a legveszélyesebb művelet (a pecsét
--    NÉMÁN eltűnik minden nyomtatványról), és a kódban EGYETLEN `.remove()`
--    hívás sincs erre a vödörre — nincs mit eltörni. Csak az (1) ág szűkül.
DROP POLICY IF EXISTS "logos_pastor_delete" ON storage.objects;
CREATE POLICY "logos_pastor_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      public.current_user_has_global_access()
      OR public.felettes_szint_szerkesztheto(
           CASE
             WHEN (string_to_array(name, '/'))[1] = 'congregations'
              AND (string_to_array(name, '/'))[2] ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN ((string_to_array(name, '/'))[2])::uuid
             ELSE NULL::uuid
           END
         )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) B6 — a `dioceses-logos` vödör (EGYHÁZMEGYEI címer / pecsét / aláírás)
-- ────────────────────────────────────────────────────────────────────────────
-- Útvonal-séma: {diocese_id}/{fájlnév}
--
-- A HÁROM ÁG:
--   (1) RENDSZERGAZDA — `current_user_has_global_access()`.
--       ⚠️ SZŰKEBB a mainál: az `egyhazkeruleti_admin` szerep többé nem
--          feltétel nélküli — a (3) ágon megy, a SAJÁT kerületére.
--   (2) ESPERES / EGYHÁZMEGYEI ADMIN a saját egyházmegyéjéhez — VÁLTOZATLAN,
--       betűhűen a mai policy-ból (ez az ág MA IS hatókörös volt).
--   (3) ⭐ KERÜLETI ADMIN — a mappában álló egyházmegye `district_id`-ja essen
--       a hívó `current_user_district_ids()` hatókörébe. Pontosan az, amit az
--       app `requireDioceseAccess()` kapuja is megkövetel
--       (diocese-actions.ts:159-166, assertDioceseInScope).
--       ⚠️ `d.id::text = …` összehasonlítás — SZÖVEG-oldali, tehát rossz alakú
--          útvonalon 0 sor lesz belőle (tagadás), nem 22P02 hiba.
--       ⚠️ Ez az ág a public.dioceses-t olvassa a HÍVÓ szerepében: az 1/0 (g)
--          pont ezért pótolja őrzötten a tábla-szintű SELECT-et. A
--          `dioceses_read` policy `USING (true)` (2026-04-13), tehát a sor
--          RLS alatt is látszik.

-- Olvasás (`dioceses_logos_read_all`) — NEM MÓDOSÍTJUK.

DROP POLICY IF EXISTS "dioceses_logos_esperes_write" ON storage.objects;
CREATE POLICY "dioceses_logos_esperes_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dioceses-logos'
    AND (
      -- (1) Rendszergazda
      public.current_user_has_global_access()

      -- (2) Esperes / egyházmegyei admin a SAJÁT egyházmegyéjéhez — VÁLTOZATLAN
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )

      -- (3) ⭐ Kerületi admin — a mappa egyházmegyéje a SAJÁT kerületében
      OR EXISTS (
        SELECT 1 FROM public.dioceses d
        WHERE d.id::text = NULLIF((string_to_array(name, '/'))[1], '')
          AND d.district_id = ANY (
                COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])
              )
      )
    )
  );

DROP POLICY IF EXISTS "dioceses_logos_esperes_update" ON storage.objects;
CREATE POLICY "dioceses_logos_esperes_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dioceses-logos'
    AND (
      public.current_user_has_global_access()
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )
      OR EXISTS (
        SELECT 1 FROM public.dioceses d
        WHERE d.id::text = NULLIF((string_to_array(name, '/'))[1], '')
          AND d.district_id = ANY (
                COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])
              )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'dioceses-logos'
    AND (
      public.current_user_has_global_access()
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )
      OR EXISTS (
        SELECT 1 FROM public.dioceses d
        WHERE d.id::text = NULLIF((string_to_array(name, '/'))[1], '')
          AND d.district_id = ANY (
                COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])
              )
      )
    )
  );

DROP POLICY IF EXISTS "dioceses_logos_esperes_delete" ON storage.objects;
CREATE POLICY "dioceses_logos_esperes_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dioceses-logos'
    AND (
      public.current_user_has_global_access()
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )
      OR EXISTS (
        SELECT 1 FROM public.dioceses d
        WHERE d.id::text = NULLIF((string_to_array(name, '/'))[1], '')
          AND d.district_id = ANY (
                COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])
              )
      )
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) B8 — az országos KÖZÖS számlatükör írása rendszergazdai joghoz kötve
-- ────────────────────────────────────────────────────────────────────────────
-- A `szamadasicel_update_tva` mintájára: a policy MAGA a függvényhívás.
-- ⚠️ Az OLVASÁS (`befizetescel_read` / `kiadascel_read`, USING true) MARAD —
--    a rögzítő ablakok, a nyomtatványok és a desktop-tükrözés mind ebből élnek.
-- ⚠️ DELETE policy SZÁNDÉKOSAN NEM KÉSZÜL: ma sincs, tehát a törlés RLS alatt
--    már most is tiltott. Létrehozni TÁGÍTÁS lenne.

DROP POLICY IF EXISTS befizetescel_write  ON public.befizetescel;
CREATE POLICY befizetescel_write ON public.befizetescel
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_global_access());

DROP POLICY IF EXISTS befizetescel_update ON public.befizetescel;
CREATE POLICY befizetescel_update ON public.befizetescel
  FOR UPDATE TO authenticated
  USING      (public.current_user_has_global_access())
  WITH CHECK (public.current_user_has_global_access());

DROP POLICY IF EXISTS kiadascel_write  ON public.kiadascel;
CREATE POLICY kiadascel_write ON public.kiadascel
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_global_access());

DROP POLICY IF EXISTS kiadascel_update ON public.kiadascel;
CREATE POLICY kiadascel_update ON public.kiadascel
  FOR UPDATE TO authenticated
  USING      (public.current_user_has_global_access())
  WITH CHECK (public.current_user_has_global_access());

COMMENT ON POLICY befizetescel_write ON public.befizetescel IS
  '2026-08-25 (B8): az országos KÖZÖS számlatükörbe CSAK RENDSZERGAZDA vehet fel új célt. Korábban WITH CHECK (true) volt: bármelyik bejelentkezett felhasználó bővíthette. Minta: szamadasicel_update_tva.';
COMMENT ON POLICY befizetescel_update ON public.befizetescel IS
  '2026-08-25 (B8): az országos KÖZÖS számlatükör MÓDOSÍTÁSA csak rendszergazdának. Korábban USING/CHECK (true) volt — egy cél átnevezése vagy másik számadási kódra állítása NÉMÁN átsorolta volna az ország MÁR RÖGZÍTETT tételeit.';
COMMENT ON POLICY kiadascel_write ON public.kiadascel IS
  '2026-08-25 (B8): lásd befizetescel_write — ugyanaz a szabály a kiadási oldalon.';
COMMENT ON POLICY kiadascel_update ON public.kiadascel IS
  '2026-08-25 (B8): lásd befizetescel_update — ugyanaz a szabály a kiadási oldalon.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) ⛔ ZÁRÓ ŐRSZEM — a fájl KÉPTELEN szivárgó állapotot hagyni
--      A policy-k MÁR LÉTREJÖTTEK, de a COMMIT MÉG NEM TÖRTÉNT MEG. Itt
--      bizonyítjuk, hogy a régi, vak viselkedés tényleg megszűnt. Ha nem,
--      a RAISE EXCEPTION az EGÉSZ tranzakciót visszagördíti.
--      ⚠️ NEGATÍV ASSZERT: nem azt kérdezzük, „létrejött-e a policy", hanem
--         azt, hogy a RÉGI szerep-lista tényleg ELTŰNT-e a szövegéből. A
--         `pg_policies.qual/with_check` a kiszámított kifejezés szövege —
--         SQL-kommentet nem tartalmaz, tehát nem lehet kommenttel becsapni.
-- ────────────────────────────────────────────────────────────────────────────
DO $orszem_zaro$
DECLARE
  v_baj text;
BEGIN
  -- (1) B6 — a hat javított storage-policy egyikében sem maradhat ott a
  --     hatókör nélküli szerep-név.
  SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ' ORDER BY pol.policyname)
    INTO v_baj
  FROM pg_policies pol
  WHERE pol.schemaname='storage' AND pol.tablename='objects'
    AND pol.policyname IN ('logos_pastor_write','logos_pastor_update','logos_pastor_delete',
                           'dioceses_logos_esperes_write','dioceses_logos_esperes_update',
                           'dioceses_logos_esperes_delete')
    AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%egyhazkeruleti_admin%';

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED (VISSZAGÖRDÍTVE): a(z) % policy szövegében MÉG MINDIG ott a hatókör nélküli „egyhazkeruleti_admin" szerep-név. A javítás nem érte el a célját.', v_baj;
  END IF;

  -- (2) B6 — és tényleg oda KELL kerülnie a hatókör-feloldónak (pozitív pár).
  SELECT string_agg(t.nev, ', ' ORDER BY t.nev) INTO v_baj
  FROM (VALUES
      ('logos_pastor_write','felettes_szint_szerkesztheto'),
      ('logos_pastor_update','felettes_szint_szerkesztheto'),
      ('logos_pastor_delete','felettes_szint_szerkesztheto'),
      ('dioceses_logos_esperes_write','current_user_district_ids'),
      ('dioceses_logos_esperes_update','current_user_district_ids'),
      ('dioceses_logos_esperes_delete','current_user_district_ids')
    ) AS t(nev, elvart_fuggveny)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies pol
    WHERE pol.schemaname='storage' AND pol.tablename='objects'
      AND pol.policyname = t.nev
      AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%' || t.elvart_fuggveny || '%'
  );

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED (VISSZAGÖRDÍTVE): a(z) % policy nem hivatkozik a várt hatókör-feloldó függvényre. Vagy nem jött létre, vagy más törzzsel.', v_baj;
  END IF;

  -- (3) B8 — mind a négy írási policy a rendszergazda-kapun kell álljon.
  SELECT string_agg(t.tabla || '.' || t.nev, ', ' ORDER BY t.tabla, t.nev) INTO v_baj
  FROM (VALUES
      ('befizetescel','befizetescel_write'),
      ('befizetescel','befizetescel_update'),
      ('kiadascel','kiadascel_write'),
      ('kiadascel','kiadascel_update')
    ) AS t(tabla, nev)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies pol
    WHERE pol.schemaname='public' AND pol.tablename = t.tabla
      AND pol.policyname = t.nev
      AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_has_global_access%'
  );

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED (VISSZAGÖRDÍTVE): a(z) % írási policy NEM a current_user_has_global_access() kapun áll.', v_baj;
  END IF;

  -- (4) B8 — és sehol se maradjon `true` az írási policy-kban.
  SELECT string_agg(pol.tablename || '.' || pol.policyname, ', ' ORDER BY pol.tablename, pol.policyname)
    INTO v_baj
  FROM pg_policies pol
  WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
    AND pol.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND (COALESCE(pol.qual,'') = 'true' OR COALESCE(pol.with_check,'') = 'true');

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED (VISSZAGÖRDÍTVE): a(z) % írási policy még mindig `true` kifejezésen áll. (Ha ez egy MÁS nevű, korábbi policy, azt is meg kell szüntetni — jelezd.)', v_baj;
  END IF;

  -- (5) GRANT-CSAPDA: a policy a HÍVÓ szerepében fut — EXECUTE nélkül 42501.
  SELECT string_agg(t.fn, ', ' ORDER BY t.fn) INTO v_baj
  FROM (VALUES
      ('public.felettes_szint_szerkesztheto(uuid)'),
      ('public.current_user_district_ids()'),
      ('public.current_user_has_global_access()')
    ) AS t(fn)
  WHERE NOT has_function_privilege('authenticated', t.fn, 'EXECUTE');

  IF v_baj IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL-CLOSED (VISSZAGÖRDÍTVE): az `authenticated` szerepnek NINCS EXECUTE joga ezekre: %. GRANT nélkül a policy nem tagadna, hanem 42501-gyel HIBÁZNA — a címerfeltöltés MINDENKINEK eltörne.', v_baj;
  END IF;

  IF NOT has_table_privilege('authenticated','public.dioceses','SELECT') THEN
    RAISE EXCEPTION 'FAIL-CLOSED (VISSZAGÖRDÍTVE): az `authenticated` szerep nem olvashatja a public.dioceses-t, pedig a dioceses-logos policy kerületi ága azt olvassa.';
  END IF;
END
$orszem_zaro$;

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT (UNION ALL) — a Supabase editor CSAK AZ UTOLSÓ eredményt ║
-- ║ mutatja, ezért minden sor EGY lekérdezésben van.                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT mit, ertek, teendo
FROM (

SELECT 10 AS sorszam,
       'B6 · A `logos` vödör író/törlő policy-i hatókörhöz vannak-e kötve?' AS mit,
       COALESCE((
         SELECT string_agg(
                  pol.policyname || ' [' || pol.cmd || '] → ' ||
                  CASE
                    WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%egyhazkeruleti_admin%'
                      THEN '⛔ MÉG MINDIG SZEREP-VAK'
                    WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%felettes_szint_szerkesztheto%'
                      THEN '✅ hatókörhöz kötve'
                    ELSE '⚠️ se vak szerep, se hatókör-feloldó — nézd meg kézzel'
                  END, E'\n' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND pol.policyname IN ('logos_pastor_write','logos_pastor_update','logos_pastor_delete')
       ), '⛔ egyik policy sem létezik') AS ertek,
       'ELVÁRT: 3 sor, mind ✅. Ha bármelyik ⛔, az 1. szakasz nem futott le (vagy visszagördült).' AS teendo

UNION ALL
SELECT 11,
       'B6 · A `dioceses-logos` vödör író/törlő policy-i hatókörhöz vannak-e kötve?',
       COALESCE((
         SELECT string_agg(
                  pol.policyname || ' [' || pol.cmd || '] → ' ||
                  CASE
                    WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%egyhazkeruleti_admin%'
                      THEN '⛔ MÉG MINDIG SZEREP-VAK'
                    WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_district_ids%'
                      THEN '✅ hatókörhöz kötve'
                    ELSE '⚠️ se vak szerep, se hatókör-feloldó — nézd meg kézzel'
                  END, E'\n' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND pol.policyname IN ('dioceses_logos_esperes_write','dioceses_logos_esperes_update','dioceses_logos_esperes_delete')
       ), '⛔ egyik policy sem létezik'),
       'ELVÁRT: 3 sor, mind ✅.'

UNION ALL
SELECT 12,
       'B6 · NEGATÍV ASSZERT — maradt-e BÁRHOL hatókör nélküli szerep-név a három címer-vödör policy-iban?',
       COALESCE((
         SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND (pol.policyname LIKE 'logos_%' OR pol.policyname LIKE 'dioceses_logos_%' OR pol.policyname LIKE 'districts_logos_%')
           AND pol.cmd <> 'SELECT'
           AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%egyhazkeruleti_admin%'
       ), '✅ SEHOL — a régi, vak viselkedés megszűnt'),
       'ELVÁRT: „SEHOL". Ha nevek jönnek, az a policy még a régi világ szerint enged.'

UNION ALL
SELECT 13,
       'B6 · Megmaradtak-e a legitim, VÁLTOZATLAN ágak? (saját gyülekezet + profilváltó + saját profilkép)',
       COALESCE((
         SELECT string_agg(
                  pol.policyname || ': ' ||
                  CASE WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%congregation_id%'
                       THEN 'saját gyülekezet ✅' ELSE 'saját gyülekezet ⚠️ HIÁNYZIK' END || ' / ' ||
                  CASE WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%profile_roles%'
                       THEN 'profilváltó ✅' ELSE 'profilváltó — (a törlőben szándékosan nincs)' END || ' / ' ||
                  -- ⚠️ Csak a SAJÁT-PROFILKÉP ágra jellemző minta: `(auth.uid())::text`.
                  --    (A puszta „profiles" szóra keresni vak lenne: azt a
                  --     public.profiles tábla neve is tartalmazza.)
                  CASE WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%uid())::text%'
                       THEN 'saját profilkép ✅' ELSE '— (a törlőben szándékosan nincs)' END,
                  E'\n' ORDER BY pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='storage' AND pol.tablename='objects'
           AND pol.policyname IN ('logos_pastor_write','logos_pastor_update','logos_pastor_delete')
       ), '⛔ egyik policy sem létezik'),
       'ELVÁRT: az író és a frissítő sorban mindhárom ág ott van; a törlőben a profilváltó és a profilkép SZÁNDÉKOSAN hiányzik.'

UNION ALL
SELECT 14,
       'B6 · Érintetlen maradt-e a publikus OLVASÁS? (a címer a nyomtatványokon és a nyilvános felületen kell)',
       COALESCE((SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ' ORDER BY pol.policyname)
                 FROM pg_policies pol
                 WHERE pol.schemaname='storage' AND pol.tablename='objects'
                   AND pol.policyname IN ('logos_read_all','dioceses_logos_read_all','districts_logos_read_all')),
                '⛔ ELTŰNTEK — a címerek nem jelennének meg'),
       'ELVÁRT: mind a három [SELECT]. Ez a fájl hozzájuk NEM nyúlt.'

UNION ALL
SELECT 20,
       'B8 · A közös számlatükör ÍRÁSI policy-i rendszergazdai kapun állnak-e?',
       COALESCE((
         SELECT string_agg(
                  pol.tablename || '.' || pol.policyname || ' [' || pol.cmd || '] → ' ||
                  CASE
                    WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_has_global_access%'
                      THEN '✅ rendszergazdai kapu'
                    WHEN COALESCE(pol.qual,'')='true' OR COALESCE(pol.with_check,'')='true'
                      THEN '⛔ MÉG MINDIG `true` — bárki átírhatja'
                    ELSE '⚠️ ismeretlen kifejezés — nézd meg kézzel'
                  END, E'\n' ORDER BY pol.tablename, pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
           AND pol.cmd <> 'SELECT'
       ), '⛔ egyetlen írási policy sincs'),
       'ELVÁRT: 4 sor (befizetescel_write/_update, kiadascel_write/_update), mind ✅.'

UNION ALL
SELECT 21,
       'B8 · NEGATÍV ASSZERT — maradt-e `true` írási kifejezés a két táblán?',
       COALESCE((
         SELECT string_agg(pol.tablename || '.' || pol.policyname || ' [' || pol.cmd || ']', ', '
                           ORDER BY pol.tablename, pol.policyname)
         FROM pg_policies pol
         WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
           AND pol.cmd <> 'SELECT'
           AND (COALESCE(pol.qual,'')='true' OR COALESCE(pol.with_check,'')='true')
       ), '✅ EGY SEM — a „bárki átírhatja" állapot megszűnt'),
       'ELVÁRT: „EGY SEM".'

UNION ALL
SELECT 22,
       'B8 · Megmaradt-e a mindenkinek járó OLVASÁS? (rögzítő ablakok, nyomtatványok, desktop-tükrözés)',
       COALESCE((SELECT string_agg(pol.tablename || '.' || pol.policyname || ' using=' || COALESCE(pol.qual,'∅'), ', '
                                   ORDER BY pol.tablename)
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
                   AND pol.cmd='SELECT'),
                '⛔ NINCS olvasó policy — a kategórialisták kiürülnének!'),
       'ELVÁRT: befizetescel_read + kiadascel_read, USING true. Ez a fájl hozzájuk NEM nyúlt.'

UNION ALL
SELECT 23,
       'B8 · Nem keletkezett-e véletlenül DELETE policy?',
       COALESCE((SELECT string_agg(pol.tablename||'.'||pol.policyname, ', ')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename IN ('befizetescel','kiadascel')
                   AND pol.cmd='DELETE'),
                '✅ nincs — a törlés RLS alatt továbbra is tiltott'),
       'ELVÁRT: „nincs".'

UNION ALL
SELECT 30,
       'GRANT · Megvan-e az EXECUTE a policy-kban hívott mindhárom függvényre? (enélkül 42501, nem tagadás)',
       -- ⚠️ A has_function_privilege() HIBÁT dob nem létező függvényre, ezért
       --    előbb a to_regprocedure() őrzi (az NULL-t ad, nem hibázik).
       (SELECT string_agg(t.fn || ' → ' ||
                 CASE WHEN to_regprocedure(t.fn) IS NULL THEN '⛔ A FÜGGVÉNY SINCS MEG'
                      WHEN has_function_privilege('authenticated', t.fn, 'EXECUTE') THEN '✅'
                      ELSE '⛔ NINCS EXECUTE' END,
                 E'\n' ORDER BY t.fn)
        FROM (VALUES ('public.felettes_szint_szerkesztheto(uuid)'),
                     ('public.current_user_district_ids()'),
                     ('public.current_user_has_global_access()')) AS t(fn)),
       'ELVÁRT: mind a három ✅. Ha bármelyik ⛔, a címerfeltöltés MINDENKINEK eltörik — azonnal jelezd.'

UNION ALL
SELECT 31,
       'GRANT · Olvashatja-e az `authenticated` a public.dioceses-t? (a megyei vödör kerületi ága ezt olvassa)',
       CASE WHEN has_table_privilege('authenticated','public.dioceses','SELECT') THEN '✅ igen' ELSE '⛔ NEM' END,
       'ELVÁRT: ✅.'

UNION ALL
SELECT 32,
       'ÉPSÉG · A rendszergazda-kapu tényleg csak rendszergazdát jelent? (nem említi az „esperes"-t)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='current_user_has_global_access'
                           AND p.prosrc LIKE '%esperes%')
            THEN '⛔ IGEN, említi — a B8 védelme sokkal gyengébb, mint hisszük'
            ELSE '✅ nem említi' END,
       'ELVÁRT: ✅. Ha ⛔, a 2026-08-11-es szűkítés visszagördült valahogy — azonnal jelezd.'

) AS ellenorzes
ORDER BY sorszam;


-- ────────────────────────────────────────────────────────────────────────────
-- PostgREST séma-gyorstár újratöltése
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
