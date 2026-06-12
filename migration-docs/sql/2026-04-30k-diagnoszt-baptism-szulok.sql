-- KARTOTEKA — Keresztelés-dialóg "szülők nem jelennek meg" diagnosztika
-- Dátum: 2026-04-30k
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre észrevétele):
-- "Keresztelésnél nem jelenik meg az édesapa és az édesanya!"
--
-- A `getParentsForChild(personId)` server action 3 helyről próbál szülőt találni:
--   1) gyerek tábla → csalad tábla → id_ferfi + id_no → szemely
--   2) szemely.id_apja / szemely.id_anyja CNP-k (régebbi adatformátum)
--   3) szemely.apjaneve / szemely.anyjaneve text-ek (legrégebbi)
--
-- ════════════════════════════════════════════════════════════════════════════
-- HASZNÁLAT
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔧 1. CSERÉLD KI a 1163-at a TESZT-személy ID-jére (Ctrl+H "Replace All").
-- 🔧 2. Futtasd a Supabase SQL Editorban (egyenként vagy mind együtt).
-- 🔧 3. Az output 6 blokkból áll — mindegyik megmutatja, melyik forrásban
--       van adat. (Az első egyszerű SELECT-tel kezdődik, hogy lásd, melyik
--       tagra dolgozol.)
--
-- A CTE-t (WITH target AS) NEM használhattuk, mert a PostgreSQL CTE csak
-- az utána következő EGYETLEN statement-re érvényes. Stand-alone SELECT-ek
-- a megoldás — egy közös ID-vel.
--
-- ════════════════════════════════════════════════════════════════════════════
-- 0. blokk: tudd melyik tagot vizsgálod
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '0. AZONOSÍTÓ-ELLENŐRZÉS' AS info,
    1163 AS keresett_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. blokk: a tag alapadatai
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '1. ALAP: a tag létezik-e a szemely táblában?' AS info,
    sz.id, sz.csaladnev, sz.k_nev, sz.cnp, sz.sz_datum,
    sz.congregation_id, sz.isvisible, sz.meghalt
FROM public.szemely sz
WHERE sz.id = 1163;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. blokk: van-e GYEREK rekord (azaz családhoz van-e rendelve)?
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '2. GYEREK: van-e gyerek-rekord (családhoz rendelve)?' AS info,
    g.id AS gyerek_id, g.id_csalad, g.id_szemely
FROM public.gyerek g
WHERE g.id_szemely = 1163;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. blokk: ha van gyerek → milyen család? Az apa/anya ID-vel?
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '3. CSALAD: a gyerek családjában ki az apa és anya?' AS info,
    cs.id AS csalad_id, cs.id_ferfi AS apa_szemely_id, cs.id_no AS anya_szemely_id,
    cs.isaktiv,
    apa.csaladnev || ' ' || apa.k_nev AS apa_neve,
    anya.csaladnev || ' ' || anya.k_nev AS anya_neve
FROM public.gyerek g
JOIN public.csalad cs ON cs.id = g.id_csalad
LEFT JOIN public.szemely apa ON apa.id = cs.id_ferfi
LEFT JOIN public.szemely anya ON anya.id = cs.id_no
WHERE g.id_szemely = 1163;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. blokk: szemely.id_apja / id_anyja CNP-string (régebbi adat)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '4. SZEMELY.id_apja / id_anyja: van-e CNP-szülő rögzítve?' AS info,
    sz.id_apja AS apa_cnp,
    sz.id_anyja AS anya_cnp,
    -- Megpróbáljuk feloldani a CNP-eket (csak ugyanazon gyülekezet)
    apa.id AS apa_szemely_id,
    apa.csaladnev || ' ' || apa.k_nev AS apa_neve,
    anya.id AS anya_szemely_id,
    anya.csaladnev || ' ' || anya.k_nev AS anya_neve
FROM public.szemely sz
LEFT JOIN public.szemely apa
    ON apa.cnp = sz.id_apja AND apa.congregation_id = sz.congregation_id
LEFT JOIN public.szemely anya
    ON anya.cnp = sz.id_anyja AND anya.congregation_id = sz.congregation_id
WHERE sz.id = 1163;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. blokk: szemely.apjaneve / anyjaneve TEXT (legrégebbi adat)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '5. SZEMELY.apjaneve / anyjaneve: van-e szöveg-szülő rögzítve?' AS info,
    sz.apjaneve AS apa_text,
    sz.anyjaneve AS anya_text
FROM public.szemely sz
WHERE sz.id = 1163;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. blokk: KERESZTSÉG táblában van-e már a tagnak korábbi keresztelése?
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '6. KERESZTSÉG: létezik-e már keresztelés rekord?' AS info,
    k.id, k.datum, k.lelkeszneve, k.egyhazi_szam, k.megjegyzes
FROM public.keresztseg k
WHERE k.id_szemely = 1163
ORDER BY k.datum DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha a 2. blokk eredménye üres (0 sor):
--   → A tag NINCS családhoz rendelve. A baptism-dialog 1) ágon nem talál.
--
-- Ha a 4. blokk eredménye üres apa_cnp/anya_cnp NULL:
--   → A tagnál nincs id_apja/id_anyja CNP. A 2) ágon sem talál.
--
-- Ha a 5. blokk apjaneve/anyjaneve csak text (nincs ID feloldva):
--   → A tagnak csak SZÖVEG-formátumú szülő-neve van.
--   → Az új kód-verzióban a baptism-dialog ezt egy SÁRGA BANNERBEN mutatja:
--      "A korábbi adatok szerint a szülők neve: ..."
--   → A felhasználónak kézzel kell rákeresnie a kereső mezőkben.

-- ════════════════════════════════════════════════════════════════════════════
-- BÓNUSZ: ha látod hogy egy konkrét személy ID-je nem stimmel —
-- listázd a legutóbbi 10 gyermeket, akiknek nincs gyerek-rekord, hogy lásd
-- mennyi tag érintett:
-- ════════════════════════════════════════════════════════════════════════════

SELECT sz.id, sz.csaladnev, sz.k_nev, sz.sz_datum,
       sz.apjaneve, sz.anyjaneve, sz.id_apja, sz.id_anyja
FROM public.szemely sz
LEFT JOIN public.gyerek g ON g.id_szemely = sz.id
WHERE sz.sz_datum >= '2010-01-01'  -- 15 év alattiak
  AND g.id IS NULL
  AND sz.isvisible = true
ORDER BY sz.sz_datum DESC
LIMIT 10;
