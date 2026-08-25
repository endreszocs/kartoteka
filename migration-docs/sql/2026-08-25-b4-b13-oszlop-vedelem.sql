-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ OSZLOP-SZINTŰ ÍRÁSVÉDELEM — B4 + B13                          2026-08-25 ║
-- ║ Fájl: migration-docs/sql/2026-08-25-b4-b13-oszlop-vedelem.sql            ║
-- ║ Biztonsági javító kör — MEGERŐSÍTETT (⛔) találatok                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ MI A BAJ — EMBERI NYELVEN                                                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- B4 — A VÉGLEGESÍTÉS-ZÁSZLÓ KÖZVETLENÜL VISSZABILLENTHETŐ.
--   Amikor a lelkész „Véglegesít"-et nyom a számadáson, a költségvetésen, a
--   vagyonleltári jelentésen vagy a választók névjegyzékén, a program egy
--   igaz/hamis kapcsolót billent át a `bealitas` év-során (pl.
--   `accounting_finalized`). Ez a kapcsoló a HIVATALOS IRAT LEZÁRÁSA: utána a
--   tételek nem szerkeszthetők, és a jelentés felmegy az egyházmegyének.
--   A felnyitáshoz kérelmet kell benyújtani, amit az esperes bírál el.
--   CSAKHOGY: ez a kapcsoló ma a böngésző konzoljából EGYETLEN sorral
--   visszabillenthető (a bejelentkezett felhasználó jogaival, az adatbázis
--   közvetlen elérésén keresztül), tehát a lezárt év magától is kinyílik —
--   esperesi jóváhagyás nélkül. Aki ezt megteszi, utólag át tudja írni a már
--   beküldött számadás mögötti könyvelést.
--
-- B13 — A SZEREPKÖR-TÁBLA (`profile_roles`) OSZLOP-KORLÁT NÉLKÜL ÍRHATÓ.
--   Ebben a táblában áll, hogy ki MI (lelkész, könyvelő, esperes, kerületi
--   admin, rendszergazda) és MELYIK hatókörben (gyülekezet / egyházmegye /
--   egyházkerület / rendszer). A bejelentkezett szerep ma MINDEN oszlopára
--   kapott írási jogot — beleértve a `role`-t (mi vagyok), a `scope`/`scope_id`-t
--   (hol vagyok az) és a `permissions`-t (mit szabad). A sor-szintű védelem (RLS)
--   ezen felül még mindig engedi a gyülekezeti lelkésznek, hogy a SAJÁT
--   gyülekezetéhez tartozó szerepkör-sorokat MÓDOSÍTSA (a régi
--   `profile_roles_pastor_approve` policy „jóváhagyó" célra készült, de nem
--   oszlopokra, hanem az EGÉSZ sorra ad UPDATE-et). Vagyis egy lelkész át tudja
--   írni egy gyülekezeti sor `role`-ját, `permissions`-ét, sőt a `profile_id`-t
--   is — ez jogosultság-emelés.
--
-- MI TÖRTÉNHET, HA NEM JAVÍTJUK:
--   · B4: egy lezárt, felküldött számadás/költségvetés némán újranyílik, és a
--     mögötte lévő könyvelés utólag átírható — a felettes szint pedig egy MÁSIK
--     változatot lát, mint ami a gyülekezetnél van.
--   · B13: egy gyülekezeti felhasználó a saját gyülekezetében szerepkört tud
--     emelni vagy átcímezni; a `permissions` JSONB szabad átírásával olyan
--     modulokat nyithat meg, amiket az admin nem adott meg.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ⚠️ PONTOSÍTÁS A FELMÉRÉSHEZ KÉPEST — AZ AUDIT-NYOM LÉTEZIK                │
-- └──────────────────────────────────────────────────────────────────────────┘
-- A felmérés azt írta, hogy „audit-nyom: NULLA". EZ NEM IGAZ, ELLENŐRIZTEM:
--   · `migration-docs/sql/2026-06-05n-row-audit.sql:49-118` — az `audit.log_change()`
--     trigger-függvény, és a hozzá tartozó `audit_trg` KÖTELEZŐEN rá van kötve a
--     `bealitas` ÉS a `profile_roles` táblára is (a 3. blokk tömbje névvel
--     felsorolja mindkettőt).
--   · A függvény AFTER INSERT/UPDATE/DELETE fut, `SECURITY DEFINER`, és a teljes
--     RÉGI + ÚJ sort JSONB-ként az `audit.record_version` táblába írja, az
--     aktorral együtt (`app.actor_id` GUC VAGY `request.jwt.claim.sub` — vagyis
--     a session-kliens írásainál automatikusan a bejelentkezett felhasználó).
--   ⇒ Mivel ez ADATBÁZIS-SZINTEN fut, a KÖZVETLEN PostgREST-írást IS naplózza:
--     az app-rétegnek nincs módja megkerülni.
--   ⇒ A találat súlya ezért KISEBB a jelentettnél: a zászló visszabillenthető,
--     de NEM ÉSZREVÉTLENÜL. Ettől még javítani kell — a napló utólagos
--     nyomozásra jó, megelőzésre nem.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ HATÁSVIZSGÁLAT — MIÉRT ÍGY JAVÍTJUK (és nem másképp)                      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- B4 — az (a) OSZLOP-SZINTŰ GRANT ÚT ELVETVE. INDOK:
--   A véglegesítést MINDEN legitim úton a BEJELENTKEZETT FELHASZNÁLÓ jogaival
--   írja az app, NEM service_role-lal:
--     · apps/web/app/(dashboard)/penzugy/actions.ts:3899   finalizeBudget →
--       budget_finalized / _at / _by
--     · apps/web/app/(dashboard)/penzugy/actions.ts:4288   finalizeAccounting →
--       accounting_finalized / _at / _by
--     · apps/web/app/(dashboard)/penzugy/actions.ts:4850   véglegesített
--       költségvetés-MÓDOSÍTÁS → budget_mod{1,2,3}_finalized
--     · apps/web/app/(dashboard)/leltar/actions.ts:701     finalizeLeltar →
--       leltar_finalized / _at / _by
--     · apps/web/app/(dashboard)/tagnyilvantartas/voter-actions.ts:356 →
--       valasztok_finalized / _at / _by
--     · apps/desktop/src/components/desktop-budget-tab.tsx:77 (updateYearlyBudgetFlags)
--       → budget_finalized, budget_mod{n}_finalized
--   Mindegyik a `apps/web/lib/supabase/server.ts:15` `createClient()`-jén megy,
--   ami az ANON kulcs + a felhasználó süti-munkamenete → `authenticated` szerep.
--   ⇒ Ha a `*_finalized` oszlopokat kivennénk a GRANT-listából, a VÉGLEGESÍTÉS
--     GOMB MINDEN SZINTEN ELTÖRNE (42501). Az (a) út tehát itt nem „szigorítás",
--     hanem funkció-vesztés — kizárólag úgy volna járható, ha MIND AZ ÖT
--     véglegesítés-utat SECURITY DEFINER RPC-be terelnénk. Az sokkal nagyobb,
--     kockázatosabb átalakítás, mint amit ez a kör elbír.
--   ⇒ MARAD A (b) VÉDŐ TRIGGER, a `profiles_jogosultsag_vedelem()` mintájára
--     (2026-08-11-globalis-hozzaferes-szukites.sql:1134-1175). Ez ráadásul
--     rugalmasabb is: egy JÖVŐBEN született `*_finalized` oszlopot automatikusan
--     véd (a törzs mintaillesztéssel keresi a zászlókat), tehát nem tud „új
--     oszlop = néma lyuk" helyzet előállni.
--
--   A TRIGGER ENGEDI (mert ezek a MA MŰKÖDŐ, LEGITIM utak):
--     1. `auth.uid() IS NULL` — migráció, SQL editor, service_role, mentés-worker.
--     2. Rendszergazda (`current_user_has_global_access()`).
--     3. A zászló BEKAPCSOLÁSA (hamis → igaz) — bárkinek, akit az RLS beenged.
--        (A véglegesítés joga továbbra is az RLS + az app kapuin múlik.)
--     4. A zászló VISSZABILLENTÉSE, ha a hívó a FELETTES SZINT
--        (`felettes_szint_szerkesztheto(congregation_id)` → esperes /
--        egyházmegyei admin a megyéjében, kerületi admin a kerületében).
--        EZ a megyei feloldás-jóváhagyás:
--        apps/web/app/(dashboard)/dashboard-egyhazmegye/actions.ts:165-200
--        (approveUnlockRequest → budget/accounting/leltar/valasztok_finalized=false).
--        Az egyházmegyei SZÁMVEVŐ szándékosan NEM fér hozzá — pontosan úgy, ahogy
--        az app is tiltja (`canWriteDioceseScope`, actions.ts:151).
--     5. KEGYELMI ABLAK a beküldés-hiba automatikus visszavonásához:
--        apps/web/app/(dashboard)/penzugy/actions.ts:4466 — ha a számadás
--        véglegesítése SIKERÜLT, de a beküldés elbukott, az app maga állítja
--        vissza az `accounting_finalized`-et. Ezt engedjük, de SZŰKEN: csak az
--        `accounting_finalized`-re, csak ha a pecsét szerint UGYANAZ a felhasználó
--        véglegesített, és csak 10 percen belül.
--
-- B13 — ITT AZ (a) ÉS A (b) EGYÜTT MEGY (mélységi védelem). INDOK:
--   Az EGÉSZ repóban PONTOSAN EGYETLEN `profile_roles` UPDATE van:
--     · apps/web/app/(dashboard)/admin/profile-roles-actions.ts:553-559
--       revokeProfileRole → approval_status, active, revoked_at, revoked_by,
--       revoked_reason
--   INSERT kettő van (ezeket NEM érintjük, az INSERT-jogot nem bántjuk):
--     · apps/web/app/(dashboard)/admin/profile-roles-actions.ts:393
--     · apps/web/app/(dashboard)/admin/access-requests-actions.ts:293
--   A `updateProfileRolePermissions` szerver-akciót a projekt 2026-08-11-én már
--   TÖRÖLTE (profile-roles-actions.ts:585 komment) — a `permissions` oszlopnak
--   ma NINCS app-oldali írója.
--   A /profile/kapcsolatok lelkészi jóváhagyás NEM ezt a táblát írja, hanem a
--   `profile_congregations`-t (profile/kapcsolatok/actions.ts:232-243) — ezért a
--   `profile_roles` oszlop-szűkítése azt SEM érinti.
--   ⇒ Az oszlop-lista tehát pontosan ismert és szűk. A tiltó oldalt mégis
--     GENERÁLTAN állítjuk elő (az élő `information_schema`-ból), nem kézzel.
--
--   AMI SECURITY DEFINER RPC-BŐL ÍR (ezeket az oszlop-GRANT NEM érinti, mert a
--   függvény TULAJDONOSI jogokkal fut; a triggert viszont át kell engedniük):
--     · public.erase_my_account()            2026-06-05h-self-erasure.sql:42
--       → a SAJÁT sorain: active=false, approval_status='revoked', revoked_at
--         ⇒ ez LEFOKOZÁS, a trigger engedi.
--     · public.admin_erase_user()            2026-06-05f-user-erasure.sql:84
--     · public.complete_congregation_transfer() 2026-06-05j-transfer-execute.sql:61-85
--       ⇒ mindkettő `is_admin()` kapuval indul (= rendszergazda), tehát a
--         trigger 2. pontján átmegy.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ AMIT EZ A FÁJL SZÁNDÉKOSAN NEM CSINÁL                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--   · NEM dobja el a `profile_roles_pastor_approve` RLS-policy-t
--     (2026-04-17-profile-roles-fazis-1.sql:189-212), pedig annak MA NINCS
--     app-oldali fogyasztója. Az oszlop-GRANT + a trigger együtt ártalmatlanná
--     teszi (a lelkész már csak a jóváhagyás-/visszavonás-mezőkhöz fér hozzá, és
--     magát nem hagyhatja jóvá). A policy eldobása KÜLÖN, mérhető kör legyen —
--     itt csak felesleges törés-kockázat volna.
--   · NEM nyúl a `bealitas` GRANT-jaihoz (lásd fent: az (a) út funkciót törne).
--   · NEM nyúl az INSERT/DELETE jogokhoz egyik táblán sem.
--   · NEM módosít app-oldali kódot — a hatásvizsgálat szerint nem kell hozzá.
--
-- IDEMPOTENS: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS +
--   REVOKE/GRANT (halmaz-művelet). Nyugodtan újrafuttatható.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor. ELŐSZÖR a 0. SZAKASZ (csak olvas),
--   és CSAK akkor tovább, ha a „teendo" oszlop nem tiltja.
-- ==========================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS      ⚠️ CSAK OLVAS, SEMMIT NEM MÓDOSÍT      ║
-- ║ EGYETLEN lekérdezés. Azt méri, fennáll-e a javítás ELŐTTI állapot.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

