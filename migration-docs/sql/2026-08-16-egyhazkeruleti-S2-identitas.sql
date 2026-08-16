-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI S2 — A KERÜLET HIVATALOS IDENTITÁSA            2026-08-16 ║
-- ║ Fájl: migration-docs/sql/2026-08-16-egyhazkeruleti-S2-identitas.sql      ║
-- ║ (docs/EGYHAZKERULETI-SZINT-INDITO-BRIEF-2026-08-15.md, S2 szelet)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ ELŐFELTÉTEL — ELŐBB EZEK FUSSANAK LE, EBBEN A SORRENDBEN:
--      1. 2026-08-15-egyhazkeruleti-S0-allapotfelmeres.sql   (csak olvas)
--      2. 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql (anon oszlop-GRANT)
--      3. 2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql
--    Ez a fájl FAIL-CLOSED őrszemmel leáll, ha az S1/S1b nem futott le —
--    lásd az 1/0 szakaszt és az indoklást a (3) pontnál.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠️  ENDRE DÖNTÉSÉRE VÁR — A PECSÉT ÉS AZ ALÁÍRÁS MA PUBLIKUSAN LETÖLTHETŐ ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- TÜNET (2026-08-16, adverzariális ellenőrzés): a `districts-logos` bucket
-- `public = true`, és a `districts_logos_read_all` policy `FOR SELECT TO anon`.
-- Vagyis a püspöki KEREK PECSÉT és az ALÁÍRÁS-KÉP az URL birtokában
-- BEJELENTKEZÉS NÉLKÜL letölthető. Ez nem „csak egy kép": egy átlátszó hátterű
-- pecsét-PNG és egy aláírás-PNG együtt KÉSZ OKIRAT-HAMISÍTÁSI FELÜLET. A
-- fájlnév ráadásul kitalálható ({district_id}/pecset-…), a kerület-azonosító
-- pedig a nyilvános regisztrációs legördülőből amúgy is megszerezhető.
--
-- ⚠️ EZ A FÁJL SZÁNDÉKOSAN NEM VÁLTOZTAT A BUCKET-SZERKEZETEN. A kérdés MIND A
--    HÁROM SZINTRE kiterjed (gyülekezet + egyházmegye + egyházkerület); egy
--    csendes, EGY szinten elvégzett átállítás a másik kettőt nyitva hagyná,
--    miközben a nyomtatvány-generálás a régi publikus URL-eket kérné, és a
--    képek NÉMÁN eltűnnének az iratokról. Ilyen döntés nem születhet mellékesen.
--
-- A KÉT LEHETŐSÉG:
--   (A) MARAD, AHOGY VAN — egyetlen publikus bucket (címer + pecsét + aláírás).
--       Előny: nincs kód-változás, a nyomtatvány marad egyszerű <img src>.
--       Ár:    a pecsét és az aláírás bárkinek letölthető, aki ismeri az URL-t.
--   (B) SZÉTVÁLASZTÁS — a CÍMER marad publikusan (a nyomtatványon és a nyilvános
--       felületeken is kell), a PECSÉT és az ALÁÍRÁS ÚJ, PRIVÁT bucketbe költözik
--       (pl. `districts-pecset`, public=false), és a felület rövid életű
--       SIGNED URL-lel kéri le őket.
--       Ár:    mind a három szinten migrálni kell a meglévő fájlokat ÉS a
--              *_url oszlopok tartalmát, és a nyomtatvány-generálás minden ágát
--              át kell vinni signed URL-re.
-- AJÁNLÁS: (B) — de KÜLÖN körben, mind a három szintre EGYSZERRE.
--
-- Amíg a döntés nem születik meg, a 2. szakasz (2/G-403 sor) EXPLICIT SORBAN
-- kiírja, hogy a pecsét/aláírás MA publikusan letölthető — hogy ez soha ne
-- NÉMA állapot legyen, hanem minden ellenőrzéskor szemünkbe nézzen.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT CSINÁL
-- ════════════════════════════════════════════════════════════════════════════
--
--  (1) A `districts` táblának MA PONTOSAN HÁROM oszlopa van: id, name,
--      created_at. A `dioceses`-nek 31. Ebből következik, hogy az egyházkerület
--      MA NEM TUD:
--        · kétnyelvű (magyar/román) fejlécet nyomtatni a hivatalos iratára,
--        · CIF-et / bankszámlát feltüntetni,
--        · pecsétet és aláírást tenni a kiállított iratra,
--        · a vezetői (püspök, adminisztrátor, számvevő) nevét az aláírás-rovatba
--          írni.
--      Ez a fájl a HIÁNYZÓ 27 oszlopot pótolja a `dioceses` MINTÁJÁRA (típusok,
--      DEFAULT-ok betűhűen), + 2 továbbit (`szamvevo_nev`, `teszt`) — összesen
--      29 új oszlopot. A `district_id` ÉRTELEMSZERŰEN NEM KELL: a kerület a
--      lánc TETEJE (Endre K3 döntése: NINCS 4. szint).
--
--  (2) ⚠️ A VEZETŐI OSZLOPOK NEM A MEGYEI NEVEKET KAPJÁK.
--      A `dioceses`-en `esperes_nev` / `esperes_cim` / `jegyzo_nev` áll. A
--      kerületnek NINCS esperese — Endre szava: „püspök, adminisztrátorok".
--      Ezért a kerületi hármas:
--        · `puspok_nev`          — a püspök neve (aláírás-rovat)
--        · `puspok_cim`          — a TISZTSÉG SZÖVEGE (a megyei `esperes_cim`
--                                  tükre: ott „esperes" / „esperesi megbízott",
--                                  itt „püspök" / „püspökhelyettes"). NEM postai
--                                  cím! A megyei elnevezés félrevezető, de a
--                                  KÉT SZINT KÖZTI PÁRHUZAM fontosabb, mint egy
--                                  szebb, de egyedi név.
--        · `adminisztrator_nev`  — az egyházkerületi adminisztrátor
--      ⛔ A districts-en SZÁNDÉKOSAN NEM JÖN LÉTRE `esperes_*` oszlop. A 2.
--         szakasz regressziós őrként ELLENŐRZI, hogy tényleg nincs — ha egy
--         későbbi „másoljuk át a megyeit" kör mégis létrehozná, azonnal látszik.
--      + `szamvevo_nev`: a 2026-08-15-egyhazmegyei-szamvevo-nev.sql kerületi
--        párja — az `egyhazkeruleti_szamvevo` szerep (S1) neve az irat
--        aláírás-rovatához. Szándékosan nullable: nem minden kerületnek van.
--
--  (3) ⛔ ANON-VÉDELEM — EZ A FÁJL LEGKOCKÁZATOSABB PONTJA.
--      Ma a `districts`-en két SELECT policy áll USING(true)-val (authenticated
--      + anon), mert a NYILVÁNOS regisztrációs űrlap (/hozzaferes-kerese)
--      bejelentkezés ELŐTT tölti a kerület-legördülőt. Ha most 29 oszlopot
--      adunk a táblához, és az anonnak TÁBLA-szintű SELECT joga volna, akkor a
--      CIF, az IBAN, a pecsét- és az aláírás-URL EGY PILLANAT ALATT bejelentkezés
--      nélkül olvashatóvá válna — pontosan az a szivárgás, amit a `dioceses`-en
--      2026-08-15-ig élesben elszenvedtünk.
--      AZ S1 EZT MÁR MEGELŐZTE: az anon joga OSZLOP-SZINTŰ (districts: id, name).
--      Az oszlop-szintű GRANT NEM terjed ki a később hozzáadott oszlopokra,
--      tehát az itt születő 29 oszlop AUTOMATIKUSAN zárt.
--      EBBŐL KÖVETKEZIK KÉT SZABÁLY, amit ez a fájl betart:
--        a) SEMMILYEN GRANT-ot nem ad az anonnak. Egyet sem.
--        b) A tranzakció VÉGÉN (az oszlopok létrejötte UTÁN, még COMMIT ELŐTT)
--           `has_column_privilege('anon', …)`-nal BIZONYÍTJA, hogy egyik új
--           oszlop sem olvasható anonimként — és ha mégis, a TELJES tranzakciót
--           visszagördíti. A fájl tehát KÉPTELEN szivárgó állapotot hagyni.
--        c) Az 1/0 őrszem leáll, ha az anonnak TÁBLA-szintű joga van (= az S1
--           vagy az S1b nem futott le).
--      ⚠️ Ha valaha KELL az anonnak új oszlop (pl. a román név a nyilvános
--         űrlapon), azt EXPLICIT `GRANT SELECT (nev_ro) … TO anon`-nal, LÁTHATÓ
--         döntésként kell megadni — nem itt, csendben.
--
--  (4) ÍRÁS-POLICY — MA EGYETLEN SINCS a `districts`-en.
--      Vagyis a kerületi admin a saját kerülete törzsadatát MA NEM TUDJA
--      MENTENI: RLS mellett policy nélkül az UPDATE NÉMÁN 0 sort érint (nem
--      hibázik!) — a felület „elmentve" üzenetet írna, az adat pedig nem
--      változna. Ez a projekt ismert néma hibaosztálya.
--      A javítás a `dioceses_update_diocese_scope` (2026-08-11-globalis-
--      hozzaferes-szukites.sql:1268-1273) kerületi párja:
--        districts_update_district_scope — FOR UPDATE TO authenticated,
--        USING/WITH CHECK: current_user_has_global_access()
--                          OR id = ANY (COALESCE(current_user_district_ids(), '{}'))
--      ⚠️ A RENDSZERGAZDA-ÁG NEM ELHAGYHATÓ (2026-08-16-i adverzariális találat,
--         és pont a NÉMA 0-soros UPDATE-tel bünteti a hiányát).
--         TÜNET, ha kimarad: a `current_user_district_ids()` KIZÁRÓLAG
--         `egyhazkeruleti_admin` szerepkör-sorokat gyűjt, tehát a GLOBÁLIS
--         adminnak (profiles.role='admin') ÜRES tömböt ad. Egyetlen írás-policy
--         mellett ebből az következne, hogy
--           (a) a rendszergazda NEM tudná kitölteni az itt születő CIF/IBAN/
--               püspök mezőket, és
--           (b) bármely kerület, amihez még nincs `egyhazkeruleti_admin`
--               kiosztva, SZERKESZTHETETLEN maradna
--         — mindkettő HIBAÜZENET NÉLKÜL: a felület „elmentve"-t írna, az adat
--         pedig nem változna.
--         A `dioceses`-en ez azért nem tűnt fel, mert ott KÉT írás-policy van
--         (a _diocese_scope MELLETT a dioceses_update_by_esperes, és a globális
--         admin ág ABBAN ül) — a districts-en nincs mire visszaesni, ezért ide
--         MAGÁBA a policy-ba kell a rendszergazda-ág.
--         ⛔ Egy későbbi „egyszerűsítés" NE vegye ki: a 2. szakasz 2/E-207 sora
--            külön ellenőrzi, hogy a policy MINDKÉT ága megvan-e.
--      ⚠️ INSERT/DELETE policy SZÁNDÉKOSAN NEM JÖN LÉTRE: új egyházkerület
--         létrehozása és törlése RENDSZERGAZDAI feladat (service_role /
--         seed-fájl), nem kerületi admin jogosultság. Romániában kettő van.
--      ⚠️ GRANT: a policy a HÍVÓ szerepében fut. GRANT nélkül a policy nem
--         tagad, hanem HIBÁZIK (403) — bizonyított hibaosztály. Ezért a
--         `GRANT SELECT, UPDATE ON public.districts TO authenticated` és MIND A
--         KÉT függvény-GRANT (`current_user_district_ids()` ÉS
--         `current_user_has_global_access()`) itt EXPLICIT módon, ugyanabban a
--         tranzakcióban szerepel (idempotens, ártalmatlan, ha már megvan).
--
--  (5) STORAGE: `districts-logos` bucket — a `dioceses-logos` (2026-04-18-
--      dioceses-cimer-setup.sql) mintájára. A CÍMER, a PECSÉT ÉS az ALÁÍRÁS is
--      EBBE megy, `{district_id}/…` prefix alatt (a megyei precedens: nincs
--      külön pecsét-bucket).
--      ⚠️ EGYETLEN, SZÁNDÉKOS ELTÉRÉS A MEGYEI MINTÁTÓL — és ez fontos:
--         a megyei bucket írás-policy-ja `p.role IN ('admin','egyhazkeruleti_admin')`
--         SKALÁR ágat használ. Ha ezt betűhűen átmásolnánk, akkor BÁRMELY
--         kerületi admin BÁRMELY MÁSIK kerület mappájába feltölthetne pecsétet
--         és aláírást. Ez pontosan a „skalár hatókör = néma teljes szivárgás"
--         hibaosztály. Ezért itt:
--           · globális ág: KIZÁRÓLAG `profiles.role='admin'` (+ system-scope
--             admin szerepkör-sor) — az `egyhazkeruleti_admin` NEM globális;
--           · kerületi ág: a mappanév a hívó `current_user_district_ids()`
--             hatókörében kell legyen (fail-closed COALESCE-szal);
--           · és a mappanév LÉTEZŐ kerület id-je kell legyen.
--         A storage-policy a rendszergazda-ágat KIÍRVA tartja, nem a
--         `public.current_user_has_global_access()` hívással. (A függvény a
--         2026-08-11-globalis-hozzaferes-szukites.sql óta MÁR CSAK a
--         rendszergazdát engedi be — a korábbi `esperes` / `egyhazmegyei_admin`
--         ágakat az a fájl zárta le —, tehát a KÉT alak ma egyenértékű; a
--         storage-nál mégis a kiírt alakot tartjuk meg, hogy egy jövőbeli
--         függvény-tágítás NE nyisson csendben kereszt-kerületi FELTÖLTÉST.)
--         ⚠️ NE keverd össze a (4) pontbeli `districts_update_district_scope`
--            policy-val: az TÖRZSADAT-írás, ott a függvény-alak a helyes (a
--            megyei pénzügyi policy-k kanonikus mintája).
--      ⚠️ A bucket PUBLIC (a címer-precedens): az URL birtokában a kép bárki
--         által letölthető — és ez a PECSÉTRE meg az ALÁÍRÁSRA is igaz.
--         ⛔ EZ NYITOTT DÖNTÉS: lásd a fájl elején az „ENDRE DÖNTÉSÉRE VÁR"
--            blokkot, és a 2. szakasz 2/G-403 sorát, ami minden ellenőrzéskor
--            KIÍRJA az aktuális állapotot.
--
--  (6) `updated_at` / `updated_by` + `tg_districts_updated` trigger: a
--      `districts` sorai eddig nem voltak követhetők (nincs is `updated_at`).
--      A trigger a megyei `tg_dioceses_updated` párja, ugyanazzal a közös
--      `public.tg_update_timestamp()` függvénnyel.
--
--  (7) `teszt boolean NOT NULL DEFAULT false` — Endre kérése: a „Teszt
--      Egyházkerület" a felületen LÁTHATÓAN legyen megjelölve. Az 1. szakasz
--      ŐRZÖTTEN (csak ha a sor létezik) true-ra állítja azt a sort, amelynek a
--      neve pontosan „Teszt Egyházkerület". App-tükör: a kerület-választó és a
--      kerületi fejléc „(teszt)" jelölése.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI NINCS BENNE (szándékosan)
-- ════════════════════════════════════════════════════════════════════════════
--   · `nev_ro` DB-szintű NOT NULL. A tábla MÁR TARTALMAZ kerület-sorokat román
--     név nélkül; egy azonnali NOT NULL a meglévő sorokon BUKNA, egy „töltsük
--     fel a magyar névvel" alapérték pedig HAMIS adatot írna a hivatalos
--     nyomtatványra. A kötelezőséget az ALKALMAZÁS érvényesíti (varázsló +
--     zod), pontosan a 2026-08-15-dioceses-nev-ro-en.sql döntése szerint.
--   · UNIQUE a `districts.name`-en. Az S0 szerint ma nincs duplikátum, de az
--     összevonás/megelőzés KÜLÖN, adat-tisztító kör (öt seed-fájl szúr be
--     districts sort név-egyezés alapján).
--   · A bejelentkezettek felé való szűkítés (ma minden bejelentkezett látja
--     minden kerület CIF-jét). Ez SZÉLESEBB döntés, az S1 fejléce is külön
--     tételként hagyta nyitva — a K4-hez tartozik (S1c szelet).
--   · Kerületi könyvelés/leltár/iktatás (K2) — az S5 szelet.
--
-- ÚJ TÁBLA NEM JÖN LÉTRE → a `backup_table_policy` besorolás nem változik.
-- (A kulcsoszlop egyébként `tabla`, NEM `table_name` — lásd #172.) A 0. és a
-- 2. szakasz tájékoztatásul MEGMÉRI, hogy a `districts` be van-e sorolva: ha
-- nincs, a napi mentés amúgy is hangosan áll, és az MOSTANTÓL érzékeny adatot
-- hagyna ki a mentésből.
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az UTOLSÓ utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--       Jelöld ki CSAK ezt, futtasd, OLVASD EL.
--   2.  1. SZAKASZ — A VÁLTOZTATÁS. Egyetlen tranzakció (BEGIN … COMMIT),
--       + utána a NOTIFY pgrst sor.
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: minden lépés őrzött; akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · districts TÖRZSADAT' AS szakasz,
       'Létezik-e a districts tábla, és hány oszlopa van?' AS mit,
       CASE WHEN to_regclass('public.districts') IS NULL
            THEN '⛔ NINCS districts tábla — az 1. szakasz őrszeme leáll'
            ELSE (SELECT count(*)::text FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='districts')
                 || ' oszlop  ⇄  dioceses: '
                 || (SELECT count(*)::text FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='dioceses')
                 || ' oszlop' END AS ertek,
       'Az S0 mérése szerint 3 ⇄ 31. Az 1. szakasz után 32 ⇄ 31 lesz (a kerületnek NINCS district_id-je, viszont van teszt + szamvevo_nev + a három kerületi vezetői oszlop).' AS teendo

UNION ALL
SELECT 2, '0/A · districts TÖRZSADAT',
       'A districts tábla ÖSSZES oszlopa MA',
       COALESCE((SELECT string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position)
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='districts'),
                '⛔ nincs ilyen tábla'),
       'Ha csak id/name/created_at: a kerületnek NINCS hivatalos identitása.'

