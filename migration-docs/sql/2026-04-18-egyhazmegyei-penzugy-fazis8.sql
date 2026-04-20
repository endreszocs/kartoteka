-- =========================================================================
-- 2026-04-18 — FÁZIS 8: Egyházmegyei pénzügy — új tábla-család + bővítések
-- =========================================================================
-- JÓVÁHAGYOTT STRATÉGIA (Endre, 2026-04-18):
--   🅱️ Új táblacsalád: diocese_bealitas, diocese_befizetes, diocese_kiadas,
--   diocese_koltsegvetes, diocese_annual_reports
--
-- ALAPELV:
--   Az egyházmegyei pénzügy FOGALMILAG különbözik a gyülekezetitől:
--     - Nincs tag-szintű járulék (nincs id_szemely/id_csalad)
--     - A "ki fizetett" vagy "ki kap" hivatkozási pontja: `congregations` tábla
--       (pl. a Barátosi gyülekezet befizeti a 101.07 Központi járulékot)
--     - Egyszerűbb workflow: kevesebb tranzakció, nincs nyugta-kronológia
--
--   → A `congregations` tábla az egyházmegye szintjén ugyanaz, mint a `szemely`
--     tábla a gyülekezet szintjén (a "ki fizetett/kap" azonosításához).
--
-- Meglévő táblák bővítése (ahol kell):
--   1. `bankszamlak`: congregation_id nullable + scope ('gyulekezet'/'egyhazmegye') + diocese_id
--   2. `chitanta_tombok`: congregation_id nullable (a scope már be van vezetve, de NOT NULL még blokkol)
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) MEGLÉVŐ TÁBLÁK BŐVÍTÉSE
-- ─────────────────────────────────────────────────────────────────────────

-- 0.1) bankszamlak — scope + diocese_id + congregation_id nullable
ALTER TABLE public.bankszamlak
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'gyulekezet',
  ADD COLUMN IF NOT EXISTS diocese_id uuid REFERENCES public.dioceses(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bankszamlak_scope_check' AND conrelid = 'public.bankszamlak'::regclass
  ) THEN
    ALTER TABLE public.bankszamlak
      ADD CONSTRAINT bankszamlak_scope_check
      CHECK (scope IN ('gyulekezet', 'egyhazmegye'));
  END IF;
END$$;

-- A congregation_id NOT NULL megszüntetése — az egyházmegyei bankszámlák
-- nem kötődnek gyülekezethez. A scope CHECK biztosítja a konzisztenciát.
ALTER TABLE public.bankszamlak
  ALTER COLUMN congregation_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bankszamlak_scope_fk_check' AND conrelid = 'public.bankszamlak'::regclass
  ) THEN
    ALTER TABLE public.bankszamlak
      ADD CONSTRAINT bankszamlak_scope_fk_check
      CHECK (
        (scope = 'gyulekezet' AND congregation_id IS NOT NULL AND diocese_id IS NULL)
        OR (scope = 'egyhazmegye' AND diocese_id IS NOT NULL)
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_bankszamlak_scope_diocese
  ON public.bankszamlak(scope, diocese_id)
  WHERE scope = 'egyhazmegye';

-- 0.2) chitanta_tombok — congregation_id nullable (a scope már meg van)
-- A 2026-04-18-egyhazmegyei-modul-fazis6.sql bevezette a scope+diocese_id-t
-- és a CHECK-et, de a congregation_id NOT NULL még blokkol.
ALTER TABLE public.chitanta_tombok
  ALTER COLUMN congregation_id DROP NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- 1) diocese_bealitas — évenkénti konfig (számadás/költségvetés állapot)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diocese_bealitas (
  id bigserial PRIMARY KEY,
  diocese_id uuid NOT NULL REFERENCES public.dioceses(id) ON DELETE CASCADE,
  eve integer NOT NULL,

  koltsegvetes_veglegesitve boolean NOT NULL DEFAULT false,
  koltsegvetes_veglegesites_datuma date,
  koltsegvetes_veglegesitette uuid,

  szamadas_veglegesitve boolean NOT NULL DEFAULT false,
  szamadas_veglegesites_datuma date,
  szamadas_veglegesitette uuid,
  szamadas_unlock_requested boolean NOT NULL DEFAULT false,
  szamadas_unlock_request_reason text,
  szamadas_unlock_request_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(diocese_id, eve)
);

