-- ============================================================================
-- KARTOTÉKA — Tagnyilvántartás finomhangolás: DIAGNOSZTIKA (2026-07-17)
-- Kapcsolódó terv: docs/project-tracking/KARTOTEKA-tagnyilvantartas-finomhangolas-terv-2026-07-17.md
--
-- CSAK OLVASÓ lekérdezések (kivéve A2, ami egy próba-RPC-futtatás a Teszt
-- gyülekezeten — az is csak a voter_eligible flageket számolja újra).
-- Futtasd szakaszonként, és küldd vissza az eredményeket.
-- ============================================================================

-- ============================================================================
-- A) VÁLASZTÓI NÉVJEGYZÉK (terv F1) — P0-bizonyítás
-- ============================================================================

-- A1: Van-e elkoltozott oszlop a szemely-ben, és hivatkozik-e rá az éles RPC?
--     (Várt: az oszlop NEM létezik, az RPC hivatkozik rá -> minden futása hibázik)
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='szemely'
  AND column_name IN ('elkoltozott','voter_eligible','voter_manual_override');

SELECT position('s.elkoltozott' IN pg_get_functiondef('public.recompute_voter_eligibility(uuid)'::regprocedure)) > 0
  AS rpc_hivatkozik_hianyzo_oszlopra;

-- A2: Az RPC TÉNYLEGES futás-tesztje a Teszt gyülekezeten.
--     Ha "column s.elkoltozott does not exist" hibát dob, a P0 bizonyított.
SELECT public.recompute_voter_eligibility(id)
FROM public.congregations WHERE name ILIKE '%Teszt%' LIMIT 1;

-- A3: Futott-e valaha sikeresen az újraszámítás (ha mindenhol 0 jogosult: sosem)
SELECT congregation_id, count(*) AS osszes,
       count(*) FILTER (WHERE voter_eligible) AS jogosult,
       count(*) FILTER (WHERE voter_manual_override IS NOT NULL) AS felulbiralt
FROM public.szemely GROUP BY 1 ORDER BY 2 DESC;

-- A4: Elköltözés-flow törött-e: van sor az elkoltozott táblában, de a
--     szemely.member_status sosem 'elköltözött'? (actions.ts:772 hibás UPDATE gyanú)
SELECT (SELECT count(*) FROM public.elkoltozott) AS elkoltozott_tabla_sorok,
       (SELECT count(*) FROM public.szemely WHERE member_status IN ('elköltözött','elkoltozott')) AS szemely_elkoltozott_statusz;

-- A5: member_status eloszlás a látható-élő halmazon (kik szivárognak a 18+ listába)
SELECT member_status, count(*) FROM public.szemely
WHERE isvisible = true AND meghalt = false GROUP BY 1 ORDER BY 2 DESC;

-- A6: 1000-es levágás-kockázat + stornós és családi szintű 101.01 befizetések
SELECT congregation_id, count(*) AS nem_torolt_befizetes
FROM public.befizetes WHERE deleted = false GROUP BY 1 ORDER BY 2 DESC;

SELECT b.congregation_id,
       count(*) FILTER (WHERE b.stornozott) AS storno_101,
       count(*) FILTER (WHERE b.id_szemely IS NULL AND b.id_csalad IS NOT NULL) AS csaladi_101,
       count(*) AS osszes_101
FROM public.befizetes b
JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
WHERE bc.id_szamadasicel::text LIKE '101.01%' AND b.deleted = false
GROUP BY 1;

-- ============================================================================
-- B) NYOMTATÁS (terv F2)
-- ============================================================================

-- B1: Van-e éves járulék-beállítás 2025/2026-ra (ha nincs/0: a nyomtatási
--     dialog default szűrőivel a névjegyzék üres és a gombok letiltottak)
SELECT c.name, b.id AS ev, b.eves_jarulek
FROM bealitas b JOIN congregations c ON c.id = b.congregation_id
WHERE b.id IN ('2025','2026') ORDER BY c.name, b.id;

-- B2: Tipikus listahossz (lapszám/canvas-limit méretezéshez)
SELECT congregation_id,
       COUNT(*) FILTER (WHERE sz_datum <= (CURRENT_DATE - INTERVAL '18 years')) AS felnott_18plusz,
       COUNT(*) FILTER (WHERE voter_eligible = true) AS jogosult,
       COUNT(*) FILTER (WHERE voter_manual_override = 0) AS kezzel_kizart
FROM szemely WHERE isvisible = true AND meghalt = false
GROUP BY congregation_id ORDER BY felnott_18plusz DESC;

