-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B1 + B2 — DELEGÁLT RENDSZERGAZDAI HOZZÁFÉRÉS MEGSZILÁRDÍTÁSA  2026-08-25 ║
-- ║ Fájl: migration-docs/sql/2026-08-25-b1-b2-delegalt-hozzaferes.sql        ║
-- ║ (Biztonsági javító kör — a legsúlyosabb lánc)                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MI A BAJ — EMBERI NYELVEN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Amikor egy rendszergazda be akar lépni egy gyülekezet adataiba, a rendszer
-- egy „hozzáférési kérelem" sort ír az `admin_access_requests` táblába. A
-- gyülekezet lelkésze ezt jóváhagyja, és ettől kezdve — 2 (illetve 24) óráig —
-- a rendszergazda látja és szerkesztheti annak a gyülekezetnek az adatait,
-- BELEÉRTVE a hivatalos anyakönyvet.
--
-- B1 — A TÁBLÁN ÖT, EGYMÁST ÁTFEDŐ SZABÁLY (RLS-policy) ÜL, ÉS MIND AZ ÖTNEK
--      HIÁNYZIK AZ ÍRÁS-ELLENŐRZÉSE (WITH CHECK).
--      A PostgreSQL-ben egy `FOR ALL` policy WITH CHECK nélkül az ÍRÁST is a
--      OLVASÁSI feltétellel (USING) engedélyezi. Az öt policy pedig VAGY-
--      kapcsolatban áll: elég, ha EGY átengedi.
--      KÖVETKEZMÉNY: bármely bejelentkezett, aktív lelkész — a saját, érvényes
--      belépésével, közvetlen PostgREST-hívással — beszúrhat MAGÁNAK egy
--      `status='approved'`, jövőbeli lejáratú sort BÁRMELY gyülekezetre.
--      Nem kell hozzá jóváhagyás, nem kell hozzá rendszergazdai jog.
--
-- B2 — HAT `SECURITY DEFINER` FÜGGVÉNY EZT A TÁBLÁT FOGADJA EL BIZONYÍTÉKNAK.
--      A `SECURITY DEFINER` azt jelenti: a függvény a TULAJDONOS jogaival fut,
--      tehát a benne lévő kapu az EGYETLEN védelem. Mind a hat ugyanazt a
--      feltételt használja:
--          EXISTS (… admin_user_id = hívó AND congregation_id = cél
--                    AND status = 'approved' AND expires_at > now())
--      Vagyis a kapu kulcsát maga a hívó szerepe írhatja. A hat függvény:
--          _can_manage_family_links, generate_egyhazi_anyakonyvi_szam,
--          import_families_from_existing_persons_batch, import_family_head_batch,
--          import_registry_batch, wipe_congregation_data
--      ⚠️ A `wipe_congregation_data` egy ADATTÖRLŐ függvény.
--
-- MI TÖRTÉNHETNE, HA NEM JAVÍTJUK: egy másik gyülekezet lelkésze — vagy bárki,
-- aki egy ilyen fiókhoz hozzáfér — két HTTP-kéréssel idegen gyülekezet
-- hivatalos anyakönyvébe (keresztelés, konfirmáció, házasság, temetés) tömeges
-- bejegyzést írhatna, egyházi anyakönyvi számot generálhatna, családi
-- kapcsolatokat írhatna át, sőt a gyülekezet adatait törölhetné.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MIT CSINÁL EZ A FÁJL
-- ─────────────────────────────────────────────────────────────────────────────
--
--   1/A) `jovahagyta` oszlop — KI hagyta jóvá a hozzáférést. A szerver
--        bélyegzi, a kliens payloadjából SOHA nem vesszük át.
--   1/B) Minden MA élő, jóváhagyott hozzáférést lejárttá tesz. (Nem tudjuk
--        bizonyítani róluk, hogy legitim úton keletkeztek — és nélküle a
--        lentebbi CHECK sem lenne érvényesíthető.)
--   1/C) Két CHECK: jóváhagyott sornak KÖTELEZŐ lejárata és KÖTELEZŐ
--        jóváhagyója van.
--   1/D) EGY helyen élő szabály: `public.aar_jogosult_jovahagyo(user, cong,
--        csak_admin)` — ki hagyhat jóvá delegált hozzáférést egy gyülekezethez.
--        Erre épül a B2 kapuja: `public.delegalt_hozzaferes_ervenyes(cong)`.
--   1/E) BEFORE INSERT/UPDATE trigger: a `jovahagyta` mezőt a SZERVER bélyegzi
--        `auth.uid()`-ból (a kliens payloadjából SOHA), és jóváhagyottá válni
--        csak jogosult jóváhagyóval + korlátos lejárattal lehet.
--   1/F) Az öt régi policy eldobása, három tiszta helyette (SELECT / INSERT /
--        UPDATE), mindegyiken kiírt WITH CHECK-kel.
--   1/G) `_can_manage_family_links` átkötése a `delegalt_hozzaferes_ervenyes`-re
--        (fail-closed asszerttel: ha az ÉLŐ törzs eltér a repótól, a migráció
--        MEGÁLL, nem ír felül ismeretlen kódot).
--   1/H) ÖNTESZT NEGATÍV ÉS POZITÍV ASSZERTTEL — a tranzakción belül eljátssza
--        (a) a RÉGI hibás viselkedést: idegen lelkész `approved` sort szúr be
--            → ha SIKERÜL, a migráció ABORTÁL (a lyuk nyitva maradt),
--        (b) a MŰKÖDŐ utat: rendszergazdai ön-megbízás → ha ELBUKIK, a migráció
--            ABORTÁL (eltörtük a „Belépés a gyülekezetbe" gombot).
--        Mindkét próba visszagörgetett al-tranzakcióban fut, sor nem marad.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ AMIT SZÁNDÉKOSAN NEM CSINÁL — ÉS MIÉRT
-- ─────────────────────────────────────────────────────────────────────────────
--
--   · A hat SECURITY DEFINER függvény közül CSAK a legkisebbet
--     (`_can_manage_family_links`, 40 sor) írja át. A másik öt törzse
--     200–900 sor (anyakönyvi és családi import, adattörlés); a
--     `CREATE OR REPLACE` a TELJES törzs újragépelését követeli meg, a repó
--     pedig BIZONYÍTOTTAN széthúzhat a produkcióval („a migrációs fájl nem
--     bizonyíték" hibaosztály). Egyetlen elgépelt sor élesben törné el az
--     anyakönyvi importot. Helyette a védelem ODA került, ahol MINDEGYIKÜKRE
--     egyszerre hat: az 1/E trigger miatt `status='approved'` sor MÁR NEM TUD
--     LÉTREJÖNNI jogosult jóváhagyó nélkül — így a hat függvény VÁLTOZATLAN
--     feltétele is szilárd talajra kerül. A trigger a `service_role`-t sem
--     kerüli meg (a triggert az RLS-megkerülés NEM kapcsolja ki).
--     A maradék öt függvény átkötése KÜLÖN, célzott kör — lásd a fájl végén.
--
--   · A lejárat NEM kap CHECK constraintet, mert a `now()` nem IMMUTABLE, tehát
--     CHECK-ben nem használható. A 2 (illetve 24) órás plafon ezért a
--     triggerben él.
--
--   · Az „új sor KÖTELEZŐEN pending" szabály NEM abszolút, mert a mai,
--     LEGITIM `enterCongregation` út (apps/web/app/(dashboard)/admin/
--     actions.ts:468-489) god mode mellett — vagy ha a gyülekezetben nincs
--     más aktív felhasználó, aki jóváhagyhatná — KÖZVETLENÜL `approved` sort
--     szúr be. Ezt a policy megtartja, DE csak rendszergazdának / hatóköri
--     adminnak, és csak 2 órás plafonnal. Egy egyszerű lelkész ezt az utat
--     többé nem járhatja.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HATÁSVIZSGÁLAT — MIT HASZNÁL MA AZ APP (mind a hívó SAJÁT munkamenetével,
-- tehát RLS ALATT: `@/lib/supabase/server` createClient, nem service_role)
-- ─────────────────────────────────────────────────────────────────────────────
--   apps/web/app/(dashboard)/admin/actions.ts:439      SELECT (saját, approved)
--   apps/web/app/(dashboard)/admin/actions.ts:455      SELECT (saját, pending)
--   apps/web/app/(dashboard)/admin/actions.ts:472      UPDATE saját approved → expired
--   apps/web/app/(dashboard)/admin/actions.ts:478      INSERT status='approved'  ⭐ legitim ön-megbízás
--   apps/web/app/(dashboard)/admin/actions.ts:501      INSERT status='pending'
--   apps/web/app/(dashboard)/admin-override/actions.ts:28  UPDATE saját approved → expired
--   apps/web/app/(dashboard)/god-mode/actions-v4.ts:344    UPDATE saját approved → expired
--   apps/web/app/(dashboard)/notifications/actions.ts:36/43 SELECT + UPDATE → approved (a lelkész)
--   apps/web/app/(dashboard)/notifications/actions.ts:67/72 SELECT + UPDATE → denied  (a lelkész)
--   apps/web/lib/auth/effective-access.ts:284         SELECT (saját, approved, él)
--   MENTÉS/VISSZAÁLLÍTÁS: a tábla `globalis` hatókörrel szerepel a
--     backup_table_policy-ban (2026-08-11-biztonsagi-mentes.sql:554). A
--     visszaállítás `service_role` klienssel ír (apps/web/lib/restore/audit.ts:25)
--     → az 1/E trigger a `service_role` írását ÁTENGEDI (a fenyegetési modell
--     a böngészőből érkező `authenticated` szerep, nem a szerveroldal).
--   TÖRLÉS: sehol. DELETE jogot ezért NEM adunk, DELETE policy nem készül.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- FUTTATÁSI SORREND: 0. szakasz → elolvasod → 1. szakasz → 2. szakasz.
-- A fájl TÖBBSZÖR IS futtatható (IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                                             ║
-- ║ EGYETLEN SELECT. SEMMIT NEM MÓDOSÍT. Ez méri, hogy a javítás ELŐTTI      ║
-- ║ állapot áll-e fenn. Ha nem, NE futtasd tovább.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⛔ MIELŐTT AZ 1. SZAKASZT ELINDÍTOD, NÉZD MEG:
--   · 03 ≠ 0  → fennáll a hiba (ennyi policy-nak nincs WITH CHECK-je). Ha már
--               0, és a 04/05 is „van", akkor ez a fájl MÁR LEFUTOTT.
--   · 11 ≠ igen VAGY 12 ≠ igen → ÁLLJ MEG: az előfeltétel-függvény hiányzik,
--               előbb a 2026-08-11-globalis-hozzaferes-szukites.sql kell.
--   · 14 → ⛔⛔ A LEGFONTOSABB SOR. Ez felsorolja, KI megy át ma a
--               „rendszergazda" lábon. HA A SAJÁT (MASTER) FIÓKOD NINCS
--               BENNE, akkor az 1. szakasz után a „Belépés a gyülekezetbe"
--               gomb ELROMLIK NEKED IS. Ilyenkor ELŐBB vedd fel magadnak a
--               profiles.role='admin'-t vagy egy system-hatókörű, jóváhagyott
--               profile_roles admin sort. (Az 1/H pozitív önteszt is megfog,
--               de jobb előre tudni.)
--   · 17 ≠ true → az 1/G fail-closed asszert MEG FOGJA ÁLLÍTANI az egész
--               migrációt. Ilyenkor a 18. sorból MENTSD EL az élő törzset,
--               majd kommenteld ki az 1/G alszakaszt, és futtasd a többit —
--               a B1 javítás és a trigger enélkül is teljes értékű.
--   · 06 → ennyi rendszergazda ül MOST bent egy gyülekezetben; az 1/B után
--               ki kell lépniük és újra rá kell nyomniuk a belépésre.

SELECT * FROM (

SELECT  1 AS sorrend, 'RLS engedélyezve az admin_access_requests táblán?'::text AS mit,
        COALESCE((SELECT relrowsecurity::text FROM pg_class
                   WHERE oid = 'public.admin_access_requests'::regclass), '(nincs tábla)') AS ertek,
        'true kell legyen'::text AS teendo
UNION ALL
SELECT  2, 'MAI policy-k (név [parancs] with_check)',
        COALESCE((SELECT string_agg(p.policyname || ' [' || p.cmd || '] with_check=' ||
                                    COALESCE(p.with_check, 'NINCS'), E'\n' ORDER BY p.policyname)
                    FROM pg_policies p
                   WHERE p.schemaname = 'public' AND p.tablename = 'admin_access_requests'), '(egy sem)'),
        'a hiba: FOR ALL policy WITH CHECK nélkül az írást is a USING-gal engedi'
UNION ALL
SELECT  3, '⛔ Ennyi ÍRÓ policy-nak NINCS WITH CHECK-je',
        (SELECT count(*)::text FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = 'admin_access_requests'
            AND p.cmd IN ('ALL', 'INSERT', 'UPDATE') AND p.with_check IS NULL),
        'ha 0 → a javítás MÁR lefutott; ha > 0 → fennáll a hiba'
UNION ALL
SELECT  4, 'Van már `jovahagyta` oszlop?',
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='admin_access_requests'
                             AND column_name='jovahagyta') THEN 'van' ELSE 'NINCS' END,
        'a javítás ELŐTT: NINCS'
UNION ALL
SELECT  5, 'Van már védő trigger a táblán?',
        COALESCE((SELECT string_agg(t.tgname, ', ' ORDER BY t.tgname) FROM pg_trigger t
                   WHERE t.tgrelid = 'public.admin_access_requests'::regclass
                     AND NOT t.tgisinternal), 'NINCS'),
        'a javítás ELŐTT: NINCS'
UNION ALL
SELECT  6, 'MOST ÉLŐ delegált hozzáférések (approved ÉS még nem járt le)',
        (SELECT count(*)::text FROM public.admin_access_requests
          WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at > now()),
        'ennyi rendszergazdát léptet ki az 1/B — újra rá kell nyomniuk a belépésre'
UNION ALL
SELECT  7, 'Összes ''approved'' státuszú sor (ezeket az 1/B lejárttá teszi)',
        (SELECT count(*)::text FROM public.admin_access_requests WHERE status = 'approved'),
        'tájékoztató'
UNION ALL
SELECT  8, '`authenticated` jogai a táblán',
        COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
                    FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='admin_access_requests'
                     AND grantee='authenticated'), '(egy sem)'),
        'SELECT, INSERT, UPDATE várható — DELETE NE legyen'
UNION ALL
SELECT  9, '`anon` jogai a táblán',
        COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
                    FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='admin_access_requests'
                     AND grantee='anon'), '(egy sem)'),
        '(egy sem) a helyes — az 1/F idempotensen visszavonja'
