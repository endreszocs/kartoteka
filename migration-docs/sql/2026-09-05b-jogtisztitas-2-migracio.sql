-- ═══════════════════════════════════════════════════════════════════════════
--  JOGTISZTÍTÁS — 2. LÉPÉS: A MIGRÁCIÓ                            (2026-09-05b)
--  Fájl: migration-docs/sql/2026-09-05b-jogtisztitas-2-migracio.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⛔ ELŐFELTÉTEL — NE FUTTASD, amíg ez a NÉGY dolog meg nem történt:
--     1) Lefutott: docs/2026-09-05b-jogtisztitas-1-elomeres.sql (előmérés).
--     2) Lefutott ÉS CSV-BE MENTVE: docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql
--        (ACL-pillanatkép). Ez a MENTÉS. ⚠️ A mentés a JOGOK VISSZAADÁSÁRA jó;
--        a sorait EGÉSZBEN (REVOKE + GRANT-ok) kell visszajátszani, mert az
--        1) lépés ÚJ, explicit bejegyzéseket ír — lásd az 1b fájl fejlécét.
--     3) Az előmérés 15. sora ÜRES. Ha nem üres, ez a fájl SZÁNDÉKOSAN
--        megáll a 0/b kapunál — előbb dönteni kell.
--        ⚠️ Ha a találat RLS-SEGÉD (`is_admin`, `same_congregation`, …), a
--           megoldás NEM az engedélyezőlistára tétel (az az anonnak adna
--           EXECUTE-ot a jogosultsági rendszer magjára), hanem az anon
--           TÁBLA-JOGÁNAK elvétele a relációtól — külön, harmadik fájlban.
--           A 0/z-6 asszert ezt gépileg is tiltja.
--     4) Az előmérés 26. sora alapján KITÖLTÖTTED (vagy tudatosan üresen
--        hagytad) a `v_atmentendo_szerepek` tömböt. Ha ott szerep szerepel és
--        nem döntöttél róla, a 0/e KAPU MEGÁLLÍTJA a migrációt.
--
--  MIT CSINÁL
--  ──────────
--  CSAK JOGOKAT ÍR. Egyetlen függvény TÖRZSÉHEZ nem nyúl, adatot nem érint.
--    0) HAT megállító kapu (fail-closed): 0/z, 0/a, 0/b, 0/c, 0/e, 0/f
--    1) átmentés: ami MA hívható authenticated / service_role / a KÉZZEL
--       megadott további szerepekből, az EXPLICIT grantot kap — KIZÁRÁSI és
--       CSAK-SERVICE_ROLE LISTÁVAL
--    2) visszavonás: PUBLIC és anon EXECUTE minden saját tulajdonú public rutinról
--    3) alapértelmezett jogok lezárása MINDEN érintett szerepre — a
--       SÉMÁHOZ KÖTÖTT ÉS a GLOBÁLIS (séma nélküli) bejegyzésekre EGYARÁNT
--    4) engedélyezőlista: az anon visszakapja a 17 mért, szükséges hívást
--    5) a kizárási lista teljes zárása — az `authenticated`-től IS
--    6) őrszem: negatív ÉS pozitív asszertek, köztük a B1–B5 regressziók
--
--  ⚠️ MELYIK GYÖKÉROKOT ZÁRJA BE — ÉS MELYIKET NEM
--  ───────────────────────────────────────────────
--  KÉT gyökérok van, és ez a fájl MINDKETTŐT bezárja:
--
--   (G1)  A PostgreSQL `CREATE FUNCTION`-je alapból EXECUTE-ot ad a PUBLIC-nak
--         MINDEN új függvényre. → BEZÁRJA a 2) lépés (meglévők) és a 3) lépés
--         `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON ROUTINES FROM PUBLIC`
--         (jövőbeliek).
--
--   (G2)  Élesben fut egy `ALTER DEFAULT PRIVILEGES IN SCHEMA public
--         GRANT EXECUTE ON FUNCTIONS TO authenticated`
--         (2026-04-23-m0-HOTFIX-grants.sql:94), ezért MINDEN ÚJ függvény
--         automatikusan hívható lesz minden bejelentkezettből.
--         → BEZÁRJA a 3) lépés `… REVOKE EXECUTE ON ROUTINES FROM authenticated`
--           ága, MINDEN létező `pg_default_acl` szerepre (nem csak postgres-re).
--
--         ⚠️ A GLOBÁLIS (`IN SCHEMA` NÉLKÜLI) bejegyzések IS: azok
--            `defaclnamespace = 0`-val állnak a katalógusban, és a Postgres a
--            globális ÉS a séma-szintű alapértelmezést ÖSSZEFÉSÜLI — egy
--            globális GRANT-ot tehát egy `IN SCHEMA public REVOKE` NEM olt ki.
--            Hogy ez a repóban is élő alak:
--            2026-07-18-public-site-content-and-sitemap.sql:251-253 (ott
--            szerencsére REVOKE, tehát ártalmatlan — de a szerkezet ugyanaz).
--            Ezért a 3) lépés a `defaclnamespace = 0` sorokat IS begyűjti, és
--            azokra `IN SCHEMA` NÉLKÜLI REVOKE-ot ad ki; a záró rács 8. sora
--            pedig LEFT JOIN-nal mutatja őket (egy inner join némán eldobná).
--
--   ⚠️⚠️ A (G2) LEZÁRÁSÁNAK TARTÓS KÖVETKEZMÉNYE VAN A FEJLESZTÉSRE:
--        ettől kezdve MINDEN ÚJ függvényhez KÉZZEL kell kiadni a
--        `GRANT EXECUTE ON ROUTINE public.<fv>(<argok>) TO authenticated;`
--        sort a létrehozó migrációban. Enélkül az app némán 42501
--        („permission denied for function") hibára fut. Ez SZÁNDÉKOS,
--        fail-closed viselkedés — de tudni kell róla.
--        A fájl végén, kommentben ott a MINTA az új migrációkhoz.
--        A (G2) visszaállító sora szintén ott van, kommentben.
--
--   A MÁR LÉTEZŐ függvényekre a 3) lépésnek NINCS hatása (az
--   `ALTER DEFAULT PRIVILEGES` csak EZUTÁN létrehozott objektumokra hat),
--   tehát a 3) lépés azonnali viselkedésváltozása NULLA.
--
--  MI A KOCKÁZAT
--  ─────────────
--   · Ha egy felületen „permission denied for function" hibát látsz, az
--     érintett függvény kimaradt az engedélyezőlistáról vagy az átmentésből.
--     Ilyenkor EGY célzott GRANT a javítás — NEM az egész fájl visszagörgetése.
--   · A `NOTIFY pgrst, 'reload schema'` után percekig jöhet 503-vihar a
--     forgalmas végpontokon (ismert hibaosztály). MAGÁTÓL GYÓGYUL —
--     ne rollbackelj reflexből, előbb curl-próba az anon kulccsal.
--   · Kiterjesztés-tulajdonú (pgcrypto / unaccent / pg_trgm) és idegen
--     tulajdonú rutinokat a 2) lépés SZÁNDÉKOSAN KIHAGY. Rájuk a REVOKE vagy
--     néma no-op lenne (WARNING), vagy 42501-gyel buktatná az egész
--     tranzakciót — és egy nulla-toleranciás őrszem miattuk hasalna el.
--     Az őrszem ezért ŐKET NÉVVEL FELSOROLJA, de nem buktat rajtuk.
--
--  MIT KELL UTÁNA ELLENŐRIZNI
--  ──────────────────────────
--   1. A záró rács MINDEN sorát nézd végig. A 0. sor a TRANZAKCIÓN BELÜLI
--      riport (a NOTICE-ok helyett — azokat a Studio nem mutatja): ha ÜRES,
--      a migráció VISSZAGÖRDÜLT. A 4., 5. és 8. sor a legfontosabb tartalom.
--   2. Lépj ki és be a kartoteka.app-on — a bejelentkezésnek működnie kell.
--   3. Nyisd meg a publikált gyülekezeti oldalt (/gy/<slug>) — a tartalomnak,
--      a tisztségeknek és a naptárnak be kell töltenie.
--   4. Próbálj ki egy QR-es telefonos feltöltést (iktató) — az anon Storage-
--      írásnak működnie kell.
--   5. Nyisd meg a /hozzaferes-kerese oldalt — a gyülekezet-választónak
--      ki kell töltődnie (`congregations_for_registration`).
--   6. Egy bejelentkezett felületen ments el bármit (tagnyilvántartás,
--      pénzügy) — az RLS-segédeknek működniük kell.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  MELYIK SZERKEZET ZÁRJA KI MELYIK BLOKKOLÓT
--  (a bukott docs/2026-09-05-fuggveny-jogok-TERVEZET-NE-FUTTASD.sql:11-72
--   szerinti számozással)
--  ─────────────────────────────────────────────────────────────────────────
--   B1  ÖNMAGÁT BLOKKOLTA  →  a 0/b kapu a `v_lista`-t (engedélyezőlista)
--       KIZÁRJA a keresésből (`NOT (pr.proname = ANY(v_lista))`), ÉS a
--       `has_table_privilege` / `has_any_column_privilege` feltétellel csak
--       VALÓDI kitettséget jelez. Élő ellenpélda, amin a régi kapu elhasalt:
--       `iktato_csatolmanyok_qr_insert_anon` (2026-07-25-f8d-qr-feltoltes.sql:778,
--       `FOR INSERT TO anon, authenticated`) hívja a
--       `public.qr_staging_upload_allowed(text)`-et, aminek ugyanott (:774-775)
--       explicit `GRANT … TO anon, authenticated` jár. A függvény RAJTA VAN az
--       engedélyezőlistán → a kapunak NEM szabad megállnia.
--       REGRESSZIÓ: 0/z-3 asszert (rajta van-e a listán) + 6/P3 asszert
--       (anon-hívható maradt-e) + 6/P6 (a kapu utólag is 0 találatot ad).
--
--   B2  BEBETONOZOTT VOLNA EGY P0-t  →  az 1) átmentés `v_kizarva` listával
--       dolgozik; a `custom_access_token_hook` KÖTELEZŐEN rajta van, mert egy
--       explicit `authenticated` ACL-bejegyzés visszanyitná azt a P0-t, amit a
--       migration-docs/sql/2026-09-05-token-hook-p0-zaras.sql SZÁNDÉKA szerint
--       lezárt (örökölt PUBLIC-jog eltávolítható; explicit ACL-bejegyzés már nem).
--       ⚠️ Hogy az a fájl élesben LE IS FUTOTT-e, azt NEM tudjuk: a
--          `_RUN_LOG.md`-ben NINCS róla bejegyzés (ismert hibaosztály — a
--          migrációs fájl nem bizonyíték az éles állapotra). Az A) fájl 22.
--          sora MÉRI. Ez a fájl MINDKÉT esetben lezárja: ha még nyitva volt,
--          most zárul; ha már zárva volt, no-op.
--       REGRESSZIÓ: 6/N3 asszert — sem `anon`, sem `authenticated` EXPLICIT
--       ACL-bejegyzés, sem örökölt PUBLIC; `supabase_auth_admin` viszont igen.
--
--   B3  PROKIND-ASZIMMETRIA  →  MINDENHOL `ON ROUTINE` (soha nem `ON FUNCTION`:
--       az egy ELJÁRÁSRA 42809-cel HIBÁRA fut és megbuktatná a tranzakciót),
--       és SEHOL nincs `prokind` szűrő — sem a visszavonásban, sem az
--       átmentésben, sem az őrszemekben. Így az aggregátum ('a'), az
--       ablakfüggvény ('w') és az eljárás ('p') is teljes lefedettséget kap.
--       REGRESSZIÓ: 6/P4 — az őrszem fajtánként (prokind) jelenti a maradékot.
--
--   B4  KÉZZEL ÍRT ENGEDÉLYEZŐLISTA  →  a `v_lista` a 2026-09-05-i KÓD-MÉRÉS
--       alapján áll össze: 15 mért anon RPC-hívás + a storage-policy segédje
--       + a publikus-oldal lánc egy tagja. Rajta van az a négy, ami a
--       TERVEZET-ről lemaradt (`public_site_context`, `public_site_context_v2`,
--       `public_sitemap_entries`, `public_site_age_distribution`), és NINCS
--       rajta a két e-mail-orákulum (`login_email_status`,
--       `registration_email_info`), amit a TERVEZET tévesen újranyitott volna.
--       Az A) fájl 11-13. sora MEGMÉRI, mi veszne el és mi hiányzik.
--       REGRESSZIÓ: 0/z-1 és 0/z-2 asszert a listán + 6/P2 (MINDEN létező elem
--       anon-hívható, nem csak 9 kiválasztott).
--
--   B5  CSAK AZ ANON FELÉ ZÁRT VOLNA  →  az 5) lépés a kizárási lista MINDEN
--       elemétől a `PUBLIC`, az `anon` ÉS az `authenticated` jogát is elveszi
--       (a kód-mérés szerint egyiküket sem hívja az app egyetlen szerepből
--       sem). A `service_role`-t és a `supabase_auth_admin`-t NEM érinti.
--       REGRESSZIÓ: 6/N2 asszert.
--
--   TOVÁBBI KIFOGÁSOK, amiket ez a fájl kizár
--   ─────────────────────────────────────────
--    · `{public}` (TO nélküli) policy-k  →  a 0/b kapu a `pg_policy.polroles`-t
--      olvassa és a `'{0}'::oid[]` (PUBLIC) esetet IS találatnak veszi.
--    · LIKE-minta ESCAPE nélkül  →  SEHOL nincs LIKE, mert az `_` a LIKE-ban
--      JOKER, a célnevek pedig tele vannak vele (`qr_staging_upload_allowed`,
--      `check_access_request_rate_limit`). HELYETTE SZÓ-HATÁROS regex:
--      `kif ~ '(^|[^A-Za-z0-9_])' || proname || '\('`. A puszta
--      `strpos(kif, proname || '(')` ugyanis hamis találatot ad, ha az egyik
--      függvénynév a másik VÉGE (`admin(` ⊂ `is_admin(`) — a repóban ma három
--      ilyen névpár van (`audit` ⊂ `get_record_audit`, `touch_updated_at` ⊂
--      `pastor_service_history_touch_updated_at` / `wizard_progress_touch_updated_at`).
--      A regexet CSAK tiszta azonosító-neveken használjuk; egy regex-
--      metakaraktert tartalmazó névnél a régi (fail-closed) strpos marad,
--      különben a minta fordítási hibára futna.
--    · ANON OSZLOP-SZINTŰ TÁBLAJOG  →  a 0/b kapu és a P6 utó-ellenőrzés a
--      `has_table_privilege` MELLETT `has_any_column_privilege`-et is néz. A
--      `has_table_privilege` KIZÁRÓLAG a tábla-szintű ACL-t látja, márpedig a
--      `districts` és a `dioceses` anon-joga OSZLOP-szintű
--      (2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql:463-466,
--       2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql:131-133), miközben az
--      anon SELECT policy-juk SZÁNDÉKOSAN megmaradt (S1:420-421). Ma nem sül
--      el (azok a policy-k `USING (true)`, függvényt nem hívnak), de a kapu
--      enélkül SZERKEZETILEG vak lenne minden oszlop-szintű jogú relációra.
--    · Nincs mentés a kiinduló ACL-ekről  →  docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql
--      ⚠️ Az a mentés a JOGOK VISSZAADÁSÁRA jó; a sorait EGÉSZBEN (REVOKE +
--         GRANT-ok) kell visszajátszani, mert az 1) lépés ÚJ, explicit
--         bejegyzéseket ír, amiket egy puszta GRANT-visszajátszás nem venne le.
--    · Kétszer ugyanaz az `ALTER DEFAULT PRIVILEGES`  →  a 3) lépés
--      DINAMIKUSAN, a `pg_default_acl` MINDEN érintett szerepére kiadja.
--    · Idegen tulajdonú rutinok  →  a 2) lépés kihagyja, az őrszem névvel
--      felsorolja, de nem buktat rajtuk.
--    · Az őrszem csak 9-et ellenőrzött a listából  →  most MINDEN létező elemet.
--    · Az RLS-SEGÉD lista is „kézzel írt lista" volt  →  a P1 asszert MÁR NEM
--      csak a `v_rls_seged` tömbből dolgozik: DINAMIKUSAN, a `pg_policy`
--      kifejezéseiből gyűjti ki a policy-ból ténylegesen hívott public
--      függvényeket, és MINDRE megköveteli az `authenticated` EXECUTE-ot. A
--      kézi lista MINIMUM-halmazként megmarad, és a P1 NÉVVEL JELZI, ha egy
--      listás név élesben nem létezik (eddig az némán kimaradt). A listáról
--      hiányzott: `csalad_resolves_to_accessible_cong`,
--      `gyerek_resolves_to_accessible_cong` (2026-04-12-phase-0-rls-hardening.sql:220,
--      :227, :293, :301), `is_egyhazkeruleti_admin`, `is_current_user_approved`
--      (2026-04-23-m0-HOTFIX-grants.sql:71, :73) — most rajta vannak.
--    · Kommentek a mintakeresésben  →  a 0/c kapu KOMMENTMENTESÍTETT törzsön
--      dolgozik (`regexp_replace(prosrc, '--[^<LF>]*', '', 'g')`), mert a
--      `pg_proc.prosrc` a `--` kommenteket is tartalmazza, és egy naiv
--      keresés rászalad a saját dokumentációjára. A `prosqlbody` IS: a
--      Postgres 14 óta a `BEGIN ATOMIC` törzsű függvények törzse NEM a
--      prosrc-ben él (a repóban ma nincs ilyen — de a repó nem bizonyíték).
--    · A 0/c csak FÜGGVÉNYTÖRZSET nézett  →  új 0/f kapu: a kizárási listás
--      neveket a POLICY-kifejezésekben (SZEREPTŐL FÜGGETLENÜL, nem csak az
--      anon-oldalon), a CHECK-kényszerekben, az oszlop-DEFAULT-okban és a
--      nézet-definíciókban IS keresi. A Postgres ezekre FUTÁSIDŐBEN, a HÍVÓ
--      azonosítójával ellenőrzi az EXECUTE jogot, tehát az 5) lépés
--      `REVOKE ALL … FROM authenticated` sora egy ilyen találat esetén
--      42501-re vinné az érintett tábla írását MINDEN bejelentkezettnek.
--    · SERVICE_ROLE SÉRTETLENSÉG  →  a fájlban EGYETLEN
--      `REVOKE … FROM service_role` sincs, és nincs vak
--      `FROM PUBLIC, anon, authenticated, service_role` minta sem. Külön
--      negatív asszert (6/N4) őrzi a `public.lelkeszi_naptar_feed(uuid)`-t.
--      ⚠️ Ez a rutin a `v_csak_service_role` listán van: az 1) átmentés NEM
--         ad rá `authenticated` grantot, az 5/b lépés pedig explicit módon EL
--         IS VESZI tőle. Enélkül a fájl ÖNMAGÁNAK ELLENTMONDÓ végállapotot
--         állíthatna elő: ha a 2026-08-11-es lánc élesben nem futott le
--         teljesen (a migrációs fájl nem bizonyíték!), az átmentés explicit
--         `authenticated` bejegyzést BETONOZNA egy privát, token-védett
--         feed-re, az N4 ezt nem buktatná meg, a záró rács 9. sora viszont
--         utólag „HIBA"-nak címkézné a SAJÁT eredményünket. Az app kizárólag
--         admin-klienssel (service_role) hívja:
--         apps/web/app/api/calendar/lelkeszi/[token]/route.ts:61,70.
--
--  ⚠️ NINCS TEMP TÁBLA és NINCS pg_temp függvény: a Supabase SQL-szerkesztő
--     munkamenet-csapdája miatt tilos. A listák EGYETLEN DO-blokk DECLARE
--     szakaszában élnek — így nem tudnak elcsúszni egymástól.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $jogtisztitas$
DECLARE
  -- ─────────────────────────────────────────────────────────────────────────
  -- KANONIKUS LISTA 1: ENGEDÉLYEZŐLISTA (17 név)
  -- Forrás: a 2026-09-05-i kód-mérés (169 rpc-hívási hely, 115 név, ebből
  -- 15 fut anon szerepkörrel) + a storage-policy segédje + a publikus-oldal
  -- lánc egy tagja. Név szerint sorolunk: minden túlterhelés megkapja.
  -- ─────────────────────────────────────────────────────────────────────────
  v_lista text[] := ARRAY[
    -- regisztráció / belépés előtti, bejelentkezés nélküli utak
    'check_access_request_rate_limit',      -- (public) hozzaferes-kerese/actions.ts
    'congregations_for_registration',       -- access-request-form.tsx (anon) + oauth-complete-form.tsx (authenticated!)
    -- a NYILVÁNOS gyülekezeti weboldal betöltői (createPublicServerClient = MINDIG anon)
    'public_site_context',                  -- elesben feltehetoen nem letezik -> a grant no-op
    -- ⚠️ public_site_context_v2 + public_sitemap_entries: elesben feltehetoen
    --    nem letezik (_RUN_LOG.md:526 szerint a 2026-07-18-as lanc PENDING),
    --    tehat a grant ma no-op. HA az a lanc valaha lefut, ez a KETTO ott
    --    SECURITY INVOKER wrapperkent jon letre (2026-07-18-…sql:461+489,
    --    :576+585) -> akkor a PUSZTA anon-grant NEM ELEG: az anonnak a
    --    wrapper altal erintett objektumokra (tablak, public_site_private
    --    olvasok) is joga kellene legyen, amit EZ a migracio epp bezar, a
    --    3) lepes pedig az UJ fuggvenyekre is fail-closed alapertelmezest
    --    allit. A lancot a jogtisztitas UTAN felul kell vizsgalni (vagy
    --    SECURITY DEFINER-re tenni oket). Lasd a zaro racs 11. sorat.
    'public_site_context_v2',
    'public_site_congregation_fallback',
    'public_site_congregation_is_visible',  -- a lanc tagja; ha nincs, a grant no-op
    'public_site_identitas',
    'public_site_stats',
    'public_site_age_distribution',
    'public_site_tisztsegek',
    'public_site_events',
    'public_site_events_v2',
    'public_sitemap_entries',               -- lasd a public_site_context_v2 melletti figyelmeztetest
    -- token-alapu naptar-feed (a token maga a hitelesito)
    'public_calendar_feed',
    -- QR-es telefonos feltoltes (a token maga a hitelesito)
    'qr_session_lookup',
    'qr_register_upload',
    'qr_staging_upload_allowed'             -- NEM RPC: a storage.objects anon INSERT policy segedje (B1!)
  ];

  -- ─────────────────────────────────────────────────────────────────────────
  -- KANONIKUS LISTA 2: KIZÁRÁSI LISTA (7 név)
  -- Az app-kódban NULLA `.rpc()` hívásuk van (apps/web, apps/desktop,
  -- packages, supabase/functions, scripts, ops) — minden találat komment
  -- vagy SQL. Ezért az átmentés NEM mentheti át őket, sőt az `authenticated`
  -- jogot is el kell venni tőlük (B5).
  -- ─────────────────────────────────────────────────────────────────────────
  v_kizarva text[] := ARRAY[
    'custom_access_token_hook',    -- B2: CSAK supabase_auth_admin hivja (m0-HOTFIX-grants.sql:80-82)
    'purge_recycle_bin',           -- csak a pg_cron (postgres jogan) + veszhelyzeti service_role
    '_resolve_or_create_locality', -- csak SECURITY DEFINER burkolokbol (a hivo joga nem szamit)
    '_resolve_or_create_street',   -- ugyanaz, 3 tulterhelessel
    'login_email_status',          -- a 30cf3b29 commit KIVETTE az appbol; e-mail-felsorolo orakulum
    'registration_email_info',     -- ugyanaz
    'qr_sweep_expired_sessions'    -- belso seged, mar zarva (2026-07-25-f8d:713-714)
  ];

  -- A kizárási listából PONTOSAN KETTŐ kap célzott grantot (lásd az 5. lépést):
  --   · `purge_recycle_bin`         → service_role  (vészhelyzeti kézi indítás; :654)
  --   · `custom_access_token_hook`  → supabase_auth_admin (a JWT-claimek; :660)
  -- Minden más elem: SENKINEK.

  -- ─────────────────────────────────────────────────────────────────────────
  -- KANONIKUS LISTA 3: CSAK-SERVICE_ROLE LISTA
  -- Az 1) átmentés NEM adhat rájuk `authenticated` grantot, és az 5/b lépés
  -- explicit módon EL IS VESZI tőlük — különben a fájl a saját záró rácsa
  -- 9. sorával kerülne ellentmondásba (lásd a fejléc SERVICE_ROLE pontját).
  -- ⛔ Ez NEM a `v_kizarva` lista: a service_role jogát MEG KELL TARTANI.
  -- ─────────────────────────────────────────────────────────────────────────
  v_csak_service_role text[] := ARRAY[
    'lelkeszi_naptar_feed'   -- apps/web/app/api/calendar/lelkeszi/[token]/route.ts:61,70 (admin-kliens)
  ];

  -- ─────────────────────────────────────────────────────────────────────────
  -- ⛔⛔ KÉZI DÖNTÉS SZÜKSÉGES — TÖLTSD KI AZ A) FÁJL 26. SORA ALAPJÁN ⛔⛔
  --
  -- A 2) lépés `REVOKE … FROM PUBLIC`-ja minden olyan nem-superuser szereptől
  -- elveszi a jogot, amelyik ma KIZÁRÓLAG a PUBLIC-on át hívja a public-beli
  -- rutinokat. Az 1) átmentés magától CSAK az `authenticated`-et és a
  -- `service_role`-t menti át. Ide írd be azokat a TOVÁBBI szerepeket,
  -- amelyeknek meg KELL tartaniuk a hozzáférést — az 1) lépés nekik is kiadja
  -- az explicit grantot.
  --
  -- ⚠️ Ha az A) fájl 26. sora nem üres, és a felsorolt szerepek nem
  --    szerepelnek EGYIK tömbben sem (sem itt, sem a lentiben), a 0/e KAPU
  --    MEGÁLLÍTJA a migrációt. Ez SZÁNDÉKOS: a korábbi változat itt csak
  --    `RAISE NOTICE`-t adott, amit a Supabase Studio meg sem jelenít
  --    (2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql:439-441), és
  --    ugyanabban a tranzakcióban azonnal tovább is ment — a saját „ELŐBB adj
  --    neki célzott grantot" utasítása tehát betarthatatlan volt.
  --
  -- ⛔ NE ÍRD IDE VAKON MINDET. Egy `member_portal_user`-szerű alkalmazás-
  --    szerep átmentése EXPLICIT ACL-be BEBETONOZNÁ a hozzáférését a
  --    SECURITY DEFINER rutinokhoz — pont az ellenkezőjét annak, amiért ez a
  --    kör elindult. Csak azt vedd fel, amiről tudod, hogy a rendszer
  --    használja (pl. egy háttérfolyamat szerepe).
  -- ─────────────────────────────────────────────────────────────────────────
  v_atmentendo_szerepek text[] := ARRAY[]::text[];

  -- ─────────────────────────────────────────────────────────────────────────
  -- A 0/e kapu MÁSIK kilépési útja: ide azok a szerepek jönnek, amelyekről
  -- MEGNÉZTED és ELDÖNTÖTTED, hogy TUDATOSAN elveszíthetik a PUBLIC-on át
  -- kapott hozzáférést. Ez nem ad nekik semmit — csak azt rögzíti, hogy a
  -- döntés megszületett, és nem véletlenül csúsztak ki.
  -- ─────────────────────────────────────────────────────────────────────────
  v_tudomasul_vett_szerepek text[] := ARRAY[]::text[];

  -- A 2026-09-05-i kockázati triázs 4+1 VALÓDI találata (negatív asszerthez).
  v_triazs text[] := ARRAY[
    'record_pastor_tenure_start',  -- authenticated hivja -> csak az anontol vesszuk el
    'next_bizonylat_szam',         -- authenticated hivja -> csak az anontol vesszuk el
    '_resolve_or_create_locality',
    '_resolve_or_create_street',
    'purge_recycle_bin'
  ];

  -- RLS-segédek: POLICY-ból, a HÍVÓ jogán futnak. Ha az `authenticated`
  -- elveszítené az EXECUTE-ot, a jogosultsági rendszer 42501-gyel MEGÁLLNA.
  --
  -- ⚠️ EZ A LISTA NEM AZ IGAZSÁGFORRÁS, csak egy MINIMUM-halmaz. A P1 asszert
  --    a `pg_policy` kifejezéseiből DINAMIKUSAN is kigyűjti a policy-ból
  --    hívott public függvényeket, és MINDRE megköveteli az `authenticated`
  --    EXECUTE-ot — különben a „kézzel írt lista" (B4) hibaosztály egy másik
  --    listán térne vissza. A P1 azt is NÉVVEL JELZI, ha egy listás név
  --    élesben NEM létezik (eddig az némán kimaradt volna az ellenőrzésből).
  -- ⛔ EZEKET TILOS a `v_lista`-ra (anon-engedélyezőlista) tenni: az az
  --    anonnak adna EXECUTE-ot a jogosultsági rendszer magjára. A 0/z-6
  --    asszert ezt gépileg is tiltja.
  v_rls_seged text[] := ARRAY[
    'current_user_can_access_congregation',
    'current_user_can_edit_congregation',
    'current_user_congregation_id',
    'current_user_is_active_staff',
    'current_user_has_global_access',
    'is_admin', 'is_master_admin',
    -- MINDKETTŐ: az m0-HOTFIX-grants.sql:69 az `is_user_approved(uuid)`-ot,
    -- a :73 az `is_current_user_approved()`-ot grantolja. A korábbi lista
    -- csak az elsőt tartalmazta, tehát a P1 a másikra némán semmit nem nézett.
    'is_user_approved', 'is_current_user_approved',
    'is_egyhazkeruleti_admin',            -- m0-HOTFIX-grants.sql:71
    -- 2026-04-12-phase-0-rls-hardening.sql:220, :227, :293, :301 policy-i hívják
    'csalad_resolves_to_accessible_cong',
    'gyerek_resolves_to_accessible_cong',
    'same_congregation', 'profil_lathato_e'
  ];

  r            record;
  v_anon_oid   oid;
  v_auth_oid   oid;
  v_van_auth   boolean;
  v_van_svc    boolean;
  v_van_hookadmin boolean;
  v_txt        text;
  v_txt2       text;
  v_db         integer;
  v_db2        integer;
  v_db3        integer;
  v_bool       boolean;
  v_szerep     text;

  -- ─────────────────────────────────────────────────────────────────────────
  -- RIPORT-GYŰJTŐ — a NOTICE-ok NEM jutnak el a futtatóhoz
  -- A Supabase Studio a NOTICE-okat NEM jeleníti meg (ezt a repó maga rögzíti:
  -- 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql:439-441), ezért a
  -- FONTOS diagnosztikát egy munkamenet-változóba is kiírjuk, és a ZÁRÓ RÁCS
  -- 0. sora megjeleníti. Két legyet üt: (1) a 3) lépés kihagyott szerepei és
  -- a 0/d–0/e listák láthatóvá válnak; (2) mivel a `set_config(..., false)`
  -- TRANZAKCIONÁLIS, egy visszagördülésnél a beállítás is visszaáll — tehát a
  -- záró rács 0. sora ŐSZINTÉN jelzi, ha az őrszem megbuktatta a migrációt.
  -- (A záró rács a COMMIT UTÁN, önálló utasításként fut, ezért egy megbukott
  --  tranzakció után is megjelenik — csak épp üres riporttal.)
  -- ⚠️ NINCS pg_temp tábla és nincs pg_temp függvény: a Supabase SQL-szerkesztő
  --    munkamenet-csapdája miatt tilos.
  -- ─────────────────────────────────────────────────────────────────────────
  v_riport     text[] := ARRAY[]::text[];
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/z) LISTA-KONZISZTENCIA — a saját listáink regressziós őre
--      Ezek AZONNAL bukjanak, ne a migráció végén.
-- ═══════════════════════════════════════════════════════════════════════════

  -- B4 regresszió: a két e-mail-orákulum NEM kerülhet vissza az anon-listára.
  IF 'login_email_status' = ANY(v_lista) OR 'registration_email_info' = ANY(v_lista) THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-1, B4 regresszio): a login_email_status vagy a registration_email_info visszakerult az ENGEDELYEZOLISTARA. Ezek e-mail-felsorolo orakulumok, az app MAR NEM hivja oket (a 30cf3b29 commit kivette) - bezarni kell oket, nem ujranyitni.';
  END IF;

  -- B4 regresszió: a TERVEZET-rol lemaradt negy anon RPC RAJTA KELL legyen.
  IF NOT ('public_site_context' = ANY(v_lista)
          AND 'public_site_context_v2' = ANY(v_lista)
          AND 'public_sitemap_entries' = ANY(v_lista)
          AND 'public_site_age_distribution' = ANY(v_lista)) THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-2, B4 regresszio): hianyzik az ENGEDELYEZOLISTAROL a negy anon RPC valamelyike (public_site_context, public_site_context_v2, public_sitemap_entries, public_site_age_distribution). Ha ezek elesben nem leteznek, a grant no-op - de a listarol nem hianyozhatnak.';
  END IF;

  -- B1 regresszió: a storage-policy segedje RAJTA KELL legyen a listan.
  IF NOT ('qr_staging_upload_allowed' = ANY(v_lista)) THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-3, B1 regresszio): a qr_staging_upload_allowed hianyzik az ENGEDELYEZOLISTAROL. Ezt hivja az iktato_csatolmanyok_qr_insert_anon storage-policy (TO anon) - nelkule a telefonos QR-feltoltes megallna.';
  END IF;

  -- B2 regresszió: a token-hook KOTELEZOEN a kizarasi listan van.
  IF NOT ('custom_access_token_hook' = ANY(v_kizarva)) THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-4, B2 regresszio): a custom_access_token_hook lekerult a KIZARASI LISTAROL. Az atmentes explicit authenticated grantot adna ra, ami visszanyitna a 2026-09-05-token-hook-p0-zaras.sql altal epp lezart P0-t.';
  END IF;

  -- Konzisztencia: a ket lista metszete URES kell legyen.
  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_txt
  FROM unnest(v_lista) AS x(nev)
  WHERE x.nev = ANY(v_kizarva);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-5): ugyanaz a nev szerepel az ENGEDELYEZOLISTAN es a KIZARASI LISTAN is: %. Dontsd el, melyikre valo.', v_txt;
  END IF;

  -- 0/z-6: RLS-SEGED SOSEM kerulhet az anon-engedelyezolistara.
  -- MIERT KELL EZ AZ OR: a 0/b kapu varhato talalatai eppen az RLS-segedek
  -- (a repoban 103 TO-zaradek nelkuli {public} policy van, es azok donto
  -- tobbsege epp ezeket hivja: is_admin 31, current_user_can_access_congregation
  -- 25, current_user_congregation_id 4, current_user_has_global_access 4,
  -- same_congregation 2 elofordulas). Ha a kapu elsul, es az operator a
  -- legkezenfekvobb megoldast valasztja (felveszem a listara), akkor az anon
  -- EXECUTE-ot kapna a jogosultsagi rendszer MAGJARA - vagyis pont az a lyuk
  -- nyilna ki, amiert ez a kor elindult. Ezert ez GEPI TILALOM, nem tanacs.
  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_txt
  FROM unnest(v_lista) AS x(nev)
  WHERE x.nev = ANY(v_rls_seged);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-6): RLS-SEGED kerult az ANON ENGEDELYEZOLISTARA: %. Ez EXECUTE-ot adna az anonnak a jogosultsagi rendszer magjara - TILOS. Ha a 0/b kapu ezekre sult el, a helyes megoldas az anon TABLA-JOGANAK elvetele az erintett relaciotol (kulon, harmadik fajl: "anon tabla-jog sopres"), NEM a listara vetel.', v_txt;
  END IF;

  -- 0/z-7: a csak-service_role lista nem keveredhet a masik kettovel.
  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_txt
  FROM unnest(v_csak_service_role) AS x(nev)
  WHERE x.nev = ANY(v_lista) OR x.nev = ANY(v_kizarva);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/z-7): a CSAK-SERVICE_ROLE lista eleme szerepel az engedelyezolistan vagy a kizarasi listan is: %. A csak-service_role lista celja PONT az, hogy a service_role jogat MEGTARTSA, mikozben az anon/authenticated jogot nem adja meg - ez a harom lista egymast kizarja.', v_txt;
  END IF;

  RAISE NOTICE '0/z) Lista-konzisztencia: rendben (engedelyezolista % elem, kizarasi lista % elem, csak-service_role % elem).',
    array_length(v_lista, 1), array_length(v_kizarva, 1), array_length(v_csak_service_role, 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/a) SZEREPEK — szerep-toleráns felkészülés
