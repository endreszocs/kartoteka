-- ==========================================================================
-- KARTOTEKA - A NAPTAR-FEEDEK HIANYZO KAPUI                     (2026-09-05)
-- Fajl: migration-docs/sql/2026-09-05-naptar-feed-kapuk.sql
-- v2 - a biralat utan ATIRVA: a torzsek a MAI ELO valtozatbol indulnak.
-- ==========================================================================
-- [!] FUTTATAS ELOTT KOTELEZO:
--     docs/2026-09-05-nyilvanos-reteg-allapotfelmeres.sql
--     A migracios fajl NEM bizonyitek az eles torzsre (ismert hibaosztaly).
--
-- MIT RONTOTT EL AZ ELSO VALTOZAT
-- -------------------------------
-- A 2026-08-26 / 2026-08-11-es torzsekbol indult, holott a
-- 2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql MA lefutott elesben
-- (_RUN_LOG.md:31-37, racs 15/15). A CREATE OR REPLACE tehat nem foltozott
-- volna, hanem VISSZAGORDITETT. Ez a valtozat a MAI elo torzsekbol indul:
--   public_calendar_feed = V3 (a hivatkozott fajl 337-395. sora)
--   lelkeszi_naptar_feed = V2 (uo. 541-683. sor)
-- Amit igy MEGTARTUNK (es amit az elso valtozat neman elvett volna):
--  (1) p.tipus NOT IN (szabadsag,kereszteles,eskuvo,konfirmacio,temetes) -
--      a magan-tipusok kizarasa. Az apps/web/lib/calendar/ics.ts:218-223
--      KIFEJEZETTEN az SQL-RPC-t nevezi kanonikus forrasnak; a TS-szuro csak
--      masodlagos vedvonal a regi RPC-verzio ellen.
--  (2) naptar_szemely_alap(v_cong) - ezen at jon a tagallapot-szuro
--      (member_status NOT IN elkoltozott/kitert/torolt). Nelkule egy
--      elkoltozott/kitert/torolt tag NEVE visszakerulne a lelkesz
--      Google-naptaraba: adatvedelmi VISSZALEPES lett volna.
--  (3) naptar_szemely_nevnapok(v_cong) - ekezet- es tagolasfuggetlen
--      nevnap-egyeztetes (Anna Maria -> Anna).
-- Az ORSZEM 1 es 3 mostantol NEGATIV ASSZERTET is tartalmaz ezekre, hogy a
-- kovetkezo CREATE OR REPLACE se tudja oket neman visszavenni.
--
-- MIT JAVIT EZ A FAJL
-- -------------------
-- 1) public_calendar_feed - a token-alapu ICS-feed (anon is hivhatja, tehat a
--    token birtokosa az alkalmazas megkerulesevel is).
--    (a) P0: a megjegyzes (BELSO, lelkigondozoi jegyzet) MINDIG kiment. A
--        calendar_feed_reszletes opt-in csak JELZOKENT utazott vissza; a
--        tenyleges szures az app-retegben elt (route.ts:65 includeNotes).
--    (b) UGYANEZ a leiras-ra. Az ics.ts:231-232 MINDKET mezot az includeNotes
--        moge teszi, az SQL viszont csak a megjegyzest zarta volna. Az
--        alkalmazas-uton ez NULLA viselkedes-valtozas, a KOZVETLEN RPC-hivason
--        viszont bezar egy nyitva maradt rest.
--    (c) Nem nezte a congregations.status-t, holott minden mas publikus RPC
--        c.status = active-ot kovetel.
--
-- 2) lelkeszi_naptar_feed - a PRIVAT feed: NEVEKET es evfordulokat ad.
--    (a) SEHOL nem nezte a profiles.status-t. A haz kanonikus mintaja
--        (current_user_congregation_id) mindig nezi; a 2026-09-04-es P0.2 kor
--        ezt zarta be az is_admin kapuknal - ez a feed kimaradt onnan.
--    (b) A profiles.congregation_id fallback ag SZURETLEN volt: se statusz-,
--        se szerepkor-feltetel. A VISSZAVONAS NEM ALLT MEG a feednel.
--    [!] OSZINTE BESZED A FALLBACKROL. A profile_roles_scope_id_check CHECK
--        (2026-04-17-profile-roles-fazis-1.sql:89-92) kimondja: scope <>
--        system eseten a scope_id NEM lehet NULL. Ha ez a CHECK elesben all,
--        akkor v_role_cnt = 0 eseten SEMMILYEN elo gyulekezeti szerepkor nem
--        letezhet -> a fallback ag SOHA nem fut le, a hatokor kizarolag a
--        profile_roles-bol jon. A fallbackot ezert NEM allitjuk be ugy,
--        mintha hatokort ADNA: csak azt oldja fel, aminek a scope_id-ja
--        HIANYZIK. A 15. racssor MEGMERI, letezik-e egyaltalan ilyen sor.
--
-- AMIT A BIRALAT UTAN KIVETTUNK: a publikus = true SZURO
-- ------------------------------------------------------
-- KIKERULT, mert TERMEK-DONTES, nem P0, es Endre jovahagyasa nelkul
-- visszafordithatatlan adatvesztest okozna. A bizonyitek:
--  * A publikus kapcsolo a NYILVANOS WEBOLDALT kapuzza: felirata szo szerint
--    "Megjelenhet a gyulekezet weboldalan" (program-dialog.tsx:679), uj
--    program alapertelmezese false (uo.:161), az oszlop NOT NULL DEFAULT
--    false (2026-08-26-presbiterium-tisztsegek.sql:303).
--  * A nyilvanos oldal LETOLTHETO naptarfajlja KULON utvonal
--    (apps/web/app/(public)/gy/[slug]/naptar.ics/route.ts), es a sajat
--    fejlec-kommentje mondja ki, hogy AZT a kaput a public_site_events_v2
--    tartja "programonkenti publikus" feltetellel. A szuro tehat MAR OTT VAN,
--    a helyen - nem itt hianyzik.
--  * A token-feed BIZALMAS belso hivatkozas: a felulet "Naptar-hivatkozas
--    (tartsd bizalmasan)" felirattal adja ki (google-calendar-dialog.tsx:153)
--    es azt igeri, hogy "minden itt rogzitett program ... automatikusan
--    megjelenik" (uo.:134-139).
--  * A szuro NULLA biztonsagi rest zar: a token kitalalhatatlan, a
--    magan-tipusok mar kizarva (V3), a jegyzet pedig itt zarul be. Csereben a
--    Google/Apple elofizetes a feedbol eltunt VEVENT-eket TORLI - a MAR
--    SZINKRONIZALT regi alkalmak is eltunnenek a lelkeszek telefonjarol.
-- HA MEGIS KELL (kulon kor, Endre jovahagyasaval): uj
-- congregations.calendar_feed_csak_publikus boolean NOT NULL DEFAULT false
-- opt-in + a dialogus szovegenek atirasa + csak azutan
-- AND (NOT v_csak_publikus OR p.publikus = true).
--
-- AMI MARAD KOCKAZATNAK: a c.status = active kapu
-- -----------------------------------------------
-- A congregations_status_check szerint a statusz CSAK active vagy inactive
-- lehet (2026-06-05k-inactive-congregations.sql:32) - deleted es suspended
-- ertek NEM letezik, ezert a biralatban javasolt c.status <> deleted alak
-- NEM-MUVELET volna (mindig igaz), vagyis nem kapu. Marad az = active.
-- VISZONT: a mark_inactive_congregations() NAPI CRON-nal fut, es 1 ev
-- aktivitas-hiany utan AUTOMATIKUSAN inactive-ra allit (uo.:40-70) - egy
-- csendes, csak naptarat hasznalo gyulekezet igy magatol 404-be futhatna.
-- EZERT az 1/b szakasz NEM csak mer, hanem MEGALLITJA a migraciot (RAISE
-- EXCEPTION) es NEV SZERINT kiirja az erintetteket. Ures lista -> zavartalan.
--
-- MI NINCS EBBEN A FAJLBAN (szandekosan)
-- --------------------------------------
--  * NINCS sema-szintu REVOKE ... FROM PUBLIC az osszes fuggvenyre.
--  * NINCS token-lejarat es NINCS tomeges-olvasas naplozas.
--  * [!] A MEGJEGYZES-RES CSAK FELIG ZAR ITT. A congregations_select policy
--    USING (true) minden BEJELENTKEZETT felhasznalonak kiadja MINDEN
--    gyulekezet sorat - benne a calendar_feed_token-t es a
--    calendar_feed_reszletes-t (2026-08-25-b5-b7-b12-jogok.sql:191-196;
--    meres: 2026-09-04-auth-p0-javitasok-2.sql:276). Egy IDEGEN gyulekezet
--    felhasznaloja kiolvashatja a tokent, es ha a celgyulekezet reszletes
--    kapcsoloja BE van kapcsolva, a jegyzetet tovabbra is megkapja. Az opt-in
--    GYULEKEZET-szintu, nem NEZO-szintu. A res VEGLEG csak a policy
--    szukitesevel zar. A 14. racssor megmeri, hany gyulekezetet erint MA.
--  * NINCS alkalmazas-oldali javitas. ASZIMMETRIA: a lelkeszi token KIADASA
--    (apps/web/lib/auth/effective-access.ts:509-511) ugyanazt a szuretlen
--    fallbackot hasznalja -> az app kiadhat olyan linket, amit a feed elutasit.
--  * CDN-KESLELTETES: a token-feed sikeres valasza Cache-Control:
--    public, s-maxage=3600, stale-while-revalidate=7200 fejlecet visz
--    (route.ts:70-71), tehat a jegyzet-szivargas lezarasa a MAR KIADOTT
--    valaszokra 1-3 ora keslelteteassel hat. Ha ez nem elfogadhato, a kisero
--    PR-ban az s-maxage-et ideiglenesen 0-ra kell venni. Ugyanott a hibaagak
--    (route.ts:37, :44-47, :52) kapjanak no-store-t: ez a migracio UJ 404-eket
--    termel.
--
-- SZERZODES, AMIT NEM SZABAD ELTORNI
-- ----------------------------------
--  * A jsonb KULCSKESZLETE VALTOZATLAN. A leiras es a megjegyzes kulcs
--    MEGMARAD, csak az ERTEKUK lesz NULL - a TypeScript oldal kulcsokat olvas
--    (ics.ts:232), es a Program tipusban a mezo KOTELEZO (dashboard.ts:163).
--    Nincs zod-validacio: minden fogyaszto puszta `as` tipus-allitassal
--    dolgozik, tehat egy hianyzo kulcs NEM hibazna, hanem NEMAN rossz adatot
--    adna.
--  * A status ERTEKKESZLETE valtozatlan:
--    not_found | ambiguous_scope | no_scope | ok.
--  * A SECURITY DEFINER, a SET search_path, a volatilitas es a REVOKE/GRANT
--    harmas MINDKET fuggvenynel ujra ki van adva (a CREATE OR REPLACE nem
--    orzi meg a korabbi REVOKE-ot).
--
-- [!] A FELMERES 9. SORA A JAVITAS UTAN IS FIGYELMEZTET. A
--     docs/2026-09-05-nyilvanos-reteg-allapotfelmeres.sql:135-137 az
--     ILIKE '%megjegyzes%' alapjan dont - a javitott torzsben a szo BENNE
--     MARAD (kulcsnevkent es a kapuban is), ezert ott ezutan is
--     "megjegyzes kimegy: IGEN" fog allni. A MERVADO ennek a fajlnak a 3.
--     racssora. A "publikus-szuro: NINCS" sem hiba: azt SZANDEKOSAN nem
--     tesszuk be.
--
-- [!] A KISERO PR-NAK A REGI FAJLT IS ERINTENIE KELL. A
--     2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql 9. es 12. racssora
--     ezutan is ZOLD marad (a torzsek konvergalnak) - de az a fajl ETTOL
--     KEZDVE NEM FUTTATHATO UJRA valtozatlanul, mert a benne levo CREATE OR
--     REPLACE visszavenne a statusz-, leiras-, megjegyzes- es
--     fallback-kapukat. Ez a mondat a _RUN_LOG.md-be is bekerul.
--
-- IDEMPOTENS es UJRAFUTTATHATO (csak CREATE OR REPLACE + COMMENT + ACL).
-- NINCS TEMP tabla. NINCS dupla szazalekjel a RAISE-ekben. NINCS CREATE TABLE
-- (a backup_table_policy besorolast nem erinti).
-- [!] A vegen NOTIFY pgrst - szamits nehany perces PostgREST 503-ablakra.
--     MAGATOL GYOGYUL, ne rollbackelj reflexbol.
-- FUTTATAS: Supabase -> SQL Editor -> az EGESZ fajl egyszerre -> Run.
-- ==========================================================================


