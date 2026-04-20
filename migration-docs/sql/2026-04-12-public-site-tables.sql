-- ═══════════════════════════════════════════════════════════════════════════
-- FÁZIS 1 — PUBLIKUS GYÜLEKEZETI WEBOLDAL ALAPJAI
-- Dátum: 2026-04-12
--
-- Cél: új táblák a gyülekezeti publikus oldalakhoz (kezdőlap, posztok, blog).
-- Minden tábla RLS-védett, alapértelmezetten opt-in (is_published = false).
-- A meglévő rendszer NINCS érintve — csak a congregations tábla kap 2 új,
-- nullable mezőt.
--
-- Előfeltétel: 2026-04-12-phase-0-rls-hardening.sql már lefuttatva és tesztelve.
-- ═══════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- A congregations tábla bővítése (2 új nullable mező)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS public_site_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS congregations_public_slug_idx
  ON public.congregations (public_slug)
  WHERE public_slug IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- PUBLIC_SITE_THEMES — preset témák (seed-elve)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.public_site_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  colors jsonb NOT NULL,              -- { primary, accent, surface, ink, muted, soft }
  typography jsonb NOT NULL,          -- { heading_font, body_font }
  hero_style text NOT NULL DEFAULT 'photo'
    CHECK (hero_style IN ('photo','pattern','crest','gradient')),
  border_radius text NOT NULL DEFAULT '1rem',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_site_themes TO anon, authenticated;
ALTER TABLE public.public_site_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_site_themes_read_all ON public.public_site_themes;
CREATE POLICY public_site_themes_read_all
  ON public.public_site_themes
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Seed: 6 előre definiált téma
INSERT INTO public.public_site_themes (preset_key, display_name, description, colors, typography, hero_style, border_radius, sort_order) VALUES
  (
    'klasszikus-maros',
    'Klasszikus Maros',
    'Hagyományos református — sötét zöld, arany akcentus, serif címsorok',
    '{"primary":"#14514b","accent":"#d4a04a","surface":"#fffdf8","ink":"#294853","muted":"#66848c","soft":"#edf6f1"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"DM Sans"}'::jsonb,
    'crest',
    '1rem',
    10
  ),
  (
    'modern-csik',
    'Modern Csík',
    'Világos, letisztult — teal primary, warm accent, sans-serif',
    '{"primary":"#217c72","accent":"#f3c061","surface":"#ffffff","ink":"#1f2937","muted":"#6b7280","soft":"#f3f7f5"}'::jsonb,
    '{"heading_font":"DM Sans","body_font":"DM Sans"}'::jsonb,
    'photo',
    '1.25rem',
    20
  ),
  (
    'reformatus-zold',
    'Református Zöld',
    'Mély református zöld + krém — stabil, hagyománytisztelő',
    '{"primary":"#0f3d2e","accent":"#b7946e","surface":"#fbf9f2","ink":"#1b2b24","muted":"#6b7a72","soft":"#e9eee6"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"DM Sans"}'::jsonb,
    'pattern',
    '0.75rem',
    30
  ),
  (
    'elegans-kek',
    'Elegáns Kék',
    'Sötét kék + ezüst — formális, hivatalos érzés',
    '{"primary":"#1e3a5f","accent":"#a8b8c9","surface":"#ffffff","ink":"#1a2332","muted":"#6b7280","soft":"#eef2f7"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"DM Sans"}'::jsonb,
    'gradient',
    '0.5rem',
    40
  ),
  (
    'meleg-szurke',
    'Meleg Szürke',
    'Minimalista — meleg szürke + lazac akcentus',
    '{"primary":"#4b5563","accent":"#e8a87c","surface":"#fafafa","ink":"#1f2937","muted":"#9ca3af","soft":"#f3f4f6"}'::jsonb,
    '{"heading_font":"DM Sans","body_font":"DM Sans"}'::jsonb,
    'photo',
    '1rem',
    50
  ),
  (
    'hagyomanyos-barna',
    'Hagyományos Barna',
    'Földszínek, vintage érzés — serif mindenhol',
    '{"primary":"#5c4033","accent":"#c9a57b","surface":"#faf6f0","ink":"#2d1f17","muted":"#8b7a6e","soft":"#f0e9dd"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"Cormorant Garamond"}'::jsonb,
    'pattern',
    '0.5rem',
    60
  )
