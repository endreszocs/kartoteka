-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ BIZTONSÁGI ÁLLAPOTFELMÉRÉS — a 2. pont adatbázis-oldali találatai        ║
-- ║ Fájl: migration-docs/sql/2026-08-24-biztonsagi-allapotfelmeres.sql       ║
-- ║ Terv: docs/ESZREVETELEK-TERV-2026-08-22.md — 2. pont                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ EZ A FÁJL SEMMIT NEM MÓDOSÍT
-- ════════════════════════════════════════════════════════════════════════════
--
-- Nincs benne `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `GRANT`,
-- `REVOKE`, és nincs `BEGIN`/`COMMIT` sem. Kizárólag `SELECT`-ek a rendszer-
-- katalógusból. Bármikor, bárhányszor futtatható, éles üzem közben is.
--
-- MIÉRT KELL — a projekt kétszer megélt szabálya:
--
--       „a migration-fájl NEM bizonyíték arra, hogy élesben lefutott."
--
-- A 2. pont kilenc adatbázis-oldali találata migrációs FÁJLOK olvasásából
-- született. Mielőtt bármelyik policy-hoz hozzányúlnánk, tudnunk kell, mi van
-- MA élesben. Két irányban is tévedhetnénk:
--
--   · ha egy kifogásolt policy élesben LÉTRE SEM JÖTT, akkor a „javítás" egy
--     nem létező dolgot módosítana — és a `DROP POLICY` némán elhasalna;
--   · ha viszont időközben SZIGORÍTOTTUK, akkor a javítás VISSZANYITNÁ.
--
-- ⚠️ KÜLÖN CSAPDA, amit ez a fájl elkerül: a constraintet és a policy-t SOHA
--    nem `pg_get_constraintdef LIKE '%oszlopnév%'` alapján keressük — a projekt
--    egyszer már eldobott így egy MÁSIK constraintet. Itt mindenütt névre és
--    oszlopra (`conkey`) szűrünk.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HOGYAN FUTTASD
-- ════════════════════════════════════════════════════════════════════════════
--
-- A Supabase SQL editorban, EGYESÉVEL, B1-től B13-ig. Minden lekérdezés
-- eredményét küldd vissza. A legvégén ott a döntési tábla.
--
-- A lekérdezések CÍMKÉZVE vannak (`talalat` oszlop), hogy a válaszban is
-- látszódjon, melyik találathoz tartoznak.
--
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B1 — admin_access_requests: hiányzó WITH CHECK                    MAGAS  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: az egyetlen policy `FOR ALL TO authenticated`, és a `WITH CHECK` ág
-- HIÁNYZIK. Postgresben ilyenkor az INSERT/UPDATE ellenőrzés a `USING`-ot
-- használja — vagyis az egyetlen feltétel `admin_user_id = auth.uid()`.
-- Bármely lelkész beszúrhat magának `status='approved'` sort TETSZŐLEGES
-- gyülekezetre.
--
-- AMIT NÉZNI KELL:
--   · van-e egyáltalán policy (ha nincs sor → a tábla RLS-e mindent tagad)
--   · `with_check_feltetel` = „‹NINCS›" → a találat ÉLESBEN IGAZ
--   · `muvelet` = ALL → egy policy fedi az írást és az olvasást is

SELECT
  'B1' AS talalat,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  roles::text                                 AS mely_szerepekre,
  COALESCE(qual,       '‹NINCS USING›')       AS using_feltetel,
  COALESCE(with_check, '‹NINCS›')             AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'admin_access_requests'
ORDER BY policyname;


-- B1/b — ÍRÁSI JOG. Ha az `authenticated` nem kap INSERT/UPDATE-et, a policy
-- hiánya nem is kihasználható. (A GRANT és az RLS EGYÜTT dönt.)

SELECT
  'B1/b' AS talalat,
  grantee                                                        AS szerep,
  string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'admin_access_requests'
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
GROUP BY grantee
ORDER BY grantee;


-- B1/c — VAN-E VÉDŐ TRIGGER? (a `status`/`expires_at` átírását megfoghatná)

SELECT
  'B1/c' AS talalat,
  t.tgname                                    AS trigger_neve,
  p.proname                                   AS fuggveny,
  CASE WHEN t.tgenabled = 'D' THEN 'KIKAPCSOLVA' ELSE 'aktív' END AS allapot
FROM pg_trigger t
JOIN pg_class c   ON c.oid = t.tgrelid
JOIN pg_proc  p   ON p.oid = t.tgfoid
WHERE c.relname = 'admin_access_requests' AND NOT t.tgisinternal;
-- ÜRES eredmény = nincs védő trigger (ez a várt, és ez a baj).


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B2 — SECURITY DEFINER RPC-k a fenti táblát fogadják bizonyítéknak MAGAS  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: négy RPC-család az `admin_access_requests`-ből vett EXISTS-re bízza
-- a hatókört — vagyis egy olyan táblára, amit a hívó maga írhat (lásd B1).
--
-- AMIT NÉZNI KELL: `security_definer` = true ÉS `olvassa_a_kerelmeket` = true
-- együtt = a találat élesben igaz. A `search_path_rogzitve` = false külön
-- gyengeség (a hívó befolyásolhatja, mit lát a függvény).

SELECT
  'B2' AS talalat,
  p.proname                                                            AS fuggveny,
  p.prosecdef                                                          AS security_definer,
  (pg_get_functiondef(p.oid) LIKE '%admin_access_requests%')           AS olvassa_a_kerelmeket,
  (COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path%') AS search_path_rogzitve
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'import_registry_batch',
    'generate_egyhazi_anyakonyvi_szam',
    'import_wizard_family_head'
  )
ORDER BY p.proname;


-- B2/b — TELJES SÖPRÉS: van-e MÁS SECURITY DEFINER függvény is, amelyik
-- ebből a táblából olvas? (A felmérés négy családot nevezett meg — lehet több.)

SELECT
  'B2/b' AS talalat,
  p.proname                                   AS fuggveny,
  p.prosecdef                                 AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND pg_get_functiondef(p.oid) LIKE '%admin_access_requests%'
ORDER BY p.proname;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B4 — a véglegesítés-zászló közvetlenül visszabillenthető          MAGAS  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: a `bealitas` táblán egyetlen, mindenre kiterjedő policy ül, ami csak
-- gyülekezet-tagságot néz; oszlop-korlátozás nincs, trigger nincs. Az
-- `accounting_finalized` / `budget_finalized` / `leltar_finalized` oszlop
-- viszont az EGÉSZ zár-rendszer egyetlen igazságforrása.

SELECT
  'B4' AS talalat,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  roles::text                                 AS mely_szerepekre,
  COALESCE(qual,       '‹NINCS USING›')       AS using_feltetel,
  COALESCE(with_check, '‹NINCS›')             AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bealitas'
ORDER BY policyname;


-- B4/b — OSZLOP-SZINTŰ ÍRÁSI JOG. Ha van oszlop-szintű GRANT, akkor a zászlók
-- talán már védettek. Ha csak TÁBLA-szintű UPDATE van, akkor nem.

SELECT
  'B4/b' AS talalat,
  'tábla-szintű' AS szint,
  privilege_type AS jog,
  '(minden oszlop)' AS oszlop
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'bealitas'
  AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
UNION ALL
SELECT
  'B4/b',
  'oszlop-szintű',
  privilege_type,
  column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'bealitas'
  AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
ORDER BY 2, 4;


-- B4/c — VÉDŐ TRIGGER a bealitas-on?

SELECT
  'B4/c' AS talalat,
  t.tgname AS trigger_neve,
  p.proname AS fuggveny,
  CASE WHEN t.tgenabled = 'D' THEN 'KIKAPCSOLVA' ELSE 'aktív' END AS allapot
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE c.relname = 'bealitas' AND NOT t.tgisinternal;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B5 + B7 — a congregations sorpolicy PUBLIC és minden oszlopot kiad KÖZEPES║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: a `congregations_select` policy `USING (true)`, és NINCS `TO`
-- záradéka — ezért a PUBLIC szerepre (tehát az `anon`-ra, vagyis bejelentkezés
-- NÉLKÜL is) érvényes. A tábla pedig IBAN-t, adószámot, e-mailt, telefont,
-- naptár-tokent is tartalmaz.
--
-- ⚠️ HIBA-JEL: `mely_szerepekre` = {public}  (nem {authenticated})

SELECT
  'B5+B7' AS talalat,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  roles::text                                 AS mely_szerepekre,
  COALESCE(qual, '‹NINCS USING›')             AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'congregations'
ORDER BY policyname;


-- B5/b — MIT LÁT AZ ANON ÉS AZ AUTHENTICATED? Tábla- vagy oszlop-szintű a jog?
-- ⚠️ HIBA-JEL: `anon` sor tábla-szintű SELECT-tel.

SELECT
  'B5/b' AS talalat,
  grantee                                     AS szerep,
  'tábla-szintű'                              AS szint,
  privilege_type                              AS jog,
  '(minden oszlop)'                           AS oszlop
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'congregations'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
UNION ALL
SELECT
  'B5/b',
  grantee,
  'oszlop-szintű',
  privilege_type,
  column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'congregations'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY 2, 3, 5;


-- B5/c — MELY ÉRZÉKENY OSZLOPOK LÉTEZNEK MA a táblán? (a javítás ezeket
-- szűkítené oszlop-szintű GRANT-tal)
-- ⚠️ A felmérés javaslata három NEM LÉTEZŐ oszlopot nevezett meg — ezért
--    kérdezzük meg a sémát, nem a tervet.

SELECT
  'B5/c' AS talalat,
  column_name AS oszlop,
  data_type   AS tipus
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'congregations'
  AND column_name IN (
    'iban','bank','adoszam','tva_kod','email','telefon','cim',
    'calendar_feed_token','pecset_url','alairas_url','cimer_url',
    'public_slug','status','nev_hu','nev_ro','name','diocese_id','varos','megye'
  )
ORDER BY column_name;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B6 — a logos Storage-policy kerület-vak                          KÖZEPES ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: az író/törlő policy-k első ága pusztán a SZEREPET nézi
-- (`role IN ('admin','egyhazkeruleti_admin')`), és a path-ból kiolvasott
-- gyülekezet-azonosítót NEM veti össze semmilyen hatókörrel.
--
-- ⚠️ HIBA-JEL: a `using_feltetel`-ben szerepel az `egyhazkeruleti_admin`, DE
--    NEM szerepel a `felettes_szint_szerkesztheto` vagy hasonló hatókör-hívás.

SELECT
  'B6' AS talalat,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  roles::text                                 AS mely_szerepekre,
  COALESCE(qual,       '‹NINCS USING›')       AS using_feltetel,
  COALESCE(with_check, '‹NINCS›')             AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual LIKE '%logos%' OR with_check LIKE '%logos%' OR policyname LIKE '%logo%')
ORDER BY policyname;


-- B6/b — PUBLIKUS-E A BUCKET? (a pecsét/aláírás/címer itt él)

SELECT
  'B6/b' AS talalat,
  id      AS bucket,
  public  AS publikus,
  CASE WHEN public THEN 'Az URL birtokában bárki letöltheti — rögzített, vállalt döntés (2026-08-15)'
       ELSE 'privát' END AS megjegyzes
FROM storage.buckets
WHERE id IN ('logos', 'iktato-csatolmanyok')
ORDER BY id;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B8 — az országos KÖZÖS számlatükör bárki által átírható          KÖZEPES ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: a `befizetescel` és a `kiadascel` MINDEN gyülekezet által osztott
-- számlatükör (nincs `congregation_id` oszlopuk), mégis
-- `FOR UPDATE TO authenticated USING (true) WITH CHECK (true)` policy ül rajtuk.
-- Egy cél átnevezésével/átszülősítésével a MÁR RÖGZÍTETT tételek némán más
-- rovatba csúsznak — az éves számadás minden száma megváltozik.
--
-- ⚠️ HIBA-JEL: `using_feltetel` vagy `with_check_feltetel` = 'true'

SELECT
  'B8' AS talalat,
  tablename                                   AS tabla,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  roles::text                                 AS mely_szerepekre,
  COALESCE(qual,       '‹NINCS USING›')       AS using_feltetel,
  COALESCE(with_check, '‹NINCS›')             AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('befizetescel', 'kiadascel', 'szamadasicel')
ORDER BY tablename, policyname;


-- B8/b — ÍRÁSI JOG a számlatükrön

SELECT
  'B8/b' AS talalat,
  table_name                                                       AS tabla,
  grantee                                                          AS szerep,
  string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('befizetescel', 'kiadascel', 'szamadasicel')
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B12 — a pénzügyi tételek NYERS DELETE-tel törölhetők              KÖZEPES ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: az `authenticated` DELETE jogot kapott a pénzügyi táblákra, és a
-- policy `FOR ALL`, tehát a DELETE-re is vonatkozik. A rendszer kanonikus
-- törlése ezzel szemben SOFT delete (Kuka + `deleted_at` + audit). A zárt-év
-- védelem `FOR UPDATE`, tehát valódi DELETE-re NEM fut.
-- Következmény: a sor FIZIKAILAG eltűnik — a Kukában sem jelenik meg, és mivel
-- nem szerver-akció futott, audit-bejegyzés sem keletkezik.
--
-- ⚠️ HIBA-JEL: a `jogok` oszlopban ott a DELETE.

SELECT
  'B12' AS talalat,
  table_name                                                       AS tabla,
  grantee                                                          AS szerep,
  string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('befizetes', 'kiadas', 'belsomozgas', 'oblio_szamlak')
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;


-- B12/b — VAN-E SZŰKÍTŐ (RESTRICTIVE) POLICY, ami a DELETE-et tiltja?
-- ⚠️ HIBA-JEL: nincs `permissive = 'RESTRICTIVE'` sor DELETE-re.

SELECT
  'B12/b' AS talalat,
  tablename                                   AS tabla,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  CASE WHEN permissive = 'PERMISSIVE' THEN 'megengedő' ELSE 'SZŰKÍTŐ' END AS tipus,
  COALESCE(qual, '‹NINCS USING›')             AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('befizetes', 'kiadas', 'belsomozgas', 'oblio_szamlak')
  AND cmd IN ('ALL', 'DELETE')
ORDER BY tablename, policyname;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B13 — a lelkész oszlop-korlát nélkül írhatja a profile_roles-t   ALACSONY ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ÁLLÍTÁS: a policy SZÁNDÉKA szűk („csak approve/reject"), a MEGVALÓSÍTÁSA
-- viszont `FOR UPDATE` a TELJES soron: a `role`, `profile_id`, `permissions`,
-- `active`, `granted_by`, `approved_by` oszlop szabadon átírható.
-- Összehasonlításul: a `profiles` táblán a 2026-07-17-es P0 migráció
-- oszlopról oszlopra REVOKE-olt, majd célzottan GRANT-olt — ott ez megvan.

SELECT
  'B13' AS talalat,
  policyname                                  AS policy_neve,
  cmd                                         AS muvelet,
  roles::text                                 AS mely_szerepekre,
  COALESCE(qual,       '‹NINCS USING›')       AS using_feltetel,
  COALESCE(with_check, '‹NINCS›')             AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profile_roles'
ORDER BY policyname;


-- B13/b — OSZLOP-SZINTŰ ÍRÁSI JOG a profile_roles-on ÉS a profiles-on
-- (a `profiles` a KÖVETENDŐ MINTA — ott már oszlop-szintű a GRANT)

SELECT
  'B13/b' AS talalat,
  table_name     AS tabla,
  'tábla-szintű' AS szint,
  privilege_type AS jog,
  '(minden oszlop)' AS oszlop
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('profile_roles', 'profiles')
  AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
UNION ALL
SELECT
  'B13/b',
  table_name,
  'oszlop-szintű',
  privilege_type,
  column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name IN ('profile_roles', 'profiles')
  AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
ORDER BY 2, 3, 5;


-- B13/c — VÉDŐ TRIGGER a profile_roles-on? (a profiles-on van egy
-- `profiles_jogosultsag_vedelem()` — ez a követendő minta)

SELECT
  'B13/c' AS talalat,
  c.relname AS tabla,
  t.tgname  AS trigger_neve,
  p.proname AS fuggveny,
  CASE WHEN t.tgenabled = 'D' THEN 'KIKAPCSOLVA' ELSE 'aktív' END AS allapot
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE c.relname IN ('profile_roles', 'profiles') AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ HOGYAN OLVASD AZ EREDMÉNYT — DÖNTÉSI TÁBLA                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Minden találatnál HÁROM kimenetel lehetséges:
--
--   ✅ MÁR RENDBEN  → a kifogásolt állapot élesben NEM áll fenn (időközben
--                     javítottuk, vagy a migráció le sem futott). NINCS TEENDŐ,
--                     és a „javítás" ilyenkor KÁRT okozna.
--   ⛔ MEGERŐSÍTVE  → a találat élesben igaz. Javítandó.
--   ❓ MÁS AZ ÁLLAPOT → se nem a leírt hiba, se nem a helyes állapot. Ilyenkor
--                     NE nyúljunk hozzá, amíg meg nem értjük.
--
-- ── B1 (MAGAS) ──────────────────────────────────────────────────────────────
--   ⛔ ha van `..._all` / `aar_...` policy `muvelet = ALL` ÉS
--      `with_check_feltetel = ‹NINCS›`, ÉS a B1/b szerint az `authenticated`
--      kap INSERT-et vagy UPDATE-et, ÉS a B1/c üres (nincs védő trigger).
--   ✅ ha van külön INSERT/UPDATE policy saját WITH CHECK-kel, vagy ha az
--      `authenticated` nem kap írási jogot a táblára.
--
-- ── B2 (MAGAS) ──────────────────────────────────────────────────────────────
--   ⛔ ha `security_definer = true` ÉS `olvassa_a_kerelmeket = true`.
--      A B1 javítása ezt CSAK részben oldja meg: attól még egy SECURITY DEFINER
--      függvény olyan táblát fogad el bizonyítéknak, amit a hívó szerepe írhat.
--      A B2 ezért ÖNÁLLÓ javítást igényel, akkor is, ha a B1 elkészül.
--   A B2/b megmutatja, van-e a négyen kívül MÁS is — ha igen, azt is javítani kell.
--
-- ── B4 (MAGAS) ──────────────────────────────────────────────────────────────
--   ⛔ ha a policy `muvelet = ALL`, ÉS a B4/b-ben CSAK „tábla-szintű" sor van
--      (nincs oszlop-szintű GRANT), ÉS a B4/c üres.
--   ✅ ha van oszlop-szintű UPDATE GRANT, ami NEM tartalmazza a `*_finalized`
--      oszlopokat, VAGY van aktív védő trigger.
--
-- ── B5 + B7 (KÖZEPES) ───────────────────────────────────────────────────────
--   ⛔⛔ SÚLYOSBÍTÓ: ha a `mely_szerepekre` = {public} ÉS a B5/b-ben az `anon`
--      tábla-szintű SELECT-et kap → az adat BEJELENTKEZÉS NÉLKÜL olvasható.
--   ⛔ ha a `mely_szerepekre` = {authenticated}, de tábla-szintű a GRANT →
--      minden bejelentkezett látja az összes gyülekezet IBAN-ját.
--   ✅ ha oszlop-szintű GRANT van, ami az érzékeny oszlopokat kihagyja.
--   ⚠️ A javításnál a B5/c listáját használd, NE a felmérés oszlopneveit — az
--      három nem létező oszlopot nevezett meg.
--
-- ── B6 (KÖZEPES) ────────────────────────────────────────────────────────────
--   ⛔ ha az író/törlő policy `using_feltetel`-jében ott az `egyhazkeruleti_admin`
--      szerep-vizsgálat, DE nincs mellette hatókör-hívás
--      (`felettes_szint_szerkesztheto` / `current_user_can_edit_congregation`).
--   Megjegyzés: a B6/b publikus bucketje ÖNMAGÁBAN nem ennek a találatnak a
--   része — az rögzített, vállalt döntés (2026-08-15).
--
-- ── B8 (KÖZEPES) ────────────────────────────────────────────────────────────
--   ⛔ ha bármelyik `_update` / `_write` policy `using_feltetel`-je vagy
--      `with_check_feltetel`-je egyszerűen `true`.
--   ⚠️ Ez a legkönnyebben kihasználható és a legnagyobb hatókörű a KÖZEPES
--      találatok közül: EGYETLEN kéréssel az ORSZÁG minden gyülekezetének
--      könyvelése megbolygatható. Ha megerősítve, ezt vedd előre.
--
-- ── B12 (KÖZEPES) ───────────────────────────────────────────────────────────
--   ⛔ ha a `jogok` között ott a DELETE, ÉS a B12/b-ben nincs SZŰKÍTŐ policy
--      DELETE-re.
--   ⚠️ A javítás (`REVOKE DELETE`) VISELKEDÉS-VÁLTOZÁS: ha valahol a kód ma
--      valódi DELETE-et használ, az elromlik. A javítás előtt végig kell nézni,
--      hol hív a kód `.delete()`-et ezekre a táblákra.
--
-- ── B13 (ALACSONY) ──────────────────────────────────────────────────────────
--   ⛔ ha a B13/b-ben a `profile_roles` sorában CSAK „tábla-szintű" UPDATE van,
--      ÉS a B13/c-ben nincs rajta védő trigger.
--   A `profiles` sorai a KÖVETENDŐ MINTÁT mutatják — ha ott oszlop-szintű a
--   GRANT és van trigger, akkor ugyanazt kell megismételni a profile_roles-on.
--
-- ════════════════════════════════════════════════════════════════════════════
-- Az eredményeket küldd vissza. Csak azokhoz a találatokhoz írok javító SQL-t,
-- amelyek MEGERŐSÍTVE jönnek vissza — a többihez hozzá sem nyúlunk.
-- ════════════════════════════════════════════════════════════════════════════
