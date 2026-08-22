-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI S5c — CSATOLMÁNY-STORAGE + KERÜLETI BANKSZÁMLA 2026-08-17 ║
-- ║ Fájl: migration-docs/sql/2026-08-17-egyhazkeruleti-S5c-storage-bank.sql   ║
-- ║ (Egyházkerület = 3. szint, S5 szelet — a NEGYEDIK hullám: az             ║
-- ║  adverzariális ellenőrzés két „szelet-záró feltétel" találata)           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIÉRT VAN EZ A FÁJL
-- ────────────────────────────────────────────────────────────────────────────
-- Az S5a (scope-oszlopok) és az S5b (kerületi pénzügy-táblák) KÉT hiányt
-- TUDATOSAN kihagyott, mert mindkettő ÉLŐ, gyülekezeti felületet érint. Az
-- ellenőrzés mindkettőt a szelet zárásának feltételeként jelölte meg:
--
--   (A) A KERÜLETI CSATOLMÁNY-FELTÖLTÉS MA 403-MAL BUKNA.
--       Az S5a után a csatolmány-SOR felvehető (iktato_csatolmany.district_id
--       + kompozit FK + RLS), de az 'iktato-csatolmanyok' bucket KERÜLETI
--       prefixű útjaihoz ({district_id}/{iktato_id}/…) NINCS storage-policy.
--       A kerületi iktató „félkészként" viselkedne: az irat iktatható, a
--       melléklet nem tölthető fel. Ez a fájl a MEGYEI 1/C szakasz
--       (2026-08-15-egyhazmegyei-iktato-leltar-s4.sql) BETŰHŰ kerületi tükre.
--
--   (B) KERÜLETI BANKSZÁMLA NEM VEHETŐ FEL.
--       A `bankszamlak_scope_check` ma csak a 'gyulekezet' | 'egyhazmegye'
--       értéket ismeri, a `bankszamlak_scope_fk_check` pedig egy kerületi
--       sorra hamis. Emiatt a kerületi banklista ÜRESEN degradál (a
--       készpénz-only állapot — apps/web/app/(dashboard)/penzugy/actions.ts,
--       `initFinanceFelsoSzint`, a `bankSzamlaScope` melletti figyelmeztetés).
--       Ugyanez áll a `chitanta_tombok` (nyugtatömb) táblára.
--
-- ⚠️ MIT ÉRINT: KÉT ÉLŐ, GYÜLEKEZETI TÁBLÁT (`bankszamlak`, `chitanta_tombok`)
--    és a `storage.objects` policy-készletét. ~500 gyülekezet éles rendszere.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HOGYAN GARANTÁLT, HOGY A GYÜLEKEZETI/MEGYEI VISELKEDÉS BYTE-RA VÁLTOZATLAN
-- ════════════════════════════════════════════════════════════════════════════
-- 1. A CHECK-eket NEM ÍRJUK ÚJRA, hanem az ÉLŐ definíciót SZÖVEGESEN BŐVÍTJÜK:
--       új = ( <a pg_get_constraintdef által visszaadott ÉLŐ kifejezés> OR <új ág> )
--    Így a régi ágak nem gépeltek újra — nem is térhetnek el. A bővítés
--    LOGIKAI BŐVÍTÉS (OR), tehát az új predikátum a régi SZIGORÚ FELSŐHALMAZA:
--    egyetlen ma érvényes sor sem eshet ki. (Ha mégis kiesne, a Postgres az
--    ADD CONSTRAINT validáló pásztázásán MEGBUKNA, és az EGÉSZ tranzakció
--    visszagördülne — néma adatvesztés nem lehetséges.)
-- 2. A DROP + ADD EGYETLEN tranzakcióban fut. A DROP CONSTRAINT
--    ACCESS EXCLUSIVE zárat vesz a táblára, amit a COMMIT-ig tart: NINCS olyan
--    pillanat, amikor bárki más gyengített ellenőrzéssel írhatna.
-- 3. Az idempotencia-őr a DEFINÍCIÓRA néz (tartalmazza-e már az
--    'egyhazkerulet' értéket), NEM a névre — a név ugyanaz marad, tehát a
--    névre néző őr azt hinné, kész van, és a bővítés némán elmaradna.
-- 4. A constraintet a `conkey` (oszlop-halmaz) + `conname` PÁROSSAL célozzuk,
--    SOHA `pg_get_constraintdef(...) LIKE` alapján — az másik constraintet is
--    eltalál (ez már ELSÜLT ÉLESBEN: a custom_label_check is említi a `role`
--    oszlopot, és a LIKE-szűrő eldobta).
-- 5. Egyetlen meglévő policy-hoz, indexhez, RPC-hez sem nyúlunk. Az ÚJ
--    policy-k mind `scope = 'egyhazkerulet'`-tel kezdődnek — ilyen sor ma
--    nulla darab van, tehát a permisszív VAGY-olás nem tud semmit tágítani.
--
-- ════════════════════════════════════════════════════════════════════════════
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok)
-- ════════════════════════════════════════════════════════════════════════════
--   · „A migration-fájl NEM bizonyíték" → 0. SZAKASZ állapotfelmérés + az 1.
--     szakasz fail-closed őrszemmel áll le, ha az élő DB nem a várt.
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403-LEÁLLÁS (nem
--     tagadás!)" → a storage-policy törzse OLVASSA a `public.iktato` és a
--     `public.districts` táblát; ha az `authenticated` szerepnek nincs rájuk
--     SELECT joga, a policy HIBÁZIK. Ezért az őrszem `has_table_privilege`-dzsel
--     méri, és megáll — a függvény-GRANT-ok pedig a policy-létrehozás ELŐTT,
--     ugyanabban a tranzakcióban mennek ki.
--   · „Skalár hatókör + if(id) filter = néma teljes szivárgás" → minden új
--     policy-ág COALESCE(…, '{}'::uuid[])-cel fail-closed.
--   · „pg_get_constraintdef LIKE → MÁS constraintet dobsz el" → lásd fent (4).
--   · „A második felület a régi implementációt őrzi" → a kerületi ág NEM kap
--     saját másolat-táblát; ugyanaz a két tábla kap egy harmadik hatókört.
--
-- ELŐFELTÉTELEK (az 1. szakasz őrszeme fail-closed módon megáll enélkül):
--   · 2026-08-11-globalis-hozzaferes-szukites.sql        → current_user_has_global_access(),
--                                                          current_user_district_ids()
--   · 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql → current_user_district_olvaso_ids()
--   · 2026-08-17-egyhazkeruleti-S5a-scope-oszlopok.sql   → iktato.district_id,
--                                                          iktato_csatolmany.district_id
--   · 2026-04-18-egyhazmegyei-penzugy-fazis8.sql         → bankszamlak.scope + _scope_fk_check
--   · 2026-04-18-egyhazmegyei-modul-fazis6.sql           → chitanta_tombok.scope + _scope_fk_check
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az utolsó utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--   2.  1. SZAKASZ — A MIGRÁCIÓ. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + DEFINÍCIÓRA néző DO-őrök +
-- DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS — újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK' AS szakasz,
       'Létezik-e a 3 kanonikus hatókör-függvény?' AS mit,
       (SELECT count(*)::text || ' / 3' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access',
                            'current_user_district_ids',
                            'current_user_district_olvaso_ids')) AS ertek,
       'Ha nem 3: ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql és a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fusson le. Az 1. szakasz őrszeme enélkül hibával leáll.' AS teendo

UNION ALL
SELECT (1 + row_number() OVER (ORDER BY f.fn))::int, '0/A · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn,
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN 'nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
            THEN '✅ van' ELSE '⛔ NINCS — az új policy 42501/403-mal ÁLLNA LE (nem tagadna: HIBÁZNA)' END,
       'Ha ⛔: az 1. szakasz GRANT-ja pótolja, a policy-létrehozás ELŐTT, ugyanabban a tranzakcióban.'
