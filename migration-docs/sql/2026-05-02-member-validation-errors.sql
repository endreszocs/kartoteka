-- ============================================================================
-- Tagnyilvántartás hibák — `member_validation_errors` tábla
-- ============================================================================
-- 2026-05-02 — Sprint U.2 (Tagnyilvántartás hibák modul, 6. pont)
--
-- Cél: a rendszer automatikusan összegyűjtse és tárolja azokat a tagokat,
-- akiknél hibás, hiányos vagy ellenőrzésre szoruló adat található. A hibák
-- súlyosság (critical / medium / warning), állapot (open / resolved /
-- ignored) szerint kategorizáltak. Naplózva az összes manuális művelet.
--
-- TÍPUSOK (a meglévő séma alapján):
--   * szemely.id          = INTEGER  (nextval-os szekvenciából)
--   * congregations.id    = UUID
--   * current_user_can_access_congregation(target_cong uuid) → BOOL
--
-- ROLLBACK: a tábla DROP-pal eltávolítható, RLS és trigger automatikusan
-- megszűnnek vele.
-- ============================================================================

-- ── 1. TÁBLA ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_validation_errors (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES public.szemely(id) ON DELETE CASCADE,
  congregation_id UUID NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,

  field_name TEXT NOT NULL,                    -- pl. 'email', 'sz_datum', 'cnp'
  error_type TEXT NOT NULL CHECK (error_type IN (
    'missing',     -- kötelező mező hiánya
    'format',      -- formátumhiba (pl. hibás email)
    'logic',       -- logikai hiba (pl. jövőbeli sz_datum)
    'duplicate'    -- duplikáció gyanú (másik szemely-rekorddal egyezik)
  )),
  error_message TEXT NOT NULL,                 -- emberi olvasható szöveg

  severity TEXT NOT NULL CHECK (severity IN ('critical', 'medium', 'warning')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),

  -- Duplikációkhoz: a feltételezett másik szemely
  duplicate_of_member_id INTEGER REFERENCES public.szemely(id) ON DELETE SET NULL,

  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ignored_at TIMESTAMPTZ,
  ignored_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ignored_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_validation_errors IS
  'Automatikusan generált tagnyilvántartási hibák/hiányosságok. A status mező értékei: open/resolved/ignored.';

-- ── 2. INDEXEK ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mve_member ON public.member_validation_errors(member_id);
CREATE INDEX IF NOT EXISTS idx_mve_congregation ON public.member_validation_errors(congregation_id);
CREATE INDEX IF NOT EXISTS idx_mve_open ON public.member_validation_errors(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_mve_severity ON public.member_validation_errors(severity, status);
CREATE INDEX IF NOT EXISTS idx_mve_field ON public.member_validation_errors(field_name, error_type);
CREATE INDEX IF NOT EXISTS idx_mve_duplicate ON public.member_validation_errors(duplicate_of_member_id)
  WHERE error_type = 'duplicate';

-- ── 3. UPDATED_AT TRIGGER ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mve_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mve_updated_at ON public.member_validation_errors;
CREATE TRIGGER trg_mve_updated_at
  BEFORE UPDATE ON public.member_validation_errors
  FOR EACH ROW EXECUTE FUNCTION public.mve_set_updated_at();

-- ── 4. ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- A `current_user_can_access_congregation(uuid)` helper a 2026-04-12-phase-0
-- migrációból érkezik (`public.current_user_can_access_congregation`).

ALTER TABLE public.member_validation_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mve_select ON public.member_validation_errors;
CREATE POLICY mve_select ON public.member_validation_errors FOR SELECT
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS mve_insert ON public.member_validation_errors;
CREATE POLICY mve_insert ON public.member_validation_errors FOR INSERT
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS mve_update ON public.member_validation_errors;
CREATE POLICY mve_update ON public.member_validation_errors FOR UPDATE
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS mve_delete ON public.member_validation_errors;
CREATE POLICY mve_delete ON public.member_validation_errors FOR DELETE
  USING (public.current_user_can_access_congregation(congregation_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_validation_errors TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.member_validation_errors_id_seq TO authenticated;

-- ── 5. SZEMÉLY-VÁLTOZÁS TRIGGER (recheck) ──────────────────────────────────
-- Ha egy szemely-rekord módosul, a hozzá tartozó nyitott hibák
-- "needs_recheck" jelzést kapnak (jelenleg ugyanúgy 'open', de updated_at
-- frissül). A háttér-job (cron) periodikusan újra-validálja az érintett
-- tagokat. Vagy a runValidation server action minden módosítás után
-- újrafutathatja az adott tagra.
--
-- Egyszerűsített megközelítés: a trigger CSAK az updated_at-et frissíti,
-- a TÉNYLEGES recheck-et a webes alkalmazás-réteg végzi (validation-engine.ts).

-- (Trigger NEM kötelező az MVP-hez — egyelőre kihagyva. A re-validation
-- a `recheckMember(memberId)` server action-en keresztül történik a
-- szemely UPDATE után.)

-- ── 6. ELLENŐRZÉS (futtatható, a migráció után visszaolvasható) ───────────

-- 6.1 — A tábla szerkezete:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'member_validation_errors'
ORDER BY ordinal_position;

-- 6.2 — RLS engedélyezve és 4 policy:
SELECT polname, polcmd::text
FROM pg_policy
WHERE polrelid = 'public.member_validation_errors'::regclass
ORDER BY polname;

-- 6.3 — Indexek:
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'member_validation_errors'
ORDER BY indexname;

-- ============================================================================
-- KÉSZ. A felhasználó (Szőcs Endre rendszergazda) futtatja a Supabase-en.
-- ============================================================================
