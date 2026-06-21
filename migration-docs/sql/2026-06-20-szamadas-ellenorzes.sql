-- ════════════════════════════════════════════════════════════════════════
-- SZÁMADÁS-EGYEZÉS ELŐ/UTÓ-ELLENŐRZÉS  (READ-ONLY)
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-20
-- Cél: biztosítani, hogy az importált adatból a rendszer számadása UGYANAZT
-- adja, mint a hivatalos Adatok_YYYY.xlsx „Szamadas" lapja.
--
-- Empirikusan igazolt: az import kategóriánként pontosan egyezik a hivatalossal
-- (29/29 kód, bevétel 185 178,98 / kiadás 285 546,97). A rendszer ugyanígy
-- aggregál (cél-kód szerint, kassza+bank együtt, belső mozgás kizárva), ÍGY a
-- számadás akkor egyezik, ha az alábbi 3 feltétel teljesül. Egyik sem módosít.
--
-- Cseréld ki a :CONG_ID-t a gyülekezeted azonosítójára (vagy told be a WHERE-ekbe).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) ELŐ-ellenőrzés: a fájlban használt MINDEN kódhoz van-e AKTÍV cél? ──
--    Ha egy kód itt 'HIÁNYZIK', annak az összege NÉMÁN kimaradna a számadásból
--    (alulszámadás). Különösen a 205.01 / 205.02 fontos.
WITH file_codes(kod, tipus) AS (
  VALUES
    -- BEVÉTEL kódok (a 2025-ös fájlból):
    ('101.01','B'),('101.03','B'),('101.04','B'),('101.06','B'),('102.06','B'),
    ('103.02','B'),('103.06','B'),('103.08','B'),('103.09','B'),('104.05','B'),
    -- KIADÁS kódok:
    ('201.01','K'),('201.02','K'),('201.04','K'),('201.05','K'),('201.07','K'),
    ('201.08','K'),('201.09','K'),('201.11','K'),('201.12','K'),('201.13','K'),
    ('202.01','K'),('202.02','K'),('202.07','K'),('202.08','K'),
    ('203.03','K'),('203.05','K'),('203.06','K'),('205.01','K'),('205.02','K')
)
SELECT
  fc.kod,
  fc.tipus,
  CASE
    WHEN fc.tipus = 'B' AND b.id_szamadasicel IS NOT NULL THEN 'OK (befizetescel)'
    WHEN fc.tipus = 'K' AND k.id_szamadasicel IS NOT NULL THEN 'OK (kiadascel)'
    ELSE '❌ HIÁNYZIK — a kód összege kimaradna a számadásból!'
  END AS statusz
FROM file_codes fc
LEFT JOIN public.befizetescel b ON b.id_szamadasicel = fc.kod AND b.aktiv = true
LEFT JOIN public.kiadascel    k ON k.id_szamadasicel = fc.kod AND k.aktiv = true
ORDER BY fc.tipus, fc.kod;

-- ── 2) UTÓ-ellenőrzés (import UTÁN): van-e CÉL NÉLKÜL (NULL) beszúrt tétel? ──
--    Az ilyen tételek a registru-ban (dátum-alapú) látszanak, de a számadásból
--    (cél-alapú) NÉMÁN kimaradnak → eltérés a hivatalostól.
SELECT 'befizetes cél nélkül' AS hol, COUNT(*) AS darab, COALESCE(SUM(osszeg),0) AS osszeg
FROM public.befizetes
WHERE deleted = false AND id_befizetescel IS NULL
UNION ALL
SELECT 'kiadas cél nélkül', COUNT(*), COALESCE(SUM(osszeg),0)
FROM public.kiadas
WHERE deleted = false AND id_kiadascel IS NULL;

-- ── 3) UTÓ-ellenőrzés: a BELSŐ MOZGÁS tételek 3xx/4xx célra mutatnak-e? ──
--    A belső mozgásnak NEM szabad 1xx/2xx (számadási bevétel/kiadás) célja legyen,
--    különben tévesen bekerülne a számadás bevétel/kiadás összegébe.
SELECT 'belső mozgás befizetes ROSSZ célon (1xx/2xx)' AS hol, COUNT(*) AS darab
FROM public.befizetes bf
JOIN public.befizetescel b ON b.id = bf.id_befizetescel
WHERE bf.deleted = false
  AND bf.belso_mozgas_xkey IS NOT NULL
  AND (b.id_szamadasicel LIKE '1%' OR b.id_szamadasicel LIKE '2%')
UNION ALL
SELECT 'belső mozgás kiadas ROSSZ célon (1xx/2xx)', COUNT(*)
FROM public.kiadas ki
JOIN public.kiadascel k ON k.id = ki.id_kiadascel
WHERE ki.deleted = false
  AND ki.belso_mozgas_xkey IS NOT NULL
  AND (k.id_szamadasicel LIKE '1%' OR k.id_szamadasicel LIKE '2%');

-- ── 4) UTÓ-ellenőrzés: a rendszer számadása kategóriánként (vesd össze a Szamadas col6-tal) ──
--    Bevétel (1xx) cél-kód szerint, az adott évre (datum alapú = a webes számadás elve).
--    Cseréld a 2025-öt a kívánt évre.
SELECT s.id AS kod, s.nev, SUM(bf.osszeg) AS szamadas_bevetel
FROM public.befizetes bf
JOIN public.befizetescel b ON b.id = bf.id_befizetescel
JOIN public.szamadasicel s ON s.id = b.id_szamadasicel
WHERE bf.deleted = false
  AND bf.datum >= '2025-01-01' AND bf.datum <= '2025-12-31'
  AND s.id LIKE '1%'
GROUP BY s.id, s.nev
ORDER BY s.id;

SELECT s.id AS kod, s.nev, SUM(ki.osszeg) AS szamadas_kiadas
FROM public.kiadas ki
JOIN public.kiadascel k ON k.id = ki.id_kiadascel
JOIN public.szamadasicel s ON s.id = k.id_szamadasicel
WHERE ki.deleted = false
  AND ki.datum >= '2025-01-01' AND ki.datum <= '2025-12-31'
  AND s.id LIKE '2%'
GROUP BY s.id, s.nev
ORDER BY s.id;

-- ════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS:
--  • 1) minden sor OK → minden kódhoz van cél, semmi nem marad ki. ❌ esetén
--    seedeld a hiányzó számadási célt (2026-04-17-seed-befizetescel-kiadascel.sql).
--  • 2) mindkét darab = 0 → nincs cél nélküli (kimaradó) tétel.
--  • 3) mindkét darab = 0 → a belső mozgások helyesen NEM számadási bevétel/kiadás célon.
--  • 4) ezek az értékek a 2025-ös import után PONTOSAN a hivatalos Szamadas col6-ot
--    adják (101.01=47015, 201.13=138125.34, 205.01=19699.99, …), összesen
--    185 178,98 bevétel / 285 546,97 kiadás.
-- ════════════════════════════════════════════════════════════════════════
