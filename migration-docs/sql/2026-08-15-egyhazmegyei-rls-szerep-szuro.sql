-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI RLS — SZEREP-SZŰRŐ A diocese_* POLICY-KRA        2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-rls-szerep-szuro.sql    ║
-- ║ (Egyházmegyei szint terv, 0. fejezet / S1 biztonsági szelet)             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT JAVÍT (docs/EGYHAZMEGYEI-SZINT-TERV-2026-08-15.md, 0.1 + 0.4):
--
--  (A) Az öt `diocese_*_all` FOR ALL policy (diocese_bealitas, diocese_befizetes,
--      diocese_kiadas, diocese_koltsegvetes, diocese_annual_reports —
--      2026-08-09-megye-kerulet-rls-fix.sql:236 és párjai) harmadik ága:
--          OR (pr.scope = 'diocese' AND pr.scope_id = <tábla>.diocese_id)
--      SZEREP-SZŰRŐ NÉLKÜL állt. Következmény: BÁRMILYEN jóváhagyott, aktív
--      `diocese` hatókörű profile_roles sor (custom „titkárnő", konyvelo,
--      lelkesz szerepű is!) direkt PostgREST-hívással ÍRHATTA a megye pénzügyi
--      könyveit. Ugyanígy a district-ág is szerep-szűrő nélküli volt.
--      JAVÍTÁS: a policy-k a KANONIKUS, szerep-szűrt függvényeket hívják —
--        · írás:   current_user_diocese_ids()        (esperes + egyhazmegyei_admin)
--        · kerület: current_user_district_ids()      (egyhazkeruleti_admin)
--        · globál: current_user_has_global_access()  (csak rendszergazda)
--      és MELLÉ kerül (ha még nincs) a számvevői OLVASÓ `FOR SELECT` policy
--      (current_user_diocese_olvaso_ids()) — így a számvevő olvasása megmarad
--      akkor is, ha a 2026-08-11-szamvevo fájl még nem futott le.
--      Az app-tükör: apps/web/lib/auth/level-scope.ts (DIOCESE_WRITE_ROLES /
--      DIOCESE_READ_ROLES) — a két réteg így nem húzhat szét.
--
--  (B) A `document_submissions_diocese_access` (2026-04-17-document-submissions-
--      fix.sql:89-109) a sor NULLABLE, elavulható `diocese_id` oszlopán
--      pivotált. Megye-besorolás nélküli gyülekezet + elavult beküldői skalár
--      esetén a beküldött sor MÁS megye RLS-nézetébe esett. JAVÍTÁS: csere a
--      2026-08-11-es kanonikus mintára (document_submissions_szint_all — a
--      VALÓDI congregations.diocese_id láncon), plusz külön rendszergazda-ág
--      (document_submissions_global_all), hogy az admin hozzáférése ne az
--      eldobott policy admin-karján múljon.
--
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok):
--  · „A migration-fájl NEM bizonyíték" → a 0. SZAKASZ állapotfelmérés, az
--    1. SZAKASZ őrszeme fail-closed RAISE EXCEPTION-nel áll le, ha az élő
--    adatbázis nem a várt állapotban van.
--  · „RLS-policy a hívó szerepében fut → GRANT nélkül 403-leállás" → minden
--    hívott függvényre/táblára has_function_privilege / has_table_privilege
--    ellenőrzés + explicit GRANT MÉG A POLICY-CSERE ELŐTT, EGY tranzakcióban.
--  · A policy-cserék EGYETLEN tranzakcióban futnak — nincs olyan pillanat,
--    amikor a régi ág már nem, az új még nem él.
--
-- ÚJ TÁBLA NEM JÖN LÉTRE → a backup_table_policy besorolást ez a fájl nem
-- érinti (minden érintett tábla besorolása változatlan).
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az utolsó utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--       Jelöld ki CSAK ezt, futtasd, OLVASD EL — főleg a 0/H sorokat (kik
--       veszítik el az írást).
--   2.  1. SZAKASZ — A JAVÍTÁS. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: minden CREATE előtt DROP IF EXISTS; akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK' AS szakasz,
       'Létezik-e mind az 5 kanonikus függvény?' AS mit,
       (SELECT count(*)::text || ' / 5' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access',
                            'current_user_diocese_ids',
                            'current_user_district_ids',
                            'current_user_diocese_olvaso_ids',
                            'felettes_szint_gyulekezet_ids')) AS ertek,
       'Ha nem 5: ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql, majd a 2026-08-11-szamvevo-megyei-hozzaferes.sql fusson le. E fájl őrszeme enélkül hibával leáll.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK',
       'current_user_has_global_access() törzse CSAK rendszergazda? (nem említ esperest)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%esperes%'
                             THEN '⛔ RÉGI (fázis-0) törzs — az esperes még GLOBÁLIS!'
                             ELSE '✅ szűkített (2026-08-11) törzs' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
                 LIMIT 1), 'nincs függvény'),
       'Ha ⛔: NE FUTTASD ezt a fájlt — előbb a 2026-08-11-es szűkítő fájl 2a szakasza kell, különben az új policy-k a régi, tág globál-függvényre épülnének.'

