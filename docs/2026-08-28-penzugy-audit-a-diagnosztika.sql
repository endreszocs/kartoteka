-- ============================================================================
-- 2026-08-28 · Pénzügyi audit A-blokk — 0. lépés: ÉLES DIAGNOSZTIKA
-- ============================================================================
-- CSAK OLVAS. Semmilyen adatot nem módosít.
--
-- Célja: az A2-es javítások (P0-2, P0-3, P0-6, P0-10, P0-18) élességének és az
-- esetleges adatjavítás méretének felmérése, MIELŐTT kódot vagy indexet
-- változtatnánk ("a migration-fájl nem bizonyíték" szabály szerint).
--
-- Futtatás: Supabase SQL editor, EGYBEN (egyetlen statement, egyetlen
-- eredmény-rács — az editor csak az utolsó rácsot mutatja, ezért UNION ALL).
-- Az eredményt kérlek sorszám szerint küldd vissza.
--
-- Értelmezés röviden:
--   1–2:  P0-2  — ha 0, a kiadas.datum felső határ egységesítése tisztán kód-ügy
--   3–4:  ha 0, a cent-kerekítés bevezetése tisztán megelőző jellegű
--   5–6:  P0-3  — hány "carryover" nyitó-sor tér el a számolt értéktől
--   7:    P0-18 — van-e egyáltalán devizás számla és forgalom (BNR-hiba élessége)
--   8:    P0-10 — felvehető-e veszély nélkül az xkey UNIQUE index
--   9:    P0-6  — szerkesztés után elavult osszeg_ron gyanúja
--   10:   P0-8/P0-9 — pontos duplikátum-többletsorok (dupla-mentés áldozatai)
-- ============================================================================

