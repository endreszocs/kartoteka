-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B5+B7 · B12 · TRUNCATE-TAKARÍTÁS — JOGOSULTSÁGOK RENDEZÉSE   2026-08-25 ║
-- ║ Fájl: migration-docs/sql/2026-08-25-b5-b7-b12-jogok.sql                 ║
-- ║ Terv: docs/ESZREVETELEK-TERV-2026-08-22.md — 2. pont                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT JAVÍT EZ A FÁJL
-- ════════════════════════════════════════════════════════════════════════════
--
-- Három, egymással összefüggő találatot — mindhármat az ÉLŐ adatbázison
-- ellenőriztük (2026-08-25), nem migrációs fájlokból következtettük.
--
-- ── B5+B7 · A `congregations` tábla nyitva áll a bejelentkezetlen szerepnek ──
--    Az élő állapot:
--        congregations_select   roles={public}   using=true
--        anon jogai: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--    Az `anon` a BEJELENTKEZÉS NÉLKÜLI szerep. A táblán ott van az IBAN, az
--    adószám, a TVA-kód, a bank, az e-mail, a telefon, a cím, a naptár-token,
--    a pecsét- és aláírás-URL.
--
-- ── ⛔⛔ A TRUNCATE — ez a legsúlyosabb, és nem is szerepelt az eredeti
--    átvilágítás 17 találata között ────────────────────────────────────────
--    A PostgreSQL-ben a sor-szintű védelem (RLS) a SELECT / INSERT / UPDATE /
--    DELETE műveletekre él. A TRUNCATE TÁBLA-SZINTŰ parancs: kizárólag a
--    TRUNCATE jogosultság dönt róla. Akinek megvan, az az RLS-től FÜGGETLENÜL
--    kiürítheti a táblát — hiába `relrowsecurity = true`.
--
--    Az élő állapot: NYOLC táblán van TRUNCATE jog, hétnek az `anon` is:
--        anon + authenticated : befizetescel, congregations, csoport,
--                               kiadascel, nevnap, nom_cimlet, szamadasicel
--        csak authenticated   : logger
--
--    Vagyis egy bejelentkezés nélküli kérés kiüríthetné az ország gyülekezet-
--    törzsadatát vagy a közös számlatükröt.
--
-- ── B12 · A pénzügyi tételek nyers DELETE-tel törölhetők ────────────────────
--    Az `authenticated` DELETE jogot kap a `befizetes`, `kiadas`,
--    `belsomozgas` és `oblio_szamlak` táblákra. A rendszer kanonikus törlése
--    ezzel szemben SOFT delete (Kuka + `deleted_at` + audit). A meglévő
--    szűkítő policy-k (`mfa_opt_in_aal2`) 2FA-KAPUK, nem törlés-védelem, az
--    `oblio_szamlak`-on pedig egyáltalán nincs szűkítő policy.
--    Következmény: a sor FIZIKAILAG eltűnik — a Kukában sem jelenik meg.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HATÁSVIZSGÁLAT — MIÉRT BIZTONSÁGOS EZ A MIGRÁCIÓ
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A jogosultság elvétele a legkönnyebben visszaütő művelet: ha egy legitim
--    kódút használja, az némán vagy hangosan eltörik. Ezért mindhárom elvételt
--    VISSZAMÉRTÜK a forráskódon, nem feltételeztük.
--
-- (1) KELL-E AZ `anon`-NAK A `congregations`? — NEM. Három forrásból igazolva:
--     · a regisztrációs űrlap a `congregations_for_registration()` RPC-t hívja
--       (apps/web/components/public/access-request-form.tsx:94). Az a függvény
--       SECURITY DEFINER (2026-06-04b-access-request-congregation.sql:32-42),
--       tehát a TULAJDONOS jogával fut, és csak (id, name, diocese_id)-t ad
--       vissza. `GRANT EXECUTE … TO anon` már megvan (:47) — a tábla-szintű
--       jogra nincs szüksége.
--     · a hozzáférés-kérő szerver-akció (`(public)/hozzaferes-kerese/
--       actions.ts:202`) `adminClient`-tel olvas, azaz service_role-lal.
--     · a publikus gyülekezeti oldal a SAJÁT tábláiból dolgozik
--       (public_sites, public_posts, public_magazines…). A kódja külön ki is
--       mondja: „a kliens nem olvassa közvetlenül a teljes congregations
--       táblát" ((public)/gy/[slug]/tagi-portal/public-congregation.ts:15).
--
-- (2) HASZNÁL-E AZ APP NYERS `DELETE`-ET a négy pénzügyi táblán? — NEM.
--     A teljes `apps/` + `packages/` fán a `.delete()` hívások közül a pénzügy
--     környékén három van, és MINDHÁROM MÁS táblát céloz:
--       · penzugy/monetary-actions.ts:181        → `monetar`
--       · penzugy/oblio-ellenorzes-actions.ts:223 → `oblio_kiadas_match`
--       · penzugy/tartozas-actions.ts:159       → `congregation_annual_fees`
--     A négy érintett táblára (`befizetes`, `kiadas`, `belsomozgas`,
--     `oblio_szamlak`) EGYETLEN nyers DELETE sincs.
--
-- (3) A TÖMEGES TÖRLŐ FÜGGVÉNYEKET NEM ÉRINTI. A `wipe_congregation_data` és
--     társai SECURITY DEFINER-ek, tehát a TULAJDONOS jogával futnak — rájuk az
--     `authenticated`-től való elvétel nem hat. (Ezt a 2. szakasz ellenőrzi is.)
--
-- (4) A TRUNCATE / REFERENCES / TRIGGER JOGOKAT AZ ALKALMAZÁS SOHA NEM
--     HASZNÁLJA. A PostgREST nem ad rájuk felületet, és a forrásban sincs
--     nyoma. Az elvételük nem tud eltörni semmit.
--
-- (5) A `service_role` JOGAIHOZ NEM NYÚLUNK — a napi mentés és a visszaállítás
--     azzal dolgozik. Egyetlen `REVOKE` sem érinti.
--
-- ════════════════════════════════════════════════════════════════════════════
-- AMIT SZÁNDÉKOSAN NEM VESZÜNK EL — ezek a jogok LEGITIMEK
-- ════════════════════════════════════════════════════════════════════════════
--   anon INSERT : access_requests                      (hozzáférés-kérő űrlap)
--   anon SELECT : adrcountry, adrcounty, adrlocality,
--                 adrstreet                            (címkereső a regisztrációhoz)
--   anon SELECT : public_sites, public_posts, public_magazines,
--                 public_magazine_issues, public_site_themes,
--                 mm_kategoriak                        (publikus gyülekezeti oldal)
-- Ezek a táblák a PUBLIKUS felület saját adatai — nem belső törzsadat.
--
-- ════════════════════════════════════════════════════════════════════════════
-- FUTTATÁS: 0. SZAKASZ → 1. SZAKASZ → 2. SZAKASZ, ebben a sorrendben.
-- A 2. szakasz eredményét küldd vissza.
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                              FUTTATÁS: 1.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Semmit nem módosít. Azt méri, hogy a javítás ELŐTTI állapot áll-e fenn.
-- Ha minden sor már ✅, a migrációt nem kell lefuttatni.

