-- ==========================================================================
-- 2026-05-17 — Iktató sorszám pointer + atomic RPC (P3-5 race-fix)
-- ==========================================================================
-- DIAGNOSTICS P3-5
--
-- PROBLÉMA:
--   A `apps/web/app/(dashboard)/iktato/actions.ts:47` getNextSequenceNumber()
--   két lépésben dolgozott (SELECT MAX + INSERT). Két párhuzamos saveFilingEntry
--   hívás (pl. double-click vagy két lap egyszerre) ugyanazt a sorszámot
--   kaphatta — üzleti integritási kockázat (iktato-szám duplikátum).
--
--   A séma globális sequence-t (iktato_sequence_number_seq) használ default-ban,
--   de a kód per-(congregation_id, year) sorszámot számít manuálisan. Nincs
--   UNIQUE constraint a (cong, year, sequence_number) tripletre, ami DB-szinten
--   védené.
--
-- MEGOLDÁS:
--   1. Új `iktato_sequence_pointers` tábla: per (cong, year) tárolja a
--      legutoljára kiadott sorszámot.
--   2. Új `next_iktato_sequence(p_cong, p_year)` SECURITY DEFINER RPC
--      atomic `INSERT ... ON CONFLICT DO UPDATE RETURNING`-gel — row-szintű
--      lock-kal sorosít a párhuzamos hívásokra.
--   3. Backfill: a meglévő iktato MAX(sequence_number)-ek per (cong, year)
--      kerülnek a pointer-táblába (a backfill után a következő RPC-hívás
--      MAX+1-ből indul).
--   4. Partial UNIQUE INDEX az `iktato`-n (csak deleted=false sorokra) —
--      DB-szintű backup-védelem. DO $$ EXCEPTION blokkban, hogy ne bukjon
--      ha vannak meglévő duplikátumok (azokat külön migrációval kell javítani).
--
-- FRONTEND:
--   apps/web/app/(dashboard)/iktato/actions.ts saveFilingEntry mostantól
--   az RPC-t hívja. A régi getNextSequenceNumber() backward-compat marad
--   (preview-céllal).
--
-- IDEMPOTENS:
--   A tábla `CREATE IF NOT EXISTS`, a backfill `ON CONFLICT DO UPDATE`,
--   az RPC `CREATE OR REPLACE`, az UNIQUE INDEX `IF NOT EXISTS`.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Pointer-tábla
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.iktato_sequence_pointers (
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (congregation_id, year)
);

COMMENT ON TABLE public.iktato_sequence_pointers IS
  'Iktató sorszám-számláló per (gyülekezet, év). A next_iktato_sequence RPC használja.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill — a meglévő iktato MAX(sequence_number)-ek per (cong, year)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.iktato_sequence_pointers (congregation_id, year, last_sequence)
SELECT congregation_id, year, MAX(sequence_number)
FROM public.iktato
WHERE deleted = false
GROUP BY congregation_id, year
ON CONFLICT (congregation_id, year) DO UPDATE
  SET last_sequence = GREATEST(
    public.iktato_sequence_pointers.last_sequence,
    EXCLUDED.last_sequence
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RPC: atomic next sequence
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_iktato_sequence(
  p_congregation_id uuid,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Auth check: a hívó user tagja kell legyen a megcélzott gyülekezetnek.
  -- (Ha nincs profil-rekord a auth.uid()-hez, vagy a congregation_id nem
  -- egyezik, hibára futunk.)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.congregation_id = p_congregation_id
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez a gyülekezethez (% / %)',
      auth.uid(), p_congregation_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Atomic INSERT ... ON CONFLICT DO UPDATE — row-szintű lock-kal sorosít.
  INSERT INTO public.iktato_sequence_pointers (congregation_id, year, last_sequence)
  VALUES (p_congregation_id, p_year, 1)
  ON CONFLICT (congregation_id, year) DO UPDATE
    SET last_sequence = public.iktato_sequence_pointers.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.next_iktato_sequence(uuid, integer) IS
  '2026-05-17 P3-5: atomic per-(cong, year) iktato sorszám. Row-lock-kal sorosít párhuzamos hívásokra.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — a pointer-táblát csak a saját gyülekezet tagjai olvashatják
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.iktato_sequence_pointers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iktato_seq_pointers_select_own
  ON public.iktato_sequence_pointers;

CREATE POLICY iktato_seq_pointers_select_own
  ON public.iktato_sequence_pointers
  FOR SELECT
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE policy NINCS — kizárólag a SECURITY DEFINER RPC írhatja.
-- A service-role bypass-olja az RLS-t (admin/migration célokra).

-- ─────────────────────────────────────────────────────────────────────────
-- 5. GRANT — az authenticated user-ek hívhatják az RPC-t
-- ─────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.next_iktato_sequence(uuid, integer) TO authenticated;
GRANT SELECT ON public.iktato_sequence_pointers TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Backup-védelem: partial UNIQUE INDEX az iktato-n
--    DO $$ blokkban — ha vannak meglévő duplikátumok, NOTICE-ot ad
--    és a tranzakció TOVÁBB folytatódik (a többi rész fontosabb).
--    A duplikátumokat egy KÜLÖN migrációban kell javítani majd.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS iktato_unique_active_cong_year_seq
    ON public.iktato (congregation_id, year, sequence_number)
    WHERE deleted = false;
  RAISE NOTICE 'iktato_unique_active_cong_year_seq UNIQUE INDEX létrehozva (vagy már létezett).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iktato_unique_active_cong_year_seq UNIQUE INDEX NEM hozható létre — vannak meglévő duplikátumok az iktato táblában. Külön migrációval kell javítani. Részletek: %', SQLERRM;
END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ
-- ─────────────────────────────────────────────────────────────────────────

-- A pointer-tábla létezik, és backfill-elt sorai vannak (annyi, ahány aktív
-- (cong, year) párosság van az iktato-ban):
SELECT 'iktato_sequence_pointers rows' AS check_item,
       COUNT(*)::text AS value
FROM public.iktato_sequence_pointers
UNION ALL
-- A SECURITY DEFINER RPC létezik:
SELECT 'next_iktato_sequence function' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public'
           AND p.proname = 'next_iktato_sequence'
           AND p.prosecdef = true
       ) THEN '✅ OK' ELSE '❌ HIÁNYZIK' END
UNION ALL
-- A search_path pin be van állítva az új RPC-re:
SELECT 'next_iktato_sequence search_path' AS check_item,
       COALESCE((
         SELECT array_to_string(p.proconfig, '; ')
         FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'next_iktato_sequence'
       ), '❌ NINCS proconfig')
UNION ALL
-- A partial UNIQUE INDEX létezik-e:
SELECT 'iktato_unique_active_cong_year_seq index' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'iktato'
           AND indexname = 'iktato_unique_active_cong_year_seq'
       ) THEN '✅ OK' ELSE '⚠️  nem hozható létre (duplikátumok?)' END;

COMMIT;
