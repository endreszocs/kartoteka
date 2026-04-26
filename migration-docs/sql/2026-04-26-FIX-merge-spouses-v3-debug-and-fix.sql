-- KARTOTEKA — Hiányzó házastársak v3: DEBUG + javítás
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v2 lefutott, de pl. Kiss Csaba ↔ Kiss Irma (Főút 33) NEM lett MERGE-elve,
-- pedig azonos vezetéknév. Ez a script:
--   1. DIAGNOSZTIKA — visszaadja a CTE-k tartalmát (mit lát az algoritmus)
--   2. MERGE — szigorú v2 logika, COUNT visszaadással (nem csak NOTICE)
--   3. ELLENŐRZÉS — a maradék single-parent címek listája

-- ════════════════════════════════════════════════════════════════════════════
-- 1. DIAGNOSZTIKA — mit lát a B (NÉV-PÁROSÍTÁS) algoritmus?
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mutasd meg az ÖSSZES candidate_pair-t (férj × nő ugyanazon címen,
-- AZONOS vezetéknévvel) — ezzel látjuk, mi a baj.

WITH single_parent_at_addr AS (
    SELECT
        c.id AS csalad_id,
        c.c_utcaid,
        c.c_szam,
        head.id AS head_szemely_id,
        head.csaladnev,
        head.k_nev,
        head.szcs_nev,
        (c.id_ferfi IS NOT NULL) AS head_is_ferfi,
        head.congregation_id
    FROM public.csalad c
    INNER JOIN public.szemely head
        ON head.id = COALESCE(c.id_ferfi, c.id_no)
    WHERE
        head.isvisible = true
        AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
        AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
),
ferj_at_addr AS (
    SELECT
        c_utcaid, c_szam,
        public.normalize_name(csaladnev) AS norm_csaladnev,
        csalad_id, head_szemely_id,
        csaladnev || ' ' || k_nev AS nev
    FROM single_parent_at_addr
    WHERE head_is_ferfi
      AND c_utcaid IS NOT NULL
      AND csaladnev IS NOT NULL
),
no_at_addr AS (
    SELECT
        c_utcaid, c_szam,
        public.normalize_name(csaladnev) AS norm_csaladnev,
        public.normalize_name(szcs_nev) AS norm_szcs_nev,
        csalad_id, head_szemely_id,
        csaladnev || ' ' || k_nev AS nev,
        szcs_nev
    FROM single_parent_at_addr
    WHERE NOT head_is_ferfi
      AND c_utcaid IS NOT NULL
      AND csaladnev IS NOT NULL
),
candidate_pairs AS (
    SELECT
        f.csalad_id AS ferj_csalad_id,
        n.csalad_id AS no_csalad_id,
        f.head_szemely_id AS ferj_szemely_id,
        n.head_szemely_id AS no_szemely_id,
        f.nev AS ferj_nev,
        n.nev AS no_nev,
        f.c_utcaid,
        f.c_szam,
        f.norm_csaladnev AS ferj_norm,
        n.norm_csaladnev AS no_norm,
        n.norm_szcs_nev AS no_szcs_norm,
        n.szcs_nev AS no_szcs_nev,
        CASE
            WHEN f.norm_csaladnev = n.norm_csaladnev THEN 'azonos_csaladnev'
            WHEN n.norm_szcs_nev IS NOT NULL AND f.norm_csaladnev = n.norm_szcs_nev THEN 'lankori_nev'
        END AS match_reason
    FROM ferj_at_addr f
    INNER JOIN no_at_addr n
        ON f.c_utcaid = n.c_utcaid
        AND COALESCE(f.c_szam, '') = COALESCE(n.c_szam, '')
        AND (
            f.norm_csaladnev = n.norm_csaladnev
            OR (n.norm_szcs_nev IS NOT NULL AND f.norm_csaladnev = n.norm_szcs_nev)
        )
)
SELECT
    a.name AS utca,
    cp.c_szam,
    cp.ferj_nev,
    cp.no_nev,
    cp.ferj_norm,
    cp.no_norm,
    cp.no_szcs_nev,
    cp.match_reason,
    (SELECT COUNT(*) FROM candidate_pairs cp2 WHERE cp2.ferj_csalad_id = cp.ferj_csalad_id) AS num_pairs_for_ferj,
    (SELECT COUNT(*) FROM candidate_pairs cp2 WHERE cp2.no_csalad_id = cp.no_csalad_id) AS num_pairs_for_no