UNION ALL
SELECT 3, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK',
       'current_user_diocese_ids() törzse érintetlen? (nem említ szamvevo-t)',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%egyhazmegyei_szamvevo%'
                             THEN '⛔ MEGVÁLTOZOTT — az ellenőr írásjogot kaphatott!'
                             ELSE '✅ érintetlen (írási hatókör)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids'
                 LIMIT 1), 'nincs függvény'),
       'Ha ⛔: előbb tisztázd, ki és miért írta át — ez a fájl az érintetlen írási hatókörre épít.'

-- ── 0/B · Az öt diocese_*_all policy MAI állapota ───────────────────────────
UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tabla))::int, '0/B · diocese_*_all POLICY-K',
       t.tabla || '.' || t.tabla || '_all',
       CASE
         WHEN pol.policyname IS NULL THEN '⚠️ NINCS ilyen policy (repó⇄produkció eltérés)'
         WHEN COALESCE(pol.qual, '') LIKE '%current_user_diocese_ids%'
           THEN '✅ MÁR az új, szerep-szűrt alak él (újrafuttatás rendben)'
         ELSE '⛔ RÉGI alak — a diocese-ág szerep-szűrő NÉLKÜLI (ez a javítandó hiba)'
       END,
       'Az 1. szakasz idempotensen a kanonikus alakra cseréli.'
FROM (VALUES ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
             ('diocese_koltsegvetes'), ('diocese_annual_reports')) AS t(tabla)
LEFT JOIN pg_policies pol
  ON pol.schemaname = 'public' AND pol.tablename = t.tabla
 AND pol.policyname = t.tabla || '_all'

-- ── 0/C · document_submissions policy-állapot ───────────────────────────────
UNION ALL
SELECT 20, '0/C · document_submissions',
       'Él-e még a régi (nullable diocese_id oszlopon pivotáló) diocese_access?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                           AND tablename='document_submissions'
                           AND policyname='document_submissions_diocese_access')
            THEN '⛔ IGEN — ez a javítandó hiba (0.4)' ELSE '✅ már nincs' END,
       'Az 1. szakasz eldobja, és a kanonikus document_submissions_szint_all + a rendszergazda-ág lép a helyére.'

UNION ALL
SELECT 21, '0/C · document_submissions',
       'Megvan-e a kanonikus document_submissions_szint_all?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                           AND tablename='document_submissions'
                           AND policyname='document_submissions_szint_all')
            THEN '✅ igen (a 2026-08-11-es fájlból)' ELSE 'nem — ez a fájl létrehozza' END,
       'Tájékoztató.'

-- ── 0/D · GRANT-ok: a policy a HÍVÓ szerepében fut ──────────────────────────
UNION ALL
SELECT (30 + row_number() OVER (ORDER BY f.fn))::int, '0/D · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn,
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN 'nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
            THEN '✅ van' ELSE '⛔ NINCS — az új policy 42501/403-mal állna le' END,
       'Ha ⛔: az 1. szakasz GRANT-ja pótolja (a policy-csere ELŐTT, ugyanabban a tranzakcióban).'
