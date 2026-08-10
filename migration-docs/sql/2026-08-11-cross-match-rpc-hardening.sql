-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — P0 BIZTONSÁGI JAVÍTÁS: kereszt-gyülekezeti RPC-k lezárása
-- Dátum: 2026-08-11
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ─── MI VOLT A LYUK? ────────────────────────────────────────────────────────
--
-- Két SECURITY DEFINER függvény `GRANT EXECUTE … TO authenticated` joggal futott,
-- MINDENFÉLE hívó-oldali hatókör-ellenőrzés NÉLKÜL. Bármely érvényes
-- `authenticated` JWT (tehát egy frissen, önkiszolgáló módon regisztrált,
-- MÉG JÓVÁ NEM HAGYOTT, `profiles.status = 'pending'` fiók is!) meg tudta hívni
-- őket a publikus Supabase URL-en és az anon kulccsal — az app-rétegbeli
-- ellenőrzések teljes megkerülésével:
--
--   1) get_cross_match_pastor_contacts(uuid[])
--      (migration-docs/sql/2026-07-14-kereszt-gyulekezeti-lelkesz-kontakt.sql)
--      A hívó által küldött gyülekezet-UUID tömbre válaszolt, kapcsolat-
--      ellenőrzés és tömb-hossz korlát nélkül. A gyülekezet-UUID-k listája
--      NYILVÁNOS: a `congregations_for_registration()` RPC `anon`-nak is
--      GRANT-olt. Egyetlen hívással kinyerhető volt az ORSZÁG ÖSSZES
--      gyülekezeti lelkészének neve, személyes e-mail-címe és telefonszáma,
--      plusz a gyülekezetek hivatalos e-mail/telefon adatai.
--
--   2) find_potential_cross_congregation_match(text,text,text,date,int,uuid)
--      (migration-docs/sql/2026-04-26-cross-congregation-matching.sql)
--      Országos név-/telefon-orákulum: tetszőleges névre vagy PUSZTA
--      telefonszámra visszaadta a `szemely` egyházi CNP-jét, teljes nevét és a
--      gyülekezetét — a TELJES országos tagállományból. A `phone_only`
--      confidence-ág miatt egy telefonszám önmagában is elég lekérdezőkulcs
--      volt (fordított telefonkönyv), a `name_only` ág pedig egy nyilvános
--      névlistából végigpörgetve az egész országos tagnyilvántartást kiadta.
--      Az app-oldali wrapper (apps/web/lib/members/cross-congregation-actions.ts)
--      ráadásul a KLIENS által küldött `p_exclude_congregation_id`-t továbbította,
--      így a hívó a saját-gyülekezet kizárását is ki tudta kapcsolni.
--
--      Pontosan ez az a képesség, amit a `feedback_gyulekezeti_autonomia` elv
--      (a 2026-04-26-os fájl fejléce is idézi) meg akar akadályozni.
--
-- ─── MI A JAVÍTÁS? ──────────────────────────────────────────────────────────
--
--   A) Mindkét függvény FAIL-CLOSED kaput kap: `auth.uid()` kötelező +
--      `public.current_user_is_active_staff()` (aktív tisztségviselő). A `pending`
--      önregisztrált fiók így SEMMIT nem kap — kivételt kap.
--
--   B) get_cross_match_pastor_contacts: csak olyan gyülekezet elérhetőségét adja
--      ki, amelyhez a hívónak VALÓDI köze van:
--        (a) a hívó által amúgy is elérhető gyülekezet
--            (`current_user_can_access_congregation`), VAGY
--        (b) a `cross_congregation_match_notifications`-ban rögzített egyezés
--            köti a hívó által elérhető gyülekezethez, VAGY
--        (c) ÚJ TAG felvitelekor (ilyenkor még NINCS notification-sor, mert a
--            trigger csak mentés UTÁN fut): a hívó bizonyítja, hogy ismeri a
--            személy azonosító adatait — a megadott név + telefon VAGY név +
--            születési dátum ERŐS egyezést ad az adott gyülekezetben.
--      Plusz: legfeljebb 20 gyülekezet kérhető egy hívásban.
--
--   C) find_potential_cross_congregation_match KETTÉVÁLIK:
--        · public.find_cross_congregation_match_internal(...) — a régi,
--          őrizetlen törzs. NEM GRANT-olt (PUBLIC/anon/authenticated REVOKE):
--          kizárólag szerveroldalról, a `tg_szemely_check_cross_congregation`
--          triggerből (SECURITY DEFINER, auth.uid() = NULL) hívható.
--        · public.find_potential_cross_congregation_match(...) — a publikus,
--          ŐRZÖTT wrapper (VÁLTOZATLAN szignatúra, hogy az app hívása működjön).
--      A wrapper szabályai:
--        · aktív tisztségviselő kötelező;
--        · a `p_exclude_congregation_id` paramétert FIGYELMEN KÍVÜL HAGYJA, és
--          MINDIG a szerveroldalon feloldott saját gyülekezetet zárja ki
--          (`current_user_congregation_id()`) — a kliens nem tudja kikapcsolni
--          a saját-gyülekezet kizárását;
--        · csaladnev ÉS k_nev kötelező → PUSZTA TELEFONRA nincs keresés
--          (a fordított telefonkönyv megszűnik);
--        · ha a keresett név a hívó SAJÁT (elérhető) állományában is szerepel
--          („az ÉN tagom van-e máshol is?"), minden confidence-szint jöhet;
--        · ha NEM (tehát idegen névre kérdez), csak ERŐS egyezés adható vissza
--          (`name_phone` / `name_birth`), és kötelező hozzá telefon vagy
--          születési dátum. Így a lekérdezés MEGERŐSÍTÉS, nem FELDERÍTÉS:
--          találathoz előre ismerni kell a személy telefonját vagy szül. dátumát,
--          egy nyilvános névlista önmagában semmit nem ad.
--        · legfeljebb 20 találat / hívás (tömeges leszívás ellen).
--
--   D) A `tg_szemely_check_cross_congregation` trigger a BELSŐ függvényt hívja,
--      így az automatikus (mentés utáni) egyezés-rögzítés VÁLTOZATLANUL működik.
--
--   E) A 2026-08-09-es admin RPC-k (admin_scan_cross_congregation_duplicates,
--      admin_list_cross_congregation_matches, admin_notify_cross_match_pastors,
--      admin_resolve_cross_match_pair) SAJÁT set-alapú lekérdezést használnak,
--      NEM hívják ezt a két függvényt, és már ma is admin-kapuzottak
--      (`ccm_caller_is_system_admin` / `ccm_caller_district_ids`) → ÉRINTETLENEK.
--
-- ─── MI MARAD NYITVA (külön javítás kell) ──────────────────────────────────
--   · Hívásszám-korlát (per-user call budget) NINCS ebben a fájlban: ahhoz
--     naplótábla + VOLATILE függvény kellene. A 20-as találat/tömb korlát és az
--     „erős egyezés kötelező" szabály a tömeges leszívást így is megtöri.
--   · A `congregations_for_registration()` továbbra is `anon`-nak GRANT-olt
--     (az egész gyülekezet-UUID lista) — önmagában ártalmatlan, de minden
--     hatókör nélküli RPC-hez ez adja a felsorolási kulcsot.
--
-- Idempotens: CREATE OR REPLACE + DROP … IF EXISTS. Újrafuttatható.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. ELŐFELTÉTELEK — fail-closed őrszem
-- ────────────────────────────────────────────────────────────────────────────
--
-- A javítás három meglévő RLS-segédre épül (2026-04-12-phase-0-rls-hardening.sql,
-- ill. 2026-07-01-bug2-rls-comembership). Ha bármelyik hiányzik, INKÁBB álljon
-- meg az egész tranzakció, mint hogy egy hiányzó segéd miatt csendben
-- „mindenkinek igaz" kapu készüljön.

