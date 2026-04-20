-- ══════════════════════════════════════════════════════════════════
-- 2026-04-21 — congregations cím-mező bővítés
--   iranyitoszam + hazszam + country
--   (A varos, megye, cim már létezik.)
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS iranyitoszam text,
  ADD COLUMN IF NOT EXISTS hazszam text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Románia';

COMMENT ON COLUMN public.congregations.iranyitoszam IS 'Gyülekezet címe: irányítószám (utca vagy helség alapján)';
COMMENT ON COLUMN public.congregations.hazszam IS 'Gyülekezet címe: házszám / blokk+emelet+lakás (szöveges pl. "12", "bl. 4, et. 2, ap. 3")';
COMMENT ON COLUMN public.congregations.country IS 'Gyülekezet címe: ország (default Románia, külföldi esetén változik)';

COMMIT;

-- Ellenőrzés
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'congregations'
  AND column_name IN ('iranyitoszam', 'hazszam', 'country', 'adrlocality_id', 'adrstreet_id')
ORDER BY column_name;
