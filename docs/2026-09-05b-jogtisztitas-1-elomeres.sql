-- ═══════════════════════════════════════════════════════════════════════════
--  JOGTISZTÍTÁS — 1/a. LÉPÉS: CSAK OLVASÓ ELŐMÉRÉS                 (2026-09-05b)
--  Fájl: docs/2026-09-05b-jogtisztitas-1-elomeres.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIT CSINÁL
--  ──────────
--  Megméri az ÉLES adatbázison mindazt, amit a migráció (2. lépés) csak
--  FELTÉTELEZNI tudna. Egyetlen sort sem ír, egyetlen jogot sem módosít.
--
--  ⚠️ EZ A FÁJL EGYETLEN RÁCSOT AD. Az ACL-pillanatkép (a „mentés") ÁTKERÜLT
--     egy KÜLÖN fájlba: docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql
--     MIÉRT: a Supabase SQL-szerkesztő CSAK AZ UTOLSÓ rácsot mutatja. Amíg a
--     két rács egy fájlban volt, a „futtasd egyesével, kijelöléssel" utasítás
--     egyetlen félrekattintáson elbukott volna: vagy a 24 soros előmérés
--     veszett volna el némán, vagy a mentés maradt volna el. Ez a projekt ezt
--     a hibaosztályt már kétszer megfizette
--     (pl. migration-docs/sql/2026-08-11-lelkeszi-naptar-token.sql:283-284).
--
--  MIÉRT
--  ─────
--  Az előző változat (docs/2026-09-05-fuggveny-jogok-TERVEZET-NE-FUTTASD.sql)
--  adversariális bírálaton MEGBUKOTT, öt BLOKKOLÓ hibával. Mind az öt közös
--  gyökere ugyanaz: MÉRÉS HELYETT FELTEVÉSRE épült.
--    · a megállító kapuja nem ismerte a saját engedélyezőlistáját,
--    · az „átmentése" minden függvényre explicit `authenticated` grantot adott
--      volna — bebetonozva egy épp lezárt P0-t,
--    · a prokind-kezelése két irányban is aszimmetrikus volt,
--    · az engedélyezőlistája kézzel írt volt, és négy anon-hívás lemaradt róla,
--    · a négy triázs-találat csak az anon felé zárult volna.
--  Ez a fájl PONTOSAN azokat a tényeket adja meg, amelyek nélkül a migráció
--  megint feltevésre épülne.
--
--  ⚠️ ISMERT HIBAOSZTÁLY: a migrációs fájl NEM bizonyíték az éles állapotra.
--     A repóban látható GRANT/REVOKE sorokból NEM következik, hogy élesben is
--     lefutottak. EZ A FÁJL a bizonyíték — a repó nem.
--
--  MI A KOCKÁZAT
--  ─────────────
--  NULLA adatkockázat: csak `SELECT`. A kockázat az, ha KIHAGYOD: akkor a
--  migráció olyan környezetben futna, amiről nem tudjuk
--    · ki a public-beli rutinok tulajdonosa (a REVOKE némán kihagyhatja őket
--      vagy 42501-gyel megbuktathatja az egész tranzakciót),
--    · hol vannak a kiterjesztések (pgcrypto / unaccent / pg_trgm) — ha a
--      `public` sémában, egy vak REVOKE megállíthatja a `gen_random_uuid()`
--      alapértelmezéseket és a trigram-kereséseket,
--    · van-e a public sémában aggregátum / ablakfüggvény / eljárás (a
--      `GRANT … ON FUNCTION` egy ELJÁRÁSRA 42809-cel HIBÁRA fut, és az
--      egyetlen tranzakció miatt az egész migrációt visszagördíti),
--    · melyik szerep(ek) `pg_default_acl` bejegyzését kell átírni — a
--      SÉMÁHOZ KÖTÖTT és a GLOBÁLIS (séma nélküli) bejegyzéseket EGYARÁNT,
--    · MELY TOVÁBBI SZEREPEK vesztenék el a hozzáférést a PUBLIC-revoke miatt
--      (25. sor) — ez a B) fájl 0/e KAPUJÁNAK a bemenete.
--
--  A SORREND
--  ─────────
--    1a)  EZ A FÁJL          → futtasd, küldd vissza a rács eredményét
--    1b)  docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql
--                            → futtasd, és MENTSD EL CSV-be (ez a mentés)
--    2)   Csak azután: migration-docs/sql/2026-09-05b-jogtisztitas-2-migracio.sql
--
--  ⛔ HA A 15. SOR NEM ÜRES, a B) fájl SZÁNDÉKOSAN MEG FOG ÁLLNI. Ez nem hiba,
--     hanem a fail-closed kapu: előbb el kell dönteni, hogy az ott felsorolt
--     függvényt felvesszük-e az engedélyezőlistára, vagy a policy-t írjuk át.
--     ⚠️ A várható találatok RLS-SEGÉDEK (`is_admin`, `same_congregation`,
--        `current_user_can_access_congregation`, …). EZEKET TILOS az
--        engedélyezőlistára tenni — az az anonnak adna EXECUTE-ot a
--        jogosultsági rendszer magjára, vagyis PONT azt a lyukat nyitná ki,
--        amiért ez a kör elindult. A helyes megoldás ilyenkor a RELÁCIÓ
--        anon TÁBLA-JOGÁNAK elvétele, ami egy KÜLÖN, HARMADIK fájl
--        („anon tábla-jog söprés") — nem fér bele ebbe a két lépésbe.
--        A B) fájl 0/z-6 asszertje ezt gépileg is tiltja.
--
--  ⛔ HA A 25. SOR NEM ÜRES, a B) fájl 0/e kapuja is megáll. Döntsd el
--     minden ott felsorolt szerepről: kell-e neki továbbra is hozzáférés.
--     Ha igen, írd be a nevét a B) fájl `v_atmentendo_szerepek` tömbjébe
--     (akkor az 1) lépés neki IS ad explicit grantot). Ha nem, hagyd üresen —
--     de akkor is TUDATOS döntés lesz, nem véletlen.
--
--  MIT KELL UTÁNA ELLENŐRIZNI / ELMENTENI
--  ──────────────────────────────────────
--   · A MENTÉS a MÁSIK fájl (…-1b-acl-mentes.sql). Töltsd le CSV-be, MIELŐTT
--     a B) fájlt elindítod.
--     ⚠️ ŐSZINTÉN A MENTÉS KORLÁTAIRÓL: a mentés a JOGOK VISSZAADÁSÁRA jó.
--        A B) fájl 1) lépése több száz rutinra ÚJ, explicit `authenticated`
--        és `service_role` ACL-bejegyzést ír be; a mentés visszajátszása
--        ezeket NEM veszi le magától — ezért generál a másik fájl minden sor
--        elé egy teljes `REVOKE ALL … FROM …` takarítást is. CSAK az egész
--        sor (REVOKE + GRANT-ok) együttes lefuttatása állítja vissza az
--        eredeti állapotot; a puszta GRANT-ok visszajátszása a RÉGI és az ÚJ
--        jogok UNIÓJÁT adná.
--   · SZÁNDÉKOSAN NEM ír mentő táblát a `public` sémába: ismert hibaosztály,
--     hogy minden ÚJ élő tábla besorolást kíván a `backup_table_policy`-ban,
--     különben a napi mentés fail-closed megáll. A mentés itt a Te CSV-d.
--
--  A KANONIKUS LISTÁK (a B) fájlban SZÓ SZERINT ugyanez szerepel)
--  ─────────────────────────────────────────────────────────────
--   ENGEDÉLYEZŐLISTA (17 név) — amit az anon-nak TÉNYLEGESEN hívnia kell.
--     A kódmérésből áll össze (nem feltevésből): 15 mért anon RPC-hívás,
--     + `qr_staging_upload_allowed` (nem RPC: a storage-policy segédje),
--     + `public_site_congregation_is_visible` (a publikus-oldal lánc tagja,
--       ma feltehetően nem is létezik — ha nincs, a grant no-op).
--     ⛔ NINCS rajta a `login_email_status` és a `registration_email_info`:
--        a `30cf3b29` commit KIVETTE őket az appból, e-mail-felsoroló
--        orákulumok, bezárni kell őket, nem újranyitni. (A TERVEZET hibája.)
--     ⚠️ A `public_site_context_v2` és a `public_sitemap_entries` ma
--        feltehetően NEM létezik (a `2026-07-18-public-site-content-and-sitemap.sql`
--        a `_RUN_LOG.md:526` szerint PENDING). Ha az a lánc valaha lefut,
--        ez a KETTŐ ott SECURITY INVOKER wrapperként jön létre
--        (2026-07-18-…sql:461+489, :576+585) — akkor a puszta anon-grant NEM
--        elég: az anonnak a wrapper által érintett objektumokra is joga
--        kellene legyen. A láncot a jogtisztítás UTÁN felül kell vizsgálni.
--   KIZÁRÁSI LISTA (7 név) — amit az „átmentés" NEM menthet át, sőt az
--     `authenticated`-től IS el kell venni: nulla hívójuk van az app-kódban.
--     ⛔ Élén a `custom_access_token_hook`: egy explicit `authenticated`
--        ACL-bejegyzés VISSZANYITNÁ azt a P0-t, amit a
--        migration-docs/sql/2026-09-05-token-hook-p0-zaras.sql SZÁNDÉKA
--        szerint lezárt. Hogy élesben LE IS FUTOTT-e, azt EZ A FÁJL mondja
--        meg (22. sor) — a `_RUN_LOG.md`-ben ugyanis NINCS róla bejegyzés.
--   CSAK-SERVICE_ROLE LISTA (1 név) — `lelkeszi_naptar_feed`: az átmentés
--     NEM adhat rá `authenticated` grantot. Az app kizárólag admin-klienssel
--     (service_role) hívja: apps/web/app/api/calendar/lelkeszi/[token]/route.ts:61,70.
-- ═══════════════════════════════════════════════════════════════════════════


