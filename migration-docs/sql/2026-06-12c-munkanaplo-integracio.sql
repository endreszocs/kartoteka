-- Kartotéka — Munkanapló-integráció (2026-06-12, Endre #3-4 munkanapló)
-- ============================================================================
-- Cél: az anyakönyv (keresztelés/esketés/temetés/konfirmálás) és a
-- családlátogatás → munkanapló automatikus szinkron DB-oldali előfeltételei.
--
-- HÁTTÉR (a webes audit megállapításai):
--  1. A munkanaplo.jelenlet_osszesen NOT NULL és NINCS default-ja → minden
--     olyan insert, amely nem adta meg (az anyakönyvi + családlátogatási
--     auto-insertek!), NÉMÁN elbukott. A webes kód mostantól mindig megadja,
--     de a default-ot is pótoljuk biztonsági hálónak.
--  2. A webes kód `deleted` oszlopot használ a munkanaplo táblán (lista-szűrés
--     + soft-delete), de az oszlop a friss schema-dump szerint NEM létezik →
--     a Munkanapló oldal lekérdezései hibára futottak. A webes kód mostantól
--     fallback-kel működik az oszlop nélkül is, de a soft-delete (törölt
--     bejegyzés visszaállíthatósága) csak az oszloppal él.
--  3. A keresztseg/hazassag/temetes/konfirmalas/csaladlatogatas táblákban MÁR
--     LÉTEZIK a munkanaplo_id link-oszlop — a kód mostantól tölti. Backfill:
--     a munkanaploba=true jelölésű, de link nélküli régi sorokhoz pótoljuk a
--     munkanapló-bejegyzést (ezek a fenti 1. bug miatt sosem jöttek létre).
--
-- Idempotens: többször futtatható, nem dob hibát és nem duplikál.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. `deleted` oszlop a munkanaplo táblára (soft-delete)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.munkanaplo
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. jelenlet_osszesen default — a NOT NULL oszlop ne buktasson insertet
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.munkanaplo
  ALTER COLUMN jelenlet_osszesen SET DEFAULT 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Index a tipikus lekérdezéshez (gyülekezet + időszak, élő sorok)
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_munkanaplo_cong_idopont_live
  ON public.munkanaplo(congregation_id, idopont DESC)
  WHERE deleted = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. BACKFILL — a régi, "Rögzítés a munkanaplóba" pipával mentett anyakönyvi
--    sorokhoz a hiányzó munkanapló-bejegyzések pótlása + a link beállítása.
--
--    A munkanaplo.id_jellege a forrás-markert kapja (pl. 'keresztseg:123') —
--    a webes szinkron is ezt használja idempotencia-kulcsként.
--
--    Megjegyzés: a konfirmalas táblának NINCS munkanaploba oszlopa (a pipa
--    csak a batch-rögzítés pillanatában él), ezért konfirmáció-backfill nem
--    lehetséges — a jövőbeni rögzítések már linkkel mentődnek.
-- ────────────────────────────────────────────────────────────────────────────

-- 4a. Keresztelések
WITH src AS (
  SELECT k.id, k.datum::date AS idopont, k.alapige, k.lelkeszneve, k.congregation_id,
         btrim(COALESCE(sz.csaladnev, '') || ' ' || COALESCE(sz.k_nev, '')) AS nev
  FROM public.keresztseg k
  JOIN public.szemely sz ON sz.id = k.id_szemely
  WHERE k.munkanaploba = true
    AND k.munkanaplo_id IS NULL
    AND k.congregation_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.munkanaplo m
      WHERE m.id_jellege = 'keresztseg:' || k.id
    )
), ins AS (
  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, id_jellege, cim, alapige, szolgalt,
     jelenlet_osszesen, deleted, congregation_id)
  SELECT s.idopont, 'Keresztelő', 'szolgalat', 'keresztseg:' || s.id,
         'Keresztelés: ' || s.nev, s.alapige, s.lelkeszneve, 0, false, s.congregation_id
  FROM src s
  RETURNING id, id_jellege
)
UPDATE public.keresztseg k
SET munkanaplo_id = i.id
FROM ins i
WHERE 'keresztseg:' || k.id = i.id_jellege;