CREATE INDEX IF NOT EXISTS idx_diocese_bealitas_diocese_eve
  ON public.diocese_bealitas(diocese_id, eve);

COMMENT ON TABLE public.diocese_bealitas IS
  'Egyházmegyei éves konfig — költségvetés és számadás véglegesítési állapota.';


-- ─────────────────────────────────────────────────────────────────────────
-- 2) diocese_befizetes — egyházmegyei bevétel
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diocese_befizetes (
  id bigserial PRIMARY KEY,
  diocese_id uuid NOT NULL REFERENCES public.dioceses(id) ON DELETE CASCADE,

  datum date NOT NULL,
  osszeg numeric(14, 2) NOT NULL,
  osszeg_ron numeric(14, 2),  -- valutás bevételnél a RON ekvivalens
  arfolyam numeric(10, 4),

  -- Kategória (szamadasicel-ből)
  id_szamadasicel text NOT NULL REFERENCES public.szamadasicel(id),

  -- Ki fizette: vagy egy gyülekezet (congregation_id), vagy szabad szöveg (forrasa)
  forrasa text NOT NULL,  -- pl. "Barátosi Református Egyházközség", "Állami támogatás"
  befizeto_congregation_id uuid REFERENCES public.congregations(id) ON DELETE SET NULL,

  -- Dokumentum
  iratszam text NOT NULL,
  nyugta text NOT NULL,
  irattipus text NOT NULL DEFAULT 'készpénz' CHECK (irattipus IN ('készpénz', 'banki', 'számla')),
  bankszamla_id integer REFERENCES public.bankszamlak(id) ON DELETE SET NULL,

  megjegyzes text,
  fizetettev integer,
  xkey text NOT NULL,
  userid uuid,

  deleted boolean NOT NULL DEFAULT false,
  stornozott boolean NOT NULL DEFAULT false,
  stornozott_at timestamptz,
  stornozott_by uuid,
  stornozott_indok text,

  -- Gyülekezeti transzfer nyomkövetés: ha a bevétel egy gyülekezeti
  -- `befizetes` rekordból származik (auto-szinkron 101.07/101.08), akkor itt
  -- a forrás-sor azonosítója és az xkey — így NEM lehet duplikálni
  source_befizetes_id integer REFERENCES public.befizetes(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diocese_befizetes_diocese_datum
  ON public.diocese_befizetes(diocese_id, datum DESC);

CREATE INDEX IF NOT EXISTS idx_diocese_befizetes_befizeto_congregation
  ON public.diocese_befizetes(befizeto_congregation_id)
  WHERE befizeto_congregation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diocese_befizetes_source_befizetes
  ON public.diocese_befizetes(source_befizetes_id)
  WHERE source_befizetes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diocese_befizetes_ev
  ON public.diocese_befizetes(diocese_id, fizetettev);

COMMENT ON TABLE public.diocese_befizetes IS
  'Egyházmegyei bevétel. A befizeto_congregation_id opcionális (ha egy gyülekezettől jön, pl. 101.07 Központi járulék).';


-- ─────────────────────────────────────────────────────────────────────────
-- 3) diocese_kiadas — egyházmegyei kiadás
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diocese_kiadas (
  id bigserial PRIMARY KEY,
  diocese_id uuid NOT NULL REFERENCES public.dioceses(id) ON DELETE CASCADE,

  datum date NOT NULL,
  osszeg numeric(14, 2) NOT NULL,
  osszeg_ron numeric(14, 2),
  arfolyam numeric(10, 4),

  id_szamadasicel text NOT NULL REFERENCES public.szamadasicel(id),

  -- Kinek fizetett: kedvezményezett szöveges + opcionális congregation_id
  kedvezmenyezett text NOT NULL,
  kedvezmenyezett_cui text,
  kedvezmenyezett_congregation_id uuid REFERENCES public.congregations(id) ON DELETE SET NULL,

  iratszam text NOT NULL,
  nyugta text NOT NULL,
  irattipus text NOT NULL DEFAULT 'készpénz' CHECK (irattipus IN ('készpénz', 'banki', 'számla')),
  bankszamla_id integer REFERENCES public.bankszamlak(id) ON DELETE SET NULL,

  megjegyzes text,
  xkey text NOT NULL,
  userid uuid,

  deleted boolean NOT NULL DEFAULT false,
  stornozott boolean NOT NULL DEFAULT false,
  stornozott_at timestamptz,
  stornozott_by uuid,
  stornozott_indok text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diocese_kiadas_diocese_datum
  ON public.diocese_kiadas(diocese_id, datum DESC);

CREATE INDEX IF NOT EXISTS idx_diocese_kiadas_kedvezmenyezett_congregation
  ON public.diocese_kiadas(kedvezmenyezett_congregation_id)
  WHERE kedvezmenyezett_congregation_id IS NOT NULL;

COMMENT ON TABLE public.diocese_kiadas IS
  'Egyházmegyei kiadás. A kedvezmenyezett_congregation_id opcionális (ha egy gyülekezetnek fizet, pl. 206.05).';


-- ─────────────────────────────────────────────────────────────────────────
-- 4) diocese_koltsegvetes — éves tervezés
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diocese_koltsegvetes (
  diocese_id uuid NOT NULL REFERENCES public.dioceses(id) ON DELETE CASCADE,
  eve integer NOT NULL,
  szamadasicelid text NOT NULL REFERENCES public.szamadasicel(id),

  tervezett numeric(14, 2) NOT NULL DEFAULT 0,
  osszeg_mod_1 numeric(14, 2) DEFAULT 0,
  osszeg_mod_2 numeric(14, 2) DEFAULT 0,
  osszeg_mod_3 numeric(14, 2) DEFAULT 0,

  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (diocese_id, eve, szamadasicelid)
);

CREATE INDEX IF NOT EXISTS idx_diocese_koltsegvetes_diocese_eve
  ON public.diocese_koltsegvetes(diocese_id, eve);

COMMENT ON TABLE public.diocese_koltsegvetes IS
  'Egyházmegyei éves költségvetés — szamadasicel-enkénti tervezett összegek + módosítások.';


-- ─────────────────────────────────────────────────────────────────────────
-- 5) diocese_annual_reports — egyházmegyei számadás snapshot
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diocese_annual_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diocese_id uuid NOT NULL REFERENCES public.dioceses(id) ON DELETE CASCADE,
  year integer NOT NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'received', 'reviewed', 'finalized')),

  -- A számadás aggregált snapshot-ja (income, expense, balance, jkv szám, stb.)
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Workflow metadata
  submitted_at timestamptz,
  submitted_by uuid,
  received_at timestamptz,
  received_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_notes text,
  finalized_at timestamptz,
  finalized_by uuid,
  /** Ha az egyházkerülethez továbbküldve */
  forwarded_to_kerulet boolean NOT NULL DEFAULT false,
  forwarded_at timestamptz,

  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(diocese_id, year)
);

