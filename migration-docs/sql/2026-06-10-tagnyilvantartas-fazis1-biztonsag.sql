-- ════════════════════════════════════════════════════════════════════════════
-- 2026-06-10 — TAGNYILVÁNTARTÁS FÁZIS 1: BIZTONSÁGI HOTFIX
-- Forrás: docs/project-tracking/KARTOTEKA-tagnyilvantartas-atvilagitas-2026-06-10.md
--
-- Tartalom:
--   1. felmentes.congregation_id — oszlop + backfill + BEFORE INSERT trigger,
--      a `USING (true)` policyk cseréje gyülekezet-szűrt policykra        (P0-4, P1-4)
--   2. presbiter.congregation_id — ugyanaz                                 (P0-4)
--   3. csoport.congregation_id — oszlop + backfill + write-policyk
--      (SELECT egyelőre NULL-átengedő, hogy legacy sor ne tűnjön el)       (P0-4 előkészítés)
--   4. tagnyilvantartas_tag_torles() RPC — atomikus, jogosultság-ellenőrzött
--      végleges törlés; pénzügyi ÉS anyakönyvi védelemmel                  (P0-1, P0-2, P0-3)
--   5. app_get_or_create_locality/street() RPC — guardolt címtörzs-bővítés
--      (eddig: authenticated INSERT-grant hiányában az insert elbukott,
--      és a kód csendben 1-es id-ra esett vissza → rossz címre kötés)      (P1-3)
--   6. Diagnosztika (backfill-lefedettség ellenőrzése)
--
-- Idempotens (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE), BEGIN/COMMIT.
-- ⚠️ FUTTATÁSI SORREND: ezt a migrációt a webapp 2026-06-10-es deployja ELŐTT
--    kell futtatni — a kód az új RPC-kre és a felmentes.congregation_id
--    oszlopra hivatkozik. (A migráció a RÉGI kóddal is kompatibilis: a
--    triggerek töltik a congregation_id-t a régi insertek alatt is.)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. FELMENTES — congregation_id + szigorított RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.felmentes
  ADD COLUMN IF NOT EXISTS congregation_id uuid REFERENCES public.congregations(id);

-- Backfill 1: személyhez kötött felmentések (id_szemely → szemely.congregation_id)
UPDATE public.felmentes f
SET congregation_id = s.congregation_id
FROM public.szemely s
WHERE f.congregation_id IS NULL
  AND f.id_szemely IS NOT NULL
  AND s.id = f.id_szemely
  AND s.congregation_id IS NOT NULL;

-- Backfill 2: családhoz kötött felmentések (id_csalad → csalad férj/feleség → szemely)
UPDATE public.felmentes f
SET congregation_id = sub.congregation_id
FROM (
  SELECT c.id AS csalad_id, max(s.congregation_id::text)::uuid AS congregation_id
  FROM public.csalad c
  JOIN public.szemely s ON s.id IN (c.id_ferfi, c.id_no)
  WHERE s.congregation_id IS NOT NULL
  GROUP BY c.id
) sub
WHERE f.congregation_id IS NULL
  AND f.id_csalad = sub.csalad_id;

CREATE INDEX IF NOT EXISTS idx_felmentes_congregation
  ON public.felmentes (congregation_id);

-- BEFORE INSERT trigger: ha a (régi) kód nem adja meg, származtatjuk.
-- SECURITY DEFINER + pinned search_path (2026-05-17-es CVE-mitigáció konvenció).
CREATE OR REPLACE FUNCTION public.felmentes_set_congregation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.congregation_id IS NULL AND NEW.id_szemely IS NOT NULL THEN
    SELECT s.congregation_id INTO NEW.congregation_id
    FROM public.szemely s WHERE s.id = NEW.id_szemely;
  END IF;
  IF NEW.congregation_id IS NULL AND NEW.id_csalad IS NOT NULL THEN
    SELECT s.congregation_id INTO NEW.congregation_id
    FROM public.csalad c
    JOIN public.szemely s ON s.id IN (c.id_ferfi, c.id_no)
    WHERE c.id = NEW.id_csalad AND s.congregation_id IS NOT NULL
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_felmentes_set_congregation ON public.felmentes;
CREATE TRIGGER trg_felmentes_set_congregation
  BEFORE INSERT ON public.felmentes
  FOR EACH ROW EXECUTE FUNCTION public.felmentes_set_congregation();

-- Régi, mindent átengedő policyk eltávolítása (két néven is létezhet)
DROP POLICY IF EXISTS felmentes_all ON public.felmentes;
DROP POLICY IF EXISTS felmentes_access ON public.felmentes;

ALTER TABLE public.felmentes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.felmentes TO authenticated;

DROP POLICY IF EXISTS felmentes_select ON public.felmentes;
CREATE POLICY felmentes_select ON public.felmentes
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS felmentes_insert ON public.felmentes;
CREATE POLICY felmentes_insert ON public.felmentes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS felmentes_update ON public.felmentes;
CREATE POLICY felmentes_update ON public.felmentes
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS felmentes_delete ON public.felmentes;
CREATE POLICY felmentes_delete ON public.felmentes
  FOR DELETE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PRESBITER — congregation_id + szigorított RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.presbiter
  ADD COLUMN IF NOT EXISTS congregation_id uuid REFERENCES public.congregations(id);