FROM (VALUES ('current_user_has_global_access'), ('current_user_diocese_ids'),
             ('current_user_district_ids'), ('current_user_diocese_olvaso_ids'),
             ('felettes_szint_gyulekezet_ids')) AS f(fn)

UNION ALL
SELECT 40, '0/D · TÁBLA-GRANT',
       'SELECT a public.dioceses-en az authenticated-nek (az új policy district-al-lekérdezése a hívó szerepében fut!)',
       CASE WHEN has_table_privilege('authenticated', 'public.dioceses', 'SELECT')
            THEN '✅ van' ELSE '⛔ NINCS — a policy kiértékelése 42501-gyel bukna' END,
       'Ha ⛔: az 1. szakasz pótolja.'

-- ── 0/E · RLS bekapcsolva? (különben a policy tétlen) ───────────────────────
UNION ALL
SELECT (50 + row_number() OVER (ORDER BY t.tabla))::int, '0/E · RLS-ÁLLAPOT',
       'RLS: ' || t.tabla,
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ BE' ELSE '⛔ KI — a policy tétlen!' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = t.tabla), 'nincs ilyen tábla'),
       'Ha KI: a tábla a GRANT alapján nyitva van — az RLS bekapcsolása külön, tudatos döntés.'
FROM (VALUES ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
             ('diocese_koltsegvetes'), ('diocese_annual_reports'),
             ('document_submissions')) AS t(tabla)

-- ── 0/H · KIT ÉRINT: kik veszítik el az írást a megye könyvein? ─────────────
UNION ALL
SELECT (60 + row_number() OVER (ORDER BY pr.role))::int, '0/H · KIT ÉRINT',
       'profile_roles scope=diocese, aktív+jóváhagyott — szerep: ' || pr.role,
       count(*)::text || ' sor / ' || count(DISTINCT pr.profile_id)::text || ' fő',
       CASE
         WHEN pr.role IN ('esperes', 'egyhazmegyei_admin')
           THEN '✅ ÍRÁSI hatókör — változatlanul ír.'
         WHEN pr.role = 'egyhazmegyei_szamvevo'
           THEN '✅ OLVAS (FOR SELECT policy) — írása eddig is tiltandó volt, most a fő policy is kizárja.'
         ELSE '⚠️ EZEK A SOROK EDDIG ÍRHATTÁK a megye könyveit a szerep-szűrő nélküli ágon — a csere után NEM. Ha valakinek közülük rögzítenie kell, adj neki NEVESÍTETT egyhazmegyei_admin (vagy olvasáshoz egyhazmegyei_szamvevo) sort.'
       END
