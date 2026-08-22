-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI SCOPE-OSZLOPOK — leltár + iktató (S5a)         2026-08-17 ║
-- ║ Fájl: migration-docs/sql/2026-08-17-egyhazkeruleti-S5a-scope-oszlopok.sql║
-- ║ (Egyházkerület = 3. szint, S5 szelet — K2 döntés, DB-alap)               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ENDRE K2 DÖNTÉSE: az egyházkerület VEZET saját leltárt és saját iktatót —
-- ugyanúgy, ahogy a megye. A LELTÁR és az IKTATÓ ezért NEM kap district_*
-- másolat-táblákat (az volna a „második felület a régi implementációt őrzi"
-- hibaosztály melegágya), hanem a MEGLÉVŐ 6 tábla kap egy HARMADIK
-- scope-oszlopot. A PÉNZÜGY ettől külön utat jár (district_befizetes /
-- _kiadas / … külön táblák) — az egy MÁSIK fájl dolga.
--
-- A HAT ÉRINTETT TÁBLA:
--   leltar_tetelek, iktato, iktato_sablonok,
--   iktato_yearly_closures, iktato_csatolmany, iktato_sequence_pointers
--
-- MIT CSINÁL (mind EGYETLEN tranzakcióban):
--   1/A) district_id uuid NULL REFERENCES districts(id) — mind a 6 táblán.
--   1/B) A scope-őr CHECK cseréje KÉTOSZLOPOSRÓL HÁROMOSZLOPOSRA:
--        num_nonnulls(congregation_id, diocese_id) = 1
--          → num_nonnulls(congregation_id, diocese_id, district_id) = 1
--   1/C) Részleges indexek + a KERÜLETI EGYEDISÉGI indexek (számsor-védelem).
--   1/D) iktato_id_district_uk UNIQUE (id, district_id) + a HARMADIK kompozit
--        FK az iktato_csatolmany-on.
--   1/E) next_iktato_sequence_dis(uuid, integer) RPC + GRANT.
--   1/F) RLS: a meglévő gyülekezeti/megyei policy-k VÁLTOZATLANUL, melléjük
--        ÚJ kerületi lábak — kizárólag a kanonikus szerep-szűrt függvényekkel.
--   1/G) purge_recycle_bin() ÚJRAÉPÍTÉSE — DROP + CREATE (a visszatérési típus
--        változik!), a törzs BETŰHŰEN a 2026-08-14-kuka-deleted-at.sql HÁROM
--        oszlopos alakja, egyetlen érdemi bővítéssel: a DELETE csak a
--        gyülekezeti sorokra fut (a napi takarítás ma a NEM-gyülekezeti —
--        megyei ÉS kerületi — sorokat is FIZIKAILAG törölné).
--   1/H) Mentés-út: a kerületi sorok is a globalis_predikatum-on mennek.
--
-- ⚠️ ÚJ TÁBLA NEM JÖN LÉTRE → a backup_table_policy BESOROLÁSA NEM VÁLTOZIK
--    (nincs új `tabla` sor, a `hatokor` / `reteg` / `visszaallithato` egyik
--    táblán sem módosul). Ezért a „besorolatlan tábla → a napi mentés MINDEN
--    gyülekezetnél leáll" (2. blokkoló csapda, assertInventoryClassified,
--    apps/web/lib/backup/inventory.ts:163) itt NEM tud elsülni. A meglévő
--    `globalis_predikatum = 't.congregation_id IS NULL'` szűrő a KERÜLETI
--    sorokra IS illeszkedik (congregation_id NULL) — az 1/H csak idempotensen
--    pótolja, ha valamelyik táblán üresen maradt volna, és rávezeti a
--    megjegyzésre, hogy mostantól kerületi sor is lehet a táblában.
--
-- ELŐFELTÉTELEK (az 1. szakasz őrszeme fail-closed módon megáll enélkül):
--   · 2026-08-11-globalis-hozzaferes-szukites.sql  → current_user_has_global_access(),
--                                                    current_user_district_ids()
--   · 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql → current_user_district_olvaso_ids()
--   · 2026-08-15-egyhazmegyei-scope-oszlopok.sql   → a 4 tábla diocese_id-je,
--     2026-08-15-egyhazmegyei-iktato-leltar-s4.sql → a másik 2 tábla diocese_id-je,
--                                                    surrogate PK-k, globalis_predikatum
--
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok):
--   · „A migration-fájl NEM bizonyíték" → 0. SZAKASZ állapotfelmérés + az 1.
--     szakasz fail-closed őrszemmel áll le, ha az élő DB nem a várt.
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → minden hívott
--     függvényre explicit GRANT, a policy-létrehozás ELŐTT, EGY tranzakcióban.
--   · „Skalár hatókör + if(id) filter = néma teljes szivárgás" → minden új
--     policy-ág COALESCE(..., '{}'::uuid[])-cel fail-closed.
--   · „pg_get_constraintdef LIKE → MÁS constraintet dobsz el" → a CHECK-cserét
--     NÉV szerint célozzuk, és a definíciót CSAK az idempotencia eldöntésére
--     olvassuk (nem arra, hogy MELYIK constraintet dobjuk el).
--
-- ⚠️ REGRESSZIÓ-KORLÁT: a GYÜLEKEZETI és a MEGYEI viselkedés BYTE-RA
--    változatlan kell maradjon. Ezért: a meglévő policy-khoz NEM nyúlunk, a
--    meglévő indexeket NEM dobjuk el, a meglévő RPC-ket NEM írjuk át, és a
--    2. szakasz KÜLÖN sorban ellenőrzi, hogy megvannak-e.
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az utolsó utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--   2.  1. SZAKASZ — A MIGRÁCIÓ. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + DEFINÍCIÓRA néző DO-őrök +
-- DROP POLICY IF EXISTS + CREATE OR REPLACE — akárhányszor újrafuttatható.



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
SELECT (2 + row_number() OVER (ORDER BY f.fn))::int, '0/A · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn,
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN 'nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
            THEN '✅ van' ELSE '⛔ NINCS — az új policy 42501/403-mal ÁLLNA LE (nem tagadna: HIBÁZNA)' END,
       'Ha ⛔: az 1. szakasz GRANT-ja pótolja, a policy-létrehozás ELŐTT, ugyanabban a tranzakcióban.'
FROM (VALUES ('current_user_has_global_access'), ('current_user_district_ids'),
             ('current_user_district_olvaso_ids')) AS f(fn)

UNION ALL
SELECT 9, '0/A · ÍRÁS ⇄ OLVASÁS',
       'A current_user_district_ids() (ÍRÁS) NEM tartalmazza a számvevőt?',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '⛔ EMLÍTI a számvevőt — az ÍRÁSI hatókör sérült'
                             ELSE '✅ nem említi (az ellenőr nem ír)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='current_user_district_ids' LIMIT 1),
                '— nincs függvény'),
       'Ha ⛔: az 1. szakasz őrszeme MEGÁLL. A kerületi számvevő KIZÁRÓLAG olvasó (current_user_district_olvaso_ids).'

-- ── 0/A · ⛔ BIZTONSÁGI ŐR (2026-08-18) — a GLOBÁL-függvény törzse ─────────
-- Mind a 12 új kerületi policy-nak (és a next_iktato_sequence_dis kapujának) van
-- `public.current_user_has_global_access()` ága. Ha ezen az adatbázison MÉGIS a
-- RÉGI, tág (fázis-0) törzs élne — az, amelyik az esperest is globálisnak vette —,
-- MINDEN esperes ÍRÁSI jogot kapna a kerületi leltárra és iktatóra, NÉMÁN.
-- A testvér-fájl (S5b) ugyanezt őrzi; ez a sor annak a tükre.
UNION ALL
SELECT 10, '0/A · GLOBÁL-TÖRZS ⛔',
       'A current_user_has_global_access() törzse SZŰKÍTETT? (nem említ esperest)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%esperes%'
                             THEN '⛔ RÉGI (fázis-0) törzs — az esperes MÉG GLOBÁLIS'
                             ELSE '✅ szűkített (2026-08-11) törzs' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='current_user_has_global_access' LIMIT 1),
                '— nincs függvény'),
       '⛔ Ha RÉGI: NE FUTTASD az 1. szakaszt — minden esperes írhatná a kerület leltárát és iktatóját. ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql 2a szakasza fusson le. (Az 1. szakasz őrszeme amúgy is fail-closed megáll.)'

-- ── 0/B · A 6 tábla scope-oszlopai ──────────────────────────────────────────
UNION ALL
SELECT (100 + row_number() OVER (ORDER BY t.tabla))::int, '0/B · OSZLOPOK',
       t.tabla,
       COALESCE((
         SELECT 'congregation_id nullable=' || c1.is_nullable
                || CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns c2
                                     WHERE c2.table_schema='public' AND c2.table_name=t.tabla
                                       AND c2.column_name='diocese_id')
                        THEN ' · diocese_id ✅' ELSE ' · ⛔ NINCS diocese_id (a megyei kör nem futott le!)' END
                || CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns c3
                                     WHERE c3.table_schema='public' AND c3.table_name=t.tabla
                                       AND c3.column_name='district_id')
                        THEN ' · district_id MÁR VAN' ELSE ' · district_id még nincs' END
         FROM information_schema.columns c1
         WHERE c1.table_schema='public' AND c1.table_name=t.tabla
           AND c1.column_name='congregation_id'
       ), '⛔ NINCS ILYEN TÁBLA / congregation_id oszlop'),
       'Az 1/A szakasz idempotensen pótolja a district_id-t. ⚠️ Ha a congregation_id nullable=NO: az őrszem MEGÁLL — kerületi sor nem szúrható be NOT NULL congregation_id mellett.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures'), ('iktato_csatolmany'),
             ('iktato_sequence_pointers')) AS t(tabla)

-- ── 0/C · ⛔ 1. BLOKKOLÓ CSAPDA — a scope-őr CHECK definíciója ──────────────
UNION ALL
SELECT (120 + row_number() OVER (ORDER BY t.tabla))::int, '0/C · SCOPE-ŐR CHECK ⛔',
       t.tabla || '_pontosan_egy_scope — a MAI definíció',
       COALESCE((SELECT CASE
                          WHEN pg_get_constraintdef(con.oid) LIKE '%district_id%'
                            THEN '✅ MÁR háromoszlopos: ' || pg_get_constraintdef(con.oid)
                          ELSE '⛔ KÉTOSZLOPOS: ' || pg_get_constraintdef(con.oid)
                        END
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.' || t.tabla)
                   AND con.conname  = t.tabla || '_pontosan_egy_scope'
                   AND con.contype  = 'c'),
                '⛔ NINCS ilyen NEVŰ CHECK ezen a táblán — az 1/B őrszeme MEGÁLL'),
       '⛔ Kétoszlopos alaknál a kerületi sorban MINDKÉT oszlop NULL → 0 <> 1 → az első kerületi tétel 23514-gyel elhasal. Az 1/B DROP + ADD-del cseréli, NÉV szerint célozva. ⚠️ Az idempotencia-őr a DEFINÍCIÓRA néz, NEM a névre: a név ugyanaz marad, tehát a névre néző őr azt hinné, kész van, és a bővítés NÉMÁN kimaradna.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures'), ('iktato_csatolmany'),
             ('iktato_sequence_pointers')) AS t(tabla)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL

-- ── 0/D · PK-alak (conkey szerint, NEM pg_get_constraintdef LIKE!) ──────────
UNION ALL
SELECT (140 + row_number() OVER (ORDER BY t.tabla))::int, '0/D · PK-ALAK',
       t.tabla || ' — tartalmaz-e scope-oszlopot az elsődleges kulcs?',
       COALESCE((SELECT CASE WHEN bool_or(a.attname IN ('congregation_id','diocese_id','district_id'))
                             THEN '⛔ IGEN — PK-oszlop nem lehet NULL, kerületi sor be sem szúrható'
                             ELSE '✅ nem (surrogate id) — a megyei kör már elvégezte' END
                 FROM pg_constraint con
                 JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                 WHERE con.conrelid = to_regclass('public.' || t.tabla) AND con.contype = 'p'),
                '⚠️ nincs elsődleges kulcs'),
       'JÓ HÍR: a megyei kör (2026-08-15) mindkét táblán surrogate id-re cserélte a kompozit PK-t — itt tehát NEM kell PK-t cserélni. Az őrszem ellenőrzi.'
FROM (VALUES ('iktato_yearly_closures'), ('iktato_sequence_pointers')) AS t(tabla)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL

