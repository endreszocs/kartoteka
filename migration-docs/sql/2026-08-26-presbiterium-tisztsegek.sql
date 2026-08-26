-- ============================================================================
-- PRESBITÉRIUM + TISZTSÉGEK + NAPTÁR-PUBLIKÁLÁS (2026-08-26, 5. kör)
--
-- MIT AD:
--   1. presbiter tábla bővítése: fokozat (teljes/pot/tiszteletbeli), funkcio
--      (fogondnok/gondnok — CSAK teljes értékű presbiternek), mandátum
--      (kezdete/vege), egyseg_id (társegyházközség egyházrésze), publikus,
--      megjegyzes + egyszeri, őrzött backfill a szabadszöveges tisztseg-ből.
--   2. ÚJ tisztsegek tábla a NEM-presbiteri tisztségeknek (kántor, diakónus,
--      nőszövetségi/IKE-elnök, önkéntes, bizottsági tag, egyházmegyei küldött)
--      — RLS-sel, kereszt-gyülekezeti integritás-őrrel, mentés-besorolással.
--   3. congregations.presbiteri_ciklus_ev (alap 3 év — Erdély) +
--      calendar_feed_reszletes (a naptár-feed alapból megjegyzés NÉLKÜL megy).
--   4. szemely.nev_publikalas_consent (+_at) — GDPR 9. cikk: a tisztség
--      vallási meggyőződésre utaló adat, a weboldal-publikálás jogalapja a
--      hozzájárulás.
--   5. gyulekezeti_programok.publikus + ismetlodes_vege + 'evi' ismétlődés.
--   6. public_sites.show_tisztsegek + show_events kapcsolók.
--   7. public_site_stats: a presbiter-darabszám mostantól CSAK az aktív,
--      teljes értékű presbitereket számolja (marker V3).
--   8. ÚJ publikus RPC-k (anon, SECURITY DEFINER, whitelist-minta):
--      public_site_tisztsegek(slug), public_site_events(slug) — a kapu
--      (publikus + aktív + hozzájárulás) az RPC WHERE-ágában él, nem a UI-ban.
--   9. tagnyilvantartas_tag_torles RPC: a tisztsegek-sorok is törlődnek a
--      személlyel (előtte fail-closed ujjlenyomat-ellenőrzés).
--  10. szemely_kapcsolat_lista katalógus: új 'tisztsegek' sor.
--
-- FUTTATÁS: Supabase SQL editor, EGYBEN. Idempotens: többszöri futtatás
-- ártalmatlan (a backfill első-futás-őrrel védett). NINCS TEMP tábla.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0. ELŐFELTÉTEL-ELLENŐRZÉS (fail-closed): a törlő-RPC a várt állapotban van?
--    Ha a marker vagy a törzs nem az elvárt, ITT ÁLLUNK MEG — nem írunk felül
--    ismeretlen függvényt (az őr maga a 2026-07-17-es kompat-minta követése).
-- ─────────────────────────────────────────────────────────────────────────
DO $elofeltetel$
DECLARE
  v_comment text;
  v_src text;
BEGIN
  IF to_regprocedure('public.tagnyilvantartas_tag_torles(integer)') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL-HIBA: a tagnyilvantartas_tag_torles(integer) nem létezik — előbb a 2026-06-10-es tagnyilvántartás-biztonsági migrációnak kell lefutnia.';
  END IF;
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.tagnyilvantartas_tag_torles(integer)');
  v_comment := COALESCE(obj_description(to_regprocedure('public.tagnyilvantartas_tag_torles(integer)'), 'pg_proc'), '(nincs komment)');

  -- Már frissítve (idempotens újrafutás) -> rendben.
  IF v_src LIKE '%DELETE FROM public.tisztsegek%' THEN
    RETURN;
  END IF;

  -- 1. ismert világ: a member-portál kompat változat (2026-07-17, marker V1).
  IF v_comment = 'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'
     AND v_src LIKE '%member_person_links%'
     AND v_src LIKE '%DELETE FROM public.presbiter%'
     AND v_src LIKE '%hidden_fk%' THEN
    RETURN;
  END IF;

  -- 2. ismert világ: az EREDETI (2026-06-10) változat — a member-portál lánc
  --    élesben nem futott le (a „migration-fájl nem bizonyíték" hibaosztály).
  IF v_src NOT LIKE '%member_person_links%'
     AND v_src LIKE '%DELETE FROM public.presbiter%'
     AND v_src LIKE '%hidden_fk%'
     AND v_src LIKE '%foreign_key_violation%'
     AND v_src LIKE '%hidden_registry%' THEN
    RETURN;
  END IF;

  -- Ismeretlen állapot -> fail-closed, BEÉPÍTETT diagnózissal.
  RAISE EXCEPTION 'ELŐFELTÉTEL-HIBA: a tagnyilvantartas_tag_torles törzse egyik ismert változattal sem egyezik — kézi ellenőrzés kell a felülírás előtt. Diagnózis: komment=% | prosrc-md5=% | hossz=% | member_person_links=% | presbiter-törlés=%',
    v_comment, md5(v_src), length(v_src),
    (v_src LIKE '%member_person_links%'),
    (v_src LIKE '%DELETE FROM public.presbiter%');
END
$elofeltetel$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. presbiter tábla bővítése
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS fokozat text NOT NULL DEFAULT 'teljes';
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS funkcio text;
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS kezdete date;
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS vege date;
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS egyseg_id uuid;
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS publikus boolean NOT NULL DEFAULT false;
ALTER TABLE public.presbiter ADD COLUMN IF NOT EXISTS megjegyzes text;

-- CHECK-ek drop+add párossal (idempotens, definíció-változást is átvisz).
ALTER TABLE public.presbiter DROP CONSTRAINT IF EXISTS presbiter_fokozat_check;
ALTER TABLE public.presbiter ADD CONSTRAINT presbiter_fokozat_check
  CHECK (fokozat IN ('teljes', 'pot', 'tiszteletbeli'));

ALTER TABLE public.presbiter DROP CONSTRAINT IF EXISTS presbiter_funkcio_check;
ALTER TABLE public.presbiter ADD CONSTRAINT presbiter_funkcio_check
  CHECK (funkcio IS NULL OR funkcio IN ('fogondnok', 'gondnok'));

-- Egyházjogi őr: gondnok/főgondnok CSAK teljes értékű presbiter lehet.
ALTER TABLE public.presbiter DROP CONSTRAINT IF EXISTS presbiter_funkcio_fokozat_check;
ALTER TABLE public.presbiter ADD CONSTRAINT presbiter_funkcio_fokozat_check
  CHECK (funkcio IS NULL OR fokozat = 'teljes');

-- Mandátum-ésszerűség: a vége nem előzheti meg a kezdetét.
ALTER TABLE public.presbiter DROP CONSTRAINT IF EXISTS presbiter_mandatum_check;
ALTER TABLE public.presbiter ADD CONSTRAINT presbiter_mandatum_check
  CHECK (kezdete IS NULL OR vege IS NULL OR vege >= kezdete);

-- Egység-FK (társegyházközség egyházrésze) — törléskor a jelölés lenullázódik.
DO $egyseg_fk$
BEGIN
  IF to_regclass('public.gyulekezeti_egysegek') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'presbiter_egyseg_id_fkey'
         AND conrelid = 'public.presbiter'::regclass
     ) THEN
    ALTER TABLE public.presbiter
      ADD CONSTRAINT presbiter_egyseg_id_fkey
      FOREIGN KEY (egyseg_id) REFERENCES public.gyulekezeti_egysegek(id)
      ON DELETE SET NULL;
  END IF;