FROM public.profile_roles pr
WHERE pr.scope = 'diocese' AND pr.active = true AND pr.approval_status = 'approved'
GROUP BY pr.role

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A JAVÍTÁS                                  FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ (GRANT-ok + policy-cserék együtt).                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ───────────────────────────────────────
DO $orszem$
BEGIN
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_has_global_access() — nem ez az adatbázis, vagy a fázis-0 migráció hiányzik.';
  END IF;
  IF to_regprocedure('public.current_user_diocese_ids()') IS NULL
     OR to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_diocese_ids() / current_user_district_ids() — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql 1. szakaszát futtasd.';
  END IF;
  IF to_regprocedure('public.current_user_diocese_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_diocese_olvaso_ids() — ELŐBB a 2026-08-11-szamvevo-megyei-hozzaferes.sql 1. szakaszát futtasd (a számvevő olvasása különben elveszne).';
  END IF;
  IF to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a felettes_szint_gyulekezet_ids() — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql 1. szakaszát futtasd (a document_submissions kanonikus policy-ja erre épül).';
  END IF;

  -- A globál-függvény nem lehet a régi, tág (esperest is beengedő) törzs —
  -- különben az új policy-k GLOBÁLIS írást adnának minden esperesnek.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
      AND p.prosrc LIKE '%esperes%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_has_global_access() még a RÉGI (esperest is globálisnak vevő) törzs — ELŐBB a 2026-08-11-es szűkítő fájl 2a szakasza fusson le.';
  END IF;

  -- Az írási hatókör-függvény nem tartalmazhat számvevőt (az ellenőr nem ír).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids'
      AND p.prosrc LIKE '%egyhazmegyei_szamvevo%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_diocese_ids() törzse EMLÍTI az egyhazmegyei_szamvevo-t — az írási hatókör sérült, előbb tisztázd (0/A 3. sor).';
  END IF;

  -- GRANT-tanulság: a policy a HÍVÓ szerepében fut. A district-ág al-lekérdezése
  -- a public.dioceses-t olvassa → az authenticated-nek táblaszintű SELECT kell.
  IF NOT has_table_privilege('authenticated', 'public.dioceses', 'SELECT') THEN
    GRANT SELECT ON public.dioceses TO authenticated;
    RAISE NOTICE 'ℹ️ GRANT SELECT ON public.dioceses TO authenticated — pótolva (a policy-k district-ága igényli).';
  END IF;
END
$orszem$;

-- A policy-kban hívott függvények EXECUTE joga (idempotens; a policy a hívó
-- szerepében fut — EXECUTE nélkül 42501/403 lenne az eredmény).
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_olvaso_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_gyulekezet_ids()   TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) Az öt diocese_*_all policy cseréje a kanonikus, szerep-szűrt alakra
--      + számvevői OLVASÓ FOR SELECT policy (ha még nem volt)
-- ────────────────────────────────────────────────────────────────────────────
-- Az új FOR ALL alak három ága (USING és WITH CHECK azonos):
--   (1) rendszergazda:  current_user_has_global_access()   — skalár admin +
--       profile_roles system-admin, status='active' kapuval;
--   (2) megyei ÍRÓK:    diocese_id ∈ current_user_diocese_ids() — SZEREP-SZŰRT
--       (esperes, egyhazmegyei_admin), skalár-fallbackkel, elavult-skalár-
--       elnyomással;
--   (3) kerületi admin: a megye VALÓDI kerülete (dioceses.district_id)
--       ∈ current_user_district_ids() — SZEREP-SZŰRT (egyhazkeruleti_admin).
-- A korábbi szerep-szűrő nélküli `pr.scope='diocese'` és `pr.scope='district'`
-- ágak MEGSZŰNNEK — custom/konyvelo/lelkesz szerepű megyei sor többé nem ír.
-- A 2026-08-11-es RESTRICTIVE számvevő-tiltók (ha élnek) érintetlenül a
-- helyükön maradnak — mostantól redundáns biztonsági öv.

DO $policy_csere$
DECLARE
    r         record;
    v_felt    text;
    v_db      integer := 0;
