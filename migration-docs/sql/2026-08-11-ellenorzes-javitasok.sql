-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — A HÁROM BUKOTT ELLENŐRZŐ SOR KIVIZSGÁLÁSA ÉS JAVÍTÁSA
-- Fájl:     migration-docs/sql/2026-08-11-ellenorzes-javitasok.sql
-- Dátum:    2026-08-11 (6. kör, utókör)
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható, IDEMPOTENS.
--
-- ─── MI VOLT A HÁROM ❌, ÉS MI LETT A VERDIKT ───────────────────────────────
--
--  ❶ 2026-08-11-visszaallitas.sql · 22. sor — „Mind SECURITY DEFINER" → 4 / 5
--     VERDIKT: NEM HIBA. AZ ELLENŐRZÉS TÉVEDETT.
--     Az ötből a `backup_restore_row_label(text, jsonb)` NEM SECURITY DEFINER —
--     és ez SZÁNDÉKOS. Az a függvény TISZTA SZÖVEGFORMÁZÓ: egy jsonb sorból
--     állít elő ember által olvasható címkét, `IMMUTABLE`, és EGYETLEN táblához
--     sem nyúl. Jogosultság-emelésre tehát semmi szüksége; ha megkapná, az
--     kizárólag támadási felület lenne (a legkisebb jogosultság elve).
--     A hívója (`backup_restore_diff`) MAGA SECURITY DEFINER, és egy
--     SECURITY INVOKER függvény a definer törzsében a definer jogaival fut —
--     tehát a működés hibátlan. A 23. és 24. sor (rögzített search_path,
--     `authenticated` nem hívhatja) egyébként is ✅ volt.
--     ⇒ EBBEN A FÁJLBAN NINCS ERRE SQL. A visszaallitas.sql 21./22. ellenőrző
--        sora lett átírva úgy, hogy az IGAZAT mérje (4 definer + 1 tudatosan
--        invoker).
--
--  ❷ 2026-08-11-cim-geokodolas.sql · 10. sor — „nincs UPDATE-grant" → true
--     VERDIKT: VALÓDI JOGOSULTSÁG-SODRÓDÁS. EZ A FÁJL JAVÍTJA.  ← EZ AZ EGYETLEN
--     A sor felirata és a várt érték látszólag ellentmondott egymásnak, ezért
--     előbb azt kellett kibogozni, MIT is mér. Amit mér:
--         has_table_privilege('authenticated', 'public.adrlocality', 'UPDATE')
--     vagyis „VAN-E írási jog" — amire a helyes válasz `false`. A felirat írta
--     le a KÍVÁNT ÁLLAPOTOT, az érték a MÉRTET; a kettő így egymás mellett
--     olvashatatlan volt. (A felirat javítva a forrásfájlban.)
--     Az élő állapot tehát: az `authenticated` szerepnek VAN UPDATE-grantja az
--     `adrlocality` táblán, holott EGYETLEN migrációs fájl sem adott neki ilyet
--     (a 2026-04-21-adr-grant-authenticated.sql CSAK SELECT-et ad). A jog a
--     Supabase alapértelmezett `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES
--     TO anon, authenticated` szabályából ragadt a táblán a létrehozáskor.
--
--     ⚠️ MEKKORA VOLT A TÉNYLEGES KÁR? NULLA — de ez nem érdem, hanem szerencse.
--        Az `adrlocality`/`adrstreet` táblán RLS van, és KIZÁRÓLAG SELECT-policy
--        létezik rájuk (2026-04-13-rls-reference-tables.sql). UPDATE-parancshoz
--        a Postgres UPDATE-policyt kér; ilyen nincs, tehát a közvetlen írás
--        eddig is 0 sort érintett. A GRANT az 1. réteg, az RLS a 2. — most a
--        2. réteg tartott EGYEDÜL. Ha valaki egyszer kiad egy `FOR ALL` vagy
--        `FOR UPDATE` policyt erre a törzsre (ami referenciatáblánál teljesen
--        hihető lépés), abban a pillanatban bármelyik bejelentkezett felhasználó
--        átírhatná az ORSZÁG bármelyik településsorát. Ezért zárjuk le most.
--
--     MI FÜGG A JOGTÓL? SEMMI. Az egész alkalmazásban NINCS közvetlen írás
--     ezekre a táblákra — végignéztük:
--       · apps/web/lib/address/actions.ts            → csak .select()
--       · apps/web/lib/import/lookup-resolver.ts     → csak .select()
--       · apps/web/app/(dashboard)/**/actions.ts     → csak .select()
--       · apps/desktop/src/lib/sync.ts               → csak .select() (katalógus-húzás)
--     Az írás HÁROM guardolt SECURITY DEFINER RPC-n megy, amelyek a TULAJDONOS
--     jogával futnak, tehát a hívó grantja nekik közömbös:
--       · public.app_get_or_create_locality(text)
--       · public.app_get_or_create_street(text, integer)
--       · public.app_set_address_geo(text, integer, numeric, numeric, text)
--     Mindhárom megmarad, mindhármat továbbra is hívhatja az `authenticated`.
--
--  ❸ 2026-08-11-import-registry-batch-orzet.sql · 05b. sor → false
--     VERDIKT: NEM HIBA. AZ ELLENŐRZÉS TÉVEDETT (fals pozitív).
--     A sor azt méri, hogy a `pg_get_functiondef()` szövegében ELŐFORDUL-E a
--     `current_user_can_access_congregation` sztring. Igen, előfordul — DE NEM
--     HÍVÁSKÉNT, hanem a törzsbe írt MAGYARÁZÓ KOMMENTBEN, abban a bekezdésben,
--     amelyik épp azt mondja ki, hogy „⛔ ITT SZÁNDÉKOSAN NEM ez áll".
--     A `pg_get_functiondef()` a törzset BETŰRE adja vissza, kommentestül —
--     tehát az ellenőrzés a saját dokumentációján bukott el.
--     A tényleges kapu változatlanul a SZŰK alak:
--         v_in_scope := COALESCE(p_target_congregation_id
--                                = public.current_user_congregation_id(), false)
--                       OR COALESCE(public.current_user_has_global_access(), false);
--     Ez BETŰRE a nyolc anyakönyvi tábla RLS-e (05. és 12c. sor ✅ volt).
--     Az esperes tehát MA SEM tud idegen gyülekezetbe importálni.
--     ⇒ EBBEN A FÁJLBAN NINCS ERRE SQL. Az orzet.sql 05b. sora lett átírva úgy,
--        hogy ELŐBB kivágja a `--` kommenteket, és csak utána keressen.
--
-- ─── MIT CSINÁL TEHÁT EZ A FÁJL ─────────────────────────────────────────────
--   EGYETLEN dolgot: elveszi az `adrcountry / adrcounty / adrlocality /
--   adrstreet / adrlocality_alias` országos címtörzs-táblákon az ÍRÁSI jogot a
--   PUBLIC, `anon` és `authenticated` szerepektől. A SELECT-et NEM BÁNTJA.
--   Adatot nem módosít, sémát nem dob el, függvényt nem cserél.
--
-- ─── AMIHEZ SZÁNDÉKOSAN NEM NYÚL ────────────────────────────────────────────
--   · Az `adr*_id_seq` sorozatokon lévő USAGE-grant (2026-04-21). INSERT-jog
--     nélkül tehetetlen (legfeljebb id-hézagot lehetne vele égetni), és nincs
--     olyan kódút, ami rászorulna. A záró ellenőrzés 20. sora KIÍRJA, hány ilyen
--     grant van — ha a tulajdonos ezt is le akarja zárni, az külön, tudatos
--     lépés legyen, ne ennek a fájlnak a mellékhatása.
--   · A `service_role` és a `postgres` jogai (a mentés/visszaállítás és az
--     éjszakai szinkron ezeken fut).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed)
-- A migration-fájl NEM bizonyíték arra, hogy lefutott élesben. Mielőtt jogot
-- veszünk el, az ÉLŐ törzsből nézzük meg, hogy megvan-e minden, amire a
-- címtörzs írásának EGYETLEN legitim útja épül. Ha az RPC-k hiányoznának, a
-- jog elvétele NÉMÁN elvágná a település/utca létrehozását — inkább álljunk meg.
-- ════════════════════════════════════════════════════════════════════════════
DO $szakasz0$
DECLARE
  v_hiany text[] := '{}';
  v_t     text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'public.adrcountry',
    'public.adrcounty',
    'public.adrlocality',
    'public.adrstreet',
    'public.adrlocality_alias'
  ] LOOP
    IF to_regclass(v_t) IS NULL THEN
      v_hiany := v_hiany || v_t;
    END IF;
  END LOOP;

  IF array_length(v_hiany, 1) > 0 THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: hiányzó címtörzs-tábla/-táblák: %. Ez a fájl csak jogot rendez, létrehozni nem tud.',
      array_to_string(v_hiany, ', ');
  END IF;

  -- A címtörzs írásának HÁROM legitim útja. Ha bármelyik hiányzik, az írási jog
  -- elvétele valódi funkciót törne el — akkor előbb a hiányzó RPC-t kell pótolni.
  IF to_regprocedure('public.app_get_or_create_locality(text)') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs app_get_or_create_locality(text). Előbb futtasd le a migration-docs/sql/2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql fájlt — enélkül a jog elvétele NÉMÁN elvágná a település-létrehozást a tag-mentésnél.';
  END IF;

  IF to_regprocedure('public.app_get_or_create_street(text,integer)') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs app_get_or_create_street(text, integer). Előbb: 2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql.';
  END IF;

  IF to_regprocedure('public.app_set_address_geo(text,integer,numeric,numeric,text)') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs app_set_address_geo(...). Előbb: 2026-08-11-cim-geokodolas.sql — az a fájl az egyetlen legitim útja a térkép-egyeztetés mentésének.';
  END IF;

  -- Az olvasásnak MEG KELL MARADNIA. Ha az `authenticated` ma nem is olvashatná
  -- a címtörzset, akkor valami MÁS baj van, és nem az írási jogot kell elvenni.
  IF NOT has_table_privilege('authenticated', 'public.adrlocality', 'SELECT') THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: az authenticated szerepnek MA SINCS SELECT-joga az adrlocality táblán. Ez külön hiba (a megye/település legördülő üres marad) — előbb futtasd le a 2026-04-21-adr-grant-authenticated.sql fájlt.';
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben — a címtörzs írásának mindhárom RPC-útja megvan, mehet a jog-szűkítés.';
END
$szakasz0$;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 1 — AZ ÍRÁSI JOG ELVÉTELE AZ ORSZÁGOS CÍMTÖRZSRŐL
-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-11: az `adr*` táblák KÖZÖS, ORSZÁGOS törzsadatok — egyetlen sor
-- átírása MINDEN gyülekezet minden tagjának a címét elmozdítja. Ezért itt a
-- Postgres 3 rétegéből MINDKETTŐNEK zárnia kell:
--     1. GRANT  — ezt rendezi ez a szakasz (eddig NEM zárt),
--     2. RLS    — ez eddig is zárt (csak SELECT-policy létezik),
--     3. App    — az írás guardolt SECURITY DEFINER RPC-ken megy.
--
-- A `REVOKE` felsorolásból SZÁNDÉKOSAN HIÁNYZIK a SELECT: az olvasás marad,
-- ahogy volt (megye/település/utca legördülők, import-párosítás, desktop
-- katalógus-húzás). Egy nem birtokolt jog visszavonása a Postgresben
-- eseménytelen — a fájl így akárhányszor újrafuttatható.
--
-- ⚠️ A PUBLIC-ot KÜLÖN kell felsorolni: a PUBLIC-tól való visszavonás NEM
--    érinti a szerepnek KÖZVETLENÜL adott jogot, és fordítva sem.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.adrcountry,
           public.adrcounty,
           public.adrlocality,
           public.adrstreet,
           public.adrlocality_alias
  FROM PUBLIC, anon, authenticated;

