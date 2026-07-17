-- ============================================================================
-- KARTOTÉKA — Pénzügy finomhangolás DIAGNOSZTIKA (2026-07-17)
-- Futtatás: Supabase SQL editor. CSAK OLVAS, semmit nem módosít.
-- A blokkokat egyenként futtasd, és az eredményeket küldd vissza.
-- Kapcsolódó terv: docs/project-tracking/KARTOTEKA-penzugy-finomhangolas-terv-2026-07-17.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- D1) KULCSKÉRDÉS — van-e a szamadasicel táblának `kod` oszlopa?
--     Ha NINCS a listában 'kod' sor → az F1-1 P0 igazolt: a Tartozások
--     befizetés-lekérdezése hibázik, paid=0 mindenkinél.
-- ----------------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='szamadasicel'
ORDER BY ordinal_position;

-- D1b) jarulek_kedvezmeny tényleges oszlopai (kezdet-oszlop léte)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jarulek_kedvezmeny'
ORDER BY ordinal_position;

-- ----------------------------------------------------------------------------
-- D2) Díj-források divergenciája: congregations vs bealitas (aktuális év)
--     (F1-2: a Beállítások-ablak díja nem jut el a motorig)
-- ----------------------------------------------------------------------------
SELECT c.id, c.nev_hu,
       c.eves_jarulek        AS cong_dij,
       c.jarulek_kedvezmenyes AS cong_kedv,
       c.jarulek_hatarid      AS cong_hatarido,
       b.id                   AS bealitas_ev,
       b.eves_jarulek         AS bealitas_dij,
       b.jarulek_kedvezmenyes AS bealitas_kedv,
       b.jarulek_hatarid      AS bealitas_hatarido
FROM public.congregations c
LEFT JOIN public.bealitas b
  ON b.congregation_id = c.id AND b.id = to_char(now(),'YYYY')
WHERE COALESCE(c.eves_jarulek,0)         <> COALESCE(b.eves_jarulek,0)
   OR COALESCE(c.jarulek_kedvezmenyes,0) <> COALESCE(b.jarulek_kedvezmenyes,0)
ORDER BY c.nev_hu;

-- D2b) 0-díjas bealitas sor pozitív congregations-díj mellett (elméleti maradék-eset)
SELECT b.congregation_id, b.id AS ev, b.eves_jarulek, c.eves_jarulek AS cong_dij
FROM public.bealitas b
JOIN public.congregations c ON c.id = b.congregation_id
WHERE COALESCE(b.eves_jarulek,0) = 0 AND COALESCE(c.eves_jarulek,0) > 0;

-- ----------------------------------------------------------------------------
-- D3) Kedvezmény-szabályok teljes tartalma + gyanús minták
--     Keresendő: tipus='kor' ÉS fix_osszeg IS NOT NULL (wizard fix-mód, F1-9);
--     tipus='foglalkozas' ÉS szazalek IS NOT NULL ÉS fix_osszeg IS NULL (F1-6);
--     tipus='idoszak' ÉS kedv_osszeg=0 (néma no-op); kor_tol=0.
-- ----------------------------------------------------------------------------
SELECT id, congregation_id, ev, tipus, sorrend, aktiv, kezdet, hatarid,
       kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras
FROM public.jarulek_kedvezmeny
ORDER BY congregation_id, ev DESC, tipus, sorrend;

-- D3b) Érvénytelen hónap-nap értékek (pl. '13-01' — rollover-csapda)
SELECT 'jarulek_kedvezmeny' AS forras, id::text AS azonosito, kezdet AS ertek
FROM public.jarulek_kedvezmeny
WHERE kezdet IS NOT NULL AND kezdet !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
UNION ALL
SELECT 'jarulek_kedvezmeny', id::text, hatarid
FROM public.jarulek_kedvezmeny
WHERE hatarid IS NOT NULL AND hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
UNION ALL
SELECT 'bealitas', congregation_id::text || '/' || id, jarulek_hatarid
FROM public.bealitas
WHERE jarulek_hatarid IS NOT NULL
  AND jarulek_hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';

-- ----------------------------------------------------------------------------
-- D4) Évenkénti díj-panel (congregation_annual_fees) vs a motor (bealitas)
--     (F1-3: mit hisz a lelkész rögzítettnek vs mit használ a számítás)
-- ----------------------------------------------------------------------------
SELECT COALESCE(caf.congregation_id, b.congregation_id) AS congregation_id,
       COALESCE(caf.year, b.id::int) AS ev,
       caf.eves_jarulek AS panel_dij,
       b.eves_jarulek   AS motor_dij
FROM public.congregation_annual_fees caf
FULL OUTER JOIN public.bealitas b
  ON b.congregation_id = caf.congregation_id AND b.id = caf.year::text
WHERE caf.eves_jarulek IS DISTINCT FROM b.eves_jarulek
ORDER BY 1, 2 DESC;

-- D4b) Van-e UNIQUE (congregation_id, year) a congregation_annual_fees-en?
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.congregation_annual_fees'::regclass;

