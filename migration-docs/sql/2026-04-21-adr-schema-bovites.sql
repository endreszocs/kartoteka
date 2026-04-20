-- ══════════════════════════════════════════════════════════════════
-- 2026-04-21 — Romániai cím-hierarchia schema bővítés
-- ──────────────────────────────────────────────────────────────────
-- CÉL:
--   A meglévő `adrcountry`, `adrcounty`, `adrlocality`, `adrstreet` táblák
--   bővítése kétnyelvű (HU+RO) nevekkel, hivatalos azonosítókkal
--   (SIRUTA-kód, GeoNames-ID) és default postakóddal.
--
--   Továbbá új tábla `adrlocality_alias` — a fuzzy-match támogatásához:
--   ha egy lelkész "Telek"-et ír be és van "Orbaitelek", a rendszer
--   rákérdez.
--
-- BACKWARD KOMPAT:
--   A régi `name` oszlop mindhárom táblán megmarad (más kód használja).
--   Az új lekérdezések `COALESCE(name_hu, name_ro, name)` mintát használnak.
--
-- BIZTONSÁG:
--   Minden ADD COLUMN IF NOT EXISTS. Idempotens, újrafuttatható.
--
-- FORRÁS:
--   - Felhasználói kérés 2026-04-20: hivatalos romániai cím-adat
--   - Terv: onboarding A/B/C fázis után, cím-hierarchia csomag
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- 1) ADRCOUNTRY — kétnyelvű nevek
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.adrcountry
  ADD COLUMN IF NOT EXISTS name_hu text,
  ADD COLUMN IF NOT EXISTS name_ro text;

COMMENT ON COLUMN public.adrcountry.name_hu IS 'Ország magyar neve (pl. Románia, Magyarország)';
COMMENT ON COLUMN public.adrcountry.name_ro IS 'Ország román neve (pl. România, Ungaria)';

-- ───────────────────────────────────────────────────────────────────
-- 2) ADRCOUNTY — kétnyelvű nevek + autókód (CV, HR, MS, stb.)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.adrcounty
  ADD COLUMN IF NOT EXISTS name_hu text,
  ADD COLUMN IF NOT EXISTS name_ro text,
  ADD COLUMN IF NOT EXISTS auto_code text,
  ADD COLUMN IF NOT EXISTS siruta_code text;

COMMENT ON COLUMN public.adrcounty.name_hu IS 'Megye magyar neve (pl. Kovászna, Hargita)';
COMMENT ON COLUMN public.adrcounty.name_ro IS 'Megye román neve (pl. Covasna, Harghita)';
COMMENT ON COLUMN public.adrcounty.auto_code IS 'Autó rendszámcód (CV, HR, MS, CJ, BH, stb.)';
COMMENT ON COLUMN public.adrcounty.siruta_code IS 'SIRUTA közigazgatási azonosító (2-jegyű, pl. 14 = Kovászna)';

-- ───────────────────────────────────────────────────────────────────
-- 3) ADRLOCALITY — kétnyelvű + SIRUTA + GeoNames + default postakód
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.adrlocality
  ADD COLUMN IF NOT EXISTS name_hu text,
  ADD COLUMN IF NOT EXISTS name_ro text,
  ADD COLUMN IF NOT EXISTS siruta_code text,
  ADD COLUMN IF NOT EXISTS geonames_id integer,
  ADD COLUMN IF NOT EXISTS default_postalcode text,
  ADD COLUMN IF NOT EXISTS feature_code text;

COMMENT ON COLUMN public.adrlocality.name_hu IS 'Helység magyar neve (ha van; pl. Barót, Kolozsvár)';
COMMENT ON COLUMN public.adrlocality.name_ro IS 'Helység román neve (pl. Baraolt, Cluj-Napoca)';
COMMENT ON COLUMN public.adrlocality.siruta_code IS 'SIRUTA kód (6-jegyű, pl. 064052 = Barót)';
COMMENT ON COLUMN public.adrlocality.geonames_id IS 'GeoNames.org ID (a jövőbeli frissítéshez)';
COMMENT ON COLUMN public.adrlocality.default_postalcode IS 'Default postakód — kistelepüléseknél ez elég, nagyvárosoknál az utca pontosít';
COMMENT ON COLUMN public.adrlocality.feature_code IS 'GeoNames feature code: PPL (city), PPLA (county seat), PPLA2 (municipality), stb.';

-- Unique indexek az új azonosítókra (nem unique constraint — régi sorok
-- lehetnek még NULL értékkel)
CREATE UNIQUE INDEX IF NOT EXISTS adrlocality_siruta_uq
  ON public.adrlocality (siruta_code)
  WHERE siruta_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS adrlocality_geonames_uq
  ON public.adrlocality (geonames_id)
  WHERE geonames_id IS NOT NULL;

-- Search index — helység-autocomplete-hez
CREATE INDEX IF NOT EXISTS adrlocality_search_hu
  ON public.adrlocality (lower(name_hu))
  WHERE name_hu IS NOT NULL;

CREATE INDEX IF NOT EXISTS adrlocality_search_ro
  ON public.adrlocality (lower(name_ro))
  WHERE name_ro IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────
-- 4) ADRSTREET — kétnyelvű utca név (a postakód már van)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.adrstreet
  ADD COLUMN IF NOT EXISTS name_hu text,
  ADD COLUMN IF NOT EXISTS name_ro text,
  ADD COLUMN IF NOT EXISTS street_type_hu text,
  ADD COLUMN IF NOT EXISTS street_type_ro text;

