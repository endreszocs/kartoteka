-- =========================================================================
-- 2026-04-18 — Nyugtatömb rendszer (Fázis 2)
-- =========================================================================
-- CÉL:
--   Az egyházközség nyugtatömböket vásárol az egyházmegyétől (pl. Block nr.
--   2309, Seria EREKC24, nr. 0115301-0115350). A rendszer követi:
--     - Melyik tömbben hol tartunk (mennyi maradt)
--     - Minden kiállított nyugta KAP:
--         (a) kerületi (nyomdai) számot — a tömb következő szabad száma
--         (b) gyülekezeti saját számot — év elejétől 1-től újraindul
--     - Automatikus ugrás a következő aktív tömbre ha kifogy
--
-- A meglévő 2026-04-16-wc2-7-chitanta-tomb.sql egy egyszerűbb verzió volt
-- (csak chitanta_sorozat_default + chitanta_kovetkezo_szam). Most bővítjük
-- valódi tömb-kezelésre.
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

BEGIN;

-- 1) TÁBLA: chitanta_tombok
-- --------------------------
CREATE TABLE IF NOT EXISTS public.chitanta_tombok (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,

  -- Kerületi (nyomdai) azonosítás
  block_nr text,                     -- pl. "2309" (a tömb belső szám a nyomdánál)
  seria text NOT NULL,               -- pl. "EREKC24"
  szam_kezdet integer NOT NULL,      -- pl. 115301
  szam_veg integer NOT NULL,         -- pl. 115350
  darabszam_ossz integer NOT NULL,   -- pl. 50

  -- Felhasznált darabszám követése (real-time)
  felhasznalt_darabszam integer NOT NULL DEFAULT 0,

  -- Vásárlás adatai
  vasarlas_datuma date NOT NULL DEFAULT CURRENT_DATE,
  vasarlas_ara numeric(10,2),

  -- Dátum követés (élő statisztika a kimutatáshoz)
  elso_hasznalat_datum date,         -- az első kiállított nyugta dátuma a tömbből
  utolso_hasznalat_datum date,       -- az utolsó kiállított nyugta dátuma

  -- Státusz
  aktiv boolean NOT NULL DEFAULT true, -- ha false: nem választható új nyugtához (lezárt vagy kifogyott)

  -- Metaadatok
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chitanta_tombok_szam_range CHECK (szam_veg >= szam_kezdet),
  CONSTRAINT chitanta_tombok_darab_positive CHECK (darabszam_ossz > 0),
  CONSTRAINT chitanta_tombok_darab_matches CHECK (darabszam_ossz = szam_veg - szam_kezdet + 1),
  CONSTRAINT chitanta_tombok_felhasznalt_check CHECK (felhasznalt_darabszam >= 0 AND felhasznalt_darabszam <= darabszam_ossz)
);

COMMENT ON TABLE public.chitanta_tombok IS
  'Nyugtatömb-nyilvántartás. Egyházközség vásárolta az egyházmegyétől, követjük a felhasználást.';

-- Indexek
CREATE INDEX IF NOT EXISTS chitanta_tombok_congregation_aktiv_idx
  ON public.chitanta_tombok (congregation_id, aktiv, szam_kezdet);

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chitanta_tombok TO authenticated;

-- RLS
ALTER TABLE public.chitanta_tombok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chitanta_tombok_congregation_access ON public.chitanta_tombok;
CREATE POLICY chitanta_tombok_congregation_access
  ON public.chitanta_tombok FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.congregation_id = chitanta_tombok.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.congregation_id = chitanta_tombok.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
  );

-- 2) oblio_szamlak bővítés
-- ------------------------
-- tomb_id: melyik tömbből van a kerületi szám
-- nyomdai_szam: a tömbből kapott kerületi (nyomdai) szám, pl. 115356
-- gyulekezeti_szam: a gyülekezet saját év-eleji sorszáma, pl. 356
--
-- A meglévő `szam` mező EDDIG a sorozaton belüli számot jelölte — most ez
-- a `nyomdai_szam` (visszafelé kompatibilis).

ALTER TABLE public.oblio_szamlak
  ADD COLUMN IF NOT EXISTS tomb_id uuid REFERENCES public.chitanta_tombok(id),
  ADD COLUMN IF NOT EXISTS nyomdai_szam integer,
  ADD COLUMN IF NOT EXISTS gyulekezeti_szam integer,
  ADD COLUMN IF NOT EXISTS klienesseg_nr_orc_an text;

COMMENT ON COLUMN public.oblio_szamlak.tomb_id IS
  'Melyik chitanta_tombok sorból jött a kerületi (nyomdai) szám.';
COMMENT ON COLUMN public.oblio_szamlak.nyomdai_szam IS
  'Kerületi nyomdai sorszám (a tömbből), pl. 115356. A nyugta jobb felső sarkában jelenik meg a Seria mellett.';
COMMENT ON COLUMN public.oblio_szamlak.gyulekezeti_szam IS
  'Gyülekezeti saját sorszám — év elejétől újraindul 1-től. A nyugta nagy Nr. mezőjében jelenik meg.';
