-- ============================================================================
-- 2026-06-12b — KRITIKUS oszlop-bővítések (a 2026-06-12a diagnoszt eredménye)
-- ============================================================================
-- Endre futtatja. A diagnoszt kimutatta:
--   1. szemely.kep = varchar(30) — az avatar Storage-URL-je ~120+ karakter,
--      e nélkül a fénykép-mentés „value too long for type character
--      varying(30)" hibával bukik! → TEXT-re bővítjük.
--   2. befizetes.xkey + kiadas.xkey = varchar(20) — a kód mostantól 20
--      karakteres kulcsot generál (a 36-os UUID buktatta a desktop-rögzítést),
--      de az oszlopot TEXT-re bővítjük, hogy a jövőben se lehessen gond.
-- Az oszlop-bővítés (varchar → text) Postgresben metaadat-művelet: gyors,
-- adatvesztés nélküli, a meglévő értékeket nem érinti.
-- ============================================================================

ALTER TABLE public.szemely   ALTER COLUMN kep  TYPE text;
ALTER TABLE public.befizetes ALTER COLUMN xkey TYPE text;
ALTER TABLE public.kiadas    ALTER COLUMN xkey TYPE text;

-- Ellenőrzés (ez az egyetlen eredmény-tábla):
SELECT table_name, column_name, data_type, character_maximum_length
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'szemely' AND column_name = 'kep')
     OR (table_name IN ('befizetes', 'kiadas') AND column_name = 'xkey'))
 ORDER BY table_name;