-- ============================================================================
-- C) TELEPÜLÉS-HIÁNY (terv F3) — P0-bizonyítás + backfill-felmérés
-- ============================================================================

-- C1: A szemely tényleges cím-oszlopai élesben (a dump elavult lehet)
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='szemely'
  AND (column_name LIKE 'c\_%' ESCAPE '\' OR column_name IN ('sz_helyid'))
ORDER BY ordinal_position;

-- C2: DÖNTŐ — mennyire hiányzik a c_helysegid gyülekezetenként
SELECT congregation_id, count(*) AS osszes,
       count(c_helysegid) AS van_telepules_fk,
       count(*) - count(c_helysegid) AS nincs_telepules_fk,
       count(c_utcaid) AS van_utca_fk,
       count(c_szcim) AS van_szoveges_cim
FROM public.szemely WHERE isvisible = true
GROUP BY congregation_id ORDER BY osszes DESC;

-- C3: 10-soros minta — mit lát a UI vs mi állítható helyre az utcából
SELECT sz.id, sz.csaladnev, sz.k_nev, sz.c_helysegid, l1.name AS ui_telepules,
       sz.c_utcaid, s.name AS utca, sz.c_szam,
       s.localityid AS utca_locality_fk, l2.name AS utca_szerinti_telepules, sz.c_szcim
FROM public.szemely sz
LEFT JOIN public.adrlocality l1 ON l1.id = sz.c_helysegid
LEFT JOIN public.adrstreet s ON s.id = sz.c_utcaid
LEFT JOIN public.adrlocality l2 ON l2.id = s.localityid
WHERE sz.isvisible = true ORDER BY sz.id DESC LIMIT 10;

-- C4: DÖNTŐ — hány sor állítható helyre backfill-lel (ha ez ~= a hiányzók
--     száma, a gyökérok-diagnózis igazolt és a backfill biztonságos)
SELECT count(*) AS helyreallithato
FROM public.szemely sz
JOIN public.adrstreet s ON s.id = sz.c_utcaid
WHERE sz.isvisible = true AND sz.c_helysegid IS NULL AND s.localityid IS NOT NULL;

-- C5: Ékezet-bizonyíték — a wizard-kulcs (sima lower) vs RPC-kulcs (unaccent);
--     ahol egyezik=false, ott bukott a map-lookup
SELECT name, lower(btrim(name)) AS wizard_kulcs,
       public.normalize_name(name) AS rpc_kulcs,
       (lower(btrim(name)) = public.normalize_name(name)) AS egyezik
FROM public.adrlocality ORDER BY usagecnt DESC NULLS LAST LIMIT 25;

-- C6: Latens rossz-kötés — az "első" adrlocality-hoz csatolt utcák
SELECT s.id, s.name AS utca, l.name AS telepules,
       (SELECT count(*) FROM public.szemely sz WHERE sz.c_utcaid = s.id) AS hasznalo_tagok
FROM public.adrstreet s JOIN public.adrlocality l ON l.id = s.localityid
WHERE s.localityid = (SELECT min(id) FROM public.adrlocality)
ORDER BY hasznalo_tagok DESC LIMIT 20;

-- ============================================================================
-- D) KÖRZETEK (terv F4) — bemeneti felmérés az auto-körzetesítéshez
-- ============================================================================

-- D1: Körzet-leltár (congregation_id NULL-legacy arány)
SELECT cs.id, cs.nev, cs.isaktiv, cs.congregation_id,
       count(DISTINCT c.id) AS csaladok, count(DISTINCT p.id) AS presbiterek
FROM public.csoport cs
LEFT JOIN public.csalad c ON c.id_csoport = cs.id
LEFT JOIN public.presbiter p ON p.id_csoport = cs.id
WHERE cs.iskorzet = true
GROUP BY 1,2,3,4 ORDER BY cs.congregation_id NULLS FIRST, cs.nev;

-- D2: Cím-lefedettség: utca nélküli / körzet nélküli aktív háztartások
SELECT h.congregation_id, count(*) AS aktiv_haztartas,
       count(*) FILTER (WHERE ci.id_utca IS NULL AND cs.c_utcaid IS NULL) AS utca_nelkul,
       count(*) FILTER (WHERE h.id_csoport IS NULL) AS korzet_nelkul
FROM public.haztartas h
LEFT JOIN public.cim ci ON ci.id = h.id_cim
LEFT JOIN public.csalad cs ON cs.id = h.legacy_csalad_id
WHERE h.ervenyes_ig IS NULL AND h.legacy_csalad_id IS NOT NULL
GROUP BY 1;

