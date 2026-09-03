-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — A HITELESÍTÉSI LÁNC P0-JAVÍTÁSAI, 1. KÖR   (2026-09-04)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ELŐZMÉNY: a 2026-09-03-i védelmi felülvizsgálat (120 megállapítás, 12 P0) +
-- a 2026-09-04-i javítás-előtti állapotfelmérés 20 blokkja. MINDEN itteni
-- javítás MÉRT éles állapotra épül, nem feltételezésre.
--
-- EBBEN A KÖRBEN CSAK OLYAN JAVÍTÁS VAN, AMI BIZONYÍTOTTAN NEM TÖR EL SEMMIT.
-- Ami kódváltoztatást is igényel (congregations-szűkítés, avatars privát bucket
-- + aláírt URL), az a 2. körbe kerül — szándékosan, mert a mérés szerint a
-- `congregations`-t 149 helyen olvassák, kettőt `select('*')`-gal.
--
-- ⚠️ MIÉRT NINCS BENNE TRIGGER-DDL: a `handle_new_user()`-t CREATE OR REPLACE
--    FUNCTION-nel cseréljük, a triggert MAGÁT nem dobjuk el és nem hozzuk újra.
--    A trigger-DDL forgalmas táblán percekig tartó PostgREST 503-vihart okoz
--    („schema cache… Retrying") — a függvény-csere ezt elkerüli.
--
-- ⚠️ NINCS TEMP TÁBLA (a Supabase SQL editor munkamenete nem garantált),
--    és NINCS `%%` a RAISE-ekben (42601).
--
-- FUTTATÁS: Supabase → SQL Editor → az EGÉSZ fájlt egyszerre → Run.
--   A végén EGYETLEN ellenőrző rács jön (az editor csak az utolsót mutatja).
--   Ha bármelyik szakasz őrszeme megszólal, a saját tranzakciója visszagördül.
--
-- MENTÉS-BESOROLÁS: ez a migráció NEM hoz létre táblát, ezért a
--   `backup_table_policy` besorolást nem érinti. (Munkaszabály: minden CREATE
--   TABLE-ös SQL-be ugyanoda besorolás is kell, különben a napi mentés
--   fail-closed megáll.)
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. SZAKASZ · A REGISZTRÁCIÓS TRIGGER  (P0·1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ AMI ROSSZ VOLT (mért éles törzs, 2026-09-03):
--      role = COALESCE(NEW.raw_user_meta_data->>'requested_role', 'lelkesz')
--    A `raw_user_meta_data`-t a GoTrue a HÍVÓTÓL kapja, ellenőrzés nélkül.
--    A `profiles_role_check` constraint az 'admin' és 'egyhazkeruleti_admin'
--    értéket is engedi, tehát a trigger simán beírta volna.
--
--    A HÁROM ALKALMAZÁS-ÚTVONAL TISZTA (ellenőrizve): a `/hozzaferes-kerese`
--    csak `full_name`-et küld, a tagi portál fix kulcskészletet, az OAuth-nál
--    a metaadatot a szolgáltató tölti. A rés a GoTrue signup végpontja, amit
--    a nyilvános anon kulccsal közvetlenül is meg lehet címezni — ott az
--    alkalmazás EGYETLEN validációja sem fut le, csak ez a trigger.
--
-- ✅ A JAVÍTÁS: a szerepkör többé nem a regisztráló szava. Minden új fiók a
--    legkisebb jogosultsággal születik; az emelés az admin dolga.
--
-- ✅ MÉRT KÁRMENTÉS-IGÉNY: 3 fiók hordoz `requested_role` metaadatot, MIND
--    'lelkesz'-t kért, mindhez van `access_requests` sor → NINCS mit
--    visszavenni. A lenti UPDATE ezért ma 0 sort ír; szándékosan itt van,
--    hogy ha mégis keletkezett volna ilyen sor a futtatásig, elrendezze.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $handle_new_user$
BEGIN
  -- Idempotens: ha már van profil-sor, kihagyjuk (a master-admin profilját a
  -- régi folyamatban kézzel hoztuk létre).
  --
  -- 2026-09-04 (P0.1): a `role` FIX 'lelkesz'. A regisztráló metaadata NEM
  -- dönthet jogosultságot. A nevet továbbra is elfogadjuk a metaadatból —
  -- az nem jogosultság, csak megjelenítés —, de hosszra vágjuk.
  INSERT INTO public.profiles (id, email, full_name, status, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    left(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        ''
      ),
      200
    ),
    'pending',
    'lelkesz',
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$handle_new_user$;

COMMENT ON FUNCTION public.handle_new_user() IS
  '2026-09-04 (P0.1): a profiles.role TOBBE NEM a raw_user_meta_data.requested_role ertekebol jon, hanem fixen lelkesz. A regisztralo altal kuldott metaadat nem donthet jogosultsagot. A status valtozatlanul pending.';

-- ─── ŐRSZEM: negatív asszert ────────────────────────────────────────────────
-- Ha bárki visszateszi a `requested_role`-t a törzsbe, ez a szakasz BUKJON.
-- (Munkaszabály: az őrszem játssza újra a RÉGI hibás viselkedést.)
DO $orszem_1$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_user'
      AND p.prosrc ILIKE '%requested_role%'
  ) THEN
    RAISE EXCEPTION
      'ORSZEM 1: a handle_new_user() MEG MINDIG olvassa a requested_role metaadatot. A P0.1 nincs lezarva.';
  END IF;
END
$orszem_1$;

-- ─── KÁRMENTÉS ──────────────────────────────────────────────────────────────
-- Metaadatból kapott EMELT szerepkör visszavétele olyan profilon, amely soha
-- nem lett aktiválva ÉS nincs hozzá egyező kérelem. A valódi, admin által
-- kiosztott szerepköröket (pl. az aktív egyhazmegyei_szamvevo) NEM érinti,
-- mert azok `status='active'`-ok.
UPDATE public.profiles p
   SET role = 'lelkesz'
 WHERE p.status = 'pending'
   AND p.role <> 'lelkesz'
   AND NOT EXISTS (
     SELECT 1
     FROM public.access_requests ar
     WHERE ar.resulting_user_id = p.id
       AND ar.requested_role = p.role
   );

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. SZAKASZ · A STÁTUSZ-VAK ADMIN-KAPUK  (P0·2 DB-oldali fele)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ AMI ROSSZ VOLT (mért éles törzsek):
--      is_admin():
--        SELECT EXISTS (SELECT 1 FROM public.profiles
--                       WHERE id = auth.uid() AND role = 'admin');
--      is_caller_admin_for_user_mgmt():
--        master-email VAGY profiles.role IN ('admin','egyhazkeruleti_admin')
--    Egyikben sincs `status`. A jóváhagyásra váró ('pending') és a visszavont
--    ('deleted') fiók is adminnak számított. Ez PONTOSAN az a fék, ami a
--    metaadat-injektálást ártalmatlanná tenné.
--
-- ✅ MÉRT KOCKÁZAT: 0. Egyetlen aktív admin van, és nincs olyan nem aktív
--    fiók, amelyik az elmúlt 30 napban használta a rendszert.
--    (Van EGY `deleted / konyvelo` emelt szerepű fiók — azt a kapu helyesen
--     zárja ki; soha nem is lépett be.)
--
-- ⚠️ A MASTER-ÁG SZÁNDÉKOSAN STÁTUSZ NÉLKÜL MARAD: ez a vészkijárat. Ha a fő
--    rendszergazda saját profilja elromlik, ő az egyetlen, aki meg tudná
--    javítani — a státusz-kapu épp őt zárná ki. A `(dashboard)/layout.tsx`
--    és az `(setup)/layout.tsx` ugyanezt a kivételt alkalmazza.
--
-- ⚠️ KÖVETŐ FELADAT (nem ebben a körben): a master-cím itt LITERÁL, mert a
--    meglévő törzs is az volt, és viselkedés-azonos cserét írok. Létezik egy
--    `is_master_admin()` függvény is; a kettő összevonása KÜLÖN kör, előbb az
--    `is_master_admin()` élő törzsét kell megmérni (a végi rács kiadja).

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $is_admin$
  -- 2026-09-04 (P0.2): + status = 'active'. A jova nem hagyott vagy visszavont
  -- fiok szerepkore nem ad jogot.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  );
