-- ═══════════════════════════════════════════════════════════════
-- E3 — Iktató sablonok modul (2026-04-15)
-- ═══════════════════════════════════════════════════════════════
--
-- Új tábla: iktato_sablonok — gyülekezeti szintű irat-sablonok
--
-- A sablonok placeholdereket tartalmazhatnak ({{nev}}, {{datum}},
-- {{iratszam}}, stb.), amik generáláskor behelyettesítődnek.
--
-- Alapértelmezett sablonok (seed): Keresztelési igazolás,
-- Konfirmációs igazolás, Esketési igazolás, Tagsági igazolás.
-- A seed-et a Next.js oldaláról lehet beállítani (admin tool).

-- ───────────────────────────────────────────────────────────────
-- 1. Tábla létrehozása
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.iktato_sablonok (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  nev             text NOT NULL,
  tipus           text NOT NULL DEFAULT 'egyeb'
    CHECK (tipus IN ('igazolas', 'level', 'hatarozat', 'meghivo', 'jegyzokonyv', 'egyeb')),
  leiras          text,
  tartalom        text NOT NULL,      -- HTML template placeholderekkel: {{nev}}, {{datum}}, stb.
  aktiv           boolean DEFAULT true,
  sorrend         integer DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  deleted         boolean DEFAULT false
);

-- ───────────────────────────────────────────────────────────────
-- 2. Indexek
-- ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_iktato_sablonok_cong
  ON public.iktato_sablonok (congregation_id)
  WHERE deleted = false AND aktiv = true;

CREATE INDEX IF NOT EXISTS idx_iktato_sablonok_tipus
  ON public.iktato_sablonok (tipus, congregation_id)
  WHERE deleted = false AND aktiv = true;

-- ───────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.iktato_sablonok_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_iktato_sablonok_updated_at ON public.iktato_sablonok;
CREATE TRIGGER trg_iktato_sablonok_updated_at
  BEFORE UPDATE ON public.iktato_sablonok
  FOR EACH ROW
  EXECUTE FUNCTION public.iktato_sablonok_set_updated_at();

-- ───────────────────────────────────────────────────────────────
-- 4. RLS — congregation szintű izoláció
-- ───────────────────────────────────────────────────────────────

ALTER TABLE public.iktato_sablonok ENABLE ROW LEVEL SECURITY;

-- SELECT: saját gyülekezet VAGY globális hozzáférésű user
DROP POLICY IF EXISTS iktato_sablonok_select ON public.iktato_sablonok;
CREATE POLICY iktato_sablonok_select ON public.iktato_sablonok
  FOR SELECT TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- INSERT: csak a saját gyülekezetre
DROP POLICY IF EXISTS iktato_sablonok_insert ON public.iktato_sablonok;
CREATE POLICY iktato_sablonok_insert ON public.iktato_sablonok
  FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- UPDATE: saját gyülekezet VAGY globális
DROP POLICY IF EXISTS iktato_sablonok_update ON public.iktato_sablonok;
CREATE POLICY iktato_sablonok_update ON public.iktato_sablonok
  FOR UPDATE TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- DELETE: soft delete-et használunk a deleted=true flaggen át (UPDATE policy kezeli),
-- de a hard DELETE csak globális access-sel:
DROP POLICY IF EXISTS iktato_sablonok_delete ON public.iktato_sablonok;
CREATE POLICY iktato_sablonok_delete ON public.iktato_sablonok
  FOR DELETE TO authenticated
  USING (current_user_has_global_access());

-- ───────────────────────────────────────────────────────────────
-- 5. Jogosultság a gen_random_uuid függvényre
-- ───────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iktato_sablonok TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Migráció vége. Futtatás után ellenőrzés:
--   SELECT * FROM pg_policies WHERE tablename = 'iktato_sablonok';
--   SELECT COUNT(*) FROM public.iktato_sablonok;   -- legyen 0 (üres tábla)
-- ═══════════════════════════════════════════════════════════════
