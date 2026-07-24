-- ============================================================================
-- PR-1 (tagnyilvántartás, település-P0) — szemely.c_helysegid BACKFILL
-- Dátum: 2026-07-17
-- Terv: docs/project-tracking/KARTOTEKA-tagnyilvantartas-finomhangolas-terv-2026-07-17.md (F3.3)
--
-- MIT JAVÍT:
--   A hibás import-normalizálás miatt a beimportált személyek c_helysegid-je
--   (település FK) NULL maradt, MIKÖZBEN a c_utcaid-en keresztül az utca
--   (adrstreet.localityid) pontosan tudja a települést. Ez az egyszeri UPDATE
--   az utca településével pótolja a hiányzó c_helysegid-eket.
--
-- FUTTATÁSI SORREND — FONTOS:
--   1. ELŐBB futtasd az 1. ELLENŐRZŐ blokkot, és nézd át az eredményt!
--      Különösen: ha a 1/b mintában olyan utca-települések látszanak, amelyek
--      NYILVÁNVALÓAN rosszak (pl. minden utca ugyanahhoz az egy településhez
--      kötve, ami nem a gyülekezet faluja — az „első adrlocality" csapda),
--      NE futtasd az UPDATE-et, hanem küldd vissza az eredményt!
--   2. Ha az 1. blokk rendben: futtasd a 2. UPDATE-et.
--   3. Végül a 3. VERIFIKÁCIÓ blokkot.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ELLENŐRZÉS (csak olvas)
-- ────────────────────────────────────────────────────────────────────────────

-- 1/a: hány sort érintene a backfill, gyülekezetenként
SELECT sz.congregation_id,
       count(*) AS backfill_jelolt
FROM public.szemely sz
JOIN public.adrstreet s ON s.id = sz.c_utcaid
WHERE sz.c_helysegid IS NULL
  AND s.localityid IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;

-- 1/b: 20 sor minta — NÉZD ÁT, hogy az utca-szerinti település hihető-e!
SELECT sz.id, sz.csaladnev, sz.k_nev, s.name AS utca, sz.c_szam,
       l.name AS potlando_telepules
FROM public.szemely sz
JOIN public.adrstreet s ON s.id = sz.c_utcaid
JOIN public.adrlocality l ON l.id = s.localityid
WHERE sz.c_helysegid IS NULL
ORDER BY sz.id DESC LIMIT 20;

-- 1/c: az „első adrlocality" csapda ellenőrzése — hány jelölt kapná a
--      legkisebb id-jű települést (ha sok, gyanús: a _resolve_or_create_street
--      NULL-fallbackja kötötte oda az utcákat)
SELECT l.name AS legkisebb_id_telepules,
       count(*) AS ide_kotne_a_backfill
FROM public.szemely sz
JOIN public.adrstreet s ON s.id = sz.c_utcaid
JOIN public.adrlocality l ON l.id = s.localityid
WHERE sz.c_helysegid IS NULL
  AND s.localityid = (SELECT min(id) FROM public.adrlocality)
GROUP BY 1;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL (csak az 1. blokk átnézése UTÁN!)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.szemely sz
SET c_helysegid = s.localityid
FROM public.adrstreet s
WHERE s.id = sz.c_utcaid
  AND sz.c_helysegid IS NULL
  AND s.localityid IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. VERIFIKÁCIÓ
-- ────────────────────────────────────────────────────────────────────────────

-- Maradt-e még c_helysegid nélküli látható személy (várt: csak azok, akiknek
-- utcájuk sincs — őket a lelkész kézzel javítja a szerkesztő űrlapon):
SELECT count(*) AS meg_mindig_nincs_telepules,
       count(*) FILTER (WHERE sz.c_utcaid IS NULL) AS ebbol_utca_sincs
FROM public.szemely sz
WHERE sz.isvisible = true AND sz.c_helysegid IS NULL;