-- ==========================================================================
-- 0. SZAKASZ - ELOFELTETELEK (fail-fast)
-- ==========================================================================
DO $elofeltetelek$
DECLARE
  v_hianyzo text;
BEGIN
  SELECT string_agg(x.mit, ', ' ORDER BY x.mit) INTO v_hianyzo
  FROM (
    SELECT 'congregations.status' AS mit
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='congregations' AND column_name='status')
    UNION ALL
    SELECT 'congregations.calendar_feed_token'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='congregations' AND column_name='calendar_feed_token')
    UNION ALL
    SELECT 'congregations.calendar_feed_reszletes'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='congregations' AND column_name='calendar_feed_reszletes')
    UNION ALL
    SELECT 'profiles.status'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='status')
    UNION ALL
    SELECT 'profile_roles.active'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profile_roles' AND column_name='active')
    UNION ALL
    SELECT 'profile_roles.approval_status'
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profile_roles' AND column_name='approval_status')
    UNION ALL
    -- A 2026-09-05-i kor KOZOS fuggvenyei. Ha nincsenek meg, a lelkeszi feed
    -- V2 torzse futasidoben hibazna - FAIL-FAST, ne csendben.
    SELECT 'naptar_szemely_alap(uuid) [2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql]'
    WHERE to_regprocedure('public.naptar_szemely_alap(uuid)') IS NULL
    UNION ALL
    SELECT 'naptar_szemely_nevnapok(uuid) [ugyanaz a fajl]'
    WHERE to_regprocedure('public.naptar_szemely_nevnapok(uuid)') IS NULL
  ) x;

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION 'ELOFELTETEL HIANYZIK: %. Elobb a 2026-06-05k / 2026-08-26 / 2026-04-17 / 2026-09-05-naptar-anyakonyv-szabadsag-nevnap migraciok kellenek.', v_hianyzo;
  END IF;
END
$elofeltetelek$;


-- ==========================================================================
-- 1/a. SZAKASZ - MERES A VALTOZTATAS ELOTT (nem modosit)
-- ==========================================================================
DO $meres_elotte$
DECLARE
  v_token_db    int;
  v_prog_kimegy int;
  v_reszl_db    int;