WITH
be_oszlop AS (
  SELECT column_name::text AS column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'bealitas'
),
be_zaszlo AS (
  SELECT column_name FROM be_oszlop WHERE column_name ~ '_finalized$'
),
be_irhato_zaszlo AS (
  SELECT column_name FROM be_zaszlo
  WHERE has_column_privilege('authenticated', 'public.bealitas', column_name, 'UPDATE')
),
pr_oszlop AS (
  SELECT column_name::text AS column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profile_roles'
),
pr_engedett AS (   -- amit a revokeProfileRole + a (jövőbeli) lelkészi jóváhagyás ír
  SELECT unnest(ARRAY[
    'approval_status','approval_reason','approved_at','approved_by',
    'active','revoked_at','revoked_by','revoked_reason'
  ]) AS column_name
),
pr_tiltando AS (   -- jogosultsági / azonosító oszlopok: kliensről SOHA
  SELECT unnest(ARRAY[
    'id','profile_id','scope','scope_id','role','permissions',
    'custom_label','granted_at','granted_by'
  ]) AS column_name
),
pr_irhato AS (
  SELECT column_name FROM pr_oszlop
  WHERE has_column_privilege('authenticated', 'public.profile_roles', column_name, 'UPDATE')
),
fv AS (
  SELECT
    to_regprocedure('public.current_user_has_global_access()')   IS NOT NULL AS van_global,
    to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NOT NULL AS van_felettes
)
SELECT * FROM (
  -- ── B4 ──────────────────────────────────────────────────────────────────
  SELECT 1 AS sorrend,
         'B4 · bealitas — véglegesítési zászlók (élő oszlopnevek)' AS mit,
         COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM be_zaszlo), '(egy sincs)') AS ertek,
         CASE WHEN (SELECT count(*) FROM be_zaszlo) = 0
              THEN '⛔ ÁLLJ: nincs egyetlen *_finalized oszlop sem — nem ez a séma. NE futtasd tovább.'
              ELSE 'ℹ️ Ezeket fogja védeni a trigger (mintaillesztéssel, tehát új zászlót is).' END AS teendo
  UNION ALL
  SELECT 2,
         'B4 · a zászlókat ma írhatja-e az `authenticated`',
         (SELECT count(*)::text FROM be_irhato_zaszlo) || ' / ' || (SELECT count(*)::text FROM be_zaszlo) || ' oszlop',
         CASE WHEN (SELECT count(*) FROM be_irhato_zaszlo) > 0
              THEN '⛔ FENNÁLL a találat: közvetlenül visszabillenthető. A javítás indokolt.'
              ELSE '✅ Már nem írható — ellenőrizd, nem törte-e el időközben a véglegesítést.' END
  UNION ALL
  SELECT 3,
         'B4 · a pecsét-oszlopok (a kegyelmi ablakhoz KELLENEK)',
         (SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM be_oszlop
           WHERE column_name IN ('accounting_finalized','accounting_finalized_at','accounting_finalized_by')),
         CASE WHEN (SELECT count(*) FROM be_oszlop
                     WHERE column_name IN ('accounting_finalized','accounting_finalized_at','accounting_finalized_by')) = 3
              THEN '✅ Megvan mind a 3.'
              ELSE '⛔ ÁLLJ: futtasd előbb a 2026-08-15-veglegesites-egyseges.sql-t.' END
  UNION ALL
  SELECT 4,
         'B4 · védő trigger a bealitas-on',
         COALESCE((SELECT string_agg(t.tgname, ', ' ORDER BY t.tgname)
                     FROM pg_trigger t
                    WHERE t.tgrelid = 'public.bealitas'::regclass AND NOT t.tgisinternal), '(nincs trigger)'),
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t
                            WHERE t.tgrelid = 'public.bealitas'::regclass
                              AND t.tgname = 'bealitas_veglegesites_vedelem_trg')
              THEN 'ℹ️ Már fut — a migráció újrafuttatása frissíti.'
              ELSE '⛔ Hiányzik a védelem. Futtasd az 1. SZAKASZT.' END
  UNION ALL
  SELECT 5,
         'B4 · audit_trg a bealitas-on (a „nulla audit-nyom" állítás cáfolata)',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t
                            WHERE t.tgrelid = 'public.bealitas'::regclass AND t.tgname = 'audit_trg')
              THEN 'VAN — audit.log_change() naplóz' ELSE 'NINCS' END,
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t
                            WHERE t.tgrelid = 'public.bealitas'::regclass AND t.tgname = 'audit_trg')
              THEN '✅ A közvetlen írás IS naplózódik → a találat súlya kisebb a jelentettnél.'
              ELSE '⚠️ Tényleg nincs napló — akkor a 2026-06-05n-row-audit.sql nem futott le.' END
  -- ── B13 ─────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 10,
         'B13 · profile_roles — JOGOSULTSÁGI oszlopok, amiket ma írhat az `authenticated`',
         COALESCE((SELECT string_agg(i.column_name, ', ' ORDER BY i.column_name)
                     FROM pr_irhato i JOIN pr_tiltando t ON t.column_name = i.column_name), '(egy sem)'),
         CASE WHEN EXISTS (SELECT 1 FROM pr_irhato i JOIN pr_tiltando t ON t.column_name = i.column_name)
              THEN '⛔ FENNÁLL a találat: a `role` / `permissions` / `profile_id` kliensről írható.'
              ELSE '✅ Már szűkítve — a migráció ettől még idempotensen újrafuttatható.' END
  UNION ALL
  SELECT 11,
         'B13 · profile_roles — az ENGEDÉLYLISTA mind a 8 oszlopa létezik-e',
         (SELECT count(*)::text FROM pr_engedett e JOIN pr_oszlop o ON o.column_name = e.column_name) || ' / 8',
         CASE WHEN (SELECT count(*) FROM pr_engedett e JOIN pr_oszlop o ON o.column_name = e.column_name) = 8
              THEN '✅ Mind megvan.'
              ELSE '⛔ ÁLLJ: hiányzik oszlop az engedélylistából — a séma más, mint amire ez a fájl készült.' END
  UNION ALL
  SELECT 12,
         'B13 · profile_roles — ISMERETLEN oszlop (se engedély-, se tiltólistán)',
         COALESCE((SELECT string_agg(o.column_name, ', ' ORDER BY o.column_name)
                     FROM pr_oszlop o
                    WHERE o.column_name NOT IN (SELECT column_name FROM pr_engedett)
                      AND o.column_name NOT IN (SELECT column_name FROM pr_tiltando)), '(egy sincs)'),
         CASE WHEN EXISTS (SELECT 1 FROM pr_oszlop o
                            WHERE o.column_name NOT IN (SELECT column_name FROM pr_engedett)
                              AND o.column_name NOT IN (SELECT column_name FROM pr_tiltando))
              THEN '⚠️ ÚJ OSZLOP a séma-dump óta! A migráció TILTANI fogja az írását. Ha ír rá app-kód, előbb tedd az engedélylistára (1/E szakasz).'
              ELSE '✅ Nincs séma-elcsúszás.' END
  UNION ALL
  SELECT 13,
         'B13 · védő trigger a profile_roles-on',
         COALESCE((SELECT string_agg(t.tgname, ', ' ORDER BY t.tgname)
                     FROM pg_trigger t
                    WHERE t.tgrelid = 'public.profile_roles'::regclass AND NOT t.tgisinternal), '(nincs trigger)'),
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t
                            WHERE t.tgrelid = 'public.profile_roles'::regclass
                              AND t.tgname = 'profile_roles_jogosultsag_vedelem_trg')
              THEN 'ℹ️ Már fut.'
              ELSE '⛔ Hiányzik — a `profiles`-on ott a párja (profiles_jogosultsag_vedelem_trg), itt nincs.' END
  UNION ALL
  SELECT 14,
         'B13 · a sor-szintű lyuk: profile_roles_pastor_approve policy',
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='public' AND tablename='profile_roles'
                              AND policyname='profile_roles_pastor_approve')
              THEN 'LÉTEZIK — a lelkész a saját gyülekezete SORAIT UPDATE-elheti'
              ELSE 'nincs' END,
         'ℹ️ Ezt a fájl SZÁNDÉKOSAN nem dobja el; az oszlop-GRANT + a trigger fogja meg. Külön kör dönthet az eldobásáról.'
  UNION ALL
  SELECT 15,
         'B13 · audit_trg a profile_roles-on',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t
                            WHERE t.tgrelid = 'public.profile_roles'::regclass AND t.tgname = 'audit_trg')
              THEN 'VAN' ELSE 'NINCS' END,
         'ℹ️ Csak tájékoztató — a napló nem helyettesíti a megelőzést.'
  -- ── Előfeltételek ───────────────────────────────────────────────────────
  UNION ALL
  SELECT 20,
         'ELŐFELTÉTEL · current_user_has_global_access() + felettes_szint_szerkesztheto(uuid)',
         (SELECT CASE WHEN van_global THEN 'global ✅' ELSE 'global ⛔' END || ' / ' ||
                 CASE WHEN van_felettes THEN 'felettes ✅' ELSE 'felettes ⛔' END FROM fv),
         CASE WHEN (SELECT van_global AND van_felettes FROM fv)
              THEN '✅ Megvan mindkettő.'
              ELSE '⛔ ÁLLJ: futtasd előbb a 2026-08-11-globalis-hozzaferes-szukites.sql-t.' END
) x
ORDER BY sorrend;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                        EGYETLEN TRANZAKCIÓ       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── 1/0 · FAIL-CLOSED ELŐFELTÉTEL-ŐR ──────────────────────────────────────
-- A migration-fájl NEM bizonyíték arra, hogy az élő adatbázis olyan, amilyennek
-- hisszük. Ha bármi hiányzik, itt HANGOSAN megállunk, nem félig javítunk.
DO $elofeltetel$
DECLARE
  v_hianyzo text;
