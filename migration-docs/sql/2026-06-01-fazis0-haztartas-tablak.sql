-- ────────────────────────────────────────────────────────────────────────
-- Hibrid család-modell — Fázis 0: új táblák
-- ────────────────────────────────────────────────────────────────────────
-- Dátum: 2026-06-01
-- Felelős: Szőcs Endre + Claude
-- Cél: A KARTOTEKA-csalad-hibrid-modell-terv-2026-06-01.md alapján
--      4 új tábla létrehozása. A meglévő `csalad`, `gyerek`, `szemely`
--      táblák ÉRINTETLEN maradnak — a rendszer ugyanúgy működik tovább.
--
-- BIZTONSÁG:
--   - Csak CREATE TABLE/INDEX/POLICY parancsok (semmi DROP, ALTER nem
--     a régi táblákon)
--   - Reverzibilis: minden új tábla DROP-pal teljesen eltávolítható
--   - Nem érinti a futó alkalmazást
--
-- HOGYAN FUTTASD:
--   1. Nyisd meg a Supabase Dashboard-on a SQL Editor-t
--   2. Másold be ezt a teljes fájlt
--   3. Futtasd ("Run")
--   4. Ellenőrizd: 4 új tábla létezzen (cim, haztartas, haztartas_tag,
--      szemely_kapcsolat), és minden RLS policy aktív legyen
--
-- ROLLBACK (ha valami baj van):
--   DROP TABLE IF EXISTS public.szemely_kapcsolat CASCADE;
--   DROP TABLE IF EXISTS public.haztartas_tag CASCADE;
--   DROP TABLE IF EXISTS public.haztartas CASCADE;
--   DROP TABLE IF EXISTS public.cim CASCADE;
-- ────────────────────────────────────────────────────────────────────────

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. CIM tábla — címek (külön él, hogy költözéskor a régi cím megmaradjon)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE RESTRICT,
  id_utca integer REFERENCES public.adrstreet(id),
  szam varchar,
  tombhaz varchar,
  lepcsohaz varchar,
  emelet varchar,
  ajto varchar,
  tipus text NOT NULL DEFAULT 'otthon'
    CHECK (tipus IN ('otthon', 'ideiglenes', 'munka', 'kolozsda', 'egyeb')),
  ervenyes_tol date,
  ervenyes_ig date,
  megjegyzes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cim_congregation ON public.cim(congregation_id);
CREATE INDEX IF NOT EXISTS idx_cim_utca ON public.cim(id_utca);
CREATE INDEX IF NOT EXISTS idx_cim_ervenyes_ig ON public.cim(ervenyes_ig) WHERE ervenyes_ig IS NULL;