BEGIN
  SELECT count(*) INTO v_token_db
  FROM public.congregations WHERE calendar_feed_token IS NOT NULL;

  -- KANONIKUS FELTETEL-BLOKK (A). Ugyanez all a fuggveny torzseben es az
  -- ORSZEM 2 varakozasaban. HA EGYIKET MODOSITOD, MODOSITSD MIND A HARMAT -
  -- kulonben az or a sajat, HELYES migraciojat buktatja meg.
  SELECT count(*) INTO v_prog_kimegy
  FROM public.gyulekezeti_programok p
  JOIN public.congregations c ON c.id = p.congregation_id
  WHERE c.calendar_feed_token IS NOT NULL
    AND p.datum >= make_date(EXTRACT(year FROM now())::int - 5, 1, 1)
    AND p.tipus NOT IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes');

  SELECT count(*) INTO v_reszl_db
  FROM public.congregations
  WHERE calendar_feed_token IS NOT NULL
    AND COALESCE(calendar_feed_reszletes, false) = true;

  RAISE NOTICE 'MERES: % gyulekezetnek van naptar-tokenje.', v_token_db;
  RAISE NOTICE 'MERES: az 5 eves ablakban % program megy ki a token-feedbe (a magan tipusok mar most kizarva). EZ A SZAM NEM VALTOZIK: a publikus-szurot a biralat utan KIVETTUK.', v_prog_kimegy;
  RAISE NOTICE 'MERES: % gyulekezetnel all BE a calendar_feed_reszletes - ott a jegyzet ezutan is kimegy a tokenre (tudatos opt-in). Amig a congregations_select policy USING(true), ennyi gyulekezet jegyzete erheto el barmely bejelentkezett felhasznalonak.', v_reszl_db;
END
$meres_elotte$;


-- ==========================================================================
-- 1/b. SZAKASZ - MEGALLITO KAPU a c.status = active bevezetese elott
--   Nem eleg MERNI egy olyan valtozast, ami ELO naptarakat urit ki. Ha van
--   tokennel rendelkezo, NEM aktiv gyulekezet, a migracio ITT MEGALL es NEV
--   SZERINT kiirja oket. (A statusz CSAK active/inactive lehet, es az
--   inactive-ot a napi cron adja 1 ev tetlenseg utan - nem megszunes.)
-- ==========================================================================
DO $megallito_kapu$
DECLARE
  v_nevek text;
  v_db    int;
BEGIN
  SELECT count(*),
         string_agg(COALESCE(c.nev_hu, c.name, c.id::text), ', '
                    ORDER BY COALESCE(c.nev_hu, c.name, c.id::text))
    INTO v_db, v_nevek
  FROM public.congregations c
  WHERE c.calendar_feed_token IS NOT NULL
    AND c.status IS DISTINCT FROM 'active';

  IF v_db > 0 THEN
    RAISE EXCEPTION 'MEGALLITVA: % tokennel rendelkezo gyulekezet NEM aktiv statuszu, ezert a c.status = active kapu utan a naptar-feedjuk 404-re valtana, es a mar szinkronizalt alkalmak TORLODNENEK a telefonjukrol. Erintettek: %. TEENDO: Endre dontson - vagy allitsd vissza a statuszukat aktivra (a mark_inactive_congregations cron 1 ev tetlenseg utan jelol, nem megszunest jelent), vagy tudatosan vallalva kommenteld ki EZT az 1/b blokkot, es a _RUN_LOG.md-be ird be, mely gyulekezetek feedje allt le.', v_db, v_nevek;
  END IF;

  RAISE NOTICE 'MEGALLITO KAPU: nincs tokennel rendelkezo, nem aktiv gyulekezet - a status-kapu SENKIT nem ejt ki.';
END
$megallito_kapu$;


-- ==========================================================================
-- 1/c. SZAKASZ - a lelkeszi tokenek hatasanak PONTOS bontasa
--   A biralat jogos: a korabbi egyetlen szam se nem also, se nem felso
--   korlat volt. Kulon szamoljuk, kit MI ejt ki, es kulon jelezzuk, ki bukik
--   MA IS (azokat nem ez a migracio szunteti meg).
-- ==========================================================================
DO $meres_lelkeszi$
DECLARE
  v_ossz         int;
  v_statusz      int;
  v_nincs_szerep int;
  v_ma_is_409    int;
BEGIN
  IF to_regclass('public.lelkeszi_naptar_token') IS NULL THEN
    RAISE NOTICE 'MERES: a lelkeszi_naptar_token tabla NEM LETEZIK. A fuggveny attol meg lecserelodik, de amig a tabla nincs meg, a lelkeszi feed futasidoben hibazik.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_ossz FROM public.lelkeszi_naptar_token;

  -- (1) UJ kieses: a profil maga nem aktiv (vagy nincs is profil).
  SELECT count(*) INTO v_statusz
  FROM public.lelkeszi_naptar_token t
  LEFT JOIN public.profiles pr ON pr.id = t.user_id
  WHERE pr.id IS NULL OR pr.status IS DISTINCT FROM 'active';

  -- (2) UJ kieses: a profil AKTIV, de nincs egyetlen jovahagyott+aktiv
  --     gyulekezeti szerepkore sem -> eddig a szuretlen fallback atengedte.
  SELECT count(*) INTO v_nincs_szerep
  FROM public.lelkeszi_naptar_token t
  JOIN public.profiles pr ON pr.id = t.user_id AND pr.status = 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profile_roles r
    WHERE r.profile_id = t.user_id AND r.scope = 'congregation'
      AND r.approval_status = 'approved' AND r.active = true);

  -- (3) NEM ez a migracio ejti ki oket: tobb gyulekezetnel MA IS 409.
  SELECT count(*) INTO v_ma_is_409
  FROM public.lelkeszi_naptar_token t
  WHERE (SELECT count(DISTINCT r.scope_id) FROM public.profile_roles r
         WHERE r.profile_id = t.user_id AND r.scope = 'congregation'
           AND r.scope_id IS NOT NULL AND r.approval_status = 'approved'
           AND r.active = true) > 1;

  RAISE NOTICE 'MERES: osszesen % lelkeszi naptar-token.', v_ossz;
  RAISE NOTICE 'MERES (UJ kieses 1): % token tulajdonosanak a PROFILJA nem aktiv.', v_statusz;
  RAISE NOTICE 'MERES (UJ kieses 2): % token tulajdonosa aktiv, de NINCS jovahagyott+aktiv gyulekezeti szerepkore - eddig a szuretlen fallback engedte at.', v_nincs_szerep;
  RAISE NOTICE 'TAJEKOZTATO (NEM ez a migracio ejti ki): % token tulajdonosa tobb gyulekezethez tartozik, tehat MA IS ambiguous_scope, HTTP 409.', v_ma_is_409;
END
$meres_lelkeszi$;


-- ==========================================================================
-- 2. SZAKASZ - public_calendar_feed (V4)
--   ALAP: a 2026-09-05-i ELO V3 torzs. Valtozas: (1) c.status = active kapu,
--   (2) a leiras es a megjegyzes csak a reszletes feedben kap erteket.
--   A magan-tipus kizarasa VALTOZATLANUL bent marad.
-- ==========================================================================
BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.public_calendar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $public_calendar_feed$
DECLARE
  v_cong_id   uuid;
  v_cong_nev  text;
  v_reszletes boolean;
  v_programs  jsonb;
