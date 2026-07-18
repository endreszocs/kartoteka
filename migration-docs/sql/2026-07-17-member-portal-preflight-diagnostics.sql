-- ============================================================================
-- KARTOTEKA -- tagi portal bevezetes elotti, CSAK OLVASO preflight
-- Datum: 2026-07-17
--
-- Cel:
--   1. az elo FK/CHECK/UNIQUE constraint-ek pontos igazolasa;
--   2. az Auth trigger es a tenant helper fuggvenyek tenyleges definicioja;
--   3. a kompozit FK-k es partial unique indexek elotti adatminosegi ellenorzes;
--   4. a profiles oszlop-szintu jogosultsagainak igazolasa.
--
-- Ez a fajl NEM modosit adatot, semat, policyt vagy jogosultsagot.
-- Egyben futtathato a Supabase SQL Editorban. Az eredmenyt JSON-kent exportald.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Elo constraint-ek (a korabbi ket csatolmany ugyanazt az indexlistat adta)
-- ---------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition,
  con.convalidated AS is_validated
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'profiles',
    'szemely',
    'befizetes',
    'haztartas',
    'haztartas_tag',
    'szemely_kapcsolat',
    'public_site_themes',
    'public_sites',
    'public_posts',
    'public_magazines',
    'public_magazine_issues'
  )
ORDER BY c.relname, con.contype, con.conname;

-- ---------------------------------------------------------------------------
-- B. Az Auth trigger es a biztonsagi helper fuggvenyek ELO definicioi
-- ---------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'handle_new_user',
    'current_user_can_access_congregation',
    'current_user_has_global_access',
    'current_user_congregation_id'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  event_object_schema AS schema_name,
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name, event_manipulation;

-- ---------------------------------------------------------------------------
-- C. profiles: tabla- es oszlop-szintu GRANT-ok
-- ---------------------------------------------------------------------------
SELECT
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

SELECT
  grantee,
  column_name,
  privilege_type,
  is_grantable
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, column_name, privilege_type;

-- ---------------------------------------------------------------------------
-- D. Tenant-koherencia es NULL/orphan pillanatkep (csak darabszamok)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.szemely WHERE congregation_id IS NULL)
    AS szemely_missing_congregation,
  (SELECT count(*) FROM public.befizetes WHERE congregation_id IS NULL)
    AS befizetes_missing_congregation,
  (SELECT count(*) FROM public.befizetes WHERE id_szemely IS NULL)
    AS befizetes_missing_person,
  (
    SELECT count(*)
    FROM public.befizetes b
    LEFT JOIN public.szemely s ON s.id = b.id_szemely
    WHERE b.id_szemely IS NOT NULL AND s.id IS NULL
  ) AS befizetes_orphan_person,
  (
    SELECT count(*)
    FROM public.befizetes b
    JOIN public.szemely s ON s.id = b.id_szemely
    WHERE b.congregation_id IS DISTINCT FROM s.congregation_id
  ) AS befizetes_cross_tenant_person,
  (
    SELECT count(*)
    FROM public.haztartas_tag ht
    JOIN public.haztartas h ON h.id = ht.id_haztartas
    WHERE ht.congregation_id IS DISTINCT FROM h.congregation_id
  ) AS household_membership_cross_tenant_household,
  (
    SELECT count(*)
    FROM public.haztartas_tag ht
    JOIN public.szemely s ON s.id = ht.id_szemely
    WHERE ht.congregation_id IS DISTINCT FROM s.congregation_id
  ) AS household_membership_cross_tenant_person,
  (
    SELECT count(*)
    FROM public.szemely_kapcsolat sk
    JOIN public.szemely s1 ON s1.id = sk.id_szemely_1
    JOIN public.szemely s2 ON s2.id = sk.id_szemely_2
    WHERE sk.congregation_id IS DISTINCT FROM s1.congregation_id
       OR sk.congregation_id IS DISTINCT FROM s2.congregation_id
  ) AS relationship_cross_tenant_person;

-- ---------------------------------------------------------------------------
-- E. A tervezett egyedisegi/kompozit kulcsok elotti duplikacio-ellenorzes
-- ---------------------------------------------------------------------------
SELECT id, congregation_id, count(*) AS duplicate_count
FROM public.szemely
GROUP BY id, congregation_id
HAVING count(*) > 1
ORDER BY duplicate_count DESC, id
LIMIT 100;

SELECT congregation_id, count(*) AS magazine_count
FROM public.public_magazines
GROUP BY congregation_id
HAVING count(*) > 1
ORDER BY magazine_count DESC, congregation_id;

SELECT
  pmi.id AS issue_id,
  pmi.congregation_id AS issue_congregation_id,
  pm.congregation_id AS magazine_congregation_id
FROM public.public_magazine_issues pmi
JOIN public.public_magazines pm ON pm.id = pmi.magazine_id
WHERE pmi.congregation_id IS DISTINCT FROM pm.congregation_id
ORDER BY pmi.id;

-- ---------------------------------------------------------------------------
-- F. Osszesito az auth.users / profiles szetvalasztas megtervezesehez
--    Nincs email vagy mas szemelyes adat az eredmenyben.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM auth.users) AS auth_user_count,
  (SELECT count(*) FROM public.profiles) AS staff_profile_count,
  (
    SELECT count(*)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) AS auth_users_without_profile,
  (
    SELECT count(*)
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE u.id IS NULL
  ) AS profiles_without_auth_user;