END
$egyseg_fk$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1/b. EGYSZERI backfill a szabadszöveges tisztseg-ből — első-futás-őrrel:
--      csak addig fut, amíg SENKINEK nincs kézzel állított fokozat/funkció/
--      mandátum adata (különben az admin auditált döntését írná felül).
--      SORREND (LIKE-csapda hibaosztály!): a hosszabb minta ELŐBB —
--      főgondnok → pótpresbiter → gondnok. Ékezetes ÉS ékezet nélküli alak.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.presbiter
   SET funkcio = 'fogondnok'
 WHERE (tisztseg ILIKE '%főgondnok%' OR tisztseg ILIKE '%fogondnok%')
   AND NOT EXISTS (SELECT 1 FROM public.presbiter x
                   WHERE x.fokozat <> 'teljes' OR x.funkcio IS NOT NULL
                      OR x.kezdete IS NOT NULL OR x.vege IS NOT NULL);

UPDATE public.presbiter
   SET fokozat = 'pot'
 WHERE (tisztseg ILIKE '%pótpresbiter%' OR tisztseg ILIKE '%potpresbiter%'
        OR tisztseg ILIKE '%pót presbiter%' OR tisztseg ILIKE '%pot presbiter%')
   AND funkcio IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.presbiter x
                   WHERE x.fokozat <> 'teljes'
                      OR x.kezdete IS NOT NULL OR x.vege IS NOT NULL);

UPDATE public.presbiter
   SET funkcio = 'gondnok'
 WHERE tisztseg ILIKE '%gondnok%'
   AND funkcio IS NULL
   AND fokozat = 'teljes'
   AND NOT EXISTS (SELECT 1 FROM public.presbiter x
                   WHERE x.fokozat = 'pot' AND x.funkcio IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.presbiter x
                   WHERE x.kezdete IS NOT NULL OR x.vege IS NOT NULL);

UPDATE public.presbiter
   SET fokozat = 'tiszteletbeli'
 WHERE (tisztseg ILIKE '%tiszteletbeli%' OR tisztseg ILIKE '%tb. presbiter%')
   AND funkcio IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.presbiter x
                   WHERE x.kezdete IS NOT NULL OR x.vege IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ÚJ tábla: tisztsegek (nem-presbiteri gyülekezeti tisztségek)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tisztsegek (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  id_szemely integer NOT NULL REFERENCES public.szemely(id),
  tipus text NOT NULL CHECK (tipus IN (
    'kantor', 'diakonus', 'noszovetsegi_elnok', 'ike_elnok', 'onkentes',
    'bizottsagi_tag', 'egyhazmegyei_kuldott', 'egyeb'
  )),
  -- Bizottság: szándékosan NEM DB-CHECK (a 4. bizottság UI-bővítés legyen,
  -- ne constraint-migráció) — a kódlista a felületen él.
  bizottsag varchar,
  bizottsagi_szerep text CHECK (bizottsagi_szerep IS NULL OR bizottsagi_szerep IN ('elnok', 'tag')),
  jelleg text CHECK (jelleg IS NULL OR jelleg IN ('hivatasos', 'onkentes')),
  egyeb_megnevezes varchar,
  egyseg_id uuid REFERENCES public.gyulekezeti_egysegek(id) ON DELETE SET NULL,
  kezdete date,
  vege date,
  publikus boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0,
  CONSTRAINT tisztsegek_bizottsag_tipus_check
    CHECK (bizottsag IS NULL OR tipus = 'bizottsagi_tag'),
  CONSTRAINT tisztsegek_bizottsag_kotelezo_check
    CHECK (tipus <> 'bizottsagi_tag' OR bizottsag IS NOT NULL),
  CONSTRAINT tisztsegek_jelleg_tipus_check
    CHECK (jelleg IS NULL OR tipus = 'kantor'),
  CONSTRAINT tisztsegek_egyeb_check
    CHECK (egyeb_megnevezes IS NULL OR tipus = 'egyeb'),
  CONSTRAINT tisztsegek_mandatum_check
    CHECK (kezdete IS NULL OR vege IS NULL OR vege >= kezdete)
);

CREATE INDEX IF NOT EXISTS idx_tisztsegek_congregation
  ON public.tisztsegek (congregation_id);
CREATE INDEX IF NOT EXISTS idx_tisztsegek_szemely
  ON public.tisztsegek (id_szemely);

-- Kereszt-gyülekezeti integritás-őr: a congregation_id-t a személyből töltjük,
-- és ELTÉRÉSNÉL HIBÁT DOBUNK — a publikus RPC (SECURITY DEFINER) miatt egy
-- inkonzisztens sor idegen gyülekezet nevét tehetné ki egy másik oldalára.
CREATE OR REPLACE FUNCTION public.tisztsegek_set_congregation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_szemely_cong uuid;
BEGIN
  SELECT s.congregation_id INTO v_szemely_cong
  FROM public.szemely s WHERE s.id = NEW.id_szemely;
  IF v_szemely_cong IS NULL THEN
    RAISE EXCEPTION 'A kiválasztott személynek nincs gyülekezete — tisztség nem rögzíthető.';
  END IF;
  IF NEW.congregation_id IS NULL THEN
    NEW.congregation_id := v_szemely_cong;
  ELSIF NEW.congregation_id <> v_szemely_cong THEN
    RAISE EXCEPTION 'A tisztség gyülekezete (%) nem egyezik a személy gyülekezetével (%) — a sor nem menthető.',
      NEW.congregation_id, v_szemely_cong;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tisztsegek_set_congregation ON public.tisztsegek;
