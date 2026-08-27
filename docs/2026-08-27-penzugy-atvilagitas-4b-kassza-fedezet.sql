-- ============================================================================
--  KARTOTÉKA — PÉNZÜGY ÁTVILÁGÍTÁS · 4b. KÖR: KASSZA-FEDEZET (JAVÍTOTT)
--  2026-08-27
--
--  MIÉRT KELL ÚJRA: a 4. kör 4. szakasza NEM szűrt gyülekezetre, ezért a
--  teszt-gyülekezet (7e570000-…-0003) sorait ÖSSZEKEVERTE a valós adatokkal.
--  Az ott látott "1 469,00 készpénz nyitó" a TESZT-gyülekezeté volt.
--
--  A KÉRDÉS: elbírja-e a kassza a 7 hiányzó letét (65 425 RON) levonását,
--  vagy a 2026-os készpénzkönyv egyszerűen még nincs feltöltve?
--
--  TELJESEN READ-ONLY. Egyetlen utasítás (UNION ALL).
--  A teszt-gyülekezet KÜLÖN sorban jelenik meg, nem összekeverve.
-- ============================================================================

WITH cong AS (
  SELECT c.id,
         (CASE WHEN c.id::text = '7e570000-0000-4000-8000-000000000003'
               THEN '[TESZT] ' ELSE '' END || COALESCE(c.name, c.id::text))::text AS cimke
    FROM public.congregations c
   WHERE c.id IN (SELECT DISTINCT congregation_id FROM public.befizetes WHERE deleted = false)
),
ev(ev) AS (VALUES (2024), (2025), (2026))

SELECT * FROM (

-- ── 1. SZAKASZ: KÉSZPÉNZ — nyitó, forgalom, számított egyenleg ────────────
--    LEFT JOIN LATERAL, hogy a hiányzó nyitó is LÁTSZÓDJON (ne tűnjön el a sor).
SELECT 10 AS sorrend,
       '1. KÉSZPÉNZ ÉVENKÉNT'::text AS szakasz,
       (c.cimke || ' · ' || e.ev::text)::text AS targy,
       ('nyitó: ' || COALESCE(ny.nyito_egyenleg::text, '### NINCS ###')
        || ' | bev: ' || bev.osszeg::text
        || ' | kiad: ' || kia.osszeg::text)::text AS eredmeny,
       ('számított záró: '
        || (COALESCE(ny.nyito_egyenleg, 0) + bev.osszeg - kia.osszeg)::text
        || '  (' || bev.db::text || ' bevétel, ' || kia.db::text || ' kiadás)')::text AS reszletek
  FROM cong c
  CROSS JOIN ev e
  LEFT JOIN LATERAL (
        SELECT kn.nyito_egyenleg
          FROM public.keszpenz_nyito_egyenleg kn
         WHERE kn.congregation_id = c.id AND kn.eve = e.ev
         ORDER BY kn.id DESC LIMIT 1
       ) ny ON true
  LEFT JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(b.osszeg_ron, b.osszeg)), 0) AS osszeg, count(*) AS db
          FROM public.befizetes b
         WHERE b.congregation_id = c.id AND b.fizetettev = e.ev
           AND b.bankszamla_id IS NULL
           AND b.deleted = false AND b.stornozott = false
       ) bev ON true
  LEFT JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(k.osszeg_ron, k.osszeg)), 0) AS osszeg, count(*) AS db
          FROM public.kiadas k
         WHERE k.congregation_id = c.id
           AND EXTRACT(year FROM k.datum) = e.ev
           AND k.bankszamla_id IS NULL
           AND k.deleted = false AND k.stornozott = false
       ) kia ON true

