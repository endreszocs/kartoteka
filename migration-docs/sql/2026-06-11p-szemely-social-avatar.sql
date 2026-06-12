-- ============================================================================
-- 2026-06-11p — Személy-avatar: social-link mező + 'avatars' Storage bucket
-- ============================================================================
-- Endre futtatja a Supabase SQL editorban (egyetlen tranzakció).
--
-- MIT CSINÁL:
--   1. szemely.social_profil_url — a megadott Facebook/Instagram profil-link
--      tárolása (kapcsolattartási értéke önmagában is van). A KÉP maga a
--      meglévő `szemely.kep` oszlopba kerül (Storage public URL) — a
--      közösségi CDN-képeket SOSEM hotlinkeljük (lejáró aláírt URL-ek!).
--   2. 'avatars' Storage bucket: publikus olvasás + bejelentkezett írás.
--      Útvonal-konvenció: avatars/{congregation_id}/szemely-{szemely_id}.jpg
-- ============================================================================

-- 1) Oszlop (idempotens)
ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS social_profil_url text;

COMMENT ON COLUMN public.szemely.social_profil_url IS
  'Facebook/Instagram profil-link (a lelkész rögzíti). A profilkép a kep oszlopban, saját Storage-ban.';

-- 2) Storage bucket (idempotens)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Policies (előbb takarítás, hogy újrafuttatható legyen)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

-- 4) Ellenőrzés (ez az EGYETLEN eredmény-tábla, amit látni fogsz)
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'szemely' AND column_name = 'social_profil_url') AS social_oszlop_ok,
  (SELECT COUNT(*) FROM storage.buckets WHERE id = 'avatars' AND public = true) AS bucket_ok,
  (SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'avatars_%') AS policy_db;
