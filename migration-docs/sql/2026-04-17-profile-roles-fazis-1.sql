-- =========================================================================
-- 2026-04-17 — FÁZIS 1: profile_roles tábla (multi-role, profilváltás alap)
-- =========================================================================
-- CÉL:
--   Egy felhasználónak több szerep + több hatókör lehet. A `profiles.role`
--   ezentúl csak az ELSŐDLEGES szerepet jelöli — az ÖSSZES szerepkör a
--   `profile_roles` táblában van (beleértve az elsődlegest is).
--
-- HATÓKÖRÖK (scope):
--   - system     : a teljes rendszer (admin)
--   - district   : egyházkerület (district_id)
--   - diocese    : egyházmegye (diocese_id)
--   - congregation : gyülekezet (congregation_id)
--
-- SZEREPEK (role):
--   - admin                  : rendszergazda (system scope)
--   - egyhazkeruleti_admin   : egyházkerületi admin (district scope)
--   - egyhazmegyei_admin     : egyházmegyei admin (diocese scope)
--   - esperes                : esperes (diocese scope)
--   - egyhazmegyei_szamvevo  : egyházmegyei számvevő (diocese scope)
--   - lelkesz                : gyülekezeti lelkész (congregation scope)
--   - konyvelo               : gyülekezeti könyvelő (congregation scope)
--   - custom                 : egyedi szerep, szabadon nevezhető (custom_label)
--
-- PERMISSIONS (JSONB object, rugalmas formátum):
--   {
--     "penzugy":          { "read": true, "write": true, "delete": false,
--                            "finalize": false, "export": true, "import": false },
--     "tagnyilvantartas": { "read": true, "write": true },
--     ...
--   }
--   A hiányzó modulokra és action-ökre FALSE érvényes (default).
--
-- FIGYELEM: ez a FÁZIS 1 — csak az adatmodell. A profilváltás UI és a JWT
-- custom claim integráció a Fázis 3-4-ben kerül megvalósításra.
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- 1) TÁBLA
CREATE TABLE IF NOT EXISTS public.profile_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Hatókör
  scope text NOT NULL,
  scope_id uuid, -- NULL csak system scope esetén

  -- Szerep
  role text NOT NULL,
  custom_label text, -- csak ha role='custom' (pl. "Titkárnő", "Pénztáros")

  -- Engedélyek (rugalmas JSONB object)
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Jóváhagyás workflow
  approval_status text NOT NULL DEFAULT 'approved',
  approval_reason text,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revoked_reason text,

  -- Aktív flag (false ha revoked / rejected)
  active boolean NOT NULL DEFAULT true,

  -- Constraintek
  CONSTRAINT profile_roles_scope_check CHECK (
    scope IN ('system', 'district', 'diocese', 'congregation')
  ),
  CONSTRAINT profile_roles_role_check CHECK (
    role IN (
      'admin',
      'egyhazkeruleti_admin',
      'egyhazmegyei_admin',
      'esperes',
      'egyhazmegyei_szamvevo',
      'lelkesz',
      'konyvelo',
      'custom'
    )
  ),
  CONSTRAINT profile_roles_approval_status_check CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'revoked')
  ),
  CONSTRAINT profile_roles_scope_id_check CHECK (
    (scope = 'system' AND scope_id IS NULL) OR
    (scope <> 'system' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT profile_roles_custom_label_check CHECK (
    (role = 'custom' AND custom_label IS NOT NULL AND length(trim(custom_label)) > 0) OR
    (role <> 'custom' AND custom_label IS NULL)
  )
);

-- UNIQUE constraint (külön, mert a custom_label miatt bonyolult)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_roles_unique' AND conrelid = 'public.profile_roles'::regclass
  ) THEN
    ALTER TABLE public.profile_roles
      ADD CONSTRAINT profile_roles_unique
      UNIQUE (profile_id, scope, scope_id, role, custom_label);
  END IF;
END$$;

-- Komment
COMMENT ON TABLE public.profile_roles IS
  'Multi-role szerep hozzárendelések. Egy felhasználónak több sora is lehet '
  '(pl. lelkész + egyházmegyei admin + egyházkerületi admin). '
  'A cookie/JWT alapú profilváltás ezt használja az aktív kontextus meghatározásához.';

COMMENT ON COLUMN public.profile_roles.permissions IS
  'Rugalmas engedélyek JSONB object formátumban. Pl.: {"penzugy":{"read":true,"write":true}}';

COMMENT ON COLUMN public.profile_roles.custom_label IS
  'Ha role=custom, a szabadon választott név (pl. "Titkárnő", "Segédlelkész").';

-- 2) INDEXEK
CREATE INDEX IF NOT EXISTS profile_roles_profile_idx
  ON public.profile_roles(profile_id);

CREATE INDEX IF NOT EXISTS profile_roles_active_idx
  ON public.profile_roles(profile_id)
  WHERE active AND approval_status = 'approved';

CREATE INDEX IF NOT EXISTS profile_roles_scope_idx
  ON public.profile_roles(scope, scope_id)
  WHERE active AND approval_status = 'approved';

-- 3) GRANT (3 rétegű szabály — lásd feedback_check_source memória)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_roles TO authenticated;

-- 4) RLS
ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;

-- 4a) A user SAJÁT szerepköreit mindig látja
DROP POLICY IF EXISTS profile_roles_self_read ON public.profile_roles;
CREATE POLICY profile_roles_self_read
  ON public.profile_roles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- 4b) Admin / egyházkerületi admin mindent kezelhet (7. alapelv: ők osztanak szerepkört)
DROP POLICY IF EXISTS profile_roles_admin_manage ON public.profile_roles;
CREATE POLICY profile_roles_admin_manage
  ON public.profile_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
  );