--      Ismert hibaosztály: a 2026-07-17-es lánc élesben 42704-gyel elsült,
--      mert nem létező szerepekre hivatkozott. Itt MINDENT ellenőrzünk.
-- ═══════════════════════════════════════════════════════════════════════════

  SELECT ro.oid INTO v_anon_oid FROM pg_roles ro WHERE ro.rolname = 'anon';
  IF v_anon_oid IS NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/a): az anon szerep NEM LETEZIK. Ez a fajl Supabase-projektre keszult - ellenorizd, hogy a helyes adatbazishoz csatlakoztal.';
  END IF;

  SELECT ro.oid INTO v_auth_oid FROM pg_roles ro WHERE ro.rolname = 'authenticated';
  v_van_auth := (v_auth_oid IS NOT NULL);
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') INTO v_van_svc;
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') INTO v_van_hookadmin;

  IF NOT v_van_auth THEN
    RAISE EXCEPTION 'MEGALLITVA (0/a): az authenticated szerep NEM LETEZIK - az atmentes nem vegezheto el biztonsagosan.';
  END IF;

  RAISE NOTICE '0/a) Szerepek: anon=igen, authenticated=igen, service_role=%, supabase_auth_admin=%.',
    v_van_svc, v_van_hookadmin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/b) MEGÁLLÍTÓ KAPU — hív-e anon-ra vonatkozó RLS-policy olyan public
