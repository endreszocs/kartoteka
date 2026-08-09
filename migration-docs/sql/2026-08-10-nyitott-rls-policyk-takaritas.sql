-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — A NYITOTT (`USING (true)`) RLS-POLICY-K TAKARÍTÁSA
-- Dátum: 2026-08-10   ·   Futtatja: Endre (Supabase Studio → SQL Editor)
-- Előzmény: 2026-08-10-nyitott-bealitas-policy-eltavolitas.sql (bealitas),
--           2026-08-10-scope-utoellenorzes-es-javitas.sql 3b. szakasza
--           („van-e MÁS táblán is hasonlóan nyitott policy?") — ez a fájl
--           az arra kapott ÉLES lista feldolgozása.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MI A BAJ — magyarul, kertelés nélkül
-- ────────────────────────────────────────────────────────────────────────────
-- Az élő adatbázisban több olyan RLS-policy maradt a 2026-04-13-as, korai
-- „kapcsoljuk be az RLS-t mindenhol" hullámból, amelynek a feltétele
-- szó szerint `true`. Ez azt jelenti, hogy AZ ADOTT TÁBLÁN NINCS SEMMILYEN
-- KORLÁTOZÁS: bármelyik bejelentkezett felhasználó — bármelyik gyülekezet
-- lelkésze — kiolvashatja (és FOR ALL policy esetén ÍRHATJA is) MINDEN
-- gyülekezet adatát.
--
-- ARANYSZABÁLY (ezt érdemes megjegyezni):
--   Egy gyülekezeti (congregation-scoped) táblán a `USING (true)` policy
--   TELJES KÖRŰ SZIVÁRGÁS. Nem „lazaság", nem „ideiglenes megoldás":
--   a PERMISSIVE policy-k VAGY-kapcsolatban állnak, ezért EGYETLEN nyitott
--   policy HATÁSTALANÍTJA az összes mellette lévő, gondosan szűkített
--   policy-t. A `szemely_staff_select` hiába szűr gyülekezetre, ha mellette
--   ott van egy `USING (true)` — a felhasználó a kettő UNIÓJÁT látja.
--
-- A LEGSÚLYOSABB TÉTEL: a `szemely` tábla — a teljes tagnyilvántartás
-- (név, CNP/személyi szám, cím, telefon, születési adat, GDPR-mezők).
-- Három nyitott policy is ül rajta, kettő közülük `public` szerepkörre.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MEGJEGYZÉS A `public` SZEREPKÖRŰ POLICY-KRŐL (fontos árnyalat)
-- ────────────────────────────────────────────────────────────────────────────
-- A `szemely` két SELECT policy-ja („Enable read access for all",
-- „Enable read access for all users") a `public` PostgreSQL-szerepre szól.
-- A `public` szerep MINDEN szerepet magába foglal — tehát az `anon`-t
-- (bejelentkezetlen látogató) is. Hogy egy bejelentkezetlen látogató
-- TÉNYLEGESEN olvashat-e, az azon múlik, van-e az `anon` szerepnek
-- TÁBLA-SZINTŰ GRANT-je a szemely-en. Ezt a 2026-04-17-es
-- `anon-revoke-grant-szigoritas.sql` elvette (`REVOKE ALL ON public.szemely
-- FROM anon`), DE ezt a 0. szakasz GRANT-lekérdezésével BIZONYÍTANI kell,
-- nem feltételezni. Az RLS-policy önmagában nem ad hozzáférést, csak a
-- GRANT-tal EGYÜTT — viszont a bejelentkezett (`authenticated`) felhasználó
-- felé a szivárgás a GRANT-tól függetlenül FENNÁLL, mert `authenticated`
-- is tagja a `public`-nak, és neki VAN GRANT-je.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIT CSINÁL EZ A FÁJL
-- ────────────────────────────────────────────────────────────────────────────
--   0. szakasz  — CSAK OLVAS. Ezt futtasd ELŐSZÖR, és nézd meg az eredményt.
--   1–8. szakasz — egyetlen BEGIN/COMMIT tranzakció:
--        · fail-closed őrszem (ha a szűkített policy hiányzik → MEGÁLL),
--        · a nyitott policy-k törlése,
--        · ahol nincs szűkített policy: SECURITY DEFINER segédfüggvény +
--          új, gyülekezet-hatókörű policy,
--        · végül a nevekben lévő ékezetek elgépelése ellen egy záró,
--          dinamikus biztonsági háló (csak a felsorolt táblákon).
--   9. szakasz  — ellenőrző lekérdezések + magyar füst-teszt lista.
--
-- ELVEK (a projekt eddigi migrációival azonosan):
--   · Idempotens: DROP ... IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS.
--   · Egy tranzakció (P2-12), a végén `NOTIFY pgrst, 'reload schema'`.
--   · Az új policy-k byte-hűen a testvér-táblák mintáját követik:
--       - gyülekezeti oszlop van  → `public.current_user_can_access_congregation(...)`
--         (minta: 2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql:99-121, felmentes_*)
--       - gyülekezeti oszlop NINCS → SECURITY DEFINER feloldó segédfüggvény
--         (minta: 2026-04-12-phase-0-rls-hardening.sql:193-213,
--          `csalad_resolves_to_accessible_cong`)
--   · SECURITY DEFINER + `SET search_path = public, pg_temp`
--     (2026-05-17-security-definer-search-path-pin.sql konvenció).
--
-- ⚠️ AMIT EZ A FÁJL SZÁNDÉKOSAN NEM CSINÁL
--   · Nem nyúl a `current_user_has_global_access()` függvényhez — az a
--     member-portal P0 migráció (2026-07-17-member-portal-p0-auth-isolation.sql)
--     tulajdona. Amíg az nem futott, az `esperes` / `egyhazmegyei_admin`
--     szerep ORSZÁGOS hozzáférése megmarad (dokumentált, ismert tétel).
--   · Nem nyúl a `mm_*` (Missziós Műhely) közösségi tábláihoz, a cím-
--     referencia tábláihoz (adr*, nevnap, nom_cimlet), és az
--     `access_requests` anon INSERT policy-jához — ezek SZÁNDÉKOSAN
--     megosztottak/publikusak.
--   · Nem módosít alkalmazás-kódot.
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ELLENŐRZÉS (CSAK OLVAS)                                     ║
-- ║ Futtasd ELŐSZÖR, külön. Az 1–8. szakaszt csak az eredmény ismeretében!    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 0a. Az ÉRINTETT táblák TELJES policy-listája — így pontosan látszik, mi tűnik
--     el és mi marad. A `policyname_hex` oszlop az ékezetes/szóközös nevek
--     byte-pontos azonosításához kell (ha egy DROP nem talál, ez árulja el).
SELECT tablename,
       policyname,
       encode(convert_to(policyname, 'UTF8'), 'hex')       AS policyname_hex,
       cmd,
       permissive,
       roles::text,
       COALESCE(qual,       '(nincs USING — INSERT-nél NORMÁLIS)')  AS using_feltetel,
       COALESCE(with_check, '(nincs WITH CHECK)')                   AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'szemely', 'leltar_tetelek', 'csaladlatogatas', 'monetar',
    'sirhely', 'sirhelyberles', 'sirhelyelhunyt', 'sirhelytemeto',
    'kiadasikiseroiv', 'kiadas', 'profiles', 'event'
  )
ORDER BY tablename, policyname;

-- 0b. TÁBLA-SZINTŰ GRANT-ok az `anon` és `authenticated` szerepre.
--     ⚠️ EZ DÖNTI EL, hogy a `szemely` „public" SELECT policy-ja elér-e
--     bejelentkezetlen látogatót is. Ha az `anon` sorban megjelenik a
--     `szemely` SELECT-tel → AZONNALI, KRITIKUS SZIVÁRGÁS (akkor a mostani
--     törlés önmagában kevés, a GRANT-ot is vissza kell vonni — lásd 0b/2).
SELECT table_name,
       grantee,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  AND table_name IN (
    'szemely', 'leltar_tetelek', 'csaladlatogatas', 'monetar',
    'sirhely', 'sirhelyberles', 'sirhelyelhunyt', 'sirhelytemeto',
    'kiadasikiseroiv', 'kiadas', 'profiles', 'event'
  )
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
-- VÁRT: `anon` egyetlen sorban SEM szerepel. `authenticated` a szokásos
--       SELECT/INSERT/UPDATE/DELETE (a profiles-on csak SELECT + oszlop-UPDATE).

-- 0b/2. Ha a 0b-ben az `anon` MÉGIS megjelent a szemely-en, ezt futtasd
--       AZONNAL (külön, a többitől függetlenül — ez önmagában biztonságos):
-- REVOKE ALL ON public.szemely FROM anon;

-- 0c. FAIL-CLOSED ELŐFELTÉTEL: léteznek-e a szűkített policy-k, amelyekre
--     a törlés után támaszkodunk? Az 1–8. szakasz ezt tranzakción belül is
--     ellenőrzi és MEGÁLL, ha hiányzik — itt előre látod.
SELECT x.tabla,
       x.policy,
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies
              WHERE schemaname = 'public'
                AND tablename = x.tabla AND policyname = x.policy
            ) THEN '✅ megvan' ELSE '⛔ HIÁNYZIK — NE FUTTASD A TÖRLÉST' END AS allapot
FROM (VALUES
        ('szemely',         'szemely_staff_select'),
        ('szemely',         'szemely_staff_insert'),
        ('szemely',         'szemely_staff_update'),
        ('szemely',         'szemely_staff_delete'),
        ('leltar_tetelek',  'leltar_tetelek_access'),
        ('csaladlatogatas', 'csaladlatogatas_access'),
        ('sirhelytemeto',   'sirhelytemeto_access'),
        ('kiadas',          'kiadas_access')
     ) AS x(tabla, policy)
