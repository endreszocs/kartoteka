-- ###########################################################################
-- ##                                                                       ##
-- ##   ⛔⛔  T E R V E Z E T  —  E Z T   N E   F U T T A S D !  ⛔⛔        ##
-- ##                                                                       ##
-- ###########################################################################
--
-- Ez a fájl SZÁNDÉKOSAN NEM a migration-docs/sql/ mappában van: adversariális
-- bírálaton MEGBUKOTT (27 kifogás, ebből 5 BLOKKOLÓ). Azért maradt meg, mert az
-- elemzés értékes — de futtatva KÁRT OKOZNA.
--
-- A BLOKKOLÓ HIBÁK
-- ────────────────
-- 1) ⛔ ÖNMAGÁT BLOKKOLJA. A 0) megállító kapu nem ismeri a 3) lépés
--    engedélyezőlistáját. A `iktato_csatolmanyok_qr_insert_anon` policy
--    (2026-07-25-f8d-qr-feltoltes.sql:778) `TO anon` és hívja a
--    `qr_staging_upload_allowed()`-ot — ami RAJTA VAN az engedélyezőlistán.
--    A kapu mégis RAISE-zel megáll, és a teljes migráció visszagördül.
--    A hibaüzenet ráadásul olyan teendőt ír elő, ami nem oldja fel.
--
-- 2) ⛔ BEBETONOZNA EGY P0-t. Az 1) lépés minden függvényre EXPLICIT
--    `authenticated` grantot ad, amit ma bárki a PUBLIC-on át hívhat — köztük a
--    `custom_access_token_hook(jsonb)`-ra, ami SECURITY DEFINER, a HÍVÓ ÁLTAL
--    megadott user_id-re olvassa a `profiles`-t, és visszaadja a státuszt,
--    szerepkört, gyülekezetet. Ma ez ELTÁVOLÍTHATÓ örökölt PUBLIC-jog; a
--    migráció után TARTÓS, explicit ACL-bejegyzés lenne, amit egyetlen későbbi
--    `REVOKE … FROM PUBLIC` sem venne le. A migráció tehát a saját célja ellen
--    dolgozna.
--    → Ezt a P0-t KÜLÖN, szűk fájl zárja:
--      migration-docs/sql/2026-09-05-token-hook-p0-zaras.sql
--
-- 3) ⛔ PROKIND-ASZIMMETRIA, két irányban is:
--    (a) A `REVOKE … ON ALL FUNCTIONS` a Postgres-ben KITERJED az
--        aggregátumokra és ablakfüggvényekre, de NEM a procedúrákra. Az 1)
--        lépés viszont csak `('f','p')`-t ment át → egy egyedi aggregátum
--        NÉMÁN elveszítené az `authenticated` jogát, és egyik őrszem sem
--        venné észre (mindkettő `('f','p')`-vel szűr).
--    (b) Az 1) lépés BEVESZI a procedúrákat, de `GRANT EXECUTE ON FUNCTION`-t
--        állít elő — a PG11+ ezt procedúrára ERROR-ral utasítja el, ami az
--        EGYETLEN tranzakció miatt az egész migrációt megbuktatná.
--    → Helyes: mindenhol `ROUTINE`, és `prokind IN ('f','p','a','w')`.
--
-- 4) ⛔ Az ENGEDÉLYEZŐLISTA KÉZI, és a mérés helyett feltevésen áll. Hiányzik
--    róla négy, anon-kulccsal hívott RPC: `public_site_context`,
--    `public_site_context_v2`, `public_sitemap_entries`,
--    `public_site_age_distribution`. Ma nem törnek el (a mérés szerint nem
--    léteznek élesben), de ha a séma elsodródott, az EGYETLEN publikált
--    gyülekezeti oldal elsötétülne — a site-loader csak a HIÁNYZÓ RPC-re
--    (42883) esik vissza, jogosultsági hibára (42501) NEM.
--
-- 5) ⛔ A NÉGY TALÁLAT CSAK az anon felé zárulna. Az 1) lépés a
--    `purge_recycle_bin`-nek és a `_resolve_or_create_*`-nak is explicit
--    `authenticated` grantot adna, holott a fájl fejléce azt ígéri, hogy
--    „a jog visszavonása megoldja". A `next_bizonylat_szam` ráadásul ÉLŐ
--    rpc-hívás bejelentkezve — ahhoz a TÖRZSBE kell hívó-ellenőrzés.
--
-- TOVÁBBI FONTOS KIFOGÁSOK (a teljes lista a 2026-09-05-i körben)
-- ────────────────────────────────────────────────────────────────
--  · A 0) kapu VAK a `{public}` (TO nélküli) policy-kra — pedig azok is
--    anonra vonatkoznak. A repóban 104 ilyen policy van.
--  · A 0) kapu LIKE-mintába teszi a függvénynevet ESCAPE nélkül; az `_`
--    a LIKE-ban JOKER, és a célfüggvények nevei tele vannak vele.
--  · `login_email_status` és `registration_email_info` RAJTA VAN az
--    engedélyezőlistán, holott az app MÁR NEM HASZNÁLJA őket (a login
--    actions.ts:44-48 kommentje kifejezetten leírja, hogy KIVETTÉK). Ezek
--    e-mail-felsoroló orákulumok — bezárni kell, nem újranyitni.
--  · Nincs mentés a KIINDULÓ ACL-ekről, tehát a művelet visszafordíthatatlan.
--  · Az `ALTER DEFAULT PRIVILEGES` kétszer szerepel, de mindkettő ugyanarra a
--    `postgres` szerepre — nem két biztosíték, hanem ismétlés.
--  · A fájl a két megnevezett gyökérokból csak az EGYIKET szünteti meg: az
--    élő `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE … TO authenticated`
--    érintetlen marad, tehát minden ÚJ függvény továbbra is némán hívható
--    lesz minden bejelentkezettből.
--
-- AMIT A BÍRÁLAT MEGERŐSÍTETT (nem kell javítani)
-- ───────────────────────────────────────────────
--  ✅ A trigger-függvények EXECUTE-jogát a Postgres a CREATE TRIGGER-nél
--     ellenőrzi, futáskor NEM — a PUBLIC-revoke tehát NEM állítja meg az
--     írási réteget.
--  ✅ A `p.oid::regprocedure::text` idézőjelezése helyes (magától idézőjelez
--     és séma-minősít; `%I`-vel viszont elromlana).
--  ✅ A `service_role` sértetlen marad; a tagi portál RPC-i helyesen NINCSENEK
--     az anon-listán (cookie-alapú szerver-klienssel, `authenticated`-ként futnak).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Az eredeti tervezet innentől változatlanul következik.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
--  FÜGGVÉNY-JOGOK: DENY-BY-DEFAULT + SZŰK ENGEDÉLYEZŐLISTA        (2026-09-05)
--  Fájl: migration-docs/sql/2026-09-05-fuggveny-jogok-deny-by-default.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠️ FUTTATÁS ELŐTT: docs/2026-09-05-secdef-fuggvenyek-kockazati-triazs.sql
--     A mért kiindulás: 89 SECURITY DEFINER függvényt hívhat a PUBLIC/anon.
--
--  MIÉRT
--  ─────
--  A PostgreSQL alapból EXECUTE-ot ad a PUBLIC-nak MINDEN új függvényre, és
--  élesben fut egy `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO
--  authenticated` is (2026-04-23-m0-HOTFIX-grants.sql:94). A megfordítást
--  egyetlen fájl tartalmazta (2026-07-17-member-portal-p0-auth-isolation.sql),
--  ami a mérés szerint ÉLESBEN NEM FUTOTT LE. Emiatt minden új függvény némán
--  nyilvánosan hívhatóvá válik — a védelem ma fájlonkénti kézi REVOKE-okon áll.
--
--  MIT ZÁR BE EZ A MIGRÁCIÓ (a triázs 4 VALÓDI találata)
--  ─────────────────────────────────────────────────────
--  A négy találat MINDEGYIKÉT a jog visszavonása oldja meg — egyik függvény
--  TÖRZSÉHEZ SEM nyúlunk. (Szándékos: a naptár-körben megtanultuk, hogy egy
--  CREATE OR REPLACE némán visszagörgetheti az élő állapotot.)
--
--   1) `record_pastor_tenure_start` — NULL-logikás kapumegkerülés:
--        IF NOT public.is_admin() AND auth.uid() <> p_user_id THEN RAISE …
--      anonnál `auth.uid()` NULL → `NULL <> p_user_id` = NULL →
--      `true AND NULL` = NULL → a PL/pgSQL a NULL feltételt HAMISNAK veszi →
--      a RAISE NEM sül el, és a függvény BEÍR a congregation_pastor_history-ba.
--      A rés CSAK akkor nyílik, ha auth.uid() NULL — vagyis pontosan az anon
--      hívónál. A jog elvételével elérhetetlenné válik.
--      ⏳ A törzs LOGIKAI hibája megmarad (védelem mélységben): külön körben a
--         NULL-hívót ELŐBB, KÜLÖN kell elutasítani.
--   2) `next_bizonylat_szam` — NULLA kapu, `utolso_szam + 1 RETURNING`:
--      bárki égethette bármely gyülekezet bizonylatszámait (a számadás
--      sorszám-folytonossága hivatalos követelmény).
--   3) `_resolve_or_create_locality` / `_resolve_or_create_street` (MINDKÉT
--      túlterhelés) — NULLA kapu, INSERT-elnek a címszótárba (adrlocality /
--      adrstreet). Belső segédek, kívülről sosem kellett volna hívhatónak lenniük.
--   4) `purge_recycle_bin` — NULLA hívó-ellenőrzés, romboló karbantartó job.
--
--  A LÉPÉSEK SORRENDJE KRITIKUS
--  ────────────────────────────
--  A `REVOKE … FROM PUBLIC` a bejelentkezett felhasználóktól IS elvenné a jogot
--  minden olyan függvénynél, amit ma a PUBLIC-on KERESZTÜL kapnak (explicit
--  grant nélkül). Ezért ELŐBB átmentjük a meglévő hozzáférést EXPLICIT grantba
--  az `authenticated` és a `service_role` szerepre, és CSAK AZUTÁN vonunk vissza.
--  Így a migráció az ő szemszögükből NULLA viselkedés-változás.
--
--  ⚠️ AMIHEZ NEM NYÚLUNK: az RLS-segédek (`current_user_can_access_congregation`
--  stb.) POLICY-ból hívódnak, a HÍVÓ jogán. Ezek az 1) lépésben megkapják az
--  explicit `authenticated` grantot, tehát a jogosultsági rendszer nem áll meg.
--  A 0) lépés MEGÁLLÍTÓ KAPUJA külön ellenőrzi, hogy egyetlen anon-nak szóló
--  policy sem hív függvényt — ha hívna, a migráció leáll, mert az anon-revoke
--  megbénítaná az adott policy-t.
--
--  CSAK JOGOKAT ÍR. Egyetlen függvény törzsét sem módosítja, adatot nem érint.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 0) MEGÁLLÍTÓ KAPU: hív-e bármely anon-policy függvényt?
-- ───────────────────────────────────────────────────────────────────────────
DO $kapu_anon_policy$
DECLARE
  v_talalat text;
