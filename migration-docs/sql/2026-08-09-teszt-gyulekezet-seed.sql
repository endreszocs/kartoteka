-- ============================================================================
-- 2026-08-09 — TESZT GYÜLEKEZET FIKTÍV DEMO-SEED
-- ============================================================================
-- Teljesen KITALÁLT magyar adatokkal tölti fel a Teszt gyülekezetet
-- (7e570000-0000-4000-8000-000000000003), hogy a lelkészek biztonságosan
-- demózhassanak / tanulhassanak — valódi személyes adat NINCS benne.
--
-- ELŐFELTÉTEL: a gyülekezet legyen ÜRES — futtasd előbb:
--   2026-08-09-teszt-gyulekezet-wipe.sql
-- (Ha van már szemely-sor, ez a seed NEM fut le, csak szól — így nem duplikál.)
--
-- MIT HOZ LÉTRE:
--   • 48 fiktív személy, 15 család (idősek, középkorúak, fiatal pár,
--     özvegy, egyedülálló anya, nagycsalád; 1 elhunyt + 1 elköltözött tag)
--   • csalad + gyerek + cim + haztartas + haztartas_tag + szemely_kapcsolat
--     (a pénzügyi motor a haztartas_tag→haztartas.legacy_csalad_id úton oldja
--     fel a családtagságot — ezért MIND a régi, MIND az új modellt seedeljük,
--     pontosan úgy, ahogy a syncHouseholdFromCsalad tenné; a rokonsági élek
--     megjegyzése 'haztartas-sync', hogy az app egyeztetője kezelje őket)
--   • bealitas 2025 + 2026 (éves járulék 100 / 120 RON) + nyitó egyenlegek
--   • ~84 befizetés (járulék 2025/2026, persely, adomány, bank-tételek;
--     szándékos HÁTRALÉKOSOK: a 9., 11., 12., 14., 15. család 2026-ra nem
--     fizetett → a Tartozások fül demózható)
--   • ~32 kiadás (villany 205.01, irodaszer 201.12, tűzifa, posta, bank)
--   • 1 bankszámla + nyitó egyenlegek + 1 Chitanță-tömb
--   • 6 leltári tétel, 8 munkanapló-bejegyzés, 5 gyülekezeti program
--   • pár anyakönyvi tétel (2 keresztelő, 1 konfirmáció, 1 esketés, 1 temetés,
--     1 elköltözés) + 1 felmentés + 1 kor-alapú járulék-kedvezmény
--
-- FONTOS DÖNTÉSEK (kód-ellenőrzés alapján):
--   • befizetescel / kiadascel GLOBÁLIS táblák (nincs congregation_id) — a seed
--     CSAK KIKERESI az id-kat (járulék = id_szamadasicel LIKE '101.01%'),
--     SOHA nem szúr be kategóriát (2026-04-17-seed-befizetescel-kiadascel.sql).
--   • userid (befizetes/kiadas/leltar/programok NOT NULL FK auth.users):
--     1) a Teszt gyülekezethez rendelt profil, 2) profile_roles-hozzárendelés,
--     3) fallback: bármely 'admin' szerepű profil. Ha egyik sincs → hibaüzenet
--     (előbb futtasd a 2026-07-01-teszt-egyhazkozseg-seed.sql BLOCK 2-jét egy
--     valódi, regisztrált emaillel).
--   • KERESZT-GYÜLEKEZETI TRIGGER: a szemely INSERT-eken lefut a
--     find_potential_cross_congregation_match. Ezért MINDEN vezetéknév
--     kitalált (Példabeszédi, Tesztfalvi, Mintakerti…), a telefonszámok
--     0799 000 1xx álszámok → név-egyezés gyakorlatilag kizárt, értesítés-spam
--     nem keletkezik. Biztos, ami biztos: a blokk végén a teszt gyülekezet
--     által triggerelt értesítéseket töröljük is.
--   • cnp: determinisztikus 'EC-TSZT-…' azonosítók (felismerhetők, egyediek,
--     újrafuttatásnál ON CONFLICT (cnp) DO NOTHING védi őket).
--   • bealitas.utcaid NOT NULL FK → adrstreet: a gyülekezet adrstreet_id-ja,
--     ennek híján a katalógus első utcája. A képernyőn látszó utcanév ettől
--     még a valódi katalógus-név lesz — a fiktív "Tesztfalva, Fő utca N" a
--     szöveges c_szcim mezőben él.
--   • apjaneve/anyjaneve SZÁNDÉKOSAN üres — a PR-22-es szülőnév-egyeztető
--     ('szulonev-egyezes' marker) ne gyártson párhuzamos éleket.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 0. BLOKK — Org-hierarchia biztosítása (idempotens, megegyezik a 2026-07-01
--            seed BLOCK 1-gyel — ha már létezik, nem csinál semmit)
-- ════════════════════════════════════════════════════════════════════════════
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
-- 1. BLOKK — A teljes fiktív adat-seed (egy tranzakció; hibánál semmi nem íródik)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_cong    uuid := '7e570000-0000-4000-8000-000000000003';
  v_uid     uuid;
  v_utca    integer;
  v_helyseg integer;
  -- globális kategóriák (CSAK lookup!)
  v_cel_jarulek integer;
  v_cel_persely integer;
  v_cel_adomany integer;
  v_kc_villany  integer;
  v_kc_iroda    integer;
  v_bank        integer;
  -- ciklus-változók
  fam      integer;
  m        integer;
  v_pad    text;
  v_nev    text;
  v_ferfi  integer;
  v_no     integer;
  v_head   integer;
  v_csalad integer;
  v_cim    uuid;
  v_haz    uuid;
  v_szemely integer;
  v_csalad3 integer;
  v_csalad4 integer;
  v_seq25  integer := 0;   -- befizetes nyugta/iratszám sorszám 2025 (datum-év tengelyen)
  v_seq26  integer := 0;   -- befizetes sorszám 2026
  v_kseq25 integer := 0;   -- kiadas sorszám 2025
  v_kseq26 integer := 0;   -- kiadas sorszám 2026
  r        RECORD;