ORDER BY x.tabla, x.policy;

-- 0d. ⚠️ A LEGFONTOSABB ELŐFELTÉTEL a `profiles` szakaszhoz.
--     A profiles-ra készülő policy SECURITY DEFINER segédfüggvényt hív,
--     amely maga is a profiles-ból olvas. Ez CSAK akkor nem fut végtelen
--     rekurzióba (42P17), ha a függvény tulajdonosa megkerüli az RLS-t.
--     VÁRT: `postgres` sorában rolbypassrls = true.
--     Ha FALSE → a 8. szakaszt NE futtasd, küldd vissza az eredményt!
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('postgres', 'authenticated', 'anon', 'service_role', 'supabase_admin')
ORDER BY rolname;

-- 0e. A `profiles` jelenlegi policy-alapállapota (a 2026-07-17-es élő export
--     szerint pontosan három sor volt: profiles_insert / profiles_read /
--     profiles_write — lásd 2026-07-17-member-portal-p0-auth-isolation.sql:625-661).
--     Ha ettől eltér, a 8. szakasz ELŐTT egyeztessünk.
SELECT policyname, cmd, roles::text,
       COALESCE(qual, '(nincs USING)') AS using_feltetel,
       COALESCE(with_check, '(nincs CHECK)') AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 0f. TENANT-LEFEDETTSÉG — mennyi „árva" (gyülekezethez nem köthető) sor van?
--     Ezek a sorok a szigorítás után KIESNÉNEK a listákból, ezért a policy-k
--     legacy-toleráns ágat kapnak; a számok megmutatják, kell-e egyáltalán.
SELECT 'sirhelytemeto: congregation_id IS NULL' AS mit_mer, count(*) AS db
  FROM public.sirhelytemeto WHERE congregation_id IS NULL
UNION ALL
SELECT 'sirhely: nincs feloldható temető',       count(*)
  FROM public.sirhely s
  WHERE NOT EXISTS (SELECT 1 FROM public.sirhelytemeto t
                    WHERE t.id = s.temetoid AND t.congregation_id IS NOT NULL)
UNION ALL
SELECT 'sirhelyberles: nincs feloldható sírhely', count(*)
  FROM public.sirhelyberles b
  WHERE NOT EXISTS (SELECT 1 FROM public.sirhely s
                    JOIN public.sirhelytemeto t ON t.id = s.temetoid
                    WHERE s.id = b.sirhelyid AND t.congregation_id IS NOT NULL)
UNION ALL
SELECT 'sirhelyelhunyt: nincs feloldható sírhely', count(*)
  FROM public.sirhelyelhunyt e
  WHERE NOT EXISTS (SELECT 1 FROM public.sirhely s
                    JOIN public.sirhelytemeto t ON t.id = s.temetoid
                    WHERE s.id = e.sirhelyid AND t.congregation_id IS NOT NULL)
UNION ALL
SELECT 'kiadasikiseroiv: nincs feloldható kiadás', count(*)
  FROM public.kiadasikiseroiv k
  WHERE NOT EXISTS (SELECT 1 FROM public.kiadas ki
                    WHERE ki.id = k.id_kiadas AND ki.congregation_id IS NOT NULL);

-- 0g. MONETAR — a `sourceid` konvenció ellenőrzése.
--     Az app (web: apps/web/app/(dashboard)/penzugy/monetary-actions.ts:36-38,
--     82-83, 182-183, 192-195; desktop: apps/desktop/src/components/
--     desktop-monetary-tab.tsx:69, 79-80, 145-146, 154-155) KIZÁRÓLAG így ír
--     és olvas:  source = 'congregation_cash_check'
--                sourceid = '<congregation uuid>:<év>'
--     VÁRT: a 'congregation_cash_check' soroknál `uuid_elotag_ervenyes = true`.
SELECT COALESCE(source, '(NULL)') AS source,
       count(*) AS db,
       bool_and(
         source = 'congregation_cash_check'
         AND split_part(sourceid, ':', 1) ~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ) AS uuid_elotag_ervenyes
FROM public.monetar
GROUP BY 1
ORDER BY 1;

-- 0h. EVENT — mi van benne egyáltalán? (oszlopai: type, val, created;
--     NINCS congregation_id, és a teljes kódbázisban EGYETLEN lekérdezés
--     sem hivatkozik rá — lásd a 7. szakasz indoklását.)
SELECT COALESCE(type, '(NULL)') AS type, count(*) AS db,
       min(created) AS legregebbi, max(created) AS legujabb
FROM public.event
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1–8. SZAKASZ — A JAVÍTÁS (EGY TRANZAKCIÓ)                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. FAIL-CLOSED ŐRSZEM — a törlés előtt bizonyítjuk, hogy van mire támaszkodni
-- ────────────────────────────────────────────────────────────────────────────
-- Ha bármelyik szűkített policy hiányzik, a nyitott policy törlése KIZÁRNÁ a
-- lelkészeket a SAJÁT adataikból. Ilyenkor inkább semmit ne csináljunk:
-- a RAISE EXCEPTION az EGÉSZ tranzakciót visszagörgeti.

DO $orszem$
DECLARE
  v_hianyzo text[];
BEGIN
  SELECT array_agg(x.tabla || '.' || x.policy ORDER BY x.tabla, x.policy)
    INTO v_hianyzo
  FROM (VALUES
          ('szemely',         'szemely_staff_select'),
          ('szemely',         'szemely_staff_insert'),
          ('szemely',         'szemely_staff_update'),
          ('szemely',         'szemely_staff_delete'),
          ('leltar_tetelek',  'leltar_tetelek_access'),
          ('csaladlatogatas', 'csaladlatogatas_access')
       ) AS x(tabla, policy)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = x.tabla
      AND policyname = x.policy
  );

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — hiányzó szűkített policy: %. A nyitott policy törlése kizárná a lelkészeket a saját adataikból. Küldd vissza a 0c. szakasz eredményét!',
      array_to_string(v_hianyzo, ', ');
  END IF;

  -- A 2/b. szakasz (kereszt-egyezés megőrzése) ehhez a táblához nyúl.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'cross_congregation_match_notifications'
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — a cross_congregation_match_notifications tábla nem létezik (a 2026-04-26-cross-congregation-matching.sql nem futott?). A 2/b. szakasz erre épül. Szólj, és feltételessé tesszük.';
  END IF;

  -- Puha figyelmeztetés (nem állítja meg a futást): ezekre csak
  -- dokumentációs szinten hivatkozunk, a segédfüggvények SECURITY DEFINER-ként
  -- amúgy is megkerülik az RLS-t.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='sirhelytemeto'
                   AND policyname='sirhelytemeto_access') THEN
    RAISE NOTICE 'FIGYELEM: a sirhelytemeto_access policy nem található — a temető-lista maga is ellenőrzendő.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='kiadas'
                   AND policyname='kiadas_access') THEN
    RAISE NOTICE 'FIGYELEM: a kiadas_access policy nem található — a kiadás-lista maga is ellenőrzendő.';
  END IF;
