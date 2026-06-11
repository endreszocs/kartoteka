-- ============================================================================
-- KARTOTÉKA — Jogosultság-ellenőrzés (2026-06-11) · EGYETLEN lekérdezés
--
-- MIT CSINÁL (egyszerűen): megmutatja, hogy a BEJELENTKEZETT felhasználók
-- (authenticated) tudnak-e írni/olvasni a pénzügyi táblákban, és hogy a
-- BE-NEM-JELENTKEZETT látogatók (anon) helyesen ki vannak-e zárva.
--
-- HOGYAN FUTTASD: Supabase → SQL Editor → beillesztés → Run → a teljes
-- eredményt másold vissza. CSAK OLVAS.
--
-- MI A JÓ EREDMÉNY:
--   - 'authenticated' sorokban: SELECT és INSERT szerepel a befizetes/kiadas
--     tábláknál → a belépett lelkész tud rögzíteni. ✔
--   - 'anon' sorok: legjobb, ha NINCSENEK (vagy nincs köztük INSERT) →
--     belépés nélkül senki nem írhat. ✔
-- ============================================================================
SELECT grantee AS szerepkor, table_name AS tabla,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS jogok
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('befizetes', 'kiadas', 'belsomozgas')
   AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee, table_name
 ORDER BY table_name, grantee;