UNION ALL
SELECT 10, 'Léteznek már az ÚJ segédfüggvények?',
        COALESCE((SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname='public'
                     AND p.proname IN ('aar_jogosult_jovahagyo','delegalt_hozzaferes_ervenyes',
                                       'admin_access_requests_vedelem')), 'NINCS egy sem'),
        'a javítás ELŐTT: NINCS egy sem'
UNION ALL
SELECT 11, 'ELŐFELTÉTEL: current_user_has_global_access() létezik?',
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                           WHERE n.nspname='public' AND p.proname='current_user_has_global_access')
             THEN 'igen' ELSE '⛔ NEM' END,
        'ha NEM → előbb a 2026-08-11-globalis-hozzaferes-szukites.sql'
UNION ALL
SELECT 12, 'ELŐFELTÉTEL: congregations.diocese_id + dioceses.district_id oszlop megvan?',
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='congregations' AND column_name='diocese_id')
              AND EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='dioceses' AND column_name='district_id')
             THEN 'igen' ELSE '⛔ NEM' END,
        'erre épül a megyei/kerületi hatókör-láb'
UNION ALL
SELECT 13, 'ELŐFELTÉTEL: profile_roles oszlopai (scope, scope_id, role, active, approval_status)',
        (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema='public' AND table_name='profile_roles'
            AND column_name IN ('scope','scope_id','role','active','approval_status')) || ' / 5',
        '5 / 5 kell legyen'
UNION ALL
SELECT 14, '⛔⛔ KIK MENNEK ÁT A ''RENDSZERGAZDA'' LÁBON (e-mail) — A SAJÁT FIÓKOD BENNE VAN?',
        COALESCE((SELECT string_agg(DISTINCT COALESCE(p.email, p.id::text), E'\n' ORDER BY COALESCE(p.email, p.id::text))
                    FROM public.profiles p
                   WHERE p.status = 'active'
                     AND (p.role = 'admin'
                          OR EXISTS (SELECT 1 FROM public.profile_roles pr
                                      WHERE pr.profile_id = p.id AND pr.role='admin' AND pr.scope='system'
                                        AND pr.active = true AND pr.approval_status='approved'))), '⛔ EGY SEM'),
        'HA A MASTER FIÓKOD NINCS ITT: előbb vedd fel neki a profiles.role=''admin''-t, KÜLÖNBEN a Belépés gomb elromlik'
