-- ============================================================================
-- 2026-06-05d — Audit-alap (F0+F1): last_seen_at + touch RPC
-- ----------------------------------------------------------------------------
-- A "ki használta a rendszert egy adott időszakban, és mit módosított"
-- követés első lépése. A meglévő infrastruktúrára épül:
--   - public.audit_log tábla + public.log_audit_event() RPC (2026-04-23)
--   - apps/web/lib/audit/log.ts (logAuditEvent wrapper)
--
-- Ez az SQL két dolgot ad hozzá:
--   1) profiles.last_seen_at — "mikor használta utoljára a rendszert" (a login
--      és a fontos műveletek frissítik).
--   2) touch_last_seen() RPC — olcsó, feltételes frissítés (csak ha >5 perc
--      telt el az utolsó óta), hogy ne terhelje feleslegesen az adatbázist.
--
-- FONTOS (a következő fázisokhoz, F4): a service-role / SECURITY DEFINER
-- írásoknál az auth.uid() NULL. Az app-szintű audit (logAuditEvent) viszont a
-- BEJELENTKEZETT session-klienssel hívja a log_audit_event()-et, így ott az
-- auth.uid() helyesen a felhasználót adja. A sor-szintű (trigger) audithoz majd
-- külön be kell injektálni az actor-id-t (app.actor_id GUC) — az F4-ben.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ============================================================================

BEGIN;

-- 1) last_seen_at oszlop
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Mikor használta utoljára a felhasználó a rendszert (login + fontos műveletek frissítik). Audit/aktivitás-követéshez. 2026-06-05.';

-- "Kik voltak aktívak egy időszakban" gyors lekérdezéshez
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;

-- 2) touch_last_seen() — feltételes (write-amplification elkerülése)
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET last_seen_at = now()
   WHERE id = auth.uid()
     AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes');
END;
$$;

COMMENT ON FUNCTION public.touch_last_seen() IS
  'A bejelentkezett felhasználó last_seen_at-jét frissíti, de csak ha >5 perc telt el (write-amplification ellen). 2026-06-05.';

GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles' AND column_name='last_seen_at';
-- Aktív felhasználók az elmúlt 7 napban:
-- SELECT full_name, email, last_seen_at FROM public.profiles
--   WHERE last_seen_at > now() - interval '7 days' ORDER BY last_seen_at DESC;
