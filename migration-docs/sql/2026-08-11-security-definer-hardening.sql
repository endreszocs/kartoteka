-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — P0/P1/P2 BIZTONSÁGI JAVÍTÁS: őrizetlen SECURITY DEFINER RPC-k
-- Dátum: 2026-08-11
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- FUTTATÁSI SORREND: ELŐBB a 2026-08-11-cross-match-rpc-hardening.sql, UTÁNA ez.
--   (A testvér-fájl 0. szakasza hozza létre a `current_user_is_active_staff()`
--    segédet, ha az valamiért hiányozna. Ez a fájl már csak ELLENŐRZI a
--    meglétét, és hiány esetén MEGÁLL — nem épít párhuzamos segédet.)
--   A két fájl között NINCS más függőség: külön függvényhalmazt érintenek.
--
-- ─── MI VOLT A LYUK? ────────────────────────────────────────────────────────
--
-- Hat `SECURITY DEFINER` függvény futott `GRANT EXECUTE … TO authenticated`
-- joggal, hívó-oldali hatókör-ellenőrzés NÉLKÜL. A támadási lánc ÉLES:
--
--   · a publikus /hozzaferes-kerese regisztráció AZONNAL létrehoz egy
--     `auth.users` sort a kérelmező által választott jelszóval, és az app maga
--     küldi ki a megerősítő linket → a támadó VALÓDI `authenticated` JWT-t kap,
--     miközben a profilja még `status = 'pending'`;
--   · a JWT-vel közvetlenül a PostgREST-hez beszél (publikus anon kulcs +
--     Authorization fejléc) → a dashboard /pending átirányítása IRRELEVÁNS;
--   · a `congregations_for_registration()` `anon`-nak is GRANT-olt, és az
--     ORSZÁG ÖSSZES gyülekezet-UUID-jét visszaadja → kész a céllista.
--
-- Amit ezzel meg lehetett tenni:
--
--   1) P0 — get_csaladok_for_congregation(uuid, timestamptz)
--      (2026-07-24-pr8-csalad-gyerek-rpc-gte.sql:17, GRANT :53)
--      BÁRMELY gyülekezet-UUID-re visszaadta a teljes `csalad` sorokat:
--      mindkét házastárs szemely-id-je + a TELJES lakcím (utca-id, házszám,
--      tömbház, lépcsőház, emelet, ajtó). Nulla hívó-ellenőrzés.
--
--   2) P0 — get_gyerek_for_congregation(uuid, timestamptz)
--      (ugyanaz a fájl :55, GRANT :78)
--      A `gyerek` junction-sorok (id_csalad ⇄ id_szemely). Az 1)-gyel együtt
--      az ORSZÁGOS szülő–gyermek gráf rekonstruálható, KISKORÚAKKAL együtt.
--      Ez a hat közül a legsúlyosabb.
--
--   3) P0 (integritás) — merge_spouses_bulk()
--      (2026-04-26-FIX-merge-spouses-v5-rpc.sql:16, GRANT :235)
--      Egyetlen „Studio bypass" őre volt: `IF auth.uid() IS NULL THEN … END IF`.
--      Bejelentkezett hívónál ez a feltétel SOHA nem lép be → bárki elindíthatta
--      az ORSZÁGOS `csalad`/`szemely` átírást (UPDATE + DELETE + csaladfo-váltás).
--      ⚠️ Ráadásul a belső ág (`current_user NOT IN ('postgres', …)`) is vak:
--      SECURITY DEFINER függvényben a `current_user` a TULAJDONOS (postgres),
--      nem a hívó — tehát az az ellenőrzés MINDIG igazat ad.
--
--   4) P1 — next_chitanta_full(uuid, date)
--      (2026-07-02-fix-next-chitanta-ambiguous.sql:14, GRANT :81)
--      Nem csak OLVAS, hanem ÍR: idegen gyülekezet nyugtatömbjén
--      `felhasznalt_darabszam++`, dátum-mezők átírása, és a tömb
--      `aktiv = false`-ra billentése. Számégetés + tömb-kilövés távolról.
--
--   5) P1 — next_chitanta_number(uuid, text)
--      (2026-04-16-wc2-7-chitanta-tomb.sql:62, GRANT :104)
--      Idegen gyülekezet `oblio_fiokok.chitanta_kovetkezo_szam` számlálóját
--      pörgette előre — a fizikai nyugtatömbbel való szinkron elrontható.
--
--   6) P2 — generate_egyhazi_anyakonyvi_szam(uuid, text, int)
--      (2026-04-29b-egyhazi-szam-szetvalasztas.sql:201, GRANT :252)
--      A visszaadott `YYYYTTNNNN` szám utolsó 4 jegye = az adott gyülekezet
--      adott évi keresztelés/konfirmálás/házasság/temetés/mozgás DARABSZÁMA+1.
--      Ciklusban (8 profil × N év × összes gyülekezet) az egész ország
--      egyházi statisztikája leszedhető volt.
--
-- ─── PLUSZ, AMIT MENET KÖZBEN TALÁLTUNK ────────────────────────────────────
--
--   A) `anon` IS FUT: a Supabase alapértelmezett jog-beállítása
--      (`ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon, authenticated`)
--      miatt ezekre a függvényekre a BEJELENTKEZÉS NÉLKÜLI `anon` szerep is
--      kapott EXECUTE jogot. A 2026-04-17-anon-revoke-grant-szigoritas.sql csak
--      TÁBLA-jogokat vont vissza, FÜGGVÉNY-jogot nem. Ezért minden itt érintett
--      függvényről explicit `REVOKE … FROM PUBLIC, anon` is megy (8. szakasz).
--
--   B) `registration_email_info(text)` (2026-06-05c, `anon`-nak GRANT-olt):
--      az `access_requests`-fallback ág olyat szivárogtat, amit a fájl saját
--      fejléce NEM sorol az elfogadott kockázatok közé. A fejléc az e-mail-
--      felsorolást vállalja; azt NEM, hogy egy tetszőleges e-mail-címről
--      bejelentkezés nélkül megtudható: „ez az ember ENNÉL a gyülekezetnél
--      kérelmez". A `profiles`-ág (jóváhagyott felhasználó gyülekezete) marad.
--
--   C) `log_audit_event(...)` (2026-04-23-m0-REPAIR-idempotent.sql:311):
--      bármely bejelentkezett fiók KORLÁTLAN mennyiségű, TETSZŐLEGES tartalmú
--      sort írhatott az `audit_log`-ba (napló-mérgezés + tárhely-kimerítés).
--      A táblán ráadásul közvetlen `GRANT INSERT … TO authenticated` is volt,
--      tehát az RPC megkerülhető volt.
--
-- ─── MI A JAVÍTÁS? ──────────────────────────────────────────────────────────
--
--   Minden ÉLETBEN MARADÓ függvény a MEGLÉVŐ hatókör-segédekre köt:
--     `current_user_is_active_staff()`, `current_user_can_access_congregation()`,
--     `current_user_congregation_id()`. Új, párhuzamos segéd NEM készül.
--   FAIL-CLOSED: `auth.uid() IS NULL` → kivétel; NULL hatókör → semmi.
--   A `merge_spouses_bulk()` elhasznált, egyszeri migrációs segéd → ELDOBJUK.
--
-- ─── SZIGNATÚRÁK ────────────────────────────────────────────────────────────
--
--   EGYETLEN szignatúra sem változik → az apps/ és packages/ hívások
--   VÁLTOZATLANUL működnek, a SQL futása ELŐTT és UTÁN is. (A hívóhelyek
--   felsorolása a fájl végén, a füstteszt előtt.)
--
-- ─── MI MARAD NYITVA (külön javítás kell) ──────────────────────────────────
--
--   · `import_registry_batch(uuid,text,jsonb,boolean)` — a „Studio bypass"
--     ugyanabba a `current_user`-csapdába esik, mint a merge_spouses_bulk:
--     SECURITY DEFINER törzsben a `current_user` a TULAJDONOS, ezért
--     `auth.uid() IS NULL` esetén a függvény MASTER jogot ad magának. Ez a
--     fájl ezt NEM javítja (törzs-átírás kell hozzá), de a 8. szakasz
--     visszavonja róla az `anon`/`PUBLIC` EXECUTE-ot, hogy bejelentkezés nélkül
--     ne legyen elérhető. A törzs-javítás külön migrációt igényel.
--   · `congregations_for_registration()` továbbra is `anon`-nak GRANT-olt.
--   · Hívásszám-korlát (per-user call budget) csak a `log_audit_event`-re van.
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
--
-- ⚠️ A `current_user_is_active_staff()`-ot itt NEM hozzuk létre — azt a
--    testvér-fájl (2026-08-11-cross-match-rpc-hardening.sql) intézi. Ha ez a
--    blokk elbukik, előbb azt futtasd le.

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

  IF NOT v_staff THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA — hiányzik a public.current_user_is_active_staff() segéd. Előbb futtasd a 2026-08-11-cross-match-rpc-hardening.sql fájlt (annak a 0. szakasza létrehozza).';
  END IF;
