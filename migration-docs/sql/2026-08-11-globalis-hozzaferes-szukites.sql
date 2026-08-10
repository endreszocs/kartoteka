-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — A „MINDENT LÁTÓ" GLOBÁLIS HOZZÁFÉRÉS SZŰKÍTÉSE
--             (esperes / egyházmegyei admin: ORSZÁGOS → SAJÁT EGYHÁZMEGYE)
-- Dátum: 2026-08-11   ·   Futtatja: Endre (Supabase Studio → SQL Editor)
-- Diagnosztikai tétel: P1 #17          ·   Revízió: 2026-08-11 (4 szkeptikus kör)
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠️⚠️  FUTTATÁSI SORREND — EZ NEM A FÁJL SORRENDJE!  ⚠️⚠️                  ║
-- ║                                                                          ║
-- ║   0 → 1 → 2/A → 3 → 4 → 4/B → 5 → 5/B → **2** → (2/B) → 6 → 7            ║
-- ║                                                                          ║
-- ║ A 2. SZAKASZ (a tényleges SZŰKÍTÉS) MINDIG UTOLSÓNAK FUT. Előtte a       ║
-- ║ 3–5/B. szakasznak MÁR A HELYÉN KELL LENNIE, különben a 2. és az 5.       ║
-- ║ szakasz közötti percekben MINDEN esperes ÜRES felületet lát.             ║
-- ║ A 3–5/B. szakasz NEM FÜGG a 2.-tól (a policy SZÖVEGÉRE illeszt, nem a    ║
-- ║ függvény törzsére), ezért nyugodtan futhat előbb — a szűkítés előtt       ║
-- ║ ezek tiszta no-op-ok (az esperesnek még globális joga van, a lelkésznek   ║
-- ║ pedig üres a hatóköre → FALSE).                                          ║
-- ║ A 2. szakasz őrszeme KÓDBÓL is kikényszeríti ezt a sorrendet: ha a       ║
-- ║ kompenzáló policy-k hiányoznak, RAISE EXCEPTION-nel megáll.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- FUTTATÁSI SORREND A 2026-08-11-i TESTVÉRFÁJLOK KÖZÖTT:
--   1. 2026-08-11-security-definer-hardening.sql        (search_path pin)
--   2. 2026-08-11-tagnyilvantartas-lista-index.sql      (indexek)
--   3. **EZ A FÁJL**                                    (P1 #17 szűkítés)
--   4. 2026-08-11-profiles-szukites-rpc.sql             (⚠️ ez is CREATE OR REPLACE-eli
--                                                        a profil_lathato_e()-t — a két
--                                                        fájlt EGYÜTT kell módosítani,
--                                                        lásd annak :510-513 fejlécét)
--   5. 2026-08-11-cross-match-rpc-hardening.sql
--   6. 2026-08-11-kerulet-letszam-osszesito.sql         (már lefutott)
--
-- ────────────────────────────────────────────────────────────────────────────
-- MI A BAJ — magyarul, kertelés nélkül
-- ────────────────────────────────────────────────────────────────────────────
-- A 2026-04-12-es „fázis 0" migráció létrehozott egy SECURITY DEFINER
-- függvényt, `current_user_has_global_access()`, amelynek a teljes törzse ez:
--
--     p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
--
-- Semmilyen egyházmegye- vagy kerület-feltétel NINCS benne. Ez a függvény a
-- `szemely` (teljes tagnyilvántartás CNP-vel), a `befizetes`, a `kiadas`, a
-- `csalad`, a `gyerek` és további ~50 gyülekezeti tábla RLS-szabályának a
-- gerince — közvetlenül vagy a `current_user_can_access_congregation()`
-- első ágán keresztül.
--
-- KÖVETKEZMÉNY: BÁRMELYIK esperes vagy egyházmegyei admin a SAJÁT
-- bejelentkezésével + a publikus anon kulccsal (a PostgREST végponton, a
-- böngésző fejlesztői konzoljából, két sorból) kiolvashatja AZ EGÉSZ ORSZÁG
-- tagnyilvántartását és pénzügyét.
--
-- A 2026-08-09-i `level-scope.ts` átírás a SZERVEREN RENDERELT felületeket
-- fail-closed-dá tette — de az a nyers JWT-t nem korlátozza. Az adatbázis
-- ma is kiadja a sorokat. Ezt zárja le ez a fájl.
--
-- ⚠️ EGY SZŰKÍTÉS ÖNMAGÁBAN NEM ELÉG. A revízió három olyan mellékutat
--    talált, amely a szűkítést EGYETLEN kéréssel megkerülné; ezért ez a fájl
--    NEM CSAK szűkít:
--      · 2/A-1: `profiles_write_own` (FOR UPDATE, USING (id = auth.uid()),
--        WITH CHECK NÉLKÜL) → bárki `PATCH /rest/v1/profiles?id=eq.<sajat>`
--        `{"role":"admin"}` kéréssel VISSZASZEREZNÉ az országos jogot.
--        Ezt egy BEFORE UPDATE trigger zárja le.
--      · 2/A-2: `profile_roles_admin_manage` (FOR ALL, hatókör-korlát nélkül)
--        → bármely `egyhazkeruleti_admin` beszúrhatna magának egy
--        `scope='system', role='admin'` sort → teljes rendszergazda.
--        Ezt a policy WITH CHECK-ágának szigorítása zárja le.
--      · 0/F + 4/B: a maradék `USING (true)` PERMISSIVE policy-k. A PERMISSIVE
--        policy-k VAGY-olódnak: EGYETLEN megmaradt `true` minden szűkítést
--        hatástalanná tesz azon a táblán.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MI A CÉL — egy mondatban
-- ────────────────────────────────────────────────────────────────────────────
-- Az esperes / egyházmegyei admin a SAJÁT EGYHÁZMEGYÉJÉBEN pontosan annyit
-- lásson és tegyen, mint ma — minden más egyházmegyében SEMMIT.
-- A kerületi admin a saját kerületét. A rendszergazda mindent.
-- A gyülekezeti lelkész számára SEMMI nem változik.
--
-- ────────────────────────────────────────────────────────────────────────────
-- HOGYAN — és miért ÍGY
-- ────────────────────────────────────────────────────────────────────────────
-- 1) `current_user_has_global_access()` → CSAK rendszergazda, két lábon
--    (profiles.role='admin' skalár VAGY profile_roles system-scope admin sor),
--    MINDKÉT lábon `profiles.status = 'active'` kapuval.
--
-- 2) ÚJ, KÉTLÁBÚ HATÓKÖR-FELOLDÓK: `current_user_diocese_ids()` és
--    `current_user_district_ids()`:
--        a) `profile_roles` approved+active diocese/district sorok — ELSŐDLEGES
--        b) a skalár `profiles.diocese_id` / `.district_id` — CSAK FALLBACK,
--           és CSAK akkor, ha EGYETLEN diocese/district hatókörű, jóváhagyott,
--           aktív szerepkör-sor SINCS (szerepkörtől függetlenül).
--    Mindkét láb megköveteli, hogy a HÍVÓ profilja `status = 'active'` legyen.
--
--    ⚠️ TUDATOS ELTÉRÉS az apps/web/lib/auth/level-scope.ts-től — NEM „azonos"!
--       · level-scope.ts BÁRMELY approved+active `scope='diocese'` sort
--         elfogad, SZEREPTŐL FÜGGETLENÜL; ez az SQL csak az
--         `esperes` / `egyhazmegyei_admin` (ill. `egyhazkeruleti_admin`)
--         szerepű sorokat adja VISSZA.
--       · A skalár-elnyomás („van szerepkör-sor → a skalár nem számít")
--         viszont SZEREP-FÜGGETLEN, pontosan mint az appban.
--       Az eredő invariáns: **az adatbázis SOHA nem tágabb az appnál** —
--       legfeljebb szűkebb. Aki emiatt üres listát kapna (pl. egy
--       `diocese`-hatókörű `egyhazmegyei_szamvevo` vagy `custom` tisztségviselő),
--       azt a 0/C 309-es sora NÉV SZERINT felsorolja a futtatás ELŐTT.
--
--    ⚠️ TUDATOS ELTÉRÉS az apps/web/lib/auth/admin-scope.ts-től:
--       `getAdminDistrictScope()` a két kerületi lábat FELTÉTEL NÉLKÜL uniózza
--       (admin-scope.ts:46-51), ez a függvény viszont fallback-elvű. Aki
--       emiatt széthúzna, azt a 0/C 305b sora felsorolja — ŐKET A FUTTATÁS
--       ELŐTT RENDEZNI KELL (különben a kerületi felületen látja a gyülekezetet,
--       de 0 sort kap rá).
--
-- 3) FAIL-CLOSED: a feloldók ÜRES TÖMBÖT adnak (`'{}'::uuid[]`, sosem NULL),
--    és `x = ANY('{}')` → FALSE.
--
-- 4) TELJESÍTMÉNY (a revízió 3 független blokkere): a kapu-függvények
--    SECURITY DEFINER-ek, tehát a PostgreSQL SOHA nem inline-olja őket, és az
--    RLS SORONKÉNT hívja. Ezért:
--      · `felettes_szint_hozzaferese(uuid)` EGYETLEN elsődleges-kulcs-keresést
--        végez a `congregations`-en (NEM építi fel a teljes gyülekezet-tömböt),
--      · `felettes_szint_gyulekezet_ids()` a két feloldót EGYSZER hívja (CTE),
--      · a POLICY-kban a tömbtagsági alak megy, `(SELECT …)` burkolással:
--          congregation_id = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[]))
--        A Var-mentes al-SELECT-ből a tervező InitPlan-t csinál → LEKÉRDEZÉSENKÉNT
--        EGYSZER fut. A COALESCE burkolás SZÁNDÉKOS: az
--        `= ANY ((SELECT …))` alak nyelvtanilag kétértelmű (ANY-sublink vs.
--        ANY-tömb), a COALESCE egyértelműsíti — a függvény amúgy sosem ad NULL-t.
--    ⚠️ AZ `authenticated` SZEREP statement_timeout-ja 8 MÁSODPERC
--       (2026-07-15-infer-family-links-timeout.sql:5). A 7. szakasz 11/b pontja
--       EXPLAIN (ANALYZE, BUFFERS) mérést ír elő ELES ÜZEM ELŐTT.
--
-- 5) `current_user_can_access_congregation(uuid)`: megmarad minden mai ága,
--    MELLÉ kerül az új MEGYEI/KERÜLETI ág (3) és a profilváltós ág (6).
--    A (6) ág `status='active'` kaput ÉS szerep-szűrőt kapott
--    (`lelkesz`/`konyvelo`), különben egy „Titkárnő" custom sor vagy egy
--    felfüggesztett fiók teljes tagnyilvántartás-hozzáférést kapna.
--
-- 6) SZERKESZTÉS ≠ OLVASÁS. A `current_user_can_edit_congregation()` NEM az
--    olvasási kaput hívja, hanem a külön `felettes_szint_szerkesztheto(uuid)`-t,
--    amelyben a KERÜLETI láb MINDIG bent van. Így a 2/B szakasz (amely a
--    kerületi SOR-olvasást veszi el) NEM veszi el a kerületi admin mai
--    törzsadat-szerkesztési jogát (2026-04-16-wc7-4-fazis2f-congregations.sql:165-207).
--
-- 7) A Missziós Műhely moderátori jogát az 5. szakasz PARANCSONKÉNT
--    (SELECT/INSERT/UPDATE/DELETE/ALL) tükrözi — NEM ad blanket FOR ALL-t,
--    mert több mm_* táblán a globális ág CSAK olvasó policy-ban szerepel
--    (pl. `mm_stats_read_self_or_admin`, FOR SELECT), és a blanket FOR ALL
--    ott ÚJ ÍRÁSJOGOT adna.
--
-- ────────────────────────────────────────────────────────────────────────────
-- A FÁJL SZAKASZAI
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ A Supabase SQL Editor CSAK AZ UTOLSÓ utasítás eredményét mutatja. Ezért:
--      · minden ellenőrző lekérdezés EGYETLEN SELECT (UNION ALL-lal fűzve),
--      · a szakaszokat EGYESÉVEL jelöld ki és futtasd (Ctrl+Enter),
--      · a FUTTATÁSI SORREND a fájl tetején olvasható (NEM a fájl sorrendje).
--
--   0.    ELŐZETES ÁLLAPOTFELMÉRÉS (CSAK OLVAS) — 0/A…0/F
--   1.    hatókör-feloldó segédfüggvények (nem változtat viselkedést)
--   2/A.  MELLÉKUTAK LEZÁRÁSA: profiles önírás-trigger + profile_roles WITH CHECK
--   3.    névre szóló hiánypótló policy-k (8 hely)
--   4.    dinamikus additív megyei/kerületi SELECT policy-k (~50 tábla)
--   4/B.  a maradék `USING (true)` policy-k lezárása gyülekezeti táblákon
--   5.    Missziós Műhely moderátori jog megtartása (parancsonként)
--   5/B.  storage.objects additív megyei/kerületi olvasás (csatolmányok)
--   2.    ⚠️ A SZŰKÍTÉS — A FÁJLBAN A 6. SZAKASZ ELŐTT, DE UTOLSÓNAK FUT
--   2/B.  OPCIONÁLIS: kerületi SOR-hozzáférés nélkül (token-védett)
--   6.    ELLENŐRZÉS (egyetlen SELECT) + 6/D valódi JWT-emulációs próba
--   7.    MAGYAR FÜST-TESZT   ·   7/B. „egy esperes telefonált" 2 perces triázs
--   8.    ⛔ TELJES VISSZAÁLLÍTÁS — ÉLES SQL (NINCS kikommentelve!)
--
-- ELVEK:
--   · Idempotens: CREATE OR REPLACE / DROP … IF EXISTS / IF NOT EXISTS.
--   · Minden módosító szakasz saját BEGIN/COMMIT-ban, és MINDEGYIK ELSŐ SORA:
--       SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '5min';
--     Ha „canceling statement due to lock timeout" hibát kapsz: NEM TÖRTÉNT
--     SEMMI (tiszta rollback) — várj 5 percet és futtasd újra, lehetőleg
--     este 10 után, amikor nincs desktop-szinkron.
--   · SECURITY DEFINER + `SET search_path = public, pg_temp`
--     (2026-05-17-security-definer-search-path-pin.sql konvenció) — a 8. szakasz
--     VISSZAÁLLÍTÁSA IS ezt tartja, NEM a fázis-0 csupasz `public`-ot.
--   · A függvények törzsébe bekerül a `v2026-08-11-szukites` jelölő.
--
-- ⚠️ AMIT EZ A FÁJL SZÁNDÉKOSAN NEM CSINÁL
--   · Nem nyúl a `profil_lathato_e()`-hez. FIGYELEM: a fejléc korábbi állítása
--     („a profiles magától helyesen viselkedik") TÉVES VOLT. A (10) tisztségviselői
--     ág (2026-08-10-nyitott-rls-policyk-takaritas.sql:1145-1156) MINDEN aktív
--     tisztségviselő nevét/e-mailjét/telefonját ORSZÁGOSAN kiadja bármely aktív
--     munkatársnak, a (6) ág pedig a két lábat FELTÉTEL NÉLKÜL uniózza. Ezt a
--     2026-08-11-profiles-szukites-rpc.sql zárja; itt a MARADÉK KOCKÁZATOK 9. pontja.
--   · Nem harmonizálja a 2026-08-09-es megyei policy-k feltétel nélküli UNIÓ-ját.
--   · Nem módosít alkalmazás-kódot.
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ELŐZETES ÁLLAPOTFELMÉRÉS                                    ║
-- ║ CSAK OLVAS. EGYETLEN SELECT — az eredménye nem nyelhető el.              ║
-- ║ Futtasd ELŐSZÖR, külön, és nézd át MINDEN sorát.                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT KELL LÁTNOD, MIELŐTT TOVÁBBMÉSZ:
--   0/A  · a MÓDOSÍTANDÓ 5 függvény TELJES ÉLŐ TÖRZSE (a repó BIZONYÍTOTTAN
--          széthúz a produkcióval → a 131–136. sorokat MÁSOLD BE a
--          migration-docs/sql/_RUN_LOG.md-be, MIELŐTT a 2. szakaszt futtatod;
--          baj esetén a 8. szakaszt EBBŐL kell javítani, nem a repóból)
--        · ⛔ RLS-ÁLLAPOT: van-e `authenticated`-nek jogosított tábla RLS NÉLKÜL
--   0/B  · EXECUTE- és oszlop-jogok (a GRANT és az RLS csak EGYÜTT jelent valamit)
--   0/C  · ⚠️ A LEGFONTOSABB: kinek NEM oldható fel a hatóköre — ŐK MENNÉNEK VAKRA
--   0/D  · a robbanási sugár: hány policy, mely táblák, storage is
--   0/E  · a 4. szakasz ELŐNÉZETE
--   0/F  · ⛔ NYITOTT (`true`) PERMISSIVE POLICY-K — MEGÁLLÍTÓ SWEEP

SELECT sorrend, szakasz, mit_mer, ertek FROM (

-- ── 0/A · ÉLŐ FÜGGVÉNY-DEFINÍCIÓK ÉS RLS-ÁLLAPOT ──────────────────────────
SELECT 101 AS sorrend,
       '0/A · ÉLŐ ÁLLAPOT'::text AS szakasz,
       'current_user_has_global_access() létezik?'::text AS mit_mer,
       COALESCE((SELECT 'IGEN' FROM pg_proc
                 WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_has_global_access' LIMIT 1),
                '⛔ NEM — ÁLLJ MEG')::text AS ertek
UNION ALL
SELECT 102, '0/A · ÉLŐ ÁLLAPOT',
       'has_global_access: a member-portal P0 verziója fut? (member_private jelölő) — VÁRT: false',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%member_private%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_has_global_access' LIMIT 1), '(nincs)')
UNION ALL
SELECT 103, '0/A · ÉLŐ ÁLLAPOT',
       'has_global_access: benne van még az esperes szerep? — VÁRT most: true, futtatás UTÁN: false',
       -- A minta IDÉZŐJELESEN keres (''esperes''), hogy a kommentszöveg ne
       -- adhasson téves találatot — csak a tényleges szerep-lista számít.
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%''esperes''%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_has_global_access' LIMIT 1), '(nincs)')
UNION ALL
SELECT 104, '0/A · ÉLŐ ÁLLAPOT',
       'has_global_access: EZ A FÁJL már lefutott rajta? (v2026-08-11-szukites)',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%v2026-08-11-szukites%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_has_global_access' LIMIT 1), '(nincs)')
UNION ALL
SELECT 111, '0/A · ÉLŐ ÁLLAPOT',
       '⚠️ can_access_congregation: van KERÜLETI ág? (ez dönti el a 2/B szakaszt)',
       COALESCE((SELECT CASE
                   WHEN pg_get_functiondef(oid) LIKE '%v2026-08-11-szukites%'
                     THEN '⚠️ A SZŰKÍTÉS MÁR LEFUTOTT — EZ A SOR NEM MÉRVADÓ. A 2/B döntést a szűkítés ELŐTTI állapotból kellett meghozni; ha nem tetted, nézd meg a _RUN_LOG.md-be mentett élő törzset.'
                   WHEN pg_get_functiondef(oid) LIKE '%egyhazkeruleti_admin%'
                     THEN 'true (VAN kerületi ág → a 2/B szakasz NEM kell)'
                   ELSE 'false (NINCS kerületi ág → OLVASD EL a 2/B szakaszt a 2. szakasz ELŐTT)'
                 END
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 112, '0/A · ÉLŐ ÁLLAPOT',
       'can_access_congregation: van SZÁMVEVŐ ág?',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%egyhazmegyei_szamvevo%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 113, '0/A · ÉLŐ ÁLLAPOT',
       'can_access_congregation: van profile_roles co-membership ág?',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%scope = ''congregation''%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 114, '0/A · ÉLŐ ÁLLAPOT',
       'can_access_congregation: van MEGYEI ág? — VÁRT most: false, futtatás UTÁN: true',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%felettes_szint%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 115, '0/A · ÉLŐ ÁLLAPOT',
       'can_edit_congregation: van ma KERÜLETI ág? (a 2/B döntés MÁSIK fele — a 111-es sor erre NEM ad választ!)',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%egyhazkeruleti_admin%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_edit_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 121, '0/A · ÉLŐ ÁLLAPOT',
       '⛔ csalad-feloldó már a can_access_congregation-t hívja? (PR-25) — VÁRT: true, KÜLÖNBEN a 2. szakasz MEGÁLL',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%current_user_can_access_congregation%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'csalad_resolves_to_accessible_cong' LIMIT 1), '(nincs)')
UNION ALL
SELECT 122, '0/A · ÉLŐ ÁLLAPOT',
       '⛔ gyerek-feloldó már a can_access_congregation-t hívja? (PR-25) — VÁRT: true, KÜLÖNBEN a 2. szakasz MEGÁLL',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%current_user_can_access_congregation%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'gyerek_resolves_to_accessible_cong' LIMIT 1), '(nincs)')
UNION ALL
SELECT 123, '0/A · ÉLŐ ÁLLAPOT',
       'Léteznek MÁR az új segédfüggvények? (0 = még nem futott ez a fájl, 6 = lefutott)',
       (SELECT count(*)::text FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('current_user_diocese_ids', 'current_user_district_ids',
                          'felettes_szint_gyulekezet_ids', 'felettes_szint_hozzaferese',
                          'felettes_szint_szerkesztheto', 'mm_moderator_e'))

-- ── 0/A2 · ⛔ A MÓDOSÍTANDÓ 5 FÜGGVÉNY TELJES ÉLŐ TÖRZSE ───────────────────
-- MÁSOLD BE MIND AZ ÖTÖT a migration-docs/sql/_RUN_LOG.md-be, MIELŐTT a
-- 2. szakaszt futtatod. A 8. szakasz visszaállítása a repóból dolgozik; ha a
-- produkció ettől eltér, EZ az egyetlen hiteles forrás.
UNION ALL
SELECT 131, '0/A2 · ÉLŐ TÖRZS — MENTSD EL!', 'current_user_has_global_access — TELJES ÉLŐ TÖRZS',
       COALESCE((SELECT pg_get_functiondef(oid) FROM pg_proc
                 WHERE pronamespace='public'::regnamespace
                   AND proname='current_user_has_global_access' LIMIT 1), '(nincs)')
UNION ALL
SELECT 132, '0/A2 · ÉLŐ TÖRZS — MENTSD EL!', 'current_user_can_access_congregation — TELJES ÉLŐ TÖRZS',
       COALESCE((SELECT pg_get_functiondef(oid) FROM pg_proc
                 WHERE pronamespace='public'::regnamespace
                   AND proname='current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 133, '0/A2 · ÉLŐ TÖRZS — MENTSD EL!', 'current_user_can_edit_congregation — TELJES ÉLŐ TÖRZS',
       COALESCE((SELECT pg_get_functiondef(oid) FROM pg_proc
                 WHERE pronamespace='public'::regnamespace
                   AND proname='current_user_can_edit_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 134, '0/A2 · ÉLŐ TÖRZS — MENTSD EL!', 'sirhely_temeto_hozzaferheto + sirhely_hozzaferheto — TELJES ÉLŐ TÖRZS',
       COALESCE((SELECT string_agg(pg_get_functiondef(oid), E'\n-- ─────\n' ORDER BY proname)
                 FROM pg_proc WHERE pronamespace='public'::regnamespace
                   AND proname IN ('sirhely_temeto_hozzaferheto','sirhely_hozzaferheto')), '(nincs)')
UNION ALL
SELECT 135, '0/A2 · ÉLŐ TÖRZS — MENTSD EL!', 'kiadas_hozzaferheto — TELJES ÉLŐ TÖRZS',
       COALESCE((SELECT pg_get_functiondef(oid) FROM pg_proc
                 WHERE pronamespace='public'::regnamespace
                   AND proname='kiadas_hozzaferheto' LIMIT 1), '(nincs)')
UNION ALL
SELECT 136, '0/A2 · ÉLŐ TÖRZS — MENTSD EL!',
       '⚠️ VAN-E VÁRATLAN ÁG a fenti 5-ben? (profile_roles-hivatkozás, amit a repó nem ismer) — VÁRT: (egy sem)',
       COALESCE((SELECT string_agg(proname, ', ' ORDER BY proname) FROM pg_proc
                 WHERE pronamespace='public'::regnamespace
                   AND proname IN ('current_user_can_edit_congregation','sirhely_temeto_hozzaferheto',
                                   'sirhely_hozzaferheto','kiadas_hozzaferheto')
                   AND pg_get_functiondef(oid) LIKE '%profile_roles%'), '(egy sem)')

-- ── 0/A3 · ⛔ RLS BE VAN-E KAPCSOLVA? (policy RLS nélkül TÉTLEN) ───────────
UNION ALL
SELECT 141, '0/A3 · ⛔ RLS-ÁLLAPOT',
       '⛔ Táblák, amelyeken az authenticated-nek van jogosultsága, de az RLS KI VAN KAPCSOLVA — VÁRT: (egy sem), KÜLÖNBEN ÁLLJ MEG',
       COALESCE((SELECT string_agg(DISTINCT c.relname, ', ' ORDER BY c.relname)
                 FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
                   AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                               WHERE g.table_schema = 'public' AND g.table_name = c.relname
                                 AND g.grantee = 'authenticated')), '✅ egy sem')
UNION ALL
SELECT 142, '0/A3 · ⛔ RLS-ÁLLAPOT',
       '⛔ A HÉT KRITIKUS TÁBLÁN be van kapcsolva az RLS? — VÁRT: mind true',
       COALESCE((SELECT string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname)
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public'
                   AND c.relname IN ('szemely','befizetes','kiadas','csalad','gyerek','profiles','profile_roles')), '(nincs)')
UNION ALL
SELECT 143, '0/A3 · INDEXEK',
       'A három CREATE INDEX IF NOT EXISTS célpontjának MAI definíciója (a IF NOT EXISTS csak NÉVRE illeszt!)',
       COALESCE((SELECT string_agg(indexname || ' :: ' || indexdef, '  |  ' ORDER BY indexname)
                 FROM pg_indexes WHERE schemaname='public'
                   AND indexname IN ('idx_congregations_diocese_id','idx_dioceses_district_id',
                                     'idx_profile_roles_profile_scope')), '(egy sem — jó, létre fognak jönni)')

-- ── 0/B · JOGOK (GRANT és RLS csak EGYÜTT értelmes) ───────────────────────
UNION ALL
SELECT 201, '0/B · JOGOK',
       'EXECUTE a helper-függvényeken (kinek)',
       COALESCE((SELECT string_agg(DISTINCT p.proname || ' → ' || r.rolname, ' | ')
                 FROM pg_proc p
                 CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) ac
                 JOIN pg_roles r ON r.oid = ac.grantee
                 WHERE p.pronamespace = 'public'::regnamespace
                   AND p.proname IN ('current_user_has_global_access',
                                     'current_user_can_access_congregation',
                                     'current_user_congregation_id',
                                     'current_user_diocese_ids', 'current_user_district_ids',
                                     'felettes_szint_gyulekezet_ids', 'felettes_szint_hozzaferese',
                                     'felettes_szint_szerkesztheto', 'mm_moderator_e')
                   AND ac.privilege_type = 'EXECUTE'
                   AND r.rolname IN ('authenticated', 'anon', 'service_role')), '(nincs kiosztott EXECUTE)')
UNION ALL
SELECT 202, '0/B · JOGOK',
       'postgres.rolbypassrls (a SECURITY DEFINER helperek előfeltétele) — VÁRT: true',
       COALESCE((SELECT rolbypassrls::text FROM pg_roles WHERE rolname = 'postgres'), '(nincs)')
UNION ALL
SELECT 211, '0/B · JOGOK',
       '⛔ Van-e az authenticated-nek UPDATE joga a profiles-on? (ez a 2/A-1 mellékút előfeltétele) — VÁRT most: igen',
       COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
                 FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated'), '(nincs)')
UNION ALL
SELECT 212, '0/B · JOGOK',
       '⛔ profiles UPDATE-policy-k WITH CHECK-je (üres = a mellékút NYITVA) — VÁRT most: üres, ez a baj',
       COALESCE((SELECT string_agg(policyname || ' [' || cmd || '] with_check=' || COALESCE(with_check,'(NINCS)'), '  |  ' ORDER BY policyname)
                 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
                   AND cmd IN ('UPDATE','ALL')), '(nincs ilyen policy)')
UNION ALL
SELECT 213, '0/B · JOGOK',
       'Oszlop-szintű GRANT-ok a profiles-on (ha üres: csak tábla-szintű jog van)',
       COALESCE((SELECT string_agg(DISTINCT column_name || ':' || privilege_type, ', ')
                 FROM information_schema.column_privileges
                 WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated'
                   AND privilege_type='UPDATE'), '(nincs oszlop-szintű GRANT)')
UNION ALL
SELECT 214, '0/B · JOGOK',
       'Van-e MÁR profiles jogosultság-védő trigger? (0 = még nincs, a 2/A hozza létre)',
       (SELECT count(*)::text FROM pg_trigger
        WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
          AND tgname = 'profiles_jogosultsag_vedelem_trg')

-- ── 0/C · ⚠️ AKI VAKRA MENNE — EZT NÉZD MEG A LEGFIGYELMESEBBEN ────────────
UNION ALL
SELECT 301, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       'Aktív esperes / egyházmegyei admin fiókok száma (skalár szerep szerint)',
       (SELECT count(*)::text FROM public.profiles p
        WHERE p.status = 'active' AND p.role IN ('esperes', 'egyhazmegyei_admin'))
UNION ALL
SELECT 302, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⛔ EBBŐL HÁNYNAK NEM OLDHATÓ FEL A MEGYÉJE (se profile_roles sor, se skalár) — VÁRT: 0 (a 2. szakasz őrszeme is megállítja!)',
       (SELECT count(*)::text FROM public.profiles p
        WHERE p.status = 'active' AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND p.diocese_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                          WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                            AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                            AND pr.active = true AND pr.approval_status = 'approved'
                            AND pr.scope_id IS NOT NULL))
UNION ALL
SELECT 303, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⛔ …és KIK ŐK (ezeknek ELŐBB állítsd be a megyéjét!)',
       COALESCE((SELECT string_agg(COALESCE(p.email, p.full_name, p.id::text), ' | ' ORDER BY p.email)
                 FROM public.profiles p
                 WHERE p.status = 'active' AND p.role IN ('esperes', 'egyhazmegyei_admin')
                   AND p.diocese_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                                   WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                                     AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                                     AND pr.active = true AND pr.approval_status = 'approved'
                                     AND pr.scope_id IS NOT NULL)), '✅ nincs ilyen')