BEGIN
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_has_global_access() — futtasd előbb a 2026-08-11-globalis-hozzaferes-szukites.sql-t.';
  END IF;
  IF to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a felettes_szint_szerkesztheto(uuid) — enélkül a megyei feloldás-jóváhagyás TÖRNE EL. Futtasd előbb a 2026-08-11-globalis-hozzaferes-szukites.sql-t.';
  END IF;

  -- B4 pecsét-oszlopok (a kegyelmi ablak ezekre épül)
  SELECT string_agg(c, ', ') INTO v_hianyzo
  FROM unnest(ARRAY['accounting_finalized','accounting_finalized_at','accounting_finalized_by']) AS u(c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='bealitas' AND column_name = u.c);
  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION '⛔ A bealitas táblából hiányzik: % — futtasd előbb a 2026-08-15-veglegesites-egyseges.sql-t.', v_hianyzo;
  END IF;

  -- B13 engedélylista: minden nevének léteznie kell, különben működő utat törnénk el
  SELECT string_agg(c, ', ') INTO v_hianyzo
  FROM unnest(ARRAY['approval_status','approval_reason','approved_at','approved_by',
                    'active','revoked_at','revoked_by','revoked_reason']) AS u(c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='profile_roles' AND column_name = u.c);
  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION '⛔ A profile_roles táblából hiányzik: % — más a séma, mint amire ez a fájl készült. NE futtasd.', v_hianyzo;
  END IF;
