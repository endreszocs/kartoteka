-- ============================================================================
-- KARTOTEKA — EGYHÁZMEGYEI + EGYHÁZKERÜLETI RLS FIX
-- Dátum: 2026-08-09
--
-- ⚠️ FIGYELEM — FUTTATÁSI ELŐFELTÉTEL:
--   ELŐBB futtasd le a 2026-08-09-megye-kerulet-scope-diagnosztika.sql-t,
--   KÜLÖNÖSEN az 1–2. szakaszt (pg_get_functiondef a
--   current_user_has_global_access-re)! Az eredmény értelmezése:
--     * global_access_p0_szigoritott = FALSE (pre-P0 definíció él):
--       az esperes/egyhazmegyei_admin ORSZÁGOS FOR ALL hozzáférése
--       (szemely, befizetes, kiadas, bealitas, ...) EZZEL A FÁJLLAL
--       NEM ZÁRUL LE — azt kizárólag a member-portal P0 migráció
--       (2026-07-17-member-portal-p0-auth-isolation.sql) zárja
--       (dokumentált, ismert tétel). Ez a fájl ADDITÍV defense-in-depth:
--       ilyenkor is biztonságos, de a fő lyukat nem ez tömíti.
--     * global_access_p0_szigoritott = TRUE (P0 lefutott):
--       ez a fájl állítja helyre a jogos megyei munkafolyamatokat
--       (unlock-jóváhagyás, megyei nyugtatömbök), amelyek a szigorítás
--       óta némán 0 sorra futnak.
--   A current_user_has_global_access() függvényhez ez a fájl SZÁNDÉKOSAN
--   NEM NYÚL — az a member-portal P0 migráció tulajdona.
--
-- MIT JAVÍT (a 2026-08-09-es scope-audit findingjai alapján):
--   1) document_submissions: kerületi (egyhazkeruleti_admin) SELECT+UPDATE ág
--      — eddig SEMMILYEN kerületi ág nem volt, a kerületi dokumentumlista
--      üres volt (funkcionális törés) + DELETE-grant visszavonása (archívum).
--   2) diocese_* pénzügyi táblák: az első policy-ág eddig MINDEN
--      egyhazkeruleti_admin-nak kerület-korlát NÉLKÜL adott teljes
--      írás-olvasást → kerület-közi pénzügyi hozzáférés. Mostantól:
--      admin külön ág + kerület-korlátozott egyhazkeruleti_admin ág.
--   3) dioceses UPDATE (dioceses_update_by_esperes): ugyanez a
--      kerület-korlátozás az egyhazkeruleti_admin skalár-ágra.
--   4) ADDITÍV megyei (esperes/egyhazmegyei_admin) ágak: bealitas,
--      lelkeszi_jelentes, chitanta_tombok — a P0 utáni néma no-opok ellen.
--   5) annual_reports: kerület-korlátozott SELECT az egyhazkeruleti_admin-nak.
--
-- ELVEK:
--   * Idempotens: DROP POLICY IF EXISTS + CREATE, újrafuttatható.
--   * A meglévő policy-k NEM-érintett ágai BYTE-AZONOSAN másolva a forrás-
--     migrációkból (2026-04-18-egyhazmegyei-penzugy-fazis8.sql,
--     2026-04-18-egyhazmegyei-modul-fazis6.sql).
--   * Minden új ág KÉT lábon áll: profiles skalár (role + diocese_id/
--     district_id) VAGY profile_roles (scope='diocese'/'district', active,
--     approved) — a skalár⇄profile_roles divergencia (ismert hibaosztály)
--     egyik irányban sem okoz néma kizárást. A minta a
--     ccm_caller_district_ids() (2026-08-09-admin-kereszt-egyeztetes.sql)
--     és az apps/web/lib/auth/admin-scope.ts modellje — itt inline EXISTS-ként,
--     hogy a fájl önhordó legyen (nem függ a ccm_* függvények meglététől).
--   * A post-P0 RESTRICTIVE p0_legacy_authenticated_staff_gate kapuval az új
--     PERMISSIVE policy-k együttműködnek (a kapu ÉS-ben szűr tovább).
--
-- Futtatás: Supabase Studio SQL Editor (postgres-ként). Egy tranzakció.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) DOCUMENT_SUBMISSIONS — kerületi ág + DELETE-grant visszavonás
-- ────────────────────────────────────────────────────────────────────────────
-- Eddig (2026-04-17-document-submissions-fix.sql): csak
--   document_submissions_congregation_access (saját gyülekezet, FOR ALL) és
--   document_submissions_diocese_access (esperes/egyhazmegyei_admin/admin
--   skalár, FOR ALL) létezett — kerületi ág SEHOL, ezért a kerületi
--   admin dokumentumlistája (getKeruletSubmissions) mindig üres volt.
--
-- 1a) Kerületi SELECT.
--   HATÓKÖR-DÖNTÉS (indoklás): forwarded_to_kerulet = true VAGY
--   status = 'finalized'.
--     * forwarded_to_kerulet = true — a megye kifejezetten továbbította,
--       ez a kerület elsődleges munkalistája.
--     * status = 'finalized' (még nem továbbítva) — a véglegesítés a megyei
--       workflow LEZÁRT, hivatalos végállapota (submitted→received→reviewed→
--       finalized); a kerületi határidő-KPI-k (hány gyülekezet zárt le?)
--       e nélkül alul-jelentenének, és a megyék "továbbítás-fegyelmétől"
--       függene a kerületi statisztika. Munkafolyamat-státuszú (submitted/
--       received/reviewed) dokumentum viszont NEM látszik — az még a megye
--       belső ügye.
--   A kerület-hovatartozást a gyülekezet VALÓDI megyéjén át oldjuk fel
--   (congregations.diocese_id → dioceses.district_id), NEM a sor diocese_id
--   oszlopán — az nullable és elavulhat (audit 8a. szakasz), és NULL/rossz
--   diocese_id esetén a sor különben kiesne/rossz kerülethez kerülne.
DROP POLICY IF EXISTS document_submissions_district_select
  ON public.document_submissions;