-- Az olvasás megerősítése. Nem „újra kiadás": ha már megvan, eseménytelen —
-- viszont ha a fenti REVOKE-ot valaha valaki `ALL`-ra bővítené, ez a sor
-- azonnal visszaadná a legördülők életét. Az `anon` SZÁNDÉKOSAN nem kap
-- SELECT-et: a regisztrációs oldal a `congregations_for_registration()`
-- RPC-n át olvas, nem a címtörzsről.
GRANT SELECT ON public.adrcountry        TO authenticated;
GRANT SELECT ON public.adrcounty         TO authenticated;
GRANT SELECT ON public.adrlocality       TO authenticated;
GRANT SELECT ON public.adrstreet         TO authenticated;
GRANT SELECT ON public.adrlocality_alias TO authenticated;

COMMENT ON TABLE public.adrlocality IS
  '2026-08-11: KÖZÖS, ORSZÁGOS címtörzs. Az authenticated szerepnek KIZÁRÓLAG SELECT-joga van rá; írni csak guardolt SECURITY DEFINER RPC-n lehet (app_get_or_create_locality, app_set_address_geo). Egy sor átírása minden gyülekezet minden ott lakó tagját érinti — ezért az írási jogot 2026-08-11-én visszavontuk (ellenorzes-javitasok.sql).';