UNION ALL
-- ── 2. SZAKASZ: A DÖNTŐ PRÓBA — elbírja-e a kassza a 65 425 levonását? ────
SELECT 20,
       '2. ⛔ FEDEZET-PRÓBA (csak a 7 érintett sor gyülekezete)',
       (c.cimke || ' · 2026')::text,
       ('mai számított kassza: '
        || (COALESCE(ny.nyito_egyenleg, 0) + bev.osszeg - kia.osszeg)::text)::text,
       ('a 65 425 levonása UTÁN: '
        || (COALESCE(ny.nyito_egyenleg, 0) + bev.osszeg - kia.osszeg - 65425)::text
        || CASE WHEN (COALESCE(ny.nyito_egyenleg, 0) + bev.osszeg - kia.osszeg - 65425) < 0
                THEN '  → ### NEGATÍV: a 2026-os készpénzkönyv nincs feltöltve ###'
                ELSE '  → pozitív, a pótlás elbírható' END)::text
  FROM cong c
  LEFT JOIN LATERAL (
        SELECT kn.nyito_egyenleg FROM public.keszpenz_nyito_egyenleg kn
         WHERE kn.congregation_id = c.id AND kn.eve = 2026
         ORDER BY kn.id DESC LIMIT 1
       ) ny ON true
  LEFT JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(b.osszeg_ron, b.osszeg)), 0) AS osszeg
          FROM public.befizetes b
         WHERE b.congregation_id = c.id AND b.fizetettev = 2026
           AND b.bankszamla_id IS NULL AND b.deleted = false AND b.stornozott = false
       ) bev ON true
  LEFT JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(k.osszeg_ron, k.osszeg)), 0) AS osszeg
          FROM public.kiadas k
         WHERE k.congregation_id = c.id AND EXTRACT(year FROM k.datum) = 2026
           AND k.bankszamla_id IS NULL AND k.deleted = false AND k.stornozott = false
       ) kia ON true
 WHERE c.id IN (SELECT DISTINCT b2.congregation_id
                  FROM public.befizetes b2
                  JOIN public.befizetescel bc2 ON bc2.id = b2.id_befizetescel
                 WHERE bc2.id_szamadasicel = '301.01'
                   AND b2.belso_mozgas_xkey IS NULL AND b2.deleted = false)

UNION ALL
-- ── 3. SZAKASZ: MENNYIRE VAN FELTÖLTVE A 2026-OS KÖNYV EGYÁLTALÁN? ───────
--    Havi bontás: ha a tételek csak az év elejére koncentrálódnak, a könyv
--    egyszerűen nincs kész — és akkor a pótlás most korai.
SELECT 30,
       '3. A 2026-OS KÖNYV FELTÖLTÖTTSÉGE HAVONTA',
       (c.cimke || ' · ' || to_char(m.ho, 'YYYY-MM'))::text,
       ('kassza: ' || m.kassza_db::text || ' tétel')::text,
       ('banki: ' || m.bank_db::text || ' tétel')::text
  FROM cong c
  JOIN LATERAL (
        SELECT date_trunc('month', b.datum)::date AS ho,
               count(*) FILTER (WHERE b.bankszamla_id IS NULL)     AS kassza_db,
               count(*) FILTER (WHERE b.bankszamla_id IS NOT NULL) AS bank_db
          FROM public.befizetes b
         WHERE b.congregation_id = c.id AND b.fizetettev = 2026 AND b.deleted = false
         GROUP BY date_trunc('month', b.datum)::date
       ) m ON true

UNION ALL
-- ── 4. SZAKASZ: a 2025-ös ZÁRÓ készpénz — ez lenne a 2026-os nyitó ────────
SELECT 40,
       '4. 2025 ZÁRÓ = a HIÁNYZÓ 2026-os NYITÓ',
       c.cimke::text,
       ('2025 számított záró: '
        || (COALESCE(ny.nyito_egyenleg, 0) + bev.osszeg - kia.osszeg)::text)::text,
       ('nyitó volt: ' || COALESCE(ny.nyito_egyenleg::text, 'nincs')
        || ' + bev ' || bev.osszeg::text || ' − kiad ' || kia.osszeg::text)::text
  FROM cong c
  LEFT JOIN LATERAL (
        SELECT kn.nyito_egyenleg FROM public.keszpenz_nyito_egyenleg kn
         WHERE kn.congregation_id = c.id AND kn.eve = 2025
         ORDER BY kn.id DESC LIMIT 1
       ) ny ON true
  LEFT JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(b.osszeg_ron, b.osszeg)), 0) AS osszeg
          FROM public.befizetes b
         WHERE b.congregation_id = c.id AND b.fizetettev = 2025
           AND b.bankszamla_id IS NULL AND b.deleted = false AND b.stornozott = false
       ) bev ON true
  LEFT JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(k.osszeg_ron, k.osszeg)), 0) AS osszeg
          FROM public.kiadas k
         WHERE k.congregation_id = c.id AND EXTRACT(year FROM k.datum) = 2025
           AND k.bankszamla_id IS NULL AND k.deleted = false AND k.stornozott = false
       ) kia ON true

) AS osszes
ORDER BY sorrend, targy;
