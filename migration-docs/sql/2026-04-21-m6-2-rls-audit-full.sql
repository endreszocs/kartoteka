-- ════════════════════════════════════════════════════════════════════════════
--  M6.2 — Teljes RLS audit a Tauri desktop migrációhoz
--  Dátum: 2026-04-21
--  Futtatás: Endre → Supabase SQL Editor
--  Módosít? NEM — kizárólag SELECT-ek, OLVAS-only audit.
--
--  Miért kritikus?
--    Az M6+ roadmap szerint a desktop kliens közvetlen, RLS-védett Supabase
--    hívásokat végez (Server Action nélkül). Ha egy táblán hiányzik az RLS
--    vagy a policy, a közvetlen desktop-hívás cross-congregation adatot
--    szivárogtathat. **Ez az audit blokkoló előfeltétel minden M7+ modul-
--    hullámhoz.**
--
--  Output: 6 riport egymás után, majd egy ÖSSZEFOGLALÓ sor.
--    1.  Teljes public-séma RLS státusz (dinamikus, minden tábla)
--    2.  Modul-priorizált audit (P0/P1/P2/P3, Tauri scope)
--    3.  anon role engedélyek (ne legyen publikus SELECT privát táblán)
--    4.  Hiányzó policy (RLS be, de 0 policy → minden tiltva, ez is probléma)
--    5.  SECURITY DEFINER helper fn-ek léte (current_user_*)
--    6.  Összefoglaló counter: OK / WARN / FAIL száma prioritásonként
--
--  A végi check-SELECT-ek a fájl végén vannak, futtatható formában
--  (memory: feedback_sql_ellenorzes_egyben).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) TELJES public-séma RLS státusz (minden tábla, dinamikus)
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 1. Teljes public-séma RLS státusz ══════════════════════════════' AS section;

SELECT
  c.relname                                                                           AS table_name,
  c.relrowsecurity                                                                    AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname)                        AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN '❌ RLS OFF'
    WHEN (SELECT COUNT(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname) = 0
      THEN '⚠️  RLS ON, 0 policy (minden tiltva)'
    ELSE '✅ OK'
  END                                                                                 AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind  = 'r'
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT IN ('schema_migrations')
ORDER BY
  CASE
    WHEN NOT c.relrowsecurity THEN 1
    WHEN (SELECT COUNT(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname) = 0 THEN 2
    ELSE 3
  END,
  c.relname;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) MODUL-PRIORIZÁLT audit (Tauri desktop scope, 22 modul)
--    A VALUES lista a 2026-04-21-i sémában ténylegesen létező táblákat
--    rendeli a 22 dashboard modulhoz a biztonsági prioritás szerint.
--    Ha egy táblát itt nem találsz, az 1) pontban mindenképp megjelenik.
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 2. Modul-priorizált audit ══════════════════════════════════════' AS section;

