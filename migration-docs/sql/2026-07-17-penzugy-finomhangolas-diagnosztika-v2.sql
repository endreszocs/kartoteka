-- ============================================================================
-- KARTOTÉKA — Pénzügy finomhangolás DIAGNOSZTIKA v2 (2026-07-17)
-- EGYETLEN utasítás: egyszer futtatod, MINDEN eredmény egy táblázatban jön
-- vissza (blokk + adat JSON oszlop). Csak olvas, semmit nem módosít.
-- A teljes eredményt (minden sort) másold vissza.
-- ============================================================================

SELECT blokk, adat
FROM (

  -- D01) KULCS: a szamadasicel oszlopai — van-e 'kod'? (F1-1 P0 igazolása)
  SELECT 'D01_szamadasicel_oszlopok' AS blokk,
         (SELECT jsonb_agg(column_name ORDER BY ordinal_position)
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='szamadasicel') AS adat

  UNION ALL
  -- D01b) jarulek_kedvezmeny oszlopai (kezdet-oszlop léte)
  SELECT 'D01b_jarulek_kedvezmeny_oszlopok',
         (SELECT jsonb_agg(column_name ORDER BY ordinal_position)
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='jarulek_kedvezmeny')

  UNION ALL
  -- D02) congregations vs bealitas díj-divergencia (aktuális év)
  SELECT 'D02_dij_divergencia_akt_ev',
         (SELECT jsonb_agg(jsonb_build_object(
            'gyul', c.nev_hu, 'cong_dij', c.eves_jarulek, 'cong_kedv', c.jarulek_kedvezmenyes,
            'cong_hatarido', c.jarulek_hatarid, 'bealitas_ev', b.id, 'bealitas_dij', b.eves_jarulek,
            'bealitas_kedv', b.jarulek_kedvezmenyes, 'bealitas_hatarido', b.jarulek_hatarid))
          FROM public.congregations c
          LEFT JOIN public.bealitas b
            ON b.congregation_id = c.id AND b.id = to_char(now(),'YYYY')
          WHERE COALESCE(c.eves_jarulek,0)         <> COALESCE(b.eves_jarulek,0)
             OR COALESCE(c.jarulek_kedvezmenyes,0) <> COALESCE(b.jarulek_kedvezmenyes,0))

  UNION ALL
  -- D02b) 0-díjas bealitas sor pozitív congregations-díj mellett
  SELECT 'D02b_nulla_dijas_bealitas',
         (SELECT jsonb_agg(jsonb_build_object('congregation_id', b.congregation_id, 'ev', b.id,
                 'bealitas_dij', b.eves_jarulek, 'cong_dij', c.eves_jarulek))
          FROM public.bealitas b
          JOIN public.congregations c ON c.id = b.congregation_id
          WHERE COALESCE(b.eves_jarulek,0) = 0 AND COALESCE(c.eves_jarulek,0) > 0)

  UNION ALL
  -- D03) Minden kedvezmény-szabály (gyanús minták kereséséhez)
  SELECT 'D03_kedvezmeny_szabalyok',
         (SELECT jsonb_agg(jsonb_build_object(
            'id', id, 'cong', congregation_id, 'ev', ev, 'tipus', tipus, 'sorrend', sorrend,
            'aktiv', aktiv, 'kezdet', kezdet, 'hatarid', hatarid, 'kedv_osszeg', kedv_osszeg,
            'kor_tol', kor_tol, 'szazalek', szazalek, 'fix_osszeg', fix_osszeg, 'jov', jov_leiras)
            ORDER BY congregation_id, ev DESC, tipus, sorrend)
          FROM public.jarulek_kedvezmeny)

  UNION ALL
  -- D03b) Érvénytelen hónap-nap értékek ('13-01' rollover-csapda)
  SELECT 'D03b_ervenytelen_honap_nap',
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object('forras','jarulek_kedvezmeny','id',id,'mezo','kezdet','ertek',kezdet) AS x
            FROM public.jarulek_kedvezmeny
            WHERE kezdet IS NOT NULL AND kezdet !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            UNION ALL
            SELECT jsonb_build_object('forras','jarulek_kedvezmeny','id',id,'mezo','hatarid','ertek',hatarid)
            FROM public.jarulek_kedvezmeny
            WHERE hatarid IS NOT NULL AND hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            UNION ALL
            SELECT jsonb_build_object('forras','bealitas','id',congregation_id::text||'/'||id,'mezo','jarulek_hatarid','ertek',jarulek_hatarid)
            FROM public.bealitas
            WHERE jarulek_hatarid IS NOT NULL
              AND jarulek_hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$') s)

  UNION ALL
  -- D04) Évenkénti díj-panel vs motor (congregation_annual_fees vs bealitas)
  SELECT 'D04_panel_vs_motor_dijak',
         (SELECT jsonb_agg(jsonb_build_object(
            'cong', COALESCE(caf.congregation_id, b.congregation_id),
            'ev', COALESCE(caf.year, b.id::int),
            'panel_dij', caf.eves_jarulek, 'motor_dij', b.eves_jarulek))
          FROM public.congregation_annual_fees caf
          FULL OUTER JOIN public.bealitas b
            ON b.congregation_id = caf.congregation_id AND b.id = caf.year::text
          WHERE caf.eves_jarulek IS DISTINCT FROM b.eves_jarulek)

  UNION ALL
  -- D04b) UNIQUE constraint a congregation_annual_fees-en
  SELECT 'D04b_annual_fees_constraintek',
         (SELECT jsonb_agg(jsonb_build_object('nev', conname, 'def', pg_get_constraintdef(oid)))
          FROM pg_constraint
          WHERE conrelid = 'public.congregation_annual_fees'::regclass)

  UNION ALL
  -- D05) Stornó-érintettség: befizetések (járulék) + kiadások
  SELECT 'D05_storno_befizetesek',
         (SELECT jsonb_agg(jsonb_build_object('cong', s.congregation_id, 'db', s.db, 'osszeg', s.osszeg))
          FROM (SELECT b.congregation_id, count(*) AS db, sum(b.osszeg) AS osszeg
                FROM public.befizetes b
                JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
                WHERE b.stornozott = true AND (b.deleted = false OR b.deleted IS NULL)
                  AND bc.id_szamadasicel LIKE '101.01%'
                GROUP BY b.congregation_id) s)

  UNION ALL
  SELECT 'D05b_storno_kiadasok',
         (SELECT jsonb_agg(jsonb_build_object('cong', s.congregation_id, 'db', s.db, 'elso', s.elso, 'utolso', s.utolso))
          FROM (SELECT congregation_id, count(*) AS db, min(datum) AS elso, max(datum) AS utolso
                FROM public.kiadas WHERE stornozott = true AND deleted = false
                GROUP BY congregation_id) s)

  UNION ALL
  SELECT 'D05c_fizetettev_nelkuli_jarulek',
         (SELECT jsonb_agg(jsonb_build_object('cong', s.congregation_id, 'db', s.db, 'osszeg', s.osszeg))
          FROM (SELECT b.congregation_id, count(*) AS db, sum(b.osszeg) AS osszeg
                FROM public.befizetes b
                JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
                WHERE bc.id_szamadasicel LIKE '101.01%' AND b.fizetettev IS NULL
                  AND (b.deleted = false OR b.deleted IS NULL)
                GROUP BY b.congregation_id) s)

  UNION ALL
  -- D06) Desktop 500-as limit: 400+ befizetéses gyülekezet-évek
  SELECT 'D06_befizetes_szam_evente',
         (SELECT jsonb_agg(jsonb_build_object('cong', s.congregation_id, 'ev', s.fizetettev, 'db', s.db))
          FROM (SELECT congregation_id, fizetettev, count(*) AS db
                FROM public.befizetes WHERE deleted = false
                GROUP BY congregation_id, fizetettev
                HAVING count(*) > 400) s)

  UNION ALL
  -- D07) Nyugta-állapot (idei kiállítások + reprezentand kitöltöttség)
  SELECT 'D07_nyugta_allapot',
         (SELECT jsonb_build_object(
            'idei_db', count(*) FILTER (WHERE szamla_datum >= '2026-01-01'),
            'idei_min_nyomdai', min(nyomdai_szam) FILTER (WHERE szamla_datum >= '2026-01-01'),
            'idei_max_nyomdai', max(nyomdai_szam) FILTER (WHERE szamla_datum >= '2026-01-01'),
            'idei_sztorno', count(*) FILTER (WHERE stornozott AND szamla_datum >= '2026-01-01'),
            'ossz_db', count(*),
            'nincs_cel', count(*) FILTER (WHERE reprezentand IS NULL OR reprezentand = ''),
            'nincs_ro', count(*) FILTER (WHERE reprezentand_ro IS NULL OR reprezentand_ro = ''))
          FROM public.oblio_szamlak WHERE tipus = 'chitanta_papir')

  UNION ALL
  -- D08) Kettős nyugta-számozás: ütközések tömb nélküli vs tömbös közt
  SELECT 'D08_szamozas_utkozesek',
         (SELECT jsonb_agg(jsonb_build_object('sorozat', s.sorozat, 'szam', s.szam, 'db', s.db,
                 'van_tomb_nelkuli', s.tn, 'van_tombos', s.tb))
          FROM (SELECT sorozat, szam, count(*) AS db,
                       bool_or(tomb_id IS NULL) AS tn, bool_or(tomb_id IS NOT NULL) AS tb
                FROM public.oblio_szamlak WHERE tipus = 'chitanta_papir'
                GROUP BY sorozat, szam
                HAVING count(*) > 1 OR (bool_or(tomb_id IS NULL) AND bool_or(tomb_id IS NOT NULL))) s)

  UNION ALL
  -- D09) Nyitó-egyenleg táblák léte (to_regclass: nem hibázik, ha hiányzik)
  SELECT 'D09_nyito_tablak_lete',
         jsonb_build_object(
           'bankszamla_nyito_egyenleg', (to_regclass('public.bankszamla_nyito_egyenleg') IS NOT NULL),
           'keszpenz_nyito_egyenleg',   (to_regclass('public.keszpenz_nyito_egyenleg') IS NOT NULL))

  UNION ALL
  -- D10) Rögzített BANK-nyitók évenként (a kassza-táblát külön kérjük, ha a D09 szerint létezik)
  SELECT 'D10_bank_nyitok',
         (SELECT jsonb_agg(jsonb_build_object('ev', s.eve, 'forras', s.forrasa, 'db', s.db, 'ossz_ron', s.ossz))
          FROM (SELECT eve, forrasa, count(*) AS db, sum(nyito_egyenleg_ron) AS ossz
                FROM public.bankszamla_nyito_egyenleg GROUP BY eve, forrasa) s)

  UNION ALL
  -- D10b) Legacy nem-nulla nyitók (bankszamlak + bealitas halott oszlopok)
  SELECT 'D10b_legacy_nyitok',
         jsonb_build_object(
           'bankszamlak', (SELECT jsonb_agg(jsonb_build_object('id', id, 'bank', bank_neve, 'valuta', valuta, 'nyito', nyito_egyenleg))
                           FROM public.bankszamlak WHERE COALESCE(nyito_egyenleg,0) <> 0),
           'bealitas',    (SELECT jsonb_agg(jsonb_build_object('cong', congregation_id, 'ev', id, 'nyito_keszpenz', nyito_keszpenz, 'nyito_bank', nyito_bank))
                           FROM public.bealitas WHERE COALESCE(nyito_keszpenz,0) <> 0 OR COALESCE(nyito_bank,0) <> 0))

) d
ORDER BY blokk;

-- ============================================================================
-- HA a D09 szerint a keszpenz_nyito_egyenleg tábla LÉTEZIK, futtasd KÜLÖN ezt is:
-- SELECT eve, forrasa, count(*) AS db, sum(nyito_egyenleg) AS ossz
-- FROM public.keszpenz_nyito_egyenleg GROUP BY eve, forrasa ORDER BY eve;
-- ============================================================================
