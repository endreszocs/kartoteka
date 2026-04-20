-- ══════════════════════════════════════════════════════════════════
-- 2026-04-20 — Wizard + onboarding schema
-- ──────────────────────────────────────────────────────────────────
-- CÉL:
--  1) profiles: új oszlopok a walkthrough / onboarding követésére
--  2) wizard_progress: új tábla a lépésenkénti perzisztens mentéshez
--  3) dioceses: seed az Erdélyi Református Egyházkerület 15 egyházmegyéjével
--     (conditional — csak ha az adott név még nincs benne)
--
-- BIZTONSÁG:
--  - Minden CREATE / ADD idempotens (IF NOT EXISTS)
--  - Meglévő sorokat NEM érint
--  - A dioceses seed conditional — többszöri futtatás sem duplikál
--  - GRANT + RLS (3-rétegű szabály — ld. RLS 3 réteg jegyzet)
--
-- FORRÁS:
--  - Terv: wizard lépésenkénti mentés + interaktív onboarding (user kérés 2026-04-20)
--  - Obsidian napló: 2026-04-20 — Onboarding A fázis
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- 1) PROFILES — walkthrough / onboarding flag-ek
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS walkthrough_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walkthrough_skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.walkthrough_completed IS
  'Ha true, a lelkész végigcsinálta vagy explicit kihagyta az interaktív walkthrough-t.';
COMMENT ON COLUMN public.profiles.walkthrough_skipped_at IS
  'A walkthrough explicit kihagyásának időpontja (ha történt).';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'A wizard végső commit-jának időpontja (completeWizard() sikeres lefutás).';

-- ───────────────────────────────────────────────────────────────────
-- 2) WIZARD_PROGRESS — lépésenkénti állapot-perzisztencia
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wizard_progress (
  user_id uuid NOT NULL,
  current_step smallint NOT NULL DEFAULT 1,
  completed_steps smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wizard_progress_pkey PRIMARY KEY (user_id),
  CONSTRAINT wizard_progress_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT wizard_progress_current_step_chk
    CHECK (current_step BETWEEN 1 AND 5)
);

COMMENT ON TABLE public.wizard_progress IS
  'Onboarding wizard lépésenkénti állapota. Kilépés után innen folytatódik a folyamat.';
COMMENT ON COLUMN public.wizard_progress.current_step IS
  'Az éppen futó lépés (1-5). A kliens ide-ra lép, amikor újra megnyitja a wizardot.';
COMMENT ON COLUMN public.wizard_progress.completed_steps IS
  'Már sikeresen mentett lépések száma-listája (pl. {1,2,3}).';
COMMENT ON COLUMN public.wizard_progress.data IS
  'Lépésenkénti form-adatok JSON-ban. Szerkezet: { "congregation": {...}, "pastor": {...}, "finance": {...} }';
COMMENT ON COLUMN public.wizard_progress.completed_at IS
  'A teljes wizard sikeres commit időpontja. NULL = még nem kész.';

-- GRANT (nélküle 42501 — PostgreSQL 3-rétegű szabály)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wizard_progress TO authenticated;

-- RLS
ALTER TABLE public.wizard_progress ENABLE ROW LEVEL SECURITY;

-- Saját state olvasása
DROP POLICY IF EXISTS wizard_progress_select_own ON public.wizard_progress;
CREATE POLICY wizard_progress_select_own
  ON public.wizard_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Saját state beillesztése
DROP POLICY IF EXISTS wizard_progress_insert_own ON public.wizard_progress;
CREATE POLICY wizard_progress_insert_own
  ON public.wizard_progress FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Saját state módosítása
DROP POLICY IF EXISTS wizard_progress_update_own ON public.wizard_progress;
CREATE POLICY wizard_progress_update_own
  ON public.wizard_progress FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Saját state törlése (pl. újrakezdésre a lelkész)
DROP POLICY IF EXISTS wizard_progress_delete_own ON public.wizard_progress;
CREATE POLICY wizard_progress_delete_own
  ON public.wizard_progress FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admin / Master Admin betekintés (audit + support)
DROP POLICY IF EXISTS wizard_progress_select_admin ON public.wizard_progress;
CREATE POLICY wizard_progress_select_admin
  ON public.wizard_progress FOR SELECT
  TO authenticated
  USING (public.current_user_has_global_access());