WITH module_tables(module, priority, table_name) AS (VALUES
  -- P0 pénzügy
  ('penzugy',          'P0', 'chitanta_tombok'),
  ('penzugy',          'P0', 'oblio_fiokok'),
  ('penzugy',          'P0', 'oblio_szamlak'),
  ('penzugy',          'P0', 'oblio_kiadas_match'),
  ('penzugy',          'P0', 'bankszamlak'),
  ('penzugy',          'P0', 'bankszamla_nyito_egyenleg'),
  ('penzugy',          'P0', 'befizetes'),
  ('penzugy',          'P0', 'befizetescel'),
  ('penzugy',          'P0', 'kiadas'),
  ('penzugy',          'P0', 'kiadascel'),
  ('penzugy',          'P0', 'kiadasikiseroiv'),
  ('penzugy',          'P0', 'koltsegvetes'),
  ('penzugy',          'P0', 'szamadasicel'),
  ('penzugy',          'P0', 'jarulek_kedvezmeny'),
  ('penzugy',          'P0', 'monetar'),
  ('penzugy',          'P0', 'berleti_szerzodes'),
  ('penzugy',          'P0', 'congregation_annual_fees'),
  ('penzugy',          'P0', 'congregation_custom_fees'),
  ('penzugy',          'P0', 'congregation_subscriptions'),
  ('penzugy',          'P0', 'transactions'),
  ('penzugy',          'P0', 'valuta_atert'),
  ('penzugy',          'P0', 'nom_cimlet'),
  -- P0 tagnyilvántartás
  ('tagnyilvantartas', 'P0', 'szemely'),
  ('tagnyilvantartas', 'P0', 'csalad'),
  ('tagnyilvantartas', 'P0', 'gyerek'),
  ('tagnyilvantartas', 'P0', 'presbiter'),
  ('tagnyilvantartas', 'P0', 'csaladlatogatas'),
  ('tagnyilvantartas', 'P0', 'csoport'),
  ('tagnyilvantartas', 'P0', 'bekoltozott'),
  ('tagnyilvantartas', 'P0', 'elkoltozott'),
  ('tagnyilvantartas', 'P0', 'belsomozgas'),
  -- P0 anyakönyv
  ('anyakonyv',        'P0', 'attert'),
  ('anyakonyv',        'P0', 'kitert'),
  ('anyakonyv',        'P0', 'keresztseg'),
  ('anyakonyv',        'P0', 'konfirmalas'),
  ('anyakonyv',        'P0', 'hazassag'),
  ('anyakonyv',        'P0', 'temetes'),
  ('anyakonyv',        'P0', 'felmentes'),
  -- P1 jegyzőkönyvek
  ('jegyzokonyvek',    'P1', 'jegyzokonyv_hatarozatok'),
  ('jegyzokonyvek',    'P1', 'jegyzokonyv_napirendi_pontok'),
  ('jegyzokonyvek',    'P1', 'jegyzokonyv_resztvevok'),
  ('jegyzokonyvek',    'P1', 'presbiteri_jegyzokonyvek'),
  -- P1 iktato
  ('iktato',           'P1', 'iktato'),
  ('iktato',           'P1', 'iktato_sablonok'),
  -- P1 leltar
  ('leltar',           'P1', 'leltar_tetelek'),
  ('leltar',           'P1', 'materials'),
  ('leltar',           'P1', 'material_movements'),
  -- P1 munkanapló (már offline-szinkronizált M8-ban)
  ('munkanaplo',       'P1', 'munkanaplo'),
  -- P1 éves jelentés
  ('eves-jelentes',    'P1', 'annual_reports'),
  ('eves-jelentes',    'P1', 'diocese_annual_reports'),
  -- P1 profile
  ('profile',          'P1', 'profiles'),
  ('profile',          'P1', 'profile_congregations'),
  ('profile',          'P1', 'profile_preferences'),
  ('profile',          'P1', 'profile_roles'),
  ('profile',          'P1', 'pastor_profiles'),
  -- P1 congregation + dioceses
  ('congregation',     'P1', 'congregations'),
  ('congregation',     'P1', 'dioceses'),
  ('congregation',     'P1', 'districts'),
  ('congregation',     'P1', 'bealitas'),
  -- P1 dashboard-egyházmegye
  ('dashboard-em',     'P1', 'diocese_bealitas'),
  ('dashboard-em',     'P1', 'diocese_befizetes'),
  ('dashboard-em',     'P1', 'diocese_kiadas'),
  ('dashboard-em',     'P1', 'diocese_koltsegvetes'),
  -- P1 notifications
  ('notifications',    'P1', 'ertesitesek'),
  -- P2 sirhely
  ('sirhely',          'P2', 'sirhely'),
  ('sirhely',          'P2', 'sirhelyberles'),
  ('sirhely',          'P2', 'sirhelyelhunyt'),
  ('sirhely',          'P2', 'sirhelytemeto'),
  -- P2 programs
  ('programs',         'P2', 'gyulekezeti_programok'),
  ('programs',         'P2', 'event'),
  -- P3 misszios-muhely (mm_ prefix)
  ('misszios-muhely',  'P3', 'mm_bookmarks'),
  ('misszios-muhely',  'P3', 'mm_dokumentumok'),
  ('misszios-muhely',  'P3', 'mm_feladatok'),
  ('misszios-muhely',  'P3', 'mm_felhasznalo_jelveny'),
  ('misszios-muhely',  'P3', 'mm_felhasznalo_statisztika'),
  ('misszios-muhely',  'P3', 'mm_hozzaszolasok'),
  ('misszios-muhely',  'P3', 'mm_jelveny_tipusok'),
  ('misszios-muhely',  'P3', 'mm_kategoriak'),
  ('misszios-muhely',  'P3', 'mm_merfoldkovek'),
  ('misszios-muhely',  'P3', 'mm_otlet_cimkek'),
  ('misszios-muhely',  'P3', 'mm_otlet_kategoriak'),
  ('misszios-muhely',  'P3', 'mm_otletek'),
  ('misszios-muhely',  'P3', 'mm_segedanyag_ertekelesek'),
  ('misszios-muhely',  'P3', 'mm_segedanyag_kategoriak'),
  ('misszios-muhely',  'P3', 'mm_segedanyagok'),
  ('misszios-muhely',  'P3', 'mm_szavazatok'),
  -- P3 support
  ('support',          'P3', 'support_messages'),
  -- Web-only admin (nem fut desktopon, de RLS-nek itt is OK-nak kell lennie)
  ('admin',            'web-only', 'access_requests'),
  ('admin',            'web-only', 'admin_access_requests'),
  ('admin',            'web-only', 'system_broadcasts'),
  ('admin',            'web-only', 'system_finance_costs'),
  ('admin',            'web-only', 'system_pricing_tiers'),
  ('admin',            'web-only', 'system_settings'),
  ('admin',            'web-only', 'licenses'),
  ('admin',            'web-only', 'user_devices'),
  -- Web-only publikus oldal (anon SELECT megengedett, de csak publikált tartalomra)
  ('publikus',         'web-only', 'public_sites'),
  ('publikus',         'web-only', 'public_site_themes'),
  ('publikus',         'web-only', 'public_posts'),
  ('publikus',         'web-only', 'public_magazines'),
  ('publikus',         'web-only', 'public_magazine_issues'),
  -- System / nomenklatúra (cím-referencia, ritkán változik)
  ('address',          'system',   'adrcountry'),
  ('address',          'system',   'adrcounty'),
  ('address',          'system',   'adrlocality'),
  ('address',          'system',   'adrlocality_alias'),
  ('address',          'system',   'adrstreet'),
  ('system',           'system',   'nevnap'),
  -- Audit / log / dokumentum-tár
  ('system',           'system',   'audit_log'),
  ('system',           'system',   'logger'),
  ('system',           'system',   'import_logs'),
  ('system',           'system',   'document_keys'),
  ('system',           'system',   'documents'),
  ('system',           'system',   'document_submissions'),
  ('system',           'system',   'wizard_progress')
)
SELECT
  mt.module,
  mt.priority,
  mt.table_name,
  CASE WHEN c.relname IS NULL THEN false ELSE c.relrowsecurity END                     AS rls_enabled,
  COALESCE(
    (SELECT COUNT(*) FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = mt.table_name), 0
  )                                                                                     AS policy_count,
  CASE
    WHEN c.relname IS NULL                                  THEN '🕳  Tábla HIÁNYZIK (séma-drift?)'
    WHEN NOT c.relrowsecurity                               THEN '❌ RLS OFF'
    WHEN (SELECT COUNT(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = mt.table_name) = 0
                                                            THEN '⚠️  RLS ON, 0 policy'
    ELSE '✅ OK'
  END                                                                                   AS status
FROM module_tables mt
LEFT JOIN pg_class c
  ON c.relname = mt.table_name
 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY
  CASE mt.priority
    WHEN 'P0'       THEN 1
    WHEN 'P1'       THEN 2
    WHEN 'P2'       THEN 3
    WHEN 'P3'       THEN 4
    WHEN 'web-only' THEN 5
    WHEN 'system'   THEN 6
    ELSE 9
  END,
  mt.module,
  mt.table_name;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) anon ROLE ENGEDÉLYEK — ne legyen publikus SELECT privát táblán
