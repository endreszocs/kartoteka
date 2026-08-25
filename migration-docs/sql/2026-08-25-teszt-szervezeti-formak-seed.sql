-- ============================================================================
-- 2026-08-25 — TESZT GYÜLEKEZETEK A NÉGY SZERVEZETI FORMÁRA (fiktív demo-seed)
-- ============================================================================
-- Endre kérése: mindegyik szervezeti formára egy teszt-gyülekezet, adatokkal,
-- hogy látsszon a működés. Minden adat KITALÁLT, a meglévő Teszt-hierarchiába
-- (Teszt Egyházkerület / Teszt Egyházmegye) kerül — valódi megyét nem érint.
--
-- MIT HOZ LÉTRE:
--   1) ANYAEGYHÁZKÖZSÉG — a meglévő „Teszt gyülekezet" (…0003) kap:
--      • 2 egységet: „Tesztkisfalu" (leányegyházközség) + „Szórványliget" (szórvány)
--      • 18 meglévő fiktív tag egység-besorolást (12 leány + 6 szórvány)
--      • 7 új, egység-címkés munkanapló-bejegyzést (megjegyzés: TESZT-EGYSEG-DEMO)
--   2) LEÁNYEGYHÁZKÖZSÉG — ÚJ „Teszt Leányegyházközség (Kisfalu)" (…0004),
--      anyja a …0003; 6 fiktív tag + 2 munkanapló-sor (a térkép-kapcsolat demója)
--   3) MISSZIÓI EGYHÁZKÖZSÉG — ÚJ „Teszt Missziói Egyházközség" (…0005),
--      3 szórvány-egység (Alsóteszt / Felsőteszt / Tesztújfalu), 12 tag
--      (3 központ + 3-3-3 falvanként), 7 munkanapló-sor falvanként forogva
--   4) TÁRSEGYHÁZKÖZSÉG — ÚJ „Teszt Társegyházközség" (…0006),
--      2 egyházrész (Nagytesztfalvi / Kistesztfalvi), 12 tag (6-6),
--      7 munkanapló-sor: vasárnap de. az egyik, du. a másik egyházrészben
--      + 1 közös alkalom (a klasszikus társ-működés demója)
--
-- ELŐFELTÉTEL: a 2026-08-25-gyulekezeti-egysegek.sql LEFUTOTT (ellenőrizzük).
-- IDEMPOTENS: újrafuttatható — fix UUID-k + ON CONFLICT + NOT EXISTS őrök;
--   session-állapotra (TEMP tábla) SEMMI nem támaszkodik.
-- VISSZAVONÁS: 2026-08-25-teszt-szervezeti-formak-teardown.sql
--
-- KONVENCIÓK (a 2026-08-09-teszt-gyulekezet-seed.sql mintájára):
--   • cnp: 'EC-TSZT2-…' determinisztikus azonosítók, ON CONFLICT-védetten
--   • vezetéknevek KITALÁLTAK, telefonok 0799 002 xxx álszámok
--     (kereszt-gyülekezeti egyeztető trigger nyugalma) + értesítés-takarítás
--   • szemely.c_utcaid NOT NULL: a gyülekezet adrstreet_id-ja, híján a
--     katalógus első utcája; a fiktív cím a c_szcim szövegmezőben él
-- ============================================================================

-- Fix azonosítók (mindenhol szó szerint — nincs session-változó):
--   kerület  7e570000-0000-4000-8000-000000000001
--   megye    7e570000-0000-4000-8000-000000000002
--   ANYA     7e570000-0000-4000-8000-000000000003  (meglévő Teszt gyülekezet)
--   LEÁNY    7e570000-0000-4000-8000-000000000004
--   MISSZIÓI 7e570000-0000-4000-8000-000000000005
--   TÁRS     7e570000-0000-4000-8000-000000000006
--   egységek 7e570000-0000-4000-8000-0000000000a1 … a7

-- ════════════════════════════════════════════════════════════════════════════
-- 0. BLOKK — Előfeltétel-őr + Teszt-hierarchia biztosítása (idempotens)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='congregations'
                   AND column_name='szervezeti_tipus')
     OR to_regclass('public.gyulekezeti_egysegek') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL HIÁNYZIK: futtasd előbb a 2026-08-25-gyulekezeti-egysegek.sql migrációt.';
  END IF;
END $$;

INSERT INTO public.districts (id, name)
VALUES ('7e570000-0000-4000-8000-000000000001', 'Teszt Egyházkerület')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dioceses (id, district_id, name, cim_orszag)
VALUES ('7e570000-0000-4000-8000-000000000002',
        '7e570000-0000-4000-8000-000000000001',
        'Teszt Egyházmegye', 'Románia')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.congregations
  (id, name, nev_hu, district, egyhazmegye, diocese_id, country,
   varos, megye, cim, eves_jarulek, jarulek_hatarid, status)
