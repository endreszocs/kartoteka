-- ============================================================================
-- GYÜLEKEZETI WEBOLDAL — kétnyelvű elérhetőség-blokk (2026-08-27)
--
-- Endre kérése: „az elérhetőségek az a gyülekezet román és magyar megnevezése,
-- a pontos cím két nyelven, a gyülekezeti e-mail és telefonszám" — kiegészítve:
-- „lehet-e esetleg az egyházmegyét és a kerületet is".
--
-- ── AMIT A FELMÉRÉS MÉRT (2026-08-27, éles adatbázis) ──────────────────────
--   · a gyülekezet ROMÁN neve:        ✅ van
--   · kétnyelvű cím (település+megye): ✅ teljes (a cím-törzs kötés megvan)
--   · egyházmegye román neve:          ❌ NINCS
--   · egyházkerület román neve:        ❌ NINCS
--
-- ⚠️ EZÉRT NEM TALÁLUNK KI SEMMIT. A hiányzó román nevet NEM pótoljuk
--    fordítással: egy hivatalos egyházi megnevezésnek pontos alakja van, és
--    egy kitalált változat rosszabb, mint a hiánya. Ahol nincs román név, ott
--    a felület a MAGYART mutatja egyedül — ez ugyanaz az elv, amit a leltári
--    nyomtatványoknál is követünk (`entitasNevEgyNyelven`).
--    Ha Endre kitölti a román neveket (Egyházmegye / Egyházkerület
--    beállításai), a weboldal AZONNAL kétnyelvűen mutatja őket — kódváltozás
--    nélkül.
--
-- ── MIT AD ────────────────────────────────────────────────────────────────
--   ÚJ, ÖNHORDÓ RPC: `public.public_site_identitas(p_slug)`.
--   ⚠️ SZÁNDÉKOSAN KÜLÖN a `public_site_congregation_fallback`-tól, ahelyett
--   hogy azt bővítenénk: az MÁR ÉL, és a `CREATE OR REPLACE` nem tud
--   visszatérési oszloplistát változtatni (42P13) — a meglévőt el kellene
--   dobni, ami egy pillanatra elvenné a működő oldal címerét/elérhetőségét.
--   „Hozzáadunk, nem írunk át."
--
-- FUTTATÁS: Supabase SQL editor, EGYBEN. Idempotens. Minden jogosultság-
-- állítás SZEREP-TOLERÁNS (az app_staff_user / app_pending_user /
-- member_portal_user élesben nem létezik — ezen bukott el a 2026-07-18-as
-- migráció).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 0. ELŐFELTÉTEL-ŐR — fail-closed, MINDEN hivatkozott oszlopra.
--    ⚠️ Egy `LANGUAGE sql` függvény törzsét a CREATE MÁR feloldja: hiányzó
--    oszlopnál ott szállna el, zavaros hibával és félkész állapotot hagyva.
-- ────────────────────────────────────────────────────────────────────────────
DO $elofeltetel$
DECLARE
  v_tabla text;
  v_oszlop text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'public_sites', 'congregations', 'dioceses', 'districts',
    'adrlocality', 'adrcounty'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NULL THEN
      RAISE EXCEPTION 'ELŐFELTÉTEL: a public.% tábla hiányzik.', v_tabla;
    END IF;
  END LOOP;

  FOREACH v_oszlop IN ARRAY ARRAY[
    'nev_hu', 'nev_ro', 'cim', 'hazszam', 'iranyitoszam', 'varos', 'megye',
    'email', 'telefon', 'diocese_id', 'adrlocality_id'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'congregations'
        AND column_name = v_oszlop
    ) THEN
      RAISE EXCEPTION 'ELŐFELTÉTEL: a congregations.% oszlop hiányzik.', v_oszlop;
    END IF;
  END LOOP;

  -- A román nevek oszlopai (2026-08-15 / 2026-08-16). Az ÉRTÉKÜK lehet üres —
  -- azt a felület kezeli; az OSZLOPNAK viszont léteznie kell.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dioceses' AND column_name = 'nev_ro'
  ) THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a dioceses.nev_ro hiányzik — előbb a 2026-08-15-dioceses-nev-ro-en.sql fusson le.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'districts' AND column_name = 'nev_ro'
  ) THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a districts.nev_ro hiányzik — előbb a 2026-08-16-egyhazkeruleti-S2-identitas.sql fusson le.';
  END IF;

  FOREACH v_oszlop IN ARRAY ARRAY['name_hu', 'name_ro'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'adrlocality' AND column_name = v_oszlop
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'adrcounty' AND column_name = v_oszlop
    ) THEN
      RAISE EXCEPTION 'ELŐFELTÉTEL: a cím-törzs %-oszlopa hiányzik (adrlocality/adrcounty).', v_oszlop;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: az `anon` szerepkör hiányzik — ez nem Supabase adatbázis?';
  END IF;
