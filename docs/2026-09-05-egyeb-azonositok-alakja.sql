-- ═══════════════════════════════════════════════════════════════════════════
--  MILYEN ALAKÚ AZ A 48 „EGYÉB" AZONOSÍTÓ?
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor), EGYBEN
--
--  MIÉRT KELL: az előző felmérés szerint a 661 személyből
--     613 · EC-ÉÉÉÉ-…  (import-generált)
--       0 · 999 + 7 jegy (webes generált)
--       0 · 13 jegyű (valódi CNP alakú)
--      48 · EGYÉB  ← ez az, amiről semmit nem tudunk
--
--  Ez azért fontos, mert a felület mostantól ÉRTÉK-FÜGGŐEN dönt: a
--  bizonyítottan generált alakot „Egyházi azonosító"-ként, csupaszon mutatja,
--  MINDEN MÁST viszont személyes adatnak vesz és maszkol (fail-safe irány).
--  Ha ez a 48 valójában szintén generált kód, akkor 48 emberen fölöslegesen
--  jelenik meg a „személyes adatnak tűnő érték" megjegyzés — ezt egyetlen
--  mintával orvosolni tudom, de előbb LÁTNOM kell, mi az.
--
--  ⚠️ EZ NEM ADJA KI AZ ÉRTÉKEKET. Csak az ALAKJUKAT: minden számjegy 9-re,
--     minden betű A-ra cserélve. „EC-2026-999YQWMWU7" → „AA-9999-999AAAAAAA".
--     Így akkor sem szivárog személyes adat, ha valamelyik mégis valódi szám.
--
--  ⚠️ CSAK OLVAS.
-- ═══════════════════════════════════════════════════════════════════════════

WITH egyeb AS (
  SELECT
    s.id,
    s.cnp,
    s.isvisible,
    -- Az ALAK: számjegy → 9, betű (ékezetes is) → A. Minden más marad.
    regexp_replace(
      regexp_replace(s.cnp, '[0-9]', '9', 'g'),
      '[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]', 'A', 'g'
    ) AS alak
  FROM public.szemely s
  WHERE s.cnp IS NOT NULL
    AND btrim(s.cnp) <> ''
    AND s.cnp !~ '^EC-[0-9]{4}-'
    AND s.cnp !~ '^999[0-9]{7}$'
    AND s.cnp !~ '^[0-9]{13}$'
),
-- Kikre hivatkoznak szülőként?
hivatkozott AS (
  SELECT DISTINCT cnp FROM (
    SELECT id_apja AS cnp FROM public.szemely WHERE id_apja IS NOT NULL
    UNION ALL
    SELECT id_anyja FROM public.szemely WHERE id_anyja IS NOT NULL
  ) x
)

SELECT '1 · alak: ' || e.alak AS kulcs,
       count(*)::text || ' db  (hossz: ' || min(length(e.cnp))::text ||
         CASE WHEN min(length(e.cnp)) <> max(length(e.cnp))
              THEN '–' || max(length(e.cnp))::text ELSE '' END || ')' AS ertek
FROM egyeb e
GROUP BY e.alak

UNION ALL
SELECT '2 · ebből IMPORT- előtagú', count(*)::text
FROM egyeb WHERE cnp ILIKE 'IMPORT-%'

UNION ALL
SELECT '3 · ebből rejtett sor (isvisible = false)', count(*)::text
FROM egyeb WHERE isvisible IS DISTINCT FROM true

UNION ALL
SELECT '4 · ebből szülőként hivatkozott', count(*)::text
FROM egyeb e WHERE e.cnp IN (SELECT cnp FROM hivatkozott)

UNION ALL
SELECT '5 · tartalmaz-e szóközt / ékezetet (névre gyanús)',
       count(*)::text
FROM egyeb WHERE cnp ~ '[[:space:]]' OR cnp ~ '[ÁÉÍÓÖŐÚÜŰáéíóöőúüű]'

UNION ALL
-- A 6. és 7. arra a kérdésre válaszol, amire az előző felmérés NEM tért ki:
-- a TÖRLÉSI szabály, és hogy a rejtett sorokon van-e 13 jegyű érték.
SELECT '6 · az id_apja/id_anyja FK TÖRLÉSI szabálya',
       COALESCE((SELECT string_agg(c.conname || ': ' ||
                        CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE'
                                           WHEN 'n' THEN 'SET NULL'  WHEN 'r' THEN 'RESTRICT'
                                           WHEN 'd' THEN 'SET DEFAULT' ELSE c.confdeltype::text END, ' | ')
                 FROM pg_constraint c
                 WHERE c.conrelid = 'public.szemely'::regclass
                   AND c.contype = 'f'
                   AND c.conname IN ('szemely_id_apja_fk','szemely_id_anyja_fk')), '⛔ nem találom')

UNION ALL
SELECT '7 · 13 jegyű cnp REJTETT sorokon is (a korábbi mérés ezt nem bontotta)',
       (SELECT count(*)::text FROM public.szemely
        WHERE cnp ~ '^[0-9]{13}$' AND isvisible IS DISTINCT FROM true)

UNION ALL
SELECT '8 · a szemely_cnp_idx tényleg GLOBÁLIS és egyedi-e',
       COALESCE((SELECT CASE WHEN x.indisunique AND x.indpred IS NULL
                             THEN '✅ egyedi, feltétel nélküli'
                             ELSE '⚠️ egyedi: ' || x.indisunique::text ||
                                  ', részleges: ' || (x.indpred IS NOT NULL)::text END
                 FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
                 WHERE i.relname = 'szemely_cnp_idx'), '⛔ nincs ilyen index')

ORDER BY 1;