$is_admin$;

COMMENT ON FUNCTION public.is_admin() IS
  '2026-09-04 (P0.2): a role mellett a status = active is kotelezo. Korabban egy pending vagy deleted profil admin szerepkore is jogot adott.';

CREATE OR REPLACE FUNCTION public.is_caller_admin_for_user_mgmt()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $is_caller_admin$
DECLARE
  caller_email text;
  caller_ok    boolean;
BEGIN
  -- (a) VESZKIJARAT: a fo rendszergazda statusz nelkul is atmegy. Ha a sajat
  --     profilja elromlik, o az egyetlen, aki meg tudja javitani.
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email = 'endreszocs@gmail.com' THEN
    RETURN TRUE;
  END IF;

  -- (b) 2026-09-04 (P0.2): a szerepkor CSAK aktiv profilon ad jogot.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin')
      AND status = 'active'
  ) INTO caller_ok;

  RETURN COALESCE(caller_ok, FALSE);
END;
$is_caller_admin$;

COMMENT ON FUNCTION public.is_caller_admin_for_user_mgmt() IS
  '2026-09-04 (P0.2): a szerepkor-ag mostantol status = active-ot is megkovetel. A master-email ag szandekosan statusz nelkuli veszkijarat.';

-- ─── ŐRSZEM: negatív asszert ────────────────────────────────────────────────
DO $orszem_2$
DECLARE
  v_hianyzo text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_hianyzo
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('is_admin', 'is_caller_admin_for_user_mgmt')
    AND p.prosrc NOT ILIKE '%status%';

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION
      'ORSZEM 2: ezek a kapuk MEG MINDIG nem neznek status-t: %. A P0.2 DB-oldali fele nincs lezarva.',
      v_hianyzo;
  END IF;
