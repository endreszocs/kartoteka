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
--      jelöléssel — ezt a rendszer minden család-írásnál újraértékeli, és ha
--      a névmező már nem igazolja, lezárja).
--   2. LÉTREHOZZA a hiányzó szülő-gyerek éleket a névmezőkből, SZIGORÚ
--      biztonsági szabályokkal:
--        - pontosan EGY névre illő jelölt a gyülekezetben (normalizált név:
--          kisbetű, láncolt ifj./id./idősb/özv./dr. előtagok és kötőjel/pont
--          nem számít, román cedilla=vessző-ékezet),
--        - anya-ágon a LEÁNYKORI név (szcs_nev) is elfogadott kulcs,
--        - helyes nem (apa=férfi, anya=nő), önmagára sosem illik,
--        - kor-ésszerűség: a szülő betöltött 15–70 évvel idősebb (AGE()),
--        - NEM hoz létre „két édesapa/édesanya" helyzetet,
--        - többes/nulla találat → kihagyja és a riportban jelzi.
--   3. RIPORT: összesítés + a kihagyott (többértelmű) esetek listája.
--
-- ISMERT KORLÁT (név-egyeztetés természete): ha a valódi szülő NINCS a
-- nyilvántartásban, de él egy azonos nevű rokon (pl. a nagyapa, akiről a
-- gyermek apja a nevét kapta), a név rá illik — a kor-ésszerűség és az
-- egy-jelölt-szabály a legtöbb ilyet kiszűri, a többit a családfa
-- kereszthiba-sávja jelzi. A Teszt gyülekezet klón-tagjait is feldolgozza
-- (saját klón-szüleikre) — ártalmatlan, a teardown úgyis eltünteti.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl egyben. Idempotens (újra
-- futtatható — pl. ha a névmezőket időközben javítottad).
-- ============================================================================

-- Név-normalizáló (csak erre a munkamenetre él): NFC-kisbetű + cedilla-csere,
-- LÁNCOLT nemzedék-előtagok levágása (ponttal vagy szóközzel), majd minden
-- nem betű/szám karakter eldobása.
CREATE OR REPLACE FUNCTION pg_temp.nkey(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             translate(LOWER(COALESCE(t, '')), 'şţ', 'șț'),
             '^\s*((ifjabb|ifj|idősb|idős|idos|id|özv|ozv|dr)(\.\s*|\s+))+', ''),
           '[^a-z0-9áéíóöőúüűâîășț]+', '', 'g')
$$;