BEGIN
  -- 1. KAPU (2026-09-05): a token stimmel ES a gyulekezet AKTIV. Ugyanaz a
  -- feltetel, mint minden mas publikus RPC-ben. Inaktiv gyulekezetnel
  -- szandekosan not_found megy vissza (a route 404-e), hogy a
  -- status-ertekkeszlet ne valtozzon a TypeScript oldalon.
  SELECT c.id,
         COALESCE(c.nev_hu, c.name),
         COALESCE(c.calendar_feed_reszletes, false)
  INTO v_cong_id, v_cong_nev, v_reszletes
  FROM public.congregations c
  WHERE c.calendar_feed_token = p_token
    AND c.status = 'active';

  IF v_cong_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'cim', p.cim,
    -- 2. KAPU (2026-09-05, P0): a leiras es a megjegyzes CSAK tudatos
    -- opt-innel. A KULCSOK szandekosan megmaradnak (a TypeScript szerzodes
    -- kulcsokat olvas), csak az ERTEKUK lesz NULL. Eddig a szures kizarolag
    -- az app-retegben elt (ics.ts:231-232 mindkettot az includeNotes moge
    -- teszi), igy az anon kulccsal KOZVETLENUL hivo token-birtokos akkor is
    -- megkapta a lelkigondozoi jegyzetet, ha a gyulekezet nem kerte.
    'leiras', CASE WHEN v_reszletes THEN p.leiras ELSE NULL END,
    'megjegyzes', CASE WHEN v_reszletes THEN p.megjegyzes ELSE NULL END,
    'helyszin', p.helyszin,
    'tipus', p.tipus,
    'egyedi_tipus_nev', p.egyedi_tipus_nev,
    'egyedi_emoji', p.egyedi_emoji,
    'datum', p.datum,
    'datum_vege', p.datum_vege,
    'ido_kezdes', p.ido_kezdes,
    'ido_befejezes', p.ido_befejezes,
    'ismetlodes_tipus', p.ismetlodes_tipus,
    'ismetlodes_vege', p.ismetlodes_vege,
    'prioritas', p.prioritas,
    'updated_at', p.updated_at
  ) ORDER BY p.datum), '[]'::jsonb)
  INTO v_programs
  FROM public.gyulekezeti_programok p
  WHERE p.congregation_id = v_cong_id
    -- KANONIKUS FELTETEL-BLOKK (A) - lasd az 1/a szakasz figyelmeztetesét.
    AND p.datum >= make_date(EXTRACT(year FROM now())::int - 5, 1, 1)
    -- 2026-09-05: a MAGAN tipusok nem mennek a megosztott gyulekezeti feedbe
    -- - a szabadsag a lelkesz szemelyes ugye, a tervezett keresztelo/eskuvo/
    -- konfirmacio/temetes cime szemelynevet hordozhat (fail-closed).
    -- [!] EZ A SOR A 2026-09-05-i ELO V3-BOL VALO. NE VEDD KI: az
    -- ics.ts:218-223 kifejezetten EZT nevezi kanonikus forrasnak, a TS-szuro
    -- csak masodlagos vedvonal a regi RPC-verzio ellen.
    AND p.tipus NOT IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes');

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', v_cong_nev,
    'reszletes', v_reszletes,
    'programs', v_programs
  );
END;
$public_calendar_feed$;

COMMENT ON FUNCTION public.public_calendar_feed(uuid) IS
  'Nyilvanos naptar-feed adatforras az /api/calendar/<token> ICS-feedhez. '
  'Verzio: V4, 2026-09-05 (eredet: V3, 2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql). '
  'NEGY KAPU: (1) csak status = active gyulekezet; (2) a MAGAN tipusok '
  '(szabadsag, kereszteles, eskuvo, konfirmacio, temetes) SOHA nem mennek ki - '
  'ez a V3-bol valo kanonikus kizaras; (3) a leiras es (4) a megjegyzes CSAK '
  'akkor kap valodi erteket, ha a gyulekezet calendar_feed_reszletes kapcsoloja '
  'igaz - egyebkent a kulcs megmarad, de az erteke NULL. '
  'NINCS publikus = true szuro: az a NYILVANOS weboldal kapuja '
  '(public_site_events_v2 + /gy/<slug>/naptar.ics), ez a feed viszont a '
  'gyulekezet bizalmas, TELJES naptara - a ketto szandekosan KET KULONBOZO termek. '
  'A jsonb kulcskeszlete rogzitett szerzodes a TypeScript oldallal: 4 gyoker-kulcs '
  '(status, congregation_name, reszletes, programs) es 16 program-kulcs. '
  'FIGYELEM: a jegyzet-res VEGLEG csak a congregations_select policy szukitesevel '
  'zar (ma USING(true) -> a token es a reszletes-kapcsolo minden bejelentkezettnek latszik).';