FROM candidate_pairs cp
LEFT JOIN public.adrstreet a ON a.id = cp.c_utcaid
ORDER BY utca, cp.c_szam, cp.ferj_nev;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. MERGE — STRICT (1-1 single-parent)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _merge_results (
    phase text,
    ferj_csalad_id int,
    no_csalad_id int,
    action text,
    notes text
) ON COMMIT DROP;

DO $merge_strict$
DECLARE
    pair_rec record;
BEGIN
    IF auth.uid() IS NULL THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            RAISE EXCEPTION 'Studio bypass csak superuser-ből engedett.';
        END IF;
    END IF;

    FOR pair_rec IN
        WITH single_parent_at_addr AS (
            SELECT
                c.id AS csalad_id,
                c.c_utcaid,
                c.c_szam,
                CASE WHEN c.id_ferfi IS NOT NULL THEN c.id_ferfi ELSE c.id_no END AS head_szemely_id,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi
            FROM public.csalad c
            INNER JOIN public.szemely head
                ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE
                head.isvisible = true
                AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
                AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
        ),
        addr_groups AS (
            SELECT
                c_utcaid, c_szam,
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
            UPDATE public.csalad
            SET id_no = pair_rec.no_szemely_id
            WHERE id = pair_rec.ferj_csalad_id;

            UPDATE public.gyerek
            SET id_csalad = pair_rec.ferj_csalad_id
            WHERE id_csalad = pair_rec.no_csalad_id;

            DELETE FROM public.csalad WHERE id = pair_rec.no_csalad_id;

            UPDATE public.szemely
            SET csaladfo = false
            WHERE id = pair_rec.no_szemely_id;

            INSERT INTO _merge_results VALUES ('STRICT', pair_rec.ferj_csalad_id, pair_rec.no_csalad_id, 'merged', NULL);
        EXCEPTION WHEN unique_violation THEN
            INSERT INTO _merge_results VALUES ('STRICT', pair_rec.ferj_csalad_id, pair_rec.no_csalad_id, 'skipped',
                'UNIQUE: id_no/id_ferfi már használva');
        END;
    END LOOP;
END;
$merge_strict$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. MERGE — NÉV-PÁROSÍTÁS (azonos vezetéknév vagy lánykori név)
-- ════════════════════════════════════════════════════════════════════════════

DO $merge_namematch$
DECLARE
    pair_rec record;
BEGIN
    FOR pair_rec IN
        WITH single_parent_at_addr AS (
            SELECT
                c.id AS csalad_id,
                c.c_utcaid,
                c.c_szam,
                head.id AS head_szemely_id,
                head.csaladnev,
                head.szcs_nev,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi
            FROM public.csalad c
            INNER JOIN public.szemely head
                ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE
                head.isvisible = true
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
                f.csalad_id AS ferj_csalad_id,
                n.csalad_id AS no_csalad_id,
                f.head_szemely_id AS ferj_szemely_id,
                n.head_szemely_id AS no_szemely_id
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
        SELECT * FROM unique_pairs
        ORDER BY ferj_csalad_id
    LOOP
        BEGIN
            UPDATE public.csalad
            SET id_no = pair_rec.no_szemely_id
            WHERE id = pair_rec.ferj_csalad_id;

            UPDATE public.gyerek
            SET id_csalad = pair_rec.ferj_csalad_id
            WHERE id_csalad = pair_rec.no_csalad_id;

            DELETE FROM public.csalad WHERE id = pair_rec.no_csalad_id;

            UPDATE public.szemely
            SET csaladfo = false
            WHERE id = pair_rec.no_szemely_id;

            INSERT INTO _merge_results VALUES ('NAMEMATCH', pair_rec.ferj_csalad_id, pair_rec.no_csalad_id, 'merged', NULL);
        EXCEPTION WHEN unique_violation THEN
            INSERT INTO _merge_results VALUES ('NAMEMATCH', pair_rec.ferj_csalad_id, pair_rec.no_csalad_id, 'skipped',
                'UNIQUE: id_no/id_ferfi már használva');
        END;
    END LOOP;
END;
$merge_namematch$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. LOOSE LINK — egyértelmű 1 jelölt cím-egyezésen
-- ════════════════════════════════════════════════════════════════════════════

DO $loose_link$
DECLARE
    sp_rec record;
    cand_count int;
    cand_id int;
BEGIN
    FOR sp_rec IN
        SELECT
            c.id AS csalad_id,
            c.c_utcaid,
            c.c_szam,
            head.id AS head_id,
            head.ferfi AS head_ferfi,
            head.congregation_id,
            (c.id_no IS NULL) AS need_no
        FROM public.csalad c
        INNER JOIN public.szemely head
            ON head.id = COALESCE(c.id_ferfi, c.id_no)
        WHERE
            head.isvisible = true
            AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
            AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
            AND c.c_utcaid IS NOT NULL
        ORDER BY c.id
    LOOP
        SELECT COUNT(*), MAX(s.id) INTO cand_count, cand_id
        FROM public.szemely s
        WHERE s.congregation_id = sp_rec.congregation_id
          AND s.isvisible = true
          AND s.id <> sp_rec.head_id
          AND s.c_utcaid = sp_rec.c_utcaid
          AND COALESCE(s.c_szam, '') = COALESCE(sp_rec.c_szam, '')
          AND s.ferfi <> sp_rec.head_ferfi
          AND s.csaladfo = false
          AND NOT EXISTS (
              SELECT 1 FROM public.csalad c2
              WHERE c2.id_ferfi = s.id OR c2.id_no = s.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
          )
          AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date);

        IF cand_count = 1 THEN
            BEGIN
                IF sp_rec.need_no THEN
                    UPDATE public.csalad SET id_no = cand_id WHERE id = sp_rec.csalad_id;
                ELSE
                    UPDATE public.csalad SET id_ferfi = cand_id WHERE id = sp_rec.csalad_id;
                END IF;
                INSERT INTO _merge_results VALUES ('LOOSE', sp_rec.csalad_id, NULL, 'linked', 'spouse_id=' || cand_id);
            EXCEPTION WHEN unique_violation THEN
                INSERT INTO _merge_results VALUES ('LOOSE', sp_rec.csalad_id, NULL, 'skipped',
                    'UNIQUE: spouse_id=' || cand_id || ' already in use');
            END;
        ELSIF cand_count > 1 THEN
            INSERT INTO _merge_results VALUES ('LOOSE', sp_rec.csalad_id, NULL, 'skipped_ambiguous',
                cand_count || ' jelölt');
        END IF;
    END LOOP;
END;
$loose_link$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. ÖSSZEGZÉS a TEMP tábla alapján (ELŐTT a COMMIT, mert ON COMMIT DROP)
-- ════════════════════════════════════════════════════════════════════════════

SELECT phase, action, COUNT(*) AS db
FROM _merge_results
GROUP BY phase, action
ORDER BY phase, action;

-- Részletes lista (max 30)
SELECT * FROM _merge_results LIMIT 30;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. ELLENŐRZÉS — javított ÖSSZEGZÉS
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
    SELECT
        c.id AS csalad_id,
        c.c_utcaid, c.c_szam,
        head.csaladnev || ' ' || head.k_nev AS nev,
        head.ferfi
    FROM public.csalad c
    INNER JOIN public.szemely head ON head.id = COALESCE(c.id_ferfi, c.id_no)
    WHERE head.isvisible = true
      AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
      AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
      AND c.c_utcaid IS NOT NULL
)
SELECT
    a.name AS utca,
    sp.c_szam AS hazszam,
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
