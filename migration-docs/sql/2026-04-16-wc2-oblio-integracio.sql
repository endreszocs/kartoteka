-- ============================================================================
-- KARTOTEKA WC-2.1 + WC-2.2 — Oblio / e-Factura integráció DB alap
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Tervdokumentum: docs/project-tracking/KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md
-- + docs/project-tracking/KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE
--
-- VÁLTOZTATÁSOK:
--
--   1. pgcrypto extension engedélyezése (api_secret titkosításhoz)
--   2. ÚJ TÁBLA: oblio_fiokok — gyülekezetenkénti Oblio API konfiguráció
--   3. ÚJ TÁBLA: oblio_szamlak — kiállított számlák (e-Factura + papír chitanță)
--   4. berleti_szerzodes bővítés: oblio_auto_szamlaz, oblio_klienesseg_id, oblio_termek_kod
--   5. GRANT authenticated-ra (fontos, lásd korábbi tanulság!)
--   6. RLS bekapcsolás + policy-k
--
-- Lásd jogi pontosítások (KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md):
--   - Bérleti ügyletek ALAPBÓL kivételek az e-Factura alól (OUG 120/2021)
--   - Ezért az oblio_szamlak.tipus oszlop két értéket vehet fel:
--     * 'e_factura' → Oblio-n át SPV-re kerül
--     * 'chitanta_papir' → helyi PDF generálás (Oblio nem érintett)

BEGIN;


-- ============================================================================
-- 1. pgcrypto extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


-- ============================================================================
-- 2. oblio_fiokok — gyülekezeti Oblio API konfiguráció
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oblio_fiokok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  api_secret_encrypted text NOT NULL,
  cif text NOT NULL,
  sorozat_default text,
  nev_default_service text DEFAULT 'Chirie spațiu',
  aktiv boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  utolso_token text,
  utolso_token_expires_at timestamp with time zone,
  utolso_teszt_at timestamp with time zone,
  utolso_teszt_ok boolean,
  utolso_teszt_hiba text,
  CONSTRAINT oblio_fiokok_pkey PRIMARY KEY (id),
  CONSTRAINT oblio_fiokok_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.oblio_fiokok IS
  $$Gyülekezetenkénti Oblio API-fiók konfiguráció. Az api_secret_encrypted pgcrypto pgp_sym_encrypt-el van titkosítva.$$;

COMMENT ON COLUMN public.oblio_fiokok.email IS
  $$Az Oblio fiók emailje (Oblio Beállítások → Account Data).$$;

COMMENT ON COLUMN public.oblio_fiokok.api_secret_encrypted IS
  $$Titkosított Oblio API secret. pgcrypto pgp_sym_encrypt formátum. Csak server-oldali Server Action olvashatja ki (pgp_sym_decrypt).$$;

COMMENT ON COLUMN public.oblio_fiokok.cif IS
  $$A gyülekezet CUI/CIF kódja (pl. 12345678 vagy RO12345678). Az Oblio ezzel azonosítja a számlát kibocsátó céget.$$;

COMMENT ON COLUMN public.oblio_fiokok.sorozat_default IS
  $$Alapértelmezett számlasorozat, pl. "KA" vagy "FAC".$$;

COMMENT ON COLUMN public.oblio_fiokok.nev_default_service IS
  $$Alapértelmezett szolgáltatás megnevezés a számlákon (románul az Oblio miatt).$$;

COMMENT ON COLUMN public.oblio_fiokok.utolso_teszt_at IS
  $$Legutóbbi kapcsolat-teszt időpontja.$$;

COMMENT ON COLUMN public.oblio_fiokok.utolso_teszt_ok IS
  $$TRUE, ha a legutóbbi teszt sikeres volt (Oblio elérhető + CIF érvényes).$$;

CREATE INDEX IF NOT EXISTS idx_oblio_fiokok_congregation
  ON public.oblio_fiokok (congregation_id) WHERE aktiv = true;


