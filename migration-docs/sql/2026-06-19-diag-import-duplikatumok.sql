-- ============================================================================
-- DIAGNOSZTIKA — Meglévő befizetés-duplikátumok (idempotens UNIQUE index ELŐTT)
-- 2026-06-19
--
-- CÉL: egy parciális UNIQUE index csak akkor hozható létre BIZTONSÁGOSAN, ha nincs
--   ütköző (duplikált) sor — különben a CREATE INDEX elhasal. Ez a fájl kimutatja
--   az ütközéseket, hogy előbb rendezni lehessen őket. CSAK OLVAS — nem módosít.
--
-- Kulcs, amire a tervezett index épülne (egyhf-import dedup, P1-5):
--   (congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, COALESCE(id_szemely,-1))
--   WHERE deleted = false
-- Az üres iratszámú sorokat kihagyjuk (azokat ez a kulcs nem dedupálja).
-- ============================================================================

-- A) "LAZA" kulcs (személy NÉLKÜL). Ami itt >1, az LEHET valós külön befizetés
--    (pl. tömbös nyugtán két ember azonos összeggel) VAGY igazi duplikátum.
--    Csak tájékoztató — NE ez alapján törölj.
SELECT congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, count(*) AS db
FROM befizetes
WHERE deleted = false
  AND coalesce(stornozott, false) = false
  AND coalesce(btrim(iratszam), '') <> ''
GROUP BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel
HAVING count(*) > 1
ORDER BY db DESC, fizetettev DESC
LIMIT 200;

-- B) "SZEMÉLY-TUDATOS" kulcs (+ COALESCE(id_szemely,-1)). Ami ITT >1, az IGAZI
--    duplikátum: ugyanaz a személy, összeg, nyugta, cél, év. Ezeket rendezni kell
--    (törölni/sztornózni a felesleget) MIELŐTT a UNIQUE index létrejöhet.
SELECT congregation_id, fizetettev, iratszam, osszeg, id_befizetescel,
       coalesce(id_szemely, -1) AS szemely, count(*) AS db
FROM befizetes
WHERE deleted = false
  AND coalesce(stornozott, false) = false
  AND coalesce(btrim(iratszam), '') <> ''
GROUP BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, coalesce(id_szemely, -1)
HAVING count(*) > 1
ORDER BY db DESC, fizetettev DESC
LIMIT 200;

-- C) ÖSSZESÍTŐ: hány ütköző CSOPORT van a két kulcs szerint.
--    Ha a "szemely_kulcs_utkozo_csoport" = 0 → a személy-tudatos UNIQUE index
--    biztonságosan létrehozható. Ha > 0 → előbb a B) listát kell rendezni.
SELECT
  (SELECT count(*) FROM (
     SELECT 1 FROM befizetes
     WHERE deleted = false AND coalesce(stornozott, false) = false
       AND coalesce(btrim(iratszam), '') <> ''
     GROUP BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel
     HAVING count(*) > 1
   ) x) AS laza_kulcs_utkozo_csoport,
  (SELECT count(*) FROM (
     SELECT 1 FROM befizetes
     WHERE deleted = false AND coalesce(stornozott, false) = false
       AND coalesce(btrim(iratszam), '') <> ''
     GROUP BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, coalesce(id_szemely, -1)
     HAVING count(*) > 1
   ) y) AS szemely_kulcs_utkozo_csoport;

-- D) A személy-tudatos kulcs IGAZI duplikátum-SORAI (a tényleges rekordok, hogy
--    el lehessen dönteni, melyik maradjon). A legkorábbi id marad javasolt.
WITH dup AS (
  SELECT id, congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, id_szemely, forrasa, datum,
         row_number() OVER (
           PARTITION BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, coalesce(id_szemely, -1)
           ORDER BY id
         ) AS rn,
         count(*) OVER (
           PARTITION BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, coalesce(id_szemely, -1)
         ) AS grp_db
  FROM befizetes
  WHERE deleted = false
    AND coalesce(stornozott, false) = false
    AND coalesce(btrim(iratszam), '') <> ''
)
SELECT id, congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, id_szemely, forrasa, datum,
       rn AS sorszam_a_csoportban, grp_db AS csoport_merete
FROM dup
WHERE grp_db > 1
ORDER BY congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, coalesce(id_szemely, -1), rn
LIMIT 500;