DO $elofeltetel$
DECLARE
  v_can_access boolean;
  v_own_cong   boolean;
  v_staff      boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_can_access_congregation'
  ) INTO v_can_access;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_congregation_id'
  ) INTO v_own_cong;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_is_active_staff'
  ) INTO v_staff;

  IF NOT v_can_access THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — hiányzik a public.current_user_can_access_congregation() segéd. Előbb futtasd a 2026-04-12-phase-0-rls-hardening.sql fájlt.';
  END IF;

  IF NOT v_own_cong THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — hiányzik a public.current_user_congregation_id() segéd. Előbb futtasd a 2026-04-12-phase-0-rls-hardening.sql fájlt.';
  END IF;

  -- A current_user_is_active_staff() MÁR LÉTEZIK (2026-04-12), ezért NEM írjuk
  -- felül — csak akkor hozzuk létre, ha valamiért hiányozna (fail-closed:
  -- aktív, nem törölt, nem anonimizált profil kell hozzá).
  IF NOT v_staff THEN
    RAISE NOTICE '2026-08-11: a current_user_is_active_staff() hiányzott — létrehozzuk.';
    EXECUTE $ujstaff$
      CREATE FUNCTION public.current_user_is_active_staff()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $staff_body$
        SELECT
          auth.uid() IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.status = 'active'
          );
      $staff_body$;
    $ujstaff$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_is_active_staff() TO authenticated';
  END IF;