UNION ALL
SELECT 15, 'Egyházmegyéhez NEM kötött gyülekezetek (ezekre a megyei/kerületi láb vak)',
        (SELECT count(*)::text FROM public.congregations WHERE diocese_id IS NULL),
        'ha > 0: ezekhez CSAK rendszergazda vagy a saját lelkész hagyhat jóvá'
UNION ALL
SELECT 16, 'A HAT SECURITY DEFINER függvény — melyik hivatkozik ma admin_access_requests-re',
        COALESCE((SELECT string_agg(p.proname || ' → ' ||
                       CASE WHEN pg_get_functiondef(p.oid) LIKE '%admin_access_requests%'
                            THEN 'IGEN' ELSE 'nem' END, E'\n' ORDER BY p.proname)
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname='public'
                     AND p.proname IN ('_can_manage_family_links','generate_egyhazi_anyakonyvi_szam',
                                       'import_families_from_existing_persons_batch','import_family_head_batch',
                                       'import_registry_batch','wipe_congregation_data')), '(egy sem)'),
        'tájékoztató — az 1/E trigger MINDEGYIKÜK feltételét megszilárdítja'
UNION ALL
SELECT 17, '`_can_manage_family_links` ÉLŐ törzse megegyezik a repóéval?',
        COALESCE((SELECT CASE
                    WHEN pg_get_functiondef(p.oid) LIKE '%delegalt_hozzaferes_ervenyes%'
                      THEN 'MÁR ÁTÍRVA (ez a fájl már futott) — az 1/G ismételten futtatható'
                    WHEN pg_get_functiondef(p.oid) LIKE '%admin_access_requests%'
                     AND pg_get_functiondef(p.oid) LIKE '%scope = ''system''%'
                     AND pg_get_functiondef(p.oid) LIKE '%approval_status = ''approved''%'
                      THEN 'true — egyezik, az 1/G futtatható'
                    ELSE '⛔ ELTÉR A REPÓTÓL'
                  END
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname='public' AND p.proname='_can_manage_family_links' LIMIT 1), '(nincs ilyen függvény)'),
        'ha ⛔ ELTÉR → az 1/G ASSZERT MEGÁLLÍTJA a migrációt; ilyenkor mentsd el a 18. sort és kommenteld ki az 1/G-t'
UNION ALL
SELECT 18, '`_can_manage_family_links` — TELJES ÉLŐ TÖRZS (MENTSD EL!)',
        COALESCE((SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='_can_manage_family_links' LIMIT 1), '(nincs)'),
        'baj esetén EBBŐL állítsd vissza'

) AS t
ORDER BY sorrend;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                                  ║
-- ║ EGYETLEN tranzakció. Ha bármelyik önteszt bukik, MINDEN visszagörög.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '5min';


-- ── 1/A · `jovahagyta` OSZLOP ─────────────────────────────────────────────
--
-- A `jovahagyta` értékét SOHA nem a kliens adja: az 1/E trigger bélyegzi rá
-- `auth.uid()`-ból. FK-t szándékosan NEM teszünk rá (nem ad biztonsági
-- többletet, viszont az auth.users-re hivatkozó constraint fölöslegesen
-- kockázatos egy biztonsági migrációban).

ALTER TABLE public.admin_access_requests
  ADD COLUMN IF NOT EXISTS jovahagyta uuid;

COMMENT ON COLUMN public.admin_access_requests.jovahagyta IS
  'KI hagyta jóvá ezt a hozzáférést (auth.users.id). A szerver bélyegzi az admin_access_requests_vedelem() triggerben, auth.uid()-ból — a kliens payloadjából SOHA nem vesszük át. Ha egyenlő az admin_user_id-vel, az ÖN-MEGBÍZÁS (god mode / nincs jóváhagyásra alkalmas felhasználó a gyülekezetben) — ez csak rendszergazdának / hatóköri adminnak megengedett, és legfeljebb 2 óráig él.';

-- ── 1/B · A BIZONYÍTHATATLAN, JÓVÁHAGYOTT HOZZÁFÉRÉSEK LEJÁRTTÁ TÉTELE ────
--
-- MIÉRT: egyetlen mai `approved` sorról sem tudjuk bizonyítani, hogy legitim
-- úton keletkezett-e (épp ez a B1 hibája), és a lenti
-- `aar_approved_kell_jovahagyo` CHECK sem lenne érvényesíthető rájuk, mert
-- nincs `jovahagyta` értékük. A gyakorlati hatás enyhe: aki most bent ül egy
-- gyülekezetben, kilép, és újra rányom a „Belépés a gyülekezetbe" gombra.
--
-- ⚠️ A `jovahagyta IS NULL` szűrő az IDEMPOTENCIA miatt van: egy KÉSŐBBI
--    újrafuttatás így NEM lövi ki a közben szabályosan (bélyegzett jóváhagyóval)
--    keletkezett, élő hozzáféréseket — csak a régi világ maradványait.

UPDATE public.admin_access_requests
   SET status     = 'expired',
       expires_at = LEAST(COALESCE(expires_at, now()), now())
 WHERE status = 'approved'
   AND jovahagyta IS NULL;


-- ── 1/C · KÉT CHECK CONSTRAINT ────────────────────────────────────────────
--
-- ⚠️ NÉV SZERINT (conname) célzunk, nem `pg_get_constraintdef LIKE`-kal — az a
--    projektben már eldobott egy MÁSIK constraintet.
DO $aar_constraintek$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.admin_access_requests'::regclass
                    AND conname  = 'aar_approved_kell_lejarat') THEN
    ALTER TABLE public.admin_access_requests
      ADD CONSTRAINT aar_approved_kell_lejarat
      CHECK (status <> 'approved' OR expires_at IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.admin_access_requests'::regclass
                    AND conname  = 'aar_approved_kell_jovahagyo') THEN
    ALTER TABLE public.admin_access_requests
      ADD CONSTRAINT aar_approved_kell_jovahagyo
      CHECK (status <> 'approved' OR jovahagyta IS NOT NULL);
  END IF;
END
$aar_constraintek$;


-- ── 1/D · A SZABÁLY, AMI EGY HELYEN ÉL ────────────────────────────────────
--
-- `aar_jogosult_jovahagyo(p_user, p_cong, p_csak_admin)`
--   IGAZ, ha `p_user` MA jogosult delegált hozzáférést jóváhagyni a `p_cong`
--   gyülekezethez. Hét láb:
--     (1) rendszergazda, skalár (profiles.role='admin')
--     (2) rendszergazda, profile_roles system-hatókörű admin sor
--     (3) egyházmegyei hatókör — profile_roles diocese sor (esperes / megyei admin)
--     (4) egyházmegyei hatókör — skalár profiles.diocese_id, CSAK ha semmilyen
--         megyei profile_roles sora nincs (fallback-elv, mint a
--         current_user_diocese_ids()-ben)
--     (5) egyházkerületi hatókör — profile_roles district sor
--     (6) egyházkerületi hatókör — skalár profiles.district_id, ugyanazzal a
--         fallback-elvvel
--     (7) A CÉL GYÜLEKEZET LELKÉSZE — ez a jóváhagyói (consent) út.
--         `p_csak_admin = true` esetén ez a láb KI VAN ZÁRVA: ön-megbízáshoz
--         (god mode / nincs jóváhagyó) NEM elég lelkésznek lenni.
--
-- MINDEN lábon ott a `profiles.status = 'active'` kapu: egy felfüggesztett
-- fiók ottfelejtett szerepkör-során keresztül ne lehessen jóváhagyó.
-- FAIL-CLOSED: NULL argumentumra hamis.
--
-- ⚠️ Ez a törzs a `current_user_diocese_ids()` / `current_user_district_ids()`
--    (2026-08-11-globalis-hozzaferes-szukites.sql) PARAMÉTERES tükre. Azok
--    `auth.uid()`-ra dolgoznak, itt viszont egy MÁSIK felhasználó (a tárolt
--    `jovahagyta`) jogosultságát kell utólag is ellenőrizni.