CREATE POLICY document_submissions_district_select
  ON public.document_submissions
  FOR SELECT TO authenticated
  USING (
    (document_submissions.forwarded_to_kerulet = true
     OR document_submissions.status = 'finalized')
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE c.id = document_submissions.congregation_id
        AND (
          -- profile_roles-alapú kerületi szerep (elsődleges modell)
          EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = auth.uid()
              AND pr.role = 'egyhazkeruleti_admin'
              AND pr.scope = 'district'
              AND pr.active = true
              AND pr.approval_status = 'approved'
              AND pr.scope_id = d.district_id
          )
          -- skalár fallback (legacy profiles.role + profiles.district_id)
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.status = 'active'
              AND p.role = 'egyhazkeruleti_admin'
              AND p.district_id = d.district_id
          )
        )
    )
  );

-- 1b) Kerületi UPDATE — CSAK a már továbbított (forwarded_to_kerulet = true)
--     sorokra: a kerület a hozzá beérkezett dokumentumon dolgozhat (átvétel
--     visszaigazolása, notes), de a megye még nem továbbított, csak
--     véglegesített dokumentumához NEM nyúlhat. A WITH CHECK ugyanezt
--     követeli az ÚJ sorképre is → a kerület nem tudja "vissza-nem-továbbítottá"
--     tenni (forwarded_to_kerulet=false-ra írni) és nem tudja a sort a saját
--     kerületén kívülre mozgatni.
DROP POLICY IF EXISTS document_submissions_district_update
  ON public.document_submissions;
CREATE POLICY document_submissions_district_update
  ON public.document_submissions
  FOR UPDATE TO authenticated
  USING (
    document_submissions.forwarded_to_kerulet = true
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE c.id = document_submissions.congregation_id
        AND (
          EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = auth.uid()
              AND pr.role = 'egyhazkeruleti_admin'
              AND pr.scope = 'district'
              AND pr.active = true
              AND pr.approval_status = 'approved'
              AND pr.scope_id = d.district_id
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.status = 'active'
              AND p.role = 'egyhazkeruleti_admin'
              AND p.district_id = d.district_id
          )
        )
    )
  )
  WITH CHECK (
    document_submissions.forwarded_to_kerulet = true
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE c.id = document_submissions.congregation_id
        AND (
          EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = auth.uid()
              AND pr.role = 'egyhazkeruleti_admin'
              AND pr.scope = 'district'
              AND pr.active = true
              AND pr.approval_status = 'approved'
              AND pr.scope_id = d.district_id
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.status = 'active'
              AND p.role = 'egyhazkeruleti_admin'
              AND p.district_id = d.district_id
          )
        )
    )
  );