CREATE INDEX IF NOT EXISTS idx_diocese_annual_reports_diocese_year
  ON public.diocese_annual_reports(diocese_id, year);

CREATE INDEX IF NOT EXISTS idx_diocese_annual_reports_status
  ON public.diocese_annual_reports(status)
  WHERE status != 'finalized';

COMMENT ON TABLE public.diocese_annual_reports IS
  'Egyházmegyei éves számadás snapshot (analog az annual_reports táblával, de egyházmegyei szinten).';


-- ─────────────────────────────────────────────────────────────────────────
-- 6) updated_at triggerek
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_update_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_diocese_bealitas_updated ON public.diocese_bealitas;
CREATE TRIGGER tg_diocese_bealitas_updated BEFORE UPDATE ON public.diocese_bealitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

DROP TRIGGER IF EXISTS tg_diocese_befizetes_updated ON public.diocese_befizetes;
CREATE TRIGGER tg_diocese_befizetes_updated BEFORE UPDATE ON public.diocese_befizetes
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

DROP TRIGGER IF EXISTS tg_diocese_kiadas_updated ON public.diocese_kiadas;
CREATE TRIGGER tg_diocese_kiadas_updated BEFORE UPDATE ON public.diocese_kiadas
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

DROP TRIGGER IF EXISTS tg_diocese_koltsegvetes_updated ON public.diocese_koltsegvetes;
CREATE TRIGGER tg_diocese_koltsegvetes_updated BEFORE UPDATE ON public.diocese_koltsegvetes
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