CREATE TRIGGER trg_tisztsegek_set_congregation
  BEFORE INSERT OR UPDATE ON public.tisztsegek
  FOR EACH ROW EXECUTE FUNCTION public.tisztsegek_set_congregation();

-- RLS a presbiter-tábla mintájára (congregation-scoped, 4 policy).
ALTER TABLE public.tisztsegek ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tisztsegek TO authenticated;
REVOKE ALL ON public.tisztsegek FROM anon;

DROP POLICY IF EXISTS tisztsegek_select ON public.tisztsegek;
CREATE POLICY tisztsegek_select ON public.tisztsegek
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS tisztsegek_insert ON public.tisztsegek;
CREATE POLICY tisztsegek_insert ON public.tisztsegek
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS tisztsegek_update ON public.tisztsegek;
CREATE POLICY tisztsegek_update ON public.tisztsegek
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS tisztsegek_delete ON public.tisztsegek;
CREATE POLICY tisztsegek_delete ON public.tisztsegek
  FOR DELETE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- Mentés-besorolás UGYANEBBEN a fájlban (besorolatlan tábla = az éjszakai
-- mentés hangos leállása). Réteg 4: a szemely (3) után — FK hivatkozik rá.
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
VALUES
  ('tisztsegek', 'gyulekezet', 4, true,
   '2026-08-26: nem-presbiteri gyülekezeti tisztségek (kántor, bizottsági tagok stb.). FK a szemely (réteg 3) és gyulekezeti_egysegek (réteg 2) felé → utánuk állítandó vissza.')
ON CONFLICT (tabla) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Beállítások: ciklus-hossz + naptár-feed részletesség
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS presbiteri_ciklus_ev integer NOT NULL DEFAULT 3;
ALTER TABLE public.congregations DROP CONSTRAINT IF EXISTS congregations_presbiteri_ciklus_check;
ALTER TABLE public.congregations ADD CONSTRAINT congregations_presbiteri_ciklus_check
  CHECK (presbiteri_ciklus_ev BETWEEN 1 AND 12);

-- A naptár-feed (ICS token) alapból MEGJEGYZÉS NÉLKÜL megy ki — a lelkészi
-- jegyzet lelkigondozói adatot hordozhat, és a feed külső naptárszolgáltatóra
-- szinkronizálódik. A teljes tartalom tudatos opt-in.
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS calendar_feed_reszletes boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. szemely: név-publikálási hozzájárulás (GDPR 9. cikk — igazolhatóan)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS nev_publikalas_consent boolean;
ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS nev_publikalas_consent_at timestamp with time zone;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. gyulekezeti_programok: publikálás + ismétlődés-vége + 'evi' típus
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.gyulekezeti_programok
  ADD COLUMN IF NOT EXISTS publikus boolean NOT NULL DEFAULT false;
ALTER TABLE public.gyulekezeti_programok
  ADD COLUMN IF NOT EXISTS ismetlodes_vege date;

-- Az ismetlodes_tipus CHECK bővítése 'evi'-vel — a constraintet CONKEY szerint
-- célozzuk (a pg_get_constraintdef LIKE-keresés MÁS constraintet dobhatna el —
-- ismert hibaosztály).
DO $ismetlodes_check$
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
        AND a.attname = 'ismetlodes_tipus'
    )]::int2[];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gyulekezeti_programok DROP CONSTRAINT %I', v_name);
  END IF;
END
$ismetlodes_check$;

ALTER TABLE public.gyulekezeti_programok
  ADD CONSTRAINT gyulekezeti_programok_ismetlodes_tipus_check
  CHECK (ismetlodes_tipus IS NULL OR ismetlodes_tipus IN ('heti', 'ketheti', 'havi', 'evi'));

-- ─────────────────────────────────────────────────────────────────────────
-- 6. public_sites: szekció-kapcsolók
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.public_sites
  ADD COLUMN IF NOT EXISTS show_tisztsegek boolean NOT NULL DEFAULT false;
ALTER TABLE public.public_sites
  ADD COLUMN IF NOT EXISTS show_events boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. public_site_stats — a presbiter-darabszám CSAK aktív + teljes értékű