END
$orszem_2$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. SZAKASZ · A PÉNZÜGYI IMPORT HÍVÓ-AZONOSÍTÓJA  (P0·12)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ AMI ROSSZ VOLT: a jogosultság-ellenőrzés a KLIENS által küldött
--    `p_user_id` paraméterre épült:
--        WHERE pr.profile_id = p_user_id  AND pr.scope_id = p_congregation_id
--    Bárki, aki ismert egy másik gyülekezetben jogosult felhasználó
--    azonosítóját, annak a nevében írhatott pénzügyi tételt — és a
--    `befizetes.userid` / `kiadas.userid` oszlopba is a HAMIS azonosító került,
--    tehát a napló is őt terhelte.
--
-- ✅ MIÉRT NEM TÖR EL SEMMIT: a függvénynek EGYETLEN hívója van
--    (`apps/web/app/(dashboard)/penzugy/finance-import-actions.ts:868`), és az
--    a bejelentkezett felhasználó SAJÁT azonosítóját adja át
--    (`p_user_id: auth.userId`). A csere tehát viselkedés-azonos a jogos úton.
--
-- ✅ MIÉRT MARAD BENNE A PARAMÉTER: a szignatúra változtatása eltörné a
--    hívót (PostgREST a paraméternevek szerint kötődik). A paramétert
--    megtartjuk, de már NEM hiszünk neki: ha nem egyezik a hívóval,
--    FAIL-LOUD hibát adunk, nem néma átírást. Így egy elrontott jövőbeli hívó
--    kiderül, nem pedig csendben mást ír.
--
-- ⚠️ `auth.uid()` NULL esetén (service_role / migráció) SZÁNDÉKOSAN megállunk:
--    ma nincs ilyen hívó, és egy jövőbeli szerveroldali hívónak explicit
--    döntést kell hoznia arról, kinek a nevében ír.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.import_finance_batch(
  p_congregation_id uuid,
  p_user_id         uuid,
  p_items           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $import_finance_batch$
DECLARE
  v_actor       uuid;
  v_item        jsonb;
  v_kind        text;
  v_inserted    integer := 0;
  v_skipped     integer := 0;
  v_duplicates  integer := 0;
  v_errors      jsonb := '[]'::jsonb;
  v_xkey        uuid;
  v_idx         integer := 0;
  v_belso_mozgas_xkey uuid;
  v_bankszamla_id integer;
  v_datum       date;
  v_osszeg      numeric;
  v_iratszam    text;
  v_forrasa     text;
  v_atvevo      text;
  v_nyugta      text;
  v_fizetettev  integer;
  v_id_befizetescel integer;
  v_id_kiadascel    integer;
  v_existing_count  integer;
  v_key         text;
  v_seen        jsonb := '{}'::jsonb;
  v_seen_count  integer;
BEGIN
  -- ═══ 2026-09-04 (P0.12): A HIVO KILETE A TOKENBOL JON, NEM A PARAMETERBOL ═══
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'Az importalas csak bejelentkezett felhasznalo nevében futhat (auth.uid() ures).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FAIL-LOUD, nem nema atiras: ha a hivo mast allit magarol, az HIBA.
  IF p_user_id IS NOT NULL AND p_user_id <> v_actor THEN
    RAISE EXCEPTION
      'A megadott felhasznalo-azonosito nem egyezik a bejelentkezett felhasznaloval. Importalni csak a sajat neveben lehet.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gyulekezetenkenti sorositas (P0-21, 2026-08-28) — valtozatlan.
  PERFORM pg_advisory_xact_lock(
    hashtext('import_finance_batch'),
    hashtext(p_congregation_id::text)
  );

  -- ─── Jogosultsag-ellenorzes — MOSTANTOL v_actor-ra ────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    JOIN public.profiles pf ON pf.id = pr.profile_id
    WHERE pr.profile_id = v_actor
      AND pr.active = true
      AND pr.approval_status = 'approved'
      -- 2026-09-04 (P0.2 kiserohatas): a hivo profilja legyen AKTIV is.
      AND pf.status = 'active'
      AND (
        (pr.scope = 'system' AND pr.role = 'admin')
        OR
        (pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin')
        OR
        (pr.scope = 'congregation'
         AND pr.scope_id = p_congregation_id
         AND pr.role IN ('lelkesz', 'konyvelo'))
      )
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultsaga az importalashoz a megadott gyulekezetbe'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ─── Tetelek feldolgozasa (valtozatlan logika) ────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    v_kind := v_item->>'kind';

    BEGIN
      v_xkey := gen_random_uuid();
      v_belso_mozgas_xkey := NULLIF(v_item->>'belso_mozgas_xkey', '')::uuid;
      v_bankszamla_id := NULLIF(v_item->>'bankszamla_id', '')::integer;
      v_datum := (v_item->>'datum')::date;
      v_osszeg := (v_item->>'osszeg')::numeric;
      v_iratszam := coalesce(v_item->>'iratszam', '');
      v_forrasa := coalesce(v_item->>'forrasa', '');
      v_atvevo := coalesce(v_item->>'atvevo', '');
      v_nyugta := coalesce(v_item->>'nyugta', '');
      v_fizetettev := coalesce((v_item->>'fizetettev')::integer, 0);

      IF v_kind = 'income' THEN
        v_id_befizetescel := (v_item->>'id_befizetescel')::integer;

        v_key := md5('B' || chr(31) || v_datum::text || chr(31) || v_osszeg::text || chr(31)
          || v_id_befizetescel::text || chr(31) || v_iratszam || chr(31) || v_forrasa || chr(31)
          || coalesce(v_bankszamla_id::text, '-1') || chr(31) || v_nyugta || chr(31)
          || v_fizetettev::text);

        SELECT count(*) INTO v_existing_count
        FROM public.befizetes b
        WHERE b.congregation_id = p_congregation_id
          AND b.datum = v_datum
          AND b.osszeg = v_osszeg
          AND b.id_befizetescel = v_id_befizetescel
          AND coalesce(b.iratszam, '') = v_iratszam
          AND coalesce(b.forrasa, '') = v_forrasa
          AND coalesce(b.bankszamla_id, -1) = coalesce(v_bankszamla_id, -1)
          AND coalesce(b.nyugta, '') = v_nyugta
          AND coalesce(b.fizetettev, 0) = v_fizetettev
          AND b.deleted = false;

        v_seen_count := coalesce((v_seen->>v_key)::integer, 0);

        IF v_existing_count > v_seen_count THEN
          v_duplicates := v_duplicates + 1;
          v_seen := jsonb_set(v_seen, ARRAY[v_key], to_jsonb(v_seen_count + 1));
          CONTINUE;
        END IF;

        INSERT INTO public.befizetes (
          xkey, datum, osszeg, id_befizetescel, forrasa,
          nyugta, iratszam, irattipus, csalad, fizetettev, megjegyzes,
          id_szemely, id_csalad,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          v_xkey, v_datum, v_osszeg, v_id_befizetescel, v_forrasa,
          v_nyugta,
          v_iratszam,
          coalesce(v_item->>'irattipus', ''),
          coalesce((v_item->>'csalad')::boolean, false),
          (v_item->>'fizetettev')::integer,
          v_item->>'megjegyzes',
          NULLIF(v_item->>'id_szemely', '')::integer,
          NULLIF(v_item->>'id_csalad', '')::integer,
          v_bankszamla_id, v_belso_mozgas_xkey,
          -- 2026-09-04 (P0.12): a naplo-oszlop is a TOKENBOL jon.
          p_congregation_id, v_actor,
          now(), false, false
        );
        v_inserted := v_inserted + 1;
        v_seen := jsonb_set(v_seen, ARRAY[v_key], to_jsonb(v_seen_count + 1));

      ELSIF v_kind = 'expense' THEN
        v_id_kiadascel := (v_item->>'id_kiadascel')::integer;

        v_key := md5('K' || chr(31) || v_datum::text || chr(31) || v_osszeg::text || chr(31)
          || v_id_kiadascel::text || chr(31) || v_iratszam || chr(31) || v_atvevo || chr(31)
          || coalesce(v_bankszamla_id::text, '-1') || chr(31) || v_nyugta);

        SELECT count(*) INTO v_existing_count
        FROM public.kiadas k
        WHERE k.congregation_id = p_congregation_id
          AND k.datum = v_datum
          AND k.osszeg = v_osszeg
          AND k.id_kiadascel = v_id_kiadascel
          AND coalesce(k.iratszam, '') = v_iratszam
          AND coalesce(k.atvevo, '') = v_atvevo
          AND coalesce(k.bankszamla_id, -1) = coalesce(v_bankszamla_id, -1)
          AND coalesce(k.nyugta, '') = v_nyugta
          AND k.deleted = false;

        v_seen_count := coalesce((v_seen->>v_key)::integer, 0);

        IF v_existing_count > v_seen_count THEN
          v_duplicates := v_duplicates + 1;
          v_seen := jsonb_set(v_seen, ARRAY[v_key], to_jsonb(v_seen_count + 1));
          CONTINUE;
        END IF;

        INSERT INTO public.kiadas (
          xkey, datum, osszeg, id_kiadascel,
          nyugta, iratszam, irattipus, megjegyzes,
          atvevo, atvevoid,
          bankszamla_id, belso_mozgas_xkey,
          congregation_id, userid,
          created, deleted, is_potlas
        ) VALUES (
          v_xkey, v_datum, v_osszeg, v_id_kiadascel,
          v_nyugta,
          v_iratszam,
          coalesce(v_item->>'irattipus', ''),
          v_item->>'megjegyzes',
          v_atvevo,
          NULLIF(v_item->>'atvevoid', '')::integer,
          v_bankszamla_id, v_belso_mozgas_xkey,
          p_congregation_id, v_actor,
          now(), false, false
        );
        v_inserted := v_inserted + 1;
        v_seen := jsonb_set(v_seen, ARRAY[v_key], to_jsonb(v_seen_count + 1));

      ELSE
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'rowIndex', v_idx,
          'reason', 'Ismeretlen tételtípus: ' || coalesce(v_kind, '<null>')
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'rowIndex', v_idx,
        'reason', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'skippedDuplicates', v_duplicates,
    'errors', v_errors
  );
END;
$import_finance_batch$;

COMMENT ON FUNCTION public.import_finance_batch(uuid, uuid, jsonb) IS
  '2026-09-04 (P0.12): a jogosultsag-ellenorzes es a userid-naplo oszlop MOSTANTOL auth.uid()-bol jon, nem a kliens p_user_id parameterebol. A parameter megmaradt a hivo kompatibilitasa miatt, de elteres eseten FAIL-LOUD hiba.';

-- ─── ŐRSZEM: negatív asszert ────────────────────────────────────────────────
-- A régi hibás minta újrajátszása: ha a törzsben MARADT olyan hely, ahol a
-- `p_user_id` jogosultságot vagy naplót dönt, bukjunk.
DO $orszem_3$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'import_finance_batch'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'ORSZEM 3: az import_finance_batch nem talalhato.';
  END IF;

  IF v_src NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION
      'ORSZEM 3: az import_finance_batch NEM hivatkozik auth.uid()-ra. A P0.12 nincs lezarva.';
  END IF;

  IF v_src ILIKE '%pr.profile_id = p_user_id%' THEN
    RAISE EXCEPTION
      'ORSZEM 3: az import_finance_batch MEG MINDIG a kliens p_user_id-jebol dont jogosultsagot.';
  END IF;
END
$orszem_3$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. SZAKASZ · ÖNAKTIVÁLÁS EXPLICIT TILTÁSA  (mélységi védelem)
-- ════════════════════════════════════════════════════════════════════════════
--
-- HELYZET: az `admin_activate_user` önhívása MA IS blokkolt, de nem sajat
-- jogon: a `profiles_jogosultsag_vedelem_trg` BEFORE UPDATE trigger fogja meg
-- (`insufficient_privilege`). A védelem tehát EGYETLEN, a függvényből nem
-- látható triggeren áll. Ha valaki a triggert leejti, a P0 azonnal élővé válik.
--
-- ✅ A JAVÍTÁS: a függvény MONDJA KI maga is. Két sor, és a védelem többé nem
--    egy másik fájl mellékhatása.
--
-- ⚠️ A `master` itt NEM kivétel: a fő rendszergazda profilja már aktív, tehát
--    nincs mit önaktiválnia. Ha valaha kell, az explicit döntés legyen.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.admin_activate_user(
  p_user_id          uuid,
  p_congregation_id  uuid DEFAULT NULL,
  p_diocese_id       uuid DEFAULT NULL,
  p_district_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id          uuid,
  previous_status  text,
  new_status       text,
  was_updated      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $admin_activate_user$
DECLARE
  v_prev_status text;
  v_changed     boolean;
BEGIN
  -- Jogosultsag-kapu (a 2. szakasz ota status-tudatos).
  IF NOT public.is_caller_admin_for_user_mgmt() THEN
    RAISE EXCEPTION 'Nincs jogosultsaga a felhasznalo aktivalasara (admin / master / keruleti admin szukseges).'
      USING HINT = 'Lepjen be admin fiokkal vagy kerjen jogosultsagot.';
  END IF;

  -- 2026-09-04 (melysegi vedelem): SENKI nem aktivalhatja SAJAT MAGAT.
  -- Eddig ezt csak a profiles_jogosultsag_vedelem_trg trigger fogta meg —
  -- vagyis a vedelem egy masik fajl mellekhatasan allt.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Sajat fiok nem aktivalhato. A jovahagyast mas rendszergazdanak kell elvegeznie.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_prev_status FROM public.profiles WHERE id = p_user_id;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'A felhasznalo nem talalhato (id=%).', p_user_id;
  END IF;

  IF v_prev_status = 'pending' THEN
    UPDATE public.profiles
       SET status          = 'active',
           congregation_id = COALESCE(p_congregation_id, congregation_id),
           diocese_id      = COALESCE(p_diocese_id, diocese_id),
           district_id     = COALESCE(p_district_id, district_id)
     WHERE id = p_user_id;
    RETURN QUERY SELECT p_user_id, v_prev_status, 'active'::text, TRUE;
    RETURN;
  END IF;

  IF v_prev_status = 'active'
     AND (p_congregation_id IS NOT NULL OR p_diocese_id IS NOT NULL OR p_district_id IS NOT NULL) THEN
    UPDATE public.profiles
       SET congregation_id = COALESCE(p_congregation_id, congregation_id),
           diocese_id      = COALESCE(p_diocese_id, diocese_id),
           district_id     = COALESCE(p_district_id, district_id)
     WHERE id = p_user_id
       AND (
         congregation_id IS DISTINCT FROM COALESCE(p_congregation_id, congregation_id)
         OR diocese_id   IS DISTINCT FROM COALESCE(p_diocese_id, diocese_id)
         OR district_id  IS DISTINCT FROM COALESCE(p_district_id, district_id)
       );
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN QUERY SELECT p_user_id, v_prev_status, v_prev_status, (v_changed > 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT p_user_id, v_prev_status, v_prev_status, FALSE;
END;
$admin_activate_user$;

COMMENT ON FUNCTION public.admin_activate_user(uuid, uuid, uuid, uuid) IS
  '2026-09-04: + explicit onaktivalas-tilalom (p_user_id = auth.uid()). Eddig ezt csak a profiles_jogosultsag_vedelem_trg trigger fogta meg, vagyis a vedelem egy masik fajl mellekhatasan allt.';

DO $orszem_4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_activate_user'
      AND p.prosrc ILIKE '%p_user_id = auth.uid()%'
  ) THEN
    RAISE EXCEPTION
      'ORSZEM 4: az admin_activate_user-bol hianyzik az onaktivalas-tilalom.';
  END IF;

  -- A masodik reteg is alljon: a trigger MEGLETE kotelezo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND NOT tgisinternal
      AND tgname = 'profiles_jogosultsag_vedelem_trg'
  ) THEN
    RAISE EXCEPTION
      'ORSZEM 4: hianyzik a profiles_jogosultsag_vedelem_trg trigger. Ez a MASODIK vedelmi vonal, kotelezo.';
  END IF;
END
$orszem_4$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. SZAKASZ · A FÁJLTÁR ÍRÁSI POLICY-I  (P0·7)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ AMI ROSSZ VOLT (mért éles policy-k):
--      avatars_auth_insert / _update / _delete | authenticated | (bucket_id = 'avatars')
--    Semmilyen hatókör: BÁRMELY bejelentkezett fiók BÁRMELY gyülekezet
--    tagfotóját felülírhatta, elmozgathatta vagy törölhette. Az útvonal
--    determinisztikus: {congregation_id}/szemely-{szemely_id}.jpg
--
-- ✅ MÉRT KOCKÁZAT AZ ÁTÁLLÍTÁSRA: NULLA. Az `avatars` bucket ÜRES (0 objektum
--    — a 2026-09-04-i felmérés 12. blokkja). Nincs mit migrálni, nincs mit
--    eltörni. Ez a legjobb pillanat rá.
--
-- ✅ A MINTA: a repóban MÁR VAN helyesen megírt, hatókör-ellenőrzött policy —
--    a `gyulekezeti_dokumentumok_*` és az `iktato_csatolmanyok_*`. Ugyanazt a
--    hármas feltételt használom (skalár gyülekezet VAGY profile_roles-sor
--    VAGY országos hozzáférés), hogy egyetlen új minta se keletkezzen.
--
-- ⚠️ AMI NEM EBBEN A KÖRBEN VAN: az `avatars` bucket PUBLIKUS marad, tehát a
--    link birtokában a kép még letölthető (P0·6). A priváttá tétel kódot is
--    érint — a `getPublicUrl` hívásokat aláírt URL-re kell cserélni három
--    helyen (apps/web/.../avatar-actions.ts:164, apps/desktop/src/lib/avatar.ts:146,
--    és a megjelenítő oldal). Az a 2. kör. Az ÍRÁS zárása viszont most,
--    azonnal megtehető, és a felülírás/törlés a súlyosabb fele.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

DROP POLICY IF EXISTS avatars_auth_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_update ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_delete ON storage.objects;

-- A tagfoto elso utvonal-szegmense a gyulekezet azonositoja.
CREATE POLICY avatars_scoped_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (public.current_user_congregation_id())::text
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        JOIN public.profiles pf ON pf.id = pr.profile_id
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND (pr.scope_id)::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
          AND pf.status = 'active'
      )
      OR public.current_user_has_global_access()
    )
  );