UNION ALL
SELECT 3, '0/A · CÉL-OSZLOPOK',
       'A 29 cél-oszlopból hány van MÁR meg?',
       (SELECT count(*)::text
        FROM (VALUES ('adoszam'),('adminisztrator_nev'),('adrlocality_id'),('adrstreet_id'),
                     ('alairas_url'),('bank_fo_iban'),('bank_fo_iban_valuta'),('bank_nev'),
                     ('cif'),('cim_iranyitoszam'),('cim_megye'),('cim_orszag'),
                     ('cim_telepules'),('cim_utca'),('cimer_url'),('cnp_letter'),
                     ('email'),('megjegyzes'),('nev_en'),('nev_ro'),('pecset_url'),
                     ('puspok_cim'),('puspok_nev'),('szamvevo_nev'),('telefon'),
                     ('teszt'),('updated_at'),('updated_by'),('weboldal')) AS v(oszlop)
        WHERE EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema='public' AND c.table_name='districts'
                        AND c.column_name = v.oszlop)) || ' / 29',
       'Első futtatáskor 0/29 a várt érték. Újrafuttatáskor 29/29 (ADD COLUMN IF NOT EXISTS — semmit nem ír felül).'

UNION ALL
SELECT 4, '0/A · CÉL-OSZLOPOK',
       'MELYIK cél-oszlop hiányzik még?',
       COALESCE((SELECT string_agg(v.oszlop, ', ' ORDER BY v.oszlop)
                 FROM (VALUES ('adoszam'),('adminisztrator_nev'),('adrlocality_id'),('adrstreet_id'),
                              ('alairas_url'),('bank_fo_iban'),('bank_fo_iban_valuta'),('bank_nev'),
                              ('cif'),('cim_iranyitoszam'),('cim_megye'),('cim_orszag'),
                              ('cim_telepules'),('cim_utca'),('cimer_url'),('cnp_letter'),
                              ('email'),('megjegyzes'),('nev_en'),('nev_ro'),('pecset_url'),
                              ('puspok_cim'),('puspok_nev'),('szamvevo_nev'),('telefon'),
                              ('teszt'),('updated_at'),('updated_by'),('weboldal')) AS v(oszlop)
                 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                                   WHERE c.table_schema='public' AND c.table_name='districts'
                                     AND c.column_name = v.oszlop)),
                '✅ egy sem — a districts már teljes'),
       'EZ AZ 1. SZAKASZ PONTOS MUNKALISTÁJA.'

UNION ALL
SELECT 5, '0/A · VEZETŐI OSZLOPOK ⚠️',
       'Van-e VÉLETLENÜL esperes_* / jegyzo_nev oszlop a districts-en?',
       COALESCE((SELECT string_agg(c.column_name, ', ' ORDER BY c.column_name)
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='districts'
                   AND c.column_name IN ('esperes_nev','esperes_cim','jegyzo_nev')),
                '✅ nincs — helyes'),
       '⚠️ Ha van: valaki a MEGYEI oszlopneveket másolta át. A kerületnek nincs esperese. A helyes hármas: puspok_nev, puspok_cim (TISZTSÉG-szöveg!), adminisztrator_nev. Ez a fájl nem törli őket — szólj, és külön rendezzük.'

-- ── 0/B · A kerület-sorok mai állapota ──────────────────────────────────────
UNION ALL
SELECT 10, '0/B · KERÜLET-SOROK',
       'Hány egyházkerület van, és mi a nevük?',
       (SELECT count(*)::text FROM public.districts) || ' db: '
       || COALESCE((SELECT string_agg(name, ' | ' ORDER BY name) FROM public.districts), '—'),
       'Az S0 három sort mért: Erdélyi, Királyhágómelléki és a Teszt Egyházkerület.'

UNION ALL
SELECT 11, '0/B · TESZT-JELÖLÉS',
       'Van-e pontosan „Teszt Egyházkerület" nevű sor? (ezt jelöli meg az 1. szakasz)',
       COALESCE((SELECT id::text FROM public.districts
                 WHERE btrim(name) = 'Teszt Egyházkerület' LIMIT 1),
                '— nincs ilyen nevű sor (az 1. szakasz ŐRZÖTTEN kihagyja a jelölést)'),
       'Endre kérése: a teszt-kerület a felületen LÁTHATÓAN legyen megjelölve. A jelölést a teszt=true oszlop hordozza; ha a sor neve más, kézzel kell beállítani (az 1. szakasz NEM tippel).'

UNION ALL
SELECT 12, '0/B · NÉV-DUPLIKÁTUM',
       'Van-e AZONOS NEVŰ egyházkerület? (a name-en NINCS UNIQUE)',
       COALESCE((SELECT string_agg(s.name || ' (' || s.db::text || '×)', ', ')
                 FROM (SELECT name, count(*) AS db FROM public.districts
                       GROUP BY name HAVING count(*) > 1) s),
                '✅ nincs duplikátum'),
       '⚠️ Ha van: az azonos nevű sorok MIND megkapják az új oszlopokat, és a kerületi admin csak az egyikét tölti ki — a másik üres identitással él tovább. ELŐBB vond össze őket.'