END
$orszem$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. SZEMELY — a teljes tagnyilvántartás. ⛔ A LEGSÚLYOSABB TÉTEL.
-- ────────────────────────────────────────────────────────────────────────────
-- MI MARAD (mind a négy a 2026-04-12-phase-0-rls-hardening.sql-ből):
--   · szemely_staff_select  — 2026-04-12-phase-0-rls-hardening.sql:115-119
--   · szemely_staff_insert  — 2026-04-12-phase-0-rls-hardening.sql:122-126
--   · szemely_staff_update  — 2026-04-12-phase-0-rls-hardening.sql:129-134
--   · szemely_staff_delete  — 2026-04-12-phase-0-rls-hardening.sql:137-141
--   Mind a négy feltétele: `current_user_can_access_congregation(congregation_id)`
--   → saját gyülekezet VAGY mindent látó szerepkör. Ez a HELYES hatókör.
--
-- MI TŰNIK EL (egyik sem szerepel EGYETLEN migrációs fájlban sem — kézzel,
-- a fejlesztés korai szakaszában készültek, ugyanaz a hibaosztály, mint a
-- 2026-08-10-en törölt „Teljes hozzaferes bealitas"):
--   · „Enable read access for all"        (SELECT, public)  ← Supabase Studio sablonneve
--   · „Enable read access for all users"  (SELECT, public)  ← ugyanaz, másik sablonverzió
--   · „Teljes hozzáférés a szemely táblához" (ALL, authenticated)
--
-- KERESZT-GYÜLEKEZETI IGÉNYEK — VÉGIGNÉZVE (2026-08-10, teljes kódbázis):
--   ✅ kereszt-gyülekezeti duplikátum-figyelés → SECURITY DEFINER RPC-k
--      (`find_potential_cross_congregation_match`,
--       `resolve_cross_congregation_match` —
--       2026-04-26-cross-congregation-matching.sql:177-195, :354-359),
--       megkerülik az RLS-t → NEM törik.
--   ✅ admin kereszt-egyeztetés (2026-08-09-admin-kereszt-egyeztetes.sql) →
--      az `apps/web/app/(dashboard)/admin/egyeztetesek-actions.ts` KIZÁRÓLAG
--      RPC-t hív (:105, :133, :236, :289, :323), közvetlen szemely-olvasás
--      nincs benne → NEM törik.
--   ✅ másik gyülekezet lelkészének elérhetősége →
--      `get_cross_match_pastor_contacts()` SECURITY DEFINER
--      (2026-07-14-kereszt-gyulekezeti-lelkesz-kontakt.sql:29-52) → NEM törik.
--   ✅ átadás / átjelentkezés (iktato/atadas-actions.ts:191-196, :268-272) →
--      SAJÁT gyülekezetre szűr; a másik oldalt SECURITY DEFINER trigger +
--      `iktato_atadas_bejegyzes()` RPC intézi → NEM törik.
--   ✅ családfa-következtetés (lib/family/auto-family.ts:227-246) → a kód
--      KOMMENTBEN rögzíti, hogy szigorú RLS-re épül: „a testvér lehet idegen
--      gyülekezeti tag, az RLS-rejtett sor pedig fail-closed módon idegennek
--      számít" → a szigorítás itt a SZÁNDÉKOLT viselkedés.
--   ⚠️ EGY KIVÉTEL, amit külön policy-vel őrzünk meg (lásd 2/b): a lelkészi
--      kereszt-egyezés párbeszédablak neveket/egyházi CNP-t jelenít meg a
--      MÁSIK gyülekezet tagjáról — közvetlen szemely-olvasással
--      (apps/web/lib/members/cross-congregation-actions.ts:193-197,
--       `.select('id, csaladnev, k_nev, cnp').in('id', szemelyIds)`), ahol a
--      szemelyIds a pár MINDKÉT oldalát tartalmazza (:181-186).
--      Szűkített policy nélkül ez NÉMÁN üres névre/CNP-re degradálódna.

DROP POLICY IF EXISTS "Enable read access for all"             ON public.szemely;
DROP POLICY IF EXISTS "Enable read access for all users"       ON public.szemely;
DROP POLICY IF EXISTS "Teljes hozzáférés a szemely táblához"   ON public.szemely;

-- ── 2/b. A kereszt-egyezés párbeszédablak megőrzése ──────────────────────────
-- Szűk, célzott SELECT policy: a tag sora akkor is olvasható, ha SZEREPEL egy
-- olyan kereszt-egyezési értesítés valamelyik oldalán, amelynek a MÁSIK oldala
-- a hívó gyülekezete. Vagyis: nem „minden idegen tag", hanem KIZÁRÓLAG az a
-- néhány sor, amelyről a rendszer maga jelezte, hogy a két gyülekezet közös
-- ügye. Ez pontosan az a hatókör, amit a funkció igényel.
--
-- SECURITY DEFINER segédfüggvényen keresztül, hogy a policy kiértékelését ne
-- befolyásolja a `cross_congregation_match_notifications` SAJÁT RLS-e
-- (különben a szűrés kétszer futna, és a viselkedés nehezen kiszámítható lenne).

CREATE OR REPLACE FUNCTION public.szemely_kereszt_egyezesben_lathato(
    p_szemely_id integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $ccm_szemely$
  SELECT EXISTS (
    SELECT 1
    FROM public.cross_congregation_match_notifications n
    WHERE (
            n.triggering_szemely_id = p_szemely_id
         OR n.matched_szemely_id    = p_szemely_id
          )
      AND (
            n.triggering_congregation_id = public.current_user_congregation_id()
         OR n.matched_congregation_id    = public.current_user_congregation_id()
          )
  );
$ccm_szemely$;

COMMENT ON FUNCTION public.szemely_kereszt_egyezesben_lathato(integer) IS
  'RLS-segéd: a megadott személy szerepel-e olyan kereszt-gyülekezeti egyezési értesítésben, amelynek a másik oldala a hívó gyülekezete. Ezt a lelkészi kereszt-egyezés párbeszédablak (apps/web/lib/members/cross-congregation-actions.ts) igényli — enélkül a másik gyülekezet tagjának neve/CNP-je némán üresen maradna.';

GRANT EXECUTE ON FUNCTION public.szemely_kereszt_egyezesben_lathato(integer)
  TO authenticated;

-- Teljesítmény: a policy soronként hívódhat egy taglista-lekérdezésen.
-- A triggering_szemely_id oldalt a meglévő UNIQUE
-- (triggering_szemely_id, matched_szemely_id, confidence) index kiszolgálja
-- (2026-04-26-cross-congregation-matching.sql:103), a matched_szemely_id
-- oldalhoz viszont nincs index — pótoljuk.
CREATE INDEX IF NOT EXISTS idx_ccm_notif_matched_szemely
  ON public.cross_congregation_match_notifications (matched_szemely_id);

DROP POLICY IF EXISTS szemely_cross_match_select ON public.szemely;
CREATE POLICY szemely_cross_match_select ON public.szemely
  FOR SELECT TO authenticated
  USING (public.szemely_kereszt_egyezesben_lathato(szemely.id));

-- ── 2/c. ISMERT KÖVETKEZMÉNY — az EGYHÁZKERÜLETI ADMIN (döntést igényel) ────
-- A `current_user_has_global_access()` szerep-listája (admin / esperes /
-- egyhazmegyei_admin — 2026-04-12-phase-0-rls-hardening.sql:60-66) NEM
-- tartalmazza az `egyhazkeruleti_admin`-t. A nyitott policy törlése után a
-- kerületi admin gyülekezetenkénti TAGLÉTSZÁM-összesítői
-- (apps/web/app/(dashboard)/admin/actions.ts:27-33, :375-381, :1424-1428;
--  apps/web/lib/dashboard/scope-overview.ts:163-165) 0-ra ugranak.
--
-- ⚠️ EZ NEM ÚJ HIBAOSZTÁLY: a kerületi admin ma is 0-t lát a kiadas /
--    befizetes / bealitas összesítőkben, mert azok policy-ja MÁR MOST
--    `current_user_congregation_id()`-t használ. A szemely ezzel a többi
--    táblával AZONOS viselkedésűvé válik.
--
-- HA úgy döntesz, hogy a kerületi admin LÁSSA a kerülete tagjait, az alábbi
-- policy pontosan azt adja (a ccm_caller_district_ids() mintája szerint —
-- 2026-08-09-admin-kereszt-egyeztetes.sql:78-102). ⚠️ Ez HATÓKÖR-BŐVÍTÉS
-- a tagnyilvántartáson: külön döntés kell hozzá, ezért kikommentelve hagyom.
--
-- CREATE POLICY szemely_district_select ON public.szemely
--   FOR SELECT TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1
--       FROM public.congregations c
--       JOIN public.dioceses d ON d.id = c.diocese_id
--       WHERE c.id = szemely.congregation_id
--         AND d.district_id IN (
--           SELECT pr.scope_id
--           FROM public.profile_roles pr
--           WHERE pr.profile_id = auth.uid()
--             AND pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin'
--             AND pr.active = true AND pr.approval_status = 'approved'
--             AND pr.scope_id IS NOT NULL
--           UNION
--           SELECT p.district_id
--           FROM public.profiles p
--           WHERE p.id = auth.uid()
--             AND p.role = 'egyhazkeruleti_admin'
--             AND p.district_id IS NOT NULL
--         )
--     )
--   );


-- ────────────────────────────────────────────────────────────────────────────
-- 3. LELTAR_TETELEK — leltári tételek (congregation_id NOT NULL)
-- ────────────────────────────────────────────────────────────────────────────
-- MI MARAD: leltar_tetelek_access (FOR ALL) —
--   2026-04-13-rls-congregation-tables.sql:103-105
--   (feltétel: congregation_id = current_user_congregation_id()
--              OR current_user_has_global_access())
-- MI TŰNIK EL: „Teljes hozzáférés a bejelentkezett felhasználóknak" (ALL) —
--   nincs migrációs forrása, kézi maradvány.
-- Az app minden lekérdezése congregation_id-ra szűr (leltár-lista, leltári
-- fisa, leltári szám kikeresés), ezért a törlés funkcionálisan semleges.

DROP POLICY IF EXISTS "Teljes hozzáférés a bejelentkezett felhasználóknak"
  ON public.leltar_tetelek;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. CSALADLATOGATAS — családlátogatások (congregation_id NOT NULL)
-- ────────────────────────────────────────────────────────────────────────────
-- MI MARAD: csaladlatogatas_access (FOR ALL) —
--   2026-04-13-rls-congregation-tables.sql:43-45
-- MI TŰNIK EL: „Teljes hozzáférés a hitelesített felhasználóknak" (ALL) —
--   nincs migrációs forrása, kézi maradvány.
-- ⚠️ Lelkipásztori titok: a családlátogatási jegyzetek (alapige, megjegyzés)
--    eddig MINDEN gyülekezet minden lelkésze számára olvashatók voltak.

DROP POLICY IF EXISTS "Teljes hozzáférés a hitelesített felhasználóknak"
  ON public.csaladlatogatas;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. SÍRHELY-LÁNC — sirhely / sirhelyberles / sirhelyelhunyt