--      függvényt, ami NINCS az engedélyezőlistán?
--
--      [B1 KIZÁRÁSA] A kapu ISMERI a saját engedélyezőlistáját (`v_lista`),
--      és kizárja azt a keresésből — így a qr_staging_upload_allowed-on NEM
--      áll meg. Ezen bukott el a TERVEZET.
--      [{public} KIFOGÁS] A `polroles = '{0}'` (TO záradék nélküli) policy is
--      találat: az a PUBLIC-ra szól, a PUBLIC pedig az anont IS magában
--      foglalja.
--      [LIKE KIFOGÁS] SEHOL nincs LIKE (az alahuzas a LIKE-ban JOKER, a
--      celnevek pedig tele vannak vele). HELYETTE SZO-HATAROS regex:
--      `kif ~ '(^|[^A-Za-z0-9_])' || proname || '\('`. A puszta strpos hamis
--      talalatot ad, ha az egyik fuggvenynev a masik VEGE (`admin(` ⊂
--      `is_admin(`) - a repoban ma harom ilyen nevpar van. A regexet CSAK
--      tiszta azonosito-neveken hasznaljuk: egy regex-metakaraktert tartalmazo
--      nev forditasi hibara futna, ott marad a (fail-closed) strpos.
--      [HAMIS RIASZTAS 1] Csak akkor VALODI kitettseg, ha az anonnak
--      TABLA- VAGY OSZLOP-szintu joga is van a relaciora. Enelkul a policy
--      soha nem ertekelodik ki anon-kent, es a 104 {public} policy elarasztana
--      a kaput. ⚠️ A `has_table_privilege` KIZAROLAG a tabla-szintu ACL-t
--      nezi; a `districts` es a `dioceses` anon-joga OSZLOP-szintu
--      (2026-08-15-…S1…sql:463-466, …S1b…sql:131-133), miközben az anon SELECT
--      policy-juk SZANDEKOSAN megmaradt (S1:420-421) - ezert kell melle a
--      `has_any_column_privilege`, kulonben a kapu szerkezetileg VAK.
--      [HAMIS RIASZTAS 2] A kapu UGYANARRA a halmazra szukit, mint a 2) lepes:
--      `pg_has_role(current_user, proowner,'USAGE')` + a kiterjesztes-tagok
--      kizarasa. Amihez a migracio HOZZA SEM NYUL, annak az anon joga MEGMARAD
--      - egy rajuk elsulo kapu az EGESZ migraciot megbuktatna egy nem erintett
--      fuggveny miatt. (A P6 uto-ellenorzes viszont a TENYLEGES
--      `has_function_privilege`-et nezi, ott ez a szukites nem kell.)
-- ═══════════════════════════════════════════════════════════════════════════

  v_txt := NULL;
  SELECT string_agg(x.sor, chr(10) ORDER BY x.sor) INTO v_txt
  FROM (
    SELECT DISTINCT
      n2.nspname || '.' || c.relname || ' / ' || pol.polname
      || '  (' || CASE WHEN pol.polroles = '{0}'::oid[] THEN 'TO nelkul = {public}' ELSE 'TO anon' END || ')'
      || '  ->  ' || pr.proname
      || CASE WHEN pr.proname = ANY(v_rls_seged)
              THEN '   [RLS-SEGED! TILOS a v_lista-ra tenni]' ELSE '' END AS sor
    FROM pg_policy pol
    JOIN pg_class c      ON c.oid = pol.polrelid
    JOIN pg_namespace n2 ON n2.oid = c.relnamespace
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS kif
    ) e
    JOIN pg_proc pr      ON (CASE WHEN pr.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                                  THEN e.kif ~ ('(^|[^A-Za-z0-9_])' || pr.proname || '\(')
                                  ELSE strpos(e.kif, pr.proname || '(') > 0 END)
    JOIN pg_namespace n3 ON n3.oid = pr.pronamespace AND n3.nspname = 'public'
    WHERE (pol.polroles = '{0}'::oid[] OR v_anon_oid = ANY(pol.polroles))
      AND (has_table_privilege('anon', pol.polrelid, 'SELECT, INSERT, UPDATE, DELETE')
           OR has_any_column_privilege('anon', pol.polrelid, 'SELECT, INSERT, UPDATE, REFERENCES'))
      AND NOT (pr.proname = ANY(v_lista))
      -- ugyanaz a halmaz, mint a 2) lepesben (lasd [HAMIS RIASZTAS 2])
      AND pg_has_role(current_user, pr.proowner, 'USAGE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass
                        AND d.objid = pr.oid AND d.deptype = 'e')
  ) x;

  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/b): van olyan anon-ra vonatkozo policy (a TO nelkuli {public} policy-kat is beleertve), ami az ENGEDELYEZOLISTAN KIVULI public fuggvenyt hiv, es az anonnak tabla- vagy oszlop-szintu joga is van a relaciora. Az anon-revoke utan ez a policy 42501-re futna, es a tabla anon-hozzaferese MEGALLNA. Erintettek: % ||| TEENDO, EBBEN A SORRENDBEN: (1) VEDD EL AZ ANON TABLA-JOGAT a relaciotol (ez a helyes megoldas a leggyakoribb esetben - kulon, harmadik fajl: "anon tabla-jog sopres"), VAGY (2) ird at a policy-t fuggvenyhivas nelkulire, VAGY (3) CSAK HA a fuggveny valoban az anon nyilvanos utjahoz kell: vedd fel a v_lista tombbe. ⛔ RLS-SEGEDET (is_admin, same_congregation, current_user_can_access_congregation, ...) TILOS a v_lista-ra tenni: az EXECUTE-ot adna az anonnak a jogosultsagi rendszer magjara, vagyis PONT azt a lyukat nyitna ki, amiert ez a kor elindult - a 0/z-6 asszert ezt gepileg is tiltja. A migracio VISSZAGORDULT, semmi nem valtozott.', v_txt;
  END IF;

  RAISE NOTICE '0/b) Anon-policy kapu: rendben, egyetlen anon-policy sem hiv engedelyezolistan kivuli fuggvenyt.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/c) MEGÁLLÍTÓ KAPU — hív-e SECURITY INVOKER függvény kizárási listás