CREATE OR REPLACE FUNCTION public.aar_jogosult_jovahagyo(
  p_user       uuid,
  p_cong       uuid,
  p_csak_admin boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $aar_jov$
  -- v2026-08-25-b1b2
  SELECT
    p_user IS NOT NULL
    AND p_cong IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user AND p.status = 'active')
    AND (
      -- (1) rendszergazda — skalár láb
      EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = p_user AND p.status = 'active' AND p.role = 'admin')
      -- (2) rendszergazda — profile_roles system-hatókör
      OR EXISTS (SELECT 1 FROM public.profile_roles pr
                  WHERE pr.profile_id = p_user
                    AND pr.role = 'admin' AND pr.scope = 'system'
                    AND pr.active = true AND pr.approval_status = 'approved')
      -- (3) egyházmegyei hatókör — profile_roles
      OR EXISTS (SELECT 1
                   FROM public.congregations c
                   JOIN public.profile_roles pr
                     ON pr.scope = 'diocese' AND pr.scope_id = c.diocese_id
                  WHERE c.id = p_cong
                    AND pr.profile_id = p_user
                    AND pr.role IN ('esperes', 'egyhazmegyei_admin')
                    AND pr.active = true AND pr.approval_status = 'approved')
      -- (4) egyházmegyei hatókör — skalár fallback
      OR EXISTS (SELECT 1
                   FROM public.congregations c
                   JOIN public.profiles p ON p.id = p_user
                  WHERE c.id = p_cong
                    AND p.status = 'active'
                    AND p.role IN ('esperes', 'egyhazmegyei_admin')
                    AND p.diocese_id IS NOT NULL
                    AND p.diocese_id = c.diocese_id
                    AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr2
                                     WHERE pr2.profile_id = p_user AND pr2.scope = 'diocese'
                                       AND pr2.active = true AND pr2.approval_status = 'approved'
                                       AND pr2.scope_id IS NOT NULL))
      -- (5) egyházkerületi hatókör — profile_roles
      OR EXISTS (SELECT 1
                   FROM public.congregations c
                   JOIN public.dioceses d ON d.id = c.diocese_id
                   JOIN public.profile_roles pr
                     ON pr.scope = 'district' AND pr.scope_id = d.district_id
                  WHERE c.id = p_cong
                    AND pr.profile_id = p_user
                    AND pr.role = 'egyhazkeruleti_admin'
                    AND pr.active = true AND pr.approval_status = 'approved')
      -- (6) egyházkerületi hatókör — skalár fallback
      OR EXISTS (SELECT 1
                   FROM public.congregations c
                   JOIN public.dioceses d ON d.id = c.diocese_id
                   JOIN public.profiles p ON p.id = p_user
                  WHERE c.id = p_cong
                    AND p.status = 'active'
                    AND p.role = 'egyhazkeruleti_admin'
                    AND p.district_id IS NOT NULL
                    AND p.district_id = d.district_id
                    AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr2
                                     WHERE pr2.profile_id = p_user AND pr2.scope = 'district'
                                       AND pr2.active = true AND pr2.approval_status = 'approved'
                                       AND pr2.scope_id IS NOT NULL))
      -- (7) a CÉL GYÜLEKEZET LELKÉSZE — a consent-út. Ön-megbízásnál kizárva.
      --     A COALESCE fail-closed: NULL argumentum = a SZIGORÚBB ág (a
      --     lelkészi láb kimarad), és a függvény sosem ad vissza NULL-t.
      OR (
        COALESCE(p_csak_admin, true) = false
        AND (
          EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = p_user AND p.status = 'active'
                     AND p.role = 'lelkesz' AND p.congregation_id = p_cong)
          OR EXISTS (SELECT 1 FROM public.profile_roles pr
                      WHERE pr.profile_id = p_user
                        AND pr.scope = 'congregation' AND pr.scope_id = p_cong
                        AND pr.role = 'lelkesz'
                        AND pr.active = true AND pr.approval_status = 'approved')
        )
      )
    );
$aar_jov$;

COMMENT ON FUNCTION public.aar_jogosult_jovahagyo(uuid, uuid, boolean) IS
  '2026-08-25 (B1+B2): EGY helyen élő szabály — jogosult-e p_user delegált rendszergazdai hozzáférést jóváhagyni a p_cong gyülekezethez. Hét láb: rendszergazda (skalár + system-hatókörű profile_roles), egyházmegyei és egyházkerületi hatókör (profile_roles-elsőbbség + skalár fallback, mint a current_user_diocese_ids()-ben), végül a cél gyülekezet LELKÉSZE. p_csak_admin=true esetén a lelkészi láb kimarad: ön-megbízáshoz (god mode / nincs jóváhagyó) NEM elég lelkésznek lenni. Minden lábon profiles.status=''active'' kapu. Fail-closed: NULL-ra hamis. EZT hívja az RLS (aar_letrehozas, aar_modositas), az admin_access_requests_vedelem() trigger ÉS a delegalt_hozzaferes_ervenyes() kapu.';


-- `delegalt_hozzaferes_ervenyes(cel_gyulekezet)` — a B2 KAPUJA.
--
-- Ezt hívja (illetve ezt kell hívnia) minden SECURITY DEFINER függvénynek a
-- „delegált hozzáférés" ág helyett. A mai, naiv feltételhez képest HÁROM
-- pluszt követel meg:
--   · `jovahagyta` legyen kitöltve (nincs gazdátlan jóváhagyás),
--   · a jóváhagyó MA IS jogosult legyen rá (visszavont szerepkör → az override
--     azonnal elhal, fail-closed — ugyanez a logika él az appban is,
--     apps/web/lib/auth/effective-access.ts:299-306),
--   · ha a sor ÖN-MEGBÍZÁS (jovahagyta = admin_user_id), akkor a szigorúbb,
--     lelkészi láb NÉLKÜLI feltétel érvényes.
--
-- ⚠️ ELTÉRÉS A FELADAT SZÓ SZERINTI SZÖVEGÉTŐL, TUDATOSAN: a feladat azt kérte,
--    hogy a `jovahagyta <> admin_user_id` FELTÉTLENÜL kötelező legyen. Ez
--    ELTÖRNÉ a ma működő `enterCongregation` god-mode / „nincs jóváhagyó"
--    ágát (admin/actions.ts:468-489), amely SZÁNDÉKOSAN ön-megbízást ír.
--    Helyette: ön-megbízásnál a jóváhagyói kör RENDSZERGAZDÁRA / HATÓKÖRI
--    ADMINRA szűkül, és a lejárat 2 órára korlátozódik.

CREATE OR REPLACE FUNCTION public.delegalt_hozzaferes_ervenyes(cel_gyulekezet uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $deleg$
  -- v2026-08-25-b1b2
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_access_requests ar
    WHERE ar.admin_user_id   = auth.uid()
      AND ar.congregation_id = cel_gyulekezet
      AND ar.status          = 'approved'
      AND ar.expires_at IS NOT NULL
      AND ar.expires_at > now()
      AND ar.jovahagyta IS NOT NULL
      AND public.aar_jogosult_jovahagyo(
            ar.jovahagyta,
            ar.congregation_id,
            (ar.jovahagyta = ar.admin_user_id)   -- ön-megbízás → szigorúbb kör
          )
  );
$deleg$;

COMMENT ON FUNCTION public.delegalt_hozzaferes_ervenyes(uuid) IS
  '2026-08-25 (B2): a delegált rendszergazdai hozzáférés EGYETLEN hiteles kapuja. A SECURITY DEFINER RPC-k ne közvetlenül az admin_access_requests-et kérdezzék — az a hívó szerepével ÍRHATÓ tábla —, hanem ezt. A puszta status=''approved'' + expires_at > now() feltételen felül megköveteli, hogy legyen bélyegzett jóváhagyó (jovahagyta), és hogy a jóváhagyó MA IS jogosult legyen rá (aar_jogosult_jovahagyo). Ön-megbízásnál (jovahagyta = admin_user_id, god mode / nincs jóváhagyásra alkalmas felhasználó) a szigorúbb, lelkészi láb nélküli kör érvényes.';

