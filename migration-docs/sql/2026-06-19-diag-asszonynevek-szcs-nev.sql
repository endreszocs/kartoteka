-- ============================================================================
-- DIAGNOSZTIKA — Férjes asszonyok név-tárolása + lánykori (szcs_nev) kitöltöttség
-- 2026-06-19
--
-- CÉL: eldönteni, kell-e "spouse-bridge" a párosítóhoz (P1-4 az import-audit-ban).
--   A férjes asszony a Kasszában "Beder Győzőné Elvira" formában szerepel — a férj
--   családnevén. A párosítás akkor talál rá, ha a tagnyilvántartásban is így van,
--   VAGY ha a lánykori nevet (szcs_nev) töltötték ki. Ha a nők lánykori néven
--   vannak, szcs_nev nélkül, akkor a párosítás elbukik → spouse-bridge kell.
--
-- CSAK OLVAS (SELECT) — semmit nem módosít. Supabase SQL editorban futtatható.
-- A 3 lekérdezést külön-külön futtasd, és az eredményt küldd vissza (vagy a fő számokat).
-- ============================================================================

-- 1) ÖSSZESÍTETT: hány élő, látható NŐ van, és közülük hánynak van kitöltve
--    a lánykori (szcs_nev) neve.
--    Értelmezés:
--      - MAGAS % (pl. >60): a nők többségénél van lánykori név → a mostani
--        lánykori-fallback működik; a spouse-bridge kis haszon.
--      - ALACSONY %: vagy a nők lánykori néven vannak (lásd 3. kérdés), vagy
--        a férj nevén szcs_nev nélkül → a spouse-bridge fontossá válik.
SELECT
  count(*) FILTER (WHERE ferfi = false)                                              AS no_total,
  count(*) FILTER (WHERE ferfi = false AND coalesce(btrim(szcs_nev), '') <> '')      AS no_szcs_kitoltve,
  round(
    100.0 * count(*) FILTER (WHERE ferfi = false AND coalesce(btrim(szcs_nev), '') <> '')
    / nullif(count(*) FILTER (WHERE ferfi = false), 0)
  , 1)                                                                               AS szcs_kitoltottseg_szazalek
FROM szemely
WHERE isvisible = true AND coalesce(meghalt, false) = false;

-- 2) GYÜLEKEZETENKÉNT ugyanez — hol éri meg a spouse-bridge.
SELECT
  congregation_id,
  count(*) FILTER (WHERE ferfi = false)                                              AS no_total,
  count(*) FILTER (WHERE ferfi = false AND coalesce(btrim(szcs_nev), '') <> '')      AS no_szcs_kitoltve,
  round(
    100.0 * count(*) FILTER (WHERE ferfi = false AND coalesce(btrim(szcs_nev), '') <> '')
    / nullif(count(*) FILTER (WHERE ferfi = false), 0)
  , 1)                                                                               AS szcs_szazalek
FROM szemely
WHERE isvisible = true AND coalesce(meghalt, false) = false
GROUP BY congregation_id
ORDER BY no_total DESC;

-- 3) HEURISZTIKA: hány NŐ családneve egyezik egy AZONOS HÁZTARTÁSBAN lévő FÉRFI
--    családnevével (vagyis valószínűleg a férj nevén szerepel).
--    Értelmezés:
--      - Ha sok ilyen van ÉS a szcs_nev alacsony (1. kérdés) → a nők a férj nevén
--        vannak, lánykori név nélkül → a mostani párosítás többségüket megtalálja
--        (a férj családneve + keresztnév alapján), a spouse-bridge marginális.
--      - Ha kevés ilyen van ÉS a szcs_nev is alacsony → a nők valószínűleg
--        lánykori néven vannak → a spouse-bridge a domináns fix.
WITH tagok AS (
  SELECT ht.id_haztartas,
         s.id,
         s.ferfi,
         lower(btrim(s.csaladnev)) AS cs
  FROM haztartas_tag ht
  JOIN szemely s ON s.id = ht.id_szemely
  WHERE ht.ervenyes_ig IS NULL
    AND s.isvisible = true
    AND coalesce(s.meghalt, false) = false
    AND coalesce(btrim(s.csaladnev), '') <> ''
)
SELECT
  count(*) AS no_osszesen_haztartasban,
  count(*) FILTER (
    WHERE n.ferfi = false
      AND EXISTS (
        SELECT 1 FROM tagok f
        WHERE f.id_haztartas = n.id_haztartas
          AND f.ferfi = true
          AND f.cs = n.cs
      )
  ) AS no_ferj_csaladnevevel_azonos
FROM tagok n
WHERE n.ferfi = false;
