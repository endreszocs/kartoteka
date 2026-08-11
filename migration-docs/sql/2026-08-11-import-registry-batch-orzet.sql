-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — import_registry_batch: a SZERKEZETILEG HALOTT őr javítása
-- Dátum: 2026-08-11
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- FUTTATÁSI SORREND: ELŐBB a 2026-08-11-cross-match-rpc-hardening.sql és a
--   2026-08-11-security-definer-hardening.sql, UTÁNA ez. (Az előbbi hozza létre
--   a `current_user_is_active_staff()` segédet, az utóbbi vonta vissza erről a
--   függvényről az `anon`/`PUBLIC` EXECUTE jogot.) Ez a fájl mindkettőt CSAK
--   ELLENŐRZI, és hiány esetén MEGÁLL — párhuzamos segédet nem épít.
--
-- ─── MI VOLT A HIBA? ───────────────────────────────────────────────────────
--
-- Az `import_registry_batch(uuid, text, jsonb, boolean)` `SECURITY DEFINER`
-- függvény törzsében ez az őr állt:
--
--     IF v_caller IS NULL THEN                    -- auth.uid() IS NULL
--         IF current_user IN ('postgres', 'supabase_admin',
--                             'service_role', 'supabase_auth_admin') THEN
--             v_studio_bypass := true; v_is_master := true;
--         ELSE
--             RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
--         END IF;
--     END IF;
--
-- `SECURITY DEFINER` törzsben a `current_user` MINDIG a függvény TULAJDONOSA
-- (`postgres`) — SOHA nem a hívó. Ezért:
--
--   · a feltétel MINDIG igaz volt → a RAISE EXCEPTION ág elérhetetlen,
--   · minden `auth.uid() IS NULL` hívó MEGKAPTA a `v_studio_bypass`-t,
--     azzal együtt a `v_is_master := true`-t,
--   · a bypass ág pedig ÁTUGORJA a teljes hatókör-ellenőrzést (profile_roles +
--     admin_access_requests) → BÁRMELY gyülekezet-UUID-re lehetett anyakönyvi
--     sorokat (keresztelés, konfirmáció, házasság, temetés, mozgások) tömegesen
--     beszúrni, hitelesítés nélkül.
--
-- Ugyanez a hibaosztály dobatta el 2026-08-11-én a `merge_spouses_bulk()`
-- függvényt (2026-08-11-security-definer-hardening.sql, 2. szakasz).
--
-- MIÉRT NEM VOLT ÉLES INCIDENS: a 2026-08-11-security-definer-hardening.sql
-- 8. szakasza visszavonta az `anon`/`PUBLIC` EXECUTE jogot, tehát ma
-- bejelentkezés nélkül nem hívható. A TÖRZS viszont továbbra is rossz — ez a
-- fájl azt javítja. (A jogosultsági rendezést itt idempotensen MEGISMÉTELJÜK,
-- hogy ez a fájl önmagában is elégséges legyen.)
--
-- ─── MI A JAVÍTÁS? ─────────────────────────────────────────────────────────
--
--   1. `current_user` → `session_user`. A `session_user` a KAPCSOLATOT nyitó
--      szerep, amit a `SET ROLE` és a `SECURITY DEFINER` sem ír felül. Supabase
--      Studióból (superuser-kapcsolat) `postgres`, PostgREST-en át viszont
--      `authenticator` — tehát a bypass webről SOHA nem lép be. A `service_role`
--      és a `supabase_auth_admin` szándékosan KIKERÜLT a listából: azok is
--      PostgREST-en jönnek, ahol a `session_user` amúgy is `authenticator`.
--      Superuser-kapcsolatnál a bypass NEM jogosultság-tágítás: a `postgres`
--      szerep az érintett táblákba amúgy is közvetlenül írhat.
--
--      ⚠️ A Studio-ág CSAK RÉSZBEN működőképes, és ez SZÁNDÉKOS: a törzs a
--         `public.generate_egyhazi_anyakonyvi_szam()` függvényt hívja, amelyre
--         a 2026-08-11-security-definer-hardening.sql `auth.uid() IS NULL` →
--         kivétel kaput tett. Studióból tehát csak olyan sorok mennek át,
--         amelyekben az `egyhazi_szam` EXPLICIT meg van adva. Ez elfogadott: a
--         Studio nem import-felület, a bypass ott csak diagnosztikára kell.
--
--   2. Fail-closed előkapuk kerülnek a törzs elejére:
--        · NULL cél-gyülekezet → kivétel,
--        · `public.current_user_is_active_staff()` → a `pending` önregisztrált
--          fiók itt bukik el,
--        · a záró jog-kapu MINDEN tagja `COALESCE(…, false)` — SQL-ben a NULL
--          nem hamis, és a plpgsql a NULL feltételű `IF`-et úgy kezeli, mint a
--          hamisat: egyetlen NULL a RAISE EXCEPTION-t ELNYELNÉ, és a
--          jogosulatlan hívó végigfutna az importon. (Ez a hibaosztály rokona
--          annak, ami ezt a fájlt szülte.)
--
--   3. A hatókör-ág kiegészül a HARMADIK legitim úttal: a hívó SAJÁT
--      gyülekezete. Erre azért van szükség, mert a PIN-nel feloldott
--      „Rendszergazdai importáló" fület a LELKÉSZ is megnyithatja a SAJÁT
--      gyülekezetére (activateDelegatedImport bármelyik bejelentkezett,
--      gyülekezettel rendelkező fióknak működik), őrá viszont sem a
--      `profile_roles` (system admin), sem az `admin_access_requests` feltétel
--      nem illik — a régi kódban ez az út NÉMÁN „Nincs jogosultság" hibára
--      futott.
--
--      ⚠️ A FELTÉTEL ALAKJA NEM MINDEGY — ITT EGY BUKTATÓ VAN.
--         A kézenfekvő `current_user_can_access_congregation(...)` hívás
--         2026-08-11 ÓTA TÁGABB, mint az érintett nyolc anyakönyvi tábla
--         RLS-e. A `2026-08-11-globalis-hozzaferes-szukites.sql` ugyanis
--         beletette a (3) `felettes_szint_hozzaferese(...)` ágat (esperes /
--         egyházmegyei admin / egyházkerületi admin) és a (4) egyházmegyei
--         számvevő ágat — a nyolc tábla policy-ja viszont VÁLTOZATLANUL
--         `congregation_id = current_user_congregation_id()
--          OR current_user_has_global_access()`
--         (2026-04-13-rls-ALL-FIXED.sql; azt a fájl NEM írta újra).
--         Mivel a `SECURITY DEFINER` törzsben az RLS NEM érvényesül, a tágabb
--         feltétel egy esperesnek OLYAN ÍRÁSI JOGOT adna a saját egyházmegyéje
--         IDEGEN gyülekezeteibe, amit a felületről egyesével NEM tud megtenni —
--         és a PostgREST-en a saját JWT-jével közvetlenül hívható.
--
--      Ezért a feltétel BETŰRE a nyolc tábla RLS-ének a mása:
--
--          p_target_congregation_id = public.current_user_congregation_id()
--          OR public.current_user_has_global_access()
--
--      Ez NEM tágítás: pontosan azokat a sorokat engedi tömegesen, amelyeket a
--      hívó egyesével is beszúrhat a felületről. A PIN-kapu helye a
--      szerver-akció (assertDelegatedImportAllowed), nem az RPC.
--
--      MELLÉKHOZADÉK: a `current_user_has_global_access()` KÉTLÁBÚ (skalár
--      `profiles.role='admin'` VAGY `profile_roles` system-scope admin), a
--      `v_is_master` viszont csak a `profile_roles`-lábat nézi. A skalár-admin
--      így eddig „Nincs jogosultság"-ot kapott az idegen gyülekezetbe történő
--      importra — mostantól nem.
--
--      ⛔ SZÁNDÉKOSAN NEM NYITJUK MEG az esperes / egyházmegyei admin /
--         egyházkerületi admin útját. Az a mai állapot: ma is elbukik
--         (`v_is_master` és `v_has_delegated` egyaránt hamis), tehát ez a fájl
--         SEMMIT nem tör el. Ha a tulajdonos AZT AKARJA, hogy a kerületi admin
--         az Import központból idegen gyülekezetbe importálhasson, akkor a
--         helyes lépés a NYOLC TÁBLA RLS-ének tudatos tágítása külön fájlban —
--         nem egy lyuk ebbe az egy RPC-be.
--
-- ─── SZIGNATÚRA ────────────────────────────────────────────────────────────
--
--   VÁLTOZATLAN: public.import_registry_batch(uuid, text, jsonb, boolean).
--   A törzs adat-beszúró része BETŰRE azonos a 2026-04-30e-import-batch-
--   elkoltozott-target.sql verziójával — CSAK a jog-ellenőrző blokk változott.
--
--   HÍVÓHELY (egyetlen, változatlan):
--     apps/web/lib/import/import-registry-actions.ts:~405 (executeRegistryImport)
--       ← apps/web/components/registry/registry-import-wizard.tsx:~505
--       ← apps/web/app/(dashboard)/anyakonyv/page.tsx (Rendszergazdai importáló fül)
--     A hívás a süti-alapú SSR kliensen megy (valódi user-JWT), tehát
--     `auth.uid()` NEM null — a bypass ág ott sosem játszik.
--
-- ─── MI MARAD NYITVA ───────────────────────────────────────────────────────
--
--   · (LEZÁRVA 2026-08-11) `executeRegistryImport` (import-registry-actions.ts)
--     korábban az EGYETLEN import szerver-akció volt, amely nem hívta az
--     `assertDelegatedImportAllowed()` kapuőrt. MA MÁR HÍVJA
--     (import-registry-actions.ts ~185), tehát a PIN-kapu nem csak a felületen
--     él. Ez az SQL a DB-oldali fail-closed alapot adja alá — a két réteg
--     egymástól függetlenül zár.
--   · `congregations_for_registration()` továbbra is `anon`-nak GRANT-olt.
--   · Az esperes / egyházmegyei admin / egyházkerületi admin NEM tud idegen
--     gyülekezetbe importálni — se ma, se a fájl után. Ez TUDATOS (lásd a
--     3. pont ⛔ bekezdését), nem hiba.
--
-- Idempotens: CREATE OR REPLACE + DO-blokkos jog-rendezés. Újrafuttatható.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- === SZAKASZ 0 · ÁLLAPOTFELMÉRÉS — FUTTASD ELŐSZÖR, KÜLÖN ==================
--
-- ⚠️ A Supabase SQL Editor CSAK AZ UTOLSÓ statement eredményét mutatja, ezért
--    ez EGYETLEN SELECT (UNION ALL). Jelöld ki EZT A BLOKKOT, futtasd le, és
--    csak utána menj tovább a BEGIN-nel kezdődő részre.
--
-- Mit mérünk: a REPÓ és az ÉLES adatbázis némán széthúzhat. Ha bármelyik
-- előfeltétel hiányzik, a tranzakció úgyis megáll (0. szakasz) — de akkor már
-- csak egy nyers hibaüzenetet látsz. Ez a blokk ELŐRE megmondja, mi a helyzet.
-- ════════════════════════════════════════════════════════════════════════════

