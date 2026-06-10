-- ============================================================================
-- KARTOTÉKA — Belső-mozgás / 300-400-as kódok TELJES állapota (read-only)
-- ============================================================================
--
-- Dátum: 2026-06-11
-- Cél: a belső-mozgás (kassza ↔ bank, bank ↔ bank) kódok teljes jelenlegi
--      állapotának kilistázása — duplikátumok / hiányzó párok / per-számla vs
--      generikus elnevezés ellenőrzéséhez, MIELŐTT az Excel-write-through (E3)
--      és a kód-szótár javítása megtörténik.
--
-- CSAK OLVAS. Futtasd a Supabase SQL editorban, és küldd vissza a teljes
-- eredményt (EGY result set — a Supabase az utolsó SELECT-et mutatja).
-- ============================================================================

SELECT
  forras_tabla,
  id_szamadasicel AS kod,
  cel_id,
  nev,
  nevro,
  aktiv
FROM (
  -- szamadasicel törzs (a 100.5x / 3xx / 4xx + minden, ami belső-mozgás-szagú)
  SELECT 'szamadasicel' AS forras_tabla, s.id AS id_szamadasicel, NULL::int AS cel_id,
         s.nev, s.nevro, s.aktiv
  FROM public.szamadasicel s
  WHERE s.id LIKE '3%' OR s.id LIKE '4%' OR s.id LIKE '100.5%'
     OR s.nev ILIKE '%belső mozg%' OR s.nev ILIKE '%számlár%' OR s.nev ILIKE '%számlába%'
     OR s.nev ILIKE '%átutalás%' OR s.nev ILIKE '%készpénzfel%' OR s.nev ILIKE '%készpénzlet%'

  UNION ALL
  -- befizetescel (bevétel-oldali belső mozgás)
  SELECT 'befizetescel', bc.id_szamadasicel, bc.id, bc.nev, bc.nevro, bc.aktiv
  FROM public.befizetescel bc
  WHERE bc.id_szamadasicel LIKE '3%' OR bc.id_szamadasicel LIKE '4%' OR bc.id_szamadasicel LIKE '100.5%'
     OR bc.nev ILIKE '%számlár%' OR bc.nev ILIKE '%átutalás%'
     OR bc.nev ILIKE '%készpénzfel%' OR bc.nev ILIKE '%készpénzlet%' OR bc.nev ILIKE '%belső mozg%'

  UNION ALL
  -- kiadascel (kiadás-oldali belső mozgás)
  SELECT 'kiadascel', kc.id_szamadasicel, kc.id, kc.nev, kc.nevro, kc.aktiv
  FROM public.kiadascel kc
  WHERE kc.id_szamadasicel LIKE '3%' OR kc.id_szamadasicel LIKE '4%' OR kc.id_szamadasicel LIKE '100.5%'
     OR kc.nev ILIKE '%számlár%' OR kc.nev ILIKE '%átutalás%'
     OR kc.nev ILIKE '%készpénzfel%' OR kc.nev ILIKE '%készpénzlet%' OR kc.nev ILIKE '%belső mozg%'
) t
ORDER BY kod, forras_tabla, nev;