-- ── 0/E · ⛔ 5. CSAPDA — a részleges EGYEDI indexek (számsor-védelem) ───────
UNION ALL
SELECT (160 + row_number() OVER (ORDER BY i.idx))::int, '0/E · EGYEDISÉGI INDEX ⛔',
       i.idx || '  (' || i.mire || ')',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes p
                         WHERE p.schemaname='public' AND p.indexname = i.idx)
            THEN '✅ létezik' ELSE '— nincs' END,
       'A gyülekezeti/megyei párok MEGVANNAK, a kerületi párok HIÁNYOZNAK. ⛔ Kerületi sorra EGYIK meglévő index sem illeszkedik → DUPLIKÁLT IKTATÓSZÁM egy hivatalos iraton. Az 1/C mind a négy kerületi párt megépíti.'
FROM (VALUES
  ('leltar_tetelek_cong_leltari_szam_key',      'gyülekezeti — MEGLÉVŐ'),
  ('leltar_tetelek_dio_leltari_szam_key',       'megyei — MEGLÉVŐ'),
  ('leltar_tetelek_dis_leltari_szam_key',       'KERÜLETI — ez a fájl hozza'),
  ('iktato_unique_active_cong_year_seq',        'gyülekezeti — MEGLÉVŐ'),
  ('iktato_unique_active_dio_year_seq',         'megyei — MEGLÉVŐ'),
  ('iktato_unique_active_dis_year_seq',         'KERÜLETI — ez a fájl hozza'),
  ('iktato_seq_pointers_cong_year_uidx',        'gyülekezeti — MEGLÉVŐ'),
  ('iktato_seq_pointers_dio_year_uidx',         'megyei — MEGLÉVŐ'),
  ('iktato_seq_pointers_dis_year_uidx',         'KERÜLETI — ez a fájl hozza'),
  ('iktato_yearly_closures_cong_year_uidx',     'gyülekezeti — MEGLÉVŐ'),
  ('iktato_yearly_closures_dio_year_uidx',      'megyei — MEGLÉVŐ'),
  ('iktato_yearly_closures_dis_year_uidx',      'KERÜLETI — ez a fájl hozza')
) AS i(idx, mire)

-- ── 0/F · ⛔ 3. BLOKKOLÓ CSAPDA — az iktato_csatolmany FK-i ─────────────────
UNION ALL
SELECT 200, '0/F · CSATOLMÁNY-FK ⛔',
       'Az iktato_csatolmany MAI FK-i az iktato-ra',
       COALESCE((SELECT string_agg(con.conname || ': ' || pg_get_constraintdef(con.oid), '  ||  ' ORDER BY con.conname)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.iktato_csatolmany')
                   AND con.contype = 'f'
                   AND con.confrelid = to_regclass('public.iktato')),
                '— nincs FK az iktato-ra'),
       '⛔ Ha CSAK kompozit FK-k vannak: kerületi sornál (ahol congregation_id ÉS diocese_id is NULL) MATCH SIMPLE mellett MINDKETTŐ VÁKUUMOSAN teljesül → a csatolmány BÁRMELYIK, akár IDEGEN iktató-sorra mutathat. Az 1/D a HARMADIK kompozit FK-t adja hozzá.'

UNION ALL
SELECT 201, '0/F · IKTATO UNIQUE-K',
       'Az iktato UNIQUE / PK megszorításai (a kompozit FK célpontjai)',
       COALESCE((SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), '  ||  ' ORDER BY conname)
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.iktato') AND contype IN ('u','p')),
                '— nincs'),
       'Várt MA: iktato_pkey (id) · iktato_id_congregation_uk (id, congregation_id) · iktato_id_diocese_uk (id, diocese_id). Az 1/D hozzáadja: iktato_id_district_uk (id, district_id).'

-- ── 0/G · ⛔ 6. CSAPDA — a sorszám-RPC-k ───────────────────────────────────
UNION ALL
SELECT (210 + row_number() OVER (ORDER BY r.fn))::int, '0/G · SORSZÁM-RPC',
       r.fn,
       CASE WHEN to_regprocedure('public.' || r.fn) IS NULL THEN '— nincs'
            WHEN has_function_privilege('authenticated', ('public.' || r.fn)::regprocedure, 'EXECUTE')
            THEN '✅ van + EXECUTE-grant' ELSE '⚠️ van, DE nincs EXECUTE-grant' END,
       '⛔ 6. csapda: az `ON CONFLICT (…) WHERE …` ARBITERE részleges egyedi indexet keres. Ezért az oszlop + az index + az RPC + a GRANT EGYETLEN tranzakcióba megy — külön futtatott fájlnál MINDEN kerületi iktatás 42P10-zel állna meg.'
FROM (VALUES ('next_iktato_sequence(uuid, integer)'),
             ('next_iktato_sequence_dio(uuid, integer)'),
             ('next_iktato_sequence_dis(uuid, integer)')) AS r(fn)

-- ── 0/H · RLS — a meglévő policy-k és a kerületi lábak ──────────────────────
UNION ALL
SELECT (300 + row_number() OVER (ORDER BY pol.tablename, pol.policyname))::int,
       '0/H · MEGLÉVŐ POLICY-K',
       pol.tablename || ' / ' || pol.policyname || ' (cmd=' || pol.cmd || ')',
       CASE
         WHEN pol.policyname LIKE '%district%' THEN 'kerületi láb (ez a fájl hozza / már élt)'
         WHEN pol.policyname LIKE '%diocese%'  THEN 'megyei láb — ÉRINTETLEN marad'
         -- ⚠️ 2026-08-18 JAVÍTÁS — DEPARSE-HŰ MINTA. A pg_policies.qual NEM a
         --    beírt szöveg, hanem a pg_get_expr() NEM-pretty visszafejtése. A
         --    visszafejtő mindig zárójelezi a NullTestet, tehát a burkolt policy a
         --    katalógusban így áll:  ((congregation_id IS NOT NULL) AND (…))
         --    azaz  IS NOT NULL) AND (  — NEM  IS NOT NULL AND ( .
         --    A tábla-előtagot SEM keressük: a pg_get_expr előtag-kényszer
         --    nélkül fut, tehát a Var előtag NÉLKÜL is megjelenhet; az előtagos
         --    minta ezért MINDEN burkolt policy-t átengedett volna. Az előtag
         --    nélküli részszöveg MINDKÉT visszafejtési alakra illeszkedik.
         --    Az IMMUNIZÁLT kerületi lábra NEM ad téves találatot: ott a
         --    visszafejtés  (NOT (congregation_id IS NOT NULL)),  azaz
         --    IS NOT NULL)) AND (  — KÉT zárójel, a minta nem egyezik.
         WHEN position('congregation_id IS NOT NULL) AND ('
                       in COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) > 0
           THEN '✅ gyülekezeti, őr-burkolt — ÉRINTETLEN marad'
         ELSE 'gyülekezeti, őr NÉLKÜL (a NULL-szemantika véletlenén múlik)'
       END,
       'Ez a fájl EGYETLEN meglévő policy-hez sem nyúl — csak ÚJ kerületi lábakat tesz melléjük. A gyülekezeti és a megyei viselkedés byte-ra változatlan. ⚠️ TÁMPONT (2026-08-18): a MEGYEI kör 2026-08-15-én a leltar_tetelek / iktato / iktato_sablonok / iktato_yearly_closures / iktato_csatolmany gyülekezeti lábait MÁR beburkolta — azoknak itt ŐR-BURKOLT-nak KELL látszaniuk. (Az iktato_sequence_pointers-t egyik megyei fájl sem burkolta: ott az ŐR NÉLKÜL normális.) Ha az első öt táblán IS mindegyik ŐR NÉLKÜL, akkor NEM a detektor téved, hanem a megyei burkoló DO-blokk nem futott le — és AZ a valódi baj: jelezd, mielőtt továbbmennénk.'
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                        'iktato_yearly_closures','iktato_csatolmany',
                        'iktato_sequence_pointers')

UNION ALL
SELECT 380, '0/H · ⛔ 8. CSAPDA',
       'Van-e MÁR BEBURKOLT kerületi policy? (deparse-hű minta: `congregation_id IS NOT NULL) AND (`)',
       (SELECT count(*)::text || ' db'
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                              'iktato_yearly_closures','iktato_csatolmany',
                              'iktato_sequence_pointers')
          AND p.policyname LIKE '%district%'
          -- ⚠️ 2026-08-18: deparse-hű minta (lásd a 0/H fenti megjegyzését).
          AND position('congregation_id IS NOT NULL) AND ('
                       in COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'')) > 0),
       '⛔ Ha NEM 0: egy KORÁBBI fájl újrafuttatása beburkolta a kerületi lábat — az így ÖRÖKRE hamis kerületi sorra, tehát MINDEN kerületi sor NÉMÁN ELTŰNT. Az 1/F idempotensen újraépíti (a DROP POLICY + CREATE POLICY maga a javítás), és a beépített immunizálás megelőzi az ismétlődést.'

-- ── 0/I · ⛔ 13. CSAPDA — a Kuka heti takarítása ────────────────────────────
UNION ALL
SELECT 400, '0/I · KUKA ⛔',
       'A purge_recycle_bin() DELETE-je szűkített-e congregation_id-re?',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%congregation_id IS NOT NULL%'
                             THEN '✅ igen — a nem-gyülekezeti sorokat békén hagyja'
                             ELSE '⛔ NEM — a KERÜLETI (és a MEGYEI!) sorokat is FIZIKAILAG TÖRLI' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='purge_recycle_bin' LIMIT 1),
                '— nincs purge_recycle_bin függvény'),
       '⛔ A NAPI takarítás (03:15 UTC, a 2026-08-14-es kör óta) a `<jelző> = true AND deleted_at < now() - 30 nap` sorokat HARD-DELETE-eli, MIND A 12 soft-delete táblán. Kerületi Kuka-felület NINCS, tehát a kerületi tétel törlése VISSZAVONHATATLAN — a megyei sorokra ugyanez áll MA IS. Az 1/G szűkíti.'

UNION ALL
SELECT 401, '0/I · KUKA GRANT',
       'A purge_recycle_bin()-t KIZÁRÓLAG a service_role hívhatja?',
       CASE WHEN to_regprocedure('public.purge_recycle_bin()') IS NULL THEN '— nincs függvény'
            ELSE CASE WHEN has_function_privilege('service_role', 'public.purge_recycle_bin()'::regprocedure, 'EXECUTE')
                      THEN '✅ service' ELSE '⛔ service NEM' END
                 || CASE WHEN has_function_privilege('authenticated', 'public.purge_recycle_bin()'::regprocedure, 'EXECUTE')
                         THEN ' · ⛔ authenticated IS' ELSE ' · ✅ authenticated nem' END
       END,
       '⚠️ 2026-08-19: az 1/G DROP FUNCTION + CREATE FUNCTION-nel dolgozik (a visszatérési típust a CREATE OR REPLACE nem tudja megváltoztatni), és a DROP a JOGOKAT IS ELVISZI. A REVOKE/GRANT sorok ott ezért KÖTELEZŐEK, nem óvatosságból vannak — a 2. szakasz 112. sora visszaméri őket.'

-- ── 0/I · ⛔ A KUKA-FÜGGVÉNY ALAKJA (a futtatás ELŐTT látni kell!) ──────────
-- ⚠️ PARSE-BIZTOS: a to_regprocedure NULL-t ad, ha nincs ilyen függvény (nem
--    hibázik, ellentétben a ::regprocedure kasztolással), a pg_get_function_result
--    pedig STRICT — NULL bemenetre NULL a kimenet. Így ez a sor akkor sem
--    buktatja meg az EGÉSZ 0. szakaszt, ha a függvény hiányzik.
UNION ALL
SELECT 402, '0/I · KUKA SZIGNATÚRA ⛔',
       'Milyen oszlopokkal tér vissza MA a purge_recycle_bin()?',
       COALESCE(pg_get_function_result(to_regprocedure('public.purge_recycle_bin()')),
                '— nincs ilyen függvény'),
       'VÁRT: TABLE(tbl text, deleted_count bigint, skipped_count bigint) — ez a 2026-08-14-es, HÁROM oszlopos alak. Ha mást mutat (pl. a régi, 2 oszlopos 2026-04-15-öst) vagy hiányzik: az 1. szakasz őrszeme fail-closed MEGÁLL, és ELŐBB a 2026-08-14-kuka-deleted-at.sql-t kell lefuttatni. Az 1/G ugyanis annak a törzsét tükrözi (12 tábla, deleted_at, soronkénti tartalék-ág), és DROP+CREATE-tel írja újra — ez csak ebből az alakból biztonságos.'

