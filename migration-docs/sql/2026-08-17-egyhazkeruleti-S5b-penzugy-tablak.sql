-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI S5/b — A KERÜLET SAJÁT PÉNZÜGYI TÁBLÁI         2026-08-17 ║
-- ║ Fájl: migration-docs/sql/2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql ║
-- ║ (docs/EGYHAZKERULETI-SZINT-INDITO-BRIEF-2026-08-15.md, S5 szelet — K2)   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- ENDRE K2 DÖNTÉSE, AMIT EZ A FÁJL MEGVALÓSÍT
-- ════════════════════════════════════════════════════════════════════════════
-- „Az egyházkerület VEZET saját könyvet (számadás, költségvetés) — ugyanúgy,
--  ahogy a megye."
--
-- A döntés KETTŐS mintát ír elő:
--   · a PÉNZÜGY KÜLÖN TÁBLÁKAT kap (ez a fájl)   → district_*  = a diocese_* tükre
--   · a LELTÁR és az IKTATÓ scope-OSZLOPOT kap    → NEM ez a fájl (S5/a)
--
-- MIÉRT KÜLÖN TÁBLA A PÉNZÜGYNEK, ÉS MIÉRT SCOPE-OSZLOP A LELTÁRNAK:
-- a pénzügyi táblák oszlopkészlete SZINTENKÉNT ELTÉR (a gyülekezetinek van
-- tag-szintű járuléka, `id_befizetescel`/`id_kiadascel` int-kulcsa és szöveges
-- év-PK-ja; a megyeinek/kerületinek `id_szamadasicel` szöveges kódja és `eve`
-- int-PK-ja), ezért egy közös tábla scope-oszloppal féltucat NULLABLE „csak az
-- egyik szinten értelmes" oszlopot szülne — pontosan az a nullable-pivot
-- hibaosztály, amit a 0.4 dokumentál. A leltárnál/iktatónál viszont az
-- oszlopkészlet AZONOS, ott a másolat-tábla lenne a hiba („a második felület a
-- régi implementációt őrzi" hibaosztály, 2026-08-04).
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT HOZ LÉTRE EZ A FÁJL — ÖT TÁBLA, A diocese_* PÁRJAIK BETŰHŰ TÜKREKÉNT
-- ════════════════════════════════════════════════════════════════════════════
--   district_bealitas        ⇄ diocese_bealitas         (éves konfig, `eve` int)
--   district_befizetes       ⇄ diocese_befizetes        (bevétel)
--   district_kiadas          ⇄ diocese_kiadas           (kiadás)
--   district_koltsegvetes    ⇄ diocese_koltsegvetes     (éves tervezés)
--   district_annual_reports  ⇄ diocese_annual_reports   (zárszámadás-pillanatkép)
--
-- A LEKÉPEZÉS SZABÁLYA: minden megyei oszlop átjön, `diocese_id` → `district_id`
-- cserével (FK → public.districts(id)). SEMMI MÁS nem változik: az év-oszlopok
-- (`eve`, `year`), a véglegesítés-zászlók (`szamadas_veglegesitve`,
-- `koltsegvetes_veglegesitve`) és a kategória-oszlop (`id_szamadasicel`) NEVE
-- BETŰRE azonos a megyeivel.
--
-- ⚠️ MIÉRT KÖTELEZŐ A BETŰHŰSÉG: az app-oldali tábla-térkép
--    (apps/web/lib/auth/finance-scope-core.ts, `tablesFor`) UGYANAZT a mező-
--    nevet írja a megyei és a kerületi ágon — csak a tábla neve más. Egyetlen
--    átkeresztelt oszlop 42703-mal („column … does not exist") buktatná az ELSŐ
--    kerületi könyvelést. A 2. SZAKASZ 131-es sora OSZLOPRÓL OSZLOPRA
--    visszaellenőrzi ezt a tükröt.
--
-- ⚠️ KÉT CSAPDA-OSZLOPNÉV, AMIT SZÁNDÉKOSAN NEM „JAVÍTUNK":
--   (a) a kiadás-tábla partner-oszlopa a MEGYEI/KERÜLETI ágon `kedvezmenyezett`
--       — miközben a GYÜLEKEZETI `kiadas` táblán `atvevo` a neve, és ott NINCS
--       `kedvezmenyezett` oszlop. Ez bevált hibaforrás (memória-jegyzet:
--       „kiadas: atvevo, NINCS kedvezmenyzett … diocese_kiadas MÁS"). A tükör a
--       MEGYEI nevet viszi tovább.
--   (b) `befizeto_congregation_id` / `kedvezmenyezett_congregation_id` a
--       kerületi táblán is GYÜLEKEZETRE mutat (nem megyére). Nem tévedés: a
--       közös beszúró-kód mindkét ágon EZT a kulcsot írja (ma `null` értékkel,
--       penzugy/actions.ts:913 és :965). Egy „logikusabb" `befizeto_diocese_id`
--       átnevezés 42703-at adna. A megye-mint-befizető esetét ma a kötelező,
--       szabad szöveges `forrasa` hordozza — pontosan úgy, ahogy a megyei
--       könyvben az állami támogatás. (Ha Endre később dropdown-t kér a megyék
--       listájából, az KÜLÖN, tudatos oszlop-bővítés lesz.)
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⛔ A 2. BLOKKOLÓ CSAPDA — A MENTÉS-BESOROLÁS (ezért van az 1/F szakasz)
-- ════════════════════════════════════════════════════════════════════════════
-- Ha egy ÉLŐ tábla nincs benne a `backup_table_policy`-ben, a napi mentés
-- MINDEN gyülekezetnél LEÁLL (apps/web/lib/backup/inventory.ts:163,
-- `assertInventoryClassified`, és a DB-oldalon a `backup_scope_where`
-- „BESOROLATLAN TÁBLA" kivétele). Ezért az öt új tábla besorolása UGYANABBAN a
-- tranzakcióban történik, amiben a táblák létrejönnek — nincs olyan pillanat,
-- amikor létező, de besorolatlan tábla áll az adatbázisban.
--   · a kulcsoszlop neve `tabla` (NEM `table_name` — ez már egyszer elbukott, #172);
--   · a `hatokor` CHECK-je nem ismer „egyhazkerulet" értéket, ezért — a megyei
--     diocese_* sorok mintájára — `globalis` hatókörbe megyünk;
--   · `reteg` = 2 (a districts/dioceses bérlő-váz R1 UTÁN), `visszaallithato` =
--     false (a gombbal indított GYÜLEKEZETI visszaállítás nem nyúlhat hozzá);
--   · `globalis_predikatum` = NULL — az az oszlop KIZÁRÓLAG a `gyulekezet`
--     hatókörű táblák felsőbb-szintű sorainak útja a globális fájlba
--     (backup_scope_where: csak `hatokor = 'gyulekezet'` ágon nézi). Egy eleve
--     `globalis` hatókörű táblánál értelmezhetetlen — a megyei diocese_* párok
--     is NULL-lal állnak. Ezért ez a fájl NEM is hivatkozik rá: így akkor is
--     lefut, ha a 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql (ami az oszlopot
--     hozzáadta) még nem futott le ezen az adatbázison.
--
-- ════════════════════════════════════════════════════════════════════════════
-- RLS — KÉT POLICY TÁBLÁNKÉNT, A MEGYEI KANONIKUS ALAK SZERINT
-- ════════════════════════════════════════════════════════════════════════════
--   (1) `<tabla>_all` — FOR ALL, ÍRÓ ág:
--         current_user_has_global_access()                    (rendszergazda)
--         OR district_id = ANY (COALESCE((SELECT current_user_district_ids()), '{}'))
--                                                             (egyhazkeruleti_admin)
--   (2) `<tabla>_szamvevo_select` — FOR SELECT, OLVASÓ ág:
--         district_id = ANY (COALESCE((SELECT current_user_district_olvaso_ids()), '{}'))
--                                     (egyhazkeruleti_admin + egyhazkeruleti_szamvevo)
--
-- A COALESCE-burok FAIL-CLOSED: hatókör nélküli hívónál üres tömb → egyetlen
-- sor sem illeszkedik. A `(SELECT …)` alak azért kell, hogy a tervező InitPlan-
-- ként EGYSZER értékelje ki a függvényt, ne soronként.
--
-- ⚠️ MIÉRT NINCS RESTRICTIVE ÍRÁS-TILTÓ, MINT A MEGYEINÉL: a megyei
--    `diocese_*_szamvevo_iras_tilos` policy-k azért születtek 2026-08-11-én,
--    mert a régi `diocese_*_all` policy-nak volt egy SZEREP-SZŰRŐ NÉLKÜLI
--    `pr.scope='diocese'` ága, amin bárki (custom „titkárnő", könyvelő) írt.
--    Ezek a táblák MÁR A SZÜLETÉSÜKKOR kanonikusak: az írási ág KIZÁRÓLAG a
--    szerep-szűrt `current_user_district_ids()`-t hívja, tehát a számvevőnek
--    nincs miből írnia. A 2. SZAKASZ 104-es és 105-ös sora ezt bizonyítja.
--
-- ⚠️ MIÉRT NEM LÁT IDE A MEGYE ÉS A GYÜLEKEZET: egyetlen policy-ág sem hivatkozik
--    `current_user_diocese_*` vagy `felettes_szint_*` függvényre. A kerület
--    könyve a kerületé — ahogy a K4 döntés szellemében a megye könyve a megyéé.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ AMI BYTE-RA VÁLTOZATLAN MARAD (a szelet legfontosabb korlátja)
-- ════════════════════════════════════════════════════════════════════════════
-- Ez a fájl KIZÁRÓLAG ÚJ objektumokat hoz létre. NEM módosít egyetlen meglévő
-- táblát, oszlopot, policy-t, függvényt vagy CHECK-et sem — sem gyülekezetit,
-- sem megyeit. A `backup_table_policy` ötsoros bővítése az egyetlen írás
-- meglévő táblába, és az is CSAK az öt új tábla saját sorát érinti.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ELŐFELTÉTELEK (az 1. SZAKASZ őrszeme fail-closed leáll, ha nincsenek meg)
-- ════════════════════════════════════════════════════════════════════════════
--   · public.districts, public.dioceses, public.congregations, public.szamadasicel,
--     public.bankszamlak, public.befizetes  — a hivatkozott FK-célok;
--   · current_user_has_global_access()      (2026-08-11-globalis-hozzaferes-szukites.sql)
--   · current_user_district_ids()           (uo.)
--   · current_user_district_olvaso_ids()    (2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql)
--   · public.backup_table_policy `tabla` oszloppal, benne a megyei diocese_*
--     sorokkal `globalis` hatókörrel (ez bizonyítja, hogy az érték legális).
--
-- FUTTATÁSI SORREND (Endre futtatja kézzel, Supabase SQL Editor — a Studio
-- csak az UTOLSÓ utasítás eredményét mutatja, ezért szakaszonként jelöld ki!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT, semmit nem módosít).
--   2.  1. SZAKASZ — LÉTREHOZÁS (EGYETLEN tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT — az eredményt küldd vissza).
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS + CREATE / ON CONFLICT DO UPDATE — akárhányszor
-- újrafuttatható. (A tábla-definíciót az újrafuttatás NEM írja felül; ezt a
-- 2. SZAKASZ oszlop-tükör ellenőrzése teszi láthatóvá.)



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK' AS szakasz,
       'Létezik-e mind a 3 kanonikus hatókör-függvény?' AS mit,
       (SELECT count(*)::text || ' / 3' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access',
                            'current_user_district_ids',
                            'current_user_district_olvaso_ids')) AS ertek,
       'Ha nem 3: ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql, majd a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fusson le. Az 1. szakasz őrszeme enélkül hangosan leáll.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK',
       'current_user_has_global_access() törzse SZŰKÍTETT? (nem említ esperest)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%esperes%'
                             THEN '⛔ RÉGI (fázis-0) törzs — az esperes még GLOBÁLIS!'
                             ELSE '✅ szűkített (2026-08-11) törzs' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
                 LIMIT 1), 'nincs függvény'),
       '⛔ Ha RÉGI: NE FUTTASD ezt a fájlt — az új policy-k a tág globál-függvényre épülnének, és minden esperes írhatná a kerület könyvét. Előbb a 2026-08-11-es szűkítő fájl 2a szakasza.'

UNION ALL
SELECT 3, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK',
       'current_user_district_ids() törzse ÉRINTETLEN? (nem említ egyhazkeruleti_szamvevo-t)',
       COALESCE((SELECT CASE WHEN p.prosrc LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '⛔ MEGVÁLTOZOTT — az ellenőr ÍRÁSJOGOT kapna a kerület könyvén!'
                             ELSE '✅ érintetlen (tiszta írási hatókör)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_district_ids'
                 LIMIT 1), 'nincs függvény'),
       'Ha ⛔: előbb tisztázd, ki és miért írta át. Az ÍRÁS és az OLVASÁS két külön függvény — ez a fájl erre épít.'

UNION ALL
SELECT (10 + row_number() OVER (ORDER BY f.fn))::int, '0/A · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn,
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN 'nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
            THEN '✅ van' ELSE '⛔ NINCS — az új policy 42501/403-mal ÁLLNA LE (nem tagadna: HIBÁZNA)' END,
       'Ha ⛔: az 1. szakasz GRANT-ja pótolja — a policy-k létrehozása ELŐTT, ugyanabban a tranzakcióban.'
FROM (VALUES ('current_user_has_global_access'),
             ('current_user_district_ids'),
             ('current_user_district_olvaso_ids')) AS f(fn)

-- ── 0/B · FK-CÉLOK: megvan-e minden hivatkozott tábla? ──────────────────────
UNION ALL
SELECT (20 + row_number() OVER (ORDER BY c.tabla))::int, '0/B · FK-CÉL TÁBLÁK',
       'Létezik-e: public.' || c.tabla,
       CASE WHEN to_regclass('public.' || c.tabla) IS NULL
            THEN '⛔ NINCS — az 1. szakasz őrszeme leáll'
            ELSE '✅ van' END,
       'A district_* táblák ezekre hivatkoznak (districts / szamadasicel / bankszamlak / congregations / befizetes).'
FROM (VALUES ('districts'), ('dioceses'), ('congregations'),
             ('szamadasicel'), ('bankszamlak'), ('befizetes')) AS c(tabla)

UNION ALL
SELECT 30, '0/B · districts',
       'A districts.id típusa uuid? (a district_id FK ehhez igazodik)',
       COALESCE((SELECT col.data_type FROM information_schema.columns col
                 WHERE col.table_schema = 'public' AND col.table_name = 'districts'
                   AND col.column_name = 'id'), '⛔ nincs id oszlop'),
       'Ha nem uuid: ÁLLJ MEG és jelezd — a teljes tükör-modell erre épül.'

UNION ALL
SELECT 31, '0/B · districts',
       'Hány egyházkerület van felvéve? (lesz-e kinek könyvet vezetni)',
       COALESCE((SELECT count(*)::text || ' kerület' FROM public.districts), 'nincs tábla'),
       'Tájékoztató. 0-nál a felület üres marad — az S2 szelet tölti fel az identitást.'

-- ── 0/C · A MAI ÁLLAPOT: léteznek-e már a cél-táblák? ───────────────────────
UNION ALL
SELECT (40 + row_number() OVER (ORDER BY t.tabla))::int, '0/C · CÉL-TÁBLÁK',
       t.tabla,
       CASE WHEN to_regclass('public.' || t.tabla) IS NULL
            THEN '— még nincs (ezt a fájl hozza létre)'
            ELSE '⚠️ MÁR LÉTEZIK — újrafuttatás rendben, de a DEFINÍCIÓ NEM íródik felül (lásd a 2. szakasz 131-es tükör-ellenőrzését)' END,
       'Tájékoztató.'
FROM (VALUES ('district_bealitas'), ('district_befizetes'), ('district_kiadas'),
             ('district_koltsegvetes'), ('district_annual_reports')) AS t(tabla)

-- ── 0/D · A MINTA: hogyan áll ma a MEGYEI öt tábla ──────────────────────────
UNION ALL
SELECT (50 + row_number() OVER (ORDER BY m.tabla))::int, '0/D · A MEGYEI MINTA',
       'diocese-pár: ' || m.tabla || ' — oszlopszám',
       COALESCE((SELECT count(*)::text || ' oszlop' FROM information_schema.columns col
                 WHERE col.table_schema = 'public' AND col.table_name = m.tabla),
                '⛔ nincs ilyen tábla'),
       'A kerületi tükör ENNYI oszlopot vesz át (diocese_id → district_id cserével). A 2. szakasz 131-es sora oszloponként ellenőrzi.'
FROM (VALUES ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
             ('diocese_koltsegvetes'), ('diocese_annual_reports')) AS m(tabla)

UNION ALL
SELECT 60, '0/D · A MEGYEI MINTA',
       'Megvannak-e a diocese_bealitas KÉSŐBB hozzáadott oszlopai? (9 mod + 3 unlock + 2 határozat = 14)',
       (SELECT count(*)::text || ' / 14' FROM information_schema.columns col
        WHERE col.table_schema = 'public' AND col.table_name = 'diocese_bealitas'
          AND (col.column_name LIKE 'koltsegvetes_mod%'
               OR col.column_name LIKE 'koltsegvetes_unlock%'
               OR col.column_name IN ('szamadas_hatarozat_szam','szamadas_hatarozat_datum'))),
       'A district_bealitas MIND A 14-et megkapja születéskor — akkor is, ha a megyeinél ezek még hiányoznak (2026-08-15-egyhazmegyei-uj-tablak.sql 1/B + -konyveles-s6.sql). Így a kerület nem örökli a megyei hiányokat.'

-- ── 0/E · MENTÉS-RENDSZER (2. BLOKKOLÓ CSAPDA) ─────────────────────────────
UNION ALL
SELECT 70, '0/E · MENTÉS-RENDSZER',
       'Létezik a backup_table_policy, és `tabla` a kulcsoszlopa? (NEM table_name!)',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL
            THEN '⛔ NINCS TÁBLA — előbb a 2026-08-11-biztonsagi-mentes.sql fusson le'
            WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns col
                             WHERE col.table_schema='public' AND col.table_name='backup_table_policy'
                               AND col.column_name='tabla')
            THEN '⛔ VAN TÁBLA, DE NINCS `tabla` OSZLOPA — állj meg és jelezd'
            ELSE '✅ van, `tabla` kulcsoszloppal' END,
       'Besorolatlan táblánál a NAPI MENTÉS MINDEN gyülekezetnél LEÁLL (inventory.ts:163 assertInventoryClassified).'

UNION ALL
SELECT 71, '0/E · MENTÉS-RENDSZER',
       'A MEGYEI minta: hogyan van besorolva az öt diocese_* tábla?',
       COALESCE((SELECT string_agg(b.tabla || '=' || b.hatokor || '/R' || b.reteg::text
                                   || CASE WHEN b.visszaallithato THEN '/vissza' ELSE '' END,
                                   ', ' ORDER BY b.tabla)
                 FROM public.backup_table_policy b
                 WHERE b.tabla IN ('diocese_bealitas','diocese_befizetes','diocese_kiadas',
                                   'diocese_koltsegvetes','diocese_annual_reports')),
                '⛔ egyik sincs besorolva — állj meg'),
       'Ezt másolja a kerületi öt sor: globalis / R2 / visszaallithato=false. Ha itt MÁS látszik, jelezd VISSZA, mielőtt az 1. szakasz futna.'

UNION ALL
SELECT 72, '0/E · MENTÉS-RENDSZER',
       'Van-e MA besorolatlan ÉLŐ tábla? (0 = a napi mentés elindul)',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL THEN 'nincs besorolás-tábla'
            ELSE (SELECT count(*)::text || ' besorolatlan tábla'
                  FROM information_schema.tables t
                  LEFT JOIN public.backup_table_policy b ON b.tabla = t.table_name
                  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
                    AND b.hatokor IS NULL) END,
       '⚠️ Ha MÁR MOST nem 0: a mentés MA IS áll — az nem ennek a fájlnak a hibája, de a 2. szakaszban is látszani fog. Az öt új tábla besorolása UGYANEBBEN a tranzakcióban történik.'

UNION ALL
SELECT 73, '0/E · MENTÉS-RENDSZER',
       'Létezik-e a globalis_predikatum oszlop? (tájékoztató — ez a fájl NEM használja)',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL THEN 'nincs tábla'
            WHEN EXISTS (SELECT 1 FROM information_schema.columns col
                         WHERE col.table_schema='public' AND col.table_name='backup_table_policy'
                           AND col.column_name='globalis_predikatum')
            THEN '✅ van (S4 óta)' ELSE '— nincs (nem baj)' END,
       'A globalis_predikatum CSAK a `gyulekezet` hatókörű táblák felsőbb-szintű sorainak útja. Egy eleve `globalis` táblánál (mint a district_*) értelmezhetetlen — a megyei diocese_* párok is NULL-lal állnak.'

-- ── 0/F · KI FOG ÍRNI ÉS OLVASNI: a kerületi profile_roles sorok ────────────
UNION ALL
SELECT (80 + row_number() OVER (ORDER BY pr.role))::int, '0/F · KIT ÉRINT',
       'profile_roles scope=district, aktív+jóváhagyott — szerep: ' || pr.role,
       count(*)::text || ' sor / ' || count(DISTINCT pr.profile_id)::text || ' fő',
       CASE
         WHEN pr.role = 'egyhazkeruleti_admin'
           THEN '✅ ÍR és OLVAS a kerület könyvén (current_user_district_ids).'
         WHEN pr.role = 'egyhazkeruleti_szamvevo'
           THEN '✅ CSAK OLVAS (FOR SELECT policy, current_user_district_olvaso_ids) — az ellenőr nem írhatja, amit ellenőriz.'
         ELSE '⚠️ EZ A SZEREP NEM KAP HOZZÁFÉRÉST a kerület könyvéhez. Ha valakinek rögzítenie kell, adj neki NEVESÍTETT egyhazkeruleti_admin (olvasáshoz egyhazkeruleti_szamvevo) sort — a policy szerep-szűrt, „custom" sor nem elég.'
       END
FROM public.profile_roles pr
WHERE pr.scope = 'district' AND pr.active = true AND pr.approval_status = 'approved'
GROUP BY pr.role

-- ── 0/G · A KATALÓGUS: szamadasicel.szint = 'kerulet' ───────────────────────
UNION ALL
SELECT 90, '0/G · SZÁMADÁSI CÉL KATALÓGUS',
       'A szamadasicel.szint CHECK mai definíciója',
       COALESCE((SELECT pg_get_constraintdef(con.oid) FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.szamadasicel')
                   AND con.contype = 'c'
                   AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                           WHERE a.attrelid = to_regclass('public.szamadasicel')
                                             AND a.attname = 'szint' AND NOT a.attisdropped)]
                 LIMIT 1),
                '— nincs egyoszlopos CHECK a szint oszlopon'),
       'A constraintet a `conkey` (oszlop) alapján keressük, NEM pg_get_constraintdef LIKE-kal — az másik constraintet is eltalálna (ez már elsült élesben).'