END
$elofeltetel$;


-- ══════════════════════════════════════════════════════════════════════════
-- 1/A · B4 — VÉDŐ TRIGGER a bealitas véglegesítési zászlóira
-- ══════════════════════════════════════════════════════════════════════════
-- Minta: public.profiles_jogosultsag_vedelem()
--        (2026-08-11-globalis-hozzaferes-szukites.sql:1134-1175)
-- Eltérés a mintától: itt nem FIX oszloplista van, hanem MINTAILLESZTÉS
-- (`_finalized$`), hogy egy jövőbeli zászló-oszlop is védve legyen.

CREATE OR REPLACE FUNCTION public.bealitas_veglegesites_vedelem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $bealitas_vedelem$
DECLARE
  -- v2026-08-25-b4
  v_regi jsonb;
  v_uj   jsonb;
  v_kulcs text;
  v_vissza text[] := ARRAY[]::text[];
  v_kegyelmi_ablak constant interval := interval '10 minutes';
BEGIN
  -- (a) Migráció / SQL editor / service_role / mentés-worker: auth.uid() NULL.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (b) Rendszergazda: változatlanul bármit.
  IF public.current_user_has_global_access() THEN
    RETURN NEW;
  END IF;

  v_regi := to_jsonb(OLD);
  v_uj   := to_jsonb(NEW);

  -- (c) PECSÉT-HAMISÍTÁS TILTÁSA: a „ki véglegesített" mező SOHA nem mutathat
  --     másra, mint a hívóra. (A legitim utak mind `auth.uid()`-ot írnak bele:
  --     penzugy/actions.ts:3901, :4298, leltar/actions.ts:703,
  --     voter-actions.ts:358 — mindegyik `access.user.id`.)
  FOR v_kulcs IN SELECT key FROM jsonb_each(v_uj) WHERE key ~ '_finalized_by$'
  LOOP
    IF (v_uj ->> v_kulcs) IS DISTINCT FROM (v_regi ->> v_kulcs)
       AND (v_uj ->> v_kulcs) IS NOT NULL
       AND (v_uj ->> v_kulcs) <> auth.uid()::text
    THEN
      RAISE EXCEPTION
        '⛔ A véglegesítés szerzője (%) nem írható át másik felhasználóra. Ezt a mezőt a program tölti ki.', v_kulcs
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

  -- Mely zászlók billentek IGAZ → nem-igaz irányba?
  FOR v_kulcs IN SELECT key FROM jsonb_each(v_uj) WHERE key ~ '_finalized$'
  LOOP
    IF (v_regi ->> v_kulcs) = 'true'
       AND COALESCE(v_uj ->> v_kulcs, 'false') <> 'true'
    THEN
      v_vissza := v_vissza || v_kulcs;
    END IF;
  END LOOP;

  -- Nincs visszabillentés (pl. véglegesítés BEkapcsolása, díj-mentés,
  -- feloldási kérelem rögzítése) → nem a mi dolgunk.
  IF cardinality(v_vissza) = 0 THEN
    RETURN NEW;
  END IF;

  -- (d) FELETTES SZINT: a megyei / kerületi feloldás-jóváhagyás.
  --     dashboard-egyhazmegye/actions.ts:165-200 (approveUnlockRequest)
  IF NEW.congregation_id IS NOT NULL
     AND public.felettes_szint_szerkesztheto(NEW.congregation_id)
  THEN
    RETURN NEW;
  END IF;

  -- (e) KEGYELMI ABLAK: a számadás beküldésének elbukása utáni AUTOMATIKUS
  --     visszavonás (penzugy/actions.ts:4466). Szűken:
  --       · kizárólag az accounting_finalized (más zászlóval együtt sem),
  --       · a pecsét szerint UGYANAZ a felhasználó véglegesített,
  --       · és 10 percnél nem régebben.
  IF v_vissza = ARRAY['accounting_finalized']
     AND OLD.accounting_finalized_at IS NOT NULL
     AND OLD.accounting_finalized_at > now() - v_kegyelmi_ablak
     AND OLD.accounting_finalized_by = auth.uid()
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    '⛔ A véglegesítés nem vonható vissza közvetlenül (%). A lezárt jelentés felnyitásához javítási kérelmet kell benyújtani, amit az egyházmegye bírál el.',
    array_to_string(v_vissza, ', ')
    USING ERRCODE = 'insufficient_privilege';