FROM (VALUES ('current_user_has_global_access'), ('current_user_district_ids'),
             ('current_user_district_olvaso_ids')) AS f(fn)

UNION ALL
SELECT 5, '0/A · ÍRÁS ⇄ OLVASÁS',
       'A current_user_district_ids() (ÍRÁS) NEM tartalmazza a számvevőt?',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '⛔ EMLÍTI a számvevőt — az ÍRÁSI hatókör sérült'
                             ELSE '✅ nem említi (az ellenőr nem ír)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_district_ids' LIMIT 1),
                '— nincs függvény'),
       'Ha ⛔: az 1. szakasz őrszeme MEGÁLL. A kerületi számvevő KIZÁRÓLAG olvasó (current_user_district_olvaso_ids).'

-- ── 0/B · Az S5a lefutott-e? (a storage-policy erre épül) ───────────────────
UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tabla))::int, '0/B · S5a ELŐFELTÉTEL',
       t.tabla || '.district_id oszlop',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                         WHERE c.table_schema = 'public' AND c.table_name = t.tabla
                           AND c.column_name = 'district_id')
            THEN '✅ van' ELSE '⛔ NINCS — az S5a nem futott le' END,
       'Az ÚJ storage-policy a `public.iktato.district_id`-t olvassa (út-integritás: a 2. útszegmens LÉTEZŐ, azonos kerületű, nem törölt iktato-tétel). Enélkül az 1. szakasz őrszeme megáll.'
FROM (VALUES ('iktato'), ('iktato_csatolmany')) AS t(tabla)

UNION ALL
SELECT (20 + row_number() OVER (ORDER BY t.tabla))::int, '0/B · TÁBLA-JOG (a policy törzse olvassa)',
       'authenticated → SELECT a public.' || t.tabla || ' táblán',
       CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN '— nincs tábla'
            WHEN has_table_privilege('authenticated', to_regclass('public.' || t.tabla), 'SELECT')
            THEN '✅ van' ELSE '⛔ NINCS — a storage-policy 42501-gyel HIBÁZNA (nem tagadna)' END,
       'HIBAOSZTÁLY: az RLS-policy a HÍVÓ szerepében fut. Ha a policy törzse olyan táblát olvas, amire a hívónak nincs joga, a policy nem „nemet mond", hanem ELSZÁLL — a felület 403-at kap, és azt hisszük, jogosultsági kérdés.'
FROM (VALUES ('iktato'), ('districts')) AS t(tabla)

-- ── 0/C · STORAGE — bucket + megyei precedens + kerületi lábak ──────────────
UNION ALL
SELECT 30, '0/C · BUCKET',
       'Az iktato-csatolmanyok bucket létezik és PRIVÁT?',
       COALESCE((SELECT CASE WHEN b.public THEN '⚠️ létezik, de PUBLIC' ELSE '✅ létezik, privát' END
                 FROM storage.buckets b WHERE b.id = 'iktato-csatolmanyok'),
                '⛔ NINCS — előbb a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql fusson le'),
       'Az 1. szakasz őrszeme megáll, ha nincs bucket.'

UNION ALL
SELECT 31, '0/C · MEGYEI PRECEDENS (a minta)',
       'Az iktato-csatolmanyok bucket MEGYEI policy-jai (várt: 3)',
       (SELECT count(*)::text || ' / 3' FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname IN ('iktato_csatolmanyok_dio_insert',
                             'iktato_csatolmanyok_dio_select',
                             'iktato_csatolmanyok_dio_delete')),
       'Ez a fájl a MEGYEI ág betűhű tükrét építi. Ha itt nem 3 van, előbb a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql 1/C szakaszát nézd meg — ez a fájl NEM nyúl hozzá.'

UNION ALL
SELECT 32, '0/C · KERÜLETI STORAGE-LÁBAK',
       'Az iktato-csatolmanyok bucket KERÜLETI policy-jai (futás ELŐTT: 0)',
       (SELECT count(*)::text || ' / 3' FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname IN ('iktato_csatolmanyok_dis_insert',
                             'iktato_csatolmanyok_dis_select',
                             'iktato_csatolmanyok_dis_delete')),
       'Az 1/A szakasz hozza létre. Amíg 0: a kerületi csatolmány-FELTÖLTÉS 403-mal bukik, miközben a csatolmány-SOR felvehető — „félkész" iktató.'

UNION ALL
SELECT 33, '0/C · ÁRVA KERÜLETI ÚTVONALAK',
       'Van-e MÁR kerület-azonosítóval kezdődő objektum a bucketben? (max 1000-ig számol)',
       (SELECT count(*)::text FROM (
          SELECT 1 FROM storage.objects o
           WHERE o.bucket_id = 'iktato-csatolmanyok'
             AND EXISTS (SELECT 1 FROM public.districts d
                          WHERE d.id::text = (storage.foldername(o.name))[1])
           LIMIT 1000) z),
       'Ha > 0: azok a fájlok MA láthatatlanok (nincs rájuk illeszkedő policy). A futás után láthatóvá válnak a kerületi olvasóknak — ez a kívánt állapot.'

