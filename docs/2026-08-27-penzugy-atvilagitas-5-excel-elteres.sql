-- ============================================================================
--  KARTOTÉKA — PÉNZÜGY ÁTVILÁGÍTÁS · 5. KÖR: A 4 795 LEJES ELTÉRÉS
--  2026-08-27
--
--  A KÉRDÉS: az app 2025-ös készpénz zárója 1 668,74; az Excel `Kassza!H3`
--  szerint 6 463,74. Az eltérés pontosan 4 795,00 lej. Honnan jön?
--
--  ⚠️ ELSŐ GYANÚSÍTOTT — A SAJÁT KORÁBBI SZÁMÍTÁSOM:
--  a 4b. körben a BEVÉTELT `fizetettev = 2025` szerint összegeztem, a KIADÁST
--  viszont `EXTRACT(year FROM datum) = 2025` szerint. Ez KÉT KÜLÖNBÖZŐ ÉV-FOGALOM:
--    • `fizetettev` = melyik ÉVRE szól a befizetés (előre/hátra fizetés!)
--    • `datum`      = mikor érkezett ténylegesen
--  Az Excel Kassza lapja DÁTUM szerint van vezetve, nem `fizetettev` szerint.
--  Ha valaki 2025-ben fizetett a 2026-os évre (vagy fordítva), a két számítás
--  szükségszerűen eltér — és épp ez adhatja a 4 795-öt.
--  A 4b. kör 3. szakasza már mutatott ilyet: 2 db `fizetettev=2026` tétel
--  2025-08-i DÁTUMMAL.
--
--  Ez a kör MINDKÉT definíció szerint kiszámolja az egyenleget, és megmutatja
--  a különbséget adó tételeket. TELJESEN READ-ONLY.
-- ============================================================================

WITH cong AS (
  SELECT c.id,
         (CASE WHEN c.id::text = '7e570000-0000-4000-8000-000000000003'
               THEN '[TESZT] ' ELSE '' END || COALESCE(c.name, c.id::text))::text AS cimke
    FROM public.congregations c
   WHERE EXISTS (SELECT 1 FROM public.befizetes b
                  WHERE b.congregation_id = c.id AND b.deleted = false)
)