--    (marker: V3). A teljes törzs az eredeti V2-ből, a szűrés-bővítéssel.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_site_stats(p_slug text)
RETURNS TABLE (
  member_count bigint,
  presbyter_count bigint,
  family_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN ps.show_member_count THEN
        COALESCE(
          ps.override_member_count::bigint,
          (
            SELECT pg_catalog.count(*)::bigint
            FROM public.szemely s
            WHERE s.congregation_id = ps.congregation_id
              AND s.isvisible = true
              AND s.meghalt = false
              AND COALESCE(s.member_status, '') NOT IN (
                'elhunyt', 'elköltözött', 'elkoltozott',
                'kitért', 'kitert', 'törölt'
              )
          )
        )
      ELSE NULL
    END AS member_count,
    CASE
      WHEN ps.show_presbyter_count THEN
        COALESCE(
          ps.override_presbyter_count::bigint,
          (
            SELECT pg_catalog.count(*)::bigint
            FROM public.presbiter p
            WHERE p.congregation_id = ps.congregation_id
              -- 2026-08-26 (5. kor): CSAK az aktiv, teljes erteku presbiterek
              AND COALESCE(p.fokozat, 'teljes') = 'teljes'
              AND (p.kezdete IS NULL OR p.kezdete <= current_date)
              AND (p.vege IS NULL OR p.vege >= current_date)
          )
        )
      ELSE NULL
    END AS presbyter_count,
    CASE
      WHEN ps.show_family_count THEN
        COALESCE(
          ps.override_family_count::bigint,
          (
            SELECT pg_catalog.count(*)::bigint
            FROM public.haztartas h
            WHERE h.congregation_id = ps.congregation_id
              AND h.isaktiv = true
              AND h.ervenyes_ig IS NULL
          )
        )
      ELSE NULL
    END AS family_count
  FROM public.public_sites ps
  WHERE ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    AND ps.is_published = true
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      WHERE c.id = ps.congregation_id
        AND c.status = 'active'
        AND c.public_site_enabled = true
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.public_site_stats(text) IS
  'KARTOTEKA_PUBLIC_SITE_STATS_V3';

-- (jogosultsagok: a 8/c szakasz szerep-tolerans ACL-blokkja allitja be)

-- ─────────────────────────────────────────────────────────────────────────
-- 8/a. ÚJ publikus RPC: tisztségviselők a weboldalra.
--      A KAPU ITT ÉL: publikus jelölés + aktív mandátum + SZEMÉLYES
--      HOZZÁJÁRULÁS + látható, élő személy + gyülekezet-egyezés. A kimenet
--      minimalizált: (kod, nev) — semmi más nem megy ki.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_site_tisztsegek(p_slug text)
RETURNS TABLE (
  kod text,
  nev text,
  sorrend integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH site AS (
    SELECT ps.congregation_id, ps.show_tisztsegek
    FROM public.public_sites ps
    WHERE ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
      AND ps.is_published = true
      AND EXISTS (
        SELECT 1 FROM public.congregations c
        WHERE c.id = ps.congregation_id
          AND c.status = 'active'
          AND c.public_site_enabled = true
      )
    LIMIT 1
  )
  SELECT t.kod, t.nev, t.sorrend
  FROM (
    SELECT
      CASE
        WHEN p.funkcio = 'fogondnok' THEN 'fogondnok'
        WHEN p.funkcio = 'gondnok' THEN 'gondnok'
        WHEN p.fokozat = 'pot' THEN 'potpresbiter'
        WHEN p.fokozat = 'tiszteletbeli' THEN 'tiszteletbeli_presbiter'
        ELSE 'presbiter'
      END AS kod,
      pg_catalog.btrim(pg_catalog.concat(s.csaladnev, ' ', s.k_nev)) AS nev,
      CASE
        WHEN p.funkcio = 'fogondnok' THEN 1
        WHEN p.funkcio = 'gondnok' THEN 2
        WHEN p.fokozat = 'pot' THEN 4
        WHEN p.fokozat = 'tiszteletbeli' THEN 5
        ELSE 3
      END AS sorrend
    FROM public.presbiter p
    JOIN site ON site.show_tisztsegek = true
    JOIN public.szemely s
      ON s.id = p.id_szemely
     AND s.congregation_id = site.congregation_id
    WHERE p.congregation_id = site.congregation_id
      AND p.publikus = true
      AND (p.kezdete IS NULL OR p.kezdete <= current_date)
      AND (p.vege IS NULL OR p.vege >= current_date)
      AND s.nev_publikalas_consent = true
      AND s.isvisible = true
      AND s.meghalt = false
    UNION ALL
    SELECT
      CASE
        WHEN t.tipus = 'bizottsagi_tag' THEN
          pg_catalog.concat(t.bizottsag, '_bizottsag_', COALESCE(t.bizottsagi_szerep, 'tag'))
        ELSE t.tipus
      END AS kod,
      pg_catalog.btrim(pg_catalog.concat(s.csaladnev, ' ', s.k_nev)) AS nev,
      CASE
        WHEN t.tipus = 'kantor' THEN 6
        WHEN t.tipus = 'diakonus' THEN 7
        WHEN t.tipus = 'noszovetsegi_elnok' THEN 8
        WHEN t.tipus = 'ike_elnok' THEN 9
        WHEN t.tipus = 'bizottsagi_tag' THEN 10
        WHEN t.tipus = 'egyhazmegyei_kuldott' THEN 11
        ELSE 12
      END AS sorrend
    FROM public.tisztsegek t
    JOIN site ON site.show_tisztsegek = true
    JOIN public.szemely s
      ON s.id = t.id_szemely
     AND s.congregation_id = site.congregation_id
    WHERE t.congregation_id = site.congregation_id
      AND t.publikus = true
      AND t.is_deleted = false
      AND (t.kezdete IS NULL OR t.kezdete <= current_date)
      AND (t.vege IS NULL OR t.vege >= current_date)
      AND s.nev_publikalas_consent = true
      AND s.isvisible = true
      AND s.meghalt = false
  ) t
  ORDER BY t.sorrend, t.nev
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.public_site_tisztsegek(text) IS
  'KARTOTEKA_PUBLIC_SITE_TISZTSEGEK_V1';

-- (jogosultsagok: a 8/c szakasz szerep-tolerans ACL-blokkja allitja be)

-- ─────────────────────────────────────────────────────────────────────────
-- 8/b. ÚJ publikus RPC: közelgő PUBLIKUS események a weboldalra.
--      Kimenet minimalizálva: cím/dátumok/idő/helyszín/típus — a leiras és a
--      megjegyzes SOHA nem megy ki. Ismétlődő sorozat alapsora is jöhet
--      (a kibontást a szerver-oldali betöltő végzi), ezért a sorozatokra a
--      dátum-ablak tágabb; minden ágon LIMIT.
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
  'KARTOTEKA_PUBLIC_SITE_EVENTS_V1';

-- (jogosultsagok: a 8/c szakasz szerep-tolerans ACL-blokkja allitja be)

-- ─────────────────────────────────────────────────────────────────────
-- 8/c. A publikus RPC-k jogosultságai — SZEREP-TOLERÁNSAN (2026-08-26 v3).
--      Az app_staff_user / app_pending_user / member_portal_user egyéni
--      szerepkörök a member-portál lánc részei, amely ÉLESBEN NEM FUTOTT LE
--      (42704 — élesben elsült) — róluk CSAK akkor vonunk vissza, ha
--      léteznek. A standard szerepekről (PUBLIC/anon/authenticated/
--      service_role) mindig; EXECUTE kizárólag az anon-nak jár vissza.
-- ─────────────────────────────────────────────────────────────────────
DO $publikus_acl$
DECLARE
  v_fn text;
  v_role text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.public_site_stats(text)',
    'public.public_site_tisztsegek(text)',
    'public.public_site_events(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_fn);
    FOREACH v_role IN ARRAY ARRAY['app_staff_user', 'app_pending_user', 'member_portal_user'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_fn, v_role);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_fn);
  END LOOP;
END
$publikus_acl$;


-- ─────────────────────────────────────────────────────────────────────
-- 9. tagnyilvantartas_tag_torles — a tisztsegek-sorok is a személlyel mennek.
--    ÖNADAPTÍV (2026-08-26 v2): az élő függvény KÉT ismert változata közül a
--    megfelelőt bővítjük — (a) a member-portál kompat változat (2026-07-17,
--    marker V1), VAGY (b) az EREDETI 2026-06-10-es változat, ha a member-portál
--    lánc élesben nem futott le. Mindkét ágon a törzs BÁJTRA a forrás-fájlból
--    származik, EGYETLEN új sorral (tisztsegek-DELETE a presbiter-törlés
--    előtt). Ismeretlen állapotot a 0. szakasz előfeltétel-őre fogott meg.
-- ─────────────────────────────────────────────────────────────────────
DO $tagtorles_frissites$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.tagnyilvantartas_tag_torles(integer)');

  IF v_src LIKE '%DELETE FROM public.tisztsegek%' THEN
    RETURN; -- már frissítve (idempotens)
  END IF;

  IF v_src LIKE '%member_person_links%' THEN
    -- (a) member-portál kompat változat -> annak bővített törzse.
    EXECUTE $compat_uj$
CREATE OR REPLACE FUNCTION public.tagnyilvantartas_tag_torles(
  p_szemely_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cong uuid;
  v_member_account_id uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF p_szemely_id IS NULL THEN
    RAISE EXCEPTION 'A szemelyazonosito kotelezo'
      USING ERRCODE = '22023';
  END IF;

  -- Jogosultsaghoz eloszor csak zar nelkuli tenant-olvasas. A szemely row lock
  -- kesobb, az account es link zarak utan jon; utana mindent ujraellenorzunk.
  SELECT s.congregation_id
    INTO v_cong
    FROM public.szemely s
   WHERE s.id = p_szemely_id;

  IF NOT FOUND OR v_cong IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF public.current_user_can_access_congregation(v_cong)
       IS DISTINCT FROM true THEN
    RETURN pg_catalog.jsonb_build_object('status', 'forbidden');
  END IF;

  -- Minden historikus account kulcsa determinisztikus sorrendben. Igy tobb
  -- korabbi revoked link eseten sincs account-account deadlock.
  FOR v_member_account_id IN
    SELECT DISTINCT l.member_account_id
    FROM public.member_person_links l
    WHERE l.person_id = p_szemely_id
    ORDER BY l.member_account_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-account:' || v_member_account_id::text,
        0
      )
    );
  END LOOP;

  -- Kotelezo zarsorrend: account -> link -> person.
  PERFORM ma.id
    FROM public.member_accounts ma
   WHERE EXISTS (
     SELECT 1
     FROM public.member_person_links l
     WHERE l.member_account_id = ma.id
       AND l.person_id = p_szemely_id
   )
   ORDER BY ma.id
   FOR UPDATE OF ma;

  PERFORM l.id
    FROM public.member_person_links l
   WHERE l.person_id = p_szemely_id
   ORDER BY l.member_account_id, l.id
   FOR UPDATE OF l;

  SELECT s.congregation_id
    INTO v_cong
    FROM public.szemely s
   WHERE s.id = p_szemely_id
   FOR UPDATE;

  IF NOT FOUND OR v_cong IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF public.current_user_can_access_congregation(v_cong)
       IS DISTINCT FROM true THEN
    RETURN pg_catalog.jsonb_build_object('status', 'forbidden');
  END IF;

  -- Barmilyen member_person_links history eseten nincs fizikai DELETE. Az elo
  -- linket elobb revoked-re valtjuk fix, PII-mentes technikai indokkal; a core
  -- audittrigger naplozza a statuszvaltast. A fiok es a linkhistory megmarad.
  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.person_id = p_szemely_id
  ) THEN
    UPDATE public.member_person_links l
       SET status = 'revoked',
           status_message = 'legacy_member_delete_soft_hide',
           revoked_at = v_now
     WHERE l.person_id = p_szemely_id
       AND l.status IN ('active', 'suspended');

    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;

    -- A regi frontend a hidden_fk statuszt mar helyesen, kapcsolodo rekord miatti
    -- soft-hide-kent jeleniti meg; igy nincs UI breaking valtozas.
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_fk');
  END IF;

  -- Portal-history nelkul valtozatlan live uzleti logika kovetkezik.
  IF EXISTS (
    SELECT 1
    FROM public.befizetes b
    WHERE b.id_szemely = p_szemely_id
      AND b.congregation_id = v_cong
      AND b.deleted IS DISTINCT FROM true
  ) THEN
    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_payments');
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.keresztseg k
       WHERE k.id_szemely = p_szemely_id
     )
     OR EXISTS (
       SELECT 1 FROM public.konfirmalas k
       WHERE k.id_szemely = p_szemely_id
     )
     OR EXISTS (
       SELECT 1 FROM public.hazassag h
       WHERE h.id_ferfi = p_szemely_id OR h.id_no = p_szemely_id
     )
     OR EXISTS (
       SELECT 1 FROM public.temetes t
       WHERE t.id_szemely = p_szemely_id
     ) THEN
    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_registry');
  END IF;

  BEGIN
    DELETE FROM public.member_transfer_notifications mtn
     WHERE mtn.szemely_id = p_szemely_id;
    DELETE FROM public.bekoltozott b WHERE b.id_szemely = p_szemely_id;
    DELETE FROM public.elkoltozott e WHERE e.id_szemely = p_szemely_id;
    DELETE FROM public.attert a WHERE a.id_szemely = p_szemely_id;
    DELETE FROM public.kitert k WHERE k.id_szemely = p_szemely_id;
    DELETE FROM public.felmentes f WHERE f.id_szemely = p_szemely_id;
    DELETE FROM public.gyerek g WHERE g.id_szemely = p_szemely_id;
    -- 2026-08-26 (5. kor): a nem-presbiteri tisztsegek is a szemellyel mennek.
    DELETE FROM public.tisztsegek t WHERE t.id_szemely = p_szemely_id;
    DELETE FROM public.presbiter p WHERE p.id_szemely = p_szemely_id;
    DELETE FROM public.szemely s WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'deleted');
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.szemely s
       SET isvisible = false,
           member_status = 'törölt'
     WHERE s.id = p_szemely_id;
    RETURN pg_catalog.jsonb_build_object('status', 'hidden_fk');
  END;