VALUES
  ('7e570000-0000-4000-8000-000000000003',
   'Teszt gyülekezet', 'Teszt gyülekezet',
   'Teszt Egyházkerület', 'Teszt Egyházmegye',
   '7e570000-0000-4000-8000-000000000002', 'Románia',
   'Tesztfalva', 'Teszt megye', 'Fő utca 1.', 100, '07-01', 'active')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. BLOKK — ANYAEGYHÁZKÖZSÉG: a Teszt gyülekezet egységei + címkék
-- ════════════════════════════════════════════════════════════════════════════

-- A forma rögzítése (a névminta-backfill nem érinti; idempotens)
UPDATE public.congregations
   SET szervezeti_tipus = 'anya', anya_congregation_id = NULL
 WHERE id = '7e570000-0000-4000-8000-000000000003'
   AND (szervezeti_tipus <> 'anya' OR anya_congregation_id IS NOT NULL);

INSERT INTO public.gyulekezeti_egysegek
  (id, congregation_id, nev, tipus, sorrend, aktiv, megjegyzes)
VALUES
  ('7e570000-0000-4000-8000-0000000000a1', '7e570000-0000-4000-8000-000000000003',
   'Tesztkisfalu', 'leany', 1, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)'),
  ('7e570000-0000-4000-8000-0000000000a2', '7e570000-0000-4000-8000-000000000003',
   'Szórványliget', 'szorvany', 2, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)')
ON CONFLICT (id) DO NOTHING;

-- 18 meglévő fiktív tag besorolása (determinisztikus: id-sorrend; csak a még
-- besorolatlanokat írja — kézi átsorolást nem ír felül)
WITH rangsor AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM public.szemely
  WHERE congregation_id = '7e570000-0000-4000-8000-000000000003'
    AND isvisible AND NOT meghalt
)
UPDATE public.szemely sz
   SET egyseg_id = CASE
     WHEN r.rn BETWEEN 31 AND 42 THEN '7e570000-0000-4000-8000-0000000000a1'::uuid
     WHEN r.rn BETWEEN 43 AND 48 THEN '7e570000-0000-4000-8000-0000000000a2'::uuid
   END
  FROM rangsor r
 WHERE sz.id = r.id
   AND sz.egyseg_id IS NULL
   AND r.rn BETWEEN 31 AND 48;

-- 7 egység-címkés munkanapló-sor (csak ha még nincs demo-sor — idempotens)
INSERT INTO public.munkanaplo
  (idopont, jellege, kategoria, bibliaolvasas, alapige, cim, enekek,
   jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
   szolgalt, persely, du, deleted, congregation_id, egyseg_id, megjegyzes, created)
SELECT v.*
FROM (VALUES
  -- Tesztkisfalu (leány-egység): vasárnap DÉLUTÁNI istentiszteletek
  (DATE '2026-06-07', 'istentisztelet', 'szolgalat', 'Zsolt 84',   'Zsolt 84,5',  'Boldogok, akik házadban laknak', '42, 274',  6, 11, 2, 19, 'Teszt Lelkész', 31::numeric, true,  false,
   '7e570000-0000-4000-8000-000000000003'::uuid, '7e570000-0000-4000-8000-0000000000a1'::uuid, 'TESZT-EGYSEG-DEMO', now()),
  (DATE '2026-06-21', 'istentisztelet', 'szolgalat', 'Mk 4,35-41', 'Mk 4,39',     'A vihar lecsendesítése',         '65, 396',  7, 12, 3, 22, 'Teszt Lelkész', 36, true,  false,
   '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-0000000000a1', 'TESZT-EGYSEG-DEMO', now()),
  (DATE '2026-07-05', 'istentisztelet', 'szolgalat', 'Jn 15,1-8',  'Jn 15,5',     'A szőlőtő és a szőlővesszők',    '25, 434',  5, 10, 2, 17, 'Teszt Lelkész', 28, true,  false,
   '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-0000000000a1', 'TESZT-EGYSEG-DEMO', now()),
  (DATE '2026-07-16', 'bibliaóra',      'katekezis', 'Fil 4,4-9',  'Fil 4,6',     'Semmiért ne aggódjatok',         '165',      3,  6, 0,  9, 'Teszt Lelkész', NULL, false, false,
   '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-0000000000a1', 'TESZT-EGYSEG-DEMO', now()),
  -- Szórványliget (szórvány): havi egy alkalom, háznál
  (DATE '2026-06-14', 'istentisztelet', 'szolgalat', 'Zsolt 23',   'Zsolt 23,1',  'Az Úr az én pásztorom (háznál)', '42',       3,  5, 1,  9, 'Teszt Lelkész', 14, true,  false,
   '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-0000000000a2', 'TESZT-EGYSEG-DEMO', now()),
  (DATE '2026-07-12', 'istentisztelet', 'szolgalat', 'Lk 12,22-32','Lk 12,32',    'Ne félj, te kicsiny nyáj',       '65',       2,  6, 0,  8, 'Teszt Lelkész', 12, true,  false,
   '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-0000000000a2', 'TESZT-EGYSEG-DEMO', now()),
  (DATE '2026-08-09', 'istentisztelet', 'szolgalat', 'Zsid 13,1-8','Zsid 13,8',   'Jézus Krisztus ugyanaz',         '90',       3,  4, 1,  8, 'Teszt Lelkész', 15, true,  false,
   '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-0000000000a2', 'TESZT-EGYSEG-DEMO', now())
) AS v(idopont, jellege, kategoria, bibliaolvasas, alapige, cim, enekek,
       jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
       szolgalt, persely, du, deleted, congregation_id, egyseg_id, megjegyzes, created)