CREATE POLICY avatars_scoped_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (public.current_user_congregation_id())::text
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        JOIN public.profiles pf ON pf.id = pr.profile_id
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND (pr.scope_id)::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
          AND pf.status = 'active'
      )
      OR public.current_user_has_global_access()
    )
  );

CREATE POLICY avatars_scoped_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (public.current_user_congregation_id())::text
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        JOIN public.profiles pf ON pf.id = pr.profile_id
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND (pr.scope_id)::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
          AND pf.status = 'active'
      )
      OR public.current_user_has_global_access()
    )
  );

-- ─── misszios-muhely: az iras legalabb AKTIV szemelyzethez legyen kotve ────
-- A regi policy csak azt kerte, hogy a hivo `authenticated` legyen — vagyis
-- barmely frissen regisztralt, jova NEM hagyott fiok is tolthetett fel a
-- publikus bucketbe.
DROP POLICY IF EXISTS mm_storage_insert ON storage.objects;

CREATE POLICY mm_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'misszios-muhely'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
    )
  );

-- ─── ŐRSZEM: negatív asszert ────────────────────────────────────────────────
-- A régi hibás minta újrajátszása: ha MARAD olyan avatars-írási policy,
-- amelynek a feltételében CSAK a bucket_id szerepel, bukjunk.
DO $orszem_5$
DECLARE
  v_lista text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
    INTO v_lista
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    AND COALESCE(qual, with_check, '') LIKE '%avatars%'
    AND COALESCE(qual, with_check, '') NOT LIKE '%foldername%';

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION
      'ORSZEM 5: hatokor nelkuli avatars-irasi policy maradt: %. A P0.7 nincs lezarva.',
      v_lista;
  END IF;
