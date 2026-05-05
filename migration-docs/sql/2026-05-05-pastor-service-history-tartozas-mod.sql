-- ============================================================================
-- 2026-05-05 — Welcome wizard kibővítés
--   1) pastor_service_history új tábla — szolgálati előzmények multi-row tárolása
--   2) congregations.tartozas_szamitas_mod oszlop — járulék-tartozás számítási módja
--   3) RLS, GRANT-ek, indexek
--
-- Futtatás: Supabase SQL Editor (Endre).
--
-- A wizard Step 3-ban a "Korábbi szolgálati helyek" kártya-lista ide ír.
-- A Step 4-ben a "Tartozás-számítási mód" radio gomb ezt a mezőt állítja.
-- ============================================================================

-- ─── 1. pastor_service_history tábla ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pastor_service_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hely text NOT NULL,                  -- gyülekezet/város/intézmény neve (kötelező)
  szerep text,                          -- pl. "lelkipásztor", "segédlelkész", "káplán"
  ev_tol integer,                       -- kezdő év (opcionális — múlt évek lehet hiányos)
  ev_ig integer,                        -- záró év (NULL = jelenleg ott szolgál)
  megjegyzes text,                      -- opcionális szabad-szöveg
  sorrend integer DEFAULT 0,            -- megjelenítési sorrend (frontendből)
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pastor_service_history_pkey PRIMARY KEY (id),
  CONSTRAINT pastor_service_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pastor_service_history_year_check
    CHECK (
      ev_tol IS NULL OR (ev_tol >= 1900 AND ev_tol <= 2100)
    ),
  CONSTRAINT pastor_service_history_year_range_check
    CHECK (
      ev_ig IS NULL OR ev_tol IS NULL OR ev_ig >= ev_tol
    )
);

CREATE INDEX IF NOT EXISTS pastor_service_history_user_idx
  ON public.pastor_service_history (user_id, sorrend);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.pastor_service_history_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pastor_service_history_touch_updated_at_trg
  ON public.pastor_service_history;
CREATE TRIGGER pastor_service_history_touch_updated_at_trg
  BEFORE UPDATE ON public.pastor_service_history
  FOR EACH ROW EXECUTE FUNCTION public.pastor_service_history_touch_updated_at();

-- RLS
ALTER TABLE public.pastor_service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_history_select_own" ON public.pastor_service_history;
CREATE POLICY "service_history_select_own"
  ON public.pastor_service_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service_history_insert_own" ON public.pastor_service_history;
CREATE POLICY "service_history_insert_own"
  ON public.pastor_service_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_history_update_own" ON public.pastor_service_history;
CREATE POLICY "service_history_update_own"
  ON public.pastor_service_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_history_delete_own" ON public.pastor_service_history;
CREATE POLICY "service_history_delete_own"
  ON public.pastor_service_history FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admin SELECT (master + admin + egyhazkeruleti_admin)
DROP POLICY IF EXISTS "service_history_admin_select" ON public.pastor_service_history;
CREATE POLICY "service_history_admin_select"
  ON public.pastor_service_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('master', 'admin', 'egyhazkeruleti_admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pastor_service_history TO authenticated;

COMMENT ON TABLE public.pastor_service_history IS
  '2026-05-05: lelkészi szolgálati előzmények multi-row tárolása (welcome wizard Step 3 + lelkészi profil oldal). user_id-re RLS-védett. ev_ig NULL = jelenleg ott szolgál.';


-- ─── 2. congregations.tartozas_szamitas_mod oszlop ────────────────────────

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS tartozas_szamitas_mod text
    NOT NULL DEFAULT 'akkori'::text
    CHECK (tartozas_szamitas_mod = ANY (ARRAY['akkori'::text, 'aktualis'::text]));

COMMENT ON COLUMN public.congregations.tartozas_szamitas_mod IS
  '2026-05-05: tartozás-számítási mód. ''akkori'' = az X év járuléka az X év beállításaiból; ''aktualis'' = az X év járuléka az aktuális év beállításaiból. A welcome wizard Step 4-ben állítható.';


-- ─── ELLENŐRZÉS (futtatható SELECT-ek) ──────────────────────────────────────

-- 1) pastor_service_history tábla létrejött + RLS engedélyezve
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  count(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = 'pastor_service_history'
GROUP BY c.relname, c.relrowsecurity;
-- Várt: rls_enabled = true, policy_count = 5

-- 2) congregations.tartozas_szamitas_mod oszlop hozzáadva
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'congregations'
  AND column_name = 'tartozas_szamitas_mod';
-- Várt: 1 sor, default 'akkori'::text, NOT NULL

-- 3) check constraint érvényesül
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'congregations'
  AND con.conname LIKE '%tartozas%';
-- Várt: 1 sor a CHECK ((tartozas_szamitas_mod = ANY (ARRAY['akkori'::text, 'aktualis'::text]))) constraint-tel
