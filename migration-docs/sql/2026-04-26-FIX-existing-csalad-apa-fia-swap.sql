-- KARTOTEKA — meglévő hibás csalad-rekordok apa-fia javítása
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél:
-- A `csak családokká szervezés` import során 2-3 csalad-rekord rossz szemely-t
-- választott id_ferfi-ként (a fiát az apa helyett), mert a régi tie-break
-- logika `id ASC` szerint választott (nem életkor szerint).
--
-- Ez a script a HELYES apát automatikusan megtalálja és UPDATE-eli az érintett
-- csalad-rekordokat. CSAK azokat érinti ahol:
--   - A jelenleg id_ferfi/id_no szemely apjaneve = saját_név (azaz ő a fia)
--   - VAN egy másik azonos nevű szemely IDŐSEBB sz_datum-mal (az apa)
--   - A csalad még nem rendelkezik másik házastárssal id_no/id_ferfi-ben
--
-- Idempotens: futtatható többször is — csak akkor csinál változást, ha tényleg
-- helyrehozandó eset van.
--
-- ELŐTTE: futtasd a `2026-04-26-FIX-import-families-apa-fia-tie-breaker.sql`-t
-- (a `normalize_name` függvény miatt).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. DIAGNOSZTIKA: melyek a tényleg HIBÁS csalad-rekordok?
-- ────────────────────────────────────────────────────────────────────────────
-- Csak akkor HIBÁS, ha a "potenciális apa" sz_datum < választott sz_datum.

-- Hozzunk létre egy temp tábla a hibás esetekkel
CREATE TEMP TABLE IF NOT EXISTS tmp_csalad_apa_fia_swap AS
SELECT DISTINCT
    c.id AS csalad_id,
    s.id AS jelenlegi_id,
    s.csaladnev || ' ' || s.k_nev AS jelenlegi_nev,
    s.sz_datum AS jelenlegi_sz_datum,
    apa.id AS helyes_apa_id,
    apa.sz_datum AS helyes_apa_sz_datum,
    s.ferfi AS ferfi
FROM public.csalad c
JOIN public.szemely s ON s.id = COALESCE(c.id_ferfi, c.id_no)
JOIN public.szemely apa
    ON apa.congregation_id = s.congregation_id
    AND apa.isvisible = true
    AND apa.ferfi = s.ferfi
    AND apa.id != s.id
    AND public.normalize_name(COALESCE(apa.csaladnev, '') || ' ' || COALESCE(apa.k_nev, ''))
        = public.normalize_name(s.apjaneve)
WHERE
    s.apjaneve IS NOT NULL
    AND btrim(s.apjaneve) != ''
    AND public.normalize_name(s.apjaneve)
        = public.normalize_name(COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, ''))
    -- KRITIKUS: csak akkor HIBÁS, ha a "potenciális apa" tényleg IDŐSEBB
    AND apa.sz_datum IS NOT NULL
    AND s.sz_datum IS NOT NULL
    AND apa.sz_datum < s.sz_datum
    -- Ne legyen az "apa" már maga is felhasználva másik csaladban (UNIQUE constraint)
    AND NOT EXISTS (
        SELECT 1 FROM public.csalad c2
        WHERE (s.ferfi AND c2.id_ferfi = apa.id)
           OR (NOT s.ferfi AND c2.id_no = apa.id)
    );

-- Mutasd meg, mit fogunk javítani
SELECT
    'A javítás előtt:' AS info,
    COUNT(*) AS hibas_csalad_db
FROM tmp_csalad_apa_fia_swap;

SELECT * FROM tmp_csalad_apa_fia_swap ORDER BY csalad_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. JAVÍTÁS — a HELYES apa ID-jét beillesszük
-- ────────────────────────────────────────────────────────────────────────────
-- Férj-csalad: id_ferfi swap
UPDATE public.csalad c
SET id_ferfi = swap.helyes_apa_id
FROM tmp_csalad_apa_fia_swap swap
WHERE c.id = swap.csalad_id
  AND swap.ferfi = true
  AND c.id_ferfi = swap.jelenlegi_id;

-- Nő-csalad: id_no swap
UPDATE public.csalad c
SET id_no = swap.helyes_apa_id
FROM tmp_csalad_apa_fia_swap swap
WHERE c.id = swap.csalad_id
  AND swap.ferfi = false
  AND c.id_no = swap.jelenlegi_id;

-- Mutasd meg, hogy mi maradt javításra (várhatóan 0)
SELECT
    'A javítás után:' AS info,
    COUNT(*) AS megmaradt_hibak
FROM (
    SELECT DISTINCT c.id
    FROM public.csalad c
    JOIN public.szemely s ON s.id = COALESCE(c.id_ferfi, c.id_no)
    JOIN public.szemely apa
        ON apa.congregation_id = s.congregation_id
        AND apa.isvisible = true
        AND apa.ferfi = s.ferfi
        AND apa.id != s.id
        AND public.normalize_name(COALESCE(apa.csaladnev, '') || ' ' || COALESCE(apa.k_nev, ''))
            = public.normalize_name(s.apjaneve)
    WHERE
        s.apjaneve IS NOT NULL
        AND btrim(s.apjaneve) != ''
        AND public.normalize_name(s.apjaneve)
            = public.normalize_name(COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, ''))
        AND apa.sz_datum IS NOT NULL
        AND s.sz_datum IS NOT NULL
        AND apa.sz_datum < s.sz_datum
) AS sub;

DROP TABLE IF EXISTS tmp_csalad_apa_fia_swap;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ELLENŐRZÉS — most már mind a 2-3 csalad rendben?
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    c.id AS csalad_id,
    s.csaladnev || ' ' || s.k_nev AS csaladfo,
    s.sz_datum AS sz_datum,
    s.ferfi
FROM public.csalad c
JOIN public.szemely s ON s.id = COALESCE(c.id_ferfi, c.id_no)
WHERE c.id IN (63, 154, 186, 191)  -- a vizsgált csalad-ID-k
ORDER BY c.id;
