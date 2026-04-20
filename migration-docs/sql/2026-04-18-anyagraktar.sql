-- =========================================================================
-- 2026-04-18 — Anyagraktár (materials + material_movements)
-- =========================================================================
-- CÉL:
--   Az egyházi hivatalos Anyagraktárkönyv (Word/Excel minta) digitalizálása.
--   Minden ANYAG egy külön "oldal" (mint a több lapos Excel):
--     - név, mértékegység, egységár
--     - mozgások időrendben: BEVÉTEL / KIADÁS
--     - folyamatos MENNYISÉG és ÉRTÉK egyenleg
--
--   KÜLÖNBSÉG a Leltári nyilvántartástól (leltar tábla):
--     - Leltár = egyedi hosszú élettartamú tárgyak (bútor, eszköz)
--     - Anyagraktár = gyorsan fogyó készletek (papír, tisztítószer, nyomtatványok)
--
--   A kerületi NYUGTATÖMBÖK (chitanta_tombok) KÜLÖN rendszerben maradnak,
--   mert a nyugtakiállításhoz speciális seria/szám logika kell. Az Anyagraktár
--   fülön mégis megjelennek, két szekcióban egyben látható a készlet.
--
-- JAVÍTÁS 2026-04-18: a profile_roles tábla helyes oszlopait használjuk:
--   - profile_roles.active (boolean)  — nem "status"
--   - profile_roles.approval_status (text) — pl. 'approved'
--   - profile_roles.scope_id (uuid)   — nem kell ::uuid cast
--
-- Idempotens — újrafuttatható.
-- =========================================================================

BEGIN;

-- 1) materials — anyagtípusok törzs (1 sor = 1 anyag)
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  nev text NOT NULL,                                -- pl. "Papír A4"
  megnevezes text,                                  -- hosszabb magyarázó szöveg
  mertekegyseg text NOT NULL DEFAULT 'db',          -- pl. "db", "csomag", "liter"
  egysegar numeric(12, 2),                          -- RON (lejben)
  kategoria text,                                   -- pl. "Irodaszer", "Tisztítószer"
  aktiv boolean NOT NULL DEFAULT true,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.materials IS
  'Anyagraktári anyagtípusok — minden gyülekezet saját listája. A hivatalos Anyagraktárkönyv mintáját követi.';
COMMENT ON COLUMN public.materials.nev IS
  'Az anyag megnevezése (pl. "Papír A4"). Kötelező.';
COMMENT ON COLUMN public.materials.mertekegyseg IS
  'Mértékegység szöveg (pl. "db", "csomag", "liter", "kg"). Default: "db".';
COMMENT ON COLUMN public.materials.egysegar IS
  'Egységár RON-ban. Új mozgás rögzítésénél alapértelmezett érték-számításhoz.';

-- 2) material_movements — mozgások (bevétel/kiadás)
CREATE TABLE IF NOT EXISTS public.material_movements (
  id bigserial PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  datum date NOT NULL,
  tipus text NOT NULL CHECK (tipus IN ('bevetel', 'kiadas')),
  mennyiseg numeric(12, 3) NOT NULL CHECK (mennyiseg > 0),
  ertek numeric(12, 2) NOT NULL DEFAULT 0,          -- mennyiseg * egysegar default, de szerkeszthető
  irat_szama text,                                  -- pl. "BE-001", számla sorszám
  magyarazat text,                                  -- "Kitől vettük be" vagy "Kinek adtuk ki"
  kapcsolt_kiadas_id bigint REFERENCES public.kiadas(id) ON DELETE SET NULL,
  kapcsolt_befizetes_id bigint REFERENCES public.befizetes(id) ON DELETE SET NULL,
  stornozott boolean NOT NULL DEFAULT false,
  stornozott_at timestamptz,
  stornozott_indok text,
  stornozott_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.material_movements IS
  'Anyagmozgások — egy anyag bevételezései és kiadásai időrendben. Minden sor a hivatalos Anyagraktárkönyv egy sorát reprezentálja.';
COMMENT ON COLUMN public.material_movements.tipus IS
  'bevetel (átvétel, vásárlás) vagy kiadas (felhasználás)';
COMMENT ON COLUMN public.material_movements.mennyiseg IS
  'A mozgás mennyisége (mindig pozitív). A tipus mezőből derül ki, hogy +/-.';
COMMENT ON COLUMN public.material_movements.ertek IS
  'A mozgás pénzértéke RON-ban. Default: mennyiseg * egysegar, de szerkeszthető (pl. akciós beszerzés).';
COMMENT ON COLUMN public.material_movements.kapcsolt_kiadas_id IS
  'Ha a bevételezés egy gyülekezeti kiadáshoz (pl. vásárláshoz) kapcsolódik, itt a FK.';

-- 3) Indexek
CREATE INDEX IF NOT EXISTS materials_congregation_aktiv_idx
  ON public.materials (congregation_id, aktiv);

