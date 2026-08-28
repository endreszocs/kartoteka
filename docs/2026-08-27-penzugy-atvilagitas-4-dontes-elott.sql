-- ============================================================================
--  KARTOTÉKA — PÉNZÜGY ÁTVILÁGÍTÁS · 4. KÖR: A DÖNTÉS ELŐTT
--  2026-08-27
--
--  EGYETLEN CÉL: eldönteni, hogy a megbukott importból származó 7 db
--  párosítatlan "Készpénzletétel a kasszából" (301.01, össz. 65 425 RON)
--  kassza-oldali párja LÉTEZIK-E MÁR valamilyen formában.
--
--  Ha létezik  → a pótlás DUPLÁN vonna le, akkor a bank-oldalt kell rendezni.
--  Ha nem      → a kassza-oldal tényleg hiányzik, pótolni kell.
--
--  TELJESEN READ-ONLY. Egyetlen utasítás (UNION ALL).
-- ============================================================================

WITH hianyzo(datum, osszeg) AS (
  VALUES
    (DATE '2026-02-18',  2055.00),
    (DATE '2026-02-18', 15015.00),
    (DATE '2026-04-16', 16300.00),
    (DATE '2026-06-03', 13850.00),
    (DATE '2026-06-03',  1710.00),
    (DATE '2026-06-03',  6495.00),
    (DATE '2026-07-09', 10000.00)
)

