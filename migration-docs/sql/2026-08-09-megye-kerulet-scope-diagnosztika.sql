-- ============================================================================
-- KARTOTEKA — EGYHÁZMEGYEI + EGYHÁZKERÜLETI SCOPE DIAGNOSZTIKA
-- Dátum: 2026-08-09 · CSAK OLVASÓ — semmit nem módosít.
--
-- Futtatás: Supabase Studio SQL Editor. SZAKASZONKÉNT futtasd (a Studio a
-- több utasításból általában csak az utolsó eredményét mutatja), és az
-- eredményeket küldd vissza.
--
-- FIGYELEM: a SQL Editor postgres-ként fut, az RLS-t NEM érvényesíti —
-- ez a szkript metaadatot és adat-integritást vizsgál, nem "user-szemmel" lát.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. CÉL-TÁBLÁK LÉTEZÉSE — ha valamelyik hiányzik, a rá vonatkozó szakaszt
--    hagyd ki (a hiányzó tábla SELECT-je hibával állna le).
-- ────────────────────────────────────────────────────────────────────────────
SELECT t.nev AS tabla,
       to_regclass('public.' || t.nev) IS NOT NULL AS letezik
FROM (VALUES
  ('congregations'), ('dioceses'), ('districts'),
  ('szemely'), ('befizetes'), ('kiadas'), ('bealitas'),
  ('lelkeszi_jelentes'), ('document_submissions'),
  ('annual_reports'), ('chitanta_tombok'),
  ('profiles'), ('profile_roles'), ('profile_congregations'),
  ('diocese_bealitas'), ('diocese_befizetes'), ('diocese_kiadas'),
  ('diocese_koltsegvetes'), ('diocese_annual_reports'),
  ('cross_congregation_match_notifications')
) AS t(nev)
ORDER BY t.nev;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. RLS HELPER FÜGGVÉNYEK — ÉLŐ DEFINÍCIÓK
--    Amit keresünk az elo_definicio-ban:
--      * current_user_has_global_access: 'member_private' szerepel-e benne
--        (P0 lefutott = szigorított) VAGY "role IN ('admin','esperes',...)"
--        (P0 NEM futott le = az esperes ORSZÁGOS írás-olvasást kap!)
--      * current_user_can_access_congregation: van-e 'egyhazkeruleti_admin' ág
--        és 'egyhazmegyei_szamvevo' ág (fazis2f-verzió), vagy hiányzik
--        (2026-07-01-OPCIONALIS felülírta → kerületi admin DB-szinten vak).
--      * esperes-DIOCESE ág: EGYIK verzióban SINCS — ha a definícióban nincs
--        diocese-hivatkozás, az megerősíti a P0/P1 hibát.
-- ────────────────────────────────────────────────────────────────────────────
SELECT p.proname AS fuggveny,
       pg_get_function_identity_arguments(p.oid) AS argumentumok,
       obj_description(p.oid, 'pg_proc') AS comment_marker,
       pg_get_functiondef(p.oid) AS elo_definicio
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'current_user_congregation_id',
    'current_user_has_global_access',
    'current_user_is_active_staff',
    'current_user_can_access_congregation',
    'current_user_can_edit_congregation',
    'csalad_resolves_to_accessible_cong',
    'gyerek_resolves_to_accessible_cong',
    'is_admin',
    'same_congregation',
    'ccm_caller_is_system_admin',
    'ccm_caller_district_ids',
    'ccm_caller_can_access_notification'
  )
ORDER BY p.proname;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. P0-ÁLLAPOT GYORSTESZT (igaz/hamis összefoglaló)
--    Értelmezés:
--      global_access_p0_szigoritott = false → az esperes/egyhazmegyei_admin
--        MINDEN gyülekezet MINDEN adatát írja-olvassa (országos leak, P0)!
--      global_access_p0_szigoritott = true → az esperes unlock-jóváhagyása
--        más gyülekezet bealitas-án NÉMA 0 sor (az app mégis sikert jelez).
--      regi_profile_roles_admin_manage_el = true → a kerületi admin
--        jóváhagyott system-admin sort szúrhat be magának (ön-eszkaláció, P0)!
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'member_private')
    AS member_private_schema_letezik,
  (SELECT pg_get_functiondef(oid) LIKE '%member_private%'
     FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'current_user_has_global_access'
     LIMIT 1) AS global_access_p0_szigoritott,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'profile_roles'
            AND policyname = 'p0_profile_roles_system_admin_manage')
    AS p0_profile_roles_policy_el,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'profile_roles'
            AND policyname = 'profile_roles_admin_manage')
    AS regi_profile_roles_admin_manage_el,
  (SELECT pg_get_functiondef(oid) LIKE '%egyhazkeruleti_admin%'
     FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'current_user_can_access_congregation'
     LIMIT 1) AS can_access_kerulet_ag_megvan,
  (SELECT pg_get_functiondef(oid) LIKE '%egyhazmegyei_szamvevo%'
     FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'current_user_can_access_congregation'
     LIMIT 1) AS can_access_szamvevo_ag_megvan,
  (SELECT pg_get_functiondef(oid) LIKE '%scope = ''congregation''%'
     FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'current_user_can_access_congregation'
     LIMIT 1) AS can_access_comembership_ag_megvan;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. MELY POLICY-K HASZNÁLJÁK A HELPEREKET / A SKALÁR SZEREP-MODELLT