CREATE INDEX IF NOT EXISTS material_movements_material_datum_idx
  ON public.material_movements (material_id, datum, id);

CREATE INDEX IF NOT EXISTS material_movements_congregation_datum_idx
  ON public.material_movements (congregation_id, datum DESC)
  WHERE stornozott = false;

-- 4) RLS — minden gyülekezet csak a saját anyagait látja és szerkeszti
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_movements ENABLE ROW LEVEL SECURITY;

-- Drop meglévő policy-kat, hogy idempotens legyen
DROP POLICY IF EXISTS materials_select ON public.materials;
DROP POLICY IF EXISTS materials_insert ON public.materials;
DROP POLICY IF EXISTS materials_update ON public.materials;
DROP POLICY IF EXISTS materials_delete ON public.materials;
DROP POLICY IF EXISTS material_movements_select ON public.material_movements;
DROP POLICY IF EXISTS material_movements_insert ON public.material_movements;
DROP POLICY IF EXISTS material_movements_update ON public.material_movements;
DROP POLICY IF EXISTS material_movements_delete ON public.material_movements;

-- materials policies
CREATE POLICY materials_select ON public.materials
  FOR SELECT TO authenticated
  USING (
    -- A) a user elsődleges gyülekezete (profiles.congregation_id)
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    -- B) vagy extra profile_roles sor ad hozzáférést (helyes oszlopok: active + approval_status)
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = materials.congregation_id
    )
    -- C) vagy admin / egyházkerületi admin mindent lát
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

CREATE POLICY materials_insert ON public.materials
  FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = materials.congregation_id
    )
  );

CREATE POLICY materials_update ON public.materials
  FOR UPDATE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = materials.congregation_id
    )
  )
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = materials.congregation_id
    )
  );

CREATE POLICY materials_delete ON public.materials
  FOR DELETE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = materials.congregation_id
    )
  );

-- material_movements policies (ugyanaz a mintára)
CREATE POLICY material_movements_select ON public.material_movements
  FOR SELECT TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = material_movements.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

CREATE POLICY material_movements_insert ON public.material_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = material_movements.congregation_id
    )
  );

CREATE POLICY material_movements_update ON public.material_movements
  FOR UPDATE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = material_movements.congregation_id
    )
  )
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = material_movements.congregation_id
    )
  );

CREATE POLICY material_movements_delete ON public.material_movements
  FOR DELETE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = material_movements.congregation_id
    )
  );

-- 5) Jogosultság-szigorítás: anon kizárása (egyezően a többi táblával)
REVOKE ALL ON public.materials FROM anon;
REVOKE ALL ON public.material_movements FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_movements TO authenticated;
GRANT USAGE ON SEQUENCE public.material_movements_id_seq TO authenticated;

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

SELECT
  'materials tábla' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='materials') AS result
UNION ALL
SELECT
  'material_movements tábla',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='material_movements')
UNION ALL
SELECT
  'materials RLS bekapcsolva',
  (SELECT relrowsecurity FROM pg_class WHERE relname='materials')
UNION ALL
SELECT
  'material_movements RLS bekapcsolva',
  (SELECT relrowsecurity FROM pg_class WHERE relname='material_movements');

-- Policies áttekintés:
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE tablename IN ('materials', 'material_movements')
ORDER BY tablename, policyname;