-- ----------------------------------------------------------------------------
-- D5) Stornó-érintettség (F1-4 befizetés + F3-4 kiadás/kísérőív)
-- ----------------------------------------------------------------------------
SELECT b.congregation_id, count(*) AS stornozott_befizetesek, sum(b.osszeg) AS osszeg
FROM public.befizetes b
JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
WHERE b.stornozott = true
  AND (b.deleted = false OR b.deleted IS NULL)
  AND bc.id_szamadasicel LIKE '101.01%'
GROUP BY b.congregation_id;

SELECT congregation_id, count(*) AS stornozott_kiadasok,
       min(datum) AS elso, max(datum) AS utolso
FROM public.kiadas
WHERE stornozott = true AND deleted = false
GROUP BY congregation_id;

-- D5b) Egyházfenntartói befizetések fizetettev NÉLKÜL (ezek sosem számítanak be)
SELECT b.congregation_id, count(*) AS fizetettev_nelkul, sum(b.osszeg) AS osszeg
FROM public.befizetes b
JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
WHERE bc.id_szamadasicel LIKE '101.01%'
  AND b.fizetettev IS NULL
  AND (b.deleted = false OR b.deleted IS NULL)
GROUP BY b.congregation_id;

-- ----------------------------------------------------------------------------
-- D6) Desktop 500-as pull-limit érintettsége: befizetések száma évente
-- ----------------------------------------------------------------------------
SELECT congregation_id, fizetettev, count(*) AS db
FROM public.befizetes
WHERE deleted = false
GROUP BY congregation_id, fizetettev
HAVING count(*) > 400
ORDER BY count(*) DESC;

-- ----------------------------------------------------------------------------
-- D7) Nyugta (chitanță) állapot — az üres-nyomtatás P0 (F2-1) járulékos kára
-- ----------------------------------------------------------------------------
SELECT count(*) AS db,
       min(nyomdai_szam) AS min_nyomdai, max(nyomdai_szam) AS max_nyomdai,
       count(*) FILTER (WHERE stornozott) AS sztornozott
FROM public.oblio_szamlak
WHERE tipus = 'chitanta_papir' AND szamla_datum >= '2026-01-01';

SELECT count(*) AS ossz,
       count(*) FILTER (WHERE reprezentand IS NULL OR reprezentand = '') AS nincs_cel,
       count(*) FILTER (WHERE reprezentand_ro IS NULL OR reprezentand_ro = '') AS nincs_ro
FROM public.oblio_szamlak
WHERE tipus = 'chitanta_papir';

-- ----------------------------------------------------------------------------
-- D8) Kettős nyugta-számozás kockázata (F2-5): tomb nélküli vs tömbös ütközések
-- ----------------------------------------------------------------------------
SELECT sorozat, szam, count(*) AS db,
       bool_or(tomb_id IS NULL)     AS van_tomb_nelkuli,
       bool_or(tomb_id IS NOT NULL) AS van_tombos
FROM public.oblio_szamlak
WHERE tipus = 'chitanta_papir'
GROUP BY sorozat, szam
HAVING count(*) > 1
    OR (bool_or(tomb_id IS NULL) AND bool_or(tomb_id IS NOT NULL));

-- ----------------------------------------------------------------------------
-- D9) Induló egyenlegek — léteznek-e a nyitó-táblák + RLS + UNIQUE (4. terület)
-- ----------------------------------------------------------------------------
SELECT x.table_name,
       EXISTS (SELECT 1 FROM information_schema.tables t
               WHERE t.table_schema='public' AND t.table_name=x.table_name) AS letezik
FROM (VALUES ('bankszamla_nyito_egyenleg'), ('keszpenz_nyito_egyenleg')) AS x(table_name);

SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('bankszamla_nyito_egyenleg','keszpenz_nyito_egyenleg');

SELECT conname FROM pg_constraint
WHERE conname IN ('bankszamla_nyito_egyenleg_unique','keszpenz_nyito_egyenleg_unique');

-- ----------------------------------------------------------------------------
-- D10) Rögzített nyitók + legacy nem-nulla értékek (Registru Banca torzítás)
--      (Ha a D9 szerint valamelyik tábla nem létezik, az arra vonatkozó
--       lekérdezés hibát ad — azt a blokkot hagyd ki.)
-- ----------------------------------------------------------------------------
SELECT 'bank' AS tipus, eve, forrasa, count(*) AS db, sum(nyito_egyenleg_ron) AS ossz_ron
FROM public.bankszamla_nyito_egyenleg GROUP BY eve, forrasa
UNION ALL
SELECT 'kassza', eve, forrasa, count(*), sum(nyito_egyenleg)
FROM public.keszpenz_nyito_egyenleg GROUP BY eve, forrasa
ORDER BY 1, 2;

SELECT id, bank_neve, valuta, nyito_egyenleg
FROM public.bankszamlak
WHERE COALESCE(nyito_egyenleg,0) <> 0;

SELECT congregation_id, id AS ev, nyito_keszpenz, nyito_bank
FROM public.bealitas
WHERE COALESCE(nyito_keszpenz,0) <> 0 OR COALESCE(nyito_bank,0) <> 0;
