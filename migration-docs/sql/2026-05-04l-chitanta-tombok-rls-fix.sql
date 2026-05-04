-- =========================================================================
-- 2026-05-04 — chitanta_tombok RLS-policy bővítés
-- =========================================================================
-- HIBA:
--   "new row violates row-level security policy for table 'chitanta_tombok'"
--
-- OK:
--   A 2026-04-18-chitanta-tombok-fazis-2.sql-ben a RLS-policy CSAK a primary
--   `profiles.congregation_id`-t nézi. A multi-role user (pl. lelkipásztor +
--   egyházmegyei számvevő) `effectiveCongregationId`-je viszont az aktív
--   profile_role scope-jától függ — és NEM feltétlenül egyezik a primary
--   profile.congregation_id-vel.
--
--   Ezért a policy WITH CHECK feltétele false-t adott INSERT-kor, és
--   "new row violates RLS policy"-t kaptunk.
--
-- MEGOLDÁS:
--   A policy-t cseréljük a centralizált `current_user_can_access_congregation()`
--   helper-re, ami:
--     - master admin
--     - saját gyülekezet (profile.congregation_id)
--     - egyházkerületi admin saját kerülete alatt
--     - egyházmegyei számvevő a megyéje gyülekezeteiben
--     - konyvelo/szamvevo (profile_congregations approved)
--   mind kezelve.
-- =========================================================================

DROP POLICY IF EXISTS chitanta_tombok_congregation_access ON public.chitanta_tombok;

CREATE POLICY chitanta_tombok_congregation_access
  ON public.chitanta_tombok FOR ALL TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY chitanta_tombok_congregation_access ON public.chitanta_tombok IS
  'A current_user_can_access_congregation() helper-en át — multi-role user-eket is kezeli.';


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

SELECT polname, polpermissive, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.chitanta_tombok'::regclass;
