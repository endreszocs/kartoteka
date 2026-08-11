-- KARTOTEKA — ORSZÁGOK PÓTLÁSA + A KÜLFÖLDI TELEPÜLÉSEK ÁTKÖTÉSE (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). Egy menetben, felülről lefelé.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT — a MÉRT állapot, nem elmélet
-- ════════════════════════════════════════════════════════════════════════════
-- A 2026-08-11-terkep-hibajelzes-elonezet.sql ÉLES eredménye:
--     · jelzést kapó tagok száma:      0     ← a funkció ma SEMMIT nem csinál
--     · elnémított, élő tagokkal:    102
--
-- Az ok EGYETLEN mondatban: az `adrcountry` táblában EGYETLEN sor van
-- (Románia, id=1, sname='RO') — az egész repóban egy `INSERT INTO
-- public.adrcountry` létezik, a 2026-04-21-adr-seed-01-countries.sql 8. sora.
-- Minden `adrcounty` erre az egy sorra mutat, ezért a címtörzs BUDAPESTRE,
-- DEBRECENRE, GÖDÖLLŐRE, GYŐRRE és „HOLLANDIÁRA" IS azt feleli, hogy Románia.
--
-- Az ország-mező tehát nem hordoz információt, a külföld-detektor VAK, és a
-- kapu emiatt a megye/irányítószám ágakra esik vissza — amin viszont a legacy
-- („?" megyéjű) erdélyi sorok elbuknak. Az eredmény:
--     · 8 tag valóban külföldi     → helyesen néma (de VÉLETLENÜL az)
--     · 24 tag VALÓDI erdélyi hiba → tévedésből néma  (Zágon, Páké,
--       Sepsiszentgyörgy, Kovászna, Csíkcsicsó)
--     · 70 tag a „?" helykitöltőn  → külön ügy, NEM ez a migráció kezeli
--
-- EZ A FÁJL AZ ADATOT JAVÍTJA, NEM A LOGIKÁT. A kapu helyes; csak vak volt.
-- Amint az ország valódi információt hordoz, a jelzés MAGÁTÓL megszólal — a
-- kód már fel van készítve rá (`apps/web/lib/members/directions.ts` →
-- `isOrszagtorzsErtelmes`: amíg egy soros a törzs, szándékosan néma marad).
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT NEM CSINÁL
-- ════════════════════════════════════════════════════════════════════════════
--  ⛔ NEM másol `siruta_code`-ot. Az `adrlocality_siruta_uq` ORSZÁGOSAN egyedi,
--     és 2026-08-11-én már bukott el rajta egy migráció 23505-tel.
--  ⛔ NEM nyúl olyan település-sorhoz, amelynek VAN `siruta_code`-ja. Az a román
--     hivatalos nyilvántartás azonosítója — egy ilyen sort külföldre kötni
--     adatrombolás lenne.
--  ⛔ NEM köti át egyetlen TAG címét sem másik település-sorra. A sort töltjük
--     fel, nem a tagot mozgatjuk (ugyanaz az elv, mint a
--     2026-08-11-roman-helysegnevek-potlasa.sql-ben).
--  ⛔ NEM ad `name_ro`-t az új külföldi megyéknek. A megye-legördülő
--     (`lib/address/actions.ts` → `listCounties`) a `countryid = 1` ÉS
--     `name_ro IS NOT NULL` szűrővel dolgozik — a `name_ro` kihagyása a MÁSODIK
--     védővonal, hogy a lelkész romániai megye-választójába ne szivárogjon be.
--  ⛔ NEM állítja át a `needs_review`-t. Ha egy sor importból jött, maradjon
--     annak jelölve — a kapu úgyis némán hagyja, és most már az ORSZÁG is védi.
--
-- ⚠️ „HOLLANDIA" MINT TELEPÜLÉS — SZÁNDÉKOSAN FÉLKÉSZ MARAD.
--    A címtörzsben van egy „Hollandia" NEVŰ település-sor, 2 élő taggal. Ez
--    nyilvánvalóan hibás adatfelvitel: egy ORSZÁG neve került a település
--    mezőbe. NEM TALÁLJUK KI, melyik holland városról van szó — az találgatás
--    lenne, és a találgatás rosszabb, mint a hiány.
--    Amit ez a migráció tesz: a sort a HOLLANDIA országhoz köti, hogy a térkép-
--    jelzés biztosan ne szóljon rá hamisan (az „Útvonal" gomb pedig innentől
--    „Hollandia"-t küld a Google-nek „România" helyett — ez már javulás).
--    ⚠️ A „(külföld)" megye NEM kerül bele a térkép-célpontba: a
--       `formatRomanianAddress` külföldi országnál kihagyja a megyét
--       (`apps/web/lib/members/directions.ts`, 2026-08-11). E nélkül a célpont
--       „Hollandia nr. 12, (külföld), Hollandia" lett volna.
--    AMIT A LELKÉSZNEK KÉZZEL KELL ELVÉGEZNIE: annál a 2 tagnál a személyi
--    kartonon → Elérhetőségek beírni a tényleges holland várost. A lenti
--    ellenőrző SELECT 12. sora megnevezi őket — DE EZ MÁR NEM AZ EGYETLEN HELY:
--    2026-08-11 óta a személyi kartonon is megjelenik a pirula
--    („Országnév a település helyén", `isCountryNamedLocality`), a teljes
--    magyarázó mondattal együtt. A teendő tehát nem vész el a futtatás után.

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 0 — FAIL-CLOSED ÁLLAPOTFELMÉRÉS. Ha az előfeltétel hiányzik,     ║
-- ║ ITT ÁLL MEG, mielőtt bármit írnánk.                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
DO $$
DECLARE
  v_orszag_db     integer;
  v_romania_id    integer;
  v_kulfoldi_db   integer;
  v_siruta_utkoz  integer;
  v_nev_utkoz     text;
BEGIN
  -- (a) Léteznek-e egyáltalán a táblák, ahogy várjuk?
  IF to_regclass('public.adrcountry') IS NULL OR to_regclass('public.adrcounty') IS NULL
     OR to_regclass('public.adrlocality') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL HIÁNYZIK: az adrcountry/adrcounty/adrlocality táblák egyike nem létezik.';
  END IF;

  -- (b) Megvan-e a Románia-sor? Minden átkötés ehhez képest értelmezett.
  SELECT id INTO v_romania_id
    FROM public.adrcountry
   WHERE lower(COALESCE(sname, '')) = 'ro'
      OR lower(COALESCE(name, '')) IN ('românia', 'romania')
   ORDER BY id
   LIMIT 1;
  IF v_romania_id IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL HIÁNYZIK: nincs Románia-sor az adrcountry táblában. Futott már a 2026-04-21-adr-seed-01-countries.sql?';
  END IF;

  SELECT count(*) INTO v_orszag_db FROM public.adrcountry;

  -- (c) Megvannak-e egyáltalán az átkötendő sorok? Ha nincsenek, ne csináljunk
  --     úgy, mintha dolgoztunk volna — de ez NEM hiba (lehet, hogy már lefutott).
  --
  -- ⚠️ 2026-08-11 — MIND A HÁROM NÉVOSZLOPOT NÉZZÜK (`name`, `name_hu`, `name_ro`).
  --    A korábbi változat CSAK az `l.name`-et illesztette, a végén álló riport
  --    viszont `COALESCE(NULLIF(btrim(name_hu),''), name)`-et mutat — és az ÉLES
  --    mérés is abból a kifejezésből jött. Ha egy sornál a magyar név a
  --    `name_hu`-ban ül, az UPDATE 0 sort érintett volna, a záró őrszem
  --    ugyanazzal a VAK predikátummal nem vette volna észre, a COMMIT lefutott
  --    volna — a fájl fő ígérete („MINDENT visszaperget") pedig nem teljesült
  --    volna. Az illesztés innentől MINDENÜTT (SZAKASZ 0, UPDATE, őrszem)
  --    ugyanaz a hármas vizsgálat.
  SELECT count(*) INTO v_kulfoldi_db
    FROM public.adrlocality l
   WHERE translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
         IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
      OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
         IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
      OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
         IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia');

  -- (d) ŐRSZEM #1: van-e az átkötendők között SIRUTA-kódos sor?
  --     Ha igen, az egy hivatalos ROMÁN település — azt tilos külföldre kötni,
  --     és jelezni kell, mielőtt bármi történik.
  SELECT count(*) INTO v_siruta_utkoz
    FROM public.adrlocality l
   WHERE (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia'))
     AND NULLIF(btrim(COALESCE(l.siruta_code, '')), '') IS NOT NULL;
  IF v_siruta_utkoz > 0 THEN
    RAISE EXCEPTION
      'ÁLLJ: % olyan sor van a külföldi nevek között, amelynek VAN SIRUTA-kódja (tehát hivatalos ROMÁN település). Ezt kézzel kell megnézni — a migráció nem dönt helyetted.',
      v_siruta_utkoz;
  END IF;

  -- (e) ŐRSZEM #2 — A DUPLIKÁLT NÉV. EZ AZ, AMI 23505-tel ELHALNA.
  --
  -- ⚠️ AZ `adrlocality`-N VAN EGYEDI INDEX A (name, countyid) PÁRON. Bizonyíték:
  --    a 2026-04-21-adr-seed-02-localities.sql 13977. sora
  --    `ON CONFLICT (name, countyid) DO NOTHING`-gal zár — e nélkül 42P10-zel
  --    elhalt volna, márpedig a seed lefutott. (A Database_schema.sql dump
  --    egyáltalán nem tartalmaz indexeket, tehát nem alkalmas cáfolatnak: az
  --    `adrlocality_siruta_uq` sincs benne, mégis létezik — 2026-08-11-én már
  --    bukott is el rajta egy migráció.)
  --
  --    A lenti két UPDATE MINDEN illeszkedő sort EGYETLEN cél-megyébe húz. Ha
  --    ugyanaz a NÉV kétszer szerepel a törzsben (pl. a legacy „?" megyében ÉS
  --    Kovásznában, ahova az `add_locality_for_review` az importból jött sorokat
  --    teszi — az RPC nem dedupál, a `find_locality_match` pedig
  --    `needs_review = false`-t szűr, tehát a duplikátumot meg sem találja),
  --    akkor mindkettő ugyanabba a megyébe kerülne → 23505. A tranzakció
  --    fail-closed visszapergene, de a lelkész egy NYERS Postgres-hibát kapna
  --    egy migrációtól, amit idempotensként hirdetünk. Inkább ITT állunk meg,
  --    olvasható magyar mondattal.
  --
  --    A csoportosítás a NYERS `btrim(name)` szerint megy: az egyedi index a
  --    nyers néven van, ez tehát a tényleges ütköző kulcs. (A `btrim` egy
  --    árnyalattal szigorúbb a valóságnál — „Budapest" és „Budapest " nem
  --    ütközne —, de a szigorúbb irány itt a helyes: a lelkész összevonja a két
  --    sort, és utána tiszta a törzs.)
  SELECT string_agg(d.kulcs || ' (' || d.db || ' sor)', ', ' ORDER BY d.kulcs)
    INTO v_nev_utkoz
    FROM (
      SELECT btrim(l.name) AS kulcs, count(*) AS db
        FROM public.adrlocality l
       WHERE NULLIF(btrim(COALESCE(l.siruta_code, '')), '') IS NULL
         AND (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
              IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
           OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
              IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
           OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
              IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia'))
       GROUP BY btrim(l.name)
      HAVING count(*) > 1
    ) d;
  IF v_nev_utkoz IS NOT NULL THEN
    RAISE EXCEPTION
      'ÁLLJ: ugyanaz a településnév TÖBBSZÖR szerepel a címtörzsben: %. Mind egyetlen (külföld) megyébe kerülne, és az adrlocality (name, countyid) egyedi indexe 23505-tel elutasítaná. Előbb vond össze ezeket a sorokat (a tagok címét át kell kötni a megmaradó sorra), és utána futtasd újra ezt a fájlt.',
      v_nev_utkoz;
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben. Országok most: % (Románia id=%). Átkötendő település-sor: %.',
    v_orszag_db, v_romania_id, v_kulfoldi_db;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ A JAVÍTÁS — EGYETLEN tranzakció. A COMMIT előtt záró őrszem áll: ha az    ║
-- ║ eredmény nem a várt, RAISE EXCEPTION-nel MINDENT visszaperget.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
BEGIN;

-- A sorozatok szinkronba hozása. A legacy törzsben lehetnek a sequence fölötti
-- id-k; e nélkül az INSERT 23505-tel elhalna a PRIMARY KEY-en. Idempotens.
SELECT setval('public.adrcountry_id_seq',
              GREATEST(2, (SELECT COALESCE(MAX(id), 1) + 1 FROM public.adrcountry)), false);
SELECT setval('public.adrcounty_id_seq',
              GREATEST(2, (SELECT COALESCE(MAX(id), 1) + 1 FROM public.adrcounty)), false);

-- ── 1. AZ ORSZÁGOK ─────────────────────────────────────────────────────────
-- ⚠️ MIÉRT `NOT EXISTS` ÉS NEM `ON CONFLICT`: az `adrcountry` egyetlen egyedi
--    megszorítása a PRIMARY KEY (id) — a `name`/`sname` oszlopon NINCS egyedi
--    index (lásd migration-docs/Database_schema.sql). Egy `ON CONFLICT (name)`
--    tehát 42P10-zel elhalna, egy vak INSERT pedig NÉMÁN duplikálna. A
--    duplikátum itt valódi kár: a `find_locality_match` és a `listCountries`
--    `LIMIT 1`-gyel keres, tehát ütközésnél VÉLETLENSZERŰ sort találna el.
-- ⚠️ AZ `sname` A DÖNTŐ MEZŐ: az `isRomanianCountry` ELŐSZÖR ezt olvassa, és ha
--    van, a nevekre rá sem néz. Ezért soha nem lehet 'RO' egy másik országon.
INSERT INTO public.adrcountry (name, sname, name_hu, name_ro)
SELECT 'Magyarország', 'HU', 'Magyarország', 'Ungaria'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.adrcountry
    WHERE lower(COALESCE(sname, '')) = 'hu'
       OR lower(btrim(COALESCE(name, ''))) = 'magyarország'
       OR lower(btrim(COALESCE(name_hu, ''))) = 'magyarország'
 );

INSERT INTO public.adrcountry (name, sname, name_hu, name_ro)
SELECT 'Hollandia', 'NL', 'Hollandia', 'Olanda'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.adrcountry
    WHERE lower(COALESCE(sname, '')) = 'nl'
       OR lower(btrim(COALESCE(name, ''))) = 'hollandia'
       OR lower(btrim(COALESCE(name_hu, ''))) = 'hollandia'
 );

-- ── 2. EGY-EGY SEMLEGES MEGYE ORSZÁGONKÉNT ─────────────────────────────────
-- ⚠️ MIÉRT KELL EGYÁLTALÁN MEGYE: az `adrlocality.countyid` NOT NULL, és az
--    `adrcounty.countryid` is NOT NULL (Database_schema.sql) — település tehát
--    CSAK megyén keresztül köthető országhoz. Ráadásul az
--    `add_locality_for_review` RPC RAISE EXCEPTION-nel elhal, ha egy országhoz
--    egyetlen megye sem tartozik.
-- ⚠️ MIÉRT „(külföld)" ÉS MIÉRT NINCS `name_ro`: nem akarunk magyar/holland
--    megyerendszert modellezni — arra sem adat, sem igény nincs. Ez egy
--    TARTÓOSZLOP, nem közigazgatási állítás, és a hiányzó `name_ro` tartja
--    kívül a lelkész romániai megye-legördülőjén.
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro)
SELECT '(külföld)', NULL, o.id, '(külföld)', NULL
  FROM public.adrcountry o
 WHERE lower(COALESCE(o.sname, '')) IN ('hu', 'nl')
   AND NOT EXISTS (
     SELECT 1 FROM public.adrcounty c
      WHERE c.countryid = o.id AND lower(btrim(c.name)) = '(külföld)'
   );

-- ── 3. AZ ÖT TELEPÜLÉS ÁTKÖTÉSE ────────────────────────────────────────────
-- ⚠️ Az ékezet-független illesztés (`translate`) SZÁNDÉKOS: a legacy törzsben a
--    „Gödöllő"/„Győr" ékezettel is, ékezet nélkül is előfordulhat, és nem
--    akarunk a `unaccent` kiterjesztésre támaszkodni (nincs garantálva).
-- ⚠️ HÁROM VÉDŐFELTÉTEL: (a) nincs SIRUTA-kódja (nem hivatalos román falu),
--    (b) MOST Romániában ül (tehát idempotens: másodszorra már nem talál
--    semmit), (c) pontos névegyezés — nem LIKE, nem részlet.
-- ⚠️ A „jelenleg Romániában ül" feltétel EXISTS-szel megy, NEM LEFT JOIN-nal:
--    az `UPDATE … FROM` cél-táblájára (`l`) a FROM-lista JOIN-feltételeiből
--    NEM lehet hivatkozni („invalid reference to FROM-clause entry").
--
-- ⚠️ 2026-08-11 — MIÉRT DO-BLOKKBAN: DARABSZÁM-ŐRSZEM KELL RÁ.
--    A `GET DIAGNOSTICS … ROW_COUNT` csak PL/pgSQL-ben él. E nélkül egy 0 sort
--    érintő UPDATE NÉMÁN átmenne (ez volt a régi kód vak foltja: a záró őrszem
--    ugyanazzal a hibás predikátummal keresett, amivel az UPDATE, tehát nem
--    vette észre a saját tévedését). Most ELŐBB megszámoljuk, hány sort KELL
--    mozgatni — betűre az UPDATE feltételeivel —, aztán összevetjük a
--    ténylegesen mozgatott darabszámmal. Idempotens marad: a második futásnál
--    a várt szám is 0, a mozgatott is 0.
DO $$
DECLARE
  v_varhato_hu   integer;
  v_varhato_nl   integer;
  v_mozgatott_hu integer;
  v_mozgatott_nl integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE t.hu),
    count(*) FILTER (WHERE t.nl)
  INTO v_varhato_hu, v_varhato_nl
  FROM (
    SELECT
      (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
         IN ('budapest', 'debrecen', 'godollo', 'gyor')
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
         IN ('budapest', 'debrecen', 'godollo', 'gyor')
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
         IN ('budapest', 'debrecen', 'godollo', 'gyor'))                                    AS hu,
      (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia'
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia'
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia') AS nl
    FROM public.adrlocality l
    JOIN public.adrcounty   c ON c.id = l.countyid
    JOIN public.adrcountry  o ON o.id = c.countryid
    WHERE NULLIF(btrim(COALESCE(l.siruta_code, '')), '') IS NULL
      AND (lower(COALESCE(o.sname, '')) = 'ro'
           OR lower(COALESCE(o.name, '')) IN ('românia', 'romania'))
  ) t;

  UPDATE public.adrlocality AS l
     SET countyid = cel.id
    FROM public.adrcounty  AS cel
    JOIN public.adrcountry AS o ON o.id = cel.countryid
   WHERE lower(COALESCE(o.sname, '')) = 'hu'
     AND lower(btrim(cel.name)) = '(külföld)'
     AND (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor')
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor')
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor'))
     AND NULLIF(btrim(COALESCE(l.siruta_code, '')), '') IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.adrcounty  regi_megye
         JOIN public.adrcountry regi_orszag ON regi_orszag.id = regi_megye.countryid
        WHERE regi_megye.id = l.countyid
          AND (lower(COALESCE(regi_orszag.sname, '')) = 'ro'
               OR lower(COALESCE(regi_orszag.name, '')) IN ('românia', 'romania'))
     );
  GET DIAGNOSTICS v_mozgatott_hu = ROW_COUNT;

  UPDATE public.adrlocality AS l
     SET countyid = cel.id
    FROM public.adrcounty  AS cel
    JOIN public.adrcountry AS o ON o.id = cel.countryid
   WHERE lower(COALESCE(o.sname, '')) = 'nl'
     AND lower(btrim(cel.name)) = '(külföld)'
     AND (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia'
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia'
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia')
     AND NULLIF(btrim(COALESCE(l.siruta_code, '')), '') IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.adrcounty  regi_megye
         JOIN public.adrcountry regi_orszag ON regi_orszag.id = regi_megye.countryid
        WHERE regi_megye.id = l.countyid
          AND (lower(COALESCE(regi_orszag.sname, '')) = 'ro'
               OR lower(COALESCE(regi_orszag.name, '')) IN ('românia', 'romania'))
     );
  GET DIAGNOSTICS v_mozgatott_nl = ROW_COUNT;

  IF v_mozgatott_hu <> v_varhato_hu OR v_mozgatott_nl <> v_varhato_nl THEN
    RAISE EXCEPTION
      'ŐRSZEM: az átkötés darabszáma nem stimmel. Magyarország: várt %, mozgatott %. Hollandia: várt %, mozgatott %. Ez azt jelenti, hogy az UPDATE feltétele és a mérés széthúz (pl. hiányzik a „(külföld)" megye, vagy egy sor mindkét listára illeszkedik). MINDEN visszapereg.',
      v_varhato_hu, v_mozgatott_hu, v_varhato_nl, v_mozgatott_nl;
  END IF;

  RAISE NOTICE 'Átkötve — Magyarország: % sor, Hollandia: % sor.', v_mozgatott_hu, v_mozgatott_nl;
END $$;

-- ── ZÁRÓ ŐRSZEM (a COMMIT ELŐTT) ───────────────────────────────────────────
-- Ha bármelyik feltétel sérül, a RAISE EXCEPTION az EGÉSZ tranzakciót
-- visszapergeti — a címtörzs érintetlen marad.
DO $$
DECLARE
  v_orszag_db      integer;
  v_ro_sname_db    integer;
  v_maradt         text;
  v_szennyezes     integer;
  v_jelzett_kulf   text;
BEGIN
  SELECT count(*) INTO v_orszag_db FROM public.adrcountry;
  IF v_orszag_db < 3 THEN
    RAISE EXCEPTION 'ŐRSZEM: az országtörzsben % sor van, várt legalább 3 (Románia + Magyarország + Hollandia).', v_orszag_db;
  END IF;

  -- 'RO' országkód CSAK EGY soron állhat — különben a LIMIT 1-es
  -- country-lookupok véletlenszerűen választanának.
  SELECT count(*) INTO v_ro_sname_db FROM public.adrcountry WHERE lower(COALESCE(sname, '')) = 'ro';
  IF v_ro_sname_db <> 1 THEN
    RAISE EXCEPTION 'ŐRSZEM: % sor visel ''RO'' országkódot, várt pontosan 1.', v_ro_sname_db;
  END IF;

  -- Maradt-e Romániában bármelyik az öt közül?
  -- ⚠️ MIND A HÁROM NÉVOSZLOP — ugyanaz a predikátum, mint a SZAKASZ 0-ban és az
  --    UPDATE-ekben. Ha az őrszem SZŰKEBBEN keresne, mint az UPDATE, pontosan a
  --    saját tévedését nem venné észre.
  SELECT string_agg(COALESCE(NULLIF(btrim(l.name_hu), ''), l.name), ', ' ORDER BY l.name) INTO v_maradt
    FROM public.adrlocality l
    JOIN public.adrcounty  co   ON co.id   = l.countyid
    JOIN public.adrcountry orsz ON orsz.id = co.countryid
   WHERE (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia'))
     AND NULLIF(btrim(COALESCE(l.siruta_code, '')), '') IS NULL
     AND (lower(COALESCE(orsz.sname, '')) = 'ro'
          OR lower(COALESCE(orsz.name, '')) IN ('românia', 'romania'));
  IF v_maradt IS NOT NULL THEN
    RAISE EXCEPTION 'ŐRSZEM: ezek a települések MÉG MINDIG Romániában ülnek: %. A jelzés hamis hibát adna rájuk.', v_maradt;
  END IF;

  -- Nem szennyeztük-e el a lelkész romániai megye-legördülőjét?
  SELECT count(*) INTO v_szennyezes
    FROM public.adrcounty c
    JOIN public.adrcountry o ON o.id = c.countryid
   WHERE lower(COALESCE(o.sname, '')) <> 'ro'
     AND NULLIF(btrim(COALESCE(c.name_ro, '')), '') IS NOT NULL;
  IF v_szennyezes > 0 THEN
    RAISE EXCEPTION 'ŐRSZEM: % külföldi megyének van name_ro-ja — bekerülne a romániai megye-legördülőbe.', v_szennyezes;
  END IF;

  -- A LEGFONTOSABB: a javítás UTÁN jelzést kapó települések között NEM lehet
  -- egyetlen külföldi sem. Ez betűre a kód kapuja (`directions.ts`).
  SELECT string_agg(COALESCE(NULLIF(btrim(l.name_hu), ''), l.name), ', ' ORDER BY l.name) INTO v_jelzett_kulf
    FROM public.adrlocality l
    LEFT JOIN public.adrcounty  co   ON co.id   = l.countyid
    LEFT JOIN public.adrcountry orsz ON orsz.id = co.countryid
   WHERE (translate(lower(btrim(COALESCE(l.name,    ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
       OR translate(lower(btrim(COALESCE(l.name_hu, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia')
       OR translate(lower(btrim(COALESCE(l.name_ro, ''))), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU')
          IN ('budapest', 'debrecen', 'godollo', 'gyor', 'hollandia'))
     AND NULLIF(btrim(COALESCE(l.name_ro, '')), '') IS NULL
     AND (to_jsonb(l) ->> 'geo_verified_at') IS NULL
     AND NOT COALESCE(l.needs_review, false)
     AND (orsz.id IS NOT NULL
          AND (lower(COALESCE(orsz.sname, '')) = 'ro'
               OR lower(COALESCE(orsz.name, '')) IN ('românia', 'romania')));
  IF v_jelzett_kulf IS NOT NULL THEN
    RAISE EXCEPTION 'ŐRSZEM: ezek a KÜLFÖLDI települések jelzést kapnának: %.', v_jelzett_kulf;
  END IF;

  RAISE NOTICE 'ZÁRÓ ŐRSZEM rendben — a COMMIT mehet.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ELLENŐRZÉS — EGYETLEN SELECT (a Supabase Editor csak az utolsót mutatja)  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
WITH hasznalt AS (
  -- A ténylegesen használt települések: közvetlenül vagy az utcán keresztül.
  SELECT l.*
    FROM public.adrlocality l
   WHERE EXISTS (SELECT 1 FROM public.szemely s
                  WHERE s.c_helysegid = l.id AND COALESCE(s.isvisible, true) = true)
      OR EXISTS (SELECT 1 FROM public.szemely s
                   JOIN public.adrstreet st ON st.id = s.c_utcaid
                  WHERE st.localityid = l.id AND COALESCE(s.isvisible, true) = true)
), allapot AS (
  SELECT
    h.id,
    COALESCE(NULLIF(btrim(COALESCE(h.name_hu, '')), ''), h.name) AS nev,
    COALESCE(orsz.name, '∅ ismeretlen')                          AS orszag,

    -- HELYKITÖLTŐ-e? (betűre a kód `isPlaceholderLocality`-je): MINDEN kitöltött
    -- névoszlopa jelentés nélküli. Ezek NEM térkép-ügyek — saját tételük van.
    -- ⚠️ A `-` a bracket-kifejezés ELSŐ karaktere, hogy literál maradjon
    --    (Postgres ARE: a `\-` escape-nek számítana).
    -- ⚠️ 2026-08-11: a ZÁRÓJELLEL KEZDŐDŐ név is jelentés nélküli — a kód
    --    `isJelentesNelkuliNev`-je ezt is ide sorolja (a „(külföld)" megye
    --    miatt született, de a településnévre is áll).
    (    (NULLIF(btrim(COALESCE(h.name,    '')), '') IS NULL
       OR btrim(h.name)    ~ '^[-?–—.,_[:space:]]*$'
       OR btrim(h.name)    ~ '^[([{]'
       OR lower(btrim(h.name))    IN ('n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'))
     AND (NULLIF(btrim(COALESCE(h.name_hu, '')), '') IS NULL
       OR btrim(h.name_hu) ~ '^[-?–—.,_[:space:]]*$'
       OR btrim(h.name_hu) ~ '^[([{]'
       OR lower(btrim(h.name_hu)) IN ('n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'))
     AND (NULLIF(btrim(COALESCE(h.name_ro, '')), '') IS NULL
       OR btrim(h.name_ro) ~ '^[-?–—.,_[:space:]]*$'
       OR btrim(h.name_ro) ~ '^[([{]'
       OR lower(btrim(h.name_ro)) IN ('n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'))
    )                                                              AS helykitolto,

    -- FELOLDHATÓ-e? — van hivatalos román név VAGY egyeztetett pont.
    (NULLIF(btrim(COALESCE(h.name_ro, '')), '') IS NOT NULL
     OR (to_jsonb(h) ->> 'geo_verified_at') IS NOT NULL)          AS feloldhato,

    -- BIZONYÍTHATÓAN ROMÁNIAI-e? — az EGYSZERŰSÍTETT kapu (2026-08-11):
    -- ország → needs_review → SIRUTA → ország. A megye- és irányítószám-ág
    -- KIKERÜLT: sosem tudott külföldit romániaivá tenni, CSAK igaz hibát némítani.
    CASE
      WHEN orsz.id IS NOT NULL AND NOT (
             lower(COALESCE(orsz.sname, '')) = 'ro'
             OR lower(COALESCE(orsz.name,   '')) IN ('românia', 'romania')
           ) THEN false                                   -- külföldi → csend
      WHEN COALESCE(h.needs_review, false) THEN false     -- tippelt megye → csend
      WHEN NULLIF(btrim(COALESCE(h.siruta_code, '')), '') IS NOT NULL THEN true
      WHEN orsz.id IS NULL THEN false                     -- nincs ország → csend
      ELSE true                                           -- Románia → JELZÜNK
    END                                                            AS bizonyithatoan_romaniai,

    (SELECT count(*) FROM public.szemely s
      WHERE COALESCE(s.isvisible, true) = true
        AND COALESCE(s.meghalt, false) = false
        AND (s.c_helysegid = h.id
             OR s.c_utcaid IN (SELECT st.id FROM public.adrstreet st WHERE st.localityid = h.id))
    )                                                              AS elo_tag
  FROM hasznalt h
  LEFT JOIN public.adrcounty  co   ON co.id   = h.countyid
  LEFT JOIN public.adrcountry orsz ON orsz.id = co.countryid
)
SELECT x.sorrend, x.mit_mer, x.ertek, x.varhato,
       CASE WHEN x.varhato = '(olvasd el)' THEN '👀'
            WHEN x.ertek   = x.varhato     THEN '✅'
            ELSE '⚠️ nézd meg' END AS rendben
FROM (

  -- ══ A. AZ ORSZÁGTÖRZS ════════════════════════════════════════════════════
  SELECT 1 AS sorrend, 'Országok száma az adrcountry-ban'::text AS mit_mer,
         (SELECT count(*)::text FROM public.adrcountry)          AS ertek,
         '3'::text                                               AS varhato

  UNION ALL SELECT 2, 'Az országok (id | név | kód) — „RO" csak egyszer szerepelhet',
         COALESCE((SELECT string_agg(c.id || ' | ' || c.name || ' | ' || COALESCE(c.sname, '∅'),
                                     '  ·  ' ORDER BY c.id) FROM public.adrcountry c), '∅'),
         '(olvasd el)'

  UNION ALL SELECT 3, '„RO" országkódot pontosan EGY sor visel',
         (SELECT count(*)::text FROM public.adrcountry WHERE lower(COALESCE(sname, '')) = 'ro'), '1'

  UNION ALL SELECT 4, 'Külföldi „(külföld)" megyék száma (name_ro NÉLKÜL)',
         (SELECT count(*)::text FROM public.adrcounty c JOIN public.adrcountry o ON o.id = c.countryid
           WHERE lower(COALESCE(o.sname, '')) IN ('hu', 'nl') AND c.name_ro IS NULL), '2'

  UNION ALL SELECT 5, 'A lelkész romániai megye-legördülője VÁLTOZATLAN (42 megye)',
         (SELECT count(*)::text FROM public.adrcounty c JOIN public.adrcountry o ON o.id = c.countryid
           WHERE lower(COALESCE(o.sname, '')) = 'ro'
             AND NULLIF(btrim(COALESCE(c.name_ro, '')), '') IS NOT NULL), '42'

  -- ══ B. A JELZÉS — EZ A DÖNTŐ SZÁM ════════════════════════════════════════
  UNION ALL SELECT 10, '➡️ ENNYI ÉLŐ TAG kap „a térkép nem találja" jelzést',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a
           WHERE NOT a.helykitolto AND NOT a.feloldhato AND a.bizonyithatoan_romaniai), '24'

  UNION ALL SELECT 11, '➡️ A JELZETT TELEPÜLÉSEK NEVE — EGYETLEN külföldi sem lehet itt (várt: Sepsiszentgyörgy · Páké · Zágon · Kovászna · Csíkcsicsó)',
         COALESCE((SELECT string_agg(a.nev || ' [' || a.orszag || ', ' || a.elo_tag || ' fő]',
                                     '  ·  ' ORDER BY a.elo_tag DESC)
                     FROM allapot a
                    WHERE NOT a.helykitolto AND NOT a.feloldhato AND a.bizonyithatoan_romaniai),
                  '— egyetlen település sem —'),
         '(olvasd el)'

  UNION ALL SELECT 12, '⚠️ KÉZI TEENDŐ: a „Hollandia" nevű településen élő tagok',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a
           WHERE translate(lower(btrim(a.nev)), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') = 'hollandia'),
         '2'

  -- ══ C. AMI SZÁNDÉKOSAN NÉMA ══════════════════════════════════════════════
  UNION ALL SELECT 20, 'Külföldi települések élő tagjai (SOHA nincs jelzés)',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a
           WHERE NOT a.helykitolto AND NOT a.feloldhato AND NOT a.bizonyithatoan_romaniai
             AND a.orszag NOT IN ('România', '∅ ismeretlen')), '8'

  UNION ALL SELECT 21, '…név szerint (várt: Budapest · Debrecen · Gödöllő · Győr · Hollandia)',
         COALESCE((SELECT string_agg(a.nev || ' [' || a.orszag || ', ' || a.elo_tag || ' fő]', '  ·  ')
                     FROM allapot a
                    WHERE NOT a.helykitolto AND NOT a.feloldhato AND NOT a.bizonyithatoan_romaniai
                      AND a.orszag NOT IN ('România', '∅ ismeretlen')), '— nincs ilyen —'),
         '(olvasd el)'

  UNION ALL SELECT 22, 'A „?" HELYKITÖLTŐ csoport élő tagjai (KÜLÖN tétel, nem térkép-hiba)',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a WHERE a.helykitolto), '70'

  UNION ALL SELECT 23, 'Élő, látható tagok (viszonyítási alap)',
         (SELECT count(*)::text FROM public.szemely s
           WHERE COALESCE(s.isvisible, true) = true AND COALESCE(s.meghalt, false) = false), '606'

) x(sorrend, mit_mer, ertek, varhato)
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT KEZDJ AZ EREDMÉNNYEL
-- ════════════════════════════════════════════════════════════════════════════
-- · 10. sor — ennyi tag címe kerül a Hibák fülre. A mérés alapján 24 a várt
--   érték, ÖT településen (a lista a 11. sorban). Egy település EGYSZERI
--   egyeztetése az ottani ÖSSZES tag hibáját megszünteti, tehát öt teendő.
-- · 11. sor — olvasd el NÉVRŐL NÉVRE. Ha bármelyik külföldi (Budapest,
--   Debrecen, Gödöllő, Győr, Hollandia), SZÓLJ — a záró őrszemnek ezt meg
--   kellett volna fognia.
-- · 12. sor — ez a KÉZI teendőd: a „Hollandia" nevű településen élő 2 tagnál
--   a személyi kartonon → Elérhetőségek írd be a tényleges holland várost.
--   A rendszer ezt nem tudja kitalálni, és nem is fog találgatni.
-- · 22. sor — a 70 tag a „?" helykitöltőn SAJÁT tételt kap a Hibák fülön
--   („Ebből a lakcímből hiányzik a település…"), nem térkép-hibát. Ezeket
--   egyenként, a kartonon kell pótolni.
-- · 23. sor — ha nem 606, a gyülekezet létszáma változott a mérés óta; a többi
--   várt szám ilyenkor arányosan eltérhet.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VISSZAÁLLÍTÁS — csak baj esetén                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ⚠️ A sorrend KÖTÖTT: előbb a települések vissza Romániába, csak utána
--    törölhető a megye és az ország (FK-k).
-- ⚠️ A `<ROMÁNIAI MEGYE ID>` helyére azt a megyét írd, ahol a sorok EREDETILEG
--    ültek. A mérés szerint ez a legacy „?" placeholder megye volt — az id-jét
--    a `SELECT id, name FROM public.adrcounty WHERE btrim(name) = '?';` adja meg.
--
--   BEGIN;
--   UPDATE public.adrlocality l
--      SET countyid = <ROMÁNIAI MEGYE ID>
--     FROM public.adrcounty c
--     JOIN public.adrcountry o ON o.id = c.countryid
--    WHERE c.id = l.countyid
--      AND lower(COALESCE(o.sname, '')) IN ('hu', 'nl');
--
--   DELETE FROM public.adrcounty c
--    USING public.adrcountry o
--    WHERE o.id = c.countryid
--      AND lower(COALESCE(o.sname, '')) IN ('hu', 'nl');
--
--   DELETE FROM public.adrcountry
--    WHERE lower(COALESCE(sname, '')) IN ('hu', 'nl');
--   COMMIT;
--
--   NOTIFY pgrst, 'reload schema';
--
-- A visszaállítás után az országtörzs ismét EGY soros lesz, és a kód
-- (`isOrszagtorzsErtelmes`) magától visszaáll a mai, néma ágra — kódmódosítás
-- nélkül. Ez szándékos: a jelzés soha nem tud hamis hibát adni azért, mert egy
-- migrációt visszavontunk.