END;
$function$;
$compat_uj$;
    EXECUTE $cm$COMMENT ON FUNCTION public.tagnyilvantartas_tag_torles(integer) IS 'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'$cm$;
  ELSE
    -- (b) eredeti 2026-06-10-es változat -> annak bővített törzse. A marker
    -- SZÁNDÉKOSAN nem a kompat V1 (az hazudná, hogy a member-portál lánc
    -- lefutott) — saját, felismerhető jelölést kap.
    EXECUTE $legacy_uj$
CREATE OR REPLACE FUNCTION public.tagnyilvantartas_tag_torles(p_szemely_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cong uuid;
BEGIN
  -- 1) Tulajdonjog: létezik-e a személy, és hozzáfér-e a hívó a gyülekezetéhez
  SELECT congregation_id INTO v_cong
  FROM public.szemely WHERE id = p_szemely_id;

  IF NOT FOUND OR v_cong IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF NOT public.current_user_can_access_congregation(v_cong) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- 2) Pénzügyi védelem (deleted=false VAGY NULL számít élőnek)
  IF EXISTS (
    SELECT 1 FROM public.befizetes
    WHERE id_szemely = p_szemely_id
      AND congregation_id = v_cong
      AND deleted IS DISTINCT FROM true
  ) THEN
    UPDATE public.szemely SET isvisible = false, member_status = 'törölt'
    WHERE id = p_szemely_id;
    RETURN jsonb_build_object('status', 'hidden_payments');
  END IF;

  -- 3) Anyakönyvi védelem (P0-3): anyakönyvi bejegyzés nem semmisülhet meg
  IF EXISTS (SELECT 1 FROM public.keresztseg  WHERE id_szemely = p_szemely_id)
     OR EXISTS (SELECT 1 FROM public.konfirmalas WHERE id_szemely = p_szemely_id)
     OR EXISTS (SELECT 1 FROM public.hazassag WHERE id_ferfi = p_szemely_id OR id_no = p_szemely_id)
     OR EXISTS (SELECT 1 FROM public.temetes  WHERE id_szemely = p_szemely_id)
  THEN
    UPDATE public.szemely SET isvisible = false, member_status = 'törölt'
    WHERE id = p_szemely_id;
    RETURN jsonb_build_object('status', 'hidden_registry');
  END IF;

  -- 4) Atomikus törlés (a belső blokk hibája MINDENT visszagörget)
  BEGIN
    -- szemely_id-re FK-zik cascade nélkül → explicit törlés
    DELETE FROM public.member_transfer_notifications WHERE szemely_id = p_szemely_id;
    DELETE FROM public.bekoltozott WHERE id_szemely = p_szemely_id;
    DELETE FROM public.elkoltozott WHERE id_szemely = p_szemely_id;
    DELETE FROM public.attert      WHERE id_szemely = p_szemely_id;
    DELETE FROM public.kitert      WHERE id_szemely = p_szemely_id;
    DELETE FROM public.felmentes   WHERE id_szemely = p_szemely_id;
    DELETE FROM public.gyerek      WHERE id_szemely = p_szemely_id;
    -- 2026-08-26 (5. kor): a nem-presbiteri tisztsegek is a szemellyel mennek.
    DELETE FROM public.tisztsegek WHERE id_szemely = p_szemely_id;
    DELETE FROM public.presbiter   WHERE id_szemely = p_szemely_id;
    -- haztartas_tag, szemely_kapcsolat, member_validation_errors: CASCADE
    DELETE FROM public.szemely WHERE id = p_szemely_id;
    RETURN jsonb_build_object('status', 'deleted');
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.szemely SET isvisible = false, member_status = 'törölt'
    WHERE id = p_szemely_id;
    RETURN jsonb_build_object('status', 'hidden_fk');
  END;