SELECT '00. import_registry_batch létezik-e MA'                       AS allapot,
       (to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)') IS NOT NULL)::text AS eredmeny,
       'true (ha false: ez a fájl most hozza létre)'                  AS ertelmezes
UNION ALL SELECT '01. MA a HALOTT current_user-os bypass van benne?',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%current_user IN (%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text,
       'true = a lyuk MÉG NYITVA (ezért futtatod); false = már javítva'
UNION ALL SELECT '02. MA hívhatja-e az anon?',
       COALESCE(has_function_privilege('anon',
           to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)')::oid, 'EXECUTE')::text,
           '(nincs ilyen függvény)'),
       'false a jó — ha true, a lyuk bejelentkezés nélkül is kihasználható'
UNION ALL SELECT '03. ELŐFELTÉTEL — current_user_is_active_staff() létezik',
       (to_regprocedure('public.current_user_is_active_staff()') IS NOT NULL)::text,
       'true kell — különben előbb: 2026-08-11-cross-match-rpc-hardening.sql'
UNION ALL SELECT '04. ELŐFELTÉTEL — current_user_congregation_id() létezik',
       (to_regprocedure('public.current_user_congregation_id()') IS NOT NULL)::text,
       'true kell — különben előbb: 2026-04-12-phase-0-rls-hardening.sql'
UNION ALL SELECT '05. ELŐFELTÉTEL — current_user_has_global_access() létezik',
       (to_regprocedure('public.current_user_has_global_access()') IS NOT NULL)::text,
       'true kell — különben előbb: 2026-04-12-phase-0-rls-hardening.sql'
UNION ALL SELECT '06. A szűkítés lefutott-e a global access-en?',
       COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%v2026-08-11-szukites%')::text
                 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'current_user_has_global_access' LIMIT 1), '(nincs)'),
       'true = az esperes MÁR NEM globális (ez a fájl ezt feltételezi)'
