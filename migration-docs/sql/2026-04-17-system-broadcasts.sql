-- =========================================================================
-- 2026-04-17 — Rendszer broadcast üzenetek (frissítések, hírek)
-- =========================================================================
-- ALAPELV (Endre, 2026-04-17):
--   "A rendszerre érkező új frissítésekről minden gyülekezet, egyházmegye és
--   az egyházkerület is értesítést kap, ennek is legyen egy dokumentáló
--   felülete, amit a rendszergazdai admin oldalán vissza lehet nézni.
--   Frissítésekről lehet értesítést küldeni!"
--
-- Tábla célja:
--   * Minden broadcast üzenet archiválva (ki, mikor, kinek, mit) — visszanézhető
--   * A tényleges kézbesítés az `ertesitesek` táblára történik (egy sor/címzett)
--   * Opcionális email-küldés Resend-en keresztül
--   * Release notes integráció: a `docs/CHANGELOG.md` bejegyzések ide kapcsolhatók
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.system_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),

  -- Tartalom
  cim text NOT NULL,
  uzenet text NOT NULL,
  tipus text NOT NULL DEFAULT 'info',
  hivatkozas text,

  -- Célzás
  target_scope text NOT NULL,
  target_role text,
  target_congregation_ids uuid[],
  target_diocese_ids uuid[],
  target_district_ids uuid[],

  -- Email
  send_email boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  email_error text,

  -- Statisztika
  recipient_count integer NOT NULL DEFAULT 0,

  -- Release notes metaadat (ha CHANGELOG bejegyzés)
  release_version text,
  release_category text,
  release_changelog_key text UNIQUE,

  CONSTRAINT system_broadcasts_tipus_check
    CHECK (tipus IN ('info', 'success', 'warning', 'danger', 'release')),
  CONSTRAINT system_broadcasts_target_scope_check
    CHECK (target_scope IN ('all', 'role', 'congregation', 'diocese', 'district')),
  CONSTRAINT system_broadcasts_release_category_check
    CHECK (release_category IS NULL OR release_category IN ('bugfix', 'feature', 'improvement', 'security', 'breaking'))
);

COMMENT ON TABLE public.system_broadcasts IS
  'Rendszer-szintű broadcast üzenetek archívuma. A kézbesítés az ertesitesek táblán keresztül történik.';

-- Indexek
CREATE INDEX IF NOT EXISTS system_broadcasts_sent_at_idx
  ON public.system_broadcasts (sent_at DESC);
CREATE INDEX IF NOT EXISTS system_broadcasts_tipus_idx
  ON public.system_broadcasts (tipus);

-- *** KRITIKUS: GRANT ***
GRANT SELECT, INSERT, UPDATE ON public.system_broadcasts TO authenticated;

-- RLS
ALTER TABLE public.system_broadcasts ENABLE ROW LEVEL SECURITY;

-- Csak rendszergazda (admin / master / egyházkerületi admin) kezelheti
DROP POLICY IF EXISTS system_broadcasts_admin_access ON public.system_broadcasts;
CREATE POLICY system_broadcasts_admin_access
  ON public.system_broadcasts
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

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

SELECT 'system_broadcasts' AS table_name,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='system_broadcasts') AS table_exists;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name='system_broadcasts'
  AND grantee='authenticated'
ORDER BY privilege_type;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname='public' AND tablename='system_broadcasts';