END
$bealitas_vedelem$;

COMMENT ON FUNCTION public.bealitas_veglegesites_vedelem() IS
  '2026-08-25 (B4): megakadályozza, hogy egy authenticated felhasználó a saját jogaival visszabillentse a bealitas véglegesítési zászlóit (budget/accounting/leltar/valasztok/budget_modN _finalized). Enélkül a lezárt, felküldött számadás EGYETLEN PostgREST PATCH-csel újranyílik, esperesi jóváhagyás nélkül. Átengedi: (a) auth.uid() IS NULL — migráció/service_role; (b) rendszergazda; (c) a zászló BEkapcsolását; (d) a felettes szintet (felettes_szint_szerkesztheto) — ez a megyei feloldás-jóváhagyás; (e) 10 perces kegyelmi ablakot az accounting_finalized-re, ha ugyanaz a felhasználó véglegesített — ez a beküldés-hiba utáni automatikus rollback (penzugy/actions.ts:4466). Tiltja a *_finalized_by pecsét más felhasználóra írását is. A zászlókat MINTAILLESZTÉSSEL keresi, ezért egy jövőbeli új zászló-oszlop is védve lesz.';

DROP TRIGGER IF EXISTS bealitas_veglegesites_vedelem_trg ON public.bealitas;
CREATE TRIGGER bealitas_veglegesites_vedelem_trg
  BEFORE UPDATE ON public.bealitas
  FOR EACH ROW
  EXECUTE FUNCTION public.bealitas_veglegesites_vedelem();


-- ══════════════════════════════════════════════════════════════════════════
-- 1/B · B13 — VÉDŐ TRIGGER a profile_roles jogosultsági oszlopaira
-- ══════════════════════════════════════════════════════════════════════════
-- Ez a `profiles_jogosultsag_vedelem()` pontos párja: ott a `profiles` skalár
-- jogosultsági mezőit védi, itt a multi-role tábla ugyanazon mezőit.

CREATE OR REPLACE FUNCTION public.profile_roles_jogosultsag_vedelem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $pr_vedelem$
BEGIN
  -- v2026-08-25-b13
  -- (a) Migráció / SQL editor / service_role / auth-trigger.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (b) Rendszergazda. Ide esnek a SECURITY DEFINER admin-RPC-k is
  --     (admin_erase_user, complete_congregation_transfer — mindkettő is_admin() kapuval).
  IF public.current_user_has_global_access() THEN
    RETURN NEW;
  END IF;

  -- (c) JOGOSULTSÁGI OSZLOPOK: nem változhatnak. Ez a trigger-tükre az 1/E
  --     oszlop-szintű GRANT-nak (mélységi védelem: ha valaki a jogot később
  --     véletlenül visszaadná, a trigger akkor is fog).
  IF (NEW.profile_id, NEW.role, NEW.scope, NEW.scope_id, NEW.permissions)
       IS DISTINCT FROM
     (OLD.profile_id, OLD.role, OLD.scope, OLD.scope_id, OLD.permissions)
  THEN
    RAISE EXCEPTION
      '⛔ A szerepkör azonosító mezői (profile_id, role, scope, scope_id, permissions) nem módosíthatók. Szerepkört kiosztani vagy átírni csak a rendszergazda tud — kérj rendszergazdai segítséget.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (d) ÖNJÓVÁHAGYÁS / ÖNAKTIVÁLÁS TILOS.
  --     A LEFOKOZÁS (visszavonás, inaktiválás) továbbra is szabad — erre épül a
  --     public.erase_my_account() (2026-06-05h-self-erasure.sql:42), ami a saját
  --     sorait active=false / approval_status='revoked' állapotba viszi.
  IF OLD.profile_id = auth.uid() THEN
    IF (NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM 'approved')
       OR (NEW.active = true AND COALESCE(OLD.active, false) = false)
    THEN
      RAISE EXCEPTION
        '⛔ A saját szerepkörödet nem hagyhatod jóvá és nem aktiválhatod. Ezt a rendszergazda (gyülekezeti szerepkörnél a lelkész) végzi.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- (e) A jóváhagyás / visszavonás SZERZŐJE csak a hívó lehet — ne lehessen
  --     más nevére írni a döntést. (revokeProfileRole a saját user-id-ját írja:
  --     admin/profile-roles-actions.ts:558.)
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     AND NEW.approved_by IS NOT NULL AND NEW.approved_by <> auth.uid()
  THEN
    RAISE EXCEPTION '⛔ A jóváhagyó (approved_by) nem írható más felhasználó nevére.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
     AND NEW.revoked_by IS NOT NULL AND NEW.revoked_by <> auth.uid()
  THEN
    RAISE EXCEPTION '⛔ A visszavonó (revoked_by) nem írható más felhasználó nevére.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$pr_vedelem$;