BEGIN
  SELECT string_agg(
           p.schemaname || '.' || p.tablename || ' / ' || p.policyname
           || ' → ' || COALESCE(f.proname, '?'), E'\n')
    INTO v_talalat
  FROM pg_policies p
  CROSS JOIN LATERAL (
    SELECT pr.proname
    FROM pg_proc pr
    JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public'
      AND pr.proname <> ''
      -- a policy kifejezésében NÉV SZERINT szerepel-e a függvény
      AND (COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, ''))
          LIKE '%' || pr.proname || '(%'
    LIMIT 1
  ) f
  WHERE p.roles::text LIKE '%anon%';

  IF v_talalat IS NOT NULL THEN
    RAISE EXCEPTION
      'MEGALLITVA: van anon-nak szolo policy, ami FUGGVENYT hiv. Az anon-revoke utan ez a policy hibara futna, es a hozza tartozo tabla anon-olvasasa MEGALLNA. Erintettek: % | TEENDO: vedd fel az erintett fuggvenyt az ENGEDELYEZOLISTABA (3. lepes), vagy ird at a policy-t fuggvenyhivas nelkulire.',
      v_talalat;
  END IF;

  RAISE NOTICE '0) Anon-policy kapu: rendben, egyetlen anon-policy sem hiv fuggvenyt.';
