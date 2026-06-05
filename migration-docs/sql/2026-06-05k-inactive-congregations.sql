-- ============================================================================
-- 2026-06-05k — Inaktív gyülekezetek automatikus jelölése (F4a)
-- ----------------------------------------------------------------------------
-- Endre kérése: ahol EGY ÉVE nincs aktivitás, a gyülekezet 'inactive' státuszba
-- kerül. Az "aktivitás" jele (a legkésőbbi):
--   - a gyülekezet lelkészeinek utolsó belépése (profiles.last_seen_at),
--   - a gyülekezet legutóbbi pénzügyi rögzítése (befizetes.created),
--   - a gyülekezet létrehozása (congregations.created_at) — hogy az új
--     gyülekezet ne legyen rögtön inaktív.
--
-- A státusz INFORMÁCIÓS (nem zár ki senkit): ha egy lelkész belép, a következő
-- futáskor a gyülekezet visszaáll 'active'-ra.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: 2026-06-05d (profiles.last_seen_at).
-- ============================================================================

BEGIN;

-- 1) Oszlopok
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'congregations_status_check'
  ) THEN
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_status_check CHECK (status IN ('active','inactive'));
  END IF;
END $$;

COMMENT ON COLUMN public.congregations.status IS
  'Életciklus-státusz: active | inactive. Az inactive automatikusan kerül beállításra, ha 1 éve nincs aktivitás (mark_inactive_congregations). Informatív, nem zár ki. 2026-06-05.';

-- 2) Jelölő függvény
CREATE OR REPLACE FUNCTION public.mark_inactive_congregations()
RETURNS TABLE(congregation_id uuid, new_status text, last_activity timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH act AS (
    SELECT c.id,
      GREATEST(
        COALESCE((SELECT max(p.last_seen_at) FROM public.profiles p WHERE p.congregation_id = c.id), 'epoch'::timestamptz),
        COALESCE((SELECT max(b.created::timestamptz) FROM public.befizetes b WHERE b.congregation_id = c.id), 'epoch'::timestamptz),
        COALESCE(c.created_at, 'epoch'::timestamptz)
      ) AS last_act
    FROM public.congregations c
  ),
  upd AS (
    UPDATE public.congregations c
       SET last_activity_at = act.last_act,
           status = CASE WHEN act.last_act < now() - interval '1 year' THEN 'inactive' ELSE 'active' END
      FROM act
     WHERE c.id = act.id
       AND (c.last_activity_at IS DISTINCT FROM act.last_act
            OR c.status IS DISTINCT FROM (CASE WHEN act.last_act < now() - interval '1 year' THEN 'inactive' ELSE 'active' END))
    RETURNING c.id, c.status, c.last_activity_at
  )
  SELECT upd.id, upd.status, upd.last_activity_at FROM upd;
END;
$$;

COMMENT ON FUNCTION public.mark_inactive_congregations() IS
  'Beállítja a congregations.status-t (active/inactive) az utolsó aktivitás alapján (lelkész last_seen + befizetés + létrehozás). Napi cron-nal fut. 2026-06-05.';

REVOKE ALL ON FUNCTION public.mark_inactive_congregations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inactive_congregations() TO service_role;

COMMIT;

-- 3) Első futtatás (a meglévő gyülekezetek besorolása)
SELECT count(*) AS valtozott_sorok FROM public.mark_inactive_congregations();

-- 4) pg_cron — napi 03:30 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('kartoteka_mark_inactive_congregations')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kartoteka_mark_inactive_congregations');
    PERFORM cron.schedule(
      'kartoteka_mark_inactive_congregations',
      '30 3 * * *',
      $cronsql$SELECT public.mark_inactive_congregations();$cronsql$
    );
    RAISE NOTICE 'Inaktív-gyülekezet cron ütemezve: naponta 03:30 UTC';
  ELSE
    RAISE WARNING 'pg_cron nem érhető el — futtasd manuálisan: SELECT public.mark_inactive_congregations();';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron setup sikertelen: %', SQLERRM;
END $$;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT nev_hu, status, last_activity_at FROM public.congregations
--   WHERE status = 'inactive' ORDER BY last_activity_at;
