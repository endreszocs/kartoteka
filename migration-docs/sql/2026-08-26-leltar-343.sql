-- ============================================================================
-- LELTAR 3_43 KÖR — a leltar_tetelek tábla bővítése (2026-08-26)
--
-- MIT AD:
--   1. ertek_modositas (numeric, default 0) — halmozott le-/felértékelés
--      (±RON, a teljes tételsorra); a könyv szerinti érték =
--      egységár × mennyiség + ez. A hivatalos Leltar 3_43 munkafüzet
--      ismétlődő (±) alapeszköz-sorainak megfelelője.
--   2. ertek_modositas_megjegyzes (text) — az értékmódosítás(ok) indoklása.
--   3. alapeszkoz_csoport (smallint, 1/2/3) — HG 2139/2004 főcsoport
--      (1=Épületek, 2=Technikai és szállítóeszközök, állatok, ültetvények,
--       3=Bútorzat, irodai felszerelés, védő berendezések, más alapeszközök)
--      — a munkafüzet „Alapeszköz típusa" (U) oszlopának tárolása.
--
-- FUTTATÁS: Supabase SQL editor, EGYBEN. Idempotens — többszöri futtatás
-- ártalmatlan. NINCS TEMP tábla (a session-állapot a SQL editorban nem
-- garantált — 2026-08-25-i hibaosztály), nincs RLS-változás (a tábla meglévő
-- policy-i az új oszlopokra automatikusan érvényesek), és a mentés-besorolást
-- sem érinti (a leltar_tetelek már szerepel a backup_table_policy-ban).
-- ============================================================================

ALTER TABLE public.leltar_tetelek
  ADD COLUMN IF NOT EXISTS ertek_modositas numeric NOT NULL DEFAULT 0;

ALTER TABLE public.leltar_tetelek
  ADD COLUMN IF NOT EXISTS ertek_modositas_megjegyzes text;

ALTER TABLE public.leltar_tetelek
  ADD COLUMN IF NOT EXISTS alapeszkoz_csoport smallint;

-- CHECK-bővítés drop+add párossal (az ADD CONSTRAINT IF NOT EXISTS nem
-- létezik; a drop+add idempotens és a definíció-változást is átviszi).
ALTER TABLE public.leltar_tetelek
  DROP CONSTRAINT IF EXISTS leltar_tetelek_alapeszkoz_csoport_check;

ALTER TABLE public.leltar_tetelek
  ADD CONSTRAINT leltar_tetelek_alapeszkoz_csoport_check
  CHECK (alapeszkoz_csoport IS NULL OR alapeszkoz_csoport IN (1, 2, 3));

-- ============================================================================
-- ELLENŐRZÉS — minden sor ✅ kell legyen
-- ============================================================================

SELECT '1. ertek_modositas oszlop (numeric, NOT NULL, default 0)' AS lepes,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'leltar_tetelek'
           AND column_name = 'ertek_modositas' AND is_nullable = 'NO'
       ) THEN '✅' ELSE '❌' END AS allapot
UNION ALL
SELECT '2. ertek_modositas_megjegyzes oszlop (text)',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'leltar_tetelek'
           AND column_name = 'ertek_modositas_megjegyzes'
       ) THEN '✅' ELSE '❌' END
UNION ALL
SELECT '3. alapeszkoz_csoport oszlop (smallint)',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'leltar_tetelek'
           AND column_name = 'alapeszkoz_csoport'
       ) THEN '✅' ELSE '❌' END
UNION ALL
SELECT '4. alapeszkoz_csoport CHECK (1/2/3 vagy NULL)',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'leltar_tetelek_alapeszkoz_csoport_check'
           AND conrelid = 'public.leltar_tetelek'::regclass
       ) THEN '✅' ELSE '❌' END
UNION ALL
SELECT '5. meglévő sorok értékmódosítása 0 (nem NULL)',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM public.leltar_tetelek WHERE ertek_modositas IS NULL
       ) THEN '✅' ELSE '❌' END;
