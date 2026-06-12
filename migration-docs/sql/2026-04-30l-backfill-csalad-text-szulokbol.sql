-- KARTOTEKA — Backfill: csalad+gyerek rekordok a szöveges szülő-nevekből
-- Dátum: 2026-04-30l
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (a 2026-04-30k diagnosztika eredménye):
-- 10+ gyermek (importtal jött adat) így néz ki:
--   apjaneve = "Kádár Barna Zsolt"   (TEXT mezőben)
--   anyjaneve = "Kádár Bokor Éva"    (TEXT mezőben)
--   id_apja = NULL  (CNP nincs)
--   id_anyja = NULL (CNP nincs)
--   gyerek táblában nincs rekord (családhoz nincs rendelve)
--
-- Ezért a baptism-dialog auto-load nem talál szülőt — pedig sok esetben
-- a szülők is ott vannak a rendszerben, csak nincs összekapcsolva.
--
-- Ez a backfill megpróbálja FELOLDANI a szöveges szülő-neveket:
--   1) `apjaneve` / `anyjaneve` text → felbontás "csaladnev k_nev" párra
--      (heuristika: első whitespace előtt = csaladnev, utána = k_nev)
--   2) Lookup a `szemely` táblában (saját gyülekezet, ferfi=true az
--      apához, ferfi=false az anyához)
--   3) Ha PONTOSAN 1 találat van → biztos egyezés, használjuk
--   4) Frissítjük szemely.id_apja / id_anyja a megtalált tag CNP-jére
--   5) Létrehozzuk vagy frissítjük a `csalad` + `gyerek` rekordokat
--
-- ⚠️ SELF-MATCH VÉDELEM (2026-04-30l hotfix):
--    Az első előnézet kimutatta, hogy a "Benkő Éva" (id 925) gyermeknek
--    "Benkő Éva" anyja van rögzítve — a saját nevére! Az `m.id <> c.gyermek_id`
--    szűrő kizárja ezt: senki nem lehet saját maga anyja vagy apja.
--
-- ⚠️ NEM TALÁLT ANYÁK (kb. 99 db a teszt-eredmény szerint):
--   a) "Csak keresztnév" formátum (régi anyakönyv): "Veronka", "Magdolna",
--      "Lujza", "Edit", "Margit", "Ibolya", "Tünde", "Borbála"... —
--      ezeket nem tudjuk automatikusan beazonosítani, mert nincs csaladnev.
--      A baptism-dialog a sárga bannerben mutatja az eredeti szöveget,
--      és a felhasználó kézzel rákeres.
--   b) Az anya nincs a rendszerben (más gyülekezetnél van vagy nem tag) —
--      hagyni kell üresen, NEM hozunk létre rekordot.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HASZNÁLAT — KÉT SZAKASZ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔧 1. SZAKASZ — DRY-RUN ELŐNÉZET (csak SELECT, semmit nem módosít):
--    Az 1-3. blokk megmutatja MIT TALÁLNA a backfill — futtasd először,
--    nézd meg, hogy nincs-e abszurd találat (pl. azonos nevű idegen tag).
--
-- 🔧 2. SZAKASZ — TÉNYLEGES BACKFILL (alul kommentelve):
--    Ha az előnézet rendben, uncomment-eld a 4-7. blokkot és futtasd.
--    A blokkok BEGIN/COMMIT tranzakcióban vannak — vagy mind sikerül,
--    vagy semmi nem változik.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. blokk — JELÖLTEK (gyermekek akiknek text-szülő-nevük van, de nincs ID)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    '1. JELÖLTEK: gyermekek text-szülő-névvel, ID nélkül' AS info,
    sz.id, sz.csaladnev || ' ' || sz.k_nev AS gyermek_neve, sz.sz_datum,
    sz.apjaneve, sz.anyjaneve,
    sz.congregation_id
FROM public.szemely sz
LEFT JOIN public.gyerek g ON g.id_szemely = sz.id
WHERE (sz.apjaneve IS NOT NULL OR sz.anyjaneve IS NOT NULL)
  AND sz.id_apja IS NULL
  AND sz.id_anyja IS NULL
  AND g.id IS NULL
  AND sz.isvisible = true
ORDER BY sz.sz_datum DESC NULLS LAST;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. blokk — APA-MATCH ELŐNÉZET
-- (felbontás + lookup + hány találat van)
-- ════════════════════════════════════════════════════════════════════════════

