-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI SZÁMVEVŐ — MEGYEI HOZZÁFÉRÉS (OLVASÁS)          2026-08-11  ║
-- ║ Fájl: migration-docs/sql/2026-08-11-szamvevo-megyei-hozzaferes.sql       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A TULAJDONOS DÖNTÉSE (2026-08-11):
--   „segítsük hogy tudja használni a felületet!" → TÁGÍTJUK az adatbázist.
--
-- A HELYZET: az `egyhazmegyei_szamvevo` ma belép a megyei felületre, és ÜRES
-- képernyőt kap. Az ALKALMAZÁS elfogadja a szerepét (a level-scope.ts BÁRMELY
-- jóváhagyott `diocese`-hatókörű profile_roles sort elfogad), az ADATBÁZIS
-- viszont nem: a `current_user_diocese_ids()` (2026-08-11-globalis-hozzaferes-
-- szukites.sql, 796–846. sor) CSAK az `esperes` és `egyhazmegyei_admin` szerepű
-- sorokat adja vissza — a saját COMMENT-je ki is mondja, hogy ez SZÁNDÉKOSAN
-- szűkebb az appnál.
--
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠️ A LEGFONTOSABB DÖNTÉS: MIÉRT NEM A `current_user_diocese_ids()`-t     ║
-- ║    TÁGÍTJUK — HANEM MELLÉ TESZÜNK EGY OLVASÓ-HATÓKÖRT                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A kézenfekvő „javítás" az lett volna, hogy a `current_user_diocese_ids()`
-- szerep-szűrőjébe beírjuk az `egyhazmegyei_szamvevo`-t. VÉGIGKÖVETVE, HOGY MIT
-- HÍV EZ A FÜGGVÉNY, kiderül, hogy az ÍRÁSJOGOT is megadná — a számvevőnek,
-- akinek a dolga éppen az ELLENŐRZÉS. A hívási lánc (a 2026-08-11-es szűkítő
-- fájlból, sorszámmal):
--
--   current_user_diocese_ids()
--    ├─► dioceses_update_diocese_scope           (1268–1273)  FOR **UPDATE**
--    │      → a számvevő átírhatná az egyházmegye IBAN-ját, CIF-jét, címét.
--    ├─► profile_roles_admin_manage WITH CHECK   (1211–1216)  FOR ALL
--    │      → (külső szerep-kapu miatt a számvevő nem éri el, de ott van)
--    ├─► felettes_szint_szerkesztheto(uuid)      (1000–1016)
--    │      └─► current_user_can_edit_congregation()          (2366–2394)
--    │           → a GYÜLEKEZETI TÖRZSADAT szerkesztése. A függvény saját
--    │             COMMENT-je szó szerint ezt mondja: „Konyvelo és
--    │             egyhazmegyei_szamvevo explicit TILTVA."
--    ├─► felettes_szint_hozzaferese(uuid)        (967–983)
--    │      └─► current_user_can_access_congregation() (3) ága               (2297)
--    │           ├─► a 4/B szakasz `<tábla>_gyulekezeti_all` policy-i (1678–1682)
--    │           │     FOR **ALL** (USING + WITH CHECK): presbiter, felmentes,
--    │           │     penztar, csoport, csoporttagok, korzetfilter …
--    │           └─► ertesitesek_szint_insert   (1436–1443)  FOR **INSERT**
--    └─► felettes_szint_gyulekezet_ids()         (924–948)
--           ├─► a 4. szakasz ~27 `<tábla>_szint_select` policy-ja   FOR SELECT ✅
--           ├─► document_submissions_szint_all   (1371–1378)  FOR **ALL**
--           └─► annual_reports_szint_update      (1404–1411)  FOR **UPDATE**
--
-- VAGYIS: a függvény tágítása NEM olvasás-tágítás. Öt írási úton is átfolyna,
-- köztük a gyülekezeti törzsadaton és a beküldött hivatalos iratok teljes
-- életciklusán (átvétel, véglegesítés, visszaküldés). Az ellenőr írhatná azt,
-- amit ellenőriz — ez a legalapvetőbb összeférhetetlenség.
--
-- MI A BIZONYÍTÉK, HOGY A SZÁMVEVŐ OLVASÓ? Nem a véleményem, hanem a
-- rendszer saját, élő definíciói:
--   1. apps/web/lib/profile-roles/permissions.ts, ROLE_TEMPLATES:
--        egyhazmegyei_szamvevo: { penzugy: readOnly(), eves_jelentes: readOnly() }
--      — a tulajdonos saját szerep-sablonja, CSAK olvasás.
--   2. apps/web/lib/auth/roles.ts: `canReviewFinancial()` beengedi (ellenőrzés),
--      `canEditTvaFlags()` KIZÁRJA (szerkesztés).
--   3. current_user_can_edit_congregation() COMMENT-je (fent idézve).
--
-- EZÉRT A MEGOLDÁS:
--   · a `current_user_diocese_ids()` TÖRZSÉHEZ NEM NYÚLUNK — egyetlen betűjét
--     sem írjuk át. Ez marad az ÍRÁSI (esperes/egyházmegyei admin) hatókör.
--     (Egy elhamarkodott CREATE OR REPLACE ~27 policy gerincét cserélné le
--     abban a hitben, hogy „csak egy szerepnevet írok bele" — a fájl COMMENT-jét
--     viszont FRISSÍTJÜK, hogy a következő olvasót ne vezesse félre.)
--   · MELLÉ kerül egy KÜLÖN, CSAK OLVASÁSI hatókör-feloldó
--     (`current_user_diocese_olvaso_ids()`), amit KIZÁRÓLAG `FOR SELECT`
--     policy-k hívnak. Írási úton EGYETLEN policy sem hivatkozik rá.
--   · a megyei SAJÁT könyveken (`diocese_*` táblák) — ahol a számvevőnek MA
--     van írásjoga, mert a `diocese_*_all` policy `pr.scope = 'diocese'` ága
--     szerep-szűrő NÉLKÜL enged (2026-08-09-megye-kerulet-rls-fix.sql:236) —
--     az OLVASÁS marad, és a TISZTA SZÁMVEVŐNEK az ÍRÁS lezárul. Ez a fájl
--     EGYETLEN szűkítő lépése, és pontosan a döntés szellemében van:
--     „tudja használni", nem „mindent írhat".
--
--     ⚠️ 2026-08-11 (ellenőrzés utáni PONTOSÍTÁS) — MI NEM ZÁRUL LE:
--     a RESTRICTIVE tiltók feltétele a `szamvevo_megyei_olvaso_e()`, ami
--     KIZÁRÓLAG `role = 'egyhazmegyei_szamvevo'` sorokat ismer. Egy `custom`
--     (pl. „Egyházmegyei titkárnő"), `konyvelo` vagy `lelkesz` szerepű,
--     `scope='diocese'` profile_roles sor tulajdonosára a függvény HAMIS →
--     `WITH CHECK (NOT false)` = igaz → a `diocese_*_all` szerep-szűrő nélküli
--     harmadik ága VÁLTOZATLANUL beengedi: bevételt rögzíthet, kiadást
--     törölhet a megye könyveiben. Ez 2026-08-11 ELŐTTI, meglévő viselkedés
--     — ez a fájl NEM okozza, de nem is szünteti meg.
--     A 0/C diagnosztika NÉV SZERINT felsorolja ezeket a személyeket. Ha le
--     akarod zárni náluk is az írást, futtasd az OPCIONÁLIS 1/D blokkot
--     (a fájl végén, kikommentelve) — az egy tudatos, külön döntés, mert egy
--     ma dolgozó megyei titkárnő munkafolyamatát is elvághatja.
--
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MEKKORA AZ OLVASÁSI FELÜLET — ÉS MIÉRT NEM NAGYOBB                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- NEM tágítjuk a 4. szakasz ~27 `<tábla>_szint_select` policy-ját (szemely,
-- befizetes, kiadas, keresztseg, hazassag, temetes …). Miért nem:
--   · a megyei szint ALAPELVE (2026-04-17, kiírva a dashboard-egyhazmegye/
--     page.tsx 19–27. sorába és a diocese-dashboard-tabs.tsx fejlécébe):
--       „Az egyházmegye CSAK a gyülekezetek által kötelezően leadott évi
--        dokumentumokat láthatja. NEM kérdezhet közvetlenül a befizetes,
--        kiadas, szemely, keresztseg, hazassag, temetes, konfirmalas táblákból."
--     Ez az ESPERESRE is áll — a számvevő nem kaphat többet nála.
--   · a ROLE_TEMPLATES megjegyzése a számvevőnél szó szerint: „a beküldött
--     snapshot-okon". A számvevő a BEADOTT, fagyasztott iratot ellenőrzi, nem
--     a gyülekezet élő könyvelését.
--   · a `szemely` tábla CNP-t tartalmaz. Egy pénzügyi ellenőrnek nincs rá
--     szüksége, és a megye teljes tagnyilvántartását megnyitni egy audit-szerep
--     kedvéért aránytalan.
--
-- AMIT VISZONT MEGKAP (pontosan a megyei felület adatforrásai):
--   document_submissions · annual_reports · bealitas (csak a feloldás/zárás
--   jelzők miatt) · lelkeszi_jelentes · chitanta_tombok (megyei nyugtatömb) ·
--   minden `diocese_*` tábla (a MEGYE SAJÁT könyvei) — MIND csak SELECT.
--   A `congregations` / `dioceses` / `districts` olvasása már ma is nyitott
--   (`*_read` policy `USING (true)`), azt ez a fájl nem érinti.
--
-- HA A SZÁMVEVŐNEK EGY KONKRÉT GYÜLEKEZET KÖNYVEIBE IS BE KELL NÉZNIE, arra
-- MA IS VAN ÚT, és az jobb is: a `profile_congregations` jóváhagyott
-- hozzárendelés (a `current_user_can_access_congregation()` (4) és (5) ága) —
-- ott a LELKÉSZ hagyja jóvá, gyülekezetenként. Ezt nem váltjuk ki egy néma,
-- megye-szintű ablakkal.
--
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ A `custom` (scope = 'diocese') SZEREPEK — KÜLÖN KÉRDÉS, VÁLASZ: NEM      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Bejönnének-e? NEM — sem az írási, sem az olvasási hatókörbe nem vesszük fel.
-- Kell-e ez? NEM, és nem is szabad. Indoklás:
--   · a `custom` szerep JELENTÉSE a `permissions` JSONB-ben él (pl. „Egyházmegyei
--     titkárnő" = { iktato: { read: true } }). Az RLS a `permissions` mezőt
--     NEM tudja értelmezni — a `profile_roles_role_check` engedi a `custom`-ot
--     (2026-04-17-profile-roles-fazis-1.sql:74–85), de a policy számára minden
--     `custom` sor egyforma.
--   · ha a `custom`-ot beengednénk, egy üres permissions-ű „Titkárnő" sor
--     ugyanazt a teljes megyei olvasást kapná, mint a számvevő. Ez korlátlan,
--     ellenőrizhetetlen tágítás — pont az a hibaosztály, amit a szűkítő fájl
--     (b) pontja néven nevezett.
--   · HELYES ÚT: aki megyei rálátást kap, kapjon NEVESÍTETT szerepet
--     (`egyhazmegyei_szamvevo`) — az látszik a szerepkör-listákban, auditálható,
--     és egy sorral visszavonható. A 0/C 004-es diagnosztika NÉV SZERINT
--     felsorolja a ma élő `custom` megyei sorokat, hogy a tulajdonos egyenként
--     dönthessen róluk.
-- Ugyanezért NEM engedjük be a `konyvelo` és `lelkesz` szerepű, `diocese`
-- hatókörű sorokat sem (ha egyáltalán van ilyen — lásd a 002-es sort).
--
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FUTTATÁSI SORREND — A SUPABASE STUDIO CSAK AZ UTOLSÓ UTASÍTÁST MUTATJA!  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
--   1.  0. SZAKASZ  — ÁLLAPOTFELMÉRÉS. EGYETLEN SELECT, UNION ALL-lal fűzve.
--                     Jelöld ki CSAK a 0. szakaszt, futtasd, és OLVASD EL.
--                     Amíg a 004/005-ös sorokat nem nézted meg, ne menj tovább.
--   2.  1. SZAKASZ  — A TÁGÍTÁS + AZ ÍRÁS-LEZÁRÁS. EGYETLEN tranzakció
--                     (egy BEGIN … COMMIT), mert az olvasás-tágítás és a
--                     megyei könyvek írás-lezárása nem kerülhet külön időbe.
--   ⚠️  1/D SZAKASZ — OPCIONÁLIS, KIKOMMENTELVE. A `custom` / `konyvelo` /
--                     `lelkesz` szerepű megyei sorok ÍRÁSÁNAK lezárása.
--                     CSAK a 0/C lista elolvasása után, tudatos döntésként.
--   3.  2. SZAKASZ  — ELLENŐRZÉS. Szintén EGYETLEN SELECT.
--   4.  3. SZAKASZ  — FÜST-TESZT: mit kattints számvevő fiókkal.
--   ⛔  4. SZAKASZ  — TELJES VISSZAÁLLÍTÁS, csak baj esetén.
--
-- IDEMPOTENS: minden CREATE előtt DROP IF EXISTS / CREATE OR REPLACE; a fájl
-- akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL' AS szakasz,
       'Létezik-e a current_user_diocese_ids()?' AS mit,
       COALESCE((SELECT 'IGEN'
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids'
                 LIMIT 1), 'NINCS') AS ertek,
       'Ha NINCS: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 1. SZAKASZÁT futtasd. E nélkül ez a fájl értelmetlen.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTEL',
       'Tartalmazza-e MÁR a törzse a szamvevo-t? (= valaki mégis kitágította)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%egyhazmegyei_szamvevo%'
                             THEN '⚠️ IGEN — a törzs MÁR EMLÍTI. NE FUTTASD, előbb nézd meg kézzel!'
                             ELSE 'nem (várt állapot)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids'
                 LIMIT 1), 'nincs függvény'),
       'Ez a fájl SZÁNDÉKOSAN nem nyúl a törzshöz. Ha valaki mégis átírta, előbb tisztázd, mit és miért.'

