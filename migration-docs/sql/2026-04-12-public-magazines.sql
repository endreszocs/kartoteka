-- ═══════════════════════════════════════════════════════════════════════════
-- FÁZIS 2 — GYÜLEKEZETI MAGAZIN / ÚJSÁG
-- Dátum: 2026-04-12
--
-- Cél: a gyülekezetek kiadhatják saját magazinjukat (papírújság digitális
-- verzió), lapszámonként cover képpel és letölthető PDF-fel.
--
-- Előfeltétel: 2026-04-12-public-site-tables.sql már lefuttatva.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PUBLIC_MAGAZINES — egy magazin "sorozat" per gyülekezet
-- (több magazint is kiadhat egy gyülekezet elvileg, de tipikusan egyet)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.public_magazines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_magazines_cong_idx
  ON public.public_magazines (congregation_id);

GRANT SELECT ON public.public_magazines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_magazines TO authenticated;
ALTER TABLE public.public_magazines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_magazines_anon_read ON public.public_magazines;
CREATE POLICY public_magazines_anon_read
  ON public.public_magazines
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.public_sites ps
      WHERE ps.congregation_id = public_magazines.congregation_id
        AND ps.is_published = true
    )
  );

DROP POLICY IF EXISTS public_magazines_staff_manage ON public.public_magazines;
CREATE POLICY public_magazines_staff_manage
  ON public.public_magazines
  FOR ALL
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP TRIGGER IF EXISTS public_magazines_updated_at ON public.public_magazines;
CREATE TRIGGER public_magazines_updated_at
  BEFORE UPDATE ON public.public_magazines
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- PUBLIC_MAGAZINE_ISSUES — egy-egy lapszám
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.public_magazine_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  magazine_id uuid NOT NULL REFERENCES public.public_magazines(id) ON DELETE CASCADE,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  issue_number text NOT NULL,                -- pl. '2026/2'
  title text,                                 -- opcionális lapszám cím
  cover_image_url text,
  pdf_url text NOT NULL,
  published_at date,
  notes text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (magazine_id, issue_number)
);

CREATE INDEX IF NOT EXISTS public_magazine_issues_magazine_idx
  ON public.public_magazine_issues (magazine_id, published_at DESC);

GRANT SELECT ON public.public_magazine_issues TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_magazine_issues TO authenticated;
ALTER TABLE public.public_magazine_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_magazine_issues_anon_read ON public.public_magazine_issues;
CREATE POLICY public_magazine_issues_anon_read
  ON public.public_magazine_issues
  FOR SELECT
  TO anon, authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.public_sites ps
      WHERE ps.congregation_id = public_magazine_issues.congregation_id
        AND ps.is_published = true
    )
  );

DROP POLICY IF EXISTS public_magazine_issues_staff_manage ON public.public_magazine_issues;
CREATE POLICY public_magazine_issues_staff_manage
  ON public.public_magazine_issues
  FOR ALL
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP TRIGGER IF EXISTS public_magazine_issues_updated_at ON public.public_magazine_issues;
CREATE TRIGGER public_magazine_issues_updated_at
  BEFORE UPDATE ON public.public_magazine_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- STORAGE: public-magazines bucket (külön a public-site-media-tól)
-- Futtatás manuálisan:
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'public-magazines',
--   'public-magazines',
--   true,
--   20971520,  -- 20 MB
--   ARRAY['application/pdf','image/jpeg','image/png','image/webp']
-- )
-- ON CONFLICT (id) DO NOTHING;
--
-- CREATE POLICY "public_magazines_read_all" ON storage.objects
--   FOR SELECT TO anon, authenticated
--   USING (bucket_id = 'public-magazines');
--
-- CREATE POLICY "public_magazines_pastor_write" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'public-magazines'
--     AND public.current_user_can_access_congregation(
--       (string_to_array(name, '/'))[1]::uuid
--     )
--   );
--
-- CREATE POLICY "public_magazines_pastor_delete" ON storage.objects
--   FOR DELETE TO authenticated
--   USING (
--     bucket_id = 'public-magazines'
--     AND public.current_user_can_access_congregation(
--       (string_to_array(name, '/'))[1]::uuid
--     )
--   );
-- ─────────────────────────────────────────────────────────────────────────
