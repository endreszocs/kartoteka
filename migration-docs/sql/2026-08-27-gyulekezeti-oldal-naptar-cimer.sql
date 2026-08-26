-- ============================================================================
-- GYÜLEKEZETI WEBOLDAL — címer, elérhetőségek és nyilvános naptár (2026-08-27)
-- 2. KIADÁS — ÖNHORDÓ. Nem feltételezi a 2026-07-18-as lánc lefutását.
--
-- ⛔ MIÉRT KELLETT ÚJRAÍRNI
-- ────────────────────────
-- Az első kiadás előfeltétel-őre élesben megállt:
--   „a public_site_private.public_site_context_v2(text) nem létezik"
-- Utánanézve kiderült, MIÉRT nem létezik — és ez nem véletlen elmaradás:
--
--   A `2026-07-18-public-site-content-and-sitemap.sql` ELŐFELTÉTEL-ŐRE hat
--   szerepkör meglétét követeli (`anon`, `authenticated`, `service_role`,
--   `app_staff_user`, `app_pending_user`, `member_portal_user`), és a
--   GRANT/REVOKE utasításai is mind a hatot nevesítik. Az utóbbi három a
--   member-portál lánchoz tartozik, amely ÉLESBEN SOSEM FUTOTT LE — ezt a
--   2026-08-26-i kör már megállapította (42704). Az a migráció tehát a
--   produkciós adatbázisban SOHA nem tudott lefutni, és nem is fog, amíg
--   szerep-toleránssá nem tesszük.
--
--   Következmények, amiket ez élesben okoz:
--     · nincs `public_site_private` séma és nincs V2 kontextus-RPC
--     · nincs `public_sites.service_times` oszlop → az adminban a
--       „Rendszeres alkalmak" szerkesztő MEG SEM JELENIK (a felület
--       kecsesen elrejti) — ezért üres az Alkalmaink oldal menetrendje
--     · nincs `public_sitemap_entries` RPC → a sitemap.xml üres
--
-- EZ A MIGRÁCIÓ EZÉRT NEM MÓDOSÍT MEGLÉVŐ KONTEXTUS-FÜGGVÉNYT.
-- Helyette ÖNHORDÓ, ÚJ függvényeket ad, amelyek MINDHÁROM élő állapotban
-- működnek (V2 van / csak V1 van / egyik sincs, és az app közvetlenül olvas):
--
--   A. `public_site_congregation_fallback(p_slug)` — a gyülekezet SAJÁT,
--      mentett címere és elérhetőségei. Az app ezt külön kéri le, és csak
--      oda tölti be, ahol a weboldalon nincs megadva érték. Így teljesen
--      mindegy, melyik úton érkezett a weboldal-adat.
--   B. `public_site_events_v2(p_slug, p_ev)` — a nyilvános programok egy
--      teljes évre, LEÍRÁSSAL.
--   C. `public_sites.service_times` oszlop + validátor + CHECK — SZEREP-
--      TOLERÁNSAN, hogy a „Rendszeres alkalmak" szerkesztő végre látszódjon.
--      A validátor törzse BÁJTHŰ másolat a 2026-07-18-as fájlból.
--
-- ⚠️ SZÁNDÉKOS ADATVÉDELMI VÁLTOZÁS — ENDRE KIFEJEZETT KÉRÉSE
--    A 2026-08-26-i kör azt rögzítette, hogy „a leiras és a megjegyzes SOHA
--    nem megy ki". Endre 2026-08-27-én kifejezetten kérte, hogy a nyilvános
--    naptárban a programok LEÍRÁSSAL együtt látszódjanak. Ezért:
--      · `leiras`     → KIMEGY   (a látogatónak szánt ismertető)
--      · `megjegyzes` → MARAD BENT (belső, lelkigondozói jegyzet lehet)
--    A kapu változatlanul a programonkénti `publikus` jelölés.
--    Az érintett programokat a `2026-08-27-gyulekezeti-oldal-ELLENORZO-listak.sql`
--    A. pontja listázza ki — a futtatás után nézd át.
--
-- FUTTATÁS: Supabase SQL editor, EGYBEN. Idempotens. Nincs TEMP tábla
-- (2026-08-25-i hibaosztály). MINDEN jogosultság-állítás SZEREP-TOLERÁNS:
-- nem létező szerepkörre nem hivatkozunk.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 0. ELŐFELTÉTEL-ŐR — fail-closed, de CSAK arra, ami tényleg kell.
--    ⚠️ Az első kiadás itt hasalt el: olyat követelt (V2 kontextus-RPC),
--    ami a működéshez nem is kellett volna.
-- ────────────────────────────────────────────────────────────────────────────
DO $elofeltetel$
DECLARE
  v_oszlop text;
  v_service_tipus text;
