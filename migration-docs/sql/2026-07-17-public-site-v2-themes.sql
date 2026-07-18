-- Public site V2: a negy jovahagyott, kepes tema idempotens seedje.
-- Kizarolag a rendszerpresetek sorait kezeli. Policyt es grantet szandekosan
-- nem modosit, igy a public-site-read-security hardening elott es utan is
-- biztonsagosan ujrafuttathato. Authot es gyulekezeti adatot nem modosit.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.public_site_themes') IS NULL THEN
    RAISE EXCEPTION 'Hianyzik a public.public_site_themes tabla. Elobb a publikus oldal alapmigraciojat futtasd.';
  END IF;
END
$$;

INSERT INTO public.public_site_themes AS theme (
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
    'filmszeru-tortenet',
    'Filmszerű történet',
    'Nagyképes, finoman animált és magával ragadó történetmesélő megjelenés.',
    '{"primary":"#0a241b","accent":"#d9ad62","surface":"#f5f0e5","ink":"#17251f","muted":"#66766e","soft":"#e8e0d2"}'::jsonb,
    '{"heading_font":"Cormorant Garamond","body_font":"Inter"}'::jsonb,
    'photo',
    '1.25rem',
    4,
    true
  ),
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
  is_active = EXCLUDED.is_active
WHERE ROW(
  theme.display_name,
  theme.description,
  theme.colors,
  theme.typography,
  theme.hero_style,
  theme.border_radius,
  theme.sort_order,
  theme.is_active
) IS DISTINCT FROM ROW(
  EXCLUDED.display_name,
  EXCLUDED.description,
  EXCLUDED.colors,
  EXCLUDED.typography,
  EXCLUDED.hero_style,
  EXCLUDED.border_radius,
  EXCLUDED.sort_order,
  EXCLUDED.is_active
);

DO $postflight$
DECLARE
  v_theme_count integer;
  v_all_active boolean;
BEGIN
  SELECT count(*), bool_and(is_active)
    INTO v_theme_count, v_all_active
  FROM public.public_site_themes
  WHERE preset_key IN (
    'filmszeru-tortenet',
    'elo-kert',
    'csendes-parokia',
    'zsoltaros-orokseg'
  );

  IF v_theme_count <> 4 OR NOT coalesce(v_all_active, false) THEN
    RAISE EXCEPTION
      'Public-site V2 theme postflight failed: count=%, all_active=%',
      v_theme_count,
      v_all_active;
  END IF;
END
$postflight$;

COMMIT;

-- Ellenorzes: pontosan negy aktiv sort kell visszaadnia.
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
WHERE preset_key IN (
  'filmszeru-tortenet',
  'elo-kert',
  'csendes-parokia',
  'zsoltaros-orokseg'
)
ORDER BY sort_order;
