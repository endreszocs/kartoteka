-- ============================================================================
-- DIAGNOSZTIKA — Bérleti hátralék "duális párosítás" dupla-számítás a VALÓS adaton
-- 2026-06-19
--
-- HÁTTÉR (Excel-elemzés, Adatok_2025.xlsx): a bérjövedelmek (104.05) így szerepelnek:
--   - Kassza-lapon:  "Név - Cím" formátum (pl. "Bitai József - Híd 37") — személy-azonosítható
--   - Bank-lapon:    nagybetűs név, CÍM NÉLKÜL (pl. "MARK LASZLO") — banki kivonatból
-- A rental-calculation.ts a befizetést a szerződéshez "duálisan" köti:
--   id_szemely-egyezés VAGY forrasa==berlo_nev. Ha MINDKETTŐ igaz ugyanarra a
--   befizetésre+szerződésre → KÉTSZER számít (hátralék alulbecsült).
--
-- Ez az SQL a VALÓS adatból mutatja meg, ténylegesen előfordul-e a dupla-számítás,
-- és mekkora a hatása. CSAK OLVAS. Futtasd külön a 4 lekérdezést.
-- ============================================================================

-- 1) ÁTTEKINTÉS: hány bérleti befizetés (104.04/104.05) van, és mennyinek van id_szemely-je.
SELECT
  count(*)                                          AS rental_befizetes_db,
  count(*) FILTER (WHERE b.id_szemely IS NOT NULL)  AS van_id_szemely,
  count(*) FILTER (WHERE b.id_szemely IS NULL)      AS nincs_id_szemely,
  sum(b.osszeg)                                     AS osszeg_sum
FROM befizetes b
JOIN befizetescel bc ON bc.id = b.id_befizetescel
WHERE bc.id_szamadasicel IN ('104.04', '104.05')
  AND b.deleted = false AND coalesce(b.stornozott, false) = false;

-- 2) DUPLA-SZÁMÍTÁS: mely befizetések illenek egy szerződésre EGYSZERRE id_szemely
--    ÉS név alapján (ezek számolódnak kétszer). Ha üres az eredmény → a bug a
--    gyakorlatban NEM jelentkezik (mert pl. a forrasa címet is tartalmaz, a
--    berlo_nev viszont nem → a név-ág nem talál).
SELECT b.id AS befizetes_id, b.forrasa, b.osszeg, b.fizetettev, b.id_szemely,
       sz.id AS szerzodes_id, sz.berlo_nev
FROM befizetes b
JOIN befizetescel bc ON bc.id = b.id_befizetescel
JOIN berleti_szerzodes sz
  ON sz.congregation_id = b.congregation_id
 AND sz.deleted = false
 AND sz.id_szemely IS NOT NULL
 AND sz.id_szemely = b.id_szemely
 AND lower(btrim(sz.berlo_nev)) = lower(btrim(b.forrasa))
WHERE bc.id_szamadasicel IN ('104.04', '104.05')
  AND b.deleted = false AND coalesce(b.stornozott, false) = false
ORDER BY b.fizetettev DESC, b.osszeg DESC;

-- 3) PÁROSÍTÁSI EGÉSZSÉG: minden bérleti befizetésnél hogyan illeszkedik szerződésre.
--    (csak_id = csak id_szemely-n; csak_nev = csak néven; mindketto = dupla-veszély;
--     egyik_sem = a befizetés EGY szerződéshez sem köthető → hátralék túlbecsülve)
WITH rp AS (
  SELECT b.id, b.congregation_id, b.id_szemely, b.osszeg,
         lower(btrim(b.forrasa)) AS forrasa_key
  FROM befizetes b
  JOIN befizetescel bc ON bc.id = b.id_befizetescel
  WHERE bc.id_szamadasicel IN ('104.04', '104.05')
    AND b.deleted = false AND coalesce(b.stornozott, false) = false
),
m AS (
  SELECT rp.id, rp.osszeg,
    EXISTS (SELECT 1 FROM berleti_szerzodes s
            WHERE s.deleted=false AND s.congregation_id=rp.congregation_id
              AND s.id_szemely IS NOT NULL AND s.id_szemely=rp.id_szemely) AS id_talalat,
    EXISTS (SELECT 1 FROM berleti_szerzodes s
            WHERE s.deleted=false AND s.congregation_id=rp.congregation_id
              AND lower(btrim(s.berlo_nev))=rp.forrasa_key) AS nev_talalat
  FROM rp
)
SELECT
  count(*) FILTER (WHERE id_talalat AND nev_talalat)           AS mindketto_dupla_veszely,
  count(*) FILTER (WHERE id_talalat AND NOT nev_talalat)       AS csak_id_szemely,
  count(*) FILTER (WHERE NOT id_talalat AND nev_talalat)       AS csak_nev,
  count(*) FILTER (WHERE NOT id_talalat AND NOT nev_talalat)   AS egyik_sem,
  sum(osszeg) FILTER (WHERE id_talalat AND nev_talalat)        AS dupla_veszely_osszeg
FROM m;

-- 4) A SZERZŐDÉSEK formátuma: tartalmaz-e a berlo_nev címet (" - "), van-e id_szemely.
--    (ha a berlo_nev cím NÉLKÜLI, a kassza "Név - Cím" forrasa-ja sosem egyezik vele
--     pontosan → a név-ág nem fog dupla-számítást okozni, viszont a cím nélküli
--     id_szemely a megbízható kötés.)
SELECT
  count(*)                                                          AS szerzodes_db,
  count(*) FILTER (WHERE id_szemely IS NOT NULL)                    AS van_id_szemely,
  count(*) FILTER (WHERE berlo_nev LIKE '% - %')                    AS berlo_nev_cimmel,
  count(*) FILTER (WHERE berlo_nev !~ ' - ')                        AS berlo_nev_cim_nelkul
FROM berleti_szerzodes
WHERE deleted = false;
