-- ══════════════════════════════════════════════════════════════════
-- 2026-04-21 — Gyülekezet-specifikus díjak tábla
-- ──────────────────────────────────────────────────────────────────
-- HÁTTÉR:
--   A lelkész kérte: „minden gyülekezet hozzáadhassa a saját gyülekezet
--   specifikus pénzügyi kéréseit amit a tartozásoknál tud számolni".
--   Példa: sírhely-karbantartási díj, harangozási díj, kántorilletmény.
--
--   Ezek NEM az egyházfenntartási járulékhoz tartoznak, hanem külön tételek,
--   amiket a presbitérium szavaz meg, és a tag a rendszeres járulék mellett
--   fizet. A rendszernek a tartozásnál ezeket is be kell számolnia.
--
-- ADATMODELL:
--   congregation_custom_fees: egy sor = egy gyülekezeti díj-tétel.
--   Egy lelkész létrehozhat több ilyet (pl. „Temetős karbantartás" +
--   „Harangozási díj"). Minden tételhez:
--     - név + leírás (szabad szöveg, magyarázattal)
--     - összeg + valuta (RON default)
--     - érvényesség: mettől-meddig évben (year_from, year_to)
--     - korcsoport: kor_tol / kor_ig (opcionális, pl. csak nagykorúak)
--     - aktiv flag
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- Extension (ha még nincs)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.congregation_custom_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,

  -- Megnevezés + leírás
  name text NOT NULL,                               -- pl. „Temetős karbantartás"
  description text,                                 -- „Minden nagykorú tag évente fizeti — 2025 presbitériumi határozat"

  -- Összeg
  amount numeric NOT NULL CHECK (amount >= 0),      -- 50
  currency text NOT NULL DEFAULT 'RON',

  -- Érvényesség (év szint)
  year_from integer NOT NULL,                       -- 2025 (mettől kötelező)
  year_to integer,                                  -- NULL = örökké (visszavonásig)

  -- Kire vonatkozik (opcionális)
  kor_tol integer,                                  -- pl. 18 (nagykorú) — NULL = mindenki
  kor_ig integer,                                   -- pl. 70 — NULL = felső határ nincs

  -- Állapot
  aktiv boolean NOT NULL DEFAULT true,

  -- Audit
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),

  -- Értelmetlen tartományok tiltása
  CONSTRAINT custom_fees_year_range CHECK (year_to IS NULL OR year_to >= year_from),
  CONSTRAINT custom_fees_age_range CHECK (kor_ig IS NULL OR kor_tol IS NULL OR kor_ig >= kor_tol)
);

CREATE INDEX IF NOT EXISTS custom_fees_congregation_idx
  ON public.congregation_custom_fees (congregation_id);

CREATE INDEX IF NOT EXISTS custom_fees_aktiv_idx
  ON public.congregation_custom_fees (congregation_id, aktiv)
  WHERE aktiv = true;

-- RLS
ALTER TABLE public.congregation_custom_fees ENABLE ROW LEVEL SECURITY;

-- Csak a gyülekezethez tartozó user olvashat / írhat
DROP POLICY IF EXISTS custom_fees_select ON public.congregation_custom_fees;
CREATE POLICY custom_fees_select
  ON public.congregation_custom_fees
  FOR SELECT
  USING (
    congregation_id IN (
      SELECT c.id
      FROM public.congregations c
      JOIN public.profiles p ON p.congregation_id = c.id
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS custom_fees_write ON public.congregation_custom_fees;
CREATE POLICY custom_fees_write
  ON public.congregation_custom_fees
  FOR ALL
  USING (
    congregation_id IN (
      SELECT c.id
      FROM public.congregations c
      JOIN public.profiles p ON p.congregation_id = c.id
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    congregation_id IN (
      SELECT c.id
      FROM public.congregations c
      JOIN public.profiles p ON p.congregation_id = c.id
      WHERE p.id = auth.uid()
    )
  );

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.congregation_custom_fees TO authenticated;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.custom_fees_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custom_fees_updated_at_trigger ON public.congregation_custom_fees;
CREATE TRIGGER custom_fees_updated_at_trigger
  BEFORE UPDATE ON public.congregation_custom_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.custom_fees_updated_at();

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- ELLENŐRZÉSEK
-- ══════════════════════════════════════════════════════════════════

-- [1/3] Tábla létrejött + oszlopok?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'congregation_custom_fees'
ORDER BY ordinal_position;

-- [2/3] RLS aktív?
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'congregation_custom_fees';
-- Elvárás: rls_enabled = true

-- [3/3] Policy-k?
SELECT policyname, cmd, qual IS NOT NULL AS has_qual, with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE tablename = 'congregation_custom_fees'
ORDER BY policyname;
-- Elvárás: 2 policy (custom_fees_select, custom_fees_write)
