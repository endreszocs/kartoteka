-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE STORAGE BUCKETS — publikus oldal + magazin
-- Dátum: 2026-04-12
--
-- Ezt a fájlt a Supabase Studio SQL Editorban kell futtatni, mert a storage
-- schema módosítása csak a service_role rendelkezik jogosultsággal.
--
-- Előfeltétel:
--   - 2026-04-12-phase-0-rls-hardening.sql futtatva
--   - 2026-04-12-public-site-tables.sql futtatva
--   - 2026-04-12-public-magazines.sql futtatva (ha magazin is kell)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. public-site-media bucket — poszt borítók, hero képek, címerek
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-site-media',
  'public-site-media',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Mindenki olvashat
DROP POLICY IF EXISTS "public_site_media_read_all" ON storage.objects;
CREATE POLICY "public_site_media_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-site-media');

-- Lelkész írhat a saját gyülekezete path-jába: {congregation_id}/...
DROP POLICY IF EXISTS "public_site_media_pastor_write" ON storage.objects;
CREATE POLICY "public_site_media_pastor_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'public-site-media'
    AND public.current_user_can_access_congregation(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

DROP POLICY IF EXISTS "public_site_media_pastor_update" ON storage.objects;
CREATE POLICY "public_site_media_pastor_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'public-site-media'
    AND public.current_user_can_access_congregation(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

DROP POLICY IF EXISTS "public_site_media_pastor_delete" ON storage.objects;
CREATE POLICY "public_site_media_pastor_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'public-site-media'
    AND public.current_user_can_access_congregation(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. public-magazines bucket — PDF lapszámok
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-magazines',
  'public-magazines',
  true,
  20971520,  -- 20 MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public_magazines_read_all" ON storage.objects;
CREATE POLICY "public_magazines_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-magazines');

DROP POLICY IF EXISTS "public_magazines_pastor_write" ON storage.objects;
CREATE POLICY "public_magazines_pastor_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'public-magazines'
    AND public.current_user_can_access_congregation(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

DROP POLICY IF EXISTS "public_magazines_pastor_update" ON storage.objects;
CREATE POLICY "public_magazines_pastor_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'public-magazines'
    AND public.current_user_can_access_congregation(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

DROP POLICY IF EXISTS "public_magazines_pastor_delete" ON storage.objects;
CREATE POLICY "public_magazines_pastor_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'public-magazines'
    AND public.current_user_can_access_congregation(
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Teszt: listázd a bucketeket
-- SELECT id, name, public, file_size_limit FROM storage.buckets
-- WHERE id IN ('public-site-media', 'public-magazines');
-- ─────────────────────────────────────────────────────────────────────────