--      segédet? Ha igen, a jog elvétele ELTÖRNÉ azt a hívási utat.
--
--      A SECURITY DEFINER burkolók NEM számítanak: azok belsejében az
--      effektív felhasználó a TULAJDONOS, tehát a beágyazott hívásnál a
--      Postgres a tulajdonos EXECUTE-jogát ellenőrzi, nem a hívóét. Ezért
--      törhető el biztonságosan a `_resolve_or_create_*` külső joga.
--
--      A minta KOMMENTMENTES törzsön fut: a `pg_proc.prosrc` a `--`
--      kommenteket IS tartalmazza, es egy naiv kereses raszalad a sajat
--      dokumentaciojara (elo pelda: a repoban tobb fajl KOMMENTBEN emliti a
--      _resolve_or_create_street-et).
--
--      ⚠️ A `prosqlbody` IS: a Postgres 14 ota (ez az adatbazis 17-es) a
--         SQL-szabvany szerinti `BEGIN ATOMIC` torzsu fuggvenyek torzse NEM a
--         `prosrc`-ben el, hanem a `prosqlbody` oszlopban - egy ilyen
--         SECURITY INVOKER fuggveny, ami kizarasi listas segedet hiv,
--         ATCSUSZNA a kapun, es a jog elvetele utan 42501-re futna. A repoban
--         ma nincs `BEGIN ATOMIC` (ellenorizve), de a repo NEM bizonyitek az
--         eles allapotra. A `pg_get_function_sqlbody()` NULL-t ad, ha nincs
--         SQL-torzs, ezert a COALESCE.
--
--      ⚠️ SZO-HATAROS regex, nem puszta strpos (lasd a 0/b magyarazatat).
-- ═══════════════════════════════════════════════════════════════════════════

  v_txt := NULL;
  SELECT string_agg(x.sor, chr(10) ORDER BY x.sor) INTO v_txt
  FROM (
    SELECT DISTINCT hivo.oid::regprocedure::text || '  ->  ' || cel.proname AS sor
    FROM pg_proc hivo
    JOIN pg_namespace nh ON nh.oid = hivo.pronamespace AND nh.nspname = 'public'
    JOIN pg_proc cel     ON cel.proname = ANY(v_kizarva) AND cel.oid <> hivo.oid
    JOIN pg_namespace nc ON nc.oid = cel.pronamespace AND nc.nspname = 'public'
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(hivo.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g')
             || ' ' || COALESCE(pg_get_function_sqlbody(hivo.oid), '') AS torzs
    ) t
    WHERE NOT hivo.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass
                        AND d.objid = hivo.oid AND d.deptype = 'e')
      AND (CASE WHEN cel.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                THEN t.torzs ~ ('(^|[^A-Za-z0-9_])' || cel.proname || '\(')
                ELSE strpos(t.torzs, cel.proname || '(') > 0 END)
  ) x;

  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/c): SECURITY INVOKER fuggveny hiv KIZARASI LISTAS segedet, tehat a hivo szerep jogat ellenorzi a Postgres. A jog elvetele eltorne ezt az utat. Erintettek: % ||| TEENDO: vagy tedd a hivot SECURITY DEFINER-re, vagy vedd le a celt a v_kizarva listarol es adj neki celzott grantot. A migracio VISSZAGORDULT.', v_txt;
  END IF;

  RAISE NOTICE '0/c) Kizarasi-lista kapu: rendben, a kizart segedeket csak SECURITY DEFINER burkolok hivjak.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/f) MEGÁLLÍTÓ KAPU — a kizárási listás nevek MINDEN OLYAN helyen, ahol a
--      Postgres FUTÁSIDŐBEN, a HÍVÓ azonosítójával ellenőrzi az EXECUTE jogot
--
--      MIÉRT KELL A 0/c MELLÉ: a 0/c csak a `public` séma SECURITY INVOKER
--      FÜGGVÉNYTÖRZSEIT nézi. A Postgres viszont a POLICY-, DEFAULT- és
--      CHECK-kifejezésekben szereplő függvényekre is futásidőben, a hívó
--      jogán ellenőriz (executor: `pg_proc_aclcheck(GetUserId())`). Az 5)
--      lépés `REVOKE ALL … FROM authenticated` sora egy ilyen találat esetén
--      42501-re vinné az érintett tábla írását/olvasását MINDEN bejelentkezett
--      felhasználónak — kapu nélkül, a tranzakció ZÖLD lefutása mellett.
--
--      NÉGY HELY, amit a 0/c NEM néz:
--        (1) `pg_policy` kifejezések — SZEREPTŐL FÜGGETLENÜL (a 0/b csak az
--            anon-oldalt vizsgálja; egy `TO authenticated` policy nem állítaná
--            meg a fájlt),
--        (2) CHECK-kényszerek (`pg_constraint`),
--        (3) oszlop-DEFAULT kifejezések (`pg_attrdef`),
--        (4) nézet-definíciók (`pg_views`).
--
--      A repó mai migrációiban nem találtunk ilyen DEFAULT-ot vagy CHECK-et —
--      de a repó NEM bizonyíték az éles állapotra (lásd az A) fájl fejlécét).
-- ═══════════════════════════════════════════════════════════════════════════

  v_txt := NULL;
  SELECT string_agg(x.sor, chr(10) ORDER BY x.sor) INTO v_txt
  FROM (
    -- (1) MINDEN policy, szereptől függetlenül (ideértve a storage.objects-et is)
    SELECT DISTINCT 'POLICY  ' || n2.nspname || '.' || c.relname || ' / ' || pol.polname
                    || '  ->  ' || cel.proname AS sor
    FROM pg_policy pol
    JOIN pg_class c      ON c.oid = pol.polrelid
    JOIN pg_namespace n2 ON n2.oid = c.relnamespace
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS kif
    ) e
    JOIN pg_proc cel     ON cel.proname = ANY(v_kizarva)
    JOIN pg_namespace nc ON nc.oid = cel.pronamespace AND nc.nspname = 'public'
    WHERE (CASE WHEN cel.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                THEN e.kif ~ ('(^|[^A-Za-z0-9_])' || cel.proname || '\(')
                ELSE strpos(e.kif, cel.proname || '(') > 0 END)

    UNION ALL
    -- (2) CHECK-kényszerek
    SELECT DISTINCT 'CHECK  ' || con.conrelid::regclass::text || ' / ' || con.conname
                    || '  ->  ' || cel.proname
    FROM pg_constraint con
    JOIN pg_proc cel     ON cel.proname = ANY(v_kizarva)
    JOIN pg_namespace nc ON nc.oid = cel.pronamespace AND nc.nspname = 'public'
    WHERE con.contype = 'c' AND con.conbin IS NOT NULL
      AND (CASE WHEN cel.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                THEN pg_get_constraintdef(con.oid) ~ ('(^|[^A-Za-z0-9_])' || cel.proname || '\(')
                ELSE strpos(pg_get_constraintdef(con.oid), cel.proname || '(') > 0 END)

    UNION ALL
    -- (3) oszlop-DEFAULT kifejezések
    SELECT DISTINCT 'DEFAULT  ' || ad.adrelid::regclass::text || '.' || att.attname
                    || '  ->  ' || cel.proname
    FROM pg_attrdef ad
    JOIN pg_attribute att ON att.attrelid = ad.adrelid AND att.attnum = ad.adnum
    JOIN pg_proc cel      ON cel.proname = ANY(v_kizarva)
    JOIN pg_namespace nc  ON nc.oid = cel.pronamespace AND nc.nspname = 'public'
    WHERE (CASE WHEN cel.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                THEN pg_get_expr(ad.adbin, ad.adrelid) ~ ('(^|[^A-Za-z0-9_])' || cel.proname || '\(')
                ELSE strpos(pg_get_expr(ad.adbin, ad.adrelid), cel.proname || '(') > 0 END)

    UNION ALL
    -- (4) nézet-definíciók
    SELECT DISTINCT 'VIEW  ' || v.schemaname || '.' || v.viewname || '  ->  ' || cel.proname
    FROM pg_views v
    JOIN pg_proc cel     ON cel.proname = ANY(v_kizarva)
    JOIN pg_namespace nc ON nc.oid = cel.pronamespace AND nc.nspname = 'public'
    -- a rendszer-semak nezetei nem hivhatjak a mi fuggvenyeinket; kihagyva
    WHERE v.schemaname NOT IN ('pg_catalog', 'information_schema')
      AND v.definition IS NOT NULL
      AND (CASE WHEN cel.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                THEN v.definition ~ ('(^|[^A-Za-z0-9_])' || cel.proname || '\(')
                ELSE strpos(v.definition, cel.proname || '(') > 0 END)
  ) x;

  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/f): KIZARASI LISTAS fuggvenyt hiv egy policy-, CHECK-, DEFAULT- vagy nezet-kifejezes. A Postgres ezekre FUTASIDOBEN, a HIVO azonositojaval ellenorzi az EXECUTE jogot, tehat az 5) lepes REVOKE-ja 42501-re vinne az erintett tabla hasznalatat MINDEN bejelentkezett felhasznalonak. Erintettek: % ||| TEENDO: vagy vedd le a celt a v_kizarva listarol es adj neki celzott grantot (authenticated), vagy szuntesd meg a hivast az adott kifejezesben. A migracio VISSZAGORDULT.', v_txt;
  END IF;

  RAISE NOTICE '0/f) Kifejezes-kapu: rendben, kizarasi listas nevet egyetlen policy / CHECK / DEFAULT / nezet sem hiv.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/d) TÁJÉKOZTATÓ — mit fog a 2) lépés KIHAGYNI (nem hiba, csak tudni kell)
-- ═══════════════════════════════════════════════════════════════════════════

  SELECT count(*), string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_db, v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND EXISTS (SELECT 1 FROM pg_depend d
                WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');

  SELECT count(*), string_agg(p.proname || ' [tulaj=' || p.proowner::regrole::text || ']', ', ' ORDER BY p.proname)
    INTO v_db2, v_txt2
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT pg_has_role(current_user, p.proowner, 'USAGE');

  RAISE NOTICE '0/d) KIHAGYVA - kiterjesztes-tulajdonu rutin: % db (%)', v_db, COALESCE(v_txt, 'nincs');
  RAISE NOTICE '0/d) KIHAGYVA - idegen tulajdonu rutin: % db (%)', v_db2, COALESCE(v_txt2, 'nincs');
  v_riport := v_riport || ('0/d) KIHAGYVA - kiterjesztes-tulajdonu rutin: ' || v_db || ' db (' || COALESCE(v_txt, 'nincs') || ')');
  v_riport := v_riport || ('0/d) KIHAGYVA - idegen tulajdonu rutin: ' || v_db2 || ' db (' || COALESCE(v_txt2, 'nincs') || ')');

-- ═══════════════════════════════════════════════════════════════════════════
-- 0/e) MEGÁLLÍTÓ KAPU — MELY TOVÁBBI SZEREPEK VESZTENÉNEK a PUBLIC-revoke miatt
--
--      Az átmentés (1. lépés) magától CSAK az `authenticated` és a
--      `service_role` hozzáférését menti át. Minden MÁS, nem-superuser szerep,
--      amelyik ma KIZÁRÓLAG a PUBLIC-on át hívja a public-beli rutinokat,
--      elveszíti a jogot. Érintett lehet a `supabase_auth_admin`, a
--      `supabase_storage_admin`, az `authenticator`, a `pgbouncer`, a
--      `dashboard_user`, vagy egy `cron.job.username`-ben rögzített, nem
--      tulajdonos szerep — bármelyiküknél a következmény egy CSENDBEN MEGÁLLÓ
--      háttérfolyamat vagy hitelesítési lépés.
--      (A superuserek és a tulajdonos érintetlenek: nekik implicit joguk van.)
--
--      ⛔ MIÉRT KAPU, ÉS MIÉRT NEM NOTICE (a korábbi változat hibája):
--         a szöveg azt követelte, hogy „ELŐBB adj neki célzott grantot, és
--         csak azután futtasd ezt" — de (a) csak `RAISE NOTICE` volt, tehát
--         nem állt meg, (b) a Supabase Studio a NOTICE-okat NEM jeleníti meg
--         (2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql:439-441), és
--         (c) a blokk a TRANZAKCIÓN BELÜL futott: mire a lista megjelent
--         volna, a 2) lépés már el is vette a PUBLIC EXECUTE-ot, és a fájl
--         COMMIT-olt. A figyelmeztetés tehát SOSEM jutott el a futtatóhoz,
--         miközben a fájl a döntést tőle várta. Ez fail-open szerkezet volt
--         egy kizárólag jogot szűkítő fájlban.
--
--      KILÉPÉSI ÚT (kettő van, mindkettő TUDATOS döntés):
--        (1) MEGTARTOM: írd a szerep nevét a `v_atmentendo_szerepek` tömbbe
--            → az 1) lépés NEKI IS kiad explicit grantot mindenre, amit ma
--            hívhat, tehát a viselkedése NEM változik.
--        (2) ELVESZÍTHETI: írd a `v_tudomasul_vett_szerepek` tömbbe. Ez nem
--            ad neki semmit — csak rögzíti, hogy a döntés megszületett.
--
--      TÁMPONT A DÖNTÉSHEZ (de a mérés az A) fájl 26. sora, nem ez):
--        · `supabase_auth_admin` — a bejelentkezéshez EGYETLEN public rutin
--          kell neki, a `custom_access_token_hook`, amit az 5) lépés CÉLZOTTAN
--          megkap (:660). Ezen felül nincs ismert szüksége a public sémára →
--          általában a (2) ág.
--        · `authenticator` — a PostgREST ezzel a szereppel csatlakozik, majd
--          `SET ROLE anon / authenticated`; a függvényeket már a beállított
--          szerep jogán hívja → általában a (2) ág.
--        · `dashboard_user` — a Supabase Studio SQL-szerkesztője. Ha innen
--          futtatsz kézi lekérdezéseket public függvényekre, (1) ág.
--        · `supabase_storage_admin` — a Storage szerver szerepe. Ha a storage
--          policy-k public segédfüggvényt hívnak (nálunk igen:
--          `qr_staging_upload_allowed`), és a kiértékelés NEM anon/authenticated
--          szerepben történik, akkor (1) ág. ⚠️ Ez az egyetlen, ahol a rossz
--          döntés a telefonos QR-feltöltést állíthatja meg — ha bizonytalan
--          vagy, válaszd az (1) ágat: az explicit grant itt nem tágít semmit,
--          csak rögzíti a MAI hozzáférést.
--
--      ⚠️ A LISTÁT AZ A) FÁJL 26. SORA MÁR A MIGRÁCIÓ ELŐTT MEGADJA — a
--         döntés ott, nyugodtan meghozható, nem futás közben.
-- ═══════════════════════════════════════════════════════════════════════════

  SELECT string_agg(ro.rolname, ', ' ORDER BY ro.rolname) INTO v_txt
  FROM pg_roles ro
  WHERE NOT ro.rolsuper
    AND ro.rolname NOT IN ('anon', 'authenticated', 'service_role', current_user)
    -- SZANDEKOSAN left(), nem LIKE: az alahuzas a LIKE-ban JOKER, es ebben a
    -- fajlban sehol nem hasznalunk LIKE-mintat nevekre (lasd a fejlecet).
    AND left(ro.rolname, 3) <> 'pg_'
    AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT pg_has_role(ro.oid, p.proowner, 'USAGE')
        AND (p.proacl IS NULL
             OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
    );

  RAISE NOTICE '0/e) A PUBLIC-on at (is) hozzaferő tovabbi, nem-superuser szerepek: %',
    COALESCE(v_txt, 'nincs ilyen');
  v_riport := v_riport || ('0/e) A PUBLIC-on at hozzaferő tovabbi, nem-superuser szerepek: ' || COALESCE(v_txt, 'nincs ilyen'));

  -- A KAPU: minden ilyen szerepről DÖNTENI kell (atmentendo VAGY tudomasul vett).
  SELECT string_agg(ro.rolname, ', ' ORDER BY ro.rolname) INTO v_txt2
  FROM pg_roles ro
  WHERE NOT ro.rolsuper
    AND ro.rolname NOT IN ('anon', 'authenticated', 'service_role', current_user)
    AND left(ro.rolname, 3) <> 'pg_'
    AND NOT (ro.rolname = ANY(v_atmentendo_szerepek))
    AND NOT (ro.rolname = ANY(v_tudomasul_vett_szerepek))
    AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT pg_has_role(ro.oid, p.proowner, 'USAGE')
        AND (p.proacl IS NULL
             OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
    );
  IF v_txt2 IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (0/e): a kovetkezo nem-superuser szerep(ek) MA a PUBLIC-on at (is) hivjak a public-beli rutinokat, es a 2) lepes PUBLIC-revoke-ja utan ELVESZTENEK ezt a hozzaferest: % ||| DONTS ROLUK, es ird be a nevuket a fajl elejen: (1) v_atmentendo_szerepek  -> az 1) lepes explicit grantot ad neki, a viselkedese NEM valtozik; VAGY (2) v_tudomasul_vett_szerepek -> tudatosan hagyod, hogy elveszitse. ⚠️ Ezt a listat az A) fajl 26. sora MAR A MIGRACIO ELOTT megadja - a dontes ott meghozhato. A migracio VISSZAGORDULT, semmi nem valtozott.', v_txt2;
  END IF;

  RAISE NOTICE '0/e) Szerep-kapu: rendben (atmentendo: %, tudomasul vett: %).',
    COALESCE(array_to_string(v_atmentendo_szerepek, ', '), '-'),
    COALESCE(array_to_string(v_tudomasul_vett_szerepek, ', '), '-');
  v_riport := v_riport || ('0/e) Szerep-kapu: atmentendo=[' || COALESCE(array_to_string(v_atmentendo_szerepek, ', '), '') || '], tudomasul vett=[' || COALESCE(array_to_string(v_tudomasul_vett_szerepek, ', '), '') || ']');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ÁTMENTÉS — ami MA hívható, az EXPLICIT grantot kap