COMMENT ON FUNCTION public.profile_roles_jogosultsag_vedelem() IS
  '2026-08-25 (B13): a profiles_jogosultsag_vedelem() párja a multi-role táblán. Tiltja a profile_id / role / scope / scope_id / permissions átírását, az önjóváhagyást (profile_id = auth.uid() mellett approved/active-ra váltást), és a jóváhagyó/visszavonó mező más nevére írását. Enélkül a profile_roles_pastor_approve RLS-policy (2026-04-17) SOR-szintű UPDATE-je jogosultság-emelésre használható: a lelkész a saját gyülekezete szerepkör-során át tudja írni a role-t és a permissions-t. Átengedi: auth.uid() IS NULL (migráció/service_role), a rendszergazdát, és a LEFOKOZÁST (erase_my_account).';

DROP TRIGGER IF EXISTS profile_roles_jogosultsag_vedelem_trg ON public.profile_roles;
CREATE TRIGGER profile_roles_jogosultsag_vedelem_trg
  BEFORE UPDATE ON public.profile_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.profile_roles_jogosultsag_vedelem();


-- ══════════════════════════════════════════════════════════════════════════
-- 1/C · GRANT-ok a hívott függvényekre
-- ══════════════════════════════════════════════════════════════════════════
-- HIBAOSZTÁLY: „GRANT nélkül a policy nem tagad, hanem HIBÁZIK (42501)."
-- A két védő függvény SECURITY DEFINER, tehát a hívott segéd-függvényekhez a
-- TULAJDONOS jogán fér hozzá — de a projekt szabálya szerint az EXECUTE jogot
-- akkor is kimondjuk, hogy egy jövőbeli SECURITY INVOKER átírás se némuljon el.
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_szerkesztheto(uuid) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 1/D · B13 — OSZLOP-SZINTŰ GRANT a profile_roles-on
-- ══════════════════════════════════════════════════════════════════════════
-- A TILTÓ oldalt GENERÁLTAN állítjuk elő az élő katalógusból (nem kézzel), hogy
-- egy azóta született oszlop se maradjon véletlenül nyitva. Az ENGEDÉLYEZETT
-- lista viszont NÉV SZERINT áll itt, mert azt a kódutak határozzák meg:
--   revokeProfileRole (admin/profile-roles-actions.ts:553) →
--       approval_status, active, revoked_at, revoked_by, revoked_reason
--   + a jóváhagyás-mezők (approved_by, approved_at, approval_reason), hogy a
--     `profile_roles_pastor_approve` policy-n futó (ma app-oldali író nélküli,
--     de élő) jóváhagyási út se törjön el, ha valaki visszakapcsolja.

-- 1) Tábla-szintű UPDATE le.
REVOKE UPDATE ON public.profile_roles FROM authenticated;

-- 2) Oszlop-szinten IS le, MINDEN oszlopról — generáltan.
DO $oszlop_revoke$
DECLARE
  v_col text;
BEGIN
  FOR v_col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profile_roles'
    ORDER BY ordinal_position
  LOOP
    EXECUTE format('REVOKE UPDATE (%I) ON public.profile_roles FROM authenticated', v_col);
  END LOOP;
END
$oszlop_revoke$;

-- 3) Vissza CSAK a jóváhagyás / visszavonás mezői.
GRANT UPDATE (
  approval_status,
  approval_reason,
  approved_at,
  approved_by,
  active,
  revoked_at,
  revoked_by,
  revoked_reason
) ON public.profile_roles TO authenticated;

-- Figyelmeztetés, ha a séma elcsúszott (nem állítjuk meg a migrációt, mert a
-- tiltás a fail-closed irány — de Endre lássa).
DO $ismeretlen_oszlop$
DECLARE
  v_ismeretlen text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_ismeretlen
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profile_roles'
    AND column_name NOT IN ('approval_status','approval_reason','approved_at','approved_by',
                            'active','revoked_at','revoked_by','revoked_reason',
                            'id','profile_id','scope','scope_id','role','permissions',
                            'custom_label','granted_at','granted_by');
  IF v_ismeretlen IS NOT NULL THEN
    RAISE WARNING '⚠️ A profile_roles táblán ISMERETLEN oszlop(ok) vannak: %. Az írásukat ez a migráció MEGTILTOTTA. Ha van rájuk app-oldali író, vedd fel őket a fenti GRANT UPDATE listába, és futtasd újra.', v_ismeretlen;
  END IF;
END
$ismeretlen_oszlop$;


-- ══════════════════════════════════════════════════════════════════════════
-- 1/E · ŐNTESZT — NEGATÍV ASSZERT (a régi, hibás viselkedés újrajátszása)
-- ══════════════════════════════════════════════════════════════════════════
-- MUNKASZABÁLY (rögzített hibaosztály): „negatív asszert nélkül az őrszem vak."
-- Itt tehát nem csak azt nézzük meg, hogy a trigger LÉTEZIK, hanem hamis
-- munkamenetet állítunk be, ELŐÁLLÍTJUK a régi világot, és BIZONYÍTJUK, hogy a
-- mutáns írás elbukik. Minden írás al-tranzakcióban történik és visszagördül;
-- ha a védelem NEM fog, a TELJES migráció megbukik (semmi nem marad félkész).

DO $onteszt_b4$
DECLARE
  v_id      text;
  v_cong    uuid;
  v_hamis   uuid := gen_random_uuid();
  v_ok      boolean := false;
  v_indok   text := '(nem futott le)';
