-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ⛔ EZT A FÁJLT NE FUTTASD ÚJRA — FELÜLÍRT FÜGGVÉNY-TÖRZSET HORDOZ       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Ez a migráció annak idején helyes volt, és a történetet dokumentálja — de
-- azóta biztonsági javítás írta felül az alábbi függvény(ek) törzsét. A
-- `CREATE OR REPLACE` NEM egyirányú: ha ezt a fájlt ma bárki újrafuttatja
-- (új környezet felállításakor, vagy egy másik hibát keresve), NÉMÁN
-- visszaveszi a javítást. Az adatbázis nem tiltakozik, a felület nem
-- változik, és a következő auditig senki nem veszi észre.
--
-- AMI ITT ELAVULT:
--   · is_admin()
--     kanonikus törzs: migration-docs/sql/2026-09-04-auth-p0-javitasok-1.sql
--     ha mégis lefut: a status-kapu eltűnne: pending/deleted profil is admin lenne
--
-- Az őrszem, ami ezt a szabályt őrzi: scripts/selftest-sql-kanonikus-torzs.mjs
-- (a „NE FUTTASD" jelölés adja a felmentést — ezért ne töröld ezt a fejlécet).

-- 2026-04-23 — M0 REPAIR (idempotens, biztonságos újra-futtatás)
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  Ez a fájl **AKÁRHÁNYSZOR** futtatható — minden CREATE előtt DROP IF EXISTS
--  van, így a "already exists" hibák NEM fordulnak elő.
--
--  Minden M0-os (M0.1-M0.6) elemet tartalmaz. Ha valami már létezik, felülírja.
--  Ha nem létezik, létrehozza. A végeredmény: teljes M0-infrastruktúra kész.
--
--  A korábbi M0 migrációk (m0-1, m0-3, m0-4, m0-5, m0-6) ezután NEM kellenek
--  — ez a REPAIR mindegyiket helyettesíti egyszeri futtatással.
--
--  HÁTRÁNY: adatvesztés! Ha már voltak sorok a táblákban (pl. teszt access-request),
--  azok **megmaradnak** (CREATE TABLE IF NOT EXISTS nem dobja el). De a policy-k,
--  függvények, triggerek **drop+recreate** — nagyon gyorsan lefut.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- M0.1 — access_requests
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  requested_role TEXT NOT NULL CHECK (requested_role IN (
    'lelkesz', 'esperes', 'egyhazmegyei_admin', 'egyhazkeruleti_admin',
    'konyvelo', 'egyhazmegyei_szamvevo'
  )),
  congregation_slug TEXT,
  phone TEXT,
  justification TEXT,
  referrer TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  admin_notes TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resulting_user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON public.access_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_access_requests_email
  ON public.access_requests(lower(email));
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at
  ON public.access_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_ip_hash
  ON public.access_requests(ip_hash, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_access_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS access_requests_updated_at ON public.access_requests;
CREATE TRIGGER access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_access_requests_updated_at();

-- RLS be
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Policy-k: drop+recreate (idempotens)
DROP POLICY IF EXISTS "Anyone can submit an access request" ON public.access_requests;
CREATE POLICY "Anyone can submit an access request"
  ON public.access_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Only admin can view access requests" ON public.access_requests;
CREATE POLICY "Only admin can view access requests"
  ON public.access_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Only admin can update access requests" ON public.access_requests;
CREATE POLICY "Only admin can update access requests"
  ON public.access_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Rate-limit függvény (SQL language, javított változat)
DROP FUNCTION IF EXISTS public.check_access_request_rate_limit(TEXT);
CREATE OR REPLACE FUNCTION public.check_access_request_rate_limit(p_ip_hash TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $func$
  SELECT
    p_ip_hash IS NULL
    OR btrim(p_ip_hash) = ''
    OR (SELECT COUNT(*) FROM public.access_requests
        WHERE ip_hash = p_ip_hash AND created_at > now() - interval '24 hours') < 3;
$func$;

-- ═════════════════════════════════════════════════════════════════════
-- M0.3 — JWT claim hook + is_user_approved
-- ═════════════════════════════════════════════════════════════════════

-- FONTOS (2026-04-23 tanulság): a Supabase parser sem a `record + INTO var`-t,
-- sem a **multi-value INTO**-t (`SELECT a,b,c INTO v1,v2,v3`) nem kezeli
-- stabilan — változónevet relation-nek próbálja feloldani (42P01).
--
-- Az összes létező működő `INTO` minta (standalone-licenses.sql) SINGLE-value.
-- Ezért a legbiztosabb megoldás: LANGUAGE sql + egyetlen SELECT expression
-- jsonb-építéssel. Nincs plpgsql, nincs INTO, nincs DECLARE.
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER               -- bypassRLS login-kor, amikor supabase_auth_admin hívja
SET search_path = public       -- injection-védelem
AS $func$
  WITH user_info AS (
    SELECT status, role, congregation_id
    FROM public.profiles
    WHERE id = (event->>'user_id')::uuid
    LIMIT 1
  )
  SELECT jsonb_set(
    event,
    '{claims}',
    COALESCE(event->'claims', '{}'::jsonb)
      || jsonb_build_object(
        'approved',
        COALESCE((SELECT status IN ('approved', 'active') FROM user_info), false)
      )
      || COALESCE(
        (SELECT jsonb_build_object('profile_status', status) FROM user_info WHERE status IS NOT NULL),
        '{}'::jsonb
      )
      || COALESCE(
        (SELECT jsonb_build_object('congregation_id', congregation_id::text) FROM user_info WHERE congregation_id IS NOT NULL),
        '{}'::jsonb
      )
      || COALESCE(
        (SELECT jsonb_build_object('profile_role', role) FROM user_info WHERE role IS NOT NULL),
        '{}'::jsonb
      )
  );
$func$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $func$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND status IN ('approved', 'active'));
$func$;

CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON public.profiles(status) WHERE status IN ('pending', 'approved', 'active');

-- ═════════════════════════════════════════════════════════════════════
-- M0.4 — RLS segédfüggvények
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $func$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$func$;

CREATE OR REPLACE FUNCTION public.is_egyhazkeruleti_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $func$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'egyhazkeruleti_admin'));
$func$;