-- ── 0/D · A KÉT ÉLŐ TÁBLA MAI ALAKJA ───────────────────────────────────────
UNION ALL
SELECT (40 + row_number() OVER (ORDER BY t.tabla))::int, '0/D · OSZLOPOK',
       t.tabla || ' — scope / congregation_id / diocese_id / district_id',
       COALESCE((SELECT string_agg(c.column_name || '(' || c.data_type || ', null=' || c.is_nullable || ')', ' · '
                                   ORDER BY c.column_name)
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public' AND c.table_name = t.tabla
                   AND c.column_name IN ('scope','congregation_id','diocese_id','district_id')),
                '⛔ nincs tábla'),
       'A district_id-t az 1/B (bankszamlak) és az 1/C (chitanta_tombok) szakasz adja hozzá, uuid NULL REFERENCES districts(id) ON DELETE CASCADE — a diocese_id betűhű tükre.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (50 + row_number() OVER (ORDER BY t.tabla))::int, '0/D · SCOPE-CHECK (conkey szerint célozva!)',
       t.tabla || ': az EGYOSZLOPOS CHECK a scope oszlopon',
       COALESCE((SELECT con.conname || ' → ' || pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'c'
                   AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = to_regclass('public.' || t.tabla)
                                              AND a.attname = 'scope' AND NOT a.attisdropped)]::smallint[]
                 LIMIT 1),
                '⛔ nincs egyoszlopos CHECK a scope oszlopon'),
       'A constraintet a `conkey` (oszlop-halmaz) alapján keressük, NEM pg_get_constraintdef LIKE-kal — az másik constraintet is eltalálna (ez már elsült élesben). Az 1. szakasz az ÉLŐ definíciót SZÖVEGESEN bővíti: (<élő kifejezés> OR scope = ''egyhazkerulet'').'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (60 + row_number() OVER (ORDER BY t.tabla))::int, '0/D · SCOPE_FK_CHECK (név + conkey párossal)',
       t.tabla || '_scope_fk_check definíciója',
       COALESCE((SELECT pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'c'
                   AND con.conname = t.tabla || '_scope_fk_check'
                 LIMIT 1),
                '⛔ nincs ilyen nevű CHECK — előbb a 2026-04-18-as megyei fázis-fájlok fussanak le'),
       'Egy kerületi sorra ez MA HAMIS → a kerületi bankszámla/nyugtatömb felvétele elbukna. Az 1. szakasz egy HARMADIK ágat OR-ol hozzá: (scope = ''egyhazkerulet'' AND district_id IS NOT NULL AND congregation_id IS NULL AND diocese_id IS NULL).'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (70 + row_number() OVER (ORDER BY t.tabla))::int, '0/E · INDEXEK',
       t.tabla || ' mai indexei',
       COALESCE((SELECT string_agg(i.indexname, ' · ' ORDER BY i.indexname)
                 FROM pg_indexes i
                 WHERE i.schemaname = 'public' AND i.tablename = t.tabla),
                '— nincs index'),
       'Az 1. szakasz CSAK ÚJ, RÉSZLEGES (WHERE scope = ''egyhazkerulet'') indexeket vesz fel — meglévőt NEM dob el és NEM ír át. Az új részleges indexek üres halmazon épülnek (ma nincs kerületi sor), tehát nem tudnak létező adatot elutasítani.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (80 + row_number() OVER (ORDER BY t.tabla))::int, '0/E · POLICY-K',
       t.tabla || ' mai RLS-policy-jai',
       COALESCE((SELECT string_agg(pol.policyname || '[' || pol.cmd || ']', ' · ' ORDER BY pol.policyname)
                 FROM pg_policies pol
                 WHERE pol.schemaname = 'public' AND pol.tablename = t.tabla),
                '⛔ NINCS EGY POLICY SEM'),
       'Ezekhez EGYETLEN karaktert sem nyúlunk. Az új kerületi lábak KÜLÖN policy-k (…_egyhazkerulet_select / _insert / _update / _delete), és mind a `scope = ''egyhazkerulet''` kapuval kezdődnek.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (90 + row_number() OVER (ORDER BY t.tabla))::int, '0/E · TÁBLA-JOG',
       'authenticated jogai a public.' || t.tabla || ' táblán',
       CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN '— nincs tábla'
            ELSE COALESCE((SELECT string_agg(pr.jog, ',' ORDER BY pr.jog)
                           FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS pr(jog)
                           WHERE has_table_privilege('authenticated', to_regclass('public.' || t.tabla), pr.jog)),
                          '⛔ SEMMI') END,
       'Ha valamelyik hiányzik, a KERÜLETI művelet 42501-gyel bukna — de akkor a GYÜLEKEZETI is bukna már ma, tehát ez inkább jelzés, mint teendő. Ez a fájl NEM ad új tábla-jogot (nem tágít).'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT 101, '0/F · SOROK HATÓKÖR SZERINT',
       'bankszamlak sorai scope szerint (a futás UTÁN pontosan ennyinek kell lennie)',
       COALESCE((SELECT string_agg(x.scope || '=' || x.db::text, ' · ' ORDER BY x.scope)
                 FROM (SELECT b.scope, count(*) AS db FROM public.bankszamlak b GROUP BY b.scope) x),
                '— nincs sor'),
       'REGRESSZIÓ-ALAPVONAL: írd le ezt a számot. A 2. szakasz ugyanezt méri — ha eltér, ÁLLJ MEG. Ez a fájl EGYETLEN sort sem hoz létre, módosít vagy töröl.'

UNION ALL
SELECT 102, '0/F · SOROK HATÓKÖR SZERINT',
       'chitanta_tombok sorai scope szerint (a futás UTÁN pontosan ennyinek kell lennie)',
       COALESCE((SELECT string_agg(x.scope || '=' || x.db::text, ' · ' ORDER BY x.scope)
                 FROM (SELECT ct.scope, count(*) AS db FROM public.chitanta_tombok ct GROUP BY ct.scope) x),
                '— nincs sor'),
       'REGRESSZIÓ-ALAPVONAL: írd le ezt a számot. A 2. szakasz ugyanezt méri — ha eltér, ÁLLJ MEG.'

UNION ALL
SELECT 110, '0/G · KERÜLETEK',
       'Hány sor van a public.districts táblában?',
       COALESCE((SELECT count(*)::text FROM public.districts), '⛔ nincs districts tábla'),
       'Ha 0: a kerületi hatókör-függvények üres tömböt adnak, és minden kerületi láb fail-closed módon üres — ez helyes, csak nincs mit mutatni.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                 FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ. Vagy minden megvan, vagy semmi.                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ───────────────────────────────────────
DO $orszem$
BEGIN
  -- (1) A kanonikus, szerep-szűrt hatókör-függvények
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_district_ids()') IS NULL
     OR to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik valamelyik kanonikus hatókör-függvény (current_user_has_global_access / current_user_district_ids / current_user_district_olvaso_ids). ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql és a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fusson le.';
  END IF;

  -- (2) Az ÍRÁSI hatókör NEM tartalmazhatja az ellenőrt
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'current_user_district_ids'
               AND p.prosrc LIKE '%egyhazkeruleti_szamvevo%') THEN
    RAISE EXCEPTION '⛔ A current_user_district_ids() (ÍRÁSI hatókör) említi az egyhazkeruleti_szamvevo szerepet — az ellenőr írhatná, amit ellenőriz. Előbb az S1 hatókör-biztonság fájlt javítsd.';
  END IF;

  -- (3) A táblák léte
  IF to_regclass('public.districts')        IS NULL THEN RAISE EXCEPTION '⛔ Nincs public.districts tábla — nem ez az adatbázis.'; END IF;
  IF to_regclass('public.bankszamlak')      IS NULL THEN RAISE EXCEPTION '⛔ Nincs public.bankszamlak tábla — nem ez az adatbázis.'; END IF;
  IF to_regclass('public.chitanta_tombok')  IS NULL THEN RAISE EXCEPTION '⛔ Nincs public.chitanta_tombok tábla — nem ez az adatbázis.'; END IF;
  IF to_regclass('public.iktato')           IS NULL THEN RAISE EXCEPTION '⛔ Nincs public.iktato tábla — nem ez az adatbázis.'; END IF;
  IF to_regclass('public.iktato_csatolmany') IS NULL THEN RAISE EXCEPTION '⛔ Nincs public.iktato_csatolmany tábla — előbb a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql fusson le.'; END IF;

  -- (4) Az S5a lefutott? (a storage-policy út-integritási ága erre épül)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
                 WHERE c.table_schema = 'public' AND c.table_name = 'iktato'
                   AND c.column_name = 'district_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'iktato_csatolmany'
                      AND c.column_name = 'district_id') THEN
    RAISE EXCEPTION '⛔ Hiányzik az iktato.district_id vagy az iktato_csatolmany.district_id — ELŐBB a 2026-08-17-egyhazkeruleti-S5a-scope-oszlopok.sql fusson le. (Enélkül a storage-policy hivatkozása értelmezhetetlen, a kerületi csatolmány pedig sehol nem tudna landolni.)';
  END IF;

  -- (5) TÁBLA-JOG — a policy törzse a HÍVÓ szerepében olvas
  IF NOT has_table_privilege('authenticated', 'public.iktato'::regclass, 'SELECT') THEN
    RAISE EXCEPTION '⛔ Az authenticated szerepnek NINCS SELECT joga a public.iktato táblán. Az új storage-policy törzse olvassa — GRANT nélkül a policy nem tagadna, hanem 42501/403-mal HIBÁZNA. Adj GRANT SELECT ON public.iktato TO authenticated jogot, majd futtasd újra.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.districts'::regclass, 'SELECT') THEN
    RAISE EXCEPTION '⛔ Az authenticated szerepnek NINCS SELECT joga a public.districts táblán. Az új storage-policy törzse olvassa — GRANT nélkül 42501/403. Adj GRANT SELECT ON public.districts TO authenticated jogot (az S2 identitás-fájl ezt kiadja), majd futtasd újra.';
  END IF;

  -- (6) A bucket léte
  IF NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'iktato-csatolmanyok') THEN
    RAISE EXCEPTION '⛔ Nincs iktato-csatolmanyok bucket — előbb a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql fusson le.';
  END IF;

  -- (7) A MEGYEI storage-precedens épsége (ezt tükrözzük — ha nincs, állj meg)
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('iktato_csatolmanyok_dio_insert',
                           'iktato_csatolmanyok_dio_select',
                           'iktato_csatolmanyok_dio_delete')) <> 3 THEN
    RAISE EXCEPTION '⛔ A MEGYEI storage-lábak (iktato_csatolmanyok_dio_*) nincsenek meg mind a 3-an. Ez a fájl azok betűhű tükrét építi — ha a minta hiányos, előbb a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql 1/C szakaszát futtasd.';
  END IF;
