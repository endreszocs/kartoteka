-- ============================================================================
-- PR-40 — index-ellenőrzés, MÁSODIK nekifutás (csak OLVAS)
-- 2026-08-04
--
-- Az előző fájlban két lekérdezés volt, és a Supabase SQL Editor mindig csak
-- az UTOLSÓ eredményét mutatja — ezért az index-táblázat nem jött vissza.
-- Ebben a fájlban EGYETLEN lekérdezés van.
--
-- MIT MOND MEG: a `csalad` tábla egyediségi szabálya a PÁROSRA vonatkozik-e
-- (id_ferfi, id_no), vagy személyenként külön (id_ferfi), (id_no).
-- ============================================================================

SELECT
  i.relname                      AS index_neve,
  ix.indisunique                 AS egyedi_e,
  pg_get_indexdef(ix.indexrelid) AS index_definicio
FROM pg_index ix
JOIN pg_class i     ON i.oid = ix.indexrelid
JOIN pg_class t     ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'csalad'
ORDER BY ix.indisunique DESC, i.relname;
