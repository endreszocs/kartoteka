-- ═══════════════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS (csak olvas) — miért ad 220-at a 2024-es járulék 100 helyett?
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A gyanú: a korábbi évek díja csak a RÉGI `congregation_annual_fees` tükör-
--  táblában van meg, a motor viszont a `bealitas` év-sorokat olvassa, és annak
--  hiányában a MAI `congregations.eves_jarulek`-re esik vissza. A beállítás-
--  panel a hiányzó évekre a régi táblából pótol, ezért 100-at MUTAT, miközben
--  a rögzítő 220-szal SZÁMOL.
--
--  Ez a lekérdezés évenként megmutatja, melyik forrásban mi van.
--  Nem módosít semmit.
-- ═══════════════════════════════════════════════════════════════════════════

WITH cong AS (
  SELECT id, nev_hu, name, eves_jarulek AS mai_alap
  FROM public.congregations
  WHERE COALESCE(nev_hu, name) ILIKE '%arátos%'
),
evek AS (
  SELECT generate_series(2018, EXTRACT(YEAR FROM now())::int) AS ev
)
SELECT
  c.mai_alap                                   AS "congregations.eves_jarulek (MAI)",
  e.ev                                         AS "év",
  b.eves_jarulek                               AS "bealitas (a MOTOR ezt olvassa)",
  laf.eves_jarulek                                   AS "congregation_annual_fees (régi tükör)",
  CASE
    WHEN b.id IS NULL AND laf.year IS NOT NULL
      THEN '⛔ CSAK a régi táblában → a motor a MAI ' || c.mai_alap || '-t használja!'
    WHEN b.id IS NULL AND laf.year IS NULL
      THEN '— nincs beállítás erre az évre (a motor a MAI alapot használja)'
    WHEN COALESCE(b.eves_jarulek, 0) <= 0
      THEN '⛔ bealitas sor VAN, de az összeg 0 → a motor a MAI alapot használja!'
    WHEN laf.eves_jarulek IS NOT NULL AND laf.eves_jarulek <> b.eves_jarulek
      THEN '⚠️ a két forrás ELTÉR (a motor a bealitas ' || b.eves_jarulek || '-t használja)'
    ELSE '✅ rendben'
  END                                          AS "állapot",
  b.budget_finalized                           AS "költségvetés véglegesítve",
  b.accounting_finalized                       AS "számadás véglegesítve"
FROM cong c
CROSS JOIN evek e
LEFT JOIN public.bealitas b
       ON b.congregation_id = c.id AND b.id = e.ev::text
LEFT JOIN public.congregation_annual_fees laf
       ON laf.congregation_id = c.id AND laf.year = e.ev
ORDER BY e.ev DESC;
