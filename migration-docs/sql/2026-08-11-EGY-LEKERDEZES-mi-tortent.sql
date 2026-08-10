-- KARTOTEKA — EGYETLEN lekérdezés: MI TÖRTÉNT a teljes fájl lefuttatásakor?
--
-- HELYZET: a 2026-08-11-globalis-hozzaferes-szukites.sql EGÉSZBEN lett
-- lefuttatva. A futás a 2/B szakasz token-kapujánál HIBÁVAL megállt, tehát a
-- 2/B, a 6., a 7. és — ami a legfontosabb — a 8. (TELJES VISSZAÁLLÍTÁS)
-- szakasz NEM futott le. Az az előtte lévő szakaszok viszont igen, mindegyik
-- SAJÁT tranzakcióban, tehát külön-külön COMMIT-eltek.
--
-- EZ A LEKÉRDEZÉS CSAK OLVAS. Egyetlen SELECT — az eredménye nem nyelhető el.
--
-- HOGYAN OLVASD: `ertek` vs `vart`. „✅" = rendben. Bármelyik „❌" → küldd vissza.

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (

  -- ══ A) LEFUTOTT-E A SZŰKÍTÉS? (2. szakasz) ═══════════════════════════════

  SELECT 1 AS sorrend,
         'A1. has_global_access MAR CSAK rendszergazda (esperes KIKERULT)'::text AS mit_mer,
         COALESCE((SELECT (pg_get_functiondef(oid) NOT LIKE '%esperes%')::text
                   FROM pg_proc WHERE pronamespace='public'::regnamespace
                     AND proname='current_user_has_global_access' LIMIT 1),'nincs fv')::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'A2. can_access_congregation UJ verzio (2026-08-11 jelolo)',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%v2026-08-11-szukites%')::text
                   FROM pg_proc WHERE pronamespace='public'::regnamespace
                     AND proname='current_user_can_access_congregation' LIMIT 1),'nincs fv'), 'true'

  UNION ALL SELECT 3, 'A3. csalad-feloldo MAR a can_access_congregation-t hivja',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%can_access_congregation%')::text
                   FROM pg_proc WHERE pronamespace='public'::regnamespace
                     AND proname='csalad_resolves_to_accessible_cong' LIMIT 1),'nincs fv'), 'true'

  UNION ALL SELECT 4, 'A4. gyerek-feloldo MAR a can_access_congregation-t hivja',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%can_access_congregation%')::text
                   FROM pg_proc WHERE pronamespace='public'::regnamespace
                     AND proname='gyerek_resolves_to_accessible_cong' LIMIT 1),'nincs fv'), 'true'

  -- ══ B) MEGVANNAK-E A PÓTLÓ SZABÁLYOK? (1., 2/A, 3., 4., 5. szakasz) ══════
  -- Ha a szűkítés lefutott, de ezek hiányoznak, az esperes ÜRES felületet lát.

  UNION ALL SELECT 11, 'B1. hatokor-feloldo segedfuggvenyek (1. szakasz) — mind a 3',
         ((to_regprocedure('public.felettes_szint_hozzaferese(uuid)') IS NOT NULL)
          AND (to_regprocedure('public.felettes_szint_szerkesztheto(uuid)') IS NOT NULL)
          AND (to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NOT NULL))::text, 'true'

  UNION ALL SELECT 12, 'B2. mellekutak lezarva: profiles onras-vedelem trigger (2/A)',
         EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal
                   AND tgname='profiles_jogosultsag_vedelem_trg')::text, 'true'

  UNION ALL SELECT 13, 'B3. nevre szolo potlo policy-k (3. szakasz) — 9-bol hany',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public'
          AND policyname IN ('dioceses_update_diocese_scope','profile_roles_diocese_read_roles',
                             'profile_congregations_diocese_read','import_logs_select_diocese_scope',
                             'monetar_szint_select','document_submissions_szint_all',
                             'annual_reports_szint_select','annual_reports_szint_update',
                             'ertesitesek_szint_insert')), '9'

  UNION ALL SELECT 14, 'B4. additiv megyei/keruleti policy-k (4. szakasz) — hany tablan',
         (SELECT CASE WHEN count(DISTINCT tablename) > 0 THEN 'van (' || count(DISTINCT tablename) || ' tabla)'
                      ELSE 'NINCS EGY SEM' END
          FROM pg_policies WHERE schemaname='public' AND policyname LIKE '%\_szint\_select'),
         (SELECT CASE WHEN count(DISTINCT tablename) > 0 THEN 'van (' || count(DISTINCT tablename) || ' tabla)'
                      ELSE 'NINCS EGY SEM' END
          FROM pg_policies WHERE schemaname='public' AND policyname LIKE '%\_szint\_select')

  UNION ALL SELECT 15, 'B5. Misszios Muhely moderatori jog (5. szakasz)',
         EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND (policyname LIKE 'mm\_%\_mmmod\_%' OR policyname LIKE 'mm\_%\_mm\_moderator'))::text, 'true'

  UNION ALL SELECT 16, 'B6. storage csatolmany-olvasas (5/B szakasz)',
         EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
                 AND policyname LIKE '%\_szint\_select')::text, 'true'

  -- ══ C) NEM FUTOTT-E LE A VISSZAÁLLÍTÁS? (8. szakasz) ═════════════════════
  -- Ha a 8. szakasz lefutott volna, A1 hamis lenne ES ezek a policy-k eltuntek
  -- volna. Ez a sor kulon is megerositi.

  UNION ALL SELECT 21, 'C1. a VISSZAALLITAS NEM futott le (a potlo policy-k allnak)',
         (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND policyname LIKE '%\_szint\_select'))::text, 'true'

  -- ══ D) MŰKÖDIK-E A GYAKORLATBAN? — valódi fiókokra kiszámolva ════════════
  -- A Studióban auth.uid() = NULL, ezért NEM fuggvenyt hivunk, hanem ADATBOL
  -- szamoljuk ki, hany gyulekezetet fog latni az egyes szintek felhasznaloja.

  -- D1: a hatókör-feloldás FALLBACK-ELVŰ (ahogy a level-scope.ts is teszi):
  -- ELŐSZÖR a profile_roles sorok; a profiles.diocese_id skalár CSAK akkor
  -- számít, ha egyáltalán nincs szerepkör-sora. Tömb-indexelés nélkül.
  UNION ALL SELECT 31, 'D1. aktiv esperes/megyei admin, akinek 0 gyulekezete lenne',
         (SELECT count(*)::text FROM public.profiles p
          WHERE p.status='active'
            AND p.role IN ('esperes','egyhazmegyei_admin')
            AND NOT EXISTS (
              SELECT 1 FROM public.congregations c
              WHERE c.diocese_id IN (
                    SELECT pr.scope_id FROM public.profile_roles pr
                    WHERE pr.profile_id = p.id AND pr.scope = 'diocese'
                      AND pr.active AND pr.approval_status = 'approved'
                      AND pr.scope_id IS NOT NULL
                  UNION ALL
                    SELECT p.diocese_id
                    WHERE p.diocese_id IS NOT NULL
                      AND NOT EXISTS (
                        SELECT 1 FROM public.profile_roles pr2
                        WHERE pr2.profile_id = p.id AND pr2.scope = 'diocese'
                          AND pr2.active AND pr2.approval_status = 'approved'
                          AND pr2.scope_id IS NOT NULL)
              ))), '0'

  UNION ALL SELECT 32, 'D2. aktiv lelkesz, akinek nincs gyulekezete (valtozatlan kell legyen)',
         (SELECT count(*)::text FROM public.profiles p
          WHERE p.status='active' AND p.role='lelkesz' AND p.congregation_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.profile_roles pr
                            WHERE pr.profile_id=p.id AND pr.scope='congregation'
                              AND pr.active AND pr.approval_status='approved'
                              AND pr.scope_id IS NOT NULL)), '0'

  UNION ALL SELECT 33, 'D3. VAN-E ma keruleti ag a can_access_congregation-ben (2/B dontes)',
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%district%')::text
                   FROM pg_proc WHERE pronamespace='public'::regnamespace
                     AND proname='current_user_can_access_congregation' LIMIT 1),'nincs fv'),
         COALESCE((SELECT (pg_get_functiondef(oid) LIKE '%district%')::text
                   FROM pg_proc WHERE pronamespace='public'::regnamespace
                     AND proname='current_user_can_access_congregation' LIMIT 1),'nincs fv')

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT JELENT AZ EREDMÉNY
-- ════════════════════════════════════════════════════════════════════════════
--
-- A1–A4 ✅ ÉS B1–B6 ✅  → MINDEN RENDBEN. A szűkítés él, a pótló szabályok
--        állnak, a visszaállítás nem futott le. NINCS TEENDŐ az adatbázisban;
--        már csak a felületi próba (füst-teszt) van hátra.
--
-- A1–A4 ✅ DE B1–B6 közül bármelyik ❌  → ⛔ SÜRGŐS: a szűkítés lefutott, de a
--        pótlás hiányos. Az esperes ÜRES felületet láthat. KÜLDD VISSZA
--        AZONNAL — vagy futtasd a fájl 8. szakaszát (teljes visszaállítás).
--
-- A1 ❌ (false)  → a szűkítés NEM futott le (vagy a visszaállítás igen).
--        Ekkor a 8. szakasz lefutásának gyanúja merül fel — küldd vissza.
--
-- D1 ❌  → ennyi aktív esperesnek/megyei adminnak NULLA gyülekezete lenne.
--        Rendeld hozzá őket az /admin oldalon.
--
-- D3    → tájékoztató (nincs „helyes" érték). Ha `true`, a kerületi admin
--        SOR-szinten is lát; ha `false`, csak a taglétszám-összesítőt.
--        A 2/B szakasz akkor kell, ha `true`, és NEM ezt akarod.
