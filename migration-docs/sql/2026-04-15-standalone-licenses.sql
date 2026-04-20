-- ─────────────────────────────────────────────────────────────────
-- KARTOTEKA Standalone License rendszer (Fázis 7c production setup)
-- ─────────────────────────────────────────────────────────────────
--
-- Tárolja a kibocsátott Windows-standalone licenszeket. Minden licensz
-- egy (user_id, machine_fingerprint) párhoz tartozik — egy lelkész több
-- gépen is használhatja, de minden gépen külön licensz.
--
-- Funkciók:
--   1. CREATE TABLE standalone_licenses
--   2. RLS — saját licenszek olvashatók, írásra csak az issue_license()
--   3. issue_license(p_fingerprint) RPC — egy user kéri a saját
--      gyülekezetére kiállítva a JWT-t (a JWT-t az Edge Function generálja)
--   4. revoke_license(p_id) RPC — admin/master szerepkör tudja
--   5. list_my_licenses() RPC — a user lekérdezi a saját licenszeit
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.issue_license(text);
--   DROP FUNCTION IF EXISTS public.revoke_license(uuid);
--   DROP FUNCTION IF EXISTS public.list_my_licenses();
--   DROP TABLE IF EXISTS public.standalone_licenses CASCADE;
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.standalone_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),

  -- Machine fingerprint (Level 2 DEEP SHA-256 hex)
  machine_fingerprint text NOT NULL,

  -- Egy gépre csak EGY aktív licensz lehet
  CONSTRAINT standalone_licenses_unique_per_machine UNIQUE (user_id, machine_fingerprint),

  -- Időpontok
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '35 days'),
  last_sync_at timestamptz NOT NULL DEFAULT now(),

  -- Visszavonás
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid REFERENCES auth.users(id),

  -- Diagnosztikai mezők (a user fingerprint komponensei, debug-hoz)
  os_info text,
  app_version text,

  -- Audit
  ip_address inet,
  user_agent text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexek
CREATE INDEX IF NOT EXISTS standalone_licenses_user_idx ON public.standalone_licenses (user_id);
CREATE INDEX IF NOT EXISTS standalone_licenses_cong_idx ON public.standalone_licenses (congregation_id);
CREATE INDEX IF NOT EXISTS standalone_licenses_revoked_idx ON public.standalone_licenses (revoked) WHERE revoked = true;
CREATE INDEX IF NOT EXISTS standalone_licenses_expires_idx ON public.standalone_licenses (expires_at);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.standalone_licenses_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS standalone_licenses_updated_at_trg ON public.standalone_licenses;
CREATE TRIGGER standalone_licenses_updated_at_trg
  BEFORE UPDATE ON public.standalone_licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.standalone_licenses_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.standalone_licenses ENABLE ROW LEVEL SECURITY;

-- A user csak SAJÁT licenszeit látja
DROP POLICY IF EXISTS standalone_licenses_select_own ON public.standalone_licenses;
CREATE POLICY standalone_licenses_select_own ON public.standalone_licenses
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT csak az issue_license RPC-n keresztül (SECURITY DEFINER) — direkt insert tiltott
DROP POLICY IF EXISTS standalone_licenses_no_direct_insert ON public.standalone_licenses;
CREATE POLICY standalone_licenses_no_direct_insert ON public.standalone_licenses
  FOR INSERT
  WITH CHECK (false);

-- UPDATE csak az issue_license / revoke_license-en keresztül
DROP POLICY IF EXISTS standalone_licenses_no_direct_update ON public.standalone_licenses;
CREATE POLICY standalone_licenses_no_direct_update ON public.standalone_licenses
  FOR UPDATE
  USING (false);