UNION ALL
SELECT 304, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⚠️ MEGYEI divergencia: a skalár FALLBACK-ként EL FOG ESNI. TEENDŐ: fejenként döntsd el, melyik a helyes — ha a SKALÁR (vagy MINDKETTŐ) kell, vedd fel profile_roles diocese-sorként a 2. szakasz ELŐTT!',
       COALESCE((SELECT string_agg(COALESCE(p.email, p.id::text) || ' (skalár: ' ||
                                   COALESCE((SELECT d.name FROM public.dioceses d WHERE d.id = p.diocese_id), '—') ||
                                   ', szerepkör: ' ||
                                   COALESCE((SELECT string_agg(d2.name, '+')
                                             FROM public.profile_roles pr
                                             JOIN public.dioceses d2 ON d2.id = pr.scope_id
                                             WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                                               AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                                               AND pr.active = true AND pr.approval_status = 'approved'), '—') || ')',
                                   ' | ')
                 FROM public.profiles p
                 WHERE p.status = 'active' AND p.role IN ('esperes', 'egyhazmegyei_admin')
                   AND p.diocese_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.profile_roles pr
                               WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                                 AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                                 AND pr.active = true AND pr.approval_status = 'approved'
                                 AND pr.scope_id IS DISTINCT FROM p.diocese_id)), '✅ nincs divergencia')
UNION ALL
SELECT 305, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⛔ Kerületi adminok, akiknek NEM oldható fel a kerülete — VÁRT: 0 (a 2. szakasz őrszeme is megállítja)',
       (SELECT count(*)::text FROM public.profiles p
        WHERE p.status = 'active' AND p.role = 'egyhazkeruleti_admin'
          AND p.district_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                          WHERE pr.profile_id = p.id AND pr.scope = 'district'
                            AND pr.role = 'egyhazkeruleti_admin'
                            AND pr.active = true AND pr.approval_status = 'approved'
                            AND pr.scope_id IS NOT NULL))
UNION ALL
SELECT 306, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⛔ KERÜLETI divergencia (az admin-scope.ts UNIÓZ, ez a fájl FALLBACK-el → a UI-ban látja, az adatbázisból 0 sort kap). EZT A FUTTATÁS ELŐTT RENDEZD!',
       COALESCE((SELECT string_agg(COALESCE(p.email, p.id::text) || ' (skalár: ' ||
                                   COALESCE((SELECT dt.name FROM public.districts dt WHERE dt.id = p.district_id), '—') ||
                                   ', szerepkör: ' ||
                                   COALESCE((SELECT string_agg(dt2.name, '+')
                                             FROM public.profile_roles pr
                                             JOIN public.districts dt2 ON dt2.id = pr.scope_id
                                             WHERE pr.profile_id = p.id AND pr.scope = 'district'
                                               AND pr.role = 'egyhazkeruleti_admin'
                                               AND pr.active = true AND pr.approval_status = 'approved'), '—') || ')',
                                   ' | ')
                 FROM public.profiles p
                 WHERE p.status = 'active' AND p.role = 'egyhazkeruleti_admin'
                   AND p.district_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.profile_roles pr
                               WHERE pr.profile_id = p.id AND pr.scope = 'district'
                                 AND pr.role = 'egyhazkeruleti_admin'
                                 AND pr.active = true AND pr.approval_status = 'approved'
                                 AND pr.scope_id IS DISTINCT FROM p.district_id)), '✅ nincs divergencia')
UNION ALL
SELECT 307, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       'Rendszergazdák (a szűkítés után ŐK látnak mindent) — aktív skalár admin | profile_roles system-admin',
       (SELECT count(*)::text FROM public.profiles p
        WHERE p.status = 'active' AND p.role = 'admin') || ' | ' ||
       (SELECT count(DISTINCT pr.profile_id)::text FROM public.profile_roles pr
        JOIN public.profiles p2 ON p2.id = pr.profile_id AND p2.status = 'active'
        WHERE pr.role = 'admin' AND pr.scope = 'system'
          AND pr.active = true AND pr.approval_status = 'approved')
UNION ALL
SELECT 308, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⚠️ MASTER_ADMIN_EMAIL ELLENŐRZÉS: az alábbi fiókok azok, amelyek MA globális jogúak, de a szűkítés után NEM lesznek. Nézd meg, hogy a .env MASTER_ADMIN_EMAIL címe NINCS köztük! (isMasterAdmin() csak az APP-ban ad admin jogot, az RLS-ben NEM — 2026-04-12-phase-0-rls-hardening.sql:14)',
       COALESCE((SELECT string_agg(COALESCE(p.email, p.id::text) || ' [' || p.role || ']', ' | ' ORDER BY p.email)
                 FROM public.profiles p
                 WHERE p.status='active' AND p.role IN ('esperes','egyhazmegyei_admin')
                   AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                                   WHERE pr.profile_id=p.id AND pr.scope='system' AND pr.role='admin'
                                     AND pr.active AND pr.approval_status='approved')), '(egy sem)')
UNION ALL
SELECT 309, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⚠️ APP⇄DB SZEREP-DIVERGENCIA: diocese/district hatókörű, jóváhagyott profile_roles sorok, amelyek szerepe KÍVÜL ESIK a szerep-szűrőn (az app kirajzolja a felületet, az adatbázis ÜRES tömböt ad!) — VÁRT: (egy sem)',
       COALESCE((SELECT string_agg(DISTINCT COALESCE(p.email, pr.profile_id::text) || ' [' || pr.scope || '/' || pr.role || ']', ' | ')
                 FROM public.profile_roles pr
                 JOIN public.profiles p ON p.id = pr.profile_id
                 WHERE pr.active = true AND pr.approval_status = 'approved'
                   AND pr.scope_id IS NOT NULL AND p.status = 'active'
                   AND ((pr.scope = 'diocese'  AND pr.role NOT IN ('esperes','egyhazmegyei_admin'))
                     OR (pr.scope = 'district' AND pr.role <> 'egyhazkeruleti_admin'))), '✅ egy sem')
UNION ALL
SELECT 310, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⚠️ A 2b (6) ÁG SZEREP-SZŰRŐJE: gyülekezeti hatókörű, jóváhagyott profile_roles sorok szerepenként. A (6) ág CSAK a lelkesz/konyvelo sorokat fogadja el — ami itt MÁS szerepnél jelenik meg, az NEM kap sor-hozzáférést a profilváltóban!',
       COALESCE((SELECT string_agg(x.role || '=' || x.db::text, ', ' ORDER BY x.role)
                 FROM (SELECT pr.role, count(*) AS db FROM public.profile_roles pr
                       WHERE pr.scope='congregation' AND pr.active AND pr.approval_status='approved'
                       GROUP BY pr.role) x), '(egy sem)')
UNION ALL
SELECT 311, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⛔ NEM AKTÍV profilokhoz tartozó, mégis approved+active hatókör-sorok (ma is joguk van!) — VÁRT: 0 (a szűkítés UTÁN is 0 kell legyen)',
       (SELECT count(*)::text FROM public.profile_roles pr
        JOIN public.profiles p ON p.id = pr.profile_id
        WHERE pr.active = true AND pr.approval_status = 'approved'
          AND p.status IS DISTINCT FROM 'active')
UNION ALL
SELECT 312, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '⛔ GYÜLEKEZETEK EGYHÁZMEGYE NÉLKÜL (ezek a szűkítés után az ESPERES elől is eltűnnek — a lelkész elől nem, ezért NEM VESZI ÉSZRE SENKI) — VÁRT: 0',
       (SELECT count(*)::text FROM public.congregations WHERE diocese_id IS NULL)
UNION ALL
SELECT 313, '0/C · ⚠️ HATÓKÖR-FELOLDÁS',
       '…és MELYEK ŐK. Ha nem üres: ELŐBB futtasd a 2026-08-10-gyulekezet-megye-kotes-javitas.sql B) szakaszát, vagy rendezd a /admin/gyulekezetek felületen!',
       COALESCE((SELECT string_agg(COALESCE(name, id::text), ' | ' ORDER BY name)
                 FROM public.congregations WHERE diocese_id IS NULL), '✅ nincs ilyen')

-- ── 0/D · ROBBANÁSI SUGÁR ──────────────────────────────────────────────────
UNION ALL
SELECT 401, '0/D · ROBBANÁSI SUGÁR',
       'Policy-k száma, amelyek KÖZVETLENÜL hívják a has_global_access-t (public séma)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public'
          AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%current_user_has_global_access%')
UNION ALL
SELECT 402, '0/D · ROBBANÁSI SUGÁR',
       'Policy-k száma, amelyek a can_access_congregation-t hívják (ezek a 2. szakasszal AUTOMATIKUSAN jóra állnak)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public'
          AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%current_user_can_access_congregation%')
UNION ALL
SELECT 403, '0/D · ROBBANÁSI SUGÁR',
       'storage.objects policy-k, amelyek a can_access_congregation-t hívják (automatikusan jóra állnak)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'storage'
          AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%current_user_can_access_congregation%')
UNION ALL
SELECT 404, '0/D · ROBBANÁSI SUGÁR',
       '⛔ storage.objects policy-k, amelyek KÖZVETLENÜL a has_global_access-t hívják (ezek a CSATOLMÁNYOK — az 5/B szakasz pótolja őket)',
       COALESCE((SELECT string_agg(policyname || ' [' || cmd || ']', ', ' ORDER BY policyname)
                 FROM pg_policies WHERE schemaname='storage'
                   AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%current_user_has_global_access%'), '(egy sem)')
UNION ALL
SELECT 405, '0/D · ROBBANÁSI SUGÁR',
       '…és MELY BUCKET-eket érintik (az 5/B szakasz ezekre hoz additív megyei olvasást)',
       COALESCE((SELECT string_agg(DISTINCT b, ', ')
                 FROM pg_policies,
                      LATERAL (SELECT substring(COALESCE(qual,'') || ' ' || COALESCE(with_check,'')
                                                from 'bucket_id = ''([A-Za-z0-9_.-]+)''') AS b) x
                 WHERE schemaname='storage'
                   AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%current_user_has_global_access%'
                   AND b IS NOT NULL), '(egy sem)')
UNION ALL
SELECT 406, '0/D · ROBBANÁSI SUGÁR',
       'A szemely tábla ÖSSZES policy-ja',
       COALESCE((SELECT string_agg(policyname || ' [' || cmd || '/' || permissive || ']', ', ' ORDER BY policyname)
                 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'szemely'), '(nincs)')
UNION ALL
SELECT 407, '0/D · ROBBANÁSI SUGÁR',
       '⚠️ RESTRICTIVE (ÉS-kapu) policy-k. AHOL ILYEN VAN, OTT A 4. SZAKASZ ADDITÍV POLICY-JA HATÁSTALAN MARADHAT (a RESTRICTIVE felülírja)!',
       COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
                 FROM pg_policies WHERE permissive = 'RESTRICTIVE'), '(nincs)')
UNION ALL
SELECT 408, '0/D · ROBBANÁSI SUGÁR',
       'Létezik a p0_legacy_authenticated_staff_gate? — VÁRT: false',
       (SELECT EXISTS (SELECT 1 FROM pg_policies
                       WHERE policyname = 'p0_legacy_authenticated_staff_gate')::text)
UNION ALL
SELECT 409, '0/D · ROBBANÁSI SUGÁR',
       'monetar sorok, amelyeknél a sourceid ELŐTAGJA NEM uuid (a 3e policy CASE-védelmét méri) — VÁRT: bármennyi, csak tudjunk róla',
       COALESCE((SELECT count(*)::text FROM public.monetar
                 WHERE source = 'congregation_cash_check'
                   AND split_part(COALESCE(sourceid,''), ':', 1)
                       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '(nincs monetar tábla)')

-- ── 0/E · A 4. SZAKASZ ELŐNÉZETE ───────────────────────────────────────────
-- ⚠️ A szűrő PONTOSAN AZONOS a 4. szakasz ciklusáéval (policy-SZINTŰ kizárás,
--    qual ÉS with_check, csak SELECT/ALL policy-k) — ha itt látod, ott is kap.
UNION ALL
SELECT 501, '0/E · A 4. SZAKASZ ELŐNÉZETE',
       'Ezek a táblák kapnak additív MEGYEI/KERÜLETI SELECT policy-t (<tábla>_szint_select)',
       COALESCE((SELECT string_agg(DISTINCT pol.tablename, ', ' ORDER BY pol.tablename)
                 FROM pg_policies pol
                 WHERE pol.schemaname = 'public'
                   AND pol.permissive = 'PERMISSIVE'
                   AND pol.cmd IN ('SELECT', 'ALL')
                   AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_has_global_access%'
                   AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) NOT LIKE '%current_user_can_access_congregation%'
                   AND EXISTS (SELECT 1 FROM information_schema.columns col
                               WHERE col.table_schema = 'public'
                                 AND col.table_name = pol.tablename
                                 AND col.column_name = 'congregation_id'
                                 AND col.data_type = 'uuid')
                   AND pol.tablename NOT LIKE 'mm\_%'
                   AND pol.tablename NOT LIKE 'diocese\_%'
                   AND pol.tablename NOT IN (
                        'bealitas', 'lelkeszi_jelentes', 'chitanta_tombok',
                        'document_submissions', 'annual_reports', 'ertesitesek',
                        'import_logs', 'profiles', 'profile_roles', 'profile_congregations',
                        'dioceses', 'districts', 'congregations',
                        'support_messages', 'admin_access_requests',
                        'audit_log', 'system_settings', 'cfg_report', 'cfgparam', 'param')),
                '(egy tábla sem)')
UNION ALL
SELECT 502, '0/E · A 4. SZAKASZ ELŐNÉZETE',
       'MM (Missziós Műhely) táblák + PARANCS, amelyeken az 5. szakasz megtartja a moderátori jogot',
       COALESCE((SELECT string_agg(DISTINCT tablename || '[' || cmd || ']', ', ' ORDER BY tablename || '[' || cmd || ']')
                 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename LIKE 'mm\_%'
                   AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%current_user_has_global_access%'), '(egy sem)')
UNION ALL
SELECT 503, '0/E · A 4. SZAKASZ ELŐNÉZETE',
       'ℹ️ Táblák, amelyek a szűkítés után CSAK rendszergazdának maradnak (NINCS congregation_id oszlopuk — legacy/admin/scratch)',
       COALESCE((SELECT string_agg(DISTINCT pol.tablename, ', ' ORDER BY pol.tablename)
                 FROM pg_policies pol
                 WHERE pol.schemaname = 'public'
                   AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_has_global_access%'
                   AND NOT EXISTS (SELECT 1 FROM information_schema.columns col
                                   WHERE col.table_schema = 'public'
                                     AND col.table_name = pol.tablename
                                     AND col.column_name = 'congregation_id')), '(egy sem)')
UNION ALL
SELECT 504, '0/E · A 4. SZAKASZ ELŐNÉZETE',
       '⚠️ Táblák, amelyeknek VAN congregation_id oszlopa, de NEM uuid típusú (a ciklus NÉMÁN kihagyja őket!) — VÁRT: (egy sem)',
       COALESCE((SELECT string_agg(DISTINCT pol.tablename || ' (' || col.data_type || ')', ', ')
                 FROM pg_policies pol
                 JOIN information_schema.columns col
                   ON col.table_schema='public' AND col.table_name=pol.tablename
                  AND col.column_name='congregation_id'
                 WHERE pol.schemaname='public'
                   AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_has_global_access%'
                   AND col.data_type <> 'uuid'), '✅ egy sem')
UNION ALL
SELECT 505, '0/E · A 4. SZAKASZ ELŐNÉZETE',
       'ℹ️ Táblák, amelyeket a kizárás NÉVRE SZÓLÓAN hagy ki (mert a 3. szakasz vagy a 2026-08-09-es fájl kezeli őket) — csak tájékoztatás',
       'bealitas, lelkeszi_jelentes, chitanta_tombok, document_submissions, annual_reports, ertesitesek, import_logs, profiles, profile_roles, profile_congregations, dioceses, districts, congregations, support_messages, admin_access_requests, audit_log, system_settings, cfg_report, cfgparam, param'

-- ── 0/F · ⛔ NYITOTT (true) PERMISSIVE POLICY-K — MEGÁLLÍTÓ SWEEP ──────────
-- A PERMISSIVE policy-k VAGY-olódnak: EGYETLEN megmaradt `USING (true)` MINDEN
-- szűkítést hatástalanná tesz azon a táblán. A 4/B szakasz ezeket zárja le —
-- de CSAK ott, ahol van congregation_id uuid oszlop. A többit KÉZZEL kell.
UNION ALL
SELECT 601, '0/F · ⛔ NYITOTT POLICY-K',
       '⛔ MINDEN authenticated PERMISSIVE policy, amelynek a qual VAGY a with_check-je literál `true` — a tudatosan publikus törzsadatot (adr*, nevnap, nom_cimlet, szamadasi*, befizetescel/-cfg, kiadascel, event, congregations/dioceses/districts, mm_*_kategoriak, mm_jelveny_tipusok) KIVÉVE',
       COALESCE((SELECT string_agg(tablename || '.' || policyname || '[' || cmd || ']', ', ' ORDER BY tablename, policyname)
                 FROM pg_policies
                 WHERE schemaname='public' AND permissive='PERMISSIVE'
                   AND 'authenticated' = ANY(roles)
                   AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true')
                   AND tablename NOT LIKE 'adr%'
                   AND tablename NOT IN ('nevnap','nom_cimlet','szamadasicel','szamadasidatum',
                                         'befizetescel','befizetocelcfg','kiadascel','event',
                                         'congregations','dioceses','districts',
                                         'mm_kategoriak','mm_segedanyag_kategoriak','mm_jelveny_tipusok')),
                '✅ egy sem — a szűkítés nem kerülhető meg nyitott policy-n')
UNION ALL
SELECT 602, '0/F · ⛔ NYITOTT POLICY-K',
       '⛔ EBBŐL: amit a 4/B szakasz AUTOMATIKUSAN le tud zárni (van congregation_id uuid oszlopa)',
       COALESCE((SELECT string_agg(DISTINCT p.tablename, ', ' ORDER BY p.tablename)
                 FROM pg_policies p
                 WHERE p.schemaname='public' AND p.permissive='PERMISSIVE'
                   AND 'authenticated' = ANY(p.roles)
                   AND (btrim(COALESCE(p.qual,'')) = 'true' OR btrim(COALESCE(p.with_check,'')) = 'true')
                   AND p.tablename NOT LIKE 'adr%'
                   AND p.tablename NOT IN ('nevnap','nom_cimlet','szamadasicel','szamadasidatum',
                                           'befizetescel','befizetocelcfg','kiadascel','event',
                                           'congregations','dioceses','districts',
                                           'mm_kategoriak','mm_segedanyag_kategoriak','mm_jelveny_tipusok')
                   AND EXISTS (SELECT 1 FROM information_schema.columns col
                               WHERE col.table_schema='public' AND col.table_name=p.tablename
                                 AND col.column_name='congregation_id' AND col.data_type='uuid')), '(egy sem)')
UNION ALL
SELECT 603, '0/F · ⛔ NYITOTT POLICY-K',
       '⛔⛔ EBBŐL: amit KÉZZEL kell rendezni (NINCS congregation_id uuid oszlop — a 4/B nem nyúl hozzá, és ez a szűkítés MARADÉK LYUKA!)',
       COALESCE((SELECT string_agg(DISTINCT p.tablename, ', ' ORDER BY p.tablename)
                 FROM pg_policies p
                 WHERE p.schemaname='public' AND p.permissive='PERMISSIVE'
                   AND 'authenticated' = ANY(p.roles)
                   AND (btrim(COALESCE(p.qual,'')) = 'true' OR btrim(COALESCE(p.with_check,'')) = 'true')
                   AND p.tablename NOT LIKE 'adr%'
                   AND p.tablename NOT IN ('nevnap','nom_cimlet','szamadasicel','szamadasidatum',
                                           'befizetescel','befizetocelcfg','kiadascel','event',
                                           'congregations','dioceses','districts',
                                           'mm_kategoriak','mm_segedanyag_kategoriak','mm_jelveny_tipusok')
                   AND NOT EXISTS (SELECT 1 FROM information_schema.columns col
                                   WHERE col.table_schema='public' AND col.table_name=p.tablename
                                     AND col.column_name='congregation_id' AND col.data_type='uuid')), '✅ egy sem')

) AS t
ORDER BY sorrend;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⛔ MIELŐTT TOVÁBBMÉSZ — ELLENŐRZŐ LISTA                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--   · 102 = true (member-portal P0 fut) → ÁLLJ MEG. A 2. szakasz őrszeme is megfogja.
--   · 121 vagy 122 ≠ true → ELŐBB futtasd a 2026-08-03-pr25-csalad-gyerek-rls-scope.sql-t.
--     KÜLÖNBEN az esperes a SAJÁT megyéjében is elveszti a családi kartont és a
--     gyerek-táblát. (A 2. szakasz őrszeme is megállít.)
--   · 131–135 → MÁSOLD BE a _RUN_LOG.md-be. Baj esetén a 8. szakaszt EBBŐL javítsd.
--   · 136 ≠ (egy sem) → ÁLLJ MEG: a produkcióban olyan ág van, amit a repó nem ismer.
--   · 141 ≠ (egy sem) → ÁLLJ MEG. Policy RLS nélkül TÉTLEN, a tábla viszont a
--     GRANT alapján TELJESEN NYITVA. Előbb ALTER TABLE … ENABLE ROW LEVEL SECURITY.
--   · 143 → ha a három index MÁS definícióval már létezik, a CREATE INDEX IF NOT
--     EXISTS NÉVRE illeszt és NÉMÁN kihagyja. Ilyenkor nevezd át vagy dobd el őket.
--   · 302/303 ≠ 0 → ELŐBB állítsd be az érintett esperesek megyéjét.
--   · 304 nem üres → fejenként DÖNTS: ha a skalár (is) kell, vedd fel
--     profile_roles diocese-sorként MOST, mert a szűkítés után a skalár nem számít.
--   · 305 ≠ 0 vagy 306 nem üres → rendezd a kerületi adminokat.
--   · 308 → nézd meg, hogy a MASTER_ADMIN_EMAIL fiók NINCS a listában. Ha ott van:
--     ELŐBB vedd fel neki a profiles.role='admin'-t VAGY egy system-scope admin
--     profile_roles sort, különben az /admin felülete kiürül.
--   · 309 nem üres → ezek a fiókok az appban látják a megyei/kerületi felületet,
--     de az adatbázisból 0 sort kapnának. Vagy vedd fel nekik a helyes szerepű
--     sort, vagy tudatosan vállald (és írd be a _RUN_LOG-ba).
--   · 311 ≠ 0 → felfüggesztett fiókoknak ottfelejtett jóváhagyott hatókör-soruk van.
--   · 312 ≠ 0 → ELŐBB a 2026-08-10-gyulekezet-megye-kotes-javitas.sql B) szakasza.
--   · 407 nem üres → azokon a táblákon a 4. szakasz additív policy-ja HATÁSTALAN
--     maradhat; a 7. szakasz A/9b pontja ezért kötelező.
--   · 601 nem üres → NE FUTTASD a 2. szakaszt, amíg a 4/B (és a 603-as kézi lista)
--     nincs rendezve: egyetlen `USING (true)` az egész szűkítést megkerüli.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — HATÓKÖR-FELOLDÓ SEGÉDFÜGGVÉNYEK                             ║
-- ║ Ez a szakasz ÖNMAGÁBAN NEM VÁLTOZTAT SEMMILYEN VISELKEDÉST — csak        ║
-- ║ létrehozza az eszközöket.                    FUTTATÁSI SORREND: 2.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ────────────────────────────────────────────────────────────────────────────
-- 1a) current_user_diocese_ids() — a hívó EGYHÁZMEGYE-azonosítói
-- ────────────────────────────────────────────────────────────────────────────
-- KÉTLÁBÚ FELOLDÁS, FALLBACK-ELVVEL:
--   1. a profile_roles approved+active `diocese`-hatókörű, ESPERESI/MEGYEI ADMIN
--      szerepű sorai — ELSŐDLEGES,
--   2. a skalár profiles.diocese_id — CSAK akkor, ha SEMMILYEN (szereptől
--      független) diocese-hatókörű, jóváhagyott, aktív sor SINCS.
--
-- ⚠️ HÁROM SZÁNDÉKOS DÖNTÉS, amit a revízió kifogásolt — indoklással:
--
--   (a) `profiles.status = 'active'` KAPU MINDKÉT LÁBON. Az `admin_user_status_rpc`
--       (2026-05-04-admin-user-status-rpc.sql:183) a deaktiváláskor CSAK a
--       `profiles.status`-t írja 'rejected'-re, a profile_roles sorokat NEM
--       bántja. Kapu nélkül egy felfüggesztett esperes az ottfelejtett soron
--       KERESZTÜL továbbra is látná az egész megye tagnyilvántartását (CNP-vel)
--       és pénzügyét — a szűkítés MELLETT nyílna új lyuk.
--
--   (b) SZEREP-SZŰRŐ a VISSZAADOTT sorokon (`esperes`/`egyhazmegyei_admin`).
--       A level-scope.ts BÁRMELY diocese-sort elfogad; ha ezt lemásolnánk, egy
--       `custom` („egyházmegyei titkár") vagy `egyhazmegyei_szamvevo` sor teljes
--       megyei szemely-hozzáférést kapna — az hatókör-BŐVÍTÉS, külön döntés.
--       ⚠️ EZ TEHÁT SZŰKEBB AZ APPNÁL. A 0/C 309-es sora név szerint felsorolja,
--          kit érint. (A COMMENT is ezt mondja — a korábbi „azonos" állítás téves volt.)
--
--   (c) A SKALÁR-ELNYOMÁS viszont SZEREP-FÜGGETLEN (`barmely_megyei_sor`),
--       pontosan mint az appban. Így az invariáns tiszta: az adatbázis SOHA
--       nem tágabb az appnál. (Enélkül egy `custom` diocese-sor birtokosánál az
--       app elnyomná a skalárt, az SQL viszont visszaadná — ellentétes irányú
--       divergencia.)
--
-- FAIL-CLOSED: a COALESCE(..., '{}') miatt SOSEM ad NULL-t.

CREATE OR REPLACE FUNCTION public.current_user_diocese_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $megye_ids$
  -- v2026-08-11-szukites
  WITH aktiv_hivo AS (
    SELECT p.id, p.role, p.diocese_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'          -- ⚠️ (a) aktivitási kapu
  ),
  barmely_megyei_sor AS (              -- ⚠️ (c) szerep-FÜGGETLEN elnyomás
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'diocese'
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
  ),
  szerep_sorok AS (                    -- ⚠️ (b) szerep-szűrt visszaadás
    SELECT pr.scope_id AS diocese_id
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'diocese'
      AND pr.role IN ('esperes', 'egyhazmegyei_admin')
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM aktiv_hivo)
  ),
  skalar_fallback AS (
    SELECT h.diocese_id
    FROM aktiv_hivo h
    WHERE h.role IN ('esperes', 'egyhazmegyei_admin')
      AND h.diocese_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM barmely_megyei_sor)
  )
  SELECT COALESCE(array_agg(DISTINCT s.diocese_id), '{}'::uuid[])
  FROM (
    SELECT diocese_id FROM szerep_sorok
    UNION
    SELECT diocese_id FROM skalar_fallback
  ) s;