BEGIN
  IF to_regclass('public.public_sites') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a public.public_sites tábla hiányzik — előbb a 2026-04-12-public-site-tables.sql fusson le.';
  END IF;

  IF to_regclass('public.congregations') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a public.congregations tábla hiányzik.';
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
    WHERE table_schema = 'public' AND table_name = 'public_sites'
      AND column_name = 'show_events'
  ) THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL: a public_sites.show_events oszlop hiányzik — előbb a 2026-08-26-presbiterium-tisztsegek.sql fusson le.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gyulekezeti_programok'
      AND column_name = 'leiras'
  ) THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: a gyulekezeti_programok.leiras oszlop hiányzik — a nyilvános naptár leírás nélkül értelmetlen.';
  END IF;

  -- ⚠️ A tartalék-RPC MINDEN hivatkozott gyülekezeti mezőjét ellenőrizzük.
  -- Egy `LANGUAGE sql` függvény törzsét a CREATE MÁR feloldja, tehát hiányzó
  -- oszlopnál ott szállna el, jóval zavarosabb hibaüzenettel — és félkész
  -- állapotot hagyva. Fail-closed, előre.
  FOR v_oszlop IN
    SELECT unnest(ARRAY['email', 'telefon', 'cim', 'hazszam', 'iranyitoszam', 'varos', 'megye'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'congregations'
        AND column_name = v_oszlop
    ) THEN
      RAISE EXCEPTION 'ELŐFELTÉTEL: a congregations.% oszlop hiányzik — a tartalék-RPC nem építhető fel.', v_oszlop;
    END IF;
  END LOOP;

  -- ⚠️ Az `ADD COLUMN IF NOT EXISTS` NEM ellenőrzi a TÍPUST. Ha a service_times
  -- valamiért `json`/`text` néven már létezik, a jsonb-t váró CHECK 42883-mal
  -- hasalna el — a hibás típust itt, előre fogjuk meg.
  SELECT data_type INTO v_service_tipus
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'public_sites'
    AND column_name = 'service_times';

  IF v_service_tipus IS NOT NULL AND v_service_tipus <> 'jsonb' THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL: a public_sites.service_times MÁR létezik, de % típusú (jsonb kellene). Kézi rendezés szükséges.', v_service_tipus;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL: az `anon` szerepkör hiányzik — ez nem Supabase adatbázis?';
  END IF;
END
$elofeltetel$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. A belső séma és a service_times VALIDÁTOR.
--
--    A validátor TÖRZSE bájthű másolat a
--    `2026-07-18-public-site-content-and-sitemap.sql` fájlból (255–349. sor):
--    ugyanaz a szemantika, csak a köré tett jogosultság-kezelés lett
--    szerep-toleráns (lásd az 5. szakaszt). Így ha a 2026-07-18-as migráció
--    később mégis lefut, ugyanezt a definíciót fogja találni.
--
--    ⚠️ A `public_site_private` sémába SZÁNDÉKOSAN csak a validátor kerül —
--    a 2026-07-18-as előfeltétel-őr azt ellenőrzi, hogy a sémában csak a
--    három ismert rutin egyike legyen. A validátor közülük való, tehát ez
--    nem zárja el a későbbi futás útját.
--
--    ⚠️ AMIT SZÁNDÉKOSAN NEM MÁSOLUNK ÁT: az `ALTER DEFAULT PRIVILEGES …
--    REVOKE EXECUTE ON FUNCTIONS` globális beállítást. Az MINDEN jövőbeli
--    postgres-tulajdonú rutint fail-closeddá tenne az egész adatbázisban —
--    ez jóval túlmutat ezen a körön, és külön döntést érdemel.
-- ────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS public_site_private AUTHORIZATION postgres;

-- Az OWNER-allitas FELTETELES: ha a futtato nem tagja a `postgres` szerepnek,
-- egy feltetel nelkuli ALTER 42501-gyel az EGESZ migraciot megbuktatna. A
-- Supabase SQL editor `postgres`-kent fut, tehat elesben lefut — de egy mas
-- kornyezetben ne dolgunk elakadni rajta.
DO $sema_tulajdonos$
BEGIN
  IF pg_has_role(current_user, 'postgres', 'MEMBER') THEN
    ALTER SCHEMA public_site_private OWNER TO postgres;
  END IF;
END
$sema_tulajdonos$;

CREATE OR REPLACE FUNCTION
  public_site_private.public_site_service_times_are_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $service_times_validator$
DECLARE
  v_item jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  IF p_value IS NULL
     OR pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'array'
  THEN
    RETURN false;
  END IF;

  IF pg_catalog.jsonb_array_length(p_value) > 12 THEN
    RETURN false;
  END IF;

  FOR v_item IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_item) AS object_key(key_name)
      WHERE object_key.key_name NOT IN (
        'id', 'day', 'time', 'title', 'location', 'note'
      )
    ) THEN
      RETURN false;
    END IF;

    IF pg_catalog.jsonb_typeof(v_item -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'day') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'time') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'title') IS DISTINCT FROM 'string'
    THEN
      RETURN false;
    END IF;

    v_id := pg_catalog.lower(v_item ->> 'id');
    IF (v_item ->> 'id') IS DISTINCT FROM v_id
       OR v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_id = ANY(v_ids)
    THEN
      RETURN false;
    END IF;
    v_ids := pg_catalog.array_append(v_ids, v_id);

    IF (v_item ->> 'day') IS DISTINCT FROM pg_catalog.btrim(v_item ->> 'day')
       OR pg_catalog.char_length(v_item ->> 'day') NOT BETWEEN 2 AND 80
       OR (v_item ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_item ->> 'title') IS DISTINCT FROM pg_catalog.btrim(v_item ->> 'title')
       OR pg_catalog.char_length(v_item ->> 'title') NOT BETWEEN 2 AND 80
    THEN
      RETURN false;
    END IF;

    IF v_item ? 'location'
       AND v_item -> 'location' <> 'null'::jsonb
       AND (
         pg_catalog.jsonb_typeof(v_item -> 'location') IS DISTINCT FROM 'string'
         OR (v_item ->> 'location') IS DISTINCT FROM
           pg_catalog.btrim(v_item ->> 'location')
         OR pg_catalog.char_length(v_item ->> 'location') > 120
       )
    THEN
      RETURN false;
    END IF;

    IF v_item ? 'note'
       AND v_item -> 'note' <> 'null'::jsonb
       AND (
         pg_catalog.jsonb_typeof(v_item -> 'note') IS DISTINCT FROM 'string'
         OR (v_item ->> 'note') IS DISTINCT FROM
           pg_catalog.btrim(v_item ->> 'note')
         OR pg_catalog.char_length(v_item ->> 'note') > 160
       )
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END
$service_times_validator$;