SELECT * FROM (

-- ── 1. SZAKASZ: van-e AZONOS ÖSSZEGŰ kassza-kiadás a dátum körül? ─────────
--    LEFT JOIN LATERAL, hogy a NEM TALÁLT sorok is látszódjanak — épp azok
--    a fontosak. (A CROSS JOIN pont a bukó sorokat tüntetné el.)
SELECT 10 AS sorrend,
       '1. VAN-E MÁR KASSZA-OLDALI PÁRJA?'::text AS szakasz,
       (h.datum::text || ' · ' || h.osszeg::text || ' RON')::text AS targy,
       (CASE WHEN t.db IS NULL OR t.db = 0
             THEN '### NINCS — a kassza-oldal tényleg hiányzik ###'
             ELSE t.db::text || ' lehetséges pár TALÁLVA' END)::text AS eredmeny,
       COALESCE(t.reszlet, '(±10 napon belül nincs azonos összegű kassza-kiadás)')::text AS reszletek
  FROM hianyzo h
  LEFT JOIN LATERAL (
        SELECT count(*) AS db,
               string_agg(
                 k.datum::date::text || ' · ' || COALESCE(kc.nev, '?')
                 || ' · ' || COALESCE(left(k.atvevo, 30), '—'), ' || ') AS reszlet
          FROM public.kiadas k
          LEFT JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
         WHERE k.deleted = false
           AND k.stornozott = false
           AND k.bankszamla_id IS NULL                     -- kassza-oldal
           AND abs(COALESCE(k.osszeg_ron, k.osszeg) - h.osszeg) <= 0.01
           AND k.datum::date BETWEEN h.datum - 10 AND h.datum + 10
       ) t ON true

UNION ALL
-- ── 2. SZAKASZ: a 400.01 (kassza→bank kiadás) ÉVENKÉNTI eloszlása ─────────
--    Ha 2026-ban nincs egy sem, az önmagában is bizonyítja a hiányt.
SELECT 20,
       '2. 400.01 KASSZA→BANK KIADÁSOK ÉVENKÉNT',
       ('év ' || EXTRACT(year FROM k.datum)::int::text)::text,
       (count(*)::text || ' tétel · ' || sum(COALESCE(k.osszeg_ron, k.osszeg))::text || ' RON')::text,
       ('párosítva: ' || (count(*) FILTER (WHERE k.belso_mozgas_xkey IS NOT NULL))::text
        || ' · pár nélkül: ' || (count(*) FILTER (WHERE k.belso_mozgas_xkey IS NULL))::text)::text
  FROM public.kiadas k
  JOIN public.kiadascel kc  ON kc.id = k.id_kiadascel
  JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
 WHERE k.deleted = false AND sc.id = '400.01'
 GROUP BY EXTRACT(year FROM k.datum)::int

UNION ALL
-- ── 3. SZAKASZ: a 301.01 (bankra érkező letét) ÉVENKÉNTI eloszlása ────────
SELECT 30,
       '3. 301.01 BANKRA ÉRKEZŐ LETÉTEK ÉVENKÉNT',
       ('év ' || b.fizetettev::text)::text,
       (count(*)::text || ' tétel · ' || sum(COALESCE(b.osszeg_ron, b.osszeg))::text || ' RON')::text,
       ('párosítva: ' || (count(*) FILTER (WHERE b.belso_mozgas_xkey IS NOT NULL))::text
        || ' · PÁR NÉLKÜL: ' || (count(*) FILTER (WHERE b.belso_mozgas_xkey IS NULL))::text)::text
  FROM public.befizetes b
  JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
  JOIN public.szamadasicel sc ON sc.id = bc.id_szamadasicel
 WHERE b.deleted = false AND sc.id = '301.01'
 GROUP BY b.fizetettev

UNION ALL
-- ── 4. SZAKASZ: MEKKORA A KASSZA EGYENLEGE MOST, ÉS MENNYI LENNE ─────────
--    a hiányzó 65 425 levonása után? Ha az eredmény NEGATÍV, az önmagában
--    bizonyítja, hogy a kassza-oldal máshogy MÁR el lett számolva.
SELECT 40,
       '4. KASSZA-EGYENLEG PRÓBA (2026)',
       x.cimke::text,
       x.ertek::text,
       x.megj::text
  FROM (
        SELECT 1 AS s, 'készpénz nyitó 2026 (keszpenz_nyito_egyenleg)'::text AS cimke,
               COALESCE((SELECT kn.nyito_egyenleg::text
                           FROM public.keszpenz_nyito_egyenleg kn
                          WHERE kn.eve = 2026
                          ORDER BY kn.id DESC LIMIT 1), '### NINCS 2026-os SOR ###') AS ertek,
               'a 2. körben ez hiányzott a valós gyülekezetnél'::text AS megj
        UNION ALL
        SELECT 2, 'kassza BEVÉTEL 2026 (bankszamla_id IS NULL)',
               COALESCE(sum(COALESCE(b.osszeg_ron, b.osszeg)), 0)::text,
               count(*)::text || ' tétel'
          FROM public.befizetes b
         WHERE b.deleted = false AND b.stornozott = false
           AND b.bankszamla_id IS NULL AND b.fizetettev = 2026
        UNION ALL
        SELECT 3, 'kassza KIADÁS 2026 (bankszamla_id IS NULL)',
               COALESCE(sum(COALESCE(k.osszeg_ron, k.osszeg)), 0)::text,
               count(*)::text || ' tétel'
          FROM public.kiadas k
         WHERE k.deleted = false AND k.stornozott = false
           AND k.bankszamla_id IS NULL
           AND EXTRACT(year FROM k.datum) = 2026
        UNION ALL
        SELECT 4, 'a HIÁNYZÓ kassza-oldali letétek összege',
               '65425.00',
               'ennyivel kellene CSÖKKENNIE a kasszának, ha pótoljuk'
       ) x

UNION ALL
-- ── 5. SZAKASZ: a 7 érintett banki sor AZONOSÍTÓJA (a javításhoz) ────────
SELECT 50,
       '5. AZ ÉRINTETT 7 BANKI SOR',
       ('id=' || b.id::text || ' · ' || b.datum::text)::text,
       COALESCE(b.osszeg_ron, b.osszeg)::text,
       ('iratszam: ' || COALESCE(b.iratszam, '?')
        || ' · bankszamla: ' || COALESCE(b.bankszamla_id::text, 'NINCS')
        || ' · xkey: ' || left(b.xkey, 12))::text
  FROM public.befizetes b
  JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
 WHERE b.deleted = false
   AND bc.id_szamadasicel = '301.01'
   AND b.belso_mozgas_xkey IS NULL

) AS osszes
ORDER BY sorrend, targy;