COMMENT ON COLUMN public.oblio_szamlak.klienesseg_nr_orc_an IS
  'A befizető cégjegyzékszáma (Nr.ORC/an), ha vállalat — magánszemélynél üres.';

-- Indexek a sorszámozáshoz
CREATE INDEX IF NOT EXISTS oblio_szamlak_tomb_idx
  ON public.oblio_szamlak (tomb_id) WHERE tomb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS oblio_szamlak_gyulekezeti_szam_idx
  ON public.oblio_szamlak (congregation_id, szamla_datum) WHERE tipus = 'chitanta_papir';

-- 3) Backfill: a meglévő `szam` érték nyomdai_szam-ként is kerüljön ki
UPDATE public.oblio_szamlak
SET nyomdai_szam = szam
WHERE tipus = 'chitanta_papir' AND nyomdai_szam IS NULL;

-- 4) RPC: a következő chitanta-számok atomi lefoglalása
-- -----------------------------------------------------
-- Visszaad:
--   tomb_id: a használt tömb ID-ja (null ha nincs aktív tömb — ekkor error jön a hívónak)
--   nyomdai_szam: a kerületi (nyomdai) szám
--   gyulekezeti_szam: a gyülekezeti saját szám (év elejétől)
--   sorozat: a tömb sorozat neve (pl. "EREKC24")
--   maradek: hány db nyugta van még a tömbben (informatív)
-- Hiba esetén kivételt dob ("no_active_block") — a hívó mutatja a wizardet.

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
AS $$
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
  -- 1. Aktív, nem-kifogyott tömb keresése (legkisebb szám_kezdet először)
  SELECT id, seria, szam_kezdet, felhasznalt_darabszam, darabszam_ossz
    INTO v_tomb_id, v_sorozat, v_szam_kezdet, v_felhasznalt, v_darabszam
    FROM public.chitanta_tombok
    WHERE congregation_id = p_congregation_id
      AND aktiv = true
      AND felhasznalt_darabszam < darabszam_ossz
    ORDER BY szam_kezdet ASC
    LIMIT 1;

  IF v_tomb_id IS NULL THEN
    RAISE EXCEPTION 'no_active_block' USING
      HINT = 'Nincs aktív nyugtatömb. A lelkész rögzítsen egy új tömböt a Nyugtatömbök oldalon.';
  END IF;

  -- 2. Következő kerületi szám a tömbből
  v_nyomdai := v_szam_kezdet + v_felhasznalt;

  -- 3. Gyülekezeti saját szám — év eleji újraindítás
  v_year := EXTRACT(YEAR FROM p_szamla_datum);
  SELECT COALESCE(MAX(gyulekezeti_szam), 0) + 1
    INTO v_gyul
    FROM public.oblio_szamlak
    WHERE congregation_id = p_congregation_id
      AND tipus = 'chitanta_papir'
      AND EXTRACT(YEAR FROM szamla_datum) = v_year
      AND stornozott = false;

  -- 4. Felhasznalt_darabszam increment (+ dátum frissítés)
  UPDATE public.chitanta_tombok
    SET felhasznalt_darabszam = felhasznalt_darabszam + 1,
        elso_hasznalat_datum = COALESCE(elso_hasznalat_datum, p_szamla_datum),
        utolso_hasznalat_datum = p_szamla_datum,
        aktiv = CASE WHEN felhasznalt_darabszam + 1 >= darabszam_ossz THEN false ELSE aktiv END,
        updated_at = now()
    WHERE id = v_tomb_id;

  -- 5. Visszaadjuk a lefoglalt számokat
  RETURN QUERY SELECT v_tomb_id, v_nyomdai, v_gyul, v_sorozat, (v_darabszam - v_felhasznalt - 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_chitanta_full(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.next_chitanta_full(uuid, date) IS
  'Atomikus nyugtaszám-lefoglalás: megtalálja az aktív tömböt, visszaadja a kerületi + gyülekezeti számot, növeli a felhasznált darabszámot.';

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

-- 1) chitanta_tombok tábla létezik?
SELECT 'chitanta_tombok' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chitanta_tombok'
  ) AS result;

-- 2) oblio_szamlak új oszlopok
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'oblio_szamlak'
  AND column_name IN ('tomb_id', 'nyomdai_szam', 'gyulekezeti_szam', 'klienesseg_nr_orc_an')
ORDER BY column_name;

-- 3) GRANT-ek
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'chitanta_tombok'
  AND grantee = 'authenticated'
ORDER BY privilege_type;

-- 4) RLS + policy
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'chitanta_tombok';

-- 5) RPC létezik?
SELECT proname, pronargs
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'next_chitanta_full';

-- 6) Backfill kontroll: hány meglévő chitanta kapott nyomdai_szam-ot?
SELECT COUNT(*) AS chitantak_nyomdai_szammal
FROM public.oblio_szamlak
WHERE tipus = 'chitanta_papir' AND nyomdai_szam IS NOT NULL;