CREATE OR REPLACE FUNCTION public.same_congregation(p_congregation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $func$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND congregation_id = p_congregation_id);
$func$;

CREATE OR REPLACE FUNCTION public.is_current_user_approved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $func$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status IN ('approved', 'active'));
$func$;

-- ═════════════════════════════════════════════════════════════════════
-- M0.5 — user_devices + licenses + audit_log
-- ═════════════════════════════════════════════════════════════════════

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
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_devices" ON public.user_devices;
CREATE POLICY "users_see_own_devices"
  ON public.user_devices FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_register_own_devices" ON public.user_devices;
CREATE POLICY "users_register_own_devices"
  ON public.user_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_revokes_devices" ON public.user_devices;
CREATE POLICY "admin_revokes_devices"
  ON public.user_devices FOR UPDATE
  USING (public.is_admin() OR user_id = auth.uid())
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

-- licenses
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

CREATE OR REPLACE FUNCTION public.tg_licenses_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS licenses_updated_at ON public.licenses;
CREATE TRIGGER licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_licenses_updated_at();

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_license" ON public.licenses;
CREATE POLICY "users_see_own_license"
  ON public.licenses FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "admin_manages_licenses" ON public.licenses;
CREATE POLICY "admin_manages_licenses"
  ON public.licenses FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_updates_licenses" ON public.licenses;
CREATE POLICY "admin_updates_licenses"
  ON public.licenses FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- audit_log
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
CREATE INDEX IF NOT EXISTS idx_audit_log_target
  ON public.audit_log(target_table, target_id) WHERE target_id IS NOT NULL;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_audit" ON public.audit_log;
