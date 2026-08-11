-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — GYÜLEKEZETI VISSZAÁLLÍTÁS (a mentés PÁRJA)
-- Fájl:     migration-docs/sql/2026-08-11-visszaallitas.sql
-- Dátum:    2026-08-11
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható, IDEMPOTENS.
--
-- ⚠️ EZT MÁSODIKNAK FUTTASD.
--    ELŐFELTÉTEL: migration-docs/sql/2026-08-11-biztonsagi-mentes.sql
--    (az hozza létre a backup_log / backup_table_policy / backup_restore_log /
--     backup_restore_staging táblákat és a backup_scope_where() függvényt).
--    Ha az nem futott le, ez a fájl a SZAKASZ 0-ban HANGOS HIBÁVAL megáll.
--
-- ─── MIT AD HOZZÁ ───────────────────────────────────────────────────────────
--  1) backup_restore_log KIEGÉSZÍTÉS: a száraz futás (dry run) eredményének,
--     a terv-tokennek és az élő ujjlenyomatnak a helye. Meglévő oszlopot NEM
--     ír át (mind ADD COLUMN IF NOT EXISTS).
--  2) EGYSZER HASZNÁLHATÓ terv-token: UNIQUE index a plan_token_hash-en.
--     A „száraz futás kihagyhatatlan" szabályt NEM a felület tartatja be,
--     hanem az ADATBÁZIS: visszaállítást csak érvényes, még fel nem használt
--     terv-tokennel lehet indítani.
--  3) backup_restore_row_label()  — ember által olvasható CÍMKE egy sorból.
--     Fehérlistás: SOHA nem ad vissza CNP-t, szig-számot, TAJ-t, e-mailt,
--     telefont, fényképet vagy lelkigondozói megjegyzést.
--  4) backup_restore_diff()       — A SZÁRAZ FUTÁS. Táblánként megmondja,
--     hány sor jönne vissza, hány módosulna és hány TŰNNE EL, plusz mintákat
--     ad a törlődő sorokról. Ez a rendszer legfontosabb kérdésére válaszol:
--     „mit veszítek, ha megnyomom?"
--  5) backup_restore_live_fingerprint() — az élő állapot ujjlenyomata. A
--     terv-token ehhez van kötve: ha az előnézet óta bárki írt a rendszerbe,
--     a visszaállítás MEGTAGADJA a futást és új előnézetet kér.
--  6) backup_restore_apply() v2   — a tényleges felülírás EGY tranzakcióban,
--     kiegészítve a naplósor lezárásával (a napló és az adat EGYÜTT dől el).
--
-- ─── A HÁROM ALAPELV, AMIT A FÁJL BETARTAT ──────────────────────────────────
--  A) A száraz futás NEM KIHAGYHATÓ.  → terv-token nélkül nincs visszaállítás,
--     és egy terv-token pontosan EGYSZER használható (UNIQUE index).
--  B) A visszaállítás soha ne rontson el adatot NÉMÁN.  → besorolatlan vagy
--     réteg nélküli táblánál MEGTAGADJA a futást, a tábla nevével.
--  C) A napló nem maradhat el.  → a „started" sor a művelet ELŐTT íródik, a
--     lezárás UGYANABBAN a tranzakcióban, mint az adatváltozás. Ha a folyamat
--     közben meghal, egy lezáratlan „indult" sor marad — ÉS EZ MAGA A RIASZTÁS.
--
-- ─── ROLLBACK (visszavonás) ─────────────────────────────────────────────────
--  A fájl VÉGÉN, kikommentelve. A visszaállítás MAGA is visszavonható:
--  minden futás előtt kötelező, IGAZOLT `pre_restore` mentés készül, ami
--  90 napig megmarad — az az „undo".
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed)
-- A migration-fájl NEM bizonyíték arra, hogy lefutott élesben. Ez a szakasz
-- az ÉLŐ törzsből olvassa ki, megvan-e minden, amire építünk.
-- ════════════════════════════════════════════════════════════════════════════
DO $szakasz0$
DECLARE
  v_hiany text[] := '{}';
  v_t     text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'public.congregations',
    'public.backup_table_policy',
    'public.backup_log',
    'public.backup_restore_log',
    'public.backup_restore_staging'
  ] LOOP
    IF to_regclass(v_t) IS NULL THEN
      v_hiany := v_hiany || v_t;
    END IF;
  END LOOP;

  IF array_length(v_hiany, 1) > 0 THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: hiányzó előfeltétel-tábla(k): %. Előbb futtasd le a migration-docs/sql/2026-08-11-biztonsagi-mentes.sql fájlt.',
      array_to_string(v_hiany, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'backup_scope_where'
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs backup_scope_where() függvény. Előbb futtasd le a 2026-08-11-biztonsagi-mentes.sql fájlt — a visszaállítás UGYANAZT a gyülekezet-szűrőt használja, mint a mentés. Két külön szűrő = két külön igazság = néma adatvesztés.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'congregations'
      AND column_name = 'restore_epoch'
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs congregations.restore_epoch oszlop. Enélkül a lelkész offline gépe a következő szinkronnál NÉMÁN visszacsinálná a visszaállítást.';
  END IF;

  -- ⚠️ A VISSZATÖLTÉSI SORREND FÜGGVÉNYE. Enélkül a törlés/beszúrás a tábla
  --    NEVE szerint menne, ami nem tud az idegen kulcsokról: a törlés szülőt
  --    törölne gyerek előtt (csalad → gyerek), a beszúrás gyereket szúrna
  --    szülő elé (jegyzokonyv_hatarozatok → presbiteri_jegyzokonyvek). Vagyis
  --    a visszaállítás minden valós gyülekezetnél elhasalna.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'backup_restore_order'
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs backup_restore_order() függvény. Futtasd le ÚJRA a migration-docs/sql/2026-08-11-biztonsagi-mentes.sql fájlt (2026-08-11-i változat) — az hozza létre a függőségi sorrendet adó függvényt.';
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben — a mentés-oldal megvan, mehet a visszaállítás.';
END
$szakasz0$;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 1 — backup_restore_log KIEGÉSZÍTÉS
-- ════════════════════════════════════════════════════════════════════════════

-- A száraz futás összefoglalója. CSAK SZÁMOK táblánként — se név, se összeg,
-- se mintarekord. A napló böngészése így NEM jár adatfeltárással; a nevekkel
-- teli előnézet csak a képernyőn, a jelszót megadó fő rendszergazdának él.
ALTER TABLE public.backup_restore_log
  ADD COLUMN IF NOT EXISTS diff_summary jsonb;

-- Melyik előnézetből (dry run) nőtt ki ez a végrehajtás. Enélkül nem lehetne
-- utólag megmondani, hogy a cselekvő LÁTTA-E, mit fog elveszíteni.
ALTER TABLE public.backup_restore_log
  ADD COLUMN IF NOT EXISTS dry_run_log_id bigint;

-- A staging-munkamenet azonosítója (a visszatöltendő sorok átmeneti tára).
ALTER TABLE public.backup_restore_log
  ADD COLUMN IF NOT EXISTS session_id uuid;

-- Az ÉLŐ állapot ujjlenyomata az előnézet pillanatában. A végrehajtás
-- újraszámolja: ha nem egyezik, közben valaki dolgozott a rendszerben, és a
-- látott „ami elveszne" lista már NEM igaz → megtagadjuk.
ALTER TABLE public.backup_restore_log
  ADD COLUMN IF NOT EXISTS live_fingerprint text;

-- Nem blokkoló, de kimondandó észrevételek (séma-sodródás, elvesző oszlopok,
-- e-mail-küldés hibája). A riasztás maga se veszhessen el némán.
ALTER TABLE public.backup_restore_log
  ADD COLUMN IF NOT EXISTS figyelmeztetesek jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.backup_restore_log.diff_summary IS
  '2026-08-11: a száraz futás (dry run) összefoglalója táblánként — CSAK SZÁMOK. Mintarekord, név, összeg és CNP SOHA nem kerül ide.';

-- ─── EGYSZER HASZNÁLHATÓ TERV-TOKEN ─────────────────────────────────────────
-- EZ A „száraz futás nem hagyható ki" SZABÁLY VALÓDI KAPUJA.
-- A terv-tokent kizárólag az előnézet adja ki. A végrehajtás beszúrja a
-- hash-ét; a UNIQUE index miatt UGYANAZ a token MÁSODSZOR nem megy át —
-- se dupla kattintásra, se visszajátszásra, se két böngészőfülből.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_backup_restore_plan_token
  ON public.backup_restore_log (plan_token_hash)
  WHERE plan_token_hash IS NOT NULL AND tipus = 'restore';

-- A lezáratlan („indult") sorok gyors megtalálása — ezek MAGUK a riasztás.
CREATE INDEX IF NOT EXISTS idx_backup_restore_log_nyitott
  ON public.backup_restore_log (outcome, started_at DESC)
  WHERE finished_at IS NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 2 — SORCÍMKE (fehérlistás, adatvédelem-tudatos)
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT: „37 sor törlődik" semmit nem jelent. „Nagy István temetése kikerül az
-- anyakönyvből" mindent. A címke ezért NEVET, ÖSSZEGET és DÁTUMOT mutat —
-- de KIZÁRÓLAG fehérlistáról. Ami nincs a listán, az nem is jöhet ki:
-- se cnp, se szig, se taj, se kep, se email, se telefon, se megjegyzes
-- (az utóbbi a munkanaplóban LELKIGONDOZÓI feljegyzés).
CREATE OR REPLACE FUNCTION public.backup_restore_row_label(p_tabla text, p_row jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  -- Fehérlisták, prioritási sorrendben.
  c_nev1   text[] := ARRAY['csaladnev','nev','name','nev_hu','megnevezes','megnevezese',
                           'cim','title','targy','forrasa','atvevo','partner','leiras_rovid',
                           'temeto_nev','iktatoszam','iratszam','nyugta','sorszam','kod','xkey'];
  c_nev2   text[] := ARRAY['k_nev','keresztnev','szcs_nev','ferjk_nev','alcim','tipus','statusz'];
  c_penz   text[] := ARRAY['osszeg','osszeg_ron','ertek','ar','brutto','netto','egyenleg','dij'];
  c_datum  text[] := ARRAY['datum','sz_datum','kelt','esemeny_datum','date','datum_tol',
                           'kezdet','created','created_at'];
  v_k      text;
  v_v      text;
  v_nev    text := NULL;
  v_nev2   text := NULL;
  v_penz   text := NULL;
  v_datum  text := NULL;
  v_out    text;
BEGIN
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RETURN '(ismeretlen sor)';
  END IF;

  FOREACH v_k IN ARRAY c_nev1 LOOP
    v_v := nullif(btrim(coalesce(p_row->>v_k, '')), '');
    IF v_v IS NOT NULL THEN v_nev := v_v; EXIT; END IF;
  END LOOP;

  FOREACH v_k IN ARRAY c_nev2 LOOP
    v_v := nullif(btrim(coalesce(p_row->>v_k, '')), '');
    IF v_v IS NOT NULL THEN v_nev2 := v_v; EXIT; END IF;
  END LOOP;

  FOREACH v_k IN ARRAY c_penz LOOP
    v_v := nullif(btrim(coalesce(p_row->>v_k, '')), '');
    IF v_v IS NOT NULL THEN v_penz := v_v; EXIT; END IF;
  END LOOP;

  FOREACH v_k IN ARRAY c_datum LOOP
    v_v := nullif(btrim(coalesce(p_row->>v_k, '')), '');
    IF v_v IS NOT NULL THEN v_datum := left(v_v, 10); EXIT; END IF;
  END LOOP;

  v_out := btrim(concat_ws(' ', v_nev, v_nev2));
  IF v_out = '' THEN
    -- Nincs fehérlistás megnevezés → az elsődleges kulcs a legtöbb, amit
    -- biztonsággal megmutathatunk. Semmiképp nem „az első oszlop".
    v_out := coalesce(nullif(p_row->>'id', ''), '(azonosító nélküli sor)');
  END IF;
  IF v_penz IS NOT NULL THEN
    v_out := v_out || ' — ' || v_penz;
  END IF;
  IF v_datum IS NOT NULL THEN
    v_out := v_out || ' (' || v_datum || ')';
  END IF;

  RETURN left(v_out, 90);
END;
$$;

COMMENT ON FUNCTION public.backup_restore_row_label(text, jsonb) IS
  '2026-08-11: ember által olvasható címke egy sorból, FEHÉRLISTÁS mezőkből. Soha nem ad vissza CNP-t, szig-számot, TAJ-t, e-mailt, telefont, fényképet vagy megjegyzés-mezőt.';


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 3 — AZ ÉLŐ ÁLLAPOT UJJLENYOMATA
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT: az előnézet és a végrehajtás között eltelhet 10 perc. Ha közben a
-- lelkész rögzített 4 befizetést, a „ami elveszne" lista, amit a rendszergazda
-- LÁTOTT, már hazugság. Az ujjlenyomat ezt fogja meg: a végrehajtás
-- újraszámolja, és eltérésnél MEGTAGADJA a futást.
--
-- Miért CSAK sorszám (és nem tartalom-hash): a teljes tartalom hash-elése egy
-- 1200 fős gyülekezeten másodpercekbe kerülne minden ellenőrzésnél. A
-- sorszám-vektor az esetek túlnyomó részét elkapja, és filléres. A maradékot
-- (ugyanannyi sor, más tartalom) a kötelező pre_restore mentés fedezi.
CREATE OR REPLACE FUNCTION public.backup_restore_live_fingerprint(p_congregation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tabla text;
  v_where text;
  v_n     bigint;
  v_acc   text := '';
BEGIN
  IF p_congregation_id IS NULL THEN
    RAISE EXCEPTION 'Az ujjlenyomathoz gyülekezet-azonosító kell (az országos hatókör nem visszaállítható).';
  END IF;

  FOR v_tabla IN
    SELECT p.tabla
    FROM public.backup_table_policy p
    JOIN information_schema.tables t
      ON t.table_schema = 'public' AND t.table_name = p.tabla AND t.table_type = 'BASE TABLE'
    WHERE p.hatokor = 'gyulekezet' AND p.reteg IS NOT NULL AND p.visszaallithato
    ORDER BY p.tabla
  LOOP
    v_where := public.backup_scope_where(v_tabla, false);
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', v_tabla, v_where)
      INTO v_n USING p_congregation_id;
    v_acc := v_acc || v_tabla || '=' || v_n || ';';
  END LOOP;

  -- sha256() a Postgres beépített függvénye (PG 11+) — nem kell pgcrypto.
  RETURN encode(sha256(convert_to(v_acc, 'UTF8')), 'hex');
END;
$$;

COMMENT ON FUNCTION public.backup_restore_live_fingerprint(uuid) IS
  '2026-08-11: az élő gyülekezeti állapot sorszám-ujjlenyomata. A terv-token ehhez van kötve; eltérésnél a visszaállítás megtagadja a futást és új előnézetet kér.';


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 4 — A SZÁRAZ FUTÁS (DRY RUN)
-- ════════════════════════════════════════════════════════════════════════════
-- Ez a rendszer legfontosabb függvénye: MEGMONDJA, MI TÖRTÉNNE, MIELŐTT
-- BÁRMI TÖRTÉNNE. A staging táblába már betöltött mentés-sorokat veti össze az
-- ÉLŐ sorokkal, elsődleges kulcs szerint.
--
-- Táblánként visszaadja:
--   mentesben / elo        — a két oldal sorszáma
--   beszuras               — a mentésben megvan, élőben NINCS → visszajönne
--   modositas              — mindkettőben megvan, de MÁS a tartalma → felülíródna
--   torles                 — élőben megvan, a mentésben NINCS → ELTŰNNE  ⚠️
--   valtozatlan            — érintetlen
--   minta_torles           — max 5 CÍMKE arról, MI tűnne el (nevekkel!)
--   minta_modositas        — max 3 címke arról, mi íródna felül
--   elveszo_oszlopok       — a mentésben van, az élő táblában MÁR NINCS ilyen
--                            oszlop → az érték NÉMÁN elveszne visszatöltéskor
--   uj_oszlopok            — az élő táblában van, a mentésben nem volt → a
--                            visszaállított sorokban NULL/alapérték lesz
--   nincs_pk               — nincs elsődleges kulcs → csak halmaz-különbség
--
-- Plusz a gyökér szinten:
--   blokkolo               — besorolatlan / réteg nélküli / nem visszaállítható
--                            táblák. Ha ez NEM üres, a végrehajtás MEG FOG
--                            TAGADNI — jobb, ha ezt már az előnézet kimondja.
--   erintetlen             — gyülekezeti táblák, amik NINCSENEK a mentésben:
--                            ezekhez a visszaállítás hozzá SEM nyúl.
CREATE OR REPLACE FUNCTION public.backup_restore_diff(
  p_session         uuid,
  p_congregation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tabla        text;
  v_p            public.backup_table_policy;
  v_where        text;
  v_pk           text[];
  v_key_ment     text;
  v_key_elo      text;
  v_first        jsonb;
  v_elveszo      text[];
  v_uj           text[];
  v_sor          jsonb;
  v_tablak       jsonb := '{}'::jsonb;
  v_blokkolo     jsonb := '[]'::jsonb;
  v_erintetlen   jsonb := '[]'::jsonb;
  v_staged       text[];
  v_ossz_be      bigint := 0;
  v_ossz_mod     bigint := 0;
  v_ossz_tor     bigint := 0;
  v_sql          text;
BEGIN
  IF p_congregation_id IS NULL THEN
    RAISE EXCEPTION 'A száraz futáshoz gyülekezet-azonosító kell.';
  END IF;

  SELECT coalesce(array_agg(DISTINCT s.tabla ORDER BY s.tabla), '{}'::text[])
    INTO v_staged
  FROM public.backup_restore_staging s
  WHERE s.session_id = p_session;

  IF array_length(v_staged, 1) IS NULL THEN
    RAISE EXCEPTION 'MEGÁLLTAM: a megadott munkamenethez egyetlen betöltött tábla sem tartozik. Az előnézet lejárt vagy nem futott le — indítsd újra.';
  END IF;

  -- ─── 1) Blokkoló besorolási hiányok ──────────────────────────────────────
  FOREACH v_tabla IN ARRAY v_staged LOOP
    SELECT * INTO v_p FROM public.backup_table_policy WHERE tabla = v_tabla;
    IF NOT FOUND THEN
      v_blokkolo := v_blokkolo || jsonb_build_object(
        'tabla', v_tabla,
        'ok', 'Nincs besorolva a backup_table_policy-ben — a visszaállítás megtagadja.');
    ELSIF v_p.hatokor <> 'gyulekezet' THEN
      v_blokkolo := v_blokkolo || jsonb_build_object(
        'tabla', v_tabla,
        'ok', format('Nem gyülekezeti hatókörű (%s) — a globális helyreállítás runbook, nem gomb.', v_p.hatokor));
    ELSIF v_p.reteg IS NULL THEN
      v_blokkolo := v_blokkolo || jsonb_build_object(
        'tabla', v_tabla,
        'ok', 'Nincs visszatöltési rétege — a mentésben BENNE VAN, de a helyes sorrendet nem tudjuk.');
    ELSIF NOT v_p.visszaallithato THEN
      v_blokkolo := v_blokkolo || jsonb_build_object(
        'tabla', v_tabla,
        'ok', 'Szándékosan nem visszaállítható (pl. audit-napló).');
    END IF;
  END LOOP;

  -- ─── 2) Amihez hozzá SEM nyúlunk ─────────────────────────────────────────
  SELECT coalesce(jsonb_agg(p.tabla ORDER BY p.tabla), '[]'::jsonb)
    INTO v_erintetlen
  FROM public.backup_table_policy p
  JOIN information_schema.tables t
    ON t.table_schema = 'public' AND t.table_name = p.tabla AND t.table_type = 'BASE TABLE'
  WHERE p.hatokor = 'gyulekezet'
    AND p.reteg IS NOT NULL
    AND p.visszaallithato
    AND NOT (p.tabla = ANY (v_staged));

  -- ─── 3) Táblánkénti különbség ────────────────────────────────────────────
  FOREACH v_tabla IN ARRAY v_staged LOOP
    -- A besorolás hiánya már blokkoló; a különbséget akkor is kiszámoljuk,
    -- ahol lehet — a rendszergazda így LÁTJA, mekkora a tét.
    IF to_regclass('public.' || quote_ident(v_tabla)) IS NULL THEN
      v_tablak := v_tablak || jsonb_build_object(v_tabla, jsonb_build_object(
        'hiba', 'Ez a tábla ma már nem létezik az adatbázisban.'));
      CONTINUE;
    END IF;

    BEGIN
      v_where := public.backup_scope_where(v_tabla, false);
    EXCEPTION WHEN OTHERS THEN
      v_tablak := v_tablak || jsonb_build_object(v_tabla, jsonb_build_object(
        'hiba', 'Nincs érvényes gyülekezet-szűrője.'));
      CONTINUE;
    END;

    -- Elsődleges kulcs
    SELECT coalesce(array_agg(a.attname::text ORDER BY k.ord), '{}'::text[]) INTO v_pk
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.conrelid = ('public.' || quote_ident(v_tabla))::regclass
      AND con.contype = 'p';

    -- Oszlop-sodródás: mi veszne el / mi lesz üres
    SELECT e INTO v_first
    FROM public.backup_restore_staging s, LATERAL jsonb_array_elements(s.sorok) e
    WHERE s.session_id = p_session AND s.tabla = v_tabla
    LIMIT 1;

    IF v_first IS NULL THEN
      v_elveszo := '{}'::text[];
      v_uj := '{}'::text[];
    ELSE
      v_elveszo := ARRAY(
        SELECT k FROM jsonb_object_keys(v_first) k
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = v_tabla AND c.column_name = k));
      v_uj := ARRAY(
        SELECT c.column_name::text FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = v_tabla
          AND NOT (v_first ? c.column_name)
        ORDER BY c.ordinal_position);
    END IF;

    IF array_length(v_pk, 1) IS NULL THEN
      -- ─── Nincs elsődleges kulcs: halmaz-különbség (EXCEPT ALL) ───────────
      -- Módosítást ilyenkor nem tudunk értelmezni: egy megváltozott sor
      -- egyszerre számít törlésnek és beszúrásnak. Ezt KIMONDJUK, nem
      -- kozmetikázzuk.
      v_sql := format($q$
        WITH ment AS (
          SELECT e AS sor
          FROM public.backup_restore_staging s, LATERAL jsonb_array_elements(s.sorok) e
          WHERE s.session_id = %L AND s.tabla = %L
        ), elo AS (
          SELECT to_jsonb(t) AS sor FROM public.%I t WHERE %s
        )
        SELECT jsonb_build_object(
          'mentesben',   (SELECT count(*) FROM ment),
          'elo',         (SELECT count(*) FROM elo),
          'beszuras',    (SELECT count(*) FROM (SELECT sor FROM ment EXCEPT ALL SELECT sor FROM elo) q1),
          'modositas',   0,
          'torles',      (SELECT count(*) FROM (SELECT sor FROM elo EXCEPT ALL SELECT sor FROM ment) q2),
          'valtozatlan', (SELECT count(*) FROM (SELECT sor FROM elo INTERSECT ALL SELECT sor FROM ment) q3),
          'minta_torles', (
            SELECT coalesce(jsonb_agg(public.backup_restore_row_label(%L, q4.sor)), '[]'::jsonb)
            FROM (SELECT sor FROM elo EXCEPT ALL SELECT sor FROM ment LIMIT 5) q4),
          'minta_modositas', '[]'::jsonb
        )
      $q$, p_session, v_tabla, v_tabla, v_where, v_tabla);
    ELSE
      -- ─── Van elsődleges kulcs: kulcs szerinti összevetés ────────────────
      -- A kulcsot MINDKÉT oldalon jsonb-ből olvassuk ki, így a típus-
      -- ábrázolás garantáltan azonos (int vs. text sosem hasal el).
      SELECT string_agg(format('e->%L', c), ', ' ORDER BY o)
        INTO v_key_ment FROM unnest(v_pk) WITH ORDINALITY AS u(c, o);
      SELECT string_agg(format('to_jsonb(t)->%L', c), ', ' ORDER BY o)
        INTO v_key_elo FROM unnest(v_pk) WITH ORDINALITY AS u(c, o);

      v_sql := format($q$
        WITH ment AS (
          SELECT jsonb_build_array(%s) AS k, e AS sor
          FROM public.backup_restore_staging s, LATERAL jsonb_array_elements(s.sorok) e
          WHERE s.session_id = %L AND s.tabla = %L
        ), elo AS (
          SELECT jsonb_build_array(%s) AS k, to_jsonb(t) AS sor
          FROM public.%I t WHERE %s
        )
        SELECT jsonb_build_object(
          'mentesben',   (SELECT count(*) FROM ment),
          'elo',         (SELECT count(*) FROM elo),
          'beszuras',    (SELECT count(*) FROM ment m LEFT JOIN elo e ON e.k = m.k WHERE e.k IS NULL),
          'modositas',   (SELECT count(*) FROM ment m JOIN elo e ON e.k = m.k WHERE m.sor IS DISTINCT FROM e.sor),
          'torles',      (SELECT count(*) FROM elo e LEFT JOIN ment m ON m.k = e.k WHERE m.k IS NULL),
          'valtozatlan', (SELECT count(*) FROM ment m JOIN elo e ON e.k = m.k WHERE m.sor IS NOT DISTINCT FROM e.sor),
          'minta_torles', (
            SELECT coalesce(jsonb_agg(public.backup_restore_row_label(%L, q1.sor)), '[]'::jsonb)
            FROM (SELECT e.sor FROM elo e LEFT JOIN ment m ON m.k = e.k WHERE m.k IS NULL LIMIT 5) q1),
          'minta_modositas', (
            SELECT coalesce(jsonb_agg(public.backup_restore_row_label(%L, q2.sor)), '[]'::jsonb)
            FROM (SELECT e.sor FROM ment m JOIN elo e ON e.k = m.k WHERE m.sor IS DISTINCT FROM e.sor LIMIT 3) q2)
        )
      $q$, v_key_ment, p_session, v_tabla, v_key_elo, v_tabla, v_where, v_tabla, v_tabla);
    END IF;

    EXECUTE v_sql INTO v_sor USING p_congregation_id;

    v_sor := v_sor
      || jsonb_build_object(
           'nincs_pk', array_length(v_pk, 1) IS NULL,
           'elveszo_oszlopok', to_jsonb(v_elveszo),
           'uj_oszlopok', to_jsonb(v_uj));

    v_ossz_be  := v_ossz_be  + coalesce((v_sor->>'beszuras')::bigint, 0);
    v_ossz_mod := v_ossz_mod + coalesce((v_sor->>'modositas')::bigint, 0);
    v_ossz_tor := v_ossz_tor + coalesce((v_sor->>'torles')::bigint, 0);

    v_tablak := v_tablak || jsonb_build_object(v_tabla, v_sor);
  END LOOP;

  RETURN jsonb_build_object(
    'session_id', p_session,
    'congregation_id', p_congregation_id,
    'tablak', v_tablak,
    'blokkolo', v_blokkolo,
    'erintetlen', v_erintetlen,
    'osszesen', jsonb_build_object(
      'beszuras', v_ossz_be,
      'modositas', v_ossz_mod,
      'torles', v_ossz_tor)
  );
END;
$$;

COMMENT ON FUNCTION public.backup_restore_diff(uuid, uuid) IS
  '2026-08-11: SZÁRAZ FUTÁS. A staging-be töltött mentés-sorokat veti össze az élő sorokkal, táblánként: beszúrás / módosítás / TÖRLÉS + mintacímkék + oszlop-sodródás. Semmit nem módosít. A visszaállítás csak az ő eredménye alapján kiadott terv-tokennel indítható.';


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 5 — STAGING (a mentés-sorok átmeneti tára)
-- ════════════════════════════════════════════════════════════════════════════
-- Ugyanaz a szerződés, mint a mentés-migrációban — itt azért szerepel újra,
-- hogy ez a fájl önmagában is teljes legyen, és a lapméret-ellenőrzés biztosan
-- bekerüljön. A tartalom AZONOS; futtatási sorrendtől függetlenül helyes.
CREATE OR REPLACE FUNCTION public.backup_restore_stage(
  p_session uuid,
  p_tabla   text,
  p_sorszam int,
  p_sorok   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF jsonb_typeof(p_sorok) <> 'array' THEN
    RAISE EXCEPTION 'A p_sorok paraméternek JSON-tömbnek kell lennie.';
  END IF;
  IF jsonb_array_length(p_sorok) > 2000 THEN
    RAISE EXCEPTION 'Túl nagy darab (% sor). A visszaállítás 500-as darabokban tölt.', jsonb_array_length(p_sorok);
  END IF;
  INSERT INTO public.backup_restore_staging (session_id, tabla, sorszam, sorok)
  VALUES (p_session, p_tabla, p_sorszam, p_sorok)
  ON CONFLICT (session_id, tabla, sorszam) DO UPDATE SET sorok = EXCLUDED.sorok;
END;
$$;

CREATE OR REPLACE FUNCTION public.backup_restore_cleanup(p_session uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  DELETE FROM public.backup_restore_staging
   WHERE session_id = p_session
      OR created_at < now() - interval '24 hours';
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 6 — A VISSZAÁLLÍTÁS MAGA (v2) — EGY TRANZAKCIÓ
-- ════════════════════════════════════════════════════════════════════════════
-- v2 = a mentés-migráció változata + a NAPLÓSOR LEZÁRÁSA UGYANEBBEN a
-- tranzakcióban. Enélkül elképzelhető olyan kimenet, ahol az adat megváltozott,
-- de a napló szerint „indult" maradt — vagy fordítva. Így a kettő EGYÜTT dől el.
--
-- ⚠️ Ha a 2026-08-11-biztonsagi-mentes.sql is definiál backup_restore_apply-t,
--    EZ A FÁJL FUSSON MÁSODIKNAK. Az ellenőrző SELECT (a fájl végén) megmondja,
--    melyik változat él: a v2-t a függvény COMMENT-je azonosítja
--    ('visszaallitas-v2').
--
-- SORREND ÉS VISSZAGÖRGETÉS:
--   Minden törlés és beszúrás EGYETLEN tranzakcióban fut. Ha bármi elhasal
--   (FK, timeout, memória), a Postgres MINDENT visszagörget — nincs félig
--   visszaállított gyülekezet. A dokumentált „rollback path" ezért két lépcsős:
--     1. a tranzakció automatikus visszagörgetése (semmi nem változott), és
--     2. ha a tranzakció ÁTMENT, de az eredmény mégsem az, amit akartunk:
--        a kötelező, IGAZOLT `pre_restore` mentés visszaállítása (ugyanez a
--        folyamat, azzal a mentéssel) — az az „undo", és 90 napig él.

-- ⚠️ A RÉGI TÚLTERHELÉSEK ELDOBÁSA — EZ NEM KOZMETIKA.
--    A `CREATE OR REPLACE` MÁS paraméterszámnál nem cserél, hanem ÚJ TÚLTERHELÉST
--    hoz létre. Két egyidejű `backup_restore_apply` esetén a hívás attól függne,
--    hány paramétert küld a kliens — vagyis a naplózó és a NEM naplózó változat
--    közül a véletlen döntene. Pontosan az a néma széthúzás, ami ellen ez az
--    egész rendszer épül.
DROP FUNCTION IF EXISTS public.backup_restore_apply(uuid, uuid, text, bigint);
DROP FUNCTION IF EXISTS public.backup_restore_apply(uuid, uuid, text, bigint, bigint);

-- ════════════════════════════════════════════════════════════════════════════
-- v3 (2026-08-11) — HÁROM BLOKKOLÓ JAVÍTÁSSAL
-- ════════════════════════════════════════════════════════════════════════════
--  (1) SORREND. A törlés és a beszúrás sorrendje mostantól a VALÓDI FK-gráfból
--      jön (`backup_restore_order`), nem a tábla nevéből. A régi
--      `ORDER BY reteg DESC, tabla` (törlés) / `reteg ASC, tabla` (beszúrás)
--      megfordította a RÉTEGET, de az ÁBÉCÉT nem — így a törlés szülőt törölt
--      gyerek előtt (csalad→gyerek, kiadas→kiadasikiseroiv, sirhely→
--      sirhelyberles), a beszúrás pedig gyereket szúrt szülő elé
--      (jegyzokonyv_hatarozatok→presbiteri_jegyzokonyvek). Vagyis a
--      visszaállítás gyakorlatilag MINDEN valós gyülekezetnél elhasalt volna.
--
--  (2) GENERATED ALWAYS OSZLOPOK. Az oszloplista nélküli
--      `INSERT ... SELECT * FROM jsonb_populate_recordset(...)` a generált
--      oszlopokba is írni próbált volna („cannot insert a non-DEFAULT value
--      into column"), és az EGÉSZ tranzakciót visszagörgette volna — a
--      kötelező elő-mentés UTÁN. Az `OVERRIDING SYSTEM VALUE` erre nem segít:
--      az az IDENTITY-re vonatkozik, nem a GENERATED-re. A
--      `member_person_links` két ilyen oszlopot hordoz, tehát a tagi portált
--      használó minden gyülekezetnél ez volt a vég.
--
--  (3) A NAPLÓSOR MOSTANTÓL KÖTELEZŐ. A `p_restore_log_id` elvesztette a
--      `DEFAULT NULL`-t, és a létezés-ellenőrzés feltétel nélkül fut. Korábban
--      egy 4 paraméteres hívás átment volna naplósor NÉLKÜL: törölte és
--      újraírta volna egy gyülekezet adatait, léptette volna a restore_epoch-ot,
--      és NEM HAGYOTT VOLNA NYOMOT — miközben a függvény saját COMMENT-je azt
--      állította: „Naplózatlan visszaállítás nincs."
--
--  (4) A VÁRT TÁBLA-HALMAZ. Az `p_vart_tablak` a terv-tokenből jön: ha az
--      átmeneti tárból akár EGY tábla kiesett az előnézet óta, a művelet
--      MEGTAGADJA a futást. Enélkül a hiányzó tábla élő sorai érintetlenül
--      TÚLÉLTÉK volna a visszaállítást — vegyes korú adatbázis, némán.
CREATE OR REPLACE FUNCTION public.backup_restore_apply(
  p_session              uuid,
  p_congregation_id      uuid,
  p_confirm_name         text,
  p_pre_restore_log_id   bigint,
  p_restore_log_id       bigint,
  p_vart_tablak          text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_expected_name  text;
  v_tabla          text;
  v_p              public.backup_table_policy;
  v_where          text;
  v_rows           jsonb;
  v_overriding     text;
  v_col            text;
  v_seq            text;
  v_before         bigint;
  v_after          bigint;
  v_eredmeny       jsonb := '{}'::jsonb;
  v_sirhely_rows   jsonb;
  v_bajt           bigint;
  v_erintett       text[] := '{}';
  v_oszlopok       text[];
  v_oszloplista    text;
  v_hianyzo        text[];
  v_tobblet        text[];
BEGIN
  -- Hosszú, de nem végtelen: inkább bukjon, mint hogy órákig fogja a zárakat.
  SET LOCAL statement_timeout = '900s';
  SET LOCAL lock_timeout = '30s';

  -- 1) A gyülekezet létezik-e, és egyezik-e a BEGÉPELT név (betűre, ékezetre)
  SELECT COALESCE(NULLIF(nev_hu, ''), name) INTO v_expected_name
  FROM public.congregations WHERE id = p_congregation_id;
  IF v_expected_name IS NULL THEN
    RAISE EXCEPTION 'A megadott gyülekezet nem létezik: %', p_congregation_id;
  END IF;
  IF p_confirm_name IS DISTINCT FROM v_expected_name THEN
    RAISE EXCEPTION 'A megerősítő név (%) nem egyezik a gyülekezet nevével (%).',
      COALESCE(p_confirm_name, '<üres>'), v_expected_name;
  END IF;

  -- 2) KÖTELEZŐ, FRISS, IGAZOLT ELŐ-MENTÉS. Nem kikapcsolható.
  --    Az „igazolt" itt szó szerint azt jelenti: a fájl fel is került a
  --    tárolóba, VISSZA is olvastuk, és a sorszámok egyeztek.
  IF NOT EXISTS (
    SELECT 1 FROM public.backup_log b
    WHERE b.id = p_pre_restore_log_id
      AND b.congregation_id = p_congregation_id
      AND b.kind = 'pre_restore'
      AND b.status = 'ok'
      AND b.drive_verified_at IS NOT NULL
      AND b.finished_at > now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'MEGTAGADVA: nincs 30 percnél frissebb, IGAZOLT visszaállítás-előtti mentés. A visszaállítás el sem indulhat nélküle.';
  END IF;

  -- 3) A naplósor KÖTELEZŐ: létezik, hozzám tartozik és MÉG NYITOTT.
  --    ⚠️ FELTÉTEL NÉLKÜL. A korábbi `IF p_restore_log_id IS NOT NULL THEN`
  --    burok azt jelentette, hogy egy NULL-lal hívott visszaállítás nyom nélkül
  --    fut le. Ez az a réteg, aminek AKKOR kell tartania, amikor az alkalmazás-
  --    réteg téved.
  IF p_restore_log_id IS NULL THEN
    RAISE EXCEPTION 'MEGTAGADVA: naplósor nélkül nincs visszaállítás. A művelet nem futhat nyom nélkül.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.backup_restore_log r
    WHERE r.id = p_restore_log_id
      AND r.tipus = 'restore'
      AND r.congregation_id = p_congregation_id
      AND r.outcome = 'indult'
      AND r.finished_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MEGTAGADVA: a visszaállításhoz tartozó nyitott naplósor nem található (id=%). Naplózatlan visszaállítás nincs.', p_restore_log_id;
  END IF;

  -- 4) MINDEN érintett tábla legyen besorolva ÉS visszaállítható
  FOR v_tabla IN
    SELECT DISTINCT s.tabla FROM public.backup_restore_staging s WHERE s.session_id = p_session
  LOOP
    SELECT * INTO v_p FROM public.backup_table_policy WHERE tabla = v_tabla;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'MEGTAGADVA: besorolatlan tábla a visszaállításban: %', v_tabla;
    END IF;
    IF v_p.hatokor <> 'gyulekezet' THEN
      RAISE EXCEPTION 'MEGTAGADVA: a(z) % tábla nem gyülekezeti hatókörű (%). A globális/rendszer-szintű helyreállítás runbook, nem gomb.', v_tabla, v_p.hatokor;
    END IF;
    IF v_p.reteg IS NULL THEN
      RAISE EXCEPTION 'MEGTAGADVA: a(z) % táblának nincs visszatöltési rétege (backup_table_policy.reteg). A mentésben BENNE VAN, de a helyes sorrendet nem tudjuk — inkább megállunk, mint hogy elrontsuk.', v_tabla;
    END IF;
    IF NOT v_p.visszaallithato THEN
      RAISE EXCEPTION 'MEGTAGADVA: a(z) % tábla szándékosan nem visszaállítható (pl. audit-napló).', v_tabla;
    END IF;
    IF to_regclass('public.' || quote_ident(v_tabla)) IS NULL THEN
      RAISE EXCEPTION 'MEGTAGADVA: a(z) % tábla ma már nem létezik az adatbázisban.', v_tabla;
    END IF;

    SELECT COALESCE(sum(pg_column_size(s.sorok)), 0) INTO v_bajt
    FROM public.backup_restore_staging s WHERE s.session_id = p_session AND s.tabla = v_tabla;
    IF v_bajt > 200 * 1024 * 1024 THEN
      RAISE EXCEPTION 'MEGTAGADVA: a(z) % tábla hasznos terhe % MB — ekkora visszaállítás runbookot igényel.', v_tabla, round(v_bajt / 1048576.0);
    END IF;

    v_erintett := v_erintett || v_tabla;
  END LOOP;

  IF array_length(v_erintett, 1) IS NULL THEN
    RAISE EXCEPTION 'MEGTAGADVA: az átmeneti tárban egyetlen tábla sincs ehhez a munkamenethez. Az előnézet lejárt vagy kitakarítva — futtasd le újra.';
  END IF;

  -- 4/b) A VÁRT HALMAZ EGYEZTETÉSE. A lista a terv-tokenből jön: azt írja le,
  --      MIT LÁTOTT a rendszergazda az előnézetben. Ha az átmeneti tár azóta
  --      megcsappant (takarítás, kézi törlés, visszajátszott token), a hiányzó
  --      tábla élő sorai ÉRINTETLENÜL túlélnék a visszaállítást — miközben
  --      minden más lecserélődik. Ez a vegyes korú adatbázis rosszabb, mint ha
  --      a művelet el sem indulna.
  IF p_vart_tablak IS NOT NULL THEN
    SELECT COALESCE(array_agg(x ORDER BY x), '{}'::text[]) INTO v_hianyzo
    FROM unnest(p_vart_tablak) x WHERE NOT (x = ANY (v_erintett));

    SELECT COALESCE(array_agg(x ORDER BY x), '{}'::text[]) INTO v_tobblet
    FROM unnest(v_erintett) x WHERE NOT (x = ANY (p_vart_tablak));

    IF array_length(v_hianyzo, 1) IS NOT NULL OR array_length(v_tobblet, 1) IS NOT NULL THEN
      RAISE EXCEPTION
        'MEGTAGADVA: az előkészített tábla-halmaz nem egyezik az előnézetben látottal. Hiányzik: %. Többlet: %. Egy részleges visszaállítás vegyes korú adatbázist hagyna maga után.',
        COALESCE(array_to_string(v_hianyzo, ', '), '-'),
        COALESCE(array_to_string(v_tobblet, ', '), '-');
    END IF;
  END IF;

  -- 5) TÖRLÉS — a FÜGGŐSÉGI SORREND FORDÍTOTTJÁBAN (gyerek előbb, szülő utána).
  --    ⚠️ A sorrend a `backup_restore_order()`-ből jön, ami a pg_constraint
  --    FK-gráfját rendezi topologikusan. A korábbi ábécé-sorrend szülőt törölt
  --    gyerek előtt — ez FK-sértés, tehát a visszaállítás elhasalt volna.
  FOR v_tabla IN
    SELECT o.tabla FROM public.backup_restore_order(v_erintett) o ORDER BY o.sorrend DESC
  LOOP
    v_where := public.backup_scope_where(v_tabla, false);
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', v_tabla, v_where)
      INTO v_before USING p_congregation_id;
    -- FK-KÖR FELOLDÁSA: sirhely.aktivberlesid → sirhelyberles(id)
    IF v_tabla = 'sirhely' THEN
      EXECUTE format('UPDATE public.sirhely t SET aktivberlesid = NULL WHERE %s', v_where)
        USING p_congregation_id;
    END IF;
    EXECUTE format('DELETE FROM public.%I t WHERE %s', v_tabla, v_where)
      USING p_congregation_id;
    v_eredmeny := v_eredmeny || jsonb_build_object(v_tabla, jsonb_build_object('elotte', v_before));
  END LOOP;

  -- 6) BESZÚRÁS — FÜGGŐSÉGI SORRENDBEN (szülő előbb, gyerek utána).
  --    Táblánként EGYETLEN utasítás: az FK-triggerek az utasítás VÉGÉN futnak,
  --    így a szemely ön-FK-ja (id_apja/id_anyja → szemely(cnp)) magától megoldódik.
  FOR v_tabla IN
    SELECT o.tabla FROM public.backup_restore_order(v_erintett) o ORDER BY o.sorrend ASC
  LOOP
    SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_rows
    FROM public.backup_restore_staging s, LATERAL jsonb_array_elements(s.sorok) e
    WHERE s.session_id = p_session AND s.tabla = v_tabla;

    -- ⚠️ EXPLICIT OSZLOPLISTA, a GENERATED ALWAYS oszlopok NÉLKÜL.
    --    A `to_jsonb(t)` a generált oszlopokat is beteszi a mentésbe (helyesen:
    --    az adat ott van), de BEÍRNI nem szabad őket — a Postgres elutasítja,
    --    és az egész tranzakció visszagördül. Az `OVERRIDING SYSTEM VALUE` erre
    --    NEM megoldás: az az IDENTITY-re vonatkozik.
    --    A mentésben lévő, de MA MÁR NEM LÉTEZŐ oszlopokat is ez a lista zárja
    --    ki — az előnézet ezeket „elveszo_oszlopok"-ként külön ki is mondja.
    SELECT COALESCE(array_agg(c.column_name::text ORDER BY c.ordinal_position), '{}'::text[])
      INTO v_oszlopok
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = v_tabla
      AND c.is_generated <> 'ALWAYS';

    IF array_length(v_oszlopok, 1) IS NULL THEN
      RAISE EXCEPTION 'MEGTAGADVA: a(z) % táblának egyetlen írható oszlopa sincs.', v_tabla;
    END IF;

    SELECT string_agg(quote_ident(c), ', ' ORDER BY ord)
      INTO v_oszloplista FROM unnest(v_oszlopok) WITH ORDINALITY AS u(c, ord);

    -- GENERATED ALWAYS AS IDENTITY → enélkül a sorok ÚJ id-t kapnának,
    -- és MINDEN rájuk mutató hivatkozás elszakadna.
    v_overriding := '';
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_tabla
        AND c.is_identity = 'YES' AND c.identity_generation = 'ALWAYS'
    ) THEN
      v_overriding := 'OVERRIDING SYSTEM VALUE';
    END IF;

    IF v_tabla = 'sirhely' THEN
      v_sirhely_rows := v_rows;
      SELECT COALESCE(jsonb_agg(jsonb_set(e, '{aktivberlesid}', 'null'::jsonb)), '[]'::jsonb)
        INTO v_rows FROM jsonb_array_elements(v_sirhely_rows) e;
    END IF;

    -- Üres tömbnél a jsonb_populate_recordset 0 sort ad — ez SZÁNDÉKOS:
    -- ha a mentésben 0 sor volt, akkor a tábla helyesen ÜRESEN marad.
    EXECUTE format(
      'INSERT INTO public.%I (%s) %s SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) t',
      v_tabla, v_oszloplista, v_overriding, v_oszloplista, v_tabla
    ) USING v_rows;
  END LOOP;

  -- 6/b) A kör bezárása: a sirhelyberles már bent van, mehet az aktivberlesid.
  IF v_sirhely_rows IS NOT NULL THEN
    UPDATE public.sirhely sh
       SET aktivberlesid = (x->>'aktivberlesid')::int
      FROM jsonb_array_elements(v_sirhely_rows) x
     WHERE sh.id = (x->>'id')::int
       AND x->>'aktivberlesid' IS NOT NULL;
  END IF;

  -- 7) SOROZATOK ÚJRASZINKRONIZÁLÁSA — GREATEST, SOHA visszafelé.
  --    ⚠️ Ennek elmaradása KÉSLELTETETT hibát okoz: a visszaállítás hibátlannak
  --    látszik, majd az első új felvitel duplikált kulcson bukik. A nyugtaszám
  --    visszatekerésén ez a projekt 2026-07-02-én már átesett.
  FOREACH v_tabla IN ARRAY v_erintett LOOP
    FOR v_col IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_tabla
    LOOP
      v_seq := pg_get_serial_sequence('public.' || quote_ident(v_tabla), v_col);
      IF v_seq IS NOT NULL THEN
        EXECUTE format(
          'SELECT setval(%L, GREATEST(COALESCE((SELECT max(%I) FROM public.%I), 0), (SELECT last_value FROM %s), 1), true)',
          v_seq, v_col, v_tabla, v_seq
        );
      END IF;
    END LOOP;

    v_where := public.backup_scope_where(v_tabla, false);
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', v_tabla, v_where)
      INTO v_after USING p_congregation_id;
    v_eredmeny := jsonb_set(
      v_eredmeny, ARRAY[v_tabla],
      COALESCE(v_eredmeny -> v_tabla, '{}'::jsonb) || jsonb_build_object('utana', v_after)
    );
  END LOOP;

  -- 8) OFFLINE KLIENSEK: teljes újratöltésre kényszerítés.
  --    Enélkül a lelkész laptopja a következő szinkronnál NÉMÁN
  --    visszacsinálná a visszaállítást. A kliens-oldali pár:
  --    apps/web/lib/offline/restore-epoch.ts (a szinkron minden körben nézi).
  UPDATE public.congregations
     SET restore_epoch = COALESCE(restore_epoch, 0) + 1
   WHERE id = p_congregation_id;

  -- 9) A NAPLÓSOR LEZÁRÁSA — ugyanabban a tranzakcióban, mint az adatváltozás.
  UPDATE public.backup_restore_log
     SET outcome        = 'ok',
         finished_at    = now(),
         rows_after     = v_eredmeny,
         tables_touched = to_jsonb(v_erintett)
   WHERE id = p_restore_log_id;

  -- 10) Takarítás
  DELETE FROM public.backup_restore_staging WHERE session_id = p_session;

  RETURN jsonb_build_object(
    'ok', true,
    'congregation_id', p_congregation_id,
    'congregation_nev', v_expected_name,
    'restore_epoch', (SELECT restore_epoch FROM public.congregations WHERE id = p_congregation_id),
    'tablak', v_eredmeny
  );