-- ###########################################################################
--  FŐ ELŐMÉRÉS — EGYETLEN RÁCS
--  Futtasd le az EGÉSZ fájlt, és küldd vissza az eredményt.
-- ###########################################################################

WITH engedelyezolista AS (
  SELECT unnest(ARRAY[
    -- regisztráció / belépés előtti, bejelentkezés nélküli utak
    'check_access_request_rate_limit',
    'congregations_for_registration',
    -- a NYILVÁNOS gyülekezeti weboldal (/gy/<slug>) betöltői
    'public_site_context',
    'public_site_context_v2',
    'public_site_congregation_fallback',
    'public_site_congregation_is_visible',
    'public_site_identitas',
    'public_site_stats',
    'public_site_age_distribution',
    'public_site_tisztsegek',
    'public_site_events',
    'public_site_events_v2',
    'public_sitemap_entries',
    -- token-alapú naptár-feed (a token maga a hitelesítő)
    'public_calendar_feed',
    -- QR-es telefonos feltöltés (a token maga a hitelesítő)
    'qr_session_lookup',
    'qr_register_upload',
    'qr_staging_upload_allowed'
  ]::text[]) AS nev
),
kizarasi_lista AS (
  SELECT unnest(ARRAY[
    'custom_access_token_hook',
    'purge_recycle_bin',
    '_resolve_or_create_locality',
    '_resolve_or_create_street',
    'login_email_status',
    'registration_email_info',
    'qr_sweep_expired_sessions'
  ]::text[]) AS nev
),
csak_service_role AS (
  -- Az „átmentés" NEM adhat rájuk `authenticated` grantot.
  SELECT unnest(ARRAY['lelkeszi_naptar_feed']::text[]) AS nev
),
triazs AS (
  -- a 2026-09-05-i kockázati triázs 4+1 VALÓDI találata
  SELECT unnest(ARRAY[
    'record_pastor_tenure_start',
    'next_bizonylat_szam',
    '_resolve_or_create_locality',
    '_resolve_or_create_street',
    'purge_recycle_bin'
  ]::text[]) AS nev
),
rls_seged AS (
  -- ⚠️ Ez a lista NEM az igazságforrás, csak egy MINIMUM-halmaz: a 24. sor
  --    kiírja azt is, ha egy név élesben NEM LÉTEZIK (különben némán
  --    kimaradna az ellenőrzésből, és az „ellenőriztük" hamis lenne).
  --    A 24/b sor ezért DINAMIKUSAN, a pg_policy-ból is kigyűjti a
  --    ténylegesen policy-ból hívott segédeket.
  SELECT unnest(ARRAY[
    'current_user_can_access_congregation',
    'current_user_can_edit_congregation',
    'current_user_congregation_id',
    'current_user_is_active_staff',
    'current_user_has_global_access',
    'is_admin', 'is_master_admin',
    -- ⚠️ MINDKETTŐ: az m0-HOTFIX-grants.sql:69 az `is_user_approved(uuid)`-ot,
    --    a :73 az `is_current_user_approved()`-ot grantolja. A korábbi lista
    --    csak az elsőt tartalmazta.
    'is_user_approved', 'is_current_user_approved',
    'is_egyhazkeruleti_admin',
    -- a 2026-04-12-phase-0-rls-hardening.sql:220/:227/:293/:301 policy-i hívják
    'csalad_resolves_to_accessible_cong', 'gyerek_resolves_to_accessible_cong',
    'same_congregation', 'profil_lathato_e'
  ]::text[]) AS nev
),
rutin AS (
  SELECT
    p.oid,
    p.proname,
    p.prokind,
    p.prosecdef,
    p.oid::regprocedure::text                       AS sig,
    p.proowner                                      AS tulaj_oid,
    p.proowner::regrole::text                       AS tulaj,
    EXISTS (SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass
              AND d.objid = p.oid AND d.deptype = 'e')  AS kiterjesztes_tag,
    pg_has_role(current_user, p.proowner, 'USAGE')      AS sajat_tulajdon,
    (p.proacl IS NULL
     OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_execute,
    -- Van-e MA EXPLICIT `authenticated` ACL-bejegyzése? (A 27. sor ebből
    -- számolja ki, hány ÚJ, visszavonhatatlan bejegyzést hozna az átmentés.)
    EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) a
            JOIN pg_roles ro ON ro.oid = a.grantee
            WHERE ro.rolname = 'authenticated' AND a.privilege_type = 'EXECUTE') AS explicit_auth,
    -- ⚠️ BEÁGYAZOTT CASE minden szerep-vizsgálatnál, nem
    --    `EXISTS(...) AND has_function_privilege(...)`: a Postgres az AND
    --    kiértékelési sorrendjét NEM garantálja, tehát egy nem létező
    --    szerepnél a has_function_privilege 22023-mal elszállna — és akkor
    --    a 2. sor („a szükséges szerepek léteznek-e") SOSEM tudná jelenteni
    --    a hiányt, mert a rács már a CTE kiértékelésénél meghalna.
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_function_privilege('anon', p.oid, 'EXECUTE') END          AS anon_hivhatja,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS auth_hivhatja,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         THEN has_function_privilege('service_role', p.oid, 'EXECUTE') END  AS svc_hivhatja,
    -- kommentmentesített törzs: a prosrc a `--` kommenteket IS tartalmazza,
    -- és egy naiv mintakeresés rászalad a saját dokumentációjára.
    -- ⚠️ A `prosqlbody` is hozzáfűzve: a Postgres 14 óta a `BEGIN ATOMIC`
    --    törzsű (SQL-szabvány szerinti) függvények törzse NEM a prosrc-ben
    --    él — egy ilyen függvény átcsúszna a 20. soron. A repóban ma nincs
    --    ilyen, de a repó nem bizonyíték az éles állapotra.
    regexp_replace(COALESCE(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g')
      || ' ' || COALESCE(pg_get_function_sqlbody(p.oid), '')                AS torzs_komment_nelkul
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
-- Minden olyan RLS-policy, ami az anon szerepre IS vonatkozik. Ide tartoznak
-- a `TO` záradék NÉLKÜLI policy-k is: azoknál a pg_policy.polroles = '{0}'
-- (PUBLIC), és a PUBLIC MINDEN szerepet magában foglal — az anont is.
-- SZŰKÍTÉS: csak akkor VALÓDI kitettség, ha az anonnak TÁBLA- VAGY
-- OSZLOP-szintű joga is van a relációra; enélkül a policy soha nem
-- értékelődik ki anon-ként.
-- ⚠️ A `has_table_privilege` KIZÁRÓLAG a TÁBLA-szintű ACL-t nézi. Ebben az
--    adatbázisban van olyan reláció, aminek az anon-joga OSZLOP-szintű:
--    a `districts` és a `dioceses` tábla-szintű joga el van véve, és
--    helyette `GRANT SELECT (id, name)` jár
--    (2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql:463-466,
--     2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql:131-133), miközben az
--    anon SELECT policy-juk SZÁNDÉKOSAN megmaradt (S1:420-421). Ezért a
--    `has_any_column_privilege` NÉLKÜL a kapu szerkezetileg VAK lenne rájuk.
anon_policy AS (
  SELECT
    n2.nspname || '.' || c.relname AS tabla,
    pol.polname                    AS policy_nev,
    CASE WHEN pol.polroles = '{0}'::oid[] THEN 'TO nelkul ({public})' ELSE 'TO anon' END AS cimzett,
    COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
    COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS kif
  FROM pg_policy pol
  JOIN pg_class c      ON c.oid = pol.polrelid
  JOIN pg_namespace n2 ON n2.oid = c.relnamespace
  WHERE (pol.polroles = '{0}'::oid[]
         OR (SELECT r.oid FROM pg_roles r WHERE r.rolname = 'anon') = ANY(pol.polroles))
    AND (has_table_privilege('anon', pol.polrelid, 'SELECT, INSERT, UPDATE, DELETE')
         OR has_any_column_privilege('anon', pol.polrelid, 'SELECT, INSERT, UPDATE, REFERENCES'))
),
anon_policy_hivas AS (
  -- ⚠️ SZÓ-HATÁROS illesztés. A puszta `strpos(kif, proname || '(')` hamis
  --    találatot ad, ha az egyik függvénynév a másik VÉGE — a repóban ma
  --    három ilyen névpár van (`audit` ⊂ `get_record_audit`,
  --    `touch_updated_at` ⊂ `pastor_service_history_touch_updated_at` /
  --    `wizard_progress_touch_updated_at`). A regexet csak tiszta
  --    azonosító-neveken használjuk: egy regex-metakaraktert tartalmazó név
  --    fordítási hibát okozna, ott marad a régi (fail-closed) strpos.
  --    LIKE SEHOL: az `_` a LIKE-ban JOKER, a célnevek tele vannak vele.
  -- ⚠️ SZŰKÍTÉS a B) fájl 2) lépésével AZONOS halmazra: a kiterjesztés-tag
  --    és az idegen tulajdonú rutinokhoz a migráció HOZZÁ SEM NYÚL (a 6. és
  --    7. sor méri, hányan vannak), tehát az anon joguk MEGMARAD — egy
  --    rájuk elsülő kapu HAMIS RIASZTÁS lenne, ami az egész migrációt
  --    megbuktatná egy nem érintett függvény miatt.
  SELECT ap.tabla, ap.policy_nev, ap.cimzett, r.proname AS hivott,
         (r.proname IN (SELECT nev FROM engedelyezolista)) AS engedelyezett,
         (r.proname IN (SELECT nev FROM rls_seged))        AS rls_seged_e
  FROM anon_policy ap
  JOIN rutin r ON (CASE WHEN r.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                        THEN ap.kif ~ ('(^|[^A-Za-z0-9_])' || r.proname || '\(')
                        ELSE strpos(ap.kif, r.proname || '(') > 0 END)
  WHERE r.sajat_tulajdon AND NOT r.kiterjesztes_tag
)
SELECT * FROM (

SELECT 1 AS sorszam,
       'Ki futtat / superuser-e'::text AS kerdes,
       (current_user || '  |  session_user=' || session_user
        || '  |  is_superuser=' || current_setting('is_superuser')
        || '  |  current_database=' || current_database())::text AS valasz

UNION ALL
SELECT 2, 'A szukseges szerepek leteznek-e',
  (SELECT string_agg(x.nev || ' = ' ||
            CASE WHEN EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = x.nev)
                 THEN 'letezik' ELSE 'HIANYZIK' END, '  |  ' ORDER BY x.nev)
   FROM unnest(ARRAY['anon','authenticated','service_role','supabase_auth_admin','postgres']) AS x(nev))

UNION ALL
SELECT 3, 'Kiterjesztesek semaja (pgcrypto / unaccent / pg_trgm HOL van?)',
  COALESCE((SELECT string_agg(e.extname || ' -> ' || n.nspname, ', ' ORDER BY e.extname)
            FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace), 'nincs kiterjesztes')

UNION ALL
SELECT 4, 'public-beli rutinok FAJTA szerint (van-e aggregatum / ablakfv / eljaras?)',
  COALESCE((SELECT string_agg(x.k || ' = ' || x.db, '  |  ' ORDER BY x.k)
            FROM (SELECT CASE r.prokind WHEN 'f' THEN 'f (fuggveny)'
                                        WHEN 'p' THEN 'p (ELJARAS)'
                                        WHEN 'a' THEN 'a (AGGREGATUM)'
                                        WHEN 'w' THEN 'w (ABLAKFUGGVENY)'
                                        ELSE r.prokind::text END AS k,
                         count(*)::text AS db
                  FROM rutin r GROUP BY 1) x), 'nincs')

UNION ALL
SELECT 5, 'Aggregatum / ablakfv / eljaras RESZLETESEN (nev + tulajdonos)',
  COALESCE((SELECT string_agg(r.sig || '  [' || r.prokind || ', tulaj=' || r.tulaj || ']', chr(10) ORDER BY r.sig)
            FROM rutin r WHERE r.prokind <> 'f'),
           'NINCS egy sem - a prokind-aszimmetria (B3) nem sulhet el')

UNION ALL
SELECT 6, 'KITERJESZTES-tulajdonu public rutinok (a REVOKE ezeket KIHAGYJA)',
  COALESCE((SELECT count(*)::text || ' db, tulajdonosok: '
              || COALESCE(string_agg(DISTINCT r.tulaj, ', '), '-')
              || '  |  pl.: ' || COALESCE(string_agg(r.proname, ', ' ORDER BY r.proname), '-')
            FROM rutin r WHERE r.kiterjesztes_tag), '0 db')

UNION ALL
SELECT 7, 'NEM a futtato tulajdonaban levo public rutinok (a REVOKE ezeket is KIHAGYJA)',
  COALESCE((SELECT count(*)::text || ' db  |  tulajdonosok: '
              || COALESCE(string_agg(DISTINCT r.tulaj, ', '), '-')
              || '  |  nevek: ' || COALESCE(string_agg(r.proname, ', ' ORDER BY r.proname), '-')
            FROM rutin r WHERE NOT r.sajat_tulajdon), '0 db - minden rutin a futtato hatokoreben')

UNION ALL
-- ⚠️ LEFT JOIN, NEM inner join! A GLOBÁLIS (`IN SCHEMA` NÉLKÜLI)
--    `ALTER DEFAULT PRIVILEGES` bejegyzés `defaclnamespace = 0`-val kerül a
--    katalógusba, amihez NINCS pg_namespace sor — egy inner join NÉMÁN
--    eldobná. Hogy ez nem elméleti: a repóban van ilyen alak,
--    migration-docs/sql/2026-07-18-public-site-content-and-sitemap.sql:251-253
--    (`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS
--     FROM PUBLIC, anon, authenticated, …` — `IN SCHEMA` NÉLKÜL). A Postgres a
--    globális ÉS a séma-szintű alapértelmezést ÖSSZEFÉSÜLI, tehát egy globális
--    GRANT-ot egy `IN SCHEMA public REVOKE` NEM olt ki.
SELECT 8, 'pg_default_acl a FUGGVENYEKRE, SZEREPENKENT (a masodik gyokerok) - a GLOBALIS sorokkal egyutt',
  COALESCE((SELECT string_agg(d.defaclrole::regrole::text || ' @ '
                              || COALESCE(n.nspname, '(GLOBALIS - minden sema)')
                              || '  =  ' || COALESCE(d.defaclacl::text, 'NULL'), chr(10)
                              ORDER BY d.defaclrole::regrole::text, COALESCE(n.nspname, ''))
            FROM pg_default_acl d
            LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
            WHERE d.defaclobjtype = 'f'),
           'NINCS bejegyzes - ekkor csak a beepitett PUBLIC=X alapertelmezes el')

UNION ALL
SELECT 9, 'public rutinok, ahol a jog (meg) a PUBLIC-on at jon',
  (SELECT count(*)::text || ' db  (ebbol sajat tulajdonu, nem kiterjesztes: '
     || (SELECT count(*)::text FROM rutin r2
         WHERE r2.public_execute AND r2.sajat_tulajdon AND NOT r2.kiterjesztes_tag) || ')'
   FROM rutin r WHERE r.public_execute)

UNION ALL
SELECT 10, 'Ma anon-bol hivhato public rutinok szama',
  (SELECT count(*)::text || ' db  (ebbol SECURITY DEFINER: '
     || (SELECT count(*)::text FROM rutin r2 WHERE r2.anon_hivhatja AND r2.prosecdef) || ')'
   FROM rutin r WHERE r.anon_hivhatja)

UNION ALL
SELECT 11, 'ELVESZTIK az anon-jogot, ha az engedelyezolista ervenybe lep (NEVSZERINT)',
  COALESCE((SELECT string_agg(DISTINCT r.proname, ', ' ORDER BY r.proname)
            FROM rutin r
            WHERE r.anon_hivhatja
              AND r.proname NOT IN (SELECT nev FROM engedelyezolista)),
           'egy sem - az anon ma sem hiv semmit az engedelyezolistan kivul')

UNION ALL
SELECT 12, 'Az engedelyezolista LETEZO elemei (es hivhatja-e MA az anon)',
  -- FIGYELEM: itt NINCS DISTINCT. Egy `string_agg(DISTINCT kifejezes … ORDER BY masik)`
  -- alak a Postgresben HIBA („in an aggregate with DISTINCT, ORDER BY expressions
  -- must appear in argument list"). Az `e.nev` amugy is egyedi (unnest egy tombbol).
  COALESCE((SELECT string_agg(e.nev || ' = ' ||
              CASE WHEN EXISTS (SELECT 1 FROM rutin r
                                WHERE r.proname = e.nev AND r.anon_hivhatja)
                   THEN 'ma is anon-hivhato' ELSE 'MA NEM anon-hivhato (a grant most adja meg)' END,
              chr(10) ORDER BY e.nev)
            FROM engedelyezolista e
            WHERE EXISTS (SELECT 1 FROM rutin r WHERE r.proname = e.nev)),
           'EGYIK SEM LETEZIK - ez HIBA lenne, ellenorizd az adatbazist')

UNION ALL
SELECT 13, 'Az engedelyezolista NEM LETEZO elemei (a grant rajuk no-op)',
  COALESCE((SELECT string_agg(e.nev, ', ' ORDER BY e.nev)
            FROM engedelyezolista e
            WHERE NOT EXISTS (SELECT 1 FROM rutin r WHERE r.proname = e.nev)),
           'mind a 17 letezik')

UNION ALL
SELECT 14, 'anon-ra vonatkozo policy-k ({public} = TO nelkuli IS; tabla- VAGY oszlop-joggal)',
  (SELECT count(*)::text || ' db policy  |  ebbol fuggvenyt hivo: '
     || (SELECT count(DISTINCT (aph.tabla || aph.policy_nev))::text FROM anon_policy_hivas aph)
   FROM anon_policy)

UNION ALL
SELECT 15, 'MEGALLITO KAPU ELOREJELZESE: anon-policy, ami ENGEDELYEZOLISTAN KIVULI fuggvenyt hiv',
  COALESCE((SELECT string_agg(aph.tabla || ' / ' || aph.policy_nev || ' (' || aph.cimzett || ')'
                              || '  ->  ' || aph.hivott
                              || CASE WHEN aph.rls_seged_e
                                      THEN '   ⛔ RLS-SEGED: TILOS az engedelyezolistara tenni! A helyes megoldas az anon TABLA-JOGANAK elvetele a relaciotol (kulon, harmadik fajl).'
                                      ELSE '' END, chr(10)
                              ORDER BY aph.tabla, aph.policy_nev, aph.hivott)
            FROM anon_policy_hivas aph WHERE NOT aph.engedelyezett),
           'URES - a B) fajl megallito kapuja NEM fog elsulni')

UNION ALL
SELECT 16, 'B1 ELLENPELDA (ennek MINDIG engedelyezettnek kell latszania)',
  COALESCE((SELECT string_agg(aph.tabla || ' / ' || aph.policy_nev || ' -> ' || aph.hivott
                              || ' = ' || CASE WHEN aph.engedelyezett THEN 'ENGEDELYEZETT (jo)'
                                               ELSE 'HIANYZIK A LISTAROL (B1 megismetlodne!)' END,
                              chr(10) ORDER BY aph.tabla)
            FROM anon_policy_hivas aph WHERE aph.hivott = 'qr_staging_upload_allowed'),
           'a qr_staging_upload_allowed-ot egyetlen anon-policy sem hivja (vagy az anonnak nincs tabla-/oszlop-joga)')

UNION ALL
SELECT 17, 'ATMENTES: hany rutin kapna EXPLICIT authenticated grantot',
  (SELECT count(*)::text || ' db  (kizarva a kizarasi lista, a csak-service_role lista, a kiterjesztes-tagok es az idegen tulajdonuak)'
   FROM rutin r
   WHERE r.auth_hivhatja AND r.sajat_tulajdon AND NOT r.kiterjesztes_tag
     AND r.proname NOT IN (SELECT nev FROM kizarasi_lista)
     AND r.proname NOT IN (SELECT nev FROM csak_service_role))

UNION ALL
SELECT 18, 'ATMENTES: hany rutin kapna EXPLICIT service_role grantot',
  (SELECT count(*)::text || ' db'
   FROM rutin r
   WHERE r.svc_hivhatja AND r.sajat_tulajdon AND NOT r.kiterjesztes_tag
     AND r.proname NOT IN (SELECT nev FROM kizarasi_lista))

UNION ALL
SELECT 19, 'ATMENTESBOL KIZARVA (B2/B5) - es hogy MA ki hivhatja oket',
  COALESCE((SELECT string_agg(r.sig || '  ->  anon=' || CASE WHEN r.anon_hivhatja THEN 'IGEN' ELSE 'nem' END
                              || ', authenticated=' || CASE WHEN r.auth_hivhatja THEN 'IGEN' ELSE 'nem' END
                              || ', service_role=' || CASE WHEN r.svc_hivhatja THEN 'igen' ELSE 'nem' END
                              || ', PUBLIC-oroklott=' || CASE WHEN r.public_execute THEN 'IGEN' ELSE 'nem' END,
                              chr(10) ORDER BY r.sig)
            FROM rutin r WHERE r.proname IN (SELECT nev FROM kizarasi_lista)),
           'a kizarasi lista egyetlen eleme sem letezik')

UNION ALL
SELECT 20, 'Kizarasi listas fuggvenyt hiv-e SECURITY INVOKER public rutin (kommentmentes torzs + BEGIN ATOMIC torzs)',
  COALESCE((SELECT string_agg(DISTINCT hivo.proname || '  ->  ' || cel.proname, chr(10))
            FROM rutin hivo
            JOIN rutin cel ON cel.proname IN (SELECT nev FROM kizarasi_lista)
                          AND cel.oid <> hivo.oid
            WHERE NOT hivo.prosecdef
              AND NOT hivo.kiterjesztes_tag
              AND (CASE WHEN cel.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                        THEN hivo.torzs_komment_nelkul ~ ('(^|[^A-Za-z0-9_])' || cel.proname || '\(')
                        ELSE strpos(hivo.torzs_komment_nelkul, cel.proname || '(') > 0 END)),
           'egy sem - a kizart segedeket CSAK SECURITY DEFINER burkolok hivjak (a hivo joga nem szamit)')

UNION ALL
SELECT 21, 'A TRIAZS 5 TALALATANAK mai jogallapota',
  COALESCE((SELECT string_agg(r.sig || '  ->  anon=' || CASE WHEN r.anon_hivhatja THEN 'HIVHATJA' ELSE 'zarva' END
                              || ', authenticated=' || CASE WHEN r.auth_hivhatja THEN 'hivhatja' ELSE 'zarva' END,
                              chr(10) ORDER BY r.sig)
            FROM rutin r WHERE r.proname IN (SELECT nev FROM triazs)),
           'egyik sem letezik')

UNION ALL
SELECT 22, 'custom_access_token_hook (lefutott-e mar a 2026-09-05-token-hook-p0-zaras?)',
  COALESCE((SELECT string_agg(r.sig || '  ACL=' || COALESCE(
              (SELECT p2.proacl::text FROM pg_proc p2 WHERE p2.oid = r.oid),
              'NULL = OROKOLT PUBLIC=X, a P0-zaras MEG NEM FUTOTT LE')
              || '  |  anon=' || CASE WHEN r.anon_hivhatja THEN 'HIVHATJA (P0!)' ELSE 'zarva' END
              || ', authenticated=' || CASE WHEN r.auth_hivhatja THEN 'HIVHATJA (P0!)' ELSE 'zarva' END
              -- ⚠️ BEAGYAZOTT CASE, nem `EXISTS(...) AND has_function_privilege(...)`:
              --    a Postgres az AND kiertekelesi sorrendjet NEM garantalja, tehat egy
              --    nem letezo szerepnel a has_function_privilege 22023-mal elszallna.
              --    A CASE agai viszont garantaltan csak szukseg eseten ertekelodnek ki.
              || ', supabase_auth_admin='
              || CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
                      THEN CASE WHEN has_function_privilege('supabase_auth_admin', r.oid, 'EXECUTE')
                                THEN 'hivhatja (KELL)' ELSE 'ZARVA (a bejelentkezes serulhet!)' END
                      ELSE 'a szerep NEM LETEZIK' END,
              chr(10) ORDER BY r.sig)
            FROM rutin r WHERE r.proname = 'custom_access_token_hook'),
           'nem letezik')

UNION ALL
SELECT 23, 'SERVICE_ROLE SERTETLENSEG alapallapot: lelkeszi_naptar_feed',
  COALESCE((SELECT string_agg(r.sig || '  ->  service_role=' || CASE WHEN r.svc_hivhatja THEN 'hivhatja (KELL)' ELSE 'ZARVA (HIBA)' END
                              || ', anon=' || CASE WHEN r.anon_hivhatja THEN 'HIVHATJA (HIBA)' ELSE 'zarva' END
                              || ', authenticated=' || CASE WHEN r.auth_hivhatja THEN 'HIVHATJA (HIBA)' ELSE 'zarva' END
                              || ', PUBLIC-oroklott=' || CASE WHEN r.public_execute THEN 'IGEN (HIBA)' ELSE 'nem' END,
                              chr(10) ORDER BY r.sig)
            FROM rutin r WHERE r.proname = 'lelkeszi_naptar_feed'),
           'nem letezik')

UNION ALL
SELECT 24, 'RLS-SEGEDEK a listarol (ezeknek authenticated-bol hivhatonak KELL maradniuk)',
  COALESCE((SELECT string_agg(x.sor, chr(10) ORDER BY x.sor)
            FROM (
              SELECT s.nev || ' = ' ||
                CASE WHEN NOT EXISTS (SELECT 1 FROM rutin r WHERE r.proname = s.nev)
                     THEN 'ELESBEN NEM LETEZIK -> a P1 asszert rA NEMAN SEMMIT nem ellenoriz!'
                     WHEN EXISTS (SELECT 1 FROM rutin r WHERE r.proname = s.nev AND NOT r.auth_hivhatja)
                     THEN 'MAR MOST ZARVA (?)'
                     ELSE 'ok' END
                || CASE WHEN EXISTS (SELECT 1 FROM rutin r WHERE r.proname = s.nev AND r.public_execute)
                        THEN '  [ma CSAK a PUBLIC-on at! -> az atmentes adja meg explicit]' ELSE '' END AS sor
              FROM rls_seged s) x),
           'a lista ures - ez HIBA lenne')

UNION ALL
-- Dinamikus párja a 24. sornak: NEM kézzel írt listából, hanem a pg_policy
-- kifejezéseiből gyűjti ki, mely public függvényeket hívja VALÓBAN policy.
-- (A B) fájl P1 asszertje ugyanígy dolgozik — így egy új segéd sem maradhat
-- ki némán, ahogy a `csalad_resolves_to_accessible_cong` kimaradt.)
SELECT 25, 'POLICY-BOL HIVOTT public fuggvenyek (dinamikus) - authenticated-nek MIND kell',
  COALESCE((SELECT string_agg(DISTINCT x.sor, chr(10))
            FROM (
              SELECT pr.proname || ' = ' ||
                     CASE WHEN pr.auth_hivhatja THEN 'ok' ELSE 'MAR MOST ZARVA (?)' END
                     || CASE WHEN pr.proname IN (SELECT nev FROM rls_seged) THEN '' ELSE '   [NINCS a kezi rls_seged listan]' END AS sor
              FROM pg_policy pol
              CROSS JOIN LATERAL (
                SELECT COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                       COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS kif
              ) e
              JOIN rutin pr ON (CASE WHEN pr.proname ~ '^[A-Za-z_][A-Za-z0-9_]*$'
                                     THEN e.kif ~ ('(^|[^A-Za-z0-9_])' || pr.proname || '\(')
                                     ELSE strpos(e.kif, pr.proname || '(') > 0 END)
              WHERE pr.sajat_tulajdon AND NOT pr.kiterjesztes_tag
            ) x),
           'egyetlen policy sem hiv public fuggvenyt - ez GYANUS, ellenorizd')

UNION ALL
-- ⛔ EZ A SOR A B) FÁJL 0/e KAPUJÁNAK A BEMENETE.
--    A B) fájl 0/e-je fail-closed kapu: ha itt nem üres a lista, a migráció
--    MEGÁLL. Döntsd el minden szerepről, kell-e neki továbbra is hozzáférés,
--    és a megtartandókat írd be a B) fájl `v_atmentendo_szerepek` tömbjébe.
SELECT 26, 'A PUBLIC-on at (is) hozzaferő TOVABBI, nem-superuser szerepek (a B) 0/e kapujanak bemenete)',
  COALESCE((SELECT string_agg(ro.rolname, ', ' ORDER BY ro.rolname)
            FROM pg_roles ro
            WHERE NOT ro.rolsuper
              AND ro.rolname NOT IN ('anon', 'authenticated', 'service_role', current_user)
              -- SZANDEKOSAN left(), nem LIKE: az alahuzas a LIKE-ban JOKER.
              AND left(ro.rolname, 3) <> 'pg_'
              AND EXISTS (SELECT 1 FROM rutin r
                          WHERE NOT pg_has_role(ro.oid, r.tulaj_oid, 'USAGE')
                            AND r.public_execute)),
           'nincs ilyen - a B) 0/e kapuja NEM fog elsulni')