UNION ALL
SELECT (200 + row_number() OVER (ORDER BY sz.szint))::int, '0/G · SZÁMADÁSI CÉL KATALÓGUS',
       'szamadasicel sorok szint = ' || COALESCE(sz.szint, '(NULL)'),
       count(*)::text || ' sor',
       'A megyei kör NEM hozott létre ÚJ sorokat: 18 MEGLÉVŐ sort címkézett át (2026-04-17-szamadasicel-szint.sql), Endre NÉV SZERINTI listája alapján. Kerületi listánk nincs → ez a fájl NEM nyúl a katalógushoz. Részletek a 2. szakasz 140-es sorában.'
FROM public.szamadasicel sz
GROUP BY sz.szint

-- ── 0/H · NYITOTT PONT: van-e a kerületnek hova bankszámlát felvennie? ──────
UNION ALL
SELECT 95, '0/H · NYITOTT PONT',
       'bankszamlak.scope CHECK — engedi-e az „egyhazkerulet" értéket?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(con.oid) LIKE '%egyhazkerulet%'
                             THEN '✅ igen'
                             ELSE '⚠️ NEM: ' || pg_get_constraintdef(con.oid) END
                 FROM pg_constraint con
                 WHERE con.conname = 'bankszamlak_scope_check'
                   AND con.conrelid = to_regclass('public.bankszamlak')
                 LIMIT 1),
                '— nincs bankszamlak_scope_check'),
       '⚠️ NYITOTT: a district_befizetes/_kiadas kap `bankszamla_id` oszlopot (a megyei tükör), de KERÜLETI bankszámla ma nem vehető fel — ehhez a bankszamlak_scope_check ÉS a bankszamlak_scope_fk_check bővítése + egy districts-re mutató FK-oszlop kellene. Ez TUDATOSAN nincs ebben a fájlban: élő, gyülekezeti táblát érint. A kerületi könyv addig készpénzes/számlás tételeket vezet.'