-- 1c) DELETE-grant visszavonás.
--   A 2026-04-17-es migráció ezt adta:
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_submissions
--       TO authenticated;
--   A document_submissions hivatalos beküldési ARCHÍVUM (fagyasztott
--   snapshot_data-val) — a beküldő kliensről nem törölhető keményen.
--   A két meglévő FOR ALL policy DELETE-ágát a grant-szintű visszavonás
--   hatástalanítja (az RLS-policy megmarad, de grant nélkül a DELETE
--   42501-gyel elutasításra kerül). Az app sehol nem hív .delete()-et erre a
--   táblára (2026-08-09-i grep), tehát semmi nem törik. A szükséges jogokat
--   (SELECT, INSERT, UPDATE) explicit újra-megerősítjük, mert a REVOKE DELETE
--   önmagában azokat nem érinti — a sor a szándékot dokumentálja.
--   Megjegyzés: a 2026-04-23-as m0-HOTFIX ALTER DEFAULT PRIVILEGES-e csak
--   ÚJ táblákra ad automatikusan DELETE-t; erre a meglévő táblára a mostani
--   REVOKE tartós. Törlés ezután csak service_role/postgres útján lehetséges.
GRANT SELECT, INSERT, UPDATE ON public.document_submissions TO authenticated;
REVOKE DELETE ON public.document_submissions FROM authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) DIOCESE_* PÉNZÜGYI TÁBLÁK — az első ág kerület-korlátozása
-- ────────────────────────────────────────────────────────────────────────────
-- Forrás: 2026-04-18-egyhazmegyei-penzugy-fazis8.sql. Az öt FOR ALL policy
-- ("diocese_bealitas_all", "diocese_befizetes_all", "diocese_kiadas_all",
--  "diocese_koltsegvetes_all", "diocese_annual_reports_all") első ága eddig:
--     p.role IN ('admin', 'egyhazkeruleti_admin')  -- KORLÁT NÉLKÜL
-- volt → az A kerület adminja a B kerület megyéinek pénzügyét is
-- írhatta-olvashatta direkt PostgREST-hívással. Csere KÉT ágra:
--   (a) admin: profiles.role='admin' skalár — a profile_roles-os rendszer-
--       admint a változatlanul hagyott 2. ág (pr.scope='system' AND
--       pr.role='admin') fedi;
--   (b) egyhazkeruleti_admin: CSAK ha a cél-megye kerülete = a saját
--       profiles.district_id (skalár láb) — a profile_roles-os kerületi
--       admint a változatlanul hagyott 2. ág district-arma már eddig is
--       helyesen korlátozta.
-- A 2. (profile_roles) és 3. (esperes skalár) ág BYTE-AZONOS a forrással.

-- 2a) diocese_bealitas
DROP POLICY IF EXISTS "diocese_bealitas_all" ON public.diocese_bealitas;
CREATE POLICY "diocese_bealitas_all" ON public.diocese_bealitas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_bealitas.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_bealitas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_bealitas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_bealitas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_bealitas.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_bealitas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_bealitas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_bealitas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- 2b) diocese_befizetes
DROP POLICY IF EXISTS "diocese_befizetes_all" ON public.diocese_befizetes;
CREATE POLICY "diocese_befizetes_all" ON public.diocese_befizetes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_befizetes.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_befizetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_befizetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_befizetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_befizetes.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_befizetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_befizetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_befizetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- 2c) diocese_kiadas
DROP POLICY IF EXISTS "diocese_kiadas_all" ON public.diocese_kiadas;
CREATE POLICY "diocese_kiadas_all" ON public.diocese_kiadas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_kiadas.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_kiadas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_kiadas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_kiadas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_kiadas.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_kiadas.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_kiadas.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_kiadas.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- 2d) diocese_koltsegvetes
DROP POLICY IF EXISTS "diocese_koltsegvetes_all" ON public.diocese_koltsegvetes;
CREATE POLICY "diocese_koltsegvetes_all" ON public.diocese_koltsegvetes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_koltsegvetes.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_koltsegvetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_koltsegvetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_koltsegvetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_koltsegvetes.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_koltsegvetes.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_koltsegvetes.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_koltsegvetes.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- 2e) diocese_annual_reports
DROP POLICY IF EXISTS "diocese_annual_reports_all" ON public.diocese_annual_reports;
CREATE POLICY "diocese_annual_reports_all" ON public.diocese_annual_reports
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_annual_reports.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_annual_reports.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_annual_reports.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_annual_reports.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.dioceses d ON d.id = diocese_annual_reports.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = d.district_id)
    OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.profile_id = auth.uid()
      AND pr.active = true AND pr.approval_status = 'approved'
      AND ((pr.scope = 'system' AND pr.role = 'admin')
           OR (pr.scope = 'diocese' AND pr.scope_id = diocese_annual_reports.diocese_id)
           OR (pr.scope = 'district' AND pr.scope_id = (SELECT district_id FROM public.dioceses WHERE id = diocese_annual_reports.diocese_id))))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.status = 'active' AND p.diocese_id = diocese_annual_reports.diocese_id
      AND p.role IN ('esperes', 'egyhazmegyei_admin')));