-- A CREATE OR REPLACE nem orzi meg a korabbi REVOKE-ot.
REVOKE ALL ON FUNCTION public.public_calendar_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_calendar_feed(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_calendar_feed(uuid) TO authenticated;

-- --- ORSZEM 1 (forras: POZITIV es NEGATIV asszert) ------------------------
DO $orszem_feed_forras$
DECLARE
  v_src     text;
  v_kod     text;   -- v_src KOMMENTEK NELKUL (lasd lentebb)
  v_hianyzo text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'public_calendar_feed' LIMIT 1;

  -- [!] HIBAOSZTALY (2026-09-05): a prosrc a KOMMENTEKET is tartalmazza.
  -- Az elso futasnal az ORSZEM 3 a SAJAT figyelmezteto kommentjere talalt ra
  -- ('NE ird vissza ... n.nev1 = s.k_nev'), es megbuktatta a helyes migraciot.
  -- Minden mintakereses ezentul a KOD-ONLY valtozaton megy.
  v_kod := regexp_replace(COALESCE(v_src, ''), '--[^' || chr(10) || ']*', '', 'g');

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'ORSZEM 1: a public_calendar_feed NEM LETEZIK a csere utan.';
  END IF;

  SELECT string_agg(x.mit, ' | ' ORDER BY x.mit) INTO v_hianyzo
  FROM (
    SELECT '(1) aktiv-gyulekezet kapu' AS mit
    WHERE strpos(v_kod, 'c.status = ' || chr(39) || 'active' || chr(39)) = 0
    UNION ALL
    -- NEGATIV ASSZERT a 2026-09-05-i korre: ha valaki egy regi torzset ir
    -- vissza, ITT alljon meg, ne elesben deruljon ki.
    SELECT '(2) MAGAN-TIPUS KIZARAS (a 2026-09-05-i V3 vivmanya) - VISSZAGORGETES!'
    WHERE strpos(v_kod, 'NOT IN (' || chr(39) || 'szabadsag' || chr(39)) = 0
    UNION ALL
    SELECT '(3) leiras opt-in kapu'
    WHERE strpos(v_kod, 'CASE WHEN v_reszletes THEN p.leiras') = 0
    UNION ALL
    SELECT '(4) megjegyzes opt-in kapu'
    WHERE strpos(v_kod, 'CASE WHEN v_reszletes THEN p.megjegyzes') = 0
  ) x;

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 1: a public_calendar_feed torzsebol hianyzik: %', v_hianyzo;
  END IF;

  -- A publikus-szuronak NEM szabad bekerulnie: ha valaki visszateszi, alljunk
  -- meg, mert az ELO naptarakat urit ki (termek-dontes, Endre jovahagyasa kell).
  IF strpos(v_kod, 'p.publikus = true') > 0 THEN
    RAISE EXCEPTION 'ORSZEM 1: a torzsben ott a publikus-szuro. Ez SZANDEKOSAN nincs benne (a token-feed a gyulekezet TELJES naptara; a publikus jelzo a NYILVANOS weboldal kapuja). Ha tudatos a valtoztatas, elobb Endre hagyja jova, es a fejlec-komment is frissuljon.';
  END IF;

  -- KULCSKESZLET-SZERZODES.
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hianyzo
  FROM unnest(ARRAY[
    'status','congregation_name','reszletes','programs',
    'id','cim','leiras','megjegyzes','helyszin','tipus','egyedi_tipus_nev',
    'egyedi_emoji','datum','datum_vege','ido_kezdes','ido_befejezes',
    'ismetlodes_tipus','ismetlodes_vege','prioritas','updated_at'
  ]) k
  WHERE strpos(v_kod, chr(39) || k || chr(39)) = 0;

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 1: ELTUNTEK a jsonb-kulcsok (a TypeScript szerzodes torne): %', v_hianyzo;
  END IF;
END
$orszem_feed_forras$;

-- --- ORSZEM 2 (VISELKEDES - nem a forrast nezi, hanem lefuttatja) ---------
DO $orszem_feed_viselkedes$
DECLARE
  r         record;
  v_feed    jsonb;
  v_vart    int;
  v_kapott  int;
  v_szivar  int;
  v_hiba    text := NULL;
  v_elteres text;
  v_elvart  text[] := ARRAY['status','congregation_name','reszletes','programs'];
  v_elvartp text[] := ARRAY['id','cim','leiras','megjegyzes','helyszin','tipus',
                            'egyedi_tipus_nev','egyedi_emoji','datum','datum_vege',
                            'ido_kezdes','ido_befejezes','ismetlodes_tipus',
                            'ismetlodes_vege','prioritas','updated_at'];
  v_feed_db int := 0;  -- hany feeden futott le a vizsgalat
  v_prog_db int := 0;  -- ebbol hanyon volt legalabb egy program
  v_sziv_db int := 0;  -- hany NEM reszletes feeden futott a szivargas-or
BEGIN
  FOR r IN
    SELECT c.id, c.calendar_feed_token AS token,
           COALESCE(c.calendar_feed_reszletes, false) AS reszletes
    FROM public.congregations c
    WHERE c.calendar_feed_token IS NOT NULL AND c.status = 'active'
    ORDER BY c.id LIMIT 50
  LOOP
    v_feed := public.public_calendar_feed(r.token);
    v_feed_db := v_feed_db + 1;

    IF v_feed->>'status' IS DISTINCT FROM 'ok' THEN
      v_hiba := 'egy AKTIV, tokennel rendelkezo gyulekezet feedje nem ok statuszt adott';
      EXIT;
    END IF;

    -- (a) a gyoker kulcskeszlete HALMAZKENT egyezzen. A biralat jogos: a
    -- rendezett tombos osszevetes KOLLACIOFUGGO volt; a szerzodes a kulcsok
    -- HALMAZA, nem a sorrendjuk.
    SELECT string_agg(k, ', ') INTO v_elteres FROM (
      SELECT k FROM unnest(v_elvart) k WHERE NOT jsonb_exists(v_feed, k)
      UNION ALL
      SELECT k FROM jsonb_object_keys(v_feed) k WHERE NOT (k = ANY(v_elvart))
    ) d;
    IF v_elteres IS NOT NULL THEN
      v_hiba := 'a gyoker kulcskeszlete elterert a szerzodestol: ' || v_elteres;
      EXIT;
    END IF;

    -- (b) a programszam PONTOSAN a kimeno programok szama legyen.
    -- KANONIKUS FELTETEL-BLOKK (A) - SZO SZERINT ugyanaz, mint a torzsben.
    -- [!] A magan-tipus kizarasnak ITT IS bent kell lennie, kulonben az or a
    --     SAJAT, HELYES migraciojat buktatna meg.
    SELECT count(*) INTO v_vart
    FROM public.gyulekezeti_programok p
    WHERE p.congregation_id = r.id
      AND p.datum >= make_date(EXTRACT(year FROM now())::int - 5, 1, 1)
      AND p.tipus NOT IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes');

    v_kapott := jsonb_array_length(COALESCE(v_feed->'programs', '[]'::jsonb));

    IF v_kapott <> v_vart THEN
      v_hiba := 'a feed ' || v_kapott || ' programot adott, de ' || v_vart
                || ' programnak kellene kimennie (magan tipusok nelkul)';
      EXIT;
    END IF;

    -- (c) NEM reszletes feedbol EGYETLEN belso jegyzet es leiras sem
    -- szivaroghat ki. [!] EZ AZ ELLENORZES A PROGRAM-TOMBTOL FUGGETLENUL
    -- LEFUT (ures tombnel is ertelmes allitas) - a biralat jogosan
    -- kifogasolta, hogy korabban a "van legalabb egy program" agba volt
    -- temetve, ahol a gyakorlatban szinte sosem futott le.
    IF NOT r.reszletes THEN
      v_sziv_db := v_sziv_db + 1;
      SELECT count(*) INTO v_szivar
      FROM jsonb_array_elements(COALESCE(v_feed->'programs', '[]'::jsonb)) e
      WHERE e->>'megjegyzes' IS NOT NULL OR e->>'leiras' IS NOT NULL;

      IF v_szivar > 0 THEN
        v_hiba := 'a NEM reszletes feed megis kiadott ' || v_szivar
                  || ' belso jegyzetet/leirast';
        EXIT;
      END IF;
    END IF;

    -- (d) a program-kulcskeszlet szerzodese (ehhez kell legalabb egy program)
    IF v_kapott > 0 THEN
      v_prog_db := v_prog_db + 1;
      SELECT string_agg(k, ', ') INTO v_elteres FROM (
        SELECT k FROM unnest(v_elvartp) k
        WHERE NOT jsonb_exists(v_feed->'programs'->0, k)
        UNION ALL
        SELECT k FROM jsonb_object_keys(v_feed->'programs'->0) k
        WHERE NOT (k = ANY(v_elvartp))
      ) d;
      IF v_elteres IS NOT NULL THEN
        v_hiba := 'a program kulcskeszlete elterert a szerzodestol: ' || v_elteres;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  IF v_hiba IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 2 (public_calendar_feed viselkedes): %', v_hiba;
  END IF;

  -- A biralat jogos: egy zolden hallgato or, ami semmit nem mert, rosszabb a
  -- semminel. Mondjuk meg, MENNYIT mert.
  RAISE NOTICE 'ORSZEM 2: % feed vizsgalva; ebbol % NEM reszletes (ott futott a jegyzet-szivargas or); % feeden volt legalabb egy program (ott futott a program-kulcskeszlet ellenorzes).',
    v_feed_db, v_sziv_db, v_prog_db;

  IF v_feed_db = 0 THEN
    RAISE NOTICE 'ORSZEM 2 - FIGYELEM: EGYETLEN feed sem futott le (nincs aktiv, tokennel rendelkezo gyulekezet). A viselkedes-or NEM MERT SEMMIT: az ORSZEM 1 forras-asszertjei az egyetlen bizonyitek.';
  ELSIF v_prog_db = 0 THEN
    RAISE NOTICE 'ORSZEM 2 - FIGYELEM: egyetlen feedben sem volt program, ezert a program-kulcskeszlet szerzodes-ellenorzese NEM FUTOTT LE. A kulcsokat csak az ORSZEM 1 forras-asszertje fedi.';
  END IF;
END
$orszem_feed_viselkedes$;

COMMIT;


-- ==========================================================================
-- 3. SZAKASZ - lelkeszi_naptar_feed (V3)
--   ALAP: a 2026-09-05-i ELO V2 torzs - a szuletesnap- es nevnap-blokk a
--   KOZOS naptar_szemely_alap() / naptar_szemely_nevnapok() fuggvenyekbol jon
--   (tagallapot-szuro + ekezetfuggetlen nevnap-egyeztetes). EZT NE ERINTSD.
--   Valtozas KIZAROLAG a hatokor-feloldas ELOTT: profiles.status kapu +
--   fail-closed fallback.
-- [!] A tablahivatkozasokat a plpgsql csak FUTASKOR oldja fel, ezert a csere
--     akkor is lefut, ha a lelkeszi_naptar_token tabla meg nem letezik.
-- ==========================================================================
BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.lelkeszi_naptar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
VOLATILE
AS $lelkeszi_naptar_feed$
DECLARE
  v_user            uuid;
  v_cong            uuid;
  v_role_cnt        int;
  v_profil_status   text;
  v_profil_cong     uuid;
  v_van_gyul_szerep boolean;
  v_nev             text;
  v_szuletes        jsonb;
  v_nevnap          jsonb;
  v_hazassag        jsonb;
  v_konfirmacio     jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT user_id INTO v_user
  FROM public.lelkeszi_naptar_token WHERE token = p_token;

  -- Visszavont (torolt) vagy ismeretlen token -> azonnali elutasitas.
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- 2026-09-05 (P0): A PROFIL MAGA IS LEGYEN AKTIV. A haz kanonikus mintaja
  -- (current_user_congregation_id) mindig nezi a statuszt; ez a feed volt az
  -- egyetlen kivetel. Emiatt egy pending vagy deleted profil is teljes
  -- nevsort kapott. A NULL statusz (hianyzo profil) szinten elutasitas.
  SELECT pr.status, pr.congregation_id
  INTO v_profil_status, v_profil_cong
  FROM public.profiles pr WHERE pr.id = v_user;

  IF v_profil_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('status', 'no_scope');
  END IF;

  -- HATOKOR: roles-first, fail-closed.
  SELECT count(*), min(scope_id) INTO v_role_cnt, v_cong
  FROM (
    SELECT DISTINCT scope_id FROM public.profile_roles
    WHERE profile_id = v_user AND scope = 'congregation'
      AND scope_id IS NOT NULL AND approval_status = 'approved'
      AND active = true
  ) s;

  -- Ket vagy tobb gyulekezet: a feed URL-t a lelkesz EGYSZER illeszti be a
  -- Google Naptarba - nem donthetjuk el helyette, melyik gyulekezetrol van szo.
  -- [!] A min(scope_id) CSAK v_role_cnt = 1 eseten helyes. A ket sort csak
  --     EGYBEN szabad atirni.
  IF v_role_cnt > 1 THEN
    RETURN jsonb_build_object('status', 'ambiguous_scope');
  END IF;

  -- 2026-09-05 (P0): A FALLBACK MOSTANTOL FAIL-CLOSED. Regen:
  -- SELECT congregation_id INTO v_cong FROM profiles WHERE id = v_user
  -- - szuretlenul. Emiatt a VISSZAVONAS NEM ALLT MEG a feednel.
  --
  -- [!] OSZINTE MEGJEGYZES: ha a profile_roles_scope_id_check CHECK elesben
  --     all (scope <> system -> scope_id NOT NULL), akkor v_role_cnt = 0
  --     eseten SEMMILYEN gyulekezeti szerepkor nem letezhet, tehat EZ AZ AG
  --     SOHA NEM FUT LE, es a hatokor kizarolag a profile_roles-bol jon. A
  --     fallback ezert NEM hatokort AD: csak azt oldja fel, aminek a
  --     scope_id-ja HIANYZIK (ha a CHECK valamiert nincs elesben). A 15.
  --     racssor megmeri, letezik-e egyaltalan ilyen sor.
  IF v_role_cnt = 0 THEN
    IF v_profil_cong IS NULL THEN
      RETURN jsonb_build_object('status', 'no_scope');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.profile_roles r
      WHERE r.profile_id = v_user
        AND r.scope = 'congregation'
        AND r.approval_status = 'approved'
        AND r.active = true
        AND (r.scope_id IS NULL OR r.scope_id = v_profil_cong)
    ) INTO v_van_gyul_szerep;

    IF NOT COALESCE(v_van_gyul_szerep, false) THEN
      RETURN jsonb_build_object('status', 'no_scope');
    END IF;

    v_cong := v_profil_cong;
  END IF;

  IF v_cong IS NULL THEN
    RETURN jsonb_build_object('status', 'no_scope');
  END IF;

  UPDATE public.lelkeszi_naptar_token
  SET last_used_at = now() WHERE token = p_token;

  SELECT COALESCE(nev_hu, name) INTO v_nev
  FROM public.congregations WHERE id = v_cong;

  -- Szuletesnapok - a KOZOS szemely-alapbol (2026-09-05, V2).
  -- [!] A naptar_szemely_alap() hozza a tagallapot-szurot
  --     (member_status NOT IN elkoltozott/kitert/torolt). NE ird vissza
  --     kozvetlen szemely-olvasasra: azzal a kitert es torolt tagok NEVE
  --     visszakerulne a lelkesz Google-naptaraba.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.szemely_id,
    'csaladnev', a.csaladnev,
    'k_nev', a.k_nev,
    'namepattern', a.namepattern,
    'allapot', a.allapot,
    'datum', to_char(a.sz_datum, 'YYYY-MM-DD')
  ) ORDER BY a.szemely_id), '[]'::jsonb)
  INTO v_szuletes
  FROM public.naptar_szemely_alap(v_cong) a
  WHERE a.sz_datum IS NOT NULL;

  -- Nevnapok - a KOZOS egyeztetobol (2026-09-05, V2).
  -- [!] Ez hozza az ekezet- es tagolasfuggetlen egyeztetest (Anna Maria ->
  --     Anna). NE ird vissza a regi, exact keresztnev-osszehasonlitasra
  --     epulo joinra (lasd ORSZEM 3).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.szemely_id,
    'csaladnev', a.csaladnev,
    'k_nev', a.k_nev,
    'namepattern', a.namepattern,
    'allapot', a.allapot,
    'honap', nn.honap,
    'nap', nn.nap
  ) ORDER BY a.szemely_id, nn.honap, nn.nap), '[]'::jsonb)
  INTO v_nevnap
  FROM public.naptar_szemely_nevnapok(v_cong) nn
  JOIN public.naptar_szemely_alap(v_cong) a ON a.szemely_id = nn.szemely_id;

  -- Hazassagi evfordulok - CSAK ha MINDKET hazasfel el es nem koltozott el:
  -- az ozvegynek az eskuvo napja gyaszdatum, nem unnep.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'datum', to_char(h.datum, 'YYYY-MM-DD'),
    'ferfi', jsonb_build_object(
      'id', f.id, 'csaladnev', f.csaladnev, 'k_nev', f.k_nev,
      'namepattern', f.namepattern, 'allapot', f.allapot),
    'no', jsonb_build_object(
      'id', w.id, 'csaladnev', w.csaladnev, 'k_nev', w.k_nev,
      'namepattern', w.namepattern, 'allapot', w.allapot)
  ) ORDER BY h.id), '[]'::jsonb)
  INTO v_hazassag
  FROM public.hazassag h
  JOIN public.szemely f ON f.id = h.id_ferfi
  JOIN public.szemely w ON w.id = h.id_no
  WHERE h.congregation_id = v_cong
    AND h.datum IS NOT NULL
    AND f.meghalt = false AND w.meghalt = false
    AND f.isvisible = true AND w.isvisible = true
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = f.id AND e.congregation_id = v_cong)
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = w.id AND e.congregation_id = v_cong);

  -- Konfirmacioi evfordulok
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', k.id,
    'csaladnev', s.csaladnev,
    'k_nev', s.k_nev,
    'namepattern', s.namepattern,
    'allapot', s.allapot,
    'datum', to_char(k.datum, 'YYYY-MM-DD')
  ) ORDER BY k.id), '[]'::jsonb)
  INTO v_konfirmacio
  FROM public.konfirmalas k
  JOIN public.szemely s ON s.id = k.id_szemely
  WHERE k.congregation_id = v_cong
    AND k.datum IS NOT NULL
    AND s.meghalt = false
    AND s.isvisible = true
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = s.id AND e.congregation_id = v_cong);

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', COALESCE(v_nev, 'Gyulekezet'),
    'szuletesnapok', v_szuletes,
    'nevnapok', v_nevnap,
    'hazassagok', v_hazassag,
    'konfirmaciok', v_konfirmacio
  );