$megye_ids$;

COMMENT ON FUNCTION public.current_user_diocese_ids() IS
  'A bejelentkezett felhasználó egyházmegye-hatóköre (uuid[]). Kétlábú, fallback-elvű feloldás; a hívó profiles.status = ''active'' kell legyen. ⚠️ SZÁNDÉKOSAN SZŰKEBB az apps/web/lib/auth/level-scope.ts:88-107-nél: az app BÁRMELY approved+active diocese-sort elfogad, ez a függvény CSAK az esperes/egyhazmegyei_admin szerepűeket adja vissza (a custom/szamvevo sorok hatókör-bővítést jelentenének). A skalár-ELNYOMÁS viszont — mint az appban — szerep-független. Üres tömb = nincs hatókör (FAIL-CLOSED), sosem NULL.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1b) current_user_district_ids() — a hívó EGYHÁZKERÜLET-azonosítói
-- ────────────────────────────────────────────────────────────────────────────
-- Ugyanaz a minta, mint 1a.
-- ⚠️ ELTÉRÉS a `ccm_caller_district_ids()`-től (2026-08-09-admin-kereszt-
--    egyeztetes.sql:78-102) ÉS a `getAdminDistrictScope()`-tól
--    (apps/web/lib/auth/admin-scope.ts:46-51): AZOK FELTÉTEL NÉLKÜL UNIÓZNAK,
--    ez FALLBACK-elvű. Ez tudatos (a visszavont szerep melletti elavult skalár
--    ne nyisson) — DE emiatt egy kerületi admin, akinek szerepkör-sora A-ra, a
--    skalárja B-re mutat, a UI-ban látná B-t és 0 sort kapna rá.
--    ⇒ A 0/C 306-os sora EZT NÉV SZERINT FELSOROLJA. A futtatás ELŐTT rendezd!

CREATE OR REPLACE FUNCTION public.current_user_district_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $kerulet_ids$
  -- v2026-08-11-szukites
  WITH aktiv_hivo AS (
    SELECT p.id, p.role, p.district_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
  ),
  barmely_keruleti_sor AS (
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'district'
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
  ),
  szerep_sorok AS (
    SELECT pr.scope_id AS district_id
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'district'
      AND pr.role = 'egyhazkeruleti_admin'
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM aktiv_hivo)
  ),
  skalar_fallback AS (
    SELECT h.district_id
    FROM aktiv_hivo h
    WHERE h.role = 'egyhazkeruleti_admin'
      AND h.district_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM barmely_keruleti_sor)
  )
  SELECT COALESCE(array_agg(DISTINCT s.district_id), '{}'::uuid[])
  FROM (
    SELECT district_id FROM szerep_sorok
    UNION
    SELECT district_id FROM skalar_fallback
  ) s;
$kerulet_ids$;

COMMENT ON FUNCTION public.current_user_district_ids() IS
  'A bejelentkezett felhasználó egyházkerület-hatóköre (uuid[]). Kétlábú, fallback-elvű; a hívó profiles.status = ''active'' kell legyen. ⚠️ SZIGORÚBB, mint a ccm_caller_district_ids() és a getAdminDistrictScope() (azok feltétel nélkül uniózzák a skalárt) — a divergáló fiókokat a 0/C 306-os sora sorolja fel. Üres tömb = nincs hatókör (FAIL-CLOSED).';

-- ────────────────────────────────────────────────────────────────────────────
-- 1c) felettes_szint_gyulekezet_ids() — a hatókörbe eső GYÜLEKEZETEK (tömb)
-- ────────────────────────────────────────────────────────────────────────────
-- EZT A POLICY-K HÍVJÁK, `(SELECT …)` burkolással → LEKÉRDEZÉSENKÉNT EGYSZER
-- fut (InitPlan). A két feloldót EGYSZER hívja (CTE), nem négyszer, mint a
-- revízió előtti változat.
--
-- ⚠️ A `LEFT JOIN dioceses`: az egyházmegyéhez NEM kötött gyülekezet
--    (congregations.diocese_id IS NULL) egyik lábon sem tud illeszkedni, tehát
--    a szűkítés után az ESPERES elől ELTŰNIK (a lelkész elől nem — ő a (2)
--    ágon megy). Ezt a 0/C 312/313-as sora méri; ha nem 0, ELŐBB rendezd.

CREATE OR REPLACE FUNCTION public.felettes_szint_gyulekezet_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_congs$
  -- v2026-08-11-szukites
  WITH sc AS (
    SELECT public.current_user_diocese_ids()  AS megyek,
           public.current_user_district_ids() AS keruletek
  )
  SELECT CASE
    WHEN sc.megyek = '{}'::uuid[] AND sc.keruletek = '{}'::uuid[]
      THEN '{}'::uuid[]                      -- rövidzár: minden lelkész itt áll meg
    ELSE COALESCE((
      SELECT array_agg(DISTINCT c.id)
      FROM public.congregations c
      LEFT JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE c.diocese_id  = ANY (sc.megyek)
         OR d.district_id = ANY (sc.keruletek)
    ), '{}'::uuid[])
  END
  FROM sc;
$felettes_congs$;

COMMENT ON FUNCTION public.felettes_szint_gyulekezet_ids() IS
  'A hívó megyei/kerületi hatókörébe eső gyülekezet-azonosítók (uuid[]). A congregations.diocese_id → dioceses.district_id VALÓDI láncon old fel, nem a sorok esetleg elavult diocese_id oszlopán. A POLICY-K EZT hívják, `= ANY (COALESCE((SELECT …), ''{}''::uuid[]))` alakban, hogy a tervező InitPlan-ként LEKÉRDEZÉSENKÉNT EGYSZER futtassa. Üres tömb = nincs felettes hatókör (FAIL-CLOSED).';

-- ────────────────────────────────────────────────────────────────────────────
-- 1d) felettes_szint_hozzaferese(uuid) — SKALÁR OLVASÁSI kapu (SORONKÉNTI út)
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ TELJESÍTMÉNY — A REVÍZIÓ HÁROM BLOKKERÉNEK A JAVÍTÁSA.
--    A SECURITY DEFINER függvényt a PostgreSQL SOHA nem inline-olja, és mivel
--    az argumentum soronként változik, az RLS SORONKÉNT hívja. A korábbi
--    változat ezért soronként ÚJRAÉPÍTETTE a teljes gyülekezet-tömböt
--    (rows × N_congregations × 2 függvényhívás) — az esperes /tagnyilvantartas
--    listája belefutott volna az `authenticated` szerep 8 másodperces
--    statement_timeout-jába.
--    Az új törzs EGYETLEN elsődleges-kulcs-keresést végez a congregations-en;
--    a két feloldó soronként pontosan EGYSZER-EGYSZER fut.
--    NULL argumentumra `c.id = NULL` → 0 sor → FALSE (fail-closed).

CREATE OR REPLACE FUNCTION public.felettes_szint_hozzaferese(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_kapu$
  -- v2026-08-11-szukites
  SELECT EXISTS (
    SELECT 1
    FROM public.congregations c
    LEFT JOIN public.dioceses d ON d.id = c.diocese_id
    WHERE c.id = target_cong
      AND (   c.diocese_id  = ANY (public.current_user_diocese_ids())
           OR d.district_id = ANY (public.current_user_district_ids()))
  );
$felettes_kapu$;

COMMENT ON FUNCTION public.felettes_szint_hozzaferese(uuid) IS
  'OLVASÁSI kapu: IGAZ, ha a megadott gyülekezet a hívó EGYHÁZMEGYEI vagy EGYHÁZKERÜLETI hatókörébe esik. Egyetlen PK-keresés a congregations-en (soronkénti RLS-hívásra optimalizálva). NULL-ra és üres hatókörre FALSE. A 2/B szakasz EZT szűkíti megye-only-ra — a SZERKESZTÉSI kaput (felettes_szint_szerkesztheto) NEM.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1d2) felettes_szint_szerkesztheto(uuid) — SKALÁR SZERKESZTÉSI kapu
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ MIÉRT KÜLÖN FÜGGVÉNY (a revízió két major-je):
--    A `current_user_can_edit_congregation()` mai kerületi ága
--    (2026-04-16-wc7-4-fazis2f-congregations.sql:196-207) a kerületi adminnak
--    TÖRZSADAT-SZERKESZTÉSI jogot ad a kerülete gyülekezeteire. Ha az edit-kapu
--    ugyanaz lenne, mint az olvasási kapu, akkor a 2/B szakasz (amely csak a
--    kerületi SOR-OLVASÁST akarja elvenni) NÉMÁN ELVENNÉ ezt a szerkesztési
--    jogot is. Ezért ebben a függvényben a KERÜLETI LÁB MINDIG BENT VAN, és a
--    2/B szakasz ezt a függvényt NEM módosítja.

CREATE OR REPLACE FUNCTION public.felettes_szint_szerkesztheto(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_edit_kapu$
  -- v2026-08-11-szukites — a KERÜLETI láb itt MINDIG bent van (2/B nem érinti)
  SELECT EXISTS (
    SELECT 1
    FROM public.congregations c
    LEFT JOIN public.dioceses d ON d.id = c.diocese_id
    WHERE c.id = target_cong
      AND (   c.diocese_id  = ANY (public.current_user_diocese_ids())
           OR d.district_id = ANY (public.current_user_district_ids()))
  );
$felettes_edit_kapu$;

COMMENT ON FUNCTION public.felettes_szint_szerkesztheto(uuid) IS
  'SZERKESZTÉSI kapu a gyülekezeti törzsadathoz: esperes/egyhazmegyei_admin a saját MEGYÉJÉBEN, egyhazkeruleti_admin a saját KERÜLETÉBEN. Törzse ma azonos a felettes_szint_hozzaferese()-vel, DE SZÁNDÉKOSAN külön függvény: a 2/B szakasz az olvasási kaput megye-only-ra szűkítheti, a kerületi admin mai törzsadat-szerkesztési joga viszont NEM veszhet el.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1e) mm_moderator_e() — a Missziós Műhely moderátori köre (5. szakaszhoz)
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ A revízió jogos kifogása után JAVÍTVA: ez most BYTE-HŰEN a
--    `current_user_has_global_access()` 2026-08-11 ELŐTTI törzse — CSAK a
--    profiles-skalár. A korábbi változatban volt egy profile_roles láb is, ami
--    olyanoknak adott volna MM-moderátori jogot, akiknek MA NINCS
--    (profile_roles-only esperes) — az BŐVÍTÉS lett volna, nem megőrzés,
--    miközben a szakasz célja a VÁLTOZATLANSÁG.

CREATE OR REPLACE FUNCTION public.mm_moderator_e()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $mm_mod$
  -- v2026-08-11-szukites — BYTE-HŰEN a régi has_global_access törzs
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
  );
$mm_mod$;

COMMENT ON FUNCTION public.mm_moderator_e() IS
  'Missziós Műhely moderátori jogosultság. BYTE-HŰEN a current_user_has_global_access() 2026-08-11 ELŐTTI törzse (csak a profiles-skalár, status=active). Azért külön függvény, mert az MM országos közösségi modul — ott a moderátori jog NEM egyházmegyei hatókör kérdése. SZÁNDÉKOSAN NINCS benne profile_roles láb: az BŐVÍTÉS lenne a mai állapothoz képest.';

-- ── JOGOK ──────────────────────────────────────────────────────────────────
-- ⚠️ A PostgreSQL alapértelmezett függvény-ACL-je EXECUTE-ot ad a PUBLIC-nak,
--    tehát GRANT nélkül is hívható lenne `anon`-ként. A függvények NULL
--    auth.uid()-nál false/'{}' értéket adnak (nem szivárgás), de a
--    2026-08-10-anon-jogok-vizsgalat-es-visszavonas.sql higiéniai köre után
--    ne hagyjunk definer-jogú felületet hitelesítetlen hívónak.
REVOKE ALL ON FUNCTION public.current_user_diocese_ids()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_district_ids()         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.felettes_szint_gyulekezet_ids()     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.felettes_szint_hozzaferese(uuid)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.felettes_szint_szerkesztheto(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mm_moderator_e()                    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_gyulekezet_ids()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_hozzaferese(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_szerkesztheto(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mm_moderator_e()                    TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()          TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()         TO service_role;
GRANT EXECUTE ON FUNCTION public.felettes_szint_gyulekezet_ids()     TO service_role;
GRANT EXECUTE ON FUNCTION public.felettes_szint_hozzaferese(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.felettes_szint_szerkesztheto(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.mm_moderator_e()                    TO service_role;

-- ── INDEXEK ────────────────────────────────────────────────────────────────
-- ⚠️ A CREATE INDEX IF NOT EXISTS CSAK A NÉVRE illeszt. Ha ezek a nevek MÁS
--    definícióval már léteznek, a parancs NÉMÁN kimarad. A 0/A 143-as sora
--    ezért kiírja a MAI indexdef-eket — nézd meg, mielőtt futtatod.
CREATE INDEX IF NOT EXISTS idx_congregations_diocese_id ON public.congregations (diocese_id);
CREATE INDEX IF NOT EXISTS idx_dioceses_district_id     ON public.dioceses (district_id);
CREATE INDEX IF NOT EXISTS idx_profile_roles_profile_scope
  ON public.profile_roles (profile_id, scope, scope_id)
  WHERE active = true AND approval_status = 'approved';

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2/A. SZAKASZ — A MELLÉKUTAK LEZÁRÁSA                                     ║
-- ║ ⚠️ ENÉLKÜL A SZŰKÍTÉSNEK NINCS ÉRTELME.       FUTTATÁSI SORREND: 3.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A fenyegetési modell: érvényes esperes-JWT + a publikus anon kulcs, közvetlen
-- PostgREST-hívás. A 2. szakasz elveszi az országos olvasást — de két nyitva
-- hagyott ajtón EGYETLEN kéréssel vissza lehetne szerezni:
--
--   1) `profiles_write_own` (2026-04-13-rls-hybrid-admin-tables.sql:34-35):
--        FOR UPDATE TO authenticated USING (id = auth.uid())
--      WITH CHECK NINCS, oszlop-szintű GRANT NINCS, védő trigger NINCS
--      (a 2026-04-23-m2-6-profiles-revision.sql triggere csak revision/updated_at).
--      ⇒ `PATCH /rest/v1/profiles?id=eq.<sajat-uid>` body `{"role":"admin"}`
--        → az új has_global_access (1) ága true → ORSZÁGOS olvasás ÉS ÍRÁS.
--        Feltűnésmentesebb változatok: `{"congregation_id": "<bármely>"}` → (2) ág;
--        `{"diocese_id": "<másik megye>"}` → a skalár-fallback ág.
--
--   2) `profile_roles_admin_manage` (2026-04-17-profile-roles-fazis-1.sql:150-169):
--        FOR ALL TO authenticated, USING/WITH CHECK = „admin VAGY egyhazkeruleti_admin",
--      SEMMILYEN hatókör-korlát nélkül, `GRANT … INSERT … TO authenticated` mellett.
--      ⇒ bármely `egyhazkeruleti_admin` beszúrhat magának egy
--        `{scope:'system', role:'admin', active:true, approval_status:'approved'}`
--        sort → az új has_global_access (2) ága true → TELJES RENDSZERGAZDA.
--        Vagy egy `scope='congregation'` sort BÁRMELY ország-beli gyülekezetre
--        → a can_access (6) ágán annak teljes tagnyilvántartása.
--
-- MIÉRT TRIGGER ÉS NEM `REVOKE UPDATE … GRANT UPDATE (oszlopok)`:
-- az oszlop-listát nem lehet a repóból hiánytalanul összeszedni (a produkció
-- bizonyítottan széthúz), és egy kifelejtett oszlop NÉMA elakadást okozna a
-- profil-mentésben. A trigger a fordított logikát használja: TILTÓLISTA az 5
-- jogosultsági oszlopra, minden más marad. A ma élő önmentő útvonalak
-- (oauth-complete/actions.ts:73-90 és (setup)/welcome/actions.ts:743-753)
-- KIZÁRÓLAG full_name / phone / birth_date mezőt írnak — ezeket nem érinti.

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── 2/A-1 · profiles: a jogosultsági oszlopok önírásának tiltása ───────────
CREATE OR REPLACE FUNCTION public.profiles_jogosultsag_vedelem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $profil_vedelem$
BEGIN
  -- v2026-08-11-szukites
  -- (a) service_role / postgres / migráció / auth-trigger: auth.uid() NULL → átmegy.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (b) Rendszergazda (skalár VAGY system-scope profile_roles) → átmegy.
  --     Az admin szerepkezelő RPC-k (admin_user_status_rpc, setUserRole,
  --     access-request jóváhagyás) mind rendszergazdai munkamenetben futnak.
  IF public.current_user_has_global_access() THEN
    RETURN NEW;
  END IF;

  -- (c) Mindenki más: a jogosultsági oszlopok NEM változhatnak.
  IF (NEW.role, NEW.status, NEW.congregation_id, NEW.diocese_id, NEW.district_id)
       IS DISTINCT FROM
     (OLD.role, OLD.status, OLD.congregation_id, OLD.diocese_id, OLD.district_id)
  THEN
    RAISE EXCEPTION
      '⛔ A jogosultsági mezők (role, status, congregation_id, diocese_id, district_id) nem módosíthatók a saját profilon. Kérj rendszergazdai segítséget.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$profil_vedelem$;

COMMENT ON FUNCTION public.profiles_jogosultsag_vedelem() IS
  '2026-08-11 (P1 #17 kísérő): megakadályozza, hogy egy authenticated felhasználó a profiles_write_own policy-n keresztül átírja a saját role / status / congregation_id / diocese_id / district_id mezőjét. Enélkül a globális hozzáférés szűkítése EGYETLEN PostgREST PATCH-csel megkerülhető. Rendszergazdának és service_role-nak (auth.uid() IS NULL) nem korlátoz.';

DROP TRIGGER IF EXISTS profiles_jogosultsag_vedelem_trg ON public.profiles;
CREATE TRIGGER profiles_jogosultsag_vedelem_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_jogosultsag_vedelem();

-- ── 2/A-2 · profile_roles: a szerepkör-kiosztás hatókör-korlátozása ────────
-- Az USING-ág (olvasás/DELETE-láthatóság) SZÁNDÉKOSAN VÁLTOZATLAN — csak a
-- WITH CHECK (INSERT/UPDATE eredménye) szigorodik, hogy semmi meglévő
-- adminisztrációs képernyő ne ürüljön ki.
DROP POLICY IF EXISTS profile_roles_admin_manage ON public.profile_roles;
CREATE POLICY profile_roles_admin_manage
  ON public.profile_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
    AND (
      -- (1) Igazi rendszergazda: változatlanul bármit.
      public.current_user_has_global_access()

      -- (2) Kerületi admin: SOHA nem a saját profiljára, SOHA nem system-scope,
      --     és csak a SAJÁT kerületén belülre.
      OR (
        profile_roles.profile_id IS DISTINCT FROM auth.uid()
        AND (
          (profile_roles.scope = 'district'
             AND profile_roles.scope_id = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])))
          OR (profile_roles.scope = 'diocese'
             AND EXISTS (
               SELECT 1 FROM public.dioceses d
               WHERE d.id = profile_roles.scope_id
                 AND (d.id         = ANY (COALESCE((SELECT public.current_user_diocese_ids()),  '{}'::uuid[]))
                   OR d.district_id = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])))))
          OR (profile_roles.scope = 'congregation'
             AND public.felettes_szint_hozzaferese(profile_roles.scope_id))
        )
      )
    )
  );

COMMENT ON POLICY profile_roles_admin_manage ON public.profile_roles IS
  '2026-08-11 (P1 #17 kísérő): az USING-ág változatlan (a szerepkör-képernyők nem ürülnek ki), a WITH CHECK viszont hatókörhöz köti a kiosztást. Enélkül BÁRMELY egyhazkeruleti_admin beszúrhatott magának egy scope=''system'', role=''admin'' sort (→ teljes rendszergazda), vagy egy tetszőleges ország-beli gyülekezetre congregation-scope sort (→ annak teljes tagnyilvántartása a can_access (6) ágán). Saját profile_id-re csak igazi rendszergazda állíthat be sort.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ⚠️ 2/A UTÁNI GYORSPRÓBA (kötelező, a 7. szakasz 25-26. pontja is méri):