WHERE NOT EXISTS (
  SELECT 1 FROM public.munkanaplo m
  WHERE m.congregation_id = '7e570000-0000-4000-8000-000000000003'
    AND m.megjegyzes = 'TESZT-EGYSEG-DEMO'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. BLOKK — LEÁNYEGYHÁZKÖZSÉG (új gyülekezet, anyja a Teszt gyülekezet)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.congregations
  (id, name, nev_hu, district, egyhazmegye, diocese_id, country,
   varos, megye, cim, eves_jarulek, jarulek_hatarid, status,
   szervezeti_tipus, anya_congregation_id)
VALUES
  ('7e570000-0000-4000-8000-000000000004',
   'Teszt Leányegyházközség (Kisfalu)', 'Teszt Leányegyházközség (Kisfalu)',
   'Teszt Egyházkerület', 'Teszt Egyházmegye',
   '7e570000-0000-4000-8000-000000000002', 'Románia',
   'Tesztkisfalu', 'Teszt megye', 'Templom utca 2.', 100, '07-01', 'active',
   'leany', '7e570000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Ha a sor már korábban létezett forma nélkül: a kapcsolat pótlása
UPDATE public.congregations
   SET szervezeti_tipus = 'leany',
       anya_congregation_id = '7e570000-0000-4000-8000-000000000003'
 WHERE id = '7e570000-0000-4000-8000-000000000004'
   AND (szervezeti_tipus <> 'leany' OR anya_congregation_id IS DISTINCT FROM '7e570000-0000-4000-8000-000000000003');

DO $$
DECLARE
  v_cong uuid := '7e570000-0000-4000-8000-000000000004';
  v_utca integer; v_helyseg integer;
BEGIN
  SELECT c.adrstreet_id, c.adrlocality_id INTO v_utca, v_helyseg
  FROM public.congregations c WHERE c.id = v_cong;
  IF v_utca IS NULL THEN SELECT id INTO v_utca FROM public.adrstreet ORDER BY id LIMIT 1; END IF;
  IF v_utca IS NULL THEN RAISE EXCEPTION 'Üres az adrstreet katalógus.'; END IF;
  IF v_helyseg IS NULL THEN SELECT localityid INTO v_helyseg FROM public.adrstreet WHERE id = v_utca; END IF;

  INSERT INTO public.szemely
    (cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
     sz_datum, vallas, foglalkozas, nemzetiseg, c_utcaid, c_szam, c_szcim,
     telefon, befizetoev, isvisible, type, member_status,
     congregation_id, c_helysegid, created)
  SELECT v.cnp, v.csaladnev, v.k_nev, v.szcs_nev, v.allapot, v.csaladfo,
         v.ferfi, v.meghalt, v.sz_datum::date, 'református', v.foglalkozas,
         'magyar', v_utca, v.c_szam, 'Tesztkisfalu, Templom utca ' || v.c_szam,
         v.telefon, v.befizetoev, true, 'E', 'aktív', v_cong, v_helyseg, now()
  FROM (VALUES
    ('EC-TSZT2-L01','Leányfalvi','Márton',  NULL,         'nős',       true,  true,  false, '1955-02-10', 'nyugdíjas',   '0799 002 101', '3', 1990),
    ('EC-TSZT2-L02','Leányfalvi','Erzsébet','Fiókteleki', 'férjezett', false, false, false, '1958-06-21', 'nyugdíjas',   '0799 002 102', '3', 1990),
    ('EC-TSZT2-L03','Fiókteleki','Sándor',  NULL,         'nős',       true,  true,  false, '1974-09-14', 'gazdálkodó',  '0799 002 103', '5', 1996),
    ('EC-TSZT2-L04','Fiókteleki','Katalin', 'Leányvári',  'férjezett', false, false, false, '1977-12-01', 'eladó',       '0799 002 104', '5', 1998),
    ('EC-TSZT2-L05','Fiókteleki','Dorka',   NULL,         'hajadon',   false, false, false, '2006-03-27', 'tanuló',      NULL,           '5', 2026),
    ('EC-TSZT2-L06','Leányvári','Ferenc',   NULL,         'özvegy',    true,  true,  false, '1948-08-19', 'nyugdíjas',   '0799 002 105', '7', 1990)
  ) AS v(cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
         sz_datum, foglalkozas, telefon, c_szam, befizetoev)
  ON CONFLICT (cnp) DO NOTHING;

  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, bibliaolvasas, alapige, cim, enekek,
     jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
     szolgalt, persely, du, deleted, congregation_id, megjegyzes, created)
  SELECT * FROM (VALUES
    (DATE '2026-07-19', 'istentisztelet', 'szolgalat', 'Zsolt 121', 'Zsolt 121,2', 'Segítségem az Úrtól jön', '42, 165', 3, 5, 1, 9, 'Teszt Lelkész', 16::numeric, true, false,
     '7e570000-0000-4000-8000-000000000004'::uuid, 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-08-02', 'istentisztelet', 'szolgalat', 'Mt 6,25-34', 'Mt 6,33', 'Keressétek először Isten országát', '65, 254', 4, 6, 0, 10, 'Teszt Lelkész', 18, true, false,
     '7e570000-0000-4000-8000-000000000004', 'TESZT-EGYSEG-DEMO', now())
  ) AS v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.munkanaplo m
    WHERE m.congregation_id = v_cong AND m.megjegyzes = 'TESZT-EGYSEG-DEMO'
  );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. BLOKK — MISSZIÓI EGYHÁZKÖZSÉG (új gyülekezet, 3 szórvány-egységgel)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.congregations
  (id, name, nev_hu, district, egyhazmegye, diocese_id, country,
   varos, megye, cim, eves_jarulek, jarulek_hatarid, status, szervezeti_tipus)
