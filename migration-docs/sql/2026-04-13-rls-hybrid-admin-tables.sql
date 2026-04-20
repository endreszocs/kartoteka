-- ═══════════════════════════════════════════════════════════════
-- 3. FÁZIS: Hybrid + admin táblák RLS
-- Táblák amelyeknek speciális hozzáférési logikája van.
-- ═══════════════════════════════════════════════════════════════

-- ── admin_access_requests (user is involved OR admin) ──
ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY aar_user_access ON public.admin_access_requests FOR ALL TO authenticated
  USING (
    admin_user_id = auth.uid()
    OR pastor_user_id = auth.uid()
    OR current_user_has_global_access()
  );

-- ── ertesitesek (saját értesítések) ──
ALTER TABLE public.ertesitesek ENABLE ROW LEVEL SECURITY;
CREATE POLICY ertesitesek_user ON public.ertesitesek FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR current_user_has_global_access()
  );

-- ── support_messages (saját üzenetek + admin) ──
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_messages_user ON public.support_messages FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR current_user_has_global_access()
  );

-- ── profiles (mindenki olvashatja, sajátot írhatja, admin mindent) ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_write_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY profiles_admin_write ON public.profiles FOR ALL TO authenticated
  USING (current_user_has_global_access());

-- ── system_settings (admin only) ──
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_settings_admin ON public.system_settings FOR ALL TO authenticated
  USING (current_user_has_global_access());
CREATE POLICY system_settings_read ON public.system_settings FOR SELECT TO authenticated
  USING (true);

-- ── cfg_report (admin only) ──
ALTER TABLE public.cfg_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfg_report_admin ON public.cfg_report FOR ALL TO authenticated
  USING (current_user_has_global_access());
CREATE POLICY cfg_report_read ON public.cfg_report FOR SELECT TO authenticated USING (true);

-- ── cfgparam (admin only) ──
ALTER TABLE public.cfgparam ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfgparam_admin ON public.cfgparam FOR ALL TO authenticated
  USING (current_user_has_global_access());
CREATE POLICY cfgparam_read ON public.cfgparam FOR SELECT TO authenticated USING (true);

-- ── param (admin only) ──
ALTER TABLE public.param ENABLE ROW LEVEL SECURITY;
CREATE POLICY param_admin ON public.param FOR ALL TO authenticated
  USING (current_user_has_global_access());
CREATE POLICY param_read ON public.param FOR SELECT TO authenticated USING (true);

-- ── logger (admin only) ──
ALTER TABLE public.logger ENABLE ROW LEVEL SECURITY;
CREATE POLICY logger_admin ON public.logger FOR ALL TO authenticated
  USING (current_user_has_global_access());

-- ── access (legacy — admin only) ──
ALTER TABLE public.access ENABLE ROW LEVEL SECURITY;
CREATE POLICY access_admin ON public.access FOR ALL TO authenticated
  USING (current_user_has_global_access());

-- ── users (legacy — admin only) ──
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_admin ON public.users FOR ALL TO authenticated
  USING (current_user_has_global_access());

-- ── penztar ──
ALTER TABLE public.penztar ENABLE ROW LEVEL SECURITY;
CREATE POLICY penztar_read ON public.penztar FOR SELECT TO authenticated USING (true);

-- ── befizetesbealitas ──
ALTER TABLE public.befizetesbealitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY befizetesbealitas_read ON public.befizetesbealitas FOR SELECT TO authenticated USING (true);