--    · lelkészként a /profile oldalon a név/telefon mentése MŰKÖDIK,
--    · a böngésző konzoljából `supabase.from('profiles').update({role:'admin'})
--      .eq('id', <sajat>)` HIBÁVAL tér vissza (42501 / insufficient_privilege).
-- ⚠️ AMIT A 2/A NEM ZÁR (tudatos, külön kör):
--    a `profile_roles_admin_manage` USING-ága továbbra is engedi, hogy egy
--    kerületi admin BÁRMELY ország-beli szerepkör-sort LÁSSON és TÖRÖLJÖN /
--    inaktiváljon. Ez rendelkezésre-állási (DoS) kockázat, nem szivárgás;
--    a szigorítás a szerepkör-modul külön körében esedékes.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SZAKASZ — NÉVRE SZÓLÓ HIÁNYPÓTLÓ POLICY-K                             ║
-- ║ Nyolc konkrét hely, ahol a mai megyei munka KIZÁRÓLAG a globális ágon     ║
-- ║ áll, és a szűkítés után némán elnémulna.       FUTTATÁSI SORREND: 4.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $elofeltetel$
BEGIN
  IF to_regprocedure('public.felettes_szint_hozzaferese(uuid)') IS NULL THEN
    RAISE EXCEPTION '⛔ Előbb az 1. SZAKASZT futtasd.';
  END IF;
END
$elofeltetel$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3a) DIOCESES — az esperes szerkessze a SAJÁT egyházmegyéje törzsadatát
-- ────────────────────────────────────────────────────────────────────────────
-- A meglévő `dioceses_update_by_esperes` (2026-08-09-megye-kerulet-rls-fix.sql:415)
-- ágaiból HIÁNYZIK a skalár esperes/egyhazmegyei_admin ág. Az ilyen esperes ma
-- KIZÁRÓLAG a globális ágon fér hozzá — a szűkítés után az IBAN/CIF/elérhetőség
-- mentése némán 0 sort érintene (nem hibát dobna!).
DROP POLICY IF EXISTS dioceses_update_diocese_scope ON public.dioceses;
CREATE POLICY dioceses_update_diocese_scope
  ON public.dioceses
  FOR UPDATE TO authenticated
  USING      (dioceses.id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
  WITH CHECK (dioceses.id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])));

COMMENT ON POLICY dioceses_update_diocese_scope ON public.dioceses IS
  '2026-08-11: az esperes / egyházmegyei admin a SAJÁT egyházmegyéje törzsadatát szerkesztheti (kétlábú feloldás). Korábban ez a globális hozzáférésen múlt, ami az ORSZÁG összes egyházmegyéjét megnyitotta.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3b) PROFILE_ROLES — a szerepkör-kiosztó és -jóváhagyó képernyők
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profile_roles_diocese_read_roles ON public.profile_roles;
CREATE POLICY profile_roles_diocese_read_roles
  ON public.profile_roles
  FOR SELECT TO authenticated
  USING (
    (profile_roles.scope = 'diocese'
     AND profile_roles.scope_id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
    OR (profile_roles.scope = 'congregation'
     AND profile_roles.scope_id = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])))
  );

COMMENT ON POLICY profile_roles_diocese_read_roles ON public.profile_roles IS
  '2026-08-11: additív SELECT-láb a profile_roles-ban tárolt megyei hatókörhöz. A régi profile_roles_diocese_read csak a profiles skalár lábat fedte — a kettő EGYÜTT adja ki a teljes képet (skalár⇄profile_roles divergencia, ismert hibaosztály).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3c) PROFILE_CONGREGATIONS — könyvelői/számvevői hozzárendelések listája
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profile_congregations_diocese_read ON public.profile_congregations;
CREATE POLICY profile_congregations_diocese_read
  ON public.profile_congregations
  FOR SELECT TO authenticated
  USING (profile_congregations.congregation_id
         = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));

COMMENT ON POLICY profile_congregations_diocese_read ON public.profile_congregations IS
  '2026-08-11: az esperes / egyházmegyei admin (és a kerületi admin) OLVASHATJA a hatóköre gyülekezeteinek könyvelői/számvevői hozzárendeléseit — a megyei irányítópult listAssignments hívásához. Csak SELECT.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3d) IMPORT_LOGS — megyei import-napló, profile_roles láb
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS import_logs_select_diocese_scope ON public.import_logs;
CREATE POLICY import_logs_select_diocese_scope
  ON public.import_logs
  FOR SELECT TO authenticated
  USING (import_logs.congregation_id
         = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));

COMMENT ON POLICY import_logs_select_diocese_scope ON public.import_logs IS
  '2026-08-11: additív megyei/kerületi SELECT-láb az import-naplóhoz. UPDATE/DELETE szándékosan marad rendszergazdai.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3e) MONETAR — pénztári címletjegyzék (nincs congregation_id oszlopa)
-- ────────────────────────────────────────────────────────────────────────────
-- A gyülekezet SZÖVEGES mezőből jön: source = 'congregation_cash_check',
-- sourceid = '<uuid>:<év>'.
-- ⚠️ A KIÉRTÉKELÉSI SORREND CASE-SZEL VAN KIKÉNYSZERÍTVE (a revízió 3 külön
--    jelzése). A korábbi `regex AND … ::uuid` alak az AND-ágak sorrendjére
--    épített, amit a PostgreSQL NEM GARANTÁL (a tervező költség alapján
--    átrendezi az order_qual_clauses-ban). EGYETLEN rossz formátumú sourceid
--    22P02-vel megölte volna az EGÉSZ monetar-lekérdezést — MINDEN felhasználónak,
--    a gyülekezeti lelkészt is beleértve. A CASE ágainak kiértékelési sorrendje
--    viszont garantált (a THEN-ág Var-t tartalmaz, tehát nem is konstans-hajtogatható).
--    A 0/D 409-es sora megmondja, hány ilyen sor van ma.
DROP POLICY IF EXISTS monetar_szint_select ON public.monetar;
CREATE POLICY monetar_szint_select
  ON public.monetar
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN monetar.source = 'congregation_cash_check'
       AND split_part(COALESCE(monetar.sourceid, ''), ':', 1)
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN split_part(monetar.sourceid, ':', 1)::uuid
           = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[]))
      ELSE false
    END
  );

COMMENT ON POLICY monetar_szint_select ON public.monetar IS
  '2026-08-11: additív megyei/kerületi OLVASÁS a pénztári címletjegyzéken. A gyülekezetet a sourceid „<uuid>:<év>" előtagjából oldja fel. A uuid-cast CASE-ben van, mert a PostgreSQL nem garantálja az AND-ágak kiértékelési sorrendjét: egyetlen rossz formátumú sourceid különben 22P02-vel megölné az EGÉSZ monetar-lekérdezést, minden felhasználónak.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3f) DOCUMENT_SUBMISSIONS — ⭐ A REVÍZIÓ BLOKKERE
-- ────────────────────────────────────────────────────────────────────────────
-- A korábbi változat kihagyta ezt a táblát azzal, hogy „a 2026-08-09-es fájl
-- már adott neki megyei/kerületi ágat". EZ TÉVES VOLT:
--   · a 2026-08-09-es fájl KERÜLETI SELECT/UPDATE párt adott (1a/1b),
--     és megyei profile_roles SELECT/UPDATE párt (6a/6b),
--   · a MEGYEI FŐ-ág továbbra is az érintetlen `document_submissions_diocese_access`
--     (2026-04-17-document-submissions-fix.sql:89-109): FOR ALL, és SKALÁR-ONLY
--     (`p.diocese_id = document_submissions.diocese_id`).
-- Két baj:
--   (i)  a profile_roles-only esperes ma a GLOBÁLIS ágon éri el a sorokat; a
--        2a után az elesik, és bár a 6a/6b policy megvan, az CSAK SELECT+UPDATE —
--        az INSERT/DELETE (pl. csatolmány-rekord) nincs fedve;
--   (ii) a policy a sor SAJÁT `diocese_id` oszlopát nézi, amit a 2026-08-09-es
--        fájl audit 8a. szakasza NULLABLE-nek és ELAVULHATÓNAK dokumentál —
--        az ilyen sorok ma CSAK a globális ágon látszanak, és NÉMÁN eltűnnének.
-- Ez az additív policy a VALÓDI láncon old fel (congregations.diocese_id),
-- nem a sor tárolt diocese_id-jén.
DROP POLICY IF EXISTS document_submissions_szint_all ON public.document_submissions;
CREATE POLICY document_submissions_szint_all
  ON public.document_submissions
  FOR ALL TO authenticated
  USING      (document_submissions.congregation_id
              = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])))
  WITH CHECK (document_submissions.congregation_id
              = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));

COMMENT ON POLICY document_submissions_szint_all ON public.document_submissions IS
  '2026-08-11 (P1 #17): additív megyei/kerületi TELJES hozzáférés a beküldött dokumentumokhoz, a congregations.diocese_id VALÓDI láncán feloldva. A meglévő document_submissions_diocese_access SKALÁR-ONLY és a sor tárolt (nullable, elavulható) diocese_id oszlopát nézi; a 2026-08-09-es fájl csak SELECT/UPDATE ágat pótolt. Enélkül a profile_roles-only esperes a szűkítés után elveszítené a teljes megyei dokumentum-munkafolyamatot.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3g) ANNUAL_REPORTS — ⭐ A REVÍZIÓ BLOKKERE (ugyanaz a téves premissza)
-- ────────────────────────────────────────────────────────────────────────────
-- `annual_reports_select` (2026-04-15-annual-reports-extension.sql:71-88) és
-- `annual_reports_update_esperes` (:115-130) megyei ága SKALÁR-ONLY
-- (`profiles p JOIN congregations c ON c.diocese_id = p.diocese_id`).
-- A 2026-08-09-es fájl KERÜLETI SELECT-et (5.) és megyei profile_roles
-- SELECT+UPDATE-et (6c) adott — de a skalár-only fő-ág marad, és a globális ág
-- elesése után egy profile_roles-only esperes a saját megyéje éves jelentéseit
-- se OLVASNI, se ÁTVENNI/STÁTUSZT LÉPTETNI nem tudná (néma üres lista + 0 sort
-- érintő UPDATE). A 7. szakasz A/5 pontja pontosan ezt méri.
DROP POLICY IF EXISTS annual_reports_szint_select ON public.annual_reports;
CREATE POLICY annual_reports_szint_select
  ON public.annual_reports
  FOR SELECT TO authenticated
  USING (
    annual_reports.deleted = false
    AND annual_reports.congregation_id
        = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[]))
  );

DROP POLICY IF EXISTS annual_reports_szint_update ON public.annual_reports;
CREATE POLICY annual_reports_szint_update
  ON public.annual_reports
  FOR UPDATE TO authenticated
  USING      (annual_reports.congregation_id
              = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])))
  WITH CHECK (annual_reports.congregation_id
              = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));

COMMENT ON POLICY annual_reports_szint_select ON public.annual_reports IS
  '2026-08-11 (P1 #17): additív megyei/kerületi OLVASÁS az éves jelentésekhez. A meglévő annual_reports_select megyei ága skalár-only; a globális ág elesése után a profile_roles-only esperes üres listát kapna.';
COMMENT ON POLICY annual_reports_szint_update ON public.annual_reports IS
  '2026-08-11 (P1 #17): additív megyei/kerületi UPDATE (átvétel, review_notes, státusz-előrelépés). A meglévő annual_reports_update_esperes megyei ága skalár-only; enélkül a profile_roles-only esperes elbírálása némán 0 sort érintene.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3h) ERTESITESEK — ⭐ A REVÍZIÓ BLOKKERE: a megye → lelkész értesítő-csatorna
-- ────────────────────────────────────────────────────────────────────────────
-- Az `ertesitesek_user` / `ertesitesek_access` policy
-- (2026-04-13-rls-hybrid-admin-tables.sql:17-21, 2026-04-13-rls-ALL-FIXED.sql:163):
--     FOR ALL TO authenticated USING (user_id = auth.uid() OR current_user_has_global_access())
-- WITH CHECK NINCS → a PostgreSQL FOR ALL esetén az USING-ot használja
-- INSERT-ellenőrzésként is. Az esperes olyan sorokat szúr be, amelyeknek a
-- `user_id`-ja egy LELKÉSZÉ (feloldás-elbírálás, visszaküldött dokumentum,
-- új beküldés értesítése) — ez ma KIZÁRÓLAG a globális ágon megy át.
-- A hívások (`dashboard-egyhazmegye/actions.ts:447`,
-- `dashboard-egyhazmegye/document-actions.ts:394` és `:558`) mind
-- `try { await supabase.from('ertesitesek').insert(rows) } catch {}` alakúak,
-- és a supabase-js NEM DOB, hanem `{error}`-t ad vissza → a hiba 100% NÉMA lenne.
--
-- Megjegyzés: a `document-actions.ts:394` (beküldés-értesítő) MA IS elbukik,
-- mert azt a LELKÉSZ szúrja be a megyei címzetteknek — ez a policy azt is
-- megjavítja (a lelkész a saját gyülekezetére hivatkozó sort beszúrhatja).
DROP POLICY IF EXISTS ertesitesek_szint_insert ON public.ertesitesek;
CREATE POLICY ertesitesek_szint_insert
  ON public.ertesitesek
  FOR INSERT TO authenticated
  WITH CHECK (
    ertesitesek.congregation_id IS NOT NULL
    AND public.current_user_can_access_congregation(ertesitesek.congregation_id)
  );

COMMENT ON POLICY ertesitesek_szint_insert ON public.ertesitesek IS
  '2026-08-11 (P1 #17): a hatókörébe eső gyülekezetre hivatkozó értesítést BÁRKI beszúrhatja, akinek arra a gyülekezetre hozzáférése van (esperes → lelkész, lelkész → megye). Az ertesitesek_user/_access policy FOR ALL, WITH CHECK nélkül, tehát az INSERT-et az USING gátolja; a megyei értesítések ma KIZÁRÓLAG a globális ágon mennek át, és a hívások try/catch-ben, eldobott {error}-ral futnak → a hiba NÉMA lenne. OLVASÁST ez a policy NEM ad (megyei értesítés-olvasás továbbra sem indokolt).';

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. SZAKASZ — ADDITÍV MEGYEI/KERÜLETI SELECT POLICY-K (~50 TÁBLA)         ║
-- ║ A 0/E 501-es sora ELŐNÉZETBEN megmondta, mely táblák érintettek.         ║
-- ║                                                FUTTATÁSI SORREND: 5.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIÉRT DINAMIKUS: a repó BIZONYÍTOTTAN széthúz a produkcióval, egy kézzel
-- írt ~50 elemű felsorolás biztosan kihagyna élő táblákat.
--
-- ⚠️ A REVÍZIÓ UTÁN JAVÍTOTT KIZÁRÁSI LOGIKA — POLICY-SZINTŰ, NEM TÁBLA-SZINTŰ:
--    Régen: „hagyd ki a táblát, ha BÁRMELY policy-ja hivatkozik a
--    can_access_congregation-re, és nézd csak a qual-t". Ez két irányban tévedett:
--      · egy tábla, amelynek a SELECT policy-ja a beégetett mintát használja,
--        de az INSERT policy-ja a can_access-t, KIMARADT → az esperes a SAJÁT
--        megyéjében sem OLVASTA volna (néma 0 sor);
--      · egy tábla, amelynek CSAK a WITH CHECK-jében van can_access, feleslegesen
--        kapott policy-t.
--    Most: a ciklus azokat a POLICY-kat keresi, amelyek SELECT/ALL parancsúak,
--    PERMISSIVE-ek, hivatkoznak a globális helperre (qual VAGY with_check), és
--    NEM hivatkoznak a can_access_congregation-re. A 0/E 501-es előnézet
--    PONTOSAN UGYANEZT a szűrőt használja.
--
-- MIÉRT BIZTONSÁGOS — ÉS MIKOR NEM:
--   · CSAK PERMISSIVE SELECT policy-t hoz létre → nem VESZ EL semmit
--     (a PERMISSIVE policy-k VAGY-olódnak).
--   · ⚠️ KIVÉVE, HA A TÁBLÁN RESTRICTIVE POLICY IS VAN: azok ÉS-elődnek, és
--     némán hatástalanná teszik ezt az additív policy-t. A ciklus ilyenkor
--     RAISE WARNING-ot ad, és a 0/D 407-es sora előre felsorolja őket.
--   · ⚠️ ÉS HA A TÁBLÁN NINCS BEKAPCSOLVA AZ RLS: a policy TÉTLEN, a tábla
--     viszont a GRANT alapján teljesen nyitva van. A ciklus ilyenkor is
--     RAISE WARNING-ot ad — de a döntést (ENABLE RLS) a 0/A 141-es sora alapján
--     TUDATOSAN, ELŐRE kell meghozni, mert az RLS bekapcsolása üzemi kiesést
--     okozhat egy addig szűretlen táblán.
--   · Idempotens: minden policy neve `<tábla>_szint_select`, előtte DROP IF EXISTS.
--
-- ⚠️ TUDATOS ASZIMMETRIA: itt CSAK OLVASÁST adunk vissza. Ha egy táblán később
--    mégis kellene megyei ÍRÁS, a recept:
--      CREATE POLICY <tábla>_szint_all ON public.<tábla> FOR ALL TO authenticated
--        USING      (congregation_id = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])))
--        WITH CHECK (congregation_id = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $additiv_policyk$
DECLARE
    r          record;
    v_policy   text;
    v_db       integer := 0;
    v_restr    integer := 0;
    v_norls    integer := 0;
    v_rls_be   boolean;
BEGIN
    IF to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NULL THEN
        RAISE EXCEPTION '⛔ Előbb az 1. SZAKASZT futtasd.';
    END IF;

    FOR r IN
        SELECT DISTINCT pol.tablename AS tabla
        FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.permissive = 'PERMISSIVE'
          AND pol.cmd IN ('SELECT', 'ALL')
          AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
                LIKE '%current_user_has_global_access%'
          AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
                NOT LIKE '%current_user_can_access_congregation%'
          -- csak ahol van mire hivatkozni (uuid típusú congregation_id)
          AND EXISTS (
                SELECT 1 FROM information_schema.columns col
                WHERE col.table_schema = 'public'
                  AND col.table_name   = pol.tablename
                  AND col.column_name  = 'congregation_id'
                  AND col.data_type    = 'uuid')
          AND pol.tablename NOT LIKE 'mm\_%'        -- 5. szakasz kezeli
          AND pol.tablename NOT LIKE 'diocese\_%'   -- saját, megyei policy-jük van
          AND pol.tablename NOT IN (
                -- a 2026-08-09-es fájl már adott nekik megyei/kerületi ágat
                'bealitas', 'lelkeszi_jelentes', 'chitanta_tombok',
                -- a 3. szakasz névre szólóan kezeli
                'document_submissions', 'annual_reports', 'ertesitesek',
                'import_logs', 'profiles', 'profile_roles', 'profile_congregations',
                'dioceses', 'districts', 'congregations',
                -- személyes / üzenet / rendszer-konfiguráció: megyei olvasás
                -- SZÁNDÉKOSAN nem indokolt
                'support_messages', 'admin_access_requests',
                'audit_log', 'system_settings', 'cfg_report', 'cfgparam', 'param')
        ORDER BY 1
    LOOP
        -- (A) RESTRICTIVE-figyelmeztetés
        IF EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = r.tabla
                     AND permissive = 'RESTRICTIVE') THEN
            v_restr := v_restr + 1;
            RAISE WARNING '⚠️ %-n RESTRICTIVE policy IS van — a most létrehozott additív policy HATÁSTALAN maradhat (a RESTRICTIVE ÉS-elődik)! Ellenőrizd kézzel: a 7. szakasz A/9b pontja.', r.tabla;
        END IF;

        -- (B) RLS-figyelmeztetés
        SELECT c.relrowsecurity INTO v_rls_be
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = r.tabla;
        IF v_rls_be IS DISTINCT FROM true THEN
            v_norls := v_norls + 1;
            RAISE WARNING '⛔ %-n NINCS BEKAPCSOLVA AZ RLS — a policy TÉTLEN lesz, a tábla viszont a GRANT alapján NYITVA marad! (0/A 141. sor)', r.tabla;
        END IF;

        v_policy := r.tabla || '_szint_select';

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
               USING (%I.congregation_id = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), ''{}''::uuid[])))',
            v_policy, r.tabla, r.tabla);
        EXECUTE format(
            'COMMENT ON POLICY %I ON public.%I IS %L',
            v_policy, r.tabla,
            '2026-08-11 (P1 #17): additív megyei/kerületi OLVASÁS. A tábla saját policy-ja a beégetett '
            || '„congregation_id = current_user_congregation_id() OR current_user_has_global_access()" mintát használja; '
            || 'a globális helper szűkítése után enélkül az esperes a SAJÁT megyéjében sem látna semmit. '
            || 'A tömbtagsági alak `(SELECT …)` burkolással InitPlan-né válik → lekérdezésenként EGYSZER fut. '
            || 'Csak SELECT — az írás a meglévő policy-kon marad.');

        v_db := v_db + 1;
        RAISE NOTICE '✅ % — additív megyei/kerületi SELECT policy létrehozva (%)', r.tabla, v_policy;
    END LOOP;

    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'ÖSSZESEN % tábla kapott <tábla>_szint_select policy-t.', v_db;
    RAISE NOTICE 'EBBŐL %-n van RESTRICTIVE policy is (kézi ellenőrzés kell), %-n nincs bekapcsolva az RLS.', v_restr, v_norls;
    RAISE NOTICE 'A 6/B 611-es sorának EZT a számot kell visszaadnia: %', v_db;

    IF v_db = 0 THEN
        RAISE WARNING '⚠️ EGYETLEN tábla sem kapott policy-t. Vagy már lefutott ez a szakasz, vagy a 0/E 501-es előnézet is üres volt — ellenőrizd, mielőtt továbbmész!';
    END IF;

    -- A 6/B 611-es sor összehasonlítási alapja (nem kritikus, ha nincs ilyen tábla)
    BEGIN
        INSERT INTO public.system_settings (key, value)
        VALUES ('rls_szint_select_db_2026_08_11', v_db::text)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ℹ️ A system_settings-be nem sikerült elmenteni a darabszámot (%), ez nem hiba — jegyezd fel kézzel: %', SQLERRM, v_db;
    END;
END
$additiv_policyk$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4/B. SZAKASZ — A MARADÉK `USING (true)` POLICY-K LEZÁRÁSA                ║
-- ║ ⚠️ EGYETLEN MEGMARADT NYITOTT POLICY AZ EGÉSZ SZŰKÍTÉST MEGKERÜLI.       ║
-- ║                                                FUTTATÁSI SORREND: 6.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A PERMISSIVE policy-k VAGY-olódnak. A 2026-04-13-rls-ALL-FIXED.sql élesbe
-- került, soha vissza nem vont nyitott policy-i (presbiter_all, felmentes_all,
-- felmentesx_all, penztar_all, csoport_read, csoporttagok_read,
-- befizetesbealitas_read, korzetfilter_read, gyulekezetek_read …) gyülekezeti
-- adatot tartalmazó táblákon állnak, és a 2026-08-10-es takarítás DROP-listája
-- EGYIKET SEM érinti (az csak a szemely-legacy, sirhely*, monetar és
-- kiadasikiseroiv policy-kat dobta el).
--
-- EZ A SZAKASZ:
--   · a 0/F 602-es listáján szereplő táblákon (van congregation_id uuid oszlop)
--     ELDOBJA a nyitott policy-t és `current_user_can_access_congregation()`-re
--     alapozott, gyülekezeti hatókörű FOR ALL policy-val pótolja;
--   · a 0/F 603-as listáját (nincs congregation_id) NEM bántja — ott a
--     tábla-szintű megoldás külön kört igényel; a ciklus NÉV SZERINT kiírja őket.
--
-- ⚠️ EZ AZ EGYETLEN SZAKASZ, AMELY ELVESZ JOGOT. Ha egy felhasználó eddig
--    hatókörön kívüli presbiter/felmentes/csoport sorokat látott, ezután nem fog.
--    A 7. szakasz C/20 pontja méri, hogy a lelkésznek MINDEN megvan.
-- ⚠️ ÁRVA SOROK: az érintett táblákon a `congregation_id IS NULL` sorok
--    (legacy import-maradványok) mostantól CSAK rendszergazdának látszanak —
--    `current_user_can_access_congregation(NULL)` kizárólag a (1) globális ágon
--    igaz. Ha a C/20 próbán hiányzó presbitert/felmentést jeleznek, ITT keresd:
--      SELECT count(*) FROM public.presbiter WHERE congregation_id IS NULL;
-- ⚠️ A 8. szakasz (visszaállítás) EZT SZÁNDÉKOSAN NEM ÁLLÍTJA VISSZA: a nyitott
--    policy-k eltávolítása független, egyértelmű javítás — nem akarjuk, hogy egy
--    „vissza a tegnapi állapotra" újranyissa őket.

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $nyitott_zaras$
DECLARE
    r         record;
    v_policy  text;
    v_db      integer := 0;
    v_kezi    text    := '';