END;
$kapu_anon_policy$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) ÁTMENTÉS: ami MA hívható authenticated / service_role szerepből, az
--    EXPLICIT grantot kap — hogy a PUBLIC-revoke ne vegye el tőlük.
-- ───────────────────────────────────────────────────────────────────────────
DO $atmentes$
DECLARE
  r        record;
  v_auth   int := 0;
  v_svc    int := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure::text AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
           has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')          -- függvény + eljárás, aggregátum nem
  LOOP
    IF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
      v_auth := v_auth + 1;
    END IF;
    IF r.svc_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      v_svc := v_svc + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '1) Atmentve EXPLICIT grantba: % fuggveny -> authenticated, % -> service_role.',
    v_auth, v_svc;
END;
$atmentes$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A VISSZAVONÁS
-- ───────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Hogy az EZUTÁN létrehozott függvények se örököljék a PUBLIC-jogot.
-- (A `FOR ROLE postgres` azért kell, mert a migrációkat az futtatja.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ENGEDÉLYEZŐLISTA: amit az anon-nak TÉNYLEGESEN hívnia kell.
--    Csak NÉV szerint sorolunk (a túlterheléseket mind megkapja), és csak
--    akkor grantolunk, ha a függvény LÉTEZIK — így a fájl olyan környezetben
--    is lefut, ahol valamelyik még nincs telepítve.
-- ───────────────────────────────────────────────────────────────────────────
DO $engedelyezolista$
DECLARE
  v_nevek text[] := ARRAY[
    -- regisztráció / belépés előtti, bejelentkezés nélküli utak
    'check_access_request_rate_limit',
    'congregations_for_registration',
    'login_email_status',
    'registration_email_info',
    -- a NYILVÁNOS gyülekezeti weboldal (/gy/<slug>)
    'public_site_stats',
    'public_site_tisztsegek',
    'public_site_events',
    'public_site_events_v2',
    'public_site_congregation_fallback',
    'public_site_identitas',
    -- token-alapú naptár-feed (a token maga a hitelesítő)
    'public_calendar_feed',
    -- QR-es feltöltés (a token maga a hitelesítő)
    'qr_session_lookup',
    'qr_register_upload',
    'qr_staging_upload_allowed'
  ];
  r          record;
  v_db       int := 0;
  v_hianyzo  text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_nevek)
      AND p.prokind IN ('f', 'p')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    v_db := v_db + 1;
  END LOOP;

  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_hianyzo
  FROM unnest(v_nevek) AS x(nev)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = x.nev
  );

  RAISE NOTICE '3) Engedelyezolista: % fuggveny(-tulterheles) kapott anon EXECUTE-ot.', v_db;
  IF v_hianyzo IS NOT NULL THEN
    RAISE NOTICE '3b) A listabol NEM LETEZIK (nem hiba, csak jelzes): %', v_hianyzo;
  END IF;
