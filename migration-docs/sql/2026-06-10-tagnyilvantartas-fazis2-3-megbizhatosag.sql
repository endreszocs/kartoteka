-- ════════════════════════════════════════════════════════════════════════════
-- 2026-06-10 — TAGNYILVÁNTARTÁS FÁZIS 2-3: MEGBÍZHATÓSÁG + INTEGRÁCIÓ-ZÁRÁS
-- Forrás: docs/project-tracking/KARTOTEKA-tagnyilvantartas-atvilagitas-2026-06-10.md
--
-- Tartalom:
--   1. befizetes.id_csalad → FK a csalad-ra (árva hivatkozások NULL-ozása után) (P1-6a)
--   2. szemely CNP-egyediség gyülekezeten belül (guardolt partial unique index)  (P1-6b)
--   3. sirhelyelhunyt.id_szemely — oszlop + backfill a temetes-en át + trigger   (P1-7c)
--   4. tagnyilvantartas_csalad_mentes() RPC — atomikus csalad + gyerek-csere     (P1-5)
--   5. Diagnosztika
--
-- Idempotens; BEGIN/COMMIT csomagolva.
-- ⚠️ SORREND: a 2026-06-10-es Fázis 2-3 webapp-kód (saveFamily → RPC) ELŐTT futtatandó.
--    A régi kóddal kompatibilis (a kód csak az RPC-t hívja újként).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. BEFIZETES.ID_CSALAD → FK (P1-6a)
--    Először az árva család-hivatkozások NULL-ozása (a befizetés megmarad,
--    csak a nem létező családra mutató link tűnik el).
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.befizetes b
SET id_csalad = NULL
WHERE b.id_csalad IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.csalad c WHERE c.id = b.id_csalad);

