-- ══════════════════════════════════════════════════════════════════
-- 2026-04-20 — Román cím-adatok (adr*) diagnosztika
-- ──────────────────────────────────────────────────────────────────
-- CÉL: mielőtt a setup wizardokba beépítenénk megye/helység dropdown-t +
-- irányítószám autocomplete-ot, felmérjük a VALÓS adatbázis-állapotot:
--  - Vannak-e seed adatok az adr* táblákban?
--  - Milyen nyelven (magyar / román) van-e a `name` mező?
--  - Az `adrlocality.code` SIRUTA / postakód / egyéb?
--  - Az `adrstreet.postalcode` ki van-e töltve?
--
-- Nem módosít semmit, csak SELECT-ek.
-- ══════════════════════════════════════════════════════════════════

-- [1/8] Sorok száma az adr* táblákban
SELECT 'adrcountry' AS tabla, COUNT(*) AS sorok FROM public.adrcountry
UNION ALL
SELECT 'adrcounty', COUNT(*) FROM public.adrcounty
UNION ALL
SELECT 'adrlocality', COUNT(*) FROM public.adrlocality
UNION ALL
SELECT 'adrstreet', COUNT(*) FROM public.adrstreet
ORDER BY tabla;

-- [2/8] Országok (várt: legalább Románia + Magyarország)
SELECT id, name, sname, usagecnt
FROM public.adrcountry
ORDER BY id
LIMIT 10;

-- [3/8] Összes megye (Románia: 41 megye + Bukarest → 42)
SELECT c.id, c.name, c.sname, c.countryid, c.usagecnt,
       co.name AS country_name
FROM public.adrcounty c
LEFT JOIN public.adrcountry co ON co.id = c.countryid
ORDER BY c.name
LIMIT 50;

-- [4/8] Kovászna / Covasna megyei helységek
-- (a `sname` a megye autókód: CV = Covasna/Kovászna, HR = Harghita/Hargita, stb.)
SELECT l.id, l.name, l.code, l.usagecnt
FROM public.adrlocality l
JOIN public.adrcounty c ON c.id = l.countyid
WHERE c.sname = 'CV'
   OR c.name ILIKE '%Kovászna%'
   OR c.name ILIKE '%Covasna%'
ORDER BY l.name
LIMIT 30;

-- [5/8] Hargita / Harghita megyei helységek (összehasonlítás)
SELECT l.id, l.name, l.code, l.usagecnt
FROM public.adrlocality l
JOIN public.adrcounty c ON c.id = l.countyid
WHERE c.sname = 'HR'
   OR c.name ILIKE '%Hargita%'
   OR c.name ILIKE '%Harghita%'
ORDER BY l.name
LIMIT 30;

-- [6/8] Utcák egy tipikus székelyföldi helységhez — irányítószámokkal
-- (ha nincs Barót, bármelyik szintén elfogadható)
SELECT s.id, s.name, s.postalcode, l.name AS locality, c.name AS county
FROM public.adrstreet s
JOIN public.adrlocality l ON l.id = s.localityid
JOIN public.adrcounty c ON c.id = l.countyid
WHERE l.name ILIKE '%Barót%' OR l.name ILIKE '%Baraolt%'
   OR l.name ILIKE '%Sepsiszentgyörgy%' OR l.name ILIKE '%Sfântu Gheorghe%'
ORDER BY l.name, s.name
LIMIT 30;

-- [7/8] Postalcode lefedettség: hány utcának van kitöltve és hány nincs
SELECT
  COUNT(*) AS osszes_utca,
  COUNT(postalcode) AS van_iranyitoszam,
  COUNT(*) - COUNT(postalcode) AS nincs_iranyitoszam
FROM public.adrstreet;

-- [8/8] Nyelvi minta — nézzünk meg pár ismerős székelyföldi helységet.
-- Ha a "Barót" megtalálható, a név magyar nyelvű, ha "Baraolt", román.
-- Ha mindkettő, akkor kétnyelvű adat. Ha csak az egyik, akkor fél-adat.
SELECT l.id, l.name, c.name AS county
FROM public.adrlocality l
JOIN public.adrcounty c ON c.id = l.countyid
WHERE l.name IN (
  -- Magyar
  'Barót', 'Sepsiszentgyörgy', 'Csíkszereda', 'Székelyudvarhely', 'Kolozsvár',
  'Marosvásárhely', 'Kézdivásárhely', 'Gyergyószentmiklós',
  -- Román
  'Baraolt', 'Sfântu Gheorghe', 'Miercurea Ciuc', 'Odorheiu Secuiesc', 'Cluj-Napoca',
  'Târgu Mureș', 'Târgu Secuiesc', 'Gheorgheni'
)
ORDER BY l.name;

-- ══════════════════════════════════════════════════════════════════
-- EREDMÉNY-ÉRTELMEZÉS (mit keresünk):
--
-- 1) Sorok száma:
--    - adrcountry: ~1-5 (Románia, esetleg szomszédok)
--    - adrcounty: ~42 (41 megye + Bukarest)
--    - adrlocality: ~13.000 (teljes ro.) VAGY sokkal kevesebb (csak Erdély)
--    - adrstreet: sok (utcák szintjén)
--    → Ha bármelyik 0, seed kell
--
-- 2) Országok: Románia biztosan van?
--
-- 3) Megyék: mind 42 vagy csak részleg?
--
-- 4-5) Kovászna és Hargita: hány helység van ezekben a megyékben?
--    Kovászna ~130, Hargita ~270 településsel rendelkezik
--
-- 6) Utcák: van-e irányítószám adat?
--
-- 7) Postalcode lefedettség: mennyi utcához tartozik irányítószám?
--
-- 8) Nyelv: ha a [8] minta-lista csak magyar neveket talál, a `name`
--    magyar nyelvű. Ha csak románt, román nyelvű. Ha mindkettő megjelenik
--    DUPLAként (ugyanaz a helység kétszer, egyszer magyarul, egyszer
--    románul), akkor egyszerű duplikált seed → külön row.
--
-- ══════════════════════════════════════════════════════════════════