-- ── 0/J · MENTÉS-BESOROLÁS (a `tabla` oszlop a kulcs, NEM table_name!) ──────
-- ⚠️ 2026-08-18 JAVÍTÁS — PARSE-BIZTOS OSZLOP-OLVASÁS.
--    A korábbi alak közvetlenül hivatkozott a p.globalis_predikatum oszlopra.
--    Ha a megyei S4 fájl MÉG NEM futott le, az az oszlop nincs meg — és a
--    hiányzó oszlop már PARSE-időben (42703) megbuktatja az EGÉSZ 0. szakaszt.
--    A COALESCE/CASE NEM véd ez ellen: nem futásidejű, hanem elemzési hiba.
--    Vagyis pont az a sor NEM tudott volna megjelenni, amelyik ezt jelzi.
--    A to_jsonb(p) ->> 'oszlop' alak hiányzó oszlopra NULL-t ad, nem hibát,
--    a jsonb_exists() pedig megkülönbözteti a HIÁNYZÓ oszlopot az ÜRES értéktől.
--    (A táblát MAGÁT nem lehet parse-biztosan hivatkozni; a backup_table_policy
--     viszont a mentés-rendszer alapja, és az 1. szakasz őrszeme (g) is nézi.)
UNION ALL
SELECT (500 + row_number() OVER (ORDER BY t.tabla))::int, '0/J · MENTÉS-BESOROLÁS',
       t.tabla,
       COALESCE((SELECT 'hatokor=' || COALESCE(to_jsonb(p) ->> 'hatokor', '⛔ nincs hatokor oszlop')
                        || ' · reteg=' || COALESCE(to_jsonb(p) ->> 'reteg', '-')
                        || ' · globalis_predikatum='
                        || CASE
                             WHEN NOT jsonb_exists(to_jsonb(p), 'globalis_predikatum')
                               THEN '⛔ NINCS ILYEN OSZLOP — a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql nem futott le'
                             WHEN COALESCE(btrim(to_jsonb(p) ->> 'globalis_predikatum'), '') = ''
                               THEN '⚠️ ÜRES'
                             ELSE to_jsonb(p) ->> 'globalis_predikatum'
                           END
                 FROM public.backup_table_policy p WHERE p.tabla = t.tabla),
                '⛔ BESOROLATLAN — a napi mentés MINDEN gyülekezetnél LEÁLLNA'),
       'ÚJ TÁBLA NEM JÖN LÉTRE, tehát a besorolás NEM változik. A `globalis_predikatum` = ''t.congregation_id IS NULL'' a KERÜLETI sorokra IS illeszkedik (a kerületi sornál a congregation_id NULL) — az 1/H csak idempotensen pótolja, ha üresen maradt.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures'), ('iktato_csatolmany'),
             ('iktato_sequence_pointers')) AS t(tabla)

-- ── 0/K · A districts tábla léte ────────────────────────────────────────────
-- ⚠️ 2026-08-18 JAVÍTÁS — ITT EGYETLEN `FROM public.districts` SEM LEHET.
--    A korábbi alak a CASE ELSE-ágában megszámolta a kerületeket. A CASE NEM
--    véd: a hiányzó tábla PARSE-időben (42P01) megbuktatja az EGÉSZ 0. szakaszt,
--    tehát a „⛔ NINCS public.districts” sor SOHA nem tudott volna megjelenni —
--    pont az a diagnózis veszett volna el, amiért a sor készült.
--    Itt ezért CSAK katalógus (to_regclass / pg_attribute). A kerületek
--    DARABSZÁMÁT a 2. szakasz „KERÜLETEK” sora mondja meg: ott már biztonságos,
--    mert az 1. szakasz őrszeme addigra igazolta a tábla létét.
UNION ALL
SELECT 600, '0/K · CÉL-TÁBLA',
       'Létezik a public.districts? (a district_id FK célpontja)',
       CASE WHEN to_regclass('public.districts') IS NULL
            THEN '⛔ NINCS public.districts — nem ez az adatbázis'
            ELSE '✅ létezik · ' || (SELECT count(*)::text FROM pg_attribute a
                                    WHERE a.attrelid = to_regclass('public.districts')
                                      AND a.attnum > 0 AND NOT a.attisdropped) || ' oszlop' END,
       'A district_id FK célpontja. A kerületek DARABSZÁMÁT szándékosan NEM olvassuk ki itt (parse-biztonság) — a 2. szakasz „KERÜLETEK” sora mutatja meg.'

UNION ALL
SELECT 601, '0/K · MENTÉS-OSZLOP',
       'Megvan a backup_table_policy.globalis_predikatum oszlop?',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='backup_table_policy'
                           AND column_name='globalis_predikatum')
            THEN '✅ van (a megyei S4 fájl hozta)'
            ELSE '⛔ NINCS — a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql nem futott le' END,
       'Ezen az oszlopon megy a NEM-gyülekezeti (megyei ÉS kerületi) sorok mentés-szűrője. Az 1. szakasz őrszeme enélkül megáll.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                 FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ. Ne futtasd darabonként!                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ───────────────────────────────────────
DO $orszem$
DECLARE
  v_hiany text;
  v_sig   text;
BEGIN
  -- (a) A cél-tábla.
  IF to_regclass('public.districts') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.districts tábla — nem ez az adatbázis.';
  END IF;

  -- (b) A kanonikus hatókör-függvények.
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_has_global_access() / current_user_district_ids() — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_district_olvaso_ids() — ELŐBB a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fusson le (a kerületi számvevő olvasása különben elveszne).';
  END IF;

  -- (b2) ⚠️ 2026-08-18: A GLOBÁL-FÜGGVÉNY NEM LEHET A RÉGI, TÁG TÖRZS.
  --      Mind a 12 új kerületi policy-nak (és a next_iktato_sequence_dis
  --      kapujának) van public.current_user_has_global_access() ága. Ha ezen az
  --      adatbázison mégis a régi, fázis-0 törzs élne (ami az esperest is
  --      globálisnak vette), MINDEN esperes ÍRÁSI jogot kapna a kerületi
  --      leltárra és iktatóra — némán, hibaüzenet nélkül. A testvér-fájl (S5b)
  --      ugyanezt az őrt tartalmazza.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
      AND p.prosrc LIKE '%esperes%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_has_global_access() még a RÉGI, tág (esperest is globálisnak vevő) törzs — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql 2a szakasza fusson le. Enélkül minden esperes írhatná a kerület leltárát és iktatóját.';
  END IF;

  -- (c) Az ÍRÁSI hatókör nem tartalmazhat számvevőt (az ellenőr nem ír).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_district_ids'
      AND p.prosrc LIKE '%egyhazkeruleti_szamvevo%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_district_ids() törzse EMLÍTI az egyhazkeruleti_szamvevo-t — az ÍRÁSI hatókör sérült, előbb tisztázd.';
  END IF;

  -- (d) A 6 tábla létezik, és a MEGYEI kör lefutott rajtuk (diocese_id).
  SELECT string_agg(t.tabla, ', ') INTO v_hiany
  FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
               ('iktato_yearly_closures'), ('iktato_csatolmany'),
               ('iktato_sequence_pointers')) AS t(tabla)
  WHERE to_regclass('public.' || t.tabla) IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name = t.tabla
                      AND c.column_name = 'diocese_id');
  IF v_hiany IS NOT NULL THEN
    RAISE EXCEPTION '⛔ Hiányzó tábla vagy diocese_id oszlop: %. ELŐBB a 2026-08-15-egyhazmegyei-scope-oszlopok.sql és a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql fusson le.', v_hiany;
  END IF;

  -- (e) A congregation_id mind a 6 táblán NULL-ozható kell legyen — különben a
  --     kerületi sor (ahol congregation_id NULL) be sem szúrható.
  SELECT string_agg(c.table_name::text, ', ') INTO v_hiany
  FROM information_schema.columns c
  WHERE c.table_schema='public'
    AND c.table_name IN ('leltar_tetelek','iktato','iktato_sablonok',
                         'iktato_yearly_closures','iktato_csatolmany',
                         'iktato_sequence_pointers')
    AND c.column_name = 'congregation_id'
    AND c.is_nullable = 'NO';
  IF v_hiany IS NOT NULL THEN
    RAISE EXCEPTION '⛔ A congregation_id MÉG NOT NULL ezeken: %. A megyei kör ezt már elvégezte volna — ne kerüld meg, derítsd ki, mi állította vissza.', v_hiany;
  END IF;

  -- (f) A PK-k már surrogate-ok (conkey szerint, NEM constraintdef LIKE szerint).
  SELECT string_agg(t.tabla, ', ') INTO v_hiany
  FROM (VALUES ('iktato_yearly_closures'), ('iktato_sequence_pointers')) AS t(tabla)
  WHERE EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.conrelid = to_regclass('public.' || t.tabla) AND con.contype = 'p'
      AND a.attname IN ('congregation_id','diocese_id','district_id')
  );
  IF v_hiany IS NOT NULL THEN
    RAISE EXCEPTION '⛔ Az elsődleges kulcs MÉG tartalmaz scope-oszlopot ezeken: %. PK-oszlop nem lehet NULL — előbb a megyei surrogate-PK csere fusson le.', v_hiany;
  END IF;

  -- (g) Mentés-besorolás: besorolatlan tábla → a NAPI MENTÉS MINDEN
  --     gyülekezetnél LEÁLL (assertInventoryClassified). Új tábla nem jön
  --     létre, de ha valamelyik besorolása MA hiányzik, a kerületi sorok
  --     eleve mentetlenek lennének — fail-closed megállunk.
  SELECT string_agg(t.tabla, ', ') INTO v_hiany
  FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
               ('iktato_yearly_closures'), ('iktato_csatolmany'),
               ('iktato_sequence_pointers')) AS t(tabla)
  WHERE NOT EXISTS (SELECT 1 FROM public.backup_table_policy b WHERE b.tabla = t.tabla);
  IF v_hiany IS NOT NULL THEN
    RAISE EXCEPTION '⛔ BESOROLATLAN TÁBLA a backup_table_policy-ban: %. A napi mentés MINDEN gyülekezetnél leállna (assertInventoryClassified). Előbb sorold be — a `tabla` oszlop a kulcs, NEM table_name.', v_hiany;
  END IF;

  -- (h) A mentés-szűrő oszlopa (az 1/H ezt írja). A megyei S4 fájl hozta.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='backup_table_policy'
      AND column_name='globalis_predikatum'
  ) THEN
    RAISE EXCEPTION '⛔ Nincs backup_table_policy.globalis_predikatum oszlop — ELŐBB a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql fusson le. Enélkül a kerületi sorok EGYIK mentés-fájlba sem kerülnének.';
  END IF;

  -- (i) ⚠️ 2026-08-19: A KUKA-FÜGGVÉNY ALAKJA (ezt az 1/G írja újra).
  --     Az 1/G DROP FUNCTION + CREATE FUNCTION-nel dolgozik, mert a visszatérési
  --     TÍPUS változik (a 2026-04-15-ös alak 2 oszlopos volt, a 2026-08-14-es 3):
  --     a CREATE OR REPLACE erre 42P13-mal elszállna, és mivel ez az EGÉSZ
  --     szakasz EGYETLEN tranzakció, MINDENT visszagörgetne.
  --     A törzs, amit írunk, a 2026-08-14-es HÁROM oszlopos változat scope-szűrt
  --     tükre — az pedig `deleted_at` oszlopokat ÉS bélyegző triggereket
  --     FELTÉTELEZ. Ha itt mégsem az az alak él (a fájl nem futott le, vagy
  --     valaki visszaírta a régit), a mi törzsünk mind a 12 táblán a hiba-ágra
  --     futna (deleted_count = -1) → a Kuka NÉMÁN sosem ürülne, a felületen
  --     ígért „30 nap után véglegesen törlődik" pedig hazugság lenne.
  --     Inkább HANGOSAN álljunk meg. (A 0. szakasz 402. sora előre kiírja.)
  v_sig := pg_get_function_result(to_regprocedure('public.purge_recycle_bin()'));
  IF v_sig IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.purge_recycle_bin() függvény — ELŐBB a 2026-08-14-kuka-deleted-at.sql fusson le (az hozza a deleted_at oszlopokat, a bélyegző triggereket és a napi cront). Az 1/G törzse enélkül mind a 12 táblán hibára futna, és a Kuka sosem ürülne.';
  END IF;
  IF lower(regexp_replace(v_sig, '\s+', ' ', 'g'))
     <> 'table(tbl text, deleted_count bigint, skipped_count bigint)' THEN
    RAISE EXCEPTION '⛔ A purge_recycle_bin() visszatérési oszlopai NEM a várt 2026-08-14-es alak. ÉLŐ: „%". VÁRT: „TABLE(tbl text, deleted_count bigint, skipped_count bigint)". Az 1/G ezt a törzset tükrözi (12 tábla, deleted_at-alapú feltétel, soronkénti tartalék-ág) — ELŐBB a 2026-08-14-kuka-deleted-at.sql fusson le, és NE kerüld meg: derítsd ki, mi állította vissza a régi alakot.', v_sig;
  END IF;

  RAISE NOTICE '✅ Őrszem: minden előfeltétel teljesül.';