--
--    Miért kell: a 2) lépés `REVOKE … FROM PUBLIC`-ja a bejelentkezettektől
--    IS elvenné a jogot minden olyan függvénynél, amit ma a PUBLIC-on
--    KERESZTÜL kapnak. Az átmentés után a migráció az ő szemszögükből NULLA
--    viselkedés-változás.
--
--    [B2 KIZÁRÁSA] `v_kizarva` — a veszélyes függvények NEM kapnak explicit
--    ACL-bejegyzést. Az örökölt PUBLIC-jog eltávolítható; egy explicit
--    ACL-bejegyzést viszont egyetlen későbbi `REVOKE … FROM PUBLIC` sem
--    venne le, csak célzott, függvényenkénti REVOKE.
--    [B3 KIZÁRÁSA] `ON ROUTINE`, prokind-szűrő NÉLKÜL: eljárás, aggregátum
--    és ablakfüggvény is teljes lefedettséggel.
--
--    ⚠️ EZ A LÉPÉS A LEGNEHEZEBBEN VISSZAFORDÍTHATÓ. Ezért az A) fájl 27. és
--       28. sora NÉVSZERINT is megadja, mely SECURITY DEFINER rutinok kapnának
--       explicit `authenticated` bejegyzést, és ebből hány LENNE ÚJ (ma csak a
--       PUBLIC-on át hívható). A kizárási listát ENNEK ALAPJÁN kell bővíteni,
--       MIELŐTT ez a fájl elindul.
--
--    ⚠️ `v_csak_service_role` — ezekre NEM adunk `authenticated` grantot. A
--       `lelkeszi_naptar_feed` privát, token-védett feed, amit az app csak
--       admin-klienssel (service_role) hív; egy explicit `authenticated`
--       bejegyzés ott VISSZAFORDÍTHATATLANUL rögzítené a hozzáférést, és a
--       fájl a SAJÁT záró rácsa 9. sorával kerülne ellentmondásba.
--
--    ⚠️ `v_atmentendo_szerepek` — a 0/e kapunál TUDATOSAN megtartott további
--       szerepek is megkapják az explicit grantot mindenre, amit ma hívhatnak.
-- ═══════════════════════════════════════════════════════════════════════════

  v_db := 0; v_db2 := 0; v_db3 := 0;
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           p.oid                     AS poid,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
           CASE WHEN v_van_svc THEN has_function_privilege('service_role', p.oid, 'EXECUTE')
                ELSE false END AS svc_ok,
           (p.proname = ANY(v_csak_service_role)) AS csak_svc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT (p.proname = ANY(v_kizarva))
      AND pg_has_role(current_user, p.proowner, 'USAGE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass
                        AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    IF r.auth_ok AND NOT r.csak_svc THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO authenticated', r.sig);
      v_db := v_db + 1;
    END IF;
    IF r.svc_ok THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO service_role', r.sig);
      v_db2 := v_db2 + 1;
    END IF;

    -- A 0/e kapunal TUDATOSAN megtartott tovabbi szerepek atmentese.
    -- ⚠️ A SZEREPNEV `%I` (azonositokent idezojelezve), a SZIGNATURA `%s`.
    --    A szignaturat TILOS `%I`-vel adni: az mar `regprocedure`-bol jott,
    --    komplett `public.fv(uuid, text)` alak - egy `%I` az EGESZET egyetlen
    --    idezojeles azonositova tenne, es a GRANT 42883-mal elszallna.
    IF array_length(v_atmentendo_szerepek, 1) IS NOT NULL AND NOT r.csak_svc THEN
      FOREACH v_szerep IN ARRAY v_atmentendo_szerepek LOOP
        -- ⚠️ KETTOS FELTETEL, KET KULON IF-BEN: a Postgres az AND kiertekelesi
        --    sorrendjet NEM garantalja, tehat egy nem letezo szerepnel a
        --    has_function_privilege 22023-mal elszallna es visszagorditene a
        --    tranzakciot. (A 0/e kapu ugyan mar szurte, de a tomb kezzel irt.)
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_szerep) THEN
          -- `::name` cast: a has_function_privilege elso parametere `name`
          -- tipusu; egy `text` valtozonal ne az implicit konverziora bizzuk.
          IF has_function_privilege(v_szerep::name, r.poid, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO %I', r.sig, v_szerep);
            v_db3 := v_db3 + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE '1) Atmentve EXPLICIT grantba: % rutin -> authenticated, % rutin -> service_role, % grant -> a tovabbi megtartott szerepeknek.',
    v_db, v_db2, v_db3;
  v_riport := v_riport || ('1) Atmentve EXPLICIT grantba: ' || v_db || ' -> authenticated, ' || v_db2 || ' -> service_role, ' || v_db3 || ' -> tovabbi megtartott szerepek');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) A VISSZAVONÁS — PUBLIC és anon EXECUTE minden saját tulajdonú,
--    nem kiterjesztés-tag public rutinról.  [G1 lezárása, meglévőkre]
--
--    Miért DO-ciklus és nem `REVOKE … ON ALL ROUTINES IN SCHEMA public`:
--    az egy utasításos alak NEM tud szűrni, tehát ráfutna a kiterjesztések
--    (pgcrypto / unaccent / pg_trgm) függvényeire is. Ott két rossz kimenet
--    lehetséges: (a) élesen elsül, és megáll minden `DEFAULT gen_random_uuid()`
--    beszúrás meg minden trigram-keresés; (b) néma no-op WARNING-gal, és
--    utána a nulla-toleranciás őrszem buktatja meg a hibátlan migrációt.
--    A `pg_has_role(current_user, proowner, 'USAGE')` pedig azt zárja ki,
--    hogy egy idegen tulajdonú rutinon 42501-gyel („must be owner of
--    function") elszálljon az EGÉSZ tranzakció.
--
--    ⚠️ A `service_role` és a `supabase_auth_admin` jogához NEM NYÚLUNK.
-- ═══════════════════════════════════════════════════════════════════════════

  v_db := 0;
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_has_role(current_user, p.proowner, 'USAGE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass
                        AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM anon', r.sig);
    v_db := v_db + 1;
  END LOOP;

  RAISE NOTICE '2) Visszavonva a PUBLIC es az anon EXECUTE joga % rutinrol.', v_db;
  v_riport := v_riport || ('2) Visszavonva a PUBLIC es az anon EXECUTE joga ' || v_db || ' rutinrol');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) ALAPÉRTELMEZETT JOGOK — hogy az EZUTÁN létrehozott függvények se
--    örököljék a jogot.  [G1 + G2 lezárása, jövőbeliekre]
--
--    A `FOR ROLE` nélküli `ALTER DEFAULT PRIVILEGES` KIZÁRÓLAG az AKTUÁLIS
--    szerep által létrehozott objektumokra hat, és tagságon át NEM
--    öröklődik. Ezért NEM elég egyszer, `postgres`-re kiadni: a
--    `pg_default_acl` MINDEN érintett szerepére ki kell adni.
--    (A TERVEZET itt kétszer ugyanazt a szerepet célozta meg.)
--
--    ⛔ GLOBÁLIS (SÉMA NÉLKÜLI) BEJEGYZÉSEK — a korábbi változat vakfoltja:
--       egy `ALTER DEFAULT PRIVILEGES … ON FUNCTIONS …` `IN SCHEMA` ZÁRADÉK
--       NÉLKÜL `defaclnamespace = 0`-val kerül a katalógusba. Ilyen alak a
--       repóban is él: 2026-07-18-public-site-content-and-sitemap.sql:251-253.
--       A Postgres a `get_user_default_acl`-ben a GLOBÁLIS ÉS a séma-szintű
--       ACL-t ÖSSZEFÉSÜLI, tehát egy globális GRANT-ot egy
--       `IN SCHEMA public REVOKE` NEM olt ki. Ezért:
--         · a szerep-gyűjtő a `defaclnamespace = 0` sorokat IS beveszi
--           (különben egy CSAK globális bejegyzésű szerep be sem kerülne a
--            ciklusba),
--         · és ahol a szerepnek VAN globális bejegyzése, ott `IN SCHEMA`
--           NÉLKÜLI REVOKE-ot is kiadunk.
--
--    ⚠️ A KIHAGYOTT szerepek NEM NOTICE-ban vesznek el: bekerülnek a
--       `v_riport`-ba, és a ZÁRÓ RÁCS 0. sora megjeleníti őket. (A záró rács
--       8. sora korábban a 3) lépés NOTICE-aira hivatkozott — körkörösen,
--       mert azok sem látszottak.)
-- ═══════════════════════════════════════════════════════════════════════════

  v_db := 0;
  -- ⚠️ A csoportositas a UNION ALL FOLOTT van, nem alatta: egy sima `UNION`
  --    a (rolname, van_globalis) parokat dedupliklna, tehat egy globalis
  --    bejegyzessel rendelkezo `postgres` KETSZER kerulne a ciklusba (egyszer
  --    true-val, egyszer false-szal) - a szamlalo hazudna, a riport duplazna.
  FOR r IN
    SELECT s.rolname, bool_or(s.van_globalis) AS van_globalis
    FROM (
      SELECT ro.rolname, (d.defaclnamespace = 0) AS van_globalis
      FROM pg_default_acl d
      JOIN pg_roles ro ON ro.oid = d.defaclrole
      WHERE d.defaclobjtype = 'f'
        AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
      UNION ALL
      -- A futtato es a postgres MINDIG benne van, meg ha ma nincs is bejegyzese:
      -- az altaluk letrehozott JOVOBELI fuggvenyekre kell a fail-closed default.
      SELECT ro2.rolname, false FROM pg_roles ro2 WHERE ro2.rolname = current_user
      UNION ALL
      SELECT ro3.rolname, false FROM pg_roles ro3 WHERE ro3.rolname = 'postgres'
    ) s
    GROUP BY s.rolname
  LOOP
    IF pg_has_role(current_user, r.rolname, 'USAGE') THEN
      -- (G1) a beepitett PUBLIC=X alapertelmezes lezarasa a public semaban
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC', r.rolname);
      -- (G2) a 2026-04-23-m0-HOTFIX-grants.sql:94 elo `TO authenticated` default lezarasa
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM authenticated', r.rolname);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM anon', r.rolname);

      -- (G2/globalis) SEMA-ZARADEK NELKUL is - kulonben egy globalis GRANT
      -- eletben maradna, es a fejlec „MINDKETTOT bezarja" allitasa HAMIS lenne.
      IF r.van_globalis THEN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON ROUTINES FROM PUBLIC', r.rolname);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON ROUTINES FROM authenticated', r.rolname);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON ROUTINES FROM anon', r.rolname);
      END IF;

      v_db := v_db + 1;
      RAISE NOTICE '3) Alapertelmezett jogok lezarva ehhez a szerephez: %  (globalis bejegyzes: %)', r.rolname, COALESCE(r.van_globalis, false);
      v_riport := v_riport || ('3) LEZARVA: ' || r.rolname || CASE WHEN COALESCE(r.van_globalis, false) THEN '  (a GLOBALIS bejegyzes is)' ELSE '' END);
    ELSE
      RAISE NOTICE '3) KIHAGYVA (nincs ra jogod): %  -- ezt a szerepet KEZZEL kell lezarni!', r.rolname;
      v_riport := v_riport || ('3) ⛔ KIHAGYVA (nincs ra jogod): ' || r.rolname || '  -- EZT A SZEREPET KEZZEL KELL LEZARNI!');
    END IF;
  END LOOP;

  IF v_db = 0 THEN
    RAISE EXCEPTION 'MEGALLITVA (3): egyetlen szerep alapertelmezett jogait sem tudtuk lezarni. Enelkul minden UJ fuggveny ujra nyilvanosan hivhato lenne - a migracio ertelmetlen. A migracio VISSZAGORDULT.';
  END IF;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) ENGEDÉLYEZŐLISTA — az anon visszakapja a 17 mért, szükséges hívást.