UNION ALL SELECT '07. A nyolc anyakönyvi tábla RLS-e a VÁRT alakú?',
       (SELECT COUNT(*)::text FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes',
                             'bekoltozott','elkoltozott','attert','kitert')
           AND qual LIKE '%current_user_congregation_id%'
           AND qual LIKE '%current_user_has_global_access%'),
       '8 a várt — ha kevesebb, a törzs (6) ága ELTÉR a soronkénti RLS-től, NE FUTTASD'
UNION ALL SELECT '08. Hány anyakönyvi sor van ÖSSZESEN most? (utólagos összevetéshez)',
       ((SELECT COUNT(*) FROM public.keresztseg) + (SELECT COUNT(*) FROM public.konfirmalas)
      + (SELECT COUNT(*) FROM public.hazassag)   + (SELECT COUNT(*) FROM public.temetes)
      + (SELECT COUNT(*) FROM public.bekoltozott)+ (SELECT COUNT(*) FROM public.elkoltozott)
      + (SELECT COUNT(*) FROM public.attert)     + (SELECT COUNT(*) FROM public.kitert))::text,
       'CSAK feljegyzésre — ez a fájl EGYETLEN adatsort sem ír';
-- Várt: 9 sor. A 07. sor a legfontosabb: ha nem 8, ÁLLJ MEG és jelezd.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. ELŐFELTÉTELEK — fail-closed őrszem
-- ────────────────────────────────────────────────────────────────────────────
--
-- A javított törzs két meglévő hatókör-segédre épül. Ha bármelyik hiányzik,
-- INKÁBB álljon meg az egész tranzakció, mint hogy egy hiányzó segéd miatt
-- csendben „mindenkinek igaz" kapu készüljön.

DO $elofeltetel$
DECLARE
  v_staff    boolean;
  v_cong_id  boolean;
  v_global   boolean;
  v_fn       boolean;
  v_policyk  integer;
BEGIN
  v_staff   := to_regprocedure('public.current_user_is_active_staff()')  IS NOT NULL;
  v_cong_id := to_regprocedure('public.current_user_congregation_id()')  IS NOT NULL;
  v_global  := to_regprocedure('public.current_user_has_global_access()') IS NOT NULL;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch'
  ) INTO v_fn;

  IF NOT v_staff THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — hiányzik a public.current_user_is_active_staff() segéd. Előbb futtasd a 2026-08-11-cross-match-rpc-hardening.sql fájlt.';
  END IF;

  IF NOT v_cong_id THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — hiányzik a public.current_user_congregation_id() segéd. Előbb futtasd a 2026-04-12-phase-0-rls-hardening.sql fájlt.';
  END IF;

  IF NOT v_global THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — hiányzik a public.current_user_has_global_access() segéd. Előbb futtasd a 2026-04-12-phase-0-rls-hardening.sql fájlt.';
  END IF;

  -- A törzs (6) ága BETŰRE a nyolc anyakönyvi tábla RLS-ét másolja. Ha ez a
  -- feltevés már nem igaz (valaki átírta a policy-kat), akkor az RPC és a
  -- soronkénti út SZÉTHÚZ — pontosan az a hibaosztály, ami ezt a fájlt szülte.
  -- Nem állítjuk meg a futást (a policy-k idővel jogosan változhatnak), de
  -- HANGOSAN kiírjuk, hogy a döntés tudatos legyen.
  SELECT COUNT(*) INTO v_policyk
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes',
                       'bekoltozott','elkoltozott','attert','kitert')
     AND qual LIKE '%current_user_congregation_id%'
     AND qual LIKE '%current_user_has_global_access%';
  IF v_policyk <> 8 THEN
    RAISE WARNING '2026-08-11: a nyolc anyakönyvi tábla közül csak %-on találtam a várt (current_user_congregation_id + current_user_has_global_access) RLS-alakot. Az RPC (6) hatókör-ága ettől ELTÉRHET — nézd át, mielőtt élesben importálsz.', v_policyk;
  END IF;

  IF NOT v_fn THEN
    RAISE NOTICE '2026-08-11: az import_registry_batch még nem létezik — ez a fájl most hozza létre.';
  END IF;
