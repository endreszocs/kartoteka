-- KARTOTEKA — CÍM-GEOKÓDOLÁS: ÁLLAPOTFELMÉRÉS (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). CSAK OLVAS — semmit nem módosít.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT KELL EZ
-- ════════════════════════════════════════════════════════════════════════════
-- A személyi karton „Útvonal" gombja a MAGYAR nevekből épített térkép-linket
-- („Barátos, Főút, 144, România"), amit a Google Térkép nem talál meg —
-- hivatalosan Brateș / Strada Principală. A kód-javítás (lib/members/
-- directions.ts) a HIVATALOS román alakot építi:
--       Strada Principală 144, Brateș, Covasna, 527065, România
--
-- Ez a javítás azonban CSAK annyira jó, amennyire a címtörzs ki van töltve.
-- Ez a lekérdezés pontosan azt méri meg, hogy:
--   · a TÉNYLEGESEN HASZNÁLT településeknek/utcáknak van-e `name_ro`,
--     `siruta_code`, `default_postalcode`,
--   · hány élő tag címe maradna ettől függetlenül feloldhatatlan,
--   · és mi van konkrétan Barátosra (a tulajdonos gyülekezete) tárolva.
--
-- ⚠️ A Supabase SQL Editor CSAK AZ UTOLSÓ eredményt mutatja, ezért az egész
--    felmérés EGYETLEN SELECT, UNION ALL-lal összefűzve.
-- ⚠️ Lefut a 2026-08-11-cim-geokodolas.sql ELŐTT is: a `geo_*` oszlopokat
--    `to_jsonb(...) ->> '…'` alakban olvassuk, ami hiányzó oszlopnál egyszerűen
--    NULL-t ad, nem hibát.
--
-- HOGYAN OLVASD
--   0. szakasz — lefutott-e már a migráció (ha nem, az 5./15./24. sor 0 lesz)
--   A. szakasz — a HASZNÁLT címtörzs lefedettsége (ez dönti el, elég-e a kód)
--   B. szakasz — hány tag címe maradna feloldhatatlan  ← A LEGFONTOSABB SZÁM
--   C. szakasz — Barátos konkrétan, a végén a KÉSZ térkép-célponttal

WITH
-- A ténylegesen használt települések: közvetlenül (c_helysegid) VAGY az utcán
-- keresztül (c_utcaid → adrstreet.localityid — sok import-örökség sorban a
-- c_helysegid NULL, de az utca tudja a települést).
hasznalt_helyseg AS (
  SELECT l.*
  FROM public.adrlocality l
  WHERE EXISTS (SELECT 1 FROM public.szemely s WHERE s.c_helysegid = l.id)
     OR EXISTS (SELECT 1 FROM public.szemely s
                JOIN public.adrstreet st ON st.id = s.c_utcaid
                WHERE st.localityid = l.id)
),
hasznalt_utca AS (
  SELECT st.*
  FROM public.adrstreet st
  WHERE EXISTS (SELECT 1 FROM public.szemely s WHERE s.c_utcaid = st.id)
),
-- Feloldhatóság soronként. „Van pont" = a lelkész egyszer megerősítette a
-- térképen (2026-08-11-cim-geokodolas.sql; a migráció előtt mindig hamis).
helyseg_allapot AS (
  SELECT l.id,
         nullif(btrim(coalesce(l.name_ro, '')), '') IS NOT NULL AS van_ro,
         (to_jsonb(l) ->> 'geo_verified_at') IS NOT NULL        AS van_pont
  FROM public.adrlocality l
),
utca_allapot AS (
  SELECT st.id,
         nullif(btrim(coalesce(st.name_ro, '')), '') IS NOT NULL AS van_ro,
         (to_jsonb(st) ->> 'geo_verified_at') IS NOT NULL        AS van_pont
  FROM public.adrstreet st
),
-- Élő, látható tagok a feloldott cím-állapotukkal.
tagok AS (
  SELECT s.id,
         s.c_helysegid,
         s.c_utcaid,
         COALESCE(s.c_helysegid, st.localityid) AS helyseg_id,
         COALESCE(ha.van_ro,   false) AS helyseg_ro,
         COALESCE(ha.van_pont, false) AS helyseg_pont,
         COALESCE(ua.van_ro,   false) AS utca_ro,
         COALESCE(ua.van_pont, false) AS utca_pont
  FROM public.szemely s
  LEFT JOIN public.adrstreet     st ON st.id = s.c_utcaid
  LEFT JOIN helyseg_allapot      ha ON ha.id = COALESCE(s.c_helysegid, st.localityid)
  LEFT JOIN utca_allapot         ua ON ua.id = s.c_utcaid
  WHERE COALESCE(s.isvisible, true) = true
    AND COALESCE(s.meghalt, false) = false
),
baratos AS (
  SELECT l.*
  FROM public.adrlocality l
  WHERE lower(coalesce(l.name,    '')) LIKE 'barátos%'
     OR lower(coalesce(l.name_hu, '')) LIKE 'barátos%'
     OR lower(coalesce(l.name_ro, '')) LIKE 'brateş%'
     OR lower(coalesce(l.name_ro, '')) LIKE 'brateș%'
     OR lower(coalesce(l.name_ro, '')) LIKE 'brates%'
)
SELECT x.sorrend, x.szakasz, x.mit_mer, x.ertek, x.megjegyzes
FROM (

  -- ══ 0. SZAKASZ — lefutott-e már a migráció ═══════════════════════════════
  SELECT 1 AS sorrend, '0. Állapot'::text AS szakasz,
         'A 2026-08-11-cim-geokodolas.sql lefutott (adrlocality.geo_lat létezik)'::text AS mit_mer,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'adrlocality'
                   AND column_name = 'geo_lat')::text AS ertek,
         'Ha false: az egyeztetés-mentés még nem működik, de a román nevekkel épített útvonal IGEN.'::text AS megjegyzes

  UNION ALL SELECT 2, '0. Állapot', 'Az app_set_address_geo RPC létezik',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'app_set_address_geo')::text,
         'Ez menti a lelkész által megerősített térkép-pontot.'

  -- ══ A. SZAKASZ — a HASZNÁLT címtörzs lefedettsége ════════════════════════
  UNION ALL SELECT 10, 'A. Települések', 'Használatban lévő települések száma',
         (SELECT count(*)::text FROM hasznalt_helyseg),
         'Amit a tagok címei ténylegesen érintenek (közvetlenül vagy az utcán át).'

  UNION ALL SELECT 11, 'A. Települések', '…ebből VAN hivatalos román név (name_ro)',
         (SELECT count(*)::text FROM hasznalt_helyseg h
          WHERE nullif(btrim(coalesce(h.name_ro, '')), '') IS NOT NULL),
         'Ez a legfontosabb oszlop: enélkül a térkép a magyar nevet kapja.'

  UNION ALL SELECT 12, 'A. Települések', '…ebből HIÁNYZIK a román név',
         (SELECT count(*)::text FROM hasznalt_helyseg h
          WHERE nullif(btrim(coalesce(h.name_ro, '')), '') IS NULL),
         'Ezeket kell egyeztetni (vagy a seedet pótolni). Nevek a 16. sorban.'

  UNION ALL SELECT 13, 'A. Települések', '…ebből van SIRUTA-kód',
         (SELECT count(*)::text FROM hasznalt_helyseg h
          WHERE nullif(btrim(coalesce(h.siruta_code, '')), '') IS NOT NULL),
         'A hivatalos azonosító — a seed minősége látszik rajta.'

  UNION ALL SELECT 14, 'A. Települések', '…ebből van irányítószám (default_postalcode)',
         (SELECT count(*)::text FROM hasznalt_helyseg h
          WHERE nullif(btrim(coalesce(h.default_postalcode, '')), '') IS NOT NULL),
         'A legerősebb geokódolási támpont a név után.'

  UNION ALL SELECT 15, 'A. Települések', '…ebből VAN egyeztetett térkép-pont',
         (SELECT count(*)::text FROM hasznalt_helyseg h
          WHERE (to_jsonb(h) ->> 'geo_verified_at') IS NOT NULL),
         'A lelkész által megerősített pont. A migráció előtt mindig 0.'

  UNION ALL SELECT 16, 'A. Települések', 'A román név nélküli települések (max. 15 név)',
         COALESCE((SELECT string_agg(y.nev, ', ') FROM (
             SELECT COALESCE(nullif(btrim(coalesce(h.name_hu, '')), ''), h.name) AS nev
             FROM hasznalt_helyseg h
             WHERE nullif(btrim(coalesce(h.name_ro, '')), '') IS NULL
             ORDER BY 1 LIMIT 15) y), '— (mindegyiknek van román neve) —'),
         'Ezekre a településekre nem talál rá a térkép a nevük alapján.'

  UNION ALL SELECT 20, 'A. Utcák', 'Használatban lévő utcák száma',
         (SELECT count(*)::text FROM hasznalt_utca), 'Amire tag-cím hivatkozik.'

  UNION ALL SELECT 21, 'A. Utcák', '…ebből VAN hivatalos román név (name_ro)',
         (SELECT count(*)::text FROM hasznalt_utca u
          WHERE nullif(btrim(coalesce(u.name_ro, '')), '') IS NOT NULL),
         'Enélkül a térkép a magyar utcanevet kapja (pl. „Főút").'

  UNION ALL SELECT 22, 'A. Utcák', '…ebből van utcatípus (street_type_ro)',
         (SELECT count(*)::text FROM hasznalt_utca u
          WHERE nullif(btrim(coalesce(u.street_type_ro, '')), '') IS NOT NULL),
         '„Strada" / „Bulevardul" / „Aleea" — a hivatalos alak előtagja.'

  UNION ALL SELECT 23, 'A. Utcák', '…ebből van irányítószám (postalcode)',
         (SELECT count(*)::text FROM hasznalt_utca u
          WHERE nullif(btrim(coalesce(u.postalcode, '')), '') IS NOT NULL),
         'Pontosabb a település alapértelmezettjénél, ha megvan.'

  UNION ALL SELECT 24, 'A. Utcák', '…ebből VAN egyeztetett térkép-pont',
         (SELECT count(*)::text FROM hasznalt_utca u
          WHERE (to_jsonb(u) ->> 'geo_verified_at') IS NOT NULL),
         'A migráció előtt mindig 0.'

  -- ══ B. SZAKASZ — hány tag címe maradna feloldhatatlan ════════════════════
  UNION ALL SELECT 30, 'B. Tagok', 'Élő, látható tagok száma',
         (SELECT count(*)::text FROM tagok), 'A viszonyítási alap.'

  UNION ALL SELECT 31, 'B. Tagok', 'A címük a térképen MEGTALÁLHATÓ (van román helységnév vagy egyeztetett pont)',
         (SELECT count(*)::text FROM tagok t WHERE t.helyseg_ro OR t.helyseg_pont),
         'Ezeknél a javítás önmagában elég.'

  UNION ALL SELECT 32, 'B. Tagok', '⚠️ A TELEPÜLÉSÜK NEM oldható fel (se román név, se pont)',
         (SELECT count(*)::text FROM tagok t
          WHERE t.helyseg_id IS NOT NULL AND NOT t.helyseg_ro AND NOT t.helyseg_pont),
         'EZ A KRITIKUS SZÁM. Ha 0, a kód-javítás önmagában megoldja a hibát.'

  UNION ALL SELECT 33, 'B. Tagok', 'A település rendben, de az UTCÁNAK nincs román neve',
         (SELECT count(*)::text FROM tagok t
          WHERE (t.helyseg_ro OR t.helyseg_pont) AND t.c_utcaid IS NOT NULL
            AND NOT t.utca_ro AND NOT t.utca_pont),
         'Ezeknél a térkép a faluba visz, a házszámot helyben kell megkeresni.'

  UNION ALL SELECT 34, 'B. Tagok', 'Egyáltalán nincs címtörzsből választott település vagy utca',
         (SELECT count(*)::text FROM tagok t
          WHERE t.c_helysegid IS NULL AND t.c_utcaid IS NULL),
         'Ezeknél az egyeztetés sem menthető — előbb a tag szerkesztőjében kell címet választani.'

  UNION ALL SELECT 35, 'B. Tagok', 'Van házszám is rögzítve (c_szam)',
         (SELECT count(*)::text FROM public.szemely s
          WHERE COALESCE(s.isvisible, true) = true AND COALESCE(s.meghalt, false) = false
            AND nullif(btrim(coalesce(s.c_szam, '')), '') IS NOT NULL),
         'Házszám nélkül a térkép legfeljebb az utcáig visz.'

  -- ══ C. SZAKASZ — Barátos (a tulajdonos gyülekezete) ══════════════════════
  UNION ALL SELECT 40, 'C. Barátos', 'Barátos sorok száma a címtörzsben',
         (SELECT count(*)::text FROM baratos),
         'Ha >1, duplikált település-sor van — az útvonal a tag által hivatkozottat használja.'

  UNION ALL SELECT 41, 'C. Barátos', 'name / name_hu / name_ro',
         COALESCE((SELECT string_agg(
                     concat_ws(' | ', b.name,
                               COALESCE(b.name_hu, '∅'),
                               COALESCE(b.name_ro, '∅ HIÁNYZIK')), '  ///  ')
                   FROM baratos b), '— nincs Barátos sor —'),
         'A harmadik érték a döntő: ezt keresi a Google Térkép.'

  UNION ALL SELECT 42, 'C. Barátos', 'SIRUTA / irányítószám / megye',
         COALESCE((SELECT string_agg(
                     concat_ws(' | ', COALESCE(b.siruta_code, '∅'),
                               COALESCE(b.default_postalcode, '∅'),
                               COALESCE(c.name_ro, c.name, '∅')), '  ///  ')
                   FROM baratos b LEFT JOIN public.adrcounty c ON c.id = b.countyid),
                  '— nincs Barátos sor —'),
         'Elvárt: 527065 körüli irányítószám és Covasna megye.'

  UNION ALL SELECT 43, 'C. Barátos', 'Egyeztetett térkép-pont a településen',
         COALESCE((SELECT string_agg(
                     COALESCE(to_jsonb(b) ->> 'geo_verified_at', '∅ nincs egyeztetve'), '  ///  ')
                   FROM baratos b), '— nincs Barátos sor —'),
         'A migráció + a lelkész egyeztetése után kap értéket.'

  UNION ALL SELECT 44, 'C. Barátos', 'Élő, látható tagok Barátoson',
         COALESCE((SELECT count(*)::text FROM tagok t
                   WHERE t.helyseg_id IN (SELECT b.id FROM baratos b)), '0'),
         'Ennyi kartonon javul egyszerre az útvonal.'

  UNION ALL SELECT 45, 'C. Barátos', 'A „Főút" utca sora (name | name_ro | típus | irsz.)',
         COALESCE((SELECT string_agg(
                     concat_ws(' | ', u.name,
                               COALESCE(u.name_ro, '∅ HIÁNYZIK'),
                               COALESCE(u.street_type_ro, '∅'),
                               COALESCE(u.postalcode, '∅')), '  ///  ')
                   FROM public.adrstreet u
                   WHERE u.localityid IN (SELECT b.id FROM baratos b)
                     AND (lower(coalesce(u.name, ''))    LIKE 'főút%'
                       OR lower(coalesce(u.name_hu, '')) LIKE 'főút%'
                       OR lower(coalesce(u.name_ro, '')) LIKE 'principal%')),
                  '— nincs „Főút" sor Barátoson —'),
         'Elvárt román alak: Principală, típus Strada.'

  UNION ALL SELECT 46, 'C. Barátos', '➡️ A KÉSZ térkép-célpont, ahogy az app ma összerakná (Főút 144)',
         COALESCE((
           SELECT CASE
             WHEN u.id IS NULL THEN
               concat_ws(', ',
                 concat(COALESCE(nullif(btrim(coalesce(b.name_ro, '')), ''), b.name_hu, b.name), ' nr. 144'),
                 COALESCE(nullif(btrim(coalesce(c.name_ro, '')), ''), c.name),
                 nullif(btrim(coalesce(b.default_postalcode, '')), ''),
                 'România')
             ELSE
               concat_ws(', ',
                 btrim(CASE
                   WHEN nullif(btrim(coalesce(u.name_ro, '')), '') IS NOT NULL
                     THEN concat_ws(' ', nullif(btrim(coalesce(u.street_type_ro, '')), ''), u.name_ro, '144')
                   ELSE concat_ws(' ', COALESCE(nullif(btrim(coalesce(u.name_hu, '')), ''), u.name), '144')
                 END),
                 COALESCE(nullif(btrim(coalesce(b.name_ro, '')), ''), b.name_hu, b.name),
                 COALESCE(nullif(btrim(coalesce(c.name_ro, '')), ''), c.name),
                 COALESCE(nullif(btrim(coalesce(u.postalcode, '')), ''),
                          nullif(btrim(coalesce(b.default_postalcode, '')), '')),
                 'România')
           END
           FROM baratos b
           LEFT JOIN public.adrcounty c ON c.id = b.countyid
           LEFT JOIN public.adrstreet u ON u.localityid = b.id
                AND (lower(coalesce(u.name, ''))    LIKE 'főút%'
                  OR lower(coalesce(u.name_hu, '')) LIKE 'főút%'
                  OR lower(coalesce(u.name_ro, '')) LIKE 'principal%')
           ORDER BY u.id NULLS LAST
           LIMIT 1
         ), '— nincs Barátos sor a címtörzsben —'),
         'MÁSOLD BE a Google Térkép keresőjébe. Ha megtalálja, a hiba megoldva. Ha nem: „Cím egyeztetése" a kartonon.'

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT KEZDJ AZ EREDMÉNNYEL
-- ════════════════════════════════════════════════════════════════════════════
-- · 32. sor = 0  →  a kód-javítás ÖNMAGÁBAN elég; a migráció csak biztosíték.
-- · 32. sor > 0  →  ennyi tag címét a térkép a neve alapján nem találja meg.
--                   Futtasd a 2026-08-11-cim-geokodolas.sql-t, és a 16. sorban
--                   felsorolt településeket egyeztesd egyszer a kartonról.
-- · 33. sor > 0  →  a térkép a faluig visz; falusi címeknél ez teljesen normális
--                   (sok romániai falunak nincs hivatalos utcaneve).
-- · 46. sor      →  ez a döntő próba: másold a Google Térkép keresőjébe.