-- ────────────────────────────────────────────────────────────────────────────
-- HELYZET: ezeken a táblákon NINCS congregation_id oszlop, és NINCS EGYETLEN
-- szűkített policy sem — mind a hat policy `USING (true)`:
--   sirhely_access / sirhely_all               (2026-04-13-rls-mm-misc-tables.sql:41,
--                                               2026-04-13-rls-ALL-FIXED.sql:226)
--   sirhelyberles_access / sirhelyberles_all   (…:44, …:229)
--   sirhelyelhunyt_access / sirhelyelhunyt_all (…:47, …:232)
-- ⇒ Ezért itt NEM elég törölni: ELŐBB létre kell hozni a helyes hatókört,
--   különben a temetői modul MINDEN gyülekezetnél kifehéredne.
--
-- A TENANT-LÁNC (a projekt saját takarító/ellenőrző szkriptjei is pontosan ezt
-- használják — 2026-08-09-teszt-gyulekezet-wipe.sql:47-56,
-- 2026-08-09-teszt-gyulekezet-ellenorzes.sql:114-122):
--     sirhelyelhunyt.sirhelyid → sirhely.id
--     sirhelyberles.sirhelyid  → sirhely.id
--     sirhely.temetoid         → sirhelytemeto.id  (ITT van a congregation_id)
-- És az app is így kérdez:
--   · apps/web/app/(dashboard)/sirhelyek/actions.ts:94-130 (temető → parcella →
--     bérlet/elhunyt lánc, a komment :79-83 dokumentálja a szándékot),
--   · apps/desktop/src/lib/sync.ts:4960-4986 (ugyanez a lánc).
--
-- ⛔ AMIÉRT EZ A LEGSÚLYOSABB TÉNYLEGES SZIVÁRGÁS A LISTÁN:
--   A webes OFFLINE SZINKRON ezt a három táblát `scopeFilter: 'none'` jelzéssel
--   tartja nyilván (apps/web/lib/offline/table-registry.ts:292-325), és a
--   letöltő (apps/web/lib/offline/pull.ts:58-66) ilyenkor SEMMILYEN szűrőt nem
--   tesz a lekérdezésre — csak egy `updated_at >` kurzort. Vagyis a böngésző
--   ma LETÖLTI az ORSZÁG ÖSSZES temetői sorát (sírhely, bérlő neve/címe/
--   elérhetősége, elhunytak neve és anyja neve) a felhasználó helyi Dexie
--   adatbázisába. A policy után ugyanez a kód automatikusan csak a saját
--   gyülekezet sorait kapja — kódmódosítás nélkül.
--   ⚠️ KÖVETKEZMÉNY: a MÁR letöltött, idegen adat OTT MARAD a felhasználók
--      böngésző-tárolójában. Ezt a szinkron nem takarítja ki magától —
--      lásd a jelentés „követő teendők" pontját.
--
-- ℹ️ MELLÉKHATÁS (kedvező): a /sirhelyek ÍRÁS-műveletei ma tulajdonjog-
--    ellenőrzés NÉLKÜL futnak — a `savePlot` update-ága (actions.ts:181),
--    a `deletePlot` (:193), a `saveRental` (:222-235) és a `saveDeceased`
--    (:270-282) csak sor-azonosítóra szűr. Eddig kizárólag a nyitott policy
--    miatt volt ez „ártalmatlan" (valójában kereszt-gyülekezeti IDOR).
--    Az új WITH CHECK/USING innentől adatbázis-szinten megfogja.
--
-- A MINTA: 2026-04-12-phase-0-rls-hardening.sql:193-213
-- (`csalad_resolves_to_accessible_cong` — SECURITY DEFINER feloldó függvény,
--  hogy a szülő tábla RLS-e ne blokkolja a policy kiértékelését).
-- A `p_legacy_is` paraméter a csoport_select legacy-toleráns mintáját követi
-- (2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql:234-240): OLVASÁSNÁL a
-- gyülekezethez nem köthető (árva) sor nem tűnik el, ÍRÁSNÁL viszont szigorú.

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
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1
      FROM public.sirhelytemeto t
      WHERE t.id = p_temetoid
        AND t.congregation_id IS NOT NULL
        AND t.congregation_id = public.current_user_congregation_id()
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

COMMENT ON FUNCTION public.sirhely_temeto_hozzaferheto(integer, boolean) IS
  'RLS-segéd: a megadott temető (sirhelytemeto.id) a hívó gyülekezetéhez tartozik-e. p_legacy_is=true esetén a gyülekezethez nem köthető (árva) temetőt is átengedi — csak OLVASÁSNÁL használjuk.';

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
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1
      FROM public.sirhely s
      JOIN public.sirhelytemeto t ON t.id = s.temetoid
      WHERE s.id = p_sirhelyid
        AND t.congregation_id IS NOT NULL
        AND t.congregation_id = public.current_user_congregation_id()
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

COMMENT ON FUNCTION public.sirhely_hozzaferheto(integer, boolean) IS
  'RLS-segéd: a megadott sírhely (sirhely.id) temetője a hívó gyülekezetéhez tartozik-e (sirhely.temetoid → sirhelytemeto.congregation_id).';