BEGIN
    IF to_regprocedure('public.current_user_can_access_congregation(uuid)') IS NULL THEN
        RAISE EXCEPTION '⛔ Hiányzik a current_user_can_access_congregation() — nem ez az adatbázis.';
    END IF;

    -- (A) Amit automatikusan le tudunk zárni
    FOR r IN
        SELECT p.tablename AS tabla, p.policyname AS pname, p.cmd AS cmd
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.permissive = 'PERMISSIVE'
          AND 'authenticated' = ANY(p.roles)
          AND (btrim(COALESCE(p.qual, '')) = 'true' OR btrim(COALESCE(p.with_check, '')) = 'true')
          AND p.tablename NOT LIKE 'adr%'
          AND p.tablename NOT IN ('nevnap','nom_cimlet','szamadasicel','szamadasidatum',
                                  'befizetescel','befizetocelcfg','kiadascel','event',
                                  'congregations','dioceses','districts',
                                  'mm_kategoriak','mm_segedanyag_kategoriak','mm_jelveny_tipusok')
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema='public' AND col.table_name=p.tablename
                        AND col.column_name='congregation_id' AND col.data_type='uuid')
        ORDER BY 1, 2
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pname, r.tabla);
        RAISE NOTICE '🔒 ELDOBVA a nyitott policy: %.% [%]', r.tabla, r.pname, r.cmd;

        v_policy := r.tabla || '_gyulekezeti_all';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
               USING      (public.current_user_can_access_congregation(%I.congregation_id))
               WITH CHECK (public.current_user_can_access_congregation(%I.congregation_id))',
            v_policy, r.tabla, r.tabla, r.tabla);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L', v_policy, r.tabla,
            '2026-08-11 (P1 #17): a 2026-04-13-as `USING (true)` policy helyett gyülekezeti hatókörű hozzáférés. '
            || 'Egyetlen megmaradt nyitott PERMISSIVE policy az EGÉSZ szűkítést hatástalanná tette volna (a PERMISSIVE policy-k VAGY-olódnak).');

        v_db := v_db + 1;
        RAISE NOTICE '✅ % — gyülekezeti hatókörű policy létrehozva (%)', r.tabla, v_policy;
    END LOOP;

    -- (B) Amit KÉZZEL kell rendezni
    SELECT COALESCE(string_agg(DISTINCT p.tablename || '.' || p.policyname, ', '), '')
      INTO v_kezi
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
      AND 'authenticated' = ANY(p.roles)
      AND (btrim(COALESCE(p.qual, '')) = 'true' OR btrim(COALESCE(p.with_check, '')) = 'true')
      AND p.tablename NOT LIKE 'adr%'
      AND p.tablename NOT IN ('nevnap','nom_cimlet','szamadasicel','szamadasidatum',
                              'befizetescel','befizetocelcfg','kiadascel','event',
                              'congregations','dioceses','districts',
                              'mm_kategoriak','mm_segedanyag_kategoriak','mm_jelveny_tipusok');

    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'ÖSSZESEN % nyitott policy lezárva gyülekezeti hatókörre.', v_db;
    IF v_kezi <> '' THEN
        RAISE WARNING '⛔ MARADT NYITOTT POLICY, amit ez a szakasz nem tud kezelni (nincs congregation_id uuid oszlopa): %. EZEK A SZŰKÍTÉS MARADÉK LYUKAI — külön körben rendezendők, és a MARADÉK KOCKÁZATOK 10. pontjába fel kell venni!', v_kezi;
    ELSE
        RAISE NOTICE '✅ Nem maradt nyitott (true) PERMISSIVE policy a gyülekezeti adatot tartalmazó táblákon.';
    END IF;
END
$nyitott_zaras$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. SZAKASZ — MISSZIÓS MŰHELY: A MODERÁTORI JOG MEGTARTÁSA                ║
-- ║                                                FUTTATÁSI SORREND: 7.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIÉRT KELL: az mm_* táblákon ~19 policy hívja a globális helpert, de NEM
-- földrajzi hatókörként, hanem MODERÁTORI felülbírálatként. Az MM országos
-- közösségi modul; ha itt is szűkítenénk, az esperesek elveszítenék a
-- moderátori jogukat, ami NEM ennek a fájlnak a célja.
--
-- ⚠️ A REVÍZIÓ UTÁN JAVÍTVA — PARANCSONKÉNTI TÜKRÖZÉS, NEM BLANKET `FOR ALL`:
--    A korábbi változat MINDEN érintett mm_* táblára `FOR ALL` policy-t hozott
--    létre. Több táblán viszont a globális ág CSAK OLVASÓ policy-ban szerepel —
--    pl. `mm_stats_read_self_or_admin` a mm_felhasznalo_statisztika-n
--    (2026-04-12-missziós-muhely-rls.sql:313-320, FOR SELECT), amelynek a saját
--    kommentje kimondja: „Az INSERT/UPDATE csak SECURITY DEFINER function-ön
--    keresztül engedhető, ezért kliens-oldalon TELJESEN letiltjuk"; továbbá
--    `mm_otletek_read_all` (:52-56) és `mm_segedanyagok_read_all` (:197-201).
--    Blanket FOR ALL-lal az esperes ÚJ ÍRÁSJOGOT kapott volna ezekre — az
--    JOGBŐVÍTÉS, nem megőrzés. Most a ciklus policy-nként, a MEGTALÁLT `cmd`-vel
--    dolgozik, és a gamifikációs statisztikára SEMMILYEN írásjogot nem ad.

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $mm_moderator$
DECLARE
    r        record;
    v_policy text;
    v_db     integer := 0;
BEGIN
    IF to_regprocedure('public.mm_moderator_e()') IS NULL THEN
        RAISE EXCEPTION '⛔ Előbb az 1. SZAKASZT futtasd (hiányzik az mm_moderator_e függvény).';
    END IF;

    -- A korábbi (blanket FOR ALL) változat policy-inak eltakarítása — idempotencia
    FOR r IN
        SELECT tablename AS tabla, policyname AS pname
        FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'mm\_%\_mm\_moderator'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pname, r.tabla);
        RAISE NOTICE '↩️ régi blanket policy eldobva: %.%', r.tabla, r.pname;
    END LOOP;

    FOR r IN
        SELECT DISTINCT pol.tablename AS tabla, pol.cmd AS cmd
        FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND pol.tablename LIKE 'mm\_%'
          AND (COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''))
                LIKE '%current_user_has_global_access%'
        ORDER BY 1, 2
    LOOP
        -- ⚠️ A gamifikációs statisztikára SEMMILYEN kliens-oldali írásjog nem mehet.
        IF r.tabla = 'mm_felhasznalo_statisztika' AND r.cmd <> 'SELECT' THEN
            RAISE NOTICE 'ℹ️ % [%] KIHAGYVA — a statisztika írása csak SECURITY DEFINER RPC-n keresztül engedélyezett.', r.tabla, r.cmd;
            CONTINUE;
        END IF;

        v_policy := r.tabla || '_mmmod_' || lower(r.cmd);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.tabla);

        IF r.cmd = 'SELECT' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                              USING (public.mm_moderator_e())', v_policy, r.tabla);
        ELSIF r.cmd = 'INSERT' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                              WITH CHECK (public.mm_moderator_e())', v_policy, r.tabla);
        ELSIF r.cmd = 'UPDATE' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                              USING (public.mm_moderator_e()) WITH CHECK (public.mm_moderator_e())', v_policy, r.tabla);
        ELSIF r.cmd = 'DELETE' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                              USING (public.mm_moderator_e())', v_policy, r.tabla);
        ELSE  -- 'ALL'
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                              USING (public.mm_moderator_e()) WITH CHECK (public.mm_moderator_e())', v_policy, r.tabla);
        END IF;

        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L', v_policy, r.tabla,
            '2026-08-11: a Missziós Műhely MODERÁTORI felülbírálata változatlanul megmarad az admin/esperes/'
            || 'egyhazmegyei_admin körnek. A policy PARANCSA (' || r.cmd || ') megegyezik azzal, amilyen parancsú '
            || 'policy ma a globális helperre hivatkozik — így egyetlen mm_* táblán sem keletkezik olyan '
            || 'művelet-jog, ami ma nincs.');

        v_db := v_db + 1;
        RAISE NOTICE '✅ % [%] — MM moderátori policy megtartva (%)', r.tabla, r.cmd, v_policy;
    END LOOP;

    RAISE NOTICE 'ÖSSZESEN % MM policy (tábla×parancs) kapott moderátori ágat.', v_db;
END
$mm_moderator$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5/B. SZAKASZ — STORAGE.OBJECTS: A CSATOLMÁNYOK MEGYEI OLVASÁSA           ║
-- ║                                                FUTTATÁSI SORREND: 8.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A 4. szakasz `schemaname = 'public'`-ra szűr, tehát a storage-policy-kat
-- MEG SEM NÉZI. Több csatolmány-migráció (2026-07-17-f6-iktato-csomok-
-- csatolmanyok.sql, 2026-04-23-m0-6-documents-schema.sql,
-- 2026-04-19-congregations-logos-bucket.sql, 2026-07-25-f8d-qr-feltoltes.sql)
-- KÖZVETLENÜL a `current_user_has_global_access()`-t hívja. Enélkül a szűkítés
-- után az esperes a saját megyéje csatolmányait (iktató, dokumentumok, címerek)
-- NEM TUDNÁ LETÖLTENI — jelzés nélkül.
--
-- A ciklus AZOKAT a bucketeket kezeli, amelyeknél a policy szövege BIZONYÍTJA,
-- hogy az útvonal ELSŐ szegmense gyülekezet-azonosító
-- (`(storage.foldername(name))[1] = current_user_congregation_id()::text` minta).
-- Amelyik bucket nem ilyen (pl. `dioceses-cimer`, ahol az első szegmens
-- egyházmegye-azonosító), az KIMARAD, és a ciklus NÉV SZERINT kiírja — azt
-- névre szólóan kell pótolni.
--
-- ⚠️ A storage.objects-en policy-t létrehozni tulajdonosi jog kell. Ha itt
--    „must be owner of table objects" hibát kapsz: a szakasz SAJÁT
--    tranzakcióban van, semmi más nem sérül; jelezd, és service_role-lal
--    vagy a Supabase Studio Storage → Policies felületén pótoljuk.

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $storage_szint$
DECLARE
    r        record;
    v_policy text;
    v_db     integer := 0;
    v_kimaradt text := '';
BEGIN
    FOR r IN
        SELECT DISTINCT x.bucket
        FROM pg_policies pol,
             LATERAL (SELECT substring(COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')
                                       from 'bucket_id = ''([A-Za-z0-9_.-]+)''') AS bucket) x
        WHERE pol.schemaname = 'storage'
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
                LIKE '%current_user_has_global_access%'
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
                LIKE '%current_user_congregation_id%'
          AND x.bucket IS NOT NULL
        ORDER BY 1
    LOOP
        v_policy := r.bucket || '_szint_select';
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', v_policy);
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated
               USING (
                 bucket_id = %L
                 AND CASE
                       WHEN (storage.foldername(name))[1]
                            ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                       THEN ((storage.foldername(name))[1])::uuid
                            = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), ''{}''::uuid[]))
                       ELSE false
                     END
               )', v_policy, r.bucket);
        v_db := v_db + 1;
        RAISE NOTICE '✅ storage bucket „%" — additív megyei/kerületi olvasás (%)', r.bucket, v_policy;
    END LOOP;

    SELECT COALESCE(string_agg(DISTINCT pol.policyname, ', '), '')
      INTO v_kimaradt
    FROM pg_policies pol
    WHERE pol.schemaname = 'storage'
      AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) LIKE '%current_user_has_global_access%'
      AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) NOT LIKE '%current_user_congregation_id%';

    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'ÖSSZESEN % storage-bucket kapott additív megyei olvasást.', v_db;
    IF v_kimaradt <> '' THEN
        RAISE WARNING '⚠️ Ezeknél a storage-policy-knál az útvonal első szegmense NEM gyülekezet-azonosító, ezért NEM kaptak automatikus pótlást: %. Nézd meg egyenként (pl. dioceses-cimer → egyházmegye-azonosító) és pótold névre szólóan!', v_kimaradt;
    END IF;
END
$storage_szint$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — A SZŰKÍTÉS                                                  ║
-- ║ ⚠️⚠️ EZ AZ UTOLSÓ MÓDOSÍTÓ SZAKASZ. FUTTATÁSI SORREND: 9. (LEGVÉGÉN)     ║
-- ║ Csak akkor futtasd, ha a 2/A, 3, 4, 4/B, 5 és 5/B MÁR LEFUTOTT — az      ║
-- ║ őrszem ezt KÓDBÓL is ellenőrzi és megállít.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── FAIL-CLOSED ŐRSZEM ─────────────────────────────────────────────────────
DO $orszem$
DECLARE
  v_def   text;
  v_db    integer;
  v_lista text;
BEGIN
  -- (1) A módosítandó fő függvény létezik és nem a member-portal P0 verziója
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'current_user_has_global_access'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs current_user_has_global_access() függvény — nem ez az adatbázis, vagy a fázis-0 migráció hiányzik.';
  END IF;
  IF v_def LIKE '%member_private%' THEN
    RAISE EXCEPTION '⛔ A member-portal P0 verziója fut (member_private hivatkozás). Ez a fájl felülírná — ÁLLJ MEG és egyeztessünk.';
  END IF;

  -- (2) Az 1. szakasz megvan
  IF to_regprocedure('public.felettes_szint_hozzaferese(uuid)')   IS NULL
     OR to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NULL
     OR to_regprocedure('public.felettes_szint_gyulekezet_ids()')  IS NULL THEN
    RAISE EXCEPTION '⛔ Előbb az 1. SZAKASZT futtasd (hiányoznak a hatókör-feloldó segédfüggvények).';
  END IF;
  IF to_regprocedure('public.current_user_congregation_id()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_congregation_id() — a lelkészi ág enélkül elveszne.';
  END IF;

  -- (3) ⭐ ISMERETLEN ÉLŐ TÖRZS ŐRE — a repó BIZONYÍTOTTAN széthúz a produkcióval.
  --     Ha az élő can_access_congregation egyik ismert változatra sem hasonlít,
  --     a CREATE OR REPLACE NÉMÁN kitörölne egy nem várt ágat.
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND proname = 'current_user_can_access_congregation' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs current_user_can_access_congregation() függvény.';
  END IF;
  IF v_def NOT LIKE '%v2026-08-11-szukites%'
     AND v_def NOT LIKE '%egyhazmegyei_szamvevo%'
     AND v_def NOT LIKE '%scope = ''congregation''%' THEN
    RAISE EXCEPTION '⛔ Az ÉLŐ can_access_congregation törzse egyik ISMERT változatra sem hasonlít (sem a fazis2f, sem a 2026-07-01-OPCIONALIS). A 2. szakasz FELÜLÍRNÁ egy ismeretlen ággal együtt. ÁLLJ MEG: mentsd ki a 0/A 132-es sorát és egyeztessünk.';
  END IF;

  -- (4) ⭐ VÁRATLAN profile_roles-ág a felülírandó függvényekben
  SELECT string_agg(proname, ', ' ORDER BY proname) INTO v_lista
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('current_user_can_edit_congregation', 'sirhely_temeto_hozzaferheto',
                    'sirhely_hozzaferheto', 'kiadas_hozzaferheto')
    AND pg_get_functiondef(oid) LIKE '%profile_roles%'
    AND pg_get_functiondef(oid) NOT LIKE '%v2026-08-11-szukites%';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION '⛔ Ezekben a függvényekben profile_roles-hivatkozás van, amit a repó nem ismer: %. A 2. szakasz felülírná és NYOM NÉLKÜL elveszne. Mentsd ki a 0/A 133-135-ös sorait és egyeztessünk.', v_lista;
  END IF;

  -- (5) ⭐ A csalad/gyerek feloldók — ÖNJAVÍTÓ (2026-08-11, futtatási tapasztalat).
  --
  --     ELŐZMÉNY: ez a kapu eredetileg EXCEPTION-t dobott, és a
  --     2026-08-03-pr25-csalad-gyerek-rls-scope.sql külön futtatását kérte.
  --     A produkciós futtatás BEBIZONYÍTOTTA, hogy az a fájl SOHA nem futott le:
  --     a két feloldó még a fázis-0 verzió (`= current_user_congregation_id()`).
  --
  --     MIÉRT NEM KÜLÖN FÁJLBAN JAVÍTJUK: a PR-25-ös törzs a
  --     `can_access_congregation`-re épül, ami MA MÉG országos hozzáférést ad az
  --     esperesnek. Külön, ELŐBB futtatva tehát nyílna egy ablak, amelyben az
  --     esperes az ORSZÁG MINDEN családi kartonját és gyerek-sorát olvashatná
  --     (mindkét házastárs + teljes lakcím + kiskorúak). Ez pontosan az a
  --     szivárgás, amit ez a fájl megszüntetni hivatott.
  --
  --     EZÉRT: itt CSAK JELZÜNK, és a szűkítéssel EGY TRANZAKCIÓBAN, alább
  --     (2/0 alszakasz) írjuk át a két feloldót. Így a bővítés és a szűkítés
  --     EGYSZERRE lép életbe — ablak nélkül.
  IF COALESCE((SELECT pg_get_functiondef(oid) FROM pg_proc
               WHERE pronamespace='public'::regnamespace
                 AND proname='csalad_resolves_to_accessible_cong' LIMIT 1), '')
       NOT LIKE '%current_user_can_access_congregation%' THEN
    RAISE NOTICE 'ℹ️ A csalad_resolves_to_accessible_cong() még a régi (fázis-0) törzs — a 2/0 alszakasz EBBEN A TRANZAKCIÓBAN átírja.';
  END IF;
  IF COALESCE((SELECT pg_get_functiondef(oid) FROM pg_proc
               WHERE pronamespace='public'::regnamespace
                 AND proname='gyerek_resolves_to_accessible_cong' LIMIT 1), '')
       NOT LIKE '%current_user_can_access_congregation%' THEN
    RAISE NOTICE 'ℹ️ A gyerek_resolves_to_accessible_cong() még a régi (fázis-0) törzs — a 2/0 alszakasz EBBEN A TRANZAKCIÓBAN átírja.';
  END IF;
  -- Létezniük viszont KELL — ha nincsenek, a csalad/gyerek policy-k mást hívnak,
  -- és nem tudjuk, mit. Ilyenkor megállunk.
  IF to_regprocedure('public.csalad_resolves_to_accessible_cong(integer,integer)') IS NULL
     OR to_regprocedure('public.gyerek_resolves_to_accessible_cong(integer,integer)') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a csalad_ vagy gyerek_resolves_to_accessible_cong() feloldó. A csalad/gyerek RLS ismeretlen úton dönt — ÁLLJ MEG és egyeztessünk.';
  END IF;

  -- (6) ⭐ AKI VAKRA MENNE — KEMÉNY KAPU (a 0/C 302/305-ös sor kódba öntve).
  SELECT count(*) INTO v_db
  FROM public.profiles p
  WHERE p.status = 'active'
    AND p.role IN ('esperes', 'egyhazmegyei_admin')
    AND p.diocese_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                    WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                      AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                      AND pr.active = true AND pr.approval_status = 'approved'
                      AND pr.scope_id IS NOT NULL);
  IF v_db > 0 THEN
    RAISE EXCEPTION '⛔ % aktív esperesnek/megyei adminnak NINCS feloldható egyházmegyéje — ŐK HOLNAP ÜRES FELÜLETTEL LÉPNÉNEK BE. Előbb rendezd őket (0/C 303. sor).', v_db;
  END IF;

  SELECT count(*) INTO v_db
  FROM public.profiles p
  WHERE p.status = 'active'
    AND p.role = 'egyhazkeruleti_admin'
    AND p.district_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                    WHERE pr.profile_id = p.id AND pr.scope = 'district'
                      AND pr.role = 'egyhazkeruleti_admin'
                      AND pr.active = true AND pr.approval_status = 'approved'
                      AND pr.scope_id IS NOT NULL);
  IF v_db > 0 THEN
    RAISE EXCEPTION '⛔ % aktív kerületi adminnak NINCS feloldható egyházkerülete (0/C 305. sor). Előbb rendezd őket.', v_db;
  END IF;

  -- (7) ⭐ RLS BE VAN-E KAPCSOLVA a hét kritikus táblán? Policy RLS nélkül TÉTLEN.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_lista
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('szemely','befizetes','kiadas','csalad','gyerek','profiles','profile_roles')
    AND c.relrowsecurity = false;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION '⛔ Ezeken a táblákon NINCS BEKAPCSOLVA az RLS: %. A policy-k TÉTLENEK, a táblák a GRANT alapján NYITVA vannak — a szűkítésnek nem lenne semmi hatása. Előbb: ALTER TABLE public.<tábla> ENABLE ROW LEVEL SECURITY;', v_lista;
  END IF;

  -- (8) ⭐ MARADT-E NYITOTT (true) POLICY a kritikus táblákon? Egy `true` mindent visz.
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_lista
  FROM pg_policies
  WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    AND 'authenticated' = ANY(roles)
    AND tablename IN ('szemely','befizetes','kiadas','csalad','gyerek',
                      'presbiter','felmentes','csoport','profiles','profile_roles')
    AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION '⛔ Nyitott (USING true) PERMISSIVE policy maradt: %. A PERMISSIVE policy-k VAGY-olódnak — ez a szűkítést teljesen hatástalanná tenné. Futtasd a 4/B szakaszt (és a 0/F 603-as listáját rendezd kézzel).', v_lista;
  END IF;

  -- (9) ⭐ A MELLÉKUTAK LE VANNAK-E ZÁRVA? (2/A szakasz)
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.profiles'::regclass
                   AND NOT tgisinternal
                   AND tgname = 'profiles_jogosultsag_vedelem_trg') THEN
    RAISE EXCEPTION '⛔ Hiányzik a profiles_jogosultsag_vedelem_trg trigger (2/A-1). Enélkül a szűkítés EGYETLEN „PATCH /profiles {role:admin}" kéréssel megkerülhető. Futtasd a 2/A szakaszt.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='profile_roles'
                   AND policyname='profile_roles_admin_manage'
                   AND COALESCE(with_check,'') LIKE '%felettes_szint_hozzaferese%') THEN
    RAISE EXCEPTION '⛔ A profile_roles_admin_manage WITH CHECK-je nincs hatókörhöz kötve (2/A-2). Enélkül bármely egyhazkeruleti_admin beszúrhat magának system-scope admin sort → teljes rendszergazda. Futtasd a 2/A szakaszt.';
  END IF;

  -- (10) ⭐ A KOMPENZÁLÓ SZAKASZOK LEFUTOTTAK-E? (3., 4., 5.)
  --      Ez a kapu KÓDBÓL kényszeríti ki a FUTTATÁSI SORRENDET: a szűkítés és a
  --      kompenzálás közötti ablakban MINDEN esperes üres felületet látna.
  SELECT count(*) INTO v_db FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN ('dioceses_update_diocese_scope', 'profile_roles_diocese_read_roles',
                       'profile_congregations_diocese_read', 'import_logs_select_diocese_scope',
                       'monetar_szint_select', 'document_submissions_szint_all',
                       'annual_reports_szint_select', 'annual_reports_szint_update',
                       'ertesitesek_szint_insert');
  IF v_db < 9 THEN
    RAISE EXCEPTION '⛔ A 3. szakasz 9 névre szóló policy-jából csak % van meg. ELŐBB futtasd a 3. SZAKASZT — különben a szűkítés pillanatában az esperes elveszti a dokumentum-, éves jelentés-, import- és értesítés-munkafolyamatát.', v_db;
  END IF;

  SELECT count(DISTINCT tablename) INTO v_db FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE '%\_szint\_select'
    AND tablename NOT IN ('monetar', 'annual_reports');
  IF v_db = 0 THEN
    RAISE EXCEPTION '⛔ A 4. szakasz additív policy-i HIÁNYOZNAK (<tábla>_szint_select). ELŐBB futtasd a 4. SZAKASZT — különben az esperes ~50 táblán a SAJÁT megyéjében sem lát semmit.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND policyname LIKE 'mm\_%\_mmmod\_%') THEN
    RAISE WARNING '⚠️ Az 5. szakasz (Missziós Műhely) NEM futott le. Ha ez SZÁNDÉKOS (az esperes MM-moderátori jogát is meg akarod szüntetni), rendben — különben ÁLLJ MEG és futtasd az 5. szakaszt.';
  END IF;

  RAISE NOTICE '✅ Az őrszem MINDEN kaput átengedett — a szűkítés biztonságosan futhat.';
END
$orszem$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2/0) A csalad/gyerek RLS-feloldók felzárkóztatása (a 2026-08-03-i PR-25 törzs)
-- ────────────────────────────────────────────────────────────────────────────
-- MIÉRT ITT, ÉS MIÉRT EGY TRANZAKCIÓBAN A SZŰKÍTÉSSEL:
--
-- A produkcióban a `csalad` és `gyerek` RLS-feloldói még a fázis-0 törzset
-- futtatják, amely a SZŰK `profiles.congregation_id` skalárhoz hasonlít
-- (`= current_user_congregation_id()`). Ez ma két bajt okoz:
--   • a profilváltóval dolgozó lelkész a MÁSIK gyülekezetében nem ír kartont,
--   • a lenti 2a/2b szűkítés után az esperes a SAJÁT megyéjében is elvesztené
--     a családi kartont — a 4. szakasz sem menti meg, mert a `csalad`/`gyerek`
--     táblán NINCS `congregation_id` oszlop, csak személy-hivatkozás.
--
-- A helyes törzs a `can_access_congregation`-re épül. Azt viszont MA MÉG nem
-- futtathatjuk külön, ELŐBB: a mai `can_access_congregation` az esperesnek
-- ORSZÁGOS igent mond, tehát egy külön futtatás megnyitná az ország ÖSSZES
-- családi kartonját (mindkét házastárs + teljes lakcím) és gyerek-sorát
-- (kiskorúak) minden esperesnek — pont azt a szivárgást, amit zárunk.
--
-- Ezért a bővítés és a szűkítés EGYSZERRE, EBBEN a tranzakcióban történik.
-- A COMMIT után az állapot: rendszergazda mindent, esperes/megyei admin a
-- SAJÁT megyéjét, lelkész a saját gyülekezetét (profilváltóval együtt).
--
-- Idempotens: ha a PR-25 törzs mégis fut valahol, ez byte-azonosat ír vissza.