WITH candidates AS (
    SELECT sz.id AS gyermek_id, sz.csaladnev || ' ' || sz.k_nev AS gyermek_neve,
        sz.congregation_id, sz.apjaneve,
        -- Felbontás: első szó = csaladnev, többi = k_nev
        split_part(trim(sz.apjaneve), ' ', 1) AS apa_csaladnev,
        trim(substring(trim(sz.apjaneve) FROM length(split_part(trim(sz.apjaneve), ' ', 1)) + 1)) AS apa_k_nev
    FROM public.szemely sz
    LEFT JOIN public.gyerek g ON g.id_szemely = sz.id
    WHERE sz.apjaneve IS NOT NULL AND trim(sz.apjaneve) <> ''
      AND sz.id_apja IS NULL
      AND g.id IS NULL
      AND sz.isvisible = true
),
matches AS (
    SELECT c.*,
        (SELECT count(*) FROM public.szemely m
         WHERE m.csaladnev = c.apa_csaladnev
           AND m.k_nev = c.apa_k_nev
           AND m.ferfi = true
           AND m.congregation_id = c.congregation_id
           AND m.isvisible = true
           AND m.meghalt = false
           AND m.id <> c.gyermek_id) AS match_count,
        (SELECT m.id FROM public.szemely m
         WHERE m.csaladnev = c.apa_csaladnev
           AND m.k_nev = c.apa_k_nev
           AND m.ferfi = true
           AND m.congregation_id = c.congregation_id
           AND m.isvisible = true
           AND m.meghalt = false
           AND m.id <> c.gyermek_id
         LIMIT 1) AS matched_apa_id,
        (SELECT m.cnp FROM public.szemely m
         WHERE m.csaladnev = c.apa_csaladnev
           AND m.k_nev = c.apa_k_nev
           AND m.ferfi = true
           AND m.congregation_id = c.congregation_id
           AND m.isvisible = true
           AND m.meghalt = false
           AND m.id <> c.gyermek_id
         LIMIT 1) AS matched_apa_cnp
    FROM candidates c
)
SELECT
    '2. APA-MATCH ELŐNÉZET' AS info,
    gyermek_id, gyermek_neve,
    apjaneve AS apa_eredeti_text,
    apa_csaladnev || ' / ' || apa_k_nev AS apa_szetbontva,
    match_count,
    matched_apa_id,
    matched_apa_cnp,
    CASE
        WHEN match_count = 0 THEN '❌ Nincs találat — manuális keresés kell'
        WHEN match_count = 1 THEN '✅ Pontosan 1 — backfillelhető'
        ELSE '⚠️ Több találat (' || match_count || ') — manuális döntés kell'
    END AS allapot
FROM matches
ORDER BY match_count DESC, gyermek_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. blokk — ANYA-MATCH ELŐNÉZET
-- ════════════════════════════════════════════════════════════════════════════

WITH candidates AS (
    SELECT sz.id AS gyermek_id, sz.csaladnev || ' ' || sz.k_nev AS gyermek_neve,
        sz.congregation_id, sz.anyjaneve,
        split_part(trim(sz.anyjaneve), ' ', 1) AS anya_csaladnev,
        trim(substring(trim(sz.anyjaneve) FROM length(split_part(trim(sz.anyjaneve), ' ', 1)) + 1)) AS anya_k_nev
    FROM public.szemely sz
    LEFT JOIN public.gyerek g ON g.id_szemely = sz.id
    WHERE sz.anyjaneve IS NOT NULL AND trim(sz.anyjaneve) <> ''
      AND sz.id_anyja IS NULL
      AND g.id IS NULL
      AND sz.isvisible = true
),
matches AS (
    SELECT c.*,
        (SELECT count(*) FROM public.szemely m
         WHERE (m.csaladnev = c.anya_csaladnev OR m.szcs_nev = c.anya_csaladnev)
           AND m.k_nev = c.anya_k_nev
           AND m.ferfi = false
           AND m.congregation_id = c.congregation_id
           AND m.isvisible = true
           AND m.meghalt = false
           AND m.id <> c.gyermek_id) AS match_count,
        (SELECT m.id FROM public.szemely m
         WHERE (m.csaladnev = c.anya_csaladnev OR m.szcs_nev = c.anya_csaladnev)
           AND m.k_nev = c.anya_k_nev
           AND m.ferfi = false
           AND m.congregation_id = c.congregation_id
           AND m.isvisible = true
           AND m.meghalt = false
           AND m.id <> c.gyermek_id
         LIMIT 1) AS matched_anya_id,
        (SELECT m.cnp FROM public.szemely m
         WHERE (m.csaladnev = c.anya_csaladnev OR m.szcs_nev = c.anya_csaladnev)
           AND m.k_nev = c.anya_k_nev
           AND m.ferfi = false
           AND m.congregation_id = c.congregation_id
           AND m.isvisible = true
           AND m.meghalt = false
           AND m.id <> c.gyermek_id
         LIMIT 1) AS matched_anya_cnp
    FROM candidates c
)
SELECT
    '3. ANYA-MATCH ELŐNÉZET' AS info,
    gyermek_id, gyermek_neve,
    anyjaneve AS anya_eredeti_text,
    anya_csaladnev || ' / ' || anya_k_nev AS anya_szetbontva,
    match_count,
    matched_anya_id,
    matched_anya_cnp,
    CASE
        WHEN match_count = 0 THEN '❌ Nincs találat — manuális keresés kell'
        WHEN match_count = 1 THEN '✅ Pontosan 1 — backfillelhető (csaladnev VAGY szcs_nev egyezés)'
        ELSE '⚠️ Több találat (' || match_count || ') — manuális döntés kell'
    END AS allapot