VALUES
  ('7e570000-0000-4000-8000-000000000005',
   'Teszt Missziói Egyházközség', 'Teszt Missziói Egyházközség',
   'Teszt Egyházkerület', 'Teszt Egyházmegye',
   '7e570000-0000-4000-8000-000000000002', 'Románia',
   'Alsóteszt', 'Teszt megye', 'Missziói út 1.', 100, '07-01', 'active', 'misszioi')
ON CONFLICT (id) DO NOTHING;

UPDATE public.congregations SET szervezeti_tipus = 'misszioi', anya_congregation_id = NULL
 WHERE id = '7e570000-0000-4000-8000-000000000005' AND szervezeti_tipus <> 'misszioi';

INSERT INTO public.gyulekezeti_egysegek
  (id, congregation_id, nev, tipus, sorrend, aktiv, megjegyzes)
VALUES
  ('7e570000-0000-4000-8000-0000000000a3', '7e570000-0000-4000-8000-000000000005',
   'Alsóteszt', 'szorvany', 1, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)'),
  ('7e570000-0000-4000-8000-0000000000a4', '7e570000-0000-4000-8000-000000000005',
   'Felsőteszt', 'szorvany', 2, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)'),
  ('7e570000-0000-4000-8000-0000000000a5', '7e570000-0000-4000-8000-000000000005',
   'Tesztújfalu', 'szorvany', 3, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_cong uuid := '7e570000-0000-4000-8000-000000000005';
  v_utca integer; v_helyseg integer;
BEGIN
  SELECT c.adrstreet_id, c.adrlocality_id INTO v_utca, v_helyseg
  FROM public.congregations c WHERE c.id = v_cong;
  IF v_utca IS NULL THEN SELECT id INTO v_utca FROM public.adrstreet ORDER BY id LIMIT 1; END IF;
  IF v_utca IS NULL THEN RAISE EXCEPTION 'Üres az adrstreet katalógus.'; END IF;
  IF v_helyseg IS NULL THEN SELECT localityid INTO v_helyseg FROM public.adrstreet WHERE id = v_utca; END IF;

  INSERT INTO public.szemely
    (cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
     sz_datum, vallas, foglalkozas, nemzetiseg, c_utcaid, c_szam, c_szcim,
     telefon, befizetoev, isvisible, type, member_status,
     congregation_id, c_helysegid, egyseg_id, created)
  SELECT v.cnp, v.csaladnev, v.k_nev, v.szcs_nev, v.allapot, v.csaladfo,
         v.ferfi, v.meghalt, v.sz_datum::date, 'református', v.foglalkozas,
         'magyar', v_utca, v.c_szam, v.telepules || ', Fő út ' || v.c_szam,
         v.telefon, v.befizetoev, true, 'E', 'aktív', v_cong, v_helyseg,
         v.egyseg_id::uuid, now()
  FROM (VALUES
    -- Központ (Alsóteszt-i lelkészi állomás — egység-címke nélkül)
    ('EC-TSZT2-M01','Misszióvölgyi','Dániel', NULL,          'nős',      true,  true,  false, '1963-04-05', 'gazdálkodó', '0799 002 201', '1', 1990, 'Alsóteszt',  NULL),
    ('EC-TSZT2-M02','Misszióvölgyi','Anna',   'Szórványréti','férjezett',false, false, false, '1966-10-12', 'háztartásbeli','0799 002 202','1', 1992, 'Alsóteszt',  NULL),
    ('EC-TSZT2-M03','Szórványréti','Lajos',   NULL,          'özvegy',   true,  true,  false, '1941-01-30', 'nyugdíjas',  '0799 002 203', '2', 1990, 'Alsóteszt',  NULL),
    -- Alsóteszt szórvány-egység
    ('EC-TSZT2-M04','Tesztligeti','Imre',     NULL,          'nős',      true,  true,  false, '1957-07-22', 'nyugdíjas',  '0799 002 204', '4', 1990, 'Alsóteszt',  '7e570000-0000-4000-8000-0000000000a3'),
    ('EC-TSZT2-M05','Tesztligeti','Margit',   'Missziómezei','férjezett',false, false, false, '1960-03-08', 'nyugdíjas',  '0799 002 205', '4', 1991, 'Alsóteszt',  '7e570000-0000-4000-8000-0000000000a3'),
    ('EC-TSZT2-M06','Missziómezei','Piroska', NULL,          'özvegy',   true,  false, false, '1950-11-17', 'nyugdíjas',  '0799 002 206', '6', 1990, 'Alsóteszt',  '7e570000-0000-4000-8000-0000000000a3'),
    -- Felsőteszt szórvány-egység
    ('EC-TSZT2-M07','Felsőtesztvári','Gábor', NULL,          'nős',      true,  true,  false, '1969-05-25', 'erdész',     '0799 002 207', '9', 1994, 'Felsőteszt', '7e570000-0000-4000-8000-0000000000a4'),
    ('EC-TSZT2-M08','Felsőtesztvári','Judit', 'Tesztligeti', 'férjezett',false, false, false, '1972-08-03', 'postás',     '0799 002 208', '9', 1995, 'Felsőteszt', '7e570000-0000-4000-8000-0000000000a4'),
    ('EC-TSZT2-M09','Felsőtesztvári','Áron',  NULL,          'nőtlen',   false, true,  false, '2002-12-19', 'asztalos',   '0799 002 209', '9', 2023, 'Felsőteszt', '7e570000-0000-4000-8000-0000000000a4'),
    -- Tesztújfalu szórvány-egység
    ('EC-TSZT2-M10','Újfalusi-Teszt','Béla',  NULL,          'nős',      true,  true,  false, '1952-02-14', 'nyugdíjas',  '0799 002 210', '12', 1990, 'Tesztújfalu','7e570000-0000-4000-8000-0000000000a5'),
    ('EC-TSZT2-M11','Újfalusi-Teszt','Irén',  'Misszióvölgyi','férjezett',false,false, false, '1954-09-09', 'nyugdíjas',  '0799 002 211', '12', 1990, 'Tesztújfalu','7e570000-0000-4000-8000-0000000000a5'),
    ('EC-TSZT2-M12','Szórványközi','Eszter',  NULL,          'hajadon',  true,  false, false, '1988-06-06', 'tanítónő',   '0799 002 212', '14', 2010, 'Tesztújfalu','7e570000-0000-4000-8000-0000000000a5')
  ) AS v(cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
         sz_datum, foglalkozas, telefon, c_szam, befizetoev, telepules, egyseg_id)
  ON CONFLICT (cnp) DO NOTHING;

  -- Munkanapló: a lelkész falvanként forogva szolgál (3 hetes rend) + 1 közös
  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, bibliaolvasas, alapige, cim, enekek,
     jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
     szolgalt, persely, du, deleted, congregation_id, egyseg_id, megjegyzes, created)
  SELECT * FROM (VALUES
    (DATE '2026-06-07', 'istentisztelet', 'szolgalat', 'Mt 28,16-20', 'Mt 28,19', 'Tegyetek tanítvánnyá minden népet', '42', 4, 6, 1, 11, 'Teszt Lelkész', 19::numeric, false, false,
     '7e570000-0000-4000-8000-000000000005'::uuid, '7e570000-0000-4000-8000-0000000000a3'::uuid, 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-14', 'istentisztelet', 'szolgalat', 'ApCsel 1,1-11','ApCsel 1,8','Tanúim lesztek',                   '65', 3, 4, 1,  8, 'Teszt Lelkész', 13, false, false,
     '7e570000-0000-4000-8000-000000000005', '7e570000-0000-4000-8000-0000000000a4', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-21', 'istentisztelet', 'szolgalat', 'Róm 10,9-17', 'Róm 10,17', 'A hit hallásból van',               '90', 3, 3, 0,  6, 'Teszt Lelkész', 11, false, false,
     '7e570000-0000-4000-8000-000000000005', '7e570000-0000-4000-8000-0000000000a5', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-28', 'istentisztelet', 'szolgalat', 'Zsolt 96',    'Zsolt 96,3','Hirdessétek dicsőségét',            '25', 4, 5, 2, 11, 'Teszt Lelkész', 17, false, false,
     '7e570000-0000-4000-8000-000000000005', '7e570000-0000-4000-8000-0000000000a3', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-07-05', 'istentisztelet', 'szolgalat', 'Jn 4,1-26',   'Jn 4,14',   'Az élő víz',                        '65', 2, 5, 1,  8, 'Teszt Lelkész', 12, false, false,
     '7e570000-0000-4000-8000-000000000005', '7e570000-0000-4000-8000-0000000000a4', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-07-12', 'istentisztelet', 'szolgalat', 'Ézs 55,6-11', 'Ézs 55,11', 'Az Ige nem tér vissza üresen',      '42', 3, 4, 0,  7, 'Teszt Lelkész', 10, false, false,
     '7e570000-0000-4000-8000-000000000005', '7e570000-0000-4000-8000-0000000000a5', 'TESZT-EGYSEG-DEMO', now()),
    -- Közös (mindhárom falu együtt — egység-címke nélkül = központi/közös tétel)
    (DATE '2026-08-16', 'istentisztelet', 'szolgalat', 'Zsolt 133',   'Zsolt 133,1','Missziói közösségi nap — együtt',  '90, 165', 9, 13, 4, 26, 'Teszt Lelkész', 41, false, false,
     '7e570000-0000-4000-8000-000000000005', NULL, 'TESZT-EGYSEG-DEMO', now())
  ) AS v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.munkanaplo m
    WHERE m.congregation_id = v_cong AND m.megjegyzes = 'TESZT-EGYSEG-DEMO'
  );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. BLOKK — TÁRSEGYHÁZKÖZSÉG (új gyülekezet, 2 egyenrangú egyházrésszel)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.congregations
  (id, name, nev_hu, district, egyhazmegye, diocese_id, country,
   varos, megye, cim, eves_jarulek, jarulek_hatarid, status, szervezeti_tipus)