END
$orszem$;

-- GRANT-tanulság: a policy a HÍVÓ szerepében fut — EXECUTE nélkül 42501/403.
-- (Idempotens ismétlés; a policy-létrehozás ELŐTT, ugyanabban a tranzakcióban.)
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_olvaso_ids() TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) STORAGE — az 'iktato-csatolmanyok' bucket KERÜLETI prefixe
-- ────────────────────────────────────────────────────────────────────────────
-- Kerületi objektum-út: {district_id}/{iktato_id}/{uuid}-{fájlnév} — az út
-- ELSŐ szegmense a scope-azonosító, PONTOSAN mint a gyülekezeti és a megyei
-- ágon. A meglévő policy-k a gyülekezet- és a megye-azonosítóra szűrnek,
-- tehát a kerületi utakat nem fedik — ÚJ, különálló lábak jönnek
-- (a permisszív policy-k VAGY-olódnak).
--
-- ⚠️ ÚT-ELEMZÉS: `(storage.foldername(name))[1]` és `[2]` — SZÓ SZERINT az,
--    amit a megyei 1/C használ. Ha a két szint MÁSHOGY bontaná az utat (pl.
--    split_part), az egyik NÉMÁN sosem illeszkedne, és „miért 403?" kérdéssel
--    töltenénk a következő kört. A `storage.foldername()` a fájlnév NÉLKÜLI
--    útelemeket adja, 1-alapú tömbként.

-- Feltöltés — csak kerületi ÍRÓ (egyhazkeruleti_admin), csak a saját kerület
-- prefixe alá, és CSAK létező, nem törölt, azonos kerületű iktato-tétel
-- 2. szegmense alá (a gyülekezeti 7a / megyei dio_insert út-integritási elve).
DROP POLICY IF EXISTS "iktato_csatolmanyok_dis_insert" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_dis_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      public.current_user_has_global_access()
      OR (storage.foldername(name))[1] IN (
           SELECT id::text FROM unnest(COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])) AS id
         )
    )
    AND EXISTS (
      SELECT 1
      FROM public.iktato i
      WHERE i.id::text = (storage.foldername(name))[2]
        AND i.district_id::text = (storage.foldername(name))[1]
        AND i.deleted = false
    )
  );

-- Olvasás — a kerületi OLVASÓK (írók + egyhazkeruleti_szamvevo).
DROP POLICY IF EXISTS "iktato_csatolmanyok_dis_select" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_dis_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      public.current_user_has_global_access()
      OR (storage.foldername(name))[1] IN (
           SELECT id::text FROM unnest(COALESCE((SELECT public.current_user_district_olvaso_ids()), '{}'::uuid[])) AS id
         )
    )
    -- Csak KERÜLETI prefixű út — a gyülekezeti/megyei utakat a meglévő
    -- policy-k fedik; ez a láb nem nyúl át hozzájuk.
    AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id::text = (storage.foldername(name))[1])
  );

-- Törlés — csak kerületi írók (az árva-takarítás elve miatt itt sincs
-- 2. szegmens-kötés, a gyülekezeti 7c / megyei dio_delete mintája szerint).
DROP POLICY IF EXISTS "iktato_csatolmanyok_dis_delete" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_dis_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      public.current_user_has_global_access()
      OR (storage.foldername(name))[1] IN (
           SELECT id::text FROM unnest(COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])) AS id
         )
    )
    AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id::text = (storage.foldername(name))[1])
  );

-- UPDATE-policy SZÁNDÉKOSAN NINCS — a megyei ágon sincs: a csatolmány-objektum
-- nem módosul, csak feltöltődik és törlődik (a felülírás = törlés + új út).


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) A KÉT ÉLŐ TÁBLA: district_id oszlop
-- ────────────────────────────────────────────────────────────────────────────
-- A diocese_id betűhű tükre (ON DELETE CASCADE — a megyei precedens).
ALTER TABLE public.bankszamlak
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id) ON DELETE CASCADE;

ALTER TABLE public.chitanta_tombok
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.bankszamlak.district_id IS
  '2026-08-17 (egyházkerületi szint, S5c): az EGYHÁZKERÜLETI bankszámla gazdája. Csak scope = ''egyhazkerulet'' soron kitöltött (bankszamlak_scope_fk_check). A gyülekezeti (congregation_id) és a megyei (diocese_id) sorokon NULL. App-tükör: apps/web/lib/auth/finance-scope-core.ts → scopeCol = ''district_id''.';

COMMENT ON COLUMN public.chitanta_tombok.district_id IS
  '2026-08-17 (egyházkerületi szint, S5c): az EGYHÁZKERÜLETI nyugtatömb gazdája. Csak scope = ''egyhazkerulet'' soron kitöltött (chitanta_tombok_scope_fk_check). ⚠️ A KERÜLETI nyugtatömb-FELÜLET még nem épült meg (a megyei párja: apps/web/app/(dashboard)/dashboard-egyhazmegye/chitanta-tombok-actions.ts) — ez az oszlop az adatbázis-oldal, hogy a felület ne ütközzön néma CHECK-hibába.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) A KÉT CHECK BŐVÍTÉSE — az ÉLŐ definíció SZÖVEGES kiterjesztésével
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ EZ A FÁJL LEGÉRZÉKENYEBB PONTJA. Amit itt teszünk:
--    · a constraintet `conkey` (oszlop-halmaz) + `conname` párossal célozzuk,
--      SOHA nem `pg_get_constraintdef(...) LIKE`-kal,
--    · az idempotencia-őr a DEFINÍCIÓRA néz (van-e már benne 'egyhazkerulet'),
--      NEM a névre — a név ugyanaz marad, a névre néző őr némán kihagyná,
--    · a régi ágakat NEM gépeljük újra: az élő kifejezést vesszük át, és
--      OR-olunk hozzá EGY új ágat → a predikátum SZIGORÚ FELSŐHALMAZ, tehát
--      egyetlen ma érvényes sor sem eshet ki,
--    · DROP + ADD EGY tranzakcióban, ACCESS EXCLUSIVE zár alatt.