ALTER FUNCTION
  public_site_private.public_site_service_times_are_valid(jsonb)
  OWNER TO postgres;
COMMENT ON FUNCTION
  public_site_private.public_site_service_times_are_valid(jsonb) IS
  'KARTOTEKA_PUBLIC_SERVICE_TIMES_VALIDATOR_V1';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. A service_times OSZLOP — ettől jelenik meg az adminban a „Rendszeres
--    alkalmak" szerkesztő. (A felület a hiányzó oszlopnál kecsesen elrejti
--    a szekciót, ezért tűnt úgy, hogy nincs is ilyen lehetőség.)
--
--    Bájthű átvétel a 2026-07-18-as fájlból (369–386. sor).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.public_sites
  ADD COLUMN IF NOT EXISTS service_times jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.public_sites
  ALTER COLUMN service_times SET DEFAULT '[]'::jsonb;
UPDATE public.public_sites
SET service_times = '[]'::jsonb
WHERE service_times IS NULL;
ALTER TABLE public.public_sites
  ALTER COLUMN service_times SET NOT NULL;

-- CHECK-bővítés drop+add párossal (az ADD CONSTRAINT IF NOT EXISTS nem
-- létezik; a drop+add idempotens és a definíció-változást is átviszi).
ALTER TABLE public.public_sites
  DROP CONSTRAINT IF EXISTS public_sites_service_times_valid;
