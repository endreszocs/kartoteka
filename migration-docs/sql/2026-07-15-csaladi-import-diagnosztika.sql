-- ============================================================================
-- Családi import diagnosztika — „az egyik gyülekezetnél nem sikerült"
-- 2026-07-15 — READ-ONLY. Futtasd a Kartotéka Supabase SQL editorában.
--
-- A családi importnak 3 útja van, mindegyik a LEGACY csalad+gyerek szerkezetet
-- építi (nem a haztartas-t):
--   - import_family_head_batch  (családfők + család a fájlból)
--   - import_families_from_existing_persons_batch  (meglévő személyek → családok)
--   - infer_family_links_for_congregation  (automatikus családszerkezet-összeállítás)
-- A legvalószínűbb „egy gyülekezetnél elhasal": az AUTOMATIKUS összeállító RPC
-- (drága LIKE '%név%' lekérdezések) TIMEOUT-ol a legnagyobb gyülekezeten.
--
-- ELŐSZÖR futtasd az 1) lekérdezést → ez megmutatja a kiugró (legnagyobb / üres)
-- gyülekezetet. Utána a többihez cseréld a :CONG helyére a hibás gyülekezet UUID-ját.
-- ============================================================================

-- 1) PER-GYÜLEKEZET ÁTTEKINTÉS — melyik a kiugró (timeout-veszélyes nagy / üres személyű)?
SELECT s.congregation_id,
       COUNT(*) FILTER (WHERE s.isvisible)                    AS szemely_lathato,
       COUNT(*) FILTER (WHERE s.isvisible AND s.csaladfo)     AS csaladfok,
       COUNT(*) FILTER (WHERE s.isvisible
                         AND s.apjaneve IS NOT NULL AND btrim(s.apjaneve) <> '') AS van_apjaneve,
       COUNT(*) FILTER (WHERE s.isvisible
                         AND NOT EXISTS (SELECT 1 FROM public.csalad c
                                         WHERE c.id_ferfi = s.id OR c.id_no = s.id)
                         AND NOT EXISTS (SELECT 1 FROM public.gyerek g
                                         WHERE g.id_szemely = s.id))              AS csalad_nelkul
FROM public.szemely s
GROUP BY s.congregation_id
ORDER BY szemely_lathato DESC;

-- ==== A többi lekérdezéshez: cseréld a :CONG-ot a hibás gyülekezet UUID-jára ====
--     (pl. WHERE congregation_id = '7e57...-....' )

-- 2) DELEGÁLT/GOD-MODE HOZZÁFÉRÉS a hibás gyülekezethez (lejárt = az RPC RAISE-el a legelején)
-- SELECT admin_user_id, status, expires_at, expires_at > now() AS meg_ervenyes
-- FROM public.admin_access_requests
-- WHERE congregation_id = ':CONG'
-- ORDER BY expires_at DESC;

-- 3) DUPLIKÁLT NÉV+NEM a hibás gyülekezetben (a „meglévő személyek → családok" párosítást zavarja)
-- SELECT public.normalize_name(csaladnev || ' ' || k_nev) AS norm_nev, ferfi, COUNT(*) db
-- FROM public.szemely
-- WHERE congregation_id = ':CONG' AND isvisible
-- GROUP BY 1, 2 HAVING COUNT(*) > 1
-- ORDER BY db DESC LIMIT 50;

-- 4) DUPLIKÁLT CNP a hibás gyülekezetben (per-soros 23505 hibát okoz, 0 hasznos beszúrás)
-- SELECT cnp, COUNT(*) db, array_agg(id) ids
-- FROM public.szemely
-- WHERE congregation_id = ':CONG' AND isvisible AND cnp IS NOT NULL AND cnp <> ''
-- GROUP BY cnp HAVING COUNT(*) > 1 ORDER BY db DESC;

-- 5) A csalad-házastárs indexek VALÓBAN egyediek? (a kód UNIQUE-ot feltételez)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'csalad'
  AND indexname IN ('csalad_id_ferfi_idx', 'csalad_id_no_idx');

-- 6) Pontosan EGY változata van-e minden import-RPC-nek? (elavult overload félrevezeti a PostgREST-et)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('import_family_head_batch',
                    'import_families_from_existing_persons_batch',
                    'infer_family_links_for_congregation')
ORDER BY p.proname, args;

-- 7) Van-e beállított statement_timeout az authenticated szerepre? (az auto-link timeout igazolása)
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolname IN ('authenticated', 'anon');
