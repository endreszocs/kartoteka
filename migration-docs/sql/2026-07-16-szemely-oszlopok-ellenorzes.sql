-- =============================================================================
-- KARTOTÉKA — A `szemely` tábla oszlopainak ellenőrzése
-- 2026-07-16
--
-- MIÉRT: az initFinance (penzugy/actions.ts:985) ezt kéri le:
--   .select('id, csaladnev, k_nev, prefix, sz_datum, foglalkozas, meghalt,
--            elkoltozott, member_status')
-- Az Ön hibaüzenete („column s.elkoltozott does not exist") bizonyítja, hogy az
-- `elkoltozott` NEM oszlopa a szemely-nek (külön TÁBLA, id_szemely FK-val).
-- Ha a `prefix` sincs meg, akkor ez a lekérdezés HIBÁRA FUT, a kód pedig némán
-- elnyeli (`membersRes.data || []`) → a Tartozások lista MINDIG ÜRES.
--
-- ⚠️ CSAK OLVAS. Egyetlen SELECT.
-- =============================================================================

SELECT
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'szemely'
  AND c.column_name IN (
    'id', 'csaladnev', 'k_nev', 'prefix', 'sz_datum', 'foglalkozas',
    'meghalt', 'elkoltozott', 'member_status', 'isvisible', 'allapot', 'szcs_nev'
  )
ORDER BY c.column_name;

-- ÉRTELMEZÉS:
--   Ha a `prefix` és/vagy az `elkoltozott` HIÁNYZIK a fenti eredményből, akkor
--   az initFinance member-lekérdezése hibára fut → a Tartozások lista üres.
--   A `member_status` a helyes forrás a költözéshez (a kódbázis máshol már így
--   csinálja: registry-list-actions.ts:167 isMoved()).