--    Csak a public_* és nom_* (nomenklatúra) táblán megengedett az anon-access.
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 3. anon role engedélyek (gyanús: nem publikus táblán SELECT) ═══' AS section;

SELECT
  p.tablename,
  p.policyname,
  p.cmd,
  LEFT(p.qual::text, 120)                                                               AS using_condition,
  CASE
    WHEN p.tablename LIKE 'public\_%'  ESCAPE '\' THEN '✅ publikus szándékolt'
    WHEN p.tablename LIKE 'adr%'                  THEN '✅ cím-nomenklatúra (OK)'
    WHEN p.tablename IN ('nevnap', 'nom_cimlet')  THEN '✅ nomenklatúra (OK)'
    ELSE                                               '⚠️  GYANÚS — ellenőrizd!'
  END                                                                                   AS verdict
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND 'anon' = ANY(p.roles)
ORDER BY verdict DESC, p.tablename, p.cmd;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) HIÁNYZÓ policy-k — RLS bekapcsolva, de 0 policy (minden tiltva)
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 4. RLS ON de 0 policy (minden művelet tiltva) ══════════════════' AS section;

SELECT
  c.relname                                                                             AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT IN ('schema_migrations')
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) SECURITY DEFINER helper fn-ek léte (current_user_*)
--    A desktop közvetlen Supabase hívás ezeket használja az RLS policy-kben.
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 5. SECURITY DEFINER helper függvények ══════════════════════════' AS section;

WITH expected(fn_name) AS (VALUES
  ('current_user_congregation_id'),
  ('current_user_has_global_access'),
  ('current_user_can_access_congregation'),
  ('is_admin'),
  ('same_congregation'),
  ('is_owner')
)
SELECT
  e.fn_name,
  CASE WHEN pg.proname IS NULL THEN '❌ HIÁNYZIK'
       WHEN pg.prosecdef        THEN '✅ OK (SECURITY DEFINER)'
       ELSE                          '⚠️  létezik, de NEM SECURITY DEFINER'
  END                                                                                   AS status
