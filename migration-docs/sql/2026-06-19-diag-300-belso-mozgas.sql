-- ============================================================================
-- DIAGNOSZTIKA — Mi valójában a 300.xx kód? Belső mozgás-e?
-- 2026-06-19
--
-- HÁTTÉR: a Kassza-classifier (splitKasszaRow) korábban csak 4xx + 301-et ismert
--   belső mozgásnak, a 300-at nem. A javítás (commit eda5237a) a 300-at is annak
--   veszi — de NE TALÁLGASSUNK: ez az SQL az adatból igazolja le.
--
-- A MÉRVADÓ JELZŐ NEM a kód-prefix, hanem a `szamadasicel.belsotetel` oszlop
--   (varchar). Ha egy kódnál ez KI VAN TÖLTVE → belső mozgás (a kassza↔bank /
--   bank↔bank átvezetés párját jelöli). Ha ÜRES és a type bevétel/kiadás → valódi
--   bevétel/kiadás, NEM belső mozgás.
--
-- CSAK OLVAS (SELECT). Futtasd a Supabase SQL editorban, és küldd vissza az 1) és
-- 2) eredményt — abból egyértelmű lesz, helyes-e a 300-as javítás.
-- ============================================================================

-- 1) A 3xx ÉS 4xx kódok jellemzése — EZ A DÖNTŐ.
--    Nézd a `belsotetel` és a `type` oszlopot a 300.* soroknál:
--      - belsotetel KITÖLTVE  → belső mozgás → a javítás HELYES.
--      - belsotetel ÜRES + type bevétel/kiadás → valódi tétel → a javítást VISSZA kell vonni.
SELECT id, nev, type, belsotetel, aktiv
FROM szamadasicel
WHERE id LIKE '3%' OR id LIKE '4%'
ORDER BY id;

-- 2) Csak a 300.* kódok, kiemelve (gyors válasz az alapkérdésre).
SELECT id, nev, type, belsotetel, aktiv
FROM szamadasicel
WHERE id LIKE '300%'
ORDER BY id;

-- 3) Milyen `belsotetel` értékek léteznek egyáltalán? (a konvenció megértéséhez —
--    pl. párosítja-e a 300-at a 400-zal egy közös címkével)
SELECT belsotetel, count(*) AS db, array_agg(id ORDER BY id) AS kodok
FROM szamadasicel
WHERE coalesce(btrim(belsotetel), '') <> ''
GROUP BY belsotetel
ORDER BY belsotetel;

-- 4) Van-e bevétel-/kiadás-kategória (befizetescel/kiadascel) a 300.* kódokra,
--    és azoknál is ki van-e töltve a belsotetel.
SELECT 'befizetescel' AS oldal, id, nev, id_szamadasicel, belsotetel, aktiv
FROM befizetescel WHERE id_szamadasicel LIKE '300%'
UNION ALL
SELECT 'kiadascel' AS oldal, id, nev, id_szamadasicel, belsotetel, aktiv
FROM kiadascel WHERE id_szamadasicel LIKE '300%'
ORDER BY id_szamadasicel;

-- 5) TÉNYLEGES HASZNÁLAT — befizetés a 300.* kódokon (van-e egyáltalán ilyen tétel).
SELECT bc.id_szamadasicel, sz.nev AS szamadasicel_nev, sz.belsotetel,
       count(*) AS db, sum(b.osszeg) AS osszeg_sum,
       (array_agg(b.forrasa ORDER BY b.id))[1:3] AS pelda_forrasok
FROM befizetes b
JOIN befizetescel bc ON bc.id = b.id_befizetescel
JOIN szamadasicel sz ON sz.id = bc.id_szamadasicel
WHERE bc.id_szamadasicel LIKE '300%' AND b.deleted = false
GROUP BY bc.id_szamadasicel, sz.nev, sz.belsotetel
ORDER BY bc.id_szamadasicel;

-- 6) TÉNYLEGES HASZNÁLAT — kiadás a 300.* kódokon.
SELECT kc.id_szamadasicel, sz.nev AS szamadasicel_nev, sz.belsotetel,
       count(*) AS db, sum(k.osszeg) AS osszeg_sum
FROM kiadas k
JOIN kiadascel kc ON kc.id = k.id_kiadascel
JOIN szamadasicel sz ON sz.id = kc.id_szamadasicel
WHERE kc.id_szamadasicel LIKE '300%' AND k.deleted = false
GROUP BY kc.id_szamadasicel, sz.nev, sz.belsotetel
ORDER BY kc.id_szamadasicel;
