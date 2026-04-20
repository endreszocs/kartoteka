-- =========================================================================
-- 2026-04-18 — Bankszámla nyitó egyenleg + valutás tranzakciók RON értéke
-- =========================================================================
-- CÉL:
--   1. Az év eleji nyitó egyenleg ÉVENKÉNTI bontásban tárolható legyen
--      (nem csak a bankszámla létrehozásakori egyszeri érték).
--      → új tábla: `bankszamla_nyito_egyenleg`
--
--   2. Valutás bankszámláknál (EUR, HUF, stb.) minden tranzakciónak legyen
--      RON ekvivalense is — a könyvelésben, számadásban, Registru-ban
--      RON-ban kell számolni.
--      → új oszlopok: `befizetes.osszeg_ron`, `befizetes.arfolyam`
--                      `kiadas.osszeg_ron`, `kiadas.arfolyam`
--
-- HÁTTÉR:
--   A BCR Excel export NEM tartalmaz nyitó egyenleget. Az összegek a
--   bankszámla valutájában vannak (pl. EUR). A lelkész manuálisan ad
--   meg év eleji nyitó értéket + árfolyamot.
--
-- Idempotens — újrafuttatható.
-- =========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) bankszamla_nyito_egyenleg — éves bontás
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bankszamla_nyito_egyenleg (
  id bigserial PRIMARY KEY,
  bankszamla_id integer NOT NULL REFERENCES public.bankszamlak(id) ON DELETE CASCADE,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  eve integer NOT NULL CHECK (eve BETWEEN 2000 AND 2100),
  /** Nyitó egyenleg a bankszámla VALUTÁJÁBAN (EUR/HUF/RON). */
  nyito_egyenleg_valuta numeric(14, 2) NOT NULL DEFAULT 0,
  /** Nyitó egyenleg RON-ban (konverzióval vagy egyenlő, ha RON számla). */
  nyito_egyenleg_ron numeric(14, 2) NOT NULL DEFAULT 0,
  /** Használt árfolyam (csak ha valutás számla). */
  arfolyam numeric(10, 4),
  /** Honnan származik: 'manual' = lelkész írta be, 'carryover' = előző év zárója, 'import' = banki Excelből. */
  forrasa text NOT NULL DEFAULT 'manual' CHECK (forrasa IN ('manual', 'import', 'carryover')),
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT bankszamla_nyito_egyenleg_unique UNIQUE (bankszamla_id, eve)
);

COMMENT ON TABLE public.bankszamla_nyito_egyenleg IS
  'Év eleji nyitó egyenleg bankszámlánként és évente. A BCR Excel nem tartalmaz nyitó egyenleget, ezért manuálisan rögzítjük.';
COMMENT ON COLUMN public.bankszamla_nyito_egyenleg.nyito_egyenleg_valuta IS
  'A bankszámla valutájában (EUR/HUF/RON). A Registru Banca fejlécbe ez kerül.';
COMMENT ON COLUMN public.bankszamla_nyito_egyenleg.nyito_egyenleg_ron IS
  'RON-ban (konverzió * árfolyam). A Registru-Jurnal és számadás mindig RON-ban számol.';

CREATE INDEX IF NOT EXISTS bankszamla_nyito_egyenleg_bankszamla_eve_idx
  ON public.bankszamla_nyito_egyenleg (bankszamla_id, eve);

CREATE INDEX IF NOT EXISTS bankszamla_nyito_egyenleg_congregation_idx
  ON public.bankszamla_nyito_egyenleg (congregation_id);

-- ─────────────────────────────────────────────────────────────
-- 2) RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bankszamla_nyito_egyenleg ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bnye_select ON public.bankszamla_nyito_egyenleg;
DROP POLICY IF EXISTS bnye_insert ON public.bankszamla_nyito_egyenleg;
DROP POLICY IF EXISTS bnye_update ON public.bankszamla_nyito_egyenleg;
DROP POLICY IF EXISTS bnye_delete ON public.bankszamla_nyito_egyenleg;

CREATE POLICY bnye_select ON public.bankszamla_nyito_egyenleg
  FOR SELECT TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND (p.role = 'admin' OR p.role = 'egyhazkeruleti_admin')
    )
  );

CREATE POLICY bnye_insert ON public.bankszamla_nyito_egyenleg
  FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
  );

