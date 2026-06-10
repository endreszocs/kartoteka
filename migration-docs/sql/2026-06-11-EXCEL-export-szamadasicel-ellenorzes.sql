-- ============================================================================
-- KARTOTÉKA — Excel-integráció E2: kód-szótár ELLENŐRZŐ EXPORT (read-only)
-- ============================================================================
--
-- Dátum: 2026-06-11
-- Cél: a Kartotéka költségvetési kód-NEVEINEK kilistázása, hogy 1:1 össze
--      lehessen vetni a hivatalos EREK Excel `bev`/`kiad` legördülő-listáival
--      (Adatok_<év>.xlsx → I/K oszlop), MIELŐTT az Excel-write-through (E3) indul.
--
-- Ez a script CSAK OLVAS (SELECT) — semmit nem módosít. Futtasd a Kartotéka
-- Supabase SQL editorában, és küldd vissza az eredményt (vagy vesd össze
-- magad egy diocese-konfigurált Excel I/K legördülőjével).
--
-- Az Excel I/K oszlopába a NÉV megy (pl. „Egyházfenntartói járulék"), ezért a
-- `befizetescel.nev` / `kiadascel.nev` a hiteles összevetési kulcs.
-- ============================================================================

-- 1) BEVÉTELI kategória-nevek (ezek mehetnek a Kassza/bank-lap I oszlopába)
SELECT
  'BEVETEL' AS irany,
  bc.nev    AS kategoria_nev,
  s.id      AS szamadasi_kod,   -- pl. 101.01 (referencia)
  s.szint   AS szint,
  bc.aktiv,
  bc.belsotetel
FROM public.befizetescel bc
JOIN public.szamadasicel s ON s.id = bc.id_szamadasicel
WHERE bc.aktiv = true
ORDER BY s.id, bc.nev;

-- 2) KIADÁSI kategória-nevek (ezek mehetnek a Kassza/bank-lap K oszlopába)
SELECT
  'KIADAS'  AS irany,
  kc.nev    AS kategoria_nev,
  s.id      AS szamadasi_kod,
  s.szint   AS szint,
  kc.aktiv,
  kc.belsotetel
FROM public.kiadascel kc
JOIN public.szamadasicel s ON s.id = kc.id_szamadasicel
WHERE kc.aktiv = true
ORDER BY s.id, kc.nev;

-- 3) Belső-mozgás nevek külön (ezeknek BYTE-AZONOSAN kell egyezniük az Excellel:
--    „Készpénzfelvétel a(z) A számláról" / „Készpénzletétel a(z) A számlára")
SELECT 'BELSO_MOZGAS' AS tipus, nev FROM public.befizetescel WHERE belsotetel = true AND aktiv = true
UNION ALL
SELECT 'BELSO_MOZGAS' AS tipus, nev FROM public.kiadascel WHERE belsotetel = true AND aktiv = true
ORDER BY nev;

-- 4) Darabszám-összesítő (gyors kép)
SELECT
  (SELECT count(*) FROM public.befizetescel WHERE aktiv) AS bevetel_kategoriak,
  (SELECT count(*) FROM public.kiadascel    WHERE aktiv) AS kiadas_kategoriak,
  (SELECT count(*) FROM public.szamadasicel)             AS szamadasicel_osszes;

-- ============================================================================
-- ÖSSZEVETÉS: a fenti `kategoria_nev` értékeket vesd össze az Excel I/K oszlop
-- legördülőjével (egy diocese-konfigurált Adatok_<év>.xlsx-ben). Minden eltérő
-- string (ékezet / szóköz / megfogalmazás) RENDEZENDŐ, mielőtt az E3 pénzt ír.
-- ============================================================================