SELECT * FROM (

-- ── 1. SZAKASZ: A KÉT ÉV-FOGALOM SZERINTI KÉSZPÉNZ-EGYENLEG ──────────────
--    Ha a két sor eltér, akkor a 4 795 az év-fogalom keveredéséből jön.
SELECT 10 AS sorrend,
       '1. KÉSZPÉNZ 2025 — KÉT ÉV-FOGALOM SZERINT'::text AS szakasz,
       (c.cimke || ' · ' || v.modszer)::text AS targy,
       (COALESCE(ny.nyito, 0) + v.bev - v.kiad)::text AS eredmeny,
       ('nyitó ' || COALESCE(ny.nyito::text, '0')
        || ' + bev ' || v.bev::text || ' − kiad ' || v.kiad::text)::text AS reszletek
  FROM cong c
  LEFT JOIN LATERAL (
        SELECT kn.nyito_egyenleg AS nyito
          FROM public.keszpenz_nyito_egyenleg kn
         WHERE kn.congregation_id = c.id AND kn.eve = 2025
         ORDER BY kn.id DESC LIMIT 1
       ) ny ON true
  CROSS JOIN LATERAL (
        -- (A) fizetettev szerint (ahogy a 4b. körben számoltam)
        SELECT 'A) fizetettev szerint'::text AS modszer,
               COALESCE((SELECT sum(COALESCE(b.osszeg_ron, b.osszeg)) FROM public.befizetes b
                          WHERE b.congregation_id = c.id AND b.fizetettev = 2025
                            AND b.bankszamla_id IS NULL AND b.deleted = false AND b.stornozott = false), 0) AS bev,
               COALESCE((SELECT sum(COALESCE(k.osszeg_ron, k.osszeg)) FROM public.kiadas k
                          WHERE k.congregation_id = c.id AND EXTRACT(year FROM k.datum) = 2025
                            AND k.bankszamla_id IS NULL AND k.deleted = false AND k.stornozott = false), 0) AS kiad
        UNION ALL
        -- (B) DÁTUM szerint (ahogy az Excel Kassza lapja vezetve van)
        SELECT 'B) datum szerint (Excel-módra)'::text,
               COALESCE((SELECT sum(COALESCE(b.osszeg_ron, b.osszeg)) FROM public.befizetes b
                          WHERE b.congregation_id = c.id AND EXTRACT(year FROM b.datum) = 2025
                            AND b.bankszamla_id IS NULL AND b.deleted = false AND b.stornozott = false), 0),
               COALESCE((SELECT sum(COALESCE(k.osszeg_ron, k.osszeg)) FROM public.kiadas k
                          WHERE k.congregation_id = c.id AND EXTRACT(year FROM k.datum) = 2025
                            AND k.bankszamla_id IS NULL AND k.deleted = false AND k.stornozott = false), 0)
       ) v

UNION ALL
-- ── 2. SZAKASZ: AZ ÉV-FOGALMAK SZÉTHÚZÁSA — mely tételeknél tér el? ──────
SELECT 20,
       '2. ELTÉRŐ ÉV-FOGALMÚ KÉSZPÉNZ-BEFIZETÉSEK',
       (c.cimke || ' · datum ' || b.datum::text || ' → fizetettev ' || b.fizetettev::text)::text,
       COALESCE(b.osszeg_ron, b.osszeg)::text,
       ('forrasa: ' || COALESCE(left(b.forrasa, 40), '—')
        || ' · iratszam: ' || COALESCE(b.iratszam, '?'))::text
  FROM cong c
  JOIN public.befizetes b ON b.congregation_id = c.id
 WHERE b.deleted = false AND b.stornozott = false
   AND b.bankszamla_id IS NULL
   AND EXTRACT(year FROM b.datum) <> b.fizetettev
   AND (EXTRACT(year FROM b.datum) IN (2024, 2025, 2026) OR b.fizetettev IN (2024, 2025, 2026))

UNION ALL
-- ── 3. SZAKASZ: HAVI BONTÁS — hogy az Excellel hónapról hónapra vethesd össze ──
SELECT 30,
       '3. 2025 KÉSZPÉNZ HAVONTA (datum szerint)',
       (c.cimke || ' · ' || m.ho)::text,
       ('bev ' || m.bev::text || ' − kiad ' || m.kiad::text || ' = ' || (m.bev - m.kiad)::text)::text,
       ('tételek: ' || m.db_bev::text || ' bevétel, ' || m.db_kiad::text || ' kiadás')::text
  FROM cong c
  JOIN LATERAL (
        SELECT to_char(d.ho, 'YYYY-MM') AS ho,
               COALESCE((SELECT sum(COALESCE(b.osszeg_ron, b.osszeg)) FROM public.befizetes b
                          WHERE b.congregation_id = c.id AND b.bankszamla_id IS NULL
                            AND b.deleted = false AND b.stornozott = false
                            AND date_trunc('month', b.datum) = d.ho), 0) AS bev,
               COALESCE((SELECT count(*) FROM public.befizetes b
                          WHERE b.congregation_id = c.id AND b.bankszamla_id IS NULL
                            AND b.deleted = false AND b.stornozott = false
                            AND date_trunc('month', b.datum) = d.ho), 0) AS db_bev,
               COALESCE((SELECT sum(COALESCE(k.osszeg_ron, k.osszeg)) FROM public.kiadas k
                          WHERE k.congregation_id = c.id AND k.bankszamla_id IS NULL
                            AND k.deleted = false AND k.stornozott = false
                            AND date_trunc('month', k.datum) = d.ho), 0) AS kiad,
               COALESCE((SELECT count(*) FROM public.kiadas k
                          WHERE k.congregation_id = c.id AND k.bankszamla_id IS NULL
                            AND k.deleted = false AND k.stornozott = false
                            AND date_trunc('month', k.datum) = d.ho), 0) AS db_kiad
          FROM generate_series(DATE '2025-01-01', DATE '2025-12-01', INTERVAL '1 month') AS d(ho)
       ) m ON true

UNION ALL
-- ── 4. SZAKASZ: van-e PONTOSAN 4 795 összegű tétel? ─────────────────────
SELECT 40,
       '4. 4 795 KÖRÜLI TÉTELEK (a különbség gyanúsítottjai)',
       (x.tabla || ' · ' || x.datum::text)::text,
       x.osszeg::text,
       x.megj::text
  FROM (
        SELECT 'befizetes'::text AS tabla, b.datum::date AS datum,
               COALESCE(b.osszeg_ron, b.osszeg) AS osszeg,
               ('forrasa: ' || COALESCE(left(b.forrasa, 40), '—'))::text AS megj
          FROM public.befizetes b
         WHERE b.deleted = false AND b.bankszamla_id IS NULL
           AND abs(COALESCE(b.osszeg_ron, b.osszeg) - 4795) <= 0.01
        UNION ALL
        SELECT 'kiadas'::text, k.datum::date,
               COALESCE(k.osszeg_ron, k.osszeg),
               ('átvevő: ' || COALESCE(left(k.atvevo, 40), '—'))::text
          FROM public.kiadas k
         WHERE k.deleted = false AND k.bankszamla_id IS NULL
           AND abs(COALESCE(k.osszeg_ron, k.osszeg) - 4795) <= 0.01
       ) x

UNION ALL
-- ── 5. SZAKASZ: a 2025-ös import mérlege — mennyi jött be ténylegesen? ───
SELECT 50,
       '5. 2025 KÉSZPÉNZ TÉTELSZÁM (az import-naplóval vetheted össze)',
       (c.cimke || ' · ' || t.mit)::text,
       t.db::text,
       t.osszeg::text
  FROM cong c
  CROSS JOIN LATERAL (
        SELECT 'kassza bevétel (datum szerint)'::text AS mit,
               count(*) AS db,
               COALESCE(sum(COALESCE(b.osszeg_ron, b.osszeg)), 0)::text AS osszeg
          FROM public.befizetes b
         WHERE b.congregation_id = c.id AND b.bankszamla_id IS NULL
           AND b.deleted = false AND EXTRACT(year FROM b.datum) = 2025
        UNION ALL
        SELECT 'kassza kiadás (datum szerint)'::text,
               count(*),
               COALESCE(sum(COALESCE(k.osszeg_ron, k.osszeg)), 0)::text
          FROM public.kiadas k
         WHERE k.congregation_id = c.id AND k.bankszamla_id IS NULL
           AND k.deleted = false AND EXTRACT(year FROM k.datum) = 2025
       ) t

) AS osszes
ORDER BY sorrend, targy;
