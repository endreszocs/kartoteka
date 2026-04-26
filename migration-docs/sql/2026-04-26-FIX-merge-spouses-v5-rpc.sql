-- KARTOTEKA — Hiányzó házastársak v5 (RPC változat — biztosan futtatható)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v4 hibája: Studio statement-ek külön session-ben futottak, így a 3 DO blokk
-- nem feltétlenül hajtódott végre, csak a SELECT-ek.
--
-- A v5 megoldása: az ÖSSZES merge-logikát egyetlen RPC függvénybe csomagoljuk,
-- amit egyetlen SELECT hívással futtatunk. A Studio így GARANTÁLTAN végrehajtja.
-- Az RPC visszaad egy JSONB summary-t — nem maradhat le semmi.
--
-- Idempotens: CREATE OR REPLACE FUNCTION

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_spouses_bulk()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $merge_spouses_bulk$
DECLARE
    -- Számlálók
    v_strict_merged int := 0;
    v_strict_skipped int := 0;
    v_namematch_merged int := 0;
    v_namematch_skipped int := 0;
    v_loose_linked int := 0;
    v_loose_ambiguous int := 0;
    v_loose_no_cand int := 0;
    v_loose_skipped int := 0;
    -- Részletes log JSONB-be
    v_details jsonb := '[]'::jsonb;
    v_pair_rec record;
    v_sp_rec record;
    v_cand_count int;
    v_cand_id int;
