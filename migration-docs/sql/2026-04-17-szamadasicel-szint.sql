-- =========================================================================
-- 2026-04-17 — szamadasicel.szint: gyülekezeti vs egyházmegyei tételek
-- =========================================================================
-- ALAPELV (Endre, 2026-04-17):
--   A pénzügyi rendszerben vannak tételek, amelyek KIZÁRÓLAG az egyházmegyei
--   szinten értelmezhetőek (pl. "Központi járulékok - egyházmegyei bevétel").
--   Ezeket a gyülekezeti felületeken NEM szabad megjeleníteni — különben
--   a lelkész tévesen használhatja őket.
--
-- Megoldás:
--   Új `szint` oszlop a `szamadasicel` táblán: 'gyulekezet' (default), 'egyhazmegye',
--   'kerulet'. A UI a megfelelő szinten szűr.
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- 1) Új oszlop: szint (default = 'gyulekezet')
ALTER TABLE public.szamadasicel
  ADD COLUMN IF NOT EXISTS szint text NOT NULL DEFAULT 'gyulekezet';

-- 2) CHECK constraint a megengedett értékekre
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'szamadasicel_szint_check' AND conrelid = 'public.szamadasicel'::regclass
  ) THEN
    ALTER TABLE public.szamadasicel
      ADD CONSTRAINT szamadasicel_szint_check
      CHECK (szint IN ('gyulekezet', 'egyhazmegye', 'kerulet'));
  END IF;
END$$;

-- 3) Komment dokumentációért
COMMENT ON COLUMN public.szamadasicel.szint IS
  'A számadási tétel hatóköre: gyulekezet (alapértelmezett, gyülekezetnél jelenik meg), egyhazmegye (csak egyházmegyei pénzügyben), kerulet (egyházkerületi pénzügyben).';

-- 4) Az Endre által megadott 18 tétel egyházmegyei szintre állítása
--    Forrás: 2026-04-17 felhasználói lista
UPDATE public.szamadasicel SET szint = 'egyhazmegye'
WHERE nev IN (
  -- Bevételek (type = 'B')
  'Központi járulékok - egyházmegyei bevétel',
  'Egyházközségek fizetésalapja - emei bevétel',
  'Kongrua és járulékai',
  'Biztosítások - bevétel',
  'Missziói segélyek',
  'Bérjövedelmek 10%-a',
  'Bevételek egyházközségek részére',
  'Bevételek a felsőbb egyházi intézmények részére',
  -- Kiadások (type = 'K')
  'Nettó fizetések',
  'Javadalmak utáni adó',
  'Társadalombiztosítás',
  'Egészségügyi biztosítás',
  'Munkabiztosítási hozzájárulás - 2,25%',
  'Biztosítások - kiadás',
  'Kifizetett missziói segélyek',
  'Kifizetett bérjövedelmek 10%-a',
  'Kiadások egyházközségek részére',
  'Kiadások a felsőbb egyházi intézmények részére'
);

-- =========================================================================
-- ELLENŐRZÉS — ugyanitt fut le
-- =========================================================================

-- 1) Az oszlop létezik?
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'szamadasicel'
  AND column_name = 'szint';

-- 2) Hány tétel kapott 'egyhazmegye' szintet? (várt: 18)
SELECT
  szint,
  type,
  COUNT(*) AS db
FROM public.szamadasicel
GROUP BY szint, type
ORDER BY szint, type;

-- 3) Az egyházmegyei tételek — ellenőrzéshez listáljuk őket
SELECT id, nev, type
FROM public.szamadasicel
WHERE szint = 'egyhazmegye'
ORDER BY type, id;

-- 4) Ha valamelyik név nincs meg pontosan, ezzel ellenőrizzük (NULL = nem talált)
SELECT
  expected.nev AS keresett_nev,
  s.id AS megtalalt_kod,
  s.szint AS jelenlegi_szint
FROM (VALUES
  ('Központi járulékok - egyházmegyei bevétel'),
  ('Egyházközségek fizetésalapja - emei bevétel'),
  ('Kongrua és járulékai'),
  ('Biztosítások - bevétel'),
  ('Missziói segélyek'),
  ('Bérjövedelmek 10%-a'),
  ('Bevételek egyházközségek részére'),
  ('Bevételek a felsőbb egyházi intézmények részére'),
  ('Nettó fizetések'),
  ('Javadalmak utáni adó'),
  ('Társadalombiztosítás'),
  ('Egészségügyi biztosítás'),
  ('Munkabiztosítási hozzájárulás - 2,25%'),
  ('Biztosítások - kiadás'),
  ('Kifizetett missziói segélyek'),
  ('Kifizetett bérjövedelmek 10%-a'),
  ('Kiadások egyházközségek részére'),
  ('Kiadások a felsőbb egyházi intézmények részére')
) AS expected(nev)
LEFT JOIN public.szamadasicel s ON s.nev = expected.nev
ORDER BY expected.nev;
-- Ha bármelyik sor megtalalt_kod IS NULL — akkor pontatlan a név, vissza kell jelezni
