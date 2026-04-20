-- ══════════════════════════════════════════════════════════════════
-- 2026-04-21 — Névnap-tábla diagnózis
-- ──────────────────────────────────────────────────────────────────
-- CÉL:
--   Ellenőrizni, milyen adat van a `nevnap` táblában, és azonosítani
--   az erdélyi református naptárhoz képesti esetleges eltéréseket.
--
-- FUTTATÁSI MÓD: csak SELECT-ek, nincs módosítás.
-- ══════════════════════════════════════════════════════════════════

-- [1/5] Hány sor van, és hány egyedi dátum
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT (honap::int, nap::int)) AS unique_dates
FROM public.nevnap;
-- Elvárás: legalább 365 sor (minden nap)

-- [2/5] Minta — az első 10 sor
SELECT honap, nap, nev1, nev2, nev3
FROM public.nevnap
ORDER BY honap::int, nap::int
LIMIT 10;

-- [3/5] Márc 15 (nemzeti ünnep) — ki van itt?
SELECT honap, nap, nev1, nev2, nev3
FROM public.nevnap
WHERE honap::int = 3 AND nap::int = 15;
-- Elvárás Erdélyi ref. naptár szerint: Kristóf, Lujza, Ida

-- [4/5] Október 31 (Reformáció napja) — ki van itt?
SELECT honap, nap, nev1, nev2, nev3
FROM public.nevnap
WHERE honap::int = 10 AND nap::int = 31;
-- Elvárás: Kálmán, Farkas (vagy hasonló ref. nevek)

-- [5/5] Karácsony (dec 25) — ki van itt?
SELECT honap, nap, nev1, nev2, nev3
FROM public.nevnap
WHERE honap::int = 12 AND nap::int = 25;
-- Elvárás: Eugénia, Péter (vagy ref.-specifikus)

-- KEY INDIKÁTOROK:
-- Ha a [2]..[5] lekérdezések eredménye a magyarországi katolikus naptárral
-- egyezik (és nem az erdélyi református-tal), akkor új seed szükséges.
-- Küld vissza a kimenetet, és eldöntjük.