UNION ALL
SELECT 3, '0/A · ELŐFELTÉTEL',
       'Lefutott-e MÁR ez a fájl? (current_user_diocese_olvaso_ids)',
       CASE WHEN to_regprocedure('public.current_user_diocese_olvaso_ids()') IS NULL
            THEN 'nem (első futás)' ELSE 'IGEN — újrafuttatás (idempotens, rendben)' END,
       'Tájékoztató.'

-- ── 0/B · KIT ÉRINT? A `diocese` hatókörű szerepkör-sorok szerep szerint ────
UNION ALL
SELECT (100 + row_number() OVER (ORDER BY pr.role))::int, '0/B · MEGYEI SZEREPKÖR-SOROK',
       'profile_roles: scope=diocese, aktív+jóváhagyott — szerep: ' || pr.role,
       count(*)::text || ' sor / ' || count(DISTINCT pr.profile_id)::text || ' fő',
       CASE
         WHEN pr.role IN ('esperes', 'egyhazmegyei_admin')
           THEN 'ÍRÁSI hatókör — ma is működik, ez a fájl nem érinti.'
         WHEN pr.role = 'egyhazmegyei_szamvevo'
           THEN '⭐ ŐK KAPJÁK MEG az OLVASÁST ettől a fájltól — és NEKIK zárul le az írás a megyei könyveken.'
         ELSE '⚠️ OLVASÁST nem kap (lásd a fejléc „custom" szakaszát) — DE a megye könyveit MA IS ÍRHATJA (diocese_*_all, szerep-szűrő nélküli ág), és ezt a fájl NEM zárja le. Részletek + döntési lehetőségek a 0/C sorokban.'
       END
FROM public.profile_roles pr
WHERE pr.scope = 'diocese' AND pr.active = true AND pr.approval_status = 'approved'
GROUP BY pr.role

-- ── 0/C · A `custom` megyei sorok NÉV SZERINT (egyenkénti döntéshez) ────────
--    ⚠️ 2026-08-11 (ellenőrzés utáni JAVÍTÁS): a korábbi teendő-szöveg csak azt
--    mondta, hogy „nem lát semmit" — miközben a lényeg az, hogy ÍRHATJA a megye
--    könyveit. A tulajdonos ez alapján nem tudott helyes döntést hozni.
UNION ALL
SELECT (200 + row_number() OVER (ORDER BY p.full_name))::int, '0/C · CUSTOM MEGYEI SOROK',
       'custom/konyvelo/lelkesz megyei sor: ' || COALESCE(p.full_name, '(névtelen)')
         || ' — ' || COALESCE(pr.custom_label, pr.role)
         || ' @ ' || COALESCE(d.name, '(ismeretlen megye)'),
       'szerep=' || pr.role || ', profil-státusz=' || COALESCE(p.status, '?'),
       '⚠️⚠️ EZ A SZEMÉLY MA IS ÍRHATJA A MEGYE KÖNYVEIT (diocese_befizetes / diocese_kiadas / diocese_bealitas / diocese_koltsegvetes / diocese_annual_reports) — '
         || 'a `diocese_*_all` policy „pr.scope = ''diocese''" ága szerep-szűrő NÉLKÜL engedi. Bevételt rögzíthet, kiadást törölhet, költségvetést véglegesíthet. '
         || 'EZT A FÁJL NEM ZÁRJA LE (a szamvevo_megyei_olvaso_e() csak az egyhazmegyei_szamvevo szerepet ismeri). '
         || 'OLVASNI viszont a fájl után SEM fog megyei szinten (a permissions JSONB-t az RLS nem tudja értelmezni). '
         || 'DÖNTS: (a) ha kell neki a megyei rálátás → adj NEVESÍTETT `egyhazmegyei_szamvevo` sort; '
         || '(b) ha NEM szabad írnia → futtasd az OPCIONÁLIS 1/D blokkot (a fájl végén, kikommentelve); '
         || '(c) ha rendben van, hogy ír (pl. megyei titkárnő rögzít) → hagyd így, de tudd, hogy nincs szerep-szűrő mögötte.'
FROM public.profile_roles pr
JOIN public.profiles p ON p.id = pr.profile_id
LEFT JOIN public.dioceses d ON d.id = pr.scope_id
WHERE pr.scope = 'diocese' AND pr.active = true AND pr.approval_status = 'approved'
  AND pr.role NOT IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')

-- ── 0/D · A SZÁMVEVŐK NÉV SZERINT: lesz-e hatókörük a fájl után? ───────────
UNION ALL
SELECT (300 + row_number() OVER (ORDER BY p.full_name))::int, '0/D · SZÁMVEVŐK',
       'Számvevő: ' || COALESCE(p.full_name, '(névtelen)') || ' (' || COALESCE(p.email, '?') || ')',
       CASE
         WHEN EXISTS (SELECT 1 FROM public.profile_roles pr
                      WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                        AND pr.role = 'egyhazmegyei_szamvevo'
                        AND pr.active = true AND pr.approval_status = 'approved'
                        AND pr.scope_id IS NOT NULL)
           THEN '✅ van szerepkör-sor → LÁTNI FOG'
         WHEN p.diocese_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                           WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                             AND pr.active = true AND pr.approval_status = 'approved'
                             AND pr.scope_id IS NOT NULL)
           THEN '✅ skalár profiles.diocese_id (tartalék ág) → LÁTNI FOG'
         ELSE '⛔ NINCS feloldható egyházmegyéje → a fájl után SEM lát semmit'
       END,
       CASE WHEN p.status <> 'active'
            THEN '⚠️ A profil státusza NEM active (' || COALESCE(p.status, '?') || ') — a hatókör-feloldó ilyenkor üres tömböt ad (fail-closed). Előbb aktiváld.'
            ELSE 'Ha ⛔: rendeld hozzá az egyházmegyét (szerepkör-sor vagy profiles.diocese_id).' END
