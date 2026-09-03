-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — P0-JAVÍTÁSOK, 2. KÖR · DEADLOCK-ÁLLÓ ÚJRAÍRÁS   (2026-09-04)
-- ════════════════════════════════════════════════════════════════════════════
--
-- EZ A FÁJL A `2026-09-04-auth-p0-javitasok-2.sql` HELYETT FUT.
-- Az eredeti deadlockkal megállt:
--   Process A: AccessExclusiveLock-ra várt a 16745-ös relation-en
--   Process B: AccessShareLock-ra várt az 53090-esen  → körkörös várakozás
--
-- ⛔ MI VOLT A HIBA A SZKRIPTBEN (nem a szerverben):
--    A 2. szakasz EGYETLEN tranzakcióba tette a `REVOKE`-ot, a policy-cserét
--    ÉS az őrszemet. A `REVOKE` és a `DROP POLICY` AccessExclusiveLock-ot vesz
--    az `access_requests`-en, és a tranzakció végéig NEM ENGEDI EL. Utána
--    ugyanabban a tranzakcióban futott az őrszem, ami az `information_schema`-t
--    és a `pg_policies`-t olvassa — az pedig tucatnyi rendszerkatalógusra kér
--    AccessShareLock-ot. Közben az élő alkalmazás is dolgozott: a másik
--    folyamat pont arra a táblára várt, amit én fogtam, én meg arra a
--    katalógusra, amit ő. Kör → deadlock.
--
--    Ugyanaz a hibaosztály, amiért a trigger-DDL-t kerültem az 1. körben —
--    csak a policy-DDL-nél nem gondoltam végig. A tanulság általánosabb:
--    ⚠️ HOSSZÚ TRANZAKCIÓ + TÁBLA-SZINTŰ KIZÁRÓ ZÁR + KATALÓGUS-OLVASÁS
--       ÉLŐ FORGALOM MELLETT = DEADLOCK. A hármasból bármelyik kettő elég.
--
-- ✅ A JAVÍTÁS: NINCS explicit tranzakció a DDL körül. Minden utasítás
--    külön autocommitál, tehát a zárolást azonnal elengedi. Az őrszem és az
--    ellenőrzés a DDL UTÁN, önálló utasításként fut — soha nem egy táblát
--    fogó tranzakcióban.
--
-- ✅ `lock_timeout`: ha egy DDL 5 másodpercen belül nem kapja meg a zárat,
--    HANGOSAN elbukik ahelyett, hogy deadlockig várna. Ilyenkor csak futtasd
--    újra — a fájl idempotens.
--
-- ⚠️ MIÉRT BIZTONSÁGOS A TRANZAKCIÓ NÉLKÜLISÉG: minden lenti utasítás
--    önmagában is helyes és megismételhető (`IF EXISTS`, `CREATE OR REPLACE`).
--    Ha valamelyik elbukik, a korábbiak érvényben maradnak, és az újrafuttatás
--    onnan folytatja. Nincs olyan köztes állapot, ami nyitva hagyna valamit:
--    a policy-k cseréjénél a DROP+CREATE párokat úgy rendeztem, hogy a
--    szigorúbb állapot előbb álljon elő (először az anon jogot vesszük el).
--
-- ⏰ MIKOR FUTTASD: lehetőleg olyankor, amikor nem dolgozik senki a rendszerben.
--    Előtte érdemes lefuttatni a `docs/2026-09-04-deadlock-utani-allapot.sql`
--    8. blokkját — az megmutatja, fut-e épp valami.
-- ════════════════════════════════════════════════════════════════════════════

-- Ha 5 mp alatt nem kapjuk meg a zárat, bukjunk hangosan (ne deadlockig várjunk).
SET lock_timeout = '5s';
SET statement_timeout = '60s';


