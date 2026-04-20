-- 2026-04-23 — M0.5: user_devices + licenses + audit_log táblák
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  Ez az M0.5 fázis alapja — a Tauri-kliens (M1-M5) infrastruktúrája:
--   - Eszköz-regisztráció (Tauri kliens → Supabase, minden gépen külön device_id)
--   - Licenc-rendszer (1 licenc = N eszköz limit, JWT offline-olvasható)
--   - Audit-log (minden admin akció + minden sync push/pull-ot rögzít)
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. user_devices — Tauri-kliensek regisztrációja
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  platform TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_revoked ON public.user_devices(revoked) WHERE revoked = false;

COMMENT ON TABLE public.user_devices IS
  'Tauri desktop-klienseknek regisztrált eszközök. Minden gép egy külön device_fingerprint-et kap.';

-- RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_devices"
  ON public.user_devices FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "users_register_own_devices"
  ON public.user_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_revokes_devices"
  ON public.user_devices FOR UPDATE
  USING (public.is_admin() OR user_id = auth.uid())
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

-- Tiltás DELETE-re (audit-megőrzés)

-- ─────────────────────────────────────────────────────────────────────
-- 2. licenses — user-szintű licenc
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  congregation_id UUID REFERENCES public.congregations(id),
  device_limit INT NOT NULL DEFAULT 2 CHECK (device_limit > 0 AND device_limit <= 10),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  issued_jwt TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_valid_until ON public.licenses(valid_until);
CREATE INDEX IF NOT EXISTS idx_licenses_active ON public.licenses(user_id) WHERE revoked = false;

COMMENT ON TABLE public.licenses IS
  'User-szintű licenc a Tauri desktop-klienshez. A JWT offline-olvasható, tartalmazza: user_id, device_limit, valid_until.';

CREATE OR REPLACE FUNCTION public.tg_licenses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS licenses_updated_at ON public.licenses;
CREATE TRIGGER licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_licenses_updated_at();

-- RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_license"
  ON public.licenses FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "admin_manages_licenses"
  ON public.licenses FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_updates_licenses"
  ON public.licenses FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 3. audit_log — naplózott rendszer-események
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.user_devices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  metadata JSONB,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log(target_table, target_id) WHERE target_id IS NOT NULL;

COMMENT ON TABLE public.audit_log IS
  'Rendszer-események naplója. Minden admin akció (approve/reject/revoke), minden sync push/pull, minden doc-letöltés ide kerül.';

COMMENT ON COLUMN public.audit_log.action IS
  'Pl: login, logout, access_request.approve, access_request.reject, device.register, device.revoke, license.issue, document.download, sync.push, sync.pull';

-- RLS: csak admin olvashatja, a user csak a saját akciót
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_audit"
  ON public.audit_log FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- INSERT: csak authenticated-nek
CREATE POLICY "authenticated_insert_audit"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Tiltás UPDATE/DELETE-re (audit-integritás)

-- ─────────────────────────────────────────────────────────────────────
-- 4. Helper: audit_log gyors-beszúró függvény
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_target_table TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_device_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_log (user_id, device_id, action, target_table, target_id, metadata)
  VALUES (auth.uid(), p_device_id, p_action, p_target_table, p_target_id, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

COMMENT ON FUNCTION public.log_audit_event IS
  'Gyors-beszúró függvény. A user_id-t az auth.uid()-ból veszi. Visszaadja az új sor ID-ját.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. Ellenőrzés
-- ─────────────────────────────────────────────────────────────────────

SELECT
  'user_devices' AS tabla,
  COUNT(*) AS sorok,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'user_devices') AS policy_count
FROM public.user_devices
UNION ALL
SELECT 'licenses', COUNT(*), (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'licenses')
FROM public.licenses
UNION ALL
SELECT 'audit_log', COUNT(*), (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'audit_log')
FROM public.audit_log;

-- RLS státusz
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
WHERE c.relname IN ('user_devices', 'licenses', 'audit_log')
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.log_audit_event(TEXT, TEXT, UUID, JSONB, UUID);
-- DROP TABLE IF EXISTS public.audit_log;
-- DROP TRIGGER IF EXISTS licenses_updated_at ON public.licenses;
-- DROP FUNCTION IF EXISTS public.tg_licenses_updated_at();
-- DROP TABLE IF EXISTS public.licenses;
-- DROP TABLE IF EXISTS public.user_devices;
-- COMMIT;
