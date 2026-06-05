-- ============================================================================
-- 2026-06-05e — Lelkészi szolgálati napló (congregation_pastor_history)
-- ----------------------------------------------------------------------------
-- Endre kérése (1b): a gyülekezet adatai között legyen egy lista a gyülekezetben
-- szolgáló lelkészekről, PONTOS IDŐPONTOKKAL — mikor regisztrált/vette át, és
-- mikor adta át a gyülekezetet. Ez egyúttal alapja:
--   - a felhasználó-törlésnek (a történeti lista a név-pillanatképpel megmarad,
--     akkor is, ha a személyes adatot anonimizáljuk),
--   - a lelkészcsere-átadásnak (az átadás zárja a régi és nyitja az új tenure-t).
--
-- A `full_name` SNAPSHOT (pillanatkép): a törlés/anonimizálás után is megmarad a
-- történeti listában, hogy átlátható maradjon, ki mikor szolgált.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ELŐFELTÉTEL: a 2026-04-12-phase-0-rls-hardening.sql (current_user_congregation_id,
-- current_user_has_global_access) és az is_admin() helper már fut.
-- ============================================================================

BEGIN;

-- ── 1. Tábla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.congregation_pastor_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name       text NOT NULL,                 -- pillanatkép (törlés után is megmarad)
  role            text NOT NULL DEFAULT 'lelkesz',
  started_at      timestamptz NOT NULL DEFAULT now(),  -- mikor vette át / regisztrált
  ended_at        timestamptz,                   -- mikor adta át (NULL = jelenleg szolgál)
  end_reason      text,                          -- 'transfer' | 'deletion' | 'manual' | NULL
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cph_congregation ON public.congregation_pastor_history(congregation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cph_user ON public.congregation_pastor_history(user_id);
-- Egy felhasználónak egy gyülekezetben egy szerepre csak EGY nyitott tenure-je lehet
CREATE UNIQUE INDEX IF NOT EXISTS uq_cph_open_tenure
  ON public.congregation_pastor_history(congregation_id, user_id, role)
  WHERE ended_at IS NULL AND user_id IS NOT NULL;

COMMENT ON TABLE public.congregation_pastor_history IS
  'Lelkészi szolgálati napló gyülekezetenként: ki, mikortól meddig szolgált (full_name pillanatkép a törlés-utáni átláthatóságért). 2026-06-05.';

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.congregation_pastor_history ENABLE ROW LEVEL SECURITY;

-- Olvasás: a gyülekezet tagjai (saját gyülekezet) + globális hozzáférésűek (admin/esperes)
DROP POLICY IF EXISTS cph_select ON public.congregation_pastor_history;
CREATE POLICY cph_select ON public.congregation_pastor_history
  FOR SELECT TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR public.current_user_has_global_access()
  );

-- Írás CSAK a SECURITY DEFINER RPC-ken keresztül (nincs közvetlen INSERT/UPDATE policy).

-- ── 3. RPC-k ────────────────────────────────────────────────────────────────
-- Tenure nyitása (idempotens: ha már van nyitott tenure ugyanarra, nem duplázza)
CREATE OR REPLACE FUNCTION public.record_pastor_tenure_start(
  p_congregation_id uuid,
  p_user_id uuid,
  p_role text DEFAULT 'lelkesz',
  p_started_at timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  -- Csak admin (vagy maga a felhasználó a saját tenure-jére) hívhatja.
  IF NOT public.is_admin() AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Nincs jogosultság a lelkészi tenure rögzítéséhez.';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = p_user_id;
  v_name := COALESCE(NULLIF(btrim(v_name), ''), 'Ismeretlen lelkész');

  -- Van már nyitott tenure? → azt adjuk vissza (idempotens)
  SELECT id INTO v_id
  FROM public.congregation_pastor_history
  WHERE congregation_id = p_congregation_id AND user_id = p_user_id AND role = p_role
    AND ended_at IS NULL
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.congregation_pastor_history (congregation_id, user_id, full_name, role, started_at)
  VALUES (p_congregation_id, p_user_id, v_name, p_role, COALESCE(p_started_at, now()))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Tenure zárása (átadáskor/törléskor a nyitott tenure-t lezárja)
CREATE OR REPLACE FUNCTION public.record_pastor_tenure_end(
  p_congregation_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'manual',
  p_role text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Nincs jogosultság a lelkészi tenure lezárásához.';
  END IF;

  UPDATE public.congregation_pastor_history
     SET ended_at = now(), end_reason = p_reason
   WHERE congregation_id = p_congregation_id AND user_id = p_user_id
     AND ended_at IS NULL
     AND (p_role IS NULL OR role = p_role);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pastor_tenure_start(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pastor_tenure_end(uuid, uuid, text, text) TO authenticated;

-- ── 4. Backfill: a JELENLEGI aktív lelkészek nyitott tenure-je ───────────────
INSERT INTO public.congregation_pastor_history (congregation_id, user_id, full_name, role, started_at)
SELECT p.congregation_id,
       p.id,
       COALESCE(NULLIF(btrim(p.full_name), ''), 'Ismeretlen lelkész'),
       'lelkesz',
       COALESCE(p.onboarding_completed_at, p.created_at, now())
FROM public.profiles p
WHERE p.congregation_id IS NOT NULL
  AND p.role = 'lelkesz'
  AND p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.congregation_pastor_history h
    WHERE h.congregation_id = p.congregation_id AND h.user_id = p.id
      AND h.role = 'lelkesz' AND h.ended_at IS NULL
  );

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- SELECT congregation_id, full_name, started_at, ended_at, end_reason
--   FROM public.congregation_pastor_history ORDER BY congregation_id, started_at;