-- DELETE: csak ha admin (master role)
DROP POLICY IF EXISTS standalone_licenses_delete_admin ON public.standalone_licenses;
CREATE POLICY standalone_licenses_delete_admin ON public.standalone_licenses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('master', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- RPC: issue_license — új licensz kiállítása (a JWT-t az Edge Function aláírja)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_license(
  p_fingerprint text,
  p_os_info text DEFAULT NULL,
  p_app_version text DEFAULT '1.0.0',
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS table(
  license_id uuid,
  user_id uuid,
  congregation_id uuid,
  expires_at timestamptz,
  issued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cong_id uuid;
  v_license_id uuid;
  v_existing_revoked boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_fingerprint IS NULL OR length(p_fingerprint) < 32 THEN
    RAISE EXCEPTION 'Invalid fingerprint (must be at least 32 chars)';
  END IF;

  -- A user gyülekezete
  SELECT congregation_id INTO v_cong_id FROM public.profiles WHERE id = v_user_id;
  IF v_cong_id IS NULL THEN
    RAISE EXCEPTION 'User has no congregation';
  END IF;

  -- Profil státusz check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User account is not active';
  END IF;

  -- Ha már létezik (user, fingerprint) páros, nézzük meg revoked-e
  SELECT revoked INTO v_existing_revoked
  FROM public.standalone_licenses
  WHERE standalone_licenses.user_id = v_user_id
    AND machine_fingerprint = p_fingerprint;

  IF v_existing_revoked THEN
    RAISE EXCEPTION 'License revoked for this machine. Contact administration.';
  END IF;

  -- UPSERT — új vagy frissített licensz
  INSERT INTO public.standalone_licenses (
    user_id, congregation_id, machine_fingerprint,
    expires_at, last_sync_at,
    os_info, app_version, ip_address, user_agent
  ) VALUES (
    v_user_id, v_cong_id, p_fingerprint,
    now() + interval '35 days', now(),
    p_os_info, p_app_version, p_ip_address, p_user_agent
  )
  ON CONFLICT (user_id, machine_fingerprint) DO UPDATE SET
    expires_at = now() + interval '35 days',
    last_sync_at = now(),
    os_info = COALESCE(EXCLUDED.os_info, public.standalone_licenses.os_info),
    app_version = COALESCE(EXCLUDED.app_version, public.standalone_licenses.app_version),
    ip_address = COALESCE(EXCLUDED.ip_address, public.standalone_licenses.ip_address),
    user_agent = COALESCE(EXCLUDED.user_agent, public.standalone_licenses.user_agent)
  RETURNING id INTO v_license_id;

  -- Visszaadjuk a licensz adatait — az Edge Function ezekből készíti a JWT-t
  RETURN QUERY
  SELECT
    sl.id,
    sl.user_id,
    sl.congregation_id,
    sl.expires_at,
    sl.issued_at
  FROM public.standalone_licenses sl
  WHERE sl.id = v_license_id;
END;
$$;

COMMENT ON FUNCTION public.issue_license(text, text, text, inet, text) IS
  'Standalone licensz kiállítása az aktuális user-nek a megadott machine_fingerprint-re. '
  'A JWT-t az Edge Function aláírja (issue-license).';

-- ─────────────────────────────────────────────────────────────────
-- RPC: list_my_licenses — saját licenszek lekérdezése
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_my_licenses()
RETURNS table(
  id uuid,
  congregation_id uuid,
  machine_fingerprint_prefix text, -- csak első 16 karakter UI-ra
  issued_at timestamptz,
  expires_at timestamptz,
  last_sync_at timestamptz,
  revoked boolean,
  revoked_reason text,
  os_info text,
  app_version text,
  days_until_expiry integer
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    sl.id,
    sl.congregation_id,
    substring(sl.machine_fingerprint, 1, 16) || '…' AS machine_fingerprint_prefix,
    sl.issued_at,
    sl.expires_at,
    sl.last_sync_at,
    sl.revoked,
    sl.revoked_reason,
    sl.os_info,
    sl.app_version,
    EXTRACT(day FROM (sl.expires_at - now()))::integer AS days_until_expiry
  FROM public.standalone_licenses sl
  WHERE sl.user_id = auth.uid()
  ORDER BY sl.issued_at DESC;
$$;

COMMENT ON FUNCTION public.list_my_licenses() IS
  'A bejelentkezett user összes standalone licensze (a teljes fingerprint helyett csak a prefix).';

-- ─────────────────────────────────────────────────────────────────
-- RPC: revoke_license — egy licensz visszavonása
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_license(
  p_license_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Admin check
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('master', 'admin')
  ) INTO v_is_admin;

  -- A licensz tulajdonosa
  SELECT user_id INTO v_owner_id
  FROM public.standalone_licenses
  WHERE id = p_license_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'License not found';
  END IF;

  -- Saját licensz vagy admin
  IF v_owner_id != v_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.standalone_licenses
  SET
    revoked = true,
    revoked_at = now(),
    revoked_reason = COALESCE(p_reason, 'User requested'),
    revoked_by = v_user_id
  WHERE id = p_license_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.revoke_license(uuid, text) IS
  'Egy standalone licensz visszavonása. A user csak saját licenszét vonhatja vissza, admin bármelyiket.';

-- ─────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.issue_license(text, text, text, inet, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_licenses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_license(uuid, text) TO authenticated;

GRANT SELECT ON public.standalone_licenses TO authenticated;
-- INSERT/UPDATE/DELETE az RLS-en keresztül szabályozott (vagy SECURITY DEFINER RPC-vel)

-- ─────────────────────────────────────────────────────────────────
-- Manuális ellenőrzés
-- ─────────────────────────────────────────────────────────────────
-- -- Saját licenszek listája
-- SELECT * FROM public.list_my_licenses();
--
-- -- Új licensz kérése (a fingerprint-et a kliens küldi be)
-- SELECT * FROM public.issue_license(
--   p_fingerprint := 'a1b2c3d4...',
--   p_os_info := 'Windows 11 Pro',
--   p_app_version := '1.0.0'
-- );
--
-- -- Visszavonás
-- SELECT public.revoke_license('uuid-here', 'Eladtam a gépet');