END
$elofeltetel$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. BELSŐ (őrizetlen) kereső — CSAK szerveroldalról hívható
-- ────────────────────────────────────────────────────────────────────────────
--
-- Ez a 2026-04-26-os eredeti törzs, változatlan logikával. Azért kell külön,
-- mert a `tg_szemely_check_cross_congregation` trigger NINCS bejelentkezett
-- felhasználó kontextusában (auth.uid() lehet NULL, és a mentést végző lelkész
-- hatóköre sem szabhatja meg a rendszer-szintű duplikátum-figyelést).
--
-- ⚠️ EZT A FÜGGVÉNYT SOHA NE GRANT-OLD `authenticated`-nek. A publikus felület
--    kizárólag az alábbi (2. pont) őrzött wrapper.

CREATE OR REPLACE FUNCTION public.find_cross_congregation_match_internal(
    p_csaladnev text,
    p_k_nev text,
    p_telefon text DEFAULT NULL,
    p_sz_datum date DEFAULT NULL,
    p_exclude_szemely_id integer DEFAULT NULL,
    p_exclude_congregation_id uuid DEFAULT NULL
) RETURNS TABLE(
    matched_szemely_id integer,
    matched_congregation_id uuid,
    matched_congregation_name text,
    egyhazi_cnp varchar(20),
    matched_csaladnev varchar(30),
    matched_k_nev varchar(25),
    confidence text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $find_internal$
DECLARE
    v_norm_full_name text;
    v_norm_phone text;
BEGIN
    v_norm_full_name := public.normalize_name(
        COALESCE(p_csaladnev, '') || ' ' || COALESCE(p_k_nev, '')
    );
    v_norm_phone := public.normalize_phone(p_telefon);

    -- Védelem: ha sem név sem telefon nincs, ne dolgozzunk
    IF v_norm_full_name IS NULL AND v_norm_phone IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT DISTINCT ON (s.id)
        s.id::integer AS matched_szemely_id,
        s.congregation_id AS matched_congregation_id,
        COALESCE(c.nev_hu, c.name, 'Ismeretlen gyülekezet')::text AS matched_congregation_name,
        s.cnp AS egyhazi_cnp,
        s.csaladnev AS matched_csaladnev,
        s.k_nev AS matched_k_nev,
        CASE
            WHEN v_norm_phone IS NOT NULL
                 AND public.normalize_phone(s.telefon) = v_norm_phone
                 AND public.normalize_name(
                     COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                 ) = v_norm_full_name
                THEN 'name_phone'
            WHEN p_sz_datum IS NOT NULL
                 AND s.sz_datum = p_sz_datum
                 AND public.normalize_name(
                     COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                 ) = v_norm_full_name
                THEN 'name_birth'
            WHEN v_norm_phone IS NOT NULL
                 AND public.normalize_phone(s.telefon) = v_norm_phone
                THEN 'phone_only'
            ELSE 'name_only'
        END::text AS confidence
    FROM public.szemely s
    LEFT JOIN public.congregations c ON c.id = s.congregation_id
    WHERE s.isvisible = true
      AND (p_exclude_szemely_id IS NULL OR s.id != p_exclude_szemely_id)
      AND (p_exclude_congregation_id IS NULL OR s.congregation_id != p_exclude_congregation_id)
      AND (
          (v_norm_full_name IS NOT NULL
           AND public.normalize_name(
               COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
           ) = v_norm_full_name)
          OR
          (v_norm_phone IS NOT NULL
           AND s.telefon IS NOT NULL
           AND public.normalize_phone(s.telefon) = v_norm_phone)
      )
    ORDER BY s.id, confidence;
END;
$find_internal$;

COMMENT ON FUNCTION public.find_cross_congregation_match_internal(text, text, text, date, integer, uuid) IS
    '2026-08-11 — BELSŐ, ŐRIZETLEN kereszt-gyülekezeti kereső. KIZÁRÓLAG szerveroldalról (tg_szemely_check_cross_congregation trigger) hívható. TILOS authenticated/anon jogot adni rá — a publikus felület a find_potential_cross_congregation_match őrzött wrapper.';

-- Fail-closed jogosultság: a PUBLIC alapértelmezett EXECUTE-ot is elvesszük.
REVOKE ALL ON FUNCTION public.find_cross_congregation_match_internal(text, text, text, date, integer, uuid)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_cross_congregation_match_internal(text, text, text, date, integer, uuid)
    FROM anon;
REVOKE ALL ON FUNCTION public.find_cross_congregation_match_internal(text, text, text, date, integer, uuid)
    FROM authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PUBLIKUS, ŐRZÖTT wrapper — VÁLTOZATLAN szignatúra
-- ────────────────────────────────────────────────────────────────────────────
--
-- Az app (apps/web/lib/members/cross-congregation-actions.ts → findPotentialCrossMatch)
-- ugyanezzel a 6 paraméterrel hívja, tehát a felület átírás nélkül tovább működik.
-- A `p_exclude_congregation_id` megmarad a szignatúrában (visszafelé
-- kompatibilitás), de a törzs FIGYELMEN KÍVÜL HAGYJA.

CREATE OR REPLACE FUNCTION public.find_potential_cross_congregation_match(
    p_csaladnev text,
    p_k_nev text,
    p_telefon text DEFAULT NULL,
    p_sz_datum date DEFAULT NULL,
    p_exclude_szemely_id integer DEFAULT NULL,
    p_exclude_congregation_id uuid DEFAULT NULL
) RETURNS TABLE(
    matched_szemely_id integer,
    matched_congregation_id uuid,
    matched_congregation_name text,
    egyhazi_cnp varchar(20),
    matched_csaladnev varchar(30),
    matched_k_nev varchar(25),
    confidence text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $find_guarded$
#variable_conflict use_column
DECLARE
    v_caller uuid := auth.uid();
    v_own_cong uuid;
    v_norm_name text;
    v_sajat_tag boolean := false;
    v_csak_eros boolean;
BEGIN
    -- (1) Fail-closed kapu: bejelentkezés + AKTÍV tisztségviselő.
    --     A `pending` önregisztrált fiók itt elbukik.
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — a kereszt-gyülekezeti keresés nem érhető el.';
    END IF;

    IF NOT public.current_user_is_active_staff() THEN
        RAISE EXCEPTION 'Nincs jogosultság a kereszt-gyülekezeti kereséshez (a fiók nem aktív tisztségviselő).';
    END IF;

    -- (2) Név KÖTELEZŐ (mindkét tag). Puszta telefonra NINCS keresés — az
    --     fordított telefonkönyv lenne az egész országos állományon.
    IF COALESCE(btrim(p_csaladnev), '') = '' OR COALESCE(btrim(p_k_nev), '') = '' THEN
        RETURN;
    END IF;

    v_norm_name := public.normalize_name(
        COALESCE(p_csaladnev, '') || ' ' || COALESCE(p_k_nev, '')
    );
    IF v_norm_name IS NULL THEN
        RETURN;
    END IF;

    -- (3) A kizárandó gyülekezet MINDIG a szerveroldalon feloldott sajátunk —
    --     a kliens `p_exclude_congregation_id` értékét szándékosan eldobjuk.
    v_own_cong := public.current_user_congregation_id();

    -- (4) „Az ÉN tagom van-e máshol is?" — a keresett név szerepel-e a hívó
    --     számára amúgy is elérhető állományban?
    SELECT EXISTS (
        SELECT 1
        FROM public.szemely s
        WHERE s.isvisible = true
          AND s.congregation_id IS NOT NULL
          AND public.normalize_name(
                COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
              ) = v_norm_name
          AND public.current_user_can_access_congregation(s.congregation_id)
    ) INTO v_sajat_tag;

    -- (5) Idegen névre CSAK erős egyezés adható vissza, és ahhoz kötelező a
    --     telefon vagy a születési dátum → MEGERŐSÍTÉS, nem FELDERÍTÉS.
    v_csak_eros := NOT v_sajat_tag;

    IF v_csak_eros AND p_telefon IS NULL AND p_sz_datum IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.matched_szemely_id,
        m.matched_congregation_id,
        m.matched_congregation_name,
        m.egyhazi_cnp,
        m.matched_csaladnev,
        m.matched_k_nev,
        m.confidence
    FROM public.find_cross_congregation_match_internal(
        p_csaladnev,
        p_k_nev,
        p_telefon,
        p_sz_datum,
        p_exclude_szemely_id,
        v_own_cong           -- ⚠️ NEM a kliens p_exclude_congregation_id-ja
    ) m
    WHERE (NOT v_csak_eros OR m.confidence IN ('name_phone', 'name_birth'))
    LIMIT 20;                -- tömeges leszívás ellen
END;
$find_guarded$;

COMMENT ON FUNCTION public.find_potential_cross_congregation_match(text, text, text, date, integer, uuid) IS
    '2026-08-11 (P0-javítás) — ŐRZÖTT kereszt-gyülekezeti kereső. Csak AKTÍV tisztségviselő hívhatja; a kizárt gyülekezet MINDIG a szerveroldali saját (a kliens p_exclude_congregation_id-ja figyelmen kívül marad); csaladnev+k_nev kötelező (puszta telefonra nincs keresés); idegen névre csak name_phone/name_birth erős egyezés jön, telefon vagy szül. dátum kötelező mellé; max. 20 találat. A törzs a nem GRANT-olt find_cross_congregation_match_internal-t hívja.';

GRANT EXECUTE ON FUNCTION public.find_potential_cross_congregation_match(text, text, text, date, integer, uuid)
    TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. A TRIGGER a BELSŐ függvényt hívja (a mentés utáni figyelés változatlan)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Csak a hívott függvény neve változik — a logika (erős egyezésre notification-
-- sor, ON CONFLICT DO NOTHING) szó szerint azonos a 2026-04-26-ossal.

CREATE OR REPLACE FUNCTION public.tg_szemely_check_cross_congregation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $check_ccm$
DECLARE
    v_match record;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.csaladnev IS NOT DISTINCT FROM OLD.csaladnev
           AND NEW.k_nev IS NOT DISTINCT FROM OLD.k_nev
           AND NEW.telefon IS NOT DISTINCT FROM OLD.telefon THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.isvisible IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- 2026-08-11: a BELSŐ (őrizetlen) keresőt hívjuk — a trigger szerveroldali
    -- kontextusban fut (auth.uid() lehet NULL), az őrzött wrapper itt elbukna.
    FOR v_match IN
        SELECT * FROM public.find_cross_congregation_match_internal(
            NEW.csaladnev,
            NEW.k_nev,
            NEW.telefon,
            NEW.sz_datum,
            NEW.id,
            NEW.congregation_id
        )
        WHERE confidence IN ('name_phone', 'name_birth')
    LOOP
        INSERT INTO public.cross_congregation_match_notifications (
            notification_type,
            triggering_szemely_id,
            triggering_congregation_id,
            matched_szemely_id,
            matched_congregation_id,
            confidence
        ) VALUES (
            CASE WHEN TG_OP = 'INSERT' THEN 'new_member' ELSE 'update_match' END,
            NEW.id,
            NEW.congregation_id,
            v_match.matched_szemely_id,
            v_match.matched_congregation_id,
            v_match.confidence
        )
        ON CONFLICT (triggering_szemely_id, matched_szemely_id, confidence) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$check_ccm$;

COMMENT ON FUNCTION public.tg_szemely_check_cross_congregation() IS
    'AFTER INSERT/UPDATE trigger a szemely táblán: kereszt-gyülekezeti egyezés (name_phone, name_birth) rögzítése. 2026-08-11 óta a nem GRANT-olt find_cross_congregation_match_internal-t hívja.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. get_cross_match_pastor_contacts — kapcsolat-ellenőrzés + tömb-korlát
-- ────────────────────────────────────────────────────────────────────────────
--
-- A régi, EGY paraméteres változatot eldobjuk, és egy bővített szignatúrával
-- hozzuk vissza. Az új paraméterek DEFAULT NULL-osak, ezért a jelenlegi app-hívás
-- (csak `p_congregation_ids`) TOVÁBBRA IS feloldódik erre a függvényre — a
-- felület a SQL futása előtt és után is működik.
--
-- Az `p_csaladnev`/`p_k_nev`/`p_telefon`/`p_sz_datum` a (c) ág „bizonyítéka":
-- új tag felvitelekor még nincs notification-sor, de a hívó igazolni tudja, hogy
-- ismeri a személy azonosító adatait (név + telefon VAGY név + szül. dátum), és
-- ezek ERŐS egyezést adnak a kért gyülekezetben.

DROP FUNCTION IF EXISTS public.get_cross_match_pastor_contacts(uuid[]);

CREATE OR REPLACE FUNCTION public.get_cross_match_pastor_contacts(
    p_congregation_ids uuid[],
    p_csaladnev text DEFAULT NULL,
    p_k_nev text DEFAULT NULL,
    p_telefon text DEFAULT NULL,
    p_sz_datum date DEFAULT NULL
) RETURNS TABLE(
    congregation_id uuid,
    congregation_name text,
    pastor_name text,
    pastor_email text,
    pastor_phone text,
    congregation_email text,
    congregation_phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $contacts_guarded$
#variable_conflict use_column
DECLARE
    v_caller uuid := auth.uid();
    v_ids uuid[];
    v_db integer;
    v_norm_name text;
    v_norm_phone text;
BEGIN
    -- (1) Fail-closed kapu
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — a lelkész-elérhetőség nem kérhető le.';
    END IF;

    IF NOT public.current_user_is_active_staff() THEN
        RAISE EXCEPTION 'Nincs jogosultság a lelkészi elérhetőségek lekérdezéséhez (a fiók nem aktív tisztségviselő).';
    END IF;

    -- (2) Bemenet tisztítás + tömb-hossz korlát
    v_ids := ARRAY(
        SELECT DISTINCT x
        FROM unnest(COALESCE(p_congregation_ids, '{}'::uuid[])) AS x
        WHERE x IS NOT NULL
    );
    v_db := COALESCE(array_length(v_ids, 1), 0);

    IF v_db = 0 THEN
        RETURN;
    END IF;

    IF v_db > 20 THEN
        RAISE EXCEPTION 'Egyszerre legfeljebb 20 gyülekezet lelkészi elérhetősége kérhető le (most: % gyülekezet).', v_db;
    END IF;

    v_norm_name := public.normalize_name(
        COALESCE(p_csaladnev, '') || ' ' || COALESCE(p_k_nev, '')
    );
    v_norm_phone := public.normalize_phone(p_telefon);

    -- (3) Csak olyan gyülekezet, amelyhez a hívónak VALÓDI köze van
    RETURN QUERY
    SELECT
        c.id AS congregation_id,
        COALESCE(c.nev_hu, c.name, 'Ismeretlen gyülekezet')::text AS congregation_name,
        p.full_name::text  AS pastor_name,
        p.email::text      AS pastor_email,
        p.phone::text      AS pastor_phone,
        c.email::text      AS congregation_email,
        c.telefon::text    AS congregation_phone
    FROM public.congregations c
    LEFT JOIN LATERAL (
        SELECT pr.full_name, pr.email, pr.phone
        FROM public.profiles pr
        WHERE pr.congregation_id = c.id
          AND pr.role = 'lelkesz'
        ORDER BY pr.full_name NULLS LAST
        LIMIT 1
    ) p ON true
    WHERE c.id = ANY (v_ids)
      AND (
          -- (a) a hívó amúgy is eléri ezt a gyülekezetet (saját / co-membership /
          --     globális hatókör)
          public.current_user_can_access_congregation(c.id)

          -- (b) rögzített kereszt-egyezés köti a hívó által elérhető gyülekezethez
          OR EXISTS (
              SELECT 1
              FROM public.cross_congregation_match_notifications n
              WHERE (
                        n.triggering_congregation_id = c.id
                        AND public.current_user_can_access_congregation(n.matched_congregation_id)
                    )
                 OR (
                        n.matched_congregation_id = c.id
                        AND public.current_user_can_access_congregation(n.triggering_congregation_id)
                    )
          )

          -- (c) ÚJ TAG felvitele: még nincs notification-sor, de a hívó bizonyítja,
          --     hogy ismeri a személy azonosító adatait, és az ERŐS egyezést ad
          --     ebben a gyülekezetben (név + telefon VAGY név + szül. dátum).
          OR (
              v_norm_name IS NOT NULL
              AND (v_norm_phone IS NOT NULL OR p_sz_datum IS NOT NULL)
              AND EXISTS (
                  SELECT 1
                  FROM public.szemely s
                  WHERE s.congregation_id = c.id
                    AND s.isvisible = true
                    AND public.normalize_name(
                          COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                        ) = v_norm_name
                    AND (
                        (v_norm_phone IS NOT NULL
                         AND public.normalize_phone(s.telefon) = v_norm_phone)
                        OR (p_sz_datum IS NOT NULL AND s.sz_datum = p_sz_datum)
                    )
              )
          )
      );
END;
$contacts_guarded$;

COMMENT ON FUNCTION public.get_cross_match_pastor_contacts(uuid[], text, text, text, date) IS
    '2026-08-11 (P0-javítás) — a MÁSIK gyülekezet lelkészének hivatalos elérhetősége. Csak AKTÍV tisztségviselő hívhatja, egyszerre max. 20 gyülekezetre, és CSAK olyanra, amelyhez valódi köze van: (a) elérhető gyülekezet, (b) rögzített kereszt-egyezés köti hozzá, vagy (c) új tag felvitelekor a megadott név+telefon / név+szül.dátum erős egyezést ad ott. Korábban bármely authenticated JWT egyetlen hívással lekérte az ORSZÁG ÖSSZES lelkészének elérhetőségét.';

GRANT EXECUTE ON FUNCTION public.get_cross_match_pastor_contacts(uuid[], text, text, text, date)
    TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS (a COMMIT után futtatható, csak olvas) ======================
-- ════════════════════════════════════════════════════════════════════════════

-- 1. A négy érintett függvény létezik, és a szignatúrák a vártak?
SELECT
    p.proname                                       AS fuggveny,
    pg_get_function_identity_arguments(p.oid)       AS parameterek,
    p.prosecdef                                     AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'find_cross_congregation_match_internal',
      'find_potential_cross_congregation_match',
      'get_cross_match_pastor_contacts',
      'tg_szemely_check_cross_congregation'
  )
ORDER BY p.proname;
-- Várt: 4 sor. A get_cross_match_pastor_contacts-ból PONTOSAN EGY (5 paraméteres).

-- 2. JOGOSULTSÁGOK — a belső kereső NEM lehet authenticated/anon/PUBLIC jogú!
SELECT
    p.proname                                 AS fuggveny,
    pg_get_function_identity_arguments(p.oid) AS parameterek,
    COALESCE(array_to_string(p.proacl, ' | '), '(alapértelmezett: PUBLIC)') AS jogok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'find_cross_congregation_match_internal',
      'find_potential_cross_congregation_match',
      'get_cross_match_pastor_contacts'
  )
ORDER BY p.proname;
-- Várt:
--   find_cross_congregation_match_internal → NINCS benne 'authenticated=X' és 'anon=X',
--     és NINCS puszta '=X/postgres' (PUBLIC) bejegyzés sem.
--   a másik kettő → tartalmaz 'authenticated=X/...' bejegyzést.

-- 2/b. Ugyanez géppel ellenőrizve (a legfontosabb sor):
SELECT
    has_function_privilege('authenticated',
        'public.find_cross_congregation_match_internal(text,text,text,date,integer,uuid)', 'EXECUTE')
        AS belso_authenticated_johet_e,   -- VÁRT: false
    has_function_privilege('anon',
        'public.find_cross_congregation_match_internal(text,text,text,date,integer,uuid)', 'EXECUTE')
        AS belso_anon_johet_e,            -- VÁRT: false
    has_function_privilege('authenticated',
        'public.find_potential_cross_congregation_match(text,text,text,date,integer,uuid)', 'EXECUTE')
        AS wrapper_authenticated_johet_e, -- VÁRT: true
    has_function_privilege('authenticated',
        'public.get_cross_match_pastor_contacts(uuid[],text,text,text,date)', 'EXECUTE')
        AS kontakt_authenticated_johet_e; -- VÁRT: true

-- 3. A régi, EGY paraméteres kontakt-függvény tényleg eltűnt?
SELECT COUNT(*) AS regi_egyparameteres_kontakt_fuggveny
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_cross_match_pastor_contacts'
  AND pg_get_function_identity_arguments(p.oid) = 'p_congregation_ids uuid[]';
-- Várt: 0

-- 4. A trigger él, és a BELSŐ függvényt hívja?
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'szemely'
  AND trigger_name = 'szemely_check_cross_congregation';
-- Várt: 2 sor (INSERT + UPDATE), AFTER

SELECT pg_get_functiondef('public.tg_szemely_check_cross_congregation()'::regprocedure)
       LIKE '%find_cross_congregation_match_internal%' AS trigger_a_belsot_hivja;
-- Várt: true

-- 5. TÁMADÁS-SZIMULÁCIÓ (Studio-ból, auth.uid() = NULL → mindkettő KIVÉTELT dob).
--    Vedd ki a kommentet, és nézd meg, hogy hibaüzenetet kapsz:
-- SELECT * FROM public.get_cross_match_pastor_contacts(
--     ARRAY(SELECT id FROM public.congregations LIMIT 20)
-- );
-- Várt: ERROR — 'Nincs bejelentkezett felhasználó — a lelkész-elérhetőség nem kérhető le.'
--
-- SELECT * FROM public.find_potential_cross_congregation_match('Kovács', 'János');
-- Várt: ERROR — 'Nincs bejelentkezett felhasználó — a kereszt-gyülekezeti keresés nem érhető el.'
--
-- SELECT * FROM public.get_cross_match_pastor_contacts(
--     ARRAY(SELECT id FROM public.congregations LIMIT 21)
-- );
-- Várt: ERROR — a 20-as korlát vagy (Studióban előbb) a bejelentkezés-hiány.

-- 6. Az admin egyeztetési felület RPC-i érintetlenek?
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS parameterek
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'admin_scan_cross_congregation_duplicates',
      'admin_list_cross_congregation_matches',
      'admin_notify_cross_match_pastors',
      'admin_resolve_cross_match_pair',
      'ccm_caller_is_system_admin',
      'ccm_caller_district_ids',
      'ccm_caller_can_access_notification'
  )
