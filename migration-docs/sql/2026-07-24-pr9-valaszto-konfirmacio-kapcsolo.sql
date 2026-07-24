-- ============================================================================
-- PR-9 (tagnyilvántartás) — VÁLASZTÓI KONFIRMÁCIÓ-KAPCSOLÓ
-- Dátum: 2026-07-24
-- User-észrevétel (1. pont): a konfirmáció-kritérium legyen KIKAPCSOLHATÓ,
--   mert előfordulhat, hogy a konfirmálási anyakönyv még nincs bevezetve a
--   rendszerbe — ilyenkor a szabály: „aki fizet, az konfirmáltnak számít és
--   választójogosult".
--
-- MIT CSINÁL:
--   1. Új beállítás-oszlop: congregations.valaszto_konfirmacio_szukseges
--      (default TRUE = a korábbi viselkedés változatlan).
--   2. A recompute_voter_eligibility a beállítást olvassa: ha FALSE, a
--      konfirmált-feltétel kimarad a jogosultság-szabályból.
--   A kapcsoló a Választók fülön állítható; átállítás után a rendszer
--   automatikusan újraszámol.
-- ============================================================================

-- 1. Beállítás-oszlop
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS valaszto_konfirmacio_szukseges boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.congregations.valaszto_konfirmacio_szukseges IS
  'Választói jogosultság: kell-e konfirmálási rekord (2026-07-24, PR-9). FALSE = aki fizet/felmentett és 18+, az konfirmáció-rekord nélkül is jogosult (pl. amíg a konfirmálási anyakönyv nincs bevezetve).';

-- 2. RPC-frissítés — a beállítás beolvasása + feltételes konfirmált-kritérium
CREATE OR REPLACE FUNCTION public.recompute_voter_eligibility(p_congregation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_added int := 0;
  v_removed int := 0;
  v_eligible int := 0;
  v_total int := 0;
  v_require_confirmation boolean := true;
BEGIN
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- 2026-07-24 (PR-9): gyülekezet-szintű kapcsoló — ha a konfirmálási
  -- anyakönyv még nincs bevezetve, a konfirmált-feltétel kikapcsolható.
  SELECT COALESCE(valaszto_konfirmacio_szukseges, true)
  INTO v_require_confirmation
  FROM public.congregations
  WHERE id = p_congregation_id;

  WITH calc AS (
    SELECT
      s.id,
      s.voter_eligible AS old_elig,
      CASE
        WHEN s.voter_manual_override = 1 THEN true
        WHEN s.voter_manual_override = 0 THEN false
        ELSE (
          s.meghalt IS NOT TRUE
          AND s.isvisible IS TRUE
          -- 2026-07-17 (PR-2 P0-fix): az elköltözés külön TÁBLÁBAN él
          AND NOT EXISTS (
            SELECT 1 FROM public.elkoltozott e
            WHERE e.id_szemely = s.id
          )
          AND COALESCE(s.member_status, 'aktív') NOT IN ('elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt')
          AND s.sz_datum IS NOT NULL
          AND s.sz_datum <= (CURRENT_DATE - INTERVAL '18 years')
          -- 2026-07-24 (PR-9): a konfirmált-feltétel csak akkor él, ha a
          -- gyülekezet beállítása megköveteli.
          AND (
            NOT v_require_confirmation
            OR EXISTS (
              SELECT 1 FROM public.konfirmalas k
              WHERE k.id_szemely = s.id AND k.congregation_id = p_congregation_id
            )
          )
        )
      END AS new_elig
    FROM public.szemely s
    WHERE s.congregation_id = p_congregation_id
  ),
  upd AS (
    UPDATE public.szemely s
    SET voter_eligible = c.new_elig
    FROM calc c
    WHERE s.id = c.id
      AND s.voter_eligible IS DISTINCT FROM c.new_elig
    RETURNING c.old_elig AS old_elig, c.new_elig AS new_elig
  )
  SELECT
    COALESCE(count(*) FILTER (WHERE new_elig AND NOT COALESCE(old_elig, false)), 0),
    COALESCE(count(*) FILTER (WHERE NOT new_elig AND COALESCE(old_elig, false)), 0)
  INTO v_added, v_removed
  FROM upd;

  SELECT
    COALESCE(count(*) FILTER (WHERE voter_eligible), 0),
    count(*)
  INTO v_eligible, v_total
  FROM public.szemely
  WHERE congregation_id = p_congregation_id
    AND isvisible IS TRUE
    AND meghalt IS NOT TRUE;

  RETURN jsonb_build_object(
    'status', 'ok',
    'eligible', v_eligible,
    'total', v_total,
    'added', v_added,
    'removed', v_removed,
    'confirmation_required', v_require_confirmation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_voter_eligibility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_voter_eligibility(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_voter_eligibility(uuid) TO authenticated;

-- ============================================================================
-- VERIFIKÁCIÓ
-- ============================================================================

-- 1) Az oszlop létezik és a definícióban ott a kapcsoló (várt: true, true):
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='congregations'
      AND column_name='valaszto_konfirmacio_szukseges'
  ) AS oszlop_letezik,
  position('v_require_confirmation' IN pg_get_functiondef('public.recompute_voter_eligibility(uuid)'::regprocedure)) > 0
    AS kapcsolo_telepitve;

-- 2) PRÓBAFUTTATÁS a Teszt gyülekezeten (várt: {"status":"ok", ...,
--    "confirmation_required": true}):
SELECT public.recompute_voter_eligibility(id)
FROM public.congregations WHERE name ILIKE '%Teszt%' LIMIT 1;

-- 3) (OPCIONÁLIS kézi teszt) A kapcsoló kikapcsolása egy gyülekezetre SQL-ből —
--    a felületről is állítható a Választók fülön, ez csak gyors ellenőrzéshez:
-- UPDATE public.congregations SET valaszto_konfirmacio_szukseges = false WHERE id = '<CONG_UUID>';
-- SELECT public.recompute_voter_eligibility('<CONG_UUID>');