SELECT
  'anon jogai a congregations-ön' AS mit,
  COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
            FROM information_schema.role_table_grants
            WHERE table_schema='public' AND table_name='congregations' AND grantee='anon'),
           '‹nincs›') AS ertek,
  'Várt a javítás ELŐTT: teljes lista. UTÁN: ‹nincs›. Igazolva: a publikus oldal RPC-n és service_role-on át dolgozik.' AS teendo
UNION ALL
SELECT
  'TRUNCATE-jogot adó táblák (anon vagy authenticated)',
  COALESCE((SELECT string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
            FROM information_schema.role_table_grants
            WHERE table_schema='public' AND privilege_type='TRUNCATE'
              AND grantee IN ('anon','authenticated')), '‹egy sem›'),
  'Várt a javítás ELŐTT: 8 tábla. UTÁN: ‹egy sem›. A TRUNCATE-re az RLS NEM vonatkozik.'
UNION ALL
SELECT
  'DELETE-jog a négy pénzügyi táblán (authenticated)',
  COALESCE((SELECT string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
            FROM information_schema.role_table_grants
            WHERE table_schema='public' AND privilege_type='DELETE' AND grantee='authenticated'
              AND table_name IN ('befizetes','kiadas','belsomozgas','oblio_szamlak')), '‹egy sem›'),
  'Várt a javítás ELŐTT: mind a négy. UTÁN: ‹egy sem›. Igazolva: az app egyiken sem hív nyers DELETE-et.'