END
$elofeltetel$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. A függvény újradefiniálása a JAVÍTOTT őrrel
-- ────────────────────────────────────────────────────────────────────────────
--
-- A beszúró ágak (baptism / confirmation / marriage / burial / movement_*)
-- BETŰRE azonosak a 2026-04-30e verzióval. Az egyetlen érdemi különbség a
-- BEGIN utáni jog-ellenőrző blokk és a `v_in_scope` deklaráció.

CREATE OR REPLACE FUNCTION public.import_registry_batch(
    p_target_congregation_id uuid,
    p_profile_key text,
    p_rows jsonb,
    p_default_munkanaploba boolean DEFAULT false
) RETURNS TABLE(inserted_count integer, skipped_count integer, errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $import_registry$
DECLARE
    v_caller uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_studio_bypass boolean := false;
    v_in_scope boolean := false;
    v_row jsonb;
    v_row_idx integer := 0;
    v_inserted integer := 0;
    v_skipped integer := 0;
    v_error_list jsonb := '[]'::jsonb;
    v_baptism_stub jsonb;
    v_baptism_id integer;
    v_egyhazi_value text;
    v_year integer;
BEGIN
    -- ── 2026-08-11: A JOG-ELLENŐRZÉS ÚJRAÍRVA (lásd a fájl fejlécét) ────────
    --
    -- (1) Cél-gyülekezet nélkül nincs mit engedélyezni — fail-closed.
    IF p_target_congregation_id IS NULL THEN
        RAISE EXCEPTION 'Nincs cél-gyülekezet — az anyakönyvi import nem indítható.';
    END IF;

    -- (2) Bejelentkezés nélküli hívás KIZÁRÓLAG közvetlen superuser-kapcsolatból
    --     (Supabase Studio SQL Editor) engedett. Itt `session_user` áll, NEM a
    --     tulajdonost visszaadó `current_user` — a régi ág emiatt volt halott.
    --     PostgREST-en át a `session_user` mindig `authenticator`, tehát ez az
    --     ág webről SOHA nem lép be.
    IF v_caller IS NULL THEN
        IF session_user IN ('postgres', 'supabase_admin') THEN
            v_studio_bypass := true; v_is_master := true;
        ELSE
            RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — az anyakönyvi import nem érhető el.';
        END IF;
    END IF;

    IF NOT v_studio_bypass THEN
        -- (3) Aktív tisztségviselő kötelező. A publikus regisztrációval szerzett,
        --     még `pending` fiók itt bukik el — az RPC-t sosem éri el.
        IF NOT public.current_user_is_active_staff() THEN
            RAISE EXCEPTION 'Nincs jogosultság az anyakönyvi importhoz (a fiók nem aktív tisztségviselő).';
        END IF;

        -- (4) Rendszergazda (system hatókörű, aktív + jóváhagyott admin).
        v_is_master := EXISTS(SELECT 1 FROM public.profile_roles
            WHERE profile_id = v_caller AND role = 'admin' AND scope = 'system'
              AND active = true AND approval_status = 'approved');

        -- (5) Lelkész által jóváhagyott, LE NEM JÁRT admin-hozzáférés a célra.
        v_has_delegated := EXISTS(SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = v_caller AND congregation_id = p_target_congregation_id
              AND status = 'approved' AND expires_at > now());

        -- (6) Saját hatókör. A feltétel BETŰRE a nyolc érintett anyakönyvi
        --     tábla (`keresztseg`, `konfirmalas`, `hazassag`, `temetes`,
        --     `bekoltozott`, `elkoltozott`, `attert`, `kitert`)
        --     `FOR ALL TO authenticated` RLS-policy-jának a mása
        --     (2026-04-13-rls-ALL-FIXED.sql):
        --
        --         congregation_id = current_user_congregation_id()
        --         OR current_user_has_global_access()
        --
        --     Ez NEM tágítás: pontosan azokat a sorokat engedi tömegesen,
        --     amelyeket a hívó egyesével is beszúrhat a felületről.
        --
        --     ⛔ ITT SZÁNDÉKOSAN NEM `current_user_can_access_congregation()`
        --        ÁLL. Az a segéd 2026-08-11 óta TÁGABB ennél (megyei/kerületi
        --        `felettes_szint_hozzaferese` + számvevő ág), a nyolc tábla
        --        RLS-e viszont NEM követte. `SECURITY DEFINER` törzsben az RLS
        --        nem érvényesül, tehát a tágabb segéddel egy esperes a saját
        --        egyházmegyéje IDEGEN gyülekezeteibe tudna tömegesen írni —
        --        miközben egyesével nem tudna. Lásd a fájl fejlécét.
        --
        --     A PIN-es „Rendszergazdai importáló" kapuja a szerver-akcióban van
        --     (assertDelegatedImportAllowed), nem itt.
        --
        --     ⚠️ A COALESCE NEM KOZMETIKA — NÉLKÜLE FAIL-OPEN LENNE.
        --        A `current_user_congregation_id()` NULL-t ad, ha a hívónak
        --        nincs gyülekezete (pl. gyülekezet nélküli rendszergazda) vagy
        --        a profilja nem `active`. Ilyenkor az `uuid = NULL` NEM hamis,
        --        hanem NULL — és a lenti `IF NOT v_is_master AND NOT
        --        v_has_delegated AND NOT v_in_scope` kifejezés NULL-ra
        --        értékelődne, amit a plpgsql úgy kezel, mintha HAMIS volna:
        --        a RAISE EXCEPTION ELMARADNA, és a jogosulatlan hívó
        --        VÉGIGFUTNA az importon. Pontosan az a hibaosztály, ami ezt a
        --        fájlt szülte (néma, szerkezetileg halott őr).
        v_in_scope := COALESCE(
                        p_target_congregation_id = public.current_user_congregation_id(),
                        false)
                      OR COALESCE(public.current_user_has_global_access(), false);

        -- Fail-closed: minden tag COALESCE-szal, hogy egyetlen NULL se tudja
        -- „igaznak" hazudni a jogosultságot.
        IF NOT COALESCE(v_is_master, false)
           AND NOT COALESCE(v_has_delegated, false)
           AND NOT COALESCE(v_in_scope, false) THEN
            RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', p_target_congregation_id;
        END IF;
    END IF;

    IF p_profile_key NOT IN ('baptism', 'confirmation', 'marriage', 'burial',
        'movement_bekoltozott', 'movement_elkoltozott',
        'movement_attert', 'movement_kitert') THEN
        RAISE EXCEPTION 'Érvénytelen profil-kulcs: %', p_profile_key;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_row_idx := v_row_idx + 1;
        BEGIN
            -- KERESZTELÉS
            IF p_profile_key = 'baptism' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                END IF;
                INSERT INTO public.keresztseg (
                    id_szemely, datum, lelkeszneve, okirat, egyhazi_szam, keresztszulok,
                    megjegyzes, munkanaploba, helyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'okirat', ''),
                    v_egyhazi_value, NULLIF(v_row->>'keresztszulok', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KONFIRMÁCIÓ
            ELSIF p_profile_key = 'confirmation' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_baptism_stub := v_row->'create_baptism_first';
                IF v_baptism_stub IS NOT NULL AND NULLIF(v_baptism_stub->>'datum', '') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM public.keresztseg
                        WHERE id_szemely = (v_row->>'id_szemely')::integer
                          AND datum = (v_baptism_stub->>'datum')::timestamp) THEN
                        v_egyhazi_value := NULLIF(v_baptism_stub->>'egyhazi_szam', '');
                        IF v_egyhazi_value IS NULL THEN
                            v_year := EXTRACT(YEAR FROM (v_baptism_stub->>'datum')::timestamp)::integer;
                            v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                        END IF;
                        INSERT INTO public.keresztseg (
                            id_szemely, datum, lelkeszneve, helyid, okirat, egyhazi_szam,
                            megjegyzes, munkanaploba, congregation_id
                        ) VALUES (
                            (v_row->>'id_szemely')::integer, (v_baptism_stub->>'datum')::timestamp,
                            NULLIF(v_baptism_stub->>'lelkeszneve', ''),
                            NULLIF(v_baptism_stub->>'helyid', '')::integer,
                            NULLIF(v_baptism_stub->>'okirat', ''),
                            v_egyhazi_value,
                            'Konfirmáció-importtal együtt rögzített keresztelés (' || (v_row->>'datum') || ')',
                            COALESCE((v_baptism_stub->>'munkanaploba')::boolean, p_default_munkanaploba),
                            p_target_congregation_id
                        ) RETURNING id INTO v_baptism_id;
                        v_inserted := v_inserted + 1;
                    END IF;
                END IF;

                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::date)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'confirmation', v_year);
                END IF;
                INSERT INTO public.konfirmalas (
                    id_szemely, datum, lelkeszneve, keresztelesideje,
                    megjegyzes, helyid, okirat, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'datum')::date,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'keresztelesideje', '')::date,
                    NULLIF(v_row->>'megjegyzes', ''), NULLIF(v_row->>'helyid', '')::integer,
                    NULLIF(v_row->>'okirat', ''), v_egyhazi_value,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- HÁZASSÁG
            ELSIF p_profile_key = 'marriage' THEN
                IF (v_row->>'id_ferfi') IS NULL OR (v_row->>'id_no') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_ferfi, id_no vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'marriage', v_year);
                END IF;
                INSERT INTO public.hazassag (
                    id_ferfi, id_no, datum, lelkeszneve, hlevel, egyhazi_szam, tanuk,
                    megjegyzes, munkanaploba, helyid, vegyes, congregation_id
                ) VALUES (
                    (v_row->>'id_ferfi')::integer, (v_row->>'id_no')::integer,
                    (v_row->>'datum')::timestamp, NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'hlevel', ''), v_egyhazi_value,
                    NULLIF(v_row->>'tanuk', ''), NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    COALESCE((v_row->>'vegyes')::boolean, false), p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- TEMETÉS
            ELSIF p_profile_key = 'burial' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'hdatum', '') IS NULL OR NULLIF(v_row->>'tdatum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely, hdatum vagy tdatum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'tdatum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'burial', v_year);
                END IF;
                INSERT INTO public.temetes (
                    id_szemely, hdatum, hoka, tdatum, lelkeszneve, okirat, egyhazi_szam,
                    megjegyzes, munkanaploba, hhelyid, thelyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'hdatum')::timestamp,
                    NULLIF(v_row->>'hoka', ''), (v_row->>'tdatum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'okirat', ''),
                    v_egyhazi_value, NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'hhelyid', '')::integer,
                    NULLIF(v_row->>'thelyid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- BEKÖLTÖZÖTT
            ELSIF p_profile_key = 'movement_bekoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'mikor', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy mikor');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_bekoltozott', v_year);
                END IF;
                INSERT INTO public.bekoltozott (
                    id_szemely, mikor, megjegyzes, igazolas, egyhazi_szam, honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'mikor')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''), NULLIF(v_row->>'igazolas', ''),
                    v_egyhazi_value, NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ELKÖLTÖZÖTT (2026-04-30 frissítés: hova_congregation_id is INSERT-elve)
            ELSIF p_profile_key = 'movement_elkoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_elkoltozott', v_year);
                END IF;
                INSERT INTO public.elkoltozott (
                    id_szemely, kulfoldre, mikor, megjegyzes, hovaid, egyhazi_szam,
                    hova_congregation_id, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    COALESCE((v_row->>'kulfoldre')::boolean, false),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    v_egyhazi_value,
                    NULLIF(v_row->>'hova_congregation_id', '')::uuid,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ÁTTÉRT
            ELSIF p_profile_key = 'movement_attert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_attert', v_year);
                END IF;
                INSERT INTO public.attert (
                    id_szemely, felekezet, mikor, igazolas, egyhazi_szam, megjegyzes,
                    honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp, NULLIF(v_row->>'igazolas', ''),
                    v_egyhazi_value, NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'honnanid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KITÉRT
            ELSIF p_profile_key = 'movement_kitert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_kitert', v_year);
                END IF;
                INSERT INTO public.kitert (
                    id_szemely, felekezet, mikor, megjegyzes, hovaid, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp, NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    v_egyhazi_value, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;
            END IF;

        EXCEPTION
            WHEN unique_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'warning', 'message', 'Dupla bejegyzés (UNIQUE) — már létezik');
            WHEN foreign_key_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'FK hiba: ' || SQLERRM);
            WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', SQLERRM);
        END;
    END LOOP;

    inserted_count := v_inserted;
    skipped_count := v_skipped;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_registry$;