BEGIN
    -- Studio bypass check
    IF auth.uid() IS NULL THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            RAISE EXCEPTION 'Studio bypass csak superuser-ből engedett.';
        END IF;
    END IF;

    -- ────────────────────────────────────────────────────────────────────
    -- A. STRICT MERGE (1-1 single-parent ugyanazon címen)
    -- ────────────────────────────────────────────────────────────────────
    FOR v_pair_rec IN
        WITH single_parent_at_addr AS (
            SELECT
                c.id AS csalad_id, c.c_utcaid, c.c_szam,
                CASE WHEN c.id_ferfi IS NOT NULL THEN c.id_ferfi ELSE c.id_no END AS head_szemely_id,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi
            FROM public.csalad c
            INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE head.isvisible = true
              AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
              AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
        ),
        addr_groups AS (
            SELECT c_utcaid, c_szam,
                COUNT(*) FILTER (WHERE head_is_ferfi) AS num_ferj,
                COUNT(*) FILTER (WHERE NOT head_is_ferfi) AS num_no,
                MAX(csalad_id) FILTER (WHERE head_is_ferfi) AS ferj_csalad_id,
                MAX(csalad_id) FILTER (WHERE NOT head_is_ferfi) AS no_csalad_id,
                MAX(head_szemely_id) FILTER (WHERE head_is_ferfi) AS ferj_szemely_id,
                MAX(head_szemely_id) FILTER (WHERE NOT head_is_ferfi) AS no_szemely_id
            FROM single_parent_at_addr
            WHERE c_utcaid IS NOT NULL
            GROUP BY c_utcaid, c_szam
        )
        SELECT ferj_csalad_id, no_csalad_id, ferj_szemely_id, no_szemely_id
        FROM addr_groups
        WHERE num_ferj = 1 AND num_no = 1
        ORDER BY ferj_csalad_id
    LOOP
        BEGIN
            UPDATE public.csalad SET id_no = v_pair_rec.no_szemely_id WHERE id = v_pair_rec.ferj_csalad_id;
            UPDATE public.gyerek SET id_csalad = v_pair_rec.ferj_csalad_id WHERE id_csalad = v_pair_rec.no_csalad_id;
            DELETE FROM public.csalad WHERE id = v_pair_rec.no_csalad_id;
            UPDATE public.szemely SET csaladfo = false WHERE id = v_pair_rec.no_szemely_id;
            v_strict_merged := v_strict_merged + 1;
            v_details := v_details || jsonb_build_object(
                'phase', 'STRICT', 'action', 'merged',
                'ferj_csalad_id', v_pair_rec.ferj_csalad_id,
                'no_csalad_id', v_pair_rec.no_csalad_id);
        EXCEPTION WHEN unique_violation THEN
            v_strict_skipped := v_strict_skipped + 1;
            v_details := v_details || jsonb_build_object(
                'phase', 'STRICT', 'action', 'skipped',
                'ferj_csalad_id', v_pair_rec.ferj_csalad_id,
                'no_csalad_id', v_pair_rec.no_csalad_id,
                'reason', 'UNIQUE');
        END;
    END LOOP;

    -- ────────────────────────────────────────────────────────────────────
    -- B. NÉV-PÁROSÍTÁS MERGE (azonos vezetéknév vagy lánykori név)
    -- ────────────────────────────────────────────────────────────────────
    FOR v_pair_rec IN
        WITH single_parent_at_addr AS (
            SELECT c.id AS csalad_id, c.c_utcaid, c.c_szam,
                head.id AS head_szemely_id, head.csaladnev, head.szcs_nev,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi
            FROM public.csalad c
            INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE head.isvisible = true
              AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
              AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
        ),
        ferj_at_addr AS (
            SELECT c_utcaid, c_szam,
                public.normalize_name(csaladnev) AS norm_csaladnev,
                csalad_id, head_szemely_id
            FROM single_parent_at_addr
            WHERE head_is_ferfi AND c_utcaid IS NOT NULL AND csaladnev IS NOT NULL
        ),
        no_at_addr AS (
            SELECT c_utcaid, c_szam,
                public.normalize_name(csaladnev) AS norm_csaladnev,
                public.normalize_name(szcs_nev) AS norm_szcs_nev,
                csalad_id, head_szemely_id
            FROM single_parent_at_addr
            WHERE NOT head_is_ferfi AND c_utcaid IS NOT NULL AND csaladnev IS NOT NULL
        ),
        candidate_pairs AS (
            SELECT
                f.csalad_id AS ferj_csalad_id, n.csalad_id AS no_csalad_id,
                f.head_szemely_id AS ferj_szemely_id, n.head_szemely_id AS no_szemely_id
            FROM ferj_at_addr f
            INNER JOIN no_at_addr n
                ON f.c_utcaid = n.c_utcaid
                AND COALESCE(f.c_szam, '') = COALESCE(n.c_szam, '')
                AND (
                    f.norm_csaladnev = n.norm_csaladnev
                    OR (n.norm_szcs_nev IS NOT NULL AND f.norm_csaladnev = n.norm_szcs_nev)
                )
        ),
        unique_pairs AS (
            SELECT *
            FROM candidate_pairs cp
            WHERE
                (SELECT COUNT(*) FROM candidate_pairs cp2 WHERE cp2.ferj_csalad_id = cp.ferj_csalad_id) = 1
                AND
                (SELECT COUNT(*) FROM candidate_pairs cp2 WHERE cp2.no_csalad_id = cp.no_csalad_id) = 1
        )
        SELECT * FROM unique_pairs ORDER BY ferj_csalad_id
    LOOP
        BEGIN
            UPDATE public.csalad SET id_no = v_pair_rec.no_szemely_id WHERE id = v_pair_rec.ferj_csalad_id;
            UPDATE public.gyerek SET id_csalad = v_pair_rec.ferj_csalad_id WHERE id_csalad = v_pair_rec.no_csalad_id;
            DELETE FROM public.csalad WHERE id = v_pair_rec.no_csalad_id;
            UPDATE public.szemely SET csaladfo = false WHERE id = v_pair_rec.no_szemely_id;
            v_namematch_merged := v_namematch_merged + 1;
            v_details := v_details || jsonb_build_object(
                'phase', 'NAMEMATCH', 'action', 'merged',
                'ferj_csalad_id', v_pair_rec.ferj_csalad_id,
                'no_csalad_id', v_pair_rec.no_csalad_id);
        EXCEPTION WHEN unique_violation THEN
            v_namematch_skipped := v_namematch_skipped + 1;
            v_details := v_details || jsonb_build_object(
                'phase', 'NAMEMATCH', 'action', 'skipped',
                'ferj_csalad_id', v_pair_rec.ferj_csalad_id,
                'no_csalad_id', v_pair_rec.no_csalad_id,
                'reason', 'UNIQUE');
        END;
    END LOOP;

    -- ────────────────────────────────────────────────────────────────────
    -- C. LOOSE LINK (egyértelmű 1 jelölt cím-egyezésen)
    -- ────────────────────────────────────────────────────────────────────
    FOR v_sp_rec IN
        SELECT
            c.id AS csalad_id, c.c_utcaid, c.c_szam,
            head.id AS head_id, head.ferfi AS head_ferfi,
            head.congregation_id, (c.id_no IS NULL) AS need_no
        FROM public.csalad c
        INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
        WHERE head.isvisible = true
          AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
          AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
          AND c.c_utcaid IS NOT NULL
        ORDER BY c.id
    LOOP
        SELECT COUNT(*), MAX(s.id) INTO v_cand_count, v_cand_id
        FROM public.szemely s
        WHERE s.congregation_id = v_sp_rec.congregation_id
          AND s.isvisible = true
          AND s.id <> v_sp_rec.head_id
          AND s.c_utcaid = v_sp_rec.c_utcaid
          AND COALESCE(s.c_szam, '') = COALESCE(v_sp_rec.c_szam, '')
          AND s.ferfi <> v_sp_rec.head_ferfi
          AND s.csaladfo = false
          AND NOT EXISTS (SELECT 1 FROM public.csalad c2 WHERE c2.id_ferfi = s.id OR c2.id_no = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id)
          AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date);

        IF v_cand_count = 1 THEN
            BEGIN
                IF v_sp_rec.need_no THEN
                    UPDATE public.csalad SET id_no = v_cand_id WHERE id = v_sp_rec.csalad_id;
                ELSE
                    UPDATE public.csalad SET id_ferfi = v_cand_id WHERE id = v_sp_rec.csalad_id;
                END IF;
                v_loose_linked := v_loose_linked + 1;
            EXCEPTION WHEN unique_violation THEN
                v_loose_skipped := v_loose_skipped + 1;
            END;
        ELSIF v_cand_count > 1 THEN
            v_loose_ambiguous := v_loose_ambiguous + 1;
        ELSE
            v_loose_no_cand := v_loose_no_cand + 1;
        END IF;
    END LOOP;

    -- Visszatérés
    RETURN jsonb_build_object(
        'summary', jsonb_build_object(
            'strict_merged', v_strict_merged,
            'strict_skipped', v_strict_skipped,
            'namematch_merged', v_namematch_merged,
            'namematch_skipped', v_namematch_skipped,
            'loose_linked', v_loose_linked,
            'loose_ambiguous', v_loose_ambiguous,
            'loose_no_candidate', v_loose_no_cand,
            'loose_skipped', v_loose_skipped,
            'TOTAL_FIXED', v_strict_merged + v_namematch_merged + v_loose_linked
        ),
        'details', v_details
    );
