-- ═══════════════════════════════════════════════════════════════════════════
--  MI VAN MA A `szemely.cnp` MEZŐBEN? — állapotfelmérés
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor), EGYBEN
--
--  MIÉRT KELL: Endre észrevétele szerint a kartotékán látszó „Személyi szám
--  (CNP)" valójában a rendszer által generált azonosító. A mező viszont
--  HÁROMFÉLE dolgot tárolhat, és ma nem tudjuk, melyikből mennyi van:
--     · `EC-ÉÉÉÉ-XXXXXXXXXX`  — a generate_egyhazi_cnp() (import-út),
--     · `999` + 7 számjegy    — a webes generateCnp() (kézi felvitel),
--     · valódi 13 jegyű CNP   — a DESKTOP új-tag űrlapja EZT követeli meg.
--
--  A javítás MÉRETE ettől függ. Ha valódi CNP alig van a `cnp`-ben, nincs mit
--  átvezetni; ha sok, akkor van — de a 3. rács megmondja, mennyire kockázatos.
--
--  ⚠️ EZ CSAK OLVAS. Semmit nem ír, nem módosít.
--
--  ⚠️ A Supabase SQL editor CSAK az UTOLSÓ rácsot mutatja — ezért az egész
--     EGYETLEN lekérdezés, UNION ALL-lal összefűzve.
-- ═══════════════════════════════════════════════════════════════════════════

WITH alak AS (
  SELECT
    s.id,
    s.cnp,
    s.congregation_id,
    CASE
      WHEN s.cnp IS NULL OR btrim(s.cnp) = ''       THEN 'üres'
      WHEN s.cnp ~ '^EC-[0-9]{4}-'                  THEN 'EC- (import-generált)'
      WHEN s.cnp ~ '^999[0-9]{7}$'                  THEN '999+7 (webes generált)'
      WHEN s.cnp ~ '^[1-8][0-9]{12}$'               THEN 'valódi CNP alakú (13 jegy)'
      WHEN s.cnp ~ '^[0-9]{13}$'                    THEN '13 jegy, de rossz kezdőjegy'
      ELSE 'egyéb'
    END AS fajta
  FROM public.szemely s
),
-- Hány gyermek hivatkozik szülőként EGY-EGY cnp értékre? (Ez az id_apja /
-- id_anyja idegen kulcs a szemely(cnp)-re — ON UPDATE CASCADE NÉLKÜL, tehát
-- egy hivatkozott érték átírása 23503-mal elbukna.)
hivatkozott AS (
  SELECT cnp FROM (
    SELECT id_apja AS cnp FROM public.szemely WHERE id_apja IS NOT NULL
    UNION ALL
    SELECT id_anyja FROM public.szemely WHERE id_anyja IS NOT NULL
  ) x
),
-- Ugyanaz a szám két KÜLÖN emberhez egy gyülekezeten belül.
dupla AS (
  SELECT congregation_id, cnp, count(*) AS db
  FROM public.szemely
  WHERE cnp IS NOT NULL AND btrim(cnp) <> ''
  GROUP BY 1, 2
  HAVING count(*) > 1
),
-- Ugyanaz a szám TÖBB gyülekezetben (kereszt-gyülekezeti azonosság).
tobb_gyulekezet AS (
  SELECT cnp, count(DISTINCT congregation_id) AS gyulekezetek
  FROM public.szemely
  WHERE cnp IS NOT NULL AND btrim(cnp) <> ''
  GROUP BY 1
  HAVING count(DISTINCT congregation_id) > 1
)

SELECT '1 · ' || fajta AS kulcs, count(*)::text AS ertek
FROM alak GROUP BY fajta

UNION ALL
SELECT '2 · szülőként hivatkozott cnp-értékek (egyedi)', count(DISTINCT cnp)::text FROM hivatkozott

UNION ALL
SELECT '2b · ebből VALÓDI CNP alakú (ezek átírása bukna)',
       count(DISTINCT h.cnp)::text
FROM hivatkozott h
WHERE h.cnp ~ '^[0-9]{13}$'

UNION ALL
SELECT '3 · ugyanaz a cnp KÉT emberen, egy gyülekezetben', COALESCE(count(*)::text, '0') FROM dupla

UNION ALL
SELECT '3b · érintett cnp-k (minta, max 5)',
       COALESCE((SELECT string_agg(left(cnp, 4) || '…', ', ')
                 FROM (SELECT cnp FROM dupla LIMIT 5) d), '—')

UNION ALL
SELECT '4 · ugyanaz a cnp TÖBB gyülekezetben', COALESCE(count(*)::text, '0') FROM tobb_gyulekezet

UNION ALL
SELECT '5 · a cnp oszlop TÉNYLEGES típusa',
       COALESCE((SELECT data_type || COALESCE(' (' || character_maximum_length || ')', '')
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='szemely' AND column_name='cnp'), '⛔ nincs ilyen oszlop')

UNION ALL
SELECT '6 · az id_apja/id_anyja idegen kulcs UPDATE-szabálya',
       COALESCE((SELECT string_agg(c.conname || ': ' ||
                        CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE'
                                           WHEN 'n' THEN 'SET NULL'  WHEN 'r' THEN 'RESTRICT'
                                           WHEN 'd' THEN 'SET DEFAULT' ELSE c.confupdtype::text END, ' | ')
                 FROM pg_constraint c
                 WHERE c.conrelid = 'public.szemely'::regclass
                   AND c.contype = 'f'
                   AND c.conname IN ('szemely_id_apja_fk','szemely_id_anyja_fk')), '⛔ nem találom a két FK-t')

UNION ALL
SELECT '7 · van-e GLOBÁLIS egyediség a cnp-n',
       COALESCE((SELECT string_agg(i.relname, ', ')
                 FROM pg_index x
                 JOIN pg_class i ON i.oid = x.indexrelid
                 WHERE x.indrelid = 'public.szemely'::regclass
                   AND x.indisunique
                   AND x.indpred IS NULL
                   AND (SELECT count(*) FROM unnest(x.indkey) k WHERE k <> 0) = 1
                   AND EXISTS (SELECT 1 FROM pg_attribute a
                               WHERE a.attrelid = x.indrelid AND a.attnum = x.indkey[0]
                                 AND a.attname = 'cnp')), 'nincs (csak részleges indexek)')

UNION ALL
SELECT '8 · létezik-e már a szemelyi_szam tábla',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema='public' AND table_name='szemely_szemelyi_szam')
            THEN '✅ igen' ELSE 'még nem (a migráció nem futott)' END

ORDER BY 1;