COMMENT ON FUNCTION public.import_registry_batch(uuid, text, jsonb, boolean) IS
  'Anyakönyvi tömeges import (keresztelés / konfirmáció / házasság / temetés / mozgások). '
  '2026-08-11: a szerkezetileg halott „Studio bypass" javítva — SECURITY DEFINER törzsben a '
  'current_user a TULAJDONOS, ezért a régi ellenőrzés sosem sült el, és minden bejelentkezés '
  'nélküli hívó master jogot kapott. Mostantól session_user dönt, plusz fail-closed előkapuk '
  '(aktív tisztségviselő) és három legitim út: system admin / jóváhagyott admin_access_requests / '
  'saját hatókör. A saját-hatókör ág BETŰRE a nyolc anyakönyvi tábla RLS-e '
  '(current_user_congregation_id() VAGY current_user_has_global_access()) — SZÁNDÉKOSAN NEM a '
  'tágabb current_user_can_access_congregation(), mert az SECURITY DEFINER törzsben az esperesnek '
  'olyan tömeges írási jogot adna, amit egyesével nem kapna meg.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Jogosultságok rendezése (idempotens, minden szignatúrán)
-- ────────────────────────────────────────────────────────────────────────────
--
-- A 2026-08-11-security-definer-hardening.sql 8. szakasza ezt már elvégezte;
-- itt MEGISMÉTELJÜK, hogy ez a fájl önmagában is elegendő legyen, és hogy egy
-- későbbi `CREATE OR REPLACE` se hozhassa vissza az alapértelmezett anon-jogot.

