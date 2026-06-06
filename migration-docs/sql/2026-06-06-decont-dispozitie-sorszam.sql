-- ===================================================================
-- Decont (elszámolás) + Dispoziție de plată/încasare — adatbázis-séma
-- 2026-06-06
-- ===================================================================
--
-- Három funkció támogatása:
--   1. Decont — utólag bevezetésre kerülő számlák összegyűjtése egy
--      számozott elszámolási lapra. A tételek VALÓDI kiadás rekordot is
--      létrehoznak, az AKTUÁLIS (decont) dátumra könyvelve — mert a
--      könyvelés nem enged korábbi dátumra rögzíteni. A számla saját
--      (régi) dátuma csak a nyomtatott dokumentumon jelenik meg.
--   2. Dispoziție de plată — mentéskor automatikusan KIADÁST könyvel.
--   3. Dispoziție de încasare — mentéskor automatikusan BEVÉTELT könyvel.
--
-- Sorszámozás: gyülekezetenként + évente, típusonként 1-től.
--   - decont:      egy sorozat / év
--   - dp_plata:    külön sorozat / év
--   - dp_incasare: külön sorozat / év
--
-- BIZTONSÁG: IF NOT EXISTS / DROP POLICY IF EXISTS — újrafuttatható.
-- ===================================================================

-- ───────────────────────────────────────────────────────────────────
-- 0. Kapcsoló-oszlopok a meglévő könyvelési táblákon (együttes storno)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.kiadas    ADD COLUMN IF NOT EXISTS decont_id     uuid;
ALTER TABLE public.kiadas    ADD COLUMN IF NOT EXISTS dispozitie_id uuid;
ALTER TABLE public.befizetes ADD COLUMN IF NOT EXISTS dispozitie_id uuid;

CREATE INDEX IF NOT EXISTS idx_kiadas_decont_id     ON public.kiadas (decont_id)     WHERE decont_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kiadas_dispozitie_id ON public.kiadas (dispozitie_id) WHERE dispozitie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_befizetes_dispozitie_id ON public.befizetes (dispozitie_id) WHERE dispozitie_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────
-- 1. Sorszám-sorozat tábla + atomikus következő-szám RPC
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.penzugyi_bizonylat_sorszam (
  congregation_id uuid NOT NULL,
  ev              int  NOT NULL,
  tipus           text NOT NULL CHECK (tipus IN ('decont', 'dp_plata', 'dp_incasare')),
  utolso_szam     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (congregation_id, ev, tipus)
);

-- Atomikus: beszúrja vagy növeli a számlálót, és visszaadja az új értéket.
CREATE OR REPLACE FUNCTION public.next_bizonylat_szam(
  p_congregation_id uuid,
  p_ev int,
  p_tipus text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_szam int;
BEGIN
  INSERT INTO public.penzugyi_bizonylat_sorszam (congregation_id, ev, tipus, utolso_szam)
  VALUES (p_congregation_id, p_ev, p_tipus, 1)
  ON CONFLICT (congregation_id, ev, tipus)
  DO UPDATE SET utolso_szam = public.penzugyi_bizonylat_sorszam.utolso_szam + 1
  RETURNING utolso_szam INTO v_szam;
  RETURN v_szam;
END;
$$;

-- ───────────────────────────────────────────────────────────────────
-- 2. Decont fejléc + tételek snapshot (jsonb a hű újranyomtatáshoz)
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decont (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  ev              int  NOT NULL,
  sorszam         int  NOT NULL,
  datum           date NOT NULL,                  -- a könyvelési (aktuális) dátum
  elszamolo_nev   text NOT NULL,
  jovahagyta      text,
  jelleg          text,
  kapott_eloleg   numeric(14,2) NOT NULL DEFAULT 0,
  osszkoltseg     numeric(14,2) NOT NULL DEFAULT 0,
  kulonbozet      numeric(14,2) NOT NULL DEFAULT 0,  -- >0: kifizetni, <0: visszafizetni
  tetelek         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{act_nr,act_type,act_date,issuer,explanation,amount,id_kiadascel}]
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted         boolean NOT NULL DEFAULT false,
  UNIQUE (congregation_id, ev, sorszam)
);

