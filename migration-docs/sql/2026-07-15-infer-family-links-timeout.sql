-- ============================================================================
-- Auto-link RPC statement_timeout emelése — a családi import „elhasalt" oka
-- 2026-07-15
--
-- DIAGNÓZIS: az `authenticated` szerep statement_timeout = 8s. A nagy
-- gyülekezeteken az `infer_family_links_for_congregation` (drága
-- `LIKE '%szülő-név%'` korrelált allekérdezések, per-sor) túllépi a 8 másodpercet
-- → a lekérdezés megszakad → a „Családszerkezet összeállítása" (auto-link) lépés
-- hibát ad. (A v0.9.73 óta ez már nem ragad be a UI-n, de le sem futott.)
--
-- FIX: erre az EGY nehéz SECURITY DEFINER függvényre 120s statement_timeout.
-- A per-függvény `SET` a függvény belépésekor felülírja a szerep-limitet, így a
-- teljes hívás a 120 mp-es kerettel fut. Minden MÁS lekérdezést változatlanul hagy.
-- Nincs adat-változás, csak konfiguráció.
-- ============================================================================

ALTER FUNCTION public.infer_family_links_for_congregation(uuid, text, boolean)
  SET statement_timeout = '120s';

-- Ellenőrzés — a proconfig-ban most már ott a statement_timeout:
SELECT proname, proconfig
FROM pg_proc
WHERE proname = 'infer_family_links_for_congregation';