END
$orszem$;

-- GRANT-tanulság: a policy a HÍVÓ szerepében fut — EXECUTE nélkül 42501/403.
-- (Idempotens ismétlés: az S1 fájl is kiadta.)
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_olvaso_ids() TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) A HARMADIK scope-oszlop mind a 6 táblán
-- ────────────────────────────────────────────────────────────────────────────
-- ON DELETE szándékosan KÉTFÉLE — a megyei minta betűhű tükre:
--   · leltar_tetelek / iktato / iktato_sablonok → NO ACTION: egy egyházkerület
--     törlése leltárral vagy iktatókönyvvel a hasában HANGOSAN bukjon el, ne
--     vigye némán az iratokat.
--   · iktato_yearly_closures / _csatolmany / _sequence_pointers → CASCADE:
--     ezek a fő sor kísérő-adatai (évzárás, csatolmány-metaadat, számláló).

ALTER TABLE public.leltar_tetelek           ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.iktato                   ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.iktato_sablonok          ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.iktato_yearly_closures   ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.iktato_csatolmany        ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.iktato_sequence_pointers ADD COLUMN IF NOT EXISTS district_id uuid;

DO $fk$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT t.tabla, t.torles FROM (VALUES
      ('leltar_tetelek',           ''),
      ('iktato',                   ''),
      ('iktato_sablonok',          ''),
      ('iktato_yearly_closures',   ' ON DELETE CASCADE'),
      ('iktato_csatolmany',        ' ON DELETE CASCADE'),
      ('iktato_sequence_pointers', ' ON DELETE CASCADE')
    ) AS t(tabla, torles)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.tabla || '_district_id_fkey'
        AND conrelid = ('public.' || r.tabla)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (district_id) REFERENCES public.districts(id)%s',
        r.tabla, r.tabla || '_district_id_fkey', r.torles);
      RAISE NOTICE '✅ %_district_id_fkey létrehozva.', r.tabla;
    END IF;
  END LOOP;
END
$fk$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) ⛔ 1. BLOKKOLÓ CSAPDA — a scope-őr CHECK KÉTOSZLOPOSRÓL HÁROMOSZLOPOSRA
-- ────────────────────────────────────────────────────────────────────────────
-- MA:  CHECK (num_nonnulls(congregation_id, diocese_id) = 1)
-- Egy kerületi sorban MINDKÉT oszlop NULL → num_nonnulls = 0 <> 1 → az ELSŐ
-- kerületi leltári tétel 23514-gyel elhasal.
--
-- ⚠️ KÉT SZABÁLY EGYSZERRE:
--  (1) A CÉLZÁS NÉV SZERINT megy (`<tabla>_pontosan_egy_scope`), SOHA
--      `pg_get_constraintdef LIKE` szerint — az élesben már elsült: a
--      custom_label_check is „említette" a keresett oszlopot, és MÁS
--      constraintet dobtunk volna el.
--  (2) Az IDEMPOTENCIA-ŐR viszont a DEFINÍCIÓRA néz (tartalmazza-e a
--      `district_id`-t), NEM a névre — a név ugyanaz marad, tehát egy névre
--      néző őr azt hinné, kész van, és a bővítés NÉMÁN kimaradna.
--
-- A DROP és az ADD UGYANEBBEN a tranzakcióban van: különben lenne egy pillanat,
-- amikor a tábla scope-őr NÉLKÜL áll.

DO $scope_check$
DECLARE
  r     record;
  v_nev text;
  v_def text;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES
      ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
      ('iktato_yearly_closures'), ('iktato_csatolmany'),
      ('iktato_sequence_pointers')
    ) AS t(tabla)
  LOOP
    v_nev := r.tabla || '_pontosan_egy_scope';
    v_def := NULL;

    SELECT pg_get_constraintdef(con.oid) INTO v_def
    FROM pg_constraint con
    WHERE con.conrelid = ('public.' || r.tabla)::regclass
      AND con.conname  = v_nev
      AND con.contype  = 'c';

    IF v_def IS NULL THEN
      RAISE EXCEPTION '⛔ Nincs "%" nevű scope-őr CHECK a(z) public.% táblán. A megyei kör mind a 6 táblán létrehozta — ne kerüld meg, derítsd ki, mi dobta el.', v_nev, r.tabla;
    END IF;

    -- Idempotencia a DEFINÍCIÓ alapján (NEM a név alapján!).
    IF position('district_id' in v_def) > 0 THEN
      RAISE NOTICE 'ℹ️ % már háromoszlopos — nem nyúlunk hozzá.', v_nev;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tabla, v_nev);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (num_nonnulls(congregation_id, diocese_id, district_id) = 1)',
      r.tabla, v_nev);
    RAISE NOTICE '✅ % — a scope-őr KÉTOSZLOPOSRÓL HÁROMOSZLOPOSRA cserélve (régi: %).', v_nev, v_def;
  END LOOP;
END
$scope_check$;

COMMENT ON COLUMN public.leltar_tetelek.district_id IS
  '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI leltár tétele. Pontosan az egyik scope (congregation_id VAGY diocese_id VAGY district_id) kitöltött — a <tabla>_pontosan_egy_scope CHECK őrzi.';
COMMENT ON COLUMN public.iktato.district_id IS
  '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI iktatókönyv sora. Pontosan az egyik scope kitöltött — CHECK őrzi. A sorszám-kiosztás a next_iktato_sequence_dis RPC-n megy, az egyediséget az iktato_unique_active_dis_year_seq részleges index védi.';
COMMENT ON COLUMN public.iktato_sablonok.district_id IS
  '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI iktató irat-sablonja. Pontosan az egyik scope kitöltött — CHECK őrzi.';
COMMENT ON COLUMN public.iktato_yearly_closures.district_id IS
  '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI iktatókönyv évzárása. Pontosan az egyik scope kitöltött — CHECK őrzi; évente legfeljebb egy lezárás (iktato_yearly_closures_dis_year_uidx).';
COMMENT ON COLUMN public.iktato_csatolmany.district_id IS
  '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI irat csatolmánya. Pontosan az egyik scope kitöltött — CHECK őrzi; a kompozit FK (iktato_id, district_id) garantálja, hogy a denormalizált érték a szülő irat VALÓDI kerülete.';
COMMENT ON COLUMN public.iktato_sequence_pointers.district_id IS
  '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI iktatókönyv számláló-sora. Pontosan az egyik scope kitöltött — CHECK őrzi; a kiosztást a next_iktato_sequence_dis RPC végzi.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) Indexek — lista-lekérdezés + ⛔ 5. CSAPDA (a kerületi számsor-védelem)
-- ────────────────────────────────────────────────────────────────────────────
-- A meglévő részleges EGYEDI indexek MIND scope-kulcsúak, és kerületi sorra
-- EGYIK SEM illeszkedik (mindegyik WHERE-je congregation_id / diocese_id
-- IS NOT NULL). Enélkül két kerületi irat KAPHATNÁ UGYANAZT az iktatószámot —
-- egy hivatalos, hatóság felé menő okiraton. Mind a négynek kell a kerületi
-- párja, és MIND EBBEN a tranzakcióban jön létre (lásd 1/E: az ON CONFLICT
-- arbitere pont ezt az indexet keresi).
--
-- ⚠️ A MEGLÉVŐ indexekhez NEM nyúlunk: a gyülekezeti és a megyei egyediség
--    byte-ra változatlan.

-- Lista-lekérdezések (nem egyedi, részleges — a gyülekezeti sorokat nem hizlalja).
CREATE INDEX IF NOT EXISTS leltar_tetelek_district_id_idx
  ON public.leltar_tetelek (district_id) WHERE district_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iktato_district_id_idx
  ON public.iktato (district_id, year) WHERE district_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iktato_sablonok_district_id_idx
  ON public.iktato_sablonok (district_id) WHERE district_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iktato_csatolmany_district_idx
  ON public.iktato_csatolmany (district_id) WHERE district_id IS NOT NULL;

-- EGYEDISÉG — a gyülekezeti/megyei párok betűhű tükrei.
-- leltar_tetelek_cong_leltari_szam_key (2026-08-09) / _dio_… (2026-08-15) tükre:
CREATE UNIQUE INDEX IF NOT EXISTS leltar_tetelek_dis_leltari_szam_key
  ON public.leltar_tetelek (district_id, leltari_szam)
  WHERE district_id IS NOT NULL
    AND leltari_szam IS NOT NULL
    AND COALESCE(is_deleted, false) = false;

-- iktato_unique_active_cong_year_seq (2026-05-17) / _dio_… (2026-08-15) tükre:
CREATE UNIQUE INDEX IF NOT EXISTS iktato_unique_active_dis_year_seq
  ON public.iktato (district_id, year, sequence_number)
  WHERE district_id IS NOT NULL AND deleted = false;

-- iktato_seq_pointers_cong_year_uidx / _dio_year_uidx tükre
-- (⚠️ EZ az 1/E RPC-jének ON CONFLICT ARBITERE — ezért van itt, EGY tranzakcióban):
CREATE UNIQUE INDEX IF NOT EXISTS iktato_seq_pointers_dis_year_uidx
  ON public.iktato_sequence_pointers (district_id, year)
  WHERE district_id IS NOT NULL;

-- iktato_yearly_closures_cong_year_uidx / _dio_year_uidx tükre:
CREATE UNIQUE INDEX IF NOT EXISTS iktato_yearly_closures_dis_year_uidx
  ON public.iktato_yearly_closures (district_id, year)
  WHERE district_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) ⛔ 3. BLOKKOLÓ CSAPDA — a csatolmány kerületi kompozit FK-ja
-- ────────────────────────────────────────────────────────────────────────────
-- MA az iktato_csatolmany-on NINCS egyoszlopos FK az iktato_id-n, csak KÉT
-- kompozit: (iktato_id, congregation_id) és (iktato_id, diocese_id).
-- Egy KERÜLETI csatolmány-sorban mindkét scope-oszlop NULL, és MATCH SIMPLE
-- mellett a NULL-t tartalmazó kompozit FK VÁKUUMOSAN teljesül — vagyis
-- ellenőrzés nélkül átmegy. Következmény: a kerületi csatolmány BÁRMELYIK,
-- akár IDEGEN GYÜLEKEZET iktató-sorára mutathatna, vagy nem létezőre.
--
-- A feloldás a scope-oszloppal EGY tranzakcióban: a HARMADIK kompozit FK
-- (iktato_id, district_id). Kerületi sorban MINDKÉT oszlopa NOT NULL, tehát
-- ez az FK VALÓBAN ellenőriz — a másik kettő vákuumossága ártalmatlanná válik.

DO $csat_fk$
BEGIN
  -- A kompozit FK célpontja csak UNIQUE/PK lehet. (Az id önmagában PK, tehát a
  -- pár amúgy is egyedi — ez a megszorítás KIZÁRÓLAG FK-célpontnak kell.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_id_district_uk'
      AND conrelid = 'public.iktato'::regclass
  ) THEN
    ALTER TABLE public.iktato
      ADD CONSTRAINT iktato_id_district_uk UNIQUE (id, district_id);
    RAISE NOTICE '✅ iktato_id_district_uk létrehozva (a kompozit FK célja).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_csatolmany_iktato_dis_fkey'
      AND conrelid = 'public.iktato_csatolmany'::regclass
  ) THEN
    ALTER TABLE public.iktato_csatolmany
      ADD CONSTRAINT iktato_csatolmany_iktato_dis_fkey
      FOREIGN KEY (iktato_id, district_id)
      REFERENCES public.iktato (id, district_id) ON DELETE CASCADE;
    RAISE NOTICE '✅ iktato_csatolmany_iktato_dis_fkey létrehozva (3. blokkoló csapda zárva).';
  END IF;
END
$csat_fk$;

COMMENT ON CONSTRAINT iktato_id_district_uk ON public.iktato IS
  '2026-08-17 (egyházkerületi S5a, 3. blokkoló csapda): NEM önmagáért van — az iktato_csatolmany (iktato_id, district_id) KOMPOZIT FK-jának a célja. ⛔ NE dobd el: az eldobás magával vinné a kerületi csatolmányok szülő-ellenőrzését, és a csatolmány MATCH SIMPLE mellett idegen iratra mutathatna.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) ⛔ 6. CSAPDA — a KERÜLETI sorszám-kiosztó RPC
