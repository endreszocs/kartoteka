-- ─────────────────────────────────────────────────────────────────
-- Recycle Bin (Kuka) — 30 napos retention automatikus takarítás
-- ─────────────────────────────────────────────────────────────────
--
-- A KARTOTEKA offline-first PWA "Kuka" funkciója azt mondja: a user által
-- törölt rekordok 30 napig visszaállíthatók, utána véglegesen törlődnek.
--
-- Ez a migráció:
--  1. Létrehoz egy plpgsql függvényt, ami a támogatott táblákból törli a
--     30+ napos soft-deletes-eket (`deleted = true AND updated_at < now() - interval '30 days'`)
--  2. pg_cron extension-t enged (ha még nincs)
--  3. Hetente futtatja (vasárnap 03:00 UTC)
--
-- ROLLBACK:
--  SELECT cron.unschedule('kartoteka_recycle_bin_cleanup');
--  DROP FUNCTION IF EXISTS public.purge_recycle_bin();
-- ─────────────────────────────────────────────────────────────────

-- 1. Függvény: 30+ napos soft-delete-ek hard-delete-je
CREATE OR REPLACE FUNCTION public.purge_recycle_bin()
RETURNS table(tbl text, deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  soft_delete_tables text[] := ARRAY[
    -- Pénzügy
    'berleti_szerzodes',
    -- Iktató
    'iktato',
    'iktato_sablonok',
    -- Sírhely
    'sirhelytemeto',
    'sirhely',
    'sirhelyberles',
    'sirhelyelhunyt'
    -- Ha új soft-delete tábla jön, ide kell felvenni!
  ];
  tbl_name text;
  deleted_rows bigint;
BEGIN
  FOREACH tbl_name IN ARRAY soft_delete_tables LOOP
    BEGIN
      EXECUTE format(
        'DELETE FROM public.%I WHERE deleted = true AND updated_at < now() - interval ''30 days''',
        tbl_name
      );
      GET DIAGNOSTICS deleted_rows = ROW_COUNT;
      tbl := tbl_name;
      deleted_count := deleted_rows;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Ha egy tábla nem létezik vagy nincs 'deleted' oszlopa, csendben átugrunk
      RAISE NOTICE 'purge_recycle_bin: skipping %: %', tbl_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.purge_recycle_bin() IS
  'Törli a 30 napnál régebbi soft-delete rekordokat. Hetente fut pg_cron-nal.';

-- 2. Permissions — csak service_role futtathatja (vagy pg_cron belsőleg)
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM anon;
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recycle_bin() TO service_role;

-- 3. pg_cron beállítás (csak Supabase Pro+-on érhető el — ha hibát kap, ignoráld)
DO $$
BEGIN
  -- Ellenőrizzük, hogy a pg_cron extension elérhető
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    -- Engedélyezzük ha még nincs
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Régebbi schedule (ha volt) eltávolítása, majd újraütemezés
    PERFORM cron.unschedule('kartoteka_recycle_bin_cleanup')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'kartoteka_recycle_bin_cleanup'
    );

    -- Vasárnap 03:00 UTC (ez kb. a legcsendesebb időpont a KARTOTEKA workflow-jára)
    PERFORM cron.schedule(
      'kartoteka_recycle_bin_cleanup',
      '0 3 * * 0',
      $cronsql$SELECT public.purge_recycle_bin();$cronsql$
    );

    RAISE NOTICE 'Kuka cron job ütemezve: heti vasárnap 03:00 UTC';
  ELSE
    RAISE WARNING 'pg_cron extension nem érhető el — a Kuka takarítás MANUÁLIS lesz. Futtasd:';
    RAISE WARNING '  SELECT public.purge_recycle_bin();';
    RAISE WARNING 'Vagy Supabase Edge Function-ban schedulted workerrel.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron setup sikertelen: %', SQLERRM;
  RAISE WARNING 'A funkció működőképes, csak manuálisan kell futtatni.';
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Manuális lefuttatás (fejlesztéshez / teszteléshez)
-- ─────────────────────────────────────────────────────────────────
-- SELECT * FROM public.purge_recycle_bin();
-- Eredmény: egy táblázat (tbl, deleted_count) minden soft-delete táblához
