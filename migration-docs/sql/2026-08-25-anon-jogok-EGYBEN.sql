-- ⚠️ CSAK OLVAS. Egyetlen lekérdezés — az összes eredmény egyszerre látszik.
-- Az `anon` (bejelentkezés nélküli) ÉS az `authenticated` szerep jogai
-- azokon a publikus táblákon, ahol egyáltalán van joguk.

SELECT
  g.grantee                                                            AS szerep,
  g.table_name                                                         AS tabla,
  string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type) AS jogok,
  c.relrowsecurity                                                     AS rls,
  CASE
    WHEN bool_or(g.privilege_type = 'TRUNCATE')
      THEN '⛔⛔ TRUNCATE — az RLS NEM fogja meg, a tábla kiüríthető'
    WHEN bool_or(g.privilege_type IN ('INSERT','UPDATE','DELETE')) AND NOT c.relrowsecurity
      THEN '⛔⛔ írás RLS NÉLKÜL'
    WHEN bool_or(g.privilege_type IN ('INSERT','UPDATE','DELETE'))
      THEN '⚠️ írás — az RLS-en múlik'
    WHEN NOT c.relrowsecurity
      THEN '⛔ olvasás RLS NÉLKÜL'
    ELSE 'ℹ️ olvasás — az RLS-en múlik'
  END                                                                  AS kockazat
FROM information_schema.role_table_grants g
JOIN pg_class c     ON c.relname = g.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE g.table_schema = 'public'
  AND g.grantee = 'anon'
GROUP BY g.grantee, g.table_name, c.relrowsecurity
ORDER BY
  bool_or(g.privilege_type = 'TRUNCATE') DESC,
  bool_or(g.privilege_type IN ('INSERT','UPDATE','DELETE')) DESC,
  g.table_name;