END
$elofeltetel$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. P0 — csalad / gyerek pull-RPC-k: hatókör-kapu (desktop delta-szinkron)
-- ────────────────────────────────────────────────────────────────────────────
--
-- MI VÁLTOZIK: a törzs `LANGUAGE sql` → `LANGUAGE plpgsql` lesz, hogy a kapu
-- KIVÉTELT tudjon dobni. Az adat-lekérdezés BETŰRE azonos a 2026-07-24-es
-- (PR-8, gte-kurzoros) verzióval — a `>=` határ marad.
--
-- MIÉRT KIVÉTEL ÉS NEM ÜRES LISTA: a néma üres eredmény ebben a projektben már
-- okozott „minden rendben, csak nincs adat" típusú vakfoltot. A desktop
-- `pullFamiliesOfOwnCongregation` a hibát felszínre dobja — az látszik.
--
-- HÍVÓHELY (változatlan szignatúra, változatlan paraméternevek):
--   apps/desktop/src/lib/sync.ts:2456, :2535 (get_csaladok_for_congregation)
--   apps/desktop/src/lib/sync.ts:2595, :2642 (get_gyerek_for_congregation)
-- Mind a négy a SAJÁT profil congregation_id-jét küldi (lokál profil, fallback
-- `profiles` lookup), ezért a kapu a legitim szinkront NEM érinti.

CREATE OR REPLACE FUNCTION public.get_csaladok_for_congregation(
    target_congregation_id UUID,
    updated_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.csalad
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $csaladok$
BEGIN
    -- (1) Fail-closed kapu: bejelentkezés kötelező.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — a család-lekérdezés nem érhető el.';
    END IF;

    -- (2) Aktív tisztségviselő kötelező (a `pending` önregisztrált fiók itt bukik).
    IF NOT public.current_user_is_active_staff() THEN
        RAISE EXCEPTION 'Nincs jogosultság a család-lekérdezéshez (a fiók nem aktív tisztségviselő).';
    END IF;

    -- (3) Hatókör: csak olyan gyülekezet, amelyet a hívó amúgy is elér.
    --     NULL hatókör → a segéd false-t ad → kivétel (fail-closed).
    IF NOT public.current_user_can_access_congregation(target_congregation_id) THEN
        RAISE EXCEPTION 'Nincs jogosultság a congregation_id=% -hoz', target_congregation_id;
    END IF;

    -- (4) A 2026-07-24-es (PR-8) törzs, változatlanul.
    RETURN QUERY
    SELECT DISTINCT c.*
    FROM public.csalad c
    WHERE (
        c.id_ferfi IN (
            SELECT s.id FROM public.szemely s
            WHERE s.congregation_id = target_congregation_id
        )
        OR c.id_no IN (
            SELECT s.id FROM public.szemely s
            WHERE s.congregation_id = target_congregation_id
        )
        OR c.id IN (
            SELECT g.id_csalad FROM public.gyerek g
            WHERE g.id_szemely IN (
                SELECT s.id FROM public.szemely s
                WHERE s.congregation_id = target_congregation_id
            )
        )
    )
    AND (updated_since IS NULL OR c.updated_at >= updated_since)
    ORDER BY c.updated_at ASC;
END;
$csaladok$;

COMMENT ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) IS
    'M8.3a desktop pull helper — a célzott gyülekezet családjai. updated_since: >= (gte) kurzor-határ (PR-8, 2026-07-24). 2026-08-11 (P0-javítás): fail-closed kapu — bejelentkezés + aktív tisztségviselő + current_user_can_access_congregation(target_congregation_id). Korábban BÁRMELY authenticated (akár pending) fiók lekérte bármely gyülekezet családjait a teljes lakcímmel.';

CREATE OR REPLACE FUNCTION public.get_gyerek_for_congregation(
    target_congregation_id UUID,
    updated_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.gyerek
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $gyerek$
BEGIN
    -- (1)–(3) ugyanaz a fail-closed kapu, mint a családoknál.
    --         ⚠️ Ez a hat lyuk közül a legsúlyosabb: KISKORÚAK szülő-kapcsolata.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — a gyerek-kapcsolatok nem kérhetők le.';
    END IF;

    IF NOT public.current_user_is_active_staff() THEN
        RAISE EXCEPTION 'Nincs jogosultság a gyerek-kapcsolatok lekérdezéséhez (a fiók nem aktív tisztségviselő).';
    END IF;

    IF NOT public.current_user_can_access_congregation(target_congregation_id) THEN
        RAISE EXCEPTION 'Nincs jogosultság a congregation_id=% -hoz', target_congregation_id;
    END IF;

    -- (4) A 2026-07-24-es (PR-8) törzs, változatlanul.
    RETURN QUERY
    SELECT g.*
    FROM public.gyerek g
    WHERE g.id_szemely IN (
        SELECT s.id FROM public.szemely s
        WHERE s.congregation_id = target_congregation_id
    )
    AND (updated_since IS NULL OR g.updated_at >= updated_since)
    ORDER BY g.updated_at ASC;
END;
$gyerek$;

COMMENT ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) IS
    'M8.3a desktop pull helper — gyerek-junction sorok. updated_since: >= (gte) kurzor-határ (PR-8, 2026-07-24). 2026-08-11 (P0-javítás): fail-closed kapu — bejelentkezés + aktív tisztségviselő + current_user_can_access_congregation(target_congregation_id). Korábban az 1) családi RPC-vel együtt az ORSZÁGOS szülő–gyermek gráf (kiskorúakkal) rekonstruálható volt.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. P0 (integritás) — merge_spouses_bulk() ELDOBÁSA