FROM matches
ORDER BY match_count DESC, gyermek_id;

-- ════════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha a 2-3. blokkban a "✅ Pontosan 1" sorok meggyőzőek (azonos nevű tag a
-- vártnak megfelel — ellenőrizd a matched_apa_id / matched_anya_id-t),
-- akkor folytasd a 4-7. blokkokkal.
--
-- A "⚠️ Több találat" eseteket NEM backfilleljük automatikusan — Endrenek
-- kézzel kell eldöntenie, melyiket válassza.
--
-- A "❌ Nincs találat" esetek azt jelentik, hogy a szülő nincs a rendszerben
-- (még nem rögzítették), vagy a név-formátum eltér. Manuális keresés kell
-- a baptism-dialog-ban.

-- ════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════
-- 2. SZAKASZ — TÉNYLEGES BACKFILL (alapból KOMMENTELVE — uncomment hogy fusson)
-- ════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════

/*
BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. blokk — APA CNP backfill (csak ahol pontosan 1 találat)
-- ════════════════════════════════════════════════════════════════════════════

WITH candidates AS (
    SELECT sz.id AS gyermek_id, sz.congregation_id,
        split_part(trim(sz.apjaneve), ' ', 1) AS apa_csaladnev,
        trim(substring(trim(sz.apjaneve) FROM length(split_part(trim(sz.apjaneve), ' ', 1)) + 1)) AS apa_k_nev
    FROM public.szemely sz
    LEFT JOIN public.gyerek g ON g.id_szemely = sz.id
    WHERE sz.apjaneve IS NOT NULL AND trim(sz.apjaneve) <> ''
      AND sz.id_apja IS NULL
      AND g.id IS NULL
      AND sz.isvisible = true
),
unique_matches AS (
    SELECT c.gyermek_id,
        (SELECT m.cnp FROM public.szemely m
         WHERE m.csaladnev = c.apa_csaladnev AND m.k_nev = c.apa_k_nev
           AND m.ferfi = true AND m.congregation_id = c.congregation_id
           AND m.isvisible = true AND m.meghalt = false
           AND m.id <> c.gyermek_id  -- self-match védelem
         HAVING count(*) = 1
         LIMIT 1) AS matched_cnp
    FROM candidates c
)
UPDATE public.szemely
SET id_apja = um.matched_cnp
FROM unique_matches um
WHERE szemely.id = um.gyermek_id
  AND um.matched_cnp IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. blokk — ANYA CNP backfill
-- ════════════════════════════════════════════════════════════════════════════

WITH candidates AS (
    SELECT sz.id AS gyermek_id, sz.congregation_id,
        split_part(trim(sz.anyjaneve), ' ', 1) AS anya_csaladnev,
        trim(substring(trim(sz.anyjaneve) FROM length(split_part(trim(sz.anyjaneve), ' ', 1)) + 1)) AS anya_k_nev
    FROM public.szemely sz
    LEFT JOIN public.gyerek g ON g.id_szemely = sz.id
    WHERE sz.anyjaneve IS NOT NULL AND trim(sz.anyjaneve) <> ''
      AND sz.id_anyja IS NULL
      AND g.id IS NULL
      AND sz.isvisible = true
),
unique_matches AS (
    SELECT c.gyermek_id,
        (SELECT m.cnp FROM public.szemely m
         WHERE (m.csaladnev = c.anya_csaladnev OR m.szcs_nev = c.anya_csaladnev)
           AND m.k_nev = c.anya_k_nev
           AND m.ferfi = false AND m.congregation_id = c.congregation_id
           AND m.isvisible = true AND m.meghalt = false
           AND m.id <> c.gyermek_id  -- self-match védelem
         HAVING count(*) = 1
         LIMIT 1) AS matched_cnp
    FROM candidates c
)
UPDATE public.szemely
SET id_anyja = um.matched_cnp
FROM unique_matches um
WHERE szemely.id = um.gyermek_id
  AND um.matched_cnp IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. blokk — CSALAD rekord létrehozás (ha még nincs aktív család)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Minden gyermek esetén, akinek most már id_apja vagy id_anyja CNP van:
-- 1) Lookup: létezik-e már aktív csalad rekord ezzel a szülő-párral
-- 2) Ha NINCS, létrehozzuk (a c_utcaid/c_szam az apa, vagy ha nincs, az anya
--    címéről)

WITH gyerekek_szulokkel AS (
    SELECT g.id AS gyerek_id, g.csaladnev, g.k_nev,
        apa.id AS apa_id, apa.cnp AS apa_cnp, apa.c_utcaid AS apa_utcaid, apa.c_szam AS apa_c_szam,
        anya.id AS anya_id, anya.cnp AS anya_cnp, anya.c_utcaid AS anya_utcaid, anya.c_szam AS anya_c_szam
    FROM public.szemely g
    LEFT JOIN public.szemely apa
        ON apa.cnp = g.id_apja AND apa.congregation_id = g.congregation_id
    LEFT JOIN public.szemely anya
        ON anya.cnp = g.id_anyja AND anya.congregation_id = g.congregation_id
    LEFT JOIN public.gyerek gy ON gy.id_szemely = g.id
    WHERE (g.id_apja IS NOT NULL OR g.id_anyja IS NOT NULL)
      AND gy.id IS NULL
      AND g.isvisible = true
)
INSERT INTO public.csalad (id_ferfi, id_no, c_utcaid, c_szam, isaktiv)
SELECT DISTINCT
    gy.apa_id,
    gy.anya_id,
    COALESCE(gy.apa_utcaid, gy.anya_utcaid) AS c_utcaid,
    COALESCE(gy.apa_c_szam, gy.anya_c_szam, '1') AS c_szam,
    true AS isaktiv
FROM gyerekek_szulokkel gy
WHERE NOT EXISTS (
    SELECT 1 FROM public.csalad cs
    WHERE cs.isaktiv = true
      AND COALESCE(cs.id_ferfi, -1) = COALESCE(gy.apa_id, -1)
      AND COALESCE(cs.id_no, -1) = COALESCE(gy.anya_id, -1)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. blokk — GYEREK rekord létrehozás (családhoz rendelés)
-- ════════════════════════════════════════════════════════════════════════════

WITH gyerekek_szulokkel AS (
    SELECT g.id AS gyerek_id,
        apa.id AS apa_id, anya.id AS anya_id
    FROM public.szemely g
    LEFT JOIN public.szemely apa
        ON apa.cnp = g.id_apja AND apa.congregation_id = g.congregation_id
    LEFT JOIN public.szemely anya
        ON anya.cnp = g.id_anyja AND anya.congregation_id = g.congregation_id
    LEFT JOIN public.gyerek gy ON gy.id_szemely = g.id
    WHERE (g.id_apja IS NOT NULL OR g.id_anyja IS NOT NULL)
      AND gy.id IS NULL
      AND g.isvisible = true
),
csalad_lookup AS (
    SELECT gys.gyerek_id, cs.id AS csalad_id
    FROM gyerekek_szulokkel gys
    JOIN public.csalad cs
        ON cs.isaktiv = true
        AND COALESCE(cs.id_ferfi, -1) = COALESCE(gys.apa_id, -1)
        AND COALESCE(cs.id_no, -1) = COALESCE(gys.anya_id, -1)
)
INSERT INTO public.gyerek (id_csalad, id_szemely)
SELECT csalad_id, gyerek_id FROM csalad_lookup
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. blokk — STATISZTIKA (mit csináltunk)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'BACKFILL EREDMÉNY' AS info,
    (SELECT count(*) FROM public.szemely WHERE id_apja IS NOT NULL) AS apa_cnp_kitoltve_osszesen,
    (SELECT count(*) FROM public.szemely WHERE id_anyja IS NOT NULL) AS anya_cnp_kitoltve_osszesen,
    (SELECT count(*) FROM public.csalad WHERE isaktiv = true) AS aktiv_csaladok,
    (SELECT count(*) FROM public.gyerek) AS gyerek_rekordok;

COMMIT;
*/

-- ════════════════════════════════════════════════════════════════════════════
-- VISSZAVONÁS (ha valami nem stimmel a backfill után)
-- ════════════════════════════════════════════════════════════════════════════
--
-- A backfill csak NULL → érték irányba ír. Ha valamit vissza akarsz vonni:
--   - id_apja / id_anyja = NULL minden gyerekre amit ma backfilleltünk
--   - csalad rekordot törölheted ha üres (gyerek nélkül)
-- De javasolt: futtasd el az 1-3. blokkot, ellenőrizd, és csak akkor
-- futtasd a 4-7-et ha minden egyezés meggyőző.