GRANT EXECUTE ON FUNCTION public.sirhely_temeto_hozzaferheto(integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sirhely_hozzaferheto(integer, boolean)        TO authenticated;

-- Teljesítmény: az RLS most soronként old fel FK-t — index nélkül lassulna.
CREATE INDEX IF NOT EXISTS idx_sirhely_temetoid        ON public.sirhely (temetoid);
CREATE INDEX IF NOT EXISTS idx_sirhelyberles_sirhelyid ON public.sirhelyberles (sirhelyid);
CREATE INDEX IF NOT EXISTS idx_sirhelyelhunyt_sirhelyid ON public.sirhelyelhunyt (sirhelyid);

-- 5a. sirhely
ALTER TABLE public.sirhely ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sirhely_select ON public.sirhely;
CREATE POLICY sirhely_select ON public.sirhely
  FOR SELECT TO authenticated
  USING (public.sirhely_temeto_hozzaferheto(temetoid, true));

DROP POLICY IF EXISTS sirhely_insert ON public.sirhely;
CREATE POLICY sirhely_insert ON public.sirhely
  FOR INSERT TO authenticated
  WITH CHECK (public.sirhely_temeto_hozzaferheto(temetoid, false));

DROP POLICY IF EXISTS sirhely_update ON public.sirhely;
CREATE POLICY sirhely_update ON public.sirhely
  FOR UPDATE TO authenticated
  USING      (public.sirhely_temeto_hozzaferheto(temetoid, true))
  WITH CHECK (public.sirhely_temeto_hozzaferheto(temetoid, false));

DROP POLICY IF EXISTS sirhely_delete ON public.sirhely;
CREATE POLICY sirhely_delete ON public.sirhely
  FOR DELETE TO authenticated
  USING (public.sirhely_temeto_hozzaferheto(temetoid, false));

-- …és csak MOST tűnjön el a két nyitott policy (a sorrend így fail-safe).
DROP POLICY IF EXISTS sirhely_access ON public.sirhely;
DROP POLICY IF EXISTS sirhely_all    ON public.sirhely;

-- 5b. sirhelyberles (sírhely-bérlet / megváltás — bérlő neve, címe, elérhetősége!)
ALTER TABLE public.sirhelyberles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sirhelyberles_select ON public.sirhelyberles;
CREATE POLICY sirhelyberles_select ON public.sirhelyberles
  FOR SELECT TO authenticated
  USING (public.sirhely_hozzaferheto(sirhelyid, true));

DROP POLICY IF EXISTS sirhelyberles_insert ON public.sirhelyberles;
CREATE POLICY sirhelyberles_insert ON public.sirhelyberles
  FOR INSERT TO authenticated
  WITH CHECK (public.sirhely_hozzaferheto(sirhelyid, false));

DROP POLICY IF EXISTS sirhelyberles_update ON public.sirhelyberles;
CREATE POLICY sirhelyberles_update ON public.sirhelyberles
  FOR UPDATE TO authenticated
  USING      (public.sirhely_hozzaferheto(sirhelyid, true))
  WITH CHECK (public.sirhely_hozzaferheto(sirhelyid, false));

DROP POLICY IF EXISTS sirhelyberles_delete ON public.sirhelyberles;
CREATE POLICY sirhelyberles_delete ON public.sirhelyberles
  FOR DELETE TO authenticated
  USING (public.sirhely_hozzaferheto(sirhelyid, false));

DROP POLICY IF EXISTS sirhelyberles_access ON public.sirhelyberles;
DROP POLICY IF EXISTS sirhelyberles_all    ON public.sirhelyberles;

-- 5c. sirhelyelhunyt (elhunytak — név, anyja neve, születési/halálozási adatok!)
ALTER TABLE public.sirhelyelhunyt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sirhelyelhunyt_select ON public.sirhelyelhunyt;
CREATE POLICY sirhelyelhunyt_select ON public.sirhelyelhunyt
  FOR SELECT TO authenticated
  USING (public.sirhely_hozzaferheto(sirhelyid, true));

DROP POLICY IF EXISTS sirhelyelhunyt_insert ON public.sirhelyelhunyt;
CREATE POLICY sirhelyelhunyt_insert ON public.sirhelyelhunyt
  FOR INSERT TO authenticated
  WITH CHECK (public.sirhely_hozzaferheto(sirhelyid, false));

DROP POLICY IF EXISTS sirhelyelhunyt_update ON public.sirhelyelhunyt;
CREATE POLICY sirhelyelhunyt_update ON public.sirhelyelhunyt
  FOR UPDATE TO authenticated
  USING      (public.sirhely_hozzaferheto(sirhelyid, true))
  WITH CHECK (public.sirhely_hozzaferheto(sirhelyid, false));

DROP POLICY IF EXISTS sirhelyelhunyt_delete ON public.sirhelyelhunyt;
CREATE POLICY sirhelyelhunyt_delete ON public.sirhelyelhunyt
  FOR DELETE TO authenticated
  USING (public.sirhely_hozzaferheto(sirhelyid, false));

DROP POLICY IF EXISTS sirhelyelhunyt_access ON public.sirhelyelhunyt;
DROP POLICY IF EXISTS sirhelyelhunyt_all    ON public.sirhelyelhunyt;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. MONETAR — pénztári címletjegyzék (Monetár fül)
-- ────────────────────────────────────────────────────────────────────────────
-- HELYZET: nincs congregation_id oszlop, és MINDKÉT policy nyitott:
--   monetar_access (2026-04-13-rls-congregation-tables.sql:138-139 —
--                   a komment maga is beismeri: „nincs congregation_id —
--                   referencia tábla", holott NEM referencia-tábla)
--   monetar_all    (2026-04-13-rls-ALL-FIXED.sql:149)
--
-- A TENANT VISZONT LÉTEZIK, csak szöveges mezőben: az app KIZÁRÓLAG így
-- olvassa/írja/törli (mindkét kliensen, azonos konvencióval):
--   source   = 'congregation_cash_check'
--   sourceid = '<congregation uuid>' || ':' || '<év>'
-- Bizonyíték:
--   apps/web/app/(dashboard)/penzugy/monetary-actions.ts:36-38 (buildSourceId),
--   :82-83 (olvasás), :180-184 (törlés), :190-196 (beszúrás)
--   apps/desktop/src/components/desktop-monetary-tab.tsx:69, :79-80,
--   :144-146, :150-156
-- Mivel az app SOHA nem kérdez le más `source` értékre és sourceid nélkül,
-- a szigorítás funkcionálisan semleges: pontosan azt engedi, amit az app kér.
--
-- ⚠️ ISMERT, ELŐZŐLEG IS FENNÁLLÓ HATÁRESET (nem ez a fájl okozza):
--    az `effectiveCongregationId` (app-oldali gyülekezet-váltás) és az
--    RLS-skalár `current_user_congregation_id()` széthúzhat. A gyülekezetet
--    váltó `egyhazkeruleti_admin` a Monetáron ugyanúgy elakadna, mint ahogy
--    ma is elakad a kiadas/befizetes/bealitas tábláknál (azok is
--    `current_user_congregation_id()`-t használnak). Vagyis a Monetár ezzel
--    a többi pénzügyi táblával AZONOS viselkedésűvé válik — nem rosszabbá.
--
-- ℹ️ FÜGGETLEN MELLÉKLELET (nem ez a fájl javítja, de jegyezzük fel):
--    a `wipe_finance_data` felsorolja a `monetar`-t a törlendő táblák közt
--    (2026-06-09-wipe-finance-data.sql:55), a ciklus viszont kihagy minden
--    `congregation_id` oszlop nélküli táblát (:96-103) — így a monetar sorok
--    a gyülekezeti pénzügy-törlésnél NÉMÁN bennmaradnak, a függvény
--    kommentje (:127) ellenére.

ALTER TABLE public.monetar ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_monetar_source_sourceid
  ON public.monetar (source, sourceid);

DROP POLICY IF EXISTS monetar_congregation_access ON public.monetar;
CREATE POLICY monetar_congregation_access ON public.monetar
  FOR ALL TO authenticated
  USING (
    public.current_user_has_global_access()
    OR (
      monetar.source = 'congregation_cash_check'
      AND split_part(monetar.sourceid, ':', 1)
          = public.current_user_congregation_id()::text
    )
  )
  WITH CHECK (
    public.current_user_has_global_access()
    OR (
      monetar.source = 'congregation_cash_check'
      AND split_part(monetar.sourceid, ':', 1)
          = public.current_user_congregation_id()::text
    )
  );

DROP POLICY IF EXISTS monetar_access ON public.monetar;
DROP POLICY IF EXISTS monetar_all    ON public.monetar;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. KIADASIKISEROIV — kiadási kísérőív
-- ────────────────────────────────────────────────────────────────────────────
-- HELYZET: egyetlen policy, `kiadasikiseroiv_read` (SELECT, USING true) —
--   2026-04-13-rls-reference-tables.sql:45-46 és
--   2026-04-13-rls-ALL-FIXED.sql:124. Referencia-táblaként lett besorolva,
--   pedig TRANZAKCIÓS adat: minden sor egy konkrét kiadáshoz tartozik
--   (id_kiadas → kiadas.id), és a kiadas HORDOZZA a congregation_id-t.
-- ÍRÁS-POLICY NINCS — tehát a tábla ma is csak olvasható a kliensről.
-- Az alkalmazás-kód SEHOL nem kérdezi le (2026-08-10-i teljes átnézés):
--   · csak két komment hivatkozik rá — packages/core/src/finance/kiadas/storno.ts:9
--     és packages/validations/src/finance/kiadas-delete.ts:11 —, mindkettő azt
--     rögzíti, hogy a stornó/törlés NEM kaszkádol rá;
--   · a NYOMTATOTT „kísérőív" NEM ebből a táblából készül, hanem memóriában,
--     a már betöltött `kiadas` sorokból: packages/ui-app/src/finance/reporting.ts:603
--     (`buildKiadasiKiseroiv(...)`), fogyasztók:
--     apps/web/components/finance/kiseroiv-print-dialog.tsx:17,100 és
--     apps/desktop/src/components/finance-print-dialog.tsx.
-- A szűkítés így nem törhet el semmit, viszont megszünteti a
-- kereszt-gyülekezeti iratszám-/megjegyzés-szivárgást.
-- (A teszt-teardown szkriptek — 2026-07-01-teszt-egyhazkozseg-teardown.sql:39,
--  2026-08-09-teszt-gyulekezet-wipe.sql:59 — a szülő join-on át törlik, és
--  postgres-ként futnak, tehát az RLS nem érinti őket.)

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
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1
      FROM public.kiadas k
      WHERE k.id = p_id_kiadas
        AND k.congregation_id IS NOT NULL
        AND k.congregation_id = public.current_user_congregation_id()
    )
    OR (
      p_legacy_is
      AND NOT EXISTS (
        SELECT 1 FROM public.kiadas k
        WHERE k.id = p_id_kiadas AND k.congregation_id IS NOT NULL
      )
    );
$kiadas_scope$;

COMMENT ON FUNCTION public.kiadas_hozzaferheto(integer, boolean) IS
  'RLS-segéd: a megadott kiadás (kiadas.id) a hívó gyülekezetéhez tartozik-e. A kiadasikiseroiv hatókörét oldja fel.';

GRANT EXECUTE ON FUNCTION public.kiadas_hozzaferheto(integer, boolean) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_kiadasikiseroiv_id_kiadas
  ON public.kiadasikiseroiv (id_kiadas);

ALTER TABLE public.kiadasikiseroiv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiadasikiseroiv_select ON public.kiadasikiseroiv;
CREATE POLICY kiadasikiseroiv_select ON public.kiadasikiseroiv
  FOR SELECT TO authenticated
  USING (public.kiadas_hozzaferheto(id_kiadas, true));

DROP POLICY IF EXISTS kiadasikiseroiv_read ON public.kiadasikiseroiv;
-- ℹ️ Írás-policy-t SZÁNDÉKOSAN nem hozunk létre: ma sincs, és az app nem ír
--    a táblába. Ha később kell, a minta: FOR INSERT WITH CHECK
--    (public.kiadas_hozzaferheto(id_kiadas, false)).


-- ────────────────────────────────────────────────────────────────────────────
-- 7/b. EVENT — ⛔ DÖNTÉST IGÉNYEL, EZÉRT NEM NYÚLUNK HOZZÁ
-- ────────────────────────────────────────────────────────────────────────────
-- `event_read` (SELECT, USING true) — 2026-04-13-rls-reference-tables.sql:66-67
-- és 2026-04-13-rls-ALL-FIXED.sql:143.
--
-- MIÉRT NEM DÖNTÖTTÜNK HELYETTED:
--   · A tábla oszlopai: type (varchar), val (varchar), created (timestamp).
--     NINCS id, NINCS elsődleges kulcs, NINCS congregation_id — semmilyen
--     tenant-kapcsolat nem vezethető le belőle, tehát gyülekezet-hatókörű
--     policy sem írható rá.
--   · A teljes kódbázisban (apps/web, apps/desktop, packages, supabase/
--     functions, scripts, sőt a migration-docs/source-links legacy JS-e is)
--     EGYETLEN lekérdezés sem hivatkozik rá — a törlés valószínűleg semmit
--     nem törne, de a tartalmát nem ismerjük (a 0h. lekérdezés mutatja meg).
--   · A 2026-04-15-sync-tracking.sql:19 „append-only log" táblaként sorolja be
--     (import_logs, logger, event — „nincs UPDATE"), vagyis a Supabase előtti
--     PHP/JS alkalmazás naplója. Ez a besorolás a törlés MELLETT szól.
--   · A 2026-04-21-m6-2-rls-audit-full.sql:152 viszont a `programs` modulhoz
--     sorolja — ha MÉGIS gyülekezeti alkalmakat tárol, akkor OSZLOPOT kell
--     hozzáadni (congregation_id + backfill), nem policy-t húzni rá.
--   Ez a két besorolás ellentmond egymásnak → ezért kell a 0h. eredménye.
--
-- HA a 0h. eredménye alapján úgy döntesz, hogy a tábla legacy/üres/globális
-- és nem kell olvashatónak lennie, ELÉG ezt az egy sort kikommentelni:
-- DROP POLICY IF EXISTS event_read ON public.event;


-- ────────────────────────────────────────────────────────────────────────────
-- 8. PROFILES — ⚠️ A LEGKÉNYESEBB SZAKASZ. ELŐBB OLVASD EL VÉGIG.
-- ────────────────────────────────────────────────────────────────────────────
-- HELYZET (a 2026-07-17-es ÉLES export szerint, amit a P0 migráció
-- preflightja rögzít — 2026-07-17-member-portal-p0-auth-isolation.sql:625-661):
-- a profiles táblán PONTOSAN három policy van:
--     profiles_insert  INSERT  WITH CHECK (id = auth.uid())
--     profiles_read    SELECT  USING (true)          ← EZ a szivárgás
--     profiles_write   UPDATE  USING (id = auth.uid())
-- Létrehozó migráció: 2026-04-13-rls-hybrid-admin-tables.sql:33.
--
-- ⛔ EZÉRT NEM SZABAD EGYSZERŰEN TÖRÖLNI: a `profiles_read` az EGYETLEN SELECT
--    policy. Törlés után SENKI nem tudná elolvasni még a SAJÁT profilját sem
--    → bejelentkezés, profilválasztó, jogosultság-feloldás, minden megáll.
--    Ezért CSERÉLJÜK, nem töröljük.
--
-- ÍRÁS: a profiles_insert/profiles_write policy-hoz NEM NYÚLUNK. Az admin
--       írások ma is SECURITY DEFINER RPC-n / service_role-on mennek
--       (2026-05-04-admin-user-status-rpc.sql, 2026-05-04b-grant-service-role-
--       profiles.sql, 2026-05-04f-complete-user-onboarding-rpc.sql).
--
-- ── MELY FUNKCIÓKAT ELLENŐRIZTÜK (2026-08-10, teljes kódbázis-átnézés) ──
--  (a) SAJÁT profil olvasása — session-bootstrap, /valassz-profilt,
--      welcome-wizard, desktop offline user-feloldás
--      (apps/desktop/src/lib/sync.ts:223-228, :832-835, :1233-1236,
--       :1741-1744, :2432-2435, :2573-2576 — mind `.eq('id', userId)`).
--      → az (1) ág fedi.
--  (b) AZONOS GYÜLEKEZET — lelkésztárs / könyvelő / gyülekezeti listák.
--      → a (4) és (5) ág fedi.
--  (c) EGYHÁZMEGYEI / EGYHÁZKERÜLETI ADMIN felhasználó-listák és
--      jóváhagyások — apps/web/lib/auth/admin-scope.ts:107-132
--      (getScopedActiveUserIds: profiles .in('district_id'|'diocese_id'|
--       'congregation_id')) és :215-222 (assertUserInScope: tetszőleges
--      profil olvasása id alapján). Ezek a KLIENS-oldali (RLS-es)
--      Supabase-klienst használják (`access.supabase` →
--      lib/supabase/server.ts), tehát VALÓBAN a policy-tól függenek.
--      ⚠️ Az `egyhazkeruleti_admin` NINCS benne a
--         current_user_has_global_access() szerep-listájában, ezért neki
--         KÜLÖN kerületi ág kell — különben a kerületi felhasználó-lista
--         és a jóváhagyás némán 0 sorra futna.
--      → a (6), (7) és (8) ág fedi.
--  (d) „FELFELÉ" OLVASÁS: a gyülekezeti felhasználó a SAJÁT egyházmegyéje
--      vezetőinek profilját olvassa, hogy értesítést tudjon küldeni —
--      apps/web/app/(dashboard)/dashboard-egyhazmegye/document-actions.ts:360-366
--      (profiles, status='active', role IN ('esperes','egyhazmegyei_admin'),
--       diocese_id = a gyülekezet megyéje) és
--      apps/desktop/src/components/desktop-budget-tab.tsx:166-171 (ugyanez).
--      ⚠️ EZ AZ A LÁB, AMIT A LEGKÖNNYEBB LETÖRNI: gyülekezet-only policy
--         mellett a beküldés-értesítés némán elveszne.
--      → a (9) ág fedi (és CSAK tisztségviselői szerepkörökre).
--  (e) KERESZT-GYÜLEKEZETI LELKÉSZ-KONTAKT — NEM a profiles-t olvassa
--      közvetlenül, hanem a `get_cross_match_pastor_contacts()` SECURITY
--      DEFINER RPC-t (2026-07-14-kereszt-gyulekezeti-lelkesz-kontakt.sql:29-52),
--      ami megkerüli az RLS-t. → a szigorítás NEM érinti.
--      Fogyasztó: apps/web/lib/members/cross-congregation-actions.ts:113.
--  (f) DESKTOP TELJES PROFIL-SZINKRON — apps/desktop/src/lib/sync.ts:329-333
--      szűrő NÉLKÜL húzza le a profiles táblát az offline gyorsítótárba.
--      Ez ma az ORSZÁG ÖSSZES felhasználóját letölti a lelkész gépére(!).
--      A kód kommentje (:316-318) ki is mondja, hogy erre épít:
--      „jelenleg profiles_read/profiles_read_all minden authenticated user-t
--       enged SELECT-ben".
--      A szigorítás után a hatókörébe eső sorokat kapja — a szinkron NEM
--      hibázik el, csak kevesebb sort ír. Ez a KÍVÁNT viselkedés.
--  (g) ⚠️ ORSZÁGOS OLVASÓK, amelyek NEM admin-felületen futnak, hanem a
--      HÉTKÖZNAPI LELKÉSZ munkamenetében — ezek miatt kell a (10) ág:
--        · éves jelentés generálása — lib/annual-report/generator.ts:203-205
--          `.or(congregation_id.eq.X, role.in.(esperes,egyhazmegyei_admin))`
--          → megyekorlát NÉLKÜL, országosan;
--        · TVA-plafon riasztás — penzugy/tva-actions.ts:147
--          `.or(congregation_id.eq.X, and(role.eq.esperes, diocese_id.not.is.null))`
--          → szintén országosan;
--        · átadás/átjelentkezés — iktato/atadas-actions.ts:290-294
--          `.eq('congregation_id', celCongregationId).eq('role','lelkesz')`
--          → a CÉL gyülekezet lelkésze (a kód kommentje :283-284 kimondja,
--            hogy a nyitott policy-ra épít);
--        · átjelentkezés visszaigazolása —
--          lib/notifications/transfer-notifications-actions.ts:372-376
--          → a FORRÁS gyülekezet lelkésze;
--        · társ-lelkész / könyvelő kirendelés értesítése —
--          admin/profile-congregations-actions.ts:307-312
--          → tetszőleges gyülekezet lelkésze;
--        · Missziós Műhely — közösségi ranglista és projektek:
--          misszios-muhely/community-actions.ts:436, :705, :931 és
--          misszios-muhely/project-actions.ts:178, :308
--          → SZÁNDÉKOSAN országos, közösségi funkció.
--      Ezek MIND az RLS-es (anon+JWT) klienst használják, tehát valóban a
--      policy dönt róluk. Egyik sem dob hibát szűkítéskor — NÉMÁN üres
--      címzettlistát / üres nevet adnának. Épp ezért veszélyesek.
--
-- ── REKURZIÓ-VESZÉLY (ezért SECURITY DEFINER a segédfüggvény) ──
-- A profiles-ra tett policy NEM tartalmazhat közvetlen `SELECT ... FROM
-- public.profiles`-t és nem hivatkozhat olyan táblára sem, amelynek a policy-ja
-- visszaolvas a profiles-ra (pl. profile_roles) — az végtelen rekurzió (42P17)
-- lenne, és MINDEN profiles-olvasás elhalna. Ezért a teljes logika EGYETLEN
-- SECURITY DEFINER függvénybe kerül, amely a tulajdonosa (postgres, BYPASSRLS)
-- jogán olvas. A lenti őrszem ezt tranzakción belül BIZONYÍTJA is.

CREATE OR REPLACE FUNCTION public.profil_lathato_e(
    p_profile_id      uuid,
    p_congregation_id uuid,
    p_diocese_id      uuid,
    p_district_id     uuid,
    p_role            text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $profil_lathato$
  SELECT
    -- (1) SAJÁT profil — mindig.
    p_profile_id = auth.uid()

    -- (2) Mindent látó szerepkörök: admin / esperes / egyhazmegyei_admin
    --     (a pre-P0 definíció szerint — 2026-04-12-phase-0-rls-hardening.sql:53-67).
    OR public.current_user_has_global_access()

    -- (3) Rendszer-szintű admin a profile_roles-ban
    --     (minta: ccm_caller_is_system_admin,
    --      2026-08-09-admin-kereszt-egyeztetes.sql:58-73).
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system' AND pr.role = 'admin'
        AND pr.active = true AND pr.approval_status = 'approved'
    )

    -- (4) AZONOS GYÜLEKEZET (skalár láb)
    OR (
      p_congregation_id IS NOT NULL
      AND p_congregation_id = public.current_user_congregation_id()
    )

    -- (5) AZONOS GYÜLEKEZET (profile_roles láb — co-pastor / könyvelő /
    --     profilváltós hozzárendelés; a skalár⇄profile_roles divergencia
    --     egyik irányban se nyeljen el sort)
    OR (
      p_congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.scope = 'congregation' AND pr.scope_id = p_congregation_id
          AND pr.active = true AND pr.approval_status = 'approved'
      )
    )

    -- (6) EGYHÁZMEGYEI hatókör: a megyei vezető látja a megyéje minden
    --     profilját (a profil saját diocese_id-ja VAGY a gyülekezete megyéje).
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT pr.scope_id AS diocese_id
        FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope_id IS NOT NULL
        UNION
        SELECT p.diocese_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
          AND p.diocese_id IS NOT NULL
      ) sajat
      WHERE sajat.diocese_id = p_diocese_id
         OR sajat.diocese_id = (
              SELECT c.diocese_id FROM public.congregations c
              WHERE c.id = p_congregation_id
            )
    )

    -- (7) EGYHÁZKERÜLETI hatókör (egyhazkeruleti_admin — NINCS benne a
    --     current_user_has_global_access()-ben, ezért kötelező külön ág).
    --     Minta: ccm_caller_district_ids(),
    --     2026-08-09-admin-kereszt-egyeztetes.sql:78-102 +
    --     apps/web/lib/auth/admin-scope.ts:39-52.
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT pr.scope_id AS district_id
        FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin'
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope_id IS NOT NULL
        UNION
        SELECT p.district_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'egyhazkeruleti_admin'
          AND p.district_id IS NOT NULL
      ) sajat
      WHERE sajat.district_id = p_district_id
         OR sajat.district_id = (
              SELECT d.district_id FROM public.dioceses d WHERE d.id = p_diocese_id
            )
         OR sajat.district_id = (
              SELECT d.district_id
              FROM public.congregations c
              JOIN public.dioceses d ON d.id = c.diocese_id
              WHERE c.id = p_congregation_id
            )
    )

    -- (8) MÉG BE NEM SOROLT (frissen regisztrált) profil: se gyülekezet, se
    --     megye, se kerület. Ezt LÁTNIA kell minden olyan adminnak, aki
    --     valamilyen szinten jóváhagyó — különben az admin-felület
    --     „Kérelmek" listája üresen maradna, és az assertUserInScope
    --     (admin-scope.ts:205-249) access_requests-fallbackja sem futna le.
    OR (
      p_congregation_id IS NULL
      AND p_diocese_id  IS NULL
      AND p_district_id IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'
            AND p.role IN ('admin', 'egyhazkeruleti_admin',
                           'egyhazmegyei_admin', 'esperes')
        )
        OR EXISTS (
          SELECT 1 FROM public.profile_roles pr
          WHERE pr.profile_id = auth.uid()
            AND pr.scope IN ('system', 'district', 'diocese')
            AND pr.active = true AND pr.approval_status = 'approved'
        )
      )
    )

    -- (9) „FELFELÉ" OLVASÁS: a gyülekezeti felhasználó látja a SAJÁT
    --     egyházmegyéje / egyházkerülete TISZTSÉGVISELŐINEK profilját.
    --     Ezt a dokumentum- és költségvetés-beküldés értesítése használja
    --     (document-actions.ts:360-366, desktop-budget-tab.tsx:166-171).
    --     Szűk: csak tisztségviselői szerepkörre, és csak a saját megyéjén/
    --     kerületén belül. Hivatalos, egyházi tisztségviselői elérhetőség —
    --     ugyanaz a besorolás, amit a get_cross_match_pastor_contacts()
    --     kommentje rögzít (2026-07-14-…-lelkesz-kontakt.sql:6-13).
    OR (
      p_role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo',
                 'egyhazkeruleti_admin', 'admin')
      AND (
        (
          p_diocese_id IS NOT NULL
          AND p_diocese_id = (
            SELECT c.diocese_id FROM public.congregations c
            WHERE c.id = public.current_user_congregation_id()
          )
        )
        OR (
          p_district_id IS NOT NULL
          AND p_district_id = (
            SELECT d.district_id
            FROM public.congregations c
            JOIN public.dioceses d ON d.id = c.diocese_id
            WHERE c.id = public.current_user_congregation_id()
          )
        )
      )
    )

    -- (10) HIVATALOS TISZTSÉGVISELŐI NÉVSOR — ⚠️ TUDATOS, ÁTMENETI TÁGÍTÁS.
    --      Az AKTÍV, egyházi tisztséget viselő profilok (lelkész, esperes,
    --      egyházmegyei/egyházkerületi admin, rendszergazda) minden AKTÍV
    --      munkatárs számára olvashatók maradnak.
    --
    --      MIÉRT KELL: a fenti (g) pontban felsorolt hat élő funkció ma
    --      ORSZÁGOS profiles-olvasásra épül, és mind NÉMÁN degradálódna
    --      (üres címzettlista, üres név) — nem hibaüzenettel. Ezt a
    --      migrációt nem tehetjük felelősen élesbe úgy, hogy közben
    --      figyelmeztetés nélkül elnémítunk értesítéseket.
    --
    --      MIT NYERÜNK MÉGIS a `USING (true)`-hoz képest — ez NEM kozmetika:
    --        · a `konyvelo` és `egyhazmegyei_szamvevo` profilok mostantól
    --          CSAK a hatókörön belül látszanak (eddig országosan);
    --        · a `pending` / `rejected` / nem aktív profilok (frissen
    --          regisztrálók e-mail-címe, telefonja) kikerülnek a nyilvános
    --          körből — csak a jóváhagyásra jogosult admin látja őket (8. ág);
    --        · a `deleted_at` / `anonymized_at` jelölt (törölt, anonimizált)
    --          sorok szintén kikerülnek;
    --        · minden jövőbeli, nem tisztségviselői profiltípus (pl. tagi
    --          portál) alapból zárt.
    --
    --      MIKOR VEHETŐ KI: amint a (g) pont hat hívási helye átkerül
    --      SECURITY DEFINER RPC mögé — a minta készen áll:
    --      `get_cross_match_pastor_contacts()`
    --      (2026-07-14-kereszt-gyulekezeti-lelkesz-kontakt.sql), amely
    --      SZŰKÍTETT visszatérési típussal ad hivatalos elérhetőséget.
    --      Az ág kivétele ezután EGY blokk törlése ebből a függvényből.
    OR (
      p_role IN ('lelkesz', 'esperes', 'egyhazmegyei_admin',
                 'egyhazkeruleti_admin', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.profiles t
        WHERE t.id = p_profile_id
          AND t.status = 'active'
          AND t.deleted_at IS NULL
          AND t.anonymized_at IS NULL
      )
      AND public.current_user_is_active_staff()
    );
