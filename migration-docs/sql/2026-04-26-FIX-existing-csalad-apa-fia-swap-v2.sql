-- KARTOTEKA — meglévő hibás csalad-rekordok apa-fia javítása (v2 — CTE-pattern)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Hiba a v1-ben:
-- A TEMP tábla a Supabase Studio-ban néha nem él túl a `BEGIN`/`COMMIT` határt
-- (`relation "tmp_csalad_apa_fia_swap" does not exist`).
--
-- v2: CTE-pattern (Common Table Expression) — egy körben fut, NINCS TEMP tábla.
-- Két külön UPDATE statement (egyik az id_ferfi-re, másik az id_no-ra) — mindkettő
-- ugyanazt a CTE-t használja a HIBÁS rekord detektáláshoz.
--
-- A diagnosztika SELECT (a JAVÍTÁS ELŐTT és UTÁN) külön statement-ek.
--
-- Idempotens — futtatható többször, csak akkor csinál változást ha tényleg van
-- helyrehozandó eset.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. DIAGNOSZTIKA — milyen csalad-rekordokat fogunk javítani?
-- ════════════════════════════════════════════════════════════════════════════

WITH apa_fia_swap AS (
    SELECT DISTINCT
        c.id AS csalad_id,
        s.id AS jelenlegi_id,
        s.csaladnev || ' ' || s.k_nev AS jelenlegi_nev,
        s.sz_datum AS jelenlegi_sz_datum,
        s.ferfi,
        apa.id AS helyes_apa_id,
        apa.sz_datum AS helyes_apa_sz_datum
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
        )
)
SELECT * FROM apa_fia_swap ORDER BY csalad_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. JAVÍTÁS — férj-csalad (id_ferfi swap)
-- ════════════════════════════════════════════════════════════════════════════

WITH apa_fia_swap AS (
    SELECT DISTINCT
        c.id AS csalad_id,
        s.id AS jelenlegi_id,
        s.ferfi,
        apa.id AS helyes_apa_id
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
        AND NOT EXISTS (
            SELECT 1 FROM public.csalad c2
            WHERE (s.ferfi AND c2.id_ferfi = apa.id)
               OR (NOT s.ferfi AND c2.id_no = apa.id)
        )
)
UPDATE public.csalad c
SET id_ferfi = swap.helyes_apa_id
FROM apa_fia_swap swap
WHERE c.id = swap.csalad_id
  AND swap.ferfi = true
  AND c.id_ferfi = swap.jelenlegi_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. JAVÍTÁS — nő-csalad (id_no swap)
-- ════════════════════════════════════════════════════════════════════════════

WITH apa_fia_swap AS (
    SELECT DISTINCT
        c.id AS csalad_id,
        s.id AS jelenlegi_id,
        s.ferfi,
        apa.id AS helyes_apa_id
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
        AND NOT EXISTS (
            SELECT 1 FROM public.csalad c2
            WHERE (s.ferfi AND c2.id_ferfi = apa.id)
               OR (NOT s.ferfi AND c2.id_no = apa.id)
        )
)
UPDATE public.csalad c
SET id_no = swap.helyes_apa_id
FROM apa_fia_swap swap
WHERE c.id = swap.csalad_id
  AND swap.ferfi = false
  AND c.id_no = swap.jelenlegi_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. ELLENŐRZÉS — most már 0 hibás rekord van?
-- ════════════════════════════════════════════════════════════════════════════

WITH apa_fia_swap AS (
    SELECT DISTINCT c.id AS csalad_id
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
)
SELECT 'Maradt hibás rekordok száma a swap után' AS info, COUNT(*) AS db
FROM apa_fia_swap;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. ELLENŐRZÉS — a 4 vizsgált csalad-ID jelenlegi állapota
-- ════════════════════════════════════════════════════════════════════════════
SELECT
    c.id AS csalad_id,
    s.csaladnev || ' ' || s.k_nev AS csaladfo,
    s.sz_datum AS sz_datum,
    s.ferfi,
    s.apjaneve
FROM public.csalad c
JOIN public.szemely s ON s.id = COALESCE(c.id_ferfi, c.id_no)
WHERE c.id IN (63, 154, 186, 191)
ORDER BY c.id;
