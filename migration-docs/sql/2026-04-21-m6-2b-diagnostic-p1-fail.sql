-- ════════════════════════════════════════════════════════════════════════════
--  M6.2b — Diagnostic: melyik 4 P1 tábla bukott el az RLS auditon?
--  Dátum: 2026-04-21
--  Futtatás: Endre → Supabase SQL Editor
--  Csak SELECT. A fő audit (M6.2) jelezte, hogy P1/26-ból 4 fail_rls_off.
--  Ez a script megmondja, MELYIK 4.
-- ════════════════════════════════════════════════════════════════════════════

WITH p1_tables(module, table_name) AS (VALUES
  ('jegyzokonyvek', 'jegyzokonyv_hatarozatok'),
  ('jegyzokonyvek', 'jegyzokonyv_napirendi_pontok'),
  ('jegyzokonyvek', 'jegyzokonyv_resztvevok'),
  ('jegyzokonyvek', 'presbiteri_jegyzokonyvek'),
  ('iktato',        'iktato'),
  ('iktato',        'iktato_sablonok'),
  ('leltar',        'leltar_tetelek'),
  ('leltar',        'materials'),
  ('leltar',        'material_movements'),
  ('munkanaplo',    'munkanaplo'),
  ('eves-jelentes', 'annual_reports'),
  ('eves-jelentes', 'diocese_annual_reports'),
  ('profile',       'profiles'),
  ('profile',       'profile_congregations'),
  ('profile',       'profile_preferences'),
  ('profile',       'profile_roles'),
  ('profile',       'pastor_profiles'),
  ('congregation',  'congregations'),
  ('congregation',  'dioceses'),
  ('congregation',  'districts'),
  ('congregation',  'bealitas'),
  ('dashboard-em',  'diocese_bealitas'),
  ('dashboard-em',  'diocese_befizetes'),
  ('dashboard-em',  'diocese_kiadas'),
  ('dashboard-em',  'diocese_koltsegvetes'),
  ('notifications', 'ertesitesek')
)
SELECT
  p.module,
  p.table_name,
  CASE WHEN c.relname IS NULL THEN false ELSE c.relrowsecurity END                 AS rls_enabled,
  COALESCE(
    (SELECT COUNT(*) FROM pg_policies pg
      WHERE pg.schemaname = 'public' AND pg.tablename = p.table_name), 0
  )                                                                                 AS policy_count,
  CASE
    WHEN c.relname IS NULL          THEN '🕳  Tábla hiányzik'
    WHEN NOT c.relrowsecurity       THEN '❌ RLS OFF  ← fix-migráció célja'
    ELSE                                 '✅ OK'
  END                                                                               AS status
FROM p1_tables p
LEFT JOIN pg_class c
  ON c.relname = p.table_name
 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
WHERE c.relname IS NULL OR c.relrowsecurity = false
ORDER BY p.module, p.table_name;
