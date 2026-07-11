-- ─────────────────────────────────────────────────────────────────────────
-- 2026-07-11 — KRITIKUS biztonsági fix: god-mode PIN kiszivárgás bezárása
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLÉMA: a `system_settings_read` policy (2026-04-13-rls-hybrid-admin-tables.sql:43
-- és 2026-04-13-rls-ALL-FIXED.sql:173) FOR SELECT TO authenticated USING (true) —
-- így BÁRMELY bejelentkezett felhasználó a saját Supabase-kliensével lekérdezheti:
--     select value from system_settings where key = 'god_mode_pin';
-- és megkapja a PLAINTEXT god-mode PIN-t. Ez teljesen kioltja a 2026-07-11
-- kliens-oldali fixet (a szerver már nem küldi le, de a tábla közvetlenül olvasható).
--
-- FIX: a read-policy zárja ki a god_mode-kulcsokat. A god-mode aktiválás a
-- service-role (createAdminClient) klienssel olvassa a PIN-t, ami megkerüli az
-- RLS-t — tehát a funkció NEM törik el, csak a kliens-olvasás záródik be.
--
-- Idempotens. Nem-destruktív a nem-god_mode kulcsok olvasására nézve.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS system_settings_read ON public.system_settings;

CREATE POLICY system_settings_read ON public.system_settings
  FOR SELECT TO authenticated
  USING (key NOT LIKE 'god\_mode%');

-- Ellenőrzés (nem-admin userként FUTTATVA 0 sort kell adjon):
-- SELECT key FROM public.system_settings WHERE key LIKE 'god\_mode%';
--
-- A policy listázása:
-- SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'system_settings' AND policyname = 'system_settings_read';