$profil_lathato$;

COMMENT ON FUNCTION public.profil_lathato_e(uuid, uuid, uuid, uuid, text) IS
  'RLS-segéd a profiles SELECT policy-hoz. Tíz ág: saját profil / globális szerep / rendszer-admin (profile_roles) / azonos gyülekezet (skalár + profile_roles) / megyei hatókör / kerületi hatókör / még be nem sorolt profil adminnak / felettes tisztségviselő a saját megyében-kerületben / aktív tisztségviselői névsor (átmeneti, lásd a migráció 8. szakaszát). SECURITY DEFINER — enélkül a profiles-policy végtelen rekurzióba futna.';

GRANT EXECUTE ON FUNCTION public.profil_lathato_e(uuid, uuid, uuid, uuid, text)
  TO authenticated;

-- ── ŐRSZEM: bizonyítjuk, hogy a függvény tulajdonosa megkerüli az RLS-t ──
-- Ha nem kerülné meg, a lenti policy MINDEN profiles-olvasást megölne
-- (42P17 infinite recursion). Ilyenkor inkább az EGÉSZ tranzakció bukjon el.
DO $rekurzio_orszem$
DECLARE
  v_tulajdonos text;
BEGIN
  SELECT pg_get_userbyid(p.proowner) INTO v_tulajdonos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'profil_lathato_e';

  IF v_tulajdonos IS NULL THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — a profil_lathato_e függvény nem jött létre.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = v_tulajdonos AND (rolbypassrls OR rolsuper)
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — a profil_lathato_e tulajdonosa (%) NEM kerüli meg az RLS-t (nincs BYPASSRLS/SUPERUSER). Az új profiles-policy végtelen rekurzióba futna és MINDEN bejelentkezést megbénítana. Küldd vissza a 0d. szakasz eredményét!',
      v_tulajdonos;
  END IF;

  RAISE NOTICE 'OK — a profil_lathato_e tulajdonosa (%) megkerüli az RLS-t, a policy biztonságosan létrehozható.', v_tulajdonos;