-- ───────────────────────────────────────────────────────────────────
-- 3. Dispoziție de plată / încasare
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dispozitie (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  ev              int  NOT NULL,
  tipus           text NOT NULL CHECK (tipus IN ('plata', 'incasare')),
  sorszam         int  NOT NULL,
  datum           date NOT NULL,
  nev             text NOT NULL,                  -- Numele şi prenumele
  tisztseg        text,                            -- Funcţia (calitatea)
  osszeg          numeric(14,2) NOT NULL,
  cel             text,                            -- Scopul încasării / plăţii
  ci_tipus        text,                            -- Actul de identitate (CI/BI/Pașaport)
  ci_serie        text,
  ci_nr           text,
  id_kiadascel    int,                             -- plata → kiadás kategória
  id_befizetescel int,                             -- incasare → bevétel kategória
  kiadas_id       int,                             -- könyvelt kiadás (plata)
  befizetes_id    int,                             -- könyvelt bevétel (incasare)
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted         boolean NOT NULL DEFAULT false,
  UNIQUE (congregation_id, ev, tipus, sorszam)
);

-- ───────────────────────────────────────────────────────────────────
-- 4. RLS — gyülekezet-scope (a meglévő congregation_annual_fees minta)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.penzugyi_bizonylat_sorszam ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decont                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispozitie                  ENABLE ROW LEVEL SECURITY;

-- Közös scope-feltétel makró helyett külön policy-k táblánként.

-- penzugyi_bizonylat_sorszam --------------------------------------------------
DROP POLICY IF EXISTS sorszam_all_scope ON public.penzugyi_bizonylat_sorszam;
CREATE POLICY sorszam_all_scope ON public.penzugyi_bizonylat_sorszam
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
           AND (p.congregation_id = public.penzugyi_bizonylat_sorszam.congregation_id
                OR p.role IN ('admin','egyhazmegyei_admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
           AND (p.congregation_id = public.penzugyi_bizonylat_sorszam.congregation_id
                OR p.role IN ('admin','egyhazmegyei_admin'))));

-- decont ----------------------------------------------------------------------
DROP POLICY IF EXISTS decont_all_scope ON public.decont;
CREATE POLICY decont_all_scope ON public.decont
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
           AND (p.congregation_id = public.decont.congregation_id
                OR p.role IN ('admin','egyhazmegyei_admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
           AND (p.congregation_id = public.decont.congregation_id
                OR p.role IN ('admin','egyhazmegyei_admin'))));

-- dispozitie ------------------------------------------------------------------
DROP POLICY IF EXISTS dispozitie_all_scope ON public.dispozitie;
CREATE POLICY dispozitie_all_scope ON public.dispozitie
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
           AND (p.congregation_id = public.dispozitie.congregation_id
                OR p.role IN ('admin','egyhazmegyei_admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
           AND (p.congregation_id = public.dispozitie.congregation_id
                OR p.role IN ('admin','egyhazmegyei_admin'))));

-- ───────────────────────────────────────────────────────────────────
-- 5. ELLENŐRZÉS
-- ───────────────────────────────────────────────────────────────────

SELECT 'decont' AS tabla, count(*) FROM public.decont
UNION ALL SELECT 'dispozitie', count(*) FROM public.dispozitie
UNION ALL SELECT 'sorszam', count(*) FROM public.penzugyi_bizonylat_sorszam;

-- Próba: next_bizonylat_szam (cseréld ki egy valós congregation_id-re):
-- SELECT public.next_bizonylat_szam('00000000-0000-0000-0000-000000000000'::uuid, 2026, 'decont');