-- ── 0/C · ANON — a legfontosabb mérés (ELŐFELTÉTEL) ─────────────────────────
UNION ALL
SELECT 20, '0/C · ANON ⛔ ELŐFELTÉTEL',
       'Van-e az anonnak TÁBLA-szintű SELECT joga a districts-en?',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
            THEN '⚠️ nincs anon szerep ebben az adatbázisban'
            WHEN has_table_privilege('anon', 'public.districts'::regclass, 'SELECT')
            THEN '⛔ IGEN — AZ S1 NEM FUTOTT LE. Az 1. szakasz őrszeme leáll.'
            ELSE '✅ nincs (oszlop-szintűre szűkítve — az S1 lefutott)' END,
       '⛔ Ha ⛔: ELŐBB futtasd a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql-t. Enélkül a most születő CIF/IBAN/pecsét/aláírás egy pillanat alatt BEJELENTKEZÉS NÉLKÜL olvashatóvá válna.'

UNION ALL
SELECT 21, '0/C · ANON',
       'Mely OSZLOPOKRA van MA az anonnak SELECT joga a districts-en?',
       COALESCE((SELECT string_agg(cp.column_name, ', ' ORDER BY cp.column_name)
                 FROM information_schema.column_privileges cp
                 WHERE cp.table_schema='public' AND cp.table_name='districts'
                   AND cp.grantee='anon' AND cp.privilege_type='SELECT'),
                '(nincs oszlop-szintű GRANT)'),
       'Az ELVÁRT pontosan: id, name. Ennyi kell a nyilvános regisztrációs legördülőnek — és semmivel sem több.'

UNION ALL
SELECT 22, '0/C · ANON ⛔ ELŐFELTÉTEL',
       'Van-e az anonnak TÁBLA-szintű ÍRÁSI joga (INSERT/UPDATE/DELETE/TRUNCATE)?',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
            THEN '⚠️ nincs anon szerep'
            ELSE COALESCE((SELECT string_agg(j.jog, ', ' ORDER BY j.jog)
                           FROM (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) AS j(jog)
                           WHERE has_table_privilege('anon', 'public.districts'::regclass, j.jog)),
                          '✅ egy sem') END,
       '⛔ Ha bármit felsorol: az S1b nem futott le. A TRUNCATE-re az RLS SOHA nem vonatkozik — aki TRUNCATE-elhet, kiürítheti a kerület-törzset. Az 1. szakasz őrszeme leáll.'

UNION ALL
SELECT 23, '0/C · ANON',
       'REGRESSZIÓS ŐR: megvan-e még az anon SELECT policy? (a legördülőhöz)',
       COALESCE((SELECT string_agg(pol.policyname, ', ')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND 'anon' = ANY (pol.roles) AND pol.cmd IN ('SELECT','ALL')),
                '⛔ NINCS — a /hozzaferes-kerese legördülője MA IS üres'),
       'Az RLS és a GRANT KÉT külön kapu; mindkettő kell. Ez a fájl a SELECT policy-khoz NEM nyúl.'

-- ── 0/D · Írás-policy és RLS ────────────────────────────────────────────────
UNION ALL
SELECT 30, '0/D · RLS',
       'Be van-e kapcsolva az RLS a districts táblán?',
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ igen'
                             ELSE '⚠️ NINCS — a policy-k hatástalanok, minden bejelentkezett bármit írhat, ha van GRANT-ja' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='districts'),
                '⛔ nincs ilyen tábla'),
       'Az 1/F FELTÉTEL NÉLKÜL kiadja az ALTER TABLE … ENABLE ROW LEVEL SECURITY-t (nem „őrzötten"): a Postgres ezt idempotensnek veszi — ha már be van kapcsolva, nem történik semmi. A meglévő USING(true) SELECT policy-k miatt a bekapcsolás az olvasást nem sérti. (2026-08-16: korábban „ŐRZÖTTEN bekapcsolja" állt itt, miközben az 1/F feltétel nélkül futtatja — a fájl két helyen mást állított.)'

UNION ALL
SELECT 31, '0/D · POLICY-K',
       'A districts ÖSSZES policy-ja MA (név + művelet)',
       COALESCE((SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ' ORDER BY pol.policyname)
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'),
                '(egy sincs)'),
       'Az S0 kettőt mért: districts_read [SELECT] és districts_read_anon [SELECT].'

UNION ALL
SELECT 32, '0/D · ÍRÁS-POLICY ⛔',
       'Van-e MA BÁRMILYEN írás-policy (UPDATE/INSERT/DELETE/ALL)?',
       COALESCE((SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND pol.cmd IN ('UPDATE','INSERT','DELETE','ALL')),
                '⛔ EGY SINCS — a kerületi admin MA NEM tudja menteni a saját kerülete adatait'),
       'RLS mellett policy nélkül az UPDATE NÉMÁN 0 sort érint (nem hibázik!) — a felület „elmentve"-t írna, az adat nem változna. Az 1. szakasz hozza létre a districts_update_district_scope policy-t, KÉT ággal: rendszergazda (current_user_has_global_access) VAGY a saját kerület (current_user_district_ids). A rendszergazda-ág nélkül maga a RENDSZERGAZDA sem tudná kitölteni a most születő CIF/IBAN/püspök mezőket — ugyanezzel a néma 0-soros UPDATE-tel.'

UNION ALL
SELECT 33, '0/D · GRANT',
       'Milyen tábla-szintű joga van MA az authenticated-nek a districts-en?',
       COALESCE((SELECT string_agg(j.jog, ', ' ORDER BY j.jog)
                 FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS j(jog)
                 WHERE has_table_privilege('authenticated', 'public.districts'::regclass, j.jog)),
                '⛔ egy sem'),
       'Az elvárt az 1. szakasz után: SELECT, UPDATE. INSERT/DELETE SZÁNDÉKOSAN nem (új kerület létrehozása rendszergazdai feladat).'

-- ── 0/E · A hatókör-függvények (a policy ezekre épül) ───────────────────────
UNION ALL
SELECT 40, '0/E · HATÓKÖR ⛔ ELŐFELTÉTEL',
       'Létezik-e a current_user_district_ids() (ÍRÁSI hatókör)?',
       CASE WHEN to_regprocedure('public.current_user_district_ids()') IS NULL
            THEN '⛔ NINCS — az 1. szakasz őrszeme leáll'
            ELSE '✅ létezik' END,
       'Erre épül az új írás-policy. Ha ⛔: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.'

UNION ALL
SELECT 41, '0/E · HATÓKÖR ⛔',
       'Futtathatja-e az authenticated a current_user_district_ids()-t?',
       CASE WHEN to_regprocedure('public.current_user_district_ids()') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('authenticated',
                   'public.current_user_district_ids()'::regprocedure, 'EXECUTE')
              THEN '✅ van GRANT'
            ELSE '⛔ NINCS — a policy nem tagadna, hanem 403-mal HIBÁZNA' END,
       'A policy a HÍVÓ szerepében fut. Az 1. szakasz a GRANT-ot mindenképp kiadja (idempotens).'

-- 2026-08-16: az írás-policy MÁSODIK lába. A district_ids() KIZÁRÓLAG
-- egyhazkeruleti_admin sorokat gyűjt → a rendszergazdának ÜRES tömböt ad; e
-- függvény nélkül a globális admin NÉMÁN 0 sort írna a saját törzsadatába.
UNION ALL
SELECT 43, '0/E · HATÓKÖR ⛔ ELŐFELTÉTEL',
       'Létezik-e a current_user_has_global_access() (RENDSZERGAZDA-ág)?',
       CASE WHEN to_regprocedure('public.current_user_has_global_access()') IS NULL
            THEN '⛔ NINCS — az 1. szakasz őrszeme leáll'
            ELSE '✅ létezik' END,
       'Az írás-policy MÁSIK lába. Ha ⛔: előbb a 2026-04-12-phase-0-rls-hardening.sql, majd a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le (utóbbi szűkítette rendszergazdára — az esperes/egyhazmegyei_admin ágakat lezárta).'

UNION ALL
SELECT 44, '0/E · HATÓKÖR ⛔',
       'Futtathatja-e az authenticated a current_user_has_global_access()-t?',
       CASE WHEN to_regprocedure('public.current_user_has_global_access()') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('authenticated',
                   'public.current_user_has_global_access()'::regprocedure, 'EXECUTE')
              THEN '✅ van GRANT'
            ELSE '⛔ NINCS — a policy rendszergazda-ága 403-mal HIBÁZNA' END,
       'A policy MINDKÉT lába függvényhívás, tehát MINDKETTŐRE kell GRANT. Az 1. szakasz ezt is kiadja (idempotens).'

UNION ALL
SELECT 42, '0/E · HATÓKÖR',
       'Létezik-e a current_user_district_olvaso_ids() (OLVASÁSI hatókör, S1)?',
       CASE WHEN to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL
            THEN '⚠️ nincs — az S1 nem futott le teljesen'
            ELSE '✅ létezik' END,
       'Tájékoztató: ez a fájl az ÍRÁSIT használja (a szerkesztéshez), az olvasóra az S3 szelet épít.'

-- ── 0/F · Storage ──────────────────────────────────────────────────────────
UNION ALL
SELECT 50, '0/F · STORAGE',
       'Létezik-e már a districts-logos bucket?',
       COALESCE((SELECT 'már létezik: public=' || b.public::text
                        || ', limit=' || COALESCE(b.file_size_limit::text, '—')
                 FROM storage.buckets b WHERE b.id = 'districts-logos'),
                '— még nincs (ez a fájl hozza létre)'),
       'A címer, a PECSÉT és az ALÁÍRÁS is ide megy, {district_id}/ prefix alatt — a megyei minta szerint (nincs külön pecsét-bucket).'

UNION ALL
SELECT 51, '0/F · STORAGE',
       'A MINTA: milyen a dioceses-logos bucket?',
       COALESCE((SELECT 'public=' || b.public::text || ', limit=' || COALESCE(b.file_size_limit::text,'—')
                        || ', mime=' || COALESCE(array_to_string(b.allowed_mime_types, '/'), '—')
                 FROM storage.buckets b WHERE b.id = 'dioceses-logos'),
                '⚠️ nincs dioceses-logos bucket sem'),
       'Az új bucket BETŰHŰEN ezt kapja: public=true, 2 MB, jpeg/png/webp.'

UNION ALL
SELECT 52, '0/F · STORAGE',
       'Van-e már districts_logos_* storage policy?',
       COALESCE((SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ' ORDER BY pol.policyname)
                 FROM pg_policies pol
                 WHERE pol.schemaname='storage' AND pol.tablename='objects'
                   AND pol.policyname LIKE 'districts_logos_%'),
                '— még egy sincs (ez a fájl hozza a 4-et)'),
       'Elvárt az 1. szakasz után: read_all [SELECT], kerulet_write [INSERT], kerulet_update [UPDATE], kerulet_delete [DELETE].'

-- ── 0/G · Trigger-előfeltétel ──────────────────────────────────────────────
UNION ALL
SELECT 60, '0/G · TRIGGER',
       'Létezik-e a közös public.tg_update_timestamp() függvény?',
       CASE WHEN to_regprocedure('public.tg_update_timestamp()') IS NULL
            THEN '— nincs (az 1. szakasz ŐRZÖTTEN létrehozza, a megyeivel azonos törzzsel)'
            ELSE '✅ létezik (a dioceses is ezt használja — NEM írjuk felül)' END,
       'Az updated_at karbantartásához kell. Meglévő függvényt SOHA nem írunk felül: lehet, hogy azóta bővült.'

UNION ALL
SELECT 61, '0/G · TRIGGER',
       'Van-e már tg_districts_updated trigger?',
       COALESCE((SELECT t.tgname FROM pg_trigger t
                 WHERE t.tgrelid = to_regclass('public.districts')
                   AND t.tgname = 'tg_districts_updated' AND NOT t.tgisinternal),
                '— még nincs'),
       'Tájékoztató. Az 1. szakasz DROP + CREATE párral idempotensen újraköti.'

-- ── 0/H · Cím-FK előfeltétel ───────────────────────────────────────────────
UNION ALL
SELECT 70, '0/H · CÍM-FK',
       'Léteznek-e az adrlocality / adrstreet táblák? (az FK-hoz)',
       CASE WHEN to_regclass('public.adrlocality') IS NOT NULL
             AND to_regclass('public.adrstreet') IS NOT NULL
            THEN '✅ mindkettő létezik — az FK-k létrejönnek'
            ELSE '⚠️ hiányzik valamelyik — az oszlopok FK NÉLKÜL jönnek létre (nem blokkoló)' END,
       'A dioceses ugyanezt a két integer oszlopot használja (ON DELETE SET NULL). Az FK-t az 1. szakasz ŐRZÖTTEN adja hozzá.'

-- ── 0/I · Mentés-besorolás ─────────────────────────────────────────────────
UNION ALL
SELECT 80, '0/I · MENTÉS',
       'Be van-e sorolva a districts a backup_table_policy-ba?',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL
            THEN '⚠️ nincs backup_table_policy tábla'
            ELSE COALESCE((SELECT 'hatokor=' || COALESCE(b.hatokor,'?')
                           FROM public.backup_table_policy b WHERE b.tabla = 'districts' LIMIT 1),
                          '⚠️ NINCS besorolva — a napi mentés hangosan áll') END,
       'ÚJ TÁBLA NEM JÖN LÉTRE, tehát új sor sem kell. De MOSTANTÓL érzékeny adat (CIF, IBAN, vezetők) kerül ide: ha nincs besorolva, az a mentésből is kimarad. A kulcsoszlop `tabla` (NEM table_name).'

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A VÁLTOZTATÁS                              FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ. Ha bármi hibázik, MINDEN visszagördül.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '5min';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/0) ŐRSZEM — fail-closed. Előfeltétel nélkül NEM futunk.
-- ────────────────────────────────────────────────────────────────────────────
-- „A migration-fájl NEM bizonyíték arra, hogy lefutott élesben." Ez az őrszem
-- az ÉLŐ állapotot méri, nem a repót.
DO $orszem$
DECLARE
  v_jogok text;