DO $check_bovites$
DECLARE
  r           record;
  v_scope_att smallint;
  v_dio_att   smallint;
  v_db        integer;
  v_oid       oid;
  v_nev       text;
  v_def       text;
  v_expr      text;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)
  LOOP
    SELECT a.attnum INTO v_scope_att FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || r.tabla)
       AND a.attname = 'scope' AND NOT a.attisdropped;
    SELECT a.attnum INTO v_dio_att FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || r.tabla)
       AND a.attname = 'diocese_id' AND NOT a.attisdropped;

    IF v_scope_att IS NULL OR v_dio_att IS NULL THEN
      RAISE EXCEPTION '⛔ %: hiányzik a scope vagy a diocese_id oszlop — előbb a 2026-04-18-as megyei fázis-fájlok fussanak le.', r.tabla;
    END IF;

    -- ══ (a) EGYOSZLOPOS scope-CHECK — conkey = {scope} ══════════════════════
    SELECT count(*) INTO v_db FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public.' || r.tabla)
       AND c.contype = 'c'
       AND c.conkey = ARRAY[v_scope_att]::smallint[];

    IF v_db <> 1 THEN
      RAISE EXCEPTION '⛔ %: % darab egyoszlopos CHECK van a scope oszlopon (várt: pontosan 1). Nem találgatunk — állj meg, és nézd meg a 0. szakasz 5x sorát.', r.tabla, v_db;
    END IF;

    SELECT c.oid, c.conname, pg_get_constraintdef(c.oid)
      INTO v_oid, v_nev, v_def
      FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public.' || r.tabla)
       AND c.contype = 'c'
       AND c.conkey = ARRAY[v_scope_att]::smallint[];

    IF position('egyhazkerulet' in v_def) > 0 THEN
      RAISE NOTICE 'ℹ️ %.% már ismeri az egyhazkerulet értéket — kihagyva (idempotencia).', r.tabla, v_nev;
    ELSE
      -- „CHECK " előtag és az esetleges „ NOT VALID" utótag lecsupaszítása,
      -- hogy tiszta kifejezés maradjon.
      v_expr := btrim(regexp_replace(v_def, '^CHECK\s*', ''));
      v_expr := btrim(regexp_replace(v_expr, '\s+NOT\s+VALID$', ''));

      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tabla, v_nev);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s OR scope = ''egyhazkerulet''::text)',
                     r.tabla, v_nev, v_expr);
      EXECUTE format('COMMENT ON CONSTRAINT %I ON public.%I IS %L', v_nev, r.tabla,
        '2026-08-17 (egyházkerületi szint, S5c): a hatókör-címke megengedett értékei. A ''egyhazkerulet'' ág az ÉLŐ definíció SZÖVEGES kiterjesztésével került be (OR-ág) — a gyülekezeti és a megyei ág byte-ra változatlan. Ha új szint jönne, ugyanígy bővítsd: SOHA ne írd újra a régi ágakat.');
      RAISE NOTICE '✅ %.% bővítve az egyhazkerulet értékkel.', r.tabla, v_nev;
    END IF;

    -- ══ (b) TÖBBOSZLOPOS scope_fk_check — név + conkey párossal ═════════════
    SELECT count(*) INTO v_db FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public.' || r.tabla)
       AND c.contype = 'c'
       AND c.conname = r.tabla || '_scope_fk_check'
       AND c.conkey @> ARRAY[v_scope_att, v_dio_att]::smallint[];

    IF v_db <> 1 THEN
      RAISE EXCEPTION '⛔ %: nincs (vagy nem egyértelmű) a %_scope_fk_check, ami a scope ÉS a diocese_id oszlopra hivatkozik (talált: % db). Előbb a 2026-04-18-egyhazmegyei-penzugy-fazis8.sql / 2026-04-18-egyhazmegyei-modul-fazis6.sql fusson le.', r.tabla, r.tabla, v_db;
    END IF;

    SELECT c.conname, pg_get_constraintdef(c.oid)
      INTO v_nev, v_def
      FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public.' || r.tabla)
       AND c.contype = 'c'
       AND c.conname = r.tabla || '_scope_fk_check'
       AND c.conkey @> ARRAY[v_scope_att, v_dio_att]::smallint[];

    IF position('egyhazkerulet' in v_def) > 0 THEN
      RAISE NOTICE 'ℹ️ %.% már ismeri a kerületi ágat — kihagyva (idempotencia).', r.tabla, v_nev;
    ELSE
      v_expr := btrim(regexp_replace(v_def, '^CHECK\s*', ''));
      v_expr := btrim(regexp_replace(v_expr, '\s+NOT\s+VALID$', ''));

      -- Az ÚJ ág SZIGORÚBB, mint a megyei párja (ott a congregation_id nincs
      -- kizárva). Ez SZÁNDÉKOS: új ág, nincs mit visszamenőleg elrontani, és
      -- így egy kerületi sor SOHA nem tud átcsúszni a gyülekezeti policy-k
      -- congregation_id-alapú szűrőin.
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I', r.tabla, v_nev);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s OR (scope = ''egyhazkerulet''::text AND district_id IS NOT NULL AND congregation_id IS NULL AND diocese_id IS NULL))',
        r.tabla, v_nev, v_expr);
      EXECUTE format('COMMENT ON CONSTRAINT %I ON public.%I IS %L', v_nev, r.tabla,
        '2026-08-17 (egyházkerületi szint, S5c): hatókör ⇄ gazda-oszlop egyezés. A kerületi ág (scope = ''egyhazkerulet'' AND district_id IS NOT NULL AND congregation_id IS NULL AND diocese_id IS NULL) az ÉLŐ definícióhoz OR-olva került be — a gyülekezeti és a megyei ág byte-ra változatlan.');
      RAISE NOTICE '✅ %.% bővítve a kerületi ággal.', r.tabla, v_nev;
    END IF;
  END LOOP;
END
$check_bovites$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) RÉSZLEGES INDEXEK — mind ÚJ, mind ÜRES halmazon épül
-- ────────────────────────────────────────────────────────────────────────────
-- Ma egyetlen scope = 'egyhazkerulet' sor sincs, tehát ezek az indexek üresen
-- jönnek létre: NEM tudnak létező adatot elutasítani, és nem érintik a
-- gyülekezeti/megyei lekérdezési terveket (részleges predikátum).

-- Kereső-index: a kerületi banklista szűrője (scope + district_id) — a megyei
-- idx_bankszamlak_scope_diocese betűhű tükre.
CREATE INDEX IF NOT EXISTS idx_bankszamlak_scope_district
  ON public.bankszamlak (scope, district_id)
  WHERE scope = 'egyhazkerulet';