END
$orszem_5$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. SZAKASZ · FÖLÖSLEGES anon JOGOK VISSZAVONÁSA  (P1/P2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- (a) TÖRZSADAT-ÍRÁS: az `anon` szerepnek DELETE/INSERT/UPDATE joga van hat
--     törzsadat-táblára. A mérés (15. blokk) szerint EGYETLEN olyan írási
--     policy sincs, ami az anon-t tényleg átengedné — a GRANT tehát ma
--     hatástalan. Ez épp ezért fájdalommentesen visszavonható, és a
--     mélységi védelem helyreáll: egy jövőbeli, véletlenül permisszív policy
--     ne találjon mögötte nyitott GRANT-ot.
--
-- (b) FELSOROLÓ ORÁKULUMOK: a `login_email_status` és a
--     `registration_email_info` SECURITY DEFINER függvényeknek anon EXECUTE
--     joga van, és MINDKETTŐNEK NULLA HÍVÓJA a kódban (ellenőrizve az egész
--     repóban). Halott kód, ami cserébe elárulja, hogy egy e-mail létezik-e a
--     rendszerben — pontosan az, amit az űrlapok anti-enumeration válaszai
--     el akarnak titkolni.
--
-- (c) ADMINISZTRATÍV / ROMBOLÓ RPC-K: a mérés szerint 97 SECURITY DEFINER
--     függvény hívható PUBLIC joggal. Nem mindet nyúlom meg egy körben — a
--     ROMBOLÓ és ADMINISZTRATÍV részét igen. Mindegyiknek van belső hívói
--     kapuja, tehát ez mélységi védelem: az anon már a hívásig se jusson el.

BEGIN;

SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '2min';

-- (a) törzsadat-írás
REVOKE INSERT, UPDATE, DELETE ON public.befizetescel  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.csoport       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.kiadascel     FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.nevnap        FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.nom_cimlet    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.szamadasicel  FROM anon;

-- (b) felsoroló orákulumok — hívó nélküli halott kód
DO $revoke_orakulumok$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('login_email_status', 'registration_email_info')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', v_fn.sig);
    RAISE NOTICE 'anon/PUBLIC EXECUTE visszavonva: %', v_fn.sig;
  END LOOP;
END
$revoke_orakulumok$;

-- (c) adminisztratív / romboló RPC-k: PUBLIC ki, authenticated marad
DO $revoke_admin_rpc$
DECLARE
  v_fn record;
  v_nevek text[] := ARRAY[
    'admin_erase_user',
    'admin_reject_user',
    'admin_revoke_assignment',
    'admin_sync_legacy_role',
    'admin_activate_user',
    'admin_create_or_reinit_assignment',
    'admin_scan_cross_congregation_duplicates',
    'admin_list_cross_congregation_matches',
    'admin_resolve_cross_match_pair',
    'admin_notify_cross_match_pastors',
    'complete_congregation_transfer',
    'initiate_congregation_transfer',
    'import_finance_batch',
    'import_family_head_batch',
    'import_families_from_existing_persons_batch',
    'infer_family_links_for_congregation',
    'erase_my_account'
  ];
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_nevek)
  LOOP
    -- Eloszor mindent le, aztan celzottan vissza. Igy az anon es a PUBLIC
    -- egyszerre esik ki, a mukodo hivok (authenticated) pedig megmaradnak.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn.sig);
    RAISE NOTICE 'PUBLIC/anon ki, authenticated vissza: %', v_fn.sig;
  END LOOP;