FROM public.profiles p
WHERE p.role = 'egyhazmegyei_szamvevo'
   OR EXISTS (SELECT 1 FROM public.profile_roles pr
              WHERE pr.profile_id = p.id AND pr.role = 'egyhazmegyei_szamvevo'
                AND pr.active = true AND pr.approval_status = 'approved')

-- ── 0/E · BIZONYÍTÉK: mely policy-k hívják a felettes_szint_gyulekezet_ids-t ─
--    (parancs szerint — ez indokolja az olvasás/írás szétválasztást)
UNION ALL
SELECT (400 + row_number() OVER (ORDER BY pol.cmd, pol.tablename, pol.policyname))::int,
       '0/E · MIÉRT KÜLÖN OLVASÓ-FÜGGVÉNY',
       'A felettes_szint_gyulekezet_ids()-t hívja: ' || pol.tablename || '.' || pol.policyname,
       'parancs = ' || pol.cmd || ', permissive = ' || pol.permissive,
       CASE WHEN pol.cmd = 'SELECT'
            THEN 'olvasás — a tágítás itt lenne ártalmatlan'
            ELSE '⚠️ ÍRÁS IS! Ezért NEM tágítjuk a közös függvényt.' END
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
        LIKE '%felettes_szint_gyulekezet_ids%'

-- ── 0/F · A MEGYEI SAJÁT KÖNYVEK (diocese_*): mi lesz itt lezárva? ──────────
UNION ALL
SELECT (500 + row_number() OVER (ORDER BY c.relname))::int, '0/F · MEGYEI SAJÁT KÖNYVEK',
       'diocese_* tábla: ' || c.relname,
       'RLS = ' || CASE WHEN c.relrowsecurity THEN 'BE' ELSE '⛔ KI' END
         || ', policy-k: ' || (SELECT count(*)::text FROM pg_policies pp
                               WHERE pp.schemaname = 'public' AND pp.tablename = c.relname)
         || ', van RESTRICTIVE: ' || CASE WHEN EXISTS (
                SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public'
                  AND pp.tablename = c.relname AND pp.permissive = 'RESTRICTIVE')
              THEN 'IGEN' ELSE 'nem' END,
       'Az 1/C lépés ide tesz olvasó SELECT policy-t + RESTRICTIVE írás-tiltást a tiszta számvevőnek. Ha az RLS KI van kapcsolva, a policy TÉTLEN — ott a GRANT véd, nem az RLS.'
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'diocese\_%'
  AND EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema = 'public' AND col.table_name = c.relname
                AND col.column_name = 'diocese_id' AND col.data_type = 'uuid')

-- ── 0/G · MA IS MEGLÉVŐ ÚT: jóváhagyott gyülekezeti hozzárendelések ─────────
UNION ALL
SELECT 600, '0/G · GYÜLEKEZETENKÉNTI ÚT',
       'Számvevői profile_congregations sorok (aktív + jóváhagyott)',
       (SELECT count(*)::text FROM public.profile_congregations pc
        JOIN public.profiles p ON p.id = pc.profile_id
        WHERE pc.active = true AND pc.approval_status = 'approved'
          AND p.role = 'egyhazmegyei_szamvevo'),
       'Ezen az úton a számvevő MA IS lát KONKRÉT gyülekezetet — a lelkész jóváhagyásával. Ezt a fájl nem érinti és nem is váltja ki.'

-- ── 0/H · Az érintett táblákon be van-e kapcsolva az RLS? ──────────────────
UNION ALL
SELECT (700 + row_number() OVER (ORDER BY t.tabla))::int, '0/H · RLS-ÁLLAPOT',
       'Olvasásra megnyitandó tábla: ' || t.tabla,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relname = t.tabla)
           THEN '⛔ NINCS ILYEN TÁBLA (a fájl kihagyja)'
         WHEN (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t.tabla)
           THEN 'RLS BE — a policy hatni fog'
         ELSE '⚠️ RLS KI — a policy TÉTLEN lesz'
       END,
       'Ha RLS KI: az adott tábla a GRANT alapján amúgy is nyitva van; az RLS bekapcsolása KÜLÖN, tudatos döntés (üzemi kiesést okozhat).'
FROM (VALUES ('document_submissions'), ('annual_reports'), ('bealitas'),
             ('lelkeszi_jelentes'), ('chitanta_tombok')) AS t(tabla)

-- ── 0/I · VAN-E MA KERÜLETI OLVASÓ ÁG? (ez dönti el, mivel kötjük be) ───────
--    Ha egy táblán MA NINCS kerületi olvasás, akkor az új policy-t NEM szabad
--    a kerület-tudatos felettes_szint_olvaso_gyulekezet_ids()-szel adni, mert
--    azzal az egyházkerületi adminok ÚJ olvasást kapnának — mellékhatásként.
--    Az 1/B ciklus emiatt kétféle hatókört használ; ez a sor a BIZONYÍTÉK.
UNION ALL
SELECT (800 + row_number() OVER (ORDER BY t.tabla))::int, '0/I · KERÜLETI OLVASÓ ÁG',
       'Van-e ma kerületi (district) olvasó policy: ' || t.tabla,
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies pol
              WHERE pol.schemaname = 'public' AND pol.tablename = t.tabla
                AND pol.cmd IN ('SELECT', 'ALL')
                AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
                      ~ '(current_user_district_ids|felettes_szint_gyulekezet_ids|district_id)')
            THEN 'IGEN — a kerületi admin már ma is olvas'
            ELSE 'nem — a kerületi admin MA NEM olvas' END,
       CASE WHEN t.tabla IN ('bealitas', 'lelkeszi_jelentes')
            THEN 'A fájl ezt a táblát SZÁNDÉKOSAN a KERÜLET NÉLKÜLI current_user_diocese_olvaso_ids()-szal köti be (1/B, ''megye'' hatókör). Ha itt „IGEN" áll, valaki azóta adott kerületi ágat — akkor a ''felettes'' hatókör is rendben lenne, de akkor is TUDATOS döntés legyen.'
            ELSE 'A fájl ezt a táblát a felettes_szint_olvaso_gyulekezet_ids()-szel köti be — a kerületi láb itt redundáns (nem ad új olvasást).' END
FROM (VALUES ('document_submissions'), ('annual_reports'),
             ('bealitas'), ('lelkeszi_jelentes')) AS t(tabla)

-- ── 0/J · HÁNY KERÜLETI ADMIN ÉRINTETT? (nagyságrend a döntéshez) ───────────
UNION ALL
SELECT 900, '0/J · KERÜLETI ADMINOK',
       'Aktív egyházkerületi admin (skalár VAGY profile_roles district sor)',
       (SELECT count(DISTINCT p.id)::text
        FROM public.profiles p
        WHERE p.status = 'active'
          AND (p.role = 'egyhazkeruleti_admin'
            OR EXISTS (SELECT 1 FROM public.profile_roles pr
                       WHERE pr.profile_id = p.id AND pr.scope = 'district'
                         AND pr.active = true AND pr.approval_status = 'approved'
                         AND pr.scope_id IS NOT NULL))),
       'Tájékoztató: EZEK a személyek kaptak volna új olvasást a bealitas + lelkeszi_jelentes táblán, ha a fájl ott a kerület-tudatos feloldót használná. A javított változat NEM ad nekik semmit.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A TÁGÍTÁS (OLVASÁS) + AZ ÍRÁS LEZÁRÁSA     FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ. Az olvasás-tágítás és a megyei könyvek           ║
-- ║    írás-lezárása EGYÜTT lép életbe — soha nem lehet olyan pillanat,      ║
-- ║    amikor a számvevő már lát, de még írhat is.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ──────────────────────────────────────
DO $orszem$
BEGIN
  IF to_regprocedure('public.current_user_diocese_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a public.current_user_diocese_ids() — előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 1. SZAKASZÁT futtasd.';
  END IF;
  IF to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a public.current_user_district_ids() — ugyanaz a teendő.';
  END IF;
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a public.current_user_has_global_access() — nem ez az adatbázis.';
  END IF;

  -- Ha valaki MÉGIS beleírta a szamvevo-t a közös (írásra is használt)
  -- feloldóba, ez a fájl NEM futhat le: a két megoldás együtt duplán,
  -- ellenőrizhetetlenül tágítana.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids'
      AND p.prosrc LIKE '%egyhazmegyei_szamvevo%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_diocese_ids() törzse MÁR EMLÍTI az egyhazmegyei_szamvevo-t. Ez a fájl abból indul ki, hogy az az ÍRÁSI hatókör maradt. Előbb tisztázd a 0/A 2-es sort!';
  END IF;
END
$orszem$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) HATÓKÖR-FELOLDÓK — CSAK OLVASÁSHOZ
-- ────────────────────────────────────────────────────────────────────────────
-- Mindhárom függvény PONTOSAN azt a mintát követi, amit a szűkítő fájl 1a
-- szakasza rögzített, ugyanazokkal a szándékos döntésekkel:
--   (a) `profiles.status = 'active'` kapu MINDKÉT lábon — az `admin_user_status_rpc`
--       deaktiváláskor csak a profiles.status-t írja, a profile_roles sorokat nem
--       bántja; kapu nélkül egy felfüggesztett számvevő az ottfelejtett soron át
--       tovább olvasna.
--   (b) SZEREP-SZŰRŐ a visszaadott sorokon (itt: `egyhazmegyei_szamvevo`).
--   (c) A SKALÁR-ELNYOMÁS SZEREP-FÜGGETLEN: ha VAN bármilyen jóváhagyott,
--       aktív `diocese` sor, a (esetleg elavult) `profiles.diocese_id` NEM
--       bővíti a hatókört. Így egy visszavont szerep melletti régi skalár nem nyit.
-- FAIL-CLOSED: a COALESCE(..., '{}') miatt SOSEM ad NULL-t.