VALUES
  ('7e570000-0000-4000-8000-000000000006',
   'Teszt Társegyházközség', 'Teszt Társegyházközség',
   'Teszt Egyházkerület', 'Teszt Egyházmegye',
   '7e570000-0000-4000-8000-000000000002', 'Románia',
   'Nagytesztfalva', 'Teszt megye', 'Egyház utca 1.', 100, '07-01', 'active', 'tars')
ON CONFLICT (id) DO NOTHING;

UPDATE public.congregations SET szervezeti_tipus = 'tars', anya_congregation_id = NULL
 WHERE id = '7e570000-0000-4000-8000-000000000006' AND szervezeti_tipus <> 'tars';

INSERT INTO public.gyulekezeti_egysegek
  (id, congregation_id, nev, tipus, sorrend, aktiv, megjegyzes)
VALUES
  ('7e570000-0000-4000-8000-0000000000a6', '7e570000-0000-4000-8000-000000000006',
   'Nagytesztfalvi egyházrész', 'egyhazresz', 1, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)'),
  ('7e570000-0000-4000-8000-0000000000a7', '7e570000-0000-4000-8000-000000000006',
   'Kistesztfalvi egyházrész', 'egyhazresz', 2, true, 'Fiktív demo-egység (TESZT-EGYSEG-DEMO)')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_cong uuid := '7e570000-0000-4000-8000-000000000006';
  v_utca integer; v_helyseg integer;
