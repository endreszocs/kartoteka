-- KARTOTEKA — EGYETLEN lekérdezés: hol tart a 2026-08-11-i biztonsági kör?
--
-- MIÉRT ÍGY: a Supabase SQL Editor több utasításnál CSAK AZ UTOLSÓ eredményét
-- mutatja. Ez a fájl EGYETLEN SELECT — bármit is jelölsz ki, ez jön vissza.
--
-- MIRE VÁLASZOL:
--   1. Lefutott-e VALÓJÁBAN a security-definer-hardening? (A hibaüzenet, amit
--      kaptál, a COMMIT UTÁNI támadás-szimulációból jött — az a hiba a SIKER
--      jele. De ne tippeljünk: ez megméri.)
--   2. Milyen állapotban van a csalad/gyerek RLS-feloldó?
--   3. Készen áll-e a globális-hozzáférés szűkítés futtatására a rendszer?
--
-- HOGYAN OLVASD: minden sornál az `ertek` és a `vart` oszlopot hasonlítsd össze.
--   „✅" = rendben, „❌" = ide kell nézni.

SELECT x.sorrend,
       x.mit_mer,
       x.ertek,
       x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (

  -- ══ 1. RÉSZ — lefutott-e a security-definer-hardening? ═══════════════════
  -- Ha a törzsben ott a magyar hibaüzenet, a CREATE OR REPLACE lefutott ÉS
  -- COMMIT-elt. Ha nem, a tranzakció visszagördült.

  SELECT 101 AS sorrend,
         'security-hardening: get_csaladok kapuja a törzsben'::text AS mit_mer,
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%Nincs bejelentkezett felhasználó%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'get_csaladok_for_congregation' LIMIT 1), 'nincs ilyen fv')::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 102, 'security-hardening: get_gyerek kapuja a törzsben',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%Nincs bejelentkezett felhasználó%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'get_gyerek_for_congregation' LIMIT 1), 'nincs ilyen fv'), 'true'

  UNION ALL SELECT 103, 'security-hardening: next_chitanta_full kapuja',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%Nincs bejelentkezett felhasználó%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'next_chitanta_full' LIMIT 1), 'nincs ilyen fv'), 'true'

  UNION ALL SELECT 104, 'security-hardening: anyakonyvi szam kapuja',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%Nincs bejelentkezett felhasználó%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'generate_egyhazi_anyakonyvi_szam' LIMIT 1), 'nincs ilyen fv'), 'true'

  UNION ALL SELECT 105, 'security-hardening: merge_spouses_bulk ELDOBVA',
         (to_regprocedure('public.merge_spouses_bulk()') IS NULL)::text, 'true'

  -- FIGYELEM (2026-08-11): a has_function_privilege(...) SZÖVEGES aláírással
  -- 42883 KIVÉTELT dob, ha a függvény nem létezik — és ezzel az EGÉSZ ellenőrző
  -- lekérdezés elszáll. Ezért mindenhol pg_proc-ból, oid-dal kérdezünk, és a
  -- „nincs ilyen fv" eset SZABÁLYOS ÉRTÉK, nem hiba.
  UNION ALL SELECT 106, 'security-hardening: anon NEM hivhatja a csalad-RPC-t',
         COALESCE((SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text
                   FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                     AND p.proname = 'get_csaladok_for_congregation' LIMIT 1),
                  'nincs ilyen fv'), 'false'

  UNION ALL SELECT 107, 'security-hardening: authenticated NEM IRHAT az audit_log-ba',
         COALESCE(has_table_privilege('authenticated',
                    to_regclass('public.audit_log'), 'INSERT')::text,
                  'nincs ilyen tabla'), 'false'

  -- ══ 2. RÉSZ — a korábbi körök állapota ═══════════════════════════════════

  -- A belső kereső aláírása: (text, text, text, date, integer, uuid).
  -- Névre keresünk, nem aláírásra — így egy jövőbeli paraméter-változás sem
  -- töri el az ellenőrzőt.
  UNION ALL SELECT 201, 'cross-match: belso (orzetlen) kereso REJTVE authenticated elol',
         COALESCE((SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                   FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                     AND p.proname = 'find_cross_congregation_match_internal' LIMIT 1),
                  'nincs ilyen fv'), 'false'

  UNION ALL SELECT 204, 'cross-match: az ORZOTT kereso letezik (ezt hivja az app)',
         (EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                  AND p.proname = 'find_potential_cross_congregation_match'))::text, 'true'

  UNION ALL SELECT 205, 'cross-match: lelkesz-elerhetoseg kapuja a torzsben',
         COALESCE((SELECT (pg_get_functiondef(p.oid) LIKE '%current_user_is_active_staff%')::text
                   FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                     AND p.proname = 'get_cross_match_pastor_contacts'
                   ORDER BY p.pronargs DESC LIMIT 1), 'nincs ilyen fv'), 'true'

  UNION ALL SELECT 202, 'profiles-szukites: a szeles (10.) ag KIKERULT',
         COALESCE((SELECT (pg_get_functiondef(oid) NOT LIKE '%-- (10)%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'profil_lathato_e' LIMIT 1), 'nincs ilyen fv'), 'true'

  UNION ALL SELECT 203, 'kerulet: taglétszám-összesítő letezik',
         (to_regprocedure('public.district_member_counts(uuid)') IS NOT NULL)::text, 'true'

  -- ══ 3. RÉSZ — készen áll-e a globális szűkítés? ══════════════════════════

  UNION ALL SELECT 301, 'globalis: has_global_access MEG a regi (esperes is benne)',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%esperes%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'current_user_has_global_access' LIMIT 1), 'nincs ilyen fv'),
         'true'   -- true = MEG NEM futott a szukites (ez a mai, varhato allapot)

  UNION ALL SELECT 302, 'globalis: csalad-feloldo MEG a szuk (fazis-0) torzs',
         COALESCE((SELECT (pg_get_functiondef(oid) NOT LIKE '%can_access_congregation%')::text
                   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                     AND proname = 'csalad_resolves_to_accessible_cong' LIMIT 1), 'nincs ilyen fv'),
         'true'   -- true = a 2/0 alszakasz fogja atirni, EGY tranzakcioban

  UNION ALL SELECT 303, 'globalis: mindket feloldo LETEZIK (kotelezo)',
         ((to_regprocedure('public.csalad_resolves_to_accessible_cong(integer,integer)') IS NOT NULL)
          AND (to_regprocedure('public.gyerek_resolves_to_accessible_cong(integer,integer)') IS NOT NULL))::text,
         'true'

  UNION ALL SELECT 304, 'globalis: RLS BE van kapcsolva a 7 kritikus tablan',
         (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN ('szemely','befizetes','kiadas','csalad','gyerek','profiles','profile_roles')
            AND c.relrowsecurity = false), '0'

  UNION ALL SELECT 305, 'globalis: esperes/megyei admin EGYHAZMEGYE NELKUL (vakra menne)',
         (SELECT count(*)::text FROM public.profiles p
          WHERE p.status = 'active'
            AND p.role IN ('esperes','egyhazmegyei_admin')
            AND p.diocese_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                            WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                              AND pr.role IN ('esperes','egyhazmegyei_admin')
                              AND pr.active = true AND pr.approval_status = 'approved'
                              AND pr.scope_id IS NOT NULL)), '0'

  UNION ALL SELECT 306, 'globalis: kerueleti admin EGYHAZKERULET NELKUL (vakra menne)',
         (SELECT count(*)::text FROM public.profiles p
          WHERE p.status = 'active'
            AND p.role = 'egyhazkeruleti_admin'
            AND p.district_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                            WHERE pr.profile_id = p.id AND pr.scope = 'district'
                              AND pr.role = 'egyhazkeruleti_admin'
                              AND pr.active = true AND pr.approval_status = 'approved'
                              AND pr.scope_id IS NOT NULL)), '0'

  UNION ALL SELECT 307, 'globalis: maradt-e NYITOTT (USING true) policy a kritikus tablakon',
         (SELECT count(*)::text FROM pg_policies
          WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
            AND 'authenticated' = ANY(roles)
            AND tablename IN ('szemely','befizetes','kiadas','csalad','gyerek',
                              'presbiter','felmentes','csoport','profiles','profile_roles')
            AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true')), '0'

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT JELENT AZ EREDMÉNY
-- ════════════════════════════════════════════════════════════════════════════
--
-- 101–107 mind ✅  → a security-definer-hardening LEFUTOTT és COMMIT-elt.
--                     A kapott hibaüzenet a COMMIT UTÁNI támadás-szimuláció
--                     volt, és a HIBA ott a helyes eredmény. Nincs teendő.
-- Ha 101–107 közül bármelyik ❌ → a tranzakció visszagördült, futtasd újra a
--                     fájlt a `-- ELLENŐRZÉS 3` blokk NÉLKÜL (az utolsó ~30 sor).
--
-- 302 ✅ (true)     → várt: a csalad-feloldó még a régi törzs. A globális
--                     szűkítés 2/0 alszakasza ezt MAGA írja át, ugyanabban a
--                     tranzakcióban. Külön fájlt NEM kell futtatnod.
--
-- 305 / 306 ❌      → ÁLLJ MEG. Ennyi aktív felhasználónak nincs feloldható
--                     egyházmegyéje/kerülete; a szűkítés után ÜRES felülettel
--                     lépnének be. Előbb rendeld hozzá őket az /admin oldalon.
--
-- 307 ❌            → maradt nyitott policy; a szűkítésnek nem lenne hatása.
--                     Küldd vissza az eredményt.