ALTER TABLE public.public_sites
  ADD CONSTRAINT public_sites_service_times_valid
  CHECK (
    public_site_private.public_site_service_times_are_valid(service_times)
  ) NOT VALID;
-- ⚠️ A `VALIDATE CONSTRAINT` érvénytelen adaton elszáll, és a félbemaradt
-- migráció ott hagyná a NOT VALID constraintet — az érintett `public_sites`
-- sor ettől SZERKESZTHETETLENNÉ válna a felületen. Ezért ELŐBB megnézzük, van-e
-- ilyen sor, és ha igen, ÉRTHETŐ üzenettel állunk meg, mielőtt bármit rontanánk.
-- (Frissen létrehozott oszlopnál ez nem fordulhat elő — az alapérték `[]` —,
-- de a fájl egy régebbi, kézzel bővített adatbázison is futhat.)
DO $service_times_adat$
DECLARE
  v_rossz bigint;
BEGIN
  SELECT count(*) INTO v_rossz
  FROM public.public_sites ps
  WHERE NOT public_site_private.public_site_service_times_are_valid(ps.service_times);

  IF v_rossz > 0 THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL: % public_sites sor service_times értéke nem felel meg a validátornak. Előbb ezeket kell rendezni (a CHECK érvényesítése enélkül szerkeszthetetlenné tenné őket).', v_rossz;
  END IF;
END
$service_times_adat$;

ALTER TABLE public.public_sites
  VALIDATE CONSTRAINT public_sites_service_times_valid;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. ÚJ, ÖNHORDÓ RPC: a gyülekezet saját címere és elérhetőségei.
--
--    ⛔ MI VOLT A HIBA (Endre élesben látta a Barátosi oldalon)
--      · „A gyülekezet címere látszódjon betöltéskor és egyébként is!" —
--        helyette a KARTOTÉKA termék-logója állt.
--      · „Az elérhetőségek látszódjanak, amik le vannak mentve a gyülekezeti
--        adatoknál." — helyette „hamarosan felkerülnek".
--    OK: a publikus oldal KIZÁRÓLAG a `public_sites` SAJÁT mezőit nézte.
--    Endre viszont a setup varázslóban töltötte ki ezeket (`congregations`),
--    ahol a címer mező KÖTELEZŐ — tehát biztosan ki van töltve. A két
--    adathalmaz soha nem találkozott: a weboldal némán üresnek látta.
--
--    MIÉRT KÜLÖN FÜGGVÉNY, ÉS NEM A KONTEXTUS-RPC MÓDOSÍTÁSA:
--    élesben nem tudjuk, MELYIK kontextus-út fut (V2 / V1 / közvetlen
--    táblaolvasás). Egy külön, önhordó lekérdezés mindháromban ugyanúgy
--    működik, és nem nyúl hozzá működő éles objektumhoz.
--
--    A kapu ugyanaz, mint a weboldalé: publikált oldal + aktív gyülekezet.
--    Ezen felül SEMMI mást nem ad ki a gyülekezetről — csak azt a négy
--    mezőt, amit a weboldal amúgy is megjelenítene.
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ A `CREATE OR REPLACE FUNCTION` NEM tud visszateresi oszloplistat valtoztatni:
-- egy korabbi, mas szerzodesu valtozat mellett 42P13-mal elszallna. Ezert ha a
-- fuggveny letezik, de MAS oszlopokat ad vissza, eldobjuk — a jogosultsagait
-- az 5. szakasz ugyis ujra beallitja.
DO $szerzodes_or$
DECLARE
  v_oid oid;