UNION ALL
SELECT 96, '0/H · NYITOTT PONT',
       'chitanta_tombok.scope — van-e kerületi nyugtatömb-út?',
       COALESCE((SELECT string_agg(DISTINCT ct.scope, ', ') FROM public.chitanta_tombok ct),
                '(nincs sor / nincs tábla)'),
       'Tájékoztató — ugyanaz a nyitott pont, mint a bankszámláknál. Nem ennek a fájlnak a tárgya.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — LÉTREHOZÁS                                 FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ: táblák + GRANT-ok + RLS + mentés-besorolás.      ║
-- ║    Ha bármi hibázik, MINDEN visszagördül — nincs olyan pillanat, amikor   ║
-- ║    létező, de besorolatlan (vagy RLS nélküli) tábla áll az adatbázisban.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ────────────────────────────────────────────────────────────────────────────
-- ŐRSZEM — fail-closed előfeltételek, beszédes MAGYAR hibaüzenettel
-- ────────────────────────────────────────────────────────────────────────────
-- „A migration-fájl NEM bizonyíték": nem hisszük el, hogy a repóban lévő
-- korábbi fájlok lefutottak ezen az adatbázison — MEGMÉRJÜK.
DO $orszem$
BEGIN
  -- (1) FK-cél táblák
  IF to_regclass('public.districts') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.districts tábla — nem ez az adatbázis. A district_* táblák erre hivatkoznak.';
  END IF;
  IF to_regclass('public.szamadasicel') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.szamadasicel tábla — a kategória-oszlop (id_szamadasicel) FK-ja hiányozna.';
  END IF;
  IF to_regclass('public.bankszamlak') IS NULL OR to_regclass('public.congregations') IS NULL
     OR to_regclass('public.befizetes') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a bankszamlak / congregations / befizetes tábla — a megyei tükör FK-jai nem hozhatók létre.';
  END IF;

  -- (2) Kanonikus hatókör-függvények
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_has_global_access() vagy a current_user_district_ids() — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql 1. szakasza fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_district_olvaso_ids() — ELŐBB a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql 1/B szakasza fusson le. Enélkül a kerületi SZÁMVEVŐ olvasása némán elveszne.';
  END IF;

  -- (3) A globál-függvény nem lehet a RÉGI, tág (esperest is beengedő) törzs —
  --     különben az új policy-k minden esperesnek írásjogot adnának a kerület
  --     könyvén.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
      AND p.prosrc LIKE '%esperes%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_has_global_access() még a RÉGI (esperest is globálisnak vevő) törzs — ELŐBB a 2026-08-11-es szűkítő fájl 2a szakasza fusson le.';
  END IF;

  -- (4) Az ÍRÁSI hatókör-függvény nem tartalmazhat számvevőt (az ellenőr nem ír).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_district_ids'
      AND p.prosrc LIKE '%egyhazkeruleti_szamvevo%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_district_ids() törzse EMLÍTI az egyhazkeruleti_szamvevo-t — az írási hatókör sérült (0/A 3. sor). Előbb tisztázd.';
  END IF;

  -- (5) MENTÉS-BESOROLÁS (2. BLOKKOLÓ CSAPDA). Nem elég, hogy a tábla létezik:
  --     a kulcsoszlop neve `tabla` (NEM table_name — #172), és a `globalis`
  --     értéknek LEGÁLISNAK kell lennie a hatokor CHECK-jében. Ez utóbbit
  --     ADATTAL bizonyítjuk (a megyei diocese_* sorok már így állnak), nem
  --     constraint-szöveg elemzésével.
  IF to_regclass('public.backup_table_policy') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.backup_table_policy — ELŐBB a 2026-08-11-biztonsagi-mentes.sql fusson le. Besorolatlan táblánál a NAPI MENTÉS MINDEN gyülekezetnél leáll.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'backup_table_policy'
      AND column_name = 'tabla'
  ) THEN
    RAISE EXCEPTION '⛔ A backup_table_policy-nak NINCS `tabla` oszlopa (a kulcsoszlop NEM table_name!) — a séma nem a várt. Állj meg és jelezd.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.backup_table_policy b
    WHERE b.tabla IN ('diocese_bealitas','diocese_befizetes','diocese_kiadas',
                      'diocese_koltsegvetes','diocese_annual_reports')
      AND b.hatokor = 'globalis'
  ) THEN
    RAISE EXCEPTION '⛔ A megyei diocese_* táblák NINCSENEK `globalis` hatókörrel besorolva — vagy a mentés-kör nem futott le, vagy a hatokor CHECK nem ismeri a „globalis" értéket. Ez a fájl a megyei mintát másolja: enélkül a besorolása 23514-gyel bukna, a tábla viszont már létezne.';
  END IF;
END
$orszem$;