END
$rekurzio_orszem$;

CREATE INDEX IF NOT EXISTS idx_profile_roles_profile_id
  ON public.profile_roles (profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_diocese_id
  ON public.profiles (diocese_id) WHERE diocese_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_district_id
  ON public.profiles (district_id) WHERE district_id IS NOT NULL;

-- A policy NEVE SZÁNDÉKOSAN marad `profiles_read`.
-- INDOK: a még le nem futott member-portal P0 migráció preflightja a
-- profiles policy-NEVEK pontos halmazát ellenőrzi
-- ({profiles_insert, profiles_read, profiles_write} —
--  2026-07-17-member-portal-p0-auth-isolation.sql:625-631). Ha átneveznénk,
-- a P0 már a névlistán elbukna. Így csak a definíció-ellenőrzése
-- (`qual = 'true'`, ugyanott :644-651) fog eltérni — ott egy sort kell majd
-- hozzáigazítani, amikor a P0 sorra kerül. ⚠️ EZT JEGYEZD FEL: a P0 futtatása
-- ELŐTT a preflight `profiles_read` ágát frissíteni kell erre az új definícióra.
DROP POLICY IF EXISTS profiles_read ON public.profiles;
-- (A `role` oszlopnevet minősítve adjuk át — a ROLE PostgreSQL-kulcsszó, így
--  a `profiles.role` alak félreérthetetlen.)
CREATE POLICY profiles_read ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.profil_lathato_e(
      profiles.id,
      profiles.congregation_id,
      profiles.diocese_id,
      profiles.district_id,
      profiles.role
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 9. BIZTONSÁGI HÁLÓ — maradt-e bármi nyitott a fenti táblákon?
-- ────────────────────────────────────────────────────────────────────────────
-- A fenti DROP-ok ékezetes, szóközös policy-neveket használnak. Ha a
-- productionben akár egyetlen karakter eltér (más ékezet-normalizálás,
-- nem törhető szóköz), a `DROP ... IF EXISTS` NÉMÁN nem csinál semmit — és a
-- szivárgás megmaradna. Ez a blokk névre való hivatkozás NÉLKÜL, a policy
-- FELTÉTELE alapján takarít, szigorúan csak a felsorolt táblákon.

DO $halo$
DECLARE
  r record;
  v_db integer := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'szemely', 'leltar_tetelek', 'csaladlatogatas', 'monetar',
        'sirhely', 'sirhelyberles', 'sirhelyelhunyt', 'kiadasikiseroiv'
      )
      -- csak a TÉNYLEGESEN nyitott sorok; az INSERT-policy-k USING nélkül
      -- NORMÁLISAK, ezért a with_check-et is meg kell nézni
      AND (
        btrim(lower(COALESCE(qual, ''))) IN ('true', '(true)')
        OR (
          qual IS NULL
          AND btrim(lower(COALESCE(with_check, ''))) IN ('true', '(true)')
        )
      )
  LOOP
    RAISE NOTICE 'Biztonsági háló: nyitott policy törlése — %.%', r.tablename, r.policyname;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    v_db := v_db + 1;
  END LOOP;

  IF v_db = 0 THEN
    RAISE NOTICE 'Biztonsági háló: nem maradt nyitott policy a felsorolt táblákon. ✅';
  ELSE
    RAISE NOTICE 'Biztonsági háló: % további nyitott policy törölve.', v_db;
  END IF;
END
$halo$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 10. SZAKASZ — ELLENŐRZÉS A FUTÁS UTÁN                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 10a. ⭐ A FŐ BIZONYÍTÉK: maradt-e `USING (true)` policy gyülekezeti táblán?
--      VÁRT EREDMÉNY: ÜRES tábla (0 sor).
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(qual, '(nincs USING)') AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    btrim(lower(COALESCE(qual, ''))) IN ('true', '(true)')
    OR (qual IS NULL AND btrim(lower(COALESCE(with_check, ''))) IN ('true', '(true)'))
  )
  AND tablename IN (
    'szemely', 'leltar_tetelek', 'csaladlatogatas', 'monetar',
    'sirhely', 'sirhelyberles', 'sirhelyelhunyt', 'kiadasikiseroiv',
    'profiles', 'bealitas'
  )
