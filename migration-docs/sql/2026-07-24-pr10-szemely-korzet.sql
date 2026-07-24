-- ============================================================================
-- PR-10 (tagnyilvántartás) — SZEMÉLY-SZINTŰ KÖRZET-HOZZÁRENDELÉS
-- Dátum: 2026-07-24
-- User-észrevétel (3. pont): a körzetesítés a TELJES gyülekezetre vonatkozzon —
--   akinek nincs családja (egyedülálló, özvegy, elvált), az is kerüljön
--   körzethez. A családok hozzárendelése továbbra is család-szintű
--   (csalad.id_csoport + haztartas.id_csoport); ez az oszlop KIZÁRÓLAG a
--   család nélküli személyeké.
-- ============================================================================

ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS id_csoport integer;

COMMENT ON COLUMN public.szemely.id_csoport IS
  'Körzet-hozzárendelés CSALÁD NÉLKÜLI személyeknek (2026-07-24, PR-10). Családban élő tagnál a körzet a csalad/haztartas.id_csoport-ból jön — ott ez az oszlop üresen marad. FK: csoport.id (iskorzet=true).';

-- Gyors szűréshez (körzetenkénti névsor/nyomtatás):
CREATE INDEX IF NOT EXISTS idx_szemely_id_csoport
  ON public.szemely (id_csoport)
  WHERE id_csoport IS NOT NULL;

-- ============================================================================
-- VERIFIKÁCIÓ (várt: 1 sor, integer, YES):
-- ============================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='szemely' AND column_name='id_csoport';