-- ────────────────────────────────────────────────────────────────────────────
-- GRANT-ok a policy-kban hívott függvényekre — A POLICY-K LÉTREHOZÁSA ELŐTT
-- ────────────────────────────────────────────────────────────────────────────
-- Bizonyított hibaosztály: „az RLS-policy a HÍVÓ szerepében fut → GRANT nélkül
-- 403-leállás". A policy ilyenkor NEM tagad, hanem HIBÁZIK — a felület üres
-- képernyőt vagy nyers hibát ad. Idempotens.
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_olvaso_ids()   TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- KÖZÖS updated_at TRIGGER-FÜGGVÉNY
-- ────────────────────────────────────────────────────────────────────────────
-- MIÉRT SAJÁT, ÉS NEM A MEGYEI public.tg_update_timestamp(): azt CREATE OR
-- REPLACE-szel felülírni annyit tenne, hogy egy KERÜLETI migráció hozzányúl a
-- megyei (és több gyülekezeti) tábla trigger-függvényéhez — a „byte-ra
-- változatlan megyei viselkedés" korlát tiltja. Ez a függvény ráadásul
-- search_path-pinnelt (a 2026-08-11-security-definer-hardening óta ez a ház
-- szabálya minden ÚJ függvényre).
CREATE OR REPLACE FUNCTION public.district_penzugy_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $district_updated_at$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$district_updated_at$;

COMMENT ON FUNCTION public.district_penzugy_set_updated_at() IS
  '2026-08-17 (kerületi S5): az öt district_* pénzügyi tábla updated_at bélyegzője. Szándékosan KÜLÖN a megyei tg_update_timestamp()-tól: egy kerületi migráció nem írhat felül megyei/gyülekezeti táblákon is használt függvényt.';


-- ════════════════════════════════════════════════════════════════════════════
-- 1/A) district_bealitas — a kerület ÉVES KONFIGJA
-- ════════════════════════════════════════════════════════════════════════════
-- A diocese_bealitas tükre, de MÁR A TELJES, 2026-08-15 UTÁNI alakjában:
-- benne a költségvetés-módosítás flagek (uj-tablak 1/B) és a
-- költségvetés-feloldás + számadás-határozat oszlopok (konyveles-s6) is. Így a
-- kerület nem örökli azokat a hiányokat, amiket a megyénél utólag kellett
-- pótolni (és amiktől a felület hardkódolt `false`-t mutatott = HAZUDOTT).
--
-- ⚠️ AZ `eve` INT ÉS AZ UNIQUE(district_id, eve) NEM DÍSZ: az app
--    `.upsert(..., { onConflict: 'district_id,eve' })`-vel zár évet — egyedi
--    megszorítás nélkül a PostgREST 42P10-zel állna meg a véglegesítésnél.

CREATE TABLE IF NOT EXISTS public.district_bealitas (
  id bigserial PRIMARY KEY,
  district_id uuid NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,
  eve integer NOT NULL,

  -- ── KÖLTSÉGVETÉS ─────────────────────────────────────────────────────────
  koltsegvetes_veglegesitve boolean NOT NULL DEFAULT false,
  koltsegvetes_veglegesites_datuma date,
  koltsegvetes_veglegesitette uuid,
  -- Feloldás-kérelem (a megyei S6 mintája). Az elbíráló szint a kerület FÖLÖTT
  -- (Zsinat) nincs modellezve — a kérelem egyelőre RÖGZÜL, a feloldást a
  -- rendszergazda végzi. Ugyanaz a szemantika, mint a megyeinél 2026-08-15-én.
  koltsegvetes_unlock_requested boolean NOT NULL DEFAULT false,
  koltsegvetes_unlock_request_reason text,
  koltsegvetes_unlock_request_at timestamptz,
  -- A három költségvetés-MÓDOSÍTÁS véglegesítése (flag + dátum + ki).
  koltsegvetes_mod1_veglegesitve boolean NOT NULL DEFAULT false,
  koltsegvetes_mod1_veglegesites_datuma date,
  koltsegvetes_mod1_veglegesitette uuid,
  koltsegvetes_mod2_veglegesitve boolean NOT NULL DEFAULT false,
  koltsegvetes_mod2_veglegesites_datuma date,
  koltsegvetes_mod2_veglegesitette uuid,
  koltsegvetes_mod3_veglegesitve boolean NOT NULL DEFAULT false,
  koltsegvetes_mod3_veglegesites_datuma date,
  koltsegvetes_mod3_veglegesitette uuid,

  -- ── SZÁMADÁS (zárszámadás) ───────────────────────────────────────────────
  szamadas_veglegesitve boolean NOT NULL DEFAULT false,
  szamadas_veglegesites_datuma date,
  szamadas_veglegesitette uuid,
  szamadas_unlock_requested boolean NOT NULL DEFAULT false,
  szamadas_unlock_request_reason text,
  szamadas_unlock_request_at timestamptz,
  -- A jóváhagyó testületi gyűlés jegyzőkönyvi száma és dátuma — a nyomtatvány
  -- „Tárgyalta és jóváhagyta…" sora INNEN él (a megyei S6 tanulsága: snapshot
  -- JSON-ból nem lehet nyomtatvány-mezőt tölteni).
  szamadas_hatarozat_szam text,
  szamadas_hatarozat_datum date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT district_bealitas_district_eve_key UNIQUE (district_id, eve)
);

COMMENT ON TABLE public.district_bealitas IS
  '2026-08-17 (kerületi S5, K2 döntés): az EGYHÁZKERÜLET éves pénzügyi konfigja — költségvetés és számadás véglegesítési állapota, feloldás-kérelmek, határozat-szám. A diocese_bealitas betűhű tükre (diocese_id → district_id), MÁR a 2026-08-15 utáni teljes oszlopkészlettel. App-tükör: apps/web/lib/auth/finance-scope-core.ts (tablesFor: bealitas / yearColBealitas=eve / finalizedCol=szamadas_veglegesitve).';
COMMENT ON COLUMN public.district_bealitas.eve IS
  'Az év INT-ként (a gyülekezeti bealitas.id SZÖVEGES évével szemben) — a megyei minta. Az app yearValueFor() függvénye adja a helyes típust; szöveges „2026" itt némán 0 sort adna.';
COMMENT ON COLUMN public.district_bealitas.koltsegvetes_unlock_requested IS
  '2026-08-17: a kerület SAJÁT költségvetésének feloldás-kérelme (az egységes véglegesítés-gomb útja). A kerület fölött nincs modellezett elbíráló szint — a kérelem itt rögzül, a feloldást rendszergazda végzi.';
COMMENT ON COLUMN public.district_bealitas.szamadas_hatarozat_szam IS
  '2026-08-17: a kerületi számadást jóváhagyó gyűlés jegyzőkönyvi/határozat-száma — a véglegesítő wizard tölti; a nyomtatvány-borító „Tárgyalta és jóváhagyta…" sora innen él.';

CREATE INDEX IF NOT EXISTS idx_district_bealitas_district_eve
  ON public.district_bealitas (district_id, eve);