WITH
nem_ejfeli AS (
  SELECT count(*) AS db, min(datum) AS mn, max(datum) AS mx
  FROM public.kiadas
  WHERE datum::time <> '00:00:00'
),
nem_ejfeli_dec31 AS (
  SELECT count(*) AS db
  FROM public.kiadas
  WHERE datum::time <> '00:00:00'
    AND extract(month FROM datum) = 12
    AND extract(day FROM datum) = 31
),
subcent_bef AS (
  SELECT count(*) AS db
  FROM public.befizetes
  WHERE osszeg <> round(osszeg, 2)
     OR (osszeg_ron IS NOT NULL AND osszeg_ron <> round(osszeg_ron, 2))
),
subcent_kia AS (
  SELECT count(*) AS db
  FROM public.kiadas
  WHERE osszeg <> round(osszeg, 2)
     OR (osszeg_ron IS NOT NULL AND osszeg_ron <> round(osszeg_ron, 2))
),
-- P0-3: minden 'carryover' forrású banki nyitó-sorhoz kiszámoljuk, mennyinek
-- KELLENE lennie (előző évi nyitó + előző évi nem stornózott, nem törölt
-- banki forgalom RON-ban), és összevetjük a tárolttal.
carry AS (
  SELECT
    c.id,
    c.bankszamla_id,
    c.congregation_id,
    c.eve,
    c.nyito_egyenleg_ron AS tarolt,
    p.nyito_egyenleg_ron AS elozo_nyito,
    (SELECT coalesce(sum(coalesce(b.osszeg_ron, b.osszeg)), 0)
       FROM public.befizetes b
      WHERE b.bankszamla_id = c.bankszamla_id
        AND b.congregation_id = c.congregation_id
        AND b.deleted = false
        AND b.stornozott = false
        AND b.datum >= make_date(c.eve - 1, 1, 1)
        AND b.datum <  make_date(c.eve, 1, 1)) AS bev,
    (SELECT coalesce(sum(coalesce(k.osszeg_ron, k.osszeg)), 0)
       FROM public.kiadas k
      WHERE k.bankszamla_id = c.bankszamla_id
        AND k.congregation_id = c.congregation_id
        AND k.deleted = false
        AND k.stornozott = false
        AND k.datum >= make_date(c.eve - 1, 1, 1)::timestamp
        AND k.datum <  make_date(c.eve, 1, 1)::timestamp) AS kia
  FROM public.bankszamla_nyito_egyenleg c
  -- LATERAL, hogy több előző évi sor esetén se sokszorozzon (a legfrissebbet vesszük)
  LEFT JOIN LATERAL (
    SELECT p2.nyito_egyenleg_ron
    FROM public.bankszamla_nyito_egyenleg p2
    WHERE p2.bankszamla_id = c.bankszamla_id
      AND p2.congregation_id = c.congregation_id
      AND p2.eve = c.eve - 1
    ORDER BY p2.updated_at DESC
    LIMIT 1
  ) p ON true
  WHERE c.forrasa = 'carryover'
),
carry_ertekelt AS (
  SELECT
    *,
    round(tarolt - (elozo_nyito + bev - kia), 2) AS elteres
  FROM carry
  WHERE elozo_nyito IS NOT NULL
),
carry_rossz AS (
  SELECT
    count(*) AS db,
    coalesce(max(abs(elteres)), 0) AS max_elteres,
    coalesce(sum(abs(elteres)), 0) AS ossz_elteres
  FROM carry_ertekelt
  WHERE abs(elteres) > 0.005
),
carry_nem_ellenorizheto AS (
  SELECT count(*) AS db FROM carry WHERE elozo_nyito IS NULL
),
devizas AS (
  SELECT count(*) AS szamlak
  FROM public.bankszamlak
  WHERE valuta IS DISTINCT FROM 'RON'
),
devizas_forgalom AS (
  SELECT
    (SELECT count(*)
       FROM public.befizetes b
       JOIN public.bankszamlak ba ON ba.id = b.bankszamla_id
      WHERE ba.valuta IS DISTINCT FROM 'RON')
    +
    (SELECT count(*)
       FROM public.kiadas k
       JOIN public.bankszamlak ba ON ba.id = k.bankszamla_id
      WHERE ba.valuta IS DISTINCT FROM 'RON') AS db
),
xkey_dupla AS (
  SELECT
    (SELECT count(*) FROM (
       SELECT xkey FROM public.befizetes GROUP BY xkey HAVING count(*) > 1
     ) t) AS bef,
    (SELECT count(*) FROM (
       SELECT xkey FROM public.kiadas GROUP BY xkey HAVING count(*) > 1
     ) t2) AS kia
),
ron_elteres AS (
  SELECT
    (SELECT count(*)
       FROM public.befizetes
      WHERE osszeg_ron IS NOT NULL
        AND coalesce(arfolyam, 1) = 1
        AND round(osszeg, 2) <> round(osszeg_ron, 2)) AS bef,
    (SELECT count(*)
       FROM public.kiadas
      WHERE osszeg_ron IS NOT NULL
        AND coalesce(arfolyam, 1) = 1
        AND round(osszeg, 2) <> round(osszeg_ron, 2)) AS kia
),
pontos_dupla AS (
  SELECT
    (SELECT coalesce(sum(db - 1), 0) FROM (
       SELECT count(*) AS db
       FROM public.befizetes
       WHERE deleted = false AND stornozott = false
       GROUP BY congregation_id, datum, osszeg, id_befizetescel, forrasa, nyugta, iratszam
       HAVING count(*) > 1
     ) t) AS bef,
    (SELECT coalesce(sum(db - 1), 0) FROM (
       SELECT count(*) AS db
       FROM public.kiadas
       WHERE deleted = false AND stornozott = false
       GROUP BY congregation_id, datum, osszeg, id_kiadascel, atvevo, nyugta, iratszam
       HAVING count(*) > 1
     ) t2) AS kia
)
SELECT * FROM (
  SELECT
    1 AS sorszam,
    'P0-2 — nem-éjféli kiadas.datum sorok' AS kerdes,
    (SELECT db::text FROM nem_ejfeli) AS eredmeny,
    (SELECT CASE
       WHEN db = 0 THEN 'nincs ilyen sor — a felső határ egységesítése tisztán kód-ügy'
       ELSE 'min: ' || mn::text || ' · max: ' || mx::text || ' — ADATJAVÍTÁS-egyeztetés kell'
     END FROM nem_ejfeli) AS reszlet
  UNION ALL
  SELECT 2, 'P0-2 — ebből dec. 31-i (kockázatos)',
    (SELECT db::text FROM nem_ejfeli_dec31),
    'a web éves zárása ezeket ma kihagyná'
  UNION ALL
  SELECT 3, 'Sub-centes tárolt összeg — befizetes',
    (SELECT db::text FROM subcent_bef),
    '0 = a cent-kerekítés bevezetése tisztán megelőző'
  UNION ALL
  SELECT 4, 'Sub-centes tárolt összeg — kiadas',
    (SELECT db::text FROM subcent_kia),
    ''
  UNION ALL
  SELECT 5, 'P0-3 — elavult carryover nyitó-sorok',
    (SELECT db::text FROM carry_rossz),
    (SELECT 'max eltérés: ' || max_elteres::text || ' RON · összes: '
            || ossz_elteres::text || ' RON' FROM carry_rossz)
  UNION ALL
  SELECT 6, 'P0-3 — nem ellenőrizhető carryover (nincs előző évi nyitó-sor)',
    (SELECT db::text FROM carry_nem_ellenorizheto),
    ''
  UNION ALL
  SELECT 7, 'P0-18 — nem-RON bankszámlák',
    (SELECT szamlak::text FROM devizas),
    (SELECT 'forgalom rajtuk (befizetes+kiadas): ' || db::text || ' sor'
       FROM devizas_forgalom)
  UNION ALL
  SELECT 8, 'P0-10 — xkey-duplikátum csoportok (befizetes | kiadas)',
    (SELECT bef::text || ' | ' || kia::text FROM xkey_dupla),
    '0 | 0 = az xkey UNIQUE index veszély nélkül felvehető'
  UNION ALL
  SELECT 9, 'P0-6 — elavult osszeg_ron gyanú (befizetes | kiadas)',
    (SELECT bef::text || ' | ' || kia::text FROM ron_elteres),
    'osszeg_ron eltér az osszeg-től, miközben arfolyam=1 — szerkesztés utáni maradvány'
  UNION ALL
  SELECT 10, 'P0-8/P0-9 — pontos duplikátum-TÖBBLETsorok (befizetes | kiadas)',
    (SELECT bef::text || ' | ' || kia::text FROM pontos_dupla),
    'minden azonosító mező azonos — lehetséges dupla-mentés / részleges köteg áldozatai'
) x
ORDER BY sorszam;
