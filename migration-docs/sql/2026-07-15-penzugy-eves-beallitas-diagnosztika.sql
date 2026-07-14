-- =============================================================================
-- Pénzügy — „A 2025. évi pénzügyi beállítás nem hozható létre automatikusan" DIAGNOSZTIKA
-- 2026-07-15
--
-- CÉL: kideríteni, MIÉRT nem jött létre automatikusan az évi `bealitas` sor.
-- A page.tsx csak akkor próbálja auto-létrehozni, ha a congregations.eves_jarulek > 0.
-- Ha 0/NULL → kihagyja → eddig zsákutca-üzenet (mostantól kitölthető űrlap).
--
-- FUTTATÁS: Supabase SQL editor. Csak SELECT, semmit nem módosít.
-- Cseréld ki a :year értéket az érintett évre (pl. 2025).
-- =============================================================================

-- 1) Mely gyülekezeteknek NINCS érvényes éves járuléka (emiatt marad el az auto-create)?
SELECT
  c.id,
  c.name                 AS hivatalos_nev,
  c.nev_hu,
  c.eves_jarulek,
  c.jarulek_hatarid,
  CASE
    WHEN COALESCE(c.eves_jarulek, 0) > 0 THEN 'OK (auto-create menne)'
    ELSE 'HIÁNYZIK → eddig zsákutca, mostantól űrlap'
  END AS statusz
FROM public.congregations c
ORDER BY (COALESCE(c.eves_jarulek, 0) > 0), c.name;

-- 2) Van-e már 2025-ös `bealitas` sor gyülekezetenként? (nincs sor = hiányzik az évi beállítás)
SELECT
  c.id,
  c.name                 AS hivatalos_nev,
  b.id                   AS bealitas_ev,
  b.eves_jarulek         AS bealitas_eves_jarulek,
  b.jarulek_hatarid      AS bealitas_hatarid
FROM public.congregations c
LEFT JOIN public.bealitas b
  ON b.congregation_id = c.id
 AND b.id = '2025'
ORDER BY c.name;
