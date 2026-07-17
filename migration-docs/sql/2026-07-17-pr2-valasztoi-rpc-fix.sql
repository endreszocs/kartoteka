-- ============================================================================
-- PR-2 (tagnyilvántartás, választói névjegyzék) — recompute_voter_eligibility FIX
-- Dátum: 2026-07-17
-- Terv: docs/project-tracking/KARTOTEKA-tagnyilvantartas-finomhangolas-terv-2026-07-17.md (F1.1)
--
-- MIT JAVÍT (P0 — élesben BIZONYÍTOTT, 2026-07-17 A2 diagnosztika):
--   A függvénytörzs az `s.elkoltozott IS NOT TRUE` feltételt használta, de a
--   szemely táblának NINCS elkoltozott oszlopa (a költözés külön TÁBLA) →
--   az RPC MINDEN futása "column s.elkoltozott does not exist" hibával elhalt,
--   a voter_eligible flag sosem számítódott ki. Csere: tábla-alapú kizárás
--   (NOT EXISTS a public.elkoltozott táblára).
--
-- MEGJEGYZÉS (D1 döntés): a járulék-kritérium (fizetett VAGY felmentett)
--   SZÁNDÉKOSAN nem ebben a flagben él — az év-függő fizetési állapotot az
--   alkalmazás számolja a friss befizetés/felmentés adatokból (különben a flag
--   minden befizetésnél elavulna). A voter_eligible = strukturális jogosultság
--   (él, látható, nem költözött el, aktív státusz, 18+, konfirmált, override).
-- ============================================================================

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
BEGIN
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

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
          -- 2026-07-17 (PR-2 P0-fix): az elköltözés külön TÁBLÁBAN él, nem a
          -- szemely oszlopában — a korábbi `s.elkoltozott IS NOT TRUE` miatt
          -- a függvény minden futása elhalt.
          AND NOT EXISTS (
            SELECT 1 FROM public.elkoltozott e
            WHERE e.id_szemely = s.id
          )
          AND COALESCE(s.member_status, 'aktív') NOT IN ('elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt')
          AND s.sz_datum IS NOT NULL
          AND s.sz_datum <= (CURRENT_DATE - INTERVAL '18 years')
          AND EXISTS (
            SELECT 1 FROM public.konfirmalas k
            WHERE k.id_szemely = s.id AND k.congregation_id = p_congregation_id
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
    'removed', v_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_voter_eligibility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_voter_eligibility(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_voter_eligibility(uuid) TO authenticated;

-- ============================================================================
-- VERIFIKÁCIÓ (a migráció után futtatandó)
-- ============================================================================

-- 1) A fix benne van-e az éles definícióban (várt: true):
SELECT position('NOT EXISTS' IN pg_get_functiondef('public.recompute_voter_eligibility(uuid)'::regprocedure)) > 0
         AS tabla_alapu_kizaras,
       position('s.elkoltozott' IN pg_get_functiondef('public.recompute_voter_eligibility(uuid)'::regprocedure)) = 0
         AS fantom_oszlop_eltavolitva;

-- 2) TÉNYLEGES PRÓBAFUTTATÁS a Teszt gyülekezeten (várt: {"status":"ok", ...}
--    számokkal — NEM hibaüzenet):
SELECT public.recompute_voter_eligibility(id)
FROM public.congregations WHERE name ILIKE '%Teszt%' LIMIT 1;

-- 3) Éles gyülekezetenkénti jogosult-számok a futtatás után (a lelkész a
--    „Jogosultság frissítése" gombbal is futtathatja gyülekezetenként):
SELECT congregation_id,
       count(*) FILTER (WHERE voter_eligible) AS jogosult,
       count(*) AS osszes_lathato
FROM public.szemely
WHERE isvisible = true AND meghalt = false
GROUP BY 1 ORDER BY 2 DESC;