-- ────────────────────────────────────────────────────────────────────────────
-- 3) DIOCESES UPDATE — kerület-korlátozás az egyhazkeruleti_admin skalár-ágra
-- ────────────────────────────────────────────────────────────────────────────
-- Forrás: 2026-04-18-egyhazmegyei-modul-fazis6.sql (dioceses_update_by_esperes).
-- Az (1) ág eddig p.role IN ('admin','egyhazkeruleti_admin') volt korlát
-- nélkül → az A kerület adminja a B kerület megyéinek törzsadatait (IBAN,
-- CIF, elérhetőségek, címer-meta) is átírhatta. A (2) profile_roles-ág
-- BYTE-AZONOS marad — az már eddig is helyesen korlátozott
-- (pr.scope='district' AND pr.scope_id = dioceses.district_id).
DROP POLICY IF EXISTS "dioceses_update_by_esperes" ON public.dioceses;
CREATE POLICY "dioceses_update_by_esperes" ON public.dioceses
  FOR UPDATE
  TO authenticated
  USING (
    -- (1a) Globális admin (skalár)
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'admin'
    )
    -- (1b) Egyházkerületi admin (skalár) — CSAK a saját kerülete megyéi
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = dioceses.district_id
    )
    -- (2) profile_roles alapú ellenőrzés
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND (
          -- Rendszer admin (legmagasabb szint)
          (pr.scope = 'system' AND pr.role = 'admin')
          -- Esperes a saját egyházmegyéjét
          OR (pr.scope = 'diocese' AND pr.scope_id = dioceses.id AND pr.role IN ('esperes', 'egyhazmegyei_admin'))
          -- Egyházkerületi admin a saját kerületébe tartozót
          OR (pr.scope = 'district' AND pr.scope_id = dioceses.district_id AND pr.role = 'egyhazkeruleti_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'egyhazkeruleti_admin'
        AND p.district_id = dioceses.district_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND (
          (pr.scope = 'system' AND pr.role = 'admin')
          OR (pr.scope = 'diocese' AND pr.scope_id = dioceses.id AND pr.role IN ('esperes', 'egyhazmegyei_admin'))
          OR (pr.scope = 'district' AND pr.scope_id = dioceses.district_id AND pr.role = 'egyhazkeruleti_admin')
        )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ADDITÍV MEGYEI (ESPERES) ÁGAK — bealitas, lelkeszi_jelentes,
--    chitanta_tombok
-- ────────────────────────────────────────────────────────────────────────────
-- Miért ADDITÍV: a bealitas_access / lelkeszi_jelentes_* /
-- chitanta_tombok_congregation_access policy-khez és a
-- current_user_has_global_access() függvényhez NEM nyúlunk (az utóbbi a
-- member-portal P0 migráció tulajdona). Új PERMISSIVE policy-k jönnek
-- mellé (a policy-k VAGY-kapcsolatban értékelődnek), ezért MINDKÉT
-- global_access-definíció mellett biztonságosak:
--   * pre-P0 (esperes globális): az új policy-k redundánsak, semmit nem
--     tágítanak a meglévőn túl;
--   * post-P0 (csak rendszer-admin globális): az új policy-k állítják
--     helyre a jogos megyei workflow-t, ami eddig némán 0 sorra futott
--     (unlock-jóváhagyás, megyei dokumentum-számlálók, megyei nyugtatömbök).
-- Minden ág két lábon áll: profiles skalár (role + diocese_id) VAGY
-- profile_roles (scope='diocese', scope_id, active, approved).

-- 4a) bealitas — megyei SELECT: az esperes látja a megyéje gyülekezeteinek
--     év-beállításait (feloldási kérelmek + határidő-KPI-k forrása).
--     GRANT már van (2026-06-05l-bealitas-grant-fix.sql: S/I/U/D).
DROP POLICY IF EXISTS bealitas_select_diocese ON public.bealitas;
CREATE POLICY bealitas_select_diocese
  ON public.bealitas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND c.id = bealitas.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      JOIN public.congregations c ON c.diocese_id = pr.scope_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('esperes', 'egyhazmegyei_admin')
        AND pr.scope = 'diocese'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND c.id = bealitas.congregation_id
    )
  );

