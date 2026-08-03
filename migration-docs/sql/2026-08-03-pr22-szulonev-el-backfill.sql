-- ============================================================================
-- PR-22 (2026-08-03) — SZÜLŐNÉV → SZÜLŐ-GYEREK ÉL BACKFILL (egyszeri)
--
-- Háttér (user-észrevétel): a családfa nem mutatja a szülők szüleit, pedig a
-- személyi kartonon ott az „Édesapa/Édesanya" név. Ok: a régi importból jött
-- tagok szülő-NÉVMEZŐIBŐL sosem készült rokonsági él (szemely_kapcsolat) —
-- a PR-20-as automatika csak tag-mentéskor, névváltozásnál fut.
--
-- MIT CSINÁL:
--   1. ÚJRANYITJA a korábban család-szerkesztéssel lezárt szülő-gyerek élt,
--      ha a gyermek kartonjának névmezője igazolja (tartós 'szulonev-egyezes'
--      jelöléssel — ezt a rendszer soha nem zárja le automatikusan).
--   2. LÉTREHOZZA a hiányzó szülő-gyerek éleket a névmezőkből, SZIGORÚ
--      biztonsági szabályokkal:
--        - pontosan EGY névre illő jelölt a gyülekezetben (normalizált név:
--          kisbetű, ifj./id./özv./dr. előtag és kötőjel/pont nem számít),
--        - helyes nem (apa=férfi, anya=nő), önmagára sosem illik,
--        - kor-ésszerűség: a szülő 15–70 évvel idősebb a gyermeknél,
--        - NEM hoz létre „két édesapa/édesanya" helyzetet (ha már van másik
--          aktív azonos nemű szülő-él, kihagyja),
--        - többes/nulla találat → kihagyja és a riportban jelzi.
--   3. RIPORT: létrejött élek száma + a kihagyott (többértelmű) esetek listája.
--
-- A Teszt gyülekezet klón-tagjait is feldolgozza (saját klón-szüleikre) — ez
-- ártalmatlan, a teardown úgyis eltünteti.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl egyben. Idempotens.
-- ============================================================================

-- Név-normalizáló (csak erre a munkamenetre él)
CREATE OR REPLACE FUNCTION pg_temp.nkey(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(LOWER(COALESCE(t, '')), '^\s*(ifjabb|ifj|idős|idos|id|özv|ozv|dr)\.?\s+', ''),
           '[^a-z0-9áéíóöőúüűâîășț]+', '', 'g')
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Lezárt, de a kartonon igazolt szülő-élek újranyitása
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.szemely_kapcsolat k
SET ervenyes_ig = NULL, megjegyzes = 'szulonev-egyezes'
WHERE k.id IN (
  SELECT DISTINCT ON (k2.id_szemely_1, k2.id_szemely_2) k2.id
  FROM public.szemely_kapcsolat k2
  JOIN public.szemely p ON p.id = k2.id_szemely_1
  JOIN public.szemely ch ON ch.id = k2.id_szemely_2
  WHERE k2.tipus = 'szulo_gyermek'
    AND k2.ervenyes_ig IS NOT NULL
    AND k2.megjegyzes = 'csalad-szerkesztes-eltavolitas'
    AND p.ferfi IS NOT NULL
    AND pg_temp.nkey(CASE WHEN p.ferfi THEN ch.apjaneve ELSE ch.anyjaneve END) <> ''
    AND pg_temp.nkey(COALESCE(p.csaladnev, '') || ' ' || COALESCE(p.k_nev, '')) =
        pg_temp.nkey(CASE WHEN p.ferfi THEN ch.apjaneve ELSE ch.anyjaneve END)
    AND NOT EXISTS (   -- aktív ikre már van → nem kell újranyitni
      SELECT 1 FROM public.szemely_kapcsolat a
      WHERE a.tipus = 'szulo_gyermek' AND a.ervenyes_ig IS NULL
        AND a.id_szemely_1 = k2.id_szemely_1 AND a.id_szemely_2 = k2.id_szemely_2
    )
    AND NOT EXISTS (   -- MÁSIK aktív azonos nemű szülő-él → nem nyitunk kettőt
      SELECT 1 FROM public.szemely_kapcsolat a
      JOIN public.szemely pp ON pp.id = a.id_szemely_1 AND pp.ferfi = p.ferfi
      WHERE a.tipus = 'szulo_gyermek' AND a.ervenyes_ig IS NULL
        AND a.id_szemely_2 = k2.id_szemely_2
        AND a.id_szemely_1 <> k2.id_szemely_1
    )
  ORDER BY k2.id_szemely_1, k2.id_szemely_2, k2.id
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2/a) Hiányzó APA-élek a névmezőből (pontosan egy jelölt + kor-ésszerűség)
-- ────────────────────────────────────────────────────────────────────────────
WITH kand AS (
  SELECT ch.id AS child_id, ch.congregation_id, p.id AS parent_id,
         COUNT(*) OVER (PARTITION BY ch.id) AS db
  FROM public.szemely ch
  JOIN public.szemely p
    ON p.congregation_id = ch.congregation_id
   AND p.id <> ch.id
   AND p.ferfi = true
   AND p.sz_datum IS NOT NULL
   AND pg_temp.nkey(COALESCE(p.csaladnev, '') || ' ' || COALESCE(p.k_nev, '')) = pg_temp.nkey(ch.apjaneve)
   AND (EXTRACT(YEAR FROM ch.sz_datum)::int - EXTRACT(YEAR FROM p.sz_datum)::int) BETWEEN 15 AND 70
  WHERE COALESCE(TRIM(ch.apjaneve), '') <> ''
    AND ch.sz_datum IS NOT NULL
)
INSERT INTO public.szemely_kapcsolat
  (id_szemely_1, id_szemely_2, tipus, ver_szerinti, congregation_id, megjegyzes)