DROP TRIGGER IF EXISTS tg_diocese_annual_reports_updated ON public.diocese_annual_reports;
CREATE TRIGGER tg_diocese_annual_reports_updated BEFORE UPDATE ON public.diocese_annual_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();


-- ─────────────────────────────────────────────────────────────────────────
-- 7) RLS a diocese_* táblákhoz
-- ─────────────────────────────────────────────────────────────────────────
-- Minden táblán: csak az adott egyházmegye esperes-e / egyházmegyei admin-ja,
-- a kerületi admin a saját kerülete alá tartozót, vagy a globális admin.

ALTER TABLE public.diocese_bealitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diocese_befizetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diocese_kiadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diocese_koltsegvetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diocese_annual_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diocese_bealitas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diocese_befizetes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diocese_kiadas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diocese_koltsegvetes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diocese_annual_reports TO authenticated;
GRANT USAGE ON SEQUENCE public.diocese_bealitas_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.diocese_befizetes_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.diocese_kiadas_id_seq TO authenticated;

-- Közös policy-függvény mintája: egy esperes / egyházmegyei admin / kerületi
-- admin / globális admin ellenőrzés a `diocese_id`-ra.
-- Az admin kivétel a `dioceses_update_by_esperes` policy-ban már bevált mintát követi.

-- Minden táblán ugyanaz a policy-szerkezet — tömörítve egy makró-szerű PL/pgSQL-lel
-- nem lehet ismétlés nélkül megoldani, ezért táblánként írjuk ki.

-- diocese_bealitas
DROP POLICY IF EXISTS "diocese_bealitas_all" ON public.diocese_bealitas;
CREATE POLICY "diocese_bealitas_all" ON public.diocese_bealitas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_bealitas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_bealitas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_bealitas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_bealitas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_bealitas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_bealitas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- diocese_befizetes
DROP POLICY IF EXISTS "diocese_befizetes_all" ON public.diocese_befizetes;
CREATE POLICY "diocese_befizetes_all" ON public.diocese_befizetes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_befizetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_befizetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_befizetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_befizetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_befizetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_befizetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- diocese_kiadas
DROP POLICY IF EXISTS "diocese_kiadas_all" ON public.diocese_kiadas;
CREATE POLICY "diocese_kiadas_all" ON public.diocese_kiadas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_kiadas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_kiadas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_kiadas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_kiadas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_kiadas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_kiadas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- diocese_koltsegvetes
DROP POLICY IF EXISTS "diocese_koltsegvetes_all" ON public.diocese_koltsegvetes;
CREATE POLICY "diocese_koltsegvetes_all" ON public.diocese_koltsegvetes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_koltsegvetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_koltsegvetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_koltsegvetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_koltsegvetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_koltsegvetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_koltsegvetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- diocese_annual_reports
DROP POLICY IF EXISTS "diocese_annual_reports_all" ON public.diocese_annual_reports;
CREATE POLICY "diocese_annual_reports_all" ON public.diocese_annual_reports
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_annual_reports.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_annual_reports.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_annual_reports.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role IN ('admin', 'egyhazkeruleti_admin'))
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_annual_reports.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_annual_reports.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_annual_reports.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));


-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

-- a) Táblák és sor-számuk
SELECT
  'diocese_bealitas' AS tabla, COUNT(*) AS sorok FROM public.diocese_bealitas
UNION ALL SELECT 'diocese_befizetes', COUNT(*) FROM public.diocese_befizetes
UNION ALL SELECT 'diocese_kiadas', COUNT(*) FROM public.diocese_kiadas
UNION ALL SELECT 'diocese_koltsegvetes', COUNT(*) FROM public.diocese_koltsegvetes
UNION ALL SELECT 'diocese_annual_reports', COUNT(*) FROM public.diocese_annual_reports;

-- b) bankszamlak bővítés
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bankszamlak'
  AND column_name IN ('scope', 'diocese_id', 'congregation_id')
ORDER BY column_name;

-- c) chitanta_tombok congregation_id most már nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'chitanta_tombok'
  AND column_name = 'congregation_id';

-- d) RLS policy-k
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'diocese_%'
ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) PostgREST schema cache reload (KÖTELEZŐ új táblák után)
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