-- Szülő-név illesztő: apa-ágon családnév+keresztnév; anya-ágon a leánykori
-- (szcs_nev) VAGY a viselt (csaladnev) név is illik — ha mindkettő más-más
-- személyre illene, az egy-jelölt-szabály (jeloltek=1 / db=1) kiszűri.
CREATE OR REPLACE FUNCTION pg_temp.szulo_illik(
  p_csaladnev text, p_k_nev text, p_szcs_nev text, p_ferfi boolean,
  p_apjaneve text, p_anyjaneve text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_ferfi THEN
      pg_temp.nkey(p_apjaneve) <> ''
      AND pg_temp.nkey(COALESCE(p_csaladnev, '') || ' ' || COALESCE(p_k_nev, '')) = pg_temp.nkey(p_apjaneve)
    ELSE
      pg_temp.nkey(p_anyjaneve) <> ''
      AND (
        pg_temp.nkey(COALESCE(p_csaladnev, '') || ' ' || COALESCE(p_k_nev, '')) = pg_temp.nkey(p_anyjaneve)
        OR (pg_temp.nkey(COALESCE(p_szcs_nev, '')) <> ''
            AND pg_temp.nkey(COALESCE(p_szcs_nev, '') || ' ' || COALESCE(p_k_nev, '')) = pg_temp.nkey(p_anyjaneve))
      )
  END
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Lezárt, de a kartonon igazolt szülő-élek újranyitása
--    (gyermekenként és nemenként CSAK ha pontosan EGY jelölt van — két
--    egyszerre újranyíló azonos nemű szülő-él nem jöhet létre)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.szemely_kapcsolat k
SET ervenyes_ig = NULL, megjegyzes = 'szulonev-egyezes'
WHERE k.id IN (
  SELECT szamolt.id FROM (
    SELECT dedup.id,
           COUNT(*) OVER (PARTITION BY dedup.child_id, dedup.parent_ferfi) AS jeloltek
    FROM (
      SELECT DISTINCT ON (k2.id_szemely_1, k2.id_szemely_2)
             k2.id, k2.id_szemely_2 AS child_id, p.ferfi AS parent_ferfi
      FROM public.szemely_kapcsolat k2
      JOIN public.szemely p ON p.id = k2.id_szemely_1
      JOIN public.szemely ch ON ch.id = k2.id_szemely_2
      WHERE k2.tipus = 'szulo_gyermek'
        AND k2.ervenyes_ig IS NOT NULL
        AND k2.megjegyzes = 'csalad-szerkesztes-eltavolitas'
        AND p.ferfi IS NOT NULL
        AND pg_temp.szulo_illik(p.csaladnev, p.k_nev, p.szcs_nev, p.ferfi, ch.apjaneve, ch.anyjaneve)
        AND NOT EXISTS (   -- aktív ikre már van → nem kell újranyitni
          SELECT 1 FROM public.szemely_kapcsolat a
          WHERE a.tipus = 'szulo_gyermek' AND a.ervenyes_ig IS NULL
            AND a.id_szemely_1 = k2.id_szemely_1 AND a.id_szemely_2 = k2.id_szemely_2
        )
        AND NOT EXISTS (   -- MÁSIK aktív azonos nemű szülő-él → nem nyitunk másodikat
          SELECT 1 FROM public.szemely_kapcsolat a
          JOIN public.szemely pp ON pp.id = a.id_szemely_1 AND pp.ferfi = p.ferfi
          WHERE a.tipus = 'szulo_gyermek' AND a.ervenyes_ig IS NULL
            AND a.id_szemely_2 = k2.id_szemely_2
            AND a.id_szemely_1 <> k2.id_szemely_1
        )
      ORDER BY k2.id_szemely_1, k2.id_szemely_2, k2.id
    ) dedup
  ) szamolt
  WHERE szamolt.jeloltek = 1
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
   AND pg_temp.szulo_illik(p.csaladnev, p.k_nev, p.szcs_nev, true, ch.apjaneve, NULL)
   AND EXTRACT(YEAR FROM AGE(ch.sz_datum, p.sz_datum))::int BETWEEN 15 AND 70
  WHERE pg_temp.nkey(ch.apjaneve) <> ''
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
-- 2/b) Hiányzó ANYA-élek a névmezőből (leánykori név is; ugyanazok a szabályok)
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
   AND pg_temp.szulo_illik(p.csaladnev, p.k_nev, p.szcs_nev, false, NULL, ch.anyjaneve)
   AND EXTRACT(YEAR FROM AGE(ch.sz_datum, p.sz_datum))::int BETWEEN 15 AND 70
  WHERE pg_temp.nkey(ch.anyjaneve) <> ''
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
  SELECT ch.id AS child_id,
         TRIM(COALESCE(ch.csaladnev, '') || ' ' || COALESCE(ch.k_nev, '')) AS child_nev,
         ch.apjaneve AS szulo_nev, COUNT(p.id) AS db
  FROM public.szemely ch
  LEFT JOIN public.szemely p
    ON p.congregation_id = ch.congregation_id
   AND p.id <> ch.id AND p.ferfi = true AND p.sz_datum IS NOT NULL
   AND pg_temp.szulo_illik(p.csaladnev, p.k_nev, p.szcs_nev, true, ch.apjaneve, NULL)
   AND EXTRACT(YEAR FROM AGE(ch.sz_datum, p.sz_datum))::int BETWEEN 15 AND 70
  WHERE pg_temp.nkey(ch.apjaneve) <> '' AND ch.sz_datum IS NOT NULL
  GROUP BY ch.id, ch.csaladnev, ch.k_nev, ch.apjaneve
),
anya_kand AS (
  SELECT ch.id AS child_id,
         TRIM(COALESCE(ch.csaladnev, '') || ' ' || COALESCE(ch.k_nev, '')) AS child_nev,
         ch.anyjaneve AS szulo_nev, COUNT(p.id) AS db
  FROM public.szemely ch
  LEFT JOIN public.szemely p
    ON p.congregation_id = ch.congregation_id
   AND p.id <> ch.id AND p.ferfi = false AND p.sz_datum IS NOT NULL
   AND pg_temp.szulo_illik(p.csaladnev, p.k_nev, p.szcs_nev, false, NULL, ch.anyjaneve)
   AND EXTRACT(YEAR FROM AGE(ch.sz_datum, p.sz_datum))::int BETWEEN 15 AND 70
  WHERE pg_temp.nkey(ch.anyjaneve) <> '' AND ch.sz_datum IS NOT NULL
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