ON CONFLICT (preset_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- PUBLIC_SITES — egy sor per gyülekezet (opt-in)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.public_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL UNIQUE REFERENCES public.congregations(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  tagline text,
  hero_image_url text,
  crest_image_url text,
  theme_id uuid REFERENCES public.public_site_themes(id),
  custom_primary_color text,
  custom_accent_color text,
  contact_email text,
  contact_phone text,
  address text,
  about_html text,                    -- server-side sanitizált
  is_published boolean NOT NULL DEFAULT false,
  robots_index boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_sites_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  CONSTRAINT public_sites_primary_color_format
    CHECK (custom_primary_color IS NULL OR custom_primary_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT public_sites_accent_color_format
    CHECK (custom_accent_color IS NULL OR custom_accent_color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE INDEX IF NOT EXISTS public_sites_slug_idx ON public.public_sites (slug);
CREATE INDEX IF NOT EXISTS public_sites_cong_idx ON public.public_sites (congregation_id);
CREATE INDEX IF NOT EXISTS public_sites_published_idx ON public.public_sites (is_published) WHERE is_published = true;

GRANT SELECT ON public.public_sites TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_sites TO authenticated;
ALTER TABLE public.public_sites ENABLE ROW LEVEL SECURITY;

-- Anon látja a közzétett oldalakat
DROP POLICY IF EXISTS public_sites_anon_read ON public.public_sites;
CREATE POLICY public_sites_anon_read
  ON public.public_sites
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Lelkész/admin látja és kezeli a saját gyülekezete oldalát
DROP POLICY IF EXISTS public_sites_staff_select ON public.public_sites;
CREATE POLICY public_sites_staff_select
  ON public.public_sites
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS public_sites_staff_insert ON public.public_sites;
CREATE POLICY public_sites_staff_insert
  ON public.public_sites
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS public_sites_staff_update ON public.public_sites;
CREATE POLICY public_sites_staff_update
  ON public.public_sites
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS public_sites_staff_delete ON public.public_sites;
CREATE POLICY public_sites_staff_delete
  ON public.public_sites
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_sites_updated_at ON public.public_sites;
CREATE TRIGGER public_sites_updated_at
  BEFORE UPDATE ON public.public_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- PUBLIC_POSTS — blog posztok, hírek
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.public_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text,
  cover_image_url text,
  body_markdown text,                 -- ha Markdown editort használunk
  body_html text NOT NULL,            -- mindig sanitizált
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (congregation_id, slug),
  CONSTRAINT public_posts_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,127}[a-z0-9]?$'),
  CONSTRAINT public_posts_published_requires_date
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS public_posts_cong_status_idx
  ON public.public_posts (congregation_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS public_posts_cong_slug_idx
  ON public.public_posts (congregation_id, slug);

GRANT SELECT ON public.public_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_posts TO authenticated;
ALTER TABLE public.public_posts ENABLE ROW LEVEL SECURITY;

-- Anon látja a publikált posztokat
DROP POLICY IF EXISTS public_posts_anon_published ON public.public_posts;
CREATE POLICY public_posts_anon_published
  ON public.public_posts
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND published_at <= now());

-- Lelkész látja és kezeli a saját gyülekezete posztjait
DROP POLICY IF EXISTS public_posts_staff_select ON public.public_posts;
CREATE POLICY public_posts_staff_select
  ON public.public_posts
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS public_posts_staff_insert ON public.public_posts;
CREATE POLICY public_posts_staff_insert
  ON public.public_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS public_posts_staff_update ON public.public_posts;
CREATE POLICY public_posts_staff_update
  ON public.public_posts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS public_posts_staff_delete ON public.public_posts;
CREATE POLICY public_posts_staff_delete
  ON public.public_posts
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP TRIGGER IF EXISTS public_posts_updated_at ON public.public_posts;
CREATE TRIGGER public_posts_updated_at
  BEFORE UPDATE ON public.public_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- STORAGE: public-site-media bucket
--
-- Ezt a Supabase Studio-ban vagy külön storage migráció-ban hozzuk létre.
-- A bucket public READ, a path: {congregation_id}/posts/{postId}/cover.jpg
-- vagy {congregation_id}/hero/hero.jpg vagy {congregation_id}/crest/crest.png
-- ─────────────────────────────────────────────────────────────────────────

-- Futtatás manuálisan a Supabase Studio SQL editorban:
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'public-site-media',
--   'public-site-media',
--   true,
--   2097152,  -- 2 MB
--   ARRAY['image/jpeg','image/png','image/webp']
-- )
-- ON CONFLICT (id) DO NOTHING;
--
-- -- Storage policies a bucket-en:
-- CREATE POLICY "public_site_media_read_all" ON storage.objects
--   FOR SELECT TO anon, authenticated
--   USING (bucket_id = 'public-site-media');
--
-- CREATE POLICY "public_site_media_pastor_write" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'public-site-media'
--     AND public.current_user_can_access_congregation(
--       (string_to_array(name, '/'))[1]::uuid
--     )
--   );
--
-- CREATE POLICY "public_site_media_pastor_delete" ON storage.objects
--   FOR DELETE TO authenticated
--   USING (
--     bucket_id = 'public-site-media'
--     AND public.current_user_can_access_congregation(
--       (string_to_array(name, '/'))[1]::uuid
--     )
--   );