BEGIN
  v_oid := to_regprocedure('public.public_site_congregation_fallback(text)');
  IF v_oid IS NOT NULL AND pg_get_function_result(v_oid) NOT LIKE '%crest_image_url text%' THEN
    DROP FUNCTION public.public_site_congregation_fallback(text);
  END IF;

  v_oid := to_regprocedure('public.public_site_events_v2(text, integer)');
  IF v_oid IS NOT NULL AND pg_get_function_result(v_oid) NOT LIKE '%leiras text%' THEN
    DROP FUNCTION public.public_site_events_v2(text, integer);
  END IF;
END
$szerzodes_or$;

CREATE OR REPLACE FUNCTION public.public_site_congregation_fallback(p_slug text)
RETURNS TABLE (
  crest_image_url text,
  contact_email text,
  contact_phone text,
  address text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $congregation_fallback$
  SELECT
    -- Csak nem üres értéket adunk vissza: a felületen a „mentettem, mégsem
    -- látszik" tünet tipikusan ÜRES SZÖVEGBŐL jön, nem NULL-ból.
    NULLIF(pg_catalog.btrim(c.cimer_url::text), '') AS crest_image_url,
    NULLIF(pg_catalog.btrim(c.email::text), '') AS contact_email,
    NULLIF(pg_catalog.btrim(c.telefon::text), '') AS contact_phone,
    -- A cím a gyülekezeti adatok KÜLÖN mezőiből áll össze (utca + házszám,
    -- irányítószám + település, megye) — a setup varázsló ezeket külön
    -- kezeli, tehát nem duplázunk.
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
    ) AS address
  FROM public.public_sites ps
  JOIN public.congregations c ON c.id = ps.congregation_id
  WHERE pg_catalog.lower(pg_catalog.btrim(p_slug)) ~
      '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'
    AND ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    AND ps.is_published = true
    AND c.status = 'active'
    AND c.public_site_enabled = true
  LIMIT 1;
$congregation_fallback$;

ALTER FUNCTION public.public_site_congregation_fallback(text) OWNER TO postgres;
COMMENT ON FUNCTION public.public_site_congregation_fallback(text) IS
  'KARTOTEKA_PUBLIC_SITE_CONGREGATION_FALLBACK_V1';