CREATE POLICY bnye_update ON public.bankszamla_nyito_egyenleg
  FOR UPDATE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
  )
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
  );

CREATE POLICY bnye_delete ON public.bankszamla_nyito_egyenleg
  FOR DELETE TO authenticated
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND pr.scope = 'congregation'
        AND pr.scope_id = bankszamla_nyito_egyenleg.congregation_id
    )
  );

REVOKE ALL ON public.bankszamla_nyito_egyenleg FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankszamla_nyito_egyenleg TO authenticated;
GRANT USAGE ON SEQUENCE public.bankszamla_nyito_egyenleg_id_seq TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) befizetes + kiadas — RON ekvivalens oszlopok valutás számlákhoz
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.befizetes
  ADD COLUMN IF NOT EXISTS osszeg_ron numeric(14, 2),
  ADD COLUMN IF NOT EXISTS arfolyam numeric(10, 4);

ALTER TABLE public.kiadas
  ADD COLUMN IF NOT EXISTS osszeg_ron numeric(14, 2),
  ADD COLUMN IF NOT EXISTS arfolyam numeric(10, 4);

COMMENT ON COLUMN public.befizetes.osszeg_ron IS
  'A tranzakció értéke RON-ban. RON számla esetén = osszeg. Valutás (EUR/HUF) számla esetén osszeg × arfolyam.';
COMMENT ON COLUMN public.befizetes.arfolyam IS
  'Használt árfolyam a RON-konverzióhoz (csak valutás számlánál töltve).';
COMMENT ON COLUMN public.kiadas.osszeg_ron IS
  'A tranzakció értéke RON-ban. RON számla esetén = osszeg. Valutás (EUR/HUF) számla esetén osszeg × arfolyam.';
COMMENT ON COLUMN public.kiadas.arfolyam IS
  'Használt árfolyam a RON-konverzióhoz (csak valutás számlánál töltve).';

-- ─────────────────────────────────────────────────────────────
-- 4) Visszafelé-kompatibilitás: ha a bankszámla RON, az osszeg_ron = osszeg
--    (migrációs alapbeállítás a meglévő adatokra)
-- ─────────────────────────────────────────────────────────────
UPDATE public.befizetes b
SET osszeg_ron = b.osszeg, arfolyam = 1
WHERE b.osszeg_ron IS NULL
  AND (
    b.bankszamla_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.bankszamlak bs
      WHERE bs.id = b.bankszamla_id
        AND (bs.valuta IS NULL OR bs.valuta = 'RON')
    )
  );

UPDATE public.kiadas k
SET osszeg_ron = k.osszeg, arfolyam = 1
WHERE k.osszeg_ron IS NULL
  AND (
    k.bankszamla_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.bankszamlak bs
      WHERE bs.id = k.bankszamla_id
        AND (bs.valuta IS NULL OR bs.valuta = 'RON')
    )
  );

-- Valutás (nem-RON) bankszámla meglévő tételeinél csak az osszeg marad
-- — az árfolyamot a lelkésznek kell utólag kitölteni (az FX revaluation
-- rendszer már kezeli az év végi átértékelést, a napi tranzakciókra is kelleni
-- fog egy utóbbi tisztítás).

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

SELECT
  'bankszamla_nyito_egyenleg tábla' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bankszamla_nyito_egyenleg') AS result
UNION ALL
SELECT
  'befizetes.osszeg_ron oszlop',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='befizetes' AND column_name='osszeg_ron')
UNION ALL
SELECT
  'befizetes.arfolyam oszlop',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='befizetes' AND column_name='arfolyam')
UNION ALL
SELECT
  'kiadas.osszeg_ron oszlop',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kiadas' AND column_name='osszeg_ron')
UNION ALL
SELECT
  'kiadas.arfolyam oszlop',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kiadas' AND column_name='arfolyam')
UNION ALL
SELECT
  'bankszamla_nyito_egyenleg RLS',
  (SELECT relrowsecurity FROM pg_class WHERE relname='bankszamla_nyito_egyenleg');

-- Áttekintő: hány nyitó egyenleg rekord van, ha van
SELECT
  eve, COUNT(*) as db, SUM(nyito_egyenleg_ron) as ossz_ron
FROM public.bankszamla_nyito_egyenleg
GROUP BY eve
ORDER BY eve;