-- ============================================================================
-- 3. oblio_szamlak — kiállított számlák (e-Factura + papír chitanță)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oblio_szamlak (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  oblio_fiok_id uuid,

  -- Kapcsolat bérleti szerződéshez és a befizetéshez (ha kifizették már)
  berleti_szerzodes_id uuid,
  befizetes_id integer,

  -- Típus: e-Factura (Oblio-n át SPV-re) vagy papír chitanță (helyben generált PDF)
  tipus text NOT NULL DEFAULT 'e_factura',

  -- Számla azonosítói
  sorozat text NOT NULL,
  szam integer NOT NULL,
  szamla_datum date NOT NULL DEFAULT CURRENT_DATE,
  esedekesseg date,

  -- Bérlő adatai
  klienesseg_nev text NOT NULL,
  klienesseg_cui text,  -- CUI (cég esetén) vagy CNP (magánszemély) vagy NULL
  klienesseg_cim text,

  -- Pénzügyi összegek
  osszeg_net numeric NOT NULL,
  osszeg_tva numeric DEFAULT 0,
  osszeg_brut numeric NOT NULL,
  pénznem text DEFAULT 'RON',

  -- Oblio válaszok (csak tipus = 'e_factura' esetén)
  oblio_invoice_id text,
  pdf_url text,
  pdf_local_path text,  -- WC-8 előkészítő: lokális fájl a lelkész gépén
  e_factura_uuid text,  -- ANAF index UUID
  e_factura_status text DEFAULT 'pending',

  -- Chitanță-specifikus (tipus = 'chitanta_papir' esetén)
  chitanta_pdf_html text,  -- A generált HTML (nyomtatás + PDF export)

  e_factura_errors jsonb,
  utolso_szinkronizalas_at timestamp with time zone,

  -- Kifizetés
  collected_at timestamp with time zone,

  -- Sztornó
  stornozott boolean DEFAULT false,
  stornozott_at timestamp with time zone,
  stornozott_indok text,

  -- Metaadatok
  megjegyzes text,
  issued_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT oblio_szamlak_pkey PRIMARY KEY (id),
  CONSTRAINT oblio_szamlak_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  CONSTRAINT oblio_szamlak_oblio_fiok_id_fkey
    FOREIGN KEY (oblio_fiok_id) REFERENCES public.oblio_fiokok(id) ON DELETE SET NULL,
  CONSTRAINT oblio_szamlak_berleti_szerzodes_id_fkey
    FOREIGN KEY (berleti_szerzodes_id) REFERENCES public.berleti_szerzodes(id) ON DELETE SET NULL,
  CONSTRAINT oblio_szamlak_befizetes_id_fkey
    FOREIGN KEY (befizetes_id) REFERENCES public.befizetes(id) ON DELETE SET NULL,
  CONSTRAINT oblio_szamlak_issued_by_fkey
    FOREIGN KEY (issued_by) REFERENCES auth.users(id),
  CONSTRAINT oblio_szamlak_tipus_check CHECK (
    tipus = ANY (ARRAY['e_factura'::text, 'chitanta_papir'::text])
  ),
  CONSTRAINT oblio_szamlak_e_factura_status_check CHECK (
    e_factura_status IS NULL OR e_factura_status = ANY (
      ARRAY['pending'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'not_applicable'::text]
    )
  ),
  CONSTRAINT oblio_szamlak_sorozat_szam_unique
    UNIQUE (oblio_fiok_id, sorozat, szam)
);

COMMENT ON TABLE public.oblio_szamlak IS
  $$Kiállított számlák és chitanțák nyilvántartása. A tipus oszlop különbözteti meg, hogy Oblio-n át SPV-be ment-e (e_factura), vagy csak helyi papír chitanță (chitanta_papir, Oblio-t nem érinti).$$;

COMMENT ON COLUMN public.oblio_szamlak.tipus IS
  $$'e_factura' = Oblio-n keresztül kiállított elektronikus számla, automatikusan SPV-be kerül. 'chitanta_papir' = helyi PDF, Oblio-t nem érinti, bérleti ügyleteknél megengedett (OUG 120/2021 kivétel).$$;

COMMENT ON COLUMN public.oblio_szamlak.pdf_local_path IS
  $$Relatív útvonal a lelkész lokális szinkronizációs mappájához (WC-8). Pl. oblio-szamlak/2026/KA-00123.pdf. Ha üres, a PDF még nincs lokálisan letöltve.$$;

COMMENT ON COLUMN public.oblio_szamlak.e_factura_status IS
  $$e-Factura SPV státusz: pending (kiállítva, még nem ment ki), sent (Oblio elküldte), accepted (ANAF elfogadta), rejected (ANAF elutasította), not_applicable (chitanta_papir típus esetén).$$;