BEGIN
  -- ── Őr: csak ÜRES gyülekezetre seedelünk (nem duplikálunk) ────────────────
  IF EXISTS (SELECT 1 FROM public.szemely WHERE congregation_id = v_cong) THEN
    RAISE NOTICE 'KIHAGYVA: a Teszt gyülekezetben már vannak személyek. Futtasd előbb a 2026-08-09-teszt-gyulekezet-wipe.sql fájlt, utána újra ezt.';
    RETURN;
  END IF;

  -- ── userid feloldás (dokumentált sorrend, lásd a fejlécet) ────────────────
  SELECT p.id INTO v_uid
  FROM public.profiles p
  WHERE p.congregation_id = v_cong AND p.deleted_at IS NULL
  ORDER BY p.created_at LIMIT 1;

  IF v_uid IS NULL THEN
    SELECT pr.profile_id INTO v_uid
    FROM public.profile_roles pr
    WHERE pr.scope = 'congregation' AND pr.scope_id = v_cong
      AND pr.active = true AND pr.approval_status = 'approved'
    ORDER BY pr.granted_at LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN
    -- Fallback: bármely rendszergazda-profil (a userid csak „ki rögzítette" jelölő)
    SELECT p.id INTO v_uid
    FROM public.profiles p
    WHERE p.role = 'admin' AND p.deleted_at IS NULL
    ORDER BY p.created_at LIMIT 1;
    IF v_uid IS NOT NULL THEN
      RAISE NOTICE 'FIGYELEM: a Teszt gyülekezethez nincs profil rendelve — a pénzügyi tételek userid-je egy admin profil lett (%).', v_uid;
    END IF;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs használható profil a userid-hez. Futtasd előbb a 2026-07-01-teszt-egyhazkozseg-seed.sql BLOCK 2-jét egy VALÓDI, regisztrált emaillel, majd újra ezt a seedet.';
  END IF;

  -- ── Cím-katalógus feloldás (bealitas.utcaid + szemely.c_utcaid NOT NULL) ──
  SELECT c.adrstreet_id, c.adrlocality_id INTO v_utca, v_helyseg
  FROM public.congregations c WHERE c.id = v_cong;
  IF v_utca IS NULL THEN
    SELECT id INTO v_utca FROM public.adrstreet ORDER BY id LIMIT 1;
  END IF;
  IF v_utca IS NULL THEN
    RAISE EXCEPTION 'Üres az adrstreet katalógus — cím nélkül a szemely/bealitas nem seedelhető.';
  END IF;
  IF v_helyseg IS NULL THEN
    SELECT localityid INTO v_helyseg FROM public.adrstreet WHERE id = v_utca;
  END IF;

  -- ── Globális kategória-lookup (soha nem INSERT!) ──────────────────────────
  SELECT id INTO v_cel_jarulek FROM public.befizetescel
  WHERE id_szamadasicel LIKE '101.01%' ORDER BY id LIMIT 1;
  IF v_cel_jarulek IS NULL THEN
    SELECT id INTO v_cel_jarulek FROM public.befizetescel ORDER BY id LIMIT 1;
  END IF;
  IF v_cel_jarulek IS NULL THEN
    RAISE EXCEPTION 'Üres a globális befizetescel katalógus — előbb a kategória-seed kell (2026-04-17-seed-befizetescel-kiadascel.sql).';
  END IF;

  SELECT id INTO v_cel_persely FROM public.befizetescel
  WHERE nev ILIKE '%persely%' ORDER BY id LIMIT 1;
  IF v_cel_persely IS NULL THEN
    SELECT id INTO v_cel_persely FROM public.befizetescel WHERE id <> v_cel_jarulek ORDER BY id LIMIT 1;
  END IF;
  v_cel_persely := COALESCE(v_cel_persely, v_cel_jarulek);

  SELECT id INTO v_cel_adomany FROM public.befizetescel
  WHERE nev ILIKE '%adom%' ORDER BY id LIMIT 1;
  v_cel_adomany := COALESCE(v_cel_adomany, v_cel_persely);

  SELECT id INTO v_kc_villany FROM public.kiadascel
  WHERE id_szamadasicel LIKE '205.01%' ORDER BY id LIMIT 1;
  IF v_kc_villany IS NULL THEN
    SELECT id INTO v_kc_villany FROM public.kiadascel ORDER BY id LIMIT 1;
  END IF;
  IF v_kc_villany IS NULL THEN
    RAISE EXCEPTION 'Üres a globális kiadascel katalógus — előbb a kategória-seed kell.';
  END IF;

  SELECT id INTO v_kc_iroda FROM public.kiadascel
  WHERE id_szamadasicel LIKE '201.12%' ORDER BY id LIMIT 1;
  v_kc_iroda := COALESCE(v_kc_iroda, v_kc_villany);

  -- ══════════════════════════════════════════════════════════════════════════
  -- SZEMÉLYEK — 48 fiktív tag, 15 család (cnp: EC-TSZT-<család><szerep>)
  --   Vezetéknevek: KITALÁLTAK (cross-match trigger nyugalma), telefonok álszámok.
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.szemely
    (cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
     sz_datum, vallas, foglalkozas, nemzetiseg, c_utcaid, c_szam, c_szcim,
     telefon, befizetoev, isvisible, type, member_status,
     congregation_id, c_helysegid, created)
  SELECT v.cnp, v.csaladnev, v.k_nev, v.szcs_nev, v.allapot, v.csaladfo,
         v.ferfi, v.meghalt, v.sz_datum::date, 'református', v.foglalkozas,
         'magyar', v_utca, v.c_szam,
         'Tesztfalva, Fő utca ' || v.c_szam,
         v.telefon, v.befizetoev, true, 'E', v.member_status,
         v_cong, v_helyseg, now()
  FROM (VALUES
    -- F01 — Példabeszédi (idős házaspár), Fő utca 11
    ('EC-TSZT-01F','Példabeszédi','Áron',    NULL,          'nős',      true,  true,  false, '1946-03-12', 'nyugdíjas',        '0799 000 101', '11', 1990, 'aktív'),
    ('EC-TSZT-01M','Példabeszédi','Rozália', 'Mintakerti',  'férjezett',false, false, false, '1949-07-08', 'nyugdíjas',        '0799 000 102', '11', 1990, 'aktív'),
    -- F02 — Tesztfalvi (házaspár + 2 felnőtt gyerek), Fő utca 12
    ('EC-TSZT-02F','Tesztfalvi','Zoltán',    NULL,          'nős',      true,  true,  false, '1958-11-02', 'asztalos',         '0799 000 103', '12', 1990, 'aktív'),
    ('EC-TSZT-02M','Tesztfalvi','Ilona',     'Példavári',   'férjezett',false, false, false, '1961-04-19', 'varrónő',          '0799 000 104', '12', 1992, 'aktív'),
    ('EC-TSZT-02C1','Tesztfalvi','Botond',   NULL,          'nőtlen',   false, true,  false, '1995-09-23', 'villanyszerelő',   '0799 000 105', '12', 2016, 'aktív'),
    ('EC-TSZT-02C2','Tesztfalvi','Kinga',    NULL,          'hajadon',  false, false, false, '1999-01-30', 'egyetemi hallgató','0799 000 106', '12', 2020, 'aktív'),
    -- F03 — Mintakerti (házaspár + 3 gyerek), Fő utca 13
    ('EC-TSZT-03F','Mintakerti','Levente',   NULL,          'nős',      true,  true,  false, '1972-06-15', 'tanár',            '0799 000 107', '13', 1995, 'aktív'),
    ('EC-TSZT-03M','Mintakerti','Emese',     'Tesztvári',   'férjezett',false, false, false, '1975-10-05', 'könyvelő',         '0799 000 108', '13', 1998, 'aktív'),
    ('EC-TSZT-03C1','Mintakerti','Nándor',   NULL,          'nőtlen',   false, true,  false, '2004-02-11', 'tanuló',           NULL,           '13', 2024, 'aktív'),
    ('EC-TSZT-03C2','Mintakerti','Boglárka', NULL,          'hajadon',  false, false, false, '2007-08-27', 'tanuló',           NULL,           '13', 2026, 'aktív'),
    ('EC-TSZT-03C3','Mintakerti','Zalán',    NULL,          NULL,       false, true,  false, '2012-12-03', 'tanuló',           NULL,           '13', 2026, 'aktív'),
    -- F04 — Próbavári (házaspár + 2 gyerek), Fő utca 14
    ('EC-TSZT-04F','Próbavári','Attila',     NULL,          'nős',      true,  true,  false, '1968-01-25', 'gazdálkodó',       '0799 000 109', '14', 1990, 'aktív'),
    ('EC-TSZT-04M','Próbavári','Tünde',      'Mintahegyi',  'férjezett',false, false, false, '1970-03-14', 'háztartásbeli',    '0799 000 110', '14', 1992, 'aktív'),
    ('EC-TSZT-04C1','Próbavári','Csongor',   NULL,          'nőtlen',   false, true,  false, '2001-05-09', 'gépészmérnök',     '0799 000 111', '14', 2022, 'aktív'),
    ('EC-TSZT-04C2','Próbavári','Villő',     NULL,          'hajadon',  false, false, false, '2005-11-21', 'egyetemi hallgató',NULL,           '14', 2026, 'aktív'),
    -- F05 — Sablonszegi (házaspár + 2 gyerek), Fő utca 15
    ('EC-TSZT-05F','Sablonszegi','Károly',   NULL,          'nős',      true,  true,  false, '1979-04-02', 'villanyszerelő',   '0799 000 112', '15', 2000, 'aktív'),
    ('EC-TSZT-05M','Sablonszegi','Andrea',   'Példakerti',  'férjezett',false, false, false, '1982-09-16', 'óvónő',            '0799 000 113', '15', 2003, 'aktív'),
    ('EC-TSZT-05C1','Sablonszegi','Márton',  NULL,          NULL,       false, true,  false, '2010-06-30', 'tanuló',           NULL,           '15', 2026, 'aktív'),
    ('EC-TSZT-05C2','Sablonszegi','Hanga',   NULL,          NULL,       false, false, false, '2014-04-18', 'tanuló',           NULL,           '15', 2026, 'aktív'),
    -- F06 — Mintafalvi (fiatal házaspár + 2 kisgyerek), Fő utca 16
    ('EC-TSZT-06F','Mintafalvi','Gergő',     NULL,          'nős',      true,  true,  false, '1985-08-08', 'informatikus',     '0799 000 114', '16', 2008, 'aktív'),
    ('EC-TSZT-06M','Mintafalvi','Réka',      'Tesztszegi',  'férjezett',false, false, false, '1988-02-22', 'védőnő',           '0799 000 115', '16', 2010, 'aktív'),
    ('EC-TSZT-06C1','Mintafalvi','Ábel',     NULL,          NULL,       false, true,  false, '2016-07-12', NULL,               NULL,           '16', 2026, 'aktív'),
    ('EC-TSZT-06C2','Mintafalvi','Lilla',    NULL,          NULL,       false, false, false, '2019-10-01', NULL,               NULL,           '16', 2026, 'aktív'),
    -- F07 — Tesztvári (fiatal házaspár + 1 kisgyerek), Fő utca 17
    ('EC-TSZT-07F','Tesztvári','Bence',      NULL,          'nős',      true,  true,  false, '1990-12-05', 'gépész',           '0799 000 116', '17', 2012, 'aktív'),
    ('EC-TSZT-07M','Tesztvári','Fruzsina',   'Mintavölgyi', 'férjezett',false, false, false, '1992-05-17', 'tanítónő',         '0799 000 117', '17', 2014, 'aktív'),
    ('EC-TSZT-07C1','Tesztvári','Zente',     NULL,          NULL,       false, true,  false, '2020-03-25', NULL,               NULL,           '17', 2026, 'aktív'),
    -- F08 — Példásfalvi (friss házasok, 2026-os esketés), Fő utca 18
    ('EC-TSZT-08F','Példásfalvi','Szabolcs', NULL,          'nős',      true,  true,  false, '1993-03-03', 'ács',              '0799 000 118', '18', 2015, 'aktív'),
    ('EC-TSZT-08M','Példásfalvi','Orsolya',  'Sablonszegi', 'férjezett',false, false, false, '1994-11-11', 'asszisztens',      '0799 000 119', '18', 2016, 'aktív'),
    -- F09 — Mintaszegi (özvegy, egyedül él) — 2026-ra NEM fizetett (hátralék-demo)
    ('EC-TSZT-09M','Mintaszegi','Erzsébet',  'Tesztkerti',  'özvegy',   true,  false, false, '1944-05-05', 'nyugdíjas',        '0799 000 120', '19', 1990, 'aktív'),
    -- F10 — Tesztkerti (egyedülálló anya + 1 gyerek), Fő utca 20
    ('EC-TSZT-10M','Tesztkerti','Márta',     NULL,          'elvált',   true,  false, false, '1980-07-07', 'eladó',            '0799 000 121', '20', 2002, 'aktív'),
    ('EC-TSZT-10C1','Tesztkerti','Dorka',    NULL,          NULL,       false, false, false, '2009-09-09', 'tanuló',           NULL,           '20', 2026, 'aktív'),
    -- F11 — Példavári (idős házaspár, a férj felmentett) — 2026 hátralék
    ('EC-TSZT-11F','Példavári','Sándor',     NULL,          'nős',      true,  true,  false, '1952-10-20', 'nyugdíjas',        '0799 000 122', '21', 1990, 'aktív'),
    ('EC-TSZT-11M','Példavári','Margit',     'Mintafalvi',  'férjezett',false, false, false, '1955-12-24', 'nyugdíjas',        '0799 000 123', '21', 1990, 'aktív'),
    -- F12 — Mintavölgyi (házaspár + elköltözött felnőtt lány) — 2026 hátralék
    ('EC-TSZT-12F','Mintavölgyi','Imre',     NULL,          'nős',      true,  true,  false, '1963-06-06', 'sofőr',            '0799 000 124', '22', 1990, 'aktív'),
    ('EC-TSZT-12M','Mintavölgyi','Judit',    'Próbavári',   'férjezett',false, false, false, '1966-08-15', 'szakácsnő',        '0799 000 125', '22', 1992, 'aktív'),
    ('EC-TSZT-12C1','Mintavölgyi','Csenge',  NULL,          'hajadon',  false, false, false, '2003-04-04', 'ápolónő',          '0799 000 126', '22', 2024, 'elköltözött'),
    -- F13 — Tesztszegi (házaspár + 2 gyerek), Fő utca 23
    ('EC-TSZT-13F','Tesztszegi','Dénes',     NULL,          'nős',      true,  true,  false, '1976-02-14', 'kőműves',          '0799 000 127', '23', 1998, 'aktív'),
    ('EC-TSZT-13M','Tesztszegi','Anikó',     'Példabeszédi','férjezett',false, false, false, '1978-12-08', 'fodrász',          '0799 000 128', '23', 2000, 'aktív'),
    ('EC-TSZT-13C1','Tesztszegi','Bendegúz', NULL,          NULL,       false, true,  false, '2008-01-19', 'tanuló',           NULL,           '23', 2026, 'aktív'),
    ('EC-TSZT-13C2','Tesztszegi','Emma',     NULL,          NULL,       false, false, false, '2011-03-29', 'tanuló',           NULL,           '23', 2026, 'aktív'),
    -- F14 — Példakerti (a férj 2026-ban ELHUNYT — temetési anyakönyv-demo)
    ('EC-TSZT-14F','Példakerti','Vilmos',    NULL,          'nős',      true,  true,  true,  '1948-09-30', 'nyugdíjas',        '0799 000 129', '24', 1990, 'elhunyt'),
    ('EC-TSZT-14M','Példakerti','Aranka',    'Mintaszegi',  'özvegy',   false, false, false, '1951-01-06', 'nyugdíjas',        '0799 000 130', '24', 1990, 'aktív'),
    -- F15 — Mintahegyi (nagycsalád: házaspár + 4 gyerek) — 2026 hátralék
    ('EC-TSZT-15F','Mintahegyi','Ödön',      NULL,          'nős',      true,  true,  false, '1969-11-17', 'erdész',           '0799 000 131', '25', 1992, 'aktív'),
    ('EC-TSZT-15M','Mintahegyi','Piroska',   'Tesztfalvi',  'férjezett',false, false, false, '1973-05-28', 'varrónő',          '0799 000 132', '25', 1995, 'aktív'),
    ('EC-TSZT-15C1','Mintahegyi','Zsófia',   NULL,          'hajadon',  false, false, false, '2002-10-10', 'egyetemi hallgató','0799 000 133', '25', 2023, 'aktív'),
    ('EC-TSZT-15C2','Mintahegyi','Barnabás', NULL,          NULL,       false, true,  false, '2006-06-16', 'tanuló',           NULL,           '25', 2026, 'aktív'),
    ('EC-TSZT-15C3','Mintahegyi','Janka',    NULL,          NULL,       false, false, false, '2013-09-13', 'tanuló',           NULL,           '25', 2026, 'aktív'),
    ('EC-TSZT-15C4','Mintahegyi','Vince',    NULL,          NULL,       false, true,  false, '2018-12-06', NULL,               NULL,           '25', 2026, 'aktív')
  ) AS v(cnp, csaladnev, k_nev, szcs_nev, allapot, csaladfo, ferfi, meghalt,
         sz_datum, foglalkozas, telefon, c_szam, befizetoev, member_status)
  ON CONFLICT (cnp) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CSALÁDOK — régi modell (csalad + gyerek) ÉS hibrid modell
  -- (cim + haztartas + haztartas_tag) + rokonsági élek (szemely_kapcsolat)
  -- ══════════════════════════════════════════════════════════════════════════
  FOR fam IN 1..15 LOOP
    v_pad := lpad(fam::text, 2, '0');

    SELECT id INTO v_ferfi FROM public.szemely
      WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-' || v_pad || 'F';
    SELECT id INTO v_no FROM public.szemely
      WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-' || v_pad || 'M';
    v_head := COALESCE(v_ferfi, v_no);
    IF v_head IS NULL THEN CONTINUE; END IF;

    SELECT csaladnev INTO v_nev FROM public.szemely WHERE id = v_head;

    -- Régi modell: csalad + gyerek
    INSERT INTO public.csalad (id_ferfi, id_no, c_utcaid, c_szam, isaktiv)
    VALUES (v_ferfi, v_no, v_utca, (10 + fam)::text, true)
    RETURNING id INTO v_csalad;

    INSERT INTO public.gyerek (id_csalad, id_szemely)
    SELECT v_csalad, s.id FROM public.szemely s
    WHERE s.congregation_id = v_cong AND s.cnp LIKE 'EC-TSZT-' || v_pad || 'C%';

    -- Családi befizetés-demóhoz megjegyezzük a 3. és 4. család id-ját
    IF fam = 3 THEN v_csalad3 := v_csalad; END IF;
    IF fam = 4 THEN v_csalad4 := v_csalad; END IF;

    -- Hibrid modell: cim → haztartas → haztartas_tag (a pénzügyi motor ezen
    -- az úton oldja fel a családtagságot: haztartas_tag → legacy_csalad_id)
    INSERT INTO public.cim (congregation_id, id_utca, szam, tipus, ervenyes_tol)
    VALUES (v_cong, v_utca, (10 + fam)::text, 'otthon', DATE '2020-01-01')
    RETURNING id INTO v_cim;

    INSERT INTO public.haztartas
      (congregation_id, megnevezes, id_cim, isaktiv, ervenyes_tol, legacy_csalad_id)
    VALUES (v_cong, v_nev || ' család', v_cim, true, DATE '2020-01-01', v_csalad)
    RETURNING id INTO v_haz;

    -- családfő
    INSERT INTO public.haztartas_tag
      (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    VALUES (v_haz, v_head, 'csaladfo', true, DATE '2020-01-01', v_cong);

    -- házastárs
    IF v_ferfi IS NOT NULL AND v_no IS NOT NULL THEN
      INSERT INTO public.haztartas_tag
        (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
      VALUES (v_haz, CASE WHEN v_head = v_ferfi THEN v_no ELSE v_ferfi END,
              'hazastars', false, DATE '2020-01-01', v_cong);
    END IF;

    -- gyermekek
    INSERT INTO public.haztartas_tag
      (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT v_haz, s.id, 'gyermek', false, DATE '2020-01-01', v_cong
    FROM public.szemely s
    WHERE s.congregation_id = v_cong AND s.cnp LIKE 'EC-TSZT-' || v_pad || 'C%';

    -- Rokonsági élek ('haztartas-sync' marker → az app egyeztetője kezeli őket)
    IF v_ferfi IS NOT NULL AND v_no IS NOT NULL THEN
      INSERT INTO public.szemely_kapcsolat
        (id_szemely_1, id_szemely_2, tipus, ver_szerinti, megjegyzes, congregation_id)
      VALUES (v_ferfi, v_no, 'hazastars', false, 'haztartas-sync', v_cong);
    END IF;

    IF v_ferfi IS NOT NULL THEN
      INSERT INTO public.szemely_kapcsolat
        (id_szemely_1, id_szemely_2, tipus, ver_szerinti, megjegyzes, congregation_id)
      SELECT v_ferfi, s.id, 'szulo_gyermek', true, 'haztartas-sync', v_cong
      FROM public.szemely s
      WHERE s.congregation_id = v_cong AND s.cnp LIKE 'EC-TSZT-' || v_pad || 'C%';
    END IF;

    IF v_no IS NOT NULL THEN
      INSERT INTO public.szemely_kapcsolat
        (id_szemely_1, id_szemely_2, tipus, ver_szerinti, megjegyzes, congregation_id)
      SELECT v_no, s.id, 'szulo_gyermek', true, 'haztartas-sync', v_cong
      FROM public.szemely s
      WHERE s.congregation_id = v_cong AND s.cnp LIKE 'EC-TSZT-' || v_pad || 'C%';
    END IF;
  END LOOP;

  -- Elhunyt (14F Vilmos, †2026-02-10): a tagság-eredetű élek/tagságok LEZÁRÁSA
  -- (a haláleset-él sosem támadhat fel — PR-20/21 konvenció)
  SELECT id INTO v_szemely FROM public.szemely
    WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-14F';
  IF v_szemely IS NOT NULL THEN
    UPDATE public.haztartas_tag SET ervenyes_ig = DATE '2026-02-10'
      WHERE id_szemely = v_szemely AND congregation_id = v_cong AND ervenyes_ig IS NULL;
    UPDATE public.szemely_kapcsolat SET ervenyes_ig = DATE '2026-02-10'
      WHERE congregation_id = v_cong AND tipus = 'hazastars' AND ervenyes_ig IS NULL
        AND (id_szemely_1 = v_szemely OR id_szemely_2 = v_szemely);
  END IF;

  -- Elköltözött (12C1 Csenge, 2025-09-01): háztartás-tagság lezárása + anyakönyv
  SELECT id INTO v_szemely FROM public.szemely
    WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-12C1';
  IF v_szemely IS NOT NULL THEN
    UPDATE public.haztartas_tag SET ervenyes_ig = DATE '2025-09-01'
      WHERE id_szemely = v_szemely AND congregation_id = v_cong AND ervenyes_ig IS NULL;
    INSERT INTO public.elkoltozott (id_szemely, kulfoldre, mikor, megjegyzes, congregation_id)
    VALUES (v_szemely, true, TIMESTAMP '2025-09-01 00:00:00', 'Külföldön dolgozik (fiktív teszt-adat)', v_cong);
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ÉV-BEÁLLÍTÁSOK (bealitas 2025 + 2026) + éves díjak + nyitó egyenlegek
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.bealitas
    (id, congregation_id, intezmenyneve, utcaid, helysegid, lelkesz,
     eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, aktiv,
     isszemelyibefizetes, isszulokkulon, felmentes70felul,
     felmentesideneskudtek, kedvezmenyxevenfelul,
     budget_finalized, accounting_finalized, leltar_finalized,
     unlock_requested, accounting_unlock_requested, leltar_unlock_requested,
     szamadas_zaro_adatok, nyito_keszpenz, nyito_bank, created)
  VALUES
    ('2025', v_cong, 'Tesztfalvi Református Egyházközség (fiktív)', v_utca, v_helyseg,
     'Teszt Lelkész', 100, 80, '07-01', false,
     false, false, false, false, false,
     false, false, false, false, false, false,
     '{}'::jsonb, 850, 4200, now()),
    ('2026', v_cong, 'Tesztfalvi Református Egyházközség (fiktív)', v_utca, v_helyseg,
     'Teszt Lelkész', 120, 100, '07-01', true,
     false, false, false, false, false,
     false, false, false, false, false, false,
     '{}'::jsonb, 1310.50, 5000, now())
  ON CONFLICT (id, congregation_id) DO NOTHING;

  -- congregation_annual_fees — legacy tükör (nincs garantált unique index →
  -- NOT EXISTS őr az idempotenciához)
  INSERT INTO public.congregation_annual_fees (congregation_id, year, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid)
  SELECT v_cong, 2025, 100, 80, '07-01'
  WHERE NOT EXISTS (SELECT 1 FROM public.congregation_annual_fees
                    WHERE congregation_id = v_cong AND year = 2025);
  INSERT INTO public.congregation_annual_fees (congregation_id, year, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid)
  SELECT v_cong, 2026, 120, 100, '07-01'
  WHERE NOT EXISTS (SELECT 1 FROM public.congregation_annual_fees
                    WHERE congregation_id = v_cong AND year = 2026);

  -- Készpénz nyitó egyenleg — CSAK 2025 fix; a 2026-os nyitót a blokk VÉGÉN,
  -- a tényleges 2025-ös forgalomból SZÁMÍTVA szúrjuk be (review-fix: a fix
  -- érték ellentmondott a forgalomnak → negatív/hamis egyenleg látszott volna).
  INSERT INTO public.keszpenz_nyito_egyenleg (congregation_id, eve, nyito_egyenleg, forrasa, megjegyzes)
  VALUES (v_cong, 2025, 850, 'manual', 'Fiktív teszt-adat')
  ON CONFLICT (congregation_id, eve) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════
  -- BANKSZÁMLA + nyitó egyenlegek + Chitanță-tömb
  -- ══════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_bank FROM public.bankszamlak
  WHERE congregation_id = v_cong ORDER BY id LIMIT 1;
  IF v_bank IS NULL THEN
    INSERT INTO public.bankszamlak
      (congregation_id, bank_neve, iban, valuta, aktiv, nyito_egyenleg, is_default)
    VALUES (v_cong, 'Teszt Bank (fiktív)', 'RO49TEST0000000000000001', 'RON', true, 4200, true)
    RETURNING id INTO v_bank;
  END IF;

  INSERT INTO public.bankszamla_nyito_egyenleg
    (bankszamla_id, congregation_id, eve, nyito_egyenleg_valuta, nyito_egyenleg_ron, forrasa, megjegyzes)
  SELECT v_bank, v_cong, 2025, 4200, 4200, 'manual', 'Fiktív teszt-adat'
  WHERE NOT EXISTS (SELECT 1 FROM public.bankszamla_nyito_egyenleg
                    WHERE bankszamla_id = v_bank AND eve = 2025);
  -- (A 2026-os bank-nyitót a blokk végén, a 2025-ös forgalomból számítva írjuk be.)

  INSERT INTO public.chitanta_tombok
    (congregation_id, block_nr, seria, szam_kezdet, szam_veg, darabszam_ossz,
     felhasznalt_darabszam, vasarlas_datuma, aktiv, megjegyzes)
  SELECT v_cong, '1', 'TSZT', 1, 100, 100, 46, DATE '2025-01-05', true, 'Fiktív teszt-tömb'
  WHERE NOT EXISTS (SELECT 1 FROM public.chitanta_tombok
                    WHERE congregation_id = v_cong AND seria = 'TSZT');

  -- ══════════════════════════════════════════════════════════════════════════
  -- BEFIZETÉSEK (~84 sor) — nyugta + iratszám a datum-év tengelyen folyamatos
  -- ══════════════════════════════════════════════════════════════════════════

  -- 2025: egyházfenntartói járulék — MIND a 28 felnőtt fizetett (100 RON)
  FOR r IN
    SELECT s.id, s.csaladnev, s.k_nev
    FROM public.szemely s
    WHERE s.congregation_id = v_cong AND s.cnp ~ '^EC-TSZT-[0-9][0-9][FM]$'
    ORDER BY s.cnp
  LOOP
    v_seq25 := v_seq25 + 1;
    INSERT INTO public.befizetes
      (xkey, id_szemely, forrasa, id_befizetescel, datum, osszeg, nyugta,
       iratszam, irattipus, csalad, deleted, fizetettev, userid, congregation_id)
    VALUES
      (gen_random_uuid()::text, r.id, r.csaladnev || ' ' || r.k_nev,
       v_cel_jarulek, DATE '2025-02-03' + ((v_seq25 - 1) * 9), 100,
       v_seq25::text, v_seq25::text, 'Készpénz', false, false, 2025, v_uid, v_cong);
  END LOOP;

  -- 2025: persely (havonta 1 összesített sor)
  FOR m IN 1..12 LOOP
    v_seq25 := v_seq25 + 1;
    INSERT INTO public.befizetes
      (xkey, forrasa, id_befizetescel, datum, osszeg, nyugta, iratszam,
       irattipus, csalad, deleted, fizetettev, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, 'Persely — vasárnapi istentisztelet',
       v_cel_persely, make_date(2025, m, 15), 60 + ((m * 7) % 45),
       v_seq25::text, v_seq25::text, 'Készpénz', false, false, 2025, v_uid, v_cong,
       'Havi összesített persely (fiktív)');
  END LOOP;

  -- 2025: karácsonyi adományok (6 családfő)
  m := 0;
  FOR r IN
    SELECT s.id, s.csaladnev, s.k_nev
    FROM public.szemely s
    WHERE s.congregation_id = v_cong
      AND s.cnp IN ('EC-TSZT-01F','EC-TSZT-03F','EC-TSZT-05F','EC-TSZT-06F','EC-TSZT-13F','EC-TSZT-15F')
    ORDER BY s.cnp
  LOOP
    m := m + 1;
    v_seq25 := v_seq25 + 1;
    INSERT INTO public.befizetes
      (xkey, id_szemely, forrasa, id_befizetescel, datum, osszeg, nyugta,
       iratszam, irattipus, csalad, deleted, fizetettev, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, r.id, r.csaladnev || ' ' || r.k_nev,
       v_cel_adomany, DATE '2025-12-07' + m, 50 + m * 25,
       v_seq25::text, v_seq25::text, 'Készpénz', false, false, 2025, v_uid, v_cong,
       'Adomány templomjavításra (fiktív)');
  END LOOP;

  -- 2026: járulék EGYÉNILEG (120 RON) — az 1., 2., 5., 6., 7., 8., 10., 13.
  -- család felnőttei (15 fő). A 3–4. család CSALÁDI sorral fizet (lásd lent),
  -- a 9., 11., 12., 14., 15. család SZÁNDÉKOSAN hátralékos.
  FOR r IN
    SELECT s.id, s.csaladnev, s.k_nev
    FROM public.szemely s
    WHERE s.congregation_id = v_cong
      AND s.cnp ~ '^EC-TSZT-[0-9][0-9][FM]$'
      AND substring(s.cnp FROM 9 FOR 2) IN ('01','02','05','06','07','08','10','13')
      AND s.meghalt = false
    ORDER BY s.cnp
  LOOP
    v_seq26 := v_seq26 + 1;
    INSERT INTO public.befizetes
      (xkey, id_szemely, forrasa, id_befizetescel, datum, osszeg, nyugta,
       iratszam, irattipus, csalad, deleted, fizetettev, userid, congregation_id)
    VALUES
      (gen_random_uuid()::text, r.id, r.csaladnev || ' ' || r.k_nev,
       v_cel_jarulek, DATE '2026-01-19' + (v_seq26 * 7), 120,
       v_seq26::text, v_seq26::text, 'Készpénz', false, false, 2026, v_uid, v_cong);
  END LOOP;

  -- 2026: CSALÁDI járulék-sorok (id_csalad-only, csalad=true) — a 3. és 4.
  -- család egyben fizette mindkét felnőtt díját (2 × 120 = 240 RON).
  IF v_csalad3 IS NOT NULL THEN
    v_seq26 := v_seq26 + 1;
    INSERT INTO public.befizetes
      (xkey, id_csalad, forrasa, id_befizetescel, datum, osszeg, nyugta,
       iratszam, irattipus, csalad, deleted, fizetettev, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_csalad3, 'Mintakerti család', v_cel_jarulek,
       DATE '2026-03-16', 240, v_seq26::text, v_seq26::text, 'Készpénz',
       true, false, 2026, v_uid, v_cong, 'Családi befizetés (fiktív)');
  END IF;
  IF v_csalad4 IS NOT NULL THEN
    v_seq26 := v_seq26 + 1;
    INSERT INTO public.befizetes
      (xkey, id_csalad, forrasa, id_befizetescel, datum, osszeg, nyugta,
       iratszam, irattipus, csalad, deleted, fizetettev, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_csalad4, 'Próbavári család', v_cel_jarulek,
       DATE '2026-03-23', 240, v_seq26::text, v_seq26::text, 'Készpénz',
       true, false, 2026, v_uid, v_cong, 'Családi befizetés (fiktív)');
  END IF;

  -- 2026: persely (jan–júl)
  FOR m IN 1..7 LOOP
    v_seq26 := v_seq26 + 1;
    INSERT INTO public.befizetes
      (xkey, forrasa, id_befizetescel, datum, osszeg, nyugta, iratszam,
       irattipus, csalad, deleted, fizetettev, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, 'Persely — vasárnapi istentisztelet',
       v_cel_persely, make_date(2026, m, 15), 65 + ((m * 11) % 40),
       v_seq26::text, v_seq26::text, 'Készpénz', false, false, 2026, v_uid, v_cong,
       'Havi összesített persely (fiktív)');
  END LOOP;

  -- 2026: banki adományok (4 átutalás — a Bank nézet demójához)
  m := 0;
  FOR r IN
    SELECT s.id, s.csaladnev, s.k_nev
    FROM public.szemely s
    WHERE s.congregation_id = v_cong
      AND s.cnp IN ('EC-TSZT-03M','EC-TSZT-06F','EC-TSZT-07F','EC-TSZT-15M')
    ORDER BY s.cnp
  LOOP
    m := m + 1;
    INSERT INTO public.befizetes
      (xkey, id_szemely, forrasa, id_befizetescel, datum, osszeg, nyugta,
       iratszam, irattipus, csalad, deleted, fizetettev, userid,
       congregation_id, bankszamla_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, r.id, r.csaladnev || ' ' || r.k_nev,
       v_cel_adomany, make_date(2026, m + 1, 8), 100 + m * 50,
       'OP-2026-' || m, 'Extr.' || (m + 1), 'OP', false, false, 2026, v_uid,
       v_cong, v_bank, 'Banki adomány (fiktív)');
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════════
  -- KIADÁSOK (~32 sor) — villany (205.01), irodaszer (201.12), tűzifa, posta, bank
  -- ══════════════════════════════════════════════════════════════════════════

  -- 2025: villanyszámla havonta
  FOR m IN 1..12 LOOP
    v_kseq25 := v_kseq25 + 1;
    INSERT INTO public.kiadas
      (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
       atvevo, deleted, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_kc_villany, make_date(2025, m, 10), 175 + m * 4,
       v_kseq25::text, v_kseq25::text, 'Fact.+Bon.',
       'Electrica Furnizare SA', false, v_uid, v_cong, 'Villanyszámla (fiktív)');
  END LOOP;

  -- 2025: irodaszer negyedévente
  FOREACH m IN ARRAY ARRAY[2, 5, 8, 11] LOOP
    v_kseq25 := v_kseq25 + 1;
    INSERT INTO public.kiadas
      (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
       atvevo, deleted, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_kc_iroda, make_date(2025, m, 18), 85.50,
       v_kseq25::text, v_kseq25::text, 'Fact.+Bon.',
       'Teszt Papírbolt Kft. (fiktív)', false, v_uid, v_cong, 'Irodaszer (fiktív)');
  END LOOP;

  -- 2025: tűzifa (1 nagy tétel) + posta (2 tétel)
  v_kseq25 := v_kseq25 + 1;
  INSERT INTO public.kiadas
    (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
     atvevo, deleted, userid, congregation_id, megjegyzes)
  VALUES
    (gen_random_uuid()::text, v_kc_villany, TIMESTAMP '2025-10-20 00:00:00', 1200,
     v_kseq25::text, v_kseq25::text, 'Fact.+Bon.',
     'Teszt Erdészet (fiktív)', false, v_uid, v_cong, 'Tűzifa a templom fűtéséhez (fiktív)');
  FOREACH m IN ARRAY ARRAY[4, 9] LOOP
    v_kseq25 := v_kseq25 + 1;
    INSERT INTO public.kiadas
      (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
       atvevo, deleted, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_kc_iroda, make_date(2025, m, 25), 24,
       v_kseq25::text, v_kseq25::text, 'Fact.+Bon.',
       'Poșta Română', false, v_uid, v_cong, 'Postaköltség (fiktív)');
  END LOOP;

  -- 2026: villanyszámla (jan–júl)
  FOR m IN 1..7 LOOP
    v_kseq26 := v_kseq26 + 1;
    INSERT INTO public.kiadas
      (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
       atvevo, deleted, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_kc_villany, make_date(2026, m, 10), 190 + m * 3,
       v_kseq26::text, v_kseq26::text, 'Fact.+Bon.',
       'Electrica Furnizare SA', false, v_uid, v_cong, 'Villanyszámla (fiktív)');
  END LOOP;

  -- 2026: irodaszer (2) + posta (1)
  FOREACH m IN ARRAY ARRAY[3, 6] LOOP
    v_kseq26 := v_kseq26 + 1;
    INSERT INTO public.kiadas
      (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
       atvevo, deleted, userid, congregation_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_kc_iroda, make_date(2026, m, 18), 92,
       v_kseq26::text, v_kseq26::text, 'Fact.+Bon.',
       'Teszt Papírbolt Kft. (fiktív)', false, v_uid, v_cong, 'Irodaszer (fiktív)');
  END LOOP;
  v_kseq26 := v_kseq26 + 1;
  INSERT INTO public.kiadas
    (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
     atvevo, deleted, userid, congregation_id, megjegyzes)
  VALUES
    (gen_random_uuid()::text, v_kc_iroda, TIMESTAMP '2026-05-25 00:00:00', 26,
     v_kseq26::text, v_kseq26::text, 'Fact.+Bon.',
     'Poșta Română', false, v_uid, v_cong, 'Postaköltség (fiktív)');

  -- 2026: banki kiadások (3 átutalás)
  FOR m IN 1..3 LOOP
    INSERT INTO public.kiadas
      (xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
       atvevo, deleted, userid, congregation_id, bankszamla_id, megjegyzes)
    VALUES
      (gen_random_uuid()::text, v_kc_villany, make_date(2026, m + 1, 5), 210 + m * 15,
       'OP-K-2026-' || m, 'Extr.' || (m + 1), 'OP',
       'Electrica Furnizare SA', false, v_uid, v_cong, v_bank,
       'Banki átutalás — közüzemi díj (fiktív)');
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════════
  -- LELTÁR (6 tétel — a kategóriák az app fix készletéből:
  -- alapeszkoz / telek / csekely / konyv / kegyszer / karpotlasi / bizomanyi)
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.leltar_tetelek
    (congregation_id, kategoria, megnevezes, leltari_szam, helyszin,
     felelos_neve, beszerzes_datuma, beszerzesi_ertek, mennyiseg,
     mertekegyseg, userid, megjegyzes,
     konyv_kiado, konyv_kiadas_eve)
  VALUES
    (v_cong, 'alapeszkoz', 'Templomi harang (fiktív)',            'TSZT-001', 'Templomtorony',
     'Teszt Lelkész', DATE '1998-05-01', 15000, 1, 'db', v_uid, 'Fiktív teszt-tétel', NULL, NULL),
    (v_cong, 'alapeszkoz', 'Templomi padok (fiktív)',             'TSZT-002', 'Templomhajó',
     'Teszt Lelkész', DATE '2005-09-15', 8400, 24, 'db', v_uid, 'Fiktív teszt-tétel', NULL, NULL),
    (v_cong, 'kegyszer',   'Úrvacsorai kehely, ezüst (fiktív)',   'TSZT-003', 'Sekrestye',
     'Teszt Lelkész', DATE '1965-04-11', 3500, 1, 'db', v_uid, 'Fiktív teszt-tétel', NULL, NULL),
    (v_cong, 'csekely',    'Laptop — irodai (fiktív)',            'TSZT-004', 'Lelkészi hivatal',
     'Teszt Lelkész', DATE '2024-02-20', 2800, 1, 'db', v_uid, 'Fiktív teszt-tétel', NULL, NULL),
    (v_cong, 'csekely',    'Nyomtató (fiktív)',                   'TSZT-005', 'Lelkészi hivatal',
     'Teszt Lelkész', DATE '2023-11-05', 950, 1, 'db', v_uid, 'Fiktív teszt-tétel', NULL, NULL),
    (v_cong, 'konyv',      'Magyar református énekeskönyv (fiktív készlet)', 'TSZT-006', 'Templomhajó',
     'Teszt Lelkész', DATE '2019-06-01', 1500, 50, 'db', v_uid, 'Fiktív teszt-tétel',
     'Teszt Kiadó', 2019);

  -- ══════════════════════════════════════════════════════════════════════════
  -- MUNKANAPLÓ (8 bejegyzés — 2026 nyári vasárnapok)
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, bibliaolvasas, alapige, cim, enekek,
     jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
     szolgalt, persely, du, deleted, congregation_id, created)
  VALUES
    (DATE '2026-06-07', 'istentisztelet', 'szolgalat', 'Zsolt 23',    'Jn 10,11',   'A jó pásztor',            '42, 165, 396',  14, 22, 6, 42, 'Teszt Lelkész', 74,  false, false, v_cong, now()),
    (DATE '2026-06-14', 'istentisztelet', 'szolgalat', 'Mt 5,1-12',   'Mt 5,9',     'A békességszerzők',       '65, 254, 471',  12, 19, 4, 35, 'Teszt Lelkész', 68,  false, false, v_cong, now()),
    (DATE '2026-06-21', 'istentisztelet', 'szolgalat', 'Lk 15,11-32', 'Lk 15,20',   'A tékozló fiú hazatér',   '25, 165, 434',  15, 24, 7, 46, 'Teszt Lelkész', 81,  false, false, v_cong, now()),
    (DATE '2026-06-28', 'istentisztelet', 'szolgalat', 'Róm 8,28-39', 'Róm 8,31',   'Ha Isten velünk…',        '90, 254, 396',  13, 20, 5, 38, 'Teszt Lelkész', 72,  false, false, v_cong, now()),
    (DATE '2026-07-05', 'istentisztelet', 'szolgalat', '1Kor 13',     '1Kor 13,13', 'A szeretet himnusza',     '42, 265, 471',  16, 23, 8, 47, 'Teszt Lelkész', 88,  false, false, v_cong, now()),
    (DATE '2026-07-12', 'istentisztelet', 'szolgalat', 'Zsolt 121',   'Zsolt 121,1','Honnan jön a segítségem?','65, 165, 434',  12, 18, 4, 34, 'Teszt Lelkész', 63,  false, false, v_cong, now()),
    (DATE '2026-07-16', 'bibliaóra',      'katekezis', 'ApCsel 2',    'ApCsel 2,42','Az első gyülekezet',      '165',            5,  9, 0, 14, 'Teszt Lelkész', NULL,false, false, v_cong, now()),
    (DATE '2026-07-19', 'istentisztelet', 'szolgalat', 'Ézs 40,27-31','Ézs 40,31',  'Akik az Úrban bíznak',    '25, 254, 396',  14, 21, 6, 41, 'Teszt Lelkész', 76,  false, false, v_cong, now());

  -- ══════════════════════════════════════════════════════════════════════════
  -- GYÜLEKEZETI PROGRAMOK (5 közelgő esemény)
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.gyulekezeti_programok
    (congregation_id, cim, leiras, datum, ido_kezdes, helyszin, tipus,
     prioritas, letrehozta_id, letrehozta_nev)
  VALUES
    (v_cong, 'Vasárnapi istentisztelet',            'Rendes vasárnapi istentisztelet (fiktív).', DATE '2026-08-16', TIME '11:00', 'Templom',            'istentisztelet', 'normal',  v_uid, 'Teszt Lelkész'),
    (v_cong, 'Bibliaóra',                           'Heti bibliaóra (fiktív).',                  DATE '2026-08-20', TIME '18:00', 'Gyülekezeti terem',  'bibliaora',      'normal',  v_uid, 'Teszt Lelkész'),
    (v_cong, 'Presbiteri gyűlés',                   'Őszi ülésszak előkészítése (fiktív).',      DATE '2026-08-28', TIME '19:00', 'Lelkészi hivatal',   'presbiteri',     'fontos',  v_uid, 'Teszt Lelkész'),
    (v_cong, 'Gyülekezeti nap — szeretetvendégség', 'Közösségi nap a templomkertben (fiktív).',  DATE '2026-09-05', TIME '10:00', 'Templomkert',        'kozossegi',      'kiemelt', v_uid, 'Teszt Lelkész'),
    (v_cong, 'Konfirmandus-oktatás évnyitó',        'A 2026/27-es konfirmandus-évfolyam első alkalma (fiktív).', DATE '2026-09-12', TIME '16:00', 'Gyülekezeti terem', 'gyerekprogram', 'normal', v_uid, 'Teszt Lelkész');

  -- ══════════════════════════════════════════════════════════════════════════
  -- FELMENTÉS + KOR-KEDVEZMÉNY (a tartozás-motor demójához)
  -- ══════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_szemely FROM public.szemely
    WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-11F';
  IF v_szemely IS NOT NULL THEN
    INSERT INTO public.felmentes
      (felmento, datum, oka, kezdete, vege, id_szemely, congregation_id)
    VALUES ('Presbitérium', TIMESTAMP '2025-01-15 00:00:00', 'Egészségi állapot (fiktív)',
            2025, 2099, v_szemely, v_cong);
  END IF;

  -- Kor-kedvezmény: 70 év felett 50% LEVONANDÓ kedvezmény (a % szemantikája:
  -- levonandó kedvezmény; RON = fizetendő összeg — user-döntés, 2026-07-16)
  INSERT INTO public.jarulek_kedvezmeny
    (congregation_id, ev, tipus, kor_tol, szazalek, aktiv)
  SELECT v_cong, 2026, 'kor', 70, 50, true
  WHERE NOT EXISTS (SELECT 1 FROM public.jarulek_kedvezmeny
                    WHERE congregation_id = v_cong AND ev = 2026 AND tipus = 'kor');

  -- ══════════════════════════════════════════════════════════════════════════
  -- ANYAKÖNYVEK (pár minta-tétel)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Keresztelők (a két legkisebb gyermek)
  SELECT id INTO v_szemely FROM public.szemely WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-07C1';
  IF v_szemely IS NOT NULL THEN
    INSERT INTO public.keresztseg
      (id_szemely, datum, lelkeszneve, keresztszulok, munkanaploba, congregation_id, megjegyzes)
    VALUES (v_szemely, TIMESTAMP '2020-06-14 00:00:00', 'Teszt Lelkész',
            'Mintafalvi Gergő és Réka (fiktív)', false, v_cong, 'Fiktív teszt-adat');
  END IF;
  SELECT id INTO v_szemely FROM public.szemely WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-15C4';
  IF v_szemely IS NOT NULL THEN
    INSERT INTO public.keresztseg
      (id_szemely, datum, lelkeszneve, keresztszulok, munkanaploba, congregation_id, megjegyzes)
    VALUES (v_szemely, TIMESTAMP '2019-03-10 00:00:00', 'Teszt Lelkész',
            'Tesztszegi Dénes és Anikó (fiktív)', false, v_cong, 'Fiktív teszt-adat');
  END IF;

  -- Konfirmáció (03C1 Nándor)
  SELECT id INTO v_szemely FROM public.szemely WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-03C1';
  IF v_szemely IS NOT NULL THEN
    INSERT INTO public.konfirmalas
      (id_szemely, datum, lelkeszneve, keresztelesideje, congregation_id, megjegyzes)
    VALUES (v_szemely, DATE '2018-05-20', 'Teszt Lelkész', DATE '2004-05-30', v_cong, 'Fiktív teszt-adat');
  END IF;

  -- Esketés (F08 — friss házasok)
  SELECT f.id, n.id INTO v_ferfi, v_no
  FROM public.szemely f, public.szemely n
  WHERE f.congregation_id = v_cong AND f.cnp = 'EC-TSZT-08F'
    AND n.congregation_id = v_cong AND n.cnp = 'EC-TSZT-08M';
  IF v_ferfi IS NOT NULL AND v_no IS NOT NULL THEN
    INSERT INTO public.hazassag
      (id_ferfi, id_no, datum, lelkeszneve, tanuk, munkanaploba, vegyes, congregation_id, megjegyzes)
    VALUES (v_ferfi, v_no, TIMESTAMP '2026-05-16 00:00:00', 'Teszt Lelkész',
            'Tesztfalvi Botond, Mintahegyi Zsófia (fiktív)', false, false, v_cong, 'Fiktív teszt-adat');
  END IF;

  -- Temetés (14F Vilmos †2026-02-10; a trigger a meghalt-flaget amúgy is állítja)
  SELECT id INTO v_szemely FROM public.szemely WHERE congregation_id = v_cong AND cnp = 'EC-TSZT-14F';
  IF v_szemely IS NOT NULL THEN
    INSERT INTO public.temetes
      (id_szemely, hdatum, tdatum, hoka, lelkeszneve, munkanaploba, congregation_id, megjegyzes)
    VALUES (v_szemely, TIMESTAMP '2026-02-10 00:00:00', TIMESTAMP '2026-02-13 00:00:00',
            'természetes halál', 'Teszt Lelkész', false, v_cong, 'Fiktív teszt-adat');
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- Kereszt-gyülekezeti értesítés-takarítás (biztos, ami biztos: ha a kitalált
  -- nevek mégis egyeztek volna valamivel, itt eltűnik az értesítés)
  -- ══════════════════════════════════════════════════════════════════════════
  DELETE FROM public.cross_congregation_match_notifications
  WHERE triggering_congregation_id = v_cong;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2026-os nyitó egyenlegek — a TÉNYLEGES 2025-ös forgalomból SZÁMÍTVA
  -- (review-fix: a korábbi fix értékek ellentmondtak a forgalomnak).
  -- Készpénz: 2025 nyitó + kassza-bevételek − kassza-kiadások.
  -- Bank:     2025 nyitó + banki bevételek − banki kiadások.
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.keszpenz_nyito_egyenleg (congregation_id, eve, nyito_egyenleg, forrasa, megjegyzes)
  SELECT v_cong, 2026,
         850
         + COALESCE((SELECT SUM(osszeg) FROM public.befizetes
                     WHERE congregation_id = v_cong AND deleted = false AND bankszamla_id IS NULL
                       AND datum >= DATE '2025-01-01' AND datum < DATE '2026-01-01'), 0)
         - COALESCE((SELECT SUM(osszeg) FROM public.kiadas
                     WHERE congregation_id = v_cong AND deleted = false AND bankszamla_id IS NULL
                       AND datum >= DATE '2025-01-01' AND datum < DATE '2026-01-01'), 0),
         'manual', 'Fiktív teszt-adat — a 2025-ös forgalomból számítva'
  ON CONFLICT (congregation_id, eve) DO NOTHING;

  INSERT INTO public.bankszamla_nyito_egyenleg
    (bankszamla_id, congregation_id, eve, nyito_egyenleg_valuta, nyito_egyenleg_ron, forrasa, megjegyzes)
  SELECT v_bank, v_cong, 2026, zaro.osszeg, zaro.osszeg, 'manual', 'Fiktív teszt-adat — a 2025-ös forgalomból számítva'
  FROM (
    SELECT 4200
           + COALESCE((SELECT SUM(osszeg) FROM public.befizetes
                       WHERE congregation_id = v_cong AND deleted = false AND bankszamla_id IS NOT NULL
                         AND datum >= DATE '2025-01-01' AND datum < DATE '2026-01-01'), 0)
           - COALESCE((SELECT SUM(osszeg) FROM public.kiadas
                       WHERE congregation_id = v_cong AND deleted = false AND bankszamla_id IS NOT NULL
                         AND datum >= DATE '2025-01-01' AND datum < DATE '2026-01-01'), 0) AS osszeg
  ) zaro
  WHERE NOT EXISTS (SELECT 1 FROM public.bankszamla_nyito_egyenleg
                    WHERE bankszamla_id = v_bank AND eve = 2026);

  RAISE NOTICE 'KÉSZ: fiktív seed betöltve. Személy: 48, család: 15, befizetés 2025: %, befizetés 2026: % (+4 banki), kiadás: % (+3 banki).',
    v_seq25, v_seq26, v_kseq25 + v_kseq26;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS — darabszámok a seed után
-- ════════════════════════════════════════════════════════════════════════════
WITH cid AS (SELECT '7e570000-0000-4000-8000-000000000003'::uuid AS id)
SELECT * FROM (
  SELECT 10 AS s, 'szemely (várt: 48)'            AS tabla, count(*) AS db FROM public.szemely, cid            WHERE congregation_id = cid.id
  UNION ALL SELECT 11, 'csalad (várt: 15)', count(*) FROM public.csalad c, cid
    WHERE c.id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
       OR c.id_no    IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
  UNION ALL SELECT 12, 'gyerek (várt: 20)', count(*) FROM public.gyerek g, cid
    WHERE g.id_szemely IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
  UNION ALL SELECT 13, 'haztartas (várt: 15)',      count(*) FROM public.haztartas, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 14, 'haztartas_tag (várt: 48)',  count(*) FROM public.haztartas_tag, cid      WHERE congregation_id = cid.id
  UNION ALL SELECT 15, 'szemely_kapcsolat',         count(*) FROM public.szemely_kapcsolat, cid  WHERE congregation_id = cid.id
  UNION ALL SELECT 20, 'befizetes (várt: ~84)',     count(*) FROM public.befizetes, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 21, 'kiadas (várt: ~32)',        count(*) FROM public.kiadas, cid             WHERE congregation_id = cid.id
  UNION ALL SELECT 22, 'bankszamlak (várt: 1)',     count(*) FROM public.bankszamlak, cid        WHERE congregation_id = cid.id
  UNION ALL SELECT 23, 'bealitas (várt: 2)',        count(*) FROM public.bealitas, cid           WHERE congregation_id = cid.id
  UNION ALL SELECT 24, 'keszpenz_nyito (várt: 2)',  count(*) FROM public.keszpenz_nyito_egyenleg, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 25, 'bank_nyito (várt: 2)',      count(*) FROM public.bankszamla_nyito_egyenleg, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 26, 'chitanta_tombok (várt: 1)', count(*) FROM public.chitanta_tombok, cid    WHERE congregation_id = cid.id
  UNION ALL SELECT 30, 'leltar_tetelek (várt: 6)',  count(*) FROM public.leltar_tetelek, cid     WHERE congregation_id = cid.id
  UNION ALL SELECT 31, 'munkanaplo (várt: 8)',      count(*) FROM public.munkanaplo, cid         WHERE congregation_id = cid.id
  UNION ALL SELECT 32, 'programok (várt: 5)',       count(*) FROM public.gyulekezeti_programok, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 40, 'keresztseg (várt: 2)',      count(*) FROM public.keresztseg, cid         WHERE congregation_id = cid.id
  UNION ALL SELECT 41, 'konfirmalas (várt: 1)',     count(*) FROM public.konfirmalas, cid        WHERE congregation_id = cid.id
  UNION ALL SELECT 42, 'hazassag (várt: 1)',        count(*) FROM public.hazassag, cid           WHERE congregation_id = cid.id
  UNION ALL SELECT 43, 'temetes (várt: 1)',         count(*) FROM public.temetes, cid            WHERE congregation_id = cid.id
  UNION ALL SELECT 44, 'elkoltozott (várt: 1)',     count(*) FROM public.elkoltozott, cid        WHERE congregation_id = cid.id
  UNION ALL SELECT 45, 'felmentes (várt: 1)',       count(*) FROM public.felmentes, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 46, 'jarulek_kedvezmeny (várt: 1)', count(*) FROM public.jarulek_kedvezmeny, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 50, 'cross-match értesítés (várt: 0)', count(*) FROM public.cross_congregation_match_notifications, cid
    WHERE triggering_congregation_id = cid.id
) t
ORDER BY s;