END;
$lelkeszi_naptar_feed$;

COMMENT ON FUNCTION public.lelkeszi_naptar_feed(uuid) IS
  'Lelkeszi (privat) naptar-feed adatforras. Verzio: V3, 2026-09-05 '
  '(eredet: V2, 2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql). '
  'A szemely-alap es a nevnap-egyeztetes VALTOZATLANUL a KOZOS '
  'naptar_szemely_alap() / naptar_szemely_nevnapok() fuggvenyekbol jon - azok '
  'hozzak a tagallapot-szurot (elkoltozott/kitert/torolt KI) es az '
  'ekezetfuggetlen nevnap-egyeztetest. FAIL-CLOSED, roles-first: (1) a profil '
  'status = active kell legyen; (2) a hatokor a profile_roles jovahagyott, '
  'aktiv, gyulekezeti scope-jabol jon; (3) ket vagy tobb gyulekezetnel '
  'ambiguous_scope; (4) a profiles.congregation_id fallback CSAK egy meglevo, '
  'elo gyulekezeti szerepkort EROSIT MEG, hatokort nem AD - es ha a '
  'profile_roles_scope_id_check CHECK elesben all, ez az ag SOHA nem fut le '
  '(a hatokor kizarolag a profile_roles-bol jon). '
  'GYULEKEZET-STATUSZ: itt SZANDEKOSAN nincs congregations.status kapu. Indok: '
  'a token a sajat gyulekezetere szol, a hozzaferest a fenti negy kapu tartja, '
  'es a mark_inactive_congregations() napi cron 1 ev tetlenseg utan '
  'AUTOMATIKUSAN inaktival - egy statusz-kapu itt a lelkesz sajat nevsorat '
  'vagna el puszta aktivitas-hiany miatt. Ha ez megvaltozik, a '
  'public_calendar_feed 1/b megallito kapujat is hozd ide. '
  'EXECUTE joga kizarolag a service_role-nak van: ez a feed NEVEKET ad.';

REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lelkeszi_naptar_feed(uuid) TO service_role;

-- --- ORSZEM 3 (forras: POZITIV es NEGATIV asszert) ------------------------
-- [!] A 2026-09-04-es P0.2 kor orszeme CSAK az is_admin /
--     is_caller_admin_for_user_mgmt nevekre nez - ez a feed kimaradt onnan.
DO $orszem_lelkeszi$
DECLARE
  v_src     text;
  v_kod     text;   -- v_src KOMMENTEK NELKUL (lasd lentebb)
  v_hianyzo text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'lelkeszi_naptar_feed' LIMIT 1;

  -- [!] HIBAOSZTALY (2026-09-05): a prosrc a KOMMENTEKET is tartalmazza.
  -- Az elso futasnal az ORSZEM 3 a SAJAT figyelmezteto kommentjere talalt ra
  -- ('NE ird vissza ... n.nev1 = s.k_nev'), es megbuktatta a helyes migraciot.
  -- Minden mintakereses ezentul a KOD-ONLY valtozaton megy.
  v_kod := regexp_replace(COALESCE(v_src, ''), '--[^' || chr(10) || ']*', '', 'g');

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'ORSZEM 3: a lelkeszi_naptar_feed NEM LETEZIK a csere utan.';
  END IF;

  SELECT string_agg(x.mit, ' | ' ORDER BY x.mit) INTO v_hianyzo
  FROM (
    SELECT 'profiles.status kapu' AS mit
    WHERE strpos(v_kod, 'v_profil_status IS DISTINCT FROM ' || chr(39) || 'active' || chr(39)) = 0
    UNION ALL
    SELECT 'fail-closed fallback (elo gyulekezeti szerepkor)'
    WHERE strpos(v_kod, 'IF NOT COALESCE(v_van_gyul_szerep, false) THEN') = 0
    UNION ALL
    SELECT 'ambiguous_scope ag'
    WHERE strpos(v_kod, 'ambiguous_scope') = 0
    UNION ALL
    -- NEGATIV ASSZERTEK a 2026-09-05-i korre. Ha valaki a 2026-08-11-es V1-et
    -- irja vissza, ITT alljunk meg: az elveszitene a tagallapot-szurot es az
    -- ekezetfuggetlen nevnap-egyeztetest.
    SELECT 'KOZOS szemely-alap: naptar_szemely_alap() hivas - VISSZAGORGETES!'
    WHERE strpos(v_kod, 'naptar_szemely_alap') = 0
    UNION ALL
    SELECT 'KOZOS nevnap-egyezteto: naptar_szemely_nevnapok() hivas - VISSZAGORGETES!'
    WHERE strpos(v_kod, 'naptar_szemely_nevnapok') = 0
  ) x;

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 3: a lelkeszi_naptar_feed torzsebol hianyzik: %', v_hianyzo;
  END IF;

  -- A regi V1 arulkodo nyoma: kozvetlen, exact nevnap-join a torzsben.
  IF strpos(v_kod, 'n.nev1 = s.k_nev') > 0 THEN
    RAISE EXCEPTION 'ORSZEM 3: a torzsben ott a REGI, exact nevnap-join (n.nev1 = s.k_nev). Ez a 2026-08-11-es V1 mintaja - a 2026-09-05-i ekezet- es tagolasfuggetlen egyeztetes elveszett volna.';
  END IF;

  -- A visszaadott mezokeszlet is szerzodes (a lelkeszi route olvassa).
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hianyzo
  FROM unnest(ARRAY[
    'status','congregation_name','szuletesnapok','nevnapok','hazassagok',
    'konfirmaciok','csaladnev','k_nev','namepattern','allapot','honap','nap',
    'ferfi','no','datum'
  ]) k
  WHERE strpos(v_kod, chr(39) || k || chr(39)) = 0;

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 3: ELTUNTEK a jsonb-kulcsok (a TypeScript szerzodes torne): %', v_hianyzo;
  END IF;
END
$orszem_lelkeszi$;

COMMIT;


-- ==========================================================================
-- 4. SZAKASZ - PostgREST schema cache reload
--   [!] Nehany perces 503-ablak a forgalmas vegpontokon. MAGATOL GYOGYUL.
-- ==========================================================================
NOTIFY pgrst, 'reload schema';



-- ==========================================================================
-- 5. SZAKASZ - ELLENORZO RACS (EGYETLEN eredmenyhalmaz; a szerkeszto csak az
--   UTOLSOT mutatja). Minden KAPU sor OK legyen; a HATAS sorok szamok.
-- ==========================================================================
SELECT 1 AS sorszam,
       'KAPU - public_calendar_feed: aktiv gyulekezet (c.status)'::text AS lepes,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'c.status = ' || chr(39) || 'active' || chr(39)) > 0
           THEN 'OK - van' ELSE 'HIBA - NINCS' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text AS allapot