--    Név szerint sorolunk, ezért minden túlterhelés megkapja; és csak akkor
--    grantolunk, ha a függvény LÉTEZIK (ami nincs, arra a grant no-op).
--    [B4 KIZÁRÁSA] a lista kód-mérésből áll, nem feltevésből.
-- ═══════════════════════════════════════════════════════════════════════════

  -- FAIL-CLOSED ELOELLENORZES: ha egy engedelyezolistas rutin NEM a mi
  -- hatokorunkben van, a grant neman kimaradna, es a P2 orszem kesobb egy
  -- felrevezeto uzenettel buktatna meg a migraciot. Inkabb ITT alljunk meg,
  -- nevvel es tulajdonossal.
  SELECT string_agg(p.oid::regprocedure::text || ' [tulaj=' || p.proowner::regrole::text || ']', ', '
                    ORDER BY p.oid::regprocedure::text) INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_lista)
    AND NOT pg_has_role(current_user, p.proowner, 'USAGE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (4): ENGEDELYEZOLISTAS rutin NEM a futtato hatokoreben van, tehat nem tudunk ra anon EXECUTE-ot adni: % ||| TEENDO: futtasd a migraciot a tulajdonos szerep neveben (SET ROLE), vagy add ki ezekre a GRANT-ot kezzel. A migracio VISSZAGORDULT.', v_txt;
  END IF;

  v_db := 0;
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_lista)
      AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO anon', r.sig);
    v_db := v_db + 1;

    -- Ez az OT az anon MELLETT az authenticated-nek IS kell:
    --  · congregations_for_registration : az /oauth-complete urlap BEJELENTKEZVE hivja
    --    (components/auth/oauth-complete-form.tsx, a page.tsx getUser()-rel kapuzott)
    --  · qr_session_lookup / qr_register_upload / qr_staging_upload_allowed :
    --    a telefonon eppenseggel be lehet jelentkezve (2026-07-25-f8d:722-724, :774-775)
    --  · check_access_request_rate_limit : a repo MINDHAROM erintett fajlja megadja
    --    mindket szerepnek - a 2026-04-23-m0-HOTFIX-grants.sql:65-66 es a
    --    2026-04-23-m0-REPAIR-idempotent.sql:462 egyetlen `TO anon, authenticated`
    --    sorral, a 2026-05-02-fix-access-requests-COMPLETE.sql pedig KET kulon
    --    utasitassal (:118 anon, :119 authenticated). A bovebb alak azert is
    --    helyes, mert az /oauth-complete ut bejelentkezve is athaladhat rajta.
    IF r.proname IN ('congregations_for_registration', 'check_access_request_rate_limit',
                     'qr_session_lookup', 'qr_register_upload', 'qr_staging_upload_allowed') THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO authenticated', r.sig);
    END IF;
  END LOOP;

  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_txt
  FROM unnest(v_lista) AS x(nev)
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = x.nev);

  RAISE NOTICE '4) Engedelyezolista: % rutin (tulterhelesekkel) kapott anon EXECUTE-ot.', v_db;
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE '4b) A listabol elesben NEM LETEZIK (nem hiba, a grant rajuk no-op): %', v_txt;
  END IF;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) A KIZÁRÁSI LISTA TELJES ZÁRÁSA  [B5 KIZÁRÁSA]
--    Nem elég az anon felé zárni: ezeket a függvényeket az app EGYETLEN
--    szerepbol sem hivja, tehat az `authenticated` jogat is el kell venni.
--    MINDEN TULTERHELESRE, nev szerint. ⚠️ AZ INDOK NEM AZ, hogy „nincs
--    ráuk DROP FUNCTION" — a `purge_recycle_bin`-re HAROM fajl is ad
--    (2026-08-14-kuka-deleted-at.sql:173, 2026-08-17-egyhazkeruleti-S5a-
--    scope-oszlopok.sql:1090, 2026-08-29-penzugy-audit-naplo-5ev.sql:152).
--    AZ INDOK AZ, hogy az ELO szignaturakat NEM ISMERJUK: a migracios fajl
--    nem bizonyitek az eles allapotra, tehat elesben tobb tulterheles is
--    elhet egyszerre. Ezert kezelunk MINDEN tulterhelest.
--
--    ⚠️ A `service_role` es a `supabase_auth_admin` jogahoz NEM NYULUNK,
--       es ket celzott grantot KIADUNK (kulonben a cron es a bejelentkezes
--       allna meg).
-- ═══════════════════════════════════════════════════════════════════════════

  -- FAIL-CLOSED ELOELLENORZES: ugyanaz a logika, mint a 4) lepesnel. Ha egy
  -- kizarasi listas rutin idegen tulajdonu, a zaras neman kimaradna, es az
  -- N2 orszem buktatna meg - de felrevezeto uzenettel.
  SELECT string_agg(p.oid::regprocedure::text || ' [tulaj=' || p.proowner::regrole::text || ']', ', '
                    ORDER BY p.oid::regprocedure::text) INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_kizarva)
    AND NOT pg_has_role(current_user, p.proowner, 'USAGE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'MEGALLITVA (5): KIZARASI LISTAS rutin NEM a futtato hatokoreben van, tehat nem tudjuk lezarni: % ||| TEENDO: futtasd a migraciot a tulajdonos szerep neveben (SET ROLE), vagy add ki ezekre a REVOKE-ot kezzel. A migracio VISSZAGORDULT.', v_txt;
  END IF;

  v_db := 0;
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_kizarva)
      AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM authenticated', r.sig);
    v_db := v_db + 1;

    -- A pg_cron a `postgres` jogan futtatja (tulajdonosi jog), a service_role
    -- a veszhelyzeti kezi inditashoz kell.
    IF r.proname = 'purge_recycle_bin' AND v_van_svc THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO service_role', r.sig);
    END IF;

    -- A Supabase Auth EBBOL a szerepbol hivja a hookot - enelkul a JWT-bol
    -- eltunnenek a claimek. Ugyanaz, amit a 2026-09-05-token-hook-p0-zaras.sql tett.
    IF r.proname = 'custom_access_token_hook' AND v_van_hookadmin THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO supabase_auth_admin', r.sig);
    END IF;
  END LOOP;

  RAISE NOTICE '5) Kizarasi lista: % rutin (tulterhelesekkel) lezarva PUBLIC / anon / authenticated fele.', v_db;
  v_riport := v_riport || ('5) Kizarasi lista: ' || v_db || ' rutin lezarva PUBLIC / anon / authenticated fele');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5/b) A CSAK-SERVICE_ROLE LISTA ZÁRÁSA
--
--    A `lelkeszi_naptar_feed` privát, token-védett feed: az app KIZÁRÓLAG
--    admin-klienssel (service_role) hívja
--    (apps/web/app/api/calendar/lelkeszi/[token]/route.ts:61,70). A
--    2026-08-11-lelkeszi-naptar-token.sql:276-279 SZÁNDÉKA szerint élesben is
--    csak a service_role-t kapja meg — de az MIGRÁCIÓS FÁJL, nem bizonyíték.
--
--    ⛔ MIÉRT KELL EZ A LÉPÉS: ha az a lánc élesben nem futott le teljesen, a
--       függvény ma `authenticated`-ből (vagy a PUBLIC-on át) is hívható. Az
--       1) átmentés ezt EXPLICIT ACL-be betonozta volna — pont azt, amit a
--       fájl a B2-nél maga nevez visszafordíthatatlannak. Az 1) lépés a
--       `v_csak_service_role` miatt már nem ad rá `authenticated` grantot;
--       itt EL IS VESSZÜK, hogy a végállapot egyértelmű legyen, és a záró
--       rács 9. sora ne a SAJÁT eredményünket címkézze „HIBA"-nak.
--
--    ⚠️ A `service_role`-hoz NEM NYÚLUNK — sőt, ha az 5) lépés előtt hívható
--       volt, marad is. Az N4 őrszem ezt ellenőrzi.
-- ═══════════════════════════════════════════════════════════════════════════

  v_db := 0;
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_csak_service_role)
      AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM authenticated', r.sig);
    v_db := v_db + 1;
  END LOOP;

  RAISE NOTICE '5/b) Csak-service_role lista: % rutin lezarva PUBLIC / anon / authenticated fele (a service_role erintetlen).', v_db;
  v_riport := v_riport || ('5/b) Csak-service_role lista: ' || v_db || ' rutin lezarva anon+authenticated fele');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) ŐRSZEM — negatív ÉS pozitív asszertek, köztük a B1-B5 regressziói