-- ════════════════════════════════════════════════════════════════════════════
-- 1/B) district_befizetes — a kerület BEVÉTELEI
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.district_befizetes (
  id bigserial PRIMARY KEY,
  district_id uuid NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,

  datum date NOT NULL,
  osszeg numeric(14, 2) NOT NULL,
  osszeg_ron numeric(14, 2),   -- valutás bevételnél a RON ekvivalens
  arfolyam numeric(10, 4),

  -- Kategória: a szamadasicel SZÖVEGES kódja (a gyülekezeti id_befizetescel
  -- int-kulcsával szemben). A felsőbb szintek egységesen ezt használják.
  id_szamadasicel text NOT NULL REFERENCES public.szamadasicel(id),

  -- Ki fizette. A `forrasa` KÖTELEZŐ szabad szöveg (pl. „Küküllői Egyházmegye",
  -- „Állami támogatás"); a congregation-hivatkozás opcionális.
  -- ⚠️ A megye-mint-befizető esetnek MA nincs saját FK-oszlopa (a megyei tükör
  --    sem ismer ilyet) — a `forrasa` hordozza. Lásd a fejléc (b) pontját.
  forrasa text NOT NULL,
  befizeto_congregation_id uuid REFERENCES public.congregations(id) ON DELETE SET NULL,

  -- Dokumentum
  iratszam text NOT NULL,
  nyugta text NOT NULL,
  irattipus text NOT NULL DEFAULT 'készpénz'
    CHECK (irattipus IN ('készpénz', 'banki', 'számla')),
  -- ⚠️ NYITOTT PONT: kerületi bankszámla ma NEM vehető fel (a bankszamlak
  --    scope CHECK-je csak gyulekezet/egyhazmegye értéket ismer). Az oszlop a
  --    megyei tükör miatt itt van, és NULL marad, amíg a bankszámla-oldal meg
  --    nem nyílik. A 0/H és a 2/H sor méri ezt.
  bankszamla_id integer REFERENCES public.bankszamlak(id) ON DELETE SET NULL,

  megjegyzes text,
  fizetettev integer,
  xkey text NOT NULL,
  userid uuid,

  -- Soft delete + stornó (a megyei tükör)
  deleted boolean NOT NULL DEFAULT false,
  stornozott boolean NOT NULL DEFAULT false,
  stornozott_at timestamptz,
  stornozott_by uuid,
  stornozott_indok text,

  -- Transzfer-nyomkövetés: ha a bevétel egy ALSÓBB SZINTŰ `befizetes` sorból
  -- származik (auto-szinkron), itt a forrás-sor azonosítója — így nem lehet
  -- duplikálni. A megyei diocese_befizetes.source_befizetes_id betűhű párja.
  -- ⚠️ Kerület→gyülekezet auto-szinkron MA NINCS bekötve; az oszlop a tükör
  --    teljességéért van itt (a közös kód mindkét ágon ugyanazt a mezőnevet
  --    ismeri). ON DELETE SET NULL: egy gyülekezeti visszaállítás nem viheti
  --    magával a kerület bevételi sorát, csak a mutatót nullázza.
  source_befizetes_id integer REFERENCES public.befizetes(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.district_befizetes IS
  '2026-08-17 (kerületi S5, K2 döntés): az EGYHÁZKERÜLET bevételi könyve. A diocese_befizetes betűhű tükre (diocese_id → district_id). A kategória a szamadasicel SZÖVEGES kódja (id_szamadasicel), nem a gyülekezeti id_befizetescel int-kulcs. App-tükör: finance-scope-core.ts tablesFor.befizetes.';
COMMENT ON COLUMN public.district_befizetes.forrasa IS
  'KÖTELEZŐ szabad szöveg: kitől jött a pénz. Ma ez hordozza a „melyik egyházmegye fizetett" információt is — külön befizeto_diocese_id oszlop TUDATOSAN nincs (a megyei tükör sem ismer ilyet, és a közös beszúró-kód a befizeto_congregation_id kulcsot írja).';
COMMENT ON COLUMN public.district_befizetes.bankszamla_id IS
  '⚠️ NYITOTT: KERÜLETI bankszámla ma nem vehető fel (bankszamlak_scope_check = gyulekezet|egyhazmegye). Az oszlop a megyei tükör miatt van itt; NULL-ként a tétel készpénzes. A bankszamlak kerületi kinyitása KÜLÖN, tudatos döntés (élő gyülekezeti táblát érint).';

CREATE INDEX IF NOT EXISTS idx_district_befizetes_district_datum
  ON public.district_befizetes (district_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_district_befizetes_ev
  ON public.district_befizetes (district_id, fizetettev);
CREATE INDEX IF NOT EXISTS idx_district_befizetes_befizeto_congregation
  ON public.district_befizetes (befizeto_congregation_id)
  WHERE befizeto_congregation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_district_befizetes_source_befizetes
  ON public.district_befizetes (source_befizetes_id)
  WHERE source_befizetes_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- 1/C) district_kiadas — a kerület KIADÁSAI
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ A PARTNER-OSZLOP NEVE `kedvezmenyezett` — a MEGYEI/KERÜLETI ágon ez a
--    kanonikus név. A GYÜLEKEZETI `kiadas` táblán ugyanez `atvevo`, és ott
--    NINCS `kedvezmenyezett` oszlop. Aki a két ágat összekeveri, némán üres
--    partner-oszlopot kap. (Memória-jegyzet: „kiadas: atvevo, NINCS
--    kedvezmenyzett … diocese_kiadas MÁS".)
CREATE TABLE IF NOT EXISTS public.district_kiadas (
  id bigserial PRIMARY KEY,
  district_id uuid NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,

  datum date NOT NULL,
  osszeg numeric(14, 2) NOT NULL,
  osszeg_ron numeric(14, 2),
  arfolyam numeric(10, 4),

  id_szamadasicel text NOT NULL REFERENCES public.szamadasicel(id),

  -- Kinek fizetett
  kedvezmenyezett text NOT NULL,
  kedvezmenyezett_cui text,
  kedvezmenyezett_congregation_id uuid REFERENCES public.congregations(id) ON DELETE SET NULL,

  iratszam text NOT NULL,
  nyugta text NOT NULL,
  irattipus text NOT NULL DEFAULT 'készpénz'
    CHECK (irattipus IN ('készpénz', 'banki', 'számla')),
  bankszamla_id integer REFERENCES public.bankszamlak(id) ON DELETE SET NULL,

  megjegyzes text,
  xkey text NOT NULL,
  userid uuid,

  deleted boolean NOT NULL DEFAULT false,
  stornozott boolean NOT NULL DEFAULT false,
  stornozott_at timestamptz,
  stornozott_by uuid,
  stornozott_indok text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.district_kiadas IS
  '2026-08-17 (kerületi S5, K2 döntés): az EGYHÁZKERÜLET kiadási könyve. A diocese_kiadas betűhű tükre (diocese_id → district_id). ⚠️ A partner-oszlop neve `kedvezmenyezett` (a gyülekezeti kiadas táblán `atvevo` — a kettő NEM cserélhető fel). App-tükör: finance-scope-core.ts tablesFor.kiadas.';
COMMENT ON COLUMN public.district_kiadas.kedvezmenyezett IS
  'Kötelező szabad szöveg: kinek fizetett a kerület. ⚠️ A GYÜLEKEZETI kiadas táblán ugyanennek a neve `atvevo` — a két oszlopnév felcserélése némán üres partner-mezőt ad a nyomtatványon.';

CREATE INDEX IF NOT EXISTS idx_district_kiadas_district_datum
  ON public.district_kiadas (district_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_district_kiadas_kedvezmenyezett_congregation
  ON public.district_kiadas (kedvezmenyezett_congregation_id)
  WHERE kedvezmenyezett_congregation_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- 1/D) district_koltsegvetes — a kerület ÉVES TERVEZÉSE
-- ════════════════════════════════════════════════════════════════════════════
-- KOMPOZIT PK, mint a megyeinél: (district_id, eve, szamadasicelid). Nincs
-- surrogate `id` és nincs `created_at` — betűhű tükör.
CREATE TABLE IF NOT EXISTS public.district_koltsegvetes (
  district_id uuid NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,
  eve integer NOT NULL,
  szamadasicelid text NOT NULL REFERENCES public.szamadasicel(id),

  tervezett numeric(14, 2) NOT NULL DEFAULT 0,
  osszeg_mod_1 numeric(14, 2) DEFAULT 0,
  osszeg_mod_2 numeric(14, 2) DEFAULT 0,
  osszeg_mod_3 numeric(14, 2) DEFAULT 0,

  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (district_id, eve, szamadasicelid)
);

COMMENT ON TABLE public.district_koltsegvetes IS
  '2026-08-17 (kerületi S5, K2 döntés): az EGYHÁZKERÜLET éves költségvetése — szamadasicel-enkénti tervezett összeg + 3 módosítás. A diocese_koltsegvetes betűhű tükre. KOMPOZIT PK: (district_id, eve, szamadasicelid) — a mentés/visszaállítás runbookjában ez a sorrend-kulcs. App-tükör: finance-scope-core.ts tablesFor.koltsegvetes (yearColKtvs=eve).';

CREATE INDEX IF NOT EXISTS idx_district_koltsegvetes_district_eve
  ON public.district_koltsegvetes (district_id, eve);


-- ════════════════════════════════════════════════════════════════════════════
-- 1/E) district_annual_reports — a kerület ZÁRSZÁMADÁS-PILLANATKÉPE
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.district_annual_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,
  year integer NOT NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'received', 'reviewed', 'finalized')),

  -- A számadás aggregált, FAGYASZTOTT pillanatképe (bevétel/kiadás/egyenleg,
  -- jegyzőkönyvi szám stb.) — kanonikus kulcsokkal, a megyei alakkal azonosan.
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,

  submitted_at timestamptz,
  submitted_by uuid,
  received_at timestamptz,
  received_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_notes text,
  finalized_at timestamptz,
  finalized_by uuid,

  -- ⚠️ A megyei tükör két oszlopa. A kerület FÖLÖTT nincs modellezett szint
  --    (a Zsinat nem szerepel az adatmodellben), ezért ezek a kerületi soron
  --    false/NULL maradnak. AZÉRT VANNAK ITT, mert a közös éves-jelentés kód a
  --    megyei ágon NÉV SZERINT válogatja őket (`select('… forwarded_to_kerulet …')`):
  --    hiányuk 42703-mal buktatná a közös lekérdezést a kerületi ágon.
  forwarded_to_kerulet boolean NOT NULL DEFAULT false,
  forwarded_at timestamptz,

  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT district_annual_reports_district_year_key UNIQUE (district_id, year)
);

COMMENT ON TABLE public.district_annual_reports IS
  '2026-08-17 (kerületi S5, K2 döntés): az EGYHÁZKERÜLET éves zárszámadásának FAGYASZTOTT pillanatképe. A diocese_annual_reports betűhű tükre (diocese_id → district_id). Az UNIQUE(district_id, year) az app upsert-jének (onConflict: district_id,year) ELŐFELTÉTELE — enélkül a véglegesítés 42P10-zel állna meg. App-tükör: finance-scope-core.ts tablesFor.annualReport.';
COMMENT ON COLUMN public.district_annual_reports.forwarded_to_kerulet IS
  '⚠️ A kerületi soron ÉRTELMETLEN (a kerület fölött nincs modellezett szint) — mindig false marad. Kizárólag azért létezik, hogy a megyei/gyülekezeti ággal KÖZÖS éves-jelentés kód név szerinti select-je a kerületi ágon se hibázzon 42703-mal.';

CREATE INDEX IF NOT EXISTS idx_district_annual_reports_district_year
  ON public.district_annual_reports (district_id, year);
CREATE INDEX IF NOT EXISTS idx_district_annual_reports_status
  ON public.district_annual_reports (status)
  WHERE status <> 'finalized';


-- ════════════════════════════════════════════════════════════════════════════
-- 1/F) updated_at TRIGGEREK
-- ════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS district_bealitas_updated_at_trigger ON public.district_bealitas;
CREATE TRIGGER district_bealitas_updated_at_trigger
  BEFORE UPDATE ON public.district_bealitas
  FOR EACH ROW EXECUTE FUNCTION public.district_penzugy_set_updated_at();

DROP TRIGGER IF EXISTS district_befizetes_updated_at_trigger ON public.district_befizetes;
CREATE TRIGGER district_befizetes_updated_at_trigger
  BEFORE UPDATE ON public.district_befizetes
  FOR EACH ROW EXECUTE FUNCTION public.district_penzugy_set_updated_at();

DROP TRIGGER IF EXISTS district_kiadas_updated_at_trigger ON public.district_kiadas;
CREATE TRIGGER district_kiadas_updated_at_trigger
  BEFORE UPDATE ON public.district_kiadas
  FOR EACH ROW EXECUTE FUNCTION public.district_penzugy_set_updated_at();

DROP TRIGGER IF EXISTS district_koltsegvetes_updated_at_trigger ON public.district_koltsegvetes;
CREATE TRIGGER district_koltsegvetes_updated_at_trigger
  BEFORE UPDATE ON public.district_koltsegvetes
  FOR EACH ROW EXECUTE FUNCTION public.district_penzugy_set_updated_at();