CREATE OR REPLACE FUNCTION public.csalad_resolves_to_accessible_cong(
    p_id_ferfi integer,
    p_id_no    integer
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $csalad_resolver$
  -- v2026-08-11-szukites (a 2026-08-03 PR-25 törzse, változatlanul).
  -- A `has_global_access` rövidzár ITT SZÁNDÉKOS: a felnőtt nélküli vagy
  -- gyülekezethez nem köthető ÁRVA kartonok különben senkinek sem látszanának.
  -- A 2a szakasz után ez CSAK a rendszergazdát jelenti — az árva kartonok
  -- rendszergazda-nézetbe kerülnek (dokumentált, vállalt következmény).
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.szemely s
      WHERE (
        (p_id_ferfi IS NOT NULL AND s.id = p_id_ferfi)
        OR (p_id_no IS NOT NULL AND s.id = p_id_no)
      )
      AND s.congregation_id IS NOT NULL
      AND public.current_user_can_access_congregation(s.congregation_id)
    );
$csalad_resolver$;

CREATE OR REPLACE FUNCTION public.gyerek_resolves_to_accessible_cong(
    p_id_csalad  integer,
    p_id_szemely integer
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $gyerek_resolver$
  -- v2026-08-11-szukites (a 2026-08-03 PR-25 törzse, változatlanul).
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.szemely s
      WHERE s.id = p_id_szemely
        AND s.congregation_id IS NOT NULL
        AND public.current_user_can_access_congregation(s.congregation_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.csalad c
      JOIN public.szemely s2 ON (s2.id = c.id_ferfi OR s2.id = c.id_no)
      WHERE c.id = p_id_csalad
        AND s2.congregation_id IS NOT NULL
        AND public.current_user_can_access_congregation(s2.congregation_id)
    );
$gyerek_resolver$;

REVOKE ALL ON FUNCTION public.csalad_resolves_to_accessible_cong(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gyerek_resolves_to_accessible_cong(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.csalad_resolves_to_accessible_cong(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gyerek_resolves_to_accessible_cong(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.csalad_resolves_to_accessible_cong(integer, integer) IS
  'RLS-segéd a csalad táblához. 2026-08-11: a bővített current_user_can_access_congregation() szerint dönt (a 2026-08-03 PR-25 törzse), a szűkítéssel EGY tranzakcióban életbe léptetve, hogy ne nyíljon országos ablak.';
COMMENT ON FUNCTION public.gyerek_resolves_to_accessible_cong(integer, integer) IS
  'RLS-segéd a gyerek táblához. 2026-08-11: a bővített current_user_can_access_congregation() szerint dönt (a 2026-08-03 PR-25 törzse), a szűkítéssel EGY tranzakcióban.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2a) current_user_has_global_access() — MOSTANTÓL CSAK RENDSZERGAZDA
-- ────────────────────────────────────────────────────────────────────────────
-- ELŐTTE: role IN ('admin', 'esperes', 'egyhazmegyei_admin') — országos.
-- UTÁNA:  csak rendszergazda, KÉT lábon, MINDKETTŐN `status = 'active'` kapuval.
--
-- ⚠️ EZ A SOR ZÁRJA LE A P1 #17 SZIVÁRGÁST.
-- ⚠️ A (2) profile_roles-láb `status='active'` kapuja NEM elhagyható: a
--    `ccm_caller_is_system_admin()` (amiről mintáztuk) status-vak, de az csak
--    egy kereszt-egyeztető RPC kapuja — itt ~50 tábla RLS-ének a gerince lenne.
--    Kapu nélkül egy deaktivált rendszergazda az ottfelejtett soron keresztül
--    ORSZÁGOS ÍRÁS+OLVASÁS jogot kapna vissza.
-- ⚠️ A (2) láb ÖNMAGÁBAN eszkalációs út lenne a `profile_roles_admin_manage`
--    korlátlan INSERT-je miatt — ezért kötelező előfeltétele a 2/A-2 szakasz
--    (az őrszem 9. kapuja ezt ellenőrzi).

CREATE OR REPLACE FUNCTION public.current_user_has_global_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $global_access$
  -- v2026-08-11-szukites — CSAK rendszergazda (lásd a fájl fejlécét).
  -- ⚠️ A törzsben SZÁNDÉKOSAN nem szerepel a régi szerep-lista egyetlen
  --    idézőjeles neve sem — a 0. és 6. szakasz ellenőrzése pontosan azt méri.
  SELECT EXISTS (
    -- (1) skalár rendszergazda (legacy modell)
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role = 'admin'
  ) OR EXISTS (
    -- (2) profile_roles system-scope admin — a hívó profilja is aktív kell legyen
    SELECT 1
    FROM public.profile_roles pr
    JOIN public.profiles p2 ON p2.id = pr.profile_id
    WHERE pr.profile_id = auth.uid()
      AND p2.status = 'active'
      AND pr.role = 'admin'
      AND pr.scope = 'system'
      AND pr.active = true
      AND pr.approval_status = 'approved'
  );
$global_access$;

COMMENT ON FUNCTION public.current_user_has_global_access() IS
  '2026-08-11 (P1 #17): CSAK RENDSZERGAZDA. Korábban az esperes és az egyhazmegyei_admin is beletartozott, ami az ORSZÁG teljes tagnyilvántartását és pénzügyét kiadta bármelyik esperes JWT-jének. A megyei/kerületi hatókört mostantól a current_user_diocese_ids() / current_user_district_ids() / felettes_szint_hozzaferese() adja, a SAJÁT egyházmegyére/kerületre korlátozva. Két láb: profiles.role=''admin'' skalár VAGY profile_roles system-scope admin sor — MINDKETTŐN profiles.status=''active'' kapuval. A (2) láb előfeltétele a 2/A-2 szakasz (profile_roles_admin_manage hatókör-korlátozása).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2b) current_user_can_access_congregation(uuid) — MEGYEI + KERÜLETI ÁGGAL
-- ────────────────────────────────────────────────────────────────────────────
-- A MAI ÁGAK VÁLTOZATLANUL BENNE VANNAK (forrás: 2026-04-16-wc7-4-fazis2f-
-- congregations.sql:87-155) — ÚJ csak a (3) és a (6):
--   (1) globális — mostantól CSAK rendszergazda
--   (2) saját gyülekezet (a profiles.congregation_id skalár) — a LELKÉSZ ága
--   (3) ⭐ ÚJ: EGYHÁZMEGYE + EGYHÁZKERÜLET, kétlábú feloldással
--   (4) egyházmegyei számvevő a megyéje alatt, JÓVÁHAGYOTT hozzárendeléssel
--   (5) könyvelő/számvevő m2m, JÓVÁHAGYOTT hozzárendeléssel
--   (6) ⭐ ÚJ: profile_roles gyülekezeti hatókör (profilváltó)
--
-- ⚠️ A (6) ÁG A REVÍZIÓ UTÁN SZIGORÍTVA — a korábbi változat JOGBŐVÍTÉS volt:
--    (i)  hozzákerült a `profiles.status = 'active'` kapu. Enélkül egy
--         felfüggesztett/elutasított fiók egy ottfelejtett, jóváhagyott
--         gyülekezeti soron keresztül teljes szemely (CNP!), befizetes, kiadas
--         hozzáférést tartott volna meg — a (2)/(4)/(5) ág MIND szűr status-ra.
--    (ii) hozzákerült a SZEREP-SZŰRŐ (`lelkesz` / `konyvelo`). A
--         profile_roles_role_check engedi a `custom` értéket is
--         (2026-04-17-profile-roles-fazis-1.sql:74-85), és az RLS a
--         `permissions` JSONB-t TELJESEN figyelmen kívül hagyja — egy
--         „Titkárnő"/„Pénztáros" custom sor üres permissions-szel is teljes
--         tábla-szintű hozzáférést kapott volna a tagnyilvántartáshoz.
--         A 0/C 310-es sora megmondja, mely szerepekkel léteznek ma ilyen sorok.
--    (iii) A harmadik láb (a kerületi admin korlátlan profile_roles-INSERT-je)
--         a 2/A-2 szakaszban van lezárva.

CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $can_access$
  -- v2026-08-11-szukites
  SELECT

    -- (1) Rendszergazda (2026-08-11 óta a global access CSAK ezt jelenti)
    public.current_user_has_global_access()

    -- (2) Saját gyülekezet (lelkesz) — BYTE-HŰEN a fazis2f-verzióból
    OR (
      target_cong IS NOT NULL
      AND target_cong = public.current_user_congregation_id()
    )

    -- (3) ⭐ ÚJ: EGYHÁZMEGYE (esperes / egyhazmegyei_admin) + EGYHÁZKERÜLET
    OR public.felettes_szint_hozzaferese(target_cong)

    -- (4) Egyházmegyei számvevő a megyéje alatt (DE csak ha a lelkész
    --     jóváhagyta!) — BYTE-HŰEN a fazis2f-verzióból
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.profile_congregations pc
             ON pc.profile_id = p.id
            AND pc.congregation_id = target_cong
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazmegyei_szamvevo'
          AND c.diocese_id = p.diocese_id
          AND pc.active = true
          AND pc.approval_status = 'approved'
      )
    )

    -- (5) Könyvelő/számvevő many-to-many hozzárendelés, JÓVÁHAGYVA
    --     — BYTE-HŰEN a fazis2f-verzióból
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_congregations pc
        JOIN public.profiles p ON p.id = pc.profile_id
        WHERE pc.profile_id = auth.uid()
          AND pc.congregation_id = target_cong
          AND pc.active = true
          AND pc.approval_status = 'approved'
          AND p.status = 'active'
      )
    )

    -- (6) ⭐ ÚJ: profile_roles gyülekezeti hatókör (profilváltó / társ-lelkész /
    --     kirendelt könyvelő) — aktivitási kapuval ÉS szerep-szűrővel.
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        JOIN public.profiles p ON p.id = pr.profile_id
        WHERE pr.profile_id = auth.uid()
          AND p.status = 'active'
          AND pr.scope = 'congregation'
          AND pr.scope_id = target_cong
          AND pr.role IN ('lelkesz', 'konyvelo')
          AND pr.active = true
          AND pr.approval_status = 'approved'
      )
    );
$can_access$;

COMMENT ON FUNCTION public.current_user_can_access_congregation(uuid) IS
  '2026-08-11 (P1 #17): hat ág — (1) rendszergazda, (2) saját gyülekezet (skalár), (3) ÚJ: egyházmegye/egyházkerület (felettes_szint_hozzaferese), (4) egyházmegyei számvevő jóváhagyott hozzárendeléssel, (5) könyvelő/számvevő m2m jóváhagyva, (6) ÚJ: profile_roles gyülekezeti hatókör (profilváltó) — status=active kapuval és lelkesz/konyvelo szerep-szűrővel (a custom sorokat az app permissions-rétege kezelje, ne az RLS). Az esperes/egyhazmegyei_admin KORÁBBI ORSZÁGOS hozzáférése megszűnt.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2c) current_user_can_edit_congregation(uuid) — a gyülekezeti törzsadat
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ A KERÜLETI ÁG A KÜLÖN `felettes_szint_szerkesztheto()`-N ÁLL, NEM az
--    olvasási kapun. Így a 2/B szakasz (kerületi SOR-olvasás elvétele) NEM
--    veszi el a kerületi admin mai törzsadat-szerkesztési jogát
--    (2026-04-16-wc7-4-fazis2f-congregations.sql:196-207).
-- A konyvelo/szamvevo továbbra is EXPLICIT KIZÁRVA.

CREATE OR REPLACE FUNCTION public.current_user_can_edit_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $can_edit$
  -- v2026-08-11-szukites
  SELECT

    -- Rendszergazda
    public.current_user_has_global_access()

    -- Lelkész a saját gyülekezetét — BYTE-HŰEN a fazis2f-verzióból
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'lelkesz'
          AND p.congregation_id = target_cong
      )
    )

    -- ⭐ Egységes SZERKESZTÉSI ág: esperes/egyhazmegyei_admin a SAJÁT megyéje,
    --    egyhazkeruleti_admin a SAJÁT kerülete — a 2/B szakasztól FÜGGETLENÜL.
    OR public.felettes_szint_szerkesztheto(target_cong);

  -- Konyvelo és szamvevo szerepkörök KIZÁRVA — nem szerkeszthetnek alapadatot.
$can_edit$;

COMMENT ON FUNCTION public.current_user_can_edit_congregation(uuid) IS
  'IGAZ, ha a hívó szerkesztheti a megadott gyülekezet törzsadatát. 2026-08-11: rendszergazda / lelkesz a sajátját / esperes-egyhazmegyei_admin a saját MEGYÉJÉBEN / egyhazkeruleti_admin a saját KERÜLETÉBEN. A kerületi ág a felettes_szint_szerkesztheto()-n áll (NEM az olvasási kapun), hogy a 2/B szakasz ne vehesse el. Konyvelo és egyhazmegyei_szamvevo explicit TILTVA.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2d) A 2026-08-10-es takarítás feloldó segédfüggvényei
-- ────────────────────────────────────────────────────────────────────────────
-- Mind a három a `current_user_has_global_access() OR <saját gyülekezet skalár>`
-- mintát használja, megyei/kerületi láb NÉLKÜL. Enélkül a temetői modul, a
-- sírhely-bérletek és a kiadási kísérőív a szűkítés után NÉMÁN kiesne az
-- esperes elől. SZÁNDÉKOSAN NEM a teljes can_access_congregation-t hívjuk
-- (az a könyvelői m2m ágat is behozná — a könyvelő ma nem lát temetőt).
-- A `p_legacy_is` (árva sor) ág byte-hűen marad.

CREATE OR REPLACE FUNCTION public.sirhely_temeto_hozzaferheto(
    p_temetoid  integer,
    p_legacy_is boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $temeto_scope$
  -- v2026-08-11-szukites
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1
      FROM public.sirhelytemeto t
      WHERE t.id = p_temetoid
        AND t.congregation_id IS NOT NULL
        AND (
          t.congregation_id = public.current_user_congregation_id()
          OR public.felettes_szint_hozzaferese(t.congregation_id)
        )
    )
    OR (
      -- legacy: a temető nem köthető gyülekezethez → az árva sor ne tűnjön el
      p_legacy_is
      AND NOT EXISTS (
        SELECT 1 FROM public.sirhelytemeto t
        WHERE t.id = p_temetoid AND t.congregation_id IS NOT NULL
      )
    );
$temeto_scope$;

CREATE OR REPLACE FUNCTION public.sirhely_hozzaferheto(
    p_sirhelyid integer,
    p_legacy_is boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $sirhely_scope$
  -- v2026-08-11-szukites
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1
      FROM public.sirhely s
      JOIN public.sirhelytemeto t ON t.id = s.temetoid
      WHERE s.id = p_sirhelyid
        AND t.congregation_id IS NOT NULL
        AND (
          t.congregation_id = public.current_user_congregation_id()
          OR public.felettes_szint_hozzaferese(t.congregation_id)
        )
    )
    OR (
      p_legacy_is
      AND NOT EXISTS (
        SELECT 1
        FROM public.sirhely s
        JOIN public.sirhelytemeto t ON t.id = s.temetoid
        WHERE s.id = p_sirhelyid AND t.congregation_id IS NOT NULL
      )
    );
$sirhely_scope$;

CREATE OR REPLACE FUNCTION public.kiadas_hozzaferheto(
    p_id_kiadas integer,
    p_legacy_is boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $kiadas_scope$
  -- v2026-08-11-szukites
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1
      FROM public.kiadas k
      WHERE k.id = p_id_kiadas
        AND k.congregation_id IS NOT NULL
        AND (
          k.congregation_id = public.current_user_congregation_id()
          OR public.felettes_szint_hozzaferese(k.congregation_id)
        )
    )
    OR (
      p_legacy_is
      AND NOT EXISTS (
        SELECT 1 FROM public.kiadas k
        WHERE k.id = p_id_kiadas AND k.congregation_id IS NOT NULL
      )
    );
$kiadas_scope$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2/B. SZAKASZ — OPCIONÁLIS: KERÜLETI SOR-HOZZÁFÉRÉS NÉLKÜL                ║
-- ║ ⚠️ CSAK AKKOR FUTTASD, ha a 0. szakasz 111-es sora FALSE volt            ║
-- ║    (= ma NINCS kerületi ág a can_access_congregation-ben), ÉS a          ║
-- ║    2026-08-11-i döntést tartani akarod: „a kerület csak                  ║
-- ║    taglétszám-ÖSSZESÍTŐT lát, sorokat nem".                              ║
-- ║ ⚠️ EZ A SZAKASZ ÉLES SQL, DE TOKENHEZ KÖTÖTT — a legelső utasítás        ║
-- ║    HANGOSAN elszáll, ha nem adtad ki a SET-et. (Régen az egész szakasz   ║
-- ║    ki volt kommentelve, és a futtatása NÉMÁN „sikerült".)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT VESZ EL PONTOSAN: a kerületi admin SOR-szintű OLVASÁSÁT mindenütt, ahol
-- a `felettes_szint_hozzaferese()` a kapu — tehát a szemely/befizetes/kiadas/
-- csalad/gyerek mellett a ~50 <tábla>_szint_select policy, a 3c/3d/3e/3f/3g
-- policy-k, a sírhely/kiadás feloldók és az 5/B storage-policy-k kerületi ágát is.
-- MIT NEM VESZ EL:
--   · a gyülekezeti TÖRZSADAT-SZERKESZTÉST (az a felettes_szint_szerkesztheto()-n
--     áll, amit ez a szakasz NEM módosít) — ez a revízió két major-jének a javítása;
--   · a 2026-08-09-es fájl kerületi policy-it (document_submissions_district_*,
--     annual_reports_select_district, diocese_*, dioceses) — azok nem ezt hívják;
--   · a `district_member_counts()` összesítő RPC-t.
--
-- FUTTATÁS (két lépés, EGY pasztában):
--   SET kartoteka.kerulet_nelkul = 'IGEN';
--   …majd a lenti blokk.

-- SET kartoteka.kerulet_nelkul = 'IGEN';   -- ⬅️ vedd le a kommentet, ha tényleg ezt akarod

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

DO $kerulet_nelkul_kapu$
BEGIN
  IF COALESCE(current_setting('kartoteka.kerulet_nelkul', true), '') IS DISTINCT FROM 'IGEN' THEN
    RAISE EXCEPTION '⛔ A 2/B szakasz NEM futott le. Ez OPCIONÁLIS, hatókört SZŰKÍTŐ lépés. Ha tényleg ezt akarod, add ki ELŐBB: SET kartoteka.kerulet_nelkul = ''IGEN''; és futtasd újra a szakaszt.';
  END IF;
  RAISE NOTICE '⚠️ 2/B: a kerületi admin SOR-szintű olvasása MOST megszűnik (a törzsadat-szerkesztése MEGMARAD).';
END
$kerulet_nelkul_kapu$;

-- Az OLVASÁSI kapu megye-only változata (a szerkesztési kapu ÉRINTETLEN marad)
CREATE OR REPLACE FUNCTION public.felettes_szint_hozzaferese(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_kapu_b$
  -- v2026-08-11-szukites (2/B változat: KERÜLETI LÁB NÉLKÜL)
  SELECT EXISTS (
    SELECT 1
    FROM public.congregations c
    WHERE c.id = target_cong
      AND c.diocese_id = ANY (public.current_user_diocese_ids())
  );
$felettes_kapu_b$;

CREATE OR REPLACE FUNCTION public.felettes_szint_gyulekezet_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $felettes_congs_b$
  -- v2026-08-11-szukites (2/B változat: KERÜLETI LÁB NÉLKÜL)
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
  '2/B változat (2026-08-11): CSAK egyházmegyei hatókör. A kerületi admin SOR-szintű OLVASÁSÁT szándékosan nem adja meg — a kerület a district_member_counts() összesítő RPC-t használja. A kerületi TÖRZSADAT-SZERKESZTÉS a külön felettes_szint_szerkesztheto()-n áll, azt ez a változat NEM érinti.';

COMMIT;
NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. SZAKASZ — ELLENŐRZÉS                                                  ║
-- ║ EGYETLEN SELECT. Futtasd MINDEN módosító szakasz UTÁN.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A Supabase SQL Editor `postgres`-ként fut, ahol `auth.uid()` NULL, tehát a
--    helper-függvények „a te szemeddel" innen nem próbálhatók ki. A 6/C blokk
--    ezért UGYANAZT a logikát számolja ki közvetlenül az adatokból; a 6/D blokk
--    pedig JWT-emulációval TÉNYLEGESEN megméri a szivárgás bezárultát.

SELECT sorrend, szakasz, mit_mer, ertek FROM (

-- ── 6/A · A FÜGGVÉNYEK ÁTÁLLTAK-E ──────────────────────────────────────────
SELECT 601 AS sorrend, '6/A · FÜGGVÉNYEK'::text AS szakasz,
       'has_global_access: már CSAK rendszergazda? (kiesett az esperes szerep) — VÁRT: true'::text AS mit_mer,
       COALESCE((SELECT (pg_get_functiondef(oid) NOT LIKE '%''esperes''%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_has_global_access' LIMIT 1), '(nincs)')::text AS ertek
UNION ALL
SELECT 602, '6/A · FÜGGVÉNYEK',
       'has_global_access: MINDKÉT ágon van status-kapu? — VÁRT: 2 (a ''status'' szó előfordulásainak száma)',
       COALESCE((SELECT (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid), 'status', '')))::integer / 6
                 FROM pg_proc WHERE pronamespace='public'::regnamespace
                   AND proname='current_user_has_global_access' LIMIT 1)::text, '(nincs)')
UNION ALL
SELECT 603, '6/A · FÜGGVÉNYEK',
       'can_access_congregation: bekerült a megyei ág? — VÁRT: true',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%felettes_szint_hozzaferese%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 604, '6/A · FÜGGVÉNYEK',
       'can_access_congregation: megmaradt a LELKÉSZI ág? — VÁRT: true',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%current_user_congregation_id%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 605, '6/A · FÜGGVÉNYEK',
       'can_access_congregation: megmaradt a SZÁMVEVŐI ág? — VÁRT: true',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%egyhazmegyei_szamvevo%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 606, '6/A · FÜGGVÉNYEK',
       'can_access_congregation (6) ág: van szerep-szűrő ÉS status-kapu? — VÁRT: true',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%''lelkesz'', ''konyvelo''%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_access_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 607, '6/A · FÜGGVÉNYEK',
       'can_edit_congregation: a KÜLÖN szerkesztési kaput hívja? (a 2/B ne vehesse el) — VÁRT: true',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%felettes_szint_szerkesztheto%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_can_edit_congregation' LIMIT 1), '(nincs)')
UNION ALL
SELECT 608, '6/A · FÜGGVÉNYEK',
       'Mind a 6 új segédfüggvény megvan? — VÁRT: 6',
       (SELECT count(*)::text FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('current_user_diocese_ids', 'current_user_district_ids',
                          'felettes_szint_gyulekezet_ids', 'felettes_szint_hozzaferese',
                          'felettes_szint_szerkesztheto', 'mm_moderator_e'))
UNION ALL
SELECT 609, '6/A · FÜGGVÉNYEK',
       'A hatókör-feloldókban van status-kapu? — VÁRT: 2 (mindkettőben)',
       (SELECT count(*)::text FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('current_user_diocese_ids', 'current_user_district_ids')
          AND pg_get_functiondef(oid) LIKE '%status = ''active''%')
UNION ALL
SELECT 610, '6/A · FÜGGVÉNYEK',
       'A sírhely/kiadás feloldók megkapták a megyei ágat? — VÁRT: 3',
       (SELECT count(*)::text FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('sirhely_temeto_hozzaferheto', 'sirhely_hozzaferheto', 'kiadas_hozzaferheto')
          AND pg_get_functiondef(oid) LIKE '%felettes_szint_hozzaferese%')
UNION ALL
SELECT 611, '6/A · FÜGGVÉNYEK',
       'search_path mind a 6 új függvényen `public, pg_temp`? — VÁRT: 6',
       (SELECT count(*)::text FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('current_user_diocese_ids', 'current_user_district_ids',
                          'felettes_szint_gyulekezet_ids', 'felettes_szint_hozzaferese',
                          'felettes_szint_szerkesztheto', 'mm_moderator_e')
          AND 'search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
UNION ALL
SELECT 612, '6/A · FÜGGVÉNYEK',
       'EXECUTE-jog az `authenticated`-nek a 6 új függvényen — VÁRT: 6',
       (SELECT count(DISTINCT p.proname)::text FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) ac
        JOIN pg_roles r ON r.oid = ac.grantee
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('current_user_diocese_ids', 'current_user_district_ids',
                            'felettes_szint_gyulekezet_ids', 'felettes_szint_hozzaferese',
                            'felettes_szint_szerkesztheto', 'mm_moderator_e')
          AND ac.privilege_type = 'EXECUTE' AND r.rolname = 'authenticated')
UNION ALL
SELECT 613, '6/A · FÜGGVÉNYEK',
       'A 3 index létrejött, és MI a definíciója? (ellenőrizd, hogy tényleg a várt oszlopokon van!)',
       COALESCE((SELECT string_agg(indexname || ' :: ' || indexdef, '  |  ' ORDER BY indexname)
                 FROM pg_indexes WHERE schemaname='public'
                   AND indexname IN ('idx_congregations_diocese_id','idx_dioceses_district_id',
                                     'idx_profile_roles_profile_scope')), '⛔ EGY SEM')

-- ── 6/B · A POLICY-K ÉS A MELLÉKUTAK ───────────────────────────────────────
UNION ALL
SELECT 621, '6/B · POLICY-K',
       'Hány TÁBLA kapott <tábla>_szint_select policy-t? — VÁRT: a 4. szakasz „ÖSSZESEN N tábla" üzenetében látott N (a monetar és az annual_reports KIVONVA)',
       (SELECT count(DISTINCT tablename)::text FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE '%\_szint\_select'
          AND tablename NOT IN ('monetar', 'annual_reports'))
UNION ALL
SELECT 622, '6/B · POLICY-K',
       '…és a 4. szakasz által ELMENTETT darabszám (ha a system_settings írható volt) — a 621-gyel EGYEZNIE kell',
       COALESCE((SELECT value FROM public.system_settings
                 WHERE key = 'rls_szint_select_db_2026_08_11'), '(nem sikerült elmenteni — hasonlítsd a 4. szakasz NOTICE-ához)')
UNION ALL
SELECT 623, '6/B · POLICY-K',
       '…és MELY TÁBLÁK azok',
       COALESCE((SELECT string_agg(DISTINCT tablename, ', ' ORDER BY tablename)
                 FROM pg_policies
                 WHERE schemaname = 'public' AND policyname LIKE '%\_szint\_select'), '(egy sem)')
UNION ALL
SELECT 624, '6/B · POLICY-K',
       'A 9 névre szóló hiánypótló policy megvan? — VÁRT: 9',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname IN ('dioceses_update_diocese_scope', 'profile_roles_diocese_read_roles',
                             'profile_congregations_diocese_read', 'import_logs_select_diocese_scope',
                             'monetar_szint_select', 'document_submissions_szint_all',
                             'annual_reports_szint_select', 'annual_reports_szint_update',
                             'ertesitesek_szint_insert'))
