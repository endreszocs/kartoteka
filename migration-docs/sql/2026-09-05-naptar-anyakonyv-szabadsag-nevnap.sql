-- ============================================================================
-- 2026-09-05 — NAPTÁR: SZABADSÁG + ANYAKÖNYVI ALKALMAK + NÉVNAP-EGYEZTETÉS
-- ============================================================================
-- MIT AD
-- ──────
--  1) Öt új programtípus a `gyulekezeti_programok.tipus` CHECK-ben:
--       'szabadsag' (a lelkész szabadsága — többnapos, egész napos),
--       'kereszteles', 'eskuvo', 'konfirmacio', 'temetes' (TERVEZETT anyakönyvi
--       alkalmak — a naptárból rögzíthetők; a MEGTÖRTÉNT tény továbbra is az
--       anyakönyv sora).
--  2) Két oszlop az összekötéshez: `anyakonyv_tabla` + `anyakonyv_id` — a
--     tervezett alkalom és a megtörtént anyakönyvi bejegyzés EGYETLEN
--     kapcsolata. Egy anyakönyvi sorhoz legfeljebb EGY program köthető
--     (részleges egyedi index) → a naptár soha nem mutat duplán.
--  3) MAGÁN-TÍPUS KAPU (trigger): a szabadság és az anyakönyvi típusú program
--     `publikus` mezője az adatbázisban SOHA nem lehet igaz — akkor sem, ha
--     egy kliens kihagyná az alkalmazás-szintű kaput.
--  4) A nyilvános weboldal RPC-i (public_site_events V1 + V2) és a gyülekezeti
--     ICS-feed (public_calendar_feed) a magán-típusokat KIZÁRJÁK a WHERE-ben
--     — a kapu a lekérdezésben van, nem a kliensben.
--       · weboldal: szabadság + mind a 4 anyakönyvi típus kizárva
--         (személynevek egy nyilvános oldalon nem jelenhetnek meg automatikusan);
--       · gyülekezeti ICS-feed: CSAK a szabadság kizárva (a lelkész pihenése
--         nem a tagok naptárába való); a tervezett keresztelő/esküvő/temetés
--         a gyülekezet alkalma — a lelkész maga írja a címét.
--  5) KÖZÖS névnap-egyeztető (`naptar_szemely_nevnapok`) és személy-alap
--     (`naptar_szemely_alap`) függvény — SECURITY INVOKER, az RLS érvényes —,
--     amelyet a webes születésnapos/névnapos naptár ÉS a lelkészi Google-feed
--     (lelkeszi_naptar_feed V2) UGYANÚGY használ. Eddig a feed CSAK a teljes
--     keresztnév pontos egyezését nézte: az „Anna Mária" és a „Zsolt-Attila"
--     névnap nélkül maradt. Mostantól a keresztnév minden tagja (szóköz/kötőjel
--     mentén) külön is egyezhet; a találat jelzi, hogy a nap FŐ neve-e.
--
-- SZABÁLYOK, AMIKET KÖVET
--  · a CHECK-constraintet conkey szerint célozzuk (nem pg_get_constraintdef
--    LIKE-kal) — a projekt ismert hibaosztálya;
--  · minden szakasz idempotens; első futásra és ismételt futásra is jó;
--  · új TÁBLA nem keletkezik → mentés-besorolás nem kell (oszlop-bővítés csak);
--  · a végén EGY verifikációs rács.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) Első-futás-őr: a program-tábla és a 2026-08-26-os oszlopok megléte
-- ─────────────────────────────────────────────────────────────────────────
DO $elofeltetel$
BEGIN
  IF to_regclass('public.gyulekezeti_programok') IS NULL THEN
    RAISE EXCEPTION 'A gyulekezeti_programok tábla nem létezik.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='gyulekezeti_programok'
                   AND column_name='publikus') THEN
    RAISE EXCEPTION 'Hiányzik a gyulekezeti_programok.publikus oszlop — előbb a 2026-08-26-presbiterium-tisztsegek.sql fusson le.';
  END IF;
