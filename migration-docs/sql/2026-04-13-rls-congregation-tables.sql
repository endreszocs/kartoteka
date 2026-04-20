-- ═══════════════════════════════════════════════════════════════
-- 1. FÁZIS: Congregation-scoped táblák RLS bekapcsolása
-- Minden tábla ahol van congregation_id oszlop.
-- A felhasználó saját gyülekezetének adatait látja,
-- admin/esperes minden gyülekezetet lát.
-- ═══════════════════════════════════════════════════════════════

-- Megjegyzés: A helper függvények (current_user_congregation_id,
-- current_user_has_global_access) a phase-0 migrációban már definiálva vannak.
-- Ha még nem futott, először azt kell futtatni!

-- ── attert ──
ALTER TABLE public.attert ENABLE ROW LEVEL SECURITY;
CREATE POLICY attert_access ON public.attert FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── bankszamlak ──
ALTER TABLE public.bankszamlak ENABLE ROW LEVEL SECURITY;
CREATE POLICY bankszamlak_access ON public.bankszamlak FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── bealitas ──
ALTER TABLE public.bealitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY bealitas_access ON public.bealitas FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── bekoltozott ──
ALTER TABLE public.bekoltozott ENABLE ROW LEVEL SECURITY;
CREATE POLICY bekoltozott_access ON public.bekoltozott FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── belsomozgas ──
ALTER TABLE public.belsomozgas ENABLE ROW LEVEL SECURITY;
CREATE POLICY belsomozgas_access ON public.belsomozgas FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── berleti_szerzodes ──
ALTER TABLE public.berleti_szerzodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY berleti_szerzodes_access ON public.berleti_szerzodes FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── csaladlatogatas ──
ALTER TABLE public.csaladlatogatas ENABLE ROW LEVEL SECURITY;
CREATE POLICY csaladlatogatas_access ON public.csaladlatogatas FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── elkoltozott ──
ALTER TABLE public.elkoltozott ENABLE ROW LEVEL SECURITY;
CREATE POLICY elkoltozott_access ON public.elkoltozott FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── gyulekezeti_programok ──
ALTER TABLE public.gyulekezeti_programok ENABLE ROW LEVEL SECURITY;
CREATE POLICY gyulekezeti_programok_access ON public.gyulekezeti_programok FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── hazassag ──
ALTER TABLE public.hazassag ENABLE ROW LEVEL SECURITY;
CREATE POLICY hazassag_access ON public.hazassag FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── iktato ──
ALTER TABLE public.iktato ENABLE ROW LEVEL SECURITY;
CREATE POLICY iktato_access ON public.iktato FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── iktatokonyv ──
ALTER TABLE public.iktatokonyv ENABLE ROW LEVEL SECURITY;
CREATE POLICY iktatokonyv_access ON public.iktatokonyv FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── jarulek_kedvezmeny ──
ALTER TABLE public.jarulek_kedvezmeny ENABLE ROW LEVEL SECURITY;
CREATE POLICY jarulek_kedvezmeny_access ON public.jarulek_kedvezmeny FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── keresztseg ──
ALTER TABLE public.keresztseg ENABLE ROW LEVEL SECURITY;
CREATE POLICY keresztseg_access ON public.keresztseg FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── kiadas ──
ALTER TABLE public.kiadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiadas_access ON public.kiadas FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── kitert ──
ALTER TABLE public.kitert ENABLE ROW LEVEL SECURITY;
CREATE POLICY kitert_access ON public.kitert FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── koltsegvetes ──
ALTER TABLE public.koltsegvetes ENABLE ROW LEVEL SECURITY;
CREATE POLICY koltsegvetes_access ON public.koltsegvetes FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── konfirmalas ──
ALTER TABLE public.konfirmalas ENABLE ROW LEVEL SECURITY;
CREATE POLICY konfirmalas_access ON public.konfirmalas FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── leltar_tetelek ──
ALTER TABLE public.leltar_tetelek ENABLE ROW LEVEL SECURITY;
CREATE POLICY leltar_tetelek_access ON public.leltar_tetelek FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── munkanaplo ──
ALTER TABLE public.munkanaplo ENABLE ROW LEVEL SECURITY;
CREATE POLICY munkanaplo_access ON public.munkanaplo FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── sirhelytemeto ──
ALTER TABLE public.sirhelytemeto ENABLE ROW LEVEL SECURITY;
CREATE POLICY sirhelytemeto_access ON public.sirhelytemeto FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── temetes ──
ALTER TABLE public.temetes ENABLE ROW LEVEL SECURITY;
CREATE POLICY temetes_access ON public.temetes FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── transactions ──
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_access ON public.transactions FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── annual_reports ──
ALTER TABLE public.annual_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY annual_reports_access ON public.annual_reports FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── congregation_annual_fees ──
ALTER TABLE public.congregation_annual_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY congregation_annual_fees_access ON public.congregation_annual_fees FOR ALL TO authenticated
  USING (congregation_id = current_user_congregation_id() OR current_user_has_global_access());

-- ── monetar (nincs congregation_id — referencia tábla) ──
ALTER TABLE public.monetar ENABLE ROW LEVEL SECURITY;
CREATE POLICY monetar_access ON public.monetar FOR ALL TO authenticated USING (true);