UNION ALL
SELECT 625, '6/B · POLICY-K',
       'MM moderátori policy-k (tábla×parancs) száma és parancs-eloszlása',
       COALESCE((SELECT count(*)::text || ' db — ' || string_agg(DISTINCT cmd, '/')
                 FROM pg_policies
                 WHERE schemaname = 'public' AND policyname LIKE 'mm\_%\_mmmod\_%'), '(egy sem)')
UNION ALL
SELECT 626, '6/B · POLICY-K',
       '⛔ MM: keletkezett-e ÍRÁSJOG a gamifikációs statisztikán? — VÁRT: (egy sem)',
       COALESCE((SELECT string_agg(policyname || '[' || cmd || ']', ', ')
                 FROM pg_policies
                 WHERE schemaname='public' AND tablename='mm_felhasznalo_statisztika'
                   AND policyname LIKE '%mmmod%' AND cmd <> 'SELECT'), '✅ egy sem')
UNION ALL
SELECT 627, '6/B · POLICY-K',
       '⛔ MARADT-E nyitott (true-feltételű) PERMISSIVE policy BÁRHOL (a tudatosan publikus törzsadaton kívül)? — VÁRT: egy sem',
       COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
                 FROM pg_policies
                 WHERE schemaname='public' AND permissive='PERMISSIVE'
                   AND 'authenticated' = ANY(roles)
                   AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true')
                   AND tablename NOT LIKE 'adr%'
                   AND tablename NOT IN ('nevnap','nom_cimlet','szamadasicel','szamadasidatum',
                                         'befizetescel','befizetocelcfg','kiadascel','event',
                                         'congregations','dioceses','districts',
                                         'mm_kategoriak','mm_segedanyag_kategoriak','mm_jelveny_tipusok')), '✅ egy sem')
UNION ALL
SELECT 628, '6/B · POLICY-K',
       '⛔ RLS mindenhol be van kapcsolva, ahol az authenticated-nek jogosultsága van? — VÁRT: (egy sem)',
       COALESCE((SELECT string_agg(DISTINCT c.relname, ', ' ORDER BY c.relname)
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
                   AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                               WHERE g.table_schema='public' AND g.table_name=c.relname
                                 AND g.grantee='authenticated')), '✅ egy sem')
UNION ALL
SELECT 629, '6/B · MELLÉKUTAK',
       '⛔ A profiles jogosultság-védő trigger él? — VÁRT: 1',
       (SELECT count(*)::text FROM pg_trigger
        WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
          AND tgname = 'profiles_jogosultsag_vedelem_trg')
UNION ALL
SELECT 630, '6/B · MELLÉKUTAK',
       '⛔ A profile_roles_admin_manage WITH CHECK-je hatókörhöz van kötve? — VÁRT: true',
       COALESCE((SELECT (COALESCE(with_check,'') LIKE '%felettes_szint_hozzaferese%')::text
                 FROM pg_policies WHERE schemaname='public' AND tablename='profile_roles'
                   AND policyname='profile_roles_admin_manage' LIMIT 1), '⛔ nincs ilyen policy')
UNION ALL
SELECT 631, '6/B · POLICY-K',
       'storage.objects additív megyei olvasás — hány bucket kapott?',
       COALESCE((SELECT count(*)::text || ' — ' || string_agg(policyname, ', ' ORDER BY policyname)
                 FROM pg_policies WHERE schemaname='storage'
                   AND policyname LIKE '%\_szint\_select'), '(egy sem)')

-- ── 6/C · MIT FOG LÁTNI A GYAKORLATBAN — fiókonként, adatból számolva ──────
-- ⚠️ Ez a blokk UGYANAZT a logikát számolja, mint az éles függvények
--    (status-kapu + szerep-szűrt visszaadás + szerep-független skalár-elnyomás).
UNION ALL
SELECT 641, '6/C · KI MIT LÁT',
       'Esperes / megyei admin fiókok és a feloldott hatókörük (gyülekezet-darabszámmal)',
       COALESCE((
         SELECT string_agg(
                  COALESCE(p.email, p.id::text) || ' → ' ||
                  COALESCE((SELECT string_agg(dd.name, '+' ORDER BY dd.name)
                            FROM public.dioceses dd
                            WHERE dd.id = ANY (sz.megyek)), '⛔ NINCS HATÓKÖR') ||
                  ' (' || COALESCE((SELECT count(*)::text FROM public.congregations c
                                    WHERE c.diocese_id = ANY (sz.megyek)), '0') || ' gyülekezet)',
                  '  |  ' ORDER BY p.email)
         FROM public.profiles p
         CROSS JOIN LATERAL (
           SELECT CASE
             -- szerep-FÜGGETLEN elnyomás (mint az élő függvényben és az appban)
             WHEN EXISTS (SELECT 1 FROM public.profile_roles pr
                          WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                            AND pr.active = true AND pr.approval_status = 'approved'
                            AND pr.scope_id IS NOT NULL)
             THEN COALESCE((SELECT array_agg(DISTINCT pr.scope_id) FROM public.profile_roles pr
                            WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                              AND pr.role IN ('esperes', 'egyhazmegyei_admin')   -- szerep-SZŰRT visszaadás
                              AND pr.active = true AND pr.approval_status = 'approved'
                              AND pr.scope_id IS NOT NULL), '{}'::uuid[])
             ELSE CASE WHEN p.diocese_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.diocese_id] END
           END AS megyek
         ) sz
         WHERE p.status = 'active' AND p.role IN ('esperes', 'egyhazmegyei_admin')
       ), '(nincs ilyen fiók)')
UNION ALL
SELECT 642, '6/C · KI MIT LÁT',
       '⛔ Ebből HÁNY fiók marad hatókör NÉLKÜL (= csak a saját gyülekezetét látja) — VÁRT: 0',
       (SELECT count(*)::text FROM public.profiles p
        WHERE p.status = 'active' AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                          WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                            AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                            AND pr.active = true AND pr.approval_status = 'approved'
                            AND pr.scope_id IS NOT NULL)
          AND (p.diocese_id IS NULL
               OR EXISTS (SELECT 1 FROM public.profile_roles pr2
                          WHERE pr2.profile_id = p.id AND pr2.scope = 'diocese'
                            AND pr2.active = true AND pr2.approval_status = 'approved'
                            AND pr2.scope_id IS NOT NULL)))
UNION ALL
SELECT 643, '6/C · KI MIT LÁT',
       'Kerületi admin fiókok és a feloldott kerületük',
       COALESCE((
         SELECT string_agg(COALESCE(p.email, p.id::text) || ' → ' ||
                  COALESCE((SELECT string_agg(dt.name, '+' ORDER BY dt.name)
                            FROM public.districts dt WHERE dt.id = ANY (sz.keruletek)), '⛔ NINCS HATÓKÖR'),
                  '  |  ' ORDER BY p.email)
         FROM public.profiles p
         CROSS JOIN LATERAL (
           SELECT CASE
             WHEN EXISTS (SELECT 1 FROM public.profile_roles pr
                          WHERE pr.profile_id = p.id AND pr.scope = 'district'
                            AND pr.active AND pr.approval_status = 'approved' AND pr.scope_id IS NOT NULL)
             THEN COALESCE((SELECT array_agg(DISTINCT pr.scope_id) FROM public.profile_roles pr
                            WHERE pr.profile_id = p.id AND pr.scope = 'district'
                              AND pr.role = 'egyhazkeruleti_admin'
                              AND pr.active AND pr.approval_status = 'approved'
                              AND pr.scope_id IS NOT NULL), '{}'::uuid[])
             ELSE CASE WHEN p.district_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p.district_id] END
           END AS keruletek
         ) sz
         WHERE p.status = 'active' AND p.role = 'egyhazkeruleti_admin'
       ), '(nincs ilyen fiók)')
UNION ALL
SELECT 644, '6/C · KI MIT LÁT',
       'Az ORSZÁG összes gyülekezete / a legnagyobb megye gyülekezet-száma (a különbség = amit MOSTANTÓL NEM lát az esperes)',
       (SELECT count(*)::text FROM public.congregations) || ' / ' ||
       COALESCE((SELECT max(db)::text FROM (SELECT count(*) AS db FROM public.congregations
                                            GROUP BY diocese_id) x), '0')
UNION ALL
SELECT 645, '6/C · KI MIT LÁT',
       '⛔ Gyülekezetek egyházmegye NÉLKÜL (ezek az esperes elől ELTŰNTEK) — VÁRT: 0',
       (SELECT count(*)::text FROM public.congregations WHERE diocese_id IS NULL)

) AS t
ORDER BY sorrend;


-- ── 6/D · ⭐ VALÓDI BIZONYÍTÉK: JWT-EMULÁCIÓ (eldobható tranzakció) ────────
-- A 6/A csak SZÖVEGET keres a függvényekben, a 6/C csak újraszámol. EZ méri
-- meg TÉNYLEGESEN, hogy a szivárgás bezárult-e. Írd bele egy VALÓS esperes
-- fiók uuid-ját (0/C 303/6/C 641 sorból), és futtasd EGYBEN. A ROLLBACK miatt
-- semmi nem marad utána.
--
-- BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<IDE-AZ-ESPERES-UUID-JA>","role":"authenticated"}';
--   SELECT (SELECT count(DISTINCT congregation_id) FROM public.szemely)   AS lathato_gyulekezet,
--          (SELECT count(*) FROM public.congregations)                    AS orszagos_gyulekezet,
--          (SELECT count(DISTINCT congregation_id) FROM public.befizetes) AS lathato_penzugy;
-- ROLLBACK;
--
-- VÁRT: `lathato_gyulekezet` = a SAJÁT megyéje gyülekezeteinek száma
--       (a 6/C 641-es sor zárójeles száma), NEM az `orszagos_gyulekezet`.
--       A kettő KÜLÖNBSÉGE a bezárt szivárgás.
--
-- ── 6/E · ⭐ TELJESÍTMÉNY-MÉRÉS — ÉLESÍTÉS ELŐTT KÖTELEZŐ ─────────────────
-- Ugyanabban a JWT-emulált munkamenetben (az `authenticated` szerep
-- statement_timeout-ja 8 MÁSODPERC!):
--
-- BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<ESPERES-UUID>","role":"authenticated"}';
--   EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM public.szemely;
--   EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM public.befizetes;
-- ROLLBACK;
--
-- VÁRT: „Execution Time" jóval 8000 ms ALATT. Ha nem: NE ÉLESÍTS —
--       a `felettes_szint_hozzaferese()` soronkénti költsége a szűk keresztmetszet.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. SZAKASZ — FÜST-TESZT: MIT KATTINTS, MILYEN SZEREPPEL                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Fontos: MINDEN teszt előtt JELENTKEZZ KI ÉS BE (a szerepkör-kontextus
-- gyorsítótárazódik), és a böngészőben nyomj Ctrl+Shift+R-t.
--
-- ⚠️ Az A) blokkot KÉTSZER kell végigmenni:
--      A/I.  egy esperessel, akinek profile_roles diocese-SORA van,
--      A/II. egy esperessel, akinek CSAK profiles.diocese_id SKALÁRJA van
--            (ha nincs ilyen, hozz létre egy tesztfiókot) — a 3f/3g/3h
--            policy-k pont az első esetre készültek, a régi policy-k a másodikra.
--
-- ── A) ESPERES — a SAJÁT egyházmegyéjét TELJESEN lássa (VÁRT: minden működik)
--   1.  Belépés esperesként → /dashboard-egyhazmegye betölt, a gyülekezet-lista
--       a SAJÁT megye gyülekezeteit mutatja (nem többet, nem kevesebbet).
--   2.  „Beküldött dokumentumok" → a megye gyülekezeteinek beadványai
--       látszanak; egy státusz-módosítás (átvétel/véglegesítés) MENTHETŐ.
--   3.  ⭐ Egy dokumentum VISSZAKÜLDÉSE javításra → mentés után LÉPJ BE
--       LELKÉSZKÉNT, és nézd meg, hogy MEGÉRKEZETT-E AZ ÉRTESÍTÉS.
--       (Ez a 3h policy próbája. A régi kódban ez a beszúrás try/catch-ben,
--        eldobott {error}-ral futott → néma hiba lett volna.)
--   4.  „Feloldási kérelmek" → egy kérelem jóváhagyása/elutasítása MENTHETŐ,
--       és frissítés után is látszik a hatása (bealitas UPDATE), ÉS a lelkész
--       megkapja róla az értesítést.
--   5.  Lelkészi jelentések → a megye jelentései látszanak, feloldás megy.
--   6.  ⭐ Éves jelentések (esperesi ág) → a megye jelentései LÁTSZANAK, és egy
--       ÁTVÉTEL / státusz-előrelépés / review_notes MENTHETŐ. (3g policy)
--   7.  Megyei nyugtatömbök (chitanta) → a saját megye tömbjei megvannak,
--       új tömb rögzíthető.
--   8.  Egyházmegyei pénzügy (diocese_*) → bevétel/kiadás/költségvetés
--       listázódik és menthető.
--   9.  Az egyházmegye törzsadatának szerkesztése (IBAN/CIF/cím) → MENTHETŐ,
--       és a mentés UTÁN frissítve is látszik. (Ha nem: 3a. policy hiányzik.)
--  10.  Szerepkör-kiosztási / hozzárendelési listák → NEM üresek.
--  11.  ⭐ A 4. SZAKASZ TÁBLÁI (ezeket eddig egyetlen füst-teszt sem érintette!):
--       · /sirhelyek egy megyei gyülekezet nézetében → NEM üres,
--       · /leltar egy megyei gyülekezetnél → NEM üres,
--       · a megyei KÖLTSÉGVETÉS-nézet → NEM üres.
--       ⚠️ Ha a 0/D 407-es sor RESTRICTIVE policy-t mutatott a koltsegvetes-en,
--          EZ A PONT a leggyakoribb bukó: az additív PERMISSIVE policy-t a
--          RESTRICTIVE ÉS-kapu hatástalanná teheti.
--  12.  ⭐ CSATOLMÁNYOK: nyiss meg és TÖLTS LE egy iktató- vagy dokumentum-
--       csatolmányt egy megyei (nem saját) gyülekezettől. (5/B szakasz)
--
-- ── B) ESPERES — MÁSIK egyházmegyét NE lásson (VÁRT: üres / nem elérhető)
--  13.  Idegen megyéhez tartozó gyülekezet nyilvános oldala (/gy/<slug>) →
--       a publikus tartalom látszik (rendben), DE a belső adat nem.
--  14.  ⭐ A LEGFONTOSABB PRÓBA (ez méri a tényleges javítást):
--       böngésző → F12 → Konzol, az esperes bejelentkezett munkamenetében:
--
--         const { data, error } = await window.__supabase
--           .from('szemely').select('id, congregation_id').limit(500)
--         console.log(new Set((data ?? []).map(r => r.congregation_id)).size, error)
--
--       VÁRT: kizárólag a SAJÁT megye gyülekezet-azonosítói.
--       ⛔ Ha még mindig jön idegen megye — vagy a 2. szakasz nem futott le,
--          vagy maradt egy „true" policy (6/B 627), vagy valahol nincs
--          bekapcsolva az RLS (6/B 628).
--  15.  Ugyanez `befizetes`, `kiadas`, `csalad`, `presbiter` táblára.
--
-- ── C) LELKÉSZ — SEMMI ne változzon (VÁRT: minden pontosan úgy, mint eddig)
--  16.  Belépés gyülekezeti lelkészként → /dashboard KPI-számok VÁLTOZATLANOK
--       (hasonlítsd össze a változtatás előtti képernyőképpel!).
--  17.  /tagnyilvantartas → a taglista teljes, új tag felvehető, meglévő
--       szerkeszthető, családi karton menthető (csalad/gyerek ág).
--  18.  /penzugy → bevétel + kiadás lista, ÚJ nyugta rögzítése végigmegy.
--  19.  /anyakonyv, /sirhelyek, /leltar, /munkanaplo, /iktato → mindegyik lista
--       betölt, és mindegyikbe rögzíthető új tétel.
--  20.  ⭐ A 4/B SZAKASZ TÁBLÁI (itt VETTÜNK EL jogot!): presbiter-lista,
--       felmentések, csoportok/körzetek → MINDEGYIK teljes, és SZERKESZTHETŐ.
--  21.  Monetár fül → a címletjegyzék betölt és menthető. ⭐ Ha a 0/D 409-es sora
--       nem 0 volt, ez a pont a monetar CASE-védelem próbája is.
--  22.  ⭐ A profilváltó: ha a lelkésznek van másik gyülekezetre szóló,
--       jóváhagyott profile_roles sora, VÁLTS ÁT rá → a lista NEM üres.
--
-- ── D) EGYHÁZKERÜLETI ADMIN — a saját kerülete (VÁRT: változatlan)
--  23.  /dashboard-kerulet → a kerület megyéi + a taglétszám-összesítő megjelenik.
--  24.  Kerületi dokumentumlista (továbbított + véglegesített) NEM üres.
--  25.  ⭐ POZITÍV PRÓBA: a SAJÁT kerülete egyik gyülekezetének TÖRZSADATA
--       MENTHETŐ. (Ezt a 2c + felettes_szint_szerkesztheto() adja, és a 2/B
--       szakasz sem veheti el. A régi terv ezt NÉMÁN elvesztette volna.)
--  26.  NEGATÍV PRÓBA: egy MÁSIK kerület megyéjének törzsadata NEM szerkeszthető.
--
-- ── E) RENDSZERGAZDA — mindent lásson (VÁRT: változatlan)
--  27.  /admin → a gyülekezet-lista TELJES (az ország összes gyülekezete).
--       ⭐ Ha a MASTER_ADMIN_EMAIL fiókkal lépsz be, EZ A PONT a 0/C 308-as sor
--          próbája: ha üres, a fiók profiles.role-ja nem 'admin'.
--  28.  Egy tetszőleges gyülekezet részletei → taglista és pénzügyi összesítők.
--  29.  „Belépés a gyülekezetbe" (god mode) → a cél gyülekezet adatai megnyílnak.
--  30.  Szerepkör-kiosztás: egy új szerepkör-sor felvétele MŰKÖDIK (2/A-2 után is).
--
-- ── F) A MELLÉKUTAK ZÁRVA VANNAK-E (2/A szakasz)
--  31.  ⭐ Lelkészként a /profile oldalon a NÉV és TELEFON mentése MŰKÖDIK.
--  32.  ⭐ Lelkészként, F12 → Konzol:
--         await window.__supabase.from('profiles')
--           .update({ role: 'admin' }).eq('id', (await window.__supabase.auth.getUser()).data.user.id)
--       VÁRT: `error` NEM null (42501 / insufficient_privilege). ⛔ Ha `error: null`,
--       a 2/A-1 trigger nem él → a szűkítés MEGKERÜLHETŐ.
--  33.  ⭐ Kerületi adminként, F12 → Konzol:
--         await window.__supabase.from('profile_roles').insert({
--           profile_id: '<sajat-uid>', scope: 'system', scope_id: null,
--           role: 'admin', active: true, approval_status: 'approved' })
--       VÁRT: `error` NEM null. ⛔ Ha sikerül, a 2/A-2 nem él.
--
-- ── G) MISSZIÓS MŰHELY (ha az 5. szakaszt futtattad)
--  34.  Esperesként a Missziós Műhelyben a moderátori műveletek (törlés,
--       elrejtés, szerkesztés) továbbra is működnek.
--  35.  ⭐ Esperesként a gamifikációs statisztika NEM írható kliensről
--       (a mm_felhasznalo_statisztika-n nem keletkezhetett írásjog).
--
-- ⛔ HA BÁRMELYIK PONT MEGBUKIK: ELŐBB a 7/B triázst futtasd (egy fiókra szóló,
--    2 perces diagnosztika), és CSAK utána nyúlj a 8. szakaszhoz.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7/B. SZAKASZ — „EGY ESPERES TELEFONÁLT" — 2 PERCES TRIÁZS                ║
-- ║ Ez ÉLES SQL. Írd át az e-mail-címet, futtasd, és olvasd el a recepteket. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIÉRT: a leggyakoribb ok NEM a migráció hibája, hanem EGY fiók hiányzó
-- profile_roles sora vagy elavult skalárja — azt EGY sor beszúrásával lehet
-- orvosolni. A 8. szakasz (teljes visszaállítás) újranyitná a P1 #17 országos
-- szivárgást, ezért az a VÉGSŐ eszköz, nem az első.

-- ⬇️ ÍRD ÁT AZ E-MAIL-CÍMET, majd futtasd az EGÉSZ blokkot:
WITH cel AS (
  SELECT p.*
  FROM public.profiles p
  WHERE lower(p.email) = lower('IDE-A-PANASZOS-EMAIL-CIME')
)
SELECT
  c.email,
  c.status                                              AS profil_statusz,
  c.role                                                AS skalar_szerep,
  (SELECT d.name FROM public.dioceses  d WHERE d.id = c.diocese_id)  AS skalar_megye,
  (SELECT dt.name FROM public.districts dt WHERE dt.id = c.district_id) AS skalar_kerulet,
  (SELECT gg.name FROM public.congregations gg WHERE gg.id = c.congregation_id) AS skalar_gyulekezet,
  COALESCE((SELECT string_agg(pr.scope || '/' || pr.role || '/' || pr.approval_status ||
                              '/active=' || pr.active::text || '/' ||
                              COALESCE((SELECT d2.name FROM public.dioceses d2 WHERE d2.id = pr.scope_id),
                                       (SELECT dt2.name FROM public.districts dt2 WHERE dt2.id = pr.scope_id),
                                       (SELECT g2.name FROM public.congregations g2 WHERE g2.id = pr.scope_id),
                                       '(system)'), '  |  ' ORDER BY pr.scope)
            FROM public.profile_roles pr WHERE pr.profile_id = c.id), '(nincs szerepkör-sora)')
                                                        AS szerepkor_sorok,
  -- A SZÁMÍTOTT megyei hatókör (ugyanaz a logika, mint az éles függvényben)
  COALESCE((SELECT string_agg(d3.name, '+') FROM public.dioceses d3
            WHERE d3.id = ANY (
              CASE
                WHEN c.status <> 'active' THEN '{}'::uuid[]
                WHEN EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id=c.id
                             AND pr.scope='diocese' AND pr.active AND pr.approval_status='approved'
                             AND pr.scope_id IS NOT NULL)
                  THEN COALESCE((SELECT array_agg(DISTINCT pr.scope_id) FROM public.profile_roles pr
                                 WHERE pr.profile_id=c.id AND pr.scope='diocese'
                                   AND pr.role IN ('esperes','egyhazmegyei_admin')
                                   AND pr.active AND pr.approval_status='approved'
                                   AND pr.scope_id IS NOT NULL), '{}'::uuid[])
                WHEN c.role IN ('esperes','egyhazmegyei_admin') AND c.diocese_id IS NOT NULL
                  THEN ARRAY[c.diocese_id]
                ELSE '{}'::uuid[]
              END)), '⛔ ÜRES — EZÉRT NEM LÁT SEMMIT') AS szamitott_megyei_hatokor
FROM cel c;