UPDATE public.presbiter p
SET congregation_id = s.congregation_id
FROM public.szemely s
WHERE p.congregation_id IS NULL
  AND s.id = p.id_szemely
  AND s.congregation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presbiter_congregation
  ON public.presbiter (congregation_id);

CREATE OR REPLACE FUNCTION public.presbiter_set_congregation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.congregation_id IS NULL AND NEW.id_szemely IS NOT NULL THEN
    SELECT s.congregation_id INTO NEW.congregation_id
    FROM public.szemely s WHERE s.id = NEW.id_szemely;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presbiter_set_congregation ON public.presbiter;
CREATE TRIGGER trg_presbiter_set_congregation
  BEFORE INSERT ON public.presbiter
  FOR EACH ROW EXECUTE FUNCTION public.presbiter_set_congregation();

-- Régi, mindent átengedő policyk (presbiter_read a 04-13-reference-tables-ből,
-- presbiter_all a 04-13-ALL-FIXED-ből — mindkettő FOR ALL USING (true) volt!)
DROP POLICY IF EXISTS presbiter_all ON public.presbiter;
DROP POLICY IF EXISTS presbiter_read ON public.presbiter;

ALTER TABLE public.presbiter ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presbiter TO authenticated;

DROP POLICY IF EXISTS presbiter_select ON public.presbiter;
CREATE POLICY presbiter_select ON public.presbiter
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS presbiter_insert ON public.presbiter;
CREATE POLICY presbiter_insert ON public.presbiter
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS presbiter_update ON public.presbiter;
CREATE POLICY presbiter_update ON public.presbiter
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS presbiter_delete ON public.presbiter;
CREATE POLICY presbiter_delete ON public.presbiter
  FOR DELETE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CSOPORT (körzetek) — congregation_id + write-policyk
--    A SELECT egyelőre NULL-átengedő: a backfillből kimaradó legacy sorok ne
--    tűnjenek el a felületekről. Teljes szigorítás: admin-RLS Fázis 4-ben.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.csoport
  ADD COLUMN IF NOT EXISTS congregation_id uuid REFERENCES public.congregations(id);

-- Backfill 1 (legmegbízhatóbb): az új haztartas modell közvetlen hivatkozása
UPDATE public.csoport cs
SET congregation_id = sub.congregation_id
FROM (
  SELECT id_csoport, max(congregation_id::text)::uuid AS congregation_id
  FROM public.haztartas
  WHERE id_csoport IS NOT NULL
  GROUP BY id_csoport
) sub
WHERE cs.congregation_id IS NULL
  AND cs.id = sub.id_csoport;

-- Backfill 2: presbiteri hivatkozás (a 2. szakaszban már feltöltött presbiter.congregation_id)
UPDATE public.csoport cs
SET congregation_id = sub.congregation_id
FROM (
  SELECT id_csoport, max(congregation_id::text)::uuid AS congregation_id
  FROM public.presbiter
  WHERE id_csoport IS NOT NULL AND congregation_id IS NOT NULL
  GROUP BY id_csoport
) sub
WHERE cs.congregation_id IS NULL
  AND cs.id = sub.id_csoport;

-- Backfill 3: legacy csalad-hivatkozás (csalad → férj/feleség → szemely)
UPDATE public.csoport cs
SET congregation_id = sub.congregation_id
FROM (
  SELECT c.id_csoport, max(s.congregation_id::text)::uuid AS congregation_id
  FROM public.csalad c
  JOIN public.szemely s ON s.id IN (c.id_ferfi, c.id_no)
  WHERE c.id_csoport IS NOT NULL AND s.congregation_id IS NOT NULL
  GROUP BY c.id_csoport
) sub
WHERE cs.congregation_id IS NULL
  AND cs.id = sub.id_csoport;

CREATE INDEX IF NOT EXISTS idx_csoport_congregation
  ON public.csoport (congregation_id);

ALTER TABLE public.csoport ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.csoport TO authenticated;

DROP POLICY IF EXISTS csoport_read ON public.csoport;
DROP POLICY IF EXISTS csoport_select ON public.csoport;
CREATE POLICY csoport_select ON public.csoport
  FOR SELECT TO authenticated
  USING (
    congregation_id IS NULL
    OR public.current_user_can_access_congregation(congregation_id)
  );

DROP POLICY IF EXISTS csoport_insert ON public.csoport;
CREATE POLICY csoport_insert ON public.csoport
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS csoport_update ON public.csoport;
CREATE POLICY csoport_update ON public.csoport
  FOR UPDATE TO authenticated
  USING (
    congregation_id IS NULL
    OR public.current_user_can_access_congregation(congregation_id)
  )
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS csoport_delete ON public.csoport;
CREATE POLICY csoport_delete ON public.csoport
  FOR DELETE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- Sequence-grantok (ha a default privilégiumok hiányoznának az insertekhez)