BEGIN
  IF to_regclass('public.districts') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL HIÁNYZIK: nincs public.districts tábla.';
  END IF;

  IF to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: nincs current_user_district_ids() függvény — enélkül az írás-policy nem építhető meg. Előbb a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;

  -- ⚠️ 2026-08-16: az írás-policy MÁSODIK lába. TÜNET, ha kimarad:
  --    a current_user_district_ids() KIZÁRÓLAG egyhazkeruleti_admin sorokat
  --    gyűjt, tehát a GLOBÁLIS adminnak ÜRES tömböt ad — rendszergazda-ág
  --    nélkül a saját rendszergazda sem tudná menteni a kerület törzsadatát,
  --    ráadásul NÉMÁN (0-soros UPDATE, „elmentve" felirattal).
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: nincs current_user_has_global_access() függvény — enélkül az írás-policy RENDSZERGAZDA-ága nem építhető meg, és a globális admin NÉMÁN 0 sort írna. Előbb a 2026-04-12-phase-0-rls-hardening.sql, majd a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;

  -- ⛔ A LEGFONTOSABB ŐR. Ha az anonnak TÁBLA-szintű SELECT joga van, akkor az
  --    S1 nem futott le, és a most születő 29 oszlop (CIF, IBAN, pecsét-URL,
  --    aláírás-URL) AZONNAL bejelentkezés nélkül olvashatóvá válna. Egy
  --    identitás-bővítő fájlnak ilyet SOHA nem szabad megengednie.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_table_privilege('anon', 'public.districts'::regclass, 'SELECT') THEN
      RAISE EXCEPTION
        'FAIL-CLOSED: az anon szerepnek TÁBLA-SZINTŰ SELECT joga van a districts-en → az itt születő CIF/IBAN/pecsét/aláírás azonnal ANONIM olvasható lenne. ELŐBB futtasd a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fájlt (az oszlop-szintű GRANT-ra szűkítést).';
    END IF;

    -- ⚠️ Az alias KÜLÖN nevet kap az oszloptól (t(jog)): egy `AS j` alakban a
    --    bare `j` hivatkozás alias⇄oszlop ütközést hozna a string_agg-ban.
    SELECT string_agg(t.jog, ', ') INTO v_jogok
    FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS t(jog)
    WHERE has_table_privilege('anon', 'public.districts'::regclass, t.jog);

    IF v_jogok IS NOT NULL THEN
      RAISE EXCEPTION
        'FAIL-CLOSED: az anon szerepnek ÍRÁSI joga van a districts-en (%). A TRUNCATE-re az RLS SOHA nem vonatkozik. ELŐBB futtasd a 2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql fájlt.', v_jogok;
    END IF;
  END IF;
END
$orszem$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) A HIVATALOS IDENTITÁS OSZLOPAI — a dioceses mintájára
-- ────────────────────────────────────────────────────────────────────────────
-- A típusok és a DEFAULT-ok BETŰHŰEN a megyei fájlokból:
--   2026-04-18-egyhazmegyei-modul-fazis6.sql (CIF, cím, bank, vezetők, updated_*)
--   2026-04-18-dioceses-cimer-setup.sql      (cimer_url)
--   2026-04-21-adr-schema-bovites.sql        (adrlocality_id, adrstreet_id)
--   2026-08-15-dioceses-nev-ro-en.sql        (nev_ro, nev_en)
--   2026-08-15-egyhazmegyei-iktato-leltar-s4.sql (pecset_url, alairas_url)
--   2026-08-15-egyhazmegyei-szamvevo-nev.sql (szamvevo_nev)

ALTER TABLE public.districts
  -- Kétnyelvű hivatalos név (a fejléchez). A `name` a magyar hivatalos név.
  ADD COLUMN IF NOT EXISTS nev_ro text,
  ADD COLUMN IF NOT EXISTS nev_en text,

  -- Jogi és pénzügyi azonosítók
  ADD COLUMN IF NOT EXISTS cif text,                     -- román adóazonosító (CIF)
  ADD COLUMN IF NOT EXISTS adoszam text,                 -- magyar adószám (ha van)
  ADD COLUMN IF NOT EXISTS cnp_letter text,              -- hivatali főszám, ha van

  -- Cím — szöveges mezők + a hivatalos (adr) azonosítók
  ADD COLUMN IF NOT EXISTS cim_orszag text DEFAULT 'Románia',
  ADD COLUMN IF NOT EXISTS cim_megye text,
  ADD COLUMN IF NOT EXISTS cim_telepules text,
  ADD COLUMN IF NOT EXISTS cim_iranyitoszam text,
  ADD COLUMN IF NOT EXISTS cim_utca text,
  ADD COLUMN IF NOT EXISTS adrlocality_id integer,
  ADD COLUMN IF NOT EXISTS adrstreet_id integer,

  -- Elérhetőségek
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS weboldal text,

  -- Banki adatok. ⚠️ A varázslóban NEM KÖTELEZŐ (Endre: „a banki kontók
  -- beállítása később") — ezért itt sincs semmilyen NOT NULL.
  ADD COLUMN IF NOT EXISTS bank_nev text,
  ADD COLUMN IF NOT EXISTS bank_fo_iban text,
  ADD COLUMN IF NOT EXISTS bank_fo_iban_valuta text DEFAULT 'RON',

  -- Vezetés (meta) — ⚠️ KERÜLETI nevek, NEM a megyei esperes_*/jegyzo_nev!
  ADD COLUMN IF NOT EXISTS puspok_nev text,
  ADD COLUMN IF NOT EXISTS puspok_cim text,
  ADD COLUMN IF NOT EXISTS adminisztrator_nev text,
  ADD COLUMN IF NOT EXISTS szamvevo_nev text,

  -- Hitelesítés-képek (mind a districts-logos bucketben, {district_id}/ alatt)
  ADD COLUMN IF NOT EXISTS cimer_url text,
  ADD COLUMN IF NOT EXISTS pecset_url text,
  ADD COLUMN IF NOT EXISTS alairas_url text,

  -- Egyéb
  ADD COLUMN IF NOT EXISTS megjegyzes text,
  ADD COLUMN IF NOT EXISTS teszt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) CÍM-FK-k — csak ha az adr-törzs létezik (nem blokkoló előfeltétel)
-- ────────────────────────────────────────────────────────────────────────────
-- A dioceses mintája (2026-04-21-adr-schema-bovites.sql:194-221): integer
-- oszlop + FK ON DELETE SET NULL, hogy egy törölt helység/utca ne akadályozza
-- a kerület sorának megmaradását.
DO $cim_fk$
BEGIN
  IF to_regclass('public.adrlocality') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('public.districts')
                       AND conname = 'districts_adrlocality_fk') THEN
    ALTER TABLE public.districts
      ADD CONSTRAINT districts_adrlocality_fk
        FOREIGN KEY (adrlocality_id) REFERENCES public.adrlocality(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ districts_adrlocality_fk létrehozva.';
  END IF;

  IF to_regclass('public.adrstreet') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = to_regclass('public.districts')
                       AND conname = 'districts_adrstreet_fk') THEN
    ALTER TABLE public.districts
      ADD CONSTRAINT districts_adrstreet_fk
        FOREIGN KEY (adrstreet_id) REFERENCES public.adrstreet(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ districts_adrstreet_fk létrehozva.';
  END IF;
END
$cim_fk$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) OSZLOP-MAGYARÁZATOK — a MIÉRT, nem a MIT
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.districts.nev_ro IS
  'Az egyházkerület hivatalos ROMÁN neve (pl. „Eparhia Reformată din Ardeal"). A nyomtatvány-fejlécek kétnyelvű alakjához KÖTELEZŐ — a kötelezőséget az ALKALMAZÁS (beállítás-varázsló + zod) érvényesíti, NEM a DB. Ok: a tábla már tartalmaz kerület-sorokat román név nélkül; egy azonnali NOT NULL bukna, egy „töltsük fel a magyarral" alapérték pedig HAMIS adatot írna a hivatalos iratra. (A 2026-08-15-dioceses-nev-ro-en.sql döntésének kerületi párja.)';
COMMENT ON COLUMN public.districts.nev_en IS
  'Az egyházkerület ANGOL neve (opcionális) — a dioceses.nev_en / congregations.nev_en párja.';

COMMENT ON COLUMN public.districts.cif IS
  'Az egyházkerület román adóazonosítója (CIF). A kerületi nyugtákon és pénzügyi dokumentumokon jelenik meg. ⚠️ ÉRZÉKENY: az anon szerep SOHA nem kaphat rá SELECT jogot (oszlop-szintű GRANT, S1).';
COMMENT ON COLUMN public.districts.bank_fo_iban IS
  'Fő banki IBAN gyors megjelenítéshez. ⚠️ A beállítás-varázslóban NEM KÖTELEZŐ (Endre: „a banki kontók beállítása később") — a teljes bankszámla-lista később a bankszamlak táblába kerül. ⚠️ ÉRZÉKENY: anon SOHA.';

COMMENT ON COLUMN public.districts.puspok_nev IS
  'Az egyházkerület PÜSPÖKÉNEK neve (a hivatalos irat aláírás-rovatához). Endre szava a kerületi vezetőkről: „püspök, adminisztrátorok". A megyei esperes_nev kerületi párja — a varázsló LISTÁBÓL kínálja fel (a kerülethez kiosztott szerepkörök és a kerület lelkészei közül), nem kézzel gépelendő.';