END;
$$;
$legacy_uj$;
    EXECUTE $cm$COMMENT ON FUNCTION public.tagnyilvantartas_tag_torles(integer) IS 'KARTOTEKA_TAG_TORLES_LEGACY_TISZTSEGEK_V1'$cm$;
  END IF;
END
$tagtorles_frissites$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. szemely_kapcsolat_lista — a katalógus új 'tisztsegek' sora (a függvény
--     saját kommentje mondja ki: „Új szemely-FK-nál IDE is fel kell venni!").
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.szemely_kapcsolat_lista(p_szemely_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- (kulcs, cimke, tabla, feltetel, mod) — a feltétel $1 = szemely.id,
  -- $2 = szemely.cnp. mod: 'blokkolo' → elrejtés | 'vele' → a törléssel
  -- együtt eltűnik/nullázódik (tájékoztató).
  katalogus text[][] := ARRAY[
    -- BLOKKOLÓ kapcsolatok (bármelyik > 0 → nincs fizikai törlés)
    ARRAY['befizetes_elo',    'Befizetés',                                'befizetes',        'id_szemely = $1 AND deleted IS DISTINCT FROM true', 'blokkolo'],
    ARRAY['befizetes_kuka',   'Befizetés a kukában',                      'befizetes',        'id_szemely = $1 AND deleted = true',                'blokkolo'],
    ARRAY['kiadas_atvevo',    'Kiadás (átvevőként)',                      'kiadas',           'atvevoid = $1',                                     'blokkolo'],
    ARRAY['keresztseg',       'Keresztelési anyakönyv',                   'keresztseg',       'id_szemely = $1',                                   'blokkolo'],
    ARRAY['konfirmalas',      'Konfirmációi anyakönyv',                   'konfirmalas',      'id_szemely = $1',                                   'blokkolo'],
    ARRAY['hazassag',         'Házassági anyakönyv',                      'hazassag',         'id_ferfi = $1 OR id_no = $1',                       'blokkolo'],
    ARRAY['temetes',          'Temetési anyakönyv',                       'temetes',          'id_szemely = $1',                                   'blokkolo'],
    ARRAY['csalad',           'Családi karton (házastársként)',           'csalad',           'id_ferfi = $1 OR id_no = $1',                       'blokkolo'],
    ARRAY['sirhelyberles',    'Sírhelybérlés (bérlőként)',                'sirhelyberles',    'berloid = $1',                                      'blokkolo'],
    ARRAY['sirhelyelhunyt',   'Sírhely-nyilvántartás (elhunytként)',      'sirhelyelhunyt',   'id_szemely = $1',                                   'blokkolo'],
    ARRAY['leltar_felelos',   'Leltári tétel (felelősként)',              'leltar_tetelek',   'felelos_szemely_id = $1',                           'blokkolo'],
    ARRAY['berleti_szerzodes','Bérleti szerződés',                        'berleti_szerzodes','id_szemely = $1',                                   'blokkolo'],
    ARRAY['szulo_lanc',       'Szülőként hivatkozik rá másik személy',    'szemely',          'id <> $1 AND (id_apja = $2 OR id_anyja = $2)',      'blokkolo'],
    ARRAY['portal_link',      'Aktív tagi portál összekötés',             'member_person_links',           'person_id = $1 OR live_person_id = $1','blokkolo'],
    ARRAY['portal_kerelem',   'Tagi portál módosítási kérelem',           'member_person_change_requests', 'person_id = $1',                       'blokkolo'],
    -- VELE TÖRLŐDŐ kapcsolatok (a törlő RPC explicit vagy CASCADE viszi)
    ARRAY['gyerek',           'Gyermek-bejegyzés',                        'gyerek',           'id_szemely = $1',                                   'vele'],
    ARRAY['presbiter',        'Presbiteri tisztség',                      'presbiter',        'id_szemely = $1',                                   'vele'],
    ARRAY['tisztsegek',       'Gyülekezeti tisztség (kántor, bizottsági tag stb.)', 'tisztsegek',      'id_szemely = $1',                                   'vele'],
    ARRAY['felmentes',        'Járulék-felmentés',                        'felmentes',        'id_szemely = $1',                                   'vele'],
    ARRAY['haztartas_tag',    'Háztartás-tagság',                         'haztartas_tag',    'id_szemely = $1',                                   'vele'],
    ARRAY['szemely_kapcsolat','Rögzített személyi kapcsolat',             'szemely_kapcsolat','id_szemely_1 = $1 OR id_szemely_2 = $1',            'vele'],
    ARRAY['bekoltozott',      'Beköltözési előzmény',                     'bekoltozott',      'id_szemely = $1',                                   'vele'],
    ARRAY['elkoltozott',      'Elköltözési előzmény',                     'elkoltozott',      'id_szemely = $1',                                   'vele'],
    ARRAY['attert',           'Áttérési előzmény',                        'attert',           'id_szemely = $1',                                   'vele'],
    ARRAY['kitert',           'Kitérési előzmény',                        'kitert',           'id_szemely = $1',                                   'vele'],
    ARRAY['transfer_ertesites','Átjelentkezési értesítés',                'member_transfer_notifications', 'szemely_id = $1',                      'vele'],
    ARRAY['validacios_jelzes','Adat-ellenőrzési jelzés',                  'member_validation_errors',      'member_id = $1',                       'vele'],
    -- 2026-08-14 bírálói pótlás: ez a kettő eddig kimaradt — CASCADE ill.
    -- SET NULL, tehát nem blokkolnak, de a teljességi ígéret rájuk is áll.
    ARRAY['gyulkozi_egyezes', 'Gyülekezetközi egyezés-értesítés',         'cross_congregation_match_notifications', 'triggering_szemely_id = $1 OR matched_szemely_id = $1', 'vele'],
    ARRAY['csalad_link_naplo','Család-összekötési napló (a hivatkozás nullázódik)', 'family_link_audit', 'szemely_id = $1',                        'vele']
  ];
  sor         text[];
  v_cnp       text;
  v_darab     bigint;
  v_blokkolo  jsonb := '[]'::jsonb;
  v_vele      jsonb := '[]'::jsonb;
  v_blokk_db  bigint := 0;
  v_vele_db   bigint := 0;
BEGIN
  SELECT NULLIF(trim(cnp), '') INTO v_cnp FROM public.szemely WHERE id = p_szemely_id;

  FOREACH sor SLICE 1 IN ARRAY katalogus LOOP
    -- CNP-lánc: csak akkor értelmezhető, ha a személynek van CNP-je
    IF sor[1] = 'szulo_lanc' AND v_cnp IS NULL THEN
      CONTINUE;
    END IF;
    IF to_regclass('public.' || sor[3]) IS NULL THEN
      CONTINUE; -- a tábla nem létezik → hivatkozás sem lehet
    END IF;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE ', sor[3]) || sor[4]
        INTO v_darab USING p_szemely_id, v_cnp;
    EXCEPTION WHEN undefined_column THEN
      CONTINUE; -- az oszlop nem létezik → FK sincs → hivatkozás sem lehet
    END;
    IF v_darab > 0 THEN
      IF sor[5] = 'blokkolo' THEN
        v_blokkolo := v_blokkolo || jsonb_build_array(
          jsonb_build_object('kulcs', sor[1], 'cimke', sor[2], 'darab', v_darab));
        v_blokk_db := v_blokk_db + v_darab;
      ELSE
        v_vele := v_vele || jsonb_build_array(
          jsonb_build_object('kulcs', sor[1], 'cimke', sor[2], 'darab', v_darab));
        v_vele_db := v_vele_db + v_darab;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'blokkolo', v_blokkolo, 'blokkolo_db', v_blokk_db,
    'vele_torlodik', v_vele, 'vele_db', v_vele_db);
END;
$$;

-- BELSŐ függvény: senki nem hívhatja közvetlenül (az ellenőrző RPC — és a
-- jövőbeli törlő-v3 — a tulajdonos jogán éri el).
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM anon;
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM authenticated;

COMMENT ON FUNCTION public.szemely_kapcsolat_lista(integer) IS
  '2026-08-14 (1. döntés): a személy összes ismert hivatkozásának katalógusa '
  '(blokkoló + vele törlődő). BELSŐ — a szemely_kapcsolatok hívja. '
  'Új szemely-FK-nál IDE is fel kell venni!';

-- A BELSŐ lista-függvényen SENKINEK nincs közvetlen EXECUTE joga (a hívó a
-- szemely_kapcsolatok wrapper) — ha a függvény MOST jött létre, e nélkül az
-- alapértelmezett PUBLIC EXECUTE maradna rajta.
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM anon;
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM authenticated;



-- ─────────────────────────────────────────────────────────────────────────
-- 11. public_calendar_feed — (a) a feed jelzi, hogy a gyülekezet kérte-e a
--     RÉSZLETES (megjegyzéses) változatot (alap: NEM — a lelkészi jegyzet
--     lelkigondozói adatot hordozhat, és a feed külső naptár-szolgáltatóra
--     szinkronizálódik); (b) az ismetlodes_vege is átmegy a kibontáshoz.
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
    -- az idei év eleje előtt legfeljebb 5 évvel indult sorok (az ismétlődők
    -- kibontásához a régebbi sorozat-kezdetek is kellenek).
    -- v2 (review-fix): DATE-típusú összevetés — a szöveg-összehasonlítás a
    -- date oszloppal futásidejű hibát adott volna (az egész feed 503).
    AND p.datum >= make_date(EXTRACT(year FROM now())::int - 5, 1, 1);

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', v_cong.nev,
    'reszletes', v_cong.reszletes,
    'programs', v_programs
  );
