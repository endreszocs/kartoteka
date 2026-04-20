-- =========================================================================
-- 2026-04-19 — Congregations-logos Storage bucket + RLS
-- =========================================================================
-- CÉL:
--   Endre jelezte: „Feltöltés hiba: Bucket not found" a gyülekezeti címer
--   feltöltésnél. A `logos` Storage bucket-re hivatkoznak az alábbi helyek:
--     - components/modals/congregation-dialog-v2.tsx (régebbi dialog)
--     - app/(dashboard)/congregation/actions.ts:uploadCongregationCimer
--       (2026-04-19 új wizard)
--
--   A `logos` bucket sosem lett létrehozva az SQL migrációban — csak
--   a Supabase Studio-ban kézzel. Új telepítésekben (pl. Endre standalone)
--   hiányzik.
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Bucket létrehozása
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,  -- publikusan olvasható (címer)
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ─────────────────────────────────────────────────────────────────────────
-- 2) RLS policy-k
-- ─────────────────────────────────────────────────────────────────────────
-- Fájlnév séma: congregations/{congregation_id}/{filename}
-- Jogosultság: a saját gyülekezet lelkésze + egyházmegyei admin + kerületi
-- admin + globális admin.

-- Olvasás — publikus (bucket.public = true miatt), de explicit policy
DROP POLICY IF EXISTS "logos_read_all" ON storage.objects;
CREATE POLICY "logos_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'logos');

-- Beszúrás — csak a saját gyülekezet lelkésze (profile.congregation_id match),
-- vagy globális/kerületi admin
DROP POLICY IF EXISTS "logos_pastor_write" ON storage.objects;
CREATE POLICY "logos_pastor_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      -- Globális admin / master / egyházkerületi admin
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('admin', 'egyhazkeruleti_admin')
      )
      -- Vagy a saját gyülekezet lelkésze:
      -- a fájlnév első szegmense "congregations", a második a congregation_id
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )
      -- Vagy profile_roles alapján
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'congregation'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND pr.scope_id::text = (string_to_array(name, '/'))[2]
      )
    )
  );

-- Frissítés (UPSERT) — ua. mint INSERT
DROP POLICY IF EXISTS "logos_pastor_update" ON storage.objects;
CREATE POLICY "logos_pastor_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('admin', 'egyhazkeruleti_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope = 'congregation'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND pr.scope_id::text = (string_to_array(name, '/'))[2]
      )
    )
  );

-- Törlés — ua.
DROP POLICY IF EXISTS "logos_pastor_delete" ON storage.objects;
CREATE POLICY "logos_pastor_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('admin', 'egyhazkeruleti_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND (string_to_array(name, '/'))[1] = 'congregations'
          AND p.congregation_id::text = (string_to_array(name, '/'))[2]
      )
    )
  );


-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'logos';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'logos_%'
ORDER BY policyname;


-- ─────────────────────────────────────────────────────────────────────────
-- 3) PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