-- ────────────────────────────────────────────────────────────────────────────
-- 4. ÚJ RPC: nyilvános programok ÉVES ablakkal és LEÍRÁSSAL.
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
-- 5. JOGOSULTSÁGOK — SZEREP-TOLERÁNSAN.
--
--    ⚠️ EZ A KÜLÖNBSÉG tette futtathatatlanná a 2026-07-18-as migrációt: az
--    `app_staff_user`, `app_pending_user` és `member_portal_user` szerepkörök
--    a member-portál lánc részei, amely élesben NEM futott le. Egy
--    `REVOKE … FROM app_staff_user` ilyenkor 42704-gyel elszáll, és MINDEN
--    utána következő utasítás elmarad.
--
--    Itt ezért minden szerepkörre külön ellenőrizzük, hogy létezik-e.
--    EXECUTE a két publikus RPC-re KIZÁRÓLAG az `anon`-nak jár; a validátor
--    a bejelentkezett (író) oldalt szolgálja, mert a CHECK constraint az ő
--    nevében fut a mentéskor.
-- ────────────────────────────────────────────────────────────────────────────
DO $jogosultsagok$
DECLARE
  v_szerep text;
  v_fn text;
  -- ⚠️ A `PUBLIC` MINDIG az első elem, és NEM szerepkör, hanem kulcsszó —
  -- ezért nem is kell ellenőrizni. Így a lista SOSEM lehet üres, tehát a
  -- `FROM PUBLIC, ` alakú, vesszővel végződő (szintaktikailag hibás) utasítás
  -- elő sem állhat. (A `PUBLIC`-ot szándékosan NEM `quote_ident`-eljük: az
  -- idézőjelezett "public" egy VALÓDI szerepkörre hivatkozna, nem a
  -- kulcsszóra — ez csendes, nehezen észrevehető hiba lenne.)
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

  -- 5/a. ⛔ ITT NINCS SÉMA-SZINTŰ REVOKE — ÉS EZ SZÁNDÉKOS.
  --
  -- Az első vázlat itt visszavonta volna a `public_site_private` sémára adott
  -- jogokat MINDENKITŐL, az `anon`-t is beleértve. Ez EGY MŰKÖDŐ ÁLLAPOTOT
  -- ROMBOLT VOLNA LE:
  --   A `2026-07-18-...sql:610` KIFEJEZETTEN ad `GRANT USAGE ON SCHEMA
  --   public_site_private TO anon`-t, mert a `public.public_site_context_v2`
  --   burkoló SECURITY **INVOKER** (uo. 489. sor) — vagyis a privát
  --   implementációt a HÍVÓ (anon) jogaival hívja meg. Az USAGE elvétele után
  --   a hívás 42501-gyel (permission denied for schema) elszállna, amit a
  --   betöltő tartalék-ága NEM ismer fel (csak PGRST202/42883-ra esik vissza)
  --   → `notFound()` → az EGÉSZ gyülekezeti oldal 404-re menne. NÉMÁN.
  --
  -- Ma ez a séma élesben nem is létezik, tehát a REVOKE úgysem érne semmit;
  -- egy FRISSEN létrehozott séma pedig alapból zárt (a `CREATE SCHEMA` senkinek
  -- nem ad jogot). Vagyis a sor haszna nulla, a kockázata viszont a teljes
  -- publikus oldal. Kihagyjuk.

  -- 5/b. A két publikus RPC: mindenkitől vissza, majd CSAK az anon-nak.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.public_site_congregation_fallback(text)',
    'public.public_site_events_v2(text, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', v_fn, v_lista);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_fn);
  END LOOP;

  -- 5/c. A validátor: a CHECK constraint a MENTŐ (bejelentkezett) szerepében
  --      fut, ezért neki kell a séma-USAGE és a függvény-EXECUTE. Az anon
  --      SOHA nem ír public_sites-ot, tehát ő nem kap semmit.
  EXECUTE format(
    'REVOKE ALL ON FUNCTION public_site_private.public_site_service_times_are_valid(jsonb) FROM %s',
    v_lista
  );
  FOREACH v_szerep IN ARRAY ARRAY['authenticated', 'service_role', 'app_staff_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_szerep) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public_site_private TO %I', v_szerep);
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public_site_private.public_site_service_times_are_valid(jsonb) TO %I',
        v_szerep
      );
    END IF;
  END LOOP;

  -- 5/d. HELYREÁLLÍTÓ HÁLÓ. Ha a sémában ÉL a V2 kontextus vagy a sitemap
  --      implementációja, akkor az `anon`-nak MUSZÁJ USAGE-t adni rá: a
  --      `public.public_site_context_v2` burkoló SECURITY INVOKER, tehát a
  --      privát implementációt a HÍVÓ jogaival hívja. Enélkül 42501 jönne,
  --      amit a betöltő nem ismer fel tartalékként → 404 az EGÉSZ gyülekezeti
  --      oldalon, némán. Ez a sor akkor is helyrehozza, ha egy korábbi,
  --      elhamarkodott REVOKE elvette volna.
  IF to_regprocedure('public_site_private.public_site_context_v2(text)') IS NOT NULL
     OR to_regprocedure('public_site_private.public_sitemap_entries()') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA public_site_private TO anon;
  END IF;
