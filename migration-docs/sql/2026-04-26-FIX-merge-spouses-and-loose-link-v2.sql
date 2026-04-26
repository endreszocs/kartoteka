-- KARTOTEKA — Hiányzó házastársak javítása v2 (BIZTOS-PÁROK ONLY)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A v1 hibája:
-- A v1 minden férj-fő × feleség-fő párosítást MERGE-elt egy címen, de a
-- valóságban sok címen TÖBB CSALÁD lakik (kollégiumi ház, bérház, többgenerációs
-- családi ház). Pl. Főút 144 = 4 férj + 2 nő, Templom 235 = 4 Kádár-férfi + 1
-- Kádár Katalin. Az UNIQUE constraint (csalad_id_no_idx) mentett meg minket —
-- a 2. MERGE már fail-elt mert "id_no=898 already exists".
--
-- v2 algoritmus — SZIGORÚ KÉTOLDALÚ EGYÉRTELMŰSÉG:
--   A. MERGE csak akkor, ha a (c_utcaid, c_szam)-on EGYETLEN férj-fő single-parent
--      ÉS EGYETLEN feleség-fő single-parent van (1-1 pár, biztos)
--   B. Vagy: ha több is van, de a férj-feleség párosítás **azonos családnévvel**
--      (vagy a nő `szcs_nev` = férj `csaladnev`) egyértelműen 1-1 (pl. Benkő-Benkő,
--      Kiss-Kiss, Kádár-Kádár — ahol más vezetéknevű nem zavarja össze)
--   C. LOOSE LINK: maradt single-parent csalad-okhoz egyetlen jelölt cím-egyezés
--      → de a SZIGORÚ KÉTIRÁNYÚ EGYÉRTELMŰSÉG itt is alkalmazva
--
-- BIZTONSÁG:
--   - Studio bypass: superuser role-ban auth.uid() NULL is megengedett
--   - A nem-egyértelmű címeket NEM bántjuk → manuális rendezés a Családok tabon
--   - Tranzakcionális: minden lépés rollback-elhető ha hiba

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- A. MERGE — STRICT (1-1 single-parent ugyanazon címen, mindkét oldalon egyedi)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Lépések minden ilyen párnál:
--   1. férj-csalad.id_no := feleség szemely.id
--   2. gyerekek a feleség-csalad-ból → férj-csalad-ba (általában 0)
--   3. feleség-csalad DELETE
--   4. feleség-szemely.csaladfo := false

DO $merge_strict$
DECLARE
    pair_rec record;
    merged_count int := 0;
    moved_children int := 0;
    skipped_ambiguous int := 0;