END
$elofeltetel$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) A `tipus` CHECK bővítése — a constraintet a conkey (oszlop) szerint
--    keressük meg, NEM a definíció szövege alapján.
-- ─────────────────────────────────────────────────────────────────────────
DO $tipus_check$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.gyulekezeti_programok'::regclass
    AND c.contype = 'c'
    AND c.conkey = ARRAY[(
      SELECT a.attnum FROM pg_attribute a
      WHERE a.attrelid = 'public.gyulekezeti_programok'::regclass
        AND a.attname = 'tipus'
    )]::int2[];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gyulekezeti_programok DROP CONSTRAINT %I', v_name);
  END IF;
END
$tipus_check$;

ALTER TABLE public.gyulekezeti_programok
  ADD CONSTRAINT gyulekezeti_programok_tipus_check
  CHECK (tipus = ANY (ARRAY[
    'istentisztelet','bibliaora','imaora','ifjusagi','gyerekprogram',
    'konferencia','hangverseny','kozossegi','presbiteri','latogatas',
    'unnep','tabor','evangelizacio','diakoniai','noszovetseg','egyeb',
    -- 2026-09-05:
    'szabadsag','kereszteles','eskuvo','konfirmacio','temetes'
  ]));

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Anyakönyvi kapcsolat — tervezett alkalom ⇄ megtörtént bejegyzés
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.gyulekezeti_programok
  ADD COLUMN IF NOT EXISTS anyakonyv_tabla text;
ALTER TABLE public.gyulekezeti_programok
  ADD COLUMN IF NOT EXISTS anyakonyv_id integer;

DO $anyakonyv_check$
DECLARE
  v_name text;
BEGIN
  -- A KORÁBBI (esetleg más nevű) párosítási CHECK eltávolítása — az
  -- anyakonyv_tabla oszlopra mutató egyoszlopos CHECK-et keressük.
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.gyulekezeti_programok'::regclass
    AND c.contype = 'c'
    AND c.conkey @> ARRAY[(
      SELECT a.attnum FROM pg_attribute a
      WHERE a.attrelid = 'public.gyulekezeti_programok'::regclass
        AND a.attname = 'anyakonyv_tabla'
    )]::int2[];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gyulekezeti_programok DROP CONSTRAINT %I', v_name);
  END IF;
END
$anyakonyv_check$;

ALTER TABLE public.gyulekezeti_programok
  ADD CONSTRAINT gyulekezeti_programok_anyakonyv_check
  CHECK (
    (anyakonyv_tabla IS NULL AND anyakonyv_id IS NULL)
    OR (anyakonyv_tabla IN ('keresztseg','hazassag','konfirmalas','temetes') AND anyakonyv_id IS NOT NULL)
  );

-- Egy anyakönyvi sorhoz gyülekezetenként legfeljebb EGY program.
CREATE UNIQUE INDEX IF NOT EXISTS gyulekezeti_programok_anyakonyv_uq
  ON public.gyulekezeti_programok (congregation_id, anyakonyv_tabla, anyakonyv_id)
  WHERE anyakonyv_id IS NOT NULL;

COMMENT ON COLUMN public.gyulekezeti_programok.anyakonyv_tabla IS
  '2026-09-05: a tervezett anyakönyvi alkalom (kereszteles/eskuvo/konfirmacio/temetes típus) MEGTÖRTÉNT bejegyzésének táblája — keresztseg | hazassag | konfirmalas | temetes. Az anyakönyv a tény; a program a terv.';
COMMENT ON COLUMN public.gyulekezeti_programok.anyakonyv_id IS
  '2026-09-05: az anyakönyvi bejegyzés azonosítója (integer PK). anyakonyv_tabla-val együtt NULL vagy együtt kitöltött.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) MAGÁN-TÍPUS KAPU — a szabadság és az anyakönyvi típus SOHA nem publikus
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gyulekezeti_programok_magan_tipus_kapu()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipus IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes') THEN
    NEW.publikus := false;
  END IF;
  -- Anyakönyvi kapcsolat CSAK anyakönyvi típusú programon állhat.
  IF NEW.anyakonyv_id IS NOT NULL
     AND NEW.tipus NOT IN ('kereszteles','eskuvo','konfirmacio','temetes') THEN
    RAISE EXCEPTION 'Anyakönyvi bejegyzés csak anyakönyvi típusú (keresztelő/esküvő/konfirmáció/temetés) programhoz köthető (tipus=%).', NEW.tipus
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gyulekezeti_programok_magan_tipus ON public.gyulekezeti_programok;
CREATE TRIGGER trg_gyulekezeti_programok_magan_tipus
  BEFORE INSERT OR UPDATE ON public.gyulekezeti_programok
  FOR EACH ROW EXECUTE FUNCTION public.gyulekezeti_programok_magan_tipus_kapu();