UNION ALL
SELECT 2, 'KAPU - public_calendar_feed: MAGAN tipusok kizarva (V3 vivmany)'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'NOT IN (' || chr(39) || 'szabadsag' || chr(39)) > 0
           THEN 'OK - megmaradt'
           ELSE 'HIBA - VISSZAGORGETES: a 2026-09-05-i magan-kizaras eltunt' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 3, 'KAPU - public_calendar_feed: megjegyzes CSAK reszletes feedben'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'CASE WHEN v_reszletes THEN p.megjegyzes') > 0
           THEN 'OK - opt-in kapu az adatbazisban'
           ELSE 'HIBA - a jegyzet feltetel nelkul megy ki' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 4, 'KAPU - public_calendar_feed: leiras is CSAK reszletes feedben'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'CASE WHEN v_reszletes THEN p.leiras') > 0
           THEN 'OK - a DB es az ics.ts:231 ugyanazt mondja'
           ELSE 'HIBA - a leiras feltetel nelkul megy ki' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 5, 'DONTES - publikus-szuro SZANDEKOSAN NINCS'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'p.publikus = true') = 0
           THEN 'OK - nincs benne (a token-feed a gyulekezet TELJES naptara)'
           ELSE 'FIGYELEM - bekerult: termek-dontes, Endre jovahagyasa kell' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 6, 'SZERZODES - public_calendar_feed: 4 gyoker- + 16 program-kulcs'::text,
       COALESCE((SELECT CASE WHEN v.hianyzo IS NULL THEN 'OK - 20/20 kulcs a helyen'
           ELSE 'HIBA - hianyzik: ' || v.hianyzo END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL (
           SELECT string_agg(k, ', ' ORDER BY k) AS hianyzo
           FROM unnest(ARRAY['status','congregation_name','reszletes','programs',
             'id','cim','leiras','megjegyzes','helyszin','tipus','egyedi_tipus_nev',
             'egyedi_emoji','datum','datum_vege','ido_kezdes','ido_befejezes',
             'ismetlodes_tipus','ismetlodes_vege','prioritas','updated_at']) k
           WHERE strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), chr(39) || k || chr(39)) = 0) v
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 7, 'BEALLITAS - public_calendar_feed: DEFINER + search_path + STABLE'::text,
       COALESCE((SELECT CASE WHEN p.prosecdef AND p.provolatile = 's'
             AND array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path%'
           THEN 'OK - mind a harom' ELSE 'HIBA - hianyos' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 8, 'JOG - public_calendar_feed: anon + authenticated EXECUTE'::text,
       COALESCE((SELECT CASE
           WHEN (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')) < 2
             THEN 'FIGYELEM - nincsenek Supabase-szerepek'
           WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
             THEN 'OK - mindketto hivhatja'
           ELSE 'HIBA - hianyzo EXECUTE jog' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 9, 'DOKU - public_calendar_feed COMMENT: V4 + NEGY KAPU + MAGAN'::text,
       COALESCE((SELECT CASE WHEN obj_description(p.oid,'pg_proc') LIKE '%V4%'
             AND obj_description(p.oid,'pg_proc') LIKE '%NEGY KAPU%'
             AND obj_description(p.oid,'pg_proc') LIKE '%MAGAN%'
           THEN 'OK - a magan-kizarast is felsorolja'
           ELSE 'HIBA - a komment nem a tenyleges kapukat sorolja' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='public_calendar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 10, 'KAPU - lelkeszi_naptar_feed: profiles.status = active'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'v_profil_status IS DISTINCT FROM ' || chr(39) || 'active' || chr(39)) > 0
           THEN 'OK - van' ELSE 'HIBA - NINCS' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='lelkeszi_naptar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 11, 'KAPU - lelkeszi_naptar_feed: fail-closed fallback'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), 'IF NOT COALESCE(v_van_gyul_szerep, false) THEN') > 0
           THEN 'OK - a fallback elo gyulekezeti szerepkort kovetel'
           ELSE 'HIBA - a szuretlen profiles.congregation_id fallback maradt' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='lelkeszi_naptar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 12, 'KAPU - lelkeszi_naptar_feed: a KOZOS naptar_szemely_* hivasok'::text,
       COALESCE((SELECT CASE WHEN strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'),'naptar_szemely_alap') > 0
             AND strpos(regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'),'naptar_szemely_nevnapok') > 0
           THEN 'OK - a V2 vivmanyai megmaradtak (tagallapot-szuro + ekezetfuggetlen nevnap)'
           ELSE 'HIBA - VISSZAGORGETES a 2026-08-11-i V1-re' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='lelkeszi_naptar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 13, 'JOG - lelkeszi_naptar_feed: CSAK service_role'::text,
       COALESCE((SELECT CASE
           WHEN (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) < 3
             THEN 'FIGYELEM - nincsenek Supabase-szerepek'
           WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
            AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
             THEN 'OK - csak a szerver-oldali route hivhatja'
           ELSE 'HIBA - TUL TAG JOG, a nevsor kiszivaroghat' END
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='lelkeszi_naptar_feed' LIMIT 1),
         'HIBA - a fuggveny NEM LETEZIK')::text
UNION ALL
SELECT 14, 'HATAS - hany gyulekezet jegyzete erheto el MA barmely bejelentkezettnek'::text,
       ((SELECT count(*) FROM public.congregations c
         WHERE c.calendar_feed_token IS NOT NULL
           AND COALESCE(c.calendar_feed_reszletes, false) = true)::text
        || ' gyulekezetnel all BE a calendar_feed_reszletes ES van tokenje. '
        || 'Amig a congregations_select policy USING(true) '
        || '(2026-08-25-b5-b7-b12-jogok.sql:191-196), ennyi gyulekezet jegyzetet '
        || 'olvashatja ki BARMELY bejelentkezett felhasznalo a token megszerzesevel. '
        || 'A res VEGLEG csak a policy szukitesevel zar.')::text
UNION ALL
SELECT 15, 'MERES - el-e egyaltalan a lelkeszi fallback ag'::text,
       (SELECT CASE WHEN count(*) = 0
          THEN '0 db scope=congregation + scope_id IS NULL sor -> a fallback ag BIZONYITOTTAN HALOTT KOD (a profile_roles_scope_id_check CHECK all), a hatokor kizarolag a profile_roles-bol jon. EZ A KIVANT ALLAPOT.'
          ELSE count(*)::text || ' db scope=congregation + scope_id IS NULL sor letezik -> a fallback ag ELO. Ezeket rendezni kell, mert a CHECK szerint nem letezhetnenek.' END
        FROM public.profile_roles r
        WHERE r.scope = 'congregation' AND r.scope_id IS NULL)::text
UNION ALL
SELECT 16, 'HATAS - hany gyulekezet feedje lenne 404 (nem aktiv statusz)'::text,
       (SELECT (count(*) FILTER (WHERE c.status IS DISTINCT FROM 'active'))::text
               || ' / ' || count(*)::text || ' tokennel rendelkezo gyulekezet'
               || CASE WHEN count(*) FILTER (WHERE c.status IS DISTINCT FROM 'active') > 0
                       THEN ' -- az 1/b MEGALLITO KAPUNAK ezt el kellett volna kapnia!'
                       ELSE ' (nulla: a status-kapu senkit nem ejt ki)' END
        FROM public.congregations c
        WHERE c.calendar_feed_token IS NOT NULL)::text
UNION ALL
SELECT 17, 'HATAS - lelkeszi tokenek: UJ kiesesek bontva'::text,
       CASE WHEN to_regclass('public.lelkeszi_naptar_token') IS NULL
            THEN 'a tabla NEM LETEZIK elesben'
            ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
              $meres$
                SELECT (count(*) FILTER (WHERE pr.id IS NULL OR pr.status IS DISTINCT FROM 'active'))::text
                       || ' nem-aktiv profil + '
                       || (count(*) FILTER (WHERE pr.status = 'active'
                             AND NOT EXISTS (SELECT 1 FROM public.profile_roles r
                               WHERE r.profile_id = t.user_id
                                 AND r.scope = 'congregation'
                                 AND r.approval_status = 'approved'
                                 AND r.active = true)))::text
                       || ' szerepkor nelkuli = UJ kieses, osszesen '
                       || count(*)::text
                       || ' tokenbol. (A tobbgyulekezetes tokenek MA IS 409-et adnak - nem ez a migracio ejti ki oket.)' AS c
                FROM public.lelkeszi_naptar_token t
                LEFT JOIN public.profiles pr ON pr.id = t.user_id
              $meres$, false, true, '')))[1]::text, 'nem merheto') END::text
UNION ALL
SELECT 18, 'KOVETO FELADAT - alkalmazas-oldal es a regi migracios fajl'::text,
       ('1) apps/web/lib/auth/effective-access.ts:509-511 ugyanezt a szuretlen '
        || 'profiles.congregation_id fallbackot hasznalja a token KIADASAKOR - amig az '
        || 'nincs rendezve, az app kiadhat olyan linket, amit a feed elutasit. '
        || '2) A token-feed hibaagai (route.ts:37, :44-47, :52) kapjanak no-store fejlecet: '
        || 'ez a migracio UJ 404-eket termel. '
        || '3) Az s-maxage=3600 miatt a jegyzet-szivargas lezarasa a mar kiadott '
        || 'valaszokra 1-3 ora keslelteteassel hat. '
        || '4) A 2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql ETTOL KEZDVE NEM '
        || 'FUTTATHATO UJRA valtozatlanul: a benne levo CREATE OR REPLACE visszavenne a '
        || 'statusz-, leiras-, megjegyzes- es fallback-kapukat. Ezt a _RUN_LOG.md-be is '
        || 'be kell irni.')::text
ORDER BY 1;