BEGIN
    -- Studio bypass check
    IF auth.uid() IS NULL THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            RAISE EXCEPTION 'Studio bypass csak superuser-ből engedett.';
        END IF;
    END IF;

    -- (c_utcaid, c_szam) tuple ahol PONTOSAN 1 férj-fő single-parent ÉS PONTOSAN
    -- 1 feleség-fő single-parent → biztos pár
    FOR pair_rec IN
        WITH single_parent_at_addr AS (
            SELECT
                c.id AS csalad_id,
                c.c_utcaid,
                c.c_szam,
                CASE WHEN c.id_ferfi IS NOT NULL THEN c.id_ferfi ELSE c.id_no END AS head_szemely_id,
                (c.id_ferfi IS NOT NULL) AS head_is_ferfi,
                head.congregation_id
            FROM public.csalad c
            INNER JOIN public.szemely head
                ON head.id = COALESCE(c.id_ferfi, c.id_no)
            WHERE
                head.isvisible = true
                AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
                -- a single-parent oldalakon mindig az egyik NULL
                AND NOT (c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL)
        ),
        addr_groups AS (
            SELECT
                c_utcaid,
                c_szam,
                COUNT(*) FILTER (WHERE head_is_ferfi) AS num_ferj,
                COUNT(*) FILTER (WHERE NOT head_is_ferfi) AS num_no,
                MAX(csalad_id) FILTER (WHERE head_is_ferfi) AS ferj_csalad_id,
                MAX(csalad_id) FILTER (WHERE NOT head_is_ferfi) AS no_csalad_id,
                MAX(head_szemely_id) FILTER (WHERE head_is_ferfi) AS ferj_szemely_id,
                MAX(head_szemely_id) FILTER (WHERE NOT head_is_ferfi) AS no_szemely_id
            FROM single_parent_at_addr
            WHERE c_utcaid IS NOT NULL  -- NULL címen NINCS biztos pár
            GROUP BY c_utcaid, c_szam
        )
        SELECT
            ferj_csalad_id,
            no_csalad_id,
            ferj_szemely_id,
            no_szemely_id
        FROM addr_groups
        WHERE num_ferj = 1 AND num_no = 1
        ORDER BY ferj_csalad_id
    LOOP
        BEGIN
            -- 1. férj-csalad-ba beírjuk a feleség id-t
            UPDATE public.csalad
            SET id_no = pair_rec.no_szemely_id
            WHERE id = pair_rec.ferj_csalad_id;

            -- 2. feleség-csalad gyerekei áthelyezve férj-csalad-ba
            UPDATE public.gyerek
            SET id_csalad = pair_rec.ferj_csalad_id
            WHERE id_csalad = pair_rec.no_csalad_id;

            GET DIAGNOSTICS moved_children = ROW_COUNT;

            -- 3. feleség-csalad törlés
            DELETE FROM public.csalad WHERE id = pair_rec.no_csalad_id;

            -- 4. csaladfo = false
            UPDATE public.szemely
            SET csaladfo = false
            WHERE id = pair_rec.no_szemely_id;

            merged_count := merged_count + 1;
        EXCEPTION WHEN unique_violation THEN
            skipped_ambiguous := skipped_ambiguous + 1;
            RAISE NOTICE 'Skipped pair (UNIQUE): férj-csalad % + nő-csalad % — id_no/id_ferfi already used',
                pair_rec.ferj_csalad_id, pair_rec.no_csalad_id;
        END;
    END LOOP;

    RAISE NOTICE 'STRICT MERGE: % házaspár összevonva (% gyerek áthelyezve, % skip-elt UNIQUE-miatt)',
        merged_count, moved_children, skipped_ambiguous;
END;
$merge_strict$;

-- ────────────────────────────────────────────────────────────────────────────
-- B. MERGE — NÉV-PÁROSÍTÁS (több családos cím, de azonos vezetéknév 1-1 pár)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Pl. Templom 235 = 4 Kádár-férfi + 1 Kádár Katalin → nem MERGE-elhető
-- automatikusan (4 jelölt férj). DE pl. 156 Kiss Csaba ↔ 159 Kiss Irma esetén
-- a Kiss-Kiss név-egyezés egyértelmű (a Főút 33-en csak Kicsi Gergely van még
-- mint férj — más családnév).
--
-- Algoritmus: minden (c_utcaid, c_szam, vezetéknév)-csoportban, ahol PONTOSAN
-- 1 férj-fő single-parent és PONTOSAN 1 feleség-fő single-parent van AZONOS
-- családnévvel → MERGE.
--
-- A nő szcs_nev (lánykori név) is matchelhet a férj családnevével.

