-- ============================================================================
-- ÁLLAPOTFELMÉRÉS — kétnyelvű elérhetőség-blokk a gyülekezeti weboldalra
-- (2026-08-27)
--
-- CSAK OLVAS. Semmit nem módosít, bármikor futtatható.
--
-- MIÉRT KELL
-- ──────────
-- Endre kérése: az elérhetőség-blokkban jelenjen meg
--   · a gyülekezet neve MAGYARUL és ROMÁNUL
--   · a pontos cím KÉT NYELVEN
--   · a gyülekezeti e-mail és telefon
--   · az egyházmegye és az egyházkerület
--
-- A `nev_ro` oszlopok LÉTEZNEK (congregations, dioceses 2026-08-15 óta,
-- districts 2026-08-16 óta; a megye és a település a cím-törzsben:
-- adrcounty.name_hu/name_ro, adrlocality.name_hu/name_ro).
--
-- ⚠️ DE A PROJEKT SAJÁT NAPLÓJA MÁR RÖGZÍTETTE, hogy ez tipikusan
--    ADATHIÁNY, NEM kódhiba (`2026-08-22-ellenorzo-pont4-pont6.sql`).
--    Ha most vakon megépítjük a kétnyelvű blokkot, és a román nevek üresek,
--    a weboldalon fél-üres sorok jelennének meg — pontosan az a tünet, amit
--    ma egész nap javítottunk. Ezért ELŐBB MÉRÜNK.
--
-- ⚠️ NE FUTTASD EGYBEN! A Supabase SQL editor egy szkriptből CSAK AZ UTOLSÓ
--    lekérdezés rácsát mutatja. Jelöld ki az 1. blokkot → Run → másold ki,
--    aztán a 2.-at, és így tovább. Ha csak egyet futtatsz: az utolsó, ÍTÉLET
--    blokkot.
-- ============================================================================


-- ── 1. A TE gyülekezeted: mi van meg, mi hiányzik? ─────────────────────────
SELECT
  '1. Barátosi — a blokk minden eleme' AS szakasz,
  elem,
  ertek,
  CASE WHEN NULLIF(btrim(ertek), '') IS NULL THEN '❌ HIÁNYZIK' ELSE '✅ megvan' END AS allapot
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
LEFT JOIN public.districts di ON di.id = d.district_id
LEFT JOIN public.adrlocality loc ON loc.id = c.adrlocality_id
LEFT JOIN public.adrcounty cnty ON cnty.id = loc.countyid
CROSS JOIN LATERAL (VALUES
  ('gyülekezet neve — magyar',      c.nev_hu::text),
  ('gyülekezet neve — ROMÁN',       c.nev_ro::text),
  ('utca, házszám',                 btrim(concat_ws(' ', c.cim, c.hazszam))),
  ('irányítószám',                  c.iranyitoszam::text),
  ('település (szabad szöveg)',     c.varos::text),
  ('település — magyar (törzsből)', loc.name_hu),
  ('település — ROMÁN (törzsből)',  loc.name_ro),
  ('megye (szabad szöveg)',         c.megye::text),
  ('megye — magyar (törzsből)',     cnty.name_hu),
  ('megye — ROMÁN (törzsből)',      cnty.name_ro),
  ('e-mail',                        c.email::text),
  ('telefon',                       c.telefon::text),
  ('egyházmegye — magyar',          d.name),
  ('egyházmegye — ROMÁN',           d.nev_ro),
  ('egyházkerület — magyar',        di.name),
  ('egyházkerület — ROMÁN',         di.nev_ro)
) AS t(elem, ertek)
WHERE ps.is_published = true;


-- ── 2. Össze van-e kötve a gyülekezet a cím-törzzsel? ──────────────────────
--     ⚠️ EZ A KULCS: a kétnyelvű település- és megyenév CSAK az
--     `adrlocality_id` kötésen át érhető el. Ha az NULL, a `varos`/`megye`
--     szabad szöveg marad — abból nem lesz román változat.
SELECT
  '2. Cím-törzs kötés' AS szakasz,
  c.nev_hu AS gyulekezet,
  c.adrlocality_id,
  CASE WHEN c.adrlocality_id IS NULL
       THEN '❌ NINCS kötés — nincs kétnyelvű település/megye'
       ELSE '✅ kötve' END AS allapot,
  c.varos AS varos_szabad_szoveg,
  loc.name_hu AS telepules_hu,
  loc.name_ro AS telepules_ro
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
LEFT JOIN public.adrlocality loc ON loc.id = c.adrlocality_id
WHERE ps.is_published = true;


-- ── 3. Mennyire teljes a román névadat ORSZÁGOSAN? ─────────────────────────
--     (Ha csak a te gyülekezetednél hiányzik, az adatpótlás; ha mindenhol,
--      akkor a funkció országosan fél-üres lenne.)
SELECT '3. Román nevek teljessége' AS szakasz, mit, kitoltott, osszes,
       round(100.0 * kitoltott / NULLIF(osszes, 0), 1) AS szazalek
FROM (
  SELECT 'congregations.nev_ro' AS mit,
         count(*) FILTER (WHERE NULLIF(btrim(nev_ro), '') IS NOT NULL) AS kitoltott,
         count(*) AS osszes
  FROM public.congregations WHERE status = 'active'
  UNION ALL
  SELECT 'dioceses.nev_ro',
         count(*) FILTER (WHERE NULLIF(btrim(nev_ro), '') IS NOT NULL), count(*)
  FROM public.dioceses
  UNION ALL
  SELECT 'districts.nev_ro',
         count(*) FILTER (WHERE NULLIF(btrim(nev_ro), '') IS NOT NULL), count(*)
  FROM public.districts
  UNION ALL
  SELECT 'adrcounty.name_ro (25 megye)',
         count(*) FILTER (WHERE NULLIF(btrim(name_ro), '') IS NOT NULL), count(*)
  FROM public.adrcounty
  UNION ALL
  SELECT 'adrcounty.name_hu',
         count(*) FILTER (WHERE NULLIF(btrim(name_hu), '') IS NOT NULL), count(*)
  FROM public.adrcounty
) AS t
ORDER BY mit;


-- ── 4. ÍTÉLET — megépíthető-e a kétnyelvű blokk a MAI adatokkal? ───────────
--     Ez a fájl utolsó utasítása, tehát ez látszik akkor is, ha egyben
--     futtattad.
SELECT 'ÍTÉLET' AS szakasz,
       c.nev_hu AS gyulekezet,
       CASE WHEN NULLIF(btrim(c.nev_ro), '') IS NOT NULL
            THEN '✅ van' ELSE '❌ NINCS' END AS gyulekezet_roman_neve,
       CASE WHEN c.adrlocality_id IS NOT NULL
                 AND NULLIF(btrim(loc.name_ro), '') IS NOT NULL
                 AND NULLIF(btrim(cnty.name_ro), '') IS NOT NULL
            THEN '✅ teljes' ELSE '❌ hiányos' END AS ketnyelvu_cim,
       CASE WHEN NULLIF(btrim(d.nev_ro), '') IS NOT NULL
            THEN '✅ van' ELSE '❌ NINCS' END AS egyhazmegye_roman,
       CASE WHEN NULLIF(btrim(di.nev_ro), '') IS NOT NULL
            THEN '✅ van' ELSE '❌ NINCS' END AS egyhazkerulet_roman
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
LEFT JOIN public.districts di ON di.id = d.district_id
LEFT JOIN public.adrlocality loc ON loc.id = c.adrlocality_id
LEFT JOIN public.adrcounty cnty ON cnty.id = loc.countyid
WHERE ps.is_published = true;