ORDER BY p.proname;
-- Várt: 7 sor (ez a migráció EGYIKHEZ SEM nyúlt)

-- ════════════════════════════════════════════════════════════════════════════
-- === FÜSTTESZT (a futtatás után, a WEBFELÜLETEN, éles bejelentkezéssel) =====
-- ════════════════════════════════════════════════════════════════════════════
--
-- A) LELKÉSZI FIÓKKAL (aktív, gyülekezethez kötött):
--
--   1. Tagnyilvántartás → „Új tag" → adj meg egy olyan nevet + telefonszámot
--      (vagy nevet + születési dátumot), amely EGY MÁSIK gyülekezetben már
--      szerepel → mentés.
--      VÁRT: felugrik a „Hasonló tag már létezik más gyülekezetben" ablak,
--      benne a másik gyülekezet neve + egyházi CNP, ÉS a zöld dobozban
--      MEGJELENIK az ottani lelkész neve / e-mail / telefon.
--      (Ez a legfontosabb füstteszt — ha üres, a (c) bizonyíték-ág nem működik.)
--
--   2. Ugyanez CSAK névvel, telefon és születési dátum NÉLKÜL, olyan névre,
--      ami a SAJÁT gyülekezetedben NINCS meg.
--      VÁRT: nincs találat, az ablak fel sem jön, a mentés simán megy tovább.
--      (Ez a szándékos szigorítás: idegen névre puszta névegyezés nem elég.)
--
--   3. Egy MEGLÉVŐ saját tagod nevét/telefonját írd át úgy, hogy egyezzen egy
--      másik gyülekezet tagjával → mentés.
--      VÁRT: a mentés lemegy, és a DB-trigger rögzíti az egyezést → a
--      tagnyilvántartás értesítő-jelölése / a harang-számláló nő.
--      (Ez bizonyítja, hogy a trigger a belső függvénnyel is dolgozik.)
--
--   4. Nyitott egyezés-értesítőnél a „Most nem" / „Nem, más személy" /
--      „Igen, ugyanaz a személy" gombok változatlanul működnek.
--
-- B) ADMIN (rendszergazda) FIÓKKAL:
--
--   5. /admin → „Egyeztetések" oldal betölt, a lista sorai látszanak,
--      bennük a két lelkész neve/e-mail-je.
--      VÁRT: változatlan (az admin RPC-khez ez a migráció nem nyúlt).
--
--   6. „Teljes átvizsgálás" gomb (admin_scan_cross_congregation_duplicates)
--      lefut, és a talált párok száma megjelenik.
--
--   7. Egy sornál „Értesítés a lelkészeknek" → az app-értesítés kimegy,
--      és a soron megjelenik az „értesítve" pecsét.
--
-- C) NEGATÍV TESZT (a lyuk tényleg zárva van-e):
--
--   8. Egy `pending` (jóvá NEM hagyott) fiókkal belépve a
--      get_cross_match_pastor_contacts és a find_potential_cross_congregation_match
--      hívása HIBÁT ad („Nincs jogosultság … a fiók nem aktív tisztségviselő").
--
--   9. Aktív lelkészi fiókkal 21+ gyülekezet-UUID-t küldve a kontakt-RPC-nek:
--      „Egyszerre legfeljebb 20 gyülekezet…" hibaüzenet.
--
--  10. Aktív lelkészi fiókkal olyan gyülekezet UUID-jét küldve, amelyhez semmi
--      köze (nincs egyezés-sor, nincs bizonyíték): ÜRES eredmény (nem hiba).
-- ════════════════════════════════════════════════════════════════════════════
