-- ═══════════════════════════════════════════════════════════════
-- E1 — Import log tábla (2026-04-15)
-- ═══════════════════════════════════════════════════════════════
--
-- Új tábla: import_logs — minden adatimport audit-sora
--
-- Minden `executeBatchImport` futtatás egy sort hoz létre:
--  - ki futtatta (user_id)
--  - melyik gyülekezetre (congregation_id)
--  - melyik modulra (members, finance, registry, worklog, filing, inventory)
--  - milyen fájl (file_name)
--  - mennyi sor került be (inserted), mennyi maradt ki (skipped)
--  - sheet-enkénti bontás (per_sheet JSONB)
--  - lookup statisztika (lookup_stats JSONB)
--  - első 50 hiba (errors JSONB)

-- ───────────────────────────────────────────────────────────────
-- 1. Tábla
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  module          text NOT NULL
    CHECK (module IN ('members', 'finance', 'registry', 'worklog', 'filing', 'inventory')),
  file_name       text NOT NULL,
  total_inserted  integer NOT NULL DEFAULT 0,
  total_skipped   integer NOT NULL DEFAULT 0,
  per_sheet       jsonb DEFAULT '[]'::jsonb,
  lookup_stats    jsonb DEFAULT '{}'::jsonb,
  errors          jsonb DEFAULT '[]'::jsonb,
  created_at      timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- 2. Indexek
-- ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_import_logs_cong_date
  ON public.import_logs (congregation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_user_date
  ON public.import_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_module
  ON public.import_logs (module, created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- 3. RLS — master admin + esperes (diocese) + saját user olvashatja
-- ───────────────────────────────────────────────────────────────

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_logs_select ON public.import_logs;
CREATE POLICY import_logs_select ON public.import_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
        AND c.id = import_logs.congregation_id
    )
  );

-- INSERT: a saját gyülekezetére bárki (a server action majd ellenőrzi a jogot)
DROP POLICY IF EXISTS import_logs_insert ON public.import_logs;
CREATE POLICY import_logs_insert ON public.import_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND congregation_id = current_user_congregation_id()
  );

-- Update/Delete: csak master (ha javítani kell)
DROP POLICY IF EXISTS import_logs_update ON public.import_logs;
CREATE POLICY import_logs_update ON public.import_logs
  FOR UPDATE TO authenticated
  USING (current_user_has_global_access());

DROP POLICY IF EXISTS import_logs_delete ON public.import_logs;
CREATE POLICY import_logs_delete ON public.import_logs
  FOR DELETE TO authenticated
  USING (current_user_has_global_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_logs TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Futtatás után ellenőrzés:
--   SELECT tablename FROM pg_tables WHERE tablename = 'import_logs';
--   SELECT policyname FROM pg_policies WHERE tablename = 'import_logs';
-- ═══════════════════════════════════════════════════════════════
