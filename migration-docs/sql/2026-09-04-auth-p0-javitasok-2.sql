-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ⛔ EZT A FÁJLT NE FUTTASD. HELYETTE:                                     ║
-- ║     migration-docs/sql/2026-09-04-auth-p0-javitasok-2b.sql               ║
-- ║                                                                          ║
-- ║  MIÉRT: ez a változat 2026-09-04-én DEADLOCKKAL megállt éles adatbázison.║
-- ║  A 2. szakasz egyetlen tranzakcióba tette a REVOKE-ot, a policy-cserét és║
-- ║  az őrszemet. A REVOKE/DROP POLICY AccessExclusiveLock-ot vesz az        ║
-- ║  access_requests-en és a tranzakció végéig fogja; az őrszem viszont      ║
-- ║  ugyanabban a tranzakcióban olvassa az information_schema-t, ami         ║
-- ║  katalógus-zárakat kér. Élő forgalom mellett ez körkörös várakozás.      ║
-- ║                                                                          ║
-- ║  A 2b ugyanezt csinálja, de tranzakció NÉLKÜL: minden utasítás külön     ║
-- ║  autocommitál, így egyik sem tartja a zárolást, amíg a másikra vár.      ║
-- ║                                                                          ║
-- ║  MEGTARTVA, mert a hibaosztályt dokumentálja:                            ║
-- ║  hosszú tranzakció + tábla-szintű kizáró zár + katalógus-olvasás         ║
-- ║  élő forgalom mellett = deadlock.                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — A HITELESÍTÉSI LÁNC P0-JAVÍTÁSAI, 2. KÖR   (2026-09-04)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ELŐZMÉNY: az 1. kör (2026-09-04-auth-p0-javitasok-1.sql) mind a 6 szakasza
-- lefutott és zölden ellenőrzött. Az 1. kör ellenőrző rácsának 10. sora viszont
-- EGY ÚJABB HIBÁT tett láthatóvá — ez a kör azt zárja le, plusz két olyan
-- tételt, amelynek a kockázatát azóta mértük ki.
--
-- MIÉRT NINCS BENNE A congregations-SZŰKÍTÉS: a `congregations` táblát 149
-- helyen olvassuk, kettőt `select('*')`-gal. Egy elhamarkodott oszlop-megvonás
-- vagy policy-szűkítés némán eltörné a beállítás-varázslót. Az a 3. kör, és
-- előtte külön mérés kell arról, mely olvasási helyeknek KELL idegen
-- gyülekezet sora. Helyette ebben a körben a naptár-token FORGATHATÓVÁ vált
-- (kód-oldal, ugyanebben a változtatásban) — így egy kiszivárgott hivatkozásra
-- legalább van válasz.
--
-- ⚠️ NINCS TEMP TÁBLA, NINCS `%%` A RAISE-EKBEN, NINCS TRIGGER-DDL.
-- ⚠️ Nem hoz létre táblát → a `backup_table_policy` besorolást nem érinti.
--
-- FUTTATÁS: Supabase → SQL Editor → az EGÉSZ fájl → Run. A végén egy rács.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. SZAKASZ · A NEGYEDIK STÁTUSZ-VAK KAPU: is_master_admin()
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ HOGYAN KERÜLT ELŐ: az 1. kör ellenőrző rácsának 10. sora kiadta az élő
--    törzset. Három ága van, és EGYIK SEM néz `profiles.status`-t:
--      (a) profiles.role = 'admin'
--      (b) profile_roles system-scope admin (active + approved — de a PROFIL
--          státuszát nem nézi)
--      (c) master e-mail
--
-- ⛔ MIT JELENT: négy éles kapu épül rá (`2026-07-11-f1-iktato-rpc-k.sql`
--    három RPC-je + `2026-07-25-f8c-atadas-kereszt-iktatas.sql`), mind
--    `IF NOT public.is_master_admin() AND NOT EXISTS (...)` alakban. Egy
--    jóváhagyásra váró vagy visszavont `role='admin'` profil ezeken átment
--    volna — pontosan az a rés, amit az 1. kör az `is_admin()`-on és az
--    `is_caller_admin_for_user_mgmt()`-en már bezárt. Ez a harmadik testvér.
--
-- ✅ MÉRT KOCKÁZAT: 0. Egyetlen aktív admin van, és nincs nem aktív fiók,
--    amelyik az elmúlt 30 napban dolgozott volna.
--
-- ⚠️ A NÉV FÉLREVEZET — DE MOST NEM NYÚLOK HOZZÁ. Az (a) ág valójában
--    `role='admin'`, tehát a függvény NEM „master admin"-t jelent, hanem
--    „bármely rendszergazdát". A saját kommentje ki is mondja. A NÉV és a
--    VISELKEDÉS széthúzása önálló hibaosztály — de az átnevezés/szűkítés
--    megváltoztatná, KI fér hozzá az iktató RPC-khez, ami külön döntés.
--    Most CSAK a biztonsági rést zárom, a szemantikát érintetlenül hagyom.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $is_master_admin$
  SELECT
    -- (a) profiles.role = 'admin' (a master user profil-role-ja is ez)
    --     2026-09-04: + status = 'active'
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
    -- (b) system-scope admin szerepkor a profile_roles-ban
    --     2026-09-04: + a HORDOZO PROFIL is legyen aktiv. Enelkul egy
    --     visszavont fiok ottfelejtett profile_roles sora jogot adna.
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      JOIN public.profiles p2 ON p2.id = pr.profile_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND p2.status = 'active'
    )
    -- (c) master admin e-mail veszkijarat — SZANDEKOSAN statusz nelkul.
    --     Ha a fo rendszergazda sajat profilja elromlik, o az egyetlen, aki
    --     meg tudja javitani. Ugyanez a kivetel el az is_caller_admin_for_user_mgmt()-ben.
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = 'endreszocs@gmail.com'
    );