-- ────────────────────────────────────────────────────────────────────────────
--
-- Elhasznált, EGYSZERI migrációs segéd volt (a „hiányzó házastársak" 2026-04-26-i
-- akció v5 iterációja). Bizonyítékok:
--
--   · NINCS hívója sehol: `apps/**`, `packages/**` teljes keresés → 0 találat
--     (csak CHANGELOG/terv-dokumentum említi).
--   · A saját utóélete szerint EL SEM készült élesben:
--     docs/project-tracking/KARTOTEKA-tagnyilvantartas-auto-link-2026-04-26.md:379
--     „v5 — egyetlen RPC BEGIN/COMMIT-ban: MCP-vel ellenőriztem, a
--      merge_spouses_bulk függvény NEM létezett az adatbázisban a futtatás után."
--     (a Studio csak az utolsó statementet futtatta) — ugyanez a
--     docs/CHANGELOG.md:10540 sorban is.
--   · A tényleges merge-t a v7–v9 KÜLÖN scriptek végezték el (`_merge_v7_result`
--     táblával) — azok le is futottak, az eredmény dokumentált.
--
-- Ezért NEM őrizzük meg, hanem ELDOBJUK. A DROP … IF EXISTS idempotens: ha
-- tényleg nem létezik, semmit nem csinál, hibát sem ad.
--
-- ⚠️ Ha a jövőben újra kell egy tömeges házastárs-összevonás, azt EGYSZERI,
--    kézzel futtatott DO-blokkal kell megcsinálni — NEM `authenticated`-nek
--    GRANT-olt, országos hatókörű RPC-vel.

DROP FUNCTION IF EXISTS public.merge_spouses_bulk();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. P1 — next_chitanta_full(uuid, date): hatókör-kapu
-- ────────────────────────────────────────────────────────────────────────────
--
-- A kapu SZÓ SZERINT a már helyesen őrzött testvérekből jön:
--   `reserve_iratszam`          (2026-04-25-a-m7-9a-iratszam-pointers.sql:156)
--   `reserve_chitanta_numbers`  (2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql:50)
-- (Megjegyzés: a reserve_chitanta_numbers hibaszövegében `%s` szerepel — az a
--  plpgsql RAISE-ben nem helyes helyőrző; itt a reserve_iratszam helyes `%`
--  változatát vesszük át.)
--
-- A törzs egyebekben BETŰRE a 2026-07-02-es ambiguous-fix verzió
-- (`#variable_conflict use_column` + `os.` alias megmarad).
--
-- HÍVÓHELYEK (változatlan szignatúra):
--   apps/web/app/(dashboard)/penzugy/chitanta-actions.ts:222 → effectiveCongregationId
--   packages/core/src/finance/chitanta/auto-issue-for-befizetes.ts:136 → input.congregationId
-- Mindkettő UGYANAZT a gyülekezet-id-t írja rögtön utána az `oblio_szamlak`-ba,
-- amelynek RLS-e (`oblio_szamlak_access`) UGYANEZT a segédet használja — tehát
-- ha az INSERT ma működik, a kapu is átengedi. Nincs app-oldali teendő.

