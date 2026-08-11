-- KARTOTEKA — „A TÉRKÉP NEM TALÁLJA A CÍMET" HIBAJELZÉS: ELŐNÉZET (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). CSAK OLVAS — semmit nem módosít.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT KELL EZ
-- ════════════════════════════════════════════════════════════════════════════
-- A tagnyilvántartás Hibák füle kap egy új tételt: „A térkép nem találja meg
-- ezt a települést…". A tétel HASZNA teljes egészében azon áll vagy bukik, hogy
-- KÜLFÖLDI településre soha nem szólal meg. A gyülekezet tagjainak egy része
-- Budapesten, Debrecenben, Gödöllőn, Győrben, Hollandiában él — ezeknek nincs
-- és nem is lehet román nevük, a Google Térkép viszont a saját nevükön
-- tökéletesen megtalálja őket. Az ő címük NEM hibás.
--
-- Ez a lekérdezés BETŰRE ugyanazt a feltételt futtatja, amit a kód
-- (`apps/web/lib/members/directions.ts` → `shouldReportUnresolvableLocality`),
-- tehát ELŐRE megmutatja, mi jelenne meg a lelkész listájában.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚑ 2026-08-11 — FRISSÍTVE AZ ÚJ KAPUHOZ. MI VÁLTOZOTT ÉS MIÉRT
-- ════════════════════════════════════════════════════════════════════════════
-- Az ELSŐ éles mérés eredménye: 0 jelzés, 102 elnémított élő tag. A funkció
-- néma volt. Az ok: az `adrcountry` táblában EGYETLEN sor van (Románia), tehát
-- az ország-mező nem hordoz információt — Budapest, Debrecen, Gödöllő, Győr és
-- „Hollandia" is „romániai" —, a kapu pedig emiatt a megye- és
-- irányítószám-ágakra esett vissza, amin a legacy („?" megyéjű) erdélyi sorok
-- elbuktak.
--
-- HÁROM DOLOG VÁLTOZOTT ENNEK NYOMÁN:
--
--  1. AZ ORSZÁGTÖRZS MÉRETE MOST MÁR SZÁMÍT (0. szakasz + 30. sor).
--     Amíg EGYETLEN ország van, a „Románia" nem tény, hanem ALAPÉRTELMEZÉS —
--     pontosan annyit jelent, mint a „nem tudjuk". A kód ilyenkor SZÁNDÉKOSAN
--     néma (`directions.ts` → `isOrszagtorzsErtelmes`), és ez a lekérdezés is
--     ezt tükrözi: az 1. sor ilyenkor 0-t mutat, akkor is, ha az adat amúgy
--     jelzésre érett. Így az előnézet és az éles felület soha nem mond mást.
--     ⏳ Ez a fék a 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql lefutásakor
--        oldódik ki magától.
--
--  2. KIKERÜLT KÉT ÁG: a „seedelt román megye" és a „6 jegyű irányítószám".
--     Mindkettő CSAK akkor volt elérhető, ha az ország amúgy is Románia —
--     vagyis külföldit sosem tudott romániaivá tenni, KIZÁRÓLAG igaz hibát
--     tudott elnémítani. Pontosan ezt is tették: Zágon, Páké, Sepsiszentgyörgy,
--     Kovászna és Csíkcsicsó (24 élő tag) mindkettőn elbukott.
--
--  3. A „?" HELYKITÖLTŐ KÜLÖNVÁLT (22. sor). A címtörzsben van egy „?" NEVŰ
--     település-sor, élesben 70 élő taggal. Ezek NEM térkép-hibák: nincs mit a
--     térképen megkeresni, és az egyeztetés kifejezetten ROMBOLNA (70 különböző
--     valódi lakcím egyetlen hamis pontra szegezve). Saját, igazabb tételük van
--     a Hibák fülön: „Ebből a lakcímből hiányzik a település…".
--
-- ⚠️ A `geo_*` oszlopokat `to_jsonb(...) ->> '…'` alakban olvassuk, így ez a
--    lekérdezés a 2026-08-11-cim-geokodolas.sql ELŐTT is lefut (hiányzó
--    oszlopnál NULL-t ad, nem hibát). Maga a KÓD viszont szándékosan NEM jelez
--    semmit, amíg a geo-oszlopok nem léteznek: a hiba szövege azt kéri, hogy a
--    lelkész „egyeztesse a címet", amit az `app_set_address_geo` RPC ment — az
--    pedig ugyanabban a migrációban születik. Elvégezhetetlen feladatot kiadni
--    rosszabb, mint hallgatni.

WITH
-- ── AZ ORSZÁGTÖRZS ÁLLAPOTA — a kapu ELŐFELTÉTELE (2026-08-11) ──────────────
orszagtorzs AS (
  SELECT (SELECT count(*) FROM public.adrcountry) >= 2 AS ertelmes
),
-- A ténylegesen használt települések: közvetlenül (c_helysegid) VAGY az utcán
-- keresztül (c_utcaid → adrstreet.localityid).
hasznalt AS (
  SELECT l.*
  FROM public.adrlocality l
  WHERE EXISTS (SELECT 1 FROM public.szemely s
                 WHERE s.c_helysegid = l.id AND COALESCE(s.isvisible, true) = true)
     OR EXISTS (SELECT 1 FROM public.szemely s
                  JOIN public.adrstreet st ON st.id = s.c_utcaid
                 WHERE st.localityid = l.id AND COALESCE(s.isvisible, true) = true)
),
allapot AS (
  SELECT
    h.id,
    COALESCE(NULLIF(btrim(COALESCE(h.name_hu, '')), ''), h.name) AS nev,
    COALESCE(co.name_ro, co.name, '∅')                            AS megye,
    COALESCE(orsz.name, '∅ ismeretlen')                           AS orszag,

    -- (0) HELYKITÖLTŐ-e? — betűre a kód `isPlaceholderLocality`-je: MINDEN
    --     kitöltött névoszlopa jelentés nélküli. Ezek KIMARADNAK a térkép-
    --     jelzésből, mert saját, igazabb tételük van.
    --     ⚠️ A `-` a bracket-kifejezés ELSŐ karaktere, hogy literál maradjon
    --        (Postgres ARE: a `\-` escape-nek számítana).
    (    (NULLIF(btrim(COALESCE(h.name,    '')), '') IS NULL
       OR btrim(h.name)    ~ '^[-?–—.,_[:space:]]*$'
       OR lower(btrim(h.name))    IN ('n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'))
     AND (NULLIF(btrim(COALESCE(h.name_hu, '')), '') IS NULL
       OR btrim(h.name_hu) ~ '^[-?–—.,_[:space:]]*$'
       OR lower(btrim(h.name_hu)) IN ('n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'))
     AND (NULLIF(btrim(COALESCE(h.name_ro, '')), '') IS NULL
       OR btrim(h.name_ro) ~ '^[-?–—.,_[:space:]]*$'
       OR lower(btrim(h.name_ro)) IN ('n/a', 'na', 'nincs', 'ismeretlen', 'nem ismert', 'null', 'undefined'))
    )                                                             AS helykitolto,

    -- (1) FELOLDHATÓ-E? — van hivatalos román név VAGY egyeztetett pont.
    (NULLIF(btrim(COALESCE(h.name_ro, '')), '') IS NOT NULL
     OR (to_jsonb(h) ->> 'geo_verified_at') IS NOT NULL)          AS feloldhato,

    -- (2) BIZONYÍTHATÓAN ROMÁNIAI-E? — a kód `isProvablyRomanianLocality`-je.
    --     A sorrend számít, mindegyik ág egy hamis-jelzési utat zár le.
    CASE
      -- a) az ország ISMERT és nem Románia → külföldi (ez a Budapest-ág)
      WHEN orsz.id IS NOT NULL AND NOT (
             lower(COALESCE(orsz.sname, '')) = 'ro'
             OR lower(COALESCE(orsz.name,   '')) IN ('românia', 'romania')
             OR lower(COALESCE(orsz.name_ro,'')) IN ('românia', 'romania')
           ) THEN false
      -- b) importból jött, a megyéje ÉS az országa is tippelt → nem bizonyíték
      WHEN COALESCE(h.needs_review, false) THEN false
      -- c) SIRUTA = a román hivatalos településnyilvántartás azonosítója.
      --    Ez az EGYETLEN ág, ami az országtörzs állapotától FÜGGETLENÜL bizonyít.
      WHEN NULLIF(btrim(COALESCE(h.siruta_code, '')), '') IS NOT NULL THEN true
      -- d) az ország nem állapítható meg → hallgatunk
      WHEN orsz.id IS NULL THEN false
      -- e) EGY SOROS ORSZÁGTÖRZS: a „Románia" itt alapérték, nem tény → csend.
      --    ⏳ Átmeneti; a 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql oldja fel.
      WHEN NOT (SELECT ertelmes FROM orszagtorzs) THEN false
      -- f) az ország Románia, és ez most már INFORMÁCIÓ → JELZÜNK
      ELSE true
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
SELECT x.sorrend, x.szakasz, x.mit_mer, x.ertek, x.megjegyzes
FROM (

  -- ══ A. AMI MEGJELENNE A LELKÉSZ LISTÁJÁBAN ═══════════════════════════════
  SELECT 1 AS sorrend, 'A. Jelzés'::text AS szakasz,
         '➡️ ENNYI ÉLŐ TAG kapna „a térkép nem találja" hibát'::text AS mit_mer,
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a
           WHERE NOT a.helykitolto AND NOT a.feloldhato AND a.bizonyithatoan_romaniai)   AS ertek,
         'EZ A DÖNTŐ SZÁM. A migráció UTÁN várt: 24. Vesd össze a 3. sorral: ott EGYETLEN külföldi név sem lehet.'::text AS megjegyzes

  UNION ALL SELECT 2, 'A. Jelzés', '…ennyi TELEPÜLÉSEN',
         (SELECT count(*)::text FROM allapot a
           WHERE NOT a.helykitolto AND NOT a.feloldhato AND a.bizonyithatoan_romaniai),
         'Egy település egyszeri egyeztetése az ÖSSZES ottani tag hibáját megszünteti. A migráció után várt: 5.'

  UNION ALL SELECT 3, 'A. Jelzés', '➡️ A JELZETT TELEPÜLÉSEK NEVE (ellenőrizd egyenként!)',
         COALESCE((SELECT string_agg(a.nev || ' [' || a.megye || ' / ' || a.orszag
                                     || ', ' || a.elo_tag || ' fő]', '  ·  ' ORDER BY a.elo_tag DESC)
                     FROM allapot a
                    WHERE NOT a.helykitolto AND NOT a.feloldhato AND a.bizonyithatoan_romaniai),
                  '— egyetlen település sem kapna jelzést —'),
         'HA ITT BÁRMELYIK KÜLFÖLDI (Budapest, Debrecen, Gödöllő, Győr, Hollandia…), A JELZÉS ZAJT CSINÁL — szólj. Várt: Sepsiszentgyörgy · Páké · Zágon · Kovászna · Csíkcsicsó.'

  -- ══ B. AMIT SZÁNDÉKOSAN ELHALLGATUNK — és miért ══════════════════════════
  UNION ALL SELECT 10, 'B. Csend', 'Feloldhatatlan, de KÜLFÖLDI település (soha nincs jelzés)',
         COALESCE((SELECT string_agg(a.nev || ' [' || a.orszag || ', ' || a.elo_tag || ' fő]', '  ·  ')
                     FROM allapot a
                    WHERE NOT a.helykitolto AND NOT a.feloldhato AND NOT a.bizonyithatoan_romaniai
                      AND a.orszag NOT IN ('România', '∅ ismeretlen')), '— nincs ilyen —'),
         'Ezeket a térkép a MAGYAR nevükön megtalálja. A címük nem hibás. A migráció UTÁN ide kell kerülnie Budapestnek, Debrecennek, Gödöllőnek, Győrnek és „Hollandiának" (8 fő).'

  UNION ALL SELECT 11, 'B. Csend', 'Feloldhatatlan, de az ORSZÁG nem állapítható meg (nincs jelzés)',
         COALESCE((SELECT string_agg(a.nev || ' [megye: ' || a.megye || ', ' || a.elo_tag || ' fő]', '  ·  ')
                     FROM allapot a
                    WHERE NOT a.helykitolto AND NOT a.feloldhato AND NOT a.bizonyithatoan_romaniai
                      AND a.orszag = '∅ ismeretlen'), '— nincs ilyen —'),
         'Olyan sor, aminek a megyéje/országa le sem jött. Amint valódi országot kap, a jelzés magától megszólal.'

  UNION ALL SELECT 12, 'B. Csend', 'Feloldhatatlan, ROMÁNIA — de az országtörzs még egy soros (ÁTMENETI csend)',
         CASE WHEN (SELECT ertelmes FROM orszagtorzs) THEN '— nincs ilyen (az országtörzs már értelmes) —'
              ELSE COALESCE((SELECT string_agg(a.nev || ' [' || a.elo_tag || ' fő]', '  ·  ')
                               FROM allapot a
                              WHERE NOT a.helykitolto AND NOT a.feloldhato
                                AND NOT a.bizonyithatoan_romaniai
                                AND a.orszag = 'România'), '— nincs ilyen —')
         END,
         '⏳ EZ A SOR SZŰNIK MEG a 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql lefutásakor: ami itt áll, az utána az 1. sorba kerül át (jelzést kap) VAGY a 10. sorba (külföldi).'

  UNION ALL SELECT 13, 'B. Csend', 'Ennyi élő tagot érint a fenti HÁROM csendes csoport',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a
           WHERE NOT a.helykitolto AND NOT a.feloldhato AND NOT a.bizonyithatoan_romaniai),
         'Ennyi HAMIS hibát kerültünk el. (Az 1. + ez + a 22. sor = az összes feloldhatatlan.)'

  -- ══ C. A „?" HELYKITÖLTŐ — KÜLÖN, IGAZABB TÉTEL ══════════════════════════
  UNION ALL SELECT 22, 'C. Helykitöltő', '➡️ ENNYI ÉLŐ TAG kapna „hiányzik a település" hibát',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a WHERE a.helykitolto),
         'A mérés napján 70 — a gyülekezet LEGNAGYOBB adathiba-csoportja. NEM térkép-hiba: nincs mit megkeresni, és az „egyeztetés" itt rombolna (70 valódi cím egyetlen hamis ponton). Egyenként, a kartonon pótolandó.'

  UNION ALL SELECT 23, 'C. Helykitöltő', '…a helykitöltő sorok neve',
         COALESCE((SELECT string_agg(a.nev || ' [id=' || a.id || ', ' || a.elo_tag || ' fő]', '  ·  ')
                     FROM allapot a WHERE a.helykitolto), '— nincs ilyen —'),
         'Várt: egyetlen „?" nevű sor. Ha többet látsz, mindegyik saját tételt kap a Hibák fülön.'

  -- ══ D. VISZONYÍTÁS ═══════════════════════════════════════════════════════
  UNION ALL SELECT 30, 'D. Alap', '⏳ Értelmes-e már az ORSZÁGTÖRZS (van-e 2+ ország)',
         (SELECT ertelmes::text FROM orszagtorzs) || ' (' ||
           (SELECT count(*)::text FROM public.adrcountry) || ' ország)',
         'Amíg `false`, az 1. sor GARANTÁLTAN 0 — a kód szándékosan néma, mert a „Románia" ilyenkor alapérték, nem tény. A 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql állítja `true`-ra.'

  UNION ALL SELECT 31, 'D. Alap', 'Élő, látható tagok száma',
         (SELECT count(*)::text FROM public.szemely s
           WHERE COALESCE(s.isvisible, true) = true AND COALESCE(s.meghalt, false) = false),
         'A viszonyítási alap (a mérés napján 606).'

  UNION ALL SELECT 32, 'D. Alap', 'Élő tag feloldhatatlan településsel (jelzéstől függetlenül)',
         (SELECT COALESCE(sum(a.elo_tag), 0)::text FROM allapot a WHERE NOT a.feloldhato),
         'A mérés napján 102 (= 24 jelzett + 8 külföldi + 70 helykitöltő).'

  UNION ALL SELECT 33, 'D. Alap', 'Lefutott már a 2026-08-11-cim-geokodolas.sql',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'adrlocality'
                    AND column_name = 'geo_lat')::text,
         'Amíg `false`, a kód SZÁNDÉKOSAN egyetlen térkép-hibát sem jelez (nem lenne mivel javítani).'

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT KEZDJ AZ EREDMÉNNYEL
-- ════════════════════════════════════════════════════════════════════════════
-- · 30. sor ELŐSZÖR. Amíg `false`, az 1. sor mindig 0 lesz — ez NEM hiba, hanem
--   a szándékolt óvatosság. A jelzés a migráció után indul.
-- · 1. + 3. sor — a migráció után 24 tag / 5 település a várt. Olvasd el a 3.
--   sort NÉVRŐL NÉVRE: egyetlen külföldi név sem lehet benne.
-- · 10. sor — ide KELL, hogy kerüljön Budapest, Debrecen, Gödöllő, Győr,
--   Hollandia (8 fő). Ha itt látod őket, a külföld-kapu jól működik.
-- · 12. sor — ez a migráció ELŐTTI átmeneti csend. Ami itt áll, annak utána
--   át kell kerülnie az 1. vagy a 10. sorba. Ha valami eltűnik mindkettőből,
--   szólj — az adatvesztésre utal.
-- · 22. sor — a 70 tag a „?" helykitöltőn. Saját tételt kap, nem térkép-hibát.
-- · 33. sor `false` → az 1. sor akkor is 0-t jelentene élesben, ha itt nem az.
