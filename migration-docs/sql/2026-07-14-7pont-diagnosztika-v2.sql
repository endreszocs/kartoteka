-- ============================================================================
-- Kartotéka — 7-pont diagnosztika V2  (EGYETLEN eredmény-tábla, READ-ONLY)
-- 2026-07-14 — a Supabase SQL editor csak az utolsó statement eredményét mutatja,
-- ezért itt minden ellenőrzés EGY lekérdezésbe van vonva. Futtasd, és küldd vissza
-- a teljes (ellenorzes, eredmeny) táblát.
-- ============================================================================
SELECT * FROM (
  VALUES
  -- 3. FB / avatar infrastruktúra
  ('3a_szemely_social_col',   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='szemely' AND column_name='social_profil_url')::text),
  ('3a_szemely_kep_col',      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='szemely' AND column_name='kep')::text),
  ('3a_avatars_bucket_public',(SELECT count(*) FROM storage.buckets WHERE id='avatars' AND public)::text),
  ('3a_avatars_policies',     (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE 'avatars%')::text),
  ('3b_van_fenykep',          (SELECT count(*) FROM public.szemely WHERE kep IS NOT NULL)::text),
  ('3b_van_fb_link',          (SELECT count(*) FROM public.szemely WHERE social_profil_url IS NOT NULL)::text),
  -- 4. Family-link mód RPC
  ('4_infer_rpc_letezik',     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='infer_family_links_for_congregation')::text),
  ('4_infer_branchel_mode',   (SELECT (pg_get_functiondef(p.oid) ~* 'moderate|aggressive') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='infer_family_links_for_congregation' LIMIT 1)::text),
  -- 6. Kereszt-gyülekezeti identitás — DB-objektumok
  ('6a_find_match_rpc',       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='find_potential_cross_congregation_match')::text),
  ('6a_resolve_rpc',          (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='resolve_cross_congregation_match')::text),
  ('6a_gen_egyhazi_cnp_rpc',  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='generate_egyhazi_cnp')::text),
  ('6a_notif_tabla',          coalesce((to_regclass('public.cross_congregation_match_notifications'))::text, 'NINCS')),
  ('6a_trigger_letezik',      (SELECT count(*) FROM pg_trigger WHERE tgrelid = to_regclass('public.szemely')::oid AND tgname='szemely_check_cross_congregation')::text),
  -- 6b. Közös-identitás oszlop (0 = még nincs → 2. fázisban építjük)
  ('6b_person_identity_id',   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='szemely' AND column_name='person_identity_id')::text),
  -- 6c. Rögzített-e valaha a detektor éles adaton?
  ('6c_notif_osszes',         (SELECT count(*) FROM public.cross_congregation_match_notifications)::text),
  -- 6d. CNP-séma megoszlás
  ('6d_cnp_EC_import',        (SELECT count(*) FROM public.szemely WHERE isvisible IS NOT FALSE AND cnp LIKE 'EC-%')::text),
  ('6d_cnp_999_kezi',         (SELECT count(*) FROM public.szemely WHERE isvisible IS NOT FALSE AND cnp LIKE '999%')::text),
  ('6d_cnp_egyeb',            (SELECT count(*) FROM public.szemely WHERE isvisible IS NOT FALSE AND cnp NOT LIKE 'EC-%' AND cnp NOT LIKE '999%')::text),
  -- 6e/6f. Valós kereszt-gyülekezeti „azonos személy" jelöltek MA
  ('6e_azonos_nev_datum',     (SELECT count(*) FROM (SELECT 1 FROM public.szemely WHERE isvisible IS NOT FALSE AND csaladnev<>'' AND k_nev<>'' AND sz_datum IS NOT NULL GROUP BY lower(btrim(csaladnev)), lower(btrim(k_nev)), sz_datum HAVING count(DISTINCT congregation_id)>1) q)::text),
  ('6f_azonos_nev_datum_hely',(SELECT count(*) FROM (SELECT 1 FROM public.szemely WHERE isvisible IS NOT FALSE AND csaladnev<>'' AND k_nev<>'' AND sz_datum IS NOT NULL GROUP BY lower(btrim(csaladnev)), lower(btrim(k_nev)), sz_datum, sz_helyid HAVING count(DISTINCT congregation_id)>1) q)::text)
) AS t(ellenorzes, eredmeny);