-- ════════════════════════════════════════════════════════════════════════════
-- 1. is_master_admin() — A NEGYEDIK STÁTUSZ-VAK KAPU
-- ════════════════════════════════════════════════════════════════════════════
--
-- Az 1. kör ellenőrző rácsának 10. sora adta ki az élő törzset: mind a három
-- ága státusz-vak volt. Négy éles kapu épül rá (három iktató-RPC +
-- az átadás-kereszt-iktatás), mind `IF NOT is_master_admin() AND NOT EXISTS(...)`
-- alakban — egy `pending` vagy visszavont `role='admin'` profil átment volna.
--
-- ⚠️ A NÉV FÉLREVEZET, DE MOST NEM NYÚLOK HOZZÁ: az (a) ág sima `role='admin'`,
--    tehát a függvény BÁRMELY rendszergazdát átengedi, nem csak a fő
--    rendszergazdát. Az átnevezés/szűkítés megváltoztatná, KI fér hozzá az
--    iktató-RPC-khez — az önálló döntés. Most csak a biztonsági rés zárul.
--
-- Ez az utasítás NEM zárol táblát (csak a pg_proc sorát), tehát a deadlock
-- szempontjából ártalmatlan.

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $is_master_admin$
  SELECT
    -- (a) profiles.role = 'admin'  — 2026-09-04: + status = 'active'
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
    -- (b) system-scope admin a profile_roles-ban — 2026-09-04: a HORDOZO
    --     PROFIL is legyen aktiv, kulonben egy visszavont fiok ottfelejtett
    --     sora adna jogot.
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
    -- (c) master e-mail — SZANDEKOSAN statusz nelkuli veszkijarat. Ha a fo
    --     rendszergazda profilja elromlik, o az egyetlen, aki megjavithatja.
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = 'endreszocs@gmail.com'
    );
$is_master_admin$;

COMMENT ON FUNCTION public.is_master_admin() IS
  '2026-09-04 (P0.2 harmadik testver): az (a) es (b) ag statusz-tudatos. A (c) e-mail ag szandekos veszkijarat. FIGYELEM: a nev felrevezet — az (a) ag barmely role=admin profilra igaz.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. access_requests — ÍRÁS ZÁRÁSA
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ AMI ROSSZ VOLT: `GRANT INSERT ... TO anon` + `WITH CHECK (true)` policy.
--    Bárki közvetlenül beszúrhatott sort a PostgREST-en át, megkerülve a
--    szerver-akció teljes validációját (hierarchia-keresztellenőrzés,
--    dokumentum-vizsgálat, idempotencia, rate-limit) — miközben az admin
--    jóváhagyó felülete PONTOSAN ezt a sort olvassa igazságforrásként.
--
-- ✅ MIÉRT NEM TÖR EL SEMMIT — MÉRVE: az `access_requests`-be az egész
--    kódbázisban EGYETLEN hely ír
--    (`apps/web/app/(public)/hozzaferes-kerese/actions.ts:321`), és az a
--    SERVICE_ROLE klienst használja, ami az RLS-t és a policy-ket amúgy is
--    megkerüli. A publikus űrlap tehát változatlanul működik.
--
-- SORREND: előbb a GRANT-ot vesszük el (szigorúbb állapot), utána a policy-t.
-- Így ha a második elbukna, a rés akkor is zárva van.

REVOKE INSERT ON public.access_requests FROM anon;

DROP POLICY IF EXISTS access_requests_insert ON public.access_requests;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. access_requests — OLVASÁS ÉS MÓDOSÍTÁS A KÖZÖS KAPURA
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ AMI ROSSZ VOLT: a két admin-policy feltétele BEÉGETETT és STÁTUSZ-VAK
--    (`profiles.role = 'admin'`). Egy jóváhagyásra váró vagy visszavont
--    „admin" kiolvashatta az ÖSSZES kérelmet: neveket, e-mail-címeket,
--    telefonszámokat, indoklást — még jóvá nem hagyott jelentkezők adatait.
--
-- ✅ Mostantól a közös `public.is_admin()`-t hívják, ami az 1. kör óta
--    státusz-tudatos. Egy helyen javítva, nem hat helyen ismételve.
--
-- ⚠️ MINDEN DROP+CREATE PÁR KÜLÖN UTASÍTÁS, tranzakció nélkül. A DROP és a
--    CREATE között van egy pillanat, amikor az adott policy nem létezik —
--    ez FAIL-CLOSED irányba téved (nincs policy = nincs hozzáférés), tehát
--    a rés nem nyílik ki, legfeljebb egy admin-lekérdezés ad üres listát
--    a köztes ezredmásodpercben.