END;
$engedelyezolista$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) ŐRSZEM — negatív ÉS pozitív asszertekkel
-- ───────────────────────────────────────────────────────────────────────────
DO $orszem_jogok$
DECLARE
  v_maradt   text;
  v_elveszett text;
  v_negy     text;
BEGIN
  -- (a) NEGATÍV: a négy talalat NEM lehet tobbe anon-hivhato.
  SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname) INTO v_negy
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('record_pastor_tenure_start', 'next_bizonylat_szam',
                      '_resolve_or_create_locality', '_resolve_or_create_street',
                      'purge_recycle_bin')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_negy IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM (a): a NEGY TALALAT kozul meg mindig anon-hivhato: %', v_negy;
  END IF;

  -- (b) NEGATÍV: a PUBLIC-nak nem maradhat oroklott EXECUTE-ja.
  SELECT count(*)::text INTO v_maradt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND (p.proacl IS NULL
         OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
  IF v_maradt <> '0' THEN
    RAISE EXCEPTION 'ORSZEM (b): % fuggvenynek MEG MINDIG van PUBLIC EXECUTE joga.', v_maradt;
  END IF;

  -- (c) POZITÍV: a bejelentkezett felhasznalo NEM vesztett jogot.
  --     Minden fuggvenynek, aminek van explicit ACL-je, hivhatonak kell
  --     maradnia authenticated-bol — az 1) lepes ezt garantalta.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_elveszett
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND p.proname IN ('current_user_can_access_congregation',
                      'current_user_can_edit_congregation',
                      'current_user_congregation_id',
                      'current_user_is_active_staff',
                      'current_user_has_global_access',
                      'is_admin', 'is_master_admin', 'is_user_approved',
                      'same_congregation', 'profil_lathato_e')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_elveszett IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM (c): az RLS-segedek elvesztettek az authenticated jogot (a jogosultsagi rendszer megallna): %', v_elveszett;
  END IF;

  -- (d) POZITÍV: az engedelyezolista MINDEN LETEZO eleme hivhato anon-bol.
  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_elveszett
  FROM unnest(ARRAY['check_access_request_rate_limit','congregations_for_registration',
                    'public_site_stats','public_site_tisztsegek','public_site_events_v2',
                    'public_site_congregation_fallback','public_site_identitas',
                    'public_calendar_feed','qr_session_lookup']) AS x(nev)
  WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname='public' AND p.proname = x.nev)
    AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname='public' AND p.proname = x.nev
                      AND has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_elveszett IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM (d): az engedelyezolista elemei NEM hivhatok anon-bol (a nyilvanos oldal / regisztracio allna meg): %', v_elveszett;
  END IF;

  RAISE NOTICE '4) ORSZEM: mind a negy ellenorzes rendben.';