-- Meglévő sorok rendbetétele (ha bárhol publikus szabadság lenne — ma még nem lehet, de a kapu legyen teljes).
UPDATE public.gyulekezeti_programok
SET publikus = false
WHERE publikus = true
  AND tipus IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes');

-- ─────────────────────────────────────────────────────────────────────────
-- 4/a) public_site_events (V1) — a magán-típusok kizárása a WHERE-ben.
--      A törzs a 2026-08-26-os V1-ből, EGYETLEN plusz feltétellel.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_site_events(p_slug text)
RETURNS TABLE (
  cim text,
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
AS $$
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
  )
  SELECT
    gp.cim::text,
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
  WHERE gp.congregation_id = site.congregation_id
    AND gp.publikus = true
    -- 2026-09-05: magán-típusok SOHA (személynevek + a lelkész szabadsága).
    AND gp.tipus NOT IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes')
    AND (
      (gp.ismetlodes_tipus IS NULL
        AND gp.datum::date >= current_date - 1
        AND gp.datum::date <= current_date + 90)
      OR
      (gp.ismetlodes_tipus IS NOT NULL
        AND gp.datum::date <= current_date + 90
        AND gp.datum::date >= current_date - INTERVAL '6 years'
        AND (gp.ismetlodes_vege IS NULL OR gp.ismetlodes_vege >= current_date))
    )
  ORDER BY gp.datum
  LIMIT 100;
$$;

COMMENT ON FUNCTION public.public_site_events(text) IS
  'KARTOTEKA_PUBLIC_SITE_EVENTS_V1_MAGAN_KIZARAS';

-- ─────────────────────────────────────────────────────────────────────────
-- 4/b) public_site_events_v2 — ugyanaz a kizárás (a 2026-08-27-es törzs).
-- ─────────────────────────────────────────────────────────────────────────
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
    -- 2026-09-05: magán-típusok SOHA (személynevek + a lelkész szabadsága).
    AND gp.tipus NOT IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes')
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
  'KARTOTEKA_PUBLIC_SITE_EVENTS_V2_MAGAN_KIZARAS';

-- ─────────────────────────────────────────────────────────────────────────
-- 4/c) public_calendar_feed (V3) — a SZABADSÁG kizárva a gyülekezeti ICS-ből.
--      A törzs a 2026-08-26-os V2, egyetlen plusz feltétellel.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_calendar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_cong record;
  v_programs jsonb;
BEGIN
  SELECT id, COALESCE(nev_hu, name) AS nev,
         COALESCE(calendar_feed_reszletes, false) AS reszletes
  INTO v_cong
  FROM public.congregations
  WHERE calendar_feed_token = p_token;

  IF v_cong.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'cim', p.cim,
    'leiras', p.leiras,
    'megjegyzes', p.megjegyzes,
    'helyszin', p.helyszin,
    'tipus', p.tipus,
    'egyedi_tipus_nev', p.egyedi_tipus_nev,
    'egyedi_emoji', p.egyedi_emoji,
    'datum', p.datum,
    'datum_vege', p.datum_vege,
    'ido_kezdes', p.ido_kezdes,
    'ido_befejezes', p.ido_befejezes,
    'ismetlodes_tipus', p.ismetlodes_tipus,
    'ismetlodes_vege', p.ismetlodes_vege,
    'prioritas', p.prioritas,
    'updated_at', p.updated_at
  ) ORDER BY p.datum), '[]'::jsonb)
  INTO v_programs
  FROM public.gyulekezeti_programok p
  WHERE p.congregation_id = v_cong.id
    AND p.datum >= make_date(EXTRACT(year FROM now())::int - 5, 1, 1)
    -- 2026-09-05: a MAGÁN típusok nem mennek a megosztott gyülekezeti feedbe —
    -- a szabadság a lelkész személyes ügye, a tervezett keresztelő/esküvő/
    -- konfirmáció/temetés címe személynevet hordozhat (fail-closed; a
    -- lelkészi PRIVÁT feedbe később opt-in kerülhetnek).
    AND p.tipus NOT IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes');

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', v_cong.nev,
    'reszletes', v_cong.reszletes,
    'programs', v_programs
  );