-- ────────────────────────────────────────────────────────────────────────────
-- A next_iktato_sequence_dio (2026-08-15) BETŰHŰ párja, két különbséggel:
--   · a hatókör-kapu a current_user_district_ids() (kerületi admin; a
--     KERÜLETI SZÁMVEVŐ NINCS benne — az ellenőr nem iktat);
--   · az ON CONFLICT ARBITERE az 1/C-ben, UGYANEBBEN a tranzakcióban létrejövő
--     iktato_seq_pointers_dis_year_uidx részleges index. Ha az index KÉSŐBB
--     futtatott fájlba került volna, MINDEN kerületi iktatás 42P10-zel állna meg.
--
-- ⚠️ A GYÜLEKEZETI és a MEGYEI RPC-hez NEM NYÚLUNK — byte-ra változatlanok.

CREATE OR REPLACE FUNCTION public.next_iktato_sequence_dis(
  p_district_id uuid,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NOT (public.current_user_has_global_access()
          OR p_district_id = ANY (COALESCE(public.current_user_district_ids(), '{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez az egyházkerülethez (% / %)',
      auth.uid(), p_district_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.iktato_sequence_pointers (district_id, year, last_sequence)
  VALUES (p_district_id, p_year, 1)
  ON CONFLICT (district_id, year) WHERE district_id IS NOT NULL DO UPDATE
    SET last_sequence = public.iktato_sequence_pointers.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.next_iktato_sequence_dis(uuid, integer) IS
  '2026-08-17 (egyházkerületi szint, S5a): atomic per-(kerület, év) iktató-sorszám — a megyei next_iktato_sequence_dio betűhű párja, szerep-szűrt kapuval (current_user_district_ids: KIZÁRÓLAG egyhazkeruleti_admin; a számvevő nem iktat). Az ON CONFLICT arbitere az iktato_seq_pointers_dis_year_uidx részleges index.';

GRANT EXECUTE ON FUNCTION public.next_iktato_sequence_dis(uuid, integer) TO authenticated;

-- Backfill: ha (kézi úton) már keletkeztek kerületi iktato-sorok, a számláló
-- álljon a MAX-on. Idempotens — a GREATEST sosem léptet vissza.
INSERT INTO public.iktato_sequence_pointers (district_id, year, last_sequence)
SELECT i.district_id, i.year, MAX(i.sequence_number)
FROM public.iktato i
WHERE i.district_id IS NOT NULL AND i.deleted = false
GROUP BY i.district_id, i.year
ON CONFLICT (district_id, year) WHERE district_id IS NOT NULL DO UPDATE
  SET last_sequence = GREATEST(
    public.iktato_sequence_pointers.last_sequence,
    EXCLUDED.last_sequence
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 1/F) RLS — ÚJ kerületi lábak a meglévők MELLÉ
-- ────────────────────────────────────────────────────────────────────────────
-- A meglévő gyülekezeti (congregation_id IS NOT NULL AND …) és megyei
-- (diocese_id IS NOT NULL AND …) policy-khoz EGYÁLTALÁN NEM NYÚLUNK: kerületi
-- sorra egyik sem illeszkedik, tehát a régi viselkedés byte-ra változatlan.
--
-- ⛔⛔ 8. CSAPDA — A BURKOLÓ DO-BLOKK MEGENNÉ A KERÜLETI LÁBAKAT ⛔⛔
-- A 2026-08-15-egyhazmegyei-scope-oszlopok.sql (≈384-399. sor) és a
-- 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql (≈283-310. sor) egy DO-ciklussal
-- burkolja be a policy-kat `congregation_id IS NOT NULL AND (…)` alakra.
-- A szűrőjük:
--     policyname NOT LIKE '%diocese%'
--     AND (qual || with_check) NOT LIKE '%congregation_id IS NOT NULL%'
-- KÉT BAJ a kerülettel:
--   (a) a '%district%' NINCS kizárva a névszűrőből;
--   (b) az idempotencia-szűrő olyan szövegre néz, ami egy kerületi policy-ban
--       SOHA nem volna benne.
-- Vagyis ha Endre BÁRMIKOR újrafuttatja a két megyei fájlt (a ház szabálya
-- szerint idempotensek, tehát bátran újrafuttathatók), azok a kerületi lábakat
-- IS beburkolnák `congregation_id IS NOT NULL AND (…)` alakra — ami egy
-- kerületi sorra (congregation_id NULL) ÖRÖKRE HAMIS. Eredmény: MINDEN kerületi
-- leltári tétel és iktatott irat NÉMÁN ELTŰNIK a felületről. Nem hibaüzenet:
-- üres lista.
--
-- A két megyei fájl NEM ebben a szeletben él, tehát ITT kell megvédeni magunkat.
-- KÉT, EGYMÁSTÓL FÜGGETLEN VÉDELEM:
--
--  (1) IMMUNIZÁLÁS. Minden kerületi policy-kifejezés tartalmazza a
--      `NOT (<tabla>.congregation_id IS NOT NULL)` tagot. Ez KÉT dolgot ad:
--        · SZEMANTIKAILAG fail-closed erősítés (egy hibás, két scope-ot is
--          hordozó sor a kerületi lábon SEM látszana) — a CHECK miatt amúgy is
--          igaz minden ép kerületi sorra, tehát a viselkedést nem változtatja;
--        · a tárolt kifejezés SZÖVEGÉBEN megjelenik a
--          `congregation_id IS NOT NULL` részlet, amitől a KORÁBBI fájlok
--          idempotencia-szűrője „már őrzött"-nek látja, és ÁTUGORJA őket.
--      Ezt a 2. szakasz KÜLÖN sorban ellenőrzi — ha a szöveg valamiért nem
--      maradna meg a katalógusban, azonnal látszik, hogy a védelem (1) nem áll.
--      (Mellékhaszon: a megyei fájlok saját 2. szakaszos „őr nélküli policy"
--      ellenőrzései sem adnak téves riasztást a kerületi lábakra.)
--
--  (2) JAVÍTÓ ÚJRAÉPÍTÉS. Ez a fájl a kerületi lábakat DROP POLICY IF EXISTS +
--      CREATE POLICY párral építi, tehát az ÚJRAFUTTATÁSA maga a javítás: egy
--      beburkolt kerületi láb visszaáll a helyes alakra. Az alábbi DO-blokk
--      ELŐBB HANGOSAN kiírja, ha talált ilyet — hogy ne néma javítás legyen.

DO $burkolas_diagnozis$
DECLARE
  pol record;
  v_db integer := 0;
BEGIN
  FOR pol IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                          'iktato_yearly_closures','iktato_csatolmany',
                          'iktato_sequence_pointers')
      AND p.policyname LIKE '%district%'
      -- ⚠️ 2026-08-18 JAVÍTÁS — DEPARSE-HŰ MINTA. A pg_policies.qual a
      --    pg_get_expr() NEM-pretty visszafejtése: a NullTest köré MINDIG kerül
      --    egy zárójelpár, a Var pedig tábla-előtag NÉLKÜL is megjelenhet.
      --    A régi, előtagos  IS NOT NULL AND (  minta ezért SOHA nem találhatott
      --    — ez a WARNING és a 2. szakasz 108-as sora TARTÓSAN TÉVES ZÖLDET
      --    mutatott pont arra a csapdára, ami miatt ez a fájl készült.
      --    Az immunizált kerületi lábra a minta NEM illeszkedik: ott
      --    IS NOT NULL)) AND (  áll, két zárójellel.
      AND position('congregation_id IS NOT NULL) AND ('
                   in COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'')) > 0
  LOOP
    v_db := v_db + 1;
    RAISE WARNING '⛔ 8. CSAPDA ELSÜLT: a %.% kerületi policy BE VAN BURKOLVA congregation_id IS NOT NULL alá — kerületi sorra ÖRÖKRE hamis volt. Ez a futtatás újraépíti.', pol.tablename, pol.policyname;
  END LOOP;
  IF v_db = 0 THEN
    RAISE NOTICE '✅ 8. csapda: nincs beburkolt kerületi policy.';
  END IF;
END
$burkolas_diagnozis$;

-- ── A NÉGY „egyszerű" tábla: FOR ALL (írók) + FOR SELECT (olvasók) ─────────
-- Alak (a megyei _diocese_all / _diocese_olvaso_select kanonikus mintája):
--   írás:    current_user_district_ids()          → egyhazkeruleti_admin
--   olvasás: current_user_district_olvaso_ids()   → admin + egyhazkeruleti_szamvevo
-- A COALESCE(…, '{}') a fail-closed őr: NULL hatókör → ÜRES lista, SOHA teljes
-- lista („skalár hatókör + if(id) filter = néma teljes szivárgás" hibaosztály).
-- A `(SELECT fn())` alak az InitPlan-forma: soronként újra-hívás helyett egyszer.

DO $district_lab$
DECLARE
  r     record;
  v_all text;
  v_olv text;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES
    ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'), ('iktato_yearly_closures')
  ) AS t(tabla)
  LOOP
    v_all := format(
      '%I.district_id IS NOT NULL
       AND NOT (%I.congregation_id IS NOT NULL)
       AND (public.current_user_has_global_access()
            OR %I.district_id = ANY (COALESCE((SELECT public.current_user_district_ids()), ''{}''::uuid[])))',
      r.tabla, r.tabla, r.tabla);

    v_olv := format(
      '%I.district_id IS NOT NULL
       AND NOT (%I.congregation_id IS NOT NULL)
       AND %I.district_id = ANY (COALESCE((SELECT public.current_user_district_olvaso_ids()), ''{}''::uuid[]))',
      r.tabla, r.tabla, r.tabla);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_district_all', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      r.tabla || '_district_all', r.tabla, v_all, v_all);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
      r.tabla || '_district_all', r.tabla,
      '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI sorok (district_id IS NOT NULL) teljes hozzáférése — rendszergazda + szerep-szűrt kerületi írók (current_user_district_ids: egyhazkeruleti_admin). A `NOT (congregation_id IS NOT NULL)` tag SZÁNDÉKOS: fail-closed erősítés, ÉS immunizálja a policy-t a megyei fájlok burkoló DO-blokkjának idempotencia-szűrőjével szemben (8. csapda). App-tükör: apps/web/lib/auth/level-scope.ts.');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_district_olvaso_select', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      r.tabla || '_district_olvaso_select', r.tabla, v_olv);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
      r.tabla || '_district_olvaso_select', r.tabla,
      '2026-08-17 (egyházkerületi szint, S5a): a KERÜLETI sorok OLVASÁSA az olvasói hatókörnek (írók + egyhazkeruleti_szamvevo). Csak SELECT — írási úton egyetlen policy sem hívja az olvasó feloldót, hogy az ellenőr ne írhassa, amit ellenőriz.');

    RAISE NOTICE '✅ % — kerületi láb (FOR ALL + olvasó FOR SELECT).', r.tabla;
  END LOOP;
END
$district_lab$;

-- ── iktato_csatolmany: a MEGYEI ág betűhű tükre ────────────────────────────
-- SZÁNDÉKOSAN három külön láb, és SZÁNDÉKOSAN NINCS UPDATE — pontosan úgy,
-- ahogy a gyülekezeti és a megyei ágon: csatolmány-sor nem módosítható, csak
-- felvehető és törölhető. (Ezért nem `_district_all` a neve: egy FOR ALL láb
-- UPDATE-jogot is adna, ami ELTÉRNE a másik két szint viselkedésétől.)

DROP POLICY IF EXISTS iktato_csatolmany_district_select ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_district_select
  ON public.iktato_csatolmany FOR SELECT TO authenticated
  USING (
    iktato_csatolmany.district_id IS NOT NULL
    AND NOT (iktato_csatolmany.congregation_id IS NOT NULL)
    AND (public.current_user_has_global_access()
         OR iktato_csatolmany.district_id = ANY (COALESCE((SELECT public.current_user_district_olvaso_ids()), '{}'::uuid[])))
  );

DROP POLICY IF EXISTS iktato_csatolmany_district_insert ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_district_insert
  ON public.iktato_csatolmany FOR INSERT TO authenticated
  WITH CHECK (
    iktato_csatolmany.district_id IS NOT NULL
    AND NOT (iktato_csatolmany.congregation_id IS NOT NULL)
    AND (public.current_user_has_global_access()
         OR iktato_csatolmany.district_id = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])))
  );