END;
$orszem_jogok$;

-- PostgREST séma-újratöltés (a jogváltozás a REST-rétegben is érvényesüljön).
-- ⚠️ Ismert hibaosztály: DDL után percekig jöhet 503-vihar a forgalmas
--    végpontokon. MAGÁTÓL GYÓGYUL — ne rollbackelj reflexből, előbb curl-próba.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  ZÁRÓ RÁCS — EGYETLEN eredménytábla (a szerkesztő csak az UTOLSÓT mutatja)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM (

SELECT 1 AS sorszam, 'Anon-hivhato SECURITY DEFINER fuggvenyek szama' AS lepes,
  (SELECT count(*)::text || ' db  (a migracio ELOTT: 89)'
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')) AS allapot

UNION ALL
SELECT 2, 'A NEGY TALALAT anon-jogosultsaga',
  COALESCE((SELECT string_agg(p.proname || ' = ' ||
              CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE')
                   THEN 'MEG MINDIG HIVHATO' ELSE 'lezarva' END, E'\n' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public'
              AND p.proname IN ('record_pastor_tenure_start','next_bizonylat_szam',
                                '_resolve_or_create_locality','_resolve_or_create_street',
                                'purge_recycle_bin')),
           'egyik sem letezik')

UNION ALL
SELECT 3, 'Engedelyezolista - anon-bol hivhato',
  COALESCE((SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND has_function_privilege('anon', p.oid,'EXECUTE')),
           'EGYIK SEM - ez HIBA lenne')

UNION ALL
SELECT 4, 'Maradt-e PUBLIC EXECUTE (0 a helyes)',
  (SELECT count(*)::text || ' db'
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prokind IN ('f','p')
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                     WHERE a.grantee = 0 AND a.privilege_type='EXECUTE')))

UNION ALL
SELECT 5, 'Az RLS-segedek authenticated-bol hivhatok maradtak',
  COALESCE((SELECT string_agg(p.proname || ' = ' ||
              CASE WHEN has_function_privilege('authenticated', p.oid,'EXECUTE')
                   THEN 'ok' ELSE 'ELVESZETT!' END, E'\n' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public'
              AND p.proname IN ('current_user_can_access_congregation',
                                'current_user_is_active_staff','is_admin')),
           'nem merheto')

UNION ALL
SELECT 6, 'Alapertelmezett jogok (uj fuggvenyek nem oroklik a PUBLIC-ot)',
  COALESCE((SELECT string_agg(DISTINCT d.defaclacl::text, ' | ')
            FROM pg_default_acl d
            JOIN pg_namespace n ON n.oid = d.defaclnamespace
            WHERE n.nspname='public' AND d.defaclobjtype='f'),
           'nincs bejegyzes - ellenorizd kezzel')

UNION ALL
SELECT 7, 'KOVETO FELADAT',
  ('1) A `record_pastor_tenure_start` NULL-logikai hibaja MEGMARADT a torzsben '
   || '(csak elerhetetlenne valt). Kulon korben: a NULL-hivot ELOBB, KULON kell '
   || 'elutasitani - `IF auth.uid() IS NULL THEN RAISE …`. '
   || '2) A `congregations_select` policy USING(true) TOVABBRA IS kiadja minden '
   || 'bejelentkezettnek MINDEN gyulekezet calendar_feed_token-jet - a naptar-res '
   || 'VEGLEG csak ennek szukitesevel zar. '
   || '3) Ha barmely feluleten "permission denied for function" hibat latsz, az '
   || 'erintett fuggvenyt vedd fel a 3. lepes engedelyezolistajaba, es futtasd ujra.')::text

) q ORDER BY sorszam;