-- EGYEDISÉGI index: kerületenként LEGFELJEBB EGY alapértelmezett, aktív számla.
-- (A gyülekezeti párja: idx_bankszamlak_default_one_per_congregation. A MEGYEI
--  szinten ez a védelem HIÁNYZIK — a congregation_id NULL-ok az egyedi indexben
--  mind különbözőnek számítanak —, de a megyei viselkedéshez SZÁNDÉKOSAN nem
--  nyúlunk: azt külön, tudatos döntés javíthatja.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bankszamlak_default_one_per_district
  ON public.bankszamlak (district_id)
  WHERE scope = 'egyhazkerulet' AND is_default = true AND aktiv = true;

-- Nyugtatömb: kereső-index a megyei tükör szerint + a lista rendezése.
CREATE INDEX IF NOT EXISTS idx_chitanta_tombok_scope_district
  ON public.chitanta_tombok (scope, district_id)
  WHERE scope = 'egyhazkerulet';

CREATE INDEX IF NOT EXISTS chitanta_tombok_district_aktiv_idx
  ON public.chitanta_tombok (district_id, aktiv, szam_kezdet)
  WHERE scope = 'egyhazkerulet';

-- ⚠️ SZÁNDÉKOSAN NINCS egyediségi index a nyugtatömb szám-tartományára: sem a
--    gyülekezeti, sem a megyei szinten nincs ilyen. Egy „naiv szigorítás" itt
--    létező, legitim adatot utasítana el (a nyugtaszám-index INERT-ügy
--    tanulsága). Ha kell, KÜLÖN kör, adatfelméréssel.


-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) RLS — kerületi lábak a két táblán
-- ────────────────────────────────────────────────────────────────────────────
-- Alak (a kanonikus, szerep-szűrt minta):
--   olvasás: current_user_district_olvaso_ids()  → admin + egyhazkeruleti_szamvevo
--   írás:    current_user_district_ids()         → CSAK egyhazkeruleti_admin
-- A COALESCE(…, '{}') a fail-closed őr: NULL hatókör → ÜRES lista, SOHA teljes
-- lista („skalár hatókör + if(id) filter = néma teljes szivárgás" hibaosztály).
-- A `(SELECT fn())` alak az InitPlan-forma: soronkénti újra-hívás helyett egyszer.
--
-- ⚠️ NÉGY KÜLÖN LÁB, nem egy FOR ALL: az ellenőr (számvevő) SELECT-en át jön be,
--    de az INSERT/UPDATE/DELETE ágakat SOHA nem érinti. Egy FOR ALL láb az
--    olvasó feloldóval írás-jogot is adna neki.

DO $keruleti_lab$
DECLARE
  r     record;
  v_iro text;
  v_olv text;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)
  LOOP
    -- SZÁNDÉKOSAN ismételt %I + ismételt argumentum (nem pozicionális %1$I):
    -- ez a fájl kézzel fut, egyszeri lehetőséggel — a legunalmasabb forma a
    -- legbiztonságosabb.
    v_iro := format(
      '%I.scope = ''egyhazkerulet''
       AND %I.district_id IS NOT NULL
       AND %I.congregation_id IS NULL
       AND (public.current_user_has_global_access()
            OR %I.district_id = ANY (COALESCE((SELECT public.current_user_district_ids()), ''{}''::uuid[])))',
      r.tabla, r.tabla, r.tabla, r.tabla);

    v_olv := format(
      '%I.scope = ''egyhazkerulet''
       AND %I.district_id IS NOT NULL
       AND %I.congregation_id IS NULL
       AND (public.current_user_has_global_access()
            OR %I.district_id = ANY (COALESCE((SELECT public.current_user_district_olvaso_ids()), ''{}''::uuid[])))',
      r.tabla, r.tabla, r.tabla, r.tabla);

    -- SELECT — az olvasói hatókör
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_egyhazkerulet_select', r.tabla);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
                   r.tabla || '_egyhazkerulet_select', r.tabla, v_olv);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
                   r.tabla || '_egyhazkerulet_select', r.tabla,
      '2026-08-17 (egyházkerületi szint, S5c): a KERÜLETI sorok OLVASÁSA az olvasói hatókörnek (egyhazkeruleti_admin + egyhazkeruleti_szamvevo). A `scope = ''egyhazkerulet''` kapu miatt a gyülekezeti és a megyei sorokra ez a láb SOHA nem illeszkedik — a meglévő policy-k viselkedése változatlan.');

    -- INSERT — csak az írói hatókör
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_egyhazkerulet_insert', r.tabla);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
                   r.tabla || '_egyhazkerulet_insert', r.tabla, v_iro);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
                   r.tabla || '_egyhazkerulet_insert', r.tabla,
      '2026-08-17 (egyházkerületi szint, S5c): KERÜLETI sor FELVÉTELE — kizárólag a szerep-szűrt írói hatókör (current_user_district_ids: egyhazkeruleti_admin). A számvevő SOHA nem ír.');

    -- UPDATE — csak az írói hatókör, mindkét oldalon
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_egyhazkerulet_update', r.tabla);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                   r.tabla || '_egyhazkerulet_update', r.tabla, v_iro, v_iro);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
                   r.tabla || '_egyhazkerulet_update', r.tabla,
      '2026-08-17 (egyházkerületi szint, S5c): KERÜLETI sor MÓDOSÍTÁSA. A WITH CHECK ugyanaz, mint a USING — így egy sor nem „vándorolhat át" más kerülethez vagy más hatókörbe.');

    -- DELETE — csak az írói hatókör
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_egyhazkerulet_delete', r.tabla);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
                   r.tabla || '_egyhazkerulet_delete', r.tabla, v_iro);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
                   r.tabla || '_egyhazkerulet_delete', r.tabla,
      '2026-08-17 (egyházkerületi szint, S5c): KERÜLETI sor TÖRLÉSE. A megyei ág mai állapotának tükre (a chitanta_tombok megyei DELETE-lábát a 2026-08-09-megye-kerulet-rls-fix.sql 6d pontja adta hozzá, mert DELETE-policy nélkül az RLS némán 0 sort érintett volna — „hamis siker").');

    RAISE NOTICE '✅ % — kerületi lábak (select/insert/update/delete).', r.tabla;
  END LOOP;
END
$keruleti_lab$;


-- ────────────────────────────────────────────────────────────────────────────
-- FAIL-CLOSED UTÓ-ELLENŐRZÉS — MÉG A COMMIT ELŐTT
-- ────────────────────────────────────────────────────────────────────────────
-- Ha bármi némán elmaradt volna, itt visszagördül az EGÉSZ tranzakció. Így
-- SOHA nem áll elő az a félkész állapot, amiben a felület „majdnem működik".
DO $utoellenorzes$
DECLARE
  v_db  integer;
  v_hiba text := '';
BEGIN
  -- (1) A három KERÜLETI storage-láb
  SELECT count(*) INTO v_db FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('iktato_csatolmanyok_dis_insert',
                        'iktato_csatolmanyok_dis_select',
                        'iktato_csatolmanyok_dis_delete');
  IF v_db <> 3 THEN
    v_hiba := v_hiba || format(' · kerületi storage-lábak: %s / 3', v_db);
  END IF;

  -- (2) A három MEGYEI storage-láb ÉRINTETLEN
  SELECT count(*) INTO v_db FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('iktato_csatolmanyok_dio_insert',
                        'iktato_csatolmanyok_dio_select',
                        'iktato_csatolmanyok_dio_delete');
  IF v_db <> 3 THEN
    v_hiba := v_hiba || format(' · MEGYEI storage-lábak MEGSÉRÜLTEK: %s / 3', v_db);
  END IF;

  -- (3) A nyolc kerületi tábla-policy
  SELECT count(*) INTO v_db FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('bankszamlak', 'chitanta_tombok')
     AND policyname LIKE '%\_egyhazkerulet\_%';
  IF v_db <> 8 THEN
    v_hiba := v_hiba || format(' · kerületi tábla-policy-k: %s / 8', v_db);
  END IF;

  -- (4) MIND A NÉGY CHECK ismeri az egyhazkerulet értéket
  SELECT count(*) INTO v_db FROM pg_constraint c
   WHERE c.conrelid IN (to_regclass('public.bankszamlak')::oid, to_regclass('public.chitanta_tombok')::oid)
     AND c.contype = 'c'
     AND position('egyhazkerulet' in pg_get_constraintdef(c.oid)) > 0;
  IF v_db <> 4 THEN
    v_hiba := v_hiba || format(' · kerületi ágat ismerő CHECK-ek: %s / 4', v_db);
  END IF;

  -- (5) A district_id oszlop mindkét táblán
  SELECT count(*) INTO v_db FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name IN ('bankszamlak', 'chitanta_tombok')
     AND c.column_name = 'district_id';
  IF v_db <> 2 THEN
    v_hiba := v_hiba || format(' · district_id oszlopok: %s / 2', v_db);
  END IF;

  -- (6) A GYÜLEKEZETI + MEGYEI policy-k a helyükön (ez a fájl nem nyúlt hozzájuk)
  SELECT count(*) INTO v_db FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN ('bankszamlak_access', 'bankszamlak_egyhazmegye_access');
  IF v_db <> 2 THEN
    v_hiba := v_hiba || format(' · gyülekezeti/megyei bankszamlak-policy-k: %s / 2', v_db);
  END IF;

  IF v_hiba <> '' THEN
    RAISE EXCEPTION '⛔ AZ S5c NEM TELJES — visszagördítés.%  A félkész állapot rosszabb a semminél: a felület „majdnem működne", és a hiba a következő körben derülne ki.', v_hiba;
  END IF;

  RAISE NOTICE '✅ S5c teljes: 3 kerületi storage-láb, 8 tábla-policy, 4 bővített CHECK, 2 új oszlop — a megyei/gyülekezeti lábak érintetlenek.';