ORDER BY tablename, policyname;

-- 10b. Az érintett táblák ÚJ policy-képe — így néz ki a helyes állapot.
--   VÁRT:
--     csaladlatogatas  → csaladlatogatas_access
--     kiadasikiseroiv  → kiadasikiseroiv_select
--     leltar_tetelek   → leltar_tetelek_access
--     monetar          → monetar_congregation_access
--     profiles         → profiles_insert, profiles_read (ÚJ feltétel), profiles_write
--     sirhely          → sirhely_select/insert/update/delete
--     sirhelyberles    → sirhelyberles_select/insert/update/delete
--     sirhelyelhunyt   → sirhelyelhunyt_select/insert/update/delete
--     szemely          → szemely_staff_select/insert/update/delete
--                        + szemely_cross_match_select (ÚJ, szűk kivétel)
--     event            → event_read (VÁLTOZATLAN — döntésre vár, lásd 7/b)
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(qual, '(nincs USING)') AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'szemely', 'leltar_tetelek', 'csaladlatogatas', 'monetar',
    'sirhely', 'sirhelyberles', 'sirhelyelhunyt', 'kiadasikiseroiv',
    'profiles', 'event'
  )
ORDER BY tablename, policyname;

-- 10c. Léteznek-e az új segédfüggvények, és a search_path le van-e pinelve?
SELECT p.proname AS fuggveny,
       pg_get_function_identity_arguments(p.oid) AS argumentumok,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS tulajdonos,
       p.proconfig AS beallitasok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('sirhely_temeto_hozzaferheto', 'sirhely_hozzaferheto',
                    'kiadas_hozzaferheto', 'profil_lathato_e',
                    'szemely_kereszt_egyezesben_lathato')
ORDER BY p.proname;
-- VÁRT: mind az 5 sor · security_definer = true · tulajdonos = postgres
--       · beallitasok = {"search_path=public, pg_temp"}

-- 10d. Az `anon` szerep továbbra sem kap semmit a magánadatokon?
--      VÁRT: ÜRES tábla.
SELECT table_name, grantee,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'PUBLIC')
  AND table_name IN (
    'szemely', 'leltar_tetelek', 'csaladlatogatas', 'monetar',
    'sirhely', 'sirhelyberles', 'sirhelyelhunyt', 'kiadasikiseroiv', 'profiles'
  )
GROUP BY table_name, grantee
ORDER BY table_name;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 11. FÜST-TESZT — ezt AZ APPBAN kell végigkattintani a futás után         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Jelentkezz be EGY GYÜLEKEZETI LELKÉSZ profillal (nem adminnal!), és nézd meg:
--
--  [ ] 1.  Tagnyilvántartás → a taglista betöltődik, a létszám ugyanannyi,
--          mint a javítás előtt. Egy tag megnyitása (személyi karton) működik,
--          új tag felvétele és mentése működik.
--  [ ] 2.  Leltár → a leltári tételek listája nem üres, új tétel felvehető,
--          a leltári fisa nyomtatási előnézete kigenerálódik.
--  [ ] 3.  Temető / Sírhelyek → a temetők listája megvan, egy temetőt
--          megnyitva a parcellák/sírhelyek látszanak, a bérlet és az
--          elhunyt adatai megjelennek. Új sírhely és új bérlet rögzíthető.
--          ⚠️ HA ITT ÜRES A LISTA: a temetőd `congregation_id`-ja hiányzik —
--          futtasd a 0f. lekérdezést, az megmutatja.
--  [ ] 4.  Pénzügy → Monetár fül → a címletek megjelennek, a korábban
--          mentett darabszámok betöltődnek, új pillanatfelvétel MENTHETŐ
--          (mentés után újratöltve ugyanazt látod).
--  [ ] 5.  Családlátogatás → a látogatások listája megvan, új rögzíthető.
--  [ ] 6.  Profil / fejléc → a saját neved, e-mailed, avatárod megjelenik;
--          a profilválasztó (/valassz-profilt) felajánlja a szerepeidet.
--  [ ] 7.  Dokumentum-beküldés az egyházmegyének → a beküldés sikeres, ÉS az
--          esperes/egyházmegyei admin megkapja az app-értesítést
--          (ez a (9) „felfelé olvasás" ág próbája).
--  [ ] 8.  Éves jelentés generálása → lefut, a címzett-/aláíró-mezők
--          kitöltődnek (a (10) tisztségviselői ág próbája).
--  [ ] 9.  Missziós Műhely → Közösség/Ranglista → a más gyülekezetbeli
--          felhasználók neve látszik (szintén a (10) ág).
--  [ ] 10. Tagnyilvántartás → ha van kereszt-gyülekezeti egyezés-értesítés:
--          a párbeszédablakban a MÁSIK gyülekezet tagjának NEVE és egyházi
--          CNP-je megjelenik (ez a 2/b. `szemely_cross_match_select` próbája).
--          ⚠️ Ha itt üres név jelenik meg, a 2/b. szakasz nem fogott.
--  [ ] 11. Iktató → Átadás/átjelentkezés indítása egy MÁSIK gyülekezetbe →
--          a cél gyülekezet lelkésze megkapja az értesítést.
--
-- Utána jelentkezz be EGYHÁZKERÜLETI ADMIN profillal:
--  [ ] 12. /admin → Felhasználók: a saját kerületed felhasználói látszanak
--          (a más kerületbeliek NEM), és egy felhasználó megnyitható.
--  [ ] 13. /admin → Kérelmek / függő regisztrációk: a lista nem üres,
--          egy kérelem jóváhagyható (ez a (8) ág próbája).
--  [ ] 14. ⚠️ VÁRT ELTÉRÉS: a gyülekezetenkénti TAGLÉTSZÁM 0-t mutathat.
--          Ez NEM ennek a fájlnak a hibája — lásd a 2/c. szakaszt
--          (a kerületi admin ma is 0-t lát a pénzügyi összesítőkben).
--          Ha ez zavaró, a 2/c. kikommentelt policy adja meg a hozzáférést.
--
-- És végül EGY MÁSIK GYÜLEKEZET lelkészével:
--  [ ] 15. A tagnyilvántartásban CSAK a saját gyülekezete tagjai látszanak,
--          a temetői és leltári adatok is csak a sajátjai.
--
-- ⚠️ KÖVETŐ TEENDŐ (nem SQL): a webes offline gyorsítótár (Dexie/IndexedDB)
--    a korábbi, szűretlen szinkronból IDEGEN gyülekezetek sírhely-, bérlet- és
--    elhunyt-sorait tárolhatja a felhasználók böngészőjében. A policy ezt
--    visszamenőleg nem takarítja ki — a helyi tárolót üríteni kell
--    (offline gyorsítótár törlése / kijelentkezés + újraszinkron).
--
-- ── HA VALAMI ÜRESEN MARAD (gyors visszaállítás) ─────────────────────────────
-- A visszaállítás mindig EGY policy visszatétele. Például a profiles-nál:
--   DROP POLICY IF EXISTS profiles_read ON public.profiles;
--   CREATE POLICY profiles_read ON public.profiles
--     FOR SELECT TO authenticated USING (true);
--   NOTIFY pgrst, 'reload schema';
-- …majd küldd vissza, MELYIK felület maradt üres — a hiányzó ágat pótoljuk.
-- (A sírhely/monetár/kísérőív szakaszoknál a visszaállítás a régi nyitott
--  policy újra-létrehozása ugyanezzel a mintával: FOR ALL … USING (true).)