-- RLS (Row Level Security) — congregation-szintű izoláció
ALTER TABLE public.cim ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cim_select_congregation" ON public.cim;
CREATE POLICY "cim_select_congregation"
  ON public.cim FOR SELECT
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "cim_insert_congregation" ON public.cim;
CREATE POLICY "cim_insert_congregation"
  ON public.cim FOR INSERT
  WITH CHECK (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "cim_update_congregation" ON public.cim;
CREATE POLICY "cim_update_congregation"
  ON public.cim FOR UPDATE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "cim_delete_congregation" ON public.cim;
CREATE POLICY "cim_delete_congregation"
  ON public.cim FOR DELETE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 2. HAZTARTAS tábla — háztartás (jelenlegi lakóközösség egy címen)
--    Egy "család" itt jelenik meg az új modellben.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.haztartas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE RESTRICT,
  megnevezes text,
  id_cim uuid REFERENCES public.cim(id) ON DELETE SET NULL,
  id_csoport integer REFERENCES public.csoport(id) ON DELETE SET NULL,
  isaktiv boolean NOT NULL DEFAULT true,
  ervenyes_tol date,
  ervenyes_ig date,
  -- Fázis 1-ben backfill audit: melyik legacy csalad-ból született
  legacy_csalad_id integer REFERENCES public.csalad(id) ON DELETE SET NULL,
  megjegyzes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_haztartas_congregation ON public.haztartas(congregation_id);
CREATE INDEX IF NOT EXISTS idx_haztartas_cim ON public.haztartas(id_cim);
CREATE INDEX IF NOT EXISTS idx_haztartas_aktiv ON public.haztartas(congregation_id, isaktiv) WHERE isaktiv = true;
CREATE INDEX IF NOT EXISTS idx_haztartas_legacy ON public.haztartas(legacy_csalad_id);

ALTER TABLE public.haztartas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "haztartas_select_congregation" ON public.haztartas;
CREATE POLICY "haztartas_select_congregation"
  ON public.haztartas FOR SELECT
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "haztartas_insert_congregation" ON public.haztartas;
CREATE POLICY "haztartas_insert_congregation"
  ON public.haztartas FOR INSERT
  WITH CHECK (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "haztartas_update_congregation" ON public.haztartas;
CREATE POLICY "haztartas_update_congregation"
  ON public.haztartas FOR UPDATE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "haztartas_delete_congregation" ON public.haztartas;
CREATE POLICY "haztartas_delete_congregation"
  ON public.haztartas FOR DELETE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 3. HAZTARTAS_TAG tábla — kapcsolótábla (M:N) háztartás + személy
--    Egy ember TÖBB háztartáshoz is tartozhat egyszerre.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.haztartas_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_haztartas uuid NOT NULL REFERENCES public.haztartas(id) ON DELETE CASCADE,
  id_szemely integer NOT NULL REFERENCES public.szemely(id) ON DELETE CASCADE,
  szerep text NOT NULL
    CHECK (szerep IN ('csaladfo', 'hazastars', 'gyermek', 'mostohaszulo',
                      'gondviselo', 'unoka', 'nagyszulo', 'lakotars',
                      'alberlet', 'egyeb')),
  is_primary boolean NOT NULL DEFAULT false,
  ervenyes_tol date,
  ervenyes_ig date,
  megjegyzes text,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE RESTRICT,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0
);

-- Egy ember csak EGYSZER lehet aktív tag egy adott háztartásban (több
-- lezárt rekord lehet régen)
CREATE UNIQUE INDEX IF NOT EXISTS uq_haztartas_tag_aktiv
  ON public.haztartas_tag(id_haztartas, id_szemely)
  WHERE ervenyes_ig IS NULL;

CREATE INDEX IF NOT EXISTS idx_haztartas_tag_haztartas ON public.haztartas_tag(id_haztartas);
CREATE INDEX IF NOT EXISTS idx_haztartas_tag_szemely ON public.haztartas_tag(id_szemely);
CREATE INDEX IF NOT EXISTS idx_haztartas_tag_congregation ON public.haztartas_tag(congregation_id);

ALTER TABLE public.haztartas_tag ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "haztartas_tag_select_congregation" ON public.haztartas_tag;
CREATE POLICY "haztartas_tag_select_congregation"
  ON public.haztartas_tag FOR SELECT
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "haztartas_tag_insert_congregation" ON public.haztartas_tag;
CREATE POLICY "haztartas_tag_insert_congregation"
  ON public.haztartas_tag FOR INSERT
  WITH CHECK (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "haztartas_tag_update_congregation" ON public.haztartas_tag;
CREATE POLICY "haztartas_tag_update_congregation"
  ON public.haztartas_tag FOR UPDATE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "haztartas_tag_delete_congregation" ON public.haztartas_tag;
CREATE POLICY "haztartas_tag_delete_congregation"
  ON public.haztartas_tag FOR DELETE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 4. SZEMELY_KAPCSOLAT tábla — vér szerinti és életen át tartó rokoni
--    kötelékek. Független a háztartástól.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.szemely_kapcsolat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_szemely_1 integer NOT NULL REFERENCES public.szemely(id) ON DELETE CASCADE,
  id_szemely_2 integer NOT NULL REFERENCES public.szemely(id) ON DELETE CASCADE,
  tipus text NOT NULL
    CHECK (tipus IN ('hazastars', 'szulo_gyermek', 'testver', 'felteszver',
                     'nagyszulo_unoka', 'mostohaszulo_mostohagyermek',
                     'gondviselo', 'orokbe_fogado', 'egyeb')),
  -- 'szulo_gyermek' / 'nagyszulo_unoka' / 'mostohaszulo_mostohagyermek' /
  -- 'gondviselo' / 'orokbe_fogado' típusoknál:
  --   szemely_1 = szülő/nagyszülő/gondviselő (idősebb)
  --   szemely_2 = gyermek/unoka (fiatalabb)
  -- 'hazastars' / 'testver' / 'felteszver' szimmetrikus
  ver_szerinti boolean NOT NULL DEFAULT true,
  ervenyes_tol date,
  ervenyes_ig date,
  megjegyzes text,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE RESTRICT,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0,

  CONSTRAINT szemely_kapcsolat_no_self CHECK (id_szemely_1 <> id_szemely_2)
);

-- Egy típusú kapcsolat csak egyszer létezhet két ember között (aktívan)
CREATE UNIQUE INDEX IF NOT EXISTS uq_szemely_kapcsolat_aktiv
  ON public.szemely_kapcsolat(id_szemely_1, id_szemely_2, tipus)
  WHERE ervenyes_ig IS NULL;

CREATE INDEX IF NOT EXISTS idx_szemely_kapcsolat_1 ON public.szemely_kapcsolat(id_szemely_1, tipus);
CREATE INDEX IF NOT EXISTS idx_szemely_kapcsolat_2 ON public.szemely_kapcsolat(id_szemely_2, tipus);
CREATE INDEX IF NOT EXISTS idx_szemely_kapcsolat_congregation ON public.szemely_kapcsolat(congregation_id);

ALTER TABLE public.szemely_kapcsolat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "szemely_kapcsolat_select_congregation" ON public.szemely_kapcsolat;
CREATE POLICY "szemely_kapcsolat_select_congregation"
  ON public.szemely_kapcsolat FOR SELECT
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "szemely_kapcsolat_insert_congregation" ON public.szemely_kapcsolat;
CREATE POLICY "szemely_kapcsolat_insert_congregation"
  ON public.szemely_kapcsolat FOR INSERT
  WITH CHECK (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "szemely_kapcsolat_update_congregation" ON public.szemely_kapcsolat;
CREATE POLICY "szemely_kapcsolat_update_congregation"
  ON public.szemely_kapcsolat FOR UPDATE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

DROP POLICY IF EXISTS "szemely_kapcsolat_delete_congregation" ON public.szemely_kapcsolat;
CREATE POLICY "szemely_kapcsolat_delete_congregation"
  ON public.szemely_kapcsolat FOR DELETE
  USING (
    congregation_id = (SELECT congregation_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'egyhazkeruleti_admin', 'esperes', 'egyhazmegyei_admin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 5. Sanity check — listázzuk a frissen létrejött táblákat
-- ────────────────────────────────────────────────────────────────────────
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t.table_name) AS oszlopok,
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = t.table_name) AS rls_policies
FROM (
  VALUES ('cim'), ('haztartas'), ('haztartas_tag'), ('szemely_kapcsolat')
) AS t(table_name);

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- VÁRT EREDMÉNY:
--   ┌─────────────────────┬──────────┬──────────────┐
--   │ table_name          │ oszlopok │ rls_policies │
--   ├─────────────────────┼──────────┼──────────────┤
--   │ cim                 │       15 │            4 │
--   │ haztartas           │       13 │            4 │
--   │ haztartas_tag       │       12 │            4 │
--   │ szemely_kapcsolat   │       12 │            4 │
--   └─────────────────────┴──────────┴──────────────┘
-- ────────────────────────────────────────────────────────────────────────