END;
$$;

COMMENT ON FUNCTION public.public_calendar_feed(uuid) IS
  'Nyilvános naptár-feed adatforrás (V3, 2026-09-05): a calendar_feed_token alapján a gyülekezet programjait adja a szabadság-típus NÉLKÜL az /api/calendar/<token> ICS-feedhez.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) KÖZÖS személy-alap + névnap-egyeztető függvények (SECURITY INVOKER — az
--    RLS a hívóra érvényes; a webes nyomtatvány a bejelentkezett lelkész
--    jogán olvas, a Google-feed DEFINER-függvénye a sajátján).
-- ─────────────────────────────────────────────────────────────────────────

-- 5/0) Ékezet-független név-kulcs. Az unaccent bővítmény + az IMMUTABLE wrapper
--      a 2026-04-26-os migrációból ismert; itt idempotensen újra kiadjuk, hogy
--      ez a fájl önhordó legyen (a migration-fájl nem bizonyíték az élő állapotra).
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $immutable_unaccent$
    SELECT public.unaccent('public.unaccent'::regdictionary, input);
$immutable_unaccent$;

-- A tag-státusz és a nevek ÖSSZEVETÉSI kulcsa: ékezet, kis/nagybetű, szóköz,
-- kötőjel és aláhúzás nélkül — a webes normalizeMemberStatus() SQL-tükre
-- (apps/web/lib/members/member-status.ts). Az éles adatban 'elköltözött' és
-- 'elkoltozott' is él; ez a kulcs mindkettőt ugyanoda képezi.
CREATE OR REPLACE FUNCTION public.naptar_nev_kulcs(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $naptar_nev_kulcs$
    SELECT regexp_replace(lower(public.immutable_unaccent(coalesce(input, ''))), '[[:space:]_-]+', '', 'g');
$naptar_nev_kulcs$;

-- 5/a) Kiket számolunk: a gyülekezet élő, látható, el nem költözött, ki nem
--      tért, nem törölt tagjai — a webes isLivingMember() SQL-tükre + az
--      elkoltozott tábla (a régi lelkészi feed szűrője).
CREATE OR REPLACE FUNCTION public.naptar_szemely_alap(p_congregation uuid)
RETURNS TABLE (
  szemely_id integer,
  csaladnev text,
  k_nev text,
  namepattern text,
  allapot text,
  ferfi boolean,
  sz_datum date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.csaladnev::text, s.k_nev::text, s.namepattern::text, s.allapot::text,
         s.ferfi, s.sz_datum
  FROM public.szemely s
  WHERE s.congregation_id = p_congregation
    AND s.meghalt = false
    AND s.isvisible = true
    AND public.naptar_nev_kulcs(s.member_status) NOT IN ('elkoltozott', 'kitert', 'torolt')
    AND NOT EXISTS (
      SELECT 1 FROM public.elkoltozott e
      WHERE e.id_szemely = s.id AND e.congregation_id = p_congregation
    )
  ORDER BY s.id;
$$;

COMMENT ON FUNCTION public.naptar_szemely_alap(uuid) IS
  '2026-09-05: a naptári évfordulók (születésnap, névnap) személy-alapja — élő, látható, el nem költözött tagok. EGYETLEN forrás a webes nyomtatványnak és a lelkészi Google-feednek.';

-- 5/b) Névnap-egyeztetés: a teljes keresztnév ÉS annak minden tagja
--      (szóköz / kötőjel mentén bontva) egyezhet a nevnap.nev1/nev2/nev3-mal,
--      kis/nagybetű-függetlenül. `elsodleges` = a nap FŐ neve (nev1).
CREATE OR REPLACE FUNCTION public.naptar_szemely_nevnapok(p_congregation uuid)
RETURNS TABLE (
  szemely_id integer,
  honap integer,
  nap integer,
  nev text,
  elsodleges boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sz AS (
    SELECT a.szemely_id AS id, btrim(a.k_nev) AS k_nev
    FROM public.naptar_szemely_alap(p_congregation) a
    WHERE a.k_nev IS NOT NULL AND btrim(a.k_nev) <> ''
  ),
  tok AS (
    SELECT id, k_nev AS nev FROM sz
    UNION
    SELECT sz.id, t.nev
    FROM sz
    -- a kötőjel a zárójel VÉGÉN áll → szó szerinti kötőjel (nincs escape-csapda)
    CROSS JOIN LATERAL regexp_split_to_table(sz.k_nev, '[[:space:]-]+') AS t(nev)
    -- az előtag-tokenek (ifj., id., dr., özv.) ponttal végződnek → nem nevek
    WHERE btrim(t.nev) <> '' AND t.nev !~ '\.$'
  ),
  talalat AS (
    -- Ékezet- és kis/nagybetű-független egyeztetés (Andras ⇄ András).
    SELECT tok.id, n.honap::int AS honap, n.nap::int AS nap, tok.nev,
           (public.naptar_nev_kulcs(n.nev1) = public.naptar_nev_kulcs(tok.nev)) AS elsodleges
    FROM tok
    JOIN public.nevnap n
      ON n.honap ~ '^[0-9]+$'
     AND n.nap ~ '^[0-9]+$'
     AND public.naptar_nev_kulcs(tok.nev) <> ''
     AND (
          public.naptar_nev_kulcs(n.nev1) = public.naptar_nev_kulcs(tok.nev)
       OR public.naptar_nev_kulcs(n.nev2) = public.naptar_nev_kulcs(tok.nev)
       OR public.naptar_nev_kulcs(n.nev3) = public.naptar_nev_kulcs(tok.nev)
     )
  )
  SELECT DISTINCT ON (id, honap, nap) id, honap, nap, nev, elsodleges
  FROM talalat
  ORDER BY id, honap, nap, elsodleges DESC, nev;
$$;

COMMENT ON FUNCTION public.naptar_szemely_nevnapok(uuid) IS
  '2026-09-05: KÖZÖS névnap-egyeztetés (teljes keresztnév + tagjai, kis/nagybetű-független). A webes névnapos naptár és a lelkészi Google-feed ugyanezt használja.';

REVOKE ALL ON FUNCTION public.naptar_szemely_alap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.naptar_szemely_nevnapok(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.naptar_szemely_alap(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.naptar_szemely_nevnapok(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.naptar_szemely_alap(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.naptar_szemely_nevnapok(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) lelkeszi_naptar_feed V2 — a névnap-blokk a KÖZÖS egyeztetőből.
--    A törzs a 2026-08-11-es V1; CSAK a névnap-szakasz változott.
-- ─────────────────────────────────────────────────────────────────────────
DO $feed_guard$
BEGIN
  IF to_regclass('public.lelkeszi_naptar_token') IS NULL THEN
    RAISE NOTICE 'A lelkeszi_naptar_token tábla nem létezik — a lelkészi feed V2 kihagyva (előbb a 2026-08-11-lelkeszi-naptar-token.sql fusson le).';
  END IF;
END
$feed_guard$;

CREATE OR REPLACE FUNCTION public.lelkeszi_naptar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
VOLATILE
AS $$
DECLARE
  v_user        uuid;
  v_cong        uuid;
  v_role_cnt    int;
  v_nev         text;
  v_szuletes    jsonb;
  v_nevnap      jsonb;
  v_hazassag    jsonb;
  v_konfirmacio jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT user_id INTO v_user
  FROM public.lelkeszi_naptar_token
  WHERE token = p_token;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- ── HATÓKÖR: roles-first, fail-closed ──
  SELECT count(*), min(scope_id)
  INTO v_role_cnt, v_cong
  FROM (
    SELECT DISTINCT scope_id
    FROM public.profile_roles
    WHERE profile_id = v_user
      AND scope = 'congregation'
      AND scope_id IS NOT NULL
      AND approval_status = 'approved'
      AND active = true
  ) s;

  IF v_role_cnt > 1 THEN
    RETURN jsonb_build_object('status', 'ambiguous_scope');
  END IF;

  IF v_role_cnt = 0 THEN
    SELECT congregation_id INTO v_cong FROM public.profiles WHERE id = v_user;
  END IF;

  IF v_cong IS NULL THEN
    RETURN jsonb_build_object('status', 'no_scope');
  END IF;

  UPDATE public.lelkeszi_naptar_token
  SET last_used_at = now()
  WHERE token = p_token;

  SELECT COALESCE(nev_hu, name) INTO v_nev
  FROM public.congregations WHERE id = v_cong;

  -- ── Születésnapok — a közös személy-alapból ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.szemely_id,
    'csaladnev', a.csaladnev,
    'k_nev', a.k_nev,
    'namepattern', a.namepattern,
    'allapot', a.allapot,
    'datum', to_char(a.sz_datum, 'YYYY-MM-DD')
  ) ORDER BY a.szemely_id), '[]'::jsonb)
  INTO v_szuletes
  FROM public.naptar_szemely_alap(v_cong) a
  WHERE a.sz_datum IS NOT NULL;

  -- ── Névnapok — a KÖZÖS egyeztetőből (2026-09-05, V2) ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.szemely_id,
    'csaladnev', a.csaladnev,
    'k_nev', a.k_nev,
    'namepattern', a.namepattern,
    'allapot', a.allapot,
    'honap', nn.honap,
    'nap', nn.nap
  ) ORDER BY a.szemely_id, nn.honap, nn.nap), '[]'::jsonb)
  INTO v_nevnap
  FROM public.naptar_szemely_nevnapok(v_cong) nn
  JOIN public.naptar_szemely_alap(v_cong) a ON a.szemely_id = nn.szemely_id;

  -- ── Házassági évfordulók — CSAK ha mindkét fél él és itt van ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'datum', to_char(h.datum, 'YYYY-MM-DD'),
    'ferfi', jsonb_build_object(
      'id', f.id, 'csaladnev', f.csaladnev, 'k_nev', f.k_nev,
      'namepattern', f.namepattern, 'allapot', f.allapot),
    'no', jsonb_build_object(
      'id', w.id, 'csaladnev', w.csaladnev, 'k_nev', w.k_nev,
      'namepattern', w.namepattern, 'allapot', w.allapot)
  ) ORDER BY h.id), '[]'::jsonb)
  INTO v_hazassag
  FROM public.hazassag h
  JOIN public.szemely f ON f.id = h.id_ferfi
  JOIN public.szemely w ON w.id = h.id_no
  WHERE h.congregation_id = v_cong
    AND h.datum IS NOT NULL
    AND f.meghalt = false AND w.meghalt = false
    AND f.isvisible = true AND w.isvisible = true
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = f.id AND e.congregation_id = v_cong)
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = w.id AND e.congregation_id = v_cong);

  -- ── Konfirmációi évfordulók ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', k.id,
    'csaladnev', s.csaladnev,
    'k_nev', s.k_nev,
    'namepattern', s.namepattern,
    'allapot', s.allapot,
    'datum', to_char(k.datum, 'YYYY-MM-DD')
  ) ORDER BY k.id), '[]'::jsonb)
  INTO v_konfirmacio
  FROM public.konfirmalas k
  JOIN public.szemely s ON s.id = k.id_szemely
  WHERE k.congregation_id = v_cong
    AND k.datum IS NOT NULL
    AND s.meghalt = false
    AND s.isvisible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.elkoltozott e
      WHERE e.id_szemely = s.id AND e.congregation_id = v_cong
    );

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', COALESCE(v_nev, 'Gyülekezet'),
    'szuletesnapok', v_szuletes,
    'nevnapok', v_nevnap,
    'hazassagok', v_hazassag,
    'konfirmaciok', v_konfirmacio
  );