--    Ez adja a "robbanási sugarat": minden itt listázott táblát érint a
--    global_access definíció-váltás és a skalár-divergencia.
-- ────────────────────────────────────────────────────────────────────────────
SELECT tablename,
       policyname,
       cmd,
       (COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
         LIKE '%current_user_has_global_access%'      AS hasznal_global_access,
       (COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
         LIKE '%current_user_can_access_congregation%' AS hasznal_can_access,
       (COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
         LIKE '%current_user_congregation_id%'         AS hasznal_cong_skalar,
       (COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
         ~ '(profiles.*role|p\.role)'                  AS hivatkozik_profiles_role_skalar,
       (COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
         LIKE '%profile_roles%'                        AS hivatkozik_profile_roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%current_user_%'
    OR (COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
       ~ '(esperes|egyhazmegyei_admin|egyhazkeruleti_admin|egyhazmegyei_szamvevo)'
  )
ORDER BY tablename, policyname;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TELJES POLICY-DUMP A CÉL-TÁBLÁKON (pg_policies)
--    Kiemelten figyeld:
--      * congregations: SELECT USING (true) — mindenki mindent lát (publikus
--        oldal miatt); ezért az app-oldali szűrő kihagyása = teljes lista.
--      * document_submissions: csak profiles.role + profiles.diocese_id skalár;
--        kerületi (district) ág NINCS.
--      * diocese_*: az első ág `p.role IN ('admin','egyhazkeruleti_admin')`
--        KERÜLET-KORLÁT NÉLKÜL → kerület-közi írás-olvasás.
-- ────────────────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, permissive,
       qual AS using_kifejezes,
       with_check AS with_check_kifejezes
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'congregations', 'dioceses', 'districts',
    'szemely', 'befizetes', 'kiadas', 'bealitas',
    'lelkeszi_jelentes', 'document_submissions',
    'annual_reports', 'chitanta_tombok',
    'profiles', 'profile_roles', 'profile_congregations',
    'diocese_bealitas', 'diocese_befizetes', 'diocese_kiadas',
    'diocese_koltsegvetes', 'diocese_annual_reports',
    'cross_congregation_match_notifications'
  )
ORDER BY tablename, policyname;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS BEKAPCSOLVA? + GRANT-OK
--    (policy_darab = 0 ÉS rls_bekapcsolva = true → a tábla mindenki elől
--     zárva; rls_bekapcsolva = false → a GRANT önmagában dönt!)
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.relname AS tabla,
       c.relrowsecurity AS rls_bekapcsolva,
       c.relforcerowsecurity AS rls_kikenyszeritve,
       COUNT(pol.polname) AS policy_darab
FROM pg_class c
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'congregations','dioceses','districts','szemely','befizetes','kiadas',
    'bealitas','lelkeszi_jelentes','document_submissions',
    'annual_reports','chitanta_tombok','profiles',
    'profile_roles','profile_congregations','diocese_bealitas',
    'diocese_befizetes','diocese_kiadas','diocese_koltsegvetes',
    'diocese_annual_reports','cross_congregation_match_notifications')
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;

SELECT table_name AS tabla, grantee,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'congregations','dioceses','districts','szemely','befizetes','kiadas',
    'bealitas','lelkeszi_jelentes','document_submissions',
    'annual_reports','chitanta_tombok','profiles',
    'profile_roles','profile_congregations','diocese_bealitas',
    'diocese_befizetes','diocese_kiadas','diocese_koltsegvetes',
    'diocese_annual_reports','cross_congregation_match_notifications')
  AND grantee IN ('anon','authenticated','service_role',
                  'app_staff_user','app_pending_user','member_portal_user','PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. MEGYEI/KERÜLETI SZEREPLŐK — SKALÁR ⇄ PROFILE_ROLES DIVERGENCIA
-- ────────────────────────────────────────────────────────────────────────────

-- 6a. Minden megyei/kerületi szereplő skalárja.
--     ⚠️ Az esperes/egyhazmegyei_admin NULL diocese_id-vel PONTOSAN a
--     bejelentett hibát okozza: az egyházmegyei felület SZŰRETLENÜL az
--     ORSZÁG ÖSSZES gyülekezetét listázza.
SELECT p.id, p.email, p.full_name,
       p.role AS skalar_role, p.status,
       p.congregation_id AS skalar_congregation_id,
       c.name  AS skalar_gyulekezet,
       p.diocese_id AS skalar_diocese_id,
       d.name  AS skalar_egyhazmegye,
       p.district_id AS skalar_district_id,
       di.name AS skalar_egyhazkerulet,
       CASE
         WHEN p.role IN ('esperes','egyhazmegyei_admin') AND p.diocese_id IS NULL
           THEN '!!! P0: megyei felulet SZURETLEN — minden gyulekezet latszik'
         WHEN p.role = 'egyhazmegyei_szamvevo' AND p.diocese_id IS NULL
           THEN '! szamvevo megye-skalar hianyzik'
         WHEN p.role = 'egyhazkeruleti_admin' AND p.district_id IS NULL
           THEN '! kerulet-skalar hianyzik (csak profile_roles-bol jon a scope)'
         ELSE 'OK'
       END AS ertekeles
FROM public.profiles p
LEFT JOIN public.congregations c ON c.id = p.congregation_id
LEFT JOIN public.dioceses d      ON d.id = p.diocese_id
LEFT JOIN public.districts di    ON di.id = p.district_id
WHERE p.role IN ('esperes','egyhazmegyei_admin','egyhazmegyei_szamvevo',
                 'egyhazkeruleti_admin','admin')
ORDER BY p.role, p.email;

-- 6b. profile_roles (diocese/district scope) ⇄ profiles skalár összevetés.
SELECT pr.id AS profile_role_id,
       p.email,
       p.role  AS skalar_role,
       pr.role AS pr_role,
       pr.scope, pr.scope_id,
       pr.active, pr.approval_status,
       p.diocese_id  AS skalar_diocese_id,
       p.district_id AS skalar_district_id,
       CASE
         WHEN pr.scope = 'diocese'  AND pr.scope_id IS NULL
           THEN '!!! diocese-scope scope_id NELKUL'
         WHEN pr.scope = 'diocese'  AND d.id IS NULL
           THEN '!!! scope_id nem letezo dioceses.id'
         WHEN pr.scope = 'diocese'  AND p.diocese_id IS DISTINCT FROM pr.scope_id
           THEN '! skalar diocese_id <> scope_id (DIVERGENCIA — az RLS es a UI mast lat)'
         WHEN pr.scope = 'district' AND pr.scope_id IS NULL
           THEN '!!! district-scope scope_id NELKUL'
         WHEN pr.scope = 'district' AND di.id IS NULL
           THEN '!!! scope_id nem letezo districts.id'
         WHEN pr.scope = 'district' AND p.district_id IS DISTINCT FROM pr.scope_id
           THEN '! skalar district_id <> scope_id (DIVERGENCIA)'
         ELSE 'OK'
       END AS ertekeles
FROM public.profile_roles pr
JOIN public.profiles p ON p.id = pr.profile_id
LEFT JOIN public.dioceses d   ON pr.scope = 'diocese'  AND d.id  = pr.scope_id
LEFT JOIN public.districts di ON pr.scope = 'district' AND di.id = pr.scope_id
WHERE pr.scope IN ('diocese','district')
ORDER BY pr.scope, p.email;

-- 6c. "Rejtett esperes": aktív+jóváhagyott diocese-szerep, de a SKALÁR role
--     nem megyei → az app-guardok kizárják (üres megyei felület / redirect),
--     és az RLS skalár-ágai sem engedik.
SELECT p.id, p.email, p.role AS skalar_role,
       pr.role AS pr_role, pr.scope_id, d.name AS egyhazmegye
FROM public.profile_roles pr
JOIN public.profiles p ON p.id = pr.profile_id
LEFT JOIN public.dioceses d ON d.id = pr.scope_id
WHERE pr.scope = 'diocese'
  AND pr.active = true
  AND pr.approval_status = 'approved'
  AND p.role NOT IN ('esperes','egyhazmegyei_admin','admin')
ORDER BY p.email;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. HIERARCHIA-INTEGRITÁS
-- ────────────────────────────────────────────────────────────────────────────

-- 7a. Gyülekezet egyházmegye nélkül → sehol nem jelenik meg megyei szűrésben,
--     és a beküldött dokumentuma diocese_id=NULL lesz (láthatatlan a megyének).
SELECT id, name, nev_hu
FROM public.congregations
WHERE diocese_id IS NULL
ORDER BY name;

-- 7b. Egyházmegye kerület nélkül → kiesik a kerületi szűrésből.
SELECT id, name
FROM public.dioceses
WHERE district_id IS NULL
ORDER BY name;

-- 7c. Árva hivatkozás: congregations.diocese_id nem létező megyére mutat.
SELECT c.id, c.name, c.diocese_id
FROM public.congregations c
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
WHERE c.diocese_id IS NOT NULL AND d.id IS NULL;

-- 7d. Kerület → megye → gyülekezet összesítő (viszonyítási alap: ennyit
--     KELLENE látnia egy-egy megyei/kerületi felületnek).
SELECT COALESCE(di.name, '(kerulet nelkul)') AS kerulet,
       COALESCE(d.name,  '(megye nelkul)')   AS megye,
       COUNT(c.id) AS gyulekezet_db
FROM public.dioceses d
LEFT JOIN public.districts di ON di.id = d.district_id
LEFT JOIN public.congregations c ON c.diocese_id = d.id
GROUP BY 1, 2
ORDER BY 1, 2;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. DOCUMENT_SUBMISSIONS — CÉLZÁS-ELLENŐRZÉS (a beküldött dokumentumok)
-- ────────────────────────────────────────────────────────────────────────────

-- 8a. NULL vagy a gyülekezet valódi megyéjétől ELTÉRŐ diocese_id-jű beküldések.
--     NULL → EGYIK megye sem látja; ELTÉRŐ → a ROSSZ megye látja/kezeli.
SELECT ds.id, ds.year, ds.document_type, ds.status, ds.forwarded_to_kerulet,
       ds.congregation_id, c.name AS gyulekezet,
       ds.diocese_id      AS rogzitett_diocese_id,
       c.diocese_id       AS gyulekezet_valodi_diocese_id,
       CASE
         WHEN ds.diocese_id IS NULL
           THEN '!!! NULL — egyik megye sem latja'
         WHEN ds.diocese_id IS DISTINCT FROM c.diocese_id
           THEN '!!! ELTER — a rossz megye latja/kezeli'
         ELSE 'OK'
       END AS ertekeles
FROM public.document_submissions ds
LEFT JOIN public.congregations c ON c.id = ds.congregation_id
WHERE ds.diocese_id IS NULL
   OR ds.diocese_id IS DISTINCT FROM c.diocese_id
ORDER BY ds.year DESC, c.name;

-- 8b. Beküldés-összesítő (év / típus / státusz / továbbítva).
SELECT year, document_type, status, forwarded_to_kerulet, COUNT(*) AS db
FROM public.document_submissions
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, 2, 3;

-- 8c. Megyénként: hány beküldés van, és hány AKTÍV megyei profil látja őket a
--     jelenlegi (skalár-alapú) policy szerint. lato_megyei_profil = 0 →
--     azokat a beküldéseket MEGYEI szinten SENKI nem látja.
SELECT ds.diocese_id,
       COALESCE(d.name, '(NULL diocese_id)') AS megye,
       COUNT(DISTINCT ds.id) AS bekuldes_db,
       (SELECT COUNT(*) FROM public.profiles p
         WHERE p.status = 'active'
           AND p.role IN ('esperes','egyhazmegyei_admin')
           AND p.diocese_id = ds.diocese_id) AS lato_megyei_profil
FROM public.document_submissions ds
LEFT JOIN public.dioceses d ON d.id = ds.diocese_id
GROUP BY ds.diocese_id, d.name
ORDER BY megye;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. FELOLDÁSI KÉRELMEK MEGYE-BONTÁSBAN (bealitas + lelkeszi_jelentes)
--    Ezt kell(ene) látnia a megyei felületnek. Vesd össze a UI-val:
--    ha a UI TÖBB gyülekezetet mutat, mint itt a megyéje → a P0 hiba él.
-- ────────────────────────────────────────────────────────────────────────────
SELECT COALESCE(d.name, '(megye nelkul)') AS megye,
       c.name AS gyulekezet, b.id AS ev,
       b.unlock_requested            AS ktgvetes_kerelem,
       b.accounting_unlock_requested AS szamadas_kerelem,
       b.leltar_unlock_requested     AS leltar_kerelem
FROM public.bealitas b
JOIN public.congregations c ON c.id = b.congregation_id
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
WHERE b.unlock_requested = true
   OR b.accounting_unlock_requested = true
   OR b.leltar_unlock_requested = true
ORDER BY 1, 2;

SELECT COALESCE(d.name, '(megye nelkul)') AS megye,
       c.name AS gyulekezet, lj.ev
FROM public.lelkeszi_jelentes lj
JOIN public.congregations c ON c.id = lj.congregation_id
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
WHERE lj.unlock_requested = true
ORDER BY 1, 2;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. KERESZT-EGYEZTETÉS (2026-08-09-es felület) — KERÜLET-KÖZI PÁROK
--     A kerületi admin a pár MÁSIK oldalának adatait (név, szül., CNP,
--     lelkész-elérhetőség) akkor is látja, ha az MÁSIK kerülethez tartozik.
-- ────────────────────────────────────────────────────────────────────────────
SELECT n.id, n.confidence, n.resolution, n.admin_notified_at, n.created_at,
       tc.name AS trigger_gyulekezet, tdi.name AS trigger_kerulet,
       mc.name AS match_gyulekezet,   mdi.name AS match_kerulet,
       CASE WHEN td.district_id IS DISTINCT FROM md.district_id
            THEN '! kerulet-kozi par — a masik kerulet tag-adata is atlatszik'
            ELSE 'azonos kerulet' END AS ertekeles
FROM public.cross_congregation_match_notifications n
LEFT JOIN public.congregations tc ON tc.id = n.triggering_congregation_id
LEFT JOIN public.dioceses td  ON td.id  = tc.diocese_id
LEFT JOIN public.districts tdi ON tdi.id = td.district_id
LEFT JOIN public.congregations mc ON mc.id = n.matched_congregation_id
LEFT JOIN public.dioceses md  ON md.id  = mc.diocese_id
LEFT JOIN public.districts mdi ON mdi.id = md.district_id
WHERE n.resolution IS NULL
ORDER BY n.created_at DESC
LIMIT 200;

-- ────────────────────────────────────────────────────────────────────────────
-- FINDINGS-ÖSSZEFOGLALÓ (kontextus az eredmények értelmezéséhez)
--
-- Blokkolja a legitim hozzáférést: post-P0 esperes unlock-jóváhagyás néma
--   no-op (bealitas/lelkeszi_jelentes); kerületi admin
--   document_submissions-lista üres (nincs district-ág); profile_roles-only
--   esperes/dual-role lelkész kizárva a megyei felületről; NULL diocese_id-jű
--   beküldést senki nem lát megyei szinten.
--
-- Átenged idegen scope-ot: megyei felület országos gyülekezetlista NULL/rossz
--   skalárnál (a bejelentett hiba); kerületi dashboard teljesen szűretlen +
--   rossz kerület-név; pre-P0 esperes országos FOR ALL a
--   szemely/befizetes/kiadas táblákon; diocese_* pénzügy + dioceses UPDATE
--   kerület-korlát nélküli egyhazkeruleti_admin ága; pre-P0
--   profile_roles_admin_manage ön-eszkaláció; kereszt-egyeztetési RPC
--   kerület-közi PII.
--
-- Javítási irány: (1) megyei/kerületi felületek scope-ja az
--   activeProfileRole.scopeId + admin-scope.ts mintára, kötelező szűrővel
--   (üres scope = üres lista); (2) DB-oldali esperes-diocese ág
--   profile_roles-alapon + district-ág a document_submissions-re; (3) a
--   diocese_*/dioceses policy-k első ágának kerület-korlátozása — a (2)-(3)
--   DB-részét a 2026-08-09-megye-kerulet-rls-fix.sql végzi el; (4) a 0-sorra
--   futó UPDATE-eknél sor-szám ellenőrzés az actionökben (app-kör).
-- ────────────────────────────────────────────────────────────────────────────