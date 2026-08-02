-- ============================================================================
-- PR-20 (2026-08-02) — GYÜLEKEZETI NAPTÁR-FEED (Google Naptár összekötés)
--
-- Mit ad: gyülekezetenként egy titkos (kitalálhatatlan) naptár-token, és egy
-- anon-hívható, SECURITY DEFINER RPC, amely a tokenhez tartozó gyülekezet
-- programjait adja vissza. Erre épül a /api/calendar/<token> ICS-feed, amit a
-- felhasználó a Google Naptárban „URL alapján" felvesz — onnantól a rögzített
-- programok (+ református ünnepek) automatikusan megjelennek és frissülnek.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl kijelölés nélkül. Idempotens.
-- ============================================================================

-- 1) Token-oszlop minden gyülekezetnek
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS calendar_feed_token uuid;

UPDATE public.congregations
SET calendar_feed_token = gen_random_uuid()
WHERE calendar_feed_token IS NULL;

ALTER TABLE public.congregations
  ALTER COLUMN calendar_feed_token SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS congregations_calendar_feed_token_uq
  ON public.congregations (calendar_feed_token);

COMMENT ON COLUMN public.congregations.calendar_feed_token IS
  'Nyilvános naptár-feed (ICS) titkos tokenje — /api/calendar/<token> (2026-08-02, PR-20).';

-- 2) Anon-hívható feed-RPC — CSAK a programok publikálható mezőit adja vissza
--    (nincs személyes adat), a token alapján azonosított gyülekezetre.
CREATE OR REPLACE FUNCTION public.public_calendar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_cong record;
  v_programs jsonb;
BEGIN
  SELECT id, COALESCE(nev_hu, name) AS nev
  INTO v_cong
  FROM public.congregations
  WHERE calendar_feed_token = p_token;

  IF v_cong.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'cim', p.cim,
    'leiras', p.leiras,
    'megjegyzes', p.megjegyzes,
    'helyszin', p.helyszin,
    'tipus', p.tipus,
    'egyedi_tipus_nev', p.egyedi_tipus_nev,
    'egyedi_emoji', p.egyedi_emoji,
    'datum', p.datum,
    'datum_vege', p.datum_vege,
    'ido_kezdes', p.ido_kezdes,
    'ido_befejezes', p.ido_befejezes,
    'ismetlodes_tipus', p.ismetlodes_tipus,
    'prioritas', p.prioritas,
    'updated_at', p.updated_at
  ) ORDER BY p.datum), '[]'::jsonb)
  INTO v_programs
  FROM public.gyulekezeti_programok p
  WHERE p.congregation_id = v_cong.id
    -- az idei év eleje előtt legfeljebb 5 évvel indult sorok (az ismétlődők
    -- kibontásához a régebbi sorozat-kezdetek is kellenek)
    AND p.datum >= to_char(now() - interval '5 years', 'YYYY') || '-01-01';

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', v_cong.nev,
    'programs', v_programs
  );
END;
$$;

COMMENT ON FUNCTION public.public_calendar_feed(uuid) IS
  'Nyilvános naptár-feed adatforrás (2026-08-02, PR-20): a calendar_feed_token alapján a gyülekezet programjait adja (személyes adat nélkül) az /api/calendar/<token> ICS-feedhez.';

REVOKE ALL ON FUNCTION public.public_calendar_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_calendar_feed(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.public_calendar_feed(uuid) TO authenticated;

-- 3) VERIFIKÁCIÓ
-- 3/a: mindenkinek van tokenje (várt: 0)
SELECT count(*) AS token_nelkuli_gyulekezet FROM public.congregations WHERE calendar_feed_token IS NULL;
-- 3/b: gyors próba az első gyülekezet tokenjével (várt: status=ok + programok)
SELECT public.public_calendar_feed(calendar_feed_token) -> 'status' AS proba_status
FROM public.congregations LIMIT 1;