$is_master_admin$;

COMMENT ON FUNCTION public.is_master_admin() IS
  '2026-09-04 (P0.2 harmadik testver): az (a) es (b) ag mostantol profiles.status = active-ot is megkovetel. A (c) e-mail ag szandekosan statusz nelkuli veszkijarat. FIGYELEM: a nev felrevezet, az (a) ag barmely role=admin profilra igaz — a szemantika tisztazasa kulon kor.';

DO $orszem_1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_master_admin'
      AND p.prosrc ILIKE '%status%'
  ) THEN
    RAISE EXCEPTION
      'ORSZEM 1: az is_master_admin() MEG MINDIG nem nez profiles.status-t.';
  END IF;
END
$orszem_1$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. SZAKASZ · A HOZZÁFÉRÉS-KÉRELMEK ÍRÁSA ÉS OLVASÁSA  (P0·3, P1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ (a) AMI ROSSZ VOLT AZ ÍRÁS OLDALÁN:
--        access_requests_insert | INSERT | anon, authenticated | WITH CHECK (true)
--        + `GRANT INSERT ... TO anon`
--    Bárki közvetlenül beszúrhatott sort a PostgREST-en át, megkerülve a
--    szerver-akció TELJES validációját: az e-mail- és jelszó-ellenőrzést, a
--    kerület→megye→gyülekezet hierarchia keresztellenőrzését, a szerveroldali
--    dokumentum-vizsgálatot (MIME + mágikus bájtok + 10 MB), az idempotenciát
--    és a rate-limitet. Az admin jóváhagyó felülete pedig EZT a sort olvassa
--    igazságforrásként.
--
-- ✅ MIÉRT NEM TÖR EL SEMMIT A ZÁRÁS — MÉRVE, NEM FELTÉTELEZVE:
--    az `access_requests`-be az EGÉSZ kódbázisban EGYETLEN hely ír
--    (`apps/web/app/(public)/hozzaferes-kerese/actions.ts:321`), és az a
--    SERVICE_ROLE klienst (`adminClient`) használja. A service_role az RLS-t
--    és a policy-ket amúgy is megkerüli, tehát sem az anon GRANT-ra, sem a
--    permisszív INSERT-policy-re NINCS SZÜKSÉGE. A publikus űrlap tehát
--    változatlanul működik.
--    (A `createPublicServerClient()` az anon kulccsal csak a rate-limit RPC-t
--     hívja — annak az anon EXECUTE joga szándékosan megmarad.)
--
-- ⛔ (b) AMI ROSSZ VOLT AZ OLVASÁS OLDALÁN:
--        access_requests_select_admin | USING (profiles.role = 'admin')
--        access_requests_update_admin | ugyanaz
--    A feltétel BEÉGETETT és STÁTUSZ-VAK. Egy `pending` vagy visszavont
--    „admin" profil kiolvashatta az ÖSSZES hozzáférés-kérelmet: nevek,
--    e-mail-címek, telefonszámok, indoklás — különleges kategóriájú adatot is
--    hordozó, még jóvá nem hagyott jelentkezők adatai.
--    Mostantól a policy a KÖZÖS `public.is_admin()`-t hívja, ami az 1. kör óta
--    status-tudatos. Egy helyen javítva, nem hat helyen ismételve.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

-- (a) ÍRÁS: az anon jog és a permisszív policy megszűnik.
REVOKE INSERT ON public.access_requests FROM anon;
DROP POLICY IF EXISTS access_requests_insert ON public.access_requests;

-- (b) OLVASÁS/MÓDOSÍTÁS: a beégetett, státusz-vak feltétel helyett a közös kapu.
DROP POLICY IF EXISTS access_requests_select_admin ON public.access_requests;
CREATE POLICY access_requests_select_admin ON public.access_requests
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS access_requests_update_admin ON public.access_requests;
CREATE POLICY access_requests_update_admin ON public.access_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── ŐRSZEM: a régi hibás világ újrajátszása ────────────────────────────────
DO $orszem_2$
DECLARE
  v_lista text;
BEGIN
  -- Maradt-e barmilyen policy, ami az anon-nak enged INSERT-et?
  SELECT string_agg(policyname, ', ')
    INTO v_lista
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'access_requests'
    AND cmd = 'INSERT'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 2: anon INSERT policy maradt az access_requests-en: %', v_lista;
  END IF;

  -- Maradt-e anon INSERT GRANT?
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
      AND table_name = 'access_requests' AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'ORSZEM 2: az anon INSERT GRANT megmaradt az access_requests-en.';
  END IF;

  -- Maradt-e BEEGETETT, statusz-vak admin-feltetel a policy-kben?
  SELECT string_agg(policyname, ', ')
    INTO v_lista
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'access_requests'
    AND COALESCE(qual, '') LIKE '%role%=%admin%'
    AND COALESCE(qual, '') NOT LIKE '%is_admin()%';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION
      'ORSZEM 2: beegetett, statusz-vak admin-feltetel maradt: %. Hasznald a kozos is_admin()-t.',
      v_lista;
  END IF;
END
$orszem_2$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ RÁCS
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

SELECT 1 AS sor, 'is_master_admin() statusz-kapu'::text AS mit,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_master_admin' AND p.prosrc ILIKE '%status%')
  THEN '✅ nezi a status-t' ELSE '⛔ NEM nezi' END::text AS eredmeny

UNION ALL
SELECT 2, 'access_requests INSERT policy-k',
  COALESCE((SELECT string_agg(policyname || ' [' || array_to_string(roles,',') || ']', ', ')
            FROM pg_policies WHERE schemaname='public' AND tablename='access_requests' AND cmd='INSERT'),
           '✅ nincs INSERT policy — csak a service_role ir (az RLS-t megkeruli)')

UNION ALL
SELECT 3, 'access_requests anon GRANT-ok',
  COALESCE((SELECT string_agg(privilege_type, ', ')
            FROM information_schema.role_table_grants
            WHERE grantee='anon' AND table_schema='public' AND table_name='access_requests'),
           '✅ az anon-nak semmilyen joga nincs az access_requests-en')

UNION ALL
SELECT 4, 'access_requests admin-policy-k feltetele',
  COALESCE((SELECT string_agg(policyname || ' → ' || COALESCE(qual,'—'), E'\n' ORDER BY policyname)
            FROM pg_policies WHERE schemaname='public' AND tablename='access_requests'),
           'nincs policy')

UNION ALL
SELECT 5, 'Osszes anon irasi jog a public semaban',
  COALESCE((SELECT string_agg(DISTINCT table_name || ':' || privilege_type, ', ')
            FROM information_schema.role_table_grants
            WHERE grantee='anon' AND table_schema='public'
              AND privilege_type IN ('INSERT','UPDATE','DELETE')),
           '✅ az anon-nak MAR NINCS irasi joga egyetlen public tablara sem')

UNION ALL
-- ── A 3. KÖR INPUTJA: mely olvasasi helyeknek KELL idegen gyulekezet sora? ──
SELECT 6, 'congregations: hany sort lat ma egy atlagos lelkesz?',
  (SELECT 'osszesen ' || COUNT(*)::text || ' gyulekezet, es a congregations_select policy-je USING(true) → mindet mindenki latja'
   FROM public.congregations)

UNION ALL
SELECT 7, 'congregations erzekeny oszlopainak kitoltottsege',
  (SELECT 'naptar-token: ' || COUNT(*) FILTER (WHERE calendar_feed_token IS NOT NULL)::text
       || ' | IBAN: ' || COUNT(*) FILTER (WHERE iban IS NOT NULL AND iban <> '')::text
       || ' | adoszam: ' || COUNT(*) FILTER (WHERE adoszam IS NOT NULL AND adoszam <> '')::text
       || ' | e-mail: ' || COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')::text
       || ' | telefon: ' || COUNT(*) FILTER (WHERE telefon IS NOT NULL AND telefon <> '')::text
   FROM public.congregations)

) AS ellenorzes ORDER BY sor;
