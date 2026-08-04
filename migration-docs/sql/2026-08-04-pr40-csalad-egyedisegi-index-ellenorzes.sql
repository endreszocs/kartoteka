-- ============================================================================
-- PR-40 — ELLENŐRZŐ lekérdezés (csak OLVAS, semmit nem módosít)
-- 2026-08-04
--
-- MIÉRT: a „duplicate key value violates unique constraint csalad_id_ferf_no_idx"
-- hiba akkor jön elő, ha a szülő-párosnak MÁR VAN kartonja — akár LEZÁRT
-- (isaktiv = false) is. Az alkalmazás mostantól újranyitja a lezárt kartont,
-- de a viselkedés finomításához tudni kell, hogy az egyediség
--   (a) a PÁROSRA vonatkozik-e: (id_ferfi, id_no)   → egy férfi több nővel is
--       lehet külön kartonon, csak ugyanazzal a nővel nem kétszer;
--   (b) vagy SZEMÉLYENKÉNT: külön index id_ferfi-re és id_no-ra → egy személy
--       ÖSSZESEN egy kartonon lehet házastárs.
--
-- HASZNÁLAT: másold be a Supabase SQL Editorba és futtasd. Az eredményt
-- (mindkét táblázatot) küldd vissza.
-- ============================================================================

-- 1) A csalad tábla ÖSSZES indexe és megszorítása
SELECT
  i.relname                                   AS index_neve,
  pg_get_indexdef(ix.indexrelid)              AS index_definicio,
  ix.indisunique                              AS egyedi_e,
  ix.indpred IS NOT NULL                      AS van_e_szures  -- pl. WHERE isaktiv
FROM pg_index ix
JOIN pg_class  i ON i.oid = ix.indexrelid
JOIN pg_class  t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'csalad'
ORDER BY ix.indisunique DESC, i.relname;

-- 2) Hány LEZÁRT karton van, amely blokkolhat új rögzítést?
--    (tájékoztató szám — ennyi esetben nyithat újra a rendszer kartont)
SELECT
  COUNT(*) FILTER (WHERE isaktiv = false)                             AS lezart_karton,
  COUNT(*) FILTER (WHERE isaktiv = false AND id_ferfi IS NOT NULL
                     AND id_no IS NOT NULL)                           AS lezart_teljes_paros,
  COUNT(*) FILTER (WHERE isaktiv = false AND (id_ferfi IS NULL
                     OR id_no IS NULL))                               AS lezart_fel_karton,
  COUNT(*) FILTER (WHERE isaktiv = true)                              AS aktiv_karton
FROM public.csalad;