DROP TRIGGER IF EXISTS district_annual_reports_updated_at_trigger ON public.district_annual_reports;
CREATE TRIGGER district_annual_reports_updated_at_trigger
  BEFORE UPDATE ON public.district_annual_reports
  FOR EACH ROW EXECUTE FUNCTION public.district_penzugy_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 1/G) JOGOK — explicit REVOKE, majd célzott GRANT
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT KELL A REVOKE: a 2026-04-23-as ALTER DEFAULT PRIVILEGES miatt MINDEN
-- új tábla NÉMÁN teljes CRUD-ot örököl az anon és az authenticated szerepnek.
-- Az `anon` (bejelentkezés nélküli) hozzáférés a kerület PÉNZÜGYI könyvéhez
-- elfogadhatatlan — a 2026-08-10-es anon-higiéniai kör óta ez a ház szabálya.
REVOKE ALL ON public.district_bealitas       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.district_befizetes      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.district_kiadas         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.district_koltsegvetes   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.district_annual_reports FROM PUBLIC, anon, authenticated;

-- A tényleges szűrést az RLS végzi; a GRANT csak a kaput nyitja ki. DELETE-et
-- azért adunk, mert a megyei tükörnek is van (a költségvetés-sorok cseréje és
-- a tétel-törlés is DELETE-tel dolgozik) — a pénzügyi tételek maguk `deleted`
-- zászlóval, soft-delete-tel tűnnek el.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_bealitas       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_befizetes      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_kiadas         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_koltsegvetes   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_annual_reports TO authenticated;

-- A napi mentés / visszaállítás a service_role szerepében fut — explicit GRANT,
-- hogy ne egy öröklött alapértelmezésen múljon (különben a mentés 42501-gyel
-- állna le, és a leállás MINDEN gyülekezetet érintene).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_bealitas       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_befizetes      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_kiadas         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_koltsegvetes   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.district_annual_reports TO service_role;

-- ⚠️ SZEKVENCIÁK: a három bigserial oszlop mögötti szekvencián USAGE nélkül az
--    INSERT „permission denied for sequence"-szel hasal el — GRANT nélkül az
--    ELSŐ kerületi tétel rögzítése bukna, nem a századik.
REVOKE ALL ON SEQUENCE public.district_bealitas_id_seq  FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.district_befizetes_id_seq FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.district_kiadas_id_seq    FROM PUBLIC, anon;
GRANT USAGE ON SEQUENCE public.district_bealitas_id_seq  TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.district_befizetes_id_seq TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.district_kiadas_id_seq    TO authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- 1/H) RLS — KÉT POLICY TÁBLÁNKÉNT (ÍRÓ FOR ALL + OLVASÓ FOR SELECT)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.district_bealitas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_befizetes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_kiadas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_koltsegvetes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_annual_reports ENABLE ROW LEVEL SECURITY;

-- A policy-k táblánként AZONOS alakúak, ezért generáljuk őket — így nem lehet
-- elgépelni az egyiket (a megyei 2026-08-15-egyhazmegyei-rls-szerep-szuro.sql
-- 1/A ciklusának mintájára). A generálás fail-closed: ha egyetlen tábla sem
-- kapott policy-t, hangosan megállunk.
DO $policy_gen$
DECLARE
  r      record;
  v_felt text;
  v_db   integer := 0;
BEGIN
  FOR r IN
    SELECT t.tabla FROM (VALUES
      ('district_bealitas'), ('district_befizetes'), ('district_kiadas'),
      ('district_koltsegvetes'), ('district_annual_reports')
    ) AS t(tabla)
  LOOP
    -- „A migration-fájl NEM bizonyíték": a repó és a produkció széthúzhat,
    -- ezért az oszlop létezését MEGMÉRJÜK, mielőtt policy-t írnánk rá.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = r.tabla
        AND col.column_name = 'district_id' AND col.data_type = 'uuid'
    ) THEN
      RAISE EXCEPTION '⛔ %.district_id (uuid) nem létezik — a tábla nem a várt alakban jött létre.', r.tabla;
    END IF;

    -- ÍRÓ ág: rendszergazda VAGY a SAJÁT kerület (szerep-szűrt, fail-closed).
    v_felt := format(
      'public.current_user_has_global_access()
       OR %I.district_id = ANY (COALESCE((SELECT public.current_user_district_ids()), ''{}''::uuid[]))',
      r.tabla);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_all', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (%s) WITH CHECK (%s)',
      r.tabla || '_all', r.tabla, v_felt, v_felt);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
      r.tabla || '_all', r.tabla,
      '2026-08-17 (kerületi S5, K2): kanonikus, SZEREP-SZŰRT ÍRÓ policy. Két ág: rendszergazda (current_user_has_global_access) és a saját kerület (current_user_district_ids — egyhazkeruleti_admin). Szerep-szűrő nélküli profile_roles-ág SZÁNDÉKOSAN NINCS: pontosan az volt a megyei diocese_*_all hibája 2026-08-15-ig. A COALESCE fail-closed: hatókör nélküli hívónál üres tömb. Az olvasás a külön FOR SELECT policy-ban él. App-tükör: apps/web/lib/auth/level-scope.ts (DISTRICT_WRITE_ROLES).');

    -- OLVASÓ ág: CSAK SELECT. Az ellenőr (egyhazkeruleti_szamvevo) láthat,
    -- de az írási úton EGYETLEN policy sem hivatkozik erre a feloldóra.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_szamvevo_select', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (%I.district_id = ANY (COALESCE((SELECT public.current_user_district_olvaso_ids()), ''{}''::uuid[])))',
      r.tabla || '_szamvevo_select', r.tabla, r.tabla);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
      r.tabla || '_szamvevo_select', r.tabla,
      '2026-08-17 (kerületi S5): a kerület SAJÁT könyveinek OLVASÁSA az olvasói hatókörnek (kerületi admin + egyházkerületi számvevő). CSAK SELECT — írási úton egyetlen policy sem hívja az olvasó feloldót. App-tükör: apps/web/lib/auth/level-scope.ts (DISTRICT_READ_ROLES).');

    v_db := v_db + 1;
    RAISE NOTICE '✅ % — ÍRÓ FOR ALL + OLVASÓ FOR SELECT policy kész.', r.tabla;
  END LOOP;

  IF v_db <> 5 THEN
    RAISE EXCEPTION '⛔ Csak % tábla kapott policy-t az 5-ből — a séma nem a várt.', v_db;
  END IF;
  RAISE NOTICE 'ÖSSZESEN % kerületi pénzügyi tábla RLS-e beállítva.', v_db;
END
$policy_gen$;


-- ════════════════════════════════════════════════════════════════════════════
-- 1/I) ⛔ MENTÉS-BESOROLÁS — A 2. BLOKKOLÓ CSAPDA ZÁRÁSA
-- ════════════════════════════════════════════════════════════════════════════
-- UGYANEBBEN a tranzakcióban, a táblák létrehozásával együtt. Enélkül a napi
-- mentés MINDEN gyülekezetnél leállna (assertInventoryClassified /
-- backup_scope_where „BESOROLATLAN TÁBLA").
--
-- ⚠️ DO UPDATE, nem DO NOTHING — a 2026-08-11-es 3/i tanulság: egy már
--    telepített adatbázisban a DO NOTHING egy korábbi, HIBÁS besorolást némán
--    megőrizne, és a hiba csak a visszaállításkor derülne ki.
-- ⚠️ A `globalis_predikatum` oszlopot SZÁNDÉKOSAN nem említjük (lásd a fejlécet):
--    egy `globalis` hatókörű táblánál nincs értelme, és így ez a fájl akkor is
--    lefut, ha az S4 (ami az oszlopot bevezette) még nem futott le.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('district_bealitas','globalis',NULL,2,false,
  '2026-08-17 (kerületi S5, K2): az egyházkerület éves pénzügyi konfigja. Egyházkerületi szint — a hatokor CHECK nem ismer „egyhazkerulet" értéket, ezért a MEGYEI diocese_* minta szerint a GLOBÁLIS mentésbe kerül (R2: a districts bérlő-váz R1 után). A gombbal indított gyülekezeti visszaállítás SOHA nem nyúl hozzá (visszaallithato=false) — a felsőbb szintek helyreállítása runbook, nem kattintás.'),
 ('district_befizetes','globalis',NULL,2,false,
  '2026-08-17 (kerületi S5, K2): a kerület bevételi könyve. Globális mentés, R2. ⚠️ A source_befizetes_id a GYÜLEKEZETI befizetes táblára mutat (R5) — a runbookban a mutató visszatöltése a gyülekezeti pénzügy UTÁN jön; ON DELETE SET NULL miatt a hiánya nem blokkol. Ugyanaz a felállás, mint a megyei diocese_befizetes-nél.'),
 ('district_kiadas','globalis',NULL,2,false,
  '2026-08-17 (kerületi S5, K2): a kerület kiadási könyve. Globális mentés, R2. ⚠️ A partner-oszlop neve `kedvezmenyezett` (a gyülekezeti kiadas táblán `atvevo`) — a visszatöltő szkript ne keverje össze őket.'),
 ('district_koltsegvetes','globalis',NULL,2,false,
  '2026-08-17 (kerületi S5, K2): a kerület éves költségvetése. Globális mentés, R2. KOMPOZIT PK: (district_id, eve, szamadasicelid) — nincs surrogate id, a visszatöltés ezen a hármason ütközik.'),
 ('district_annual_reports','globalis',NULL,2,false,
  '2026-08-17 (kerületi S5, K2): a kerület zárszámadás-pillanatképe. Globális mentés, R2. A snapshot_data FAGYASZTOTT jsonb — visszatöltéskor változatlanul kerül vissza, nem számolódik újra.')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;

-- Öv-és-nadrágtartó: ha bármelyik sor mégsem került be, ITT állunk meg
-- (a tranzakció visszagördül), nem holnap hajnalban a mentésnél.
DO $besorolas_or$
DECLARE v_db integer;
BEGIN
  SELECT count(*) INTO v_db FROM public.backup_table_policy b
  WHERE b.tabla IN ('district_bealitas','district_befizetes','district_kiadas',
                    'district_koltsegvetes','district_annual_reports')
    AND b.hatokor = 'globalis' AND b.reteg = 2 AND b.visszaallithato = false;
  IF v_db <> 5 THEN
    RAISE EXCEPTION '⛔ Csak % kerületi pénzügyi tábla van helyesen besorolva az 5-ből — a napi mentés MINDEN gyülekezetnél leállna. Visszagörgetés.', v_db;
  END IF;
END
$besorolas_or$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2/A · TÁBLÁK' AS szakasz,
       'Létrejött mind az 5 kerületi pénzügyi tábla? (5 = rendben)' AS mit,
       (SELECT count(*)::text || ' / 5' FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name IN ('district_bealitas','district_befizetes','district_kiadas',
                               'district_koltsegvetes','district_annual_reports')) AS ertek,
       'Ha nem 5: az 1. szakasz nem futott végig — nézd meg a hibaüzenetet.' AS teendo

UNION ALL
SELECT (101 + row_number() OVER (ORDER BY t.tabla))::int, '2/B · RLS',
       t.tabla || ' — RLS állapot és policy-darabszám',
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ RLS BE' ELSE '⛔ RLS KI — a policy TÉTLEN!' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = t.tabla), 'nincs tábla')
       || ' · ' ||
       COALESCE((SELECT count(*)::text || ' policy' FROM pg_policies pol
                 WHERE pol.schemaname = 'public' AND pol.tablename = t.tabla), '?'),
       'Várt: RLS BE + PONTOSAN 2 policy (ÍRÓ FOR ALL + OLVASÓ FOR SELECT).'
FROM (VALUES ('district_bealitas'), ('district_befizetes'), ('district_kiadas'),
             ('district_koltsegvetes'), ('district_annual_reports')) AS t(tabla)

UNION ALL
SELECT 110, '2/C · ÍRÓ POLICY-K',
       'Mind az 5 _all policy a SZEREP-SZŰRT current_user_district_ids()-t hívja? (5 = rendben)',
       (SELECT count(*)::text || ' / 5' FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.policyname IN ('district_bealitas_all','district_befizetes_all',
                                 'district_kiadas_all','district_koltsegvetes_all',
                                 'district_annual_reports_all')
          AND COALESCE(pol.qual, '')       LIKE '%current_user_district_ids%'
          AND COALESCE(pol.with_check, '') LIKE '%current_user_district_ids%'),
       'A USING ÉS a WITH CHECK is szerep-szűrt kell legyen — különben be lehetne szúrni idegen kerület sorát.'

UNION ALL
SELECT 111, '2/C · ÍRÓ POLICY-K',
       '⛔ Maradt-e SZEREP-SZŰRŐ NÉLKÜLI profile_roles-ág a district_* policy-kban? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename IN ('district_bealitas','district_befizetes','district_kiadas',
                                'district_koltsegvetes','district_annual_reports')
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%profile_roles%'),
       '⛔ Ha nem 0: valaki kézi EXISTS-láncot tett a policy-ba. Pontosan ez volt a megyei diocese_*_all hibája: BÁRMILYEN kerületi szerep (custom „titkárnő", könyvelő) írhatta volna a kerület könyvét.'