DROP POLICY IF EXISTS iktato_csatolmany_district_delete ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_district_delete
  ON public.iktato_csatolmany FOR DELETE TO authenticated
  USING (
    iktato_csatolmany.district_id IS NOT NULL
    AND NOT (iktato_csatolmany.congregation_id IS NOT NULL)
    AND (public.current_user_has_global_access()
         OR iktato_csatolmany.district_id = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])))
  );

-- ── iktato_sequence_pointers: CSAK olvasó láb ──────────────────────────────
-- Az ÍRÁS kizárólag a SECURITY DEFINER RPC-n megy (1/E) — a megyei ág mintája.
-- Az előnézet (GREATEST(pointer, MAX)) viszont a kerületi felületen is olvassa
-- a pointert, ezért kell a SELECT-láb.

DROP POLICY IF EXISTS iktato_seq_pointers_district_select ON public.iktato_sequence_pointers;
CREATE POLICY iktato_seq_pointers_district_select
  ON public.iktato_sequence_pointers FOR SELECT TO authenticated
  USING (
    iktato_sequence_pointers.district_id IS NOT NULL
    AND NOT (iktato_sequence_pointers.congregation_id IS NOT NULL)
    AND (public.current_user_has_global_access()
         OR iktato_sequence_pointers.district_id = ANY (COALESCE((SELECT public.current_user_district_olvaso_ids()), '{}'::uuid[])))
  );

-- FAIL-CLOSED UTÓ-ELLENŐRZÉS még a COMMIT ELŐTT: ha az immunizáló szöveg
-- valamiért nem maradt meg a katalógusban (más Postgres-deparse), akkor a
-- 8. csapda elleni (1) védelem NEM áll — inkább HANGOSAN bukjunk el, mint hogy
-- egy későbbi újrafuttatás némán kiüresítse a kerületi felületet.
DO $immunitas$
DECLARE
  v_hiany text;
BEGIN
  SELECT string_agg(p.tablename || '/' || p.policyname, ', ') INTO v_hiany
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                        'iktato_yearly_closures','iktato_csatolmany',
                        'iktato_sequence_pointers')
    AND p.policyname LIKE '%district%'
    AND position('congregation_id IS NOT NULL'
                 in COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'')) = 0;
  IF v_hiany IS NOT NULL THEN
    RAISE EXCEPTION '⛔ 8. CSAPDA VÉDELEM HIÁNYZIK: ezekben a kerületi policy-kban nem maradt meg az immunizáló `congregation_id IS NOT NULL` részlet: %. Egy későbbi megyei-fájl-újrafuttatás beburkolná őket, és MINDEN kerületi sor némán eltűnne. Ne COMMIT-old — jelezd, és a policy-kifejezéseket kell átalakítani.', v_hiany;
  END IF;
  RAISE NOTICE '✅ 8. csapda: mind a 12 kerületi láb immunizálva.';
END
$immunitas$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/G) ⛔ 13. CSAPDA — a napi Kuka-takarítás szűkítése
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️⚠️ 2026-08-19 — EZ A SZAKASZ KORÁBBAN KÉT HIBÁT HORDOZOTT. Mindkettő itt
--       van dokumentálva, hogy egy későbbi „egyszerűsítés" ne hozza vissza őket.
--
-- (1) A KORÁBBI ALAK AZ EGÉSZ S5a-t VISSZAGÖRGETTE VOLNA.
--     `CREATE OR REPLACE`-szel írta újra a függvényt KÉT kimeneti oszloppal
--     (tbl, deleted_count), miközben az ÉLŐ függvény a 2026-08-14-es, HÁROM
--     oszlopos változat (tbl, deleted_count, skipped_count). A PostgreSQL a
--     visszatérési TÍPUS megváltoztatását CREATE OR REPLACE-szel NEM engedi:
--         ERROR: 42P13 cannot change return type of existing function
--     Mivel az 1. szakasz EGYETLEN tranzakció (BEGIN … COMMIT), ez az EGÉSZ
--     migrációt visszagörgette volna: nincs district_id, nincs háromoszlopos
--     CHECK, nincs kerületi index, nincs next_iktato_sequence_dis, nincs a 12
--     kerületi policy. ⇒ ELŐBB DROP FUNCTION, UGYANABBAN a tranzakcióban.
--
-- (2) A MÁSIK, ALATTOMOSABB HIBA: A TÖRZS ELAVULT FORRÁSBÓL JÖTT.
--     A korábbi alak törzse a 2026-04-15-ös változat másolata volt. Ha valaki
--     naivan CSAK a DROP-ot szúrja be, a tranzakció LEFUT — és NÉGY dolog esik
--     ki NÉMÁN, a ~500 GYÜLEKEZETET érintve:
--       (a) a takarított táblák listája 12-ről 7-re szűkül: a `befizetes`,
--           `kiadas`, `belsomozgas`, `munkanaplo` és `leltar_tetelek` SOHA
--           TÖBBÉ nem ürül automatikusan — a felületen ígért „30 nap után
--           véglegesen törlődik" rájuk HAZUGSÁG lenne;
--       (b) a törlés-feltétel visszaesik `deleted_at`-ról `updated_at`-re,
--           tehát elveszik a `deleted_at IS NOT NULL` FAIL-CLOSED őr
--           (bélyegzetlen sort SOHA nem törlünk);
--       (c) elveszik a soronkénti tartalék-ág: egyetlen FK-védett sor újra
--           túszul ejtené az egész tábla takarítását — némán, minden nap;
--       (d) elveszik a `skipped_count` kimenet.
--     Pontosan azok a hibák, amiket a 2026-08-14-es kör javított.
--     ⇒ A TÖRZS FORRÁSA EZÉRT BETŰHŰEN:
--          migration-docs/sql/2026-08-14-kuka-deleted-at.sql:175-245
--       (12 tábla, gyerek-először sorrend, deleted_at-alapú feltétel,
--        soronkénti tartalék-ág, HÁROM kimeneti oszlop, SECURITY DEFINER,
--        SET search_path = public, pg_catalog).
--
-- AZ EGYETLEN ÉRDEMI ELTÉRÉS A 2026-08-14-ES TÖRZSTŐL:
--     `AND congregation_id IS NOT NULL` — a tömeges DELETE-en ÉS a tartalék-ág
--     listázásán is (ha csak az egyikre tennénk rá, a tartalék-ág megkerülné!).
-- ⚠️ MIÉRT KELL EGYÁLTALÁN: a takarítás ma NINCS scope-ra szűkítve, pedig a
--     listáján ott az `iktato` és az `iktato_sablonok` — vagyis a MEGYEI
--     sorokat MA IS hard-deleteli (napi 03:15 UTC), a kerületieket pedig
--     ezután tenné, holott EGYIK szintnek SINCS Kuka-felülete, ahonnan a 30 nap
--     alatt visszaállíthatná. Néma, visszavonhatatlan adatvesztés. Ez a szűrés
--     tehát a MEGYEI szintet is MEGVÉDI, nem csak a kerületit.
-- ⚠️ A GYÜLEKEZETI VISELKEDÉS BYTE-RA VÁLTOZATLAN: a gyülekezeti sor
--     congregation_id-je definíció szerint nem NULL, tehát ugyanaz a halmaz
--     törlődik, mint eddig.
--
-- ⚠️ EGY BUKTATÓ, AMIT KEZELNI KELL: a lista minden táblájának nem feltétlenül
--     VAN congregation_id oszlopa. Ha vakon hozzáfűznénk a feltételt, az
--     EXECUTE hibára futna — és a tartalék-ág is —, vagyis a tábla a -1-es
--     hiba-ágra kerülne, és soha többé nem takarítódna. Ezért a szűrőt
--     OSZLOP-LÉTEZÉS szerint (information_schema.columns) állítjuk össze,
--     táblánként, MÉG a hiba-elnyelő BEGIN … EXCEPTION blokk ELŐTT — hogy egy
--     itteni hiba HANGOSAN bukjon el, ne szűretlen DELETE-be forduljon.
--
-- ⚠️ A DROP a JOGOKAT IS ELVISZI → az alábbi REVOKE/GRANT sorok KÖTELEZŐEK
--     (betűhűen azok, amik a 2026-08-14-es fájlban vannak: PUBLIC/anon/
--     authenticated REVOKE, EXECUTE csak a service_role-nak).
-- ⚠️ A pg_cron ütemezést ez NEM érinti: a `kartoteka_recycle_bin_cleanup` job
--     szövegesen hívja (`SELECT public.purge_recycle_bin();`), nem OID szerint.

-- A visszatérési oszlopok NEM egyeznek a régi (2026-04-15) alakkal → DROP kell.
-- Ugyanabban a tranzakcióban, tehát nincs olyan pillanat, amikor a függvény
-- kívülről hiányoznék. (Az 1. szakasz őrszeme (i) pontja már igazolta, hogy az
-- élő alak a 2026-08-14-es, HÁROM oszlopos változat.)
DROP FUNCTION IF EXISTS public.purge_recycle_bin();

CREATE FUNCTION public.purge_recycle_bin()
RETURNS table(tbl text, deleted_count bigint, skipped_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $purge$
DECLARE
  -- FORRÁS: 2026-08-14-kuka-deleted-at.sql:182-199 — betűhűen.
  terv text[][] := ARRAY[
    ARRAY['berleti_szerzodes', 'deleted'],
    ARRAY['iktato',            'deleted'],
    ARRAY['iktato_sablonok',   'deleted'],
    -- sírhely-blokk gyerek-először (FK: sirhelyelhunyt.sirhelyid → sirhely,
    -- sirhelyberles.sirhelyid → sirhely, sirhely.temetoid → sirhelytemeto)
    ARRAY['sirhelyelhunyt',    'deleted'],
    ARRAY['sirhelyberles',     'deleted'],
    ARRAY['sirhely',           'deleted'],
    ARRAY['sirhelytemeto',     'deleted'],
    -- a befizetes a sirhelyberles UTÁN (FK: sirhelyberles.befizetesid → befizetes)
    ARRAY['befizetes',         'deleted'],
    ARRAY['kiadas',            'deleted'],
    ARRAY['belsomozgas',       'deleted'],
    ARRAY['munkanaplo',        'deleted'],
    -- ⚠️ a leltar_tetelek jelzője `is_deleted`, NEM `deleted`
    ARRAY['leltar_tetelek',    'is_deleted']
    -- Ha új soft-delete tábla jön: ide ÉS a 2026-08-14-kuka-deleted-at.sql
    -- 2) szakaszának tervébe (deleted_at oszlop + bélyegző trigger) is fel kell venni!
  ];
  sor      text[];
  v_tabla  text;
  v_jelzo  text;
  v_id     record;
  v_szuro  text;   -- 2026-08-17 (S5a, 13. csapda): a scope-szűrő, táblánként
BEGIN
  FOREACH sor SLICE 1 IN ARRAY terv LOOP
    v_tabla := sor[1]; v_jelzo := sor[2];
    tbl := v_tabla; deleted_count := 0; skipped_count := 0;

    -- 2026-08-17 (egyházkerületi S5a, 13. csapda): CSAK a GYÜLEKEZETI sorokat
    -- takarítjuk. A megyei (diocese_id) és a kerületi (district_id) sorokhoz
    -- nincs Kuka-felület, tehát a 30 napos ablak alatt SENKI nem tudná
    -- visszaállítani őket — a hard-delete ott végleges adatvesztés volna.
    -- A szűrőt OSZLOP-LÉTEZÉS szerint állítjuk össze: ahol nincs
    -- congregation_id, ott a mai (szűretlen) viselkedés marad — különben az
    -- EXECUTE hibára futna, és a tábla NÉMÁN a -1-es hiba-ágra kerülne.
    -- ⚠️ SZÁNDÉKOSAN a hiba-elnyelő BEGIN … EXCEPTION blokk ELŐTT áll: ha ez a
    --    lekérdezés bukik, HANGOSAN bukjon, ne szűretlen DELETE-be forduljon.
    SELECT CASE WHEN EXISTS (
             SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name::text = v_tabla
               AND c.column_name = 'congregation_id')
           THEN ' AND congregation_id IS NOT NULL'
           ELSE '' END
      INTO v_szuro;
    -- Fail-closed: a format() a NULL-t ÜRES sztringre cserélné, vagyis egy
    -- NULL szűrő NÉMÁN szűretlen törlést jelentene. Ilyen nem fordulhat elő
    -- (a CASE mindig ad értéket), de ha mégis, inkább álljunk meg.
    IF v_szuro IS NULL THEN
      RAISE EXCEPTION 'purge_recycle_bin: a(z) % scope-szűrője NULL lett — fail-closed leállás (szűretlen törlés helyett).', v_tabla;
    END IF;

    BEGIN
      -- Gyors út: egyetlen tömeges DELETE.
      EXECUTE format(
        'DELETE FROM public.%I WHERE %I = true AND deleted_at IS NOT NULL AND deleted_at < now() - interval ''30 days''%s',
        v_tabla, v_jelzo, v_szuro);
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      -- Tartalék út: SORONKÉNT — ami törölhető, törlődjön; a védett sor
      -- kimarad és számoljuk. Egy beragadt sor így NEM tartja túszul a
      -- tábla többi 30+ napos sorát.
      -- ⚠️ A scope-szűrő ITT IS rajta van — enélkül a tartalék-ág megkerülné,
      --    és pont a hibás úton törölné a megyei/kerületi sorokat.
      BEGIN
        deleted_count := 0;
        FOR v_id IN EXECUTE format(
          'SELECT id FROM public.%I WHERE %I = true AND deleted_at IS NOT NULL AND deleted_at < now() - interval ''30 days''%s',
          v_tabla, v_jelzo, v_szuro)
        LOOP
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_tabla) USING v_id.id;
            deleted_count := deleted_count + 1;
          EXCEPTION WHEN OTHERS THEN
            skipped_count := skipped_count + 1;
          END;
        END LOOP;
        IF skipped_count > 0 THEN
          RAISE WARNING 'purge_recycle_bin: a(z) % táblában % sor törlését hivatkozás védi — kimaradtak.', v_tabla, skipped_count;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Ha maga a listázás bukik (pl. hiányzó deleted_at oszlop), a tábla
        -- -1-gyel jelenik meg — de a TÖBBI tábla takarítása megy tovább.
        RAISE WARNING 'purge_recycle_bin: a(z) % tábla takarítása sikertelen: %', v_tabla, SQLERRM;
        deleted_count := -1;
      END;
    END;
    -- MINDEN tábla megjelenik az eredményben (hibánál deleted_count = -1).
    RETURN NEXT;
  END LOOP;