END;
$$;

COMMENT ON FUNCTION public.public_calendar_feed(uuid) IS
  'Nyilvános naptár-feed adatforrás (2026-08-02, PR-20): a calendar_feed_token alapján a gyülekezet programjait adja (személyes adat nélkül) az /api/calendar/<token> ICS-feedhez.';

REVOKE ALL ON FUNCTION public.public_calendar_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_calendar_feed(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_calendar_feed(uuid) TO authenticated;

-- PostgREST schema cache reload (új tábla/oszlopok azonnali láthatósága).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz; minden sor ✅ kell legyen.
-- ============================================================================
SELECT '01. presbiter.fokozat oszlop (NOT NULL, default teljes)' AS lepes,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='presbiter'
           AND column_name='fokozat' AND is_nullable='NO')
       THEN '✅' ELSE '❌' END AS allapot
UNION ALL
SELECT '02. presbiter mandátum + funkció + publikus oszlopok',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='presbiter'
           AND column_name IN ('funkcio','kezdete','vege','egyseg_id','publikus','megjegyzes')) = 6
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '03. funkció→teljes fokozat egyházjogi CHECK',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
         WHERE conname='presbiter_funkcio_fokozat_check'
           AND conrelid='public.presbiter'::regclass)
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '04. tisztsegek tábla létezik',
       CASE WHEN to_regclass('public.tisztsegek') IS NOT NULL THEN '✅' ELSE '❌' END