BEGIN
    FOR r IN
        SELECT t.tabla FROM (VALUES
            ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
            ('diocese_koltsegvetes'), ('diocese_annual_reports')
        ) AS t(tabla)
    LOOP
        -- A repó és a produkció széthúzhat: tábla/oszlop-ellenőrzés előre.
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public' AND col.table_name = r.tabla
              AND col.column_name = 'diocese_id' AND col.data_type = 'uuid'
        ) THEN
            RAISE WARNING 'ℹ️ KIHAGYVA: %.diocese_id (uuid) nem létezik ebben az adatbázisban.', r.tabla;
            CONTINUE;
        END IF;

        IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = r.tabla) THEN
            RAISE WARNING '⛔ %-n NINCS BEKAPCSOLVA AZ RLS — a policy tétlen lesz!', r.tabla;
        END IF;

        v_felt := format(
            'public.current_user_has_global_access()
             OR %I.diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), ''{}''::uuid[]))
             OR (SELECT d.district_id FROM public.dioceses d WHERE d.id = %I.diocese_id)
                  = ANY (COALESCE((SELECT public.current_user_district_ids()), ''{}''::uuid[]))',
            r.tabla, r.tabla);

        -- (1) A FOR ALL fő-policy cseréje (azonos néven — csere, nem duplázás).
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_all', r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
               USING (%s) WITH CHECK (%s)',
            r.tabla || '_all', r.tabla, v_felt, v_felt);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
            r.tabla || '_all', r.tabla,
            '2026-08-15 (S1 biztonsági szelet): kanonikus, SZEREP-SZŰRT alak. Ágak: rendszergazda (current_user_has_global_access), megyei írók (current_user_diocese_ids — esperes/egyhazmegyei_admin), kerületi admin a megye VALÓDI kerületén át (current_user_district_ids). A korábbi, szerep-szűrő nélküli pr.scope=diocese/district ágak megszűntek: custom/konyvelo/lelkesz szerepű megyei sor nem írhatja a megye könyveit. A számvevő olvasása a külön FOR SELECT policy-ban él. App-tükör: apps/web/lib/auth/level-scope.ts.');

        -- (2) Számvevői/olvasói FOR SELECT — azonos néven és törzzsel, mint a
        --     2026-08-11-szamvevo fájl 1/C(1) lépése, hogy a két fájl bármely
        --     futtatási sorrendben ugyanoda konvergáljon.
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_szamvevo_select', r.tabla);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
               USING (%I.diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), ''{}''::uuid[])))',
            r.tabla || '_szamvevo_select', r.tabla, r.tabla);
        EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
            r.tabla || '_szamvevo_select', r.tabla,
            '2026-08-11/2026-08-15: a megye SAJÁT könyveinek OLVASÁSA az olvasói hatókörnek (írók + egyházmegyei számvevő). Csak SELECT — írási úton egyetlen policy sem hívja az olvasó feloldót.');

        v_db := v_db + 1;
        RAISE NOTICE '✅ % — szerep-szűrt FOR ALL + olvasó FOR SELECT.', r.tabla;
    END LOOP;

    IF v_db = 0 THEN
        RAISE EXCEPTION '⛔ EGYETLEN diocese_* tábla sem került cserére — a séma nem a várt (0/B lista).';
    END IF;
    RAISE NOTICE 'ÖSSZESEN % diocese_* tábla policy-ja cserélve.', v_db;
END
$policy_csere$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) document_submissions — a nullable-oszlopos policy kivezetése
-- ────────────────────────────────────────────────────────────────────────────
-- Sorrend: ELŐBB a pótló policy-k, UTÁNA a régi eldobása (egy tranzakcióban
-- amúgy is atomi, de így olvasva is nyilvánvaló, hogy nincs fedetlen pillanat).

-- (1) Rendszergazda-ág — eddig a diocese_access admin-karja adta; a kanonikus
--     szint-policy (felettes_szint_gyulekezet_ids) az admint NEM fedi.
DROP POLICY IF EXISTS document_submissions_global_all ON public.document_submissions;
CREATE POLICY document_submissions_global_all
  ON public.document_submissions
  FOR ALL TO authenticated
  USING      (public.current_user_has_global_access())
  WITH CHECK (public.current_user_has_global_access());
COMMENT ON POLICY document_submissions_global_all ON public.document_submissions IS
  '2026-08-15 (S1): rendszergazda-ág — a kivezetett document_submissions_diocese_access admin-karját pótolja, a kanonikus (szűkített, csak-admin) current_user_has_global_access() függvénnyel.';

-- (2) Kanonikus megyei/kerületi ág — byte-azonos a 2026-08-11-es fájl
--     3f szakaszával (idempotens újra-létrehozás, ha már élt).
DROP POLICY IF EXISTS document_submissions_szint_all ON public.document_submissions;
CREATE POLICY document_submissions_szint_all
  ON public.document_submissions
  FOR ALL TO authenticated
  USING      (document_submissions.congregation_id
              = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])))
  WITH CHECK (document_submissions.congregation_id
              = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));
COMMENT ON POLICY document_submissions_szint_all ON public.document_submissions IS
  '2026-08-11 (P1 #17) / 2026-08-15 (S1): megyei/kerületi TELJES hozzáférés a beküldött dokumentumokhoz a congregations.diocese_id VALÓDI láncán feloldva (szerep-szűrt kanonikus függvényeken át). A sor tárolt, nullable diocese_id oszlopán pivotáló régi document_submissions_diocese_access kivezetve.';