CREATE OR REPLACE FUNCTION public.next_chitanta_full(
  p_congregation_id uuid,
  p_szamla_datum date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  tomb_id uuid,
  nyomdai_szam integer,
  gyulekezeti_szam integer,
  sorozat text,
  maradek integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $chitanta_full$
#variable_conflict use_column
DECLARE
  v_tomb_id uuid;
  v_sorozat text;
  v_szam_kezdet integer;
  v_felhasznalt integer;
  v_darabszam integer;
  v_nyomdai integer;
  v_gyul integer;
  v_year integer;
BEGIN
  -- 0/a. Fail-closed kapu — bejelentkezés + aktív tisztségviselő
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — nyugtaszám nem foglalható.';
  END IF;

  IF NOT public.current_user_is_active_staff() THEN
    RAISE EXCEPTION 'Nincs jogosultság a nyugtaszám-foglaláshoz (a fiók nem aktív tisztségviselő).';
  END IF;

  -- 0/b. Hatókör-ellenőrzés (reserve_iratszam mintája) — MIELŐTT bármit ÍRNÁNK
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RAISE EXCEPTION 'Nincs jogosultság a congregation_id=% -hoz', p_congregation_id;
  END IF;

  -- 1. Aktív, nem-kifogyott tömb keresése (legkisebb szám_kezdet először)
  SELECT ct.id, ct.seria, ct.szam_kezdet, ct.felhasznalt_darabszam, ct.darabszam_ossz
    INTO v_tomb_id, v_sorozat, v_szam_kezdet, v_felhasznalt, v_darabszam
    FROM public.chitanta_tombok ct
    WHERE ct.congregation_id = p_congregation_id
      AND ct.aktiv = true
      AND ct.felhasznalt_darabszam < ct.darabszam_ossz
    ORDER BY ct.szam_kezdet ASC
    LIMIT 1;

  IF v_tomb_id IS NULL THEN
    RAISE EXCEPTION 'no_active_block' USING
      HINT = 'Nincs aktív nyugtatömb. A lelkész rögzítsen egy új tömböt a Nyugtatömbök oldalon.';
  END IF;

  -- 2. Következő kerületi szám a tömbből
  v_nyomdai := v_szam_kezdet + v_felhasznalt;

  -- 3. Gyülekezeti saját szám — év eleji újraindítás (aliasolt oszlopok!)
  v_year := EXTRACT(YEAR FROM p_szamla_datum);
  SELECT COALESCE(MAX(os.gyulekezeti_szam), 0) + 1
    INTO v_gyul
    FROM public.oblio_szamlak os
    WHERE os.congregation_id = p_congregation_id
      AND os.tipus = 'chitanta_papir'
      AND EXTRACT(YEAR FROM os.szamla_datum) = v_year
      AND os.stornozott = false;

  -- 4. Felhasznalt_darabszam increment (+ dátum frissítés)
  UPDATE public.chitanta_tombok ct
    SET felhasznalt_darabszam = ct.felhasznalt_darabszam + 1,
        elso_hasznalat_datum = COALESCE(ct.elso_hasznalat_datum, p_szamla_datum),
        utolso_hasznalat_datum = p_szamla_datum,
        aktiv = CASE WHEN ct.felhasznalt_darabszam + 1 >= ct.darabszam_ossz THEN false ELSE ct.aktiv END,
        updated_at = now()
    WHERE ct.id = v_tomb_id;

  -- 5. Visszaadjuk a lefoglalt számokat
  RETURN QUERY SELECT v_tomb_id, v_nyomdai, v_gyul, v_sorozat, (v_darabszam - v_felhasznalt - 1);
END;
$chitanta_full$;

COMMENT ON FUNCTION public.next_chitanta_full(uuid, date) IS
  'Atomikus nyugtaszám-lefoglalás (2026-07-02 ambiguous-fix). 2026-08-11 (P1-javítás): fail-closed kapu — bejelentkezés + aktív tisztségviselő + current_user_can_access_congregation(p_congregation_id), MÉG AZ ÍRÁS ELŐTT. Korábban bármely authenticated fiók égette idegen gyülekezet nyugtaszámait, és ki tudta lőni a tömbjét (aktiv=false).';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. P1 — next_chitanta_number(uuid, text): hatókör-kapu
-- ────────────────────────────────────────────────────────────────────────────
--
-- Ugyanaz a kapu. A törzs BETŰRE a 2026-04-16-os (WC-2.7) verzió.
--
-- HÍVÓHELY (változatlan szignatúra):
--   packages/core/src/finance/chitanta/issue.ts:190 → clean.congregationId
-- Ez a kliens-oldali online chitanță-kiállítás; a rákövetkező `oblio_szamlak`
-- INSERT RLS-e ugyanezt a segédet használja → nincs app-oldali teendő.

CREATE OR REPLACE FUNCTION public.next_chitanta_number(
  p_congregation_id uuid,
  p_sorozat text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $chitanta_szam$
DECLARE
  v_current_max integer;
  v_stored_next integer;
  v_next integer;
BEGIN
  -- 0/a. Fail-closed kapu
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — nyugtaszám nem foglalható.';
  END IF;

  IF NOT public.current_user_is_active_staff() THEN
    RAISE EXCEPTION 'Nincs jogosultság a nyugtaszám-foglaláshoz (a fiók nem aktív tisztségviselő).';
  END IF;

  -- 0/b. Hatókör-ellenőrzés (reserve_chitanta_numbers mintája) — ÍRÁS ELŐTT
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RAISE EXCEPTION 'Nincs jogosultság a congregation_id=% -hoz', p_congregation_id;
  END IF;

  -- A stored value (oblio_fiokok.chitanta_kovetkezo_szam)
  SELECT chitanta_kovetkezo_szam
    INTO v_stored_next
    FROM public.oblio_fiokok
    WHERE congregation_id = p_congregation_id
    LIMIT 1;

  -- A DB-ben a sorozat aktuális max száma (chitanță, nem sztornózott)
  SELECT COALESCE(MAX(szam), 0)
    INTO v_current_max
    FROM public.oblio_szamlak
    WHERE congregation_id = p_congregation_id
      AND tipus = 'chitanta_papir'
      AND sorozat = p_sorozat
      AND stornozott = false;

  -- A nagyobbat választjuk, hogy a fizikai tömbbel se ütközzünk
  v_next := GREATEST(COALESCE(v_stored_next, 1), v_current_max + 1);

  -- Frissítjük az oblio_fiokok-ot is
  UPDATE public.oblio_fiokok
    SET chitanta_kovetkezo_szam = v_next + 1,
        updated_at = now()
    WHERE congregation_id = p_congregation_id;

  RETURN v_next;
END;
$chitanta_szam$;

COMMENT ON FUNCTION public.next_chitanta_number(uuid, text) IS
  'Atomi módon visszaadja a következő szabad chitanță-számot a megadott sorozaton belül, és inkrementálja a stored next-et. Concurrency-safe. 2026-08-11 (P1-javítás): fail-closed kapu — bejelentkezés + aktív tisztségviselő + current_user_can_access_congregation(p_congregation_id).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. P2 — generate_egyhazi_anyakonyvi_szam(uuid, text, int): hatókör-kapu
-- ────────────────────────────────────────────────────────────────────────────
--
-- MIÉRT SZIVÁRGÁS: a visszaadott `YYYYTTNNNN` utolsó 4 jegye = az adott
-- gyülekezet adott évi, adott típusú anyakönyvi bejegyzéseinek DARABSZÁMA + 1.
-- Ciklusban leszedve ez az egész ország egyházi statisztikája.
--
-- A KAPU HÁROM ÁGA (a 3. kettő az `import_registry_batch` MEGŐRZÉSE miatt kell):
--   (a) `current_user_can_access_congregation(p_target_congregation_id)` —
--       a normál lelkészi / esperesi / admin út;
--   (b) rendszer-szintű admin (`profile_roles`: role='admin', scope='system',
--       aktív + jóváhagyott);
--   (c) DELEGÁLT admin-hozzáférés: jóváhagyott, LE NEM JÁRT `admin_access_requests`
--       sor a hívóra + a cél gyülekezetre.
-- A (b) és (c) SZÓ SZERINT az `import_registry_batch` saját kapujának a mása
-- (2026-04-30e-import-batch-elkoltozott-target.sql:51-61) — azért, mert az
-- import-RPC a törzsében EZT a függvényt hívja, és e nélkül a delegált import
-- elhasalna. Új segédfüggvényt NEM vezetünk be, csak EXISTS-eket.
--
-- HÍVÓHELYEK (változatlan szignatúra):
--   apps/web/app/(dashboard)/anyakonyv/actions.ts:153, :655, :1164, :1330, :1502, :1547
--     → mind `getCongregation()` = getEffectiveCongregationContext().congregationId
--   SQL-belül: public.import_registry_batch(...) — a fenti (b)/(c) ág fedi.

CREATE OR REPLACE FUNCTION public.generate_egyhazi_anyakonyvi_szam(
    p_target_congregation_id uuid,
    p_profile_key text,
    p_year integer DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $egyhazi_szam$
DECLARE
    v_caller uuid := auth.uid();
    v_ok boolean := false;
    v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
    v_type_code text;
    v_table text;
    v_max_seq integer := 0;
    v_next_seq integer;
    v_year_prefix text;
    v_pattern text;
    v_query text;
BEGIN
    -- (1) Fail-closed kapu
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — anyakönyvi szám nem generálható.';
    END IF;

    IF NOT public.current_user_is_active_staff() THEN
        RAISE EXCEPTION 'Nincs jogosultság az anyakönyvi szám generálásához (a fiók nem aktív tisztségviselő).';
    END IF;

    -- (2/a) Normál hatókör
    v_ok := public.current_user_can_access_congregation(p_target_congregation_id);

    -- (2/b) Rendszer-szintű admin
    IF NOT v_ok THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = v_caller
              AND pr.role = 'admin'
              AND pr.scope = 'system'
              AND pr.active = true
              AND pr.approval_status = 'approved'
        ) INTO v_ok;
    END IF;

    -- (2/c) Delegált, le nem járt admin-hozzáférés a cél gyülekezetre
    IF NOT v_ok THEN
        SELECT EXISTS (
            SELECT 1 FROM public.admin_access_requests ar
            WHERE ar.admin_user_id = v_caller
              AND ar.congregation_id = p_target_congregation_id
              AND ar.status = 'approved'
              AND ar.expires_at > now()
        ) INTO v_ok;
    END IF;

    IF NOT v_ok THEN
        RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', p_target_congregation_id;
    END IF;

    -- (3) A 2026-04-29b-es törzs, változatlanul.
    CASE p_profile_key
        WHEN 'baptism'              THEN v_type_code := '01'; v_table := 'keresztseg';
        WHEN 'confirmation'         THEN v_type_code := '02'; v_table := 'konfirmalas';
        WHEN 'marriage'             THEN v_type_code := '03'; v_table := 'hazassag';
        WHEN 'burial'               THEN v_type_code := '04'; v_table := 'temetes';
        WHEN 'movement_bekoltozott' THEN v_type_code := '05'; v_table := 'bekoltozott';
        WHEN 'movement_elkoltozott' THEN v_type_code := '06'; v_table := 'elkoltozott';
        WHEN 'movement_attert'      THEN v_type_code := '07'; v_table := 'attert';
        WHEN 'movement_kitert'      THEN v_type_code := '08'; v_table := 'kitert';
        ELSE
            RAISE EXCEPTION 'Érvénytelen profile_key: %', p_profile_key;
    END CASE;

    v_year_prefix := v_year::text || v_type_code;
    v_pattern := v_year_prefix || '____';

    -- Most már minden táblának van egyhazi_szam mezője
    v_query := format(
        'SELECT COALESCE(MAX(SUBSTRING(egyhazi_szam FROM 7 FOR 4)::integer), 0) FROM public.%I WHERE egyhazi_szam LIKE $1 AND congregation_id = $2',
        v_table
    );
    EXECUTE v_query INTO v_max_seq USING v_pattern, p_target_congregation_id;

    v_next_seq := v_max_seq + 1;
    IF v_next_seq > 9999 THEN
        RAISE EXCEPTION 'Túl sok bejegyzés egy évben (>9999) — formátum-túlcsordulás.';
    END IF;

    RETURN v_year_prefix || lpad(v_next_seq::text, 4, '0');
END;
$egyhazi_szam$;

COMMENT ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) IS
    'Következő egyházi anyakönyvi szám (YYYYTTNNNN) az egyhazi_szam mezőből (2026-04-29b). 2026-08-11 (P2-javítás): fail-closed kapu — bejelentkezés + aktív tisztségviselő + (elérhető gyülekezet VAGY rendszer-admin VAGY le nem járt delegált admin_access_requests). Korábban a szám utolsó 4 jegyéből bármely authenticated fiók kiolvasta bármely gyülekezet évenkénti keresztelés-/házasság-/temetés-darabszámát.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. registration_email_info(text) — az access_requests-fallback KIVÉTELE
-- ────────────────────────────────────────────────────────────────────────────
--
-- MI MARAD: a fájl saját fejlécében VÁLLALT kockázat — e-mail-felsorolás
-- (status) + a MÁR JÓVÁHAGYOTT felhasználó gyülekezetének NEVE
-- (`profiles.congregation_id`). Ez a regisztrációs UX-hez kell:
-- „Ez az e-mail már regisztrálva van a(z) X gyülekezetnél — elfelejtett jelszó?"
--
-- MI TŰNIK EL: az `access_requests.requested_congregation_id` fallback. Az a
-- fejlécben NEM szerepel elfogadott kockázatként, és mást szivárogtat:
-- bejelentkezés NÉLKÜL, tetszőleges e-mail-címre megmondta, hogy az illető
-- MELYIK gyülekezetnél KÉRELMEZ (még el nem bírált, `pending` kérelem).
-- A `pending` fiók ezután `status='pending'` + `congregation_name = null`
-- választ kap — a UX-üzenet („már regisztrálva van, várj a jóváhagyásra")
-- ettől nem sérül.
--
-- HÍVÓHELY: a teljes apps/ + packages/ keresés 0 találat — az app JELENLEG
-- egyáltalán NEM hívja ezt az RPC-t (a bejelentkezési űrlap a
-- `login_email_status`-t használja). A szűkítés tehát semmilyen felületet nem
-- érinthet. (A `login_email_status` szándékosan csak státuszt ad, PII nélkül —
-- azt nem bántjuk.)

CREATE OR REPLACE FUNCTION public.registration_email_info(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $reg_email$
DECLARE
  v_status     text;
  v_cong_id    uuid;
  v_cong_name  text;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN json_build_object('status', 'not_registered', 'congregation_name', NULL);
  END IF;

  -- 1) Profil (a handle_new_user trigger minden auth.users-t tükröz ide)
  SELECT status, congregation_id
    INTO v_status, v_cong_id
  FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;

  IF v_status IS NULL THEN
    RETURN json_build_object('status', 'not_registered', 'congregation_name', NULL);
  END IF;

  -- 2) 2026-08-11: az access_requests-fallback TÖRÖLVE (lásd a szakasz-fejlécet).
  --    Ha a profilon nincs gyülekezet, a válaszban sincs — nem áruljuk el,
  --    hogy az illető hol KÉRELMEZ.

  -- 3) Gyülekezet neve (magyar név elsőbbség, fallback a 'name'-re)
  IF v_cong_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(nev_hu), ''), NULLIF(btrim(name), ''))
      INTO v_cong_name
    FROM public.congregations
    WHERE id = v_cong_id
    LIMIT 1;
  END IF;

  RETURN json_build_object('status', v_status, 'congregation_name', v_cong_name);