UNION ALL
SELECT
  'A megtartandó, LEGITIM anon-jogok megvannak-e?',
  COALESCE((SELECT string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
            FROM information_schema.role_table_grants
            WHERE table_schema='public' AND grantee='anon'
              AND table_name IN ('access_requests','adrcountry','adrcounty','adrlocality',
                                 'adrstreet','public_sites','public_posts','public_magazines',
                                 'public_magazine_issues','public_site_themes','mm_kategoriak')),
           '‹egy sem›'),
  'REGRESSZIÓ-ŐR: ezeknek a javítás UTÁN is meg kell maradniuk — ezek a publikus felület saját adatai.'
UNION ALL
SELECT
  'A congregations_for_registration() RPC létezik és anon hívhatja?',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='congregations_for_registration'
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  THEN '✅ igen' ELSE '⛔ NEM — ÁLLJ MEG!' END,
  '⛔ BLOKKOLÓ: ha ez NEM ✅, akkor az anon-jog elvétele ELTÖRNÉ a regisztrációs űrlapot. Ilyenkor ne futtasd az 1. szakaszt, hanem szólj.'
ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                   FUTTATÁS: 2.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Egyetlen tranzakció. Ha bármelyik lépés hibázik, az EGÉSZ visszagördül.

BEGIN;

-- ── 1/A. A TRUNCATE, REFERENCES és TRIGGER jog elvétele MINDEN publikus
--         táblán, mindkét kliens-szerepről.
--
-- Miért az EGÉSZ sémára, és nem csak a nyolc táblára? Mert a nyolc tábla nem
-- kivétel volt, hanem MARADÉK: a 2026-04-17-i szigorítás kézi felsorolás volt,
-- és ami azóta született, az ugyanígy kimaradt. A séma-szintű elvétel
-- egyszerre rendezi a jelent, az 1/C pedig a jövőt.
-- Ezeket a jogokat az alkalmazás soha nem használja (lásd a hatásvizsgálat 4. pontját).

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;


-- ── 1/B. A `congregations` teljes lezárása a bejelentkezetlen szerep elől.
--
-- Nem oszlop-szintű szűkítés, hanem TELJES elvétel: a hatásvizsgálat (1) pontja
-- szerint az `anon`-nak semmilyen joga nem kell ezen a táblán. A publikus
-- felület a `congregations_for_registration()` SECURITY DEFINER RPC-n át kapja
-- meg a jegyzéket, a szerver-oldali olvasás pedig service_role-lal megy.

REVOKE ALL ON public.congregations FROM anon;

-- A sor-szintű policy `TO` záradék nélkül a PUBLIC szerepre szól (tehát az
-- anon-ra is). A GRANT elvétele után ez már nem ad hozzáférést, de a szándékot
-- a policy szintjén is kimondjuk — így nem lesz félreérthető a következő
-- olvasónak, és egy jövőbeli, figyelmetlen GRANT sem nyitja vissza.
DROP POLICY IF EXISTS congregations_select ON public.congregations;
CREATE POLICY congregations_select
  ON public.congregations
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY congregations_select ON public.congregations IS
  'A gyülekezet-JEGYZÉK a bejelentkezett felhasználóknak látszik (név, besorolás). '
  '2026-08-25: a policy KORÁBBAN TO záradék nélkül állt, ezért a PUBLIC (anon) '
  'szerepre is vonatkozott, és a táblán ott az IBAN, adószám, naptár-token is. '
  'A publikus felületnek NINCS rá szüksége: a regisztrációs űrlap a '
  'congregations_for_registration() SECURITY DEFINER RPC-t hívja.';


-- ── 1/C. ⭐ A TARTÓS JAVÍTÁS: az ALAPÉRTELMEZETT JOGOK.
--
-- Enélkül a KÖVETKEZŐ új tábla ugyanígy születne meg, és fél év múlva ez a kör
-- megismétlődne — pontosan ez történt a 2026-04-17-i kézi felsorolás után.
--
-- ⚠️ Az ALTER DEFAULT PRIVILEGES a LÉTREHOZÓ szerepre van kötve. A Supabase-en
-- a táblákat tipikusan a `postgres` szerep hozza létre; a `FOR ROLE postgres`
-- ezt célozza. Ha a te környezetedben más a tulajdonos, a 2. szakasz 5. sora
-- ezt kimutatja, és akkor ott pótoljuk.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;


-- ── 1/D. B12 — a nyers DELETE elvétele a pénzügyi tételekről.
--
-- A rendszer kanonikus törlése SOFT delete (Kuka + deleted_at + audit). A nyers
-- DELETE megkerülte mindhármat: a sor fizikailag eltűnt, a Kukában sem jelent
-- meg, és mivel nem szerver-akció futott, audit-bejegyzés sem keletkezett.
-- Igazolva (hatásvizsgálat 2. pont): az app egyetlen nyers DELETE-et sem hív
-- ezeken a táblákon.