-- 4b. Temetések
WITH src AS (
  SELECT t.id, t.tdatum::date AS idopont, t.lelkeszneve, t.congregation_id,
         btrim(COALESCE(sz.csaladnev, '') || ' ' || COALESCE(sz.k_nev, '')) AS nev
  FROM public.temetes t
  JOIN public.szemely sz ON sz.id = t.id_szemely
  WHERE t.munkanaploba = true
    AND t.munkanaplo_id IS NULL
    AND t.congregation_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.munkanaplo m
      WHERE m.id_jellege = 'temetes:' || t.id
    )
), ins AS (
  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, id_jellege, cim, szolgalt,
     jelenlet_osszesen, deleted, congregation_id)
  SELECT s.idopont, 'Temetés', 'szolgalat', 'temetes:' || s.id,
         'Temetés: ' || s.nev, s.lelkeszneve, 0, false, s.congregation_id
  FROM src s
  RETURNING id, id_jellege
)
UPDATE public.temetes t
SET munkanaplo_id = i.id
FROM ins i
WHERE 'temetes:' || t.id = i.id_jellege;

-- 4c. Esketések (eddig a kód egyáltalán nem írt munkanaplót házasságkötésnél;
--     a hazassag.munkanaploba oszlop létezik, de a dialógusból eddig mindig
--     false érkezett — ez a blokk a jövőbeli kézi DB-javítások miatt is
--     idempotensen itt marad)
WITH src AS (
  SELECT h.id, h.datum::date AS idopont, h.lelkeszneve, h.congregation_id,
         btrim(COALESCE(f.csaladnev, '') || ' ' || COALESCE(f.k_nev, '')) AS ferj_nev,
         btrim(COALESCE(n.csaladnev, '') || ' ' || COALESCE(n.k_nev, '')) AS feleseg_nev
  FROM public.hazassag h
  JOIN public.szemely f ON f.id = h.id_ferfi
  JOIN public.szemely n ON n.id = h.id_no
  WHERE h.munkanaploba = true
    AND h.munkanaplo_id IS NULL
    AND h.congregation_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.munkanaplo m
      WHERE m.id_jellege = 'hazassag:' || h.id
    )
), ins AS (
  INSERT INTO public.munkanaplo
    (idopont, jellege, kategoria, id_jellege, cim, szolgalt,
     jelenlet_osszesen, deleted, congregation_id)
  SELECT s.idopont, 'Esketés', 'szolgalat', 'hazassag:' || s.id,
         'Esketés: ' || s.ferj_nev || ' és ' || s.feleseg_nev, s.lelkeszneve,
         0, false, s.congregation_id
  FROM src s
  RETURNING id, id_jellege
)
UPDATE public.hazassag h
SET munkanaplo_id = i.id
FROM ins i
WHERE 'hazassag:' || h.id = i.id_jellege;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. ELLENŐRZÉS — futtatás után mindenhol 0 / "OK" várható
-- ────────────────────────────────────────────────────────────────────────────

-- 5a. Az oszlop létezik?
SELECT CASE WHEN COUNT(*) = 1 THEN 'OK — munkanaplo.deleted létezik'
            ELSE 'HIBA — munkanaplo.deleted hiányzik' END AS deleted_oszlop
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'munkanaplo' AND column_name = 'deleted';

-- 5b. jelenlet_osszesen default beállt?
SELECT column_default AS jelenlet_osszesen_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'munkanaplo'
  AND column_name = 'jelenlet_osszesen';

-- 5c. Maradt-e linkeletlen, pipás anyakönyvi sor?
SELECT 'keresztseg' AS tabla, COUNT(*) AS linkeletlen
FROM public.keresztseg WHERE munkanaploba = true AND munkanaplo_id IS NULL AND congregation_id IS NOT NULL
UNION ALL
SELECT 'temetes', COUNT(*)
FROM public.temetes WHERE munkanaploba = true AND munkanaplo_id IS NULL AND congregation_id IS NOT NULL
UNION ALL
SELECT 'hazassag', COUNT(*)
FROM public.hazassag WHERE munkanaploba = true AND munkanaplo_id IS NULL AND congregation_id IS NOT NULL;

-- 5d. A backfill-lel létrejött munkanapló-sorok áttekintése (szúrópróba)
SELECT id, idopont, jellege, cim, id_jellege
FROM public.munkanaplo
WHERE id_jellege LIKE 'keresztseg:%' OR id_jellege LIKE 'temetes:%' OR id_jellege LIKE 'hazassag:%'
ORDER BY idopont DESC
LIMIT 20;