END;
$reg_email$;

COMMENT ON FUNCTION public.registration_email_info(text) IS
  'Regisztrációs flow: egy email státusza (not_registered | pending | active | ...) + a hozzá tartozó gyülekezet neve KIZÁRÓLAG a profiles.congregation_id-ből. 2026-08-11: az access_requests.requested_congregation_id fallback TÖRÖLVE — az anon hívó nem tudhatja meg, hogy egy adott e-mail melyik gyülekezetnél KÉRELMEZ. A szándékos (fejlécben vállalt) email-enumeration megmarad. 2026-06-05 / 2026-08-11.';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. log_audit_event(...) — napló-mérgezés és tárhely-kimerítés ellen
-- ────────────────────────────────────────────────────────────────────────────
--
-- A régi törzs feltétel nélkül INSERT-elt. Bármely bejelentkezett fiók
-- (ideértve a `pending` önregisztráltat) korlátlan mennyiségű, tetszőleges
-- `action` / `target_table` / `metadata` sort tudott az `audit_log`-ba írni:
-- a valódi audit-nyomvonal elfullasztható, a tárhely felfújható.
--
-- MIÉRT NEM KÖVETELÜNK „aktív tisztségviselőt": a `login` audit-esemény
-- (apps/web/app/(auth)/login/actions.ts:75 és
--  apps/web/app/(auth)/auth/callback/route.ts:83) MINDEN sikeres belépésnél
-- fut, a még `pending` fiókoknál is — és pont az ilyen belépéseket akarjuk
-- látni a naplóban. Ezért a kapu: bejelentkezés KÖTELEZŐ (anon kizárva),
-- de a státusz nem szűkít; helyette MÉRET- és MENNYISÉG-korlát van.
--
-- HÍVÓHELYEK (változatlan szignatúra): apps/web/lib/audit/log.ts:21 (a közös
-- `logAuditEvent` wrapper) és apps/web/app/(dashboard)/admin/
-- devices-licenses-actions.ts 7 közvetlen hívása. Minden legitim hívás
-- rövid action-t és pár mezős metadata-t küld — a korlátok alatt maradnak.

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_target_table TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_device_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $audit$
DECLARE
  v_caller UUID := auth.uid();
  v_recent INTEGER;
  v_id UUID;
