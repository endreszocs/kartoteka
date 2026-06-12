-- ============================================================================
-- 2026-06-12a — DIAGNOSZTIKA: melyik oszlop varchar(20)?
-- ============================================================================
-- A desktop tétel-rögzítés hibája: „value too long for type character
-- varying(20)" — a séma-dumpban nincs ilyen oszlop, az éles DB-ben viszont
-- van. Ez a lekérdezés kilistázza az ÖSSZES legfeljebb 30 karakteres
-- varchar-oszlopot a public sémában (tábla + oszlop + pontos limit),
-- a pénzügy-közeli táblákat elöl.
-- ============================================================================
SELECT
  c.table_name,
  c.column_name,
  c.character_maximum_length AS max_hossz,
  CASE WHEN c.table_name IN
    ('befizetes','kiadas','belsomozgas','iratszam_wallet','chitanta_tombok',
     'oblio_szamlak','bankszamlak','szemely','csalad')
    THEN 1 ELSE 2 END AS prioritas
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.data_type = 'character varying'
  AND c.character_maximum_length IS NOT NULL
  AND c.character_maximum_length <= 30
ORDER BY prioritas, c.character_maximum_length, c.table_name, c.column_name;