CREATE POLICY "users_see_own_audit"
  ON public.audit_log FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "authenticated_insert_audit" ON public.audit_log;
CREATE POLICY "authenticated_insert_audit"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- log_audit_event helper
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_target_table TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_device_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.audit_log (user_id, device_id, action, target_table, target_id, metadata)
  VALUES (auth.uid(), p_device_id, p_action, p_target_table, p_target_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$func$;

-- ═════════════════════════════════════════════════════════════════════
-- M0.6 — documents + document_keys
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  congregation_id UUID REFERENCES public.congregations(id),
  storage_path TEXT NOT NULL UNIQUE,
  filename_encrypted BYTEA NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_congregation ON public.documents(congregation_id) WHERE congregation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_active ON public.documents(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON public.documents(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_documents_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.revision = COALESCE(OLD.revision, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_documents_updated_at();

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_owner_or_congregation_read" ON public.documents;
CREATE POLICY "doc_owner_or_congregation_read"
  ON public.documents FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (congregation_id IS NOT NULL AND public.same_congregation(congregation_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "doc_owner_insert" ON public.documents;
CREATE POLICY "doc_owner_insert"
  ON public.documents FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "doc_owner_update" ON public.documents;
CREATE POLICY "doc_owner_update"
  ON public.documents FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- document_keys
CREATE TABLE IF NOT EXISTS public.document_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.user_devices(id) ON DELETE CASCADE,
  wrapped_dek BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_document_keys_document ON public.document_keys(document_id);
CREATE INDEX IF NOT EXISTS idx_document_keys_device ON public.document_keys(device_id);

ALTER TABLE public.document_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dek_device_owner_read" ON public.document_keys;
CREATE POLICY "dek_device_owner_read"
  ON public.document_keys FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_devices ud
      WHERE ud.id = document_keys.device_id
        AND ud.user_id = auth.uid()
        AND ud.revoked = false)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "dek_owner_insert" ON public.document_keys;
CREATE POLICY "dek_owner_insert"
  ON public.document_keys FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.documents d
      WHERE d.id = document_keys.document_id
        AND (d.owner_id = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "dek_owner_update" ON public.document_keys;
CREATE POLICY "dek_owner_update"
  ON public.document_keys FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.documents d
      WHERE d.id = document_keys.document_id
        AND (d.owner_id = auth.uid() OR public.is_admin()))
  );

-- soft-delete helper
CREATE OR REPLACE FUNCTION public.soft_delete_document(p_document_id UUID)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_updated int;
BEGIN
  UPDATE public.documents
    SET deleted_at = now(), deleted_by = auth.uid()
  WHERE id = p_document_id
    AND (owner_id = auth.uid() OR public.is_admin())
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$func$;

-- ═════════════════════════════════════════════════════════════════════
-- GRANT-ek (Supabase default privileges nem mindig automatikus)
-- ═════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Táblák
GRANT INSERT ON public.access_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_keys TO authenticated;

-- Függvények
GRANT EXECUTE ON FUNCTION public.check_access_request_rate_limit(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_egyhazkeruleti_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.same_congregation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_approved() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

-- Default privileges jövőbeli táblákhoz
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY — minden kész-e
-- ─────────────────────────────────────────────────────────────────────

SELECT
  tbl AS tabla,
  EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=tbl) AS letezik,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename=tbl) AS policy_count
FROM (VALUES ('access_requests'), ('user_devices'), ('licenses'), ('audit_log'),
             ('documents'), ('document_keys')) t(tbl)
ORDER BY tbl;

SELECT COUNT(*) AS m0_functions_count FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'check_access_request_rate_limit', 'custom_access_token_hook',
    'is_user_approved', 'is_admin', 'is_egyhazkeruleti_admin',
    'same_congregation', 'is_current_user_approved', 'log_audit_event',
    'soft_delete_document',
    'tg_access_requests_updated_at', 'tg_documents_updated_at', 'tg_licenses_updated_at'
  );
-- Várt eredmény: m0_functions_count = 12