COMMENT ON TABLE public.adrstreet IS
  '2026-08-11: KÖZÖS, ORSZÁGOS címtörzs. Az authenticated szerepnek KIZÁRÓLAG SELECT-joga van rá; írni csak guardolt SECURITY DEFINER RPC-n lehet (app_get_or_create_street, app_set_address_geo).';


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 2 — FAIL-CLOSED ZÁRÓ ŐRSZEM
-- Ha a visszavonás után MÉGIS maradt írási jog a PUBLIC / anon / authenticated
-- kezében, VISSZAGÖRGETÜNK. Félig lezárt jogosultsági állapotban nem hagyjuk
-- az adatbázist: az rosszabb, mint a mai ismert állapot, mert HAMIS BIZTONSÁGOT
-- ad — a következő ellenőrzés zöldre váltana anélkül, hogy zárna.
-- ════════════════════════════════════════════════════════════════════════════
DO $szakasz2$
DECLARE
  v_marad int;
  v_olvas int;
BEGIN
  SELECT count(*) INTO v_marad
  FROM (VALUES ('adrcountry'),('adrcounty'),('adrlocality'),('adrstreet'),('adrlocality_alias')) v(t)
  CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) w(p)
  CROSS JOIN (VALUES ('anon'),('authenticated')) r(g)
  WHERE has_table_privilege(r.g::text, 'public.' || v.t::text, w.p::text);

  IF v_marad > 0 THEN
    RAISE EXCEPTION
      '⛔ A visszavonás után MÉG % írási jog maradt az anon/authenticated kezében a címtörzsön — visszagörgetünk, semmi nem változott. Valószínű ok: a jogot egy MÁSIK szerepen át örökli (SELECT * FROM pg_auth_members). Jelezd a fejlesztőnek.',
      v_marad;
  END IF;

  -- És ami legalább ennyire fontos: az OLVASÁS nem sérülhetett.
  SELECT count(*) INTO v_olvas
  FROM (VALUES ('adrcountry'),('adrcounty'),('adrlocality'),('adrstreet'),('adrlocality_alias')) v(t)
  WHERE has_table_privilege('authenticated', 'public.' || v.t::text, 'SELECT');

  IF v_olvas <> 5 THEN
    RAISE EXCEPTION
      '⛔ A visszavonás után az authenticated már csak % címtörzs-táblát olvashat az 5-ből — visszagörgetünk. A legördülők üresen maradtak volna.',
      v_olvas;
  END IF;

  RAISE NOTICE '2026-08-11: a címtörzs írási joga lezárva (PUBLIC/anon/authenticated), az olvasás mind az 5 táblán megmaradt.';
