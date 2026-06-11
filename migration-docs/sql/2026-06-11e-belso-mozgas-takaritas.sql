-- ============================================================================
-- KARTOTÉKA — Belső-mozgás (3xx/4xx) kódok TAKARÍTÁSA a kanonikus modellre
-- ============================================================================
--
-- Dátum: 2026-06-11
-- Előzmény: a 2026-06-11d használat-ellenőrzés szerint MINDEN érintett kód
--           `hasznalat_db = 0` → nincs valós tételben → biztonságos deaktiválni.
--
-- KANONIKUS MODELL (a hivatalos Adatok_2025.xlsx alapján, 2026-06-10 migráció):
--   300.01 (B)   kassza-bevétel   ← bank → kassza
--   301.01 (B)   bank-bevétel     ← kassza → bank
--   400.01 (K)   kassza-kiadás    ← kassza → bank
--   401.01 (K)   bank-kiadás      ← bank → kassza
--   402.02 (B+K) bank ↔ bank
--
-- DEAKTIVÁLANDÓ (árva / duplikátum / régi):
--   befizetescel id=180 (401.01) — hibás bevétel-oldal (a helyes a 300.01)
--   befizetescel id=182 (301.02) — bank-bank duplikátum (a helyes a 402.02)
--   kiadascel    id=82  (401.02) — bank-bank duplikátum (a helyes a 402.02)
--   kiadascel    id=71  (100.51) — régi generikus „Belső mozgás (készpénz)"
--   kiadascel    id=72  (100.52) — régi generikus „Belső mozgás (banki)"
--   szamadasicel 100.51, 100.52, 301.02, 401.02 — a fentiek katalógus-sorai
--
-- A `CombinedEntryBody` (write-path) párhuzamosan a kanonikus készletre állt
-- (WITHDRAW += 300.01, BANKBANK → 402.02) — lásd a kapcsolódó commitot.
--
-- Reverzibilis (aktiv=false, nem DELETE). Idempotens. Futtasd a Supabase editorban.
-- ============================================================================

BEGIN;

-- 1) befizetescel — hibás bevétel-oldal + bank-bank duplikátum kikapcsolása
UPDATE public.befizetescel SET aktiv = false WHERE id IN (180, 182);

-- 2) kiadascel — régi generikus + bank-bank duplikátum kikapcsolása
UPDATE public.kiadascel SET aktiv = false WHERE id IN (71, 72, 82);

-- 3) szamadasicel — az árva katalógus-sorok kikapcsolása
UPDATE public.szamadasicel SET aktiv = false
WHERE id IN ('100.51', '100.52', '301.02', '401.02');

COMMIT;

-- ============================================================================
-- ELLENŐRZÉS (futtatás után) — a megmaradó AKTÍV belső-mozgás kódoknak ezeknek
-- kell lenniük: 300.01, 301.01, 400.01, 401.01, 402.02 (és semmi más 3xx/4xx/100.5x).
-- ============================================================================
SELECT 'szamadasicel' AS tabla, id AS kod, nev, aktiv
FROM public.szamadasicel
WHERE (id LIKE '3%' OR id LIKE '4%' OR id LIKE '100.5%')
ORDER BY id;
