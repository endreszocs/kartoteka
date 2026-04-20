-- ==========================================================================
-- 2026-04-17 — document_submissions tábla létrehozás + GRANT + RLS JAVÍTÁS
-- ==========================================================================
-- Előzmény:
--   A 2026-04-12-document-submissions.sql migráció két okból nem biztosította
--   a beküldés működését:
--     1) A tábla nem létezett az éles adatbázisban (a migráció nem lett
--        alkalmazva — a "Beküldés egyházmegyének" gomb undefined_table hibával
--        bukott);
--     2) Hiányzott a GRANT ... TO authenticated, ami nélkül az RLS csak
--        kiegészítő, nem alapvető védelem — PostgREST 403 (42501) permission
--        denied hibát ad.
--
-- Ez a fájl egy teljes, IDEMPOTENS (biztonsággal újrafuttatható) javítás,
-- ami helyettesíti a 2026-04-12-es migráció teljes tartalmát.
-- ==========================================================================

-- 1. Tábla — CREATE TABLE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.document_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  diocese_id uuid,
  year integer NOT NULL,
  document_type text NOT NULL,
  modification_number integer,
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  received_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  finalized_at timestamptz,
  finalized_by uuid,
  forwarded_to_kerulet boolean NOT NULL DEFAULT false,
  forwarded_at timestamptz,
  snapshot_data jsonb NOT NULL DEFAULT '{}',
  notes text,
  CONSTRAINT document_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT document_submissions_unique UNIQUE (congregation_id, year, document_type, modification_number)
);

COMMENT ON TABLE public.document_submissions IS
  'Dokumentum beküldési és jóváhagyási workflow — költségvetés, számadás, vagyonleltár, választók névjegyzéke.';

-- 2. Indexek — CREATE INDEX IF NOT EXISTS
CREATE INDEX IF NOT EXISTS document_submissions_diocese_year_idx
  ON public.document_submissions (diocese_id, year);

CREATE INDEX IF NOT EXISTS document_submissions_status_idx
  ON public.document_submissions (status);

-- 3. GRANT — *** KRITIKUS JAVÍTÁS ***
--    Az RLS önmagában nem elég, ha nincs GRANT a táblára. Enélkül a
--    Supabase authenticated role 42501 permission denied hibát kap minden
--    műveletre, amit PostgREST 403-ra fordít.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_submissions TO authenticated;

-- 4. RLS engedélyezés — idempotens (ENABLE ismételten hívható)
ALTER TABLE public.document_submissions ENABLE ROW LEVEL SECURITY;

-- 5. Policy-k — DROP IF EXISTS + CREATE (idempotens csere)

-- 5a) Gyülekezet látja és beküldheti a sajátját (lelkész, konyvelo)
DROP POLICY IF EXISTS document_submissions_congregation_access
  ON public.document_submissions;
CREATE POLICY document_submissions_congregation_access
  ON public.document_submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.congregation_id = document_submissions.congregation_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.congregation_id = document_submissions.congregation_id
    )
  );

-- 5b) Esperes / egyházmegyei admin / admin: saját egyházmegye (admin: mindenhol)
DROP POLICY IF EXISTS document_submissions_diocese_access
  ON public.document_submissions;
CREATE POLICY document_submissions_diocese_access
  ON public.document_submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
        AND (p.role = 'admin' OR p.diocese_id = document_submissions.diocese_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
        AND (p.role = 'admin' OR p.diocese_id = document_submissions.diocese_id)
    )
  );

-- ==========================================================================
-- Ellenőrzés — futtatás után külön-külön érdemes lefuttatni ezeket
-- ==========================================================================

-- 1) Tábla létezik-e?
-- SELECT EXISTS (
--   SELECT 1 FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'document_submissions'
-- ) AS table_exists;

-- 2) GRANT-ek rendben?
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name = 'document_submissions'
--   AND grantee = 'authenticated'
-- ORDER BY privilege_type;

-- 3) RLS aktív?
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname = 'document_submissions' AND relnamespace = 'public'::regnamespace;

-- 4) Policy-k rendben?
-- SELECT policyname, cmd, roles, qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'document_submissions';