BEGIN
  SELECT c.adrstreet_id, c.adrlocality_id INTO v_utca, v_helyseg
  FROM public.congregations c WHERE c.id = v_cong;
  IF v_utca IS NULL THEN SELECT id INTO v_utca FROM public.adrstreet ORDER BY id LIMIT 1; END IF;
  IF v_utca IS NULL THEN RAISE EXCEPTION 'Üres az adrstreet katalógus.'; END IF;
  IF v_helyseg IS NULL THEN SELECT localityid INTO v_helyseg FROM public.adrstreet WHERE id = v_utca; END IF;

  INSERT INTO public.szemely
    (cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
     sz_datum, vallas, foglalkozas, nemzetiseg, c_utcaid, c_szam, c_szcim,
     telefon, befizetoev, isvisible, type, member_status,
     congregation_id, c_helysegid, egyseg_id, created)
  SELECT v.cnp, v.csaladnev, v.k_nev, v.szcs_nev, v.allapot, v.csaladfo,
         v.ferfi, v.meghalt, v.sz_datum::date, 'református', v.foglalkozas,
         'magyar', v_utca, v.c_szam, v.telepules || ', Egyház utca ' || v.c_szam,
         v.telefon, v.befizetoev, true, 'E', 'aktív', v_cong, v_helyseg,
         v.egyseg_id::uuid, now()
  FROM (VALUES
    -- Nagytesztfalvi egyházrész (saját presbitériummal)
    ('EC-TSZT2-T01','Nagytesztfalvi','Pál',    NULL,           'nős',      true,  true,  false, '1954-03-19', 'nyugdíjas',  '0799 002 301', '2',  1990, 'Nagytesztfalva', '7e570000-0000-4000-8000-0000000000a6'),
    ('EC-TSZT2-T02','Nagytesztfalvi','Klára',  'Kistesztvölgyi','férjezett',false, false, false, '1957-07-28', 'nyugdíjas', '0799 002 302', '2',  1990, 'Nagytesztfalva', '7e570000-0000-4000-8000-0000000000a6'),
    ('EC-TSZT2-T03','Társfalvi','Miklós',      NULL,           'nős',      true,  true,  false, '1971-11-11', 'kőműves',    '0799 002 303', '6',  1994, 'Nagytesztfalva', '7e570000-0000-4000-8000-0000000000a6'),
    ('EC-TSZT2-T04','Társfalvi','Enikő',       'Nagytesztvári','férjezett',false, false, false, '1974-04-23', 'fodrász',    '0799 002 304', '6',  1996, 'Nagytesztfalva', '7e570000-0000-4000-8000-0000000000a6'),
    ('EC-TSZT2-T05','Társfalvi','Botond',      NULL,           'nőtlen',   false, true,  false, '2003-08-15', 'egyetemi hallgató','0799 002 305','6', 2024, 'Nagytesztfalva', '7e570000-0000-4000-8000-0000000000a6'),
    ('EC-TSZT2-T06','Nagytesztvári','Gizella', NULL,           'özvegy',   true,  false, false, '1944-12-24', 'nyugdíjas',  '0799 002 306', '10', 1990, 'Nagytesztfalva', '7e570000-0000-4000-8000-0000000000a6'),
    -- Kistesztfalvi egyházrész (saját presbitériummal)
    ('EC-TSZT2-T07','Kistesztvölgyi','János',  NULL,           'nős',      true,  true,  false, '1961-01-06', 'gazdálkodó', '0799 002 307', '3',  1990, 'Kistesztfalva',  '7e570000-0000-4000-8000-0000000000a7'),
    ('EC-TSZT2-T08','Kistesztvölgyi','Márta',  'Társközi',     'férjezett',false, false, false, '1963-05-30', 'háztartásbeli','0799 002 308','3', 1991, 'Kistesztfalva',  '7e570000-0000-4000-8000-0000000000a7'),
    ('EC-TSZT2-T09','Társközi','István',       NULL,           'nős',      true,  true,  false, '1980-09-02', 'sofőr',      '0799 002 309', '7',  2002, 'Kistesztfalva',  '7e570000-0000-4000-8000-0000000000a7'),
    ('EC-TSZT2-T10','Társközi','Beáta',        'Kistesztfalvi','férjezett',false, false, false, '1983-02-17', 'ápolónő',    '0799 002 310', '7',  2005, 'Kistesztfalva',  '7e570000-0000-4000-8000-0000000000a7'),
    ('EC-TSZT2-T11','Társközi','Levente',      NULL,           NULL,       false, true,  false, '2011-06-12', 'tanuló',     NULL,           '7',  2026, 'Kistesztfalva',  '7e570000-0000-4000-8000-0000000000a7'),
    ('EC-TSZT2-T12','Kistesztfalvi','Aranka',  NULL,           'özvegy',   true,  false, false, '1949-10-08', 'nyugdíjas',  '0799 002 311', '11', 1990, 'Kistesztfalva',  '7e570000-0000-4000-8000-0000000000a7')
  ) AS v(cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
         sz_datum, foglalkozas, telefon, c_szam, befizetoev, telepules, egyseg_id)
  ON CONFLICT (cnp) DO NOTHING;

  -- Munkanapló: a klasszikus társ-rend — vasárnap DE. Nagytesztfalva,
  -- DU. Kistesztfalva; + 1 közös hálaadó alkalom (egység-címke nélkül)
  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, bibliaolvasas, alapige, cim, enekek,
     jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
     szolgalt, persely, du, deleted, congregation_id, egyseg_id, megjegyzes, created)
  SELECT * FROM (VALUES
    (DATE '2026-06-07', 'istentisztelet', 'szolgalat', 'Zsolt 100',  'Zsolt 100,2','Szolgáljatok az Úrnak örömmel',  '42, 165', 5, 8, 2, 15, 'Teszt Lelkész', 26::numeric, false, false,
     '7e570000-0000-4000-8000-000000000006'::uuid, '7e570000-0000-4000-8000-0000000000a6'::uuid, 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-07', 'istentisztelet', 'szolgalat', 'Zsolt 100',  'Zsolt 100,2','Szolgáljatok az Úrnak örömmel',  '42, 165', 4, 7, 1, 12, 'Teszt Lelkész', 21, true,  false,
     '7e570000-0000-4000-8000-000000000006', '7e570000-0000-4000-8000-0000000000a7', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-14', 'istentisztelet', 'szolgalat', '1Pt 2,4-10', '1Pt 2,5',    'Élő kövekként épüljetek',        '65, 254', 6, 9, 1, 16, 'Teszt Lelkész', 29, false, false,
     '7e570000-0000-4000-8000-000000000006', '7e570000-0000-4000-8000-0000000000a6', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-14', 'istentisztelet', 'szolgalat', '1Pt 2,4-10', '1Pt 2,5',    'Élő kövekként épüljetek',        '65, 254', 3, 6, 2, 11, 'Teszt Lelkész', 18, true,  false,
     '7e570000-0000-4000-8000-000000000006', '7e570000-0000-4000-8000-0000000000a7', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-21', 'istentisztelet', 'szolgalat', 'Ef 4,1-6',   'Ef 4,3',     'A lélek egysége',                '25, 396', 5, 7, 1, 13, 'Teszt Lelkész', 24, false, false,
     '7e570000-0000-4000-8000-000000000006', '7e570000-0000-4000-8000-0000000000a6', 'TESZT-EGYSEG-DEMO', now()),
    (DATE '2026-06-21', 'istentisztelet', 'szolgalat', 'Ef 4,1-6',   'Ef 4,3',     'A lélek egysége',                '25, 396', 4, 5, 1, 10, 'Teszt Lelkész', 17, true,  false,
     '7e570000-0000-4000-8000-000000000006', '7e570000-0000-4000-8000-0000000000a7', 'TESZT-EGYSEG-DEMO', now()),
    -- Közös hálaadó alkalom — a két egyházrész EGYÜTT (egység-címke nélkül)
    (DATE '2026-08-23', 'istentisztelet', 'szolgalat', 'Zsolt 133',  'Zsolt 133,1','Közös hálaadás — a két egyházrész együtt', '90, 165, 434', 11, 16, 4, 31, 'Teszt Lelkész', 52, false, false,
     '7e570000-0000-4000-8000-000000000006', NULL, 'TESZT-EGYSEG-DEMO', now())
  ) AS v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.munkanaplo m
    WHERE m.congregation_id = v_cong AND m.megjegyzes = 'TESZT-EGYSEG-DEMO'
  );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. BLOKK — Kereszt-gyülekezeti értesítés-takarítás (biztos, ami biztos)