CREATE OR REPLACE FUNCTION public.current_user_diocese_szamvevo_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $szamvevo_megyek$
  -- v2026-08-11-szamvevo
  WITH aktiv_hivo AS (
    SELECT p.id, p.role, p.diocese_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'                 -- (a) aktivitási kapu
  ),
  barmely_megyei_sor AS (                     -- (c) szerep-FÜGGETLEN elnyomás
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'diocese'
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
  ),
  szerep_sorok AS (                           -- (b) szerep-szűrt visszaadás
    SELECT pr.scope_id AS diocese_id
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'diocese'
      AND pr.role = 'egyhazmegyei_szamvevo'
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM aktiv_hivo)
  ),
  skalar_fallback AS (
    SELECT h.diocese_id
    FROM aktiv_hivo h
    WHERE h.role = 'egyhazmegyei_szamvevo'
      AND h.diocese_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM barmely_megyei_sor)
  )
  SELECT COALESCE(array_agg(DISTINCT s.diocese_id), '{}'::uuid[])
  FROM (
    SELECT diocese_id FROM szerep_sorok
    UNION
    SELECT diocese_id FROM skalar_fallback
  ) s;
$szamvevo_megyek$;

COMMENT ON FUNCTION public.current_user_diocese_szamvevo_ids() IS
  '2026-08-11: a hívó SZÁMVEVŐI (ellenőri) egyházmegye-hatóköre (uuid[]). CSAK OLVASÁSI policy-k hívhatják — a számvevő dolga a pénzügyi ELLENŐRZÉS, nem a rögzítés. Kétlábú, fallback-elvű feloldás, profiles.status = ''active'' kapuval, a current_user_diocese_ids() mintájára. A `custom` / `konyvelo` / `lelkesz` szerepű diocese-sorok SZÁNDÉKOSAN NINCSENEK benne (a permissions JSONB-t az RLS nem tudja értelmezni — az korlátlan tágítás lenne). Üres tömb = nincs hatókör (FAIL-CLOSED), sosem NULL.';


CREATE OR REPLACE FUNCTION public.current_user_diocese_olvaso_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $olvaso_megyek$
  -- v2026-08-11-szamvevo — az ÍRÁSI hatókör ∪ a SZÁMVEVŐI hatókör
  SELECT COALESCE(
    (SELECT array_agg(DISTINCT x)
     FROM unnest(public.current_user_diocese_ids()
                 || public.current_user_diocese_szamvevo_ids()) AS t(x)),
    '{}'::uuid[]);
$olvaso_megyek$;

COMMENT ON FUNCTION public.current_user_diocese_olvaso_ids() IS
  '2026-08-11: a hívó OLVASÁSI egyházmegye-hatóköre (uuid[]) = current_user_diocese_ids() (esperes/egyhazmegyei_admin — írás is) ∪ current_user_diocese_szamvevo_ids() (számvevő — csak olvasás). ⚠️ EZT KIZÁRÓLAG `FOR SELECT` POLICY HÍVHATJA. Ha valaki írási ágba (FOR ALL / INSERT / UPDATE / DELETE policy USING vagy WITH CHECK kifejezésébe) teszi, az írásjogot ad az ellenőrnek arra, amit ellenőriz. A 2. szakasz ellenőrzése ezt méri.';


CREATE OR REPLACE FUNCTION public.felettes_szint_olvaso_gyulekezet_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $olvaso_congs$
  -- v2026-08-11-szamvevo — a felettes_szint_gyulekezet_ids() OLVASÓ párja.
  --
  -- A kerületi láb (`current_user_district_ids()`) MAGÁBAN A FÜGGVÉNYBEN
  -- változatlan: ez a függvény pontosan annyi kerületi gyülekezetet ad, mint a
  -- párja. DE ⚠️ EBBŐL NEM KÖVETKEZIK, hogy a kerületi adminok hatóköre ne
  -- tágulhatna: ha egy TÁBLÁN MA NINCS kerületi olvasó ág, és erre a függvényre
  -- építünk rajta ÚJ policy-t, akkor a kerületi admin ÚJ olvasást kap.
  -- Pontosan ez volt a helyzet a `bealitas` és a `lelkeszi_jelentes` táblán
  -- (nekik csak `role IN ('esperes','egyhazmegyei_admin')` megyei lábuk van,
  -- és a 2026-08-11-globalis-hozzaferes-szukites.sql a `_szint_select` ciklusból
  -- NÉV SZERINT kihagyta őket) — ezért az 1/B ciklus azt a két táblát NEM ezzel,
  -- hanem a KERÜLET NÉLKÜLI `current_user_diocese_olvaso_ids()`-szal köti be.
  -- A `document_submissions` és az `annual_reports` esetén nincs ilyen gond:
  -- ott a `*_szint_*` policy-k már ma is a kerületi lábat is tartalmazó
  -- `felettes_szint_gyulekezet_ids()`-t hívják.
  WITH sc AS (
    SELECT public.current_user_diocese_olvaso_ids() AS megyek,
           public.current_user_district_ids()       AS keruletek
  )
  SELECT CASE
    WHEN sc.megyek = '{}'::uuid[] AND sc.keruletek = '{}'::uuid[]
      THEN '{}'::uuid[]                      -- rövidzár: minden lelkész itt megáll
    ELSE COALESCE((
      SELECT array_agg(DISTINCT c.id)
      FROM public.congregations c
      LEFT JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE c.diocese_id  = ANY (sc.megyek)
         OR d.district_id = ANY (sc.keruletek)
    ), '{}'::uuid[])
  END
  FROM sc;
$olvaso_congs$;

COMMENT ON FUNCTION public.felettes_szint_olvaso_gyulekezet_ids() IS
  '2026-08-11: a hívó OLVASÁSI hatókörébe eső gyülekezet-azonosítók (uuid[]) — a felettes_szint_gyulekezet_ids() párja, de a SZÁMVEVŐI megyékkel bővítve. ⚠️ CSAK `FOR SELECT` policy hívhatja. A congregations.diocese_id → dioceses.district_id VALÓDI láncon old fel. `(SELECT …)` burkolással hívd, hogy a tervező InitPlan-ként lekérdezésenként EGYSZER futtassa. Üres tömb = nincs hatókör (FAIL-CLOSED).';


-- ⭐ 2026-08-11 (ellenőrzés utáni JAVÍTÁS): a fenti függvény KERÜLET NÉLKÜLI
-- párja. Azokra a táblákra kell, ahol MA SINCS kerületi olvasó ág (`bealitas`,
-- `lelkeszi_jelentes`) — ott a kerület-tudatos feloldó MELLÉKHATÁSKÉNT új
-- olvasást adna az egyházkerületi adminoknak. Lásd az 1/B ciklus fejlécét.
-- SECURITY DEFINER: így akkor sem szűkül némán, ha a `congregations` SELECT
-- policy-ja valaha szigorodik (ma `USING (true)`).
CREATE OR REPLACE FUNCTION public.megyei_olvaso_gyulekezet_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $megye_congs$
  -- v2026-08-11-szamvevo
  WITH sc AS (SELECT public.current_user_diocese_olvaso_ids() AS megyek)
  SELECT CASE
    WHEN sc.megyek = '{}'::uuid[] THEN '{}'::uuid[]   -- rövidzár (fail-closed)
    ELSE COALESCE((
      SELECT array_agg(DISTINCT c.id)
      FROM public.congregations c
      WHERE c.diocese_id = ANY (sc.megyek)
    ), '{}'::uuid[])
  END
  FROM sc;
$megye_congs$;

COMMENT ON FUNCTION public.megyei_olvaso_gyulekezet_ids() IS
  '2026-08-11 (számvevő-kör): a hívó MEGYEI olvasási hatókörébe eső gyülekezet-azonosítók (uuid[]) — KERÜLETI LÁB NÉLKÜL. A felettes_szint_olvaso_gyulekezet_ids() szűkebb párja: azokon a táblákon kell, ahol MA SINCS kerületi olvasó ág (bealitas, lelkeszi_jelentes), mert ott a kerület-tudatos feloldó mellékhatásként ÚJ olvasást adna az egyházkerületi adminoknak. ⚠️ CSAK `FOR SELECT` policy hívhatja. `(SELECT …)` burkolással hívd (InitPlan). Üres tömb = nincs hatókör (FAIL-CLOSED).';


CREATE OR REPLACE FUNCTION public.szamvevo_megyei_olvaso_e()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $tiszta_szamvevo$
  -- v2026-08-11-szamvevo
  -- IGAZ, ha a hívónak VAN számvevői megyei hatóköre, ÉS SEMMILYEN írási
  -- hatóköre nincs. Aki egyszerre esperes ÉS számvevő (előfordul), az az
  -- esperesi jogán TOVÁBBRA IS ÍRHAT — ez a függvény rá HAMIS.
  SELECT public.current_user_diocese_szamvevo_ids() <> '{}'::uuid[]
     AND public.current_user_diocese_ids()          =  '{}'::uuid[]
     AND public.current_user_district_ids()         =  '{}'::uuid[]
     AND NOT public.current_user_has_global_access();
$tiszta_szamvevo$;