COMMENT ON COLUMN public.districts.puspok_cim IS
  '⚠️ NEM POSTAI CÍM, hanem a TISZTSÉG SZÖVEGE — pl. „püspök", „püspökhelyettes". Betűhű párja a dioceses.esperes_cim mezőnek („esperes" / „esperesi megbízott"). A név alá kerül a nyomtatvány aláírás-rovatában. A megtévesztő elnevezést szándékosan tartjuk: a két szint közti PÁRHUZAM fontosabb, mint egy szebb, de egyedi oszlopnév.';
COMMENT ON COLUMN public.districts.adminisztrator_nev IS
  'Az egyházkerületi ADMINISZTRÁTOR neve (a megyei jegyzo_nev kerületi párja). Az aláírás-rovat második neve. Listából választható.';
COMMENT ON COLUMN public.districts.szamvevo_nev IS
  'Az egyházkerületi SZÁMVEVŐ neve — a hivatalos irat aláírás-rovatának harmadik neve. Szándékosan nullable: nem minden kerületnek van kiosztott számvevője. A varázsló azt kínálja fel, akinek `egyhazkeruleti_szamvevo` szerepkör-sora van erre a kerületre (a szerepet az S1 vezette be). A 2026-08-15-egyhazmegyei-szamvevo-nev.sql párja.';

COMMENT ON COLUMN public.districts.cimer_url IS
  'Az egyházkerületi címer publikus URL-je a districts-logos Storage bucketből ({district_id}/ prefix). A beállítás-varázsló tölti fel.';
COMMENT ON COLUMN public.districts.pecset_url IS
  'A püspöki hivatal KEREK PECSÉTJÉNEK képe (PNG/WEBP, átlátszó háttér) — a kerületi nyomtatványok közepére kerül, halványan. Ugyanabban a districts-logos bucketben él, mint a címer ({district_id}/ prefix) — a megyei precedens szerint nincs külön pecsét-bucket. Legea 489/2006 Art. 15: a pecséten a hivatalos elnevezés kötelező. ⚠️ A bucket MA PUBLIC: ez a kép az URL birtokában BEJELENTKEZÉS NÉLKÜL letölthető. NYITOTT DÖNTÉS (mind a három szintre): privát bucket + signed URL vagy marad — lásd a 2026-08-16-egyhazkeruleti-S2-identitas.sql fejlécében az „ENDRE DÖNTÉSÉRE VÁR" blokkot.';
COMMENT ON COLUMN public.districts.alairas_url IS
  'A püspöki ALÁÍRÁS képe (PNG/WEBP, átlátszó háttér) — a kerületi nyomtatványokon az aláíró neve/vonala fölé kerül. ⚠️ A districts-logos bucket PUBLIC (a címer-precedens): az URL birtokában a kép BEJELENTKEZÉS NÉLKÜL letölthető, és egy pecsét-PNG-vel együtt kész okirat-hamisítási felület. A privát bucketre váltás a gyülekezeti és a megyei szinttel KÖZÖS, NYITOTT döntés — lásd a 2026-08-16-egyhazkeruleti-S2-identitas.sql fejlécében az „ENDRE DÖNTÉSÉRE VÁR" blokkot; az aktuális állapotot a fájl 2/G-403 ellenőrző sora írja ki.';

COMMENT ON COLUMN public.districts.teszt IS
  '2026-08-16 (Endre kérése): TESZT-kerület jelölő. A felület LÁTHATÓAN „(teszt)"-ként jelöli az ilyen kerületet (kerület-választó, kerületi fejléc), hogy éles és próba-adat soha ne mosódjon össze. NOT NULL DEFAULT false — az éles kerületek automatikusan false-ok. Az 1. szakasz kizárólag a pontosan „Teszt Egyházkerület" nevű sort állítja true-ra.';
COMMENT ON COLUMN public.districts.updated_at IS
  'Utolsó módosítás időpontja — a tg_districts_updated trigger tartja karban (a megyei tg_dioceses_updated párja). Eddig a districts sorai egyáltalán nem voltak követhetők.';
COMMENT ON COLUMN public.districts.updated_by IS
  'Az utolsó módosító profil azonosítója (auth.users.id). Az alkalmazás tölti a mentéskor; a trigger SZÁNDÉKOSAN nem írja felül (a dioceses mintája).';

COMMENT ON COLUMN public.districts.adrlocality_id IS
  'Hivatalos helység-azonosító (adrlocality). NULL, ha a felhasználó csak a szöveges cim_telepules mezőt tölti ki. A dioceses párja.';
COMMENT ON COLUMN public.districts.adrstreet_id IS
  'Hivatalos utca-azonosító (adrstreet). NULL, ha csak a szöveges cim_utca van kitöltve. A dioceses párja.';

COMMENT ON TABLE public.districts IS
  'Egyházkerületek (a rendszer 3., LEGFELSŐ szintje — Endre K3 döntése: NINCS 4. szint). 2026-08-16 (S2): a tábla megkapta a hivatalos identitását a dioceses mintájára (kétnyelvű név, CIF, cím, bank, vezetők: püspök + adminisztrátor + számvevő, címer/pecsét/aláírás). ⚠️ Az anon szerep KIZÁRÓLAG az (id, name) oszlopokat olvashatja — a nyilvános regisztrációs űrlap legördülőjéhez; minden más BEJELENTKEZÉST kíván. Új oszlop hozzáadásakor az anon automatikusan NEM kap rá jogot (oszlop-szintű GRANT, S1) — ez szándékos, fail-closed viselkedés.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) updated_at TRIGGER — a megyei tg_dioceses_updated párja
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ A KÖZÖS függvényt CSAK AKKOR hozzuk létre, ha nincs. Meglévőt SOHA nem
--    írunk felül: a dioceses és a profile_preferences is ezt használja, és
--    lehet, hogy azóta bővült — egy vak CREATE OR REPLACE némán visszavenné.
DO $ts_fn$
BEGIN
  IF to_regprocedure('public.tg_update_timestamp()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.tg_update_timestamp()
      RETURNS trigger AS $torzs$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $torzs$ LANGUAGE plpgsql;
    $fn$;
    RAISE NOTICE '✅ public.tg_update_timestamp() létrehozva (eddig nem létezett).';
  END IF;
END
$ts_fn$;

DROP TRIGGER IF EXISTS tg_districts_updated ON public.districts;
CREATE TRIGGER tg_districts_updated
  BEFORE UPDATE ON public.districts
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();


-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) A TESZT-KERÜLET MEGJELÖLÉSE — ŐRZÖTTEN
-- ────────────────────────────────────────────────────────────────────────────
-- Endre kérése: a Teszt Egyházkerület a felületen LÁTHATÓAN legyen megjelölve.
-- ⚠️ KIZÁRÓLAG a PONTOSAN „Teszt Egyházkerület" nevű sort jelöljük (btrim-mel,
--    a véletlen szóközök miatt). SEMMILYEN mintaillesztés (LIKE '%teszt%'):
--    egy valódi kerület neve sem eshet áldozatul. Ha nincs ilyen sor, a fájl
--    NEM tippel — csak jelez.
DO $teszt_jeloles$
DECLARE
  v_db integer;
BEGIN
  UPDATE public.districts
     SET teszt = true
   WHERE btrim(name) = 'Teszt Egyházkerület'
     AND teszt IS DISTINCT FROM true;
  GET DIAGNOSTICS v_db = ROW_COUNT;

  IF v_db > 0 THEN
    RAISE NOTICE '✅ % teszt-kerület megjelölve (teszt = true).', v_db;
  ELSE
    RAISE NOTICE 'ℹ️ Nem volt megjelölendő sor (nincs „Teszt Egyházkerület" nevű kerület, vagy már meg van jelölve).';
  END IF;
END
$teszt_jeloles$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/F) ÍRÁS-POLICY + GRANT — a kerületi admin mentse a SAJÁT kerületét
-- ────────────────────────────────────────────────────────────────────────────
-- Ma egyetlen írás-policy sincs a districts-en: az RLS mellett a kerületi admin
-- mentése NÉMÁN 0 sort érint. A javítás a dioceses_update_diocese_scope
-- (2026-08-11-globalis-hozzaferes-szukites.sql:1268-1273) kerületi párja —
-- ⚠️ NEM betűhűen: a megyei párost KETTEN viszik (a _diocese_scope MELLETT a
--    dioceses_update_by_esperes hozza a rendszergazda-ágat), a districts-en
--    viszont EZ AZ EGYETLEN írás-policy, tehát ide MINDKÉT ág kell. Lásd a
--    részletes indoklást közvetlenül a CREATE POLICY előtt.

-- Az RLS-nek bekapcsolva kell lennie, különben a policy díszlet. A meglévő
-- USING(true) SELECT policy-k miatt a bekapcsolás az olvasást nem érinti.
-- ⚠️ FELTÉTEL NÉLKÜL adjuk ki: a Postgres az ENABLE-t idempotensnek veszi (ha
--    már be van kapcsolva, nem történik semmi), ezért nem kell DO-blokkba
--    csomagolni. A 0/D-30 sor teendő-szövege ezt MOSTANTÓL így is írja le —
--    korábban „ŐRZÖTTEN bekapcsolja" állt ott, és a fájl két helyen mást
--    állított (2026-08-16-i javítás).
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

-- ⚠️ GRANT ELŐSZÖR: a policy a HÍVÓ szerepében fut. GRANT nélkül a policy nem
--    tagad, hanem 403-mal HIBÁZIK — a projekt bizonyított hibaosztálya.
--    (Az anon SZÁNDÉKOSAN nem kap semmit: az ő oszlop-szintű joga az S1-ből él.)
GRANT SELECT, UPDATE ON public.districts TO authenticated;
GRANT SELECT ON public.districts TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids() TO authenticated;
-- ⚠️ A policy MÁSIK lába is függvényhívás. GRANT nélkül a rendszergazda-ág nem
--    tagadna, hanem 403-mal HIBÁZNA — ugyanaz a hibaosztály. Idempotens
--    ismétlés: a megyei fájlok (uj-tablak, scope-oszlopok, iktato-leltar-s4)
--    is kiadják.
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access() TO authenticated;

-- ⚠️⚠️ A POLICY-NAK KÉT ÁGA VAN, ÉS EGYIK SEM ELHAGYHATÓ.
-- TÜNET, ami ide vezetett (2026-08-16): rendszergazda-ág nélkül a
-- `current_user_district_ids()` — ami KIZÁRÓLAG `egyhazkeruleti_admin`
-- szerepkör-sorokat gyűjt — a GLOBÁLIS adminnak (profiles.role='admin') ÜRES
-- tömböt ad. Mivel a districts-en EZ AZ EGYETLEN írás-policy (nincs mire
-- visszaesni, szemben a dioceses-szel, ahol a dioceses_update_by_esperes viszi
-- a globális ágat), ebből az következne, hogy
--   (a) a rendszergazda NEM tudja kitölteni a most születő CIF/IBAN/püspök
--       mezőket, és
--   (b) minden olyan kerület, amihez még nincs egyhazkeruleti_admin kiosztva,
--       SZERKESZTHETETLEN marad
-- — és mindkettő HIBAÜZENET NÉLKÜL: RLS mellett a nem illeszkedő UPDATE NÉMÁN
-- 0 sort érint, a felület pedig „elmentve"-t ír.
-- ⛔ EGY KÉSŐBBI „EGYSZERŰSÍTÉS" NE VEGYE KI a global_access ágat. A 2. szakasz
--    2/E-207 sora külön ellenőrzi, hogy MINDKÉT ág megvan (USING ÉS WITH CHECK).
-- Az alak a megyei pénzügyi policy-k kanonikus mintája (2026-08-15-egyhazmegyei-
-- uj-tablak.sql:277-285, diocese_felterjesztes_all).
DROP POLICY IF EXISTS districts_update_district_scope ON public.districts;
CREATE POLICY districts_update_district_scope
  ON public.districts
  FOR UPDATE TO authenticated
  USING      (public.current_user_has_global_access()
              OR districts.id = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])))
  WITH CHECK (public.current_user_has_global_access()
              OR districts.id = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])));

