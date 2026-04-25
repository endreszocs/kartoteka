-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.9a — LÉPÉS 1: DIAGNOSZTIKA (csak SELECT, NINCS módosítás)
--  Dátum: 2026-04-25
--  Futtatás: Endre → Supabase SQL Editor (FUTTASD ELŐSZÖR EZT)
--
--  CÉL:
--    Megmutatni az összes duplikált Készpénzes iratszámot a `befizetes` és
--    `kiadas` táblákban — a defensive UNIQUE INDEX-eket (LÉPÉS 3) addig
--    nem lehet ráadni, amíg a duplikációk nincsenek rendezve.
--
--  HOGYAN HASZNÁLD:
--    1. Futtasd az egész fájlt a Supabase SQL Editorban
--    2. Görgesd át a 3 SELECT eredményét
--    3. Az ÖSSZESÍTŐ szám alapján döntsd el: lépés 2A vagy 2B (vagy kézi)
--    4. Alaposan nézd meg minden duplikált sort — két különálló tétel (csak
--       elgépelt iratszám)? Vagy ugyanaz a tétel kétszer rögzítve?
--    5. Folytasd a megfelelő LÉPÉS 2 fájllal (rendezés), majd LÉPÉS 3 (index)
--
--  NINCS COMMIT, NINCS BEGIN — csak SELECT-ek. Ártalmatlan, ismételhető.
-- ════════════════════════════════════════════════════════════════════════════


SELECT '════ ÖSSZESÍTŐ — duplikált iratszám-csoportok ═════════════════════' AS section;

-- Hány duplikált csoport van (befizetés + kiadás külön)
SELECT
  'befizetes'                                                AS tabla,
  COUNT(*)                                                    AS duplikalt_csoportok,
  SUM(db_szam)                                                AS erintett_sorok,
  SUM(db_szam - 1)                                            AS torlendo_vagy_ujra_szamozando
FROM (
  SELECT congregation_id, fizetettev, iratszam, COUNT(*) AS db_szam
    FROM public.befizetes
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, fizetettev, iratszam
  HAVING COUNT(*) > 1
) AS dups
UNION ALL
SELECT
  'kiadas'                                                    AS tabla,
  COUNT(*)                                                    AS duplikalt_csoportok,
  SUM(db_szam)                                                AS erintett_sorok,
  SUM(db_szam - 1)                                            AS torlendo_vagy_ujra_szamozando
FROM (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::integer AS ev, iratszam, COUNT(*) AS db_szam
    FROM public.kiadas
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, EXTRACT(YEAR FROM datum), iratszam
  HAVING COUNT(*) > 1
) AS dups;
-- Várt: két sor (befizetes és kiadas). Ha mindkét `duplikalt_csoportok` = 0,
-- akkor ugorhatsz egyenesen a LÉPÉS 3-ra (UNIQUE INDEX).


SELECT '════ BEFIZETÉS duplikátumok — soronként, teljes részletek ═════════' AS section;

-- A duplikált befizetés-sorok teljes adatai
WITH dup_keys AS (
  SELECT congregation_id, fizetettev, iratszam
    FROM public.befizetes
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, fizetettev, iratszam
  HAVING COUNT(*) > 1
)
SELECT
  COALESCE(c.nev_hu, c.name)                     AS gyulekezet,
  b.fizetettev,
  b.iratszam,
  b.id                                           AS befizetes_id,
  b.datum,
  b.osszeg,
  bc.nev                                         AS kategoria,
  COALESCE(sz.csaladnev || ' ' || sz.k_nev, '(ismeretlen)') AS tag_nev,
  b.id_szemely,
  b.id_csalad,
  b.csalad                                       AS csalad_szintu,
  b.megjegyzes,
  b.created                                      AS rogzitve,
  b.userid                                       AS rogzito_user,
  b.stornozott,
  -- A „legkisebb id" (legrégibb) jelzése — ez marad meg a rendezés után
  CASE
    WHEN b.id = (
      SELECT MIN(id)
        FROM public.befizetes b2
       WHERE b2.congregation_id = b.congregation_id
         AND b2.fizetettev      = b.fizetettev
         AND b2.iratszam        = b.iratszam
         AND b2.deleted = false
         AND b2.irattipus ILIKE '%észpénz%'
         AND b2.belso_mozgas_xkey IS NULL
    )
    THEN '✅ legrégibb (megmarad)'
    ELSE '⚠ újabb (új iratszám VAGY soft-delete)'
  END                                            AS rendezesi_javaslat