-- D3: Utcánkénti családszám + település (a bin-packing bemenete)
SELECT h.congregation_id, al.name AS telepules, a.name AS utca, count(*) AS csaladok
FROM public.haztartas h
LEFT JOIN public.cim ci ON ci.id = h.id_cim
LEFT JOIN public.csalad cs ON cs.id = h.legacy_csalad_id
JOIN public.adrstreet a ON a.id = COALESCE(ci.id_utca, cs.c_utcaid)
LEFT JOIN public.adrlocality al ON al.id = a.localityid
WHERE h.ervenyes_ig IS NULL AND h.legacy_csalad_id IS NOT NULL
GROUP BY 1,2,3 ORDER BY 1, 4 DESC;

-- D4: Házszám parse-olhatóság (utca-kettéosztás korlátja)
SELECT count(*) AS osszes,
       count(*) FILTER (WHERE COALESCE(ci.szam, cs.c_szam) ~ '^[0-9]+') AS szammal_kezdodo,
       count(*) FILTER (WHERE COALESCE(ci.szam, cs.c_szam) IS NULL
                           OR COALESCE(ci.szam, cs.c_szam) !~ '^[0-9]+') AS nem_parseolhato
FROM public.haztartas h
LEFT JOIN public.cim ci ON ci.id = h.id_cim
LEFT JOIN public.csalad cs ON cs.id = h.legacy_csalad_id
WHERE h.ervenyes_ig IS NULL AND h.legacy_csalad_id IS NOT NULL;

-- D5: Presbiter-alap + többsoros (multi-körzet) legacy sorok
SELECT p.congregation_id, count(*) AS presbiter_sor,
       count(DISTINCT p.id_szemely) AS szemely,
       count(*) FILTER (WHERE p.id_csoport IS NOT NULL) AS korzettel
FROM public.presbiter p GROUP BY 1;
SELECT id_szemely, count(*) FROM public.presbiter GROUP BY 1 HAVING count(*) > 1;

-- D6: csalad <-> haztartas id_csoport divergencia (a dual-write szétcsúszott-e)
SELECT count(*) FROM public.haztartas h
JOIN public.csalad c ON c.id = h.legacy_csalad_id
WHERE h.ervenyes_ig IS NULL
  AND COALESCE(h.id_csoport,-1) <> COALESCE(c.id_csoport,-1);

-- ============================================================================
-- E) SZEMÉLYI KARTON (terv F5)
-- ============================================================================

-- E1: Duplikált anyakönyvi rekordok (a maybeSingle ezeknél némán null-t ad)
SELECT 'keresztseg' AS tabla, id_szemely, COUNT(*) FROM keresztseg GROUP BY id_szemely HAVING COUNT(*) > 1
UNION ALL SELECT 'konfirmalas', id_szemely, COUNT(*) FROM konfirmalas GROUP BY id_szemely HAVING COUNT(*) > 1
UNION ALL SELECT 'temetes', id_szemely, COUNT(*) FROM temetes GROUP BY id_szemely HAVING COUNT(*) > 1
UNION ALL SELECT 'bekoltozott', id_szemely, COUNT(*) FROM bekoltozott GROUP BY id_szemely HAVING COUNT(*) > 1
UNION ALL SELECT 'attert', id_szemely, COUNT(*) FROM attert GROUP BY id_szemely HAVING COUNT(*) > 1;

-- E2: haztartas_tag szerep-eloszlás (él-e az 'unoka' szerep, van-e váratlan érték)
SELECT szerep, COUNT(*) FROM haztartas_tag WHERE ervenyes_ig IS NULL GROUP BY szerep ORDER BY 2 DESC;

-- E3: Vallás-értékvariánsok (ékezet nélküli 'reformatus' rekordok)
SELECT vallas, COUNT(*) FROM szemely WHERE isvisible = true GROUP BY vallas ORDER BY 2 DESC LIMIT 30;

-- E4: CNP-duplikátumok + CNP nélküli személyek (szülő-összekötés zsákutcái)
SELECT cnp, COUNT(*) FROM szemely WHERE cnp IS NOT NULL AND cnp <> ''
GROUP BY cnp HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 30;
SELECT COUNT(*) AS cnp_nelkuli FROM szemely WHERE isvisible = true AND (cnp IS NULL OR cnp = '');