-- ═══════════════════════════════════════════════════════════════════════════

  ---------------------------------------------------------------------------
  -- N1) NEGATÍV: a triázs 5 találata NEM lehet többé anon-hívható.
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT p.oid::regprocedure::text, ', ') INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_triazs)
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM N1: a TRIAZS-talalatok kozul meg mindig anon-hivhato: %', v_txt;
  END IF;

  ---------------------------------------------------------------------------
  -- N2) NEGATÍV [B5 regresszió]: a kizárási lista egyetlen eleme sem lehet
  --     hívható sem anon-ból, sem authenticated-ből, sem a PUBLIC-on át.
  ---------------------------------------------------------------------------
  SELECT string_agg(x.sor, chr(10) ORDER BY x.sor) INTO v_txt
  FROM (
    SELECT p.oid::regprocedure::text || ' -> ' ||
           CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon ' ELSE '' END ||
           CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated ' ELSE '' END ||
           CASE WHEN (p.proacl IS NULL
                      OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
                THEN 'PUBLIC-oroklott' ELSE '' END AS sor
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_kizarva)
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OR p.proacl IS NULL
           OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM N2 (B5 regresszio): a KIZARASI LISTA elemei meg mindig hivhatok: %', v_txt;
  END IF;

  ---------------------------------------------------------------------------
  -- N3) NEGATÍV+POZITÍV [B2 regresszió]: a custom_access_token_hook
  --     · NEM kaphatott EXPLICIT anon vagy authenticated ACL-bejegyzest
  --       (nem eleg a has_function_privilege: pont az explicit bejegyzes a baj,
  --        mert azt egyetlen kesobbi `REVOKE … FROM PUBLIC` sem venne le),
  --     · a supabase_auth_admin viszont hivnia KELL tudja.
  ---------------------------------------------------------------------------
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'custom_access_token_hook'
    AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                WHERE a.privilege_type = 'EXECUTE'
                  AND (a.grantee = 0 OR a.grantee = v_anon_oid OR a.grantee = v_auth_oid));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM N3 (B2 regresszio): a custom_access_token_hook EXPLICIT vagy oroklott EXECUTE jogot kapott anon / authenticated / PUBLIC fele. Ez visszanyitna a 2026-09-05-token-hook-p0-zaras.sql altal lezart P0-t. Erintett: %', v_txt;
  END IF;

  IF v_van_hookadmin THEN
    SELECT bool_or(has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')) INTO v_bool
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook';
    IF v_bool IS NOT NULL AND NOT v_bool THEN
      RAISE EXCEPTION 'ORSZEM N3b: a supabase_auth_admin ELVESZTETTE az EXECUTE jogot a custom_access_token_hook-on - a bejelentkezes JWT-claimjei elveszhetnek. A migracio VISSZAGORDUL.';
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- N4) NEGATÍV+POZITÍV: SERVICE_ROLE SÉRTETLENSÉG.
  --     A public.lelkeszi_naptar_feed(uuid) SZANDEK szerint CSAK service_role-t
  --     kap (2026-08-11-lelkeszi-naptar-token.sql:276-279 - de az migracios
  --     fajl, nem bizonyitek). Ez a fajl semmilyen `REVOKE … FROM service_role`
  --     mintat nem hasznal - ezt itt bizonyitjuk.
  --     ⚠️ Az N4b MOST MAR az `authenticated`-et IS vizsgalja. Enelkul a
  --        tranzakcio zolden lefuthatna ugy, hogy egy privat, token-vedett
  --        feed-re EXPLICIT `authenticated` bejegyzes marad, es csak a
  --        COMMIT UTANI zaro racs 9. sora panaszkodna - egy mar
  --        visszafordithatatlan bejegyzesre. Igy inkabb VISSZAGORDULUNK.
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'lelkeszi_naptar_feed') THEN
    IF v_van_svc THEN
      SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) INTO v_bool
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'lelkeszi_naptar_feed';
      IF NOT COALESCE(v_bool, false) THEN
        RAISE EXCEPTION 'ORSZEM N4: a lelkeszi_naptar_feed ELVESZTETTE a service_role EXECUTE jogat - a lelkeszi naptar-feed vegpont megallna. A migracio VISSZAGORDUL.';
      END IF;
    END IF;

    SELECT string_agg(p.oid::regprocedure::text || ' -> ' ||
             CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon ' ELSE '' END ||
             CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated ' ELSE '' END ||
             CASE WHEN (p.proacl IS NULL
                        OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                   WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
                  THEN 'PUBLIC-oroklott' ELSE '' END, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lelkeszi_naptar_feed'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OR p.proacl IS NULL
           OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
    IF v_txt IS NOT NULL THEN
      RAISE EXCEPTION 'ORSZEM N4b: a lelkeszi_naptar_feed anon-bol, authenticated-bol vagy a PUBLIC-on at hivhato, pedig privat, token-vedett feed (csak service_role): % ||| A migracio VISSZAGORDULT.', v_txt;
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- N5) NEGATÍV [B3 regresszió]: nem maradhat PUBLIC EXECUTE egyetlen saját
  --     tulajdonú, nem kiterjesztés-tag public rutinon sem - FAJTATOL
  --     FUGGETLENUL (fuggveny, eljaras, aggregatum, ablakfuggveny).
  --     A kihagyottakat NEVVEL soroljuk, de NEM buktatunk rajtuk.
  ---------------------------------------------------------------------------
  SELECT count(*), string_agg(p.oid::regprocedure::text || ' [' || p.prokind || ']', ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_db, v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_has_role(current_user, p.proowner, 'USAGE')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    AND (p.proacl IS NULL
         OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
  IF v_db > 0 THEN
    RAISE EXCEPTION 'ORSZEM N5 (B3 regresszio): % sajat tulajdonu public rutinnak MEG MINDIG van PUBLIC EXECUTE joga: %', v_db, v_txt;
  END IF;

  SELECT count(*), string_agg(p.oid::regprocedure::text || ' [tulaj=' || p.proowner::regrole::text || ']', ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_db, v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (NOT pg_has_role(current_user, p.proowner, 'USAGE')
         OR EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'))
    AND (p.proacl IS NULL
         OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
  RAISE NOTICE '6/N5) SZANDEKOSAN KIHAGYVA (kiterjesztes- vagy idegen tulajdon), PUBLIC EXECUTE-tal: % db -> %',
    v_db, COALESCE(v_txt, 'nincs');
  v_riport := v_riport || ('6/N5) SZANDEKOSAN KIHAGYVA (kiterjesztes-/idegen tulajdon), PUBLIC EXECUTE-tal: ' || v_db || ' db -> ' || COALESCE(v_txt, 'nincs'));

  ---------------------------------------------------------------------------
  -- N6) NEGATÍV — A FÁJL FŐ CÉLJA: AZ ANON-FELÜLET ZÁRVA VAN.
  --
  --     ⛔ EZ AZ ŐRSZEM EDDIG HIÁNYZOTT. Az N1 öt triázs-nevet, az N2 hét
  --        kizárási nevet, az N5 pedig KIZÁRÓLAG a PUBLIC-ot ellenőrizte —
  --        semmi nem asszertálta, hogy a 2) lépés `REVOKE … FROM anon` sora
  --        TÉNYLEG lefutott MINDEN saját tulajdonú, nem kiterjesztés-tag
  --        rutinra. Ez nem elméleti: ha egy függvény ACL-jében az
  --        anon-bejegyzés MÁS grantortól származik (pl. `anon=X/supabase_admin`),
  --        a `postgres` nevében kiadott REVOKE csak
  --        `WARNING: not all privileges could be revoked`-ot ad, HIBÁT NEM —
  --        a tranzakció végigfutna, a záró NOTICE azt írná, hogy „minden
  --        rendben", miközben a 89 SECURITY DEFINER függvény egy része
  --        továbbra is anon-ból hívható. Ugyanez a néma kimaradás áll fenn,
  --        ha a 2) lépés ciklusa bármely okból kihagy egy rutint.
  --
  --     A halmaz PONTOSAN a 2) lépésé, mínusz az engedélyezőlista (amit a
  --     4) lépés SZÁNDÉKOSAN nyitott vissza).
  ---------------------------------------------------------------------------
  SELECT count(*), string_agg(p.oid::regprocedure::text
           || CASE WHEN p.prosecdef THEN ' [SECURITY DEFINER]' ELSE '' END
           || ' ACL=' || COALESCE(p.proacl::text, 'NULL'), chr(10)
           ORDER BY p.oid::regprocedure::text)
    INTO v_db, v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND pg_has_role(current_user, p.proowner, 'USAGE')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    AND NOT (p.proname = ANY(v_lista))
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_db > 0 THEN
    RAISE EXCEPTION 'ORSZEM N6 (a fajl FO CELJA): % sajat tulajdonu, nem kiterjesztes-tag public rutin MEG MINDIG hivhato anon-bol, pedig NINCS az engedelyezolistan. A 2) lepes anon-revoke-ja tehat NEM ert cel minden rutinra (leggyakoribb ok: az anon-bejegyzes MAS grantortol szarmazik, ilyenkor a REVOKE csak WARNING-ot ad, hibat nem). Erintettek: % ||| TEENDO: futtasd a migraciot a bejegyzest ado szerep neveben (SET ROLE), vagy add ki ezekre kezzel a REVOKE-ot. A migracio VISSZAGORDULT, semmi nem valtozott.', v_db, v_txt;
  END IF;

  ---------------------------------------------------------------------------
  -- P1) POZITÍV: a POLICY-BÓL HÍVOTT függvények authenticated-ből hívhatók
  --     maradtak. Ezek a HIVO jogan futnak - ha elvesznenek, a jogosultsagi
  --     rendszer 42501-gyel megallna az elso policy-kiertekelesnel.
  --
  --     ⛔ P1/a — DINAMIKUS, NEM KÉZI LISTA. A `v_rls_seged` tömb bizonyíthatóan
  --        hiányos volt (hiányzott róla a `csalad_resolves_to_accessible_cong`,
  --        a `gyerek_resolves_to_accessible_cong`, az `is_egyhazkeruleti_admin`
  --        és az `is_current_user_approved`), vagyis a „kézzel írt lista" (B4)
  --        hibaosztály EGY MÁSIK LISTÁN tért volna vissza. Ezért a fő asszert
  --        a `pg_policy` kifejezéseiből gyűjti ki a ténylegesen hívott public
  --        függvényeket — ugyanazzal a szó-határos mintával, amit a 0/b kapu
  --        használ —, és MINDRE megköveteli az `authenticated` EXECUTE-ot.
  --        SZŰKÍTÉS: csak azok a policy-k, amelyek az `authenticated`-re IS
  --        vonatkoznak (`TO` nélküli `{public}`, vagy `TO authenticated`), és
  --        ahol az authenticated-nek tábla- vagy oszlop-joga is van.
  ---------------------------------------------------------------------------
  v_txt := NULL;
  SELECT string_agg(x.sor, chr(10) ORDER BY x.sor) INTO v_txt
  FROM (
    SELECT DISTINCT
      n2.nspname || '.' || c.relname || ' / ' || pol.polname || '  ->  ' || pr.oid::regprocedure::text AS sor
    FROM pg_policy pol
    JOIN pg_class c      ON c.oid = pol.polrelid
    JOIN pg_namespace n2 ON n2.oid = c.relnamespace
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS kif
    ) e
    JOIN pg_proc pr      ON (CASE WHEN pr.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                                  THEN e.kif ~ ('(^|[^A-Za-z0-9_])' || pr.proname || '\(')
                                  ELSE strpos(e.kif, pr.proname || '(') > 0 END)
    JOIN pg_namespace n3 ON n3.oid = pr.pronamespace AND n3.nspname = 'public'
    WHERE (pol.polroles = '{0}'::oid[] OR v_auth_oid = ANY(pol.polroles))
      AND (has_table_privilege('authenticated', pol.polrelid, 'SELECT, INSERT, UPDATE, DELETE')
           OR has_any_column_privilege('authenticated', pol.polrelid, 'SELECT, INSERT, UPDATE, REFERENCES'))
      AND NOT has_function_privilege('authenticated', pr.oid, 'EXECUTE')
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM P1/a: POLICY-bol hivott public fuggveny NEM hivhato authenticated-bol - a policy 42501-re futna, es a jogosultsagi rendszer megallna. Erintettek: % ||| A migracio VISSZAGORDULT.', v_txt;
  END IF;

  -- P1/b) A KÉZI MINIMUM-LISTA — ami LÉTEZIK, annak hívhatónak kell lennie.
  SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname) INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_rls_seged)
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM P1/b: az RLS-segedek elvesztettek az authenticated EXECUTE jogot - a jogosultsagi rendszer megallna: %', v_txt;
  END IF;

  -- P1/c) NEM BUKTAT, DE JELENT: a kezi listan van olyan nev, ami elesben NEM
  --       LETEZIK. Eddig az NEMAN kimaradt az ellenorzesbol, es a „P1 rendben"
  --       hamis biztonsagot adott (pl. az `is_user_approved` szerepel a listan,
  --       mikozben az m0-HOTFIX az `is_current_user_approved`-ot is grantolja).
  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_txt
  FROM unnest(v_rls_seged) AS x(nev)
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = x.nev);
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE '6/P1c) A kezi RLS-seged listan levo, de ELESBEN NEM LETEZO nevek (rajuk a P1/b semmit nem ellenorzott): %', v_txt;
    v_riport := v_riport || ('6/P1c) ⚠️ A kezi RLS-seged listan van, de ELESBEN NEM LETEZIK: ' || v_txt);
  END IF;

  ---------------------------------------------------------------------------
  -- P2) POZITÍV [B4 regresszió]: az engedélyezőlista MINDEN LÉTEZŐ eleme
  --     (nem csak 9 kiszemelt!) hívható anon-ból.
  ---------------------------------------------------------------------------
  SELECT string_agg(x.nev, ', ' ORDER BY x.nev) INTO v_txt
  FROM unnest(v_lista) AS x(nev)
  WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = x.nev)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = x.nev
                  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM P2 (B4 regresszio): az ENGEDELYEZOLISTA elemei (vagy nemely tulterhelesuk) NEM hivhatok anon-bol - a nyilvanos gyulekezeti oldal / a regisztracio / a QR-feltoltes megallna: %', v_txt;
  END IF;

  ---------------------------------------------------------------------------
  -- P3) POZITÍV [B1 regresszió]: a qr_staging_upload_allowed anon-hivhato
  --     maradt, tehat az iktato_csatolmanyok_qr_insert_anon storage-policy
  --     kiertekelheto. Ezen bukott el a TERVEZET kapuja.
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'qr_staging_upload_allowed') THEN
    SELECT bool_and(has_function_privilege('anon', p.oid, 'EXECUTE')) INTO v_bool
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'qr_staging_upload_allowed';
    IF NOT COALESCE(v_bool, false) THEN
      RAISE EXCEPTION 'ORSZEM P3 (B1 regresszio): a qr_staging_upload_allowed NEM hivhato anon-bol, pedig a storage-policy (iktato_csatolmanyok_qr_insert_anon) hivja. A telefonos QR-feltoltes megallna.';
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- P4) TÁJÉKOZTATÓ [B3]: fajtánkénti lefedettség (aggregatum / ablakfv /
  --     eljaras). Ha itt nem-nulla szam all, a `ON ROUTINE` hasznalata NEM
  --     luxus volt, hanem az egyetlen helyes valasztas.
  ---------------------------------------------------------------------------
  SELECT string_agg(x.k || '=' || x.db, ', ' ORDER BY x.k) INTO v_txt
  FROM (SELECT p.prokind::text AS k, count(*)::text AS db
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' GROUP BY p.prokind) x;
  RAISE NOTICE '6/P4) public-beli rutinok fajta szerint (f=fuggveny, p=eljaras, a=aggregatum, w=ablakfv): %', v_txt;
  v_riport := v_riport || ('6/P4) public-beli rutinok fajta szerint: ' || COALESCE(v_txt, '-'));

  ---------------------------------------------------------------------------
  -- P5) POZITÍV: a service_role EXPLICIT jogai megvannak (a fajl egyetlen
  --     `REVOKE … FROM service_role` mintat sem hasznal).
  ---------------------------------------------------------------------------
  IF v_van_svc THEN
    SELECT count(*) INTO v_db
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_db = 0 THEN
      RAISE EXCEPTION 'ORSZEM P5: a service_role EGYETLEN public rutint sem hivhat - ez sertetlenseg-serules, a migracio VISSZAGORDUL.';
    END IF;
    RAISE NOTICE '6/P5) service_role sertetlenseg: % public rutin hivhato marad.', v_db;
  END IF;

  ---------------------------------------------------------------------------
  -- P6) POZITÍV [B1 regresszió, utó-ellenőrzés]: a 0/b kapu logikáját ÚJRA
  --     lefuttatjuk az UTÁNA-állapoton. Most már nem elég, hogy a fuggveny
  --     rajta van a listan - azt is ellenorizzuk, hogy TENYLEG hivhato-e
  --     anon-bol minden olyan fuggveny, amit anon-policy hiv.
  --
  --     ⚠️ ITT NINCS tulajdonos-/kiterjesztes-szures (a 0/b kapuval ellentetben):
  --        ez a TENYLEGES `has_function_privilege`-et nezi, tehat egy erintetlenul
  --        hagyott, kiterjesztes-tulajdonu fuggvenynel amugy sem sul el.
  --     ⚠️ `has_any_column_privilege` a `has_table_privilege` MELLETT: az
  --        oszlop-szintu anon-joggal rendelkezo relaciok (districts, dioceses)
  --        kulonben kiesnenek az uto-ellenorzesbol is.
  ---------------------------------------------------------------------------
  v_txt := NULL;
  SELECT string_agg(x.sor, chr(10) ORDER BY x.sor) INTO v_txt
  FROM (
    SELECT DISTINCT
      n2.nspname || '.' || c.relname || ' / ' || pol.polname || ' -> ' || pr.oid::regprocedure::text AS sor
    FROM pg_policy pol
    JOIN pg_class c      ON c.oid = pol.polrelid
    JOIN pg_namespace n2 ON n2.oid = c.relnamespace
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS kif
    ) e
    JOIN pg_proc pr      ON (CASE WHEN pr.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                                  THEN e.kif ~ ('(^|[^A-Za-z0-9_])' || pr.proname || '\(')
                                  ELSE strpos(e.kif, pr.proname || '(') > 0 END)
    JOIN pg_namespace n3 ON n3.oid = pr.pronamespace AND n3.nspname = 'public'
    WHERE (pol.polroles = '{0}'::oid[] OR v_anon_oid = ANY(pol.polroles))
      AND (has_table_privilege('anon', pol.polrelid, 'SELECT, INSERT, UPDATE, DELETE')
           OR has_any_column_privilege('anon', pol.polrelid, 'SELECT, INSERT, UPDATE, REFERENCES'))
      AND NOT has_function_privilege('anon', pr.oid, 'EXECUTE')
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM P6 (B1 regresszio): anon-ra vonatkozo policy olyan fuggvenyt hiv, amit az anon MAR NEM hivhat - a policy 42501-re futna. Erintettek: %', v_txt;
  END IF;

  -- ⚠️ PONTOS SZÁMOK: HAT negatív blokk (N1-N6, ezen belül N3b és N4b
  --    alasszertekkel = nyolc asszert) és HAT pozitív blokk (P1-P6, ezen belül
  --    P1/a, P1/b buktató asszert + P1/c csak jelent).
  RAISE NOTICE '6) ORSZEM: mind a hat negativ (N1-N6, +2 alasszert) es hat pozitiv (P1-P6) ellenorzes rendben.';
  -- ⚠️ EXPLICIT `::text` CAST: egy csupasz literal a `text[] || ?` operatornal
  --    ketertelmu lenne (anyarray||anyelement VAGY anyarray||anyarray).
  v_riport := v_riport || '6) ORSZEM: MIND a hat negativ (N1-N6, +2 alasszert) es hat pozitiv (P1-P6) ellenorzes LEFUTOTT es RENDBEN.'::text;

  ---------------------------------------------------------------------------
  -- A RIPORT ÁTADÁSA A ZÁRÓ RÁCSNAK
  -- A Supabase Studio a NOTICE-okat NEM jeleníti meg, ezért a fontos
  -- diagnosztikát munkamenet-változóba írjuk, és a záró rács 0. sora mutatja.
  -- ⚠️ A `set_config(..., false)` TRANZAKCIONÁLIS: ha az őrszem bármelyik
  --    asszertje megbuktatja a migrációt, ez a beállítás is visszaáll, tehát
  --    a záró rács 0. sora nem tud hazudni. (A záró rács a COMMIT után,
  --    önálló utasításként fut, ezért bukás esetén is megjelenik.)
  ---------------------------------------------------------------------------
  PERFORM set_config('kartoteka.jogtisztitas_riport',
                     array_to_string(v_riport, chr(10)), false);

END;
$jogtisztitas$;

