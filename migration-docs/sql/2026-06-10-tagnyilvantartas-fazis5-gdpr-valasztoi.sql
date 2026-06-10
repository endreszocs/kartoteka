-- ════════════════════════════════════════════════════════════════════════════
-- 2026-06-10 — TAGNYILVÁNTARTÁS FÁZIS 5: GDPR-hozzájárulások + választói automatika
-- Forrás: docs/project-tracking/KARTOTEKA-tagnyilvantartas-atvilagitas-2026-06-10.md
--         (P3-5 GDPR-mezők, P3-7 voter_eligible automatizálás)
--
-- Tartalom:
--   1. szemely GDPR-hozzájárulási mezők (adatkezelés / fotó / levelezés)        (P3-5)
--   2. szemely.voter_manual_override — kézi választói felülbírálás               (P3-7)
--   3. recompute_voter_eligibility(uuid) RPC — szabály-alapú névjegyzék-frissítés (P3-7)
--
-- Idempotens (IF NOT EXISTS / CREATE OR REPLACE), BEGIN/COMMIT.
-- A 2026-06-10-es webapp-kód (consent mezők, választói újraszámítás) ezt igényli,
-- de a kód a migráció nélkül is hibatűrő (a mezők egyszerűen nem jelennek meg).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. GDPR-HOZZÁJÁRULÁSI MEZŐK (P3-5)
--    A vallási hovatartozás GDPR Art. 9 különleges adat; a fotó és a levelezési
--    hozzájárulás külön jogalapot igényel. Ezek a mezők teszik dokumentálhatóvá.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS gdpr_consent_at timestamptz,           -- adatkezelési hozzájárulás kelte
  ADD COLUMN IF NOT EXISTS photo_consent boolean NOT NULL DEFAULT false,   -- fotó/megjelenés hozzájárulás
  ADD COLUMN IF NOT EXISTS mailing_consent boolean NOT NULL DEFAULT false; -- levelezés/hírlevél hozzájárulás

-- ────────────────────────────────────────────────────────────────────────────
-- 2. VÁLASZTÓI JOGOSULTSÁG — KÉZI FELÜLBÍRÁLÁS (P3-7)
--    NULL = automatikus (a szabály dönt), 1 = mindig jogosult, 0 = mindig kizárt.
--    A lelkész így kezelheti az élethelyzeti kivételeket (pl. fegyelmi kizárás,
--    vagy külön engedéllyel jogosult, aki a szabály szerint nem lenne az).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS voter_manual_override smallint;

DO $$ BEGIN
  ALTER TABLE public.szemely
    ADD CONSTRAINT szemely_voter_override_chk CHECK (voter_manual_override IN (0, 1));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RECOMPUTE_VOTER_ELIGIBILITY — szabály-alapú névjegyzék-frissítés (P3-7)
--
--    Választói jogosultság szabálya (a kézi felülbírálás hiányában):
--      • él (meghalt = false) ÉS látható (isvisible = true)
--      • nem költözött el / nem tért ki / nem törölt (member_status + elkoltozott)
--      • 18. életévét betöltötte (sz_datum <= ma - 18 év)
--      • konfirmált (van konfirmalas-rekordja a gyülekezetben)
--    A `voter_manual_override` felülírja a szabályt (1 = jogosult, 0 = kizárt).
--    Beállítja a `szemely.voter_eligible` flag-et, és visszaadja az összesítőt:
--    { eligible, total, added, removed }.
-- ────────────────────────────────────────────────────────────────────────────

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
          AND s.elkoltozott IS NOT TRUE
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

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. DIAGNOSZTIKA (COMMIT után, read-only)
-- ────────────────────────────────────────────────────────────────────────────

-- Új oszlopok jelen vannak?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'szemely'
  AND column_name IN ('gdpr_consent_at', 'photo_consent', 'mailing_consent', 'voter_manual_override')
ORDER BY column_name;

-- RPC létrejött?
SELECT proname FROM pg_proc WHERE proname = 'recompute_voter_eligibility';