DO $$
DECLARE
  seq text;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['felmentes', 'presbiter', 'csoport'] LOOP
    seq := pg_get_serial_sequence('public.' || t, 'id');
    IF seq IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq);
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TAGNYILVANTARTAS_TAG_TORLES — atomikus végleges törlés
--
-- A korábbi app-oldali implementáció (removeMember 'torles' ága):
--   • tulajdonjog-ellenőrzés NÉLKÜL futtatott 7 kapcsolt-rekord DELETE-et
--     (gyülekezet-szűrés nélkül) → kereszt-gyülekezeti destruktív IDOR,
--   • VÉGLEGESEN törölte a keresztelési/konfirmációs anyakönyvi sorokat,
--   • tranzakció nélkül futott → részleges hiba = inkonzisztens állapot.
--
-- Az új szabály:
--   • pénzügyi VAGY anyakönyvi (keresztseg/konfirmalas/hazassag/temetes)
--     rekorddal rendelkező tag SOHA nem törölhető fizikailag → elrejtés,
--   • a többi kapcsolt rekord (mozgás, felmentés, gyerek, presbiter,
--     átjelentkezési kérelem) egyetlen tranzakcióban törlődik,
--   • haztartas_tag / szemely_kapcsolat / member_validation_errors:
--     ON DELETE CASCADE viszi,
--   • bármilyen váratlan FK-ütközés (pl. családfő, CNP-szülő-hivatkozás,
--     leltár-felelős) → automatikus rollback + elrejtés-fallback.
-- ────────────────────────────────────────────────────────────────────────────

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

REVOKE ALL ON FUNCTION public.tagnyilvantartas_tag_torles(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tagnyilvantartas_tag_torles(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.tagnyilvantartas_tag_torles(integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. APP_GET_OR_CREATE_LOCALITY / STREET — guardolt címtörzs-bővítés
--
-- Az adrlocality/adrstreet táblákra az authenticated szerepnek csak SELECT
-- grantja van (2026-04-21-adr-grant-authenticated.sql) — a webapp korábbi
-- közvetlen insertje normál usernek MINDIG elbukott, és a kód csendben 1-es
-- id-ra esett vissza. Ez a két SECURITY DEFINER RPC kontrolláltan (auth +
-- gyülekezeti tagság ellenőrzéssel, normalizált egyezéskereséssel) hozza
-- létre a hiányzó település/utca sort.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_get_or_create_locality(p_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_id integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.';
  END IF;
  IF NOT (public.current_user_has_global_access()
          OR public.current_user_congregation_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'Nincs aktív gyülekezeti tagság.';
  END IF;

  v_name := trim(p_name);
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'A település neve kötelező.';
  END IF;

  SELECT id INTO v_id FROM public.adrlocality
  WHERE lower(name) = lower(v_name)
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.adrlocality (name, countyid)
  VALUES (v_name, 1)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_get_or_create_street(p_name text, p_locality_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_id integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.';
  END IF;
  IF NOT (public.current_user_has_global_access()
          OR public.current_user_congregation_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'Nincs aktív gyülekezeti tagság.';
  END IF;

  v_name := trim(p_name);
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Az utca neve kötelező.';
  END IF;
  IF p_locality_id IS NULL THEN
    RAISE EXCEPTION 'A település azonosítója kötelező.';
  END IF;

  SELECT id INTO v_id FROM public.adrstreet
  WHERE localityid = p_locality_id AND lower(name) = lower(v_name)
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.adrstreet (name, localityid)
  VALUES (v_name, p_locality_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.app_get_or_create_locality(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_get_or_create_locality(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.app_get_or_create_locality(text) TO authenticated;

REVOKE ALL ON FUNCTION public.app_get_or_create_street(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_get_or_create_street(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.app_get_or_create_street(text, integer) TO authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. DIAGNOSZTIKA (a COMMIT után futtatható, read-only)
--    Elvárás: mindhárom darabszám 0 vagy nagyon alacsony. A NULL-on maradt
--    sorok árva rekordok (nincs élő személy-/család-hivatkozásuk) — ezek a
--    szigorított policyk után csak global-access szereppel láthatók
--    (csoport: SELECT-nél NULL-átengedő, ott látható marad).
-- ────────────────────────────────────────────────────────────────────────────

SELECT 'felmentes congregation_id NÉLKÜL' AS ellenorzes, count(*) AS darab
FROM public.felmentes WHERE congregation_id IS NULL
UNION ALL
SELECT 'presbiter congregation_id NÉLKÜL', count(*)
FROM public.presbiter WHERE congregation_id IS NULL
UNION ALL
SELECT 'csoport congregation_id NÉLKÜL', count(*)
FROM public.csoport WHERE congregation_id IS NULL;

-- Policy-állapot gyors ellenőrzése:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE tablename IN ('felmentes', 'presbiter', 'csoport') ORDER BY 1, 2;