FROM public.befizetes b
JOIN dup_keys d
  ON d.congregation_id = b.congregation_id
 AND d.fizetettev      = b.fizetettev
 AND d.iratszam        = b.iratszam
LEFT JOIN public.congregations c ON c.id = b.congregation_id
LEFT JOIN public.szemely sz      ON sz.id = b.id_szemely
LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
WHERE b.deleted = false
  AND b.irattipus ILIKE '%észpénz%'
  AND b.belso_mozgas_xkey IS NULL
ORDER BY COALESCE(c.nev_hu, c.name), b.fizetettev, b.iratszam, b.id;


SELECT '════ KIADÁS duplikátumok — soronként, teljes részletek ════════════' AS section;

WITH dup_keys AS (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::integer AS ev, iratszam
    FROM public.kiadas
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, EXTRACT(YEAR FROM datum), iratszam
  HAVING COUNT(*) > 1
)
SELECT
  COALESCE(c.nev_hu, c.name)                     AS gyulekezet,
  EXTRACT(YEAR FROM k.datum)::integer            AS ev,
  k.iratszam,
  k.id                                           AS kiadas_id,
  k.datum,
  k.osszeg,
  kc.nev                                         AS kategoria,
  COALESCE(k.atvevo, sz.csaladnev || ' ' || sz.k_nev, '(ismeretlen)') AS atvevo,
  k.atvevoid,
  k.kedvezmenyezett_cui,
  k.megjegyzes,
  k.created                                      AS rogzitve,
  k.userid                                       AS rogzito_user,
  k.stornozott,
  CASE
    WHEN k.id = (
      SELECT MIN(id)
        FROM public.kiadas k2
       WHERE k2.congregation_id = k.congregation_id
         AND EXTRACT(YEAR FROM k2.datum) = EXTRACT(YEAR FROM k.datum)
         AND k2.iratszam        = k.iratszam
         AND k2.deleted = false
         AND k2.irattipus ILIKE '%észpénz%'
         AND k2.belso_mozgas_xkey IS NULL
    )
    THEN '✅ legrégibb (megmarad)'
    ELSE '⚠ újabb (új iratszám VAGY soft-delete)'
  END                                            AS rendezesi_javaslat
FROM public.kiadas k
JOIN dup_keys d
  ON d.congregation_id           = k.congregation_id
 AND d.ev                        = EXTRACT(YEAR FROM k.datum)::integer
 AND d.iratszam                  = k.iratszam
LEFT JOIN public.congregations c ON c.id = k.congregation_id
LEFT JOIN public.szemely sz      ON sz.id = k.atvevoid
LEFT JOIN public.kiadascel kc    ON kc.id = k.id_kiadascel
WHERE k.deleted = false
  AND k.irattipus ILIKE '%észpénz%'
  AND k.belso_mozgas_xkey IS NULL
ORDER BY COALESCE(c.nev_hu, c.name), EXTRACT(YEAR FROM k.datum), k.iratszam, k.id;


-- ════════════════════════════════════════════════════════════════════════════
--  KÖVETKEZŐ LÉPÉS — döntsd el a stratégiát:
--
--  STRATÉGIA 2A — auto-újraszámozás
--    Ha a duplikációk valós különálló tételek (csak elgépelt iratszám):
--    a fiatalabb sor új max+1 iratszámot kap, az adatok megmaradnak.
--    → Futtasd: 2026-04-25-a-m7-9a-LEPES-2A-AUTO-UJRASZAMOZAS.sql
--
--  STRATÉGIA 2B — soft-delete a duplikátumokra
--    Ha a duplikációk hibás rögzítések (ugyanaz a tétel kétszer):
--    a fiatalabb sor deleted=true + magyarázó megjegyzés.
--    → Futtasd: 2026-04-25-a-m7-9a-LEPES-2B-AUTO-SOFT-DELETE.sql
--
--  KÉZI RENDEZÉS
--    Ha vegyes — egyenként át kell nézni. Példa:
--      UPDATE public.befizetes SET iratszam = '887b' WHERE id = <konkrét-id>;
--    Addig, amíg a LÉPÉS 1 ÖSSZESÍTŐ-je 0-t ad.
--
--  SKIP — csak az iratszam-pointers + RPC kell, az UNIQUE INDEX nem
--    A write-offline rendszer már működik. Az UNIQUE INDEX csak extra
--    paranoiás védelem szerver-szinten, nem kötelező.
--    → NE futtasd a LÉPÉS 3-at.
--
--  Ha a 2A vagy 2B futott, ÉS a LÉPÉS 1-et újra futtatva 0-t ad → LÉPÉS 3.
-- ════════════════════════════════════════════════════════════════════════════
