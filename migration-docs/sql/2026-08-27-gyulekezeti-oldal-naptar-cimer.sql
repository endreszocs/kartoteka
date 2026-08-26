-- ============================================================================
-- GYÜLEKEZETI WEBOLDAL — címer, elérhetőségek és nyilvános naptár (2026-08-27)
--
-- MI VOLT A HIBA (Endre élesben látta a Barátosi oldalon)
-- ──────────────────────────────────────────────────────
--   1. „A gyülekezet címere látszódjon betöltéskor és egyébként is!"
--      A betöltő-képernyőn és a fejlécben a KARTOTÉKA termék-logója állt.
--      OK: a publikus oldal KIZÁRÓLAG a `public_sites.crest_image_url`-t
--      nézte. Endre viszont a címert a gyülekezeti adatoknál (setup
--      varázsló → `congregations.cimer_url`) töltötte fel — ott a mező
--      KÖTELEZŐ, tehát biztosan ki van töltve. A két mező soha nem
--      találkozott: a weboldal némán üresnek látta.
--   2. „Az elérhetőségek látszódjanak, amik le vannak mentve a gyülekezeti
--      adatoknál." UGYANEZ A HIBAOSZTÁLY: a `public_sites.contact_email /
--      contact_phone / address` üres, miközben a `congregations.email /
--      telefon / cim + hazszam + iranyitoszam + varos + megye` ki van töltve.
--   3. „A következő alkalom üres, pedig a határidőnaplóban mentettem a
--      vakációs bibliahetet… legyen egy naptár is, LEÍRÁSSAL együtt."
--      A `public_site_events` szándékosan NEM adta ki a leírást, és csak a
--      következő 90 napot nézte — éves naptárhoz kevés.
--
-- MIT AD EZ A MIGRÁCIÓ
-- ────────────────────
--   A. `public_site_private.public_site_context_v2` — a címer és a három
--      elérhetőségi mező VISSZAESIK a gyülekezet saját, mentett adatára,
--      ha a weboldalon nincs külön megadva. A weboldali érték MINDIG erősebb
--      (ha ott beírtak valamit, az marad) — ez tehát tartalék, nem felülírás.
--   B. `public_site_events_v2(p_slug, p_ev)` — ÚJ: a nyilvánosnak jelölt
--      programok EGY TELJES ÉVRE (p_ev), vagy p_ev = NULL esetén a régi,
--      90 napos ablakkal. A `leiras` mostantól KIMEGY.
--
-- ⚠️ SZÁNDÉKOS ADATVÉDELMI VÁLTOZÁS — ENDRE KIFEJEZETT KÉRÉSE
--    A 2026-08-26-i kör azt rögzítette, hogy „a leiras és a megjegyzes SOHA
--    nem megy ki". Endre 2026-08-27-én kifejezetten kérte, hogy a nyilvános
--    naptárban a programok LEÍRÁSSAL együtt látszódjanak. Ezért:
--      · `leiras`     → KIMEGY   (a látogatónak szánt ismertető)
--      · `megjegyzes` → MARAD BENT (belső, lelkigondozói jegyzet lehet)
--    A kapu változatlanul a programonkénti `publikus` jelölés: leírás csak
--    onnan mehet ki, amit a gyülekezet TUDATOSAN nyilvánosnak jelölt. Az app
--    a jelölő kapcsolónál ezt ki is írja.
--    ⚠️ Ha valamelyik MÁR nyilvánosnak jelölt programnál a leírás nem való a
--    nyilvánosság elé, a migráció utáni ELLENŐRZÉS 5. pontja kilistázza őket.
--
-- FUTTATÁS: Supabase SQL editor, EGYBEN. Idempotens. Nincs TEMP tábla
-- (2026-08-25-i hibaosztály), nincs táblaszerkezet-változás, nincs
-- RLS-módosítás — csak két SECURITY DEFINER függvény és a jogosultságaik.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 0. ELŐFELTÉTEL-ŐR — fail-closed. Ha a várt világ nincs meg, MEGÁLLUNK,
--    nem írunk félkész állapotot. (A migration-fájl nem bizonyíték arra,
--    hogy egy korábbi lánc élesben lefutott — 2026-08-11-i hibaosztály.)
-- ────────────────────────────────────────────────────────────────────────────
DO $elofeltetel$
BEGIN
  IF to_regprocedure('public_site_private.public_site_context_v2(text)') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL: a public_site_private.public_site_context_v2(text) nem létezik — előbb a 2026-07-18-public-site-content-and-sitemap.sql fusson le.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'congregations'
      AND column_name = 'cimer_url'
  ) THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a congregations.cimer_url oszlop hiányzik.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gyulekezeti_programok'
      AND column_name = 'publikus'
  ) THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL: a gyulekezeti_programok.publikus oszlop hiányzik — előbb a 2026-08-26-presbiterium-tisztsegek.sql fusson le.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gyulekezeti_programok'
      AND column_name = 'leiras'
  ) THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a gyulekezeti_programok.leiras oszlop hiányzik.';
  END IF;
END
$elofeltetel$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. A KONTEXTUS-RPC — címer + elérhetőségek tartaléka a gyülekezeti adatból.
--
--    A visszatérési oszlopok NEM változnak (a `public.public_site_context_v2`
--    burkoló érintetlen marad), csak az értékük lesz kitöltött ott, ahol
--    eddig NULL jött. Az üres SZÖVEG is tartaléknak számít (`NULLIF(btrim…)`)
--    — a felületen a „mentettem, mégsem látszik" tünet tipikusan üres
--    stringből jön, nem NULL-ból.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION
  public_site_private.public_site_context_v2(p_slug text)
RETURNS TABLE (
  id uuid,
  congregation_id uuid,
  slug text,
  display_name text,
  tagline text,
  hero_image_url text,
  crest_image_url text,
  theme_id uuid,
  custom_primary_color text,
  custom_accent_color text,
  contact_email text,
  contact_phone text,
  address text,
  about_html text,
  service_times jsonb,
  robots_index boolean,
  show_member_count boolean,
  show_presbyter_count boolean,
  show_family_count boolean,
  show_age_distribution boolean,
  override_member_count integer,
  override_presbyter_count integer,
  override_family_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $public_site_context_v2_impl$
  SELECT
    ps.id,
    ps.congregation_id,
    ps.slug,
    ps.display_name,
    ps.tagline,
    ps.hero_image_url,
    -- (1) Címer: a weboldalon megadott az erősebb; ha ott nincs, a
    --     gyülekezeti adatoknál mentett címer. Csak https URL mehet ki —
    --     a felület is ezt várja (safePublicHttpsUrl).
    NULLIF(
      pg_catalog.btrim(
        COALESCE(
          NULLIF(pg_catalog.btrim(ps.crest_image_url), ''),
          NULLIF(pg_catalog.btrim(c.cimer_url::text), '')
        )
      ),
      ''
    ) AS crest_image_url,
    ps.theme_id,
    ps.custom_primary_color,
    ps.custom_accent_color,
    -- (2) Elérhetőségek: ugyanez a tartalék-lánc.
    COALESCE(
      NULLIF(pg_catalog.btrim(ps.contact_email), ''),
      NULLIF(pg_catalog.btrim(c.email::text), '')
    ) AS contact_email,
    COALESCE(
      NULLIF(pg_catalog.btrim(ps.contact_phone), ''),
      NULLIF(pg_catalog.btrim(c.telefon::text), '')
    ) AS contact_phone,
    -- A cím a gyülekezeti adatok KÜLÖN mezőiből áll össze (utca + házszám,
    -- irányítószám + település, megye) — a setup varázsló ezeket külön
    -- kezeli, tehát nem duplázunk.
    COALESCE(
      NULLIF(pg_catalog.btrim(ps.address), ''),
      NULLIF(
        pg_catalog.concat_ws(
          ', ',
          NULLIF(
            pg_catalog.btrim(
              pg_catalog.concat_ws(
                ' ',
                NULLIF(pg_catalog.btrim(c.cim::text), ''),
                NULLIF(pg_catalog.btrim(c.hazszam::text), '')
              )
            ),
            ''
          ),
          NULLIF(
            pg_catalog.btrim(
              pg_catalog.concat_ws(
                ' ',
                NULLIF(pg_catalog.btrim(c.iranyitoszam::text), ''),
                NULLIF(pg_catalog.btrim(c.varos::text), '')
              )
            ),
            ''
          ),
          NULLIF(pg_catalog.btrim(c.megye::text), '')
        ),
        ''
      )
    ) AS address,
    ps.about_html,
    ps.service_times,
    ps.robots_index,
    ps.show_member_count,
    ps.show_presbyter_count,
    ps.show_family_count,
    ps.show_age_distribution,
    ps.override_member_count,
    ps.override_presbyter_count,
    ps.override_family_count
  FROM public.public_sites ps
  JOIN public.congregations c ON c.id = ps.congregation_id
  WHERE pg_catalog.lower(pg_catalog.btrim(p_slug)) ~
      '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'
    AND ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    AND ps.is_published = true
    AND c.status = 'active'
    AND c.public_site_enabled = true
  LIMIT 1;
$public_site_context_v2_impl$;

ALTER FUNCTION public_site_private.public_site_context_v2(text)
  OWNER TO postgres;
COMMENT ON FUNCTION public_site_private.public_site_context_v2(text) IS
  'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_IMPL';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. ÚJ RPC: nyilvános programok ÉVES ablakkal és LEÍRÁSSAL.
--
--    p_ev IS NULL → a régi viselkedés (mai naptól +90 nap) — a kezdőlap
--                   „Következő alkalom" kártyájához és a közelgő szekcióhoz.
--    p_ev = 2026  → a teljes év — az Alkalmaink oldal naptárához és az éves
--                   program letöltéséhez.
--
--    A kapu VÁLTOZATLAN: publikált oldal + aktív gyülekezet + a weboldal
--    `show_events` kapcsolója + a programonkénti `publikus` jelölés.
--    Az ismétlődő sorozatokat itt sem bontjuk ki (azt a szerver-oldali
--    betöltő végzi, az appal AZONOS szabállyal), ezért a sorozat-alapsor
--    tágabb dátum-ablakkal jön.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_site_events_v2(
  p_slug text,
  p_ev integer DEFAULT NULL
)
RETURNS TABLE (
  cim text,
  leiras text,
  datum date,
  datum_vege date,
  ido_kezdes text,
  ido_befejezes text,
  helyszin text,
  tipus text,
  egyedi_tipus_nev text,
  egyedi_emoji text,
  ismetlodes_tipus text,
  ismetlodes_vege date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $public_site_events_v2$
  WITH site AS (
    SELECT ps.congregation_id
    FROM public.public_sites ps
    WHERE ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
      AND ps.is_published = true
      AND ps.show_events = true
      AND EXISTS (
        SELECT 1 FROM public.congregations c
        WHERE c.id = ps.congregation_id
          AND c.status = 'active'
          AND c.public_site_enabled = true
      )
    LIMIT 1
  ),
  ablak AS (
    -- Az éves ág az adott év teljes hosszát nézi; a NULL-ág a régi,
    -- 90 napos „közelgő" ablakot. Az évszám védve: 2000..2100.
    SELECT
      CASE
        WHEN p_ev IS NULL THEN current_date - 1
        ELSE pg_catalog.make_date(GREATEST(2000, LEAST(2100, p_ev)), 1, 1)
      END AS tol,
      CASE
        WHEN p_ev IS NULL THEN current_date + 90
        ELSE pg_catalog.make_date(GREATEST(2000, LEAST(2100, p_ev)), 12, 31)
      END AS ig
  )
  SELECT
    gp.cim::text,
    -- ⚠️ Endre 2026-08-27-i kifejezett kérése: a leírás a nyilvános
    -- naptárban is látszódjon. A `megjegyzes` továbbra sem megy ki.
    NULLIF(pg_catalog.btrim(gp.leiras::text), '') AS leiras,
    gp.datum::date,
    gp.datum_vege::date,
    gp.ido_kezdes::text,
    gp.ido_befejezes::text,
    gp.helyszin::text,
    gp.tipus::text,
    gp.egyedi_tipus_nev::text,
    gp.egyedi_emoji::text,
    gp.ismetlodes_tipus::text,
    gp.ismetlodes_vege::date
  FROM public.gyulekezeti_programok gp
  JOIN site ON true
  CROSS JOIN ablak a
  WHERE gp.congregation_id = site.congregation_id
    AND gp.publikus = true
    AND (
      (gp.ismetlodes_tipus IS NULL
        AND gp.datum::date >= a.tol
        AND gp.datum::date <= a.ig)
      OR
      (gp.ismetlodes_tipus IS NOT NULL
        AND gp.datum::date <= a.ig
        AND gp.datum::date >= a.tol - INTERVAL '6 years'
        AND (gp.ismetlodes_vege IS NULL OR gp.ismetlodes_vege >= a.tol))
    )
  ORDER BY gp.datum
  LIMIT 400;
$public_site_events_v2$;

ALTER FUNCTION public.public_site_events_v2(text, integer) OWNER TO postgres;
COMMENT ON FUNCTION public.public_site_events_v2(text, integer) IS
  'KARTOTEKA_PUBLIC_SITE_EVENTS_V2';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. JOGOSULTSÁGOK — SZEREP-TOLERÁNSAN.
--    Az app_staff_user / app_pending_user / member_portal_user egyéni
--    szerepkörök a member-portál lánc részei, amely ÉLESBEN NEM FUTOTT LE
--    (42704) — róluk CSAK akkor vonunk vissza, ha léteznek.
--    EXECUTE kizárólag az anon-nak jár.
-- ────────────────────────────────────────────────────────────────────────────
DO $publikus_acl$
DECLARE
  v_fn constant text := 'public.public_site_events_v2(text, integer)';
  v_role text;
BEGIN
  EXECUTE format(
    'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
    v_fn
  );
  FOREACH v_role IN ARRAY ARRAY['app_staff_user', 'app_pending_user', 'member_portal_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_fn, v_role);
    END IF;
  END LOOP;
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_fn);
END
$publikus_acl$;


-- ============================================================================
-- ELLENŐRZÉS — az 1–4. sor mind ✅ kell legyen; az 5. tájékoztató lista.
-- ============================================================================

SELECT '1. A kontextus-RPC visszaesik a gyülekezeti címerre/elérhetőségre' AS lepes,
       CASE WHEN (
         SELECT pg_catalog.pg_get_functiondef(
           to_regprocedure('public_site_private.public_site_context_v2(text)')
         )
       ) LIKE '%c.cimer_url%' THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS eredmeny;

SELECT '2. public_site_events_v2 létezik és a leírást is adja' AS lepes,
       CASE WHEN to_regprocedure('public.public_site_events_v2(text, integer)') IS NOT NULL
             AND (
               SELECT pg_catalog.pg_get_functiondef(
                 to_regprocedure('public.public_site_events_v2(text, integer)')
               )
             ) LIKE '%gp.leiras%'
            THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS eredmeny;

SELECT '3. Az új RPC-t CSAK az anon hívhatja' AS lepes,
       CASE WHEN has_function_privilege('anon', 'public.public_site_events_v2(text, integer)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.public_site_events_v2(text, integer)', 'EXECUTE')
             AND NOT has_function_privilege('service_role', 'public.public_site_events_v2(text, integer)', 'EXECUTE')
            THEN '✅ OK' ELSE '❌ JOGOSULTSÁG-DRIFT' END AS eredmeny;

SELECT '4. A megjegyzés (belső jegyzet) NEM megy ki' AS lepes,
       CASE WHEN (
         SELECT pg_catalog.pg_get_functiondef(
           to_regprocedure('public.public_site_events_v2(text, integer)')
         )
       ) NOT LIKE '%gp.megjegyzes%' THEN '✅ OK' ELSE '❌ KISZIVÁROG' END AS eredmeny;

-- 5. TÁJÉKOZTATÓ: mely NYILVÁNOSNAK JELÖLT programoknak van leírásuk?
--    Ezek szövege mostantól megjelenik a gyülekezet weboldalán. Ha valamelyik
--    nem való a nyilvánosság elé, vagy a leírást kell átírni, vagy a programot
--    kell kivenni a nyilvánosok közül (Határidőnapló → program → a kapcsoló).
SELECT '5. Nyilvános program, aminek a LEÍRÁSA mostantól kimegy' AS lepes,
       c.nev_hu AS gyulekezet,
       gp.datum,
       gp.cim,
       left(gp.leiras, 120) AS leiras_eleje
FROM public.gyulekezeti_programok gp
JOIN public.congregations c ON c.id = gp.congregation_id
WHERE gp.publikus = true
  AND NULLIF(pg_catalog.btrim(gp.leiras), '') IS NOT NULL
ORDER BY c.nev_hu, gp.datum;

-- 6. TÁJÉKOZTATÓ: miért üres a „Következő alkalom"? Gyülekezetenként megmutatja,
--    hány programot jelöltek nyilvánosnak, és be van-e kapcsolva az esemény-
--    szekció a weboldalon.
SELECT '6. Nyilvános programok és a weboldal esemény-kapcsolója' AS lepes,
       c.nev_hu AS gyulekezet,
       ps.slug,
       ps.show_events AS esemenyek_bekapcsolva,
       count(gp.id) FILTER (WHERE gp.publikus) AS nyilvanos_program,
       count(gp.id) AS osszes_program
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
LEFT JOIN public.gyulekezeti_programok gp ON gp.congregation_id = ps.congregation_id
WHERE ps.is_published = true
GROUP BY c.nev_hu, ps.slug, ps.show_events
ORDER BY c.nev_hu;
