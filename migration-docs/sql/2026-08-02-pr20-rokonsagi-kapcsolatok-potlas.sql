-- ============================================================================
-- PR-20 (2026-08-02) — CSALÁDFA: HIÁNYZÓ ROKONSÁGI KAPCSOLATOK PÓTLÁSA
--
-- Háttér: a családfa KIZÁRÓLAG a szemely_kapcsolat táblából épül
-- (szulo_gyermek / hazastars élek). A Családok fülről vagy a személyi karton
-- „Családhoz rendelés" gombjával mentett tagságok viszont eddig NEM írtak
-- ilyen sorokat (csak a CNP-s tagmentés, a keresztelés és az importok) —
-- ezért állt meg a fa a szülőknél, nagyszülők/nagybácsik/unokatestvérek
-- nélkül. A PR-20 után a felület már minden mentésnél írja az éleket; ez a
-- szkript a KORÁBBAN létrejött hiányokat pótolja a meglévő, idempotens
-- sync_households_from_csalad(uuid) RPC újrafuttatásával (ugyanaz, ami a
-- 2026-07-18-i F6.1-nél már sikeresen lefutott).
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl kijelölés nélkül.
-- Idempotens — többszöri futtatás ártalmatlan.
-- ============================================================================

-- 1) Pótlás minden gyülekezetre (a kapcsolat_created oszlop mutatja, hány új él jött létre)
SELECT c.name, public.sync_households_from_csalad(c.id) AS eredmeny
FROM public.congregations c
ORDER BY c.name;

-- 2) VERIFIKÁCIÓ — hiányzó szülő-gyerek élek száma (várt: 0 minden sorban)
SELECT h.congregation_id,
       COUNT(*) AS hianyzo_szulo_gyerek_el
FROM public.gyerek g
JOIN public.csalad c ON c.id = g.id_csalad
JOIN public.haztartas h ON h.legacy_csalad_id = c.id
CROSS JOIN LATERAL (VALUES (c.id_ferfi), (c.id_no)) AS p(szulo_id)
WHERE p.szulo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.szemely_kapcsolat k
    WHERE k.id_szemely_1 = p.szulo_id
      AND k.id_szemely_2 = g.id_szemely
      AND k.tipus = 'szulo_gyermek'
      AND k.ervenyes_ig IS NULL
  )
GROUP BY h.congregation_id
ORDER BY hianyzo_szulo_gyerek_el DESC;

-- 3) TÁJÉKOZTATÓ — élek száma gyülekezetenként (a családfa „üzemanyaga")
SELECT congregation_id,
       COUNT(*) FILTER (WHERE tipus = 'szulo_gyermek') AS szulo_gyerek,
       COUNT(*) FILTER (WHERE tipus = 'hazastars') AS hazastars,
       COUNT(*) FILTER (WHERE tipus = 'nagyszulo_unoka') AS nagyszulo_unoka
FROM public.szemely_kapcsolat
WHERE ervenyes_ig IS NULL
GROUP BY congregation_id;

-- MEGJEGYZÉS: a fa csak azt tudja megmutatni, ami rögzítve van. Ha egy tag
-- nagyszülei nem szerepelnek a nyilvántartásban (vagy a szülő nincs a SAJÁT
-- szülei családjában gyermekként rögzítve), a fa ott továbbra is megáll —
-- ilyenkor a nagyszülők családját kell rögzíteni (Családok fül), vagy a
-- szülő kartonján a szülő-linket megadni.
