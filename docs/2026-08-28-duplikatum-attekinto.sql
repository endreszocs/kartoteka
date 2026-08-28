-- ============================================================================
-- 2026-08-28 · Duplikátum-ÁTNÉZŐ (P0-8/P0-9 múltbeli áldozatai) — CSAK OLVAS
-- ============================================================================
-- Az A-blokk diagnosztikájának 10. sora 11 befizetés- és 10 kiadás-
-- TÖBBLETsort mért: minden azonosító mező (gyülekezet, dátum, összeg, jogcím,
-- partner, nyugta, iratszám) azonos. Ezek a most már javított dupla-mentés /
-- részleges-köteg hibák valószínű áldozatai — DE lehetnek jogos ismétlések is
-- (pl. egy nyugtán két azonos összegű befizetés két személytől úgy, hogy a
-- személy-mező üres).
--
-- EZ A LEKÉRDEZÉS SEMMIT NEM MÓDOSÍT. Tételes átnézésre való: minden
-- duplikátum-csoport MINDEN sora látszik (id-vel, rögzítés idejével).
-- A döntés Endréé: melyik csoport valódi duplikátum → azokat a felületről
-- stornózni/törölni érdemes (vagy külön megbeszélt takarító-SQL-lel).
--
-- Futtatás: Supabase SQL editor, egyben — egyetlen rács.
-- ============================================================================

WITH bef_csoport AS (
  SELECT congregation_id, datum, osszeg, id_befizetescel, forrasa, nyugta, iratszam
  FROM public.befizetes
  WHERE deleted = false AND stornozott = false
  GROUP BY congregation_id, datum, osszeg, id_befizetescel, forrasa, nyugta, iratszam
  HAVING count(*) > 1
),
kia_csoport AS (
  SELECT congregation_id, datum, osszeg, id_kiadascel, atvevo, nyugta, iratszam
  FROM public.kiadas
  WHERE deleted = false AND stornozott = false
  GROUP BY congregation_id, datum, osszeg, id_kiadascel, atvevo, nyugta, iratszam
  HAVING count(*) > 1
)
SELECT * FROM (
  SELECT
    'befizetes' AS tabla,
    b.id,
    b.datum::text AS datum,
    b.osszeg::text AS osszeg,
    c.nev AS jogcim,
    b.forrasa AS partner,
    b.nyugta,
    b.iratszam,
    b.created::text AS rogzitve,
    b.id_szemely::text AS szemely_id
  FROM public.befizetes b
  JOIN bef_csoport g
    ON g.congregation_id IS NOT DISTINCT FROM b.congregation_id
   AND g.datum = b.datum
   AND g.osszeg = b.osszeg
   AND g.id_befizetescel = b.id_befizetescel
   AND g.forrasa IS NOT DISTINCT FROM b.forrasa
   AND g.nyugta IS NOT DISTINCT FROM b.nyugta
   AND g.iratszam IS NOT DISTINCT FROM b.iratszam
  LEFT JOIN public.befizetescel c ON c.id = b.id_befizetescel
  WHERE b.deleted = false AND b.stornozott = false

  UNION ALL

  SELECT
    'kiadas',
    k.id,
    k.datum::text,
    k.osszeg::text,
    kc.nev,
    k.atvevo,
    k.nyugta,
    k.iratszam,
    k.created::text,
    NULL
  FROM public.kiadas k
  JOIN kia_csoport g
    ON g.congregation_id IS NOT DISTINCT FROM k.congregation_id
   AND g.datum = k.datum
   AND g.osszeg = k.osszeg
   AND g.id_kiadascel = k.id_kiadascel
   AND g.atvevo IS NOT DISTINCT FROM k.atvevo
   AND g.nyugta IS NOT DISTINCT FROM k.nyugta
   AND g.iratszam IS NOT DISTINCT FROM k.iratszam
  WHERE k.deleted = false AND k.stornozott = false
) x
ORDER BY tabla, datum, osszeg, iratszam, id;
