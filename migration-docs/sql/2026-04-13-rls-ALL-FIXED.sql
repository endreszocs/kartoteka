-- ═══════════════════════════════════════════════════════════════
-- TELJES RLS MIGRÁCIÓ — JAVÍTOTT VERZIÓ
-- Egyetlen fájl ami minden táblát lefed.
-- Kihagyja a már RLS-sel rendelkező táblákat.
-- A "duplicate_object" hibákat elnyeli ha már létezik a policy.
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1. CONGREGATION-SCOPED TÁBLÁK ═══

DO $$ BEGIN ALTER TABLE public.attert ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY attert_access ON public.attert FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.bankszamlak ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY bankszamlak_access ON public.bankszamlak FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.bealitas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY bealitas_access ON public.bealitas FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.bekoltozott ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY bekoltozott_access ON public.bekoltozott FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.belsomozgas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY belsomozgas_access ON public.belsomozgas FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.berleti_szerzodes ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY berleti_szerzodes_access ON public.berleti_szerzodes FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.csaladlatogatas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY csaladlatogatas_access ON public.csaladlatogatas FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.elkoltozott ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY elkoltozott_access ON public.elkoltozott FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.gyulekezeti_programok ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY gyulekezeti_programok_access ON public.gyulekezeti_programok FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.hazassag ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY hazassag_access ON public.hazassag FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.iktato ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY iktato_access ON public.iktato FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.iktatokonyv ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY iktatokonyv_access ON public.iktatokonyv FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.jarulek_kedvezmeny ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY jarulek_kedvezmeny_access ON public.jarulek_kedvezmeny FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.keresztseg ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY keresztseg_access ON public.keresztseg FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.kiadas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY kiadas_access ON public.kiadas FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.kitert ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY kitert_access ON public.kitert FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.koltsegvetes ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY koltsegvetes_access ON public.koltsegvetes FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.konfirmalas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY konfirmalas_access ON public.konfirmalas FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.leltar_tetelek ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY leltar_tetelek_access ON public.leltar_tetelek FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.munkanaplo ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY munkanaplo_access ON public.munkanaplo FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.sirhelytemeto ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY sirhelytemeto_access ON public.sirhelytemeto FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.temetes ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY temetes_access ON public.temetes FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY transactions_access ON public.transactions FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.annual_reports ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY annual_reports_access ON public.annual_reports FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.congregation_annual_fees ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY congregation_annual_fees_access ON public.congregation_annual_fees FOR ALL TO authenticated USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 2. REFERENCIA TÁBLÁK (authenticated read) ═══

DO $$ BEGIN ALTER TABLE public.adrcountry ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY adrcountry_read ON public.adrcountry FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.adrcounty ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY adrcounty_read ON public.adrcounty FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.adrlocality ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY adrlocality_read ON public.adrlocality FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.adrstreet ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY adrstreet_read ON public.adrstreet FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.dioceses ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY dioceses_read ON public.dioceses FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY districts_read ON public.districts FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.congregations ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY congregations_read ON public.congregations FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.szamadasicel ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY szamadasicel_read ON public.szamadasicel FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.szamadasidatum ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY szamadasidatum_read ON public.szamadasidatum FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.befizetescel ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY befizetescel_read ON public.befizetescel FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.befizetocelcfg ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY befizetocelcfg_read ON public.befizetocelcfg FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.kiadascel ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY kiadascel_read ON public.kiadascel FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.kiadasikiseroiv ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY kiadasikiseroiv_read ON public.kiadasikiseroiv FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.csoport ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY csoport_read ON public.csoport FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.csoporttagok ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY csoporttagok_read ON public.csoporttagok FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.korzetfilter ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY korzetfilter_read ON public.korzetfilter FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.nevnap ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY nevnap_read ON public.nevnap FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY nevnap_anon ON public.nevnap FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.nom_cimlet ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY nom_cimlet_read ON public.nom_cimlet FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.event ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY event_read ON public.event FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.presbiter ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY presbiter_all ON public.presbiter FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.monetar ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY monetar_all ON public.monetar FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.befizetesbealitas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY befizetesbealitas_read ON public.befizetesbealitas FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.penztar ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY penztar_all ON public.penztar FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 3. HYBRID + ADMIN TÁBLÁK ═══

DO $$ BEGIN ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY aar_access ON public.admin_access_requests FOR ALL TO authenticated USING (admin_user_id = auth.uid() OR pastor_user_id = auth.uid() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.ertesitesek ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ertesitesek_access ON public.ertesitesek FOR ALL TO authenticated USING (user_id = auth.uid() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY support_messages_access ON public.support_messages FOR ALL TO authenticated USING (user_id = auth.uid() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY profiles_read_all ON public.profiles FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY profiles_write ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY system_settings_read ON public.system_settings FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.cfg_report ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY cfg_report_read ON public.cfg_report FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.cfgparam ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY cfgparam_read ON public.cfgparam FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.param ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY param_read ON public.param FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.logger ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY logger_admin ON public.logger FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.access ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY access_admin ON public.access FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY users_admin ON public.users FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ 4. MM + EGYÉB TÁBLÁK ═══

DO $$ BEGIN ALTER TABLE public.mm_dokumentumok ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_dokumentumok_all ON public.mm_dokumentumok FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_feladatok ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_feladatok_all ON public.mm_feladatok FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_jelveny_tipusok ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_jelveny_tipusok_read ON public.mm_jelveny_tipusok FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_kategoriak ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_kategoriak_read ON public.mm_kategoriak FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_merfoldkovek ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_merfoldkovek_all ON public.mm_merfoldkovek FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_otlet_cimkek ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_otlet_cimkek_all ON public.mm_otlet_cimkek FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_otlet_kategoriak ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_otlet_kategoriak_all ON public.mm_otlet_kategoriak FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_otletek ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_otletek_all ON public.mm_otletek FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_segedanyag_kategoriak ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_segedanyag_kategoriak_read ON public.mm_segedanyag_kategoriak FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.mm_segedanyagok ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mm_segedanyagok_all ON public.mm_segedanyagok FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.sirhely ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY sirhely_all ON public.sirhely FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.sirhelyberles ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY sirhelyberles_all ON public.sirhelyberles FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.sirhelyelhunyt ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY sirhelyelhunyt_all ON public.sirhelyelhunyt FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.felmentes ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY felmentes_all ON public.felmentes FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.felmentesx ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY felmentesx_all ON public.felmentesx FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.gyulekezetek ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY gyulekezetek_read ON public.gyulekezetek FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tmp/legacy táblák — admin only
DO $$ BEGIN ALTER TABLE public.tmp_befizetes ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tmp_befizetes_admin ON public.tmp_befizetes FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tmp_csaladosszeg ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tmp_csaladosszeg_admin ON public.tmp_csaladosszeg FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tmp_kiadas ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tmp_kiadas_admin ON public.tmp_kiadas FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tmp_penztarkonyv ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tmp_penztarkonyv_admin ON public.tmp_penztarkonyv FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.tmp_valnevjegy ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tmp_valnevjegy_admin ON public.tmp_valnevjegy FOR ALL TO authenticated USING (current_user_has_global_access()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