-- ⛔ GRANT NÉLKÜL A POLICY NEM TAGAD, HANEM 42501-gyel LEÁLL. Kötelező.
REVOKE ALL ON FUNCTION public.aar_jogosult_jovahagyo(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegalt_hozzaferes_ervenyes(uuid)          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.aar_jogosult_jovahagyo(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aar_jogosult_jovahagyo(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.delegalt_hozzaferes_ervenyes(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.delegalt_hozzaferes_ervenyes(uuid)          TO service_role;

-- Az 1/F policy-k a `current_user_has_global_access()`-t is hívják. Ma már meg
-- van adva a jog (2026-04-12-phase-0-rls-hardening.sql), de idempotensen
-- MEGISMÉTELJÜK: ha ez a GRANT hiányozna, a policy nem tagadna, hanem
-- 42501-gyel LEÁLLNA — és a hozzáférés-kezelés egésze elhalna.
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access() TO service_role;


-- ── 1/E · A VÉDŐ TRIGGER ──────────────────────────────────────────────────
--
-- MIÉRT TRIGGER ÉS NEM CSAK POLICY:
--   · a `now()` nem IMMUTABLE → a lejárat-plafon CHECK constraintben nem fér el;
--   · a `jovahagyta` mezőt VALAKINEK ki kell töltenie a szerveroldalon, hogy a
--     kliens ne hazudhassa;
--   · és — ez a legfontosabb — a trigger a hat SECURITY DEFINER függvény
--     VÁLTOZATLAN feltételét is megszilárdítja: ha `status='approved'` sor
--     jogosult jóváhagyó nélkül LÉTRE SEM JÖHET, akkor a naiv
--     `EXISTS(… status='approved' AND expires_at > now())` kapu is szilárd.
--
-- SECURITY INVOKER (alapértelmezés): így a `current_user` az IGAZI írót mutatja.
-- A `public.aar_jogosult_jovahagyo()` SECURITY DEFINER, tehát a trigger nem
-- szorul közvetlen olvasási jogra a profiles/profile_roles táblákon.

CREATE OR REPLACE FUNCTION public.admin_access_requests_vedelem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $aar_trg$
DECLARE
  -- ⚠️ Az `auth.uid()` hívása SZÁNDÉKOSAN a rendszer-ág UTÁN történik: így a
  --    szerveroldali írás (visszaállítás, migráció) akkor sem akadhat el, ha
  --    az `auth` séma jogai valaha szűkülnének.
  v_hivo       uuid;
  v_onmegbizas boolean;
BEGIN
  -- A fenyegetési modell a BÖNGÉSZŐBŐL érkező, `authenticated` (vagy `anon`)
  -- szerepű PostgREST-írás. A szerveroldali utak — migráció (postgres), napi
  -- mentés visszaállítása (service_role, apps/web/lib/restore/audit.ts:25),
  -- cron — nem ide tartoznak, és a triggerük megállítása néma adatvesztést
  -- okozna a visszaállításban.
  --
  -- ⚠️ EGY DOLGOT a rendszer-írásnál IS elvégzünk: egy RÉGI (a `jovahagyta`
  --    oszlop előtti) mentés visszaállítása jóváhagyó nélküli `approved`
  --    sorokat hozna vissza — azok elbuknának az aar_approved_kell_jovahagyo
  --    CHECK-en, és a VISSZAÁLLÍTÁS EGÉSZE elhasalna. Ezért az ilyen sort nem
  --    eldobjuk, hanem LEJÁRTTÁ minősítjük: az előzmény megmarad, élő
  --    hozzáférést viszont nem támaszt fel.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF NEW.status = 'approved' AND (NEW.jovahagyta IS NULL OR NEW.expires_at IS NULL) THEN
      NEW.status     := 'expired';
      NEW.expires_at := COALESCE(NEW.expires_at, now());
    END IF;
    RETURN NEW;
  END IF;

  v_hivo := auth.uid();

  IF v_hivo IS NULL THEN
    RAISE EXCEPTION 'Hozzáférési kérelmet csak bejelentkezett felhasználó írhat.'
      USING ERRCODE = '42501';
  END IF;

  -- (1) A `jovahagyta` SOHA nem a kliens payloadjából jön.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      NEW.jovahagyta := v_hivo;
    ELSE
      NEW.jovahagyta := NULL;
    END IF;
  ELSE
    -- (2) A kedvezményezett és a cél gyülekezet utólag NEM írható át — enélkül
    --     egy meglévő, saját `pending` sort át lehetne irányítani másra.
    IF NEW.admin_user_id   IS DISTINCT FROM OLD.admin_user_id
    OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id THEN
      RAISE EXCEPTION 'A kérelem kedvezményezettje és cél gyülekezete nem módosítható.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
      NEW.jovahagyta := v_hivo;        -- most válik jóváhagyottá
    ELSE
      NEW.jovahagyta := OLD.jovahagyta; -- egyébként érintetlen
    END IF;
  END IF;

  -- Ami nem jóváhagyott (pending / denied / expired), azt nem korlátozzuk:
  -- a saját kérelem visszavonása és a lejárttá tétel legitim művelet.
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  v_onmegbizas := (NEW.jovahagyta = NEW.admin_user_id);

  -- (3) A jóváhagyónak TÉNYLEG jogosultnak kell lennie rá.
  IF NOT public.aar_jogosult_jovahagyo(NEW.jovahagyta, NEW.congregation_id, v_onmegbizas) THEN
    RAISE EXCEPTION
      'Nincs jogosultsága a(z) % gyülekezethez tartozó rendszergazdai hozzáférés jóváhagyására.',
      NEW.congregation_id
      USING ERRCODE = '42501';
  END IF;

  -- (4) A lejárat kötelező és korlátos.
  IF NEW.expires_at IS NULL THEN
    RAISE EXCEPTION 'Jóváhagyott hozzáférésnek kötelező lejárata van.'
      USING ERRCODE = '23514';
  END IF;

  IF v_onmegbizas AND NEW.expires_at > now() + interval '2 hours 5 minutes' THEN
    RAISE EXCEPTION 'Ön-megbízású (god mode) hozzáférés legfeljebb 2 óráig élhet.'
      USING ERRCODE = '23514';
  END IF;

  IF (NOT v_onmegbizas) AND NEW.expires_at > now() + interval '24 hours 5 minutes' THEN
    RAISE EXCEPTION 'Jóváhagyott hozzáférés legfeljebb 24 óráig élhet.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$aar_trg$;

COMMENT ON FUNCTION public.admin_access_requests_vedelem() IS
  '2026-08-25 (B1): az admin_access_requests írás-védelme. A `jovahagyta` mezőt a SZERVER bélyegzi auth.uid()-ból (a kliens payloadja SOHA nem érvényesül), a kedvezményezett és a cél gyülekezet utólag nem írható át, és `status=''approved''`-dá csak jogosult jóváhagyóval (aar_jogosult_jovahagyo) lehet válni — ön-megbízásnál 2, jóváhagyói úton 24 órás lejárat-plafonnal. A `now()` nem IMMUTABLE, ezért a plafon CHECK constraintben nem élhetne. A szerveroldali szerepek (postgres, service_role) átmennek: a napi mentés visszaállítása ír ebbe a táblába.';

REVOKE ALL ON FUNCTION public.admin_access_requests_vedelem() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_admin_access_requests_vedelem ON public.admin_access_requests;
CREATE TRIGGER trg_admin_access_requests_vedelem
  BEFORE INSERT OR UPDATE ON public.admin_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.admin_access_requests_vedelem();


-- ── 1/F · AZ ÖT RÉGI POLICY HELYETT HÁROM TISZTA ──────────────────────────
--
-- ⚠️ NÉV SZERINT dobjuk el őket (policyname), nem kifejezés-illesztéssel.
-- Az öt név az ÉLŐ adatbázis felméréséből származik.

ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aar_access                  ON public.admin_access_requests;
DROP POLICY IF EXISTS aar_user_access             ON public.admin_access_requests;
DROP POLICY IF EXISTS admin_manage_own_requests   ON public.admin_access_requests;
DROP POLICY IF EXISTS pastor_read_own_requests    ON public.admin_access_requests;
DROP POLICY IF EXISTS pastor_update_own_requests  ON public.admin_access_requests;
-- idempotencia: a sajátjainkat is
DROP POLICY IF EXISTS aar_olvasas    ON public.admin_access_requests;
DROP POLICY IF EXISTS aar_letrehozas ON public.admin_access_requests;
DROP POLICY IF EXISTS aar_modositas  ON public.admin_access_requests;

-- (a) OLVASÁS — BETŰRE a mai öt policy egyesített olvasási feltétele.
--     SZÁNDÉKOSAN sem nem tágabb, sem nem szűkebb: a kedvezményezett és a
--     megszólított lelkész lássa a saját ügyét, a rendszergazda mindet.
--     (Az `effective-access.ts:284` és a `notifications/actions.ts:36` ezen megy.)
CREATE POLICY aar_olvasas ON public.admin_access_requests
  FOR SELECT TO authenticated
  USING (
    admin_user_id  = auth.uid()
    OR pastor_user_id = auth.uid()
    OR public.current_user_has_global_access()
  );

-- (b) LÉTREHOZÁS — csak MAGADNAK, és alapesetben CSAK `pending`.
--     Az egyetlen kivétel a mai, legitim ön-megbízás (god mode / nincs
--     jóváhagyásra alkalmas felhasználó): ahhoz rendszergazdai vagy hatóköri
--     admin jog kell a CÉL gyülekezetre. Egy egyszerű lelkész innentől
--     kizárólag `pending` sort tud létrehozni — ez a B1 lyuk lezárása.
CREATE POLICY aar_letrehozas ON public.admin_access_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_user_id = auth.uid()
    AND (
      status = 'pending'
      OR (
        status = 'approved'
        AND public.aar_jogosult_jovahagyo(auth.uid(), congregation_id, true)
      )
    )
  );

-- (c) MÓDOSÍTÁS — a USING BETŰRE a mai olvasási feltétel (nem szűkítünk
--     hozzáférést), a WITH CHECK viszont szigorú:
--       · a kedvezményezett a SAJÁT sorát csak pending / denied / expired
--         állapotba viheti (ez a „kilépés az override-ból" és a visszavonás),
--       · jóváhagyni (`approved`) csak az tud, aki a cél gyülekezethez
--         jogosult jóváhagyó — a kedvezményezett önmagát ezen az úton NEM.
CREATE POLICY aar_modositas ON public.admin_access_requests
  FOR UPDATE TO authenticated
  USING (
    admin_user_id  = auth.uid()
    OR pastor_user_id = auth.uid()
    OR public.current_user_has_global_access()
  )
  WITH CHECK (
    (admin_user_id = auth.uid() AND status IN ('pending', 'denied', 'expired'))
    OR public.aar_jogosult_jovahagyo(auth.uid(), congregation_id, false)
  );

-- DELETE: sem policy, sem jog. Az app SEHOL nem töröl ebből a táblából; a
-- hozzáférési előzmény auditnyom.
REVOKE ALL    ON TABLE public.admin_access_requests FROM anon;
REVOKE DELETE ON TABLE public.admin_access_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_access_requests TO authenticated;


-- ── 1/G · `_can_manage_family_links` ÁTKÖTÉSE A B2 KAPURA ─────────────────
--
-- ⚠️ FAIL-CLOSED ASSZERT: a `CREATE OR REPLACE` a TELJES törzset felülírja.
-- Ha az ÉLŐ törzs eltér attól, amit a repóból ismerünk, ISMERETLEN kódot
-- írnánk felül — inkább MEGÁLLUNK. (A 0. szakasz 17. sora előre megmondja,
-- a 18. sor pedig kiírja a teljes élő törzset.)
-- Ha itt megáll: kommenteld ki EZT az egész 1/G alszakaszt és futtasd újra —
-- a B1 javítás és az 1/E trigger enélkül is teljes értékű.

DO $ecfl_assert$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_can_manage_family_links'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION '[1/G] A _can_manage_family_links függvény NEM LÉTEZIK élesben. Kommenteld ki az 1/G alszakaszt.';
  END IF;

  IF v_def LIKE '%delegalt_hozzaferes_ervenyes%' THEN
    RAISE NOTICE '[1/G] _can_manage_family_links MÁR a segédfüggvényt hívja (ismételt futtatás) — az alábbi CREATE OR REPLACE ugyanazt írja vissza.';
    RETURN;
  END IF;

  IF v_def NOT LIKE '%admin_access_requests%'
  OR v_def NOT LIKE '%scope = ''system''%'
  OR v_def NOT LIKE '%approval_status = ''approved''%' THEN
    RAISE EXCEPTION
      '[1/G] ⛔ A _can_manage_family_links ÉLŐ törzse ELTÉR a repótól — NEM írunk felül ismeretlen kódot. Mentsd el a 0. szakasz 18. sorát, majd kommenteld ki az 1/G alszakaszt.';
  END IF;
END
$ecfl_assert$;

-- A törzs BETŰHŰEN a 2026-04-26-family-link-inference-rpc.sql:95-134 alakja
-- (+ a 2026-05-17-security-definer-search-path-pin.sql által rárakott
-- `search_path = public, pg_temp`), EGYETLEN érdemi változtatással: a delegált
-- ág mostantól a `delegalt_hozzaferes_ervenyes()` kapun megy.
-- A rendszergazda-lábat SZÁNDÉKOSAN NEM cseréljük `current_user_has_global_access()`-re:
-- az TÁGABB lenne (a profiles.role='admin' skalárt is beengedné) — jogbővítés,
-- nem javítás.
CREATE OR REPLACE FUNCTION public._can_manage_family_links(target_congregation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $can_manage_family_links$
DECLARE
    caller        uuid := auth.uid();
    is_master     boolean := false;
    has_delegated boolean := false;
BEGIN
    IF caller IS NULL THEN
        RETURN false;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = caller
          AND role = 'admin'
          AND scope = 'system'
          AND active = true
          AND approval_status = 'approved'
    ) INTO is_master;

    IF is_master THEN
        RETURN true;
    END IF;

    -- 2026-08-25 (B2): a régi, naiv feltétel helyett
    --   EXISTS(… admin_access_requests … status='approved' AND expires_at > now())
    -- a hiteles kapu. Az a tábla a hívó szerepével ÍRHATÓ volt, tehát önmagában
    -- nem lehetett bizonyíték.
    has_delegated := public.delegalt_hozzaferes_ervenyes(target_congregation_id);

    RETURN has_delegated;
END;
$can_manage_family_links$;

COMMENT ON FUNCTION public._can_manage_family_links(uuid) IS
  'Belső jog-check a családi kapcsolat-következtető RPC-khez. 2026-08-25 (B2): a delegált ág már NEM közvetlenül az admin_access_requests-et kérdezi (azt a hívó szerepe írhatta), hanem a public.delegalt_hozzaferes_ervenyes() kaput. A rendszergazda-láb VÁLTOZATLAN (profile_roles system-hatókörű admin) — szándékosan nem current_user_has_global_access(), mert az tágabb lenne.';


-- ── 1/H · ÖNTESZT — NEGATÍV ÉS POZITÍV ASSZERT ────────────────────────────
--
-- „Az őrszem negatív asszert nélkül vak": itt a tranzakción belül ELJÁTSSZUK a
-- régi hibás viselkedést, és bizonyítjuk, hogy MOST elbukik — illetve hogy a
-- működő út továbbra is átmegy. Mindkét próba visszagörgetett al-tranzakcióban
-- fut: sor nem marad utána.
--
-- Ha BÁRMELYIK bukik, ez a DO blokk EXCEPTION-t dob → az EGÉSZ 1. szakasz
-- visszagörög, és semmi nem változik. Fail-closed.

DO $onteszt$
DECLARE
  v_lelkesz       uuid;
  v_idegen_cong   uuid;
  v_admin         uuid;
  v_barmely_cong  uuid;
  v_szemelyesites boolean := false;
  v_beszurt       boolean;
  v_hiba          text;
BEGIN
  -- (0) Működik-e egyáltalán a szerep-személyesítés ebben a munkamenetben?
  --     Ha nem (más GUC-név, más auth.uid() implementáció), a próbákat
  --     KIHAGYJUK — hamis riasztással nem állítunk meg egy jó migrációt.
  SELECT p.id INTO v_admin
    FROM public.profiles p
   WHERE p.status = 'active'
     AND (p.role = 'admin'
          OR EXISTS (SELECT 1 FROM public.profile_roles pr
                      WHERE pr.profile_id = p.id AND pr.role = 'admin' AND pr.scope = 'system'
                        AND pr.active = true AND pr.approval_status = 'approved'))
   ORDER BY p.created_at NULLS LAST
   LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION
      '[ÖNTESZT] ⛔ NINCS EGYETLEN AKTÍV RENDSZERGAZDA SEM (sem profiles.role=''admin'', sem system-hatókörű profile_roles admin sor). A migráció után SENKI nem tudna belépni gyülekezetbe. Előbb rendezd (0. szakasz 14. sora), aztán futtasd újra.';
  END IF;

  -- ⚠️ A próbához KÉT dolog kell: (a) az `auth.uid()` vegye át a beállított
  --    JWT-igényt, és (b) a munkamenet TUDJON `authenticated` szerepbe váltani.
  --    Ha bármelyik nem megy (a Supabase `postgres` szerepe nem mindenhol tagja
  --    az `authenticated`-nek), a próbákat KIHAGYJUK — egy jó migrációt nem
  --    állítunk meg hamis riasztással.
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_szemelyesites := (auth.uid() = v_admin AND current_user = 'authenticated');
    RAISE EXCEPTION 'ONTESZT_VISSZAGORGETES';   -- szándékos: a próba visszagörgetése
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'ONTESZT_VISSZAGORGETES' THEN
        v_szemelyesites := false;
        v_hiba          := SQLSTATE || ' — ' || SQLERRM;
      END IF;
  END;

  EXECUTE 'RESET ROLE';

  IF NOT v_szemelyesites THEN
    RAISE NOTICE '[ÖNTESZT] KIHAGYVA: ebben a munkamenetben nem lehet `authenticated` szerepet/JWT-t személyesíteni (%). A javítás ettől még érvényes — az ellenőrzést a 2. szakasz szerkezeti sorai adják.', COALESCE(v_hiba, 'auth.uid() nem vette át az értéket');
    RETURN;
  END IF;

  -- ── POZITÍV ASSZERT: a MŰKÖDŐ út ne törjön el ────────────────────────────
  --    Rendszergazdai ön-megbízás 2 órára — pontosan az, amit az
  --    enterCongregation csinál (admin/actions.ts:478-489).
  SELECT c.id INTO v_barmely_cong FROM public.congregations c LIMIT 1;

  IF v_barmely_cong IS NULL THEN
    RAISE NOTICE '[ÖNTESZT] Pozitív próba kihagyva: nincs egyetlen gyülekezet sem.';
  ELSE
    v_beszurt := false;
    v_hiba    := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      INSERT INTO public.admin_access_requests
        (admin_user_id, congregation_id, pastor_user_id, reason, status, approved_at, expires_at)
      VALUES (v_admin, v_barmely_cong, NULL, '[ÖNTESZT] pozitív asszert', 'approved',
              now(), now() + interval '2 hours');

      v_beszurt := true;
      RAISE EXCEPTION 'ONTESZT_VISSZAGORGETES';   -- szándékos: al-tranzakció eldobása
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM <> 'ONTESZT_VISSZAGORGETES' THEN
          v_beszurt := false;
          v_hiba    := SQLSTATE || ' — ' || SQLERRM;
        END IF;
    END;

    EXECUTE 'RESET ROLE';

    IF NOT v_beszurt THEN
      RAISE EXCEPTION
        '[ÖNTESZT] ⛔ ELTÖRTÜK A MŰKÖDŐ UTAT: a rendszergazdai ön-megbízás (Belépés a gyülekezetbe) ELBUKOTT. Hiba: %. A migráció visszagörgetve.', COALESCE(v_hiba, '(ismeretlen)');
    END IF;
    RAISE NOTICE '[ÖNTESZT] ✅ POZITÍV: a rendszergazdai ön-megbízás továbbra is átmegy.';
  END IF;

  -- ── NEGATÍV ASSZERT: a RÉGI hibás viselkedés eljátszása ──────────────────
  --    Egy AKTÍV, nem-rendszergazda lelkész `status='approved'` sort szúr be
  --    egy IDEGEN gyülekezetre. A javítás ELŐTT ez SIKERÜLT volna.
  SELECT p.id, c.id
    INTO v_lelkesz, v_idegen_cong
    FROM public.profiles p
    CROSS JOIN LATERAL (
      SELECT c2.id
        FROM public.congregations c2
       WHERE c2.id IS DISTINCT FROM p.congregation_id
         AND (p.diocese_id  IS NULL OR c2.diocese_id IS DISTINCT FROM p.diocese_id)
       LIMIT 1
    ) c
   WHERE p.status = 'active'
     AND p.role   = 'lelkesz'
     AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                      WHERE pr.profile_id = p.id
                        AND pr.active = true AND pr.approval_status = 'approved'
                        AND (pr.scope IN ('system', 'diocese', 'district')))
   LIMIT 1;

  IF v_lelkesz IS NULL OR v_idegen_cong IS NULL THEN
    RAISE NOTICE '[ÖNTESZT] Negatív próba kihagyva: nincs alkalmas (aktív, hatókör nélküli) teszt-lelkész + idegen gyülekezet pár.';
    RETURN;
  END IF;

  v_beszurt := false;
  v_hiba    := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_lelkesz::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_lelkesz::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    INSERT INTO public.admin_access_requests
      (admin_user_id, congregation_id, pastor_user_id, reason, status, approved_at, expires_at)
    VALUES (v_lelkesz, v_idegen_cong, NULL, '[ÖNTESZT] negatív asszert', 'approved',
            now(), now() + interval '2 hours');

    v_beszurt := true;    -- ⛔ ha ide eljutunk, a lyuk NYITVA maradt
    RAISE EXCEPTION 'ONTESZT_VISSZAGORGETES';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'ONTESZT_VISSZAGORGETES' THEN
        v_hiba := SQLSTATE || ' — ' || SQLERRM;
      END IF;
  END;

  EXECUTE 'RESET ROLE';

  IF v_beszurt THEN
    RAISE EXCEPTION
      '[ÖNTESZT] ⛔⛔ A LYUK NYITVA MARADT: egy egyszerű lelkész MÉG MINDIG be tudott szúrni magának jóváhagyott hozzáférést idegen gyülekezetre. A migráció visszagörgetve — a policy-k/trigger nem fognak.';
  END IF;

  RAISE NOTICE '[ÖNTESZT] ✅ NEGATÍV: az idegen gyülekezetre szóló ön-jóváhagyás elbukott (%).', COALESCE(v_hiba, 'RLS');
END
$onteszt$;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                                  ║
-- ║ EGYETLEN SELECT (a Supabase editor CSAK AZ UTOLSÓ eredményt mutatja).    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT * FROM (

SELECT  1 AS sorrend, 'A RÉGI öt policy eltűnt?'::text AS mit,
        CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                               WHERE schemaname='public' AND tablename='admin_access_requests'
                                 AND policyname IN ('aar_access','aar_user_access','admin_manage_own_requests',
                                                    'pastor_read_own_requests','pastor_update_own_requests'))
             THEN '✅ igen' ELSE '⛔ MARADT BELŐLÜK' END AS ertek,
        '✅ igen kell'::text AS teendo
UNION ALL
SELECT  2, 'Az ÚJ három policy megvan?',
        COALESCE((SELECT string_agg(policyname || ' [' || cmd || ']', ', ' ORDER BY policyname)
                    FROM pg_policies WHERE schemaname='public' AND tablename='admin_access_requests'), '⛔ EGY SEM'),
        'aar_letrehozas [INSERT], aar_modositas [UPDATE], aar_olvasas [SELECT]'
UNION ALL
SELECT  3, '⛔ Van-e MÉG olyan ÍRÓ policy, aminek nincs WITH CHECK-je?',
        (SELECT count(*)::text FROM pg_policies
          WHERE schemaname='public' AND tablename='admin_access_requests'
            AND cmd IN ('ALL','INSERT','UPDATE') AND with_check IS NULL),
        '0 kell legyen — EZ A B1 LÉNYEGE'
UNION ALL
SELECT  4, 'aar_letrehozas WITH CHECK kifejezése',
        COALESCE((SELECT with_check FROM pg_policies
                   WHERE schemaname='public' AND tablename='admin_access_requests'
                     AND policyname='aar_letrehozas'), '⛔ NINCS'),
        'tartalmaznia kell: status = ''pending'' … aar_jogosult_jovahagyo(…, true)'
UNION ALL
SELECT  5, 'aar_modositas WITH CHECK kifejezése',
        COALESCE((SELECT with_check FROM pg_policies
                   WHERE schemaname='public' AND tablename='admin_access_requests'
                     AND policyname='aar_modositas'), '⛔ NINCS'),
        'tartalmaznia kell: aar_jogosult_jovahagyo(…, false)'
UNION ALL
SELECT  6, '`jovahagyta` oszlop létezik?',
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='admin_access_requests'
                             AND column_name='jovahagyta') THEN '✅ igen' ELSE '⛔ NEM' END,
        '✅ igen kell'
UNION ALL
SELECT  7, 'A két CHECK constraint létezik?',
        COALESCE((SELECT string_agg(conname, ', ' ORDER BY conname) FROM pg_constraint
                   WHERE conrelid='public.admin_access_requests'::regclass
                     AND conname IN ('aar_approved_kell_lejarat','aar_approved_kell_jovahagyo')), '⛔ EGYIK SEM'),
        'aar_approved_kell_jovahagyo, aar_approved_kell_lejarat'
UNION ALL
SELECT  8, 'A védő trigger létezik és BE VAN KAPCSOLVA?',
        COALESCE((SELECT t.tgname || ' (tgenabled=' || t.tgenabled || ')' FROM pg_trigger t
                   WHERE t.tgrelid='public.admin_access_requests'::regclass
                     AND t.tgname='trg_admin_access_requests_vedelem' AND NOT t.tgisinternal), '⛔ NINCS'),
        'trg_admin_access_requests_vedelem (tgenabled=O)'
UNION ALL
SELECT  9, 'aar_jogosult_jovahagyo — létezik ÉS az `authenticated` HÍVHATJA?',
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                           WHERE n.nspname='public' AND p.proname='aar_jogosult_jovahagyo')
             THEN CASE WHEN has_function_privilege('authenticated',
                          'public.aar_jogosult_jovahagyo(uuid,uuid,boolean)', 'EXECUTE')
                       THEN '✅ létezik + EXECUTE megvan' ELSE '⛔ LÉTEZIK, DE NINCS EXECUTE' END
             ELSE '⛔ NEM LÉTEZIK' END,
        '⛔ GRANT nélkül a policy NEM TAGAD, hanem 42501-gyel LEÁLL'
UNION ALL
SELECT 10, 'delegalt_hozzaferes_ervenyes — létezik ÉS az `authenticated` HÍVHATJA?',
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                           WHERE n.nspname='public' AND p.proname='delegalt_hozzaferes_ervenyes')
             THEN CASE WHEN has_function_privilege('authenticated',
                          'public.delegalt_hozzaferes_ervenyes(uuid)', 'EXECUTE')
                       THEN '✅ létezik + EXECUTE megvan' ELSE '⛔ LÉTEZIK, DE NINCS EXECUTE' END
             ELSE '⛔ NEM LÉTEZIK' END,
        '✅ létezik + EXECUTE megvan'
