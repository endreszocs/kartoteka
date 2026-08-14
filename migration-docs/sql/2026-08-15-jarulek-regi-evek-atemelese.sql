-- ═══════════════════════════════════════════════════════════════════════════
--  A KORÁBBI ÉVEK JÁRULÉKÁNAK ÁTEMELÉSE A MOTOR ÁLTAL OLVASOTT TÁBLÁBA
--  (2026-08-15 — Endre hibajelzése: „2024-re 220-at ad a 100 helyett")
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI A BAJ (élesben igazolva Barátoson):
--    év    régi tükör (congregation_annual_fees)   bealitas (a MOTOR ezt olvassa)
--    2025            130                                   130      ✅ működött
--    2024            100                                   —        ⛔ 220-at számolt
--    2023             85                                   —        ⛔
--    2022             85                                   —        ⛔
--    2021             75                                   —        ⛔
--    2020             75                                   —        ⛔
--
--  A beállítás-panel a hiányzó évekre a RÉGI tükör-táblából pótol, tehát a
--  helyes összeget MUTATTA — a tartozás- és az auto-összeg motor viszont csak
--  a `bealitas` év-sorokat nézi, és hiányukban a MAI gyülekezeti alapdíjra
--  esik vissza. Ezért látszott „beállítottnak" az, ami nem hatott.
--
--  MIT CSINÁL EZ A FÁJL: minden olyan évre, amelyre van régi tükör-sor, de
--  NINCS `bealitas` sor, létrehozza a `bealitas` sort a tükör összegével.
--  A kötelező (NOT NULL) mezőket az adott gyülekezet EGY MEGLÉVŐ év-sorából
--  másolja mintaként, majd felülírja azt, ami évfüggő. A véglegesítés-
--  zászlók és a záró-adatok tisztán (hamis/0/üres) indulnak.
--
--  BIZTONSÁG:
--   · MEGLÉVŐ `bealitas` sorhoz NEM nyúl (WHERE NOT EXISTS) — semmit nem ír felül;
--   · visszamenőleges évhez kedvezmény nem jár → jarulek_kedvezmenyes = 0
--     (ugyanaz a szabály, mint a felület „Évenkénti díjak" paneljén);
--   · csak olyan gyülekezetnél fut, ahol van legalább egy minta-év sor;
--   · minden gyülekezetre érvényes, nem csak Barátosra.
--
--  ⚠️ EGY TRANZAKCIÓ — újrafuttatható (ismételt futáskor nincs mit tennie).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH minta AS (
  -- Gyülekezetenként EGY minta-sor a kötelező mezők pótlásához (a legfrissebb).
  SELECT DISTINCT ON (congregation_id) *
  FROM public.bealitas
  ORDER BY congregation_id, id DESC
),
hianyzo AS (
  SELECT
    laf.congregation_id,
    laf.year,
    laf.eves_jarulek,
    laf.jarulek_hatarid
  FROM public.congregation_annual_fees laf
  WHERE COALESCE(laf.eves_jarulek, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.bealitas b
      WHERE b.congregation_id = laf.congregation_id
        AND b.id = laf.year::text
    )
)
INSERT INTO public.bealitas
SELECT (jsonb_populate_record(
  NULL::public.bealitas,
  to_jsonb(m) || jsonb_build_object(
    'id',                          h.year::text,
    'congregation_id',             h.congregation_id,
    'eves_jarulek',                h.eves_jarulek,
    -- Visszamenőleges évhez nincs kedvezmény (a panel ígérete szerint).
    'jarulek_kedvezmenyes',        0,
    'jarulek_hatarid',             COALESCE(h.jarulek_hatarid, '07-01'),
    -- A zárolás-zászlók és a záró-adatok TISZTÁN indulnak: egy régi év
    -- átemelése nem tehet úgy, mintha véglegesítve lenne.
    'budget_finalized',            false,
    'accounting_finalized',        false,
    'unlock_requested',            false,
    'accounting_unlock_requested', false,
    'leltar_finalized',            false,
    'leltar_unlock_requested',     false,
    'unlock_reason',               NULL,
    'accounting_unlock_reason',    NULL,
    'leltar_unlock_reason',        NULL,
    'szamadas_zaro_adatok',        '{}'::jsonb,
    'nyito_keszpenz',              0,
    'nyito_bank',                  0,
    'aktiv',                       true
  )
)).*
FROM hianyzo h
JOIN minta m ON m.congregation_id = h.congregation_id;

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
-- Minden sorban ✅ kell álljon: a motor és a panel ugyanazt az összeget látja.
SELECT
  COALESCE(c.nev_hu, c.name)  AS gyulekezet,
  laf.year                    AS "év",
  laf.eves_jarulek            AS "régi tükör",
  b.eves_jarulek              AS "bealitas (a MOTOR)",
  CASE
    WHEN b.id IS NULL THEN '❌ MÉG MINDIG hiányzik a bealitas sor'
    WHEN b.eves_jarulek = laf.eves_jarulek THEN '✅ egyezik'
    ELSE '⚠️ eltér — a motor a bealitas értékét használja (ez a mérvadó)'
  END                         AS allapot
FROM public.congregation_annual_fees laf
JOIN public.congregations c ON c.id = laf.congregation_id
LEFT JOIN public.bealitas b
       ON b.congregation_id = laf.congregation_id AND b.id = laf.year::text
WHERE COALESCE(laf.eves_jarulek, 0) > 0
ORDER BY gyulekezet, laf.year DESC;