-- E5: Több aktív házas-családban szereplő személy (dupla családtagság)
WITH felek AS (
  SELECT id_ferfi AS szemely_id, id FROM csalad WHERE isaktiv = true AND id_ferfi IS NOT NULL
  UNION ALL
  SELECT id_no, id FROM csalad WHERE isaktiv = true AND id_no IS NOT NULL
)
SELECT szemely_id, COUNT(*) AS aktiv_csalad_db, ARRAY_AGG(id) AS csalad_idk
FROM felek GROUP BY szemely_id HAVING COUNT(*) > 1;

-- E6: 30-nál több család-szintű befizetés (a karton hátralék-bontása csonkul)
SELECT id_csalad, COUNT(*) AS tetel_db FROM befizetes
WHERE id_csalad IS NOT NULL AND (deleted = false OR deleted IS NULL)
GROUP BY id_csalad HAVING COUNT(*) > 30 ORDER BY 2 DESC;

-- ============================================================================
-- F) CSALÁD-IMPORT (terv F6) — P0-bizonyítás
-- ============================================================================

-- F1: DÖNTŐ — hány csalad rekordnak NINCS haztartas párja gyülekezetenként
--     (ezek a "láthatatlan" importált családok)
SELECT COALESCE(sf.congregation_id, sn.congregation_id) AS congregation_id,
       COUNT(*) AS csalad_osszes,
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id)) AS haztartas_NELKUL_lathatatlan,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id AND h.ervenyes_ig IS NULL)) AS aktiv_haztartassal
FROM public.csalad c
LEFT JOIN public.szemely sf ON sf.id = c.id_ferfi
LEFT JOIN public.szemely sn ON sn.id = c.id_no
GROUP BY 1 ORDER BY haztartas_NELKUL_lathatatlan DESC;

-- F2: RPC-állapot — signature-ök + melyiken van statement_timeout proconfig
--     (várható: csak az infer-en van 120s, a két batch-RPC-n NINCS)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('import_family_head_batch','import_families_from_existing_persons_batch',
                    'infer_family_links_for_congregation','revert_family_link_batch',
                    '_resolve_or_create_street','_resolve_or_create_locality','normalize_name')
ORDER BY p.proname, args;

-- F3: Kettős tagság: gyerek egy családban ÉS fej/házastárs egy másikban
SELECT g.id_szemely, g.id_csalad AS gyerekkent, c2.id AS fejkent
FROM public.gyerek g
JOIN public.csalad c2 ON c2.id_ferfi = g.id_szemely OR c2.id_no = g.id_szemely
LIMIT 50;

-- F4: ferfi=NULL + csaladfo-divergencia (fejek csaladfo=false-szal)
SELECT COUNT(*) FILTER (WHERE ferfi IS NULL) AS ferfi_null,
       COUNT(*) FILTER (WHERE csaladfo) AS csaladfo_true,
       COUNT(*) AS osszes
FROM public.szemely WHERE isvisible;
SELECT COUNT(*) AS fej_de_nem_csaladfo
FROM public.csalad c
JOIN public.szemely s ON s.id = COALESCE(c.id_ferfi, c.id_no)
WHERE s.csaladfo = false AND s.isvisible = true;

-- F5: Duplikált adrstreet sorok (a cím-kulcsos gyerek-match néma 0-jának forrása)
SELECT localityid, LOWER(name) AS nev, COUNT(*) AS db, array_agg(id) AS ids
FROM public.adrstreet GROUP BY 1, 2 HAVING COUNT(*) > 1 ORDER BY db DESC LIMIT 50;

-- F6: Auto-link előzmények (batch-ek, mennyit írtak/vontak vissza)
SELECT batch_id, congregation_id, MIN(created_at) AS mikor,
       COUNT(*) FILTER (WHERE action='spouse_link') AS hazastars,
       COUNT(*) FILTER (WHERE action='child_link') AS gyerek,
       COUNT(*) FILTER (WHERE reverted_at IS NOT NULL) AS visszavont
FROM public.family_link_audit
GROUP BY 1,2 ORDER BY mikor DESC LIMIT 20;

-- ============================================================================
-- G) IMPORT-MOTOROK (terv F7)
-- ============================================================================

-- G1: Létezik-e kod és congregation_id a befizetescel/kiadascel táblákon
--     (a lookup-resolver select-jének érvényessége — néma üres map gyanú)
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('befizetescel','kiadascel','szamadasicel')
ORDER BY table_name, ordinal_position;