END;
$$;

COMMENT ON FUNCTION public.lelkeszi_naptar_feed(uuid) IS
  'Lelkészi (privát) naptár-feed adatforrás V2 (2026-09-05): a személy-alap és a névnap-egyeztetés a KÖZÖS naptar_szemely_* függvényekből. Fail-closed: több vagy nulla gyülekezetnél nem szolgál ki.';

-- A jogosultságok változatlanok (CREATE OR REPLACE megőrzi): csak service_role.
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lelkeszi_naptar_feed(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFIKÁCIÓ — EGY eredmény-rács
-- ============================================================================
SELECT lepes, allapot FROM (
  SELECT 1 AS sorrend, '01. tipus CHECK tartalmazza az 5 új típust' AS lepes,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'public.gyulekezeti_programok'::regclass AND c.contype='c'
        AND pg_get_constraintdef(c.oid) LIKE '%szabadsag%'
        AND pg_get_constraintdef(c.oid) LIKE '%kereszteles%'
        AND pg_get_constraintdef(c.oid) LIKE '%eskuvo%'
        AND pg_get_constraintdef(c.oid) LIKE '%konfirmacio%'
        AND pg_get_constraintdef(c.oid) LIKE '%temetes%')
    THEN '✅' ELSE '❌' END AS allapot
  UNION ALL
  SELECT 2, '02. a régi 16 típus is megmaradt (istentisztelet, egyeb)',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'public.gyulekezeti_programok'::regclass AND c.contype='c'
        AND pg_get_constraintdef(c.oid) LIKE '%istentisztelet%'
        AND pg_get_constraintdef(c.oid) LIKE '%noszovetseg%')
    THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 3, '03. anyakonyv_tabla + anyakonyv_id oszlopok',
    CASE WHEN (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='gyulekezeti_programok'
        AND column_name IN ('anyakonyv_tabla','anyakonyv_id')) = 2 THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 4, '04. anyakönyvi részleges egyedi index',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='gyulekezeti_programok_anyakonyv_uq') THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 5, '05. magán-típus trigger',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_gyulekezeti_programok_magan_tipus'
      AND tgrelid='public.gyulekezeti_programok'::regclass) THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 6, '06. nincs publikus magán-típusú program',
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.gyulekezeti_programok
      WHERE publikus = true AND tipus IN ('szabadsag','kereszteles','eskuvo','konfirmacio','temetes'))
    THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 7, '07. public_site_events V1 kizár',
    CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='public_site_events'
      AND pronamespace='public'::regnamespace LIMIT 1) LIKE '%NOT IN (''szabadsag''%' THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 8, '08. public_site_events_v2 kizár',
    CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='public_site_events_v2'
      AND pronamespace='public'::regnamespace LIMIT 1) LIKE '%NOT IN (''szabadsag''%' THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 9, '09. public_calendar_feed kizárja az 5 magán típust',
    CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='public_calendar_feed'
      AND pronamespace='public'::regnamespace LIMIT 1) LIKE '%NOT IN (''szabadsag''%' THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 9.5, '09b. naptar_nev_kulcs: ''Özv. Kovács-Nagy'' → ''ozv.kovacsnagy''',
    CASE WHEN public.naptar_nev_kulcs('Özv. Kovács-Nagy') = 'ozv.kovacsnagy' THEN '✅' ELSE '❌ ' || public.naptar_nev_kulcs('Özv. Kovács-Nagy') END
  UNION ALL
  SELECT 10, '10. naptar_szemely_alap + naptar_szemely_nevnapok',
    CASE WHEN to_regprocedure('public.naptar_szemely_alap(uuid)') IS NOT NULL
      AND to_regprocedure('public.naptar_szemely_nevnapok(uuid)') IS NOT NULL THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 11, '11. a névnap-függvény anon-nak NEM, authenticated-nek IGEN',
    CASE WHEN NOT has_function_privilege('anon', 'public.naptar_szemely_nevnapok(uuid)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.naptar_szemely_nevnapok(uuid)', 'EXECUTE')
    THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 12, '12. lelkeszi_naptar_feed V2 a közös egyeztetőt hívja',
    CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='lelkeszi_naptar_feed'
      AND pronamespace='public'::regnamespace LIMIT 1) LIKE '%naptar_szemely_nevnapok%' THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 13, '13. lelkeszi_naptar_feed csak service_role',
    CASE WHEN NOT has_function_privilege('anon', 'public.lelkeszi_naptar_feed(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.lelkeszi_naptar_feed(uuid)', 'EXECUTE')
    THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 14, '14. névnap-egyeztetés próba (Anna Mária → Anna találat)',
    CASE WHEN EXISTS (SELECT 1 FROM public.nevnap n
      WHERE lower(n.nev1)='anna' OR lower(n.nev2)='anna' OR lower(n.nev3)='anna')
    THEN '✅ (nevnap-katalógusban van Anna)' ELSE '⚠️ a nevnap tábla üres vagy nincs benne Anna' END
) y ORDER BY sorrend;
