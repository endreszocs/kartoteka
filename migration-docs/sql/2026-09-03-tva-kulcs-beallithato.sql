-- =============================================================================
-- TVA-KULCS BEÁLLÍTHATÓVÁ TÉTELE  (Endre, 2026-09-03)
-- =============================================================================
--
-- MIÉRT: „az áfa kulcs értékét lehessen beállítani, mert az bármikor változhat!"
--
-- A kimenő (Oblio) e-Factura TVA-kulcsa eddig KÉT HELYEN volt beégetve 19%-kal:
--   · apps/web/lib/finance/oblio/oblio-invoice-builder.ts  (a számlára írt kulcs)
--   · apps/web/app/(dashboard)/penzugy/oblio-actions.ts    (a DB-be mentett osszeg_tva)
-- A román normál TVA-kulcs 2025-08-01-én 19%-ról 21%-ra emelkedett, tehát azóta
-- HIBÁS ADÓTARTALMÚ, hivatalos, ANAF SPV-re felmenő számla készült — és mivel a
-- kulcs két helyen élt, a két érték egymástól függetlenül is elcsúszhatott.
--
-- MIT CSINÁL: egy beállítható kulcs-oszlopot ad a gyülekezethez. A lelkész a
-- Gyülekezetünk adatai → ÁFA-alanyiság panelen írja át; a kódban nincs több
-- beégetett szám (a `TVA_NORMAL_SZAZALEK_ALAP` csak akkor lép be, ha ez az
-- oszlop még nem létezik — pontosan ezt a séma-drift esetet kezeli).
--
-- BIZTONSÁGOS: idempotens, meglévő adatot nem ír felül, és mivel a
-- `congregations` tábla már be van sorolva a mentés-politikába, ÚJ
-- backup_table_policy sorra NINCS szükség.
--
-- Futtatás: Supabase SQL editor, egyben.
-- =============================================================================

BEGIN;

-- ── 1) Az oszlop ────────────────────────────────────────────────────────────
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS tva_kulcs_szazalek numeric(5, 2);

-- Az alapérték a JELENLEG hatályos román normál kulcs. SZÁNDÉKOSAN nem NOT NULL
-- DEFAULT-tal állítjuk be: a NULL azt jelenti, hogy „még senki nem döntött", és
-- az alkalmazás ilyenkor a dokumentált tartalék-értéket használja. Így egy
-- későbbi kulcsváltozásnál látszik, mely gyülekezet állította be kézzel.
UPDATE public.congregations
   SET tva_kulcs_szazalek = 21
 WHERE tva_kulcs_szazalek IS NULL
   AND tva_alany = true;

-- ── 2) Értékkapu ────────────────────────────────────────────────────────────
-- 0–100 között bármi lehet (a jogszabály kedvezményes kulcsokat is ismer),
-- de értelmetlen érték ne kerülhessen hivatalos számlára.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'congregations_tva_kulcs_szazalek_check'
       AND conrelid = 'public.congregations'::regclass
  ) THEN
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_tva_kulcs_szazalek_check
      CHECK (tva_kulcs_szazalek IS NULL OR (tva_kulcs_szazalek >= 0 AND tva_kulcs_szazalek <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.congregations.tva_kulcs_szazalek IS
  'A kimenő (Oblio) e-Factura normál TVA-kulcsa százalékban. NULL = nincs beállítva, '
  'az alkalmazás a dokumentált tartalék-értéket használja (TVA_NORMAL_SZAZALEK_ALAP). '
  'A román normál kulcs 2025-08-01 óta 21% (előtte 19%) — ezért NEM égethető a kódba.';

COMMIT;

-- =============================================================================
-- ELLENŐRZÉS (a COMMIT után külön futtatva)
-- =============================================================================
-- Az oszlop létrejött-e, és mely gyülekezeteknél mi az érték?
SELECT
  c.nev_hu                                        AS gyulekezet,
  c.tva_alany                                     AS afa_alany,
  c.tva_kulcs_szazalek                            AS beallitott_kulcs,
  CASE
    WHEN c.tva_alany IS NOT TRUE                      THEN 'nem ÁFA-alany — a kulcs nem számít'
    WHEN c.tva_kulcs_szazalek IS NULL                 THEN '⚠ NINCS BEÁLLÍTVA — tartalék kulcs lép be'
    WHEN c.tva_kulcs_szazalek = 0                     THEN '⛔ 0% ÁFA-alanyként — a számlázás LE VAN TILTVA'
    ELSE '✅ beállítva'
  END                                             AS allapot
FROM public.congregations c
ORDER BY c.tva_alany DESC NULLS LAST, c.nev_hu;