COMMENT ON COLUMN public.adrstreet.name_hu IS 'Utca magyar neve (ha van)';
COMMENT ON COLUMN public.adrstreet.name_ro IS 'Utca román neve (hivatalos)';
COMMENT ON COLUMN public.adrstreet.street_type_hu IS 'Utca típus magyarul (utca, tér, út, sétány)';
COMMENT ON COLUMN public.adrstreet.street_type_ro IS 'Utca típus románul (Stradă, Piaţa, Şosea, Bulevard)';

-- Search index — utca-autocomplete-hez
CREATE INDEX IF NOT EXISTS adrstreet_locality_search
  ON public.adrstreet (localityid, lower(name_ro));

-- ───────────────────────────────────────────────────────────────────
-- 5) ADRLOCALITY_ALIAS — fuzzy match-hez
-- "Telek" → rákérdez "Orbaitelek"-re
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.adrlocality_alias (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  adrlocality_id integer NOT NULL,
  alias_name text NOT NULL,
  lang text,                      -- 'hu' | 'ro' | 'de' | 'en' | 'historic'
  source text,                    -- 'geonames' | 'manual' | 'historic'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adrlocality_alias_pkey PRIMARY KEY (id),
  CONSTRAINT adrlocality_alias_locality_fk
    FOREIGN KEY (adrlocality_id) REFERENCES public.adrlocality(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.adrlocality_alias IS
  'Helység név-alias (pl. "Orbaitelek" alias "Telek"). A fuzzy search ezen keresztül is egyezik.';

-- Search index
CREATE INDEX IF NOT EXISTS adrlocality_alias_search
  ON public.adrlocality_alias (lower(alias_name));

CREATE INDEX IF NOT EXISTS adrlocality_alias_locality
  ON public.adrlocality_alias (adrlocality_id);

-- GRANT + RLS — reference adatok, authenticated SELECT, admin módosítás
GRANT SELECT ON public.adrlocality_alias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adrlocality_alias TO service_role;

ALTER TABLE public.adrlocality_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adrlocality_alias_read ON public.adrlocality_alias;
CREATE POLICY adrlocality_alias_read
  ON public.adrlocality_alias FOR SELECT
  TO authenticated
  USING (true);

-- ───────────────────────────────────────────────────────────────────
-- 6) CONGREGATIONS — FK-k a cím-hierarchiához (opcionális)
-- A meglévő szöveges mezők (megye, varos, cim) fallback-nek megmaradnak.
-- Az új FK-k akkor aktívak, ha a wizard a dropdown-ból választ.
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS adrlocality_id integer,
  ADD COLUMN IF NOT EXISTS adrstreet_id integer;

-- FK-k csak akkor, ha még nem léteznek
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'congregations'
      AND constraint_name = 'congregations_adrlocality_fk'
  ) THEN
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_adrlocality_fk
        FOREIGN KEY (adrlocality_id) REFERENCES public.adrlocality(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'congregations'
      AND constraint_name = 'congregations_adrstreet_fk'
  ) THEN
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_adrstreet_fk
        FOREIGN KEY (adrstreet_id) REFERENCES public.adrstreet(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.congregations.adrlocality_id IS
  'Hivatalos helység-azonosító (az új wizard ezt tölti ki). Null ha a lelkész szöveges mezőt használ (pl. külföldi cím).';
COMMENT ON COLUMN public.congregations.adrstreet_id IS
  'Hivatalos utca-azonosító. Null ha a lelkész szöveges mezőt használ.';

-- ───────────────────────────────────────────────────────────────────
-- 7) DIOCESES — ugyanez
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.dioceses
  ADD COLUMN IF NOT EXISTS adrlocality_id integer,
  ADD COLUMN IF NOT EXISTS adrstreet_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'dioceses'
      AND constraint_name = 'dioceses_adrlocality_fk'
  ) THEN
    ALTER TABLE public.dioceses
      ADD CONSTRAINT dioceses_adrlocality_fk
        FOREIGN KEY (adrlocality_id) REFERENCES public.adrlocality(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'dioceses'
      AND constraint_name = 'dioceses_adrstreet_fk'
  ) THEN
    ALTER TABLE public.dioceses
      ADD CONSTRAINT dioceses_adrstreet_fk
        FOREIGN KEY (adrstreet_id) REFERENCES public.adrstreet(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- ELLENŐRZÉSEK — a feedback_sql_ellenorzes_egyben.md alapelv szerint
-- ══════════════════════════════════════════════════════════════════

-- [1/5] Új adrcountry oszlopok — elvárás: 2 sor
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'adrcountry'
  AND column_name IN ('name_hu', 'name_ro')
ORDER BY column_name;

-- [2/5] Új adrcounty oszlopok — elvárás: 4 sor
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'adrcounty'
  AND column_name IN ('name_hu', 'name_ro', 'auto_code', 'siruta_code')
ORDER BY column_name;

-- [3/5] Új adrlocality oszlopok — elvárás: 6 sor
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'adrlocality'
  AND column_name IN ('name_hu', 'name_ro', 'siruta_code', 'geonames_id', 'default_postalcode', 'feature_code')
ORDER BY column_name;

-- [4/5] Új adrlocality_alias tábla létezik? Elvárás: 1 sor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'adrlocality_alias';

-- [5/5] FK congregations + dioceses az adrlocality + adrstreet-re — elvárás: 4 sor
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND constraint_name IN (
    'congregations_adrlocality_fk',
    'congregations_adrstreet_fk',
    'dioceses_adrlocality_fk',
    'dioceses_adrstreet_fk'
  )
ORDER BY constraint_name;
