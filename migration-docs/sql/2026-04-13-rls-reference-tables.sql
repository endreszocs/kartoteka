-- ═══════════════════════════════════════════════════════════════
-- 2. FÁZIS: Referencia/lookup táblák RLS
-- Mindenki olvashatja (authenticated), senki nem írhatja közvetlenül.
-- ═══════════════════════════════════════════════════════════════

-- ── Cím referencia ──
ALTER TABLE public.adrcountry ENABLE ROW LEVEL SECURITY;
CREATE POLICY adrcountry_read ON public.adrcountry FOR SELECT TO authenticated USING (true);

ALTER TABLE public.adrcounty ENABLE ROW LEVEL SECURITY;
CREATE POLICY adrcounty_read ON public.adrcounty FOR SELECT TO authenticated USING (true);

ALTER TABLE public.adrlocality ENABLE ROW LEVEL SECURITY;
CREATE POLICY adrlocality_read ON public.adrlocality FOR SELECT TO authenticated USING (true);

ALTER TABLE public.adrstreet ENABLE ROW LEVEL SECURITY;
CREATE POLICY adrstreet_read ON public.adrstreet FOR SELECT TO authenticated USING (true);

-- ── Szervezeti referencia ──
ALTER TABLE public.dioceses ENABLE ROW LEVEL SECURITY;
CREATE POLICY dioceses_read ON public.dioceses FOR SELECT TO authenticated USING (true);

ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
CREATE POLICY districts_read ON public.districts FOR SELECT TO authenticated USING (true);

ALTER TABLE public.congregations ENABLE ROW LEVEL SECURITY;
CREATE POLICY congregations_read ON public.congregations FOR SELECT TO authenticated USING (true);

-- ── Pénzügyi referencia ──
ALTER TABLE public.szamadasicel ENABLE ROW LEVEL SECURITY;
CREATE POLICY szamadasicel_read ON public.szamadasicel FOR SELECT TO authenticated USING (true);

ALTER TABLE public.szamadasidatum ENABLE ROW LEVEL SECURITY;
CREATE POLICY szamadasidatum_read ON public.szamadasidatum FOR SELECT TO authenticated USING (true);

ALTER TABLE public.befizetescel ENABLE ROW LEVEL SECURITY;
CREATE POLICY befizetescel_read ON public.befizetescel FOR SELECT TO authenticated USING (true);

ALTER TABLE public.befizetocelcfg ENABLE ROW LEVEL SECURITY;
CREATE POLICY befizetocelcfg_read ON public.befizetocelcfg FOR SELECT TO authenticated USING (true);

ALTER TABLE public.kiadascel ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiadascel_read ON public.kiadascel FOR SELECT TO authenticated USING (true);

ALTER TABLE public.kiadasikiseroiv ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiadasikiseroiv_read ON public.kiadasikiseroiv FOR SELECT TO authenticated USING (true);

-- ── Csoport/körzet ──
ALTER TABLE public.csoport ENABLE ROW LEVEL SECURITY;
CREATE POLICY csoport_read ON public.csoport FOR SELECT TO authenticated USING (true);

ALTER TABLE public.csoporttagok ENABLE ROW LEVEL SECURITY;
CREATE POLICY csoporttagok_read ON public.csoporttagok FOR SELECT TO authenticated USING (true);

ALTER TABLE public.korzetfilter ENABLE ROW LEVEL SECURITY;
CREATE POLICY korzetfilter_read ON public.korzetfilter FOR SELECT TO authenticated USING (true);

-- ── Egyéb referencia ──
ALTER TABLE public.nevnap ENABLE ROW LEVEL SECURITY;
CREATE POLICY nevnap_read ON public.nevnap FOR SELECT TO authenticated USING (true);
CREATE POLICY nevnap_read_anon ON public.nevnap FOR SELECT TO anon USING (true);

ALTER TABLE public.nom_cimlet ENABLE ROW LEVEL SECURITY;
CREATE POLICY nom_cimlet_read ON public.nom_cimlet FOR SELECT TO authenticated USING (true);

ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_read ON public.event FOR SELECT TO authenticated USING (true);

-- ── Presbiter (nincs congregation_id, FK-n keresztül kapcsolódik) ──
ALTER TABLE public.presbiter ENABLE ROW LEVEL SECURITY;
CREATE POLICY presbiter_read ON public.presbiter FOR ALL TO authenticated USING (true);
