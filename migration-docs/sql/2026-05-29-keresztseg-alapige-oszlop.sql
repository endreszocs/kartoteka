-- 2026-05-29 — keresztseg.alapige oszlop hozzáadása
--
-- Kontextus: A Keresztelés szerkesztése modal és a registry validáció már
-- használja az `alapige` mezőt (a keresztelői igehirdetés alapigéje, pl.
-- "Mk 10,14"), de a DB-ben nem létezett a megfelelő oszlop. Supabase a
-- post-flight schema cache hibával dobta vissza:
--   "Could not find the 'alapige' column of 'keresztseg' in the schema cache"
--
-- Megoldás: hozzáadjuk a hiányzó VARCHAR oszlopot, nullable (a régi rekordoknál
-- üres marad, az újaknál opcionális kitöltés). Az import-profiles.ts már most is
-- az `Alapige` Excel-headert mappeli erre az oszlopra.
--
-- Idempotens (ADD COLUMN IF NOT EXISTS), ismételt futtatás biztonságos.

ALTER TABLE public.keresztseg
  ADD COLUMN IF NOT EXISTS alapige character varying;

COMMENT ON COLUMN public.keresztseg.alapige IS
  'A keresztelői igehirdetés alapigéje (pl. "Mk 10,14"). 2026-05-29 hozzáadva — anyakönyvi szerkesztő + Excel-import + emléklap-generátor használja.';

-- Verifikáció: lekérdezi és megmutatja az új oszlopot a táblán
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'keresztseg'
   AND column_name = 'alapige';