COMMENT ON POLICY districts_update_district_scope ON public.districts IS
  '2026-08-16 (S2): a kerület törzsadatát a RENDSZERGAZDA (current_user_has_global_access — a 2026-08-11-i szűkítés óta CSAK admin) és a SAJÁT kerülete egyházkerületi adminja szerkesztheti. ⚠️ A rendszergazda-ág NEM elhagyható: a current_user_district_ids() kizárólag egyhazkeruleti_admin sorokat gyűjt, tehát a globális adminnak ÜRES tömböt ad — nélküle a rendszergazda NÉMÁN 0 sort írna (nem hibázna!), és minden kerületi admin nélküli kerület szerkeszthetetlen maradna. A COALESCE(…, ''{}''::uuid[]) FAIL-CLOSED: hatókör nélkül üres tömb → egyetlen sor sem illeszkedik. INSERT/DELETE policy SZÁNDÉKOSAN NINCS: új egyházkerület létrehozása és törlése rendszergazdai feladat. A dioceses_update_diocese_scope + dioceses_update_by_esperes PÁROS kerületi megfelelője, egyetlen policy-ba vonva.';

-- ⚠️ INSERT / DELETE policy IDE NEM KERÜL. Ha egy későbbi kör mégis kérné,
--    az KÜLÖN, látható döntés legyen — nem egy „amíg itt vagyunk" sor.


-- ────────────────────────────────────────────────────────────────────────────
-- 1/G) STORAGE — districts-logos bucket + 4 policy
-- ────────────────────────────────────────────────────────────────────────────
-- Fájlnév-séma: {district_id}/{cimer|pecset|alairas}-{timestamp}-{név}
-- A 2026-04-18-dioceses-cimer-setup.sql mintája, EGYETLEN szándékos eltéréssel:
-- az írás-ág NEM a `profiles.role IN ('admin','egyhazkeruleti_admin')` skalárra
-- épül (az BÁRMELY kerületi adminnak megnyitná BÁRMELY MÁSIK kerület mappáját),
-- hanem a hívó tényleges kerületi hatókörére. Lásd a fájl fejlécének (5) pontját.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'districts-logos',
  'districts-logos',
  true,      -- publikusan olvasható, mint a gyülekezeti és a megyei címerek
  2097152,   -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Olvasás — publikus (a bucket public=true miatt amúgy is), de explicit policy.
-- ⚠️ A CÍMERNÉL a nyilvánosság SZÁNDÉKOS: a nyomtatványon és a nyilvános
--    felületeken is megjelenik.
-- ⚠️⚠️ A PECSÉTNÉL ÉS AZ ALÁÍRÁSNÁL NEM AZ: ez a policy (anon + public bucket)
--    miatt a püspöki pecsét és az aláírás-kép az URL birtokában BEJELENTKEZÉS
--    NÉLKÜL letölthető — okirat-hamisítási felület. NYITOTT DÖNTÉS, mind a
--    három szintre kiterjed: lásd a fájl elején az „ENDRE DÖNTÉSÉRE VÁR"
--    blokkot; az aktuális állapotot a 2. szakasz 2/G-403 sora kiírja.
--    ⛔ Ezt a fájl SZÁNDÉKOSAN nem javítja egyoldalúan: egy szinten elvégzett
--       átállítás a másik kettőt nyitva hagyná, a régi publikus URL-eket kérő
--       nyomtatványokról pedig NÉMÁN eltűnnének a képek.
DROP POLICY IF EXISTS "districts_logos_read_all" ON storage.objects;
CREATE POLICY "districts_logos_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'districts-logos');

-- Beszúrás — rendszergazda VAGY a mappával azonos kerület adminja
DROP POLICY IF EXISTS "districts_logos_kerulet_write" ON storage.objects;
CREATE POLICY "districts_logos_kerulet_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'districts-logos'
    AND (
      -- (1) Rendszergazda — KIZÁRÓLAG 'admin'. Az egyhazkeruleti_admin
      --     SZÁNDÉKOSAN nem globális: a saját kerületét a (3) ág engedi.
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'admin'
      )
      -- (2) Rendszer-hatókörű admin szerepkör-sor
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope = 'system' AND pr.role = 'admin'
      )
      -- (3) A mappanév a hívó KERÜLETI hatókörében van (fail-closed COALESCE)
      OR (storage.foldername(name))[1] IN (
           SELECT id::text
           FROM unnest(COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])) AS id
         )
    )
    -- A mappanév LÉTEZŐ kerület azonosítója kell legyen (elgépelt/„árva"
    -- mappába senki ne tölthessen)
    AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id::text = (storage.foldername(name))[1])
  );

-- Frissítés (UPSERT — a varázsló felülírja a korábbi képet) — ua. a feltétel
DROP POLICY IF EXISTS "districts_logos_kerulet_update" ON storage.objects;
CREATE POLICY "districts_logos_kerulet_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'districts-logos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope = 'system' AND pr.role = 'admin'
      )
      OR (storage.foldername(name))[1] IN (
           SELECT id::text
           FROM unnest(COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])) AS id
         )
    )
    AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id::text = (storage.foldername(name))[1])
  );

-- Törlés — ua. a feltétel
DROP POLICY IF EXISTS "districts_logos_kerulet_delete" ON storage.objects;
CREATE POLICY "districts_logos_kerulet_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'districts-logos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope = 'system' AND pr.role = 'admin'
      )
      OR (storage.foldername(name))[1] IN (
           SELECT id::text
           FROM unnest(COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])) AS id
         )
    )
    AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id::text = (storage.foldername(name))[1])
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 1/H) ⛔ ZÁRÓ ŐRSZEM — a fájl KÉPTELEN szivárgó állapotot hagyni
-- ────────────────────────────────────────────────────────────────────────────
-- Az oszlopok MÁR LÉTREJÖTTEK, de a COMMIT MÉG NEM TÖRTÉNT MEG. Itt bizonyítjuk
-- be, hogy egyetlen új oszlop sem olvasható anonimként. Ha bármelyik mégis az,
-- a RAISE EXCEPTION az EGÉSZ tranzakciót visszagördíti — az oszlopokkal együtt.
-- Így nincs olyan pillanat, amikor a kerület CIF-je vagy IBAN-ja kikerülhetne.
--
-- ⚠️ has_column_privilege() MINDEN öröklési utat feloldva válaszol (PUBLIC
--    ál-szerepen át örökölt jogot is) — a GRANT-katalógus nem tenné.
DO $anon_zaro$
DECLARE
  v_szivargo text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RETURN;  -- nincs anon szerep: nincs mit ellenőrizni
  END IF;

  -- ⚠️ Az alias KÜLÖN nevet kap az oszloptól (t(oszlop)) — lásd az 1/0 őrszem
  --    ugyanilyen indoklását.
  SELECT string_agg(t.oszlop, ', ' ORDER BY t.oszlop) INTO v_szivargo
  FROM unnest(ARRAY[
        'nev_ro','nev_en','cif','adoszam','cnp_letter',
        'cim_orszag','cim_megye','cim_telepules','cim_iranyitoszam','cim_utca',
        'adrlocality_id','adrstreet_id','email','telefon','weboldal',
        'bank_nev','bank_fo_iban','bank_fo_iban_valuta',
        'puspok_nev','puspok_cim','adminisztrator_nev','szamvevo_nev',
        'cimer_url','pecset_url','alairas_url',
        'megjegyzes','teszt','updated_at','updated_by']) AS t(oszlop)
  WHERE has_column_privilege('anon', 'public.districts'::regclass, t.oszlop, 'SELECT');

  IF v_szivargo IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL-CLOSED (VISSZAGÖRDÍTVE): az anon szerep OLVASHATNÁ a districts új oszlopait: %. Ez a fájl egyetlen GRANT-ot sem adott az anonnak → a jog máshonnan (PUBLIC ál-szerep vagy tábla-szintű GRANT) öröklődik. Rendezd az S1/S1b futtatásával, majd futtasd újra ezt a fájlt.', v_szivargo;
  END IF;

  -- A MÁSIK IRÁNY: az (id, name) KELL az anonnak, különben a nyilvános
  -- regisztrációs űrlap kerület-legördülője kiürül. Ez nem ennek a fájlnak a
  -- hatásköre (nem nyúlt hozzá), ezért csak HANGOS figyelmeztetés.
  IF NOT has_column_privilege('anon', 'public.districts'::regclass, 'name', 'SELECT') THEN
    RAISE WARNING
      '⚠️ Az anon NEM olvashatja a districts.name oszlopot → a /hozzaferes-kerese kerület-legördülője ÜRES lesz. Ez nem ennek a fájlnak a következménye, de rendezendő: GRANT SELECT (id, name) ON public.districts TO anon;';
  END IF;
END
$anon_zaro$;

COMMIT;

-- PostgREST séma-cache újratöltés — enélkül az app „could not find column in
-- schema cache" hibával hasalna el az új oszlopokon.
NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '2/A · OSZLOPOK' AS szakasz,
       'Megvan mind a 29 új oszlop?' AS mit,
       (SELECT count(*)::text
        FROM (VALUES ('adoszam'),('adminisztrator_nev'),('adrlocality_id'),('adrstreet_id'),
                     ('alairas_url'),('bank_fo_iban'),('bank_fo_iban_valuta'),('bank_nev'),
                     ('cif'),('cim_iranyitoszam'),('cim_megye'),('cim_orszag'),
                     ('cim_telepules'),('cim_utca'),('cimer_url'),('cnp_letter'),
                     ('email'),('megjegyzes'),('nev_en'),('nev_ro'),('pecset_url'),
                     ('puspok_cim'),('puspok_nev'),('szamvevo_nev'),('telefon'),
                     ('teszt'),('updated_at'),('updated_by'),('weboldal')) AS v(oszlop)
        WHERE EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema='public' AND c.table_name='districts'
                        AND c.column_name = v.oszlop)) || ' / 29' AS ertek,
       'Ha nem 29/29: az 1. szakasz nem futott le (vagy visszagördült a záró őrszemen).' AS teendo

UNION ALL
SELECT 2, '2/A · OSZLOPOK',
       'Melyik hiányzik még?',
       COALESCE((SELECT string_agg(v.oszlop, ', ' ORDER BY v.oszlop)
                 FROM (VALUES ('adoszam'),('adminisztrator_nev'),('adrlocality_id'),('adrstreet_id'),
                              ('alairas_url'),('bank_fo_iban'),('bank_fo_iban_valuta'),('bank_nev'),
                              ('cif'),('cim_iranyitoszam'),('cim_megye'),('cim_orszag'),
                              ('cim_telepules'),('cim_utca'),('cimer_url'),('cnp_letter'),
                              ('email'),('megjegyzes'),('nev_en'),('nev_ro'),('pecset_url'),
                              ('puspok_cim'),('puspok_nev'),('szamvevo_nev'),('telefon'),
                              ('teszt'),('updated_at'),('updated_by'),('weboldal')) AS v(oszlop)
                 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                                   WHERE c.table_schema='public' AND c.table_name='districts'
                                     AND c.column_name = v.oszlop)),
                '✅ egy sem'),
       '—'