BEGIN
  SELECT b.id, b.congregation_id INTO v_id, v_cong
  FROM public.bealitas b
  WHERE b.congregation_id IS NOT NULL
  ORDER BY b.id DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION '⛔ AZ ÖNTESZT NEM FUTTATHATÓ (B4): a bealitas táblában nincs egyetlen gyülekezethez kötött sor sem, ezért nem tudjuk bizonyítani, hogy a védelem fog. Fail-closed módon megállunk.';
  END IF;

  BEGIN
    -- tiszta lap: biztosan NINCS hamis munkamenet, amikor a „régi világot" gyártjuk
    PERFORM set_config('request.jwt.claims',    '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- (i) A RÉGI VILÁG: legyen egy VÉGLEGESÍTETT év, régi pecséttel (hogy a
    --     kegyelmi ablak biztosan NE mentse meg a mutánst).
    UPDATE public.bealitas
       SET accounting_finalized    = true,
           accounting_finalized_at = now() - interval '30 days',
           accounting_finalized_by = NULL
     WHERE id = v_id AND congregation_id = v_cong;

    -- (ii) Mostantól „idegen lelkész" vagyunk: nem rendszergazda, nincs megyei
    --      hatóköre (a v_hamis uuid egyetlen profiles sorra sem illeszkedik).
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_hamis::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_hamis::text, true);

    IF auth.uid() IS DISTINCT FROM v_hamis THEN
      v_indok := 'nem sikerült hamis munkamenetet beállítani (az auth.uid() nem vette át a request.jwt.claims értékét), ezért az önteszt eredménye HAMIS ZÖLD lenne';
      RAISE EXCEPTION 'ONTESZT_VEGE';
    END IF;

    -- (iii) A MUTÁNS: a véglegesítés visszabillentése. EZ MOST MÁR NEM MEHET ÁT.
    UPDATE public.bealitas
       SET accounting_finalized = false
     WHERE id = v_id AND congregation_id = v_cong;

    v_indok := 'a védő trigger ÁTENGEDTE a véglegesítés visszabillentését';
    RAISE EXCEPTION 'ONTESZT_VEGE';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_ok := true;                       -- ✅ a védelem fogott
    WHEN OTHERS THEN
      IF SQLERRM <> 'ONTESZT_VEGE' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims',    '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF NOT v_ok THEN
    RAISE EXCEPTION '⛔ ÖNTESZT BUKOTT (B4): %. A migráció visszagördül.', v_indok;
  END IF;
  RAISE NOTICE '✅ ÖNTESZT (B4): a véglegesítés visszabillentése idegen munkamenetből ELBUKOTT — a védelem működik.';
END
$onteszt_b4$;


DO $onteszt_b13$
DECLARE
  v_pr_id      uuid;
  v_pr_profile uuid;
  v_hamis      uuid := gen_random_uuid();
  v_ok1        boolean := false;
  v_ok2        boolean := false;
  v_indok      text := '(nem futott le)';
BEGIN
  -- Olyan sort keresünk, aminek a GAZDÁJA BIZTOSAN NEM rendszergazda — különben
  -- a trigger (b) ága jogosan engedné át, és hamis piros/zöld jönne ki.
  SELECT pr.id, pr.profile_id INTO v_pr_id, v_pr_profile
  FROM public.profile_roles pr
  WHERE pr.scope <> 'system'
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = pr.profile_id AND p.status = 'active' AND p.role = 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.profile_roles a
                     WHERE a.profile_id = pr.profile_id AND a.scope = 'system'
                       AND a.role = 'admin' AND a.active AND a.approval_status = 'approved')
  ORDER BY pr.granted_at DESC
  LIMIT 1;

  IF v_pr_id IS NULL THEN
    RAISE EXCEPTION '⛔ AZ ÖNTESZT NEM FUTTATHATÓ (B13): nincs egyetlen NEM-rendszergazdához tartozó, nem system-scope profile_roles sor sem, amin bizonyítani lehetne a védelmet. Fail-closed módon megállunk.';
  END IF;

  -- ── MUTÁNS 1: jogosultsági oszlop átírása idegen munkamenetből ──────────
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_hamis::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_hamis::text, true);

    IF auth.uid() IS DISTINCT FROM v_hamis THEN
      v_indok := 'nem sikerült hamis munkamenetet beállítani (auth.uid())';
      RAISE EXCEPTION 'ONTESZT_VEGE';
    END IF;

    UPDATE public.profile_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"onteszt_mutans": true}'::jsonb
     WHERE id = v_pr_id;

    v_indok := 'a védő trigger ÁTENGEDTE a permissions átírását';
    RAISE EXCEPTION 'ONTESZT_VEGE';
  EXCEPTION
    WHEN insufficient_privilege THEN v_ok1 := true;
    WHEN OTHERS THEN IF SQLERRM <> 'ONTESZT_VEGE' THEN RAISE; END IF;
  END;

  -- ── MUTÁNS 2: ÖNJÓVÁHAGYÁS (profile_id = auth.uid()) ───────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims',    '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- régi világ: a sor függőben / inaktív
    UPDATE public.profile_roles
       SET approval_status = 'pending', active = false
     WHERE id = v_pr_id;

    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_pr_profile::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_pr_profile::text, true);

    IF auth.uid() IS DISTINCT FROM v_pr_profile THEN
      v_indok := 'nem sikerült a sor gazdájának munkamenetét beállítani (auth.uid())';
      RAISE EXCEPTION 'ONTESZT_VEGE';
    END IF;

    UPDATE public.profile_roles
       SET approval_status = 'approved', active = true, approved_at = now()
     WHERE id = v_pr_id;

    v_indok := 'a védő trigger ÁTENGEDTE az ÖNJÓVÁHAGYÁST';
    RAISE EXCEPTION 'ONTESZT_VEGE';
  EXCEPTION
    WHEN insufficient_privilege THEN v_ok2 := true;
    WHEN OTHERS THEN IF SQLERRM <> 'ONTESZT_VEGE' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims',    '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF NOT v_ok1 THEN
    RAISE EXCEPTION '⛔ ÖNTESZT BUKOTT (B13 / jogosultsági oszlop): %. A migráció visszagördül.', v_indok;
  END IF;
  IF NOT v_ok2 THEN
    RAISE EXCEPTION '⛔ ÖNTESZT BUKOTT (B13 / önjóváhagyás): %. A migráció visszagördül.', v_indok;
  END IF;
  RAISE NOTICE '✅ ÖNTESZT (B13): a permissions átírása ÉS az önjóváhagyás is ELBUKOTT — a védelem működik.';
END
$onteszt_b13$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS         ⚠️ EGYETLEN lekérdezés (UNION ALL)       ║
-- ║ A Supabase editor CSAK AZ UTOLSÓ eredményt mutatja — ezért egy darab.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