CREATE INDEX IF NOT EXISTS idx_oblio_szamlak_congregation
  ON public.oblio_szamlak (congregation_id);

CREATE INDEX IF NOT EXISTS idx_oblio_szamlak_berleti
  ON public.oblio_szamlak (berleti_szerzodes_id) WHERE stornozott = false;

CREATE INDEX IF NOT EXISTS idx_oblio_szamlak_pending_status
  ON public.oblio_szamlak (e_factura_status)
  WHERE tipus = 'e_factura' AND e_factura_status IN ('pending', 'sent');


-- ============================================================================
-- 4. berleti_szerzodes bővítés — Oblio-hoz kapcsolódó mezők
-- ============================================================================

ALTER TABLE public.berleti_szerzodes
  ADD COLUMN IF NOT EXISTS oblio_auto_szamlaz boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oblio_klienesseg_id text,
  ADD COLUMN IF NOT EXISTS oblio_termek_kod text;

COMMENT ON COLUMN public.berleti_szerzodes.oblio_auto_szamlaz IS
  $$TRUE, ha a rendszer automatikusan állítson ki számlát a fizetési ciklus kezdetén (pg_cron). FALSE esetén kézi kiállítás szükséges.$$;

COMMENT ON COLUMN public.berleti_szerzodes.oblio_klienesseg_id IS
  $$Az Oblio partner ID (client), ha már korábban létrehozva. Ha üres, a számla-kiállításkor a rendszer rögtön partnerként is létrehozza.$$;

COMMENT ON COLUMN public.berleti_szerzodes.oblio_termek_kod IS
  $$Opcionális Oblio termék/szolgáltatás kód. Ha üres, a rendszer az oblio_fiokok.nev_default_service-t használja.$$;


-- ============================================================================
-- 5. GRANT authenticated-ra (FONTOS — ne felejtsük, 2026-04-16 tanulság!)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oblio_fiokok TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oblio_szamlak TO authenticated;


-- ============================================================================
-- 6. RLS policy-k
-- ============================================================================

ALTER TABLE public.oblio_fiokok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oblio_szamlak ENABLE ROW LEVEL SECURITY;


-- 6a. oblio_fiokok — hozzáférés a saját gyülekezethez
--     A bővített current_user_can_access_congregation() helper kezeli az összes
--     releváns szerepkört (admin, kerületi admin, lelkész, könyvelő + approved stb.)

DROP POLICY IF EXISTS oblio_fiokok_access ON public.oblio_fiokok;

CREATE POLICY oblio_fiokok_access
  ON public.oblio_fiokok
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY oblio_fiokok_access ON public.oblio_fiokok IS
  $$Saját gyülekezethez tartozó Oblio konfig CRUD. A helper szűri a szerepkörök szerint.$$;


-- 6b. oblio_szamlak — hozzáférés a saját gyülekezethez

DROP POLICY IF EXISTS oblio_szamlak_access ON public.oblio_szamlak;

CREATE POLICY oblio_szamlak_access
  ON public.oblio_szamlak
  FOR ALL
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY oblio_szamlak_access ON public.oblio_szamlak IS
  $$Saját gyülekezethez tartozó számlák és chitanțák CRUD. A helper szűri a szerepkörök szerint.$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐK (futás után)
-- ============================================================================

-- A) Táblák létrejöttek-e, GRANT-ok rendben vannak-e?
SELECT
  c.relname AS tablename,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS can_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS can_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS can_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS can_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('oblio_fiokok', 'oblio_szamlak')
ORDER BY c.relname;

-- B) berleti_szerzodes új oszlopok
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'berleti_szerzodes'
  AND column_name IN ('oblio_auto_szamlaz', 'oblio_klienesseg_id', 'oblio_termek_kod')
ORDER BY column_name;

-- C) pgcrypto extension
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'pgcrypto';

-- D) RLS bekapcsolva?
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('oblio_fiokok', 'oblio_szamlak')
ORDER BY tablename;

-- E) Policy-k léteznek?
SELECT
  c.relname AS tablename,
  pol.polname,
  CASE pol.polcmd
    WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
  END AS cmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('oblio_fiokok', 'oblio_szamlak')
ORDER BY c.relname, pol.polname;