UNION ALL
SELECT 112, '2/D · OLVASÓ POLICY-K',
       'Él mind az 5 _szamvevo_select FOR SELECT policy? (5 = rendben)',
       (SELECT count(*)::text || ' / 5' FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.cmd = 'SELECT'
          AND pol.policyname IN ('district_bealitas_szamvevo_select','district_befizetes_szamvevo_select',
                                 'district_kiadas_szamvevo_select','district_koltsegvetes_szamvevo_select',
                                 'district_annual_reports_szamvevo_select')),
       'Ha nem 5: a kerületi SZÁMVEVŐ üres képernyőt kapna — hibaüzenet nélkül. Pontosan ez történt a megyei számvevőnél.'

UNION ALL
SELECT 113, '2/D · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI (nem SELECT) policy OLVASÓ-feloldót a district_* táblákon? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.cmd <> 'SELECT'
          AND pol.tablename IN ('district_bealitas','district_befizetes','district_kiadas',
                                'district_koltsegvetes','district_annual_reports')
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
              LIKE '%current_user_district_olvaso_ids%'),
       '⛔ Ha nem 0: az ELLENŐR ÍRHATNÁ, amit ellenőriz. Az írás és az olvasás két külön függvény — ez a szétválasztás maga a védelem.'

UNION ALL
SELECT 114, '2/D · HATÓKÖR-SZIVÁRGÁS',
       'Hivatkozik-e bármelyik district_* policy MEGYEI vagy GYÜLEKEZETI feloldóra? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename IN ('district_bealitas','district_befizetes','district_kiadas',
                                'district_koltsegvetes','district_annual_reports')
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
              ~ '(current_user_diocese|felettes_szint|current_user_congregation)'),
       '⛔ Ha nem 0: a kerület könyvébe belátna (vagy beleírna) egy alsóbb szint. A kerület könyve a kerületé.'

UNION ALL
SELECT 120, '2/E · GRANT-OK',
       'authenticated: SELECT+INSERT+UPDATE+DELETE mind az 5 táblán? (20 = rendben)',
       -- has_table_privilege (nem information_schema.role_table_grants): az
       -- information_schema nézetek CSAK az éppen engedélyezett szerepek
       -- jogait mutatják, tehát „0 jog"-ot írnának akkor is, ha a GRANT rendben
       -- van. A has_* függvény a valóságot méri. NULL-biztos: to_regclass
       -- hiányzó táblánál NULL-t ad, a strict has_* pedig NULL-t → nem számol.
       (SELECT count(*)::text || ' / 20'
        FROM (VALUES ('district_bealitas'), ('district_befizetes'), ('district_kiadas'),
                     ('district_koltsegvetes'), ('district_annual_reports')) AS t(tabla)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(jog)
        WHERE has_table_privilege('authenticated', to_regclass('public.' || t.tabla), p.jog)),
       'A policy a HÍVÓ szerepében fut — GRANT nélkül 403. (5 tábla × 4 jog = 20.)'

UNION ALL
SELECT 121, '2/E · GRANT-OK',
       '⛔ Kapott-e az anon BÁRMILYEN jogot a kerület könyvein? (0 = rendben)',
       (SELECT count(*)::text
        FROM (VALUES ('district_bealitas'), ('district_befizetes'), ('district_kiadas'),
                     ('district_koltsegvetes'), ('district_annual_reports')) AS t(tabla)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(jog)
        WHERE has_table_privilege('anon', to_regclass('public.' || t.tabla), p.jog)),
       '⛔ Ha nem 0: a 2026-04-23-as ALTER DEFAULT PRIVILEGES öröksége maradt bent — bejelentkezés nélkül olvasható (vagy írható!) a kerület pénzügye. Futtasd újra az 1/G REVOKE sorait.'

UNION ALL
SELECT 122, '2/E · SZEKVENCIA-JOG',
       'USAGE a 3 bigserial szekvencián az authenticated-nek? (3 = rendben)',
       (SELECT count(*)::text || ' / 3'
        FROM (VALUES ('district_bealitas_id_seq'), ('district_befizetes_id_seq'),
                     ('district_kiadas_id_seq')) AS s(seq)
        WHERE has_sequence_privilege('authenticated', to_regclass('public.' || s.seq), 'USAGE')),
       '⛔ Ha nem 3: az ELSŐ kerületi tétel rögzítése „permission denied for sequence"-szel hasal el.'

UNION ALL
SELECT 123, '2/E · FÜGGVÉNY-GRANT',
       'EXECUTE a 3 hatókör-függvényen az authenticated-nek? (3 = rendben)',
       (SELECT count(*)::text || ' / 3' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access','current_user_district_ids',
                            'current_user_district_olvaso_ids')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
       'Ha nem 3: a policy kiértékelése 42501/403-mal HIBÁZIK (nem tagad) — üres képernyő hibaüzenet nélkül.'

UNION ALL
SELECT 130, '2/F · EGYEDISÉG',
       'Él a 3 upsert-kulcs? (bealitas district_id+eve, annual_reports district_id+year, koltsegvetes PK)',
       (SELECT count(*)::text || ' / 3' FROM pg_constraint con
        WHERE con.conrelid IN (to_regclass('public.district_bealitas'),
                               to_regclass('public.district_annual_reports'),
                               to_regclass('public.district_koltsegvetes'))
          AND con.contype IN ('u','p')
          AND con.conname IN ('district_bealitas_district_eve_key',
                              'district_annual_reports_district_year_key',
                              'district_koltsegvetes_pkey')),
       '⛔ Ha nem 3: az app `.upsert(..., { onConflict: … })` hívása 42P10-zel („no unique or exclusion constraint matching") ÁLL MEG a véglegesítésnél.'

UNION ALL
SELECT 131, '2/G · OSZLOP-TÜKÖR',
       'Van-e olyan diocese_* oszlop, aminek NINCS kerületi párja? (0 = tökéletes tükör)',
       (SELECT count(*)::text
        FROM information_schema.columns dc
        WHERE dc.table_schema = 'public'
          AND dc.table_name IN ('diocese_bealitas','diocese_befizetes','diocese_kiadas',
                                'diocese_koltsegvetes','diocese_annual_reports')
          AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns kc
                WHERE kc.table_schema = 'public'
                  AND kc.table_name = replace(dc.table_name, 'diocese_', 'district_')
                  AND kc.column_name = CASE WHEN dc.column_name = 'diocese_id'
                                            THEN 'district_id' ELSE dc.column_name END)),
       '⛔ Ha nem 0: a következő sor NÉV SZERINT felsorolja. A közös app-kód (tablesFor) mindkét ágon UGYANAZT a mezőnevet írja — a hiányzó oszlop 42703-mal buktatja a kerületi könyvelést.'