-- ════════════════════════════════════════════════════════════════════════════
DELETE FROM public.cross_congregation_match_notifications
WHERE triggering_congregation_id IN
  ('7e570000-0000-4000-8000-000000000004',
   '7e570000-0000-4000-8000-000000000005',
   '7e570000-0000-4000-8000-000000000006');

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKÁCIÓ — gyülekezetenként: forma, egységek, tagok (címkézve), naplósorok
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  c.name AS gyulekezet,
  c.szervezeti_tipus AS forma,
  (SELECT a.name FROM public.congregations a WHERE a.id = c.anya_congregation_id) AS anyja,
  (SELECT count(*) FROM public.gyulekezeti_egysegek e
    WHERE e.congregation_id = c.id AND e.aktiv) AS egysegek,
  (SELECT count(*) FROM public.szemely s
    WHERE s.congregation_id = c.id AND s.isvisible AND NOT s.meghalt) AS tagok,
  (SELECT count(*) FROM public.szemely s
    WHERE s.congregation_id = c.id AND s.egyseg_id IS NOT NULL) AS cimkezett_tag,
  (SELECT count(*) FROM public.munkanaplo m
    WHERE m.congregation_id = c.id AND NOT m.deleted) AS naplosor,
  (SELECT count(*) FROM public.munkanaplo m
    WHERE m.congregation_id = c.id AND m.egyseg_id IS NOT NULL AND NOT m.deleted) AS cimkezett_naplosor
FROM public.congregations c
WHERE c.id IN
  ('7e570000-0000-4000-8000-000000000003',
   '7e570000-0000-4000-8000-000000000004',
   '7e570000-0000-4000-8000-000000000005',
   '7e570000-0000-4000-8000-000000000006')
ORDER BY c.id;