WITH
pr_oszlop AS (
  SELECT column_name::text AS column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profile_roles'
),
pr_irhato AS (
  SELECT column_name FROM pr_oszlop
  WHERE has_column_privilege('authenticated', 'public.profile_roles', column_name, 'UPDATE')
),
pr_tiltando AS (
  SELECT unnest(ARRAY['id','profile_id','scope','scope_id','role','permissions',
                      'custom_label','granted_at','granted_by']) AS column_name
),
trg AS (
  SELECT t.tgname,
         t.tgenabled::text                      AS tgenabled,
         t.tgtype::int                          AS tgtype,
         c.relname
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND c.relnamespace = 'public'::regnamespace
    AND c.relname IN ('bealitas','profile_roles')
)
SELECT * FROM (
  SELECT 1 AS sorrend,
         'B4 · bealitas_veglegesites_vedelem_trg' AS mit,
         COALESCE((SELECT CASE WHEN tgenabled = 'O' THEN 'AKTÍV' ELSE 'letiltva (' || tgenabled || ')' END
                     || CASE WHEN (tgtype & 2) > 0 AND (tgtype & 16) > 0 AND (tgtype & 1) > 0
                             THEN ', BEFORE UPDATE, soronként' ELSE ', ⚠️ NEM BEFORE UPDATE ROW' END
                     FROM trg WHERE tgname = 'bealitas_veglegesites_vedelem_trg'), 'NINCS') AS ertek,
         CASE WHEN EXISTS (SELECT 1 FROM trg WHERE tgname = 'bealitas_veglegesites_vedelem_trg' AND tgenabled = 'O')
              THEN '✅ Kész.' ELSE '⛔ Nem jött létre — nézd meg az 1. szakasz hibaüzenetét.' END AS teendo
  UNION ALL
  SELECT 2,
         'B4 · a védő függvény törzse a mai verzió-e',
         CASE WHEN pg_get_functiondef(to_regprocedure('public.bealitas_veglegesites_vedelem()'))
                     LIKE '%v2026-08-25-b4%' THEN 'v2026-08-25-b4' ELSE '⚠️ NINCS VAGY RÉGI/IDEGEN TÖRZS' END,
         CASE WHEN pg_get_functiondef(to_regprocedure('public.bealitas_veglegesites_vedelem()'))
                     LIKE '%v2026-08-25-b4%' THEN '✅ Ez a fájl törzse fut.' ELSE '⛔ Más törzs fut — futtasd újra az 1. szakaszt.' END
  UNION ALL
  SELECT 3,
         'B4 · a legitim utak nem törtek el (a zászlók továbbra is írhatók)',
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema='public' AND table_name='bealitas' AND column_name::text ~ '_finalized$'
             AND has_column_privilege('authenticated','public.bealitas',column_name::text,'UPDATE')) || ' zászló-oszlop írható',
         'ℹ️ EZ ÍGY HELYES: a véglegesítés GOMB a felhasználó jogaival ír. Az IRÁNYT (vissza) a trigger tiltja, nem a GRANT.'
  UNION ALL
  SELECT 4,
         'B4 · ÖNTESZT (negatív asszert)',
         'lefutott az 1/E szakaszban',
         '✅ Ha idáig eljutottál, a mutáns (véglegesítés visszabillentése idegen munkamenetből) ELBUKOTT. Különben a tranzakció visszagördült volna.'
  UNION ALL
  SELECT 10,
         'B13 · profile_roles_jogosultsag_vedelem_trg',
         COALESCE((SELECT CASE WHEN tgenabled = 'O' THEN 'AKTÍV' ELSE 'letiltva (' || tgenabled || ')' END
                     FROM trg WHERE tgname = 'profile_roles_jogosultsag_vedelem_trg'), 'NINCS'),
         CASE WHEN EXISTS (SELECT 1 FROM trg WHERE tgname = 'profile_roles_jogosultsag_vedelem_trg' AND tgenabled = 'O')
              THEN '✅ Kész.' ELSE '⛔ Nem jött létre.' END
  UNION ALL
  SELECT 11,
         'B13 · a védő függvény törzse a mai verzió-e',
         CASE WHEN pg_get_functiondef(to_regprocedure('public.profile_roles_jogosultsag_vedelem()'))
                     LIKE '%v2026-08-25-b13%' THEN 'v2026-08-25-b13' ELSE '⚠️ NINCS VAGY RÉGI/IDEGEN TÖRZS' END,
         CASE WHEN pg_get_functiondef(to_regprocedure('public.profile_roles_jogosultsag_vedelem()'))
                     LIKE '%v2026-08-25-b13%' THEN '✅ Ez a fájl törzse fut.' ELSE '⛔ Más törzs fut.' END
  UNION ALL
  SELECT 12,
         'B13 · JOGOSULTSÁGI oszlopok, amiket az `authenticated` MÉG írhat',
         COALESCE((SELECT string_agg(i.column_name, ', ' ORDER BY i.column_name)
                     FROM pr_irhato i JOIN pr_tiltando t ON t.column_name = i.column_name), '(egy sem)'),
         CASE WHEN EXISTS (SELECT 1 FROM pr_irhato i JOIN pr_tiltando t ON t.column_name = i.column_name)
              THEN '⛔ MARADT NYITOTT OSZLOP — a REVOKE nem érvényesült. NE zárd le a kört.'
              ELSE '✅ A role / permissions / profile_id / scope kliensről már NEM írható.' END
  UNION ALL
  SELECT 13,
         'B13 · amit az `authenticated` írhat (az ENGEDÉLYLISTÁNAK kell lennie)',
         COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM pr_irhato), '(semmi)'),
         CASE WHEN (SELECT count(*) FROM pr_irhato) = 8
              THEN '✅ Pontosan a 8 jóváhagyás-/visszavonás-mező.'
              ELSE '⚠️ Nem 8 oszlop — vesd össze a 12. sorral, és nézd meg, nem hiányzik-e a revokeProfileRole-hoz kellő mező.' END
  UNION ALL
  SELECT 14,
         'B13 · a revokeProfileRole 5 mezője írható-e (különben eltörne a visszavonás)',
         (SELECT count(*)::text FROM unnest(ARRAY['approval_status','active','revoked_at','revoked_by','revoked_reason']) AS u(c)
           WHERE has_column_privilege('authenticated','public.profile_roles', u.c, 'UPDATE')) || ' / 5',
         CASE WHEN (SELECT count(*) FROM unnest(ARRAY['approval_status','active','revoked_at','revoked_by','revoked_reason']) AS u(c)
                     WHERE has_column_privilege('authenticated','public.profile_roles', u.c, 'UPDATE')) = 5
              THEN '✅ A szerepkör-visszavonás (admin/profile-roles-actions.ts:553) továbbra is megy.'
              ELSE '⛔ ELTÖRT a visszavonás! Add vissza a hiányzó oszlop UPDATE jogát.' END
  UNION ALL
  SELECT 15,
         'B13 · ÖNTESZT (2 mutáns: permissions-átírás + önjóváhagyás)',
         'lefutott az 1/E szakaszban',
         '✅ Ha idáig eljutottál, mindkét mutáns ELBUKOTT.'
  UNION ALL
  SELECT 20,
         'Kísérő · audit_trg mindkét táblán (a napló megvan)',
         (SELECT count(*)::text FROM trg WHERE tgname = 'audit_trg') || ' / 2',
         CASE WHEN (SELECT count(*) FROM trg WHERE tgname = 'audit_trg') = 2
              THEN '✅ Minden módosítás (a közvetlen PostgREST-írás is) az audit.record_version-be kerül.'
              ELSE '⚠️ Hiányzik audit-trigger — futtasd a 2026-06-05n-row-audit.sql-t.' END
) x
ORDER BY sorrend;