-- G2: Ha van congregation_id: hány kategória-sor érhető el a szűrővel
--     (cseréld a <CONG_UUID>-t egy valódi gyülekezet-azonosítóra, pl. 43cff37f-...)
-- SELECT 'befizetescel' AS tabla, count(*) AS osszes,
--        count(*) FILTER (WHERE congregation_id = '<CONG_UUID>') AS cong_szurt,
--        count(*) FILTER (WHERE congregation_id IS NULL) AS null_cong
-- FROM befizetescel
-- UNION ALL
-- SELECT 'kiadascel', count(*),
--        count(*) FILTER (WHERE congregation_id = '<CONG_UUID>'),
--        count(*) FILTER (WHERE congregation_id IS NULL)
-- FROM kiadascel;

-- ============================================================================
-- H) CSALÁDI HÁLÓ + CSALÁDFA (terv F8)
-- ============================================================================

-- H1: Kapcsolattípus-eloszlás (mekkora bázisra épül a levezetett rokonság)
SELECT tipus, count(*) AS aktiv_db,
       count(*) FILTER (WHERE ervenyes_ig IS NOT NULL) AS lezart_db
FROM public.szemely_kapcsolat GROUP BY tipus ORDER BY aktiv_db DESC;

-- H2: Hány nagyszulo_unoka párnak NINCS levezethető szülő-lánca
--     (ezek tűnnének el, ha csak a származtatás maradna — beolvasztási döntéshez)
WITH pc AS (
  SELECT id_szemely_1 AS szulo, id_szemely_2 AS gyerek
  FROM public.szemely_kapcsolat WHERE tipus='szulo_gyermek' AND ervenyes_ig IS NULL
)
SELECT count(*) AS osszes_nagyszulo_el,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM pc a JOIN pc b ON a.gyerek=b.szulo
         WHERE a.szulo=k.id_szemely_1 AND b.gyerek=k.id_szemely_2)) AS lanc_nelkuli
FROM public.szemely_kapcsolat k
WHERE k.tipus='nagyszulo_unoka' AND k.ervenyes_ig IS NULL;

-- H3: Tenant-integritás: kapcsolat-sor, ahol a végpontok congregation_id-ja eltér
SELECT k.id, k.congregation_id AS kapcsolat_cong,
       s1.congregation_id AS szemely1_cong, s2.congregation_id AS szemely2_cong
FROM public.szemely_kapcsolat k
JOIN public.szemely s1 ON s1.id=k.id_szemely_1
JOIN public.szemely s2 ON s2.id=k.id_szemely_2
WHERE k.ervenyes_ig IS NULL
  AND (s1.congregation_id <> k.congregation_id OR s2.congregation_id <> k.congregation_id)
LIMIT 50;

-- H4: Aktív kapcsolat-sorok gyülekezetenként (1000 fölött a lapozatlan
--     családfa-lekérdezés némán vágna)
SELECT congregation_id, count(*) AS aktiv_kapcsolat
FROM public.szemely_kapcsolat WHERE ervenyes_ig IS NULL
GROUP BY congregation_id ORDER BY aktiv_kapcsolat DESC;

-- H5: Duplikált haztartas sorok legacy_csalad_id-nként
SELECT legacy_csalad_id, count(*) AS haztartas_db, array_agg(id) AS haztartas_idk
FROM public.haztartas
WHERE ervenyes_ig IS NULL AND legacy_csalad_id IS NOT NULL
GROUP BY legacy_csalad_id HAVING count(*) > 1
ORDER BY haztartas_db DESC LIMIT 20;

-- ============================================================================
-- I) DESKTOP (terv F9)
-- ============================================================================

-- I1: csalad.c_utcaid nullable-e (a -1 dummy fix útját dönti el) + csoport oszlopai
SELECT table_name, column_name, is_nullable, data_type FROM information_schema.columns
WHERE table_name IN ('csalad','csoport')
  AND column_name IN ('c_utcaid','id_csoport','id','nev','congregation_id')
ORDER BY table_name, ordinal_position;

-- I2: Hány desktop-eredetű (dummy-utcás) család van élesben
SELECT count(*) AS dummy_utcas_csaladok,
       count(*) FILTER (WHERE isaktiv) AS ebbol_aktiv
FROM csalad WHERE c_utcaid = -1;

-- I3: Tagszám gyülekezetenként (a lapozás-küszöbök: 500/1000/2000) +
--     azonos-updated_at klaszterek (a sync .gt() határvesztés élessége)
SELECT congregation_id, COUNT(*) AS tag_db,
       COUNT(*) FILTER (WHERE isvisible IS DISTINCT FROM false) AS lathato_db
FROM szemely GROUP BY congregation_id ORDER BY tag_db DESC;

SELECT congregation_id, updated_at, count(*) FROM szemely
GROUP BY congregation_id, updated_at HAVING count(*) > 200
ORDER BY count(*) DESC LIMIT 10;