BEGIN
  -- (1) Fail-closed: bejelentkezés nélkül (anon) NINCS naplóírás.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — audit-esemény nem naplózható.';
  END IF;

  -- (2) Alap-validáció: az action kötelező és rövid.
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'Az audit-esemény action mezője kötelező.';
  END IF;

  IF length(p_action) > 120 THEN
    RAISE EXCEPTION 'Túl hosszú audit action (% karakter, max. 120).', length(p_action);
  END IF;

  IF p_target_table IS NOT NULL AND length(p_target_table) > 120 THEN
    RAISE EXCEPTION 'Túl hosszú audit target_table (% karakter, max. 120).', length(p_target_table);
  END IF;

  -- (3) Méret-korlát a metadata-ra (tárhely-kimerítés ellen).
  IF p_metadata IS NOT NULL AND length(p_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'Túl nagy audit metadata (% bájt, max. 8192).', length(p_metadata::text);
  END IF;

  -- (4) Mennyiség-korlát: felhasználónként max. 2000 audit-sor / óra.
  --     A legitim használat nagyságrendekkel alatta van (a legnagyobb művelet
  --     is 1–2 sort ír). Túllépésnél NEM dobunk kivételt — a naplózás
  --     „best-effort" hívás (apps/web/lib/audit/log.ts try/catch-be zárja),
  --     és nem akarjuk, hogy egy elszaladt ciklus felületi hibát okozzon.
  --     Az `idx_audit_log_user_id (user_id, created_at DESC)` index miatt olcsó.
  SELECT COUNT(*) INTO v_recent
  FROM public.audit_log a
  WHERE a.user_id = v_caller
    AND a.created_at > now() - interval '1 hour';

  IF v_recent >= 2000 THEN
    RAISE WARNING 'Audit-korlát: a(z) % felhasználó az elmúlt órában már % eseményt naplózott — az esemény (%) eldobva.',
      v_caller, v_recent, p_action;
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_log (user_id, device_id, action, target_table, target_id, metadata)
  VALUES (v_caller, p_device_id, p_action, p_target_table, p_target_id, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$audit$;

COMMENT ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid) IS
  'Audit-esemény naplózása. 2026-08-11: fail-closed (auth.uid() kötelező, anon kizárva) + action/target_table max. 120 karakter + metadata max. 8192 bájt + felhasználónként max. 2000 esemény/óra (túllépésnél WARNING + NULL, nem kivétel). Korábban bármely bejelentkezett fiók korlátlan, tetszőleges sort írhatott az audit_log-ba.';

-- 7/b. A KÖZVETLEN tábla-írás lezárása
--
-- A 2026-04-23-m0-REPAIR-idempotent.sql:457 `GRANT SELECT, INSERT ON
-- public.audit_log TO authenticated` sora miatt az RPC MEGKERÜLHETŐ volt:
-- a támadó egyszerűen `POST /rest/v1/audit_log`-ot küldött (a
-- `authenticated_insert_audit` policy csak annyit követel, hogy
-- `user_id = auth.uid()`). Innentől az `audit_log`-ba KIZÁRÓLAG a fenti,
-- korlátozott SECURITY DEFINER RPC-n keresztül lehet írni (a függvény
-- tulajdonosa a tábla tulajdonosa is, ezért az INSERT neki továbbra is megy).
--
-- Az OLVASÁS (SELECT) változatlan: az `/admin/naplo` és a
-- `delegated-import/actions.ts:108` rate-limit lekérdezés érintetlen.
-- A teljes apps/ + packages/ keresésben NINCS közvetlen `audit_log` INSERT.

REVOKE INSERT ON public.audit_log FROM authenticated;
REVOKE INSERT ON public.audit_log FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. JOG-HIGIÉNIA — `anon` és `PUBLIC` EXECUTE visszavonása
-- ────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ FONTOS, KEVÉSSÉ ISMERT SUPABASE-VISELKEDÉS: az alapértelmezett
--    `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon, authenticated,
--    service_role` miatt MINDEN újonnan létrehozott public-séma függvényre a
--    BEJELENTKEZÉS NÉLKÜLI `anon` szerep is EXECUTE jogot kap. A projekt
--    2026-04-17-es anon-szigorítása csak TÁBLA-jogokat vont vissza.
--    A fenti kapuk emiatt is fail-closed-ak (auth.uid() IS NULL → kivétel), de
--    a védelem első rétege az legyen, hogy a függvény meg se hívható.
--
-- A `registration_email_info` SZÁNDÉKOSAN marad `anon`-nak GRANT-olva
-- (regisztráció ELŐTTI, bejelentkezés nélküli UX) — csak a PUBLIC-ot vesszük el.

REVOKE ALL ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.next_chitanta_full(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_chitanta_full(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.next_chitanta_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_chitanta_number(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_egyhazi_anyakonyvi_szam(uuid, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.registration_email_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_email_info(text) TO anon, authenticated;

-- 8/b. `import_registry_batch` — CSAK jog-visszavonás, a törzshöz NEM nyúlunk
--
-- Ennek a függvénynek a „Studio bypass" ága ugyanabba a csapdába esik, mint a
-- merge_spouses_bulk-é: SECURITY DEFINER törzsben a `current_user` a
-- TULAJDONOS (postgres), nem a hívó — ezért `auth.uid() IS NULL` esetén a
-- függvény MASTER jogot ad magának (v_studio_bypass := true; v_is_master := true).
-- Bejelentkezés nélküli `anon` hívással ez anyakönyvi sorok TETSZŐLEGES
-- gyülekezetbe importálását jelentené. A törzs-javítás külön migrációt igényel
-- (a bypass-t `session_user`-re vagy egy explicit service-role ellenőrzésre kell
-- cserélni); ADDIG IS elvesszük az anon/PUBLIC EXECUTE-ot, hogy a végpont
-- bejelentkezés nélkül ne legyen elérhető. Az `authenticated` jog változatlan,
-- így a delegált import-varázsló tovább működik.

DO $import_revoke$
DECLARE
  v_sig text;
  v_db  integer := 0;
BEGIN
  -- Minden létező szignatúrán (ha volna több overload is) rendezzük a jogot.
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
    RAISE NOTICE '2026-08-11: az import_registry_batch nem található — a jog-visszavonás kimarad.';
  ELSE
    RAISE NOTICE '2026-08-11: import_registry_batch — % szignatúrán rendezve a jog (anon/PUBLIC elvéve, authenticated megtartva).', v_db;
  END IF;
END
$import_revoke$;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. PostgREST séma-újratöltés
-- ────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS (a COMMIT után futtatható, csak olvas) ======================
--
-- ⚠️ A Supabase SQL Editor CSAK AZ UTOLSÓ statement eredményét mutatja meg!
--    Ezért minden ellenőrzés EGYETLEN SELECT (UNION ALL-lal összefűzve).
--    Jelöld ki az adott blokkot, és úgy futtasd — vagy futtasd egyesével.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── ELLENŐRZÉS 1: minden kapu a helyén van-e? (EGY SELECT) ─────────────────

SELECT '01. get_csaladok_for_congregation — létezik'                AS ellenorzes,
       (SELECT COUNT(*) > 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'get_csaladok_for_congregation')::text AS eredmeny,
       'true' AS vart
UNION ALL SELECT '02. get_csaladok_for_congregation — hatókör-kapu a törzsben',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'get_csaladok_for_congregation')::text, 'true'
UNION ALL SELECT '03. get_gyerek_for_congregation — hatókör-kapu a törzsben',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'get_gyerek_for_congregation')::text, 'true'
UNION ALL SELECT '04. mindkét pull-RPC megőrizte a gte (>=) kurzor-határt',
       (SELECT COUNT(*) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('get_csaladok_for_congregation', 'get_gyerek_for_congregation')
           AND pg_get_functiondef(p.oid) LIKE '%>= updated_since%')::text, 'true'
UNION ALL SELECT '05. merge_spouses_bulk — ELTŰNT',
       (SELECT COUNT(*) = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'merge_spouses_bulk')::text, 'true'
UNION ALL SELECT '06. next_chitanta_full — hatókör-kapu a törzsben',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'next_chitanta_full')::text, 'true'
UNION ALL SELECT '07. next_chitanta_full — a no_active_block jelzés megmaradt',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%no_active_block%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'next_chitanta_full')::text, 'true'
UNION ALL SELECT '08. next_chitanta_number — hatókör-kapu a törzsben',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'next_chitanta_number')::text, 'true'
UNION ALL SELECT '09. generate_egyhazi_anyakonyvi_szam — hatókör-kapu a törzsben',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%current_user_can_access_congregation%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'generate_egyhazi_anyakonyvi_szam')::text, 'true'
UNION ALL SELECT '10. generate_egyhazi_anyakonyvi_szam — delegált import-ág megvan',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) LIKE '%admin_access_requests%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'generate_egyhazi_anyakonyvi_szam')::text, 'true'
UNION ALL SELECT '11. registration_email_info — access_requests fallback ELTŰNT',
       (SELECT COALESCE(bool_or(pg_get_functiondef(p.oid) NOT LIKE '%FROM public.access_requests%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'registration_email_info')::text, 'true'
UNION ALL SELECT '12. log_audit_event — auth.uid() kapu + óránkénti korlát',
       (SELECT COALESCE(bool_or(
                  pg_get_functiondef(p.oid) LIKE '%Nincs bejelentkezett felhasználó%'
              AND pg_get_functiondef(p.oid) LIKE '%interval ''1 hour''%'), false)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'log_audit_event')::text, 'true'
UNION ALL SELECT '13. mind a 6 érintett függvény SECURITY DEFINER maradt',
       (SELECT COUNT(*) = 6 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef = true
           AND p.proname IN ('get_csaladok_for_congregation', 'get_gyerek_for_congregation',
                             'next_chitanta_full', 'next_chitanta_number',
                             'generate_egyhazi_anyakonyvi_szam', 'log_audit_event'))::text, 'true';
-- Várt: 13 sor, MINDEGYIKNÉL eredmeny = vart = 'true'.

-- ─── ELLENŐRZÉS 2: jogosultságok (EGY SELECT) ──────────────────────────────

SELECT '01. anon NEM hívhatja: get_csaladok_for_congregation' AS ellenorzes,
       has_function_privilege('anon', 'public.get_csaladok_for_congregation(uuid,timestamptz)', 'EXECUTE')::text AS eredmeny,
       'false' AS vart
UNION ALL SELECT '02. anon NEM hívhatja: get_gyerek_for_congregation',
       has_function_privilege('anon', 'public.get_gyerek_for_congregation(uuid,timestamptz)', 'EXECUTE')::text, 'false'
UNION ALL SELECT '03. anon NEM hívhatja: next_chitanta_full',
       has_function_privilege('anon', 'public.next_chitanta_full(uuid,date)', 'EXECUTE')::text, 'false'
UNION ALL SELECT '04. anon NEM hívhatja: next_chitanta_number',
       has_function_privilege('anon', 'public.next_chitanta_number(uuid,text)', 'EXECUTE')::text, 'false'
UNION ALL SELECT '05. anon NEM hívhatja: generate_egyhazi_anyakonyvi_szam',
       has_function_privilege('anon', 'public.generate_egyhazi_anyakonyvi_szam(uuid,text,integer)', 'EXECUTE')::text, 'false'
UNION ALL SELECT '06. anon NEM hívhatja: log_audit_event',
       has_function_privilege('anon', 'public.log_audit_event(text,text,uuid,jsonb,uuid)', 'EXECUTE')::text, 'false'
UNION ALL SELECT '07. anon NEM hívhatja: import_registry_batch',
       COALESCE(has_function_privilege('anon',
           to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)')::oid, 'EXECUTE')::text,
           '(nincs ilyen függvény)'), 'false'
UNION ALL SELECT '08. anon HÍVHATJA: registration_email_info (szándékos)',
       has_function_privilege('anon', 'public.registration_email_info(text)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '09. authenticated HÍVHATJA: get_csaladok_for_congregation',
       has_function_privilege('authenticated', 'public.get_csaladok_for_congregation(uuid,timestamptz)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '10. authenticated HÍVHATJA: get_gyerek_for_congregation',
       has_function_privilege('authenticated', 'public.get_gyerek_for_congregation(uuid,timestamptz)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '11. authenticated HÍVHATJA: next_chitanta_full',
       has_function_privilege('authenticated', 'public.next_chitanta_full(uuid,date)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '12. authenticated HÍVHATJA: next_chitanta_number',
       has_function_privilege('authenticated', 'public.next_chitanta_number(uuid,text)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '13. authenticated HÍVHATJA: generate_egyhazi_anyakonyvi_szam',
       has_function_privilege('authenticated', 'public.generate_egyhazi_anyakonyvi_szam(uuid,text,integer)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '14. authenticated HÍVHATJA: log_audit_event',
       has_function_privilege('authenticated', 'public.log_audit_event(text,text,uuid,jsonb,uuid)', 'EXECUTE')::text, 'true'
UNION ALL SELECT '15. authenticated HÍVHATJA: import_registry_batch',
       COALESCE(has_function_privilege('authenticated',
           to_regprocedure('public.import_registry_batch(uuid,text,jsonb,boolean)')::oid, 'EXECUTE')::text,
           '(nincs ilyen függvény)'), 'true'
UNION ALL SELECT '16. authenticated NEM ÍRHAT közvetlenül az audit_log-ba',
       has_table_privilege('authenticated', 'public.audit_log', 'INSERT')::text, 'false'
UNION ALL SELECT '17. authenticated TOVÁBBRA IS OLVASHATJA az audit_log-ot',
       has_table_privilege('authenticated', 'public.audit_log', 'SELECT')::text, 'true';
-- Várt: 17 sor, MINDEGYIKNÉL eredmeny = vart.

-- ─── ELLENŐRZÉS 3: támadás-szimuláció Studio-ból (EGY SELECT) ──────────────
--
-- A Studióban `auth.uid()` = NULL, ezért MINDEN kapunak kivételt kell dobnia.
-- Ez az egyetlen SELECT mind a hatot lefuttatja, és a hibaüzenetet adja vissza
-- (a `letezik-e még lyuk` oszlop true = BAJ VAN).

SELECT '01. get_csaladok_for_congregation' AS rpc,
       (SELECT CASE WHEN (SELECT COUNT(*) FROM public.get_csaladok_for_congregation(
                  (SELECT id FROM public.congregations ORDER BY id LIMIT 1), NULL)) >= 0
               THEN 'LYUK — lefutott hiba nélkül!' END) AS eredmeny
UNION ALL SELECT '02. get_gyerek_for_congregation',
       (SELECT CASE WHEN (SELECT COUNT(*) FROM public.get_gyerek_for_congregation(
                  (SELECT id FROM public.congregations ORDER BY id LIMIT 1), NULL)) >= 0
               THEN 'LYUK — lefutott hiba nélkül!' END);
-- Várt: NEM ad eredményt, hanem HIBÁVAL leáll:
--   ERROR: Nincs bejelentkezett felhasználó — a család-lekérdezés nem érhető el.
-- Ha ehelyett táblázatot kapsz → a javítás NEM futott le.
--
-- A további négyet EGYESÉVEL, kikommentezve érdemes próbálni (mindegyik
-- ÍRÓ művelet, ezért külön-külön, tudatosan):
--
-- SELECT * FROM public.next_chitanta_full((SELECT id FROM public.congregations ORDER BY id LIMIT 1));
--   Várt: ERROR — 'Nincs bejelentkezett felhasználó — nyugtaszám nem foglalható.'
--
-- SELECT public.next_chitanta_number((SELECT id FROM public.congregations ORDER BY id LIMIT 1), 'TESZT');
--   Várt: ERROR — 'Nincs bejelentkezett felhasználó — nyugtaszám nem foglalható.'
--
-- SELECT public.generate_egyhazi_anyakonyvi_szam((SELECT id FROM public.congregations ORDER BY id LIMIT 1), 'baptism', 2026);
--   Várt: ERROR — 'Nincs bejelentkezett felhasználó — anyakönyvi szám nem generálható.'
--
-- SELECT public.log_audit_event('teszt.tamadas');
--   Várt: ERROR — 'Nincs bejelentkezett felhasználó — audit-esemény nem naplózható.'
--
-- SELECT public.merge_spouses_bulk();
--   Várt: ERROR — function public.merge_spouses_bulk() does not exist

-- ─── ELLENŐRZÉS 4: a registration_email_info szűkítése (EGY SELECT) ────────

SELECT 'nem létező e-mail'                              AS eset,
       public.registration_email_info('nincs-ilyen-email-xyz@example.com')::text AS valasz
UNION ALL
SELECT 'egy PENDING kérelmező e-mail-címe (írd ide!)',
       public.registration_email_info('ide-egy-pending-email@pelda.hu')::text;
-- Várt:
--   1. sor: {"status":"not_registered","congregation_name":null}
--   2. sor: {"status":"pending","congregation_name":null}
--           ← a `congregation_name` MOST MÁR null (korábban itt szivárgott ki,
--             hogy az illető MELYIK gyülekezetnél kérelmez).
--   Aktív, jóváhagyott felhasználónál a gyülekezet neve TOVÁBBRA IS megjelenik.

-- ════════════════════════════════════════════════════════════════════════════
-- === FÜSTTESZT (a futtatás után, ÉLES bejelentkezéssel, a felületen) ========
--
-- Cél: bizonyítani, hogy (A) semmi legitim nem tört el, (B) a lyukak zárva.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ─── A) LELKÉSZI FIÓKKAL (aktív, gyülekezethez kötött) ─────────────────────
--
--   1. DESKTOP — Család- és gyereknyilvántartás betölt
--      Nyisd meg a KARTOTEKA desktop appot → jelentkezz be → Tagnyilvántartás.
--      Indíts szinkront („Szinkronizálás" gomb, vagy indításkor automatikus).
--      VÁRT: a családlista feltöltődik, a családokban a gyerek-számláló helyes,
--      a szinkron-panel NEM mutat hibát.
--      (Ez a 1) és 2) P0 RPC — ha a kapu rossz, itt azonnal
--       „Supabase pullFamilies hiba: Nincs jogosultság…" jönne.)
--      ⚠️ Csináld meg MINDKÉT módban: elsőre delta (csak a változások), majd
--         „Teljes újraszinkron" (full) — a takarító (sweep) ág is az RPC-t hívja.
--
--   2. DESKTOP — a család-adatok TARTALMA is jó
--      Nyiss meg egy családot: mindkét házastárs neve és a lakcím látszik,
--      a gyerekek a helyükön vannak.
--
--   3. WEB — új Chitanță (nyugta) számozás, AUTOMATA út
--      Pénzügy → Befizetések → új készpénzes befizetés rögzítése úgy, hogy a
--      nyugta-kiállítás be van kapcsolva → Mentés.
--      VÁRT: a nyugta elkészül, a nyomdai és a gyülekezeti szám az előző +1,
--      a Nyugtatömbök panelen a „maradék" eggyel csökken.
--      (Ez a 4) P1 — next_chitanta_full.)
--
--   4. WEB/DESKTOP — Chitanță KÉZI kiállítás
--      Pénzügy → Nyugták → „Új nyugta" → sorozat kiválasztása, szám ÜRESEN
--      hagyva → Kiállítás.
--      VÁRT: a szerver adja a következő szabad számot, a nyugta elmentődik.
--      (Ez az 5) P1 — next_chitanta_number.)
--
--   5. WEB — Anyakönyvi (egyházi) szám előtöltése
--      Anyakönyv → Keresztelés → „Új bejegyzés": az „Egyházi anyakönyvi szám"
--      mező AUTOMATIKUSAN kitöltődik `YYYY01NNNN` formában.
--      Ismételd meg: Konfirmálás (…02…), Esketés (…03…), Temetés (…04…), és
--      egy mozgás-bejegyzésre (Beköltözött …05…).
--      VÁRT: mind az öt előtölt, és mentés után a szám a listában is látszik.
--      (Ez a 6) P2 — generate_egyhazi_anyakonyvi_szam.)
--
--   6. WEB — Anyakönyvi IMPORT (ha van importálandó állományod)
--      Anyakönyv → Import varázsló → egy kis tétel (2–3 sor) importálása.
--      VÁRT: az import lefut, az üres egyházi számok automatikusan generálódnak.
--      (Ez bizonyítja, hogy az import_registry_batch → generate_… belső hívás
--       nem tört el.)
--
-- ─── B) ADMIN (rendszergazda) FIÓKKAL ──────────────────────────────────────
--
--   7. Admin → Eszközök és licencek → egy eszköz „Visszavonás", majd
--      „Visszaállítás".
--      VÁRT: a művelet lemegy, ÉS az Admin → Napló oldalon megjelenik a két
--      új audit-sor (időpont, felhasználó, művelet).
--      (Ez a log_audit_event — ha itt üres marad a napló, a kapu túl szigorú.)
--
--   8. Admin → Napló oldal betölt, szűrhető, lapozható.
--      VÁRT: változatlan (az OLVASÁST nem korlátoztuk).
--
--   9. Kijelentkezés → újra bejelentkezés (jelszóval ÉS ha van, Google-lel).
--      VÁRT: a Naplóban megjelenik a `login` esemény mindkét belépésre.
--
--  10. Ha van delegált admin-hozzáférésed egy MÁSIK gyülekezethez
--      (Admin → Hozzáférés-kérések → jóváhagyott, le nem járt):
--      lépj át god mode-ban arra a gyülekezetre → Anyakönyv → új keresztelés.
--      VÁRT: az egyházi szám ott is előtöltődik.
--
-- ─── C) NEGATÍV TESZT — a lyukak tényleg zárva vannak-e ────────────────────
--
--  11. `PENDING` (jóvá NEM hagyott) fiókkal belépve — regisztrálj egy új
--      teszt-e-mailt a /hozzaferes-kerese oldalon, erősítsd meg a levélben,
--      majd lépj be vele (a /pending oldalra fog dobni).
--      Ezzel a fiókkal a böngésző konzoljából (vagy Postmannel) hívd meg az
--      RPC-ket a publikus anon kulccsal + a JWT-vel:
--        get_csaladok_for_congregation, get_gyerek_for_congregation,
--        next_chitanta_full, next_chitanta_number,
--        generate_egyhazi_anyakonyvi_szam
--      VÁRT MINDEGYIKNÉL: HIBA — „…a fiók nem aktív tisztségviselő".
--      (A javítás ELŐTT ezek mind ADATOT adtak vissza.)
--
--  12. AKTÍV lelkészi fiókkal, de IDEGEN gyülekezet UUID-jével
--      (vedd bármelyiket a `congregations_for_registration()` listából):
--      VÁRT: HIBA — „Nincs jogosultság a congregation_id=… -hoz".
--      Ez a legfontosabb sor: a lelkész a SAJÁT gyülekezetén kívül semmit
--      nem lát és nem ír.
--
--  13. Bejelentkezés NÉLKÜL (csak az anon kulccsal) ugyanezek az RPC-hívások:
--      VÁRT: HTTP 404 / „function … does not exist" vagy jogosultsági hiba —
--      a 8. szakasz REVOKE-jai miatt a végpont meg sem hívható.
--
--  14. Bármely bejelentkezett fiókkal közvetlen tábla-írás az audit_log-ba
--      (POST /rest/v1/audit_log):
--      VÁRT: jogosultsági hiba (permission denied for table audit_log).
-- ════════════════════════════════════════════════════════════════════════════