END;
$$;

COMMENT ON FUNCTION public.backup_restore_apply(uuid, uuid, text, bigint, bigint, text[]) IS
  'visszaallitas-v3 (2026-08-11): gyülekezeti adat-visszaállítás EGY tranzakcióban, a naplósor lezárásával EGYÜTT. A törlés/beszúrás sorrendje a pg_constraint FK-gráfjából jön (backup_restore_order), NEM a tábla nevéből. A beszúrás EXPLICIT oszloplistával megy, a GENERATED ALWAYS oszlopok nélkül. A naplósor KÖTELEZŐ (nincs DEFAULT NULL). A p_vart_tablak a terv-tokenből érkezik: hiányos átmeneti tárnál MEGTAGADJA a futást. Kezeli még: OVERRIDING SYSTEM VALUE, sirhely⇄sirhelyberles FK-kör, szemely ön-FK, sequence-ek GREATEST-tel, restore_epoch léptetés.';


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 7 — JOGOK: ezeket KIZÁRÓLAG a service_role hívhatja
-- Az alkalmazás-réteg (requireAdminAccess + mentési jelszó + terv-token) az
-- ELSŐ védvonal; ez a MÁSODIK. Egy hitelesített, de nem-master felhasználó
-- még véletlenül sem érheti el ezeket a PostgREST /rpc végponton.
-- ════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.backup_restore_row_label(text, jsonb)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_live_fingerprint(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_diff(uuid, uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_stage(uuid, text, int, jsonb)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_cleanup(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_apply(uuid, uuid, text, bigint, bigint, text[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backup_restore_row_label(text, jsonb)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_live_fingerprint(uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_diff(uuid, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_stage(uuid, text, int, jsonb)          TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_cleanup(uuid)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_apply(uuid, uuid, text, bigint, bigint, text[]) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === VISSZAVONÁS (ROLLBACK) — CSAK HA VISSZA KELL CSINÁLNI ===
-- A visszaállítás-funkciók eldobása NEM érinti a mentéseket. A
-- backup_restore_log-ot NE dobd el: az a bizonyíték arról, ki mit állított
-- vissza és mikor.
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.backup_restore_diff(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.backup_restore_live_fingerprint(uuid);
--   DROP FUNCTION IF EXISTS public.backup_restore_row_label(text, jsonb);
--   DROP FUNCTION IF EXISTS public.backup_restore_apply(uuid, uuid, text, bigint, bigint);
--   DROP INDEX IF EXISTS public.uniq_backup_restore_plan_token;
--   DROP INDEX IF EXISTS public.idx_backup_restore_log_nyitott;
--   -- Az oszlopokat szándékosan NEM dobjuk: bennük van a már megtörtént
--   -- visszaállítások száraz-futás-összefoglalója.
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — EGYETLEN SELECT ===
-- A Supabase SQL Editor CSAK AZ UTOLSÓ eredményt mutatja. Ez a projektnek
-- eddig HÁROM elveszett választásába került, ezért minden ellenőrzés EGYBEN van.
--
-- ⚠️ A 20-as sor a legfontosabb: ha ott nem 'visszaallitas-v2' áll, akkor a
--    mentés-migráció RÉGEBBI backup_restore_apply-ja él — futtasd újra EZT a
--    fájlt, hogy a naplózó változat legyen az érvényes.
-- ════════════════════════════════════════════════════════════════════════════
SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'backup_restore_log.diff_summary oszlop letezik'::text AS mit_mer,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_restore_log'
                   AND column_name='diff_summary')::text AS ertek,
         'true'::text AS vart
  UNION ALL SELECT 2, 'backup_restore_log.live_fingerprint oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_restore_log'
                   AND column_name='live_fingerprint')::text, 'true'
  UNION ALL SELECT 3, 'backup_restore_log.session_id oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_restore_log'
                   AND column_name='session_id')::text, 'true'
  UNION ALL SELECT 4, 'backup_restore_log.dry_run_log_id oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_restore_log'
                   AND column_name='dry_run_log_id')::text, 'true'

  UNION ALL SELECT 10, 'EGYSZER HASZNALHATO terv-token index letezik',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                   AND indexname='uniq_backup_restore_plan_token')::text, 'true'
  UNION ALL SELECT 11, 'A terv-token index UNIQUE',
         COALESCE((SELECT (indexdef LIKE 'CREATE UNIQUE%')::text FROM pg_indexes
                   WHERE schemaname='public' AND indexname='uniq_backup_restore_plan_token'),
                  'nincs index'), 'true'

  UNION ALL SELECT 20, 'Az ELO backup_restore_apply valtozata',
         COALESCE((SELECT CASE WHEN d.description LIKE 'visszaallitas-v3%'
                               THEN 'visszaallitas-v3' ELSE 'REGI (v2 vagy mentes-migracios)' END
                   FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   LEFT JOIN pg_description d ON d.objoid = p.oid
                   WHERE n.nspname='public' AND p.proname='backup_restore_apply'
                   ORDER BY p.pronargs DESC LIMIT 1), 'NINCS ILYEN FUGGVENY'),
         'visszaallitas-v3'

  UNION ALL SELECT 20, 'backup_restore_apply TULTERHELESEK szama (pontosan 1)',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='backup_restore_apply')::text, '1'

  -- ⚠️ A NAPLOSOR KOTELEZO: a p_restore_log_id-nek NINCS DEFAULT-ja. Ha lenne,
  -- egy 4-parameteres hivas naplo NELKUL torolne es irna ujra egy gyulekezet
  -- adatait — a fuggveny sajat COMMENT-je szerint pedig „Naplozatlan
  -- visszaallitas nincs".
  UNION ALL SELECT 26, 'p_restore_log_id-nek NINCS DEFAULT-ja (kotelezo naplosor)',
         COALESCE((SELECT (pg_get_function_arguments(p.oid) NOT LIKE '%p_restore_log_id bigint DEFAULT%')::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='backup_restore_apply'
                   ORDER BY p.pronargs DESC LIMIT 1), 'nincs fuggveny'), 'true'

  UNION ALL SELECT 27, 'backup_restore_order (FK-topologikus sorrend) letezik',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='backup_restore_order')::text, 'true'

  -- ⚠️ 28 — A SORREND ELLENORZESE ELESBEN. Vegigmegy MINDEN visszaallithato
  -- gyulekezeti tablan, es megnezi: van-e olyan FK-par, ahol a GYEREK korabbi
  -- sorrend-szamot kapott, mint a SZULOJE. Ilyenkor a beszuras FK-t sertene.
  -- (A kor-torest — sirhely ⇄ sirhelyberles — a fuggveny kulon kezeli, ezert
  -- azt az egy part kizarjuk.)
  UNION ALL SELECT 28, 'FK-SORREND INVERZIOK szama a visszatoltesben (0 kell!)',
         (WITH t AS (
            SELECT p.tabla FROM public.backup_table_policy p
            JOIN information_schema.tables it
              ON it.table_schema='public' AND it.table_name=p.tabla AND it.table_type='BASE TABLE'
            WHERE p.hatokor='gyulekezet' AND p.reteg IS NOT NULL AND p.visszaallithato
          ), o AS (
            SELECT * FROM public.backup_restore_order((SELECT array_agg(tabla) FROM t))
          )
          SELECT count(*)
          FROM pg_constraint c
          JOIN pg_class ch      ON ch.oid = c.conrelid
          JOIN pg_namespace nch ON nch.oid = ch.relnamespace
          JOIN pg_class pa      ON pa.oid = c.confrelid
          JOIN pg_namespace npa ON npa.oid = pa.relnamespace
          JOIN o oc ON oc.tabla = ch.relname
          JOIN o op ON op.tabla = pa.relname
          WHERE c.contype='f' AND nch.nspname='public' AND npa.nspname='public'
            AND ch.relname <> pa.relname
            AND oc.sorrend < op.sorrend
            AND NOT (ch.relname='sirhely' AND pa.relname='sirhelyberles')
         )::text, '0'

  -- ⚠️ 29 — Melyik konkret FK-parok fordulnanak meg. Ha a 28-as nem 0, ITT
  -- latszik, MELYIK tabla-parrol van szo.
  UNION ALL
  SELECT 29, 'FK-SORREND INVERZIO (gyerek elobb, mint a szuloje)',
         oc.tabla || ' (#' || oc.sorrend || ') -> ' || op.tabla || ' (#' || op.sorrend || ')',
         '<a szulonek kisebb sorszamot kell kapnia>'
  FROM (
    WITH t AS (
      SELECT p.tabla FROM public.backup_table_policy p
      JOIN information_schema.tables it
        ON it.table_schema='public' AND it.table_name=p.tabla AND it.table_type='BASE TABLE'
      WHERE p.hatokor='gyulekezet' AND p.reteg IS NOT NULL AND p.visszaallithato
    )
    SELECT * FROM public.backup_restore_order((SELECT array_agg(tabla) FROM t))
  ) oc
  JOIN pg_class ch      ON ch.relname = oc.tabla
  JOIN pg_namespace nch ON nch.oid = ch.relnamespace AND nch.nspname='public'
  JOIN pg_constraint c  ON c.conrelid = ch.oid AND c.contype='f'
  JOIN pg_class pa      ON pa.oid = c.confrelid
  JOIN pg_namespace npa ON npa.oid = pa.relnamespace AND npa.nspname='public'
  JOIN (
    WITH t AS (
      SELECT p.tabla FROM public.backup_table_policy p
      JOIN information_schema.tables it
        ON it.table_schema='public' AND it.table_name=p.tabla AND it.table_type='BASE TABLE'
      WHERE p.hatokor='gyulekezet' AND p.reteg IS NOT NULL AND p.visszaallithato
    )
    SELECT * FROM public.backup_restore_order((SELECT array_agg(tabla) FROM t))
  ) op ON op.tabla = pa.relname
  WHERE ch.relname <> pa.relname
    AND oc.sorrend < op.sorrend
    AND NOT (ch.relname='sirhely' AND pa.relname='sirhelyberles')

  UNION ALL SELECT 21, 'Mind az 5 visszaallitas-RPC letezik',
         (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN
             ('backup_restore_row_label','backup_restore_live_fingerprint',
              'backup_restore_diff','backup_restore_stage','backup_restore_apply'))::text, '5'
  -- ⚠️ 2026-08-11 JAVÍTVA — a korábbi változat 5-öt várt, és 4-et kapott.
  --    AZ ELLENŐRZÉS TÉVEDETT, NEM A KÓD. Az ötből NÉGY SECURITY DEFINER; az
  --    ötödik, a `backup_restore_row_label`, SZÁNDÉKOSAN SECURITY INVOKER:
  --    tiszta szövegformázó (jsonb sor → olvasható címke), IMMUTABLE, és
  --    EGYETLEN táblához sem nyúl. Jogosultság-emelésre nincs szüksége — ha
  --    megkapná, az csak támadási felület volna (legkisebb jogosultság elve).
  --    Hívója (`backup_restore_diff`) MAGA definer, és a definer törzsében egy
  --    invoker függvény a definer jogaival fut, tehát a működés hibátlan.
  --    Ezért mostantól KÉT sor méri, külön-külön, az IGAZAT.
  UNION ALL SELECT 22, 'A NEGY erdemi visszaallitas-RPC mind SECURITY DEFINER',
         (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prosecdef AND p.proname IN
             ('backup_restore_live_fingerprint','backup_restore_diff',
              'backup_restore_stage','backup_restore_apply'))::text, '4'
  UNION ALL SELECT 22, 'A cimke-fuggveny SZANDEKOSAN NEM SECURITY DEFINER (tiszta formazo)',
         COALESCE((SELECT (NOT p.prosecdef)::text
                     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname='backup_restore_row_label'
                    LIMIT 1), 'nincs fuggveny'), 'true'
  UNION ALL SELECT 23, 'Mind ROGZITETT search_path-szal',
         (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proconfig IS NOT NULL AND p.proname IN
             ('backup_restore_row_label','backup_restore_live_fingerprint',
              'backup_restore_diff','backup_restore_stage','backup_restore_apply'))::text, '5'
  UNION ALL SELECT 24, 'EGYETLEN visszaallitas-RPC-t sem hivhat az authenticated',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname LIKE 'backup\_restore\_%'
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text, '0'

  UNION ALL SELECT 30, 'A sorcimke fehérlistas (CNP-t nem ad vissza)',
         public.backup_restore_row_label('szemely',
           '{"id":1,"cnp":"1234567890123","csaladnev":"Teszt","k_nev":"Elek","szig":"XX123","kep":"data:..."}'::jsonb),
         'Teszt Elek'
  UNION ALL SELECT 31, 'A sorcimke penzt es datumot mutat',
         public.backup_restore_row_label('befizetes',
           '{"id":9,"forrasa":"Kovacs Janos","osszeg":"200","datum":"2026-08-10","megjegyzes":"belso"}'::jsonb),
         'Kovacs Janos — 200 (2026-08-10)'

  UNION ALL SELECT 40, 'Lezaratlan (indult) visszaallitasok szama — 0 a jo',
         (SELECT count(*) FROM public.backup_restore_log
           WHERE tipus='restore' AND finished_at IS NULL)::text, '0'
) x
ORDER BY x.sorrend;