UNION ALL
SELECT 11, 'A két új függvény search_path-ja rögzítve?',
        COALESCE((SELECT string_agg(p.proname || ' → ' || COALESCE(array_to_string(p.proconfig, ' | '), '⛔ NINCS'),
                                    E'\n' ORDER BY p.proname)
                    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public'
                     AND p.proname IN ('aar_jogosult_jovahagyo','delegalt_hozzaferes_ervenyes',
                                       'admin_access_requests_vedelem')), '⛔ EGY SEM'),
        'mindegyiknél: search_path=public, pg_temp'
UNION ALL
SELECT 12, '⛔ Van ''approved'' sor jóváhagyó nélkül?',
        (SELECT count(*)::text FROM public.admin_access_requests
          WHERE status='approved' AND jovahagyta IS NULL),
        '0 kell legyen (a CHECK amúgy sem engedné)'
UNION ALL
SELECT 13, 'Élő (approved + még nem járt le) hozzáférések MOST',
        (SELECT count(*)::text FROM public.admin_access_requests
          WHERE status='approved' AND expires_at IS NOT NULL AND expires_at > now()),
        'közvetlenül a migráció után 0 — az 1/B mindet lejárttá tette'
UNION ALL
SELECT 14, '_can_manage_family_links a B2 kapun megy?',
        COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%delegalt_hozzaferes_ervenyes%'
                              THEN '✅ igen' ELSE '⚠️ NEM (az 1/G kimaradt)' END
                    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='_can_manage_family_links' LIMIT 1), '(nincs ilyen függvény)'),
        'ha ⚠️: a védelmet az 1/E trigger így is adja, de a maradék 5 függvénnyel együtt kösd át'