-- ── RECEPTEK (a fenti eredmény alapján) ────────────────────────────────────
-- (0) `profil_statusz` ≠ 'active'  → a fiókot NEM a migráció zárta ki; aktiváld
--     a /admin felületen.
-- (1) NINCS szerepkör-sora ÉS a `skalar_megye` HELYES → nincs teendő, a
--     fallback működik; a hiba máshol van (nézd a 6/B 627/628-as sorát).
-- (2) VAN szerepkör-sora, de ROSSZ megyére (vagy `approval_status` ≠ 'approved',
--     vagy `active=false`) → a skalár ilyenkor EL VAN NYOMVA. Javítsd a sort:
--       UPDATE public.profile_roles
--          SET scope_id = '<HELYES-MEGYE-UUID>', active = true, approval_status = 'approved'
--        WHERE profile_id = '<UID>' AND scope = 'diocese';
-- (3) SEM szerepkör-sora, SEM skalárja nincs → vedd fel a sort:
--       INSERT INTO public.profile_roles (profile_id, scope, scope_id, role, approval_status, active)
--       VALUES ('<UID>', 'diocese', '<MEGYE-UUID>', 'esperes', 'approved', true);
-- (4) VAN diocese-sora, de a szerepe `custom` / `egyhazmegyei_szamvevo`
--     (0/C 309-es eset) → az app kirajzolja, az adatbázis nem adja. Vagy vedd
--     fel neki a helyes szerepű sort, vagy döntsd el, hogy tényleg kell-e.
-- (5) MINDEN rendben van, mégis üres a felület → a probléma NEM a hatókör:
--     nézd meg a 6/B 621-628-as sorokat és a 6/D JWT-emulációs próbát.
-- (6) És CSAK ha ezek egyike sem segít: 8. SZAKASZ.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. SZAKASZ — ⛔ TELJES VISSZAÁLLÍTÁS — CSAK BAJ ESETÉN                   ║
-- ║                                                                          ║
-- ║ HA egy esperes azt jelzi, hogy elvesztette az egyházmegyéjét, vagy       ║
-- ║ bármelyik felület váratlanul kiürült: ELŐBB a 7/B TRIÁZST futtasd        ║
-- ║ (2 perc, egy fiókra). Ha az nem segít: JELÖLD KI AZ EGÉSZ 8. SZAKASZT    ║
-- ║ ÉS FUTTASD LE EGYBEN.                                                    ║
-- ║                                                                          ║
-- ║ ⚠️ EZ A SZAKASZ MOSTANTÓL ÉLES SQL — NINCS KIKOMMENTELVE.                ║
-- ║    (A korábbi változatban minden sor `-- ` előtaggal állt, tehát a       ║
-- ║     „egy paszta" NEM CSINÁLT SEMMIT, és zöld „Success"-t adott vissza.   ║
-- ║     Pont abban a helyzetben, amire készült.)                             ║
-- ║ ⚠️ EZÉRT TOKENHEZ VAN KÖTVE (2026-08-11 óta): a szakasz HANGOSAN elszáll,║
-- ║    ha nem adtad ki előbb: SET kartoteka.visszaallitas = 'IGEN';          ║
-- ║    Így a fájl végigfuttatása NEM tudja visszacsinálni a fentieket.       ║
-- ║                                                                          ║
-- ║ ⚠️ ÁRA: a visszaállítás UTÁN az esperes/egyházmegyei admin ismét AZ      ║
-- ║    EGÉSZ ORSZÁG tagnyilvántartását és pénzügyét látja (P1 #17 újranyílik).║
-- ║                                                                          ║
-- ║ ⚠️ AMIT SZÁNDÉKOSAN NEM ÁLLÍT VISSZA (mert azok független, egyértelmű    ║
-- ║    biztonsági javítások, és a visszaállításuk ÚJ lyukat nyitna):         ║
-- ║      · a 2/A-1 profiles-trigger és a 2/A-2 profile_roles WITH CHECK      ║
-- ║        → a 8/9 blokk KÜLÖN, kommentben adja meg, ha mégis kell;          ║
-- ║      · a 4/B szakaszban eldobott `USING (true)` policy-k;                ║
-- ║      · a search_path-pin (`public, pg_temp`) — a 2026-05-17-es kör       ║
-- ║        lezárta, a fázis-0 csupasz `public`-ját NEM hozzuk vissza.        ║
-- ║                                                                          ║
-- ║ ⚠️ A 8/3–8/5 blokk a REPÓBÓL rekonstruál. Ha a 0/A 131–135-ös sorát      ║
-- ║    elmentetted a _RUN_LOG.md-be, HASZNÁLD AZT — az a hiteles forrás.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ⬇️ TOKEN-KAPU (2026-08-11, futtatási tapasztalat) ⬇️
--
-- MIÉRT KERÜLT IDE: a fájlt VALAKI (jogosan) egyben futtatta le. A 2/B szakasz
-- token-kapuja megállította a futást — és ezzel VÉLETLENÜL megakadályozta, hogy
-- a végrehajtás elérje EZT a szakaszt, amely visszavont volna mindent, amit az
-- előtte lévő szakaszok éppen elvégeztek. Zöld „Success" mellett.
--
-- Ez tervezési hiba volt: egy visszaállító szakasz SOHA nem futhat le pusztán
-- attól, hogy valaki fentről lefelé végigfuttatja a fájlt. Ezért mostantól
-- ugyanolyan tokenhez kötött, mint a 2/B:
--
--   SET kartoteka.visszaallitas = 'IGEN';
--
-- Ezt a sort SZÁNDÉKOSAN, KÉZZEL kell kiadnod, közvetlenül a 8. szakasz elé.
-- Enélkül a szakasz HANGOSAN elszáll, és semmit nem változtat.

DO $vissza_kapu$
BEGIN
  IF COALESCE(current_setting('kartoteka.visszaallitas', true), '') IS DISTINCT FROM 'IGEN' THEN
    RAISE EXCEPTION '⛔ A 8. szakasz (TELJES VISSZAÁLLÍTÁS) NEM futott le — és ez így helyes, ha csak végigfuttattad a fájlt. Ha TÉNYLEG vissza akarsz állítani mindent (a P1 #17 szivárgás ÚJRANYÍLIK: az esperes ismét az EGÉSZ ORSZÁG tagnyilvántartását és pénzügyét látja), add ki ELŐBB: SET kartoteka.visszaallitas = ''IGEN''; és futtasd újra a szakaszt.';
  END IF;
  RAISE NOTICE '↩️ ↩️ ↩️  VISSZAÁLLÍTÁS INDUL — %  ↩️ ↩️ ↩️', now();
  RAISE NOTICE 'Ha ezt a sort NEM látod a Notices fülön, a szakasz NEM futott le!';
END $vissza_kapu$;

BEGIN;
SET LOCAL lock_timeout      = '10s';
SET LOCAL statement_timeout = '5min';

-- 8/0. A csalad/gyerek feloldók visszaírása a fázis-0 (szűk, skalár) törzsre
-- ─────────────────────────────────────────────────────────────────────────────
-- A 2/0 alszakasz felzárkóztatta őket a can_access_congregation-re. Mivel a
-- visszaállítás a can_access_congregation-t is visszaadja az ORSZÁGOS változatra,
-- a feloldókat IS vissza kell írni — különben az esperes a visszaállítás után
-- országosan olvasná a családi kartonokat, ami ROSSZABB lenne a kiindulásnál.
--
-- FONTOS: ez a fázis-0 törzs SZŰK — a `profiles.congregation_id` skalárhoz köt.
-- Vagyis a visszaállítás után a profilváltóval dolgozó lelkész a MÁSIK
-- gyülekezetében megint nem tud családi kartont írni. Ez a 2026-08-11 ELŐTTI,
-- eredeti állapot; ha a visszaállítás tartós marad, ezt külön kell rendezni.

CREATE OR REPLACE FUNCTION public.csalad_resolves_to_accessible_cong(
    p_id_ferfi integer,
    p_id_no    integer
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $csalad_resolver_vissza$
  -- FÁZIS-0 (szűk) törzs — visszaállítva 2026-08-11.
  SELECT EXISTS (
    SELECT 1 FROM public.szemely s
    WHERE (
      (p_id_ferfi IS NOT NULL AND s.id = p_id_ferfi)
      OR (p_id_no IS NOT NULL AND s.id = p_id_no)
    )
    AND s.congregation_id = public.current_user_congregation_id()
  );
$csalad_resolver_vissza$;

CREATE OR REPLACE FUNCTION public.gyerek_resolves_to_accessible_cong(
    p_id_csalad  integer,
    p_id_szemely integer
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $gyerek_resolver_vissza$
  -- FÁZIS-0 (szűk) törzs — visszaállítva 2026-08-11.
  SELECT EXISTS (
    SELECT 1 FROM public.szemely s
    WHERE s.id = p_id_szemely
      AND s.congregation_id = public.current_user_congregation_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.csalad c
    JOIN public.szemely s2 ON (s2.id = c.id_ferfi OR s2.id = c.id_no)
    WHERE c.id = p_id_csalad
      AND s2.congregation_id = public.current_user_congregation_id()
  );
$gyerek_resolver_vissza$;

DO $vissza_resolver$ BEGIN
  RAISE NOTICE '↩️ csalad/gyerek feloldók visszaírva a fázis-0 (szűk) törzsre.';
END $vissza_resolver$;

-- 8/1. Az additív policy-k eldobása (3., 4., 5. és 5/B szakasz)
DO $vissza_policyk$
DECLARE r record; v_db integer := 0;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname FROM pg_policies
        WHERE (schemaname = 'public' AND (policyname LIKE '%\_szint\_select'
                                       OR policyname LIKE '%\_szint\_update'
                                       OR policyname LIKE '%\_szint\_all'
                                       OR policyname LIKE '%\_szint\_insert'
                                       OR policyname LIKE 'mm\_%\_mmmod\_%'
                                       OR policyname LIKE 'mm\_%\_mm\_moderator'))
           OR (schemaname = 'storage' AND policyname LIKE '%\_szint\_select')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        v_db := v_db + 1;
        RAISE NOTICE '↩️ eldobva: %.%.%', r.schemaname, r.tablename, r.policyname;
    END LOOP;
    RAISE NOTICE '↩️ ÖSSZESEN % additív policy eldobva.', v_db;
END
$vissza_policyk$;

-- 8/2. A névre szóló hiánypótló policy-k eldobása (3. szakasz)
DROP POLICY IF EXISTS dioceses_update_diocese_scope       ON public.dioceses;
DROP POLICY IF EXISTS profile_roles_diocese_read_roles    ON public.profile_roles;
DROP POLICY IF EXISTS profile_congregations_diocese_read  ON public.profile_congregations;
DROP POLICY IF EXISTS import_logs_select_diocese_scope    ON public.import_logs;
DROP POLICY IF EXISTS monetar_szint_select                ON public.monetar;
DROP POLICY IF EXISTS document_submissions_szint_all      ON public.document_submissions;
DROP POLICY IF EXISTS annual_reports_szint_select         ON public.annual_reports;
DROP POLICY IF EXISTS annual_reports_szint_update         ON public.annual_reports;
DROP POLICY IF EXISTS ertesitesek_szint_insert            ON public.ertesitesek;

-- 8/3. current_user_has_global_access() — VISSZA a fázis-0 LOGIKÁRA
--      (2026-04-12-phase-0-rls-hardening.sql:53-67)
--      ⚠️ SZÁNDÉKOS ELTÉRÉS az eredetitől: a search_path MARAD `public, pg_temp`.
--         A 2026-05-17-security-definer-search-path-pin.sql (LEFUTOTT) ezt a
--         CVE-2018-1058 elleni védelmet 17 függvényre kiterjesztette; egy
--         „byte-hű" visszaállítás újranyitná azt a lyukat.
CREATE OR REPLACE FUNCTION public.current_user_has_global_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $vissza_global$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
  );
$vissza_global$;

COMMENT ON FUNCTION public.current_user_has_global_access() IS
  'Admin/esperes/egyhazmegyei_admin? (mindent látó szerepkörök) — a 2026-04-12-es fázis-0 LOGIKA visszaállítva (a search_path pin megmarad, 2026-05-17). ⚠️ EZZEL A P1 #17 ORSZÁGOS SZIVÁRGÁS ÚJRA NYITVA VAN.';

-- 8/4. current_user_can_access_congregation(uuid) — VISSZA a fazis2f törzsre
--      (2026-04-16-wc7-4-fazis2f-congregations.sql:87-155)
--      ⚠️ HA a 0/A 132-es sora azt mutatta, hogy élesben a
--         2026-07-01-bug2-rls-comembership-OPCIONALIS.sql verziója futott
--         (3 ág: globális + saját gyülekezet + profile_roles co-membership),
--         akkor EZ A BLOKK NEM „visszaállít", hanem MÁSIK állapotot hoz létre
--         (hozzáadja a kerületi/számvevői/m2m ágat, elveszi a co-membershipet).
--         Ilyenkor a _RUN_LOG.md-be mentett törzset illeszd be ide helyette!
CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $vissza_can_access$
  SELECT
    -- 2.1. Globális hozzáférésűek (admin, esperes, egyhazmegyei_admin)
    public.current_user_has_global_access()
    -- 2.2. Saját gyülekezet (lelkesz)
    OR (target_cong IS NOT NULL AND target_cong = public.current_user_congregation_id())
    -- 2.3. Egyházkerületi admin a kerülete alatt
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.dioceses d ON d.id = c.diocese_id
        WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role = 'egyhazkeruleti_admin' AND d.district_id = p.district_id))
    -- 2.4. Egyházmegyei számvevő a megyéje alatt (jóváhagyva)
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.profile_congregations pc
             ON pc.profile_id = p.id AND pc.congregation_id = target_cong
        WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role = 'egyhazmegyei_szamvevo' AND c.diocese_id = p.diocese_id
          AND pc.active = true AND pc.approval_status = 'approved'))
    -- 2.5. Könyvelő/számvevő many-to-many hozzárendelés
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profile_congregations pc
        JOIN public.profiles p ON p.id = pc.profile_id
        WHERE pc.profile_id = auth.uid() AND pc.congregation_id = target_cong
          AND pc.active = true AND pc.approval_status = 'approved'
          AND p.status = 'active'));
$vissza_can_access$;

-- 8/5. current_user_can_edit_congregation(uuid) — VISSZA a fazis2f törzsre
--      (2026-04-16-wc7-4-fazis2f-congregations.sql:165-207)
CREATE OR REPLACE FUNCTION public.current_user_can_edit_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $vissza_can_edit$
  SELECT
    public.current_user_has_global_access()
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role = 'lelkesz' AND p.congregation_id = target_cong))
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.dioceses d ON d.id = c.diocese_id
        WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role = 'egyhazkeruleti_admin' AND d.district_id = p.district_id));
$vissza_can_edit$;

-- 8/6. A sírhely/kiadás feloldók — VISSZA a 2026-08-10-es törzsre
CREATE OR REPLACE FUNCTION public.sirhely_temeto_hozzaferheto(
    p_temetoid integer, p_legacy_is boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $vissza_temeto$
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (SELECT 1 FROM public.sirhelytemeto t
               WHERE t.id = p_temetoid AND t.congregation_id IS NOT NULL
                 AND t.congregation_id = public.current_user_congregation_id())
    OR (p_legacy_is AND NOT EXISTS (SELECT 1 FROM public.sirhelytemeto t
                                    WHERE t.id = p_temetoid AND t.congregation_id IS NOT NULL));
$vissza_temeto$;

CREATE OR REPLACE FUNCTION public.sirhely_hozzaferheto(
    p_sirhelyid integer, p_legacy_is boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $vissza_sirhely$
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (SELECT 1 FROM public.sirhely s
               JOIN public.sirhelytemeto t ON t.id = s.temetoid
               WHERE s.id = p_sirhelyid AND t.congregation_id IS NOT NULL
                 AND t.congregation_id = public.current_user_congregation_id())
    OR (p_legacy_is AND NOT EXISTS (SELECT 1 FROM public.sirhely s
                                    JOIN public.sirhelytemeto t ON t.id = s.temetoid
                                    WHERE s.id = p_sirhelyid AND t.congregation_id IS NOT NULL));
$vissza_sirhely$;

CREATE OR REPLACE FUNCTION public.kiadas_hozzaferheto(
    p_id_kiadas integer, p_legacy_is boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $vissza_kiadas$
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (SELECT 1 FROM public.kiadas k
               WHERE k.id = p_id_kiadas AND k.congregation_id IS NOT NULL
                 AND k.congregation_id = public.current_user_congregation_id())
    OR (p_legacy_is AND NOT EXISTS (SELECT 1 FROM public.kiadas k
                                    WHERE k.id = p_id_kiadas AND k.congregation_id IS NOT NULL));
$vissza_kiadas$;

-- 8/7. Az új segédfüggvények eldobása (már nem hivatkozik rájuk semmi)
DROP FUNCTION IF EXISTS public.felettes_szint_hozzaferese(uuid);
DROP FUNCTION IF EXISTS public.felettes_szint_szerkesztheto(uuid);
DROP FUNCTION IF EXISTS public.felettes_szint_gyulekezet_ids();
DROP FUNCTION IF EXISTS public.current_user_diocese_ids();
DROP FUNCTION IF EXISTS public.current_user_district_ids();
DROP FUNCTION IF EXISTS public.mm_moderator_e();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- 8/8. VISSZAÁLLÍTÁS-ELLENŐRZÉS — ÉLES SELECT (ez a pasztád UTOLSÓ eredménye)
SELECT
  (SELECT pg_get_functiondef(oid) LIKE '%''esperes''%' FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='current_user_has_global_access')
    AS global_access_visszaallt_VART_true,
  (SELECT count(*) FROM pg_policies
   WHERE (schemaname='public' AND (policyname LIKE '%\_szint\_%' OR policyname LIKE 'mm\_%\_mmmod\_%'))
      OR (schemaname='storage' AND policyname LIKE '%\_szint\_select'))
    AS maradt_uj_policy_VART_0,
  (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname IN ('current_user_diocese_ids','current_user_district_ids',
                     'felettes_szint_gyulekezet_ids','felettes_szint_hozzaferese',
                     'felettes_szint_szerkesztheto','mm_moderator_e'))
    AS maradt_uj_fuggveny_VART_0,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
     AND NOT tgisinternal AND tgname='profiles_jogosultsag_vedelem_trg')
    AS profiles_vedelem_MEGMARAD_VART_1;

-- 8/9. ⚠️ CSAK KIVÉTELES ESETBEN — a 2/A mellékút-zárak visszavonása.
--      NE FUTTASD, hacsak nem bizonyítottan ez töri el a profil-mentést!
--      A visszavonásuk azonnal újranyitja a jogosultság-eszkalációt.
--
-- DROP TRIGGER IF EXISTS profiles_jogosultsag_vedelem_trg ON public.profiles;
-- DROP FUNCTION IF EXISTS public.profiles_jogosultsag_vedelem();
-- DROP POLICY IF EXISTS profile_roles_admin_manage ON public.profile_roles;
-- CREATE POLICY profile_roles_admin_manage ON public.profile_roles
--   FOR ALL TO authenticated
--   USING      (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
--                       AND p.status='active' AND p.role IN ('admin','egyhazkeruleti_admin')))
--   WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
--                       AND p.status='active' AND p.role IN ('admin','egyhazkeruleti_admin')));



-- ════════════════════════════════════════════════════════════════════════════
-- MARADÉK KOCKÁZATOK — amit tudni kell, mielőtt elengeded
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) ⚠️ A BÖNGÉSZŐBEN / DESKTOPON MÁR LETÖLTÖTT IDEGEN ADAT OTT MARAD. Az
--    offline szinkron (Dexie / desktop SQLite) korábban RLS-szűrés nélkül
--    töltött le sorokat; a policy szigorítása CSAK az ÚJ letöltéseket érinti.
--    TEENDŐ külön körben: „helyi tár ürítése" lépés a szinkronban.
--
-- 2) ⚠️ ÁRVA SOROK. Az a családi karton, amelynek egyik tagja sem köthető
--    gyülekezethez, eddig MINDEN esperesnek látszott; mostantól csak
--    rendszergazdának. Ugyanez igaz a `congregations.diocese_id IS NULL`
--    gyülekezetek MINDEN adatára (0/C 312/313 méri).
--
-- 3) ⚠️ TIZENKÉT RPC (reserve_chitanta_numbers, reserve_iratszam,
--    tagnyilvantartas_csalad_mentes, tagnyilvantartas_tag_torles,
--    app_get_or_create_locality/_street, get_open_transfer_for_congregation,
--    recompute_voter_eligibility, sync_households_from_csalad, qr_session_close,
--    mm_save_segedanyag_atomic, find_potential_cross_congregation_match)
--    ugyanezeken a helpereken kapuzik, és KIVÉTELT DOB, nem üres listát ad.
--    Megyén KÍVÜLI gyülekezetre hívva látható hibaüzenetet kapnak.
--
-- 4) ⚠️ NÉHÁNY LEGACY/ADMIN TÁBLA a szűkítés után csak rendszergazdának marad
--    (a 0/E 503-as sora felsorolja őket).
--
-- 5) ⚠️ A RÉGI, 2026-08-09-es megyei policy-k (bealitas_select_diocese stb.) a
--    két lábat FELTÉTEL NÉLKÜL VAGY-olják, az itt bevezetett feloldók viszont
--    a skalárt CSAK fallbackként fogadják el. Egy elavult profiles.diocese_id
--    tehát a RÉGI policy-kon MÉG mindig ad hozzáférést. Harmonizálásuk külön kör.
--
-- 6) ⚠️ A `congregations` / `dioceses` / `districts` SELECT policy-ja továbbra
--    is `USING (true)` (a publikus /gy/[slug] oldalak miatt). A hierarchia-
--    táblákra tehát az RLS NEM véd; ott az app-rétegbeli level-scope.ts marad
--    az egyetlen védelem.
--
-- 7) ⚠️ A `csaladlatogatas` (lelkipásztori titok) mostantól megyei szinten
--    olvasható az esperesnek — SZŰKÍTÉS a mai országoshoz képest, de ha az
--    egyházi gyakorlat szerint az esperes ezt sem láthatja, a
--    `csaladlatogatas_szint_select` policy külön eldobható.
--
-- 8) ⚠️ AMIT EZ A FÁJL NEM JAVÍT (külön kör):
--    · a diocese_* pénzügyi táblák profile_roles ágain NINCS szerep-szűrő, így
--      egy megyei hatókörű `egyhazmegyei_szamvevo` teljes ÍRÁS-jogot kap a megye
--      pénzügyeire (2026-08-09-megye-kerulet-rls-fix.sql:233-237);
--    · a `dioceses-logos` storage policy minden egyházkerületi adminnak ad
--      írásjogot kerület-korlát NÉLKÜL (2026-04-18-dioceses-cimer-setup.sql:64-69);
--    · a `profile_roles_admin_manage` USING-ága továbbra is engedi, hogy egy
--      kerületi admin BÁRMELY ország-beli szerepkör-sort lásson és töröljön
--      (rendelkezésre-állási kockázat, nem szivárgás).
--
-- 9) ⚠️ A `profiles` TÁBLA NEM VISELKEDIK MAGÁTÓL HELYESEN (a fejléc korábbi
--    állítása téves volt). A `profil_lathato_e()` (10) tisztségviselői ága
--    (2026-08-10-nyitott-rls-policyk-takaritas.sql:1145-1156) MINDEN aktív
--    tisztségviselő (lelkesz/esperes/egyhazmegyei_admin/egyhazkeruleti_admin/
--    admin) nevét, e-mail-címét és telefonját ORSZÁGOSAN kiadja bármely aktív
--    munkatársnak (`current_user_is_active_staff()`); a (6) ág pedig a két
--    hatókör-lábat FELTÉTEL NÉLKÜL uniózza, tehát egy elavult
--    `profiles.diocese_id` skalár ott továbbra is nyit. EZT A
--    2026-08-11-profiles-szukites-rpc.sql ZÁRJA — a két fájlt EGYÜTT kell
--    módosítani (lásd annak :510-513 fejlécét).
--
-- 10) ⚠️ HÁROM KÜLÖNBÖZŐ HATÓKÖR-FELOLDÁS ÉL EGYSZERRE (harmonizáció külön kör):
--     · `current_user_diocese_ids()` — skalár csak fallback, szerep-szűrt
--       (esperes/egyhazmegyei_admin),
--     · `profil_lathato_e()` (6) ága — feltétel nélküli UNIÓ, és az
--       `egyhazmegyei_szamvevo` IS benne van,
--     · `resolveDioceseScopeIds()` (level-scope.ts:88-107) — szerep-szűrő NÉLKÜL,
--       az `activeProfileRole`-t feltétel nélkül elöl tolva.
--     Gyakorlati példa: egy `diocese`-hatókörű `egyhazmegyei_szamvevo` az app
--     szerint látja a megyei felületet, az új helperek szerint üres tömböt kap.
--     Ezt a 0/C 309-es sora NÉV SZERINT kimutatja a futtatás előtt.
--     Ugyanez a kerületi oldalon: `getAdminDistrictScope()` (admin-scope.ts:46-51)
--     UNIÓZ, `current_user_district_ids()` fallback-el → 0/C 306.
--
-- 11) ⚠️ MARADHAT NYITOTT (`USING (true)`) POLICY olyan táblán, amelynek NINCS
--     `congregation_id` uuid oszlopa — a 4/B szakasz ezeket nem tudja kezelni,
--     és a 0/F 603-as sora sorolja fel őket. AMÍG EZEK ÉLNEK, AZOKON A TÁBLÁKON
--     A SZŰKÍTÉS NEM ÉRVÉNYESÜL (a PERMISSIVE policy-k VAGY-olódnak).
--     A repó szerint ide tartozhat: felmentesx, penztar, csoporttagok,
--     befizetesbealitas, korzetfilter, gyulekezetek — de a produkció széthúz,
--     ezért a 0/F sweep a mérvadó, nem ez a felsorolás.
--
-- 12) ⚠️ TELJESÍTMÉNY. A `felettes_szint_hozzaferese()` SECURITY DEFINER, tehát
--     NEM inline-olható, és az RLS SORONKÉNT hívja. Az új törzs egyetlen
--     PK-keresést végez, de soronként még mindig lefuttatja a két hatókör-feloldót
--     (2 index-keresés a profile_roles-on és a profiles-on). Egy 8000 soros
--     esperesi listán ez nagyságrendileg 5×8000 extra index-keresés. Az
--     `authenticated` szerep statement_timeout-ja 8 MÁSODPERC — EZÉRT KÖTELEZŐ
--     a 6/E EXPLAIN (ANALYZE) mérés ÉLESÍTÉS ELŐTT. A ~50 additív policy a
--     tömbtagsági (InitPlan) alakot használja, ott lekérdezésenként EGY hívás van.
--
-- 13) ⚠️ RESTRICTIVE POLICY-K. Ahol van RESTRICTIVE policy (0/D 407), ott az
--     additív PERMISSIVE policy ÉS-elődik és hatástalan maradhat — a 6. szakasz
--     „✅ létrejött" jelzése ilyenkor HAMIS BIZTONSÁGÉRZET. Ezt CSAK a 7. szakasz
--     A/11-es (sírhely / leltár / megyei költségvetés) kézi próbája dönti el.
--
-- 14) ⚠️ AZ ERTESITESEK INSERT-POLICY (3h) MINIMÁLIS TÁGÍTÁS: mostantól bárki
--     beszúrhat értesítést BÁRMELY user_id-ra, ha a sor `congregation_id`-ja a
--     saját hatókörébe esik. Ez zaj-/bosszantás-felület, nem adatszivárgás;
--     cserébe helyreáll a megye→lelkész csatorna (és megjavul a lelkész→megye
--     beküldés-értesítő, ami MA IS némán bukik).
-- ════════════════════════════════════════════════════════════════════════════
