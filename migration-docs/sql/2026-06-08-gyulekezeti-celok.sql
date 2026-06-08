-- ============================================================================
-- 2026-06-08 — Gyülekezeti célok (gyulekezeti_celok)
-- ----------------------------------------------------------------------------
-- Az Éves beszámoló prezentációhoz: a lelkész évenként, pillérenként
-- rögzítheti a JÖVŐBELI CÉLOKAT (szöveges cél + opcionális számszerű célérték),
-- amit a rendszer a TÉNYADATTAL összevet ("cél vs. tény").
--
-- Pillérek: 1 = Lélekszámbeli, 2 = Lelki, 3 = Anyagi.
-- metrika (opcionális, a tényadat automatikus kiszámításához):
--   1: 'lelekszam' | 'csaladszam' | 'keresztelo'
--   2: 'latogatottsag' (átlagjelenlét) | 'alkalmak'
--   3: 'bevetel' | 'adomany_arany' (%) | 'egyhazfenntartas' (%)
-- Ha a metrika NULL, a cél tisztán szöveges.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: current_user_congregation_id() és current_user_has_global_access()
-- helperek már léteznek (2026-04-12 phase-0 RLS hardening).
-- ============================================================================

BEGIN;

-- ── 1. Tábla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gyulekezeti_celok (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  ev              integer NOT NULL,
  piller          integer NOT NULL CHECK (piller BETWEEN 1 AND 3),
  metrika         text,
  celertek        numeric,
  szoveg          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_celok_cong_ev ON public.gyulekezeti_celok(congregation_id, ev);

COMMENT ON TABLE public.gyulekezeti_celok IS
  'Gyülekezeti jövőbeli célok évenként/pillérenként az éves beszámolóhoz (cél vs. tény). 2026-06-08.';

-- ── 2. RLS — a gyülekezet tagjai a saját gyülekezetük céljait kezelhetik ──────
ALTER TABLE public.gyulekezeti_celok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS celok_select ON public.gyulekezeti_celok;
CREATE POLICY celok_select ON public.gyulekezeti_celok
  FOR SELECT TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

DROP POLICY IF EXISTS celok_insert ON public.gyulekezeti_celok;
CREATE POLICY celok_insert ON public.gyulekezeti_celok
  FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

DROP POLICY IF EXISTS celok_update ON public.gyulekezeti_celok;
CREATE POLICY celok_update ON public.gyulekezeti_celok
  FOR UPDATE TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

DROP POLICY IF EXISTS celok_delete ON public.gyulekezeti_celok;
CREATE POLICY celok_delete ON public.gyulekezeti_celok
  FOR DELETE TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT congregation_id, ev, piller, metrika, celertek, szoveg
--   FROM public.gyulekezeti_celok ORDER BY congregation_id, ev, piller;