DO $$ BEGIN
  ALTER TABLE public.befizetes
    ADD CONSTRAINT befizetes_id_csalad_fk
    FOREIGN KEY (id_csalad) REFERENCES public.csalad(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SZEMELY CNP-EGYEDISÉG gyülekezeten belül (P1-6b)
--    Csak a látható, nem üres CNP-jű sorokra. Ha duplikátum van az adatban,
--    a migráció NEM bukik el: NOTICE-t ír, a duplikátumokat a diagnosztika
--    listázza — tisztítás után a blokk újrafuttatható.
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uidx_szemely_cnp_per_congregation
    ON public.szemely (congregation_id, cnp)
    WHERE cnp IS NOT NULL AND cnp <> '' AND isvisible = true;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'uidx_szemely_cnp_per_congregation NEM jött létre (valószínűleg duplikált CNP van) — lásd az 5. diagnosztikát. Hiba: %', SQLERRM;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SIRHELYELHUNYT → SZEMELY link (P1-7c)
--    Eddig az elhunyt csak névvel szerepelt a sírnyilvántartásban. A temetes
--    hivatkozáson (temetesid → temetes.id_szemely) keresztül backfillelünk,
--    és trigger gondoskodik róla, hogy az új sorok automatikusan linkelődjenek.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sirhelyelhunyt
  ADD COLUMN IF NOT EXISTS id_szemely integer REFERENCES public.szemely(id);

CREATE INDEX IF NOT EXISTS idx_sirhelyelhunyt_szemely
  ON public.sirhelyelhunyt (id_szemely);

UPDATE public.sirhelyelhunyt se
SET id_szemely = t.id_szemely
FROM public.temetes t
WHERE se.id_szemely IS NULL
  AND se.temetesid IS NOT NULL
  AND t.id = se.temetesid;

CREATE OR REPLACE FUNCTION public.sirhelyelhunyt_set_szemely()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id_szemely IS NULL AND NEW.temetesid IS NOT NULL THEN
    SELECT t.id_szemely INTO NEW.id_szemely
    FROM public.temetes t WHERE t.id = NEW.temetesid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sirhelyelhunyt_set_szemely ON public.sirhelyelhunyt;
CREATE TRIGGER trg_sirhelyelhunyt_set_szemely
  BEFORE INSERT OR UPDATE OF temetesid ON public.sirhelyelhunyt
  FOR EACH ROW EXECUTE FUNCTION public.sirhelyelhunyt_set_szemely();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TAGNYILVANTARTAS_CSALAD_MENTES — atomikus család-mentés (P1-5)
--
--    A korábbi app-oldali implementáció a csalad-update-et, a gyerek-rekordok
--    delete+insert cseréjét külön lépésekben futtatta — egy közbenső hiba a
--    család gyermekeit elveszíthette. Ez az RPC mindezt EGY tranzakcióban
--    végzi, és minden érintett tag gyülekezet-hovatartozását ellenőrzi.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tagnyilvantartas_csalad_mentes(
  p_id integer,                 -- NULL = új család
  p_id_ferfi integer,
  p_id_no integer,
  p_gyerek_ids integer[],
  p_c_utcaid integer,
  p_c_szam varchar,
  p_id_csoport integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_all_ids integer[];
  v_cong uuid;
  v_fam_id integer;
BEGIN
  v_all_ids := array_remove(ARRAY[p_id_ferfi, p_id_no] || COALESCE(p_gyerek_ids, '{}'::integer[]), NULL);
  IF v_all_ids IS NULL OR array_length(v_all_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Legalább egy családtag szükséges.');
  END IF;

  -- 1) Jogosultság: az első tag gyülekezete, amelyhez a hívónak hozzáférése van
  SELECT congregation_id INTO v_cong FROM public.szemely WHERE id = v_all_ids[1];
  IF v_cong IS NULL OR NOT public.current_user_can_access_congregation(v_cong) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- 2) Minden érintett tag (szülők + gyerekek) UGYANEHHEZ a gyülekezethez tartozzon
  IF EXISTS (
    SELECT 1
    FROM unnest(v_all_ids) AS uid
    LEFT JOIN public.szemely s ON s.id = uid
    WHERE s.id IS NULL OR s.congregation_id IS DISTINCT FROM v_cong
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'A család csak az aktuális gyülekezet tagjaiból állhat.');
  END IF;

  -- 3) Mentés (egy tranzakcióban)
  IF p_id IS NOT NULL THEN
    -- meglévő család: tulajdon-ellenőrzés a család felnőtt tagjain keresztül
    IF NOT EXISTS (
      SELECT 1 FROM public.csalad c
      JOIN public.szemely s ON s.id IN (c.id_ferfi, c.id_no)
      WHERE c.id = p_id AND s.congregation_id = v_cong
    ) THEN
      RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    UPDATE public.csalad
    SET id_ferfi = p_id_ferfi,
        id_no = p_id_no,
        c_utcaid = COALESCE(p_c_utcaid, c_utcaid),
        c_szam = COALESCE(p_c_szam, c_szam),
        id_csoport = p_id_csoport,
        isaktiv = true
    WHERE id = p_id;
    v_fam_id := p_id;

    DELETE FROM public.gyerek WHERE id_csalad = v_fam_id;
  ELSE
    INSERT INTO public.csalad (id_ferfi, id_no, c_utcaid, c_szam, id_csoport, isaktiv)
    VALUES (p_id_ferfi, p_id_no, p_c_utcaid, COALESCE(p_c_szam, '1'), p_id_csoport, true)
    RETURNING id INTO v_fam_id;
  END IF;

  IF p_gyerek_ids IS NOT NULL AND array_length(p_gyerek_ids, 1) > 0 THEN
    INSERT INTO public.gyerek (id_csalad, id_szemely)
    SELECT v_fam_id, g FROM unnest(p_gyerek_ids) AS g;
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'family_id', v_fam_id);
EXCEPTION WHEN others THEN
  -- bármilyen hiba → a teljes művelet visszagördül, az ok visszajut az appnak
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.tagnyilvantartas_csalad_mentes(integer, integer, integer, integer[], integer, varchar, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tagnyilvantartas_csalad_mentes(integer, integer, integer, integer[], integer, varchar, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.tagnyilvantartas_csalad_mentes(integer, integer, integer, integer[], integer, varchar, integer) TO authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. DIAGNOSZTIKA (COMMIT után, read-only)
-- ────────────────────────────────────────────────────────────────────────────

-- a) Árva befizetes.id_csalad — elvárás: 0
SELECT 'árva befizetes.id_csalad' AS ellenorzes, count(*) AS darab
FROM public.befizetes b
WHERE b.id_csalad IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.csalad c WHERE c.id = b.id_csalad)
UNION ALL
-- b) sirhelyelhunyt: hány sor linkelt / nem linkelt szemely-re
SELECT 'sirhelyelhunyt SZEMELY-LINKKEL', count(*)
FROM public.sirhelyelhunyt WHERE id_szemely IS NOT NULL
UNION ALL
SELECT 'sirhelyelhunyt link nélkül (nincs temetes-hivatkozás)', count(*)
FROM public.sirhelyelhunyt WHERE id_szemely IS NULL;

-- c) Duplikált CNP-k gyülekezeten belül (ha a 2. blokk NOTICE-t adott) —
--    elvárás: 0 sor. Ha van találat: a duplikátumok rendezése után futtasd
--    újra a 2. blokk CREATE UNIQUE INDEX utasítását.
SELECT congregation_id, cnp, count(*) AS darab, array_agg(id) AS szemely_idk
FROM public.szemely
WHERE cnp IS NOT NULL AND cnp <> '' AND isvisible = true
GROUP BY congregation_id, cnp
HAVING count(*) > 1
ORDER BY darab DESC;

-- d) Az index létrejött-e?
SELECT indexname FROM pg_indexes
WHERE tablename = 'szemely' AND indexname = 'uidx_szemely_cnp_per_congregation';
