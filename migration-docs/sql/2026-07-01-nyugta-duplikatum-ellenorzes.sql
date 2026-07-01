-- ============================================================================
-- 2026-07-01 — ELLENŐRZŐ SQL: ismétlődő Irat sz. — valódi duplikátum vagy több-befizetős nyugta?
-- ============================================================================
-- Endre észrevétele: az ISMÉTLŐDŐ Irat sz. ÖNMAGÁBAN NEM hiba. Egy nyugtán több befizető
-- lehet — ilyenkor személyenként KÜLÖN sor keletkezik, KÖZÖS Irat sz.-mal és KÖZÖS kerületi
-- alap-iratszámmal, csak `/1`, `/2` … utótaggal. Ez teljesen szabályos.
-- VALÓDI duplikátum CSAK akkor van, ha egy Irat sz.-hoz TÖBB KÜLÖNBÖZŐ kerületi alap-iratszám
-- (= külön fizikai nyugta) tartozik.
--
-- Előre kitöltve: Barátosi (43cff37f-…), 2025. Csak SELECT. Futtasd egyben.
-- ============================================================================

-- ── 1) OSZTÁLYOZÁS: minden ismétlődő Irat sz. — OK vagy valódi duplikátum ────
WITH params AS (
  SELECT '43cff37f-1131-4c79-8082-0e8af61cf40a'::uuid AS cid, 2025::int AS ev
),
base AS (
  SELECT
    substring(b.nyugta from '[0-9]+')::numeric              AS irat_sz,
    regexp_replace(btrim(b.iratszam), '/\d+\s*$', '')       AS keruleti_alap
  FROM public.befizetes b, params
  WHERE b.congregation_id = params.cid
    AND EXTRACT(YEAR FROM b.datum)::int = params.ev
    AND COALESCE(b.deleted,false) = false
    AND b.bankszamla_id IS NULL
    AND b.belso_mozgas_xkey IS NULL
    AND b.nyugta IS NOT NULL
    AND b.nyugta <> b.iratszam
),
grp AS (
  SELECT irat_sz,
         count(*)                       AS sorok_szama,
         count(DISTINCT keruleti_alap)  AS kulonbozo_nyugtak,
         string_agg(DISTINCT keruleti_alap, '  |  ') AS keruleti_alapok
  FROM base
  GROUP BY irat_sz
  HAVING count(*) > 1
)
SELECT
  irat_sz            AS irat_szam,
  sorok_szama,
  kulonbozo_nyugtak,
  CASE WHEN kulonbozo_nyugtak > 1
       THEN 'VALODI DUPLIKATUM (kulon nyugtak azonos Irat sz.-mal)'
       ELSE 'OK - egy nyugta tobb befizetovel' END AS minosites,
  keruleti_alapok
FROM grp
ORDER BY kulonbozo_nyugtak DESC, irat_szam;

-- VÁRT: a legtöbb sor „OK - egy nyugta tobb befizetovel"; csak az esetleges VALÓDI
-- duplikátumok (kulonbozo_nyugtak > 1) számítanak hibának. A javított nyugtafigyelő
-- mostantól CSAK ezeket jelzi (a több-befizetős ismétlődést nem).


-- ── 2) RÉSZLETEK csak a VALÓDI duplikátumokhoz (ha van) — a megtaláláshoz ────
-- (Futtasd KÜLÖN, ha az 1) mutat VALÓDI DUPLIKÁTUM sort.)
WITH params AS (
  SELECT '43cff37f-1131-4c79-8082-0e8af61cf40a'::uuid AS cid, 2025::int AS ev
),
base AS (
  SELECT
    b.id,
    substring(b.nyugta from '[0-9]+')::numeric        AS irat_sz,
    b.nyugta, b.iratszam,
    regexp_replace(btrim(b.iratszam), '/\d+\s*$', '') AS keruleti_alap,
    b.datum, b.forrasa, b.osszeg
  FROM public.befizetes b, params
  WHERE b.congregation_id = params.cid
    AND EXTRACT(YEAR FROM b.datum)::int = params.ev
    AND COALESCE(b.deleted,false) = false
    AND b.bankszamla_id IS NULL
    AND b.belso_mozgas_xkey IS NULL
    AND b.nyugta IS NOT NULL
    AND b.nyugta <> b.iratszam
),
valodi AS (
  SELECT irat_sz FROM base GROUP BY irat_sz HAVING count(DISTINCT keruleti_alap) > 1
)
SELECT b.irat_sz AS irat_szam, b.datum, b.iratszam AS keruleti_sz, b.keruleti_alap,
       b.forrasa AS befizeto, b.osszeg
FROM base b
JOIN valodi v ON v.irat_sz = b.irat_sz
ORDER BY b.irat_sz, b.keruleti_alap, b.datum;
