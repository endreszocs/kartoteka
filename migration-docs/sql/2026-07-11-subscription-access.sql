-- ─────────────────────────────────────────────────────────────────────────
-- 2026-07-11 — Előfizetés-hozzáférés + speciális felár + audit
-- ─────────────────────────────────────────────────────────────────────────
-- A congregation_subscriptions bővítése a funkció-gating (előfizetés-alapú
-- hozzáférés-vezérlés) és a személyre szabott előfizetés-kezelés támogatásához.
--
-- BIZTONSÁGOS DEFAULT: az access_status DEFAULT 'active' — a meglévő
-- előfizetések és a rekord nélküli gyülekezetek NEM záródnak ki. A gating
-- CSAK explicit 'suspended' státuszra blokkol (lásd lib/auth/subscription-access.ts).
--
-- Idempotens: minden ADD COLUMN IF NOT EXISTS. Nem-destruktív.
-- ─────────────────────────────────────────────────────────────────────────

-- Hozzáférés-státusz: a HOZZÁFÉRÉST vezérli, függetlenül a `tipus` árazás-típustól.
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active';

-- CHECK constraint idempotensen (DO-blokk, mert az ADD CONSTRAINT nem IF NOT EXISTS)
DO $$ BEGIN
  ALTER TABLE public.congregation_subscriptions
    ADD CONSTRAINT congregation_subscriptions_access_status_check
    CHECK (access_status IN ('active', 'trial', 'free', 'suspended', 'grace'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Teszt időszak és türelmi idő (tájékoztató; az admin dönt a tényleges suspendről)
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at date;
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS grace_until date;

-- Speciális igény felára (havi, RON) + leírás
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS felar_ron numeric;
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS felar_leiras text;

-- Leállítás-audit
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS suspended_by uuid;
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS suspend_reason text;
ALTER TABLE public.congregation_subscriptions
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Gyors keresés a gyülekezet + státusz szerint (gating hot-path)
CREATE INDEX IF NOT EXISTS idx_congregation_subscriptions_cong_status
  ON public.congregation_subscriptions (congregation_id, access_status)
  WHERE aktiv = true;

-- Ellenőrzés
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'congregation_subscriptions' ORDER BY ordinal_position;