END
$elofeltetel$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. 42P13-ŐR — ha egy korábbi, MÁS szerződésű változat létezik, eldobjuk.
--    (A `CREATE OR REPLACE FUNCTION` nem tud visszatérési oszloplistát
--    változtatni; a jogosultságokat a 3. szakasz úgyis újra beállítja.)
-- ────────────────────────────────────────────────────────────────────────────
DO $szerzodes_or$
DECLARE
  v_oid oid := to_regprocedure('public.public_site_identitas(text)');
BEGIN
  IF v_oid IS NOT NULL AND pg_get_function_result(v_oid) NOT LIKE '%egyhazkerulet_ro text%' THEN
    DROP FUNCTION public.public_site_identitas(text);
  END IF;
END
$szerzodes_or$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. AZ RPC — a gyülekezet hivatalos, KÉTNYELVŰ azonosító adatai.
--
--    Ugyanaz a kapu, mint a weboldalé (publikált oldal + aktív, engedélyezett
--    gyülekezet), és CSAK azt adja ki, ami egy gyülekezeti weboldal
--    „Elérhetőség" blokkjába való.
--
--    A CÍM KÉT NYELVEN: az utca és a házszám úgy marad, ahogy be van írva
--    (annak nincs hivatalos fordítása), a TELEPÜLÉS és a MEGYE viszont a
--    cím-törzsből jön, nyelvenként. Ha a gyülekezet nincs a cím-törzshöz
--    kötve, mindkét nyelven a beírt szabad szöveg áll — nem találunk ki
--    fordítást.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_site_identitas(p_slug text)
RETURNS TABLE (
  nev_hu text,
  nev_ro text,
  cim_hu text,
  cim_ro text,
  email text,
  telefon text,
  egyhazmegye_hu text,
  egyhazmegye_ro text,
  egyhazkerulet_hu text,
  egyhazkerulet_ro text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $public_site_identitas$
  WITH alap AS (
    SELECT
      c.nev_hu::text        AS nev_hu,
      c.nev_ro::text        AS nev_ro,
      c.email::text         AS email,
      c.telefon::text       AS telefon,
      -- utca + házszám: nyelvfüggetlen, ahogy be van írva
      NULLIF(
        pg_catalog.btrim(
          pg_catalog.concat_ws(
            ' ',
            NULLIF(pg_catalog.btrim(c.cim::text), ''),
            NULLIF(pg_catalog.btrim(c.hazszam::text), '')
          )
        ),
        ''
      ) AS utca,
      NULLIF(pg_catalog.btrim(c.iranyitoszam::text), '') AS irsz,
      -- település: törzsből nyelvenként, tartalék a beírt szabad szöveg
      COALESCE(
        NULLIF(pg_catalog.btrim(loc.name_hu), ''),
        NULLIF(pg_catalog.btrim(c.varos::text), '')
      ) AS telepules_hu,
      COALESCE(
        NULLIF(pg_catalog.btrim(loc.name_ro), ''),
        NULLIF(pg_catalog.btrim(c.varos::text), '')
      ) AS telepules_ro,
      COALESCE(
        NULLIF(pg_catalog.btrim(cnty.name_hu), ''),
        NULLIF(pg_catalog.btrim(c.megye::text), '')
      ) AS megye_hu,
      COALESCE(
        NULLIF(pg_catalog.btrim(cnty.name_ro), ''),
        NULLIF(pg_catalog.btrim(c.megye::text), '')
      ) AS megye_ro,
      NULLIF(pg_catalog.btrim(d.name), '')     AS egyhazmegye_hu,
      NULLIF(pg_catalog.btrim(d.nev_ro), '')   AS egyhazmegye_ro,
      NULLIF(pg_catalog.btrim(di.name), '')    AS egyhazkerulet_hu,
      NULLIF(pg_catalog.btrim(di.nev_ro), '')  AS egyhazkerulet_ro
    FROM public.public_sites ps
    JOIN public.congregations c ON c.id = ps.congregation_id
    -- ⚠️ MIND LEFT JOIN: egy hiányzó egyházmegye vagy cím-törzs kötés NEM
    -- ejtheti ki az EGÉSZ sort — akkor a weboldalon a név és az e-mail is
    -- eltűnne, némán.
    LEFT JOIN public.dioceses d   ON d.id = c.diocese_id
    LEFT JOIN public.districts di ON di.id = d.district_id
    LEFT JOIN public.adrlocality loc ON loc.id = c.adrlocality_id
    LEFT JOIN public.adrcounty cnty  ON cnty.id = loc.countyid
    WHERE pg_catalog.lower(pg_catalog.btrim(p_slug)) ~
        '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'
      AND ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
      AND ps.is_published = true
      AND c.status = 'active'
      AND c.public_site_enabled = true
    LIMIT 1
  )
  SELECT
    a.nev_hu,
    a.nev_ro,
    -- „Parohiei 214, 527050 Barátos, Kovászna megye"
    NULLIF(
      pg_catalog.concat_ws(
        ', ',
        a.utca,
        NULLIF(pg_catalog.btrim(pg_catalog.concat_ws(' ', a.irsz, a.telepules_hu)), ''),
        CASE WHEN a.megye_hu IS NOT NULL THEN a.megye_hu || ' megye' END
      ),
      ''
    ) AS cim_hu,
    -- „Parohiei 214, 527050 Brateș, jud. Covasna"
    NULLIF(
      pg_catalog.concat_ws(
        ', ',
        a.utca,
        NULLIF(pg_catalog.btrim(pg_catalog.concat_ws(' ', a.irsz, a.telepules_ro)), ''),
        CASE WHEN a.megye_ro IS NOT NULL THEN 'jud. ' || a.megye_ro END
      ),
      ''
    ) AS cim_ro,
    a.email,
    a.telefon,
    a.egyhazmegye_hu,
    a.egyhazmegye_ro,
    a.egyhazkerulet_hu,
    a.egyhazkerulet_ro
  FROM alap a;
$public_site_identitas$;

ALTER FUNCTION public.public_site_identitas(text) OWNER TO postgres;
COMMENT ON FUNCTION public.public_site_identitas(text) IS
  'KARTOTEKA_PUBLIC_SITE_IDENTITAS_V1';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. JOGOSULTSÁGOK — SZEREP-TOLERÁNSAN.
--    ⚠️ A `PUBLIC` a lista ELSŐ, mindig meglévő eleme, így a lista sosem üres
--    (üres listából `FROM ` alakú, hibás SQL állna elő). NEM `quote_ident`-eljük:
--    az idézőjelezett "public" egy VALÓDI szerepkörre hivatkozna, nem a
--    kulcsszóra.
-- ────────────────────────────────────────────────────────────────────────────
DO $jogosultsagok$
DECLARE
  v_szerep text;
  v_letezo text[] := ARRAY['PUBLIC'];
  v_lista text;
BEGIN
  FOREACH v_szerep IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role',
    'app_staff_user', 'app_pending_user', 'member_portal_user'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_szerep) THEN
      v_letezo := v_letezo || quote_ident(v_szerep);
    END IF;
  END LOOP;
  v_lista := array_to_string(v_letezo, ', ');

  EXECUTE format('REVOKE ALL ON FUNCTION public.public_site_identitas(text) FROM %s', v_lista);
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.public_site_identitas(text) TO anon';
END
$jogosultsagok$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. A PostgREST SÉMA-GYORSÍTÓTÁRÁNAK ÚJRATÖLTÉSE.
--    ⚠️ Enélkül az új RPC percekig `PGRST202`-t adna, amit az app NÉMA
--    tartaléknak vesz — „lefutott, de semmi nem változott".
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- ELLENŐRZÉS — EGYETLEN EREDMÉNYHALMAZ, ÉS EZ A FÁJL UTOLSÓ UTASÍTÁSA.
-- (A Supabase SQL editor egy szkriptből CSAK AZ UTOLSÓ rácsot mutatja.)
-- Mind az 5 sor ✅ vagy ➖ kell legyen.
-- ============================================================================
SELECT lepes, eredmeny FROM (

  SELECT '1. Az identitás-RPC létezik' AS lepes,
         CASE WHEN to_regprocedure('public.public_site_identitas(text)') IS NOT NULL
              THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS eredmeny

  UNION ALL
  SELECT '2. CSAK az anon hívhatja',
         CASE WHEN to_regprocedure('public.public_site_identitas(text)') IS NULL
                THEN '❌ NINCS FÜGGVÉNY'
              WHEN has_function_privilege('anon', 'public.public_site_identitas(text)', 'EXECUTE')
               AND NOT EXISTS (
                 SELECT 1 FROM pg_roles r
                 WHERE r.rolname IN ('authenticated', 'service_role',
                                     'app_staff_user', 'app_pending_user', 'member_portal_user')
                   AND has_function_privilege(r.rolname, 'public.public_site_identitas(text)', 'EXECUTE')
               )
                THEN '✅ OK' ELSE '❌ JOGOSULTSÁG-DRIFT' END

  UNION ALL
  -- ⚠️ NEGATÍV ŐRSZEM: a LEFT JOIN-ok miatt MINDEN publikált oldalnak kell
  --    sort adnia. Ha valamelyikre 0 sor jön, azon a weboldalon az egész
  --    elérhetőség-blokk némán eltűnne.
  SELECT '3. Minden publikált oldalnál ad sort',
         CASE WHEN to_regprocedure('public.public_site_identitas(text)') IS NULL
                THEN '❌ NINCS FÜGGVÉNY'
              WHEN NOT EXISTS (
                SELECT 1
                FROM public.public_sites ps
                LEFT JOIN LATERAL (
                  SELECT true AS talalt FROM public.public_site_identitas(ps.slug) x
                ) f ON true
                WHERE ps.is_published = true AND f.talalt IS NULL
              ) THEN '✅ OK'
              ELSE '❌ VAN PUBLIKÁLT OLDAL, AMIRE 0 SORT AD' END

  UNION ALL
  SELECT '4. A kétnyelvű cím tényleg KÉT különböző szöveg (van cím-törzs kötés)',
         COALESCE((
           SELECT CASE
             WHEN count(*) = 0 THEN '➖ nincs publikált oldal'
             WHEN count(*) FILTER (WHERE i.cim_hu IS DISTINCT FROM i.cim_ro) > 0
               THEN '✅ OK — ' || count(*) FILTER (WHERE i.cim_hu IS DISTINCT FROM i.cim_ro) || ' oldalnál eltér'
             ELSE '⚠️ mindenhol AZONOS — nincs cím-törzs kötés (adrlocality_id), a cím egy nyelven áll'
           END
           FROM public.public_sites ps
           LEFT JOIN LATERAL public.public_site_identitas(ps.slug) i ON true
           WHERE ps.is_published = true
         ), '➖ nem értékelhető')

  UNION ALL
  -- Tájékoztató: hol hiányzik még a román név? (NEM hiba — a felület ilyenkor
  -- a magyart mutatja egyedül, kitalált fordítás nélkül.)
  SELECT '5. Hiányzó román nevek (a felület ilyenkor csak magyarul mutatja)',
         COALESCE((
           SELECT CASE WHEN count(*) = 0 THEN '✅ mind megvan'
                       ELSE '➖ ' || string_agg(DISTINCT hiany, ', ') END
           FROM public.public_sites ps
           LEFT JOIN LATERAL public.public_site_identitas(ps.slug) i ON true
           CROSS JOIN LATERAL (VALUES
             ('gyülekezet', i.nev_ro),
             ('egyházmegye', i.egyhazmegye_ro),
             ('egyházkerület', i.egyhazkerulet_ro)
           ) AS t(hiany, ertek)
           WHERE ps.is_published = true AND t.ertek IS NULL
         ), '✅ mind megvan')

) AS kapuk
ORDER BY lepes;