END;
$purge$;

COMMENT ON FUNCTION public.purge_recycle_bin() IS
  '2026-08-19 (egyházkerületi S5a, 13. csapda). A TÖRZS FORRÁSA a '
  '2026-08-14-kuka-deleted-at.sql HÁROM oszlopos változata, betűhűen: mind a 12 '
  'soft-delete tábla, gyerek-először sorrend, deleted_at-alapú FAIL-CLOSED feltétel '
  '(bélyegzetlen sort sosem töröl), soronkénti tartalék-ág az FK-védett sorokra '
  '(skipped_count), hibás tábla deleted_count = -1. AZ EGYETLEN ÉRDEMI ELTÉRÉS: a '
  'törlés KIZÁRÓLAG a gyülekezeti sorokra fut (AND congregation_id IS NOT NULL, a '
  'tömeges DELETE-en ÉS a tartalék-ág listázásán is) — a megyei (diocese_id) és a '
  'kerületi (district_id) sorokhoz nincs Kuka-felület, ott a hard-delete '
  'visszavonhatatlan adatvesztés lenne. A szűrő oszlop-létezés szerint áll össze, '
  'hogy a congregation_id nélküli táblák ne a hiba-ágra kerüljenek. '
  'Naponta fut pg_cron-nal (03:15 UTC).';

-- ⚠️ A DROP FUNCTION a JOGOKAT IS ELVITTE — ezek a sorok KÖTELEZŐEK, nem
-- óvatosságból vannak. Betűhűen azok a jogok, amiket a 2026-08-14-es fájl adott:
-- a takarítást KIZÁRÓLAG a service_role / pg_cron futtathatja.
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM anon;
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recycle_bin() TO service_role;

-- FAIL-CLOSED UTÓ-ELLENŐRZÉS még a COMMIT ELŐTT. Ez a szakasz kétszer sült el
-- (rossz szignatúra, elavult törzs) — most a tranzakció maga őrzi, hogy a
-- létrejött függvény tényleg a 12 táblás, deleted_at-alapú, scope-szűrt alak,
-- és hogy a DROP után visszakerültek a jogok.
DO $kuka_utoellenorzes$
DECLARE
  v_sig  text;
  v_src  text;
  v_hiba text := '';
BEGIN
  v_sig := pg_get_function_result(to_regprocedure('public.purge_recycle_bin()'));
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'purge_recycle_bin';

  IF lower(regexp_replace(COALESCE(v_sig, ''), '\s+', ' ', 'g'))
     <> 'table(tbl text, deleted_count bigint, skipped_count bigint)' THEN
    v_hiba := v_hiba || ' · a visszatérési oszlopok nem a HÁROM oszlopos alak (élő: ' || COALESCE(v_sig, 'nincs függvény') || ')';
  END IF;
  IF COALESCE(v_src, '') NOT LIKE '%leltar_tetelek%'
     OR COALESCE(v_src, '') NOT LIKE '%befizetes%'
     OR COALESCE(v_src, '') NOT LIKE '%munkanaplo%' THEN
    v_hiba := v_hiba || ' · a törzsből hiányoznak a 2026-08-14-ben hozzáadott táblák (a Kuka NÉMÁN nem ürülne rájuk)';
  END IF;
  IF COALESCE(v_src, '') NOT LIKE '%deleted_at IS NOT NULL%' THEN
    v_hiba := v_hiba || ' · a törzs nem deleted_at-alapú (elveszett a fail-closed őr)';
  END IF;
  IF COALESCE(v_src, '') NOT LIKE '%congregation_id IS NOT NULL%' THEN
    v_hiba := v_hiba || ' · hiányzik a scope-szűrő (a megyei és a kerületi sorok hard-delete-elődnének)';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.purge_recycle_bin()'::regprocedure, 'EXECUTE') THEN
    v_hiba := v_hiba || ' · a service_role EXECUTE joga NEM állt vissza a DROP után (a napi cron elnémulna)';
  END IF;
  IF has_function_privilege('authenticated', 'public.purge_recycle_bin()'::regprocedure, 'EXECUTE') THEN
    v_hiba := v_hiba || ' · az authenticated IS hívhatja (a REVOKE nem fogott)';
  END IF;

  IF v_hiba <> '' THEN
    RAISE EXCEPTION '⛔ 1/G UTÓ-ELLENŐRZÉS BUKOTT:%. Ne COMMIT-old — a purge_recycle_bin() törzse a 2026-08-14-kuka-deleted-at.sql:175-245 alakja kell legyen, a DELETE-eken (a tartalék-ágén is) `AND congregation_id IS NOT NULL` szűrővel.', v_hiba;
  END IF;
  RAISE NOTICE '✅ 1/G: purge_recycle_bin() — 12 tábla, deleted_at, skipped_count, gyülekezeti szűrő, jogok rendben.';
END
$kuka_utoellenorzes$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/H) MENTÉS — a kerületi sorok útja (a besorolás NEM változik)
-- ────────────────────────────────────────────────────────────────────────────
-- ÚJ TÁBLA NEM JÖTT LÉTRE, tehát a backup_table_policy `hatokor` / `reteg` /
-- `visszaallithato` MEZŐI VÁLTOZATLANOK — a napi mentés besorolás-ellenőrzése
-- (assertInventoryClassified) nem tud elsülni.
-- A megyei S4 fájl beállította a `globalis_predikatum = 't.congregation_id IS NULL'`
-- szűrőt: ez a KERÜLETI sorokra IS illeszkedik (kerületi sornál a
-- congregation_id NULL), tehát a kerületi sorok automatikusan a GLOBÁLIS
-- mentés-fájlba kerülnek. Itt csak idempotensen pótoljuk, ha valamelyik táblán
-- üresen maradt volna, és rávezetjük a megjegyzésre, hogy mostantól KERÜLETI
-- sor is lehet a táblában.

UPDATE public.backup_table_policy
SET globalis_predikatum = 't.congregation_id IS NULL'
WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures',
                'iktato_csatolmany','iktato_sequence_pointers')
  AND hatokor = 'gyulekezet'
  AND COALESCE(btrim(globalis_predikatum), '') = '';

UPDATE public.backup_table_policy
SET megjegyzes = COALESCE(megjegyzes || ' | ', '')
  || '✅ 2026-08-17 S5a: a táblában KERÜLETI sorok is lehetnek (district_id IS NOT NULL, congregation_id IS NULL). Ezek — a megyei sorokkal együtt — a globalis_predikatum (t.congregation_id IS NULL) révén a GLOBÁLIS mentés-fájlba kerülnek. Új tábla nem jött létre, a besorolás nem változott.'
WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures',
                'iktato_csatolmany','iktato_sequence_pointers')
  AND COALESCE(megjegyzes, '') NOT LIKE '%2026-08-17 S5a%';

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2 · OSZLOPOK' AS szakasz,
       'Mind a 6 táblán van district_id (uuid)? (6 = rendben)' AS mit,
       (SELECT count(*)::text || ' / 6' FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name IN ('leltar_tetelek','iktato','iktato_sablonok',
                               'iktato_yearly_closures','iktato_csatolmany',
                               'iktato_sequence_pointers')
          AND c.column_name = 'district_id' AND c.data_type = 'uuid') AS ertek,
       'Ha nem 6: az 1/A szakasz nem futott végig.' AS teendo

UNION ALL
SELECT 101, '2 · FK-K',
       'Mind a 6 táblán él a *_district_id_fkey? (6 = rendben)',
       (SELECT count(*)::text || ' / 6' FROM pg_constraint
        WHERE conname IN ('leltar_tetelek_district_id_fkey','iktato_district_id_fkey',
                          'iktato_sablonok_district_id_fkey','iktato_yearly_closures_district_id_fkey',
                          'iktato_csatolmany_district_id_fkey','iktato_sequence_pointers_district_id_fkey')),
       'A district_id → districts(id) hivatkozás.'

UNION ALL
SELECT 102, '2 · SCOPE-ŐR CHECK ⛔',
       'Mind a 6 *_pontosan_egy_scope MÁR HÁROMOSZLOPOS? (6 = rendben)',
       (SELECT count(*)::text || ' / 6' FROM pg_constraint con
        WHERE con.contype = 'c'
          AND con.conname IN ('leltar_tetelek_pontosan_egy_scope','iktato_pontosan_egy_scope',
                              'iktato_sablonok_pontosan_egy_scope','iktato_yearly_closures_pontosan_egy_scope',
                              'iktato_csatolmany_pontosan_egy_scope','iktato_sequence_pointers_pontosan_egy_scope')
          AND pg_get_constraintdef(con.oid) LIKE '%district_id%'),
       '⛔ Ha nem 6: az első kerületi tétel 23514-gyel elhasalna. Az idempotencia-őr a definícióra néz — nézd meg az 1/B NOTICE-ait.'

UNION ALL
SELECT 103, '2 · EGYEDISÉGI INDEX ⛔',
       'Létrejött mind a 4 KERÜLETI egyediségi index? (4 = rendben)',
       (SELECT count(*)::text || ' / 4' FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN ('leltar_tetelek_dis_leltari_szam_key','iktato_unique_active_dis_year_seq',
                            'iktato_seq_pointers_dis_year_uidx','iktato_yearly_closures_dis_year_uidx')),
       '⛔ Ha nem 4: két kerületi irat KAPHATNÁ ugyanazt az iktatószámot egy hivatalos okiraton (5. csapda).'

UNION ALL
SELECT 104, '2 · REGRESSZIÓ — RÉGI INDEXEK',
       'MEGVAN-e mind a 8 gyülekezeti + megyei egyediségi index? (8 = változatlan)',
       (SELECT count(*)::text || ' / 8' FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN ('leltar_tetelek_cong_leltari_szam_key','leltar_tetelek_dio_leltari_szam_key',
                            'iktato_unique_active_cong_year_seq','iktato_unique_active_dio_year_seq',
                            'iktato_seq_pointers_cong_year_uidx','iktato_seq_pointers_dio_year_uidx',
                            'iktato_yearly_closures_cong_year_uidx','iktato_yearly_closures_dio_year_uidx')),
       '⛔ Ha nem 8: ez a fájl elvett valamit a régi viselkedésből — NEM szabadna. Azonnal jelezd.'

UNION ALL
SELECT 105, '2 · CSATOLMÁNY-FK ⛔',
       'iktato_id_district_uk + iktato_csatolmany_iktato_dis_fkey (3. blokkoló csapda)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conname='iktato_id_district_uk' AND conrelid='public.iktato'::regclass)
            THEN '✅ UNIQUE (id, district_id)' ELSE '⛔ nincs UNIQUE' END
       || CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                            WHERE conname='iktato_csatolmany_iktato_dis_fkey'
                              AND conrelid='public.iktato_csatolmany'::regclass)
               THEN ' · ✅ kompozit FK' ELSE ' · ⛔ nincs kompozit FK' END,
       '⛔ Enélkül a kerületi csatolmány MATCH SIMPLE mellett IDEGEN vagy nem létező iktató-sorra mutathatna.'

