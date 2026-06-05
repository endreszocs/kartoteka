-- ============================================================================
-- 2026-06-05m — GYÖKÉR-FIX: service_role grant-ok visszaállítása (welcome-zárás)
-- ----------------------------------------------------------------------------
-- TÜNETEK (a welcome wizard véglegesítésekor, completeWizard):
--   1. "permission denied for table bealitas"  (a service-role írásnál)
--   2. "A gyülekezet adatai nem találhatók a rendszerben." (congregation-row-missing
--       — a service-role congregations OLVASÁS NULL-t ad, mert "permission denied")
--
-- OK: a completeWizard a service_role klienssel ír/olvas (RLS-megkerülés). A
-- `service_role` szerep azonban NÉHÁNY publikus táblán ELVESZTETTE a GRANT-jait
-- (a korábbi jog-szigorítások mellékhatása). A service_role bypass-olja az RLS-t,
-- DE a tábla-szintű GRANT neki is kell — enélkül "permission denied", amit a
-- `.maybeSingle()` NULL-ként ad vissza (innen a "nem találhatók" üzenet).
--
-- MEGOLDÁS: a `service_role` (megbízható backend-szerep) kapja vissza a TELJES
-- hozzáférést minden publikus táblára/szekvenciára/függvényre + a jövőbeli
-- objektumokra is (DEFAULT PRIVILEGES). Az `authenticated` továbbra is csak az
-- RLS-policy által engedett sorokat éri el.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- (A postgres/owner szerepként fut, ezért az ALTER DEFAULT PRIVILEGES is működik.)
-- ============================================================================

BEGIN;

-- 1) service_role — teljes hozzáférés minden meglévő objektumra
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 2) Jövőbeli objektumok is (hogy ez ne forduljon elő újra)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 3) authenticated — biztosítjuk az olvasást a congregations-on (RLS scope-olja).
--    (A wizard P2-guard a congregations-t olvassa; session-kliens fallback esetén
--    is működnie kell.)
GRANT SELECT ON public.congregations TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- A service_role lát-e mindent? (várt: sok sor)
-- SELECT table_name FROM information_schema.role_table_grants
--   WHERE grantee='service_role' AND table_schema='public' AND privilege_type='SELECT'
--   ORDER BY table_name LIMIT 20;
-- A congregations-on van-e a service_role-nak + authenticated-nek SELECT?
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='congregations'
--     AND grantee IN ('service_role','authenticated') ORDER BY grantee, privilege_type;