END
$revoke_admin_rpc$;

-- ─── ŐRSZEM ────────────────────────────────────────────────────────────────
DO $orszem_6$
DECLARE
  v_lista text;
BEGIN
  -- Maradt-e anon iras a hat torzsadat-tablan?
  SELECT string_agg(DISTINCT table_name || '.' || privilege_type, ', ')
    INTO v_lista
  FROM information_schema.role_table_grants
  WHERE grantee = 'anon'
    AND table_schema = 'public'
    AND table_name IN ('befizetescel','csoport','kiadascel','nevnap','nom_cimlet','szamadasicel')
    AND privilege_type IN ('INSERT','UPDATE','DELETE');

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 6: anon irasi jog maradt: %', v_lista;
  END IF;

  -- Hivhatja-e meg az anon a felsorolo orakulumokat?
  SELECT string_agg(DISTINCT p.proname, ', ')
    INTO v_lista
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN LATERAL aclexplode(p.proacl) a ON true
  WHERE n.nspname = 'public'
    AND p.proname IN ('login_email_status','registration_email_info')
    AND (a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon'));

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM 6: a felsorolo orakulumot meg hivhatja az anon vagy a PUBLIC: %', v_lista;
  END IF;
END
$orszem_6$;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ RÁCS — EGYETLEN UNION ALL
-- (az SQL editor csak az utolsó rácsot mutatja; több SELECT esetén a korábbi
--  válaszok elvesznének)
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

SELECT 1 AS sor, 'P0.1 trigger'::text AS mit,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='handle_new_user'
      AND p.prosrc ILIKE '%requested_role%')
  THEN '⛔ MEG MINDIG olvassa a requested_role-t'
  ELSE '✅ a metaadat-eszkalacio lezarva' END::text AS eredmeny