UNION ALL
SELECT 3, '2/A · ALAPÉRTÉKEK',
       'A DEFAULT-ok a megyei mintát követik?',
       COALESCE((SELECT string_agg(c.column_name || ' = ' || COALESCE(c.column_default, 'nincs'), ' | '
                                   ORDER BY c.column_name)
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='districts'
                   AND c.column_name IN ('cim_orszag','bank_fo_iban_valuta','teszt','updated_at')),
                '⛔ nincs egy sem'),
       'Elvárt: cim_orszag = ''Románia''::text | bank_fo_iban_valuta = ''RON''::text | teszt = false | updated_at = now().'

UNION ALL
SELECT 4, '2/A · nev_ro',
       'A nev_ro NULLABLE maradt? (a kötelezőséget az APP érvényesíti)',
       COALESCE((SELECT CASE WHEN c.is_nullable='YES' THEN '✅ nullable — helyes'
                             ELSE '⛔ NOT NULL — a meglévő sorok mentése elhasalna' END
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='districts'
                   AND c.column_name='nev_ro'),
                '⛔ nincs nev_ro oszlop'),
       'Szándékos: a tábla már tartalmaz kerület-sorokat román név nélkül. A varázsló (zod) addig nem enged tovább, amíg meg nem adják.'

-- ── 2/B · Vezetői oszlopok — a KERÜLETI hármas, NEM a megyei ────────────────
UNION ALL
SELECT 10, '2/B · VEZETŐK',
       'Megvan a kerületi NÉGYES (püspök + tisztség + adminisztrátor + számvevő)?',
       COALESCE((SELECT string_agg(c.column_name, ', ' ORDER BY c.column_name)
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='districts'
                   AND c.column_name IN ('puspok_nev','puspok_cim','adminisztrator_nev','szamvevo_nev')),
                '⛔ egy sincs'),
       'Mind a négynek szerepelnie kell, különben a varázsló mentése elhasal. A puspok_cim TISZTSÉG-szöveg („püspök"), NEM postai cím.'

UNION ALL
SELECT 11, '2/B · VEZETŐK — REGRESSZIÓS ŐR ⛔',
       'NEM jött-e létre esperes_* / jegyzo_nev oszlop a districts-en?',
       COALESCE((SELECT '⛔ LÉTREJÖTT: ' || string_agg(c.column_name, ', ' ORDER BY c.column_name)
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='districts'
                   AND c.column_name IN ('esperes_nev','esperes_cim','jegyzo_nev')),
                '✅ nem — helyes'),
       '⛔ Ha ⛔: valaki a MEGYEI oszlopneveket másolta a kerületre. A kerületnek nincs esperese (Endre: „püspök, adminisztrátorok"). Szólj — a két készlet együtt élve a nyomtatvány aláírás-rovatát kettéosztaná.'

-- ── 2/C · Teszt-jelölés ────────────────────────────────────────────────────
-- ⚠️ TÜNET, ami ide vezetett (2026-08-16): ez a két ág ŐRIZETLENÜL hivatkozott
--    a MOST SZÜLETŐ `teszt` oszlopra (`WHERE d.teszt`). Ha valaki előbb jelöli
--    ki a 2. szakaszt (mert az 1. még nem futott, vagy visszagördült), a
--    Postgres az EGÉSZ ellenőrző SELECT-et eldobja egy csupasz
--    `42703: column d.teszt does not exist` hibával — elnyelve mind a ~30 sor
--    segítő üzenetét, köztük azt is, amelyik megmondaná, MIÉRT nincs oszlop.
--    Ezért a hivatkozás PARSE-IDŐBEN ártalmatlan alakot kap: a to_jsonb(d)
--    sor-objektumból olvassuk ki a mezőt, ami a tervező szemében csak egy
--    szövegkulcs — nincs oszlopnév-feloldás, tehát nincs 42703.
--    ⛔ NE „egyszerűsítsd" vissza `d.teszt`-re.
UNION ALL
SELECT 20, '2/C · TESZT-JELÖLÉS',
       'Mely kerületek vannak TESZT-ként megjelölve?',
       COALESCE((SELECT string_agg(d.name, ', ' ORDER BY d.name)
                 FROM public.districts d
                 WHERE COALESCE((to_jsonb(d) ->> 'teszt')::boolean, false)),
                '(egy sem — vagy még nincs teszt oszlop: az 1. szakasz nem futott le)'),
       'Elvárt: pontosan a „Teszt Egyházkerület". Ha ÉLES kerület is szerepel itt, azonnal állítsd vissza: UPDATE public.districts SET teszt = false WHERE name = ''…'';'

UNION ALL
SELECT 21, '2/C · TESZT-JELÖLÉS',
       'A NEM megjelölt (éles) kerületek',
       COALESCE((SELECT string_agg(d.name, ', ' ORDER BY d.name)
                 FROM public.districts d
                 WHERE NOT COALESCE((to_jsonb(d) ->> 'teszt')::boolean, false)),
                '⚠️ egy sem — MINDEN kerület teszt-nek van jelölve!'),
       'Elvárt: az Erdélyi és a Királyhágómelléki Református Egyházkerület. ⚠️ Ha a „Teszt Egyházkerület" IS itt szerepel, akkor vagy nincs még teszt oszlop (a 2/A-1 sor megmondja), vagy a jelölés nem futott le.'

-- ── 2/D · ANON — a döntő próba ─────────────────────────────────────────────
UNION ALL
SELECT 30, '2/D · ANON',
       'Maradt-e TÁBLA-szintű anon jog a districts-en?',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
            THEN '— nincs anon szerep'
            ELSE COALESCE((SELECT string_agg(j.jog, ', ' ORDER BY j.jog)
                           FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) AS j(jog)
                           WHERE has_table_privilege('anon', 'public.districts'::regclass, j.jog)),
                          '✅ egy sem') END,
       'Ha bármit felsorol: MINDEN oszlop olvasható/írható anonimként. Az 1. szakasz őrszemének ezt meg kellett volna akadályoznia — szólj azonnal.'

UNION ALL
SELECT 31, '2/D · ANON',
       'Mely oszlopokra van az anonnak SELECT joga?',
       COALESCE((SELECT string_agg(cp.column_name, ', ' ORDER BY cp.column_name)
                 FROM information_schema.column_privileges cp
                 WHERE cp.table_schema='public' AND cp.table_name='districts'
                   AND cp.grantee='anon' AND cp.privilege_type='SELECT'),
                '(egy sem)'),
       '✅ Az elvárt PONTOSAN: id, name. Ha CIF/IBAN/pecsét is szerepel: a szűkítés nem sikerült.'

-- ⚠️ EZ A DÖNTŐ ELLENŐRZÉS. A fenti sorok a GRANT-KATALÓGUST nézik, ami NEM
--    mutatja a PUBLIC ál-szerepen át ÖRÖKÖLT jogot. A has_column_privilege()
--    MINDEN öröklési utat feloldva válaszol — ez az igazság.
UNION ALL
SELECT (100 + row_number() OVER (ORDER BY p.kell DESC, p.oszlop))::int,
       '2/D · ANON — DÖNTŐ PRÓBA ⛔',
       'Olvashatja-e MOST az anon: districts.' || p.oszlop || ' ?',
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns c
                          WHERE c.table_schema='public' AND c.table_name='districts'
                            AND c.column_name = p.oszlop)
           THEN '— nincs ilyen oszlop (az 1. szakasz nem futott le)'
         WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
           THEN '— nincs anon szerep'
         WHEN has_column_privilege('anon', 'public.districts'::regclass, p.oszlop, 'SELECT')
           THEN CASE WHEN p.kell THEN '✅ IGEN — és ez így helyes (a regisztrációs űrlap kéri)'
                     ELSE '⛔ IGEN — SZIVÁRGÁS! Valószínűleg a PUBLIC szerepen át öröklődik.' END
         ELSE CASE WHEN p.kell
                   THEN '⛔ NEM — pedig KELL: a /hozzaferes-kerese legördülője kiürül!'
                   ELSE '✅ NEM — zárva' END
       END,
       CASE WHEN p.kell
            THEN 'Ez a két oszlop KELL az anonnak (id, name) — a nyilvános kerület-legördülőhöz.'
            ELSE 'Ennek az oszlopnak bejelentkezés NÉLKÜL SOHA nem szabad olvashatónak lennie.' END
FROM (VALUES
        ('id',          true),
        ('name',        true),
        -- …és az ÉRZÉKENYEK, amiknek zárva KELL lenniük:
        ('cif',         false),
        ('adoszam',     false),
        ('bank_fo_iban', false),
        ('pecset_url',  false),
        ('alairas_url', false),
        ('cim_utca',    false),
        ('email',       false),
        ('telefon',     false),
        ('puspok_nev',  false),
        ('szamvevo_nev', false)
     ) AS p(oszlop, kell)
WHERE to_regclass('public.districts') IS NOT NULL

-- ── 2/E · Írás-policy + GRANT ──────────────────────────────────────────────
UNION ALL
SELECT 200, '2/E · ÍRÁS-POLICY',
       'Létrejött a districts_update_district_scope policy?',
       COALESCE((SELECT '✅ igen [' || pol.cmd || '], szerepek: ' || array_to_string(pol.roles, ',')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND pol.policyname='districts_update_district_scope'),
                '⛔ NEM — a kerületi admin továbbra sem tudja menteni a saját kerületét'),
       'Elvárt: [UPDATE], szerepek: authenticated.'

UNION ALL
SELECT 201, '2/E · ÍRÁS-POLICY',
       'A policy TÉNYLEGES feltétele (a hatókör-függvényre épül?)',
       COALESCE((SELECT COALESCE(pol.qual, '(nincs USING)') FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND pol.policyname='districts_update_district_scope'),
                '— nincs ilyen policy'),
       'Elvárt: id = ANY (COALESCE((SELECT current_user_district_ids()), ''{}''::uuid[])). Ha „true" áll itt: MINDEN kerület szerkeszthető lenne — azonnal szólj.'

UNION ALL
SELECT 202, '2/E · ÍRÁS-POLICY ⛔',
       'NEM jött-e létre INSERT/DELETE policy? (nem szabad)',
       COALESCE((SELECT '⛔ LÉTREJÖTT: ' || string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND pol.cmd IN ('INSERT','DELETE','ALL')),
                '✅ nem — helyes'),
       'Új egyházkerület létrehozása és törlése RENDSZERGAZDAI feladat (Romániában kettő van). Ha ⛔: szólj.'

UNION ALL
SELECT 203, '2/E · RLS',
       'Be van-e kapcsolva az RLS?',
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ igen' ELSE '⛔ NINCS — a policy díszlet, a GRANT dönt' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='districts'),
                '⛔ nincs ilyen tábla'),
       'RLS nélkül minden bejelentkezett bármely kerületet szerkeszthetné (van tábla-szintű UPDATE GRANT-ja).'

UNION ALL
SELECT 204, '2/E · GRANT ⛔',
       'Van-e az authenticated-nek SELECT + UPDATE joga?',
       CASE WHEN has_table_privilege('authenticated','public.districts'::regclass,'SELECT')
             AND has_table_privilege('authenticated','public.districts'::regclass,'UPDATE')
            THEN '✅ mindkettő'
            ELSE '⛔ HIÁNYZIK — a policy nem tagadna, hanem 403-mal HIBÁZNA' END,
       'A GRANT és az RLS KÉT külön kapu; mindkettő kell.'

UNION ALL
SELECT 205, '2/E · GRANT ⛔',
       'Futtathatja-e az authenticated a current_user_district_ids()-t?',
       CASE WHEN to_regprocedure('public.current_user_district_ids()') IS NULL THEN '⛔ nincs függvény'
            WHEN has_function_privilege('authenticated',
                   'public.current_user_district_ids()'::regprocedure,'EXECUTE')
              THEN '✅ igen'
            ELSE '⛔ NINCS — a policy 403-mal ÁLLNA LE (nem tagad: HIBÁZIK)' END,
       'Ez a projekt leggyakoribb néma hibája: RLS-policy auth/hatókör-függvényre épül GRANT nélkül.'