DROP POLICY IF EXISTS access_requests_select_admin ON public.access_requests;

CREATE POLICY access_requests_select_admin ON public.access_requests
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS access_requests_update_admin ON public.access_requests;

CREATE POLICY access_requests_update_admin ON public.access_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ════════════════════════════════════════════════════════════════════════════
-- 4. ŐRSZEM — a DDL UTÁN, önálló utasításként
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ EZ A LÉNYEG: az őrszem katalógus-olvasásai (information_schema,
--    pg_policies) NEM futhatnak olyan tranzakcióban, ami táblát zárol.
--    Az eredeti fájlban pont ez okozta a deadlockot. Itt már minden DDL
--    commitolt, ez a blokk semmit nem fog.

DO $orszem$
DECLARE
  v_lista text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_master_admin' AND p.prosrc ILIKE '%status%'
  ) THEN
    RAISE EXCEPTION 'ORSZEM: az is_master_admin() meg mindig statusz-vak.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee='anon' AND table_schema='public'
      AND table_name='access_requests' AND privilege_type='INSERT'
  ) THEN
    RAISE EXCEPTION 'ORSZEM: az anon INSERT GRANT megmaradt az access_requests-en.';
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_lista
  FROM pg_policies
  WHERE schemaname='public' AND tablename='access_requests' AND cmd='INSERT'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM: anon INSERT policy maradt: %', v_lista;
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_lista
  FROM pg_policies
  WHERE schemaname='public' AND tablename='access_requests'
    AND COALESCE(qual,'') LIKE '%role%=%admin%'
    AND COALESCE(qual,'') NOT LIKE '%is_admin()%';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM: beegetett, statusz-vak admin-feltetel maradt: %', v_lista;
  END IF;

  RAISE NOTICE 'ORSZEM: minden kapu a helyen.';
END
$orszem$;


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
SELECT 2, 'access_requests INSERT policy',
  COALESCE((SELECT string_agg(policyname || ' [' || array_to_string(roles,',') || ']', ', ')
            FROM pg_policies WHERE schemaname='public' AND tablename='access_requests' AND cmd='INSERT'),
           '✅ nincs INSERT policy — csak a service_role ir (megkeruli az RLS-t)')

UNION ALL
SELECT 3, 'access_requests anon GRANT-ok',
  COALESCE((SELECT string_agg(privilege_type, ', ')
            FROM information_schema.role_table_grants
            WHERE grantee='anon' AND table_schema='public' AND table_name='access_requests'),
           '✅ az anon-nak semmilyen joga nincs az access_requests-en')

UNION ALL
SELECT 4, 'access_requests admin-policy-k',
  COALESCE((SELECT string_agg(policyname || ' → ' || COALESCE(qual,'—'), E'\n' ORDER BY policyname)
            FROM pg_policies WHERE schemaname='public' AND tablename='access_requests')
           , 'nincs policy')

UNION ALL
SELECT 5, 'Osszes anon irasi jog a public semaban',
  COALESCE((SELECT string_agg(DISTINCT table_name || ':' || privilege_type, ', ')
            FROM information_schema.role_table_grants
            WHERE grantee='anon' AND table_schema='public'
              AND privilege_type IN ('INSERT','UPDATE','DELETE')),
           '✅ az anon-nak MAR NINCS irasi joga egyetlen public tablara sem')

UNION ALL
SELECT 6, 'Az 1. kor valtozatlan-e',
  (SELECT 'handle_new_user: ' ||
     CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='handle_new_user'
                         AND p.prosrc ILIKE '%requested_role%') THEN '⛔' ELSE '✅' END
   || ' | is_admin: ' ||
     CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='is_admin'
                         AND p.prosrc ILIKE '%status%') THEN '✅' ELSE '⛔' END
   || ' | import_finance_batch: ' ||
     CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='import_finance_batch'
                         AND p.prosrc ILIKE '%auth.uid()%') THEN '✅' ELSE '⛔' END
   || ' | avatars scoped policy: ' ||
     COALESCE((SELECT COUNT(*)::text FROM pg_policies
               WHERE schemaname='storage' AND tablename='objects'
                 AND policyname LIKE 'avatars_scoped_%'),'0') || '/3')

) AS ellenorzes ORDER BY sor;