COMMENT ON FUNCTION public.szamvevo_megyei_olvaso_e() IS
  '2026-08-11: IGAZ, ha a hívó TISZTA megyei ellenőr — van számvevői megye-hatóköre, de SEMMILYEN írási (esperes / egyházmegyei admin / kerületi admin / rendszergazda) hatóköre nincs. Aki egyszerre esperes és számvevő, arra HAMIS: az esperesi jogán tovább írhat. A diocese_* táblák RESTRICTIVE írás-tiltó policy-i ezt hívják.';

-- ── JOGOK ──────────────────────────────────────────────────────────────────
-- A PostgreSQL alapból EXECUTE-ot ad a PUBLIC-nak → definer-jogú felület
-- maradna hitelesítetlen hívónak (a 2026-08-10-es anon-higiéniai kör után ez
-- nem elfogadható), ezért REVOKE + célzott GRANT.
REVOKE ALL ON FUNCTION public.current_user_diocese_szamvevo_ids()     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_diocese_olvaso_ids()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.felettes_szint_olvaso_gyulekezet_ids()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.megyei_olvaso_gyulekezet_ids()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.szamvevo_megyei_olvaso_e()              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_diocese_szamvevo_ids()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_olvaso_ids()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_olvaso_gyulekezet_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.megyei_olvaso_gyulekezet_ids()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.szamvevo_megyei_olvaso_e()             TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_diocese_szamvevo_ids()    TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_olvaso_ids()      TO service_role;
GRANT EXECUTE ON FUNCTION public.felettes_szint_olvaso_gyulekezet_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.megyei_olvaso_gyulekezet_ids()         TO service_role;
GRANT EXECUTE ON FUNCTION public.szamvevo_megyei_olvaso_e()             TO service_role;

-- A régi függvény COMMENT-jének pontosítása (a TÖRZSÉHEZ NEM NYÚLUNK).
-- Enélkül a következő olvasó azt hinné, hogy a szamvevo-ügy még nyitott.
COMMENT ON FUNCTION public.current_user_diocese_ids() IS
  'A bejelentkezett felhasználó ÍRÁSI egyházmegye-hatóköre (uuid[]): esperes / egyhazmegyei_admin. Kétlábú, fallback-elvű feloldás; a hívó profiles.status = ''active'' kell legyen. ⚠️ SZÁNDÉKOSAN SZŰKEBB az apps/web/lib/auth/level-scope.ts-nél: az app BÁRMELY approved+active diocese-sort elfogad, ez CSAK az esperes/egyhazmegyei_admin szerepűeket. 2026-08-11 (számvevő-kör): az `egyhazmegyei_szamvevo` SZÁNDÉKOSAN NINCS benne — ezt a függvényt öt írási úton is hívják (dioceses UPDATE, gyülekezeti törzsadat UPDATE, document_submissions FOR ALL, annual_reports UPDATE, a 4/B `<tábla>_gyulekezeti_all` FOR ALL policy-k), és az ellenőrnek nincs írásjoga. A számvevő OLVASÁSI hatóköre külön él: current_user_diocese_olvaso_ids(). A skalár-ELNYOMÁS szerep-független. Üres tömb = nincs hatókör (FAIL-CLOSED), sosem NULL.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) A MEGYEI FELÜLET ADATFORRÁSAI — ADDITÍV `FOR SELECT` POLICY-K
-- ────────────────────────────────────────────────────────────────────────────
-- MIÉRT BIZTONSÁGOS: PERMISSIVE + CSAK SELECT → a PERMISSIVE policy-k
-- VAGY-olódnak, tehát SENKITŐL nem vesz el semmit, és írási utat nem nyit.
-- MIKOR NEM ELÉG: ha a táblán RESTRICTIVE policy is van (ÉS-elődik), vagy ha
-- az RLS nincs bekapcsolva (a policy tétlen) — a ciklus mindkettőt jelzi.
--
-- A LISTA SZÁNDÉKOSAN RÖVID (lásd a fejléc „mekkora az olvasási felület"
-- szakaszát). Ha később egy tábla mégis kell, IDE vedd fel — de akkor is
-- CSAK `FOR SELECT`, és CSAK olvasó hatókör-feloldóval.
--
-- ⚠️ 2026-08-11 (ellenőrzés utáni JAVÍTÁS) — MIÉRT KÉTFÉLE HATÓKÖR:
-- ────────────────────────────────────────────────────────────────────────────
-- Az eredeti változat MIND A NÉGY táblát a `felettes_szint_olvaso_gyulekezet_ids()`
-- -szel kötötte be. Az a függvény a MEGYEI olvasó hatókör MELLETT a KERÜLETIT is
-- feloldja (`current_user_district_ids()`). Ez két táblán ártalmatlan, kettőn
-- viszont NEM — és ez MELLÉKHATÁS lett volna, nem szándék:
--
--   · document_submissions, annual_reports → a `*_szint_*` policy-juk MA IS a
--     kerületi lábat is tartalmazó `felettes_szint_gyulekezet_ids()`-t hívja
--     (2026-08-11-globalis-hozzaferes-szukites.sql:1371-1411), tehát a kerületi
--     admin ott már ma is olvas. Az új policy neki REDUNDÁNS. → 'felettes'
--
--   · bealitas, lelkeszi_jelentes → NINCS kerületi olvasó águk: a
--     `bealitas_select_diocese` és a `lelkeszi_jelentes_select_diocese_roles`
--     (2026-08-09-megye-kerulet-rls-fix.sql:499, 584) KIZÁRÓLAG
--     `role IN ('esperes','egyhazmegyei_admin')` MEGYEI lábat ad, és a
--     2026-08-11-es szűkítő fájl a `_szint_select` ciklusából NÉV SZERINT
--     kihagyta mindkettőt (1538–1540. sor). A kerület-tudatos feloldóval tehát
--     az egyházkerületi adminok ÚJ olvasást kaptak volna a kerületük MINDEN
--     gyülekezetének évi beállításaira (benne a `szamadas_zaro_adatok` záró
--     pillanatképpel) és a lelkészi jelentések teljes tartalmára.
--     Ez a fájl a SZÁMVEVŐRŐL szól, nem a kerületi hatókör tágításáról →
--     ezért ez a két tábla a KERÜLET NÉLKÜLI `current_user_diocese_olvaso_ids()`
--     -szal kap policy-t, ugyanúgy, ahogy a `chitanta_tombok` (1/B2). → 'megye'
--
-- HA VALAHA KELL a kerületi tágítás ezen a két táblán, az KÜLÖN, NEVESÍTETT
-- döntés legyen külön fájlban — ne egy számvevő-fájl mellékhatása.

DO $olvaso_policyk$
DECLARE
    r          record;
    v_policy   text;
    v_hatokor  text;
    v_db       integer := 0;
    v_kihagy   integer := 0;
    v_rls_be   boolean;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            -- tábla,                 gyülekezet-oszlop,  extra feltétel,      hatókör
            ('document_submissions',  'congregation_id',  NULL::text,          'felettes'::text),
            ('annual_reports',        'congregation_id',  'deleted = false',   'felettes'),
            ('bealitas',              'congregation_id',  NULL::text,          'megye'),
            ('lelkeszi_jelentes',     'congregation_id',  NULL::text,          'megye')
        ) AS t(tabla, oszlop, extra, hatokor)
    LOOP
        -- (0) Létezik-e a tábla és az oszlop? (a repó és a produkció széthúzhat)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public' AND col.table_name = r.tabla
              AND col.column_name = r.oszlop AND col.data_type = 'uuid'
        ) THEN
            v_kihagy := v_kihagy + 1;
            RAISE WARNING 'ℹ️ KIHAGYVA: %.% nem létezik (uuid) ebben az adatbázisban.', r.tabla, r.oszlop;
            CONTINUE;
        END IF;

        -- (A) RESTRICTIVE-figyelmeztetés
        IF EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = r.tabla
                     AND permissive = 'RESTRICTIVE') THEN
            RAISE WARNING '⚠️ %-n RESTRICTIVE policy IS van — az additív olvasó policy HATÁSTALAN maradhat (a RESTRICTIVE ÉS-elődik). Ellenőrizd a 3. szakasz füst-tesztjével!', r.tabla;
        END IF;

        -- (B) RLS-figyelmeztetés
        SELECT c.relrowsecurity INTO v_rls_be
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = r.tabla;
        IF v_rls_be IS DISTINCT FROM true THEN
            RAISE WARNING '⛔ %-n NINCS BEKAPCSOLVA AZ RLS — a policy TÉTLEN lesz (a tábla a GRANT alapján amúgy is nyitva van).', r.tabla;
        END IF;

        -- (C) A HATÓKÖR-KIFEJEZÉS: 'felettes' = megye ∪ kerület (ott, ahol a
        --     kerületi olvasás MA IS megvan), 'megye' = KIZÁRÓLAG a megyei
        --     olvasó hatókör (ott, ahol nincs kerületi ág — ne tágítsuk).
        IF r.hatokor = 'megye' THEN
            v_hatokor := format(
                '%I.%I = ANY (COALESCE((SELECT public.megyei_olvaso_gyulekezet_ids()), ''{}''::uuid[]))',
                r.tabla, r.oszlop);
        ELSE
            v_hatokor := format(
                '%I.%I = ANY (COALESCE((SELECT public.felettes_szint_olvaso_gyulekezet_ids()), ''{}''::uuid[]))',
                r.tabla, r.oszlop);
        END IF;

        v_policy := r.tabla || '_szamvevo_select';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
               USING (%s %s)',
            v_policy, r.tabla,
            CASE WHEN r.extra IS NULL THEN '' ELSE r.tabla || '.' || r.extra || ' AND ' END,
            v_hatokor);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L', v_policy, r.tabla,
            '2026-08-11 (számvevő-kör): additív, KIZÁRÓLAG OLVASÓ megyei láb az egyházmegyei számvevőnek. '
            || CASE WHEN r.hatokor = 'megye'
                    THEN 'Hatókör: megyei_olvaso_gyulekezet_ids() (= current_user_diocese_olvaso_ids() gyülekezetei) — KERÜLET NÉLKÜL, mert ezen a táblán ma SINCS kerületi olvasó ág, és ez a fájl nem tágítja az egyházkerületi adminok hatókörét. '
                    ELSE 'Hatókör: felettes_szint_olvaso_gyulekezet_ids() (megye ∪ kerület) — a kerületi láb itt REDUNDÁNS, mert a <tábla>_szint_* policy már ma is a felettes_szint_gyulekezet_ids()-t hívja. ' END
            || 'Írási úton EGYETLEN policy sem hívja az olvasó feloldókat. '
            || 'Az esperesnek redundáns (neki a megyei SELECT-ág már megvan) — a PERMISSIVE policy-k VAGY-olódnak, tehát senkitől nem vesz el semmit.');

        v_db := v_db + 1;
        RAISE NOTICE '✅ % — számvevői OLVASÓ policy létrehozva (%, hatókör: %)', r.tabla, v_policy, r.hatokor;
    END LOOP;

    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'ÖSSZESEN % tábla kapott <tábla>_szamvevo_select policy-t (% kihagyva).', v_db, v_kihagy;
