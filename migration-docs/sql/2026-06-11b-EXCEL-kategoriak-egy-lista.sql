-- ============================================================================
-- KARTOTÉKA — Excel-integráció E2: kategória-nevek EGY eredménylistában (read-only)
-- ============================================================================
--
-- A Supabase SQL editor csak az UTOLSÓ SELECT eredményét mutatja, ezért ez a
-- script EGYETLEN lekérdezésbe vonja a bevételi + kiadási kategória-neveket —
-- így egyben kimásolható a teljes lista.
--
-- A belső-mozgás (Készpénzfelvétel/letétel a(z) X számláról/számlára) KIHAGYVA,
-- mert az már igazoltan byte-azonos az Excellel. Itt csak a VALÓS költségvetési
-- kategóriák jönnek — ezeket vetjük össze az Excel `bev`/`kiad` legördülőjével.
--
-- Futtasd, és másold be ide a teljes eredményt (vagy CSV-export).
-- ============================================================================

SELECT irany, kategoria_nev, kod
FROM (
  SELECT 'BEVETEL' AS irany, bc.nev AS kategoria_nev, s.id AS kod
  FROM public.befizetescel bc
  JOIN public.szamadasicel s ON s.id = bc.id_szamadasicel
  WHERE bc.aktiv = true
    AND bc.nev NOT ILIKE 'Készpénz%száml%'   -- belső-mozgás kihagyva
  UNION ALL
  SELECT 'KIADAS' AS irany, kc.nev AS kategoria_nev, s.id AS kod
  FROM public.kiadascel kc
  JOIN public.szamadasicel s ON s.id = kc.id_szamadasicel
  WHERE kc.aktiv = true
    AND kc.nev NOT ILIKE 'Készpénz%száml%'
) t
ORDER BY irany, kod, kategoria_nev;