REVOKE DELETE ON public.befizetes     FROM authenticated;
REVOKE DELETE ON public.kiadas        FROM authenticated;
REVOKE DELETE ON public.belsomozgas   FROM authenticated;
REVOKE DELETE ON public.oblio_szamlak FROM authenticated;

-- Mélységi védelem: SZŰKÍTŐ (RESTRICTIVE) policy, ami akkor is tagad, ha egy
-- jövőbeli, figyelmetlen GRANT visszaadná a jogot. A szűkítő policy-k
-- ÉS-kapcsolatban állnak a megengedőkkel — ez tehát felülbírálhatatlan.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['befizetes','kiadas','belsomozgas','oblio_szamlak'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_nincs_nyers_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)',
      t || '_nincs_nyers_delete', t);
    EXECUTE format(
      'COMMENT ON POLICY %I ON public.%I IS %L',
      t || '_nincs_nyers_delete', t,
      'A törlés kizárólag SOFT delete (Kuka + deleted_at + audit). A nyers DELETE '
      'megkerülte mindhármat. A SECURITY DEFINER wipe-függvényeket ez NEM érinti: '
      'azok a tulajdonos jogával futnak. 2026-08-25 (B12).');
  END LOOP;
END $$;


-- ── 1/E. ŐRSZEM — NEGATÍV ASSZERT a tranzakción belül.
--
-- A projekt munkaszabálya: őrszem negatív asszert nélkül vak. Itt nem elég
-- kimondani, hogy „elvettük a jogot" — bizonyítani kell, hogy TÉNYLEG nincs meg.
-- Ha bármelyik állítás nem teljesül, az EGÉSZ migráció visszagördül.

DO $$
DECLARE
  v_truncate int;
  v_anon_cong int;
  v_delete int;
  v_legitim int;
BEGIN
  SELECT count(*) INTO v_truncate
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND privilege_type='TRUNCATE'
    AND grantee IN ('anon','authenticated');

  SELECT count(*) INTO v_anon_cong
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='congregations' AND grantee='anon';

  SELECT count(*) INTO v_delete
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND privilege_type='DELETE' AND grantee='authenticated'
    AND table_name IN ('befizetes','kiadas','belsomozgas','oblio_szamlak');

  -- REGRESSZIÓ-ŐR: a publikus felület jogai NEM tűnhettek el.
  SELECT count(DISTINCT table_name) INTO v_legitim
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon'
    AND table_name IN ('access_requests','adrcountry','adrcounty','adrlocality',
                       'adrstreet','public_sites','public_posts','public_magazines',
                       'public_magazine_issues','public_site_themes','mm_kategoriak');

  IF v_truncate > 0 THEN
    RAISE EXCEPTION 'ŐRSZEM: még % TRUNCATE-jog maradt anon/authenticated szerepen — a migráció NEM ért célt.', v_truncate;
  END IF;
  IF v_anon_cong > 0 THEN
    RAISE EXCEPTION 'ŐRSZEM: az anon szerepnek még % joga van a congregations táblán.', v_anon_cong;
  END IF;
  IF v_delete > 0 THEN
    RAISE EXCEPTION 'ŐRSZEM: még % DELETE-jog maradt a pénzügyi táblákon.', v_delete;
  END IF;
  IF v_legitim < 11 THEN
    RAISE EXCEPTION 'ŐRSZEM (REGRESSZIÓ): a publikus felület anon-jogaiból csak % tábla maradt a várt 11-ből — TÚL SOKAT vettünk el, a publikus oldal eltörne.', v_legitim;
  END IF;

  RAISE NOTICE 'ŐRSZEM: mind a négy mérce teljesül (TRUNCATE=0, anon/congregations=0, pénzügyi DELETE=0, publikus jogok=% tábla).', v_legitim;
END $$;

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                   FUTTATÁS: 3.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- EGYETLEN lekérdezés (a Supabase editor csak az utolsó eredményt mutatja).
-- Az eredményt küldd vissza.