END
$jogosultsagok$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. A PostgREST SÉMA-GYORSÍTÓTÁRÁNAK ÚJRATÖLTÉSE.
--
--    ⚠️ ENÉLKÜL A MIGRÁCIÓ „HATÁSTALANNAK" LÁTSZANA: a PostgREST a séma-képét
--    gyorsítótárazza, ezért az új RPC-kre percekig még `PGRST202`-t (nincs
--    ilyen függvény) adna. Az app azt NÉMA tartaléknak veszi — vagyis Endre
--    azt látná, hogy „lefutott, de semmi nem változott", és keresné a hibát
--    ott, ahol nincs.
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- ELLENŐRZÉS — EGYETLEN EREDMÉNYHALMAZ, ÉS EZ A FÁJL UTOLSÓ UTASÍTÁSA.
--
-- ⚠️ MIÉRT ÍGY: a Supabase SQL editor egy szkriptből CSAK AZ UTOLSÓ, sorokat
--    visszaadó utasítás rácsát mutatja (a projekt saját tapasztalata,
--    docs/CHANGELOG.md: „Studio »Run« csak az utolsó…"). Ha a kapuk külön
--    SELECT-ek lennének, Endre pont a `❌`-eket NEM látná — előállna a
--    „lefutott, nem hibázott" hamis jelentés, ami ellen ez a kiadás készült.
--
-- MIND A 7 SOR `✅` (vagy `➖ nem alkalmazható`) KELL LEGYEN.
--
-- A tájékoztató listák (mit publikál a tartalék, mely leírások mennek ki,
-- miért üres a „Következő alkalom") KÜLÖN fájlban:
--   migration-docs/sql/2026-08-27-gyulekezeti-oldal-ELLENORZO-listak.sql
-- ============================================================================
SELECT lepes, eredmeny FROM (

  SELECT '1. A gyülekezeti tartalék-RPC létezik' AS lepes,
         CASE WHEN to_regprocedure('public.public_site_congregation_fallback(text)') IS NOT NULL
              THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS eredmeny

  UNION ALL
  SELECT '2. Az éves esemény-RPC létezik és a leírást is adja',
         CASE WHEN to_regprocedure('public.public_site_events_v2(text, integer)') IS NULL
                THEN '❌ HIÁNYZIK'
              WHEN pg_get_functiondef(to_regprocedure('public.public_site_events_v2(text, integer)')) LIKE '%gp.leiras%'
                THEN '✅ OK'
              ELSE '❌ RÉGI VÁLTOZAT — nincs benne a leiras' END

  UNION ALL
  -- ⚠️ A `has_function_privilege` NEM LÉTEZŐ szerepkörre HIBÁT DOB, ezért a
  --    tagadó ágat a pg_roles-ból vezetjük le: csak a ténylegesen létező
  --    szerepköröket kérdezzük — viszont MINDEGYIKET, nem csak kettőt.
  SELECT '3. A két publikus RPC-t CSAK az anon hívhatja',
         CASE WHEN to_regprocedure('public.public_site_congregation_fallback(text)') IS NULL
                   OR to_regprocedure('public.public_site_events_v2(text, integer)') IS NULL
                THEN '❌ NINCS FÜGGVÉNY — nem értékelhető'
              WHEN has_function_privilege('anon', 'public.public_site_congregation_fallback(text)', 'EXECUTE')
               AND has_function_privilege('anon', 'public.public_site_events_v2(text, integer)', 'EXECUTE')
               AND NOT EXISTS (
                 SELECT 1 FROM pg_roles r
                 WHERE r.rolname IN ('authenticated', 'service_role',
                                     'app_staff_user', 'app_pending_user', 'member_portal_user')
                   AND (
                     has_function_privilege(r.rolname, 'public.public_site_congregation_fallback(text)', 'EXECUTE')
                     OR has_function_privilege(r.rolname, 'public.public_site_events_v2(text, integer)', 'EXECUTE')
                   )
               )
                THEN '✅ OK'
              ELSE '❌ JOGOSULTSÁG-DRIFT' END

  UNION ALL
  SELECT '4. A belső megjegyzés NEM megy ki',
         CASE WHEN to_regprocedure('public.public_site_events_v2(text, integer)') IS NULL
                THEN '❌ NINCS FÜGGVÉNY — nem értékelhető'
              WHEN pg_get_functiondef(to_regprocedure('public.public_site_events_v2(text, integer)'))
                   NOT LIKE '%gp.megjegyzes%'
                THEN '✅ OK'
              ELSE '❌ KISZIVÁROG' END

  UNION ALL
  SELECT '5. A service_times oszlop (jsonb) + ÉRVÉNYESÍTETT CHECK megvan',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'public_sites'
             AND column_name = 'service_times' AND data_type = 'jsonb'
         ) AND EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'public_sites_service_times_valid'
             AND conrelid = 'public.public_sites'::regclass
             AND convalidated
         ) THEN '✅ OK' ELSE '❌ HIÁNYZIK' END

  UNION ALL
  -- ⚠️ NEGATÍV ŐRSZEM: pontosan azt a hibát méri, amit e kiadás VÁZLATA
  --    okozott volna. Ha él a V2, az `anon` séma-USAGE-ének MEG KELL maradnia:
  --    a `public.public_site_context_v2` SECURITY INVOKER burkoló, tehát a
  --    privát implementációt a HÍVÓ jogaival hívja. Elvéve 42501 jönne, azt
  --    pedig a betöltő nem ismeri fel tartalékként → 404 az EGÉSZ oldalon.
  SELECT '6. Ha él a V2/sitemap, az anon séma-USAGE-e megmaradt',
         CASE WHEN to_regprocedure('public_site_private.public_site_context_v2(text)') IS NULL
                   AND to_regprocedure('public_site_private.public_sitemap_entries()') IS NULL
                THEN '➖ nincs V2/sitemap — nem alkalmazható'
              WHEN has_schema_privilege('anon', 'public_site_private', 'USAGE')
                THEN '✅ OK'
              ELSE '❌ ELVETTÜK AZ ANON USAGE-T — A PUBLIKUS OLDAL 404-ELNE' END

  UNION ALL
  -- ⚠️ NEGATÍV ŐRSZEM: van-e PUBLIKÁLT oldal, amire a tartalék-RPC 0 sort ad?
  --    A tartalék kapuja (aktív + engedélyezett gyülekezet) SZIGORÚBB, mint a
  --    ma élő közvetlen olvasási ágé (az csak `is_published`-öt néz). Ahol a
  --    kettő széthúz, ott az oldal LÁTSZIK, de a címer/elérhetőség NÉMÁN üres
  --    marad — vagyis pont a bejelentett tünet térne vissza. Itt HANGOS.
  SELECT '7. Minden publikált oldalnál ad sort a tartalék-RPC',
         CASE WHEN to_regprocedure('public.public_site_congregation_fallback(text)') IS NULL
                THEN '❌ NINCS FÜGGVÉNY — nem értékelhető'
              WHEN NOT EXISTS (
                SELECT 1
                FROM public.public_sites ps
                LEFT JOIN LATERAL (
                  SELECT true AS talalt
                  FROM public.public_site_congregation_fallback(ps.slug) x
                ) f ON true
                WHERE ps.is_published = true AND f.talalt IS NULL
              ) THEN '✅ OK'
              ELSE '❌ VAN PUBLIKÁLT OLDAL, AMIRE A TARTALÉK 0 SORT AD — a congregations.status / public_site_enabled szétcsúszott — futtasd az ELLENORZO-listak.sql B. pontját' END

) AS kapuk
ORDER BY lepes;