-- 4b) bealitas — megyei UPDATE: a feloldás-jóváhagyás/-elutasítás
--     (approveUnlockRequest/rejectUnlockRequest) ezeket írja:
--     budget_finalized, accounting_finalized, unlock_requested,
--     unlock_reason, accounting_unlock_requested, accounting_unlock_reason,
--     leltar_unlock_requested, leltar_unlock_reason.
--     ⚠️ RLS-ben OSZLOP-SZINTŰ korlátozás NEM lehetséges — a policy a teljes
--     sor UPDATE-jét engedi a megye gyülekezeteire; hogy az esperes csak a
--     véglegesítési/feloldási mezőkhöz nyúl (és nem pl. az éves díjakhoz),
--     azt az app-réteg garantálja (dashboard-egyhazmegye/actions.ts).
--     A WITH CHECK ugyanaz a kifejezés → a sor nem "mozgatható ki" a megyéből.
DROP POLICY IF EXISTS bealitas_update_diocese ON public.bealitas;
CREATE POLICY bealitas_update_diocese
  ON public.bealitas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND c.id = bealitas.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      JOIN public.congregations c ON c.diocese_id = pr.scope_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('esperes', 'egyhazmegyei_admin')
        AND pr.scope = 'diocese'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND c.id = bealitas.congregation_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND c.id = bealitas.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      JOIN public.congregations c ON c.diocese_id = pr.scope_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('esperes', 'egyhazmegyei_admin')
        AND pr.scope = 'diocese'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND c.id = bealitas.congregation_id
    )
  );

-- 4c) lelkeszi_jelentes — megyei SELECT, profile_roles-láb.
--     A meglévő lelkeszi_jelentes_select_diocese (2026-07-16-f5) már fedi a
--     SKALÁR (profiles.diocese_id) lábat — azt NEM bántjuk. Ez az új policy
--     a profile_roles-only esperest (skalár diocese_id NULL/eltérő) engedi be,
--     aki eddig némán 0 sort kapott (ismert divergencia-hibaosztály).
DROP POLICY IF EXISTS lelkeszi_jelentes_select_diocese_roles ON public.lelkeszi_jelentes;
CREATE POLICY lelkeszi_jelentes_select_diocese_roles
  ON public.lelkeszi_jelentes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_roles pr
      JOIN public.congregations c ON c.diocese_id = pr.scope_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('esperes', 'egyhazmegyei_admin')
        AND pr.scope = 'diocese'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND c.id = lelkeszi_jelentes.congregation_id
    )
  );

-- 4d) lelkeszi_jelentes — megyei UPDATE (eddig SEMMILYEN megyei UPDATE-ág
--     nem volt; post-P0 a jelentés-feloldás jóváhagyása némán 0 sorra futott).
--     A jóváhagyás ezt írja: statusz, snapshot, veglegesitve_at,
--     veglegesito_profile_id, unlock_requested, unlock_reason.
--     ⚠️ Oszlop-szintű korlát RLS-ben nem lehetséges — a jelentés TARTALMI
--     mezőit (kezi_adatok, felulirasok, hatarozat) az app-réteg védi
--     (a megyei felületen nincs tartalom-szerkesztő út). Mindkét láb
--     (skalár + profile_roles) benne van, mert UPDATE-re egyik sem létezett.
DROP POLICY IF EXISTS lelkeszi_jelentes_update_diocese ON public.lelkeszi_jelentes;
CREATE POLICY lelkeszi_jelentes_update_diocese
  ON public.lelkeszi_jelentes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND c.id = lelkeszi_jelentes.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      JOIN public.congregations c ON c.diocese_id = pr.scope_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('esperes', 'egyhazmegyei_admin')
        AND pr.scope = 'diocese'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND c.id = lelkeszi_jelentes.congregation_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin')
        AND c.id = lelkeszi_jelentes.congregation_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      JOIN public.congregations c ON c.diocese_id = pr.scope_id
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('esperes', 'egyhazmegyei_admin')
        AND pr.scope = 'diocese'
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND c.id = lelkeszi_jelentes.congregation_id
    )
  );