UNION ALL
SELECT 15, 'A MARADÉK ÖT függvény — még a nyers táblát kérdezi (KÜLÖN KÖR)',
        COALESCE((SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
                    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public'
                     AND p.proname IN ('generate_egyhazi_anyakonyvi_szam','import_families_from_existing_persons_batch',
                                       'import_family_head_batch','import_registry_batch','wipe_congregation_data')
                     AND pg_get_functiondef(p.oid) LIKE '%admin_access_requests%'
                     AND pg_get_functiondef(p.oid) NOT LIKE '%delegalt_hozzaferes_ervenyes%'), '✅ egy sem'),
        'TUDATOSAN kimaradtak (200-900 soros törzs) — az 1/E trigger MOST is védi őket'
UNION ALL
SELECT 16, '`anon` jogai a táblán (nem lehet)',
        COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
                    FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='admin_access_requests' AND grantee='anon'), '✅ egy sem'),
        '✅ egy sem'
UNION ALL
SELECT 17, '`authenticated` jogai a táblán',
        COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
                    FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='admin_access_requests' AND grantee='authenticated'), '⛔ egy sem'),
        'INSERT, SELECT, UPDATE — DELETE NE legyen benne'
UNION ALL
SELECT 18, 'RLS engedélyezve?',
        (SELECT relrowsecurity::text FROM pg_class WHERE oid='public.admin_access_requests'::regclass),
        'true'