UNION ALL
SELECT 132, '2/G · OSZLOP-TÜKÖR',
       'A hiányzó párok NÉV SZERINT (üres = rendben)',
       COALESCE((SELECT string_agg(dc.table_name || '.' || dc.column_name, ', ' ORDER BY dc.table_name, dc.column_name)
                 FROM information_schema.columns dc
                 WHERE dc.table_schema = 'public'
                   AND dc.table_name IN ('diocese_bealitas','diocese_befizetes','diocese_kiadas',
                                         'diocese_koltsegvetes','diocese_annual_reports')
                   AND NOT EXISTS (
                         SELECT 1 FROM information_schema.columns kc
                         WHERE kc.table_schema = 'public'
                           AND kc.table_name = replace(dc.table_name, 'diocese_', 'district_')
                           AND kc.column_name = CASE WHEN dc.column_name = 'diocese_id'
                                                     THEN 'district_id' ELSE dc.column_name END)),
                '(nincs hiány — tökéletes tükör)'),
       'Ha itt bármi látszik: a megyei tábla olyan oszlopot kapott, amit a kerületi tükör nem ismer. Küldd vissza a listát — a pótlás egy ADD COLUMN IF NOT EXISTS.'

UNION ALL
SELECT 133, '2/G · OSZLOP-TÜKÖR',
       'A kulcs-oszlopnevek, amikre az app-térkép épül (mind az 5 megvan?)',
       (SELECT count(*)::text || ' / 5' FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND ((col.table_name = 'district_bealitas'       AND col.column_name = 'eve')
            OR (col.table_name = 'district_bealitas'       AND col.column_name = 'szamadas_veglegesitve')
            OR (col.table_name = 'district_bealitas'       AND col.column_name = 'koltsegvetes_veglegesitve')
            OR (col.table_name = 'district_befizetes'      AND col.column_name = 'id_szamadasicel')
            OR (col.table_name = 'district_koltsegvetes'   AND col.column_name = 'szamadasicelid'))),
       'Ezt az 5 nevet a finance-scope-core.ts `tablesFor` HARDKÓDOLTAN írja a district-ágon. Ha nem 5: a kerületi könyvelés az első kattintásra elhasal.'

UNION ALL
SELECT 140, '2/H · MENTÉS-BESOROLÁS',
       'Mind az 5 kerületi tábla besorolva? (globalis / R2 / visszaallithato=false)',
       (SELECT count(*)::text || ' / 5' FROM public.backup_table_policy b
        WHERE b.tabla IN ('district_bealitas','district_befizetes','district_kiadas',
                          'district_koltsegvetes','district_annual_reports')
          AND b.hatokor = 'globalis' AND b.reteg = 2 AND b.visszaallithato = false),
       '⛔ Ha nem 5: a napi mentés MINDEN gyülekezetnél leáll (assertInventoryClassified). Az 1/I őrszemének ezt már meg kellett volna fognia.'

UNION ALL
SELECT 141, '2/H · MENTÉS-BESOROLÁS',
       '⛔ A DÖNTŐ KAPU: van-e besorolatlan ÉLŐ tábla az EGÉSZ sémában? (0 = a mentés elindul)',
       (SELECT count(*)::text || ' besorolatlan'
        FROM information_schema.tables t
        LEFT JOIN public.backup_table_policy b ON b.tabla = t.table_name
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          AND b.hatokor IS NULL),
       'Ha nem 0: NÉZD MEG a 142. sort — lehet, hogy nem ez a fájl hagyta ki, hanem az S5 másik szelete (leltár/iktató) még nem futott le.'

UNION ALL
SELECT 142, '2/H · MENTÉS-BESOROLÁS',
       'A besorolatlan táblák NÉV SZERINT (üres = rendben)',
       COALESCE((SELECT string_agg(t.table_name, ', ' ORDER BY t.table_name)
                 FROM information_schema.tables t
                 LEFT JOIN public.backup_table_policy b ON b.tabla = t.table_name
                 WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
                   AND b.hatokor IS NULL),
                '(nincs besorolatlan tábla)'),
       'Küldd vissza a listát, ha nem üres.'

UNION ALL
SELECT 150, '2/I · SZÁMADÁSI CÉL KATALÓGUS',
       'Hány szamadasicel sor van szint = ''kerulet''-tel?',
       COALESCE((SELECT count(*)::text || ' sor' FROM public.szamadasicel sz
                 WHERE sz.szint = 'kerulet'), '0 sor'),
       '⚠️ EZ A FÁJL SZÁNDÉKOSAN NEM TÖLTÖTTE FEL. MIÉRT: a megyei kör (2026-04-17-szamadasicel-szint.sql) sem hozott létre ÚJ katalógus-sort — 18 MEGLÉVŐ sort címkézett át ''egyhazmegye''-re, Endre NÉV SZERINTI listája alapján. Kerületi lista NINCS, és egy sor átcímkézése ELVENNÉ azt a tételt a gyülekezeti vagy megyei felületről (a „byte-ra változatlan" korlát sérülne). MÉRT TÉNY: a felület nem áll meg emiatt — a szint-szűrés CSAK gyülekezeti hatókörben fut (finance-tabs.tsx: `scope !== ''congregation'' || …`), tehát a kerületi könyv MA a teljes katalógusból választ, ugyanúgy, ahogy a megyei. TEENDŐ: ha Endre kerületi listát ad, az egy KÜLÖN, egysoros UPDATE lesz.'

UNION ALL
SELECT 151, '2/I · SZÁMADÁSI CÉL KATALÓGUS',
       'Összehasonlításul: hány sor van szint = ''egyhazmegye''-vel? (a megyei precedens)',
       COALESCE((SELECT count(*)::text || ' sor' FROM public.szamadasicel sz
                 WHERE sz.szint = 'egyhazmegye'), '0 sor'),
       'A megyei kör 18 sort címkézett át. Ha itt 18 látszik, a precedens ép — és a kerületi lista hiánya az EGYETLEN ok, amiért nincs kerületi címke.'

UNION ALL
SELECT 160, '2/J · NYITOTT PONT (nem hiba)',
       'Kerületi BANKSZÁMLA felvehető-e ma?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(con.oid) LIKE '%egyhazkerulet%'
                             THEN '✅ igen' ELSE '⚠️ NEM (bankszamlak_scope_check: csak gyulekezet|egyhazmegye)' END
                 FROM pg_constraint con
                 WHERE con.conname = 'bankszamlak_scope_check'
                   AND con.conrelid = to_regclass('public.bankszamlak')
                 LIMIT 1),
                '— nincs bankszamlak_scope_check'),
       '⚠️ TUDATOS KIHAGYÁS: a district_befizetes/_kiadas MEGKAPTA a bankszamla_id oszlopot (a megyei tükör), de kerületi bankszámla nyitásához a bankszamlak_scope_check ÉS a bankszamlak_scope_fk_check bővítése + egy districts-re mutató oszlop kellene — az ÉLŐ, gyülekezeti tábla módosítása, ami kívül esik ezen a fájlon. Addig a kerületi könyv készpénzes/számlás tételeket vezet, a bankszamla_id NULL marad. Ha Endre kéri, KÜLÖN fájl nyitja ki.'

UNION ALL
SELECT 170, '2/K · REGRESSZIÓ-ŐR',
       'Változatlan-e a MEGYEI öt tábla policy-készlete? (10 = rendben: 5×_all + 5×_szamvevo_select)',
       (SELECT count(*)::text || ' / 10' FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.policyname IN ('diocese_bealitas_all','diocese_befizetes_all','diocese_kiadas_all',
                                 'diocese_koltsegvetes_all','diocese_annual_reports_all',
                                 'diocese_bealitas_szamvevo_select','diocese_befizetes_szamvevo_select',
                                 'diocese_kiadas_szamvevo_select','diocese_koltsegvetes_szamvevo_select',
                                 'diocese_annual_reports_szamvevo_select')),
       'Ez a fájl EGYETLEN megyei objektumhoz sem nyúlt. Ha itt nem 10 van, az NEM ennek a fájlnak a műve — de akkor is állj meg és jelezd (a megyei szint 2026-08-15 óta élesben fut).'

UNION ALL
SELECT 171, '2/K · REGRESSZIÓ-ŐR',
       'Megvan-e még a megyei tg_update_timestamp() függvény, érintetlenül?',
       CASE WHEN to_regprocedure('public.tg_update_timestamp()') IS NULL
            THEN '⛔ ELTŰNT — a megyei és több gyülekezeti tábla updated_at bélyegzője!'
            ELSE '✅ megvan (ez a fájl SAJÁT district_penzugy_set_updated_at()-et hozott, nem írta felül)' END,
       'A „byte-ra változatlan megyei viselkedés" korlát miatt nem nyúltunk hozzá.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE.                                                                    ║
-- ║ AMI MÉG HÁTRA VAN (NEM ebben a fájlban):                                 ║
-- ║  · S5/a: a leltár + iktató 6 scope-oszlopos táblájának district_id-ja,    ║
-- ║    a háromoszlopos CHECK, a kerületi részleges egyedi indexek, a          ║
-- ║    next_iktato_sequence_district RPC, az iktato_id_district_uk + a        ║
-- ║    harmadik kompozit FK, és a purge_recycle_bin szűkítése.                ║
-- ║  · S5/c (TS): finance-scope.ts `getFinanceScopeContext` district-ága      ║
-- ║    (szamadasicelSzint = 'kerulet', readOnly a kerületi számvevőnél),      ║
-- ║    level-scope.ts canWrite/canReadDistrictScope, module-scope.ts          ║
-- ║    EXHAUSTIVE switch. A tábla-térkép MÁR KÉSZ:                            ║
-- ║    apps/web/lib/auth/finance-scope-core.ts — ez a fájl ANNAK a            ║
-- ║    'district' ágának az adatbázis-oldala, oszlopnévre pontosan.           ║
-- ║  · NYITOTT: kerületi bankszámla + nyugtatömb (bankszamlak /               ║
-- ║    chitanta_tombok scope kinyitása) — külön, tudatos döntés.              ║
-- ║  · NYITOTT: szamadasicel.szint = 'kerulet' katalógus — Endre listájára vár.║
-- ╚══════════════════════════════════════════════════════════════════════════╝
