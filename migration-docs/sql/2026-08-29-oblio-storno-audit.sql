-- ═══════════════════════════════════════════════════════════════════════════
-- OBLIO/CHITANTA STORNÓ AUDIT-MEZŐ (P3-11, audit 2026-08-28)
-- Futtatás: Supabase SQL editor, egyben. Idempotens.
--
-- MIÉRT: a nyugta-stornó eddig nem rögzítette, KI stornózott. A
-- befizetes/kiadas táblák 2026-04-18 óta hordozzák a stornozott_by-t —
-- az oblio_szamlak kimaradt. A kód (stornoChitantaUseCase) már írja a
-- mezőt, és az oszlop hiányáig hangos figyelmeztetéssel, nélküle stornóz.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.oblio_szamlak
  ADD COLUMN IF NOT EXISTS stornozott_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.oblio_szamlak.stornozott_by IS
  'A stornózó user (audit) — P3-11, 2026-08-29.';

-- ── ÖNELLENŐRZÉS (egyetlen rács) ────────────────────────────────────────────
SELECT
  'oblio_szamlak.stornozott_by' AS ellenorzes,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oblio_szamlak'
      AND column_name = 'stornozott_by'
  ) THEN '✅ létezik' ELSE '❌ HIÁNYZIK' END AS allapot;
