-- ════════════════════════════════════════════════════════════════════════
-- DIAGNOSZTIKA — dátum −1 napos csúszás a pénzügyi importból  (READ-ONLY)
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-20
--
-- HÁTTÉR: a pénzügyi importáló (Kassza / általános bevétel / egyházfenntartás /
-- bank) a dátumokat a SheetJS `cellDates:true` Date-objektumából olvasta. A SheetJS
-- POZITÍV időzónában (Románia UTC+2/+3 — helyi gép, ASZTALI offline app) a dátum-
-- serialt az ELŐZŐ nap 23:59:xx-ére csúsztatja, így MINDEN importált dátum 1 nappal
-- korábbra került (pl. 2025-01-01 → 2024-12-31). A FELHŐ-web (UTC) importok HELYESEK.
-- A kódhiba 2026-06-20-tól javítva (dateToLocalIso: legközelebbi helyi naphoz kerekít).
--
-- EZ A SCRIPT NEM MÓDOSÍT SEMMIT — csak felméri, van-e már beimportált, elcsúszott adat.
-- Futtasd a Kartotéka Supabase SQL-editorában. Ha egy adott gyülekezetre szűrnél,
-- told be a `congregation_id = '...'` feltételt a WHERE-ekbe.
--
-- FONTOS KORLÁT: a −1 napos csúszás MINDEN dátumot érint, de SQL-ből csak az
-- ÉV-HATÁROS esetek (dec. 31 ↔ jan. 1) ismerhetők fel biztosan (ezek a károsak:
-- rossz ÉV a számadásban). A hónapon belüli csúszás (pl. jan. 8 → jan. 7) SQL-ből
-- nem azonosítható — arra a DÖNTŐ ellenőrzés a fájl ÚJRA-importja a javított kóddal
-- és az összevetés. Az alábbi lekérdezések a gyanús/károsodott köröket szűkítik.


-- ── 1) BEFIZETÉS — dec. 31-i dátumok összesítése (a fő gyanús kör) ──────────
--    Ezek lehetnek valójában a KÖVETKEZŐ év jan. 1-jei tételei (csúszott).
SELECT
  EXTRACT(YEAR FROM datum)::int AS datum_eve,
  fizetettev,
  COUNT(*)                      AS darab,
  SUM(osszeg)                   AS osszeg_osszesen,
  MIN(created)                  AS legkorabbi_rogzites,
  MAX(created)                  AS legkesobbi_rogzites
FROM public.befizetes
WHERE deleted = false
  AND EXTRACT(MONTH FROM datum) = 12
  AND EXTRACT(DAY   FROM datum) = 31
GROUP BY 1, 2
ORDER BY 1 DESC, 2 DESC;


-- ── 2) BEFIZETÉS — ERŐS gyanú: datum az év utolsó napja (dec.31), de a
--    Befizetett év a KÖVETKEZŐ év. A −1 csúszás tipikus lenyomata
--    (a 2025-re szóló tétel 2024-12-31 dátummal). MEGJEGYZÉS: a valódi év végi
--    ELŐREFIZETÉS is így néz ki → ELLENŐRIZD a forrásdokumentummal, ne vakon javíts!
SELECT id, datum, fizetettev, osszeg, nyugta, iratszam, forrasa, created, congregation_id
FROM public.befizetes
WHERE deleted = false
  AND EXTRACT(MONTH FROM datum) = 12
  AND EXTRACT(DAY   FROM datum) = 31
  AND fizetettev = EXTRACT(YEAR FROM datum)::int + 1
ORDER BY created DESC NULLS LAST, id DESC
LIMIT 500;


-- ── 3) BEFIZETÉS — rögzítési (created) napok szerinti klaszterek ────────────
--    Egy IMPORT-batch általában egy időpontban jön létre. Ahol sok tétel egyszerre
--    készült, az valószínűleg importált — ott érdemes a dátumokat újra-importtal
--    egyeztetni. (A datum_min/max segít látni, melyik év fájljáról van szó.)
SELECT
  date_trunc('minute', created) AS rogzites_idopont,
  COUNT(*)                      AS darab,
  MIN(datum)                    AS datum_min,
  MAX(datum)                    AS datum_max,
  COUNT(*) FILTER (
    WHERE EXTRACT(MONTH FROM datum) = 12 AND EXTRACT(DAY FROM datum) = 31
  )                             AS ebbol_dec31
FROM public.befizetes
WHERE deleted = false
  AND created IS NOT NULL
GROUP BY 1
HAVING COUNT(*) >= 5
ORDER BY 1 DESC
LIMIT 200;


-- ── 4) KIADÁS — dec. 31-i dátumok (a kiadas.datum timestamp; ugyanaz a csúszás) ─
SELECT
  EXTRACT(YEAR FROM datum)::int AS datum_eve,
  COUNT(*)                      AS darab,
  SUM(osszeg)                   AS osszeg_osszesen,
  MIN(created)                  AS legkorabbi_rogzites,
  MAX(created)                  AS legkesobbi_rogzites
FROM public.kiadas
WHERE deleted = false
  AND EXTRACT(MONTH FROM datum) = 12
  AND EXTRACT(DAY   FROM datum) = 31
GROUP BY 1
ORDER BY 1 DESC;


-- ── 5) ÖSSZKÉP — dec. 31-i tételek aránya az összes befizetéshez képest ──────
--    Ha ez az arány feltűnően magas (a dec. 31 egy átlagos nap kellene legyen),
--    az a tömeges Jan.1→Dec.31 csúszás jele.
SELECT
  COUNT(*)                                                                   AS befizetes_ossz,
  COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM datum)=12 AND EXTRACT(DAY FROM datum)=31) AS dec31_db,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM datum)=12 AND EXTRACT(DAY FROM datum)=31)
    / NULLIF(COUNT(*), 0), 2)                                                AS dec31_szazalek
FROM public.befizetes
WHERE deleted = false;

-- ════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS:
--  • Ha az 1/2/4/5 lekérdezés ÜRES vagy csak elvétve ad sort → nincs (vagy alig)
--    érintett, év-határon átcsúszott importált adat. (A felhő-importok helyesek;
--    ha eddig csak ott / a teszt-review-ig jutottál, valószínűleg nincs rossz adat.)
--  • Ha a 2. lekérdezés sok sort ad, vagy az 5. dec31_szazalek feltűnően magas
--    egy adott évnél → ott valószínű a tömeges −1 napos csúszás. Jelezd vissza,
--    és készítek egy CÉLZOTT, biztonságos javító UPDATE-et (előbb SELECT-tel
--    kilistázva, mit érintene), VAGY a fájl újra-importja a javított kóddal a
--    legtisztább megoldás (felülírja a helyes dátumokkal).
-- ════════════════════════════════════════════════════════════════════════
