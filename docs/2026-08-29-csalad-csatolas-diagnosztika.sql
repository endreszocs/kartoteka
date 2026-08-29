-- ═══════════════════════════════════════════════════════════════════════════
-- CSALÁD-CSATOLÁS DIAGNOSZTIKA (2026-08-29) — CSAK OLVAS, semmit nem módosít
--
-- MIÉRT: a „Család csatolása" gomb Kovács Gyulánál nem hozta be a tagokat.
-- A kód-oldali javítás (mindkét család-modell + becsületes visszajelzés)
-- élesben van — ez a lekérdezés azt mutatja meg, MILYEN kapcsolatok élnek
-- az adatbázisban a tag körül, ha a tünet a javítás után is fennállna.
--
-- HASZNÁLAT: írd át a névmintát az 1. sorban, futtasd egyben — egyetlen
-- rács jön vissza, soronként egy-egy kapcsolat.
-- ═══════════════════════════════════════════════════════════════════════════

WITH celszemely AS (
  SELECT id, csaladnev, k_nev, congregation_id
  FROM public.szemely
  WHERE (csaladnev || ' ' || COALESCE(k_nev, '')) ILIKE '%Kovács Gyula%'
)

SELECT * FROM (
  SELECT
    1 AS sorrend,
    'A) a személy maga' AS kapcsolat,
    cs.id::text AS azonosito,
    cs.csaladnev || ' ' || COALESCE(cs.k_nev, '') AS nev,
    NULL::text AS reszletek
  FROM celszemely cs

  UNION ALL
  SELECT
    2,
    'B) legacy csalad-sor (családfőként)',
    c.id::text,
    'férj: ' || COALESCE(c.id_ferfi::text, '—') || ' · feleség: ' || COALESCE(c.id_no::text, '—'),
    'a hiányzó fél oldala üresen marad a tag-listából'
  FROM public.csalad c
  JOIN celszemely cs ON cs.id IN (c.id_ferfi, c.id_no)

  UNION ALL
  SELECT
    3,
    'C) legacy gyerek-sorok (a B-beli családokban)',
    g.id_csalad::text,
    'gyermek szemely-id: ' || COALESCE(g.id_szemely::text, '— (NULL: nem regisztrált személy!)'),
    CASE WHEN g.id_szemely IS NULL
      THEN 'NULL id_szemely → a tag-lista NEM tudja megjeleníteni'
      ELSE NULL END
  FROM public.gyerek g
  WHERE g.id_csalad IN (
    SELECT c.id FROM public.csalad c
    JOIN celszemely cs ON cs.id IN (c.id_ferfi, c.id_no)
  )

  UNION ALL
  SELECT
    4,
    'D) háztartás-tagságai (ÚJ modell)',
    ht.id_haztartas::text,
    'szerep: ' || COALESCE(ht.szerep, '—')
      || ' · érvényes_ig: ' || COALESCE(ht.ervenyes_ig::text, 'NULL (aktív)')
      || ' · háztartás aktív: ' || COALESCE(h.isaktiv::text, 'NULL')
      || ' · legacy_csalad_id: ' || COALESCE(h.legacy_csalad_id::text, 'NULL'),
    CASE
      WHEN ht.ervenyes_ig IS NOT NULL THEN 'LEZÁRT tagság — a feloldó kihagyja'
      WHEN h.isaktiv IS DISTINCT FROM true THEN 'A háztartás NEM aktív — a feloldó kihagyja'
      ELSE NULL
    END
  FROM public.haztartas_tag ht
  JOIN celszemely cs ON cs.id = ht.id_szemely
  LEFT JOIN public.haztartas h ON h.id = ht.id_haztartas

  UNION ALL
  SELECT
    5,
    'E) a háztartásainak ÖSSZES tagja',
    ht2.id_haztartas::text,
    sz.csaladnev || ' ' || COALESCE(sz.k_nev, '')
      || ' (szemely-id: ' || ht2.id_szemely || ', szerep: ' || COALESCE(ht2.szerep, '—') || ')',
    CASE WHEN ht2.ervenyes_ig IS NOT NULL THEN 'LEZÁRT tagság — nem jelenik meg' ELSE NULL END
  FROM public.haztartas_tag ht2
  JOIN public.szemely sz ON sz.id = ht2.id_szemely
  WHERE ht2.id_haztartas IN (
    SELECT ht.id_haztartas FROM public.haztartas_tag ht
    JOIN celszemely cs ON cs.id = ht.id_szemely
    WHERE ht.ervenyes_ig IS NULL
  )
) x
ORDER BY sorrend, azonosito, nev;