SELECT 1 AS sorrend,
  'TRUNCATE-jog anon/authenticated szerepen' AS mit,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                        WHERE table_schema='public' AND privilege_type='TRUNCATE'
                          AND grantee IN ('anon','authenticated'))
       THEN '✅ egy sem' ELSE '⛔ MARADT: ' ||
            (SELECT string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
             FROM information_schema.role_table_grants
             WHERE table_schema='public' AND privilege_type='TRUNCATE'
               AND grantee IN ('anon','authenticated')) END AS ertek,
  'A TRUNCATE-re az RLS NEM vonatkozik — ezért kellett a jogot elvenni.' AS teendo
UNION ALL
SELECT 2, 'anon jogai a congregations-ön',
  COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ')
            FROM information_schema.role_table_grants
            WHERE table_schema='public' AND table_name='congregations' AND grantee='anon'),
           '✅ egy sem'),
  'A regisztráció a congregations_for_registration() RPC-n át kapja a jegyzéket.'
UNION ALL
SELECT 3, 'congregations_select policy szerepköre',
  COALESCE((SELECT roles::text FROM pg_policies
            WHERE schemaname='public' AND tablename='congregations'
              AND policyname='congregations_select'), '‹nincs policy›'),
  'Várt: {authenticated}. Korábban {public} volt — az anon-ra is vonatkozott.'
UNION ALL
SELECT 4, 'DELETE-jog a négy pénzügyi táblán',
  COALESCE((SELECT string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
            FROM information_schema.role_table_grants
            WHERE table_schema='public' AND privilege_type='DELETE' AND grantee='authenticated'
              AND table_name IN ('befizetes','kiadas','belsomozgas','oblio_szamlak')),
           '✅ egy sem'),
  'A törlés kizárólag SOFT delete (Kuka + audit).'
UNION ALL
SELECT 5, 'szűkítő DELETE-policy a pénzügyi táblákon',
  COALESCE((SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_policies
            WHERE schemaname='public' AND permissive='RESTRICTIVE' AND cmd='DELETE'
              AND policyname LIKE '%nincs_nyers_delete%'), '⛔ egy sem'),
  'Várt: mind a négy. Mélységi védelem egy jövőbeli, figyelmetlen GRANT ellen.'
UNION ALL
SELECT 6, 'REGRESSZIÓ-ŐR: a publikus felület anon-jogai',
  (SELECT count(DISTINCT table_name)::text || ' tábla'
   FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='anon'
     AND table_name IN ('access_requests','adrcountry','adrcounty','adrlocality',
                        'adrstreet','public_sites','public_posts','public_magazines',
                        'public_magazine_issues','public_site_themes','mm_kategoriak')),
  '⚠️ Várt: 11 tábla. Ha kevesebb, a publikus gyülekezeti oldal vagy a regisztráció eltörhetett — SZÓLJ.'
UNION ALL
SELECT 7, 'a SECURITY DEFINER wipe-függvények érintetlenek?',
  COALESCE((SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.prosecdef AND p.proname LIKE 'wipe%'),
           '‹egy sem›'),
  'Ezek a TULAJDONOS jogával futnak — a REVOKE nem érinti őket. A Veszélyes zóna működik tovább.'
UNION ALL
SELECT 8, 'alapértelmezett jogok (a JÖVŐ táblái)',
  COALESCE((SELECT count(*)::text || ' bejegyzés' FROM pg_default_acl d
            JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'),
           '0 bejegyzés'),
  'Ha 0, az ALTER DEFAULT PRIVILEGES más tulajdonos-szerepre kell — szólj, és pótoljuk.'
ORDER BY sorrend;


-- ════════════════════════════════════════════════════════════════════════════
-- MI VÁLTOZIK A FELHASZNÁLÓ SZÁMÁRA
-- ════════════════════════════════════════════════════════════════════════════
-- SEMMI. Egyetlen felület sem használta az elvett jogokat:
--   · a TRUNCATE / REFERENCES / TRIGGER jogokra nincs felület és nincs kódút;
--   · az anon congregations-jogát a regisztráció RPC-vel váltja ki;
--   · nyers DELETE-et a pénzügyi táblákon az app soha nem hívott.
--
-- Ha valami MÉGIS eltörne, az azt jelenti, hogy van egy kódút, amit a
-- hatásvizsgálat nem talált meg. A visszaállítás ilyenkor egyszerű:
--   GRANT DELETE ON public.<tábla> TO authenticated;
--   DROP POLICY <tábla>_nincs_nyers_delete ON public.<tábla>;
-- — de előbb szólj, mert akkor azt a kódutat kell RPC-be terelni, nem a
-- jogot visszaadni.
-- ════════════════════════════════════════════════════════════════════════════
