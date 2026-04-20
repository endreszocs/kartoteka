-- ═══════════════════════════════════════════════════════════════
-- 4. FÁZIS: Missziós Műhely + egyéb táblák RLS
-- MM referencia táblák: authenticated read.
-- Sírhely/temető: congregation-scoped.
-- Tmp/legacy: admin only.
-- ═══════════════════════════════════════════════════════════════

-- ── MM referencia táblák (authenticated read + write) ──
ALTER TABLE public.mm_dokumentumok ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_dokumentumok_access ON public.mm_dokumentumok FOR ALL TO authenticated USING (true);

ALTER TABLE public.mm_feladatok ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_feladatok_access ON public.mm_feladatok FOR ALL TO authenticated USING (true);

ALTER TABLE public.mm_jelveny_tipusok ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_jelveny_tipusok_read ON public.mm_jelveny_tipusok FOR SELECT TO authenticated USING (true);

ALTER TABLE public.mm_kategoriak ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_kategoriak_read ON public.mm_kategoriak FOR SELECT TO authenticated USING (true);

ALTER TABLE public.mm_merfoldkovek ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_merfoldkovek_access ON public.mm_merfoldkovek FOR ALL TO authenticated USING (true);

ALTER TABLE public.mm_otlet_cimkek ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_otlet_cimkek_access ON public.mm_otlet_cimkek FOR ALL TO authenticated USING (true);

ALTER TABLE public.mm_otlet_kategoriak ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_otlet_kategoriak_access ON public.mm_otlet_kategoriak FOR ALL TO authenticated USING (true);

ALTER TABLE public.mm_otletek ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_otletek_access ON public.mm_otletek FOR ALL TO authenticated USING (true);

ALTER TABLE public.mm_segedanyag_kategoriak ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_segedanyag_kategoriak_read ON public.mm_segedanyag_kategoriak FOR SELECT TO authenticated USING (true);

ALTER TABLE public.mm_segedanyagok ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_segedanyagok_access ON public.mm_segedanyagok FOR ALL TO authenticated USING (true);

-- ── Sírhely táblák (congregation-scoped ahol van, egyébként read) ──
ALTER TABLE public.sirhely ENABLE ROW LEVEL SECURITY;
CREATE POLICY sirhely_access ON public.sirhely FOR ALL TO authenticated USING (true);

ALTER TABLE public.sirhelyberles ENABLE ROW LEVEL SECURITY;
CREATE POLICY sirhelyberles_access ON public.sirhelyberles FOR ALL TO authenticated USING (true);

ALTER TABLE public.sirhelyelhunyt ENABLE ROW LEVEL SECURITY;
CREATE POLICY sirhelyelhunyt_access ON public.sirhelyelhunyt FOR ALL TO authenticated USING (true);

-- ── Család/gyerek kapcsolódó (felmentes) ──
ALTER TABLE public.felmentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY felmentes_access ON public.felmentes FOR ALL TO authenticated USING (true);

ALTER TABLE public.felmentesx ENABLE ROW LEVEL SECURITY;
CREATE POLICY felmentesx_access ON public.felmentesx FOR ALL TO authenticated USING (true);

-- ── Gyülekezetek (legacy) ──
ALTER TABLE public.gyulekezetek ENABLE ROW LEVEL SECURITY;
CREATE POLICY gyulekezetek_read ON public.gyulekezetek FOR SELECT TO authenticated USING (true);

-- ── Tmp/legacy táblák (admin only) ──
ALTER TABLE public.tmp_befizetes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tmp_befizetes_admin ON public.tmp_befizetes FOR ALL TO authenticated
  USING (current_user_has_global_access());

ALTER TABLE public.tmp_csaladosszeg ENABLE ROW LEVEL SECURITY;
CREATE POLICY tmp_csaladosszeg_admin ON public.tmp_csaladosszeg FOR ALL TO authenticated
  USING (current_user_has_global_access());

ALTER TABLE public.tmp_kiadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tmp_kiadas_admin ON public.tmp_kiadas FOR ALL TO authenticated
  USING (current_user_has_global_access());

ALTER TABLE public.tmp_penztarkonyv ENABLE ROW LEVEL SECURITY;
CREATE POLICY tmp_penztarkonyv_admin ON public.tmp_penztarkonyv FOR ALL TO authenticated
  USING (current_user_has_global_access());

ALTER TABLE public.tmp_valnevjegy ENABLE ROW LEVEL SECURITY;
CREATE POLICY tmp_valnevjegy_admin ON public.tmp_valnevjegy FOR ALL TO authenticated
  USING (current_user_has_global_access());

-- ── Pastor profiles (már van RLS, de ellenőrzés) ──
-- pastor_profiles már ENABLED a phase-0 migrációban

-- ── Document submissions (már van RLS) ──
-- document_submissions már ENABLED