END
$utoellenorzes$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '2/A · STORAGE — KERÜLETI LÁBAK' AS szakasz,
       'Az iktato-csatolmanyok bucket kerületi policy-jai (várt: 3)' AS mit,
       (SELECT count(*)::text || ' / 3' FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname IN ('iktato_csatolmanyok_dis_insert',
                             'iktato_csatolmanyok_dis_select',
                             'iktato_csatolmanyok_dis_delete')) AS ertek,
       'Ha 3: a kerületi csatolmány-feltöltés útja nyitva. Ha nem: az 1. szakasz utó-ellenőrzése visszagördült volna — akkor a tranzakció el sem jutott a COMMIT-ig.' AS teendo

UNION ALL
SELECT 2, '2/A · STORAGE — ÚT-ELEMZÉS EGYEZÉSE',
       'A kerületi és a megyei láb UGYANAZZAL a módszerrel bontja az utat?',
       CASE WHEN (SELECT count(*) FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname IN ('iktato_csatolmanyok_dis_insert','iktato_csatolmanyok_dis_select','iktato_csatolmanyok_dis_delete')
                    AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%foldername%') = 3
             AND (SELECT count(*) FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname IN ('iktato_csatolmanyok_dio_insert','iktato_csatolmanyok_dio_select','iktato_csatolmanyok_dio_delete')
                    AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%foldername%') = 3
            THEN '✅ mindkét szint storage.foldername()-et használ'
            ELSE '⛔ ELTÉRÉS — az egyik szint NÉMÁN sosem illeszkedne' END,
       'Ez a „két szint máshogy elemzi az utat → az egyik némán sosem illeszkedik" csapda őre. Ha ⛔: NE tesztelj feltöltést, előbb hasonlítsd össze a két policy törzsét.'

UNION ALL
SELECT 3, '2/A · STORAGE — MEGYEI REGRESSZIÓ-ŐR',
       'A MEGYEI lábak érintetlenek? (várt: 3)',
       (SELECT count(*)::text || ' / 3' FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname IN ('iktato_csatolmanyok_dio_insert',
                             'iktato_csatolmanyok_dio_select',
                             'iktato_csatolmanyok_dio_delete')),
       'Ez a fájl EGYETLEN megyei objektumhoz sem nyúlt. Ha itt nem 3 van, az NEM ennek a fájlnak a műve — de akkor is állj meg és jelezd.'

UNION ALL
SELECT 4, '2/A · STORAGE — GYÜLEKEZETI REGRESSZIÓ-ŐR',
       'Hány policy van összesen a storage.objects táblán az iktato-csatolmanyok bucketre?',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%iktato-csatolmanyok%'),
       'Tájékoztató szám: gyülekezeti (F6 + F8d QR) + megyei 3 + kerületi 3. Ha ez a szám a futás előttihez képest PONTOSAN 3-mal nőtt, minden rendben.'

UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tabla))::int, '2/B · OSZLOP',
       t.tabla || '.district_id — létezik, és a districts-re mutat?',
       COALESCE((SELECT 'oszlop ✅ · FK → ' || pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'f'
                   AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = to_regclass('public.' || t.tabla)
                                              AND a.attname = 'district_id' AND NOT a.attisdropped)]::smallint[]
                 LIMIT 1),
                '⛔ nincs district_id FK'),
       'Várt: FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE — a diocese_id betűhű tükre.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (20 + row_number() OVER (ORDER BY t.tabla))::int, '2/C · SCOPE-CHECK (bővítve)',
       t.tabla || ': az egyoszlopos scope-CHECK új definíciója',
       COALESCE((SELECT pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'c'
                   AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = to_regclass('public.' || t.tabla)
                                              AND a.attname = 'scope' AND NOT a.attisdropped)]::smallint[]
                 LIMIT 1),
                '⛔ eltűnt a CHECK'),
       'Várt: a RÉGI kifejezés VÁLTOZATLANUL, majd „OR scope = ''egyhazkerulet''::text". Ha a régi rész máshogy néz ki, mint a 0. szakaszban: ÁLLJ MEG.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (30 + row_number() OVER (ORDER BY t.tabla))::int, '2/C · SCOPE_FK_CHECK (bővítve)',
       t.tabla || '_scope_fk_check új definíciója',
       COALESCE((SELECT pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.contype = 'c'
                   AND con.conname = t.tabla || '_scope_fk_check'
                 LIMIT 1),
                '⛔ eltűnt a CHECK'),
       'Várt: a RÉGI két ág VÁLTOZATLANUL, majd „OR (scope = ''egyhazkerulet'' AND district_id IS NOT NULL AND congregation_id IS NULL AND diocese_id IS NULL)".'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (40 + row_number() OVER (ORDER BY t.tabla))::int, '2/D · KERÜLETI INDEXEK',
       t.tabla || ' új, részleges indexei',
       COALESCE((SELECT string_agg(i.indexname, ' · ' ORDER BY i.indexname)
                 FROM pg_indexes i
                 WHERE i.schemaname = 'public' AND i.tablename = t.tabla
                   AND i.indexdef LIKE '%egyhazkerulet%'),
                '⛔ nincs kerületi index'),
       'Várt bankszamlak: idx_bankszamlak_scope_district + idx_bankszamlak_default_one_per_district (UNIQUE). Várt chitanta_tombok: idx_chitanta_tombok_scope_district + chitanta_tombok_district_aktiv_idx.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT (50 + row_number() OVER (ORDER BY t.tabla))::int, '2/E · KERÜLETI POLICY-K',
       t.tabla || ' kerületi lábai (várt: 4 — select/insert/update/delete)',
       COALESCE((SELECT count(*)::text || ' / 4 → ' || string_agg(pol.policyname || '[' || pol.cmd || ']', ' · ' ORDER BY pol.policyname)
                 FROM pg_policies pol
                 WHERE pol.schemaname = 'public' AND pol.tablename = t.tabla
                   AND pol.policyname LIKE '%\_egyhazkerulet\_%'),
                '⛔ 0 / 4'),
       'A SELECT-lábnak az OLVASÓ feloldót (current_user_district_olvaso_ids), a másik háromnak az ÍRÓT (current_user_district_ids) kell hívnia — lásd a következő sort.'
FROM (VALUES ('bankszamlak'), ('chitanta_tombok')) AS t(tabla)

UNION ALL
SELECT 60, '2/E · ÍRÁS ⇄ OLVASÁS SZÉTVÁLASZTÁSA',
       'Hív-e BÁRMELYIK írási láb (insert/update/delete) OLVASÓ feloldót? (várt: 0)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename IN ('bankszamlak', 'chitanta_tombok')
          AND pol.policyname LIKE '%\_egyhazkerulet\_%'
          AND pol.cmd <> 'SELECT'
          AND COALESCE(pol.qual, '') || COALESCE(pol.with_check, '') LIKE '%olvaso_ids%'),
       '⛔ Ha nem 0: a kerületi SZÁMVEVŐ írhatná, amit ellenőriz. Azonnal állj meg.'

UNION ALL
SELECT 61, '2/E · FAIL-CLOSED ŐR',
       'Mind a 8 kerületi láb COALESCE-szel fail-closed? (várt: 8)',
       (SELECT count(*)::text || ' / 8' FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename IN ('bankszamlak', 'chitanta_tombok')
          AND pol.policyname LIKE '%\_egyhazkerulet\_%'
          AND COALESCE(pol.qual, '') || COALESCE(pol.with_check, '') LIKE '%COALESCE%'),
       'A COALESCE(…, ''{}'') nélkül egy NULL hatókör nem üres, hanem SZŰRETLEN listát adna („skalár hatókör + if(id) filter = néma teljes szivárgás").'