END
$olvaso_policyk$;


-- ── 1/B2) chitanta_tombok — a MEGYEI nyugtatömbök (diocese_id-s sorok) ──────
-- Külön kezelve, mert itt a hatókör NEM gyülekezeti, hanem megyei oszlop
-- (scope='egyhazmegye', congregation_id NULL, diocese_id kitöltve —
-- chitanta_tombok_scope_fk_check, 2026-04-18-egyhazmegyei-modul-fazis6.sql).
DO $chitanta_olvaso$
BEGIN
  IF EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = 'chitanta_tombok'
        AND col.column_name = 'diocese_id' AND col.data_type = 'uuid')
  THEN
    DROP POLICY IF EXISTS chitanta_tombok_szamvevo_select ON public.chitanta_tombok;
    CREATE POLICY chitanta_tombok_szamvevo_select
      ON public.chitanta_tombok
      FOR SELECT TO authenticated
      USING (chitanta_tombok.diocese_id
             = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])));
    COMMENT ON POLICY chitanta_tombok_szamvevo_select ON public.chitanta_tombok IS
      '2026-08-11 (számvevő-kör): a megyei nyugtatömbök OLVASÁSA az egyházmegyei számvevőnek. Csak SELECT — tömböt nyitni/lezárni/törölni továbbra is az esperes/megyei admin joga.';
    RAISE NOTICE '✅ chitanta_tombok — számvevői OLVASÓ policy létrehozva.';
  ELSE
    RAISE WARNING 'ℹ️ KIHAGYVA: a chitanta_tombok.diocese_id (uuid) nem létezik ebben az adatbázisban.';
  END IF;
END
$chitanta_olvaso$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) A MEGYE SAJÁT KÖNYVEI (`diocese_*`) — OLVASÁS IGEN, ÍRÁS NEM
-- ────────────────────────────────────────────────────────────────────────────
-- MAI ÁLLAPOT (2026-08-09-megye-kerulet-rls-fix.sql:236, 252 és párjai): az öt
-- `diocese_*_all` policy (FOR ALL) harmadik ága így szól:
--     OR (pr.scope = 'diocese' AND pr.scope_id = <tábla>.diocese_id)
-- SZEREP-SZŰRŐ NÉLKÜL. Vagyis a számvevő (és minden `custom` megyei sor)
-- MA IS ÍRHATJA a megye könyveit — bevételt rögzíthet, kiadást törölhet,
-- költségvetést véglegesíthet. Ez nem szándék volt, hanem a szerep-szűrő hiánya.
--
-- ⚠️ MIÉRT NEM ÍROM ÁT AZT AZ ÖT POLICY-T: a törzsük ~30 sor, és a repó
--    BIZONYÍTOTTAN széthúz a produkcióval (lásd a MEMORY.md hibaosztályát:
--    „a migration-fájl NEM bizonyíték"). Egy DROP + újraírás abban a hitben,
--    hogy „csak egy AND-et teszek bele", NÉMÁN elveszíthetné az élesben azóta
--    hozzáadott ágakat — pl. a kerületi admin lábát.
--
-- HELYETTE: MELLÉ teszünk egy RESTRICTIVE (ÉS-kapu) írás-tiltót. Ez a meglévő
-- policy-k EGYETLEN betűjéhez sem nyúl, idempotens, és egy DROP-pal visszavonható.
--   · `_szamvevo_iras_tilos`  FOR ALL, USING (true) → az OLVASÁST NEM érinti,
--      a WITH CHECK viszont MINDEN INSERT-et és UPDATE-et blokkol a tiszta
--      ellenőrnek.
--   · `_szamvevo_torles_tilos` FOR DELETE, USING (…) → a DELETE-nél a USING dönt,
--      ezért kell külön policy (a FOR ALL WITH CHECK-je a DELETE-re nem hat).
-- Aki esperes ÉS számvevő is: rá a szamvevo_megyei_olvaso_e() HAMIS → ír tovább.
--
-- ⚠️ TUDNIVALÓ A JÖVŐRE: ettől kezdve a `diocese_*` táblákon VAN RESTRICTIVE
--    policy. Minden később ide tett PERMISSIVE írási policy ezzel ÉS-elődik.
--    Ez szándékos (ez a kapu), de a következő fejlesztőnek tudnia kell róla.

DO $diocese_iras_tiltas$
DECLARE
    r        record;
    v_db     integer := 0;
BEGIN
    FOR r IN
        SELECT c.relname AS tabla
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname LIKE 'diocese\_%'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname
                        AND col.column_name = 'diocese_id' AND col.data_type = 'uuid')
        ORDER BY 1
    LOOP
        IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = r.tabla) THEN
            RAISE WARNING '⛔ %-n NINCS BEKAPCSOLVA AZ RLS — sem az olvasó, sem az írás-tiltó policy nem fog hatni!', r.tabla;
        END IF;

        -- (1) OLVASÁS: additív, permissive SELECT a számvevői/olvasói megyékre.
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_szamvevo_select', r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
               USING (%I.diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), ''{}''::uuid[])))',
            r.tabla || '_szamvevo_select', r.tabla, r.tabla);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
            r.tabla || '_szamvevo_select', r.tabla,
            '2026-08-11 (számvevő-kör): a megye SAJÁT könyveinek OLVASÁSA az egyházmegyei számvevőnek. '
            || 'Additív és csak SELECT — a meglévő diocese_*_all policy egyetlen ágát sem érinti.');

        -- (2) ÍRÁS-TILTÁS: RESTRICTIVE (ÉS-kapu) — INSERT + UPDATE.
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_szamvevo_iras_tilos', r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
               USING      (true)
               WITH CHECK (NOT (SELECT public.szamvevo_megyei_olvaso_e()))',
            r.tabla || '_szamvevo_iras_tilos', r.tabla);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
            r.tabla || '_szamvevo_iras_tilos', r.tabla,
            '2026-08-11 (számvevő-kör): RESTRICTIVE írás-tiltás. Az USING (true) miatt az OLVASÁST nem érinti; '
            || 'a WITH CHECK minden INSERT-et és UPDATE-et elutasít, ha a hívó TISZTA megyei ellenőr. '
            || 'Oka: a diocese_*_all policy „pr.scope = ''diocese''" ága szerep-szűrő nélkül enged, tehát a számvevő ma írhatná a megye könyveit — azt, amit ellenőriznie kell. '
            || 'Aki esperes ÉS számvevő is, arra a szamvevo_megyei_olvaso_e() HAMIS → változatlanul ír.');

        -- (3) TÖRLÉS-TILTÁS: a DELETE-nél a USING dönt, ezért külön policy.
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_szamvevo_torles_tilos', r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
               USING (NOT (SELECT public.szamvevo_megyei_olvaso_e()))',
            r.tabla || '_szamvevo_torles_tilos', r.tabla);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
            r.tabla || '_szamvevo_torles_tilos', r.tabla,
            '2026-08-11 (számvevő-kör): RESTRICTIVE törlés-tiltás a tiszta megyei ellenőrnek. '
            || 'Külön policy kell, mert a DELETE-et a USING dönti el — a FOR ALL policy WITH CHECK-je a DELETE-re nem hat.');

        v_db := v_db + 1;
        RAISE NOTICE '✅ % — olvasó SELECT + RESTRICTIVE írás/törlés-tiltás.', r.tabla;
    END LOOP;

    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'ÖSSZESEN % `diocese_*` tábla rendezve. A 2. szakasz 210-es sorának ezt a számot kell adnia: %', v_db, v_db;

    IF v_db = 0 THEN
        RAISE WARNING '⚠️ EGYETLEN diocese_* tábla sem került rendezésre. Ellenőrizd a 0/F listát, mielőtt továbbmész!';
    END IF;
