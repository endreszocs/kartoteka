-- Public site V2: a harom jovahagyott, kepes tema idempotens seedje.
-- A fajl a public_site_themes sorokat es azok aktiv-presetekre szukitett
-- olvasasi policyjat/grantjet kezeli. Authot es gyulekezeti adatot nem modosit.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.public_site_themes') IS NULL THEN
    RAISE EXCEPTION 'Hianyzik a public.public_site_themes tabla. Elobb a publikus oldal alapmigraciojat futtasd.';
  END IF;
END
$$;

INSERT INTO public.public_site_themes (
  preset_key,
  display_name,
  description,
  colors,
  typography,
  hero_style,
  border_radius,
  sort_order,
  is_active
)
VALUES
  (
    'elo-kert',
    'Élő kert',
    'Friss, közösségi és eseményközpontú megjelenés.',
    '{"primary":"#1f6b4f","accent":"#e5a64a","surface":"#fbfdf8","ink":"#17352b","muted":"#60756b","soft":"#edf5ee"}'::jsonb,
    '{"heading_font":"Fraunces","body_font":"Inter"}'::jsonb,
    'photo',
    '1.5rem',
    5,
    true
  ),
  (
    'csendes-parokia',
    'Csendes parókia',
    'Nyugodt, emberközeli felület finom, otthonos részletekkel.',
    '{"primary":"#6d5542","accent":"#c7925b","surface":"#fffbf4","ink":"#35281f","muted":"#7f7165","soft":"#f4ebdd"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"Inter"}'::jsonb,
    'photo',
    '1.125rem',
    6,
    true
  ),
  (
    'zsoltaros-orokseg',
    'Zsoltáros örökség',
    'Szerkesztőségi ritmusú, elegáns és örökségközpontú stílus.',
    '{"primary":"#1f344a","accent":"#b7985f","surface":"#fcfaf5","ink":"#1d2832","muted":"#66717c","soft":"#ece8dd"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"Inter"}'::jsonb,
    'photo',
    '0.5rem',
    7,
    true
  )
ON CONFLICT (preset_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  colors = EXCLUDED.colors,
  typography = EXCLUDED.typography,
  hero_style = EXCLUDED.hero_style,
  border_radius = EXCLUDED.border_radius,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- A live export szerint a tablan az RLS aktiv, de nincs SELECT policy. Grant
-- onmagaban ezert nem eleg: anon klienssel minden tema lathatatlan lenne, es a
-- publikus loader fallback arculatra esne. Csak az aktiv presetek olvashatok.
ALTER TABLE public.public_site_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_site_themes_public_read
  ON public.public_site_themes;
CREATE POLICY public_site_themes_public_read
  ON public.public_site_themes
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.public_site_themes
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.public_site_themes TO anon, authenticated;

COMMIT;

-- Ellenorzes: pontosan harom aktiv sort kell visszaadnia.
SELECT
  preset_key,
  display_name,
  colors,
  typography,
  hero_style,
  border_radius,
  sort_order,
  is_active
FROM public.public_site_themes
WHERE preset_key IN ('elo-kert', 'csendes-parokia', 'zsoltaros-orokseg')
ORDER BY sort_order;