UNION ALL
SELECT '05. tisztsegek RLS bekapcsolva + 4 policy',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.tisztsegek'::regclass)
         AND (SELECT count(*) FROM pg_policies
              WHERE schemaname='public' AND tablename='tisztsegek') = 4
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '06. tisztsegek: anon-nak SEMMILYEN jogosultsága nincs',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema='public' AND table_name='tisztsegek' AND grantee='anon')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '07. tisztsegek mentés-besorolás (backup_table_policy)',
       CASE WHEN EXISTS (SELECT 1 FROM public.backup_table_policy WHERE tabla='tisztsegek')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '08. congregations.presbiteri_ciklus_ev (default 3)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='congregations'
           AND column_name='presbiteri_ciklus_ev')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '09. szemely név-publikálási hozzájárulás (+_at)',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='szemely'
           AND column_name IN ('nev_publikalas_consent','nev_publikalas_consent_at')) = 2
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '10. programok: publikus + ismetlodes_vege + evi CHECK',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='gyulekezeti_programok'
           AND column_name IN ('publikus','ismetlodes_vege')) = 2
         AND EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname='gyulekezeti_programok_ismetlodes_tipus_check'
             AND conrelid='public.gyulekezeti_programok'::regclass
             AND pg_get_constraintdef(oid) LIKE '%evi%')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '11. public_sites.show_tisztsegek + show_events',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='public_sites'
           AND column_name IN ('show_tisztsegek','show_events')) = 2
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '12. public_site_stats V3 (aktív+teljes presbiter-szám)',
       CASE WHEN COALESCE(obj_description(to_regprocedure('public.public_site_stats(text)'), 'pg_proc'), '')
              = 'KARTOTEKA_PUBLIC_SITE_STATS_V3'
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '13. public_site_tisztsegek RPC + csak-anon jog',
       CASE WHEN to_regprocedure('public.public_site_tisztsegek(text)') IS NOT NULL
         AND has_function_privilege('anon', 'public.public_site_tisztsegek(text)', 'EXECUTE')
         AND NOT has_function_privilege('authenticated', 'public.public_site_tisztsegek(text)', 'EXECUTE')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '14. public_site_events RPC + csak-anon jog',
       CASE WHEN to_regprocedure('public.public_site_events(text)') IS NOT NULL
         AND has_function_privilege('anon', 'public.public_site_events(text)', 'EXECUTE')
         AND NOT has_function_privilege('authenticated', 'public.public_site_events(text)', 'EXECUTE')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '15. tag-törlő RPC: a tisztsegek-láb ÉL',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         WHERE p.oid = to_regprocedure('public.tagnyilvantartas_tag_torles(integer)')
           AND p.prosrc LIKE '%DELETE FROM public.tisztsegek%')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '16. kapcsolat-katalógus: tisztsegek sor ÉL',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         WHERE p.oid = to_regprocedure('public.szemely_kapcsolat_lista(integer)')
           AND p.prosrc LIKE '%''tisztsegek''%')
       THEN '✅' ELSE '❌' END
UNION ALL
SELECT '17. calendar_feed_reszletes kapcsoló (alap: szűkített feed)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='congregations'
           AND column_name='calendar_feed_reszletes')
       THEN '✅' ELSE '❌' END;

-- ─────────────────────────────────────────────────────────────────────────
-- TÁJÉKOZTATÓ (nem hibajelzés): a backfill által NEM felismert tisztség-
-- szövegek — ezek fokozata 'teljes' maradt, kézzel pontosítható a felületen.
-- ─────────────────────────────────────────────────────────────────────────
SELECT DISTINCT p.tisztseg AS nem_felismert_tisztseg_szoveg, count(*) AS sorok
FROM public.presbiter p
WHERE COALESCE(p.tisztseg, '') <> ''
  AND p.tisztseg NOT ILIKE '%presbiter%'
  AND p.tisztseg NOT ILIKE '%gondnok%'
  AND p.tisztseg NOT ILIKE '%tiszteletbeli%'
GROUP BY p.tisztseg
ORDER BY sorok DESC;
