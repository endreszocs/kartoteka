-- KARTOTEKA — Hiányzó házastársak v6 (PURE CTE — egyetlen statement)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v5 RPC nem futott le a Studio-ban (Endre Run-gombja valószínűleg csak az
-- utolsó SELECT-et futtatta, nem az egész script-et).
--
-- A v6 megoldása: NINCS RPC, NINCS DO blokk, NINCS BEGIN/COMMIT.
-- Egyetlen data-modifying CTE chain (PostgreSQL standard) ami atomikusan
-- végrehajtja a STRICT MERGE-et + visszaadja a számokat.
--
-- A NÉV-PÁROSÍTÁS és LOOSE LINK fázisokat KÜLÖN script-ben fogjuk megcsinálni
-- HA a STRICT MERGE működik.
--
-- HASZNÁLAT a Studio-ban:
--   1. Másold be a teljes SQL-t alább
--   2. Nyomd meg a "Run" gombot
--   3. A visszaadott táblát küldd el

-- ════════════════════════════════════════════════════════════════════════════
-- STRICT MERGE — egyetlen data-modifying CTE chain
-- ════════════════════════════════════════════════════════════════════════════

WITH single_parent AS (
    SELECT
        c.id AS csalad_id,
        c.c_utcaid,
        c.c_szam,
        CASE WHEN c.id_ferfi IS NOT NULL THEN c.id_ferfi ELSE c.id_no END AS head_szemely_id,
        (c.id_ferfi IS NOT NULL) AS head_is_ferfi
    FROM public.csalad c
    INNER JOIN public.szemely head
        ON head.id = COALESCE(c.id_ferfi, c.id_no)
    WHERE head.isvisible = true
      AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
      AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
),
addr_pairs AS (
    SELECT
        c_utcaid, c_szam,
        MAX(csalad_id) FILTER (WHERE head_is_ferfi) AS ferj_csalad_id,
        MAX(csalad_id) FILTER (WHERE NOT head_is_ferfi) AS no_csalad_id,
        MAX(head_szemely_id) FILTER (WHERE head_is_ferfi) AS ferj_szemely_id,
        MAX(head_szemely_id) FILTER (WHERE NOT head_is_ferfi) AS no_szemely_id
    FROM single_parent
    WHERE c_utcaid IS NOT NULL
    GROUP BY c_utcaid, c_szam
    HAVING COUNT(*) FILTER (WHERE head_is_ferfi) = 1
       AND COUNT(*) FILTER (WHERE NOT head_is_ferfi) = 1
),
ferj_csalad_updated AS (
    UPDATE public.csalad
    SET id_no = ap.no_szemely_id
    FROM addr_pairs ap
    WHERE public.csalad.id = ap.ferj_csalad_id
    RETURNING public.csalad.id AS updated_csalad_id
),
gyerek_moved AS (
    UPDATE public.gyerek
    SET id_csalad = ap.ferj_csalad_id
    FROM addr_pairs ap
    WHERE public.gyerek.id_csalad = ap.no_csalad_id
    RETURNING public.gyerek.id AS moved_gyerek_id
),
no_csalad_deleted AS (
    DELETE FROM public.csalad
    USING addr_pairs ap
    WHERE public.csalad.id = ap.no_csalad_id
    RETURNING public.csalad.id AS deleted_csalad_id
),
no_szemely_flagged AS (
    UPDATE public.szemely
    SET csaladfo = false
    FROM addr_pairs ap
    WHERE public.szemely.id = ap.no_szemely_id
    RETURNING public.szemely.id AS flagged_szemely_id
)
SELECT
    'STRICT MERGE eredmény' AS phase,
    (SELECT COUNT(*) FROM addr_pairs) AS detected_pairs,
    (SELECT COUNT(*) FROM ferj_csalad_updated) AS ferj_csalad_updated,
    (SELECT COUNT(*) FROM gyerek_moved) AS gyerek_moved,
    (SELECT COUNT(*) FROM no_csalad_deleted) AS no_csalad_deleted,
    (SELECT COUNT(*) FROM no_szemely_flagged) AS no_szemely_flagged;