-- 4e-4g) chitanta_tombok — MEGYEI nyugtatömb-sorok (scope='egyhazmegye',
--     congregation_id NULL, diocese_id kitöltve — CHECK:
--     chitanta_tombok_scope_fk_check, 2026-04-18-egyhazmegyei-modul-fazis6).
--     A meglévő chitanta_tombok_congregation_access
--     (current_user_can_access_congregation(congregation_id)) a megyei
--     sorokra congregation_id=NULL-t kap → post-P0 SENKI nem éri el őket a
--     rendszer-adminon kívül: a megyei nyugtatömb-modul halott. SELECT +
--     INSERT + UPDATE jön; DELETE SZÁNDÉKOSAN NEM — nyugtatömböt lezárni
--     kell, nem törölni; a törlés admin/service-role beavatkozás marad.
DROP POLICY IF EXISTS chitanta_tombok_diocese_select ON public.chitanta_tombok;
CREATE POLICY chitanta_tombok_diocese_select
  ON public.chitanta_tombok
  FOR SELECT TO authenticated
  USING (
    chitanta_tombok.scope = 'egyhazmegye'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND p.diocese_id = chitanta_tombok.diocese_id
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope = 'diocese'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id = chitanta_tombok.diocese_id
      )
    )
  );

DROP POLICY IF EXISTS chitanta_tombok_diocese_insert ON public.chitanta_tombok;
CREATE POLICY chitanta_tombok_diocese_insert
  ON public.chitanta_tombok
  FOR INSERT TO authenticated
  WITH CHECK (
    chitanta_tombok.scope = 'egyhazmegye'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND p.diocese_id = chitanta_tombok.diocese_id
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope = 'diocese'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id = chitanta_tombok.diocese_id
      )
    )
  );

DROP POLICY IF EXISTS chitanta_tombok_diocese_update ON public.chitanta_tombok;
CREATE POLICY chitanta_tombok_diocese_update
  ON public.chitanta_tombok
  FOR UPDATE TO authenticated
  USING (
    chitanta_tombok.scope = 'egyhazmegye'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND p.diocese_id = chitanta_tombok.diocese_id
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope = 'diocese'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id = chitanta_tombok.diocese_id
      )
    )
  )
  WITH CHECK (
    chitanta_tombok.scope = 'egyhazmegye'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND p.diocese_id = chitanta_tombok.diocese_id
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope = 'diocese'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id = chitanta_tombok.diocese_id
      )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5) ANNUAL_REPORTS — kerület-korlátozott SELECT az egyhazkeruleti_admin-nak
-- ────────────────────────────────────────────────────────────────────────────
-- Az annual-reports-extension.sql (2026-04-15) policy-i közt NINCS kerületi
-- ág (annual_reports_select: saját gyülekezet + global access + esperes-megye
-- skalár). A kerületi dashboard éves-jelentés KPI-jaihoz ugyanaz a hatókör-
-- szabály, mint az 1a) pontban: a kerület a hozzá továbbított VAGY már
-- véglegesített jelentéseket látja, a gyülekezet VALÓDI megyéjén át
-- kerület-korlátozva. Munkaközi (draft/submitted/received/reviewed, nem
-- továbbított) jelentés nem látszik. Csak SELECT — a jelentés-workflow
-- (átvétel/felülvizsgálat) megyei hatáskör marad.
DROP POLICY IF EXISTS annual_reports_select_district ON public.annual_reports;
CREATE POLICY annual_reports_select_district
  ON public.annual_reports
  FOR SELECT TO authenticated
  USING (
    deleted = false
    AND (annual_reports.forwarded_to_kerulet = true
         OR annual_reports.status = 'finalized')
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE c.id = annual_reports.congregation_id
        AND (
          EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = auth.uid()
              AND pr.role = 'egyhazkeruleti_admin'
              AND pr.scope = 'district'
              AND pr.active = true
              AND pr.approval_status = 'approved'
              AND pr.scope_id = d.district_id
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.status = 'active'
              AND p.role = 'egyhazkeruleti_admin'
              AND p.district_id = d.district_id
          )
        )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6) PROFILE_ROLES-ÁGAK a megyei hozzáféréshez (2026-08-09 review-fix)