END
$szakasz2$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === VISSZAVONÁS (ROLLBACK) — CSAK HA VISSZA KELL CSINÁLNI ===
--
-- ⚠️ ELŐBB OLVASD EL: az alábbi visszaállítás VISSZAADJA az országos címtörzs
--    írási jogát MINDEN bejelentkezett felhasználónak. Ez NEM „az eredeti
--    állapot helyreállítása" — ez a hiba visszaállítása. A jogot egyetlen
--    migrációs fájl sem adta ki tudatosan; a Supabase alapértelmezett
--    `GRANT ALL ON TABLES` szabályából ragadt a táblákon.
--
--    HA A JOG ELVÉTELE UTÁN VALAMI ELTÖRT, szinte biztosan NEM ez a megoldás:
--    a hibás kódútnak a három RPC valamelyikét kell hívnia
--    (app_get_or_create_locality / app_get_or_create_street /
--     app_set_address_geo), nem közvetlenül írnia a táblát. A helyes javítás a
--    hívóhely átírása. Ez a blokk csak akkor kell, ha ÉLES ÜZEM ÁLL, és időt
--    kell nyerni.
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   GRANT INSERT, UPDATE, DELETE ON public.adrcountry        TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.adrcounty         TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.adrlocality       TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.adrstreet         TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.adrlocality_alias TO authenticated;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — EGYETLEN SELECT ===
-- A Supabase SQL Editor CSAK AZ UTOLSÓ eredményt mutatja. Ez a projektnek eddig
-- HÁROM elveszett választásába került, ezért minden ellenőrzés EGYBEN van.
--
-- HOGYAN OLVASD: `ertek` vs `vart`. „✅" = rendben. Bármelyik „❌" → küldd vissza.
-- A 10–14. sorok NEM ehhez a fájlhoz tartoznak: azt bizonyítják, hogy az ❶ és a
-- ❸ tétel valóban RENDBEN VAN (nem javítást igényelt, hanem jobb ellenőrzést).
-- ════════════════════════════════════════════════════════════════════════════
SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (

  -- ══ ❷ A CÍMTÖRZS JOGOSULTSÁGAI ═══════════════════════════════════════════

  SELECT 1 AS sorrend,
         'adrlocality — az authenticated MAR NEM irhat (INS/UPD/DEL)'::text AS mit_mer,
         (has_table_privilege('authenticated','public.adrlocality','INSERT')
          OR has_table_privilege('authenticated','public.adrlocality','UPDATE')
          OR has_table_privilege('authenticated','public.adrlocality','DELETE'))::text AS ertek,
         'false'::text AS vart

  UNION ALL SELECT 2, 'adrstreet — az authenticated MAR NEM irhat (INS/UPD/DEL)',
         (has_table_privilege('authenticated','public.adrstreet','INSERT')
          OR has_table_privilege('authenticated','public.adrstreet','UPDATE')
          OR has_table_privilege('authenticated','public.adrstreet','DELETE'))::text, 'false'

  -- Mind az 5 tabla × 4 iro-jog × 2 szerep = 40 lehetoseg; 0 kell.
  UNION ALL SELECT 3, 'MEGMARADT iro-jogok szama az 5 adr-tablan (anon+authenticated)',
         (SELECT count(*)::text
            FROM (VALUES ('adrcountry'),('adrcounty'),('adrlocality'),
                         ('adrstreet'),('adrlocality_alias')) v(t)
            CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) w(p)
            CROSS JOIN (VALUES ('anon'),('authenticated')) r(g)
           WHERE has_table_privilege(r.g::text, 'public.' || v.t::text, w.p::text)), '0'

  -- A PUBLIC nem valodi szerep, ezert a has_table_privilege() nem hasznalhato ra
  -- ('role "public" does not exist'). Az ACL-t bontjuk szet: grantee = 0 a PUBLIC.
  UNION ALL SELECT 4, 'A PUBLIC-nak sincs iro-joga egyetlen adr-tablan sem',
         (SELECT count(*)::text
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
           WHERE n.nspname = 'public'
             AND c.relname IN ('adrcountry','adrcounty','adrlocality',
                               'adrstreet','adrlocality_alias')
             AND a.grantee = 0
             AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')), '0'

  -- ⚠️ EZ A LEGFONTOSABB REGRESSZIO-SOR. Ha ez nem 5, a megye/telepules/utca
  --    legordulok URESEN maradnak az egesz alkalmazasban.
  UNION ALL SELECT 5, '⚠️ Az OLVASAS megmaradt: authenticated SELECT mind az 5 adr-tablan',
         (SELECT count(*)::text
            FROM (VALUES ('adrcountry'),('adrcounty'),('adrlocality'),
                         ('adrstreet'),('adrlocality_alias')) v(t)
           WHERE has_table_privilege('authenticated','public.' || v.t::text,'SELECT')), '5'

  -- ══ A MASODIK RETEG (ez tartott eddig EGYEDUL) ═══════════════════════════

  UNION ALL SELECT 6, 'RLS bekapcsolva az adrlocality + adrstreet tablan (2)',
         (SELECT count(*)::text FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname='public' AND c.relrowsecurity
             AND c.relname IN ('adrlocality','adrstreet')), '2'

  -- Ha ez valaha nem 0, azonnal kell a fenti GRANT-zar: egy FOR ALL / FOR UPDATE
  -- policy + iro-grant egyutt = barki atirhatja az orszagos cimtorzset.
  UNION ALL SELECT 7, 'NEM-SELECT policy az adrlocality/adrstreet tablan (0 kell)',
         (SELECT count(*)::text FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('adrlocality','adrstreet')
             AND cmd <> 'SELECT'), '0'

  -- ══ A HAROM LEGITIM IRASI UT — ERINTETLENUL KELL MARADNIA ════════════════

  UNION ALL SELECT 8, 'A 3 guardolt cimtorzs-RPC letezik (locality / street / geo)',
         ((to_regprocedure('public.app_get_or_create_locality(text)') IS NOT NULL)
          AND (to_regprocedure('public.app_get_or_create_street(text,integer)') IS NOT NULL)
          AND (to_regprocedure('public.app_set_address_geo(text,integer,numeric,numeric,text)') IS NOT NULL))::text,
         'true'

  UNION ALL SELECT 9, 'Mind a 3 RPC SECURITY DEFINER, es az authenticated hivhatja',
         (SELECT COALESCE(bool_and(p.prosecdef
                    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('app_get_or_create_locality','app_get_or_create_street',
                               'app_set_address_geo')), 'true'

  -- ══ ❶ A VISSZAALLITAS-RPC-K — AZ IGAZAT MERVE ════════════════════════════
  -- A 22. sor 4/5-ot adott, mert 5-ot vart. Helyesen 4 SECURITY DEFINER + 1
  -- tudatosan SECURITY INVOKER (a tiszta szovegformazo cimke-fuggveny).

  UNION ALL SELECT 10, '[❶] backup_restore_row_label SZANDEKOSAN NEM SECURITY DEFINER',
         COALESCE((SELECT (NOT p.prosecdef)::text
                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname='public' AND p.proname='backup_restore_row_label'
                    LIMIT 1), 'nincs fv'), 'true'

  UNION ALL SELECT 11, '[❶] A masik NEGY visszaallitas-RPC MIND SECURITY DEFINER (4)',
         (SELECT count(DISTINCT p.proname)::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.prosecdef
             AND p.proname IN ('backup_restore_live_fingerprint','backup_restore_diff',
                               'backup_restore_stage','backup_restore_apply')), '4'

  UNION ALL SELECT 12, '[❶] A cimke-fuggveny sem tablat, sem auth-ot nem erint (IMMUTABLE)',
         COALESCE((SELECT (p.provolatile = 'i')::text
                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname='public' AND p.proname='backup_restore_row_label'
                    LIMIT 1), 'nincs fv'), 'true'

  -- ══ ❸ AZ IMPORT-RPC HATOKORE — A KOMMENTEK KIVAGASA UTAN ═════════════════
  -- A `pg_get_functiondef()` a torzset kommentestul adja vissza, ezert az
  -- eredeti 05b. sor a SAJAT MAGYARAZO KOMMENTJEN bukott el. Itt eloszor
  -- kivagjuk a `--` sorvegi kommenteket, es csak utana keresunk.

  UNION ALL SELECT 13, '[❸] import_registry_batch — a TAGABB segéd NEM HIVODIK (komment nelkul)',
         (SELECT COALESCE(bool_and(
                   regexp_replace(pg_get_functiondef(p.oid),
                                  '--[^' || chr(10) || ']*', '', 'g')
                   NOT LIKE '%current_user_can_access_congregation%'), false)::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname='import_registry_batch'), 'true'

  UNION ALL SELECT 14, '[❸] …es a SZUK, sajat-gyulekezet kapu ott van (komment nelkul)',
         (SELECT COALESCE(bool_and(
                   regexp_replace(pg_get_functiondef(p.oid),
                                  '--[^' || chr(10) || ']*', '', 'g')
                   LIKE '%current_user_congregation_id%'), false)::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname='import_registry_batch'), 'true'

  -- A magyarazat maga: a sztring OTT VAN a nyers definicioban, de CSAK kommentben.
  UNION ALL SELECT 15, '[❸] A tagabb segéd emlitese KIZAROLAG kommentben szerepel',
         (SELECT COALESCE(bool_and(
                   pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'
                   AND regexp_replace(pg_get_functiondef(p.oid),
                                      '--[^' || chr(10) || ']*', '', 'g')
                       NOT LIKE '%current_user_can_access_congregation%'), false)::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname='import_registry_batch'), 'true'

  UNION ALL SELECT 16, '[❸] A nyolc anyakonyvi tabla RLS-e valtozatlanul a VART alaku (8)',
         (SELECT count(*)::text FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes',
                               'bekoltozott','elkoltozott','attert','kitert')
             AND qual LIKE '%current_user_congregation_id%'
             AND qual LIKE '%current_user_has_global_access%'), '8'

  -- ══ TAJEKOZTATO (nincs „helyes" ertek — mindig ✅, csak kiirja) ═══════════

  -- A `has_sequence_privilege()` HIBAT dob nem letezo sorozatra, ezert az ACL-t
  -- bontjuk szet a katalogusbol — igy hianyzo sorozatnal is csendben 0-t ad.
  UNION ALL SELECT 20, 'TAJEKOZTATO — adr-sorozatokon maradt USAGE/UPDATE grant (INSERT nelkul tehetetlen)',
         (SELECT count(*)::text
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
            LEFT JOIN pg_roles ro ON ro.oid = a.grantee
           WHERE n.nspname='public' AND c.relkind='S'
             AND c.relname IN ('adrcountry_id_seq','adrcounty_id_seq',
                               'adrlocality_id_seq','adrstreet_id_seq')
             AND a.privilege_type IN ('USAGE','UPDATE')
             AND (a.grantee = 0 OR ro.rolname IN ('anon','authenticated'))),
         (SELECT count(*)::text
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
            LEFT JOIN pg_roles ro ON ro.oid = a.grantee
           WHERE n.nspname='public' AND c.relkind='S'
             AND c.relname IN ('adrcountry_id_seq','adrcounty_id_seq',
                               'adrlocality_id_seq','adrstreet_id_seq')
             AND a.privilege_type IN ('USAGE','UPDATE')
             AND (a.grantee = 0 OR ro.rolname IN ('anon','authenticated')))

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- FÜST-TESZT (a futtatás után, az alkalmazásban)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. TAGNYILVÁNTARTÁS → egy tag szerkesztése → a MEGYE, TELEPÜLÉS és UTCA
--    legördülő töltődjön be és legyen kereshető. (Ez az 5. ellenőrző sor élő
--    próbája: ha itt üres a lista, azonnal futtasd a fenti visszavonást.)
-- 2. Ugyanott: írj be egy MÉG NEM LÉTEZŐ települést/utcát, és mentsd a tagot.
--    VÁRT: létrejön, a tag elmentődik. (Ez az `app_get_or_create_*` útja —
--    ez bizonyítja, hogy az írás a jog elvétele UTÁN is működik.)
-- 3. SZEMÉLYI KARTON → „Cím egyeztetése" → „Egyeztetés mentése".
--    VÁRT: a sáv zöldre vált. (Ez az `app_set_address_geo` útja.)
-- 4. IMPORT KÖZPONT / ANYAKÖNYV → Rendszergazdai importáló, SAJÁT gyülekezetbe,
--    3-5 soros munkafüzettel. VÁRT: „N sor rögzítve". (Az ❸ tétel élő próbája:
--    a hatókör-kapu változatlan, tehát ennek működnie kell.)
-- 5. Ha bármelyik lépés „permission denied for table adr…" hibát ad: az a
--    hívóhely KÖZVETLENÜL ír a címtörzsre. Küldd vissza a hibaüzenetet — a
--    javítás az RPC-re való átállás, NEM a jog visszaadása.