UNION ALL
-- Az 1) átmentés a legnehezebben visszafordítható lépés: egy EXPLICIT
-- ACL-bejegyzést egyetlen későbbi `REVOKE … FROM PUBLIC` sem venne le, csak
-- célzott, függvényenkénti REVOKE. Ezért NEM elég a darabszám (17. sor) —
-- a SECURITY DEFINER rutinokat NÉVSZERINT is látni kell, mert a kizárási
-- listát ENNEK ALAPJÁN lehet bővíteni, MIELŐTT a B) elindul.
SELECT 27, 'ATMENTES NEVSORA - SECURITY DEFINER rutinok, amik EXPLICIT authenticated grantot kapnanak',
  COALESCE((SELECT string_agg(r.sig, chr(10) ORDER BY r.sig)
            FROM rutin r
            WHERE r.auth_hivhatja AND r.sajat_tulajdon AND NOT r.kiterjesztes_tag
              AND r.prosecdef
              AND r.proname NOT IN (SELECT nev FROM kizarasi_lista)
              AND r.proname NOT IN (SELECT nev FROM csak_service_role)),
           'egy sem')

UNION ALL
-- A VALÓDI „új" bejegyzések halmaza: ma CSAK a PUBLIC-on át hívhatók, tehát
-- ma nincs explicit `authenticated` ACL-soruk. Ezekre az átmentés ÚJ,
-- visszavonhatatlan bejegyzést ír.
SELECT 28, 'ATMENTES: ebbol hany UJ explicit bejegyzes (ma CSAK a PUBLIC-on at hivhato)',
  (SELECT count(*)::text || ' db  |  ebbol SECURITY DEFINER: '
     || (SELECT count(*)::text FROM rutin r2
         WHERE r2.auth_hivhatja AND r2.sajat_tulajdon AND NOT r2.kiterjesztes_tag
           AND r2.public_execute AND NOT r2.explicit_auth AND r2.prosecdef
           AND r2.proname NOT IN (SELECT nev FROM kizarasi_lista)
           AND r2.proname NOT IN (SELECT nev FROM csak_service_role))
   FROM rutin r
   WHERE r.auth_hivhatja AND r.sajat_tulajdon AND NOT r.kiterjesztes_tag
     AND r.public_execute AND NOT r.explicit_auth
     AND r.proname NOT IN (SELECT nev FROM kizarasi_lista)
     AND r.proname NOT IN (SELECT nev FROM csak_service_role))

) q ORDER BY sorszam;
