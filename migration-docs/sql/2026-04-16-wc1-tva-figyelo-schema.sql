-- ============================================================================
-- KARTOTEKA WC-1.1 — TVA-plafon figyelő séma bővítés
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Tervdokumentum: docs/project-tracking/KARTOTEKA-tva-figyelo-terv-2026-04-16.md
-- + docs/project-tracking/KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE
--
-- VÁLTOZTATÁSOK:
--
--   1. szamadasicel bővítés:
--      - tva_plafonba_szamit boolean DEFAULT false
--      - tva_mentesseg_hivatkozas text
--
--   2. berleti_szerzodes bővítés:
--      - jogi_tipus text CHECK (locatiune, arendare, comodat, concesiune)
--
--   3. congregations bővítés:
--      - tva_alany boolean DEFAULT false (a gyülekezet ÁFA-alany-e)
--      - tva_alany_tol date
--      - tva_kod text (CUI TVA, pl. RO12345678)
--      - e_factura_kotelezett boolean DEFAULT false (SPV-regisztrált-e)
--      - e_factura_kotelezett_tol date
--      - e_factura_kotelezettseg_indoka text
--
-- IDEMPOTENS: az ALTER TABLE ADD COLUMN IF NOT EXISTS miatt többször futtatható.
--

BEGIN;


-- ============================================================================
-- 1. szamadasicel — TVA-plafon flag
-- ============================================================================

ALTER TABLE public.szamadasicel
  ADD COLUMN IF NOT EXISTS tva_plafonba_szamit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tva_mentesseg_hivatkozas text;

COMMENT ON COLUMN public.szamadasicel.tva_plafonba_szamit IS
  $$TRUE, ha erre a számadási célkódra érkező bevétel beleszámít a TVA-plafon (395 000 RON) számításba (gazdasági tevékenység). Codul fiscal art. 310 szerint a bérbeadás (art. 292 alin. 2 lit. e) is beleszámít, még ha ÁFA-mentes is.$$;

COMMENT ON COLUMN public.szamadasicel.tva_mentesseg_hivatkozas IS
  $$Opcionális szöveges jogszabályi hivatkozás a kategória ÁFA-kezelésére (pl. "art. 292 alin. (1) lit. k) Codul fiscal — cult religios").$$;


-- ============================================================================
-- 2. berleti_szerzodes — jogi típus
-- ============================================================================

ALTER TABLE public.berleti_szerzodes
  ADD COLUMN IF NOT EXISTS jogi_tipus text NOT NULL DEFAULT 'locatiune';

-- CHECK constraint — külön, idempotens módon
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'berleti_szerzodes_jogi_tipus_check'
  ) THEN
    ALTER TABLE public.berleti_szerzodes
      ADD CONSTRAINT berleti_szerzodes_jogi_tipus_check CHECK (
        jogi_tipus = ANY (ARRAY['locatiune','arendare','comodat','concesiune'])
      );
  END IF;
END$$;

COMMENT ON COLUMN public.berleti_szerzodes.jogi_tipus IS
  $$Szerződés jogi típusa: locatiune (általános bérleti, ellenérték ellenében), arendare (mezőgazdasági bérlet), comodat (ingyenes haszonkölcsön), concesiune (koncesszió). Hatással van a TVA-plafon számításra és az e-Factura kiállításra. Comodat esetén az osszeg=0, és nem számít a plafonba.$$;


-- ============================================================================
-- 3. congregations — TVA alany + e-Factura kötelezettség státusz
-- ============================================================================

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS tva_alany boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tva_alany_tol date,
  ADD COLUMN IF NOT EXISTS tva_kod text,
  ADD COLUMN IF NOT EXISTS e_factura_kotelezett boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS e_factura_kotelezett_tol date,
  ADD COLUMN IF NOT EXISTS e_factura_kotelezettseg_indoka text;

COMMENT ON COLUMN public.congregations.tva_alany IS
  $$TRUE, ha a gyülekezet ÁFA-alany (átlépte a plafont vagy taxare prin opțiune). Ilyenkor a figyelő nem plafon-közeledést, hanem TVA-számítási státuszt mutat.$$;

COMMENT ON COLUMN public.congregations.tva_alany_tol IS
  $$Az a dátum, amelytől a gyülekezet TVA-alany (az ANAF által visszaigazolt hatálybalépés).$$;

COMMENT ON COLUMN public.congregations.tva_kod IS
  $$TVA-kód (CUI TVA), pl. "RO12345678". Csak ha tva_alany = TRUE.$$;

COMMENT ON COLUMN public.congregations.e_factura_kotelezett IS
  $$TRUE, ha a gyülekezet SPV-regisztrált (Registrul RO e-Factura). Ilyenkor MINDEN számla (a bérletiek is) az ANAF SPV-re kell menjen. FALSE esetén a bérleti ügyletek kivétel alá esnek (OUG 120/2021).$$;

COMMENT ON COLUMN public.congregations.e_factura_kotelezett_tol IS
  $$Az a dátum, amelytől a gyülekezet e-Factura kötelezett.$$;

COMMENT ON COLUMN public.congregations.e_factura_kotelezettseg_indoka IS
  $$Szabadszöveges magyarázat: miért kötelezett (pl. "rendezvény-terembérlés 2025-től", "építési telek értékesítés", "önkéntes regisztráció").$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐK
-- ============================================================================

-- A) szamadasicel új oszlopok
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'szamadasicel'
  AND column_name IN ('tva_plafonba_szamit', 'tva_mentesseg_hivatkozas')
ORDER BY column_name;

-- B) berleti_szerzodes új oszlop + CHECK
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'berleti_szerzodes'
  AND column_name = 'jogi_tipus';

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'berleti_szerzodes_jogi_tipus_check';

-- C) congregations új oszlopok
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'congregations'
  AND column_name IN (
    'tva_alany', 'tva_alany_tol', 'tva_kod',
    'e_factura_kotelezett', 'e_factura_kotelezett_tol', 'e_factura_kotelezettseg_indoka'
  )
ORDER BY column_name;
