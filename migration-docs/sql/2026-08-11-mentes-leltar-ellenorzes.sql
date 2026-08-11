-- ============================================================================
-- 2026-08-11 — MENTÉS-LELTÁR ELLENŐRZÉS (csak OLVAS, semmit nem módosít)
-- ============================================================================
-- MIÉRT KELL EZ:
--   A `migration-docs/Database_schema.sql` dump 100 táblát ismer, a
--   `migration-docs/sql/*.sql` viszont további ~57 táblát hoz létre. A repó és
--   az ÉLES adatbázis tehát bizonyítottan széthúz — a mentés tábla-listáját
--   NEM szabad a repóból származtatni. Ez a lekérdezés az ÉLŐ törzsből olvassa
--   ki, mi van valójában, és mi az, ami a mentésből kimaradna.
--
--   Ha egy tábla itt megjelenik, de a mentés tábla-listájában nincs benne,
--   akkor az adat NÉMÁN kimarad a biztonsági mentésből — pontosan az a
--   hibaosztály, amit a projekt már többször megégetett.
--
-- FUTTATÁS: Supabase Studio → SQL Editor. A Studio CSAK AZ UTOLSÓ eredményt
--   mutatja, ezért mind a 7 szakasz EGYETLEN UNION-ba van fűzve.
-- ============================================================================

WITH
-- 1. Minden valódi public tábla + van-e congregation_id / diocese_id oszlopa
tablak AS (
  SELECT
    t.table_name,
    EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name
               AND c.column_name = 'congregation_id')            AS van_cong,
    EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name
               AND c.column_name = 'diocese_id')                 AS van_diocese,
    EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name
               AND c.column_name IN ('deleted','is_deleted','isvisible','deleted_at')) AS van_softdelete,
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS oszlopok
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
),
-- 2. Élő méret-adatok (ez mondja meg, kell-e inkrementális mentés)
meretek AS (
  SELECT c.relname AS table_name,
         c.reltuples::bigint AS becsult_sorok,
         pg_total_relation_size(c.oid) AS bajt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),
-- 3. GENERATED ALWAYS AS IDENTITY oszlopok — ezekbe visszaállításkor CSAK
--    `OVERRIDING SYSTEM VALUE`-val lehet explicit id-t írni. Enélkül a restore
--    új id-kat oszt, és MINDEN rá mutató FK elszakad.
identity_oszlopok AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND is_identity = 'YES'
    AND identity_generation = 'ALWAYS'
),
-- 4. Ön-hivatkozó FK-k (kétmenetes visszatöltés kell: NULL → INSERT → UPDATE)
onhivatkozas AS (
  SELECT con.conname, cl.relname AS tabla,
         pg_get_constraintdef(con.oid) AS definicio
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE con.contype = 'f' AND n.nspname = 'public'
    AND con.conrelid = con.confrelid
),
-- 5. NEM az elsődleges kulcsra mutató FK-k (természetes kulcs!) — ezek a
--    legveszélyesebbek: a `szemely.id_apja → szemely(cnp)` ilyen.
nem_pk_fk AS (
  SELECT cl.relname AS tabla, con.conname,
         pg_get_constraintdef(con.oid) AS definicio
  FROM pg_constraint con
  JOIN pg_class cl  ON cl.oid  = con.conrelid
  JOIN pg_class cl2 ON cl2.oid = con.confrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE con.contype = 'f' AND n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint pk
      WHERE pk.conrelid = con.confrelid AND pk.contype = 'p'
        AND pk.conkey = con.confkey
    )
),
-- 6. Storage bucket-ek — ezek NEM a Postgresben vannak, külön kell menteni
bucketek AS (
  SELECT id, public::text AS nyilvanos FROM storage.buckets
)
SELECT * FROM (
  SELECT 1 AS s, 'A) TÁBLA' AS szakasz, t.table_name AS nev,
         CASE WHEN t.van_cong THEN 'congregation_id'
              WHEN t.van_diocese THEN 'diocese_id (egyhazmegyei)'
              ELSE '⚠ NINCS SCOPE-OSZLOP — join vagy globális!' END AS reszlet,
         concat(t.oszlopok, ' oszlop',
                CASE WHEN t.van_softdelete THEN ' | soft-delete' ELSE '' END,
                ' | ~', coalesce(m.becsult_sorok, 0), ' sor | ',
                pg_size_pretty(coalesce(m.bajt, 0))) AS megjegyzes
  FROM tablak t LEFT JOIN meretek m ON m.table_name = t.table_name

  UNION ALL
  SELECT 2, 'B) IDENTITY ALWAYS', table_name, column_name,
         'Visszaállításkor OVERRIDING SYSTEM VALUE kell!'
  FROM identity_oszlopok

  UNION ALL
  SELECT 3, 'C) ÖN-HIVATKOZÁS', tabla, conname,
         concat('Kétmenetes restore kell — ', definicio)
  FROM onhivatkozas

  UNION ALL
  SELECT 4, 'D) NEM-PK FK', tabla, conname,
         concat('⚠ természetes kulcsra mutat — ', definicio)
  FROM nem_pk_fk

  UNION ALL
  SELECT 5, 'E) STORAGE BUCKET', id, nyilvanos,
         'NEM a Postgresben — külön mentés kell'
  FROM bucketek

  UNION ALL
  SELECT 6, 'F) AUTH', 'auth.users', (SELECT count(*)::text FROM auth.users),
         'Jelszó-hash NEM menthető a Data API-n keresztül'

  UNION ALL
  -- G) Van-e GLOBÁLIS unique index a szemely.cnp-n? Enélkül a
  --    `szemely_id_apja_fk → szemely(cnp)` FK nem is létezhetne. Ha ez üres
  --    ÉS a D) szakasz mégis mutatja az FK-t, akkor a repó és az éles DB
  --    ellentmond — ELŐBB ezt kell tisztázni, csak utána tervezni a restore-t.
  SELECT 7, 'G) szemely.cnp index', indexname, 'létező index',
         indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'szemely' AND indexdef ILIKE '%cnp%'
) x
ORDER BY s, nev;