DO $import_jogok$
DECLARE
  v_sig text;
  v_db  integer := 0;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    v_db := v_db + 1;
  END LOOP;

  IF v_db = 0 THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — az import_registry_batch a CREATE OR REPLACE után sem található. Ez nem fordulhat elő.';
  ELSE
    RAISE NOTICE '2026-08-11: import_registry_batch — % szignatúrán rendezve a jog (anon/PUBLIC elvéve, authenticated megtartva).', v_db;
  END IF;
END
$import_jogok$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. PostgREST séma-újratöltés
-- ────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS (a COMMIT után futtatható, csak olvas) ======================
--
-- ⚠️ A Supabase SQL Editor CSAK AZ UTOLSÓ statement eredményét mutatja meg!
--    Ezért az egész ellenőrzés EGYETLEN SELECT (UNION ALL-lal összefűzve).
--    Jelöld ki a blokkot, és úgy futtasd.
-- ════════════════════════════════════════════════════════════════════════════

SELECT '01. import_registry_batch — létezik'                        AS ellenorzes,
       (to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)') IS NOT NULL)::text AS eredmeny,
       'true' AS vart
UNION ALL SELECT '02. a HALOTT current_user-os bypass ELTŰNT a törzsből',
       (SELECT COALESCE(bool_and(pg_get_functiondef(p.oid) NOT LIKE '%current_user IN (%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '03. a törzs session_user-t vizsgál',
       (SELECT COALESCE(bool_and(pg_get_functiondef(p.oid) LIKE '%session_user IN (%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '04. a törzsben ott az aktív-tisztségviselő kapu',
       (SELECT COALESCE(bool_and(pg_get_functiondef(p.oid) LIKE '%current_user_is_active_staff%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '05. a törzsben ott a saját-gyülekezet hatókör-kapu',
       (SELECT COALESCE(bool_and(pg_get_functiondef(p.oid) LIKE '%current_user_congregation_id%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
-- A TÁGABB segédnek NEM szabad a törzsben lennie (lásd a fejléc 3. pontját):
-- az esperesnek olyan tömeges írási jogot adna, amit egyesével nem kapna meg.
--
-- ⚠️ 2026-08-11 JAVÍTVA — a korábbi változat élesben `false`-ot adott, és ez
--    FALS POZITÍV volt. A `pg_get_functiondef()` a törzset BETŰRE adja vissza,
--    KOMMENTESTÜL — a `current_user_can_access_congregation` sztring pedig
--    ott van a törzsben, de CSAK abban a magyarázó kommentben, amelyik épp azt
--    mondja ki: „⛔ ITT SZÁNDÉKOSAN NEM ez áll". Az ellenőrzés tehát a saját
--    dokumentációján bukott el. Mostantól ELŐBB kivágjuk a `--` sorvégi
--    kommenteket, és csak utána keresünk — így a sor a HÍVÁST méri, nem a
--    szöveget. A 05d. sor külön ki is mondja, hogy az említés csak komment.
UNION ALL SELECT '05b. a TÁGABB can_access_congregation NINCS a törzsben (komment nélkül)',
       (SELECT COALESCE(bool_and(
                 regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
                 NOT LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '05d. …és a tágabb segéd EMLÍTÉSE kizárólag kommentben szerepel',
       (SELECT COALESCE(bool_and(
                 pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'
                 AND regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
                     NOT LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
-- A jog-kapu NULL-biztos: enélkül egy gyülekezet nélküli hívónál a feltétel
-- NULL-ra értékelődne, és a kivétel ELMARADNA (fail-open).
UNION ALL SELECT '05c. a jog-kapu NULL-biztos (COALESCE)',
       (SELECT COALESCE(bool_and(pg_get_functiondef(p.oid) LIKE '%COALESCE(v_is_master, false)%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '06. a szignatúra VÁLTOZATLAN',
       COALESCE((SELECT pg_get_function_identity_arguments(
                   to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)')::oid)),
                '(nincs ilyen függvény)'), 'uuid, text, jsonb, boolean'
UNION ALL SELECT '07. továbbra is SECURITY DEFINER',
       (SELECT COALESCE(bool_and(p.prosecdef), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '08. anon NEM hívhatja',
       COALESCE(has_function_privilege('anon',
           to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)')::oid, 'EXECUTE')::text,
           '(nincs ilyen függvény)'), 'false'
-- A PUBLIC nem valódi szerep, ezért a has_function_privilege() NEM használható
-- rá ('role "public" does not exist'). Az ACL-t bontjuk szét: grantee = 0 a
-- PUBLIC. NULL proacl = alapértelmezés, ami FÜGGVÉNYNÉL a PUBLIC EXECUTE-ot
-- jelenti — azt is bukásnak számoljuk.
UNION ALL SELECT '09. PUBLIC (mindenki) NEM hívhatja',
       (SELECT COALESCE(bool_and(
                 p.proacl IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
               ), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch')::text, 'true'
UNION ALL SELECT '10. authenticated HÍVHATJA',
       COALESCE(has_function_privilege('authenticated',
           to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)')::oid, 'EXECUTE')::text,
           '(nincs ilyen függvény)'), 'true'
UNION ALL SELECT '11. current_user_is_active_staff() segéd létezik',
       (to_regprocedure('public.current_user_is_active_staff()') IS NOT NULL)::text, 'true'
UNION ALL SELECT '12. current_user_congregation_id() segéd létezik',
       (to_regprocedure('public.current_user_congregation_id()') IS NOT NULL)::text, 'true'
UNION ALL SELECT '12b. current_user_has_global_access() segéd létezik',
       (to_regprocedure('public.current_user_has_global_access()') IS NOT NULL)::text, 'true'
UNION ALL SELECT '12c. az RPC hatóköre EGYEZIK a nyolc tábla RLS-ével (8 policy)',
       (SELECT COUNT(*)::text FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes',
                             'bekoltozott','elkoltozott','attert','kitert')
           AND qual LIKE '%current_user_congregation_id%'
           AND qual LIKE '%current_user_has_global_access%'), '8'
UNION ALL SELECT '13. merge_spouses_bulk — továbbra is ELTŰNT (rokon hibaosztály)',
       (to_regprocedure('public.merge_spouses_bulk()') IS NULL)::text, 'true';
-- Várt: 18 sor, MINDEGYIKNÉL eredmeny = vart. (2026-08-11: +1 sor — 05d.)

-- ─── TÁMADÁS-SZIMULÁCIÓ STUDIÓBÓL ──────────────────────────────────────────
--
-- ⚠️ FIGYELEM: a Studio SQL Editor SUPERUSER kapcsolat (`session_user` =
--    'postgres'), tehát ott a bypass SZÁNDÉKOSAN működik — a lenti hívás
--    LEFUTNA és ÍRNA. Ezért NEM futtatjuk. A helyes negatív teszt a felületről
--    megy (lásd FÜSTTESZT C/4), egy idegen gyülekezet UUID-jével.
--
-- SELECT * FROM public.import_registry_batch(
--     (SELECT id FROM public.congregations ORDER BY id LIMIT 1),
--     'baptism', '[]'::jsonb, false);
--   Studióból: LEFUT (üres tömb → 0 beszúrás). Ez NEM hiba.
--   PostgREST-en, bejelentkezés nélkül: 401/403 (nincs EXECUTE joga az anon-nak).

-- ════════════════════════════════════════════════════════════════════════════
-- === FÜSTTESZT (a futtatás után, ÉLES bejelentkezéssel, a felületen) ========
--
-- Cél: bizonyítani, hogy (A) semmi legitim nem tört el, (B) a lyuk zárva.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ─── A) LELKÉSZI FIÓKKAL (aktív, gyülekezethez kötött) ─────────────────────
--
--   1. ANYAKÖNYV — a modul normálisan nyílik
--      Jelentkezz be lelkészként → Anyakönyv.
--      VÁRT: a keresztelési / konfirmációs / házassági / temetési fülek
--      betöltenek, a listák megjelennek. (Ez nem érinti az RPC-t, de kizárja,
--      hogy a modul már a belépésnél eltört volna.)
--
--   2. ANYAKÖNYV — PIN-nel feloldott importáló, SAJÁT gyülekezetbe
--      Anyakönyv → „Rendszergazdai importáló" fül → 6 jegyű PIN → tölts fel egy
--      KIS (3-5 soros) keresztelési munkafüzetet → Importálás.
--      VÁRT: „N sor rögzítve" visszajelzés, és a sorok megjelennek a
--      keresztelési listában.
--      ⚠️ EZ A LEGFONTOSABB TESZT: pontosan ezt az utat nyitotta meg a
--         (6) `v_in_scope` ág. A javítás ELŐTT ez a fióktípus
--         „Nincs jogosultság a(z) … gyülekezethez." hibára futott volna.
--
--   3. ANYAKÖNYV — hibás sor kezelése változatlan
--      Ugyanaz a feltöltés, de egy sorban hiányzó dátummal.
--      VÁRT: az import lefut, a hibás sor „kihagyva" jelzést kap, a hibaüzenet
--      a megszokott magyar szöveg. (A hibagyűjtő ág betűre változatlan.)
--
-- ─── B) RENDSZERGAZDA (master) FIÓKKAL ─────────────────────────────────────
--
--   4. GOD-MODE — idegen gyülekezetbe importálás
--      Jelentkezz be masterként → aktiváld a god-mode-ot → válts arra a
--      gyülekezetre, amelyikbe importálni akarsz → Anyakönyv → Rendszergazdai
--      importáló → kis munkafüzet → Importálás.
--      VÁRT: sikeres import. (Ez a (4) `v_is_master` ág — változatlan.)
--
--   5. LEJÁRT admin-hozzáférés
--      Ha van olyan `admin_access_requests` sor, amely `approved`, de
--      `expires_at` már elmúlt: azzal a fiókkal próbáld az importot.
--      VÁRT: „Nincs jogosultság a(z) … gyülekezethez." (Az (5) ág `expires_at >
--      now()` feltétele változatlan.)
--
-- ─── C) NEGATÍV TESZT — a lyuk tényleg zárva van-e ─────────────────────────
--
--   6. BEJELENTKEZÉS NÉLKÜL, közvetlenül a PostgREST-nek
--      curl -X POST '<SUPABASE_URL>/rest/v1/rpc/import_registry_batch' \
--           -H 'apikey: <ANON_KULCS>' -H 'Content-Type: application/json' \
--           -d '{"p_target_congregation_id":"<BÁRMELY UUID>","p_profile_key":"baptism","p_rows":[]}'
--      VÁRT: 401 vagy 403 — „permission denied for function import_registry_batch".
--      TILOS: 200-as válasz. Ha 200 jön, a jog-visszavonás nem futott le.
--
--   7. PENDING (még jóvá nem hagyott) FIÓKKAL
--      Regisztrálj egy új fiókot a /hozzaferes-kerese oldalon, erősítsd meg az
--      e-mailt, de NE hagyd jóvá. A kapott JWT-vel hívd az RPC-t közvetlenül.
--      VÁRT: ERROR — „Nincs jogosultság az anyakönyvi importhoz (a fiók nem
--      aktív tisztségviselő)." (Ez a (3) előkapu.)
--
--   8. IDEGEN GYÜLEKEZET, lelkészi fiókkal
--      Lelkészként hívd az RPC-t egy MÁSIK gyülekezet UUID-jével (a wizard
--      `targetCongregationId` mezője a kliensről jön, tehát ez preparálható).
--      VÁRT: ERROR — „Nincs jogosultság a(z) … gyülekezethez."
--      TILOS: sikeres beszúrás.
--
--   9. IDEGEN GYÜLEKEZET, ESPERESI / EGYHÁZMEGYEI ADMIN fiókkal
--      Ugyanaz, de esperesi fiókkal, a SAJÁT egyházmegyéje egy MÁSIK
--      gyülekezetének UUID-jével.
--      VÁRT: ERROR — „Nincs jogosultság a(z) … gyülekezethez."
--      TILOS: sikeres beszúrás. Ha SIKERÜL, akkor a törzs (6) ága mégis a
--      TÁGABB `current_user_can_access_congregation()`-t hívja — nézd meg a
--      fenti 05b. ellenőrző sort. (Ez a fájl épp ezt a hibát kerüli el:
--      az esperes egyesével sem tud írni ezekbe a táblákba, tehát tömegesen
--      sem szabad.)
--
-- ════════════════════════════════════════════════════════════════════════════
-- === VISSZAÁLLÍTÁS =========================================================
--
-- Ez a fájl EGYETLEN adatsort sem ír és egyetlen sémaelemet sem dob el: csak
-- egy függvény-törzset cserél (`CREATE OR REPLACE`) és jogot rendez. Az egész
-- egy tranzakcióban van, tehát hiba esetén magától visszagördül.
--
-- HA MÁR LEFUTOTT, ÉS VISSZA KELL ÁLLNI (pl. mert egy legitim import elbukott):
--
--   A) A HELYES visszaállítás: futtasd újra a
--        migration-docs/sql/2026-04-30e-import-batch-elkoltozott-target.sql
--      fájlt. Az EREDETI (2026-04-30-i) törzset teszi vissza, változatlan
--      szignatúrával. A beszúró ágak betűre azonosak, tehát az adat-viselkedés
--      ugyanaz — CSAK a jog-ellenőrzés megy vissza a régire.
--
--   ⛔ FIGYELEM: a régi törzsben BENNE VAN a szerkezetileg halott
--      `current_user IN (…)` bypass, vagyis a visszaállítással a LYUK IS
--      VISSZAJÖN. Ezért utána AZONNAL futtasd le ezt a jog-visszavonást is
--      (ugyanaz, mint a fenti 2. szakasz), hogy legalább az `anon` ne érje el:
--
--        DO $vissza$
--        DECLARE v_sig text;
--        BEGIN
--          FOR v_sig IN
--            SELECT p.oid::regprocedure::text
--            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public' AND p.proname = 'import_registry_batch'
--          LOOP
--            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
--            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
--          END LOOP;
--        END
--        $vissza$;
--        NOTIFY pgrst, 'reload schema';
--
--   B) Ha CSAK a (6) hatókör-ág a gond (valakinek jogosan kellene idegen
--      gyülekezetbe importálnia), akkor NE ezt a fájlt gördítsd vissza. A
--      helyes lépés: külön fájlban, tudatosan tágítsd a nyolc anyakönyvi tábla
--      RLS-ét — és utána ez a törzs magától követi, mert ugyanazt a két segédet
--      hívja, amit a policy-k.