SELECT k.parent_id, k.child_id, 'szulo_gyermek', true, k.congregation_id, 'szulonev-egyezes'
FROM kand k
WHERE k.db = 1
  AND NOT EXISTS (   -- bármilyen (aktív VAGY tudatosan lezárt) él ezzel a párral
    SELECT 1 FROM public.szemely_kapcsolat e
    WHERE e.tipus = 'szulo_gyermek'
      AND e.id_szemely_1 = k.parent_id AND e.id_szemely_2 = k.child_id
  )
  AND NOT EXISTS (   -- már van MÁSIK aktív apa-él → nem csinálunk két édesapát
    SELECT 1 FROM public.szemely_kapcsolat e
    JOIN public.szemely pp ON pp.id = e.id_szemely_1 AND pp.ferfi = true
    WHERE e.tipus = 'szulo_gyermek' AND e.ervenyes_ig IS NULL
      AND e.id_szemely_2 = k.child_id
  )
ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2/b) Hiányzó ANYA-élek a névmezőből (ugyanazok a szabályok)
-- ────────────────────────────────────────────────────────────────────────────
WITH kand AS (
  SELECT ch.id AS child_id, ch.congregation_id, p.id AS parent_id,
         COUNT(*) OVER (PARTITION BY ch.id) AS db
  FROM public.szemely ch
  JOIN public.szemely p
    ON p.congregation_id = ch.congregation_id
   AND p.id <> ch.id
   AND p.ferfi = false
   AND p.sz_datum IS NOT NULL
   AND pg_temp.nkey(COALESCE(p.csaladnev, '') || ' ' || COALESCE(p.k_nev, '')) = pg_temp.nkey(ch.anyjaneve)
   AND (EXTRACT(YEAR FROM ch.sz_datum)::int - EXTRACT(YEAR FROM p.sz_datum)::int) BETWEEN 15 AND 70
  WHERE COALESCE(TRIM(ch.anyjaneve), '') <> ''
    AND ch.sz_datum IS NOT NULL
)
INSERT INTO public.szemely_kapcsolat
  (id_szemely_1, id_szemely_2, tipus, ver_szerinti, congregation_id, megjegyzes)