-- 4c) Lelkész látja a SAJÁT gyülekezetéhez tartozó sorokat (hogy tudjon jóváhagyni)
DROP POLICY IF EXISTS profile_roles_pastor_congregation_read ON public.profile_roles;
CREATE POLICY profile_roles_pastor_congregation_read
  ON public.profile_roles
  FOR SELECT TO authenticated
  USING (
    scope = 'congregation' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'lelkesz'
        AND p.congregation_id = profile_roles.scope_id
    )
  );

-- 4d) Lelkész frissítheti a SAJÁT gyülekezetéhez tartozó sorok approval_status-át
--     (csak approve/reject, nem create — a létrehozás admin / kerületi admin joga)
DROP POLICY IF EXISTS profile_roles_pastor_approve ON public.profile_roles;
CREATE POLICY profile_roles_pastor_approve
  ON public.profile_roles
  FOR UPDATE TO authenticated
  USING (
    scope = 'congregation' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'lelkesz'
        AND p.congregation_id = profile_roles.scope_id
    )
  )
  WITH CHECK (
    scope = 'congregation' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'lelkesz'
        AND p.congregation_id = profile_roles.scope_id
    )
  );

-- 4e) Esperes / egyházmegyei admin láthatja a saját egyházmegyéjéhez tartozó sorokat
DROP POLICY IF EXISTS profile_roles_diocese_read ON public.profile_roles;
CREATE POLICY profile_roles_diocese_read
  ON public.profile_roles
  FOR SELECT TO authenticated
  USING (
    (scope = 'diocese' AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND p.diocese_id = profile_roles.scope_id
    ))
    OR
    (scope = 'congregation' AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.id = profile_roles.scope_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND p.diocese_id = c.diocese_id
    ))
  );

-- =========================================================================
-- 5) DATA MIGRÁCIÓ: meglévő user-ek → profile_roles
-- =========================================================================
-- A jelenlegi `profiles.role` + `congregation_id`/`diocese_id`/`district_id`
-- alapján létrehozzuk a megfelelő profile_roles sorokat.
--
-- Idempotens: a UNIQUE constraint miatt ismétlődés nem jön létre.
-- =========================================================================

INSERT INTO public.profile_roles (
  profile_id, scope, scope_id, role, custom_label,
  permissions, approval_status, granted_at, approved_at, active
)
SELECT
  p.id AS profile_id,
  CASE
    WHEN p.role = 'admin' THEN 'system'
    WHEN p.role = 'egyhazkeruleti_admin' AND p.district_id IS NOT NULL THEN 'district'
    WHEN p.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
         AND p.diocese_id IS NOT NULL THEN 'diocese'
    WHEN p.role IN ('lelkesz', 'konyvelo') AND p.congregation_id IS NOT NULL
         THEN 'congregation'
  END AS scope,
  CASE
    WHEN p.role = 'admin' THEN NULL
    WHEN p.role = 'egyhazkeruleti_admin' THEN p.district_id
    WHEN p.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
         THEN p.diocese_id
    WHEN p.role IN ('lelkesz', 'konyvelo') THEN p.congregation_id
  END AS scope_id,
  p.role,
  NULL::text AS custom_label,
  '{}'::jsonb AS permissions,
  'approved' AS approval_status,
  COALESCE(p.created_at, now()) AS granted_at,
  COALESCE(p.created_at, now()) AS approved_at,
  (p.status = 'active') AS active
FROM public.profiles p
WHERE p.role IN (
  'admin', 'egyhazkeruleti_admin', 'egyhazmegyei_admin', 'esperes',
  'egyhazmegyei_szamvevo', 'lelkesz', 'konyvelo'
)
AND (
  p.role = 'admin'
  OR (p.role = 'egyhazkeruleti_admin' AND p.district_id IS NOT NULL)
  OR (p.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
      AND p.diocese_id IS NOT NULL)
  OR (p.role IN ('lelkesz', 'konyvelo') AND p.congregation_id IS NOT NULL)
)
ON CONFLICT (profile_id, scope, scope_id, role, custom_label) DO NOTHING;

-- =========================================================================
-- ELLENŐRZÉS (ugyanitt futtatva)
-- =========================================================================

-- 1) Tábla létezik?
SELECT 'profile_roles' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profile_roles'
  ) AS result;

-- 2) GRANT-ek rendben?
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'profile_roles'
  AND grantee = 'authenticated'
ORDER BY privilege_type;

-- 3) RLS aktív?
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'profile_roles' AND relnamespace = 'public'::regnamespace;

-- 4) Policy-k rendben?
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profile_roles'
ORDER BY policyname;

-- 5) Migráció eredménye — hány user lett áthelyezve?
SELECT scope, role, COUNT(*) AS db
FROM public.profile_roles
GROUP BY scope, role
ORDER BY scope, role;

-- 6) Kontroll: hány profiles sor van, és hány profile_roles sor készült?
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE status = 'active' AND role IS NOT NULL) AS aktiv_profilok,
  (SELECT COUNT(*) FROM public.profile_roles WHERE active) AS aktiv_profile_roles;
-- VÁRT: a kettő közel azonos (egy profile = egy profile_roles sor az elsődleges szerepre)

-- 7) Figyelmeztetés: melyik user-ek nem kaptak profile_roles sort?
--    (pl. profiles.role nem standard, vagy hiányzó scope_id)
SELECT p.id, p.email, p.role, p.congregation_id, p.diocese_id, p.district_id, p.status
FROM public.profiles p
WHERE p.status = 'active'
  AND p.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p.id
  )
ORDER BY p.role, p.email;
-- VÁRT: üres (minden aktív user kapott egy sort). Ha itt kimarad valaki,
--       nézzük meg, miért (pl. lelkész, de nincs congregation_id).
