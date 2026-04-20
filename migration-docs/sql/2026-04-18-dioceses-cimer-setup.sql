-- =========================================================================
-- 2026-04-18 — Egyházmegye setup: címer oszlop + Storage bucket
-- =========================================================================
-- CÉL:
--   Az egyházmegyei setup wizard-hoz szükséges:
--     1. dioceses.cimer_url oszlop a címer URL tárolására
--     2. Storage bucket (dioceses-logos) a feltöltéshez
--     3. RLS policy: csak az adott egyházmegye esperes/egyházmegyei admin
--        tölthet fel / módosíthat / törölhet
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) dioceses tábla bővítése — cimer_url
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.dioceses
  ADD COLUMN IF NOT EXISTS cimer_url text;

COMMENT ON COLUMN public.dioceses.cimer_url IS
  'Az egyházmegyei címer publikus URL-je a dioceses-logos Storage bucket-ből. A setup wizard tölti fel.';


-- ─────────────────────────────────────────────────────────────────────────
-- 2) Storage bucket létrehozás (idempotens)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dioceses-logos',
  'dioceses-logos',
  true,  -- publikusan olvasható, mint a gyülekezeti címerek
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ─────────────────────────────────────────────────────────────────────────
-- 3) RLS policy-k a dioceses-logos bucket-hez
-- ─────────────────────────────────────────────────────────────────────────
-- Fájlnév séma: {diocese_id}/{filename}
-- Jogosultság: esperes / egyházmegyei admin a saját egyházmegyéjéhez,
-- egyházkerületi admin a saját kerületéhez, globális admin mindenhez.

-- Olvasás — publikus (bucket.public = true miatt amúgy is), de explicit policy
DROP POLICY IF EXISTS "dioceses_logos_read_all" ON storage.objects;
CREATE POLICY "dioceses_logos_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'dioceses-logos');

-- Beszúrás — csak az esperes/egyházmegyei admin a saját egyházmegyéjéhez
DROP POLICY IF EXISTS "dioceses_logos_esperes_write" ON storage.objects;
CREATE POLICY "dioceses_logos_esperes_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dioceses-logos'
    AND (
      -- Globális admin / master
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('admin', 'egyhazkeruleti_admin')
      )
      -- Vagy esperes/egyházmegyei admin a saját diocese-éhez:
      -- a fájlnév első szegmense a diocese_id
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )
    )
  );

-- Frissítés (UPSERT) — ua. mint INSERT
DROP POLICY IF EXISTS "dioceses_logos_esperes_update" ON storage.objects;
CREATE POLICY "dioceses_logos_esperes_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dioceses-logos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('admin', 'egyhazkeruleti_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )
    )
  );

-- Törlés — ua.
DROP POLICY IF EXISTS "dioceses_logos_esperes_delete" ON storage.objects;
CREATE POLICY "dioceses_logos_esperes_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dioceses-logos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('admin', 'egyhazkeruleti_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope_id::text = NULLIF((string_to_array(name, '/'))[1], '')
      )
    )
  );


-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

-- a) Az új cimer_url oszlop
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dioceses' AND column_name = 'cimer_url';

-- b) A storage bucket
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'dioceses-logos';

-- c) A bucket policy-k
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'dioceses_logos_%'
ORDER BY policyname;


-- ─────────────────────────────────────────────────────────────────────────
-- 4) PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