-- ────────────────────────────────────────────────────────────────────────────
-- Az app a hatókört ELSŐSORBAN a profile_roles sorokból oldja fel (a skalár
-- profiles.diocese_id csak fallback — lib/auth/level-scope.ts). A régi
-- policy-k viszont KIZÁRÓLAG a skalárt nézik, ezért a „csak profile_roles"
-- esperes RLS-szinten 0 sort kapna: a dokumentumközpont és az éves-jelentés
-- lista némán ÜRES lenne. Ezek az ADDITÍV policy-k pótolják a hiányzó lábat.
-- (A régi skalár-policy-khoz nem nyúlunk — nincs regressziós kockázat.)

-- 6a) document_submissions — megyei SELECT profile_roles-alapon.
--     A gyülekezet VALÓDI megyéjén (congregations.diocese_id) keresztül, nem a
--     sor nullable diocese_id mezőjén — ez a 2026-04-17-es policy másik hiánya.
DROP POLICY IF EXISTS document_submissions_diocese_roles_select ON public.document_submissions;
CREATE POLICY document_submissions_diocese_roles_select
  ON public.document_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.profile_roles pr
        ON pr.profile_id = auth.uid()
       AND pr.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
       AND pr.scope = 'diocese'
       AND pr.active = true
       AND pr.approval_status = 'approved'
       AND pr.scope_id = c.diocese_id
      WHERE c.id = document_submissions.congregation_id
    )
  );

-- 6b) document_submissions — megyei UPDATE profile_roles-alapon (workflow:
--     átvétel / felülvizsgálat / véglegesítés / visszaküldés / továbbítás).
--     A szamvevő szándékosan KIMARAD: ő olvas, nem dönt.
DROP POLICY IF EXISTS document_submissions_diocese_roles_update ON public.document_submissions;
CREATE POLICY document_submissions_diocese_roles_update
  ON public.document_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.profile_roles pr
        ON pr.profile_id = auth.uid()
       AND pr.role IN ('esperes', 'egyhazmegyei_admin')
       AND pr.scope = 'diocese'
       AND pr.active = true
       AND pr.approval_status = 'approved'
       AND pr.scope_id = c.diocese_id
      WHERE c.id = document_submissions.congregation_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.profile_roles pr
        ON pr.profile_id = auth.uid()
       AND pr.role IN ('esperes', 'egyhazmegyei_admin')
       AND pr.scope = 'diocese'
       AND pr.active = true
       AND pr.approval_status = 'approved'
       AND pr.scope_id = c.diocese_id
      WHERE c.id = document_submissions.congregation_id
    )
  );

-- 6c) annual_reports — megyei SELECT + UPDATE profile_roles-alapon
--     (a 2026-04-15-ös policy-k szintén csak a skalárt ismerik).
DROP POLICY IF EXISTS annual_reports_diocese_roles_select ON public.annual_reports;
CREATE POLICY annual_reports_diocese_roles_select
  ON public.annual_reports
  FOR SELECT TO authenticated
  USING (
    deleted = false
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.profile_roles pr
        ON pr.profile_id = auth.uid()
       AND pr.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
       AND pr.scope = 'diocese'
       AND pr.active = true
       AND pr.approval_status = 'approved'
       AND pr.scope_id = c.diocese_id
      WHERE c.id = annual_reports.congregation_id
    )
  );

