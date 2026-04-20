-- =========================================================================
-- 2026-04-18 — befizetes + kiadas stornó mezők
-- =========================================================================
-- CÉL:
--   A pénzügyi tételeket lehessen STORNÓZNI (nem csak törölni) — indoklással,
--   időponttal, és a stornó végrehajtójának rögzítésével.
--
--   STORNÓ != TÖRLÉS:
--     - Törlés (deleted = true): a rekord eltűnik a látható listából
--     - Stornó: a rekord marad, de láthatóan megjelölve "Stornózva — indok"
--       felirattal; a számításokból (egyenleg, összesítő) kimarad
--
-- Új mezők mindkét táblán:
--   - stornozott               boolean  DEFAULT false
--   - stornozott_at            timestamptz
--   - stornozott_indok         text
--   - stornozott_by            uuid (FK profiles.id)
--
-- Idempotens — újrafuttatható.
-- =========================================================================

BEGIN;

-- 1) befizetes stornó oszlopok
ALTER TABLE public.befizetes
  ADD COLUMN IF NOT EXISTS stornozott boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stornozott_at timestamptz,
  ADD COLUMN IF NOT EXISTS stornozott_indok text,
  ADD COLUMN IF NOT EXISTS stornozott_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.befizetes.stornozott IS
  'true, ha a tétel stornózva lett (kimarad a számításokból, de látható a listában)';
COMMENT ON COLUMN public.befizetes.stornozott_indok IS
  'A stornó indoklása — kötelező megadni stornózáskor';

-- 2) kiadas stornó oszlopok
ALTER TABLE public.kiadas
  ADD COLUMN IF NOT EXISTS stornozott boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stornozott_at timestamptz,
  ADD COLUMN IF NOT EXISTS stornozott_indok text,
  ADD COLUMN IF NOT EXISTS stornozott_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.kiadas.stornozott IS
  'true, ha a tétel stornózva lett (kimarad a számításokból, de látható a listában)';
COMMENT ON COLUMN public.kiadas.stornozott_indok IS
  'A stornó indoklása — kötelező megadni stornózáskor';

-- 3) Index a stornozott szűréshez (listázás, riport)
CREATE INDEX IF NOT EXISTS befizetes_stornozott_idx
  ON public.befizetes (congregation_id, stornozott)
  WHERE stornozott = true;

CREATE INDEX IF NOT EXISTS kiadas_stornozott_idx
  ON public.kiadas (congregation_id, stornozott)
  WHERE stornozott = true;

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

SELECT
  'befizetes.stornozott' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='befizetes' AND column_name='stornozott'
  ) AS result
UNION ALL
SELECT
  'befizetes.stornozott_indok',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='befizetes' AND column_name='stornozott_indok'
  )
UNION ALL
SELECT
  'kiadas.stornozott',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='kiadas' AND column_name='stornozott'
  )
UNION ALL
SELECT
  'kiadas.stornozott_indok',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='kiadas' AND column_name='stornozott_indok'
  );