-- PostgREST séma-újratöltés (a jogváltozás a REST-rétegben is érvényesüljön).
-- ⚠️ Ismert hibaosztály: DDL után percekig jöhet 503-vihar a forgalmas
--    végpontokon („schema cache… Retrying"). MAGÁTÓL GYÓGYUL — ne rollbackelj
--    reflexből, előbb curl-próba az anon kulccsal.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  MINTA AZ ÚJ MIGRÁCIÓKHOZ  (a 3) lépés (G2) következménye miatt KÖTELEZŐ)
--  ─────────────────────────────────────────────────────────────────────────
--  Mostantól MINDEN új public függvény mellé ki kell adni a jogát, különben
--  az app némán 42501-re fut. A bevált, szerep-toleráns minta:
--
--    REVOKE ALL ON ROUTINE public.uj_fuggveny(uuid, text) FROM PUBLIC;
--    GRANT EXECUTE ON ROUTINE public.uj_fuggveny(uuid, text) TO authenticated;
--    -- ha az anonnak IS kell (nyilvános oldal / token-alapú út):
--    -- GRANT EXECUTE ON ROUTINE public.uj_fuggveny(uuid, text) TO anon;
--    -- ha csak háttérfolyamat hívja:
--    -- GRANT EXECUTE ON ROUTINE public.uj_fuggveny(uuid, text) TO service_role;
--
--  ⚠️ `ON ROUTINE`, ne `ON FUNCTION`: az utóbbi egy ELJÁRÁSRA 42809-cel
--     hibára fut, és egyetlen tranzakcióban ez az egész migrációt megbuktatja.
--
--  ⚠️ Ha egy függvényt DROP + CREATE-tel újraépítesz, a JOGOK IS ELVESZNEK —
--     a fenti sorokat akkor ÚJRA ki kell adni. (A `CREATE OR REPLACE` viszont
--     megőrzi a meglévő ACL-t.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
--  VISSZAÁLLÍTÁS (kommentben, szándékosan — ne lehessen véletlenül lefuttatni)
--  ─────────────────────────────────────────────────────────────────────────
--  · Egyetlen függvény jogát: a docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql
--    `visszaallito_parancsok` oszlopában ott a kész SQL az adott sorra.
--    ⚠️ A sort EGÉSZBEN kell lefuttatni: elöl a `REVOKE ALL … FROM …`
--       takarítás, utána a GRANT-ok. CSAK a GRANT-ok visszajátszása a RÉGI és
--       az ÚJ jogok UNIÓJÁT adná, mert az 1) lépés ÚJ, explicit
--       `authenticated` / `service_role` bejegyzéseket írt be, amiket
--       egyetlen GRANT sem vesz le.
--  · A (G2) default-jog visszanyitása (CSAK ha a fejlesztés megbénul tőle):
--      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--        GRANT EXECUTE ON ROUTINES TO authenticated;
--    ⚠️ Ez visszanyitja a második gyökérokot: minden ÚJ függvény megint
--       automatikusan hívható lesz minden bejelentkezettből.
--  · Egy „permission denied for function" hiba javítása NEM a fájl
--    visszagörgetése, hanem EGY célzott GRANT (lásd a mintát fentebb).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  ZÁRÓ RÁCS — EGYETLEN eredménytábla
--  (a Supabase SQL-szerkesztő CSAK AZ UTOLSÓ rácsot mutatja)
--  ⚠️ A lenti listáknak EGYEZNIÜK KELL a fenti DO-blokk `v_lista` /
--     `v_kizarva` tömbjeivel. Ez a rács csak RIPORTOL — az érdemi
--     ellenőrzést a 6) őrszem már elvégezte, a tranzakción BELÜL.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM (

-- ⚠️ EZ A SOR AZ EGYETLEN HELY, AHOL A TRANZAKCION BELULI DIAGNOSZTIKA
--    LATHATOVA VALIK. A Supabase Studio a NOTICE-okat NEM jeleniti meg
--    (2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql:439-441), ezert a
--    DO-blokk a fontos uzeneteket egy munkamenet-valtozoba is kiirja.
--    A `set_config(..., false)` TRANZAKCIONALIS: ha az orszem megbuktatta a
--    migraciot, ez a sor URES lesz - tehat nem tud hazudni.
SELECT 0 AS sorszam,
       'A TRANZAKCION BELULI RIPORT (0/d, 0/e, 1), 2), 3) kihagyott szerepek, 5), 6/N5, 6/P1c, 6/P4, orszem-nyugta)'::text AS lepes,
       COALESCE(NULLIF(current_setting('kartoteka.jogtisztitas_riport', true), ''),
                '⛔ NINCS RIPORT. Ket oka lehet: (1) a 6) orszem valamelyik asszertje MEGBUKTATTA a migraciot, es a tranzakcio VISSZAGORDULT (ilyenkor a HIBAUZENET a szerkeszto hibapaneljen latszik, es a lenti sorok a VALTOZATLAN allapotot mutatjak); vagy (2) a szerkeszto uj kapcsolaton futtatta ezt a racsot. Ha az 5. sor nem 0 db, akkor a migracio LEFUTOTT.')::text AS allapot

UNION ALL
-- ⚠️ UGYANAZ A KET SZURO, mint a 2) lepesben (`pg_has_role` + kiterjesztes-tag
--    kizarasa). Enelkul ez a szam a SZANDEKOSAN erintetlenul hagyott
--    kiterjesztes-fuggvenyeket (pgcrypto / pg_trgm / unaccent) is beleszamolna,
--    es a „mert kiindulas: 89" ertekkel valo osszevetes ertelmetlen lenne.
--    A kihagyottakat a 6. sor mutatja.
SELECT 1 AS sorszam,
       'Anon-bol hivhato SAJAT TULAJDONU, nem kiterjesztes-tag public rutinok (a mert kiindulas: 89 SECURITY DEFINER)'::text AS lepes,
       ((SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
           AND pg_has_role(current_user, p.proowner, 'USAGE')
           AND NOT EXISTS (SELECT 1 FROM pg_depend d
                           WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'))
        || ' db osszesen  |  ebbol SECURITY DEFINER: '
        || (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef
              AND has_function_privilege('anon', p.oid, 'EXECUTE')
              AND pg_has_role(current_user, p.proowner, 'USAGE')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d
                              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')))::text AS allapot

UNION ALL
SELECT 2, 'Anon-bol hivhato SAJAT TULAJDONU rutinok NEVSORA (EZ egyezzen az engedelyezolistaval; a szandekosan kihagyottak a 6. sorban)',
  COALESCE((SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
              AND pg_has_role(current_user, p.proowner, 'USAGE')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d
                              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')),
           'EGYIK SEM - ez HIBA lenne')

UNION ALL
SELECT 3, 'A TRIAZS 5 TALALATA (mind lezarva kell legyen az anon fele)',
  COALESCE((SELECT string_agg(p.oid::regprocedure::text || ' = anon:' ||
              CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'MEG MINDIG HIVHATO' ELSE 'lezarva' END
              || ', authenticated:' ||
              CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'hivhatja' ELSE 'lezarva' END,
              chr(10) ORDER BY p.oid::regprocedure::text)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('record_pastor_tenure_start','next_bizonylat_szam',
                                '_resolve_or_create_locality','_resolve_or_create_street',
                                'purge_recycle_bin')),
           'egyik sem letezik')

UNION ALL
SELECT 4, 'KIZARASI LISTA (B2/B5) - mindnek zarva kell lennie anon+authenticated fele',
  COALESCE((SELECT string_agg(p.oid::regprocedure::text
              || '  anon:' || CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN 'HIBA' ELSE 'zarva' END
              || '  auth:' || CASE WHEN has_function_privilege('authenticated', p.oid,'EXECUTE') THEN 'HIBA' ELSE 'zarva' END
              -- ⚠️ BEAGYAZOTT CASE: nem letezo szerepnel a has_function_privilege
              --    22023-mal elszallna, es a COMMIT UTAN mar csak a RIPORT veszne el.
              || '  svc:'  || CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
                                   THEN CASE WHEN has_function_privilege('service_role', p.oid,'EXECUTE') THEN 'igen' ELSE 'nem' END
                                   ELSE 'a szerep nem letezik' END
              || '  ACL=' || COALESCE(p.proacl::text, 'NULL (HIBA LENNE)'),
              chr(10) ORDER BY p.oid::regprocedure::text)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('custom_access_token_hook','purge_recycle_bin',
                                '_resolve_or_create_locality','_resolve_or_create_street',
                                'login_email_status','registration_email_info',
                                'qr_sweep_expired_sessions')),
           'a kizarasi lista egyetlen eleme sem letezik')

UNION ALL
SELECT 5, 'Maradt-e PUBLIC EXECUTE (sajat tulajdonu, nem kiterjesztes) - 0 a helyes',
  (SELECT count(*)::text || ' db'
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND pg_has_role(current_user, p.proowner, 'USAGE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                     WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')))

UNION ALL
SELECT 6, 'SZANDEKOSAN KIHAGYVA (kiterjesztes- vagy idegen tulajdonu), PUBLIC EXECUTE-tal',
  COALESCE((SELECT count(*)::text || ' db: ' || string_agg(p.proname, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND (NOT pg_has_role(current_user, p.proowner, 'USAGE')
                   OR EXISTS (SELECT 1 FROM pg_depend d
                              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'))
              AND (p.proacl IS NULL
                   OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))),
           '0 db')

UNION ALL
SELECT 7, 'RLS-SEGEDEK authenticated-bol hivhatok maradtak',
  COALESCE((SELECT string_agg(DISTINCT p.proname || '=' ||
              CASE WHEN has_function_privilege('authenticated', p.oid,'EXECUTE') THEN 'ok' ELSE 'ELVESZETT!' END,
              ', ' ORDER BY p.proname || '=' ||
              CASE WHEN has_function_privilege('authenticated', p.oid,'EXECUTE') THEN 'ok' ELSE 'ELVESZETT!' END)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              -- ⚠️ UGYANAZ A 14 NEV, mint a DO-blokk `v_rls_seged` tombjeben.
              --    A korabbi valtozat 10-et sorolt, es hianyzott rola a
              --    csalad_/gyerek_resolves_to_accessible_cong, az
              --    is_egyhazkeruleti_admin es az is_current_user_approved.
              AND p.proname IN ('current_user_can_access_congregation','current_user_can_edit_congregation',
                                'current_user_congregation_id','current_user_is_active_staff',
                                'current_user_has_global_access','is_admin','is_master_admin',
                                'is_user_approved','is_current_user_approved','is_egyhazkeruleti_admin',
                                'csalad_resolves_to_accessible_cong','gyerek_resolves_to_accessible_cong',
                                'same_congregation','profil_lathato_e')),
           'nem merheto')

UNION ALL
-- ⚠️ LEFT JOIN, NEM inner join! A GLOBALIS (`IN SCHEMA` NELKULI) bejegyzesek
--    `defaclnamespace = 0`-val allnak a katalogusban, amihez NINCS pg_namespace
--    sor - egy inner join NEMAN eldobna oket, es a „MINDKET gyokerok lezarva"
--    allitas ellenorizhetetlen lenne. Elo pelda a repoban:
--    2026-07-18-public-site-content-and-sitemap.sql:251-253.
SELECT 8, 'ALAPERTELMEZETT JOGOK szerepenkent - MINDKET gyokerok lezarva? (VART: sem a public semas, sem a GLOBALIS sorokban NINCS "=X" [PUBLIC] vagy "authenticated=X")',
  COALESCE((SELECT string_agg(d.defaclrole::regrole::text || ' @ '
                              || COALESCE(n.nspname, '(GLOBALIS - minden sema)') || '  =  '
                              || COALESCE(d.defaclacl::text, 'NULL'), chr(10)
                              ORDER BY d.defaclrole::regrole::text, COALESCE(n.nspname, ''))
            FROM pg_default_acl d
            LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
            WHERE d.defaclobjtype = 'f'),
           'NINCS BEJEGYZES -> HIBA: ilyenkor az UJ fuggvenyekre a Postgres BEEPITETT alapertelmezese (PUBLIC=X) el ujra, tehat a gyokerok NEM zarult be. Nezd meg a 0. sor riportjat: a 3) lepes ott NEVVEL kiirja, melyik szerepet hagyta ki, es arra kezzel kell kiadni az ALTER DEFAULT PRIVILEGES sorokat.')

UNION ALL
SELECT 9, 'SERVICE_ROLE SERTETLENSEG: lelkeszi_naptar_feed (a csak-service_role listan van: az 1) atmentes nem ad ra auth-grantot, az 5/b el is veszi)',
  COALESCE((SELECT string_agg(p.oid::regprocedure::text
              || '  service_role:' || CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
                                           THEN CASE WHEN has_function_privilege('service_role', p.oid,'EXECUTE') THEN 'hivhatja (KELL)' ELSE 'ZARVA (HIBA)' END
                                           ELSE 'a szerep nem letezik' END
              || '  anon:' || CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN 'HIBA' ELSE 'zarva' END
              || '  auth:' || CASE WHEN has_function_privilege('authenticated', p.oid,'EXECUTE') THEN 'HIBA' ELSE 'zarva' END,
              chr(10))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'lelkeszi_naptar_feed'),
           'nem letezik')

UNION ALL
SELECT 10, 'B1 ELLENPELDA: qr_staging_upload_allowed (a storage-policy hivja)',
  COALESCE((SELECT string_agg(p.oid::regprocedure::text || '  anon:' ||
              CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN 'hivhatja (JO)' ELSE 'ZARVA - a QR-feltoltes megallt!' END,
              chr(10))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'qr_staging_upload_allowed'),
           'nem letezik')

UNION ALL
SELECT 11, 'KOVETO FELADATOK (a jogtisztitas NEM oldja meg oket)',
  ('1) A record_pastor_tenure_start NULL-logikai hibaja MEGMARADT a torzsben, csak elerhetetlenne valt: '
   || 'anonnal auth.uid() NULL -> a RAISE nem sul el. Kulon korben az elso sor legyen: '
   || 'IF auth.uid() IS NULL THEN RAISE EXCEPTION ... END IF;  '
   || '2) A next_bizonylat_szam-ban NULLA kapu van: a bizonylatszam-egetes ellen a TORZSBE kell '
   || 'hivo-ellenorzes (a gyulekezet-hatokor vizsgalata), nem eleg a jogtisztitas.  '
   || '3) A congregations_select policy USING(true) tovabbra is kiadja minden bejelentkezettnek '
   || 'MINDEN gyulekezet calendar_feed_token-jet - a naptar-res vegleg csak ennek szukitesevel zar.  '
   || '4) MOSTANTOL minden UJ fuggveny mellett KOTELEZO a GRANT (lasd a MINTA blokkot a fajlban), '
   || 'kulonben az app neman 42501-re fut.  '
   || '5) A _RUN_LOG.md-be vezesd be ennek a fajlnak a futasat, a fenti racs 0., 1., 5. es 8. sorat '
   || 'idezve - kulonben a kovetkezo kor megint nem fogja tudni, mi futott le elesben. Ugyanide '
   || 'vezesd be a 2026-09-05-token-hook-p0-zaras.sql statuszat is: ma NINCS rola bejegyzes, '
   || 'pedig ez a fajl (es az A) fajl 22. sora) hivatkozik ra.  '
   || '6) A 2026-07-18-public-site-content-and-sitemap.sql lanc (ma PENDING) FELULVIZSGALATRA szorul: '
   || 'a public_site_context_v2 es a public_sitemap_entries ott SECURITY INVOKER wrapperkent jon letre '
   || '(:461+489, :576+585). SECURITY INVOKER eseten a puszta anon-grant NEM ELEG - az anonnak a '
   || 'wrapper altal erintett minden objektumra is joga kellene legyen, amit EZ a jogtisztitas epp '
   || 'bezar, a 3) lepes pedig az UJ fuggvenyekre is fail-closed alapertelmezest allit. Vagy tedd '
   || 'oket SECURITY DEFINER-re, vagy add ki kezzel a szukseges tovabbi grantokat.  '
   || '7) Ha a 0/b kapu RLS-segedekre sult volna el, HATRA VAN egy HARMADIK fajl: az erintett '
   || 'relaciokrol az anon TABLA-jogat kell elvenni (az RLS-segedet TILOS az anon-engedelyezolistara tenni).  '
   || '8) A 0/e kapunal ELVESZTETT (v_tudomasul_vett_szerepek) szerepeket ellenorizd az elso '
   || 'hetekben: ha egy hatterfolyamat csendben megall, ott EGY celzott GRANT a javitas.')::text

) q ORDER BY sorszam;