UNION ALL
SELECT 2, 'P0.2 is_admin',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_admin' AND p.prosrc ILIKE '%status%')
  THEN '✅ nezi a status-t' ELSE '⛔ NEM nezi a status-t' END

UNION ALL
SELECT 3, 'P0.2 is_caller_admin_for_user_mgmt',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_caller_admin_for_user_mgmt'
      AND p.prosrc ILIKE '%status%')
  THEN '✅ nezi a status-t' ELSE '⛔ NEM nezi a status-t' END

UNION ALL
SELECT 4, 'P0.12 import_finance_batch',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='import_finance_batch'
      AND p.prosrc ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%pr.profile_id = p_user_id%')
  THEN '✅ a hivo kilete a tokenbol jon' ELSE '⛔ meg a parameterbol dont' END

UNION ALL
SELECT 5, 'Onaktivalas-tilalom',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='admin_activate_user'
      AND p.prosrc ILIKE '%p_user_id = auth.uid()%')
  THEN '✅ explicit tilalom a fuggvenyben' ELSE '⛔ csak a trigger vedi' END

UNION ALL
SELECT 6, 'P0.7 avatars irasi policy-k',
  COALESCE((
    SELECT string_agg(policyname || ' (' || cmd || ')', ', ' ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND COALESCE(qual, with_check,'') LIKE '%avatars%'
      AND cmd IN ('INSERT','UPDATE','DELETE')
  ), 'nincs avatars irasi policy')

UNION ALL
SELECT 7, 'anon irasi jogok',
  COALESCE((
    SELECT string_agg(DISTINCT table_name || ':' || privilege_type, ', ')
    FROM information_schema.role_table_grants
    WHERE grantee='anon' AND table_schema='public'
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ), '✅ az anon-nak MAR NINCS irasi joga egyetlen public tablara sem')

UNION ALL
SELECT 8, 'anon-hivhato SECURITY DEFINER fuggvenyek (marado lista)',
  COALESCE((
    SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN LATERAL aclexplode(p.proacl) a ON true
    WHERE n.nspname='public' AND p.prosecdef
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname='anon')
  ), 'nincs ilyen')

UNION ALL
SELECT 9, 'PUBLIC-hivhato SECURITY DEFINER fuggvenyek darabszama',
  (SELECT COUNT(DISTINCT p.oid)::text || ' db (a kor elott 97 volt)'
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
   WHERE n.nspname='public' AND p.prosecdef
     AND (p.proacl IS NULL OR a.grantee = 0))

UNION ALL
-- ── KÖVETŐ KÖRHÖZ: az is_master_admin() elo torzse (osszevonasi dontes) ──
SELECT 10, 'is_master_admin() elo torzse (a kovetkezo kor inputja)',
  COALESCE((SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='is_master_admin' LIMIT 1),
           '(nincs ilyen fuggveny)')

UNION ALL
SELECT 11, 'Karmentes: maradt-e emelt szerepu pending profil?',
  COALESCE((
    SELECT string_agg(p.email || ' → ' || p.role, ', ')
    FROM public.profiles p
    WHERE p.status='pending' AND p.role <> 'lelkesz'
  ), '✅ nincs emelt szerepu, jovahagyasra varo profil')

) AS ellenorzes ORDER BY sor;