END
$diocese_iras_tiltas$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1/D. SZAKASZ — ⚠️ OPCIONÁLIS: A TÖBBI SZEREP-SZŰRŐ NÉLKÜLI MEGYEI ÍRÓ    ║
-- ║ LEZÁRÁSA. CSAK AKKOR FUTTASD, HA A 0/C LISTÁT MEGNÉZTED ÉS ÍGY DÖNTESZ.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT ZÁR LE: a `diocese_*_all` policy harmadik ága így szól (2026-08-09-megye-
-- kerulet-rls-fix.sql:233–235 és párjai):
--     OR (pr.scope = 'diocese' AND pr.scope_id = <tábla>.diocese_id)
-- SZEREP-SZŰRŐ NÉLKÜL. Vagyis BÁRMILYEN jóváhagyott, aktív megyei
-- `profile_roles` sor (custom „Egyházmegyei titkárnő", konyvelo, lelkesz)
-- ÍRHATJA a megye könyveit. Az 1/C RESTRICTIVE tiltói ezt NEM fogják meg, mert
-- a feltételük a `szamvevo_megyei_olvaso_e()`, ami csak az `egyhazmegyei_szamvevo`
-- szerepet ismeri.
--
-- ⚠️ MIÉRT NEM AUTOMATIKUS: ez élő munkafolyamatot vághat el. Ha ma egy megyei
--    titkárnő rögzíti a megye bevételeit egy `custom` soron, ez a blokk holnap
--    reggel megállítja. A 0/C lista NÉV SZERINT megmondja, kikről van szó —
--    előbb azt olvasd el, és ha kell nekik a rögzítés, ADJ NEKIK
--    `egyhazmegyei_admin` szerepkör-sort, MIELŐTT ezt futtatod.
--
-- ⚠️ AKIT NEM ÉRINT: esperes / egyházmegyei admin (megyei sor VAGY skalár),
--    kerületi admin, rendszergazda — nekik a `megyei_iro_e()` HAMIS marad.
/*
BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- IGAZ, ha a hívónak VAN jóváhagyott, aktív megyei szerepkör-sora, DE
-- SEMMILYEN elismert írási hatóköre nincs (nem esperes, nem megyei admin,
-- nem kerületi admin, nem rendszergazda). Vagyis: „megyei sora van,
-- de a rendszer nem ismeri el írónak".
CREATE OR REPLACE FUNCTION public.megyei_iro_e()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $megyei_iro$
  -- v2026-08-11-szamvevo-1D
  SELECT EXISTS (
           SELECT 1 FROM public.profile_roles pr
           JOIN public.profiles p ON p.id = pr.profile_id
           WHERE pr.profile_id = auth.uid()
             AND p.status = 'active'
             AND pr.scope = 'diocese'
             AND pr.active = true
             AND pr.approval_status = 'approved'
             AND pr.scope_id IS NOT NULL)
     AND public.current_user_diocese_ids()  = '{}'::uuid[]
     AND public.current_user_district_ids() = '{}'::uuid[]
     AND NOT public.current_user_has_global_access();
$megyei_iro$;

COMMENT ON FUNCTION public.megyei_iro_e() IS
  '2026-08-11 (opcionális 1/D): IGAZ, ha a hívónak van jóváhagyott megyei profile_roles sora, de SEMMILYEN elismert írási hatóköre (esperes / egyházmegyei admin / kerületi admin / rendszergazda). A diocese_*_all policy szerep-szűrő nélküli „pr.scope = ''diocese''" ága ezeknek a személyeknek ma írásjogot ad; a RESTRICTIVE tiltók erre a függvényre kötve zárják le.';

REVOKE ALL   ON FUNCTION public.megyei_iro_e() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.megyei_iro_e() TO authenticated;
GRANT EXECUTE ON FUNCTION public.megyei_iro_e() TO service_role;

DO $tag_iras_tiltas$
DECLARE r record; v_db integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tabla
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'diocese\_%'
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public' AND col.table_name = c.relname
                    AND col.column_name = 'diocese_id' AND col.data_type = 'uuid')
    ORDER BY 1
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_nem_iro_iras_tilos', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (true) WITH CHECK (NOT (SELECT public.megyei_iro_e()))',
      r.tabla || '_nem_iro_iras_tilos', r.tabla);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_nem_iro_torles_tilos', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (NOT (SELECT public.megyei_iro_e()))',
      r.tabla || '_nem_iro_torles_tilos', r.tabla);

    v_db := v_db + 1;
    RAISE NOTICE '✅ % — a szerep-szűrő nélküli megyei ÍRÁS lezárva.', r.tabla;
  END LOOP;
  RAISE NOTICE 'ÖSSZESEN % diocese_* tábla.', v_db;
END
$tag_iras_tiltas$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Visszavonás (EGYETLEN blokk):
--   DO $v$ DECLARE r record; BEGIN
--     FOR r IN SELECT tablename, policyname FROM pg_policies
--              WHERE schemaname='public' AND policyname LIKE '%\_nem\_iro\_%' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
--     END LOOP; END $v$;
--   DROP FUNCTION IF EXISTS public.megyei_iro_e();
*/



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2 · FÜGGVÉNYEK' AS szakasz,
       'Létrejött mind az 5 új függvény?' AS mit,
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_diocese_szamvevo_ids',
                            'current_user_diocese_olvaso_ids',
                            'felettes_szint_olvaso_gyulekezet_ids',
                            'megyei_olvaso_gyulekezet_ids',
                            'szamvevo_megyei_olvaso_e')) || ' / 5' AS ertek,
       'Ha nem 5: az 1. szakasz nem futott le hibátlanul.' AS teendo

UNION ALL
SELECT 101, '2 · FÜGGVÉNYEK',
       'Mind az 5 SECURITY DEFINER + rögzített search_path?',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_diocese_szamvevo_ids','current_user_diocese_olvaso_ids',
                            'felettes_szint_olvaso_gyulekezet_ids','megyei_olvaso_gyulekezet_ids','szamvevo_megyei_olvaso_e')
          AND p.prosecdef = true
          AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path%') || ' / 5',
       'Ha nem 5: SECURITY DEFINER search_path nélkül — search_path-hijack kockázat.'

UNION ALL
SELECT 102, '2 · FÜGGVÉNYEK',
       'A PUBLIC-tól el van véve az EXECUTE? (0 = rendben)',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_diocese_szamvevo_ids','current_user_diocese_olvaso_ids',
                            'felettes_szint_olvaso_gyulekezet_ids','megyei_olvaso_gyulekezet_ids','szamvevo_megyei_olvaso_e')
          AND has_function_privilege('public', p.oid, 'EXECUTE')),
       'Ha nem 0: a REVOKE nem futott le — hitelesítetlen (anon) hívó is elérné.'

UNION ALL
SELECT 103, '2 · A LEGFONTOSABB KAPU',
       'A current_user_diocese_ids() törzse ÉRINTETLEN? (nem említ szamvevo-t)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%egyhazmegyei_szamvevo%'
                             THEN '⛔ MEGVÁLTOZOTT — az ellenőr írásjogot kaphatott!'
                             ELSE '✅ érintetlen' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids' LIMIT 1),
                '⛔ nincs függvény'),
       'Ha ⛔: azonnal nézd meg, ki és mikor írta át (ez ~27 policy gerince).'

-- ⭐ A FÁJL LÉNYEGE: az olvasó feloldókat SEMMILYEN ÍRÁSI ág nem hívhatja.
UNION ALL
SELECT 104, '2 · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI policy (nem SELECT) olvasó-feloldót? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.cmd <> 'SELECT'
          AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
                ~ '(current_user_diocese_olvaso_ids|current_user_diocese_szamvevo_ids|felettes_szint_olvaso_gyulekezet_ids|megyei_olvaso_gyulekezet_ids)'),
       '⛔ HA NEM 0: valaki írási ágba tette az olvasó hatókört — a számvevő írhatja, amit ellenőriz. AZONNAL javítsd. (A RESTRICTIVE írás-TILTÓK a szamvevo_megyei_olvaso_e()-t hívják, nem hatókör-feloldót — őket a fenti minta nem fogja meg.)'

UNION ALL
SELECT (105 + row_number() OVER (ORDER BY pol.tablename, pol.policyname))::int, '2 · ⛔ SZABÁLYSÉRTŐ POLICY',
       pol.tablename || '.' || pol.policyname,
       'parancs = ' || pol.cmd,
       '⛔ Ez a policy ÍRÁSI ágon hívja az olvasó hatókört. Írd át felettes_szint_gyulekezet_ids()-re (írási változat).'
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.cmd <> 'SELECT'
  AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
        ~ '(current_user_diocese_olvaso_ids|current_user_diocese_szamvevo_ids|felettes_szint_olvaso_gyulekezet_ids|megyei_olvaso_gyulekezet_ids)'

UNION ALL
SELECT 200, '2 · OLVASÓ POLICY-K',
       'Létrejött <tábla>_szamvevo_select policy-k száma',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE '%\_szamvevo\_select'),
       'Várható: 4 (document_submissions, annual_reports, bealitas, lelkeszi_jelentes) + 1 (chitanta_tombok) + a diocese_* táblák száma.'

UNION ALL
SELECT 201, '2 · OLVASÓ POLICY-K',
       'Ezek MIND FOR SELECT-ek? (0 kivétel = rendben)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE '%\_szamvevo\_select' AND cmd <> 'SELECT'),
       'Ha nem 0: egy olvasó policy írási parancsot is fed — javítsd.'

-- ⭐ A KERÜLETI MELLÉKHATÁS KIZÁRÁSA: a bealitas és a lelkeszi_jelentes
--    számvevői policy-ja NEM hívhatja a kerület-tudatos feloldót.
UNION ALL
SELECT 202, '2 · OLVASÓ POLICY-K',
       'bealitas + lelkeszi_jelentes: kerület-tudatos feloldót hív? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('bealitas', 'lelkeszi_jelentes')
          AND policyname LIKE '%\_szamvevo\_select'
          AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, ''))
                LIKE '%felettes_szint_olvaso_gyulekezet_ids%'),
       '⛔ HA NEM 0: ez a két tábla a kerületi adminoknak ÚJ olvasást adna (ma nincs kerületi olvasó águk) — a szamadas_zaro_adatok záró pillanatképre és a lelkészi jelentések teljes tartalmára. Írd vissza a KERÜLET NÉLKÜLI current_user_diocese_olvaso_ids()-es alakra (1/B, ''megye'' hatókör).'

UNION ALL
SELECT 210, '2 · MEGYEI KÖNYVEK',
       'diocese_* táblák RESTRICTIVE írás-tiltóval',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'diocese\_%\_szamvevo\_iras\_tilos'
          AND permissive = 'RESTRICTIVE'),
       'Ennek egyeznie kell az 1/C RAISE NOTICE végén kiírt számmal.'