END;
$merge_spouses_bulk$;

GRANT EXECUTE ON FUNCTION public.merge_spouses_bulk() TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === FUTTATÁS — egyetlen SELECT, garantált végrehajtás ===
-- ════════════════════════════════════════════════════════════════════════════

SELECT public.merge_spouses_bulk() AS result;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — javított ÖSSZEGZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Csak férj (id_ferfi van, id_no NULL)' AS metric, COUNT(*) AS db
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NULL
UNION ALL SELECT 'Csak feleség (id_no van, id_ferfi NULL)', COUNT(*)
    FROM public.csalad WHERE id_no IS NOT NULL AND id_ferfi IS NULL
UNION ALL SELECT 'Házaspár (mindkettő van)', COUNT(*)
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NOT NULL
UNION ALL SELECT '— Összesen csalad rekord:', COUNT(*) FROM public.csalad;

-- Maradt többszemélyes címek (manuális rendezés)
WITH single_parent_at_addr AS (
    SELECT c.id AS csalad_id, c.c_utcaid, c.c_szam,
        head.csaladnev || ' ' || head.k_nev AS nev, head.ferfi
    FROM public.csalad c
    INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
    WHERE head.isvisible = true
      AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
      AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
      AND c.c_utcaid IS NOT NULL
)
SELECT
    a.name AS utca, sp.c_szam AS hazszam,
    string_agg(CASE WHEN sp.ferfi THEN sp.nev END, ', ') AS ferjek_egy_cimen,
    string_agg(CASE WHEN NOT sp.ferfi THEN sp.nev END, ', ') AS nok_egy_cimen,
    COUNT(*) FILTER (WHERE sp.ferfi) AS ferj_db,
    COUNT(*) FILTER (WHERE NOT sp.ferfi) AS no_db
FROM single_parent_at_addr sp
LEFT JOIN public.adrstreet a ON a.id = sp.c_utcaid
GROUP BY sp.c_utcaid, sp.c_szam, a.name
HAVING COUNT(*) FILTER (WHERE sp.ferfi) >= 1
   AND COUNT(*) FILTER (WHERE NOT sp.ferfi) >= 1
ORDER BY utca, hazszam;