-- (3) A régi, nullable diocese_id oszlopon pivotáló policy kivezetése.
DROP POLICY IF EXISTS document_submissions_diocese_access ON public.document_submissions;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2 · diocese_*_all' AS szakasz,
       'Mind az 5 FOR ALL policy az ÚJ, szerep-szűrt alak? (current_user_diocese_ids-t hívja)' AS mit,
       (SELECT count(*)::text || ' / 5' FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname IN ('diocese_bealitas_all','diocese_befizetes_all','diocese_kiadas_all',
                             'diocese_koltsegvetes_all','diocese_annual_reports_all')
          AND COALESCE(qual, '')       LIKE '%current_user_diocese_ids%'
          AND COALESCE(with_check, '') LIKE '%current_user_diocese_ids%') AS ertek,
       'Ha nem 5: az 1/A ciklus kihagyott táblát — nézd a NOTICE/WARNING sorokat.' AS teendo

UNION ALL
SELECT 101, '2 · diocese_*_all',
       '⛔ Maradt-e szerep-szűrő nélküli profile_roles-ág az 5 policy-ban? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname IN ('diocese_bealitas_all','diocese_befizetes_all','diocese_kiadas_all',
                             'diocese_koltsegvetes_all','diocese_annual_reports_all')
          AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%profile_roles%'),
       'Ha nem 0: a csere nem futott le — a régi kézi EXISTS-lánc él még.'

UNION ALL
SELECT 102, '2 · OLVASÓ POLICY-K',
       'Az 5 diocese_* táblán él a _szamvevo_select FOR SELECT?',
       (SELECT count(*)::text || ' / 5' FROM pg_policies
        WHERE schemaname = 'public' AND cmd = 'SELECT'
          AND policyname IN ('diocese_bealitas_szamvevo_select','diocese_befizetes_szamvevo_select',
                             'diocese_kiadas_szamvevo_select','diocese_koltsegvetes_szamvevo_select',
                             'diocese_annual_reports_szamvevo_select')),
       'Ha nem 5: a számvevő olvasása hiányos.'

UNION ALL
SELECT 103, '2 · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI (nem SELECT) policy olvasó-feloldót? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.cmd <> 'SELECT'
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
                LIKE '%current_user_diocese_olvaso_ids%'),
       '⛔ Ha nem 0: valaki írási ágba tette az olvasó hatókört — az ellenőr írhatná, amit ellenőriz.'

UNION ALL
SELECT 110, '2 · document_submissions',
       'A régi document_submissions_diocese_access ELTŰNT? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname='public' AND tablename='document_submissions'
          AND policyname='document_submissions_diocese_access'),
       'Ha nem 0: a DROP nem futott le.'

UNION ALL
SELECT 111, '2 · document_submissions',
       'Él a document_submissions_szint_all ÉS a document_submissions_global_all? (2 = rendben)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname='public' AND tablename='document_submissions'
          AND policyname IN ('document_submissions_szint_all','document_submissions_global_all')),
       'Ha nem 2: az 1/B szakasz hiányos — az esperes vagy az admin elveszíthette a dokumentum-munkafolyamatot.'

UNION ALL
SELECT 120, '2 · GRANT-OK',
       'Mind az 5 függvényen EXECUTE az authenticated-nek? (5 = rendben)',
       (SELECT count(*)::text FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access','current_user_diocese_ids',
                            'current_user_district_ids','current_user_diocese_olvaso_ids',
                            'felettes_szint_gyulekezet_ids')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
       'Ha nem 5: GRANT hiányzik — 42501/403 a policy kiértékelésekor.'

UNION ALL
SELECT 121, '2 · GRANT-OK',
       'SELECT a public.dioceses-en az authenticated-nek?',
       CASE WHEN has_table_privilege('authenticated', 'public.dioceses', 'SELECT')
            THEN '✅ van' ELSE '⛔ NINCS' END,
       'Ha ⛔: GRANT SELECT ON public.dioceses TO authenticated;'

ORDER BY 1;
