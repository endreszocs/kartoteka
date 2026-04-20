-- =========================================================================
-- 2026-04-17 — RLS AUDIT: ki láthatja a gyülekezeti pénzügyi/anyakönyvi adatokat?
-- =========================================================================
-- ALAPELV (Endre, 2026-04-17):
--   Az egyházmegye (esperes / egyházmegyei_admin) NEM láthat bele a gyülekezet
--   pénzügyi/anyakönyvi/tagnyilvántartási helyzetébe — csak a kötelezően leadott
--   évi dokumentumokat (költségvetés, számadás, vagyonleltár, választók).
--
--   A rendszergazda (admin/master) is csak a lelkész engedélyével léphet be
--   (admin_access_requests workflow).
--
-- Ez a fájl CSAK OLVASÓ — feltérképezi a jelenlegi RLS állapotot. Nem módosít!
-- A futtatás eredményét küldd vissza, és az alapján tervezzük a szigorítást.
-- =========================================================================

-- 1) A `current_user_has_global_access()` helper függvény definíciója
SELECT pg_get_functiondef('public.current_user_has_global_access()'::regprocedure)
  AS current_user_has_global_access_definition;

-- 2) A `current_user_can_access_congregation(uuid)` helper függvény definíciója
SELECT pg_get_functiondef('public.current_user_can_access_congregation(uuid)'::regprocedure)
  AS current_user_can_access_congregation_definition;

-- 3) Egyéb releváns helper függvények
SELECT proname AS function_name,
       pg_get_function_identity_arguments(oid) AS arguments
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE 'current_user_%'
ORDER BY proname;

-- 4) RLS policy-k a kritikus táblákon (gyülekezeti pénzügyi és személyes adatok)
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  CASE WHEN qual IS NOT NULL THEN 'has USING' ELSE NULL END AS using_clause,
  CASE WHEN with_check IS NOT NULL THEN 'has WITH CHECK' ELSE NULL END AS with_check_clause,
  qual::text AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'befizetes', 'kiadas', 'befizetescel', 'kiadascel',
    'szemely', 'csalad', 'gyerek', 'presbiter',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'bankszamlak', 'belsomozgas', 'koltsegvetes',
    'leltar_tetelek', 'iktato', 'iktato_sablonok',
    'munkanaplo', 'sirhely', 'sirhelyberles', 'sirhelyelhunyt',
    'jarulek_kedvezmeny', 'kiadasikiseroiv', 'valuta_atert',
    'oblio_szamlak', 'oblio_kiadas_match',
    'berleti_szerzodes'
  )
ORDER BY tablename, policyname;

-- 5) RLS engedélyezve a kritikus táblákon?
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'befizetes', 'kiadas', 'befizetescel', 'kiadascel',
    'szemely', 'csalad', 'gyerek', 'presbiter',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'bankszamlak', 'belsomozgas', 'koltsegvetes',
    'leltar_tetelek', 'iktato', 'iktato_sablonok',
    'munkanaplo', 'sirhely', 'sirhelyberles', 'sirhelyelhunyt',
    'jarulek_kedvezmeny', 'kiadasikiseroiv', 'valuta_atert',
    'oblio_szamlak', 'oblio_kiadas_match',
    'berleti_szerzodes'
  )
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- 6) GRANT-ek ellenőrzése — kik kapnak közvetlen táblaszintű hozzáférést?
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'befizetes', 'kiadas', 'szemely', 'csalad', 'gyerek',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'bankszamlak', 'belsomozgas', 'koltsegvetes',
    'leltar_tetelek', 'iktato', 'munkanaplo'
  )
  AND grantee IN ('authenticated', 'anon', 'service_role', 'public')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- =========================================================================
-- ÉRTELMEZÉS
-- =========================================================================
-- Várt eredmény ALAPELV szerint:
--   * `current_user_has_global_access()` SZIGORÍTANDÓ: jelenleg az `esperes`
--     és `egyhazmegyei_admin` is benne van — az alapelv szerint NEM kellene
--     a gyülekezeti pénzügyi/anyakönyvi adatokhoz hozzáférnie. Csak `admin`
--     és `master`, ÉS az `admin_access_requests` approved státusz időkorlátosan.
--
--   * A 4) lekérdezésből látható, hogy a felsorolt táblák POLICY-i mit USING-olnak.
--     Ha bármelyik POLICY hivatkozik a `current_user_has_global_access()`-re,
--     akkor jelenleg a fenti tárolás-szerek mind látnák a gyülekezeti adatokat.
--
-- KÖVETKEZŐ LÉPÉS:
--   A visszakapott eredmények alapján egy szigorító migrációt írunk, ami:
--   1) A `current_user_has_global_access()`-t szigorítja (csak admin/master)
--   2) Új helper-t vezet be: `current_user_can_view_congregation_finance(uuid)`
--      ami csak akkor true, ha admin/master VAGY van approved & nem-lejárt
--      `admin_access_requests` rekord
--   3) A POLICY-kat a fenti táblákon átírja az új helper használatára
-- =========================================================================
