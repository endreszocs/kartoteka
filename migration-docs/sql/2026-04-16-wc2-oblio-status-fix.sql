-- ============================================================================
-- KARTOTEKA WC-2 javítás — e_factura_status ROMÁN értékekre
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Indok: az Oblio API hivatalos doksijának ellenőrzése után (agent kutatás)
-- kiderült, hogy az `einvoice.status` értékek NEM angol (pending/sent/accepted/rejected),
-- hanem ROMÁN:
--   - 'nepreluat' (még nem küldve az SPV-re)
--   - 'in_prelucrare' (ANAF-nál feldolgozás alatt)
--   - 'ok' (sikeres, elfogadva)
--   - 'nok' (elutasítva)
--
-- Megőrizzük a 'not_applicable' értéket is — ez KARTOTEKA-specifikus,
-- a chitanta_papir típusú sorokhoz.
--

BEGIN;

-- 1. Régi CHECK constraint eltávolítása
ALTER TABLE public.oblio_szamlak
  DROP CONSTRAINT IF EXISTS oblio_szamlak_e_factura_status_check;

-- 2. Meglévő adat átmigrálása (ha lenne angol érték — biztonsági lépés)
UPDATE public.oblio_szamlak
SET e_factura_status = CASE e_factura_status
  WHEN 'pending' THEN 'nepreluat'
  WHEN 'sent' THEN 'in_prelucrare'
  WHEN 'accepted' THEN 'ok'
  WHEN 'rejected' THEN 'nok'
  ELSE e_factura_status
END
WHERE e_factura_status IN ('pending', 'sent', 'accepted', 'rejected');

-- 3. Új CHECK constraint
ALTER TABLE public.oblio_szamlak
  ADD CONSTRAINT oblio_szamlak_e_factura_status_check CHECK (
    e_factura_status IS NULL OR e_factura_status = ANY (
      ARRAY[
        'nepreluat'::text,
        'in_prelucrare'::text,
        'ok'::text,
        'nok'::text,
        'not_applicable'::text
      ]
    )
  );

-- 4. Default érték módosítása
ALTER TABLE public.oblio_szamlak
  ALTER COLUMN e_factura_status SET DEFAULT 'nepreluat';

-- 5. Oszlop komment frissítése
COMMENT ON COLUMN public.oblio_szamlak.e_factura_status IS
  $$e-Factura SPV státusz (ROMÁN értékek az Oblio API szerint):
    - nepreluat = még nem küldve az SPV-re
    - in_prelucrare = ANAF-nál feldolgozás alatt
    - ok = sikeres, elfogadva
    - nok = elutasítva
    - not_applicable = KARTOTEKA-specifikus, chitanta_papir típusú sorokra.$$;

COMMIT;


-- ============================================================================
-- ELLENŐRZŐK
-- ============================================================================

-- A) CHECK constraint definíció
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'oblio_szamlak_e_factura_status_check';

-- B) Default érték
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'oblio_szamlak' AND column_name = 'e_factura_status';

-- C) Meglévő sorok eloszlása
SELECT e_factura_status, COUNT(*) AS db
FROM public.oblio_szamlak
GROUP BY e_factura_status
ORDER BY e_factura_status;