SELECT k.parent_id, k.child_id, 'szulo_gyermek', true, k.congregation_id, 'szulonev-egyezes'
FROM kand k
WHERE k.db = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.szemely_kapcsolat e
    WHERE e.tipus = 'szulo_gyermek'
      AND e.id_szemely_1 = k.parent_id AND e.id_szemely_2 = k.child_id
  )
  AND NOT EXISTS (   -- már van MÁSIK aktív anya-él
    SELECT 1 FROM public.szemely_kapcsolat e
    JOIN public.szemely pp ON pp.id = e.id_szemely_1 AND pp.ferfi = false
    WHERE e.tipus = 'szulo_gyermek' AND e.ervenyes_ig IS NULL
      AND e.id_szemely_2 = k.child_id
  )
ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RIPORT (ez az egy tábla jelenik meg)
-- ────────────────────────────────────────────────────────────────────────────
WITH apa_kand AS (
  SELECT ch.id AS child_id, ch.csaladnev || ' ' || ch.k_nev AS child_nev,
         ch.apjaneve AS szulo_nev, COUNT(p.id) AS db
  FROM public.szemely ch
  LEFT JOIN public.szemely p
    ON p.congregation_id = ch.congregation_id
   AND p.id <> ch.id AND p.ferfi = true AND p.sz_datum IS NOT NULL
   AND pg_temp.nkey(COALESCE(p.csaladnev, '') || ' ' || COALESCE(p.k_nev, '')) = pg_temp.nkey(ch.apjaneve)
   AND (EXTRACT(YEAR FROM ch.sz_datum)::int - EXTRACT(YEAR FROM p.sz_datum)::int) BETWEEN 15 AND 70
  WHERE COALESCE(TRIM(ch.apjaneve), '') <> '' AND ch.sz_datum IS NOT NULL
  GROUP BY ch.id, ch.csaladnev, ch.k_nev, ch.apjaneve
),
anya_kand AS (
  SELECT ch.id AS child_id, ch.csaladnev || ' ' || ch.k_nev AS child_nev,
         ch.anyjaneve AS szulo_nev, COUNT(p.id) AS db
  FROM public.szemely ch
  LEFT JOIN public.szemely p
    ON p.congregation_id = ch.congregation_id
   AND p.id <> ch.id AND p.ferfi = false AND p.sz_datum IS NOT NULL
   AND pg_temp.nkey(COALESCE(p.csaladnev, '') || ' ' || COALESCE(p.k_nev, '')) = pg_temp.nkey(ch.anyjaneve)
   AND (EXTRACT(YEAR FROM ch.sz_datum)::int - EXTRACT(YEAR FROM p.sz_datum)::int) BETWEEN 15 AND 70
  WHERE COALESCE(TRIM(ch.anyjaneve), '') <> '' AND ch.sz_datum IS NOT NULL
  GROUP BY ch.id, ch.csaladnev, ch.k_nev, ch.anyjaneve
)
SELECT 'aktiv szulonev-egyezes elek OSSZESEN' AS sor,
       COUNT(*)::text AS ertek
FROM public.szemely_kapcsolat
WHERE tipus = 'szulo_gyermek' AND ervenyes_ig IS NULL AND megjegyzes = 'szulonev-egyezes'

UNION ALL
SELECT 'nevmezos, de JELOLT NELKULI apa-nev (info)', COUNT(*)::text
FROM apa_kand WHERE db = 0
UNION ALL
SELECT 'nevmezos, de JELOLT NELKULI anya-nev (info)', COUNT(*)::text
FROM anya_kand WHERE db = 0

UNION ALL
SELECT 'TOBBERTELMU apa-nev (kihagyva): ' || child_nev || ' (#' || child_id::text || ')',
       'apjaneve: "' || szulo_nev || '" — ' || db::text || ' jelolt'
FROM apa_kand WHERE db > 1
UNION ALL
SELECT 'TOBBERTELMU anya-nev (kihagyva): ' || child_nev || ' (#' || child_id::text || ')',
       'anyjaneve: "' || szulo_nev || '" — ' || db::text || ' jelolt'
FROM anya_kand WHERE db > 1

UNION ALL
SELECT 'ELLENORZES — ifj. Szocs Gabor (#884) aktiv szulo-elei (elvart: 2)',
       COUNT(*)::text
FROM public.szemely_kapcsolat
WHERE tipus = 'szulo_gyermek' AND ervenyes_ig IS NULL AND id_szemely_2 = 884;
