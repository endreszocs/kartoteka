-- ============================================================================
-- Kartotéka — 7-pont diagnosztika  (READ-ONLY, PII-mentes)
-- 2026-07-14 — futtasd a Kartotéka Supabase SQL editorában, az eredményt küldd vissza.
-- Semmit NEM ír / módosít. Ha egy oszlopnév hibát dob, küldd a hibaüzenetet — abból is tanulunk.
-- Lefedi: 3. pont (FB-avatar), 4. pont (family-link módok), 6. pont (kereszt-gyülekezeti identitás).
-- ============================================================================

-- ==== 3. FB / avatar infrastruktúra =========================================
-- 3a) Megvannak-e az oszlopok + a publikus 'avatars' bucket + a policy-k?
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='szemely' AND column_name='social_profil_url') AS szemely_social_col,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='szemely' AND column_name='kep')                AS szemely_kep_col,
  (SELECT count(*) FROM storage.buckets  WHERE id='avatars' AND public)                                                                       AS avatars_bucket_public,
  (SELECT count(*) FROM pg_policies      WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE 'avatars%')                  AS avatars_policies;

-- 3b) Van-e egyáltalán mentett fénykép, vagy csak link? (kep=fénykép, social=link)
SELECT
  count(*) FILTER (WHERE kep IS NOT NULL)               AS van_fenykep,
  count(*) FILTER (WHERE social_profil_url IS NOT NULL) AS van_fb_link,
  count(*)                                              AS osszes_szemely
FROM public.szemely;

-- ==== 4. Family-link mód RPC: branch-el-e a `mode`-ra? ======================
SELECT p.proname,
       (pg_get_functiondef(p.oid) ILIKE '%mode%')                              AS emliti_a_mode_ot,
       (pg_get_functiondef(p.oid) ~* 'moderate|aggressive|mersekelt|agressziv') AS van_tobb_mod_ag
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='infer_family_links_for_congregation';

-- ==== 6. Kereszt-gyülekezeti identitás ======================================
-- 6a) Élnek-e a DB-objektumok (RPC-k, tábla, trigger)?
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('find_potential_cross_congregation_match','resolve_cross_congregation_match','generate_egyhazi_cnp');

SELECT to_regclass('public.cross_congregation_match_notifications') AS ertesito_tabla;

SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid='public.szemely'::regclass AND tgname='szemely_check_cross_congregation';

-- 6b) Létezik-e már a közös-identitás oszlop? (0 = még nincs → ezt kell megépíteni)
SELECT count(*) AS van_person_identity_id
FROM information_schema.columns
WHERE table_schema='public' AND table_name='szemely' AND column_name='person_identity_id';

-- 6c) Rögzített-e valaha bármit a detektor éles adaton?
SELECT resolution, confidence, count(*)
FROM public.cross_congregation_match_notifications
GROUP BY 1,2 ORDER BY 3 DESC;

-- 6d) CNP-séma megoszlás a látható tagoknál (kézi 999 vs. import EC-)
SELECT CASE WHEN cnp LIKE 'EC-%' THEN 'EC (import)'
            WHEN cnp LIKE '999%'  THEN '999 (kézi)'
            ELSE 'egyéb' END AS cnp_sema,
       count(*)
FROM public.szemely
WHERE isvisible IS NOT FALSE
GROUP BY 1 ORDER BY 2 DESC;

-- 6e) Hány VALÓS kereszt-gyülekezeti "azonos személy" jelölt van MA?
--     (családnév + keresztnév + szül.dátum aláírás, ami >1 gyülekezetben előfordul)
SELECT count(*) AS kereszt_gyulekezeti_csoportok
FROM (
  SELECT lower(btrim(csaladnev)) fn, lower(btrim(k_nev)) gn, sz_datum
  FROM public.szemely
  WHERE isvisible IS NOT FALSE AND csaladnev<>'' AND k_nev<>'' AND sz_datum IS NOT NULL
  GROUP BY 1,2,3
  HAVING count(DISTINCT congregation_id) > 1
) g;

-- 6f) Ugyanaz SZÜLETÉSI HELLYEL is (szigorúbb kulcs — a te specifikációd szerint).
--     Ha a sz_helyid oszlop nem létezik, ez a lekérdezés hibát dob — jelezd, és jó a 6e).
SELECT count(*) AS kereszt_gyulekezeti_csoportok_hellyel
FROM (
  SELECT lower(btrim(csaladnev)) fn, lower(btrim(k_nev)) gn, sz_datum, sz_helyid
  FROM public.szemely
  WHERE isvisible IS NOT FALSE AND csaladnev<>'' AND k_nev<>'' AND sz_datum IS NOT NULL
  GROUP BY 1,2,3,4
  HAVING count(DISTINCT congregation_id) > 1
) g;

-- 6g) Van-e „lelkész" elérhetőség a gyülekezethez? (a lelkész-kapcsolat megjelenítéséhez)
--     A cél a helyes tábla/oszlop nevek felderítése — az eredményből építem a lelkész-join-t.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND (column_name ILIKE '%lelkesz%' OR column_name ILIKE '%pastor%'
       OR column_name ILIKE '%telefon%' OR column_name ILIKE '%email%' OR column_name ILIKE '%phone%')
  AND table_name IN ('congregations','profiles','profile_roles','szemely','gyulekezet')
ORDER BY table_name, column_name;
