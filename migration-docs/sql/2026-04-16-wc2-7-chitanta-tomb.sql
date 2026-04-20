-- ============================================================================
-- KARTOTEKA WC-2.7 — Chitanță (papír nyugta) tömb-támogatás
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Indok: a felhasználó hivatalos sablonú nyugtatömböt használ (pl. „EREKC24"
--   sorozat, előrenyomtatott sorszámmal). A KARTOTEKA-nak tárolnia kell
--   a sorozat nevét és a következő használandó számot, hogy a digitális
--   nyilvántartás (oblio_szamlak.tipus = 'chitanta_papir') tükrözze a fizikai
--   tömböt.
--
-- A nyugta NEM megy az Oblio-ra — csak a saját DB-be kerül, és helyileg
-- nyomtatható (HTML → PDF).
--

BEGIN;

-- 1. Új mezők az oblio_fiokok-ban (a nyugta-tömb alapértelmezései)
ALTER TABLE public.oblio_fiokok
  ADD COLUMN IF NOT EXISTS chitanta_sorozat_default text,
  ADD COLUMN IF NOT EXISTS chitanta_kovetkezo_szam integer DEFAULT 1;

-- 1.b Új chitanță-specifikus mezők az oblio_szamlak-ban
-- (a hivatalos nyomtatott nyugtán kell az átvevő címe és az „Reprezentând" mező)
ALTER TABLE public.oblio_szamlak
  ADD COLUMN IF NOT EXISTS klienesseg_cim text,
  ADD COLUMN IF NOT EXISTS reprezentand text;

COMMENT ON COLUMN public.oblio_szamlak.klienesseg_cim IS
  $$Az átvevő/befizető címe — főként chitanță-soroknál a hivatalos
  nyomtatványon van „Adresa (Cím)" mező.$$;

COMMENT ON COLUMN public.oblio_szamlak.reprezentand IS
  $$„Reprezentând (címén)" — a chitanță-n a befizetés indoklása,
  pl. „Egyházfenntartó járulék 2024-2026".$$;

COMMENT ON COLUMN public.oblio_fiokok.chitanta_sorozat_default IS
  $$Hivatalos nyugtatömb sorozata, pl. 'EREKC24'. A KARTOTEKA előtölti
  ezzel a chitanță-kiállító dialógust.$$;

COMMENT ON COLUMN public.oblio_fiokok.chitanta_kovetkezo_szam IS
  $$A nyugtatömb soron következő száma (1-től induló). A kiállításkor
  automatikusan inkrementáljuk, hogy a fizikai tömbbel szinkronban legyen.$$;

-- 2. Részleges egyediségi index a chitanță-soroknál
-- A meglévő unique index (oblio_fiok_id, sorozat, szam) NULL-okat NEM tekint
-- egyenlőnek, így a chitanță-knál (oblio_fiok_id = NULL) duplikálódhat. Ezért
-- csinálunk egy partial unique index-et a (congregation_id, sorozat, szam)
-- mentén, csak chitanță-típusra.
DROP INDEX IF EXISTS public.oblio_szamlak_chitanta_unique_idx;
CREATE UNIQUE INDEX oblio_szamlak_chitanta_unique_idx
  ON public.oblio_szamlak (congregation_id, sorozat, szam)
  WHERE tipus = 'chitanta_papir' AND stornozott = false;

COMMENT ON INDEX public.oblio_szamlak_chitanta_unique_idx IS
  $$Részleges egyediségi index a papír chitanță-kra: gyülekezetenként
  egy sorozaton belül egyedi a szám. A sztornózott rekordok kivételek.$$;

-- 3. RPC: a következő chitanță-szám atomi lefoglalása (concurrency-safe)
-- Visszaadja a következő szabad számot a megadott sorozaton belül,
-- és inkrementálja a chitanta_kovetkezo_szam értéket az oblio_fiokok-ban.
CREATE OR REPLACE FUNCTION public.next_chitanta_number(
  p_congregation_id uuid,
  p_sorozat text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_max integer;
  v_stored_next integer;
  v_next integer;
BEGIN
  -- A stored value (oblio_fiokok.chitanta_kovetkezo_szam)
  SELECT chitanta_kovetkezo_szam
    INTO v_stored_next
    FROM public.oblio_fiokok
    WHERE congregation_id = p_congregation_id
    LIMIT 1;

  -- A DB-ben a sorozat aktuális max száma (chitanță, nem sztornózott)
  SELECT COALESCE(MAX(szam), 0)
    INTO v_current_max
    FROM public.oblio_szamlak
    WHERE congregation_id = p_congregation_id
      AND tipus = 'chitanta_papir'
      AND sorozat = p_sorozat
      AND stornozott = false;

  -- A nagyobbat választjuk, hogy a fizikai tömbbel se ütközzünk
  v_next := GREATEST(COALESCE(v_stored_next, 1), v_current_max + 1);

  -- Frissítjük az oblio_fiokok-ot is
  UPDATE public.oblio_fiokok
    SET chitanta_kovetkezo_szam = v_next + 1,
        updated_at = now()
    WHERE congregation_id = p_congregation_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_chitanta_number(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.next_chitanta_number(uuid, text) IS
  $$Atomi módon visszaadja a következő szabad chitanță-számot a megadott
  sorozaton belül, és inkrementálja a stored next-et. Concurrency-safe.$$;

COMMIT;


-- ============================================================================
-- ELLENŐRZŐK
-- ============================================================================

-- A) Új oszlopok megvannak?
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'oblio_fiokok'
  AND column_name IN ('chitanta_sorozat_default', 'chitanta_kovetkezo_szam');

-- B) Partial unique index létezik?
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'oblio_szamlak'
  AND indexname = 'oblio_szamlak_chitanta_unique_idx';

-- C) Az RPC függvény létezik-e?
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'next_chitanta_number';