UNION ALL
SELECT 211, '2 · MEGYEI KÖNYVEK',
       'diocese_* táblák RESTRICTIVE törlés-tiltóval',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'diocese\_%\_szamvevo\_torles\_tilos'
          AND permissive = 'RESTRICTIVE'),
       'Ugyanannyinak kell lennie, mint a 210-es sornak.'

-- Kit érint ténylegesen: hány számvevőnek lesz élő hatóköre?
UNION ALL
SELECT 300, '2 · HATÁS',
       'Hány számvevő kap élő megyei hatókört?',
       (SELECT count(DISTINCT p.id)::text
        FROM public.profiles p
        WHERE p.status = 'active'
          AND (EXISTS (SELECT 1 FROM public.profile_roles pr
                       WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                         AND pr.role = 'egyhazmegyei_szamvevo'
                         AND pr.active = true AND pr.approval_status = 'approved'
                         AND pr.scope_id IS NOT NULL)
            OR (p.role = 'egyhazmegyei_szamvevo' AND p.diocese_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                                WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                                  AND pr.active = true AND pr.approval_status = 'approved'
                                  AND pr.scope_id IS NOT NULL)))),
       'Ha 0, de a 0/D szerint van számvevő: nézd meg a profil-státuszt és az egyházmegye-hozzárendelést.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SZAKASZ — FÜST-TESZT: MIT KATTINTS                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⭐ SZÁMVEVŐ FIÓKKAL (egyhazmegyei_szamvevo, megyei szerepkör-sorral):
--   1. Belépés → az irányítópult az EGYHÁZMEGYEI felület legyen, és a fejlécben
--      látszódjon a „Számvevői (ellenőri) nézet" sáv.
--   2. „Gyülekezetek" fül → LÁTSZANAK a megye gyülekezetei, a leadott
--      dokumentumok darabszámával. (Ha üres: 0/D sor a te fiókodra.)
--   3. „Dokumentumok" fül → a teljességi mátrix kitöltve; egy iratra kattintva
--      a fagyasztott pillanatkép MEGNYÍLIK.
--   4. Ugyanott: „Átvettem" / „Ellenőrizve" / „Visszaküldés" gomb NE legyen
--      kattintható; ha mégis meghívódik, beszédes magyar üzenet jöjjön
--      („Számvevőként … csak megtekintheted …"), NE nyers hiba.
--   5. „Kérelmek" fül → a feloldási kérelmek LÁTSZANAK, de a Jóváhagyás /
--      Elutasítás nem megy át (ugyanaz a beszédes üzenet).
--   6. Sidebar → „Pénzügy" (egyházmegyei): a megye SAJÁT bevételei/kiadásai
--      LÁTSZANAK, a lap tetején az „Ellenőri nézet" sávval, és a „Tétel
--      rögzítése" / „Decont" / „Dispoziție" gombok EL VANNAK REJTVE. A
--      nyomtatás működik.
--      ⚠️ 2026-08-11 (ellenőrzés utáni JAVÍTÁS): olyan ÉVBEN, amit az esperes
--      még nem nyitott meg (nincs `diocese_bealitas` sor), az oldal EDDIG egy
--      hibakártyát adott („… nem módosíthatod"), mert a
--      `ensureDioceseBealitasForYear` ÍRÁSSAL próbálta létrehozni az éves
--      konfigurációt. Mostantól a lap ellenőri nézetben NEM hívja azt, hanem
--      magyarázó üres állapotot mutat („Erre az évre az egyházmegye még nem
--      nyitotta meg a könyvelést"). Válts olyan évre, amiben van könyvelés —
--      ott a tartalomnak látszania KELL.
--      Ha mégis sikerülne mentened: a RESTRICTIVE policy nem jött létre.
--   7. „Egyházmegyénk" fül → az adatok látszanak, a mentés meghiúsul.
--
-- ⭐ ESPERES FIÓKKAL (regressziós próba — NEKI SEMMI NEM VÁLTOZHAT):
--   8. Dokumentum átvétele, véglegesítése, kerületnek továbbítása → MŰKÖDIK.
--   9. Feloldási kérelem jóváhagyása → MŰKÖDIK.
--  10. Egyházmegyei pénzügy: új bevétel rögzítése, mentés → MŰKÖDIK.
--  11. „Egyházmegyénk" adatlap mentése (IBAN/CIF) → MŰKÖDIK.
--
-- ⭐ LELKÉSZ FIÓKKAL:
--  12. Saját gyülekezet pénzügye, tagnyilvántartása → változatlanul MŰKÖDIK.
--      (Ez a fájl gyülekezeti szinten semmit nem módosított.)
--
-- ⚠️ HA A 6. PONTNÁL A SZÁMVEVŐ MÉGIS TUD MENTENI: a RESTRICTIVE policy nem jött
--    létre, vagy az RLS ki van kapcsolva azon a táblán → 0/F és 2/210-es sor.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. SZAKASZ — ⛔ TELJES VISSZAÁLLÍTÁS — CSAK BAJ ESETÉN                   ║
-- ║ Visszaáll a 2026-08-11 reggeli állapot: a számvevő ismét üres képernyőt  ║
-- ║ kap a megyei felületen, és a diocese_* táblákon ismét írhat is.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EZ ÉLES SQL. Jelöld ki az EGÉSZ 4. szakaszt, és úgy futtasd.
-- ⚠️ Előbb próbáld a célzott javítást: a 2. szakasz megmondja, melyik lépés
--    hiányzik. A teljes visszaállítás minden számvevőtől elveszi a hozzáférést.
-- ⚠️ EZ A BLOKK NEM VONJA VISSZA az OPCIONÁLIS 1/D szakaszt (annak policy-i
--    `_nem_iro_*` nevűek, és a `megyei_iro_e()` függvény): ha azt is futtattad,
--    a saját, az 1/D végén lévő visszavonó blokkját használd.
/*
BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $vissza$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (policyname LIKE '%\_szamvevo\_select'
        OR policyname LIKE '%\_szamvevo\_iras\_tilos'
        OR policyname LIKE '%\_szamvevo\_torles\_tilos')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE '🔙 ELDOBVA: %.%', r.tablename, r.policyname;
  END LOOP;
END
$vissza$;

DROP FUNCTION IF EXISTS public.szamvevo_megyei_olvaso_e();
DROP FUNCTION IF EXISTS public.megyei_olvaso_gyulekezet_ids();
DROP FUNCTION IF EXISTS public.felettes_szint_olvaso_gyulekezet_ids();
DROP FUNCTION IF EXISTS public.current_user_diocese_olvaso_ids();
DROP FUNCTION IF EXISTS public.current_user_diocese_szamvevo_ids();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Ellenőrzés a visszaállítás után (EGYETLEN SELECT):
SELECT 'megmaradt szamvevo-policy' AS mit, count(*)::text AS ertek
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%\_szamvevo\_%'
UNION ALL
SELECT 'megmaradt szamvevo-függvény', count(*)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_user_diocese_szamvevo_ids','current_user_diocese_olvaso_ids',
                    'felettes_szint_olvaso_gyulekezet_ids','megyei_olvaso_gyulekezet_ids','szamvevo_megyei_olvaso_e');
-- Mindkettőnek 0-t kell adnia.
*/



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MARADÉK KOCKÁZATOK — amit ez a fájl SZÁNDÉKOSAN NEM old meg              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- 1. A `current_user_can_access_congregation()` (4) és (5) ága a JÓVÁHAGYOTT
--    `profile_congregations` hozzárendelésen keresztül GYÜLEKEZETI szintű
--    hozzáférést ad a számvevőnek — és a 4/B szakasz `<tábla>_gyulekezeti_all`
--    policy-i FOR ALL-ok, tehát ott a hozzárendelt számvevő ÍRHAT is
--    (presbiter, penztar, csoport …). Ez 2026-08-11 ELŐTTI, meglévő viselkedés,
--    a lelkész jóváhagyásához kötve — a szűkítése KÜLÖN kör, és a könyvelőt is
--    érintené. Itt nem nyúlunk hozzá.
-- 2. A `custom` (scope = 'diocese') sorok tulajdonosai továbbra sem LÁTNAK
--    semmit megyei szinten — DE a megye SAJÁT könyveit (diocese_*) MA IS
--    ÍRHATJÁK, mert a `diocese_*_all` policy „pr.scope = 'diocese'" ága
--    szerep-szűrő nélkül enged, és az 1/C RESTRICTIVE tiltói csak az
--    `egyhazmegyei_szamvevo` szerepre hatnak. Ez 2026-08-11 ELŐTTI állapot;
--    ez a fájl nem okozza és nem is szünteti meg. A 0/C lista NÉV SZERINT
--    megmutatja, kikről van szó, és három döntési lehetőséget ad; a lezárás
--    az OPCIONÁLIS 1/D blokk (kikommentelve, külön tudatos futtatással).
-- 3. A `dioceses` / `congregations` / `districts` táblák SELECT policy-ja ma
--    `USING (true)` (2026-04-13-rls-ALL-FIXED.sql:100, 106). Ez a fájl NEM
--    érinti — a szűkítésük külön kör, és a számvevői hatókörtől független.
-- 4. Ha a `diocese_*` táblák valamelyikén NINCS bekapcsolva az RLS, ott sem az
--    olvasó, sem az írás-tiltó policy nem hat. A 0/F sor ezt méri.
-- 5. Az alkalmazás-oldali párja (apps/web/lib/auth/level-scope.ts,
--    finance-scope.ts és a dashboard-egyhazmegye szerver akciók) ugyanezt a két
--    szintet — OLVASÓ és ÍRÓ — külön kezeli. Ha valaki csak az egyik oldalt
--    módosítja, visszatér a mostani tünet: az egyik réteg elfogadja a szerepet,
--    a másik nem.
