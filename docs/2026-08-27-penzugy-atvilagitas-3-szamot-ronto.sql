-- ============================================================================
--  KARTOTÉKA — PÉNZÜGY ÁTVILÁGÍTÁS · 3. KÖR: "RONT-E SZÁMOT?"
--  2026-08-27
--
--  Ez a kör azt dönti el, hogy a kódban talált hibalehetőségek az ÉLES ADATON
--  okoznak-e ténylegesen hibás számot — vagy csak elméleti kockázatok.
--  Minden oszlopnév az 1-2. körben élesben megerősített.
--
--  TELJESEN READ-ONLY. Egyetlen utasítás (UNION ALL).
-- ============================================================================

SELECT * FROM (

-- ── 1. SZAKASZ: A DECEMBER 31-I CSAPDA ────────────────────────────────────
--    A kiadas.datum timestamp, a szűrés viszont .lte('datum','<év>-12-31'),
--    ami = '<év>-12-31 00:00:00'. Minden nem-éjféli dec. 31-i kiadás KIMARAD
--    a Számadás forrásából. Itt derül ki, van-e ilyen sor ténylegesen.
SELECT 10 AS sorrend,
       '1a. NEM-ÉJFÉLI IDŐBÉLYEG a kiadas-on'::text AS szakasz,
       ('év ' || EXTRACT(year FROM k.datum)::int::text)::text AS targy,
       (count(*) FILTER (WHERE k.datum::time <> '00:00:00'))::text AS eredmeny,
       ('összes sor az évben: ' || count(*)::text)::text AS reszletek
  FROM public.kiadas k
 WHERE k.deleted = false
 GROUP BY EXTRACT(year FROM k.datum)::int

UNION ALL
SELECT 11,
       '1b. ⛔ DEC. 31-I KIADÁS, AMI KIESIK A SZÁMADÁSBÓL',
       (to_char(k.datum, 'YYYY-MM-DD HH24:MI:SS') || ' · ' || COALESCE(k.iratszam, '?'))::text,
       COALESCE(k.osszeg_ron, k.osszeg)::text,
       ('irattipus: ' || COALESCE(k.irattipus, '(üres)')
        || ' · átvevő: ' || COALESCE(left(k.atvevo, 40), '—'))::text
  FROM public.kiadas k
 WHERE k.deleted = false
   AND EXTRACT(month FROM k.datum) = 12
   AND EXTRACT(day   FROM k.datum) = 31
   AND k.datum::time <> '00:00:00'

UNION ALL
-- ── 2. SZAKASZ: BELSŐ MOZGÁS — KETTŐS SZÁMBAVÉTEL MÉRTÉKE ─────────────────
--    A szamadasicel.belsotetel csak 300.01-nél és 402.02-nél van kitöltve,
--    a 301.01 / 400.01 / 401.01 aktív, de JELÖLETLEN. Mennyi forgalom ül
--    ezeken a jelöletlen kódokon? Ennyivel lehet felfújt az összesen.
SELECT 20,
       '2a. BEVÉTEL a belső mozgás kódokon',
       (sc.id::text || ' · ' || COALESCE(sc.nev, '?'))::text,
       (count(*)::text || ' tétel · ' || COALESCE(sum(COALESCE(b.osszeg_ron, b.osszeg)), 0)::text || ' RON')::text,
       ('szamadasicel.belsotetel: ' || COALESCE(sc.belsotetel, '### NULL — JELÖLETLEN ###')
        || ' · befizetescel.belsotetel: ' || COALESCE(bc.belsotetel, 'NULL'))::text
  FROM public.befizetes b
  JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
  JOIN public.szamadasicel sc ON sc.id = bc.id_szamadasicel
 WHERE b.deleted = false
   AND sc.id IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02','100.51','100.52')
 GROUP BY sc.id, sc.nev, sc.belsotetel, bc.belsotetel

UNION ALL
SELECT 21,
       '2b. KIADÁS a belső mozgás kódokon',
       (sc.id::text || ' · ' || COALESCE(sc.nev, '?'))::text,
       (count(*)::text || ' tétel · ' || COALESCE(sum(COALESCE(k.osszeg_ron, k.osszeg)), 0)::text || ' RON')::text,
       ('szamadasicel.belsotetel: ' || COALESCE(sc.belsotetel, '### NULL — JELÖLETLEN ###')
        || ' · kiadascel.belsotetel: ' || COALESCE(kc.belsotetel, 'NULL'))::text
  FROM public.kiadas k
  JOIN public.kiadascel kc  ON kc.id = k.id_kiadascel
  JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
 WHERE k.deleted = false
   AND sc.id IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02','100.51','100.52')
 GROUP BY sc.id, sc.nev, sc.belsotetel, kc.belsotetel

UNION ALL
-- ── 2c. Van-e olyan belső mozgás sor, aminek NINCS belso_mozgas_xkey-e? ────
--       Az ilyen sor a párosításból is kiesik ÉS a jelentésből sem szűrhető.
SELECT 22,
       '2c. BELSŐ MOZGÁS KÓD, DE NINCS PÁROSÍTÓ KULCS',
       (x.tabla || ' · ' || x.kod)::text,
       (x.db::text || ' tétel')::text,
       'ezek a sorok se nem párosíthatók, se nem szűrhetők ki'::text
  FROM (
        SELECT 'befizetes'::text AS tabla, sc.id::text AS kod, count(*) AS db
          FROM public.befizetes b
          JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
          JOIN public.szamadasicel sc ON sc.id = bc.id_szamadasicel
         WHERE b.deleted = false
           AND sc.id IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02')
           AND b.belso_mozgas_xkey IS NULL
         GROUP BY sc.id
        UNION ALL
        SELECT 'kiadas'::text, sc.id::text, count(*)
          FROM public.kiadas k
          JOIN public.kiadascel kc  ON kc.id = k.id_kiadascel
          JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
         WHERE k.deleted = false
           AND sc.id IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02')
           AND k.belso_mozgas_xkey IS NULL
         GROUP BY sc.id
       ) x

UNION ALL
-- ── 3. SZAKASZ: A DUPLIKÁTUM-FIGYELMEZTETÉS ÁLRIASZTÁS-PRÓBÁJA ────────────
--    A 8. ponthoz: ha MA bevezetnénk a szabályt (azonos összeg + ±3 nap +
--    banki oldal), hány találatot adna a MEGLÉVŐ adaton? Ez méri a zajt.
--    A belső mozgás párokat KIZÁRJUK (belso_mozgas_xkey IS NULL mindkét oldalon),
--    mert azok definíció szerint azonos dátumúak és összegűek.
SELECT 30,
       '3a. ÁLRIASZTÁS-PRÓBA — kassza-sor, amire a szabály rászólna',
       ('kassza #' || kp.id::text || ' · ' || kp.datum::text
        || ' · ' || kp.osszeg::text)::text,
       (kp.talalat::text || ' banki párjelölt')::text,
       ('forrasa: ' || COALESCE(left(kp.forrasa, 45), '—'))::text
  FROM (
        SELECT b.id, b.datum, b.osszeg, b.forrasa,
               (SELECT count(*)
                  FROM public.befizetes bb
                 WHERE bb.congregation_id = b.congregation_id
                   AND bb.bankszamla_id IS NOT NULL
                   AND bb.belso_mozgas_xkey IS NULL
                   AND bb.deleted = false
                   AND bb.stornozott = false
                   AND bb.id <> b.id
                   AND abs(COALESCE(bb.osszeg_ron, bb.osszeg) - b.osszeg) <= 0.01
                   AND bb.datum BETWEEN b.datum - 3 AND b.datum + 3
               ) AS talalat
          FROM public.befizetes b
         WHERE b.bankszamla_id IS NULL
           AND b.belso_mozgas_xkey IS NULL
           AND b.deleted = false
           AND b.stornozott = false
       ) kp
 WHERE kp.talalat > 0

UNION ALL
SELECT 31,
       '3b. ÁLRIASZTÁS-PRÓBA ÖSSZESÍTŐ',
       'kassza-sorok, amikre rászólna'::text,
       (SELECT count(*)::text FROM (
          SELECT b.id
            FROM public.befizetes b
           WHERE b.bankszamla_id IS NULL AND b.belso_mozgas_xkey IS NULL
             AND b.deleted = false AND b.stornozott = false
             AND EXISTS (SELECT 1 FROM public.befizetes bb
                          WHERE bb.congregation_id = b.congregation_id
                            AND bb.bankszamla_id IS NOT NULL
                            AND bb.belso_mozgas_xkey IS NULL
                            AND bb.deleted = false AND bb.stornozott = false
                            AND bb.id <> b.id
                            AND abs(COALESCE(bb.osszeg_ron, bb.osszeg) - b.osszeg) <= 0.01
                            AND bb.datum BETWEEN b.datum - 3 AND b.datum + 3)
        ) q)::text,
       (SELECT 'összes kassza-bevétel: ' || count(*)::text
          FROM public.befizetes
         WHERE bankszamla_id IS NULL AND belso_mozgas_xkey IS NULL
           AND deleted = false AND stornozott = false)::text

UNION ALL
-- ── 4. SZAKASZ: A MAI IMPORT 23 TÉTELE — mi ment be pontosan? ─────────────
SELECT 40,
       '4. A MAI IMPORT TÉTELEI',
       (b.datum::text || ' · ' || COALESCE(b.iratszam, '?'))::text,
       COALESCE(b.osszeg_ron, b.osszeg)::text,
       ('cél: ' || COALESCE(bc.nev, '?')
        || ' · forrasa: ' || COALESCE(left(b.forrasa, 40), '—')
        || ' · személy: ' || (CASE WHEN b.id_szemely IS NULL THEN 'NINCS' ELSE 'van' END)
        || ' · bm_xkey: ' || (CASE WHEN b.belso_mozgas_xkey IS NULL THEN 'nincs' ELSE 'VAN' END))::text
  FROM public.befizetes b
  LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
 WHERE b.updated_at::date = DATE '2026-08-27'
   AND b.deleted = false

UNION ALL
-- ── 5. SZAKASZ: BANKI TÉTEL BANKSZÁMLA NÉLKÜL (adatminőség) ───────────────
--    A 2. körben látszott: 65 'OP' kiadásból csak 55 van számlához kötve.
--    Ezek a sorok a banki egyenlegből kimaradnak.
SELECT 50,
       '5. BANKI JELLEGŰ TÉTEL, DE NINCS BANKSZÁMLÁHOZ KÖTVE',
       (y.tabla || ' · ' || y.tip)::text,
       (y.db::text || ' tétel')::text,
       'ezek nem számítanak bele egyik bankszámla egyenlegébe sem'::text
  FROM (
        SELECT 'kiadas'::text AS tabla, COALESCE(irattipus, '(üres)') AS tip, count(*) AS db
          FROM public.kiadas
         WHERE deleted = false AND bankszamla_id IS NULL
           AND irattipus IN ('Extr','OP','banki','Banki')
         GROUP BY irattipus
        UNION ALL
        SELECT 'befizetes'::text, COALESCE(irattipus, '(üres)'), count(*)
          FROM public.befizetes
         WHERE deleted = false AND bankszamla_id IS NULL
           AND irattipus IN ('Extr','OP','banki','Banki')
         GROUP BY irattipus
       ) y

UNION ALL
-- ── 6. SZAKASZ: import_logs — naplóz-e a banki import? ────────────────────
SELECT 60,
       '6. IMPORT NAPLÓ',
       (il.created_at::date::text || ' · ' || COALESCE(il.module, '?'))::text,
       ('beírt: ' || il.total_inserted::text || ' · kihagyott: ' || il.total_skipped::text)::text,
       ('fájl: ' || COALESCE(left(il.file_name, 50), '—')
        || ' · hibák: ' || (CASE WHEN il.errors IS NULL THEN 'nincs'
                                 ELSE left(il.errors::text, 60) END))::text
  FROM public.import_logs il

UNION ALL
-- ── 7. SZAKASZ: ÜRES IRATTIPUS (adatminőség) ─────────────────────────────
SELECT 70,
       '7. ÜRES/HIÁNYZÓ IRATTIPUS',
       (z.tabla)::text,
       (z.db::text || ' tétel')::text,
       'az irattipus NOT NULL, de üres szöveg is lehet'::text
  FROM (
        SELECT 'kiadas'::text AS tabla, count(*) AS db
          FROM public.kiadas WHERE deleted = false AND btrim(COALESCE(irattipus, '')) = ''
        UNION ALL
        SELECT 'befizetes'::text, count(*)
          FROM public.befizetes WHERE deleted = false AND btrim(COALESCE(irattipus, '')) = ''
       ) z
 WHERE z.db > 0

) AS osszes
ORDER BY sorrend, targy;