UNION ALL
SELECT 19, '⚠️ MAI függő kérelmek, amelyek megszólított jóváhagyója az ÚJ szabály szerint NEM jogosult',
        COALESCE((SELECT string_agg(ar.id::text || ' → jóváhagyó: ' || COALESCE(pr.email, ar.pastor_user_id::text),
                                    E'\n' ORDER BY ar.id)
                    FROM public.admin_access_requests ar
                    LEFT JOIN public.profiles pr ON pr.id = ar.pastor_user_id
                   WHERE ar.status = 'pending'
                     AND ar.pastor_user_id IS NOT NULL
                     AND NOT public.aar_jogosult_jovahagyo(ar.pastor_user_id, ar.congregation_id, false)),
                 '✅ egy sem'),
        'ha nem üres: azok a kérelmek elakadnának. Ok: a megszólított nem a gyülekezet lelkésze, vagy a megye/kerület-kötése hiányos. Rendezd a profilját, vagy hagyd, hogy a kérelmező újat indítson.'
UNION ALL
SELECT 20, 'ÖNTESZT-maradvány: nem ragadt bent teszt-sor?',
        (SELECT count(*)::text FROM public.admin_access_requests WHERE reason LIKE '[ÖNTESZT]%'),
        '0 kell legyen (mindkét próba visszagörgetett al-tranzakcióban futott)'

) AS t
ORDER BY sorrend;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ AMI EZUTÁN IS NYITVA MARAD — A KÖVETKEZŐ KÖR FELADATA                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Az alábbi ÖT SECURITY DEFINER függvény törzsében VÁLTOZATLANUL a nyers
--   EXISTS(… admin_access_requests … status='approved' AND expires_at > now())
-- feltétel áll. Az 1/E trigger miatt ez MA már szilárd (ilyen sor jogosult
-- jóváhagyó nélkül létre sem jöhet), de a mélységi védelemhez mindegyiknek a
-- `public.delegalt_hozzaferes_ervenyes(cél)` kapun kellene mennie. A törzsük
-- 200-900 sor, a `CREATE OR REPLACE` teljes újragépelést követel, ezért KÜLÖN,
-- célzott kör kell hozzá — függvényenként egy fájl, mindegyikhez a 0. szakaszban
-- kiírt ÉLŐ törzsből dolgozva (a repó bizonyítottan széthúzhat a produkcióval):
--
--   1. generate_egyhazi_anyakonyvi_szam(uuid, text, integer)
--      utolsó ismert törzs: migration-docs/sql/2026-08-11-security-definer-hardening.sql:510-601
--   2. import_registry_batch(uuid, text, jsonb, boolean)
--      utolsó ismert törzs: migration-docs/sql/2026-08-11-import-registry-batch-orzet.sql:~300-627
--   3. import_family_head_batch(...)
--      utolsó ismert törzs: migration-docs/sql/2026-07-18-pr3-csalad-import-haztartas-sync.sql
--   4. import_families_from_existing_persons_batch(...)
--      utolsó ismert törzs: migration-docs/sql/2026-07-18-pr3-csalad-import-haztartas-sync.sql
--   5. wipe_congregation_data(...)   ⚠️ ADATTÖRLŐ — ezt utoljára, külön figyelemmel
--      utolsó ismert törzs: migration-docs/sql/2026-07-17-member-portal-legacy-workflow-compat.sql
--
-- A csere mindegyikben UGYANAZ az egy blokk:
--     -- RÉGI
--     SELECT EXISTS (SELECT 1 FROM public.admin_access_requests
--                     WHERE admin_user_id = <hívó> AND congregation_id = <cél>
--                       AND status = 'approved' AND expires_at > now()) INTO v_has_delegated;
--     -- ÚJ
--     v_has_delegated := public.delegalt_hozzaferes_ervenyes(<cél>);
--   ⚠️ Figyelem: a `delegalt_hozzaferes_ervenyes()` mindig `auth.uid()`-ra
--      dolgozik. Ahol a függvény NEM `auth.uid()`-ot használ hívóként (pl. a
--      `session_user`-alapú Studio-bypass javítás után), ott előbb ellenőrizd,
--      hogy a két hívó-fogalom egybeesik-e.
