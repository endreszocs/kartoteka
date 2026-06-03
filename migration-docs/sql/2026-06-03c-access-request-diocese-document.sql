-- ============================================================================
-- 2026-06-03 — Hozzáférés-kérelem: egyházmegye/egyházkerület + dokumentum
-- ============================================================================
-- CÉL (Endre kérése):
--   1. A regisztrációs (hozzáférés-kérő) űrlapon kötelezően meg kell adni az
--      egyházkerületet és az egyházmegyét — a választó DB-ből töltődik. Mivel
--      az űrlap PUBLIKUS (anon), engedélyezni kell az anon SELECT-et a
--      `districts` és `dioceses` referencia-táblákon.
--   2. Az `access_requests` táblának új oszlopai legyenek a választott
--      egyházkerülethez/egyházmegyéhez (FK), hogy az admin lássa és a
--      jóváhagyáskor a `profiles`-ba másolhassa.
--   3. Opcionálisan a kérelmező feltölthet egy igazolást (egyházmegyei/
--      egyházkerületi). Ehhez egy PRIVÁT storage bucket kell: anon feltölthet,
--      csak admin olvashatja.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run.
-- Idempotens: biztonsággal újrafuttatható.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ANON OLVASÁS a referencia-táblákon (a publikus űrlap tölti a választókat)
-- ────────────────────────────────────────────────────────────────────────────
-- A táblákon már van `authenticated` SELECT policy (2026-04-13-rls-reference-tables).
-- Itt CSAK egy anon SELECT policy-t adunk hozzá. A districts/dioceses publikus
-- egyházszervezeti információ (nevek), nem PII — biztonságosan kiolvasható.

DROP POLICY IF EXISTS districts_read_anon ON public.districts;
CREATE POLICY districts_read_anon ON public.districts
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dioceses_read_anon ON public.dioceses;
CREATE POLICY dioceses_read_anon ON public.dioceses
  FOR SELECT TO anon USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. access_requests — új oszlopok
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS requested_district_id uuid REFERENCES public.districts(id),
  ADD COLUMN IF NOT EXISTS requested_diocese_id  uuid REFERENCES public.dioceses(id),
  ADD COLUMN IF NOT EXISTS document_path text;

COMMENT ON COLUMN public.access_requests.requested_district_id IS
  'A kérelmező által választott egyházkerület (districts FK). Kötelező az új űrlapon. 2026-06-03.';
COMMENT ON COLUMN public.access_requests.requested_diocese_id IS
  'A kérelmező által választott egyházmegye (dioceses FK). Kötelező az új űrlapon. 2026-06-03.';
COMMENT ON COLUMN public.access_requests.document_path IS
  'Opcionális feltöltött igazolás útvonala az "access-request-docs" privát bucketben. 2026-06-03.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. STORAGE bucket — access-request-docs (PRIVÁT)
-- ────────────────────────────────────────────────────────────────────────────
-- Fájlnév-séma: requests/{random-uuid}/{filename}
-- Méret: max 10 MB. Típus: PDF / JPG / PNG.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'access-request-docs',
  'access-request-docs',
  false,  -- PRIVÁT: csak admin olvashatja (signed URL-en keresztül)
  10485760,  -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3/a. Feltöltés — anon is tud (a publikus űrlapról), de CSAK ebbe a bucketbe.
--      A bucket méret/MIME-korlátja a storage-rétegben kényszerített.
DROP POLICY IF EXISTS "access_request_docs_anon_insert" ON storage.objects;
CREATE POLICY "access_request_docs_anon_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'access-request-docs');

-- 3/b. Olvasás — CSAK admin (profiles.role='admin'). A publikus user nem
--      listázhatja/olvashatja mások feltöltött igazolásait.
DROP POLICY IF EXISTS "access_request_docs_admin_read" ON storage.objects;
CREATE POLICY "access_request_docs_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'access-request-docs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'admin'
    )
  );

-- (Megjegyzés: a szerveroldali signed-URL generálás a service_role kulccsal
--  történik (getSupabaseAdminClient), ami megkerüli az RLS-t — ez a fenti
--  admin-read policy egy másodlagos védelmi réteg.)

COMMIT;

-- PostgREST schema cache reload (az új oszlopok azonnali láthatóságához)
NOTIFY pgrst, 'reload schema';

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────

-- Új oszlopok
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'access_requests'
  AND column_name IN ('requested_district_id', 'requested_diocese_id', 'document_path')
ORDER BY column_name;

-- Anon policy-k a referencia-táblákon
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('districts_read_anon', 'dioceses_read_anon')
ORDER BY tablename;

-- Bucket
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'access-request-docs';

-- Storage policy-k
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'access_request_docs_%'
ORDER BY policyname;