UNION ALL
SELECT 106, '2 · SORSZÁM-RPC ⛔',
       'next_iktato_sequence_dis + EXECUTE-grant, ÉS a másik két RPC érintetlen',
       CASE WHEN to_regprocedure('public.next_iktato_sequence_dis(uuid, integer)') IS NOT NULL
            THEN '✅ dis' ELSE '⛔ nincs dis' END
       || CASE WHEN to_regprocedure('public.next_iktato_sequence_dis(uuid, integer)') IS NOT NULL
                AND has_function_privilege('authenticated', 'public.next_iktato_sequence_dis(uuid, integer)'::regprocedure, 'EXECUTE')
               THEN ' · ✅ grant' ELSE ' · ⛔ nincs grant' END
       || CASE WHEN to_regprocedure('public.next_iktato_sequence(uuid, integer)') IS NOT NULL
               THEN ' · ✅ cong megvan' ELSE ' · ⛔ ELTŰNT a cong!' END
       || CASE WHEN to_regprocedure('public.next_iktato_sequence_dio(uuid, integer)') IS NOT NULL
               THEN ' · ✅ dio megvan' ELSE ' · ⛔ ELTŰNT a dio!' END,
       '⛔ Grant nélkül a kerületi iktatás 42501-gyel bukna; a cong/dio eltűnése regresszió volna.'

UNION ALL
SELECT 107, '2 · KERÜLETI RLS-LÁBAK',
       'Létrejött mind a 12 kerületi policy a 6 táblán? (12 = rendben)',
       (SELECT count(*)::text || ' / 12' FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                            'iktato_yearly_closures','iktato_csatolmany',
                            'iktato_sequence_pointers')
          AND policyname LIKE '%district%'),
       'Várt: 4×(_district_all + _district_olvaso_select) + csatolmány 3 (select/insert/delete) + pointer 1 (select).'

UNION ALL
SELECT 108, '2 · ⛔ 8. CSAPDA — BURKOLÁS',
       'Van-e BEBURKOLT kerületi policy? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                              'iktato_yearly_closures','iktato_csatolmany',
                              'iktato_sequence_pointers')
          AND p.policyname LIKE '%district%'
          -- ⚠️ 2026-08-18: deparse-hű minta (lásd az 1/F diagnózis-blokk megjegyzését).
          AND position('congregation_id IS NOT NULL) AND ('
                       in COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'')) > 0),
       '⛔ Ha nem 0: MINDEN kerületi sor némán eltűnik a felületről. Futtasd újra ezt a fájlt (a DROP+CREATE a javítás), és nézd meg, melyik fájl burkolta be.'

UNION ALL
SELECT 109, '2 · ⛔ 8. CSAPDA — IMMUNITÁS',
       'Mind a 12 kerületi lábban megmaradt az immunizáló szöveg? (12 = rendben)',
       (SELECT count(*)::text || ' / 12' FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                              'iktato_yearly_closures','iktato_csatolmany',
                              'iktato_sequence_pointers')
          AND p.policyname LIKE '%district%'
          AND position('congregation_id IS NOT NULL'
                       in COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'')) > 0),
       'Ez az, amitől a KORÁBBI megyei fájlok burkoló DO-blokkja ÁTUGORJA a kerületi lábakat. Ha nem 12: a védelem nem áll, a megyei fájlokat NEM szabad újrafuttatni, amíg nem rendeztük.'

UNION ALL
SELECT 110, '2 · REGRESSZIÓ — RÉGI POLICY-K',
       'Változott-e a gyülekezeti/megyei lábak SZÁMA a 6 táblán? (tájékoztató szám)',
       (SELECT count(*)::text || ' db (nem-kerületi policy)' FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                            'iktato_yearly_closures','iktato_csatolmany',
                            'iktato_sequence_pointers')
          AND policyname NOT LIKE '%district%'),
       'Ez a fájl EGYETLEN meglévő policy-hez sem nyúlt. Vesd össze a 0/H sorainak számával — pontosan ugyanannyinak kell lennie.'

UNION ALL
SELECT 111, '2 · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI (nem SELECT) kerületi policy olvasó-feloldót? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.cmd <> 'SELECT'
          AND pol.tablename IN ('leltar_tetelek','iktato','iktato_sablonok',
                                'iktato_yearly_closures','iktato_csatolmany',
                                'iktato_sequence_pointers')
          AND pol.policyname LIKE '%district%'
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
              LIKE '%current_user_district_olvaso_ids%'),
       '⛔ Ha nem 0: a kerületi SZÁMVEVŐ írhatná, amit ellenőriz. (A FOR ALL lábak cmd-je ALL, nem SELECT — azok az ÍRÓ feloldót hívják, ez helyes.)'

UNION ALL
SELECT 112, '2 · KUKA ⛔',
       'A purge_recycle_bin() DELETE-je szűkítve van congregation_id-re?',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%congregation_id IS NOT NULL%'
                             THEN '✅ igen' ELSE '⛔ NEM — az 1/G nem futott le' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='purge_recycle_bin' LIMIT 1),
                '— nincs függvény')
       || CASE WHEN to_regprocedure('public.purge_recycle_bin()') IS NULL THEN ''
               ELSE CASE WHEN has_function_privilege('service_role', 'public.purge_recycle_bin()'::regprocedure, 'EXECUTE')
                         THEN ' · ✅ service' ELSE ' · ⛔ service-grant elveszett' END
                    || CASE WHEN has_function_privilege('authenticated', 'public.purge_recycle_bin()'::regprocedure, 'EXECUTE')
                            THEN ' · ⛔ authenticated IS hívhatja' ELSE ' · ✅ authenticated nem' END
          END,
       'Ez a megyei sorokat is MEGVÉDI — ma azok is törlődtek volna. A jogokat azért mérjük vissza, mert az 1/G DROP FUNCTION-nel dolgozik, és a DROP a GRANT-okat is elviszi.'

UNION ALL
SELECT 116, '2 · KUKA TÖRZS ⛔',
       'A purge_recycle_bin() a 2026-08-14-es, HÁROM oszlopos, 12 táblás alak maradt?',
       COALESCE(
         (SELECT CASE WHEN lower(regexp_replace(
                              COALESCE(pg_get_function_result(to_regprocedure('public.purge_recycle_bin()')), ''),
                              '\s+', ' ', 'g'))
                           = 'table(tbl text, deleted_count bigint, skipped_count bigint)'
                       AND p.prosrc LIKE '%leltar_tetelek%'
                       AND p.prosrc LIKE '%befizetes%'
                       AND p.prosrc LIKE '%munkanaplo%'
                       AND p.prosrc LIKE '%deleted_at IS NOT NULL%'
                      THEN '✅ 3 oszlop · 12 tábla · deleted_at'
                      ELSE '⛔ VISSZAESETT a régi (7 táblás / updated_at-alapú) alakra' END
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'purge_recycle_bin' LIMIT 1),
         '— nincs függvény'),
       'Ha ⛔: a befizetes/kiadas/belsomozgas/munkanaplo/leltar_tetelek Kukája SOHA nem ürülne, és elveszne a deleted_at-alapú fail-closed őr + a soronkénti tartalék-ág. Ilyenkor a 2026-08-14-kuka-deleted-at.sql, majd EZ a fájl fusson újra — ebben a sorrendben.'

UNION ALL
SELECT 113, '2 · MENTÉS-ÚT',
       'Mind a 6 táblán ki van töltve a globalis_predikatum? (6 = rendben)',
       (SELECT count(*)::text || ' / 6' FROM public.backup_table_policy
        WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures',
                        'iktato_csatolmany','iktato_sequence_pointers')
          AND COALESCE(btrim(globalis_predikatum), '') <> ''),
       'A kerületi sorok (congregation_id IS NULL) ezen a szűrőn keresztül kerülnek a GLOBÁLIS mentés-fájlba. Új tábla nem jött létre → a besorolás (hatokor/reteg) nem változott.'

UNION ALL
SELECT 114, '2 · MENTÉS-SZŰRŐ PRÓBA',
       'backup_scope_where(leltar_tetelek, globális) — a nem-gyülekezeti sorok szűrője',
       COALESCE((SELECT public.backup_scope_where('leltar_tetelek', true)), 'HIBA'),
       'Várt: ($1 IS NULL) AND (t.congregation_id IS NULL) — ez a MEGYEI és a KERÜLETI sorokat is befogja.'

UNION ALL
SELECT 115, '2 · KERÜLETEK',
       'Hány egyházkerület van a public.districts táblában?',
       (SELECT count(*)::text || ' kerület' FROM public.districts),
       'A 0. szakasz szándékosan NEM olvasott a táblából (hiányzó tábla ott PARSE-hibát okozott volna); itt már biztonságos, mert az 1. szakasz őrszeme igazolta a létét.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FIGYELMEZTETÉSEK A TÖBBI S5 SZELETNEK ÉS AZ S6/S7-NEK                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 1. ⛔ 12. CSAPDA — A NÉMA GYÜLEKEZETI VISSZAESÉS (TS). Ez a fájl a DB-oldalt
--    rendezte; az app-oldali `FinanceScope` / `ModuleScope` unióhoz a
--    'district' hozzáadása MAGÁTÓL NEM elég:
--      apps/web/lib/auth/finance-scope.ts:93  tablesFor(scope)   — if (scope === 'diocese') {…} majd RETURN a gyülekezeti térkép
--      apps/web/lib/auth/finance-scope.ts:131 yearValueFor       — return scope === 'diocese' ? year : String(year)
--      apps/web/lib/auth/module-scope.ts:42
--    A fordító NEM szól, és a kerületi könyvelés a GYÜLEKEZETI táblákba írna.
--    Kötelező EXHAUSTIVE alakra hozni:
--      switch (scope) { case …: return …; default: { const _n: never = scope; throw new Error(`Ismeretlen scope: ${String(_n)}`) } }
-- 2. STORAGE: az 'iktato-csatolmanyok' bucket KERÜLETI prefixű útjaihoz
--    ({district_id}/{iktato_id}/…) még NINCS policy — a megyei
--    iktato_csatolmanyok_dio_insert/_select/_delete (2026-08-15-…-s4.sql 1/C)
--    kerületi tükre KÜLÖN fájl dolga. Amíg nincs, a kerületi csatolmány-sor
--    felvehető, de a FÁJL feltöltése 403-mal bukik.
-- 3. PECSÉT / ALÁÍRÁS: a districts pecset_url / alairas_url oszlopai az S2-ben
--    születtek; a képek MA IS PUBLIKUS bucketben állnak MIND A HÁROM SZINTEN —
--    ez nyitott tétel (memória: egyhazkeruleti_szint_2026_08_16).
-- 4. KUKA-FELÜLET: az 1/G csak megvédte a kerületi (és megyei) sorokat a NAPI
--    hard-delete-től (03:15 UTC). KERÜLETI KUKA-FELÜLET továbbra sincs — a
--    soft-delete-elt kerületi sor most már megmarad, de a felületről nem
--    állítható vissza. Ez az S7 szelet dolga.
--    ⚠️ ÉS EGY ÚJ KOCKÁZAT, AMIT ISMERNI KELL: ha a
--    2026-08-14-kuka-deleted-at.sql-t BÁRMIKOR újrafuttatjuk, annak SAJÁT
--    `DROP FUNCTION` + `CREATE FUNCTION`-je felülírná ezt a függvényt. Ezért a
--    scope-szűrő 2026-08-19-én BELE IS KERÜLT abba a fájlba (datumozott
--    „UTÓLAGOS KIEGÉSZÍTÉS" megjegyzéssel) — a két fájl törzse így ma
--    AZONOS, bármelyik sorrendben futtatható. Ha valaki bármelyiken változtat,
--    a MÁSIKAT is javítania kell.
-- 5. VISSZAÁLLÍTÁS: a self-service visszaállítás KIZÁRÓLAG a
--    hatokor = 'gyulekezet' ÉS reteg IS NOT NULL ÉS visszaallithato sorokat
--    engedi. A kerületi sorok a GLOBÁLIS fájlban vannak → a visszatöltésük
--    runbook (kézi) marad, amíg Endre másképp nem dönt (S0 · 1201. sor).
-- 6. leltar_tetelek.felelos_szemely_id a szemely táblára mutat — kerületi
--    tételnél az RLS a gyülekezeti személyt elrejti; a kerületi felület a
--    felelos_neve szövegmezőt használja (a megyei ág mintája).