-- updated_at auto-maintenance trigger
CREATE OR REPLACE FUNCTION public.wizard_progress_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wizard_progress_touch_updated_at_trg ON public.wizard_progress;
CREATE TRIGGER wizard_progress_touch_updated_at_trg
  BEFORE UPDATE ON public.wizard_progress
  FOR EACH ROW EXECUTE FUNCTION public.wizard_progress_touch_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- 3) DIOCESES — Erdélyi Református Egyházkerület 15 egyházmegye
-- ───────────────────────────────────────────────────────────────────
-- Forrás: EREK hivatalos lista (2026). A district_id-t az EREK kerület
-- UUID-jára állítjuk, ha megtaláljuk — különben NULL, a Master Admin
-- utólag összekötheti a Admin panelen.
-- Conditional INSERT — többszöri futtatás is biztonságos.

DO $$
DECLARE
  erek_district_id uuid;
  d_name text;
  diocese_names text[] := ARRAY[
    'Brassói Református Egyházmegye',
    'Dési Református Egyházmegye',
    'Erdővidéki Református Egyházmegye',
    'Görgényi Református Egyházmegye',
    'Hunyad-Zarándi Református Egyházmegye',
    'Kalotaszegi Református Egyházmegye',
    'Kézdi-Orbai Református Egyházmegye',
    'Kolozsvári Református Egyházmegye',
    'Küküllői Református Egyházmegye',
    'Maros-Mezőségi Református Egyházmegye',
    'Nagyenyedi Református Egyházmegye',
    'Nagysajói Református Egyházmegye',
    'Sepsi Református Egyházmegye',
    'Székelyudvarhelyi Református Egyházmegye',
    'Tordai Református Egyházmegye'
  ];
BEGIN
  -- Erdélyi Református Egyházkerület district-jét keressük (ha már létezik)
  SELECT id INTO erek_district_id
  FROM public.districts
  WHERE name ILIKE '%Erdélyi Református Egyházkerület%'
     OR name ILIKE '%EREK%'
  LIMIT 1;

  -- Egyházmegyék conditional insert-je
  FOREACH d_name IN ARRAY diocese_names LOOP
    INSERT INTO public.dioceses (name, district_id, cim_orszag)
    SELECT d_name, erek_district_id, 'Románia'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.dioceses WHERE name = d_name
    );
  END LOOP;
END $$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- ELLENŐRZÉSEK — a feedback_sql_ellenorzes_egyben.md alapelv szerint
-- futtatható SELECT-ek, nem kommentben. Ha bármelyik nem ad várt eredményt,
-- STOP — ne menjünk tovább, amíg nincs stabil alap.
-- ══════════════════════════════════════════════════════════════════

-- [1/6] profiles új oszlopai megvannak?  Elvárás: 3 sor
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('walkthrough_completed', 'walkthrough_skipped_at', 'onboarding_completed_at')
ORDER BY column_name;

-- [2/6] wizard_progress tábla létrejött?  Elvárás: 1 sor, table_type = 'BASE TABLE'
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'wizard_progress';

-- [3/6] wizard_progress RLS enabled + policy-k megvannak?
-- Elvárás: rls_enabled = true, policy_count = 5
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*)
     FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wizard_progress') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'wizard_progress' AND n.nspname = 'public';

-- [4/6] wizard_progress GRANT az authenticated role-nak?  Elvárás: 4 sor
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'wizard_progress'
  AND grantee = 'authenticated'
ORDER BY privilege_type;

-- [5/6] dioceses tábla tartalma — van-e legalább 15 sor?
SELECT COUNT(*) AS diocese_count FROM public.dioceses;

-- [6/6] A 15 seed egyházmegye mind benne van?  Elvárás: 15 sor
SELECT name FROM public.dioceses
WHERE name IN (
  'Brassói Református Egyházmegye',
  'Dési Református Egyházmegye',
  'Erdővidéki Református Egyházmegye',
  'Görgényi Református Egyházmegye',
  'Hunyad-Zarándi Református Egyházmegye',
  'Kalotaszegi Református Egyházmegye',
  'Kézdi-Orbai Református Egyházmegye',
  'Kolozsvári Református Egyházmegye',
  'Küküllői Református Egyházmegye',
  'Maros-Mezőségi Református Egyházmegye',
  'Nagyenyedi Református Egyházmegye',
  'Nagysajói Református Egyházmegye',
  'Sepsi Református Egyházmegye',
  'Székelyudvarhelyi Református Egyházmegye',
  'Tordai Református Egyházmegye'
)
ORDER BY name;