FROM expected e
LEFT JOIN pg_proc pg
  ON pg.proname = e.fn_name
 AND pg.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY e.fn_name;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) ÖSSZEFOGLALÓ counter — OK / WARN / FAIL prioritásonként
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 6. Összefoglaló — prioritásonként OK/WARN/FAIL számlálás ═══════' AS section;

WITH module_tables(priority, table_name) AS (VALUES
  ('P0', 'chitanta_tombok'), ('P0', 'oblio_fiokok'), ('P0', 'oblio_szamlak'),
  ('P0', 'oblio_kiadas_match'), ('P0', 'bankszamlak'), ('P0', 'bankszamla_nyito_egyenleg'),
  ('P0', 'befizetes'), ('P0', 'befizetescel'), ('P0', 'kiadas'), ('P0', 'kiadascel'),
  ('P0', 'kiadasikiseroiv'), ('P0', 'koltsegvetes'), ('P0', 'szamadasicel'),
  ('P0', 'jarulek_kedvezmeny'), ('P0', 'monetar'), ('P0', 'berleti_szerzodes'),
  ('P0', 'congregation_annual_fees'), ('P0', 'congregation_custom_fees'),
  ('P0', 'congregation_subscriptions'), ('P0', 'transactions'), ('P0', 'valuta_atert'),
  ('P0', 'nom_cimlet'),
  ('P0', 'szemely'), ('P0', 'csalad'), ('P0', 'gyerek'), ('P0', 'presbiter'),
  ('P0', 'csaladlatogatas'), ('P0', 'csoport'),
  ('P0', 'bekoltozott'), ('P0', 'elkoltozott'), ('P0', 'belsomozgas'),
  ('P0', 'attert'), ('P0', 'kitert'), ('P0', 'keresztseg'), ('P0', 'konfirmalas'),
  ('P0', 'hazassag'), ('P0', 'temetes'), ('P0', 'felmentes'),
  ('P1', 'jegyzokonyv_hatarozatok'), ('P1', 'jegyzokonyv_napirendi_pontok'),
  ('P1', 'jegyzokonyv_resztvevok'), ('P1', 'presbiteri_jegyzokonyvek'),
  ('P1', 'iktato'), ('P1', 'iktato_sablonok'),
  ('P1', 'leltar_tetelek'), ('P1', 'materials'), ('P1', 'material_movements'),
  ('P1', 'munkanaplo'),
  ('P1', 'annual_reports'), ('P1', 'diocese_annual_reports'),
  ('P1', 'profiles'), ('P1', 'profile_congregations'), ('P1', 'profile_preferences'),
  ('P1', 'profile_roles'), ('P1', 'pastor_profiles'),
  ('P1', 'congregations'), ('P1', 'dioceses'), ('P1', 'districts'), ('P1', 'bealitas'),
  ('P1', 'diocese_bealitas'), ('P1', 'diocese_befizetes'),
  ('P1', 'diocese_kiadas'), ('P1', 'diocese_koltsegvetes'),
  ('P1', 'ertesitesek'),
  ('P2', 'sirhely'), ('P2', 'sirhelyberles'), ('P2', 'sirhelyelhunyt'), ('P2', 'sirhelytemeto'),
  ('P2', 'gyulekezeti_programok'), ('P2', 'event'),
  ('P3', 'support_messages')
)
SELECT
  mt.priority,
  COUNT(*) AS total,
  COUNT(*) FILTER (
    WHERE c.relrowsecurity = true
      AND (SELECT COUNT(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = mt.table_name) > 0
  ) AS ok,
  COUNT(*) FILTER (
    WHERE c.relrowsecurity = true
      AND (SELECT COUNT(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = mt.table_name) = 0
  ) AS warn_no_policy,
  COUNT(*) FILTER (WHERE c.relname IS NOT NULL AND c.relrowsecurity = false) AS fail_rls_off,
  COUNT(*) FILTER (WHERE c.relname IS NULL)                                  AS fail_missing
FROM module_tables mt
LEFT JOIN pg_class c
  ON c.relname = mt.table_name
 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY mt.priority
ORDER BY
  CASE mt.priority WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 WHEN 'P3' THEN 4 ELSE 9 END;

-- ════════════════════════════════════════════════════════════════════════════
--  BLOKKOLÓ SZABÁLY (M6.2 acceptance):
--    - P0 + P1 szinten: fail_rls_off = 0 ÉS warn_no_policy = 0 ÉS fail_missing = 0
--    - P2 szinten: fail_rls_off ≤ 2 (engedélyezett, de M12 előtt javítandó)
--    - SECURITY DEFINER fn-ek: MIND ✅ OK (5.)
--
--  Ha a riport nem elégíti ki ezeket, a következő M7 wave INDÍTÁSA BLOKKOLÓ.
--  A hiányokat külön fix-migrációk orvosolják (pl. 2026-04-22-m6-2a-rls-fix-...).
-- ════════════════════════════════════════════════════════════════════════════