DO $merge_namematch$
DECLARE
    pair_rec record;
    merged_count int := 0;
    moved_children int := 0;
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
                head.id AS head_szemely_id,
                head.csaladnev,
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
                -- Csak ami már NEM lett MERGE-elve a fenti A részben
                AND NOT EXISTS (
                    SELECT 1 FROM public.csalad c2
                    WHERE c2.id = c.id
                      AND c2.id_ferfi IS NOT NULL
                      AND c2.id_no IS NOT NULL
                )
        ),
        ferj_at_addr AS (
            SELECT
                c_utcaid, c_szam,
                public.normalize_name(csaladnev) AS norm_csaladnev,
                csalad_id, head_szemely_id, csaladnev
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
                csalad_id, head_szemely_id, csaladnev
            FROM single_parent_at_addr
            WHERE NOT head_is_ferfi
              AND c_utcaid IS NOT NULL
              AND csaladnev IS NOT NULL
        ),
        candidate_pairs AS (
            -- férj × nő ugyanazon címen, ahol VAGY azonos családnév, VAGY a nő
            -- lánykori neve = férj családneve
            SELECT
                f.csalad_id AS ferj_csalad_id,
                n.csalad_id AS no_csalad_id,
                f.head_szemely_id AS ferj_szemely_id,
                n.head_szemely_id AS no_szemely_id,
                f.c_utcaid, f.c_szam, f.norm_csaladnev
            FROM ferj_at_addr f
            INNER JOIN no_at_addr n
                ON f.c_utcaid = n.c_utcaid
                AND COALESCE(f.c_szam, '') = COALESCE(n.c_szam, '')
                AND (
                    f.norm_csaladnev = n.norm_csaladnev  -- azonos családnév
                    OR (n.norm_szcs_nev IS NOT NULL AND f.norm_csaladnev = n.norm_szcs_nev)  -- lánykori név
                )
        ),
        unique_pairs AS (
            -- Csak akkor használjuk, ha a férj-feleség párosítás KÉTOLDALÚ
            -- egyértelmű — a férj-csalad EGY nőhöz, és a nő-csalad EGY férjhez
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

            GET DIAGNOSTICS moved_children = ROW_COUNT;

            DELETE FROM public.csalad WHERE id = pair_rec.no_csalad_id;

            UPDATE public.szemely
            SET csaladfo = false
            WHERE id = pair_rec.no_szemely_id;

            merged_count := merged_count + 1;
        EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE 'Skipped name-match pair (UNIQUE): férj-csalad % + nő-csalad %',
                pair_rec.ferj_csalad_id, pair_rec.no_csalad_id;
        END;
    END LOOP;

    RAISE NOTICE 'NÉV-PÁROSÍTÁS MERGE: % házaspár összevonva (% gyerek áthelyezve)',
        merged_count, moved_children;
END;
$merge_namematch$;

-- ────────────────────────────────────────────────────────────────────────────
-- C. LOOSE LINK — single-parent csalad-okhoz egyértelmű cím-alapú jelölt
-- ────────────────────────────────────────────────────────────────────────────
--
-- Itt már nem TWO single-parent csalad-ról beszélünk (azokat A és B megoldotta),
-- hanem egy single-parent csalad-ról ahol a házastárs még nincs ki egyetlen
-- csalad-rekordban sem, csak szemely-ben létezik.
--
-- Csak akkor LINK, ha a férj-csalad-hoz ugyanazon címen EGYETLEN másnemű felnőtt
-- szemely van aki:
--   - NEM csaladfo (mert akkor az saját csalad-fő lenne, és a B részben kezeltük)
--   - NEM gyerek máshol
--   - Felnőtt
--   - Sehol nem szerepel csalad-ban

DO $loose_link$
DECLARE
    sp_rec record;
    cand_count int;
    cand_id int;
    linked_count int := 0;
    skipped_ambiguous int := 0;
    skipped_no_candidate int := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            RAISE EXCEPTION 'Studio bypass csak superuser-ből engedett.';
        END IF;
    END IF;

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
          AND s.csaladfo = false  -- STRICT: csak NEM-csaladfo szemely
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
                linked_count := linked_count + 1;
            EXCEPTION WHEN unique_violation THEN
                skipped_ambiguous := skipped_ambiguous + 1;
            END;
        ELSIF cand_count > 1 THEN
            skipped_ambiguous := skipped_ambiguous + 1;
        ELSE
            skipped_no_candidate := skipped_no_candidate + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'LOOSE LINK: % új házastárs csatolva, % többes jelölt kihagyva, % nincs jelölt',
        linked_count, skipped_ambiguous, skipped_no_candidate;
END;
$loose_link$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS — javított ÖSSZEGZÉS
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Csak férj (id_ferfi van, id_no NULL)' AS metric, COUNT(*) AS db
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NULL
UNION ALL SELECT 'Csak feleség (id_no van, id_ferfi NULL)', COUNT(*)
    FROM public.csalad WHERE id_no IS NOT NULL AND id_ferfi IS NULL
UNION ALL SELECT 'Házaspár (mindkettő van)', COUNT(*)
    FROM public.csalad WHERE id_ferfi IS NOT NULL AND id_no IS NOT NULL
UNION ALL SELECT 'Üres csalad', COUNT(*)
    FROM public.csalad WHERE id_ferfi IS NULL AND id_no IS NULL
UNION ALL SELECT '— Összesen csalad rekord:', COUNT(*) FROM public.csalad;

-- ════════════════════════════════════════════════════════════════════════════
-- MARADT KÉTSZÁLÚ DUPLIKÁCIÓ — manuális rendezés szükséges
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ezeket a felhasználó kell rendezze a Családok tab szerkesztő modaljából.
-- Pl. "Templom 235 / Kádár Katalin": melyik Kádár-férfival házas?

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
   AND (COUNT(*) FILTER (WHERE sp.ferfi) > 1 OR COUNT(*) FILTER (WHERE NOT sp.ferfi) > 1)
ORDER BY utca, hazszam;