UNION ALL
SELECT 71, '2/F · REGRESSZIÓ — SOROK HATÓKÖR SZERINT',
       'bankszamlak sorai scope szerint',
       COALESCE((SELECT string_agg(x.scope || '=' || x.db::text, ' · ' ORDER BY x.scope)
                 FROM (SELECT b.scope, count(*) AS db FROM public.bankszamlak b GROUP BY b.scope) x),
                '— nincs sor'),
       '⛔ Hasonlítsd össze a 0. szakasz 101-es sorával. Ennek BYTE-RA ugyanannak kell lennie: ez a fájl egyetlen sort sem hozott létre, módosított vagy törölt.'

UNION ALL
SELECT 72, '2/F · REGRESSZIÓ — SOROK HATÓKÖR SZERINT',
       'chitanta_tombok sorai scope szerint',
       COALESCE((SELECT string_agg(x.scope || '=' || x.db::text, ' · ' ORDER BY x.scope)
                 FROM (SELECT ct.scope, count(*) AS db FROM public.chitanta_tombok ct GROUP BY ct.scope) x),
                '— nincs sor'),
       '⛔ Hasonlítsd össze a 0. szakasz 102-es sorával.'

UNION ALL
SELECT 80, '2/F · REGRESSZIÓ — MEGLÉVŐ POLICY-K',
       'A gyülekezeti + megyei bankszamlak-policy-k a helyükön? (várt: 2)',
       (SELECT count(*)::text || ' / 2 → ' || COALESCE(string_agg(pol.policyname, ' · ' ORDER BY pol.policyname), '—')
        FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.tablename = 'bankszamlak'
          AND pol.policyname IN ('bankszamlak_access', 'bankszamlak_egyhazmegye_access')),
       'Ha nem 2: nem ez a fájl tette (egyetlen DROP sem érintette őket), de akkor is állj meg.'

UNION ALL
SELECT 81, '2/F · REGRESSZIÓ — MEGLÉVŐ POLICY-K',
       'A chitanta_tombok megyei lábai a helyükön? (várt: 4 — select/insert/update/delete)',
       (SELECT count(*)::text || ' / 4' FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.tablename = 'chitanta_tombok'
          AND pol.policyname IN ('chitanta_tombok_diocese_select', 'chitanta_tombok_diocese_insert',
                                 'chitanta_tombok_diocese_update', 'chitanta_tombok_diocese_delete')),
       'A 2026-08-09-megye-kerulet-rls-fix.sql 4e–4g + 6d eredménye. Ez a fájl nem nyúlt hozzájuk.'

-- ── 2/G · AMIT A FELMÉRÉS KIDERÍTETT (nem hiba — átadás a következő körnek) ─
UNION ALL
SELECT 90, '2/G · FELMÉRÉSI EREDMÉNY — chitanta_tombok',
       'Van-e értelme a felső szintű nyugtatömbnek? (a MEGYE használja-e?)',
       COALESCE((SELECT count(*)::text || ' megyei nyugtatömb-sor van ma'
                 FROM public.chitanta_tombok ct WHERE ct.scope = 'egyhazmegye'), '0'),
       'IGEN, van értelme — ezért NEM hagytuk ki. A megyei felület ÉL: apps/web/app/(dashboard)/dashboard-egyhazmegye/chitanta-tombok-actions.ts (7 lekérdezés), és a megyei RLS-lábakat a 2026-08-09-es fix külön pótolta. Ha itt 0 sor látszik, az csak azt jelenti, hogy a megyék még nem vittek fel tömböt — a MODUL akkor is él.'

UNION ALL
SELECT 91, '2/G · NYITOTT — KERÜLETI NYUGTATÖMB-FELÜLET',
       'Van-e már kerületi nyugtatömb-kezelő a webalkalmazásban?',
       'NINCS — az adatbázis-oldal viszont mostantól KÉSZ',
       'Az S6 (nyomtatvány kerületi ág) dolga: a dashboard-kerulet alá kell egy chitanta-tombok-actions.ts a megyei párja mintájára (scope = ''egyhazkerulet'', district_id). Addig a kerületi nyugtatömb-tábla üres marad — ez NEM hiba, csak hiányzó felület.'

UNION ALL
SELECT 92, '2/G · KÖVETKEZŐ LÉPÉS — ALKALMAZÁS-OLDAL',
       'Mit vár most a webalkalmazás a kerületi banklistához?',
       'scope = ''egyhazkerulet'' ÉS district_id = a kerület azonosítója',
       'apps/web/app/(dashboard)/penzugy/actions.ts → initFinanceFelsoSzint: a `bankSzamlaScope` már ''egyhazkerulet''-et küld, a `T.scopeCol` pedig ''district_id''-t (apps/web/lib/auth/finance-scope-core.ts). A NOTIFY pgrst után az új oszlop azonnal látszik a PostgREST-nek — a lista a kerület első bankszámlájának felvételekor telik meg. A district_befizetes/_kiadas.bankszamla_id (S5b) mostantól ki is tölthető.'

UNION ALL
SELECT 93, '2/G · MEGMARADT ELTÉRÉS (tudatos)',
       'A MEGYEI szinten hiányzik az „egy alapértelmezett bankszámla" védelem',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes i
                         WHERE i.schemaname = 'public' AND i.tablename = 'bankszamlak'
                           AND i.indexdef LIKE '%egyhazmegye%' AND i.indexdef LIKE '%UNIQUE%')
            THEN '✅ mégis van megyei egyediségi index'
            ELSE '⚠️ nincs — a megye több alapértelmezett számlát is felvehet' END,
       'A gyülekezeti idx_bankszamlak_default_one_per_congregation NULL congregation_id-re nem véd (az egyedi indexben minden NULL különböző), ezért a MEGYEI sorokra ma nincs védelem. A KERÜLETI ágra megcsináltuk (idx_bankszamlak_default_one_per_district). A megyei pótlás KÜLÖN, tudatos döntés — ez a fájl a „megyei viselkedés byte-ra változatlan" korlát miatt NEM nyúlt hozzá.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE.                                                                    ║
-- ║ AMI EZZEL LEZÁRULT:                                                      ║
-- ║  · (A) A kerületi csatolmány-feltöltés útja nyitva — a kerületi iktató    ║
-- ║        már nem „félkész": az irat iktatható ÉS a melléklet feltölthető.   ║
-- ║  · (B) A kerület felvehet bankszámlát és nyugtatömböt — a banklista       ║
-- ║        nem degradál üresen, a district_befizetes/_kiadas.bankszamla_id    ║
-- ║        (S5b) kitölthető.                                                  ║
-- ║                                                                          ║
-- ║ AMI HÁTRA VAN (NEM ebben a fájlban):                                     ║
-- ║  · A kerületi NYUGTATÖMB-FELÜLET (S6) — az adatbázis-oldal kész.         ║
-- ║  · A kerületi bankszámla-felvétel UI-ja: a beállítás-varázsló kerületi    ║
-- ║    ága (a megyei diocese-setup-wizard bank-lépésének tükre).              ║
-- ║  · MENTÉS (S7): a bankszamlak/chitanta_tombok KERÜLETI sorai a            ║
-- ║    `congregation_id IS NULL` globális predikátumra esnek — ugyanoda,      ║
-- ║    ahova a megyeiek. Ellenőrizd az S7-ben, hogy a két tábla be van-e      ║
-- ║    sorolva a backup_table_policy-ban (ÚJ TÁBLA NEM JÖTT LÉTRE, tehát a    ║
-- ║    „besorolatlan tábla → a napi mentés leáll" csapda itt nem sülhet el).  ║
-- ║  · A megyei „egy alapértelmezett bankszámla" védelem pótlása — külön kör. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