DROP POLICY IF EXISTS annual_reports_diocese_roles_update ON public.annual_reports;
CREATE POLICY annual_reports_diocese_roles_update
  ON public.annual_reports
  FOR UPDATE TO authenticated
  USING (
    deleted = false
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.profile_roles pr
        ON pr.profile_id = auth.uid()
       AND pr.role IN ('esperes', 'egyhazmegyei_admin')
       AND pr.scope = 'diocese'
       AND pr.active = true
       AND pr.approval_status = 'approved'
       AND pr.scope_id = c.diocese_id
      WHERE c.id = annual_reports.congregation_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.congregations c
      JOIN public.profile_roles pr
        ON pr.profile_id = auth.uid()
       AND pr.role IN ('esperes', 'egyhazmegyei_admin')
       AND pr.scope = 'diocese'
       AND pr.active = true
       AND pr.approval_status = 'approved'
       AND pr.scope_id = c.diocese_id
      WHERE c.id = annual_reports.congregation_id
    )
  );

-- 6d) chitanta_tombok — megyei DELETE (a 4e–4g SELECT/INSERT/UPDATE mellé).
--     A megyei nyugtatömb-kezelő UI-ban VAN törlés-művelet; DELETE policy
--     nélkül az RLS némán 0 sort érintene → hamis siker. Csak a saját megye
--     'egyhazmegye' hatókörű tömbjeire.
DROP POLICY IF EXISTS chitanta_tombok_diocese_delete ON public.chitanta_tombok;
CREATE POLICY chitanta_tombok_diocese_delete
  ON public.chitanta_tombok
  FOR DELETE TO authenticated
  USING (
    chitanta_tombok.scope = 'egyhazmegye'
    AND (
      EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role IN ('esperes', 'egyhazmegyei_admin')
          AND pr.scope = 'diocese'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id = chitanta_tombok.diocese_id
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role IN ('esperes', 'egyhazmegyei_admin')
          AND p.diocese_id = chitanta_tombok.diocese_id
      )
    )
  );

COMMIT;

-- A grant-változás miatt (ártalmatlan, de szokásos):
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ELLENŐRZÉS — futtasd a COMMIT után, szakaszonként
-- ============================================================================

-- E1) Az új policy-k léteznek? → PONTOSAN 15 sornak kell visszajönnie
--     (10 alap + 5 a 6) szakaszból: profile_roles-ágak + chitanta DELETE).
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'document_submissions_district_select',
    'document_submissions_district_update',
    'bealitas_select_diocese',
    'bealitas_update_diocese',
    'lelkeszi_jelentes_select_diocese_roles',
    'lelkeszi_jelentes_update_diocese',
    'chitanta_tombok_diocese_select',
    'chitanta_tombok_diocese_insert',
    'chitanta_tombok_diocese_update',
    'annual_reports_select_district',
    -- 2026-08-09 review-fix (6. szakasz):
    'document_submissions_diocese_roles_select',
    'document_submissions_diocese_roles_update',
    'annual_reports_diocese_roles_select',
    'annual_reports_diocese_roles_update',
    'chitanta_tombok_diocese_delete'
  )
ORDER BY tablename, policyname;

-- E2) Nem maradt-e KORLÁTLAN egyhazkeruleti_admin ág a diocese_*/dioceses
--     policy-kban? → 0 sor a helyes eredmény. (A kifejezés említi az
--     egyhazkeruleti_admin-t, de sehol nem hivatkozik district_id-re →
--     az a korlátlan, régi minta.)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('diocese_bealitas', 'diocese_befizetes', 'diocese_kiadas',
                    'diocese_koltsegvetes', 'diocese_annual_reports', 'dioceses')
  AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%egyhazkeruleti_admin%'
  AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) NOT LIKE '%district_id%';

-- E3) document_submissions grant-ok — a DELETE-nek EL KELL TŰNNIE az
--     authenticated sorból (marad: INSERT, SELECT, UPDATE).
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'document_submissions'
  AND grantee IN ('authenticated', 'anon', 'service_role')
GROUP BY grantee
ORDER BY grantee;

-- E4) Teljes policy-kép az érintett táblákon (szemrevételezéshez).
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('document_submissions', 'diocese_bealitas',
                    'diocese_befizetes', 'diocese_kiadas',
                    'diocese_koltsegvetes', 'diocese_annual_reports',
                    'dioceses', 'bealitas', 'lelkeszi_jelentes',
                    'chitanta_tombok', 'annual_reports')
ORDER BY tablename, policyname;

-- E5) (Adat-függő gyorspróba) Megyei feloldási kérelmek a diagnosztika 9.
--     szakasza szerint — post-P0 esperesként bejelentkezve az appban a
--     Kérelmek tabnak mostantól PONTOSAN a saját megye sorait kell mutatnia
--     (se üres, se országos lista).