UNION ALL
SELECT 206, '2/E · REGRESSZIÓS ŐR',
       'Megvan-e még a KÉT olvasó policy (authenticated + anon)?',
       COALESCE((SELECT string_agg(pol.policyname, ', ' ORDER BY pol.policyname)
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND pol.cmd = 'SELECT'),
                '⛔ EGY SINCS — a kerület-legördülők MINDENHOL kiürülnek'),
       'Ez a fájl a SELECT policy-khoz nem nyúlt. Elvárt: districts_read, districts_read_anon.'

-- ⚠️ 2026-08-16-i JAVÍTÁS ELLENŐRZŐ SORA. A policy-nak KÉT ága van, és a
--    hiányuk KÜLÖNBÖZŐ tünettel jár:
--      · USING-ból hiányzó rendszergazda-ág → NÉMA 0-soros UPDATE („elmentve",
--        változatlan adat);
--      · WITH CHECK-ből hiányzó rendszergazda-ág → 42501 a mentéskor;
--      · hiányzó kerületi hatókör-ág → vagy senki, vagy MINDENKI ír mindent.
UNION ALL
SELECT 207, '2/E · ÍRÁS-POLICY — RENDSZERGAZDA-ÁG ⛔',
       'A policy MINDKÉT ágat tartalmazza (rendszergazda + saját kerület)?',
       COALESCE((SELECT CASE
                   WHEN COALESCE(pol.qual,'')       NOT LIKE '%current_user_has_global_access%'
                     THEN '⛔ HIÁNYZIK a rendszergazda-ág az USING-ból — a rendszergazda NÉMÁN 0 sort írna'
                   WHEN COALESCE(pol.with_check,'') NOT LIKE '%current_user_has_global_access%'
                     THEN '⛔ HIÁNYZIK a rendszergazda-ág a WITH CHECK-ből — a mentés 42501-gyel elhasalna'
                   WHEN COALESCE(pol.qual,'')       NOT LIKE '%current_user_district_ids%'
                     OR  COALESCE(pol.with_check,'') NOT LIKE '%current_user_district_ids%'
                     THEN '⛔ HIÁNYZIK a kerületi hatókör-ág — a kerületi admin nem ír, VAGY mindenki mindent'
                   ELSE '✅ mindkettő megvan — USING és WITH CHECK ágban is'
                 END
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='districts'
                   AND pol.policyname='districts_update_district_scope'),
                '⛔ nincs ilyen policy'),
       'A current_user_district_ids() KIZÁRÓLAG egyhazkeruleti_admin szerepkör-sorokat gyűjt, tehát a GLOBÁLIS adminnak (profiles.role=''admin'') ÜRES tömböt ad. Rendszergazda-ág nélkül (a) Endre nem tudná kitölteni a CIF/IBAN/püspök mezőket, és (b) minden kerületi admin nélküli kerület szerkeszthetetlen maradna — mindkettő HIBAÜZENET NÉLKÜL. A dioceses-en ez azért nem látszott, mert ott KÉT írás-policy van; itt csak EZ AZ EGY van.'

UNION ALL
SELECT 208, '2/E · GRANT ⛔',
       'Futtathatja-e az authenticated a current_user_has_global_access()-t?',
       CASE WHEN to_regprocedure('public.current_user_has_global_access()') IS NULL THEN '⛔ nincs függvény'
            WHEN has_function_privilege('authenticated',
                   'public.current_user_has_global_access()'::regprocedure,'EXECUTE')
              THEN '✅ igen'
            ELSE '⛔ NINCS — a policy rendszergazda-ága 403-mal ÁLLNA LE (nem tagad: HIBÁZIK)' END,
       'A policy MINDKÉT lába függvényhívás, tehát MINDKETTŐRE kell EXECUTE. „RLS-policy hatókör-függvényre épül GRANT nélkül → 403-leállás" — bizonyított hibaosztály; a 2/E-205 a másik lábat méri.'

-- ── 2/F · Trigger ──────────────────────────────────────────────────────────
UNION ALL
SELECT 300, '2/F · TRIGGER',
       'Létrejött a tg_districts_updated trigger?',
       COALESCE((SELECT '✅ ' || t.tgname FROM pg_trigger t
                 WHERE t.tgrelid = to_regclass('public.districts')
                   AND t.tgname='tg_districts_updated' AND NOT t.tgisinternal),
                '⛔ NEM — az updated_at nem frissülne'),
       'A megyei tg_dioceses_updated párja, ugyanazzal a public.tg_update_timestamp() függvénnyel.'

-- ── 2/G · Storage ──────────────────────────────────────────────────────────
UNION ALL
SELECT 400, '2/G · STORAGE',
       'Létrejött a districts-logos bucket?',
       COALESCE((SELECT '✅ public=' || b.public::text
                        || ', limit=' || COALESCE(b.file_size_limit::text,'—')
                        || ', mime=' || COALESCE(array_to_string(b.allowed_mime_types,'/'),'—')
                 FROM storage.buckets b WHERE b.id='districts-logos'),
                '⛔ NEM — a címer/pecsét/aláírás feltöltése elhasalna'),
       'Elvárt: public=true, limit=2097152 (2 MB), mime=image/jpeg/image/png/image/webp — a dioceses-logos betűhű mása.'

UNION ALL
SELECT 401, '2/G · STORAGE',
       'Megvan mind a 4 storage policy?',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname='storage' AND pol.tablename='objects'
          AND pol.policyname LIKE 'districts_logos_%') || ' / 4: '
       || COALESCE((SELECT string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ' ORDER BY pol.policyname)
                    FROM pg_policies pol
                    WHERE pol.schemaname='storage' AND pol.tablename='objects'
                      AND pol.policyname LIKE 'districts_logos_%'),
                   '(egy sem)'),
       'Elvárt: read_all [SELECT], kerulet_write [INSERT], kerulet_update [UPDATE], kerulet_delete [DELETE].'

UNION ALL
SELECT 402, '2/G · STORAGE — HATÓKÖR ⛔',
       'Az írás-policy a KERÜLETI hatókörre épül (nem a skalár szerepre)?',
       COALESCE((SELECT CASE
                   WHEN pol.with_check LIKE '%current_user_district_ids%' THEN '✅ igen — hatókör-függvényre'
                   ELSE '⛔ NEM — skalár szerep-ág: bármely kerületi admin BÁRMELY másik kerület mappájába tölthet!'
                 END
                 FROM pg_policies pol
                 WHERE pol.schemaname='storage' AND pol.tablename='objects'
                   AND pol.policyname='districts_logos_kerulet_write'),
                '⛔ nincs ilyen policy'),
       'Ez a szándékos eltérés a megyei mintától: ott a profiles.role IN (…,''egyhazkeruleti_admin'') skalár ág áll, ami itt teljes kereszt-kerületi írást engedne.'

-- ⚠️ EZ A SOR SZÁNDÉKOSAN „HANGOS". Nem hiba, hanem NYITOTT DÖNTÉS — de az
--    olyan állapot, ami CSENDBEN megél éveket, ezért minden ellenőrzéskor
--    ki KELL mondani. (2026-08-16-i adverzariális találat.)
UNION ALL
SELECT 403, '2/G · STORAGE — ⚠️ ENDRE DÖNTÉSÉRE VÁR',
       'LETÖLTHETŐ-E MA A PECSÉT ÉS AZ ALÁÍRÁS BEJELENTKEZÉS NÉLKÜL?',
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id='districts-logos')
           THEN '— még nincs districts-logos bucket'
         WHEN COALESCE((SELECT b.public FROM storage.buckets b WHERE b.id='districts-logos'), false)
           THEN '⚠️ IGEN — a bucket PUBLIC: a püspöki PECSÉT és az ALÁÍRÁS az URL birtokában bejelentkezés NÉLKÜL letölthető'
         WHEN EXISTS (SELECT 1 FROM pg_policies pol
                      WHERE pol.schemaname='storage' AND pol.tablename='objects'
                        AND pol.policyname='districts_logos_read_all'
                        AND 'anon' = ANY (pol.roles))
           THEN '⚠️ IGEN — a bucket ugyan nem public, de a read policy ANON-nak is enged'
         ELSE '✅ NEM — zárt (a döntés (B) ága lefutott)'
       END,
       '⚠️ NEM HIBA, hanem NYITOTT DÖNTÉS — lásd a fájl elején az „ENDRE DÖNTÉSÉRE VÁR" blokkot. Egy átlátszó hátterű pecsét-PNG és egy aláírás-PNG együtt kész OKIRAT-HAMISÍTÁSI FELÜLET, a fájlnév pedig kitalálható ({district_id}/pecset-…). KÉT lehetőség: (A) marad egy publikus bucket; (B) a CÍMER marad publikus, a PECSÉT és az ALÁÍRÁS külön PRIVÁT bucketbe költözik, és a felület signed URL-lel kéri le. A kérdés MIND A HÁROM szintre (gyülekezet, egyházmegye, egyházkerület) kiterjed, ezért ez a fájl szándékosan nem változtat rajta — a döntés KÜLÖN kör.'

-- ── 2/H · Mentés-besorolás (tájékoztató) ───────────────────────────────────
UNION ALL
SELECT 500, '2/H · MENTÉS',
       'Be van-e sorolva a districts a napi mentésbe?',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL
            THEN '⚠️ nincs backup_table_policy tábla'
            ELSE COALESCE((SELECT '✅ besorolva (hatokor=' || COALESCE(b.hatokor,'?') || ')'
                           FROM public.backup_table_policy b WHERE b.tabla='districts' LIMIT 1),
                          '⚠️ NINCS besorolva — a napi mentés hangosan áll') END,
       'ÚJ TÁBLA NEM JÖTT LÉTRE, tehát új sor nem kell. De MOSTANTÓL érzékeny adat (CIF, IBAN, vezetők, képek) él ebben a táblában: ha nincs besorolva, az a mentésből is kimarad. Kulcsoszlop: `tabla` (NEM table_name).'

-- ── 2/I · Kézi próba ───────────────────────────────────────────────────────
UNION ALL
SELECT 600, '2/I · KÉZI PRÓBA',
       'MOST TESZTELD LE (2 perc)',
       'INKOGNITÓ ablakban nyisd meg a /hozzaferes-kerese oldalt',
       'Az „Egyházkerület" legördülőnek MEG KELL TELNIE (3 kerület). Ha üres, a 2/D-31 és a 2/E-206 sor mutatja az okot — azonnal szólj.'

ORDER BY sorszam;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE.                                                                    ║
-- ║ AMI MÉG HÁTRA VAN (NEM ebben a fájlban):                                 ║
-- ║  · App-oldal: kerületi beállítás-varázsló (Alapadatok / Cím / Bank /      ║
-- ║    Vezetők / Címer-pecsét-aláírás lapok) — a bank NEM kötelező, a vezetők ║
-- ║    LISTÁBÓL választhatók (a megyei getDioceseVezetoJeloltek kerületi      ║
-- ║    párja), a nev_ro-t a zod teszi kötelezővé.                            ║
-- ║  · A „(teszt)" jelölés megjelenítése a felületen (districts.teszt).       ║
-- ║  · S1c: a kerületi RÁLÁTÁS bezárása (K4 döntés) — külön fájl.             ║
-- ║  · ⚠️ ENDRE DÖNTÉSE: pecsét + aláírás PRIVÁT bucketbe (signed URL) vagy   ║
-- ║    marad publikusan? MIND A HÁROM szintre egyszerre — lásd a fájl elején  ║
-- ║    az „ENDRE DÖNTÉSÉRE VÁR" blokkot és a 2/G-403 ellenőrző sort.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
