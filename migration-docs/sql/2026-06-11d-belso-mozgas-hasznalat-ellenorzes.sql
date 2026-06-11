-- ============================================================================
-- KARTOTÉKA — Belső-mozgás kódok HASZNÁLAT-ellenőrzése (read-only)
-- ============================================================================
--
-- Dátum: 2026-06-11
-- Cél: MIELŐTT a duplikált / régi belső-mozgás kódokat deaktiváljuk, megnézzük,
--      használja-e ŐKET valós befizetes/kiadas tétel. Csak a NEM használt kódokat
--      biztonságos deaktiválni.
--
-- Gyanús (deaktiválandó jelöltek):
--   befizetescel id=180 (401.01 — hibás bevétel-oldal, a 300.01 a helyes)
--   befizetescel id=182 (301.02 — bank-bank duplikátum, a 402.02 a helyes)
--   kiadascel    id=82  (401.02 — bank-bank duplikátum)
--   kiadascel    id=71  (100.51 — régi generikus)
--   kiadascel    id=72  (100.52 — régi generikus)
--
-- CSAK OLVAS. Egy result set — küldd vissza a teljes kimenetet.
-- ============================================================================

SELECT cel_tipus, cel_id, kod, nev, hasznalat_db
FROM (
  -- BEFIZETESCEL használat
  SELECT 'befizetescel' AS cel_tipus, bc.id AS cel_id, bc.id_szamadasicel AS kod, bc.nev,
         (SELECT count(*) FROM public.befizetes b
            WHERE b.id_befizetescel = bc.id AND COALESCE(b.deleted,false) = false) AS hasznalat_db
  FROM public.befizetescel bc
  WHERE bc.id IN (180, 181, 182, 183, 185)

  UNION ALL
  -- KIADASCEL használat
  SELECT 'kiadascel' AS cel_tipus, kc.id AS cel_id, kc.id_szamadasicel AS kod, kc.nev,
         (SELECT count(*) FROM public.kiadas k
            WHERE k.id_kiadascel = kc.id AND COALESCE(k.deleted,false) = false) AS hasznalat_db
  FROM public.kiadascel kc
  WHERE kc.id IN (71, 72, 80, 81, 82, 85)
) t
ORDER BY cel_tipus, kod, cel_id;